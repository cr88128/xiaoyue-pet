import { Buffer } from 'node:buffer';

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: ChatRole;
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  name?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export type StreamChunk =
  | { kind: 'content'; delta: string }
  | { kind: 'reasoning'; delta: string }
  | { kind: 'tool_call'; toolCall: ToolCall }
  | { kind: 'tool_calls_delta'; index: number; id?: string; name?: string; args?: string }
  | { kind: 'done'; finishReason: string; usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } }
  | { kind: 'error'; message: string; status?: number };

export interface ChatRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  temperature?: number;
  signal?: AbortSignal;
  reasoningSplit?: boolean;
}

interface OpenAIStreamChoice {
  index: number;
  delta: {
    role?: string;
    content?: string | null;
    reasoning_content?: string;
    tool_calls?: Array<{
      index: number;
      id?: string;
      type?: 'function';
      function?: { name?: string; arguments?: string };
    }>;
  };
  finish_reason?: string | null;
}

interface OpenAIStreamChunk {
  id: string;
  object: string;
  created: number;
  choices: OpenAIStreamChoice[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export interface LLMError extends Error {
  status?: number;
}

export async function* streamChat(request: ChatRequest): AsyncIterable<StreamChunk> {
  if (!request.apiKey) {
    yield { kind: 'error', message: 'API key 未配置，请在 dashboard 里填入' };
    return;
  }
  const url = `${request.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const body: Record<string, unknown> = {
    model: request.model,
    messages: request.messages,
    stream: true,
  };
  if (request.tools?.length) body.tools = request.tools;
  if (request.toolChoice) body.tool_choice = request.toolChoice;
  if (request.temperature !== undefined) body.temperature = request.temperature;
  if (request.reasoningSplit) body.reasoning_split = true;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${request.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: request.signal,
    });
  } catch (error) {
    const err: LLMError = new Error(`LLM 请求失败：${(error as Error).message}`);
    yield { kind: 'error', message: err.message };
    return;
  }

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '');
    yield { kind: 'error', message: `LLM 响应错误 (${response.status}): ${text.slice(0, 500)}`, status: response.status };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  const toolCallAccumulators = new Map<number, { id: string; name: string; args: string }>();

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') {
          yield { kind: 'done', finishReason: 'stop' };
          return;
        }
        let parsed: OpenAIStreamChunk;
        try {
          parsed = JSON.parse(payload) as OpenAIStreamChunk;
        } catch {
          continue;
        }
        for (const choice of parsed.choices) {
          if (choice.delta.reasoning_content) {
            yield { kind: 'reasoning', delta: choice.delta.reasoning_content };
          }
          if (choice.delta.content) {
            yield { kind: 'content', delta: choice.delta.content };
          }
          if (choice.delta.tool_calls) {
            for (const tc of choice.delta.tool_calls) {
              let acc = toolCallAccumulators.get(tc.index);
              if (!acc) {
                acc = { id: '', name: '', args: '' };
                toolCallAccumulators.set(tc.index, acc);
              }
              if (tc.id) acc.id = tc.id;
              if (tc.function?.name) acc.name += tc.function.name;
              if (tc.function?.arguments) acc.args += tc.function.arguments;
              yield { kind: 'tool_calls_delta', index: tc.index, id: tc.id, name: tc.function?.name, args: tc.function?.arguments };
            }
          }
          if (choice.finish_reason) {
            yield {
              kind: 'done',
              finishReason: choice.finish_reason,
              usage: parsed.usage
                ? { promptTokens: parsed.usage.prompt_tokens, completionTokens: parsed.usage.completion_tokens, totalTokens: parsed.usage.total_tokens }
                : undefined,
            };
          }
        }
      }
    }
  } catch (error) {
    yield { kind: 'error', message: `LLM 流中断：${(error as Error).message}` };
    return;
  } finally {
    try { reader.releaseLock(); } catch { /* noop */ }
  }

  // 流结束后把累积的 tool_calls 推一次完整版
  for (const [, acc] of toolCallAccumulators) {
    if (acc.id && acc.name) {
      yield {
        kind: 'tool_call',
        toolCall: {
          id: acc.id,
          type: 'function',
          function: { name: acc.name, arguments: acc.args },
        },
      };
    }
  }
}

export function createBearerHeader(apiKey: string): { Authorization: string } {
  return { Authorization: `Bearer ${apiKey}` };
}

// Utility: safe base64 helpers for the api key payload (used by ai-config)
export function encodeBase64(value: string): string {
  return Buffer.from(value, 'utf-8').toString('base64');
}

export function decodeBase64(value: string): string {
  return Buffer.from(value, 'base64').toString('utf-8');
}