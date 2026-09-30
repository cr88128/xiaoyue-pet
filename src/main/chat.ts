import { app } from 'electron';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { streamChat, type ChatMessage, type ToolDefinition, type StreamChunk } from './llm-client';
import { atomicWriteJson, readValidatedJson } from './persistence';
import { loadAIConfig, decryptApiKey, isAIConfigured, type AIConfig } from './ai-config';
import { getSkinPersona } from './skin-personas';
import { getActiveToolDefinitions, executeTool, type ToolContext } from './tools/registry';

export interface ChatSession {
  id: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatHistoryFile {
  sessions: ChatSession[];
  activeSessionId: string | null;
}

const MAX_HISTORY_MESSAGES = 80;

function historyFile(): string {
  return path.join(app.getPath('userData'), 'chat-history.json');
}

function parseHistory(value: unknown): ChatHistoryFile | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  if (!Array.isArray(obj.sessions)) return null;
  return {
    sessions: obj.sessions
      .filter((item): item is ChatSession => Boolean(item) && typeof (item as ChatSession).id === 'string')
      .map((item) => ({
        id: item.id,
        messages: Array.isArray(item.messages) ? item.messages : [],
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    activeSessionId: typeof obj.activeSessionId === 'string' ? obj.activeSessionId : null,
  };
}

export class ChatManager {
  private history: ChatHistoryFile = { sessions: [], activeSessionId: null };
  private abortController: AbortController | null = null;
  private config: AIConfig | null = null;
  private currentSkin: string = 'default';

  setSkin(skin: string): void {
    this.currentSkin = skin || 'default';
    // 切换皮肤后，下次新会话会用新人设；已存在的系统消息不改动
  }

  getPersona() {
    return getSkinPersona(this.currentSkin);
  }

  async init(): Promise<void> {
    this.config = await loadAIConfig();
    const loaded = await readValidatedJson(historyFile(), null, parseHistory);
    if (loaded) this.history = loaded;
  }

  async refreshConfig(): Promise<AIConfig> {
    this.config = await loadAIConfig();
    return this.config;
  }

  getConfig(): AIConfig | null {
    return this.config;
  }

  getHistory(): ChatHistoryFile {
    return this.history;
  }

  getActiveSession(): ChatSession | null {
    if (!this.history.activeSessionId) return null;
    return this.history.sessions.find((s) => s.id === this.history.activeSessionId) ?? null;
  }

  newSession(): ChatSession {
    const session: ChatSession = {
      id: randomUUID(),
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.history.sessions.unshift(session);
    this.history.activeSessionId = session.id;
    if (this.history.sessions.length > 20) this.history.sessions.length = 20;
    void this.persist();
    return session;
  }

  switchSession(id: string): boolean {
    if (!this.history.sessions.some((s) => s.id === id)) return false;
    this.history.activeSessionId = id;
    void this.persist();
    return true;
  }

  deleteSession(id: string): boolean {
    const before = this.history.sessions.length;
    this.history.sessions = this.history.sessions.filter((s) => s.id !== id);
    if (this.history.activeSessionId === id) {
      this.history.activeSessionId = this.history.sessions[0]?.id ?? null;
    }
    if (this.history.sessions.length !== before) {
      void this.persist();
      return true;
    }
    return false;
  }

  clearActiveSession(): void {
    const active = this.getActiveSession();
    if (!active) return;
    active.messages = [];
    active.updatedAt = new Date().toISOString();
    void this.persist();
  }

  cancel(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  private async persist(): Promise<void> {
    await atomicWriteJson(historyFile(), this.history);
  }

  private pushMessage(message: ChatMessage): void {
    const session = this.getActiveSession();
    if (!session) return;
    session.messages.push(message);
    session.updatedAt = new Date().toISOString();
    if (session.messages.length > MAX_HISTORY_MESSAGES) {
      // 保留 system + 最近若干条
      const system = session.messages.find((m) => m.role === 'system');
      const rest = session.messages.filter((m) => m.role !== 'system').slice(-MAX_HISTORY_MESSAGES + 1);
      session.messages = system ? [system, ...rest] : rest;
    }
  }

  async send(
    userContent: string,
    handlers: {
      onChunk: (chunk: StreamChunk) => void;
      onToolResult: (name: string, args: Record<string, unknown>, result: { content: string; uiHint?: { kind: string; payload?: Record<string, unknown> } }) => void;
      onError: (message: string) => void;
      onDone: (sessionId: string) => void;
    },
    ctx: ToolContext,
  ): Promise<void> {
    if (!this.config) this.config = await loadAIConfig();
    if (!isAIConfigured(this.config)) {
      handlers.onError('AI 未配置：请在 dashboard 里填入 API key');
      return;
    }
    let session = this.getActiveSession();
    if (!session) {
      session = this.newSession();
      // 注入 system prompt
      this.pushMessage({ role: 'system', content: getSkinPersona(this.currentSkin).systemPrompt });
      session = this.getActiveSession()!;
    } else if (!session.messages.some((m) => m.role === 'system')) {
      this.pushMessage({ role: 'system', content: getSkinPersona(this.currentSkin).systemPrompt });
    }

    this.pushMessage({ role: 'user', content: userContent });
    await this.persist();

    this.abortController = new AbortController();
    const apiKey = decryptApiKey(this.config);
    const tools = getActiveToolDefinitions(this.config);

    await this.runTurn(handlers, ctx, tools, apiKey);
    handlers.onDone(session.id);
  }

  private async runTurn(
    handlers: { onChunk: (c: StreamChunk) => void; onToolResult: (name: string, args: Record<string, unknown>, result: { content: string; uiHint?: { kind: string; payload?: Record<string, unknown> } }) => void; onError: (m: string) => void },
    ctx: ToolContext,
    tools: ToolDefinition[],
    apiKey: string,
    depth = 0,
  ): Promise<void> {
    if (!this.config || depth > 5) return;
    const session = this.getActiveSession();
    if (!session) return;

    let content = '';
    const toolCallAcc = new Map<number, { id: string; name: string; args: string }>();
    let finishReason = '';

    try {
      const stream = streamChat({
        baseUrl: this.config.baseUrl,
        apiKey,
        model: this.config.model,
        messages: session.messages,
        tools: tools.length > 0 ? tools : undefined,
        toolChoice: tools.length > 0 ? 'auto' : undefined,
        signal: this.abortController?.signal,
        // 不开 reasoning_split：M3 会把思考内容嵌进 content 的 <think>...</think>，
        // renderer 端 stripThinking() 会自动剥掉
      });
      for await (const chunk of stream) {
        handlers.onChunk(chunk);
        if (chunk.kind === 'content') content += chunk.delta;
        // 不再把 reasoning 推到 renderer（UI 不显示思考过程）
        else if (chunk.kind === 'reasoning') { /* 静默丢弃 */ }
        else if (chunk.kind === 'tool_calls_delta') {
          let acc = toolCallAcc.get(chunk.index);
          if (!acc) {
            acc = { id: '', name: '', args: '' };
            toolCallAcc.set(chunk.index, acc);
          }
          if (chunk.id) acc.id = chunk.id;
          if (chunk.name) acc.name += chunk.name;
          if (chunk.args) acc.args += chunk.args;
        } else if (chunk.kind === 'done') {
          finishReason = chunk.finishReason;
        } else if (chunk.kind === 'error') {
          handlers.onError(chunk.message);
          return;
        }
      }
    } catch (error) {
      handlers.onError(`请求失败：${(error as Error).message}`);
      return;
    }

    // 把本轮 assistant 消息加入历史
    if (content || toolCallAcc.size > 0) {
      // 去掉 content 里残留的 <think>...</think>（不开 reasoning_split 时的 fallback）
      const cleanContent = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: cleanContent || null,
      };
      if (toolCallAcc.size > 0) {
        assistantMessage.tool_calls = Array.from(toolCallAcc.values()).map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.args },
        }));
      }
      this.pushMessage(assistantMessage);
      await this.persist();
    }

    // 如果有工具调用，依次处理
    if (finishReason === 'tool_calls' && toolCallAcc.size > 0) {
      for (const tc of toolCallAcc.values()) {
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(tc.args) as Record<string, unknown>;
        } catch {
          parsedArgs = { raw: tc.args };
        }
        const result = await executeTool(tc.name, parsedArgs, ctx);
        const toolResult = result ?? { content: `工具 ${tc.name} 不存在` };
        handlers.onToolResult(tc.name, parsedArgs, toolResult);
        this.pushMessage({
          role: 'tool',
          tool_call_id: tc.id,
          name: tc.name,
          content: toolResult.content,
        });
        await this.persist();
      }
      // 工具结果已加入历史，再次发起一轮让 LLM 综合答复
      await this.runTurn(handlers, ctx, tools, apiKey, depth + 1);
    }
  }
}