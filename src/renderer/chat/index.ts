import type { StreamChunk } from '../../shared/contracts';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'error' | 'system';
  content: string;
  reasoning?: string;
  toolHint?: { kind: string; payload?: Record<string, unknown> };
}

const messagesEl = document.getElementById('messages') as HTMLDivElement;
const emptyState = document.getElementById('empty-state') as HTMLDivElement;
const inputEl = document.getElementById('chat-input') as HTMLTextAreaElement;
const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
const closeBtn = document.getElementById('close-btn') as HTMLButtonElement;
const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
const modelLine = document.getElementById('model-line') as HTMLParagraphElement;
const toolRow = document.getElementById('tool-row') as HTMLDivElement;

const messages: ChatMessage[] = [];
let currentAssistantId: string | null = null;
let isStreaming = false;

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function renderMessages(): void {
  if (messages.length === 0) {
    messagesEl.innerHTML = '';
    messagesEl.appendChild(emptyState);
    emptyState.style.display = '';
    return;
  }
  emptyState.style.display = 'none';
  messagesEl.innerHTML = '';
  for (const msg of messages) {
    const div = document.createElement('div');
    div.className = `msg ${msg.role}`;
    if (msg.role === 'tool') {
      div.innerHTML = `<div class="msg-label">🔧 ${msg.toolHint?.kind ?? 'tool'}</div>${escape(msg.content)}`;
    } else if (msg.role === 'error') {
      div.textContent = msg.content;
    } else {
      // 隐藏思考过程：去掉 content 里残留的 <think>...</think> 标签
      div.textContent = stripThinking(msg.content);
    }
    messagesEl.appendChild(div);
  }
  if (isStreaming) {
    const typing = document.createElement('div');
    typing.className = 'msg assistant';
    typing.id = 'streaming-bubble';
    typing.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
    messagesEl.appendChild(typing);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function stripThinking(text: string): string {
  // M3 不带 reasoning_split 时会把思考内容嵌进 content，用 <think>...</think> 包裹
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&' + 'lt;').replace(/>/g, '&gt;');
}

function appendUser(content: string): void {
  messages.push({ id: genId(), role: 'user', content });
  renderMessages();
}

function startAssistant(): string {
  const id = genId();
  messages.push({ id, role: 'assistant', content: '', reasoning: '' });
  currentAssistantId = id;
  isStreaming = true;
  renderMessages();
  return id;
}

function updateAssistant(id: string, content: string, reasoning: string): void {
  const msg = messages.find((m) => m.id === id);
  if (!msg) return;
  msg.content = content;
  // 忽略 reasoning：UI 不渲染思考过程
  renderMessages();
}

function endAssistant(): void {
  isStreaming = false;
  currentAssistantId = null;
  renderMessages();
}

function appendTool(toolName: string, args: Record<string, unknown>, result: { content: string; uiHint?: { kind: string; payload?: Record<string, unknown> } }): void {
  messages.push({
    id: genId(),
    role: 'tool',
    content: `${toolName}(${JSON.stringify(args).slice(0, 80)}) → ${result.content}`,
    toolHint: result.uiHint,
  });
  renderMessages();
}

function appendError(message: string): void {
  messages.push({ id: genId(), role: 'error', content: message });
  renderMessages();
}

function setBusy(busy: boolean): void {
  isStreaming = busy;
  sendBtn.disabled = busy;
  sendBtn.textContent = busy ? '…' : '发送';
}

async function refreshModelLine(): Promise<void> {
  try {
    const chatApi = window.petAPI?.chat;
    if (!chatApi) return;
    const config = await chatApi.getConfig();
    if (!config) return;
    if (config.hasApiKey) {
      modelLine.textContent = `${config.model} · ${config.baseUrl.replace(/^https?:\/\//, '')}`;
    } else {
      modelLine.textContent = '未配置 API key（去「小屋」填）';
    }
  } catch (error) {
    console.error('Failed to get config:', error);
  }
}

async function send(): Promise<void> {
  const text = inputEl.value.trim();
  if (!text || isStreaming) return;
  appendUser(text);
  inputEl.value = '';
  autoSize();
  const id = startAssistant();
  setBusy(true);
  try {
    const chatApi = window.petAPI?.chat;
    if (!chatApi) throw new Error('AI 助手模块未加载');
    await chatApi.send(text, {
      onChunk: (chunk: StreamChunk) => {
        const msg = messages.find((m) => m.id === id);
        if (!msg) return;
        if (chunk.kind === 'content') {
          msg.content = (msg.content ?? '') + chunk.delta;
        } else if (chunk.kind === 'reasoning') {
          msg.reasoning = (msg.reasoning ?? '') + chunk.delta;
        } else if (chunk.kind === 'error') {
          appendError(chunk.message);
        }
        renderMessages();
      },
      onToolResult: (name: string, args: Record<string, unknown>, result: { content: string; uiHint?: { kind: string; payload?: Record<string, unknown> } }) => {
        appendTool(name, args, result);
      },
      onError: (message: string) => {
        appendError(message);
      },
      onDone: () => {
        endAssistant();
        setBusy(false);
      },
    });
  } catch (error) {
    appendError(`发送失败：${(error as Error).message}`);
  }
  setBusy(false);
  endAssistant();
}

function autoSize(): void {
  inputEl.style.height = 'auto';
  inputEl.style.height = `${Math.min(96, inputEl.scrollHeight)}px`;
}

inputEl.addEventListener('input', autoSize);
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    void send();
  }
});
sendBtn.addEventListener('click', () => void send());

closeBtn.addEventListener('click', () => {
  void window.petAPI?.window.hideChat?.();
});

resetBtn.addEventListener('click', async () => {
  const chatApi = window.petAPI?.chat;
  if (!chatApi) return;
  await chatApi.reset();
  messages.length = 0;
  renderMessages();
});

toolRow.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (!target.classList.contains('tool-chip')) return;
  const prompt = target.dataset.prompt ?? '';
  inputEl.value = prompt;
  inputEl.focus();
  autoSize();
});

void refreshModelLine();
renderMessages();

// 加载当前皮肤人设，更新欢迎语
async function applyPersona(): Promise<void> {
  try {
    const persona = await window.petAPI?.chat?.getPersona();
    if (!persona) return;
    const h2 = emptyState.querySelector('h2');
    if (h2) h2.textContent = persona.welcomeTitle;
    const p = emptyState.querySelector('p');
    if (p) p.textContent = persona.welcomeSubtitle;
    inputEl.placeholder = persona.inputPlaceholder;
  } catch { /* 用默认文案 */ }
}
void applyPersona();