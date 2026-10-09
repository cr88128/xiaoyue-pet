import type { ToolDefinition } from '../llm-client';

export interface ToolContext {
  /**: 当前 chat session id */
  sessionId: string;
  /**: 用于触发桌宠状态的回调（change_state 工具调用） */
  triggerInteraction?: (id: string) => Promise<void>;
  /**: 用于新建提醒（set_reminder 工具调用） */
  saveReminder?: (input: { text: string; dueAt: string }) => Promise<{ id: string }>;
  /**: 用于新建待办（add_todo 工具调用） */
  saveTodo?: (input: { text: string; dueAt?: string }) => Promise<{ id: string }>;
  /**: 列出待办（list_todos 工具调用） */
  listTodos?: () => Promise<Array<{ id: string; text: string; dueAt?: string; completed: boolean }>>;
  /**: 完成/取消待办（complete_todo 工具调用） */
  toggleTodo?: (id: string) => Promise<boolean>;
}

export interface ToolExecutionResult {
  /**: 给 LLM 看的结果字符串 */
  content: string;
  /**: 给用户看的辅助数据（可选） */
  uiHint?: {
    kind: 'reminder' | 'interaction' | 'translation' | 'note' | 'stock' | 'search' | 'music' | 'screenshot' | 'info' | 'todo';
    payload?: Record<string, unknown>;
  };
}

export interface RegisteredTool {
  definition: ToolDefinition;
  /**: 执行工具 */
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolExecutionResult>;
  /**: 此工具是否对当前 AI config 启用 */
  isEnabled?: (config: { enabledTools: string[]; enableTranslation: boolean; enableWebSearch: boolean; enableStockQuery: boolean; enableMusicControl: boolean; enableScreenshot: boolean }) => boolean;
}