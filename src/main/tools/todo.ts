import type { RegisteredTool, ToolExecutionResult, ToolContext } from './types';
import { parseRelative, parseAbsolute } from './set-reminder';

function formatDue(dueAt?: string): string {
  if (!dueAt) return '';
  const d = new Date(dueAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 添加待办（桌宠内清单，不写系统提醒事项） */
export const addTodoTool: RegisteredTool = {
  definition: {
    type: 'function',
    function: {
      name: 'add_todo',
      description: '往小悦的待办清单里添加一条待办（保存在桌宠本地，不写入系统提醒事项/日历）。当用户说「记一下待办/别忘了做XX/把XX加到清单」时调用。due_text 可选，支持相对时间（"今天下午5点"/"明天上午10点"/"2026-09-10 18:00"），到点后桌宠会弹窗提醒。',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '待办内容，例如「提交周报」' },
          due_text: { type: 'string', description: '可选的截止时间，中文相对/绝对时间或 ISO 字符串' },
        },
        required: ['text'],
      },
    },
  },

  async execute(args, ctx: ToolContext): Promise<ToolExecutionResult> {
    const text = String(args.text ?? '').trim().slice(0, 500);
    if (!text) return { content: '缺少 text 参数', uiHint: { kind: 'info' } };
    let dueAt: string | undefined;
    let display = '';
    const dueText = String(args.due_text ?? '').trim();
    if (dueText) {
      const parsed = parseRelative(dueText) ?? parseAbsolute(dueText);
      if (!parsed) return { content: `无法解析截止时间：${dueText}。示例：「今天下午 5 点」「明天上午 10 点」「2026-09-10 18:00」`, uiHint: { kind: 'info' } };
      dueAt = parsed.iso;
      display = `（截止 ${parsed.display}）`;
    }
    if (!ctx.saveTodo) return { content: '待办功能未启用', uiHint: { kind: 'info' } };
    const saved = await ctx.saveTodo({ text, dueAt });
    return {
      content: `已加入待办清单：${text}${display}`,
      uiHint: { kind: 'todo', payload: { id: saved.id, text, dueAt, action: 'add' } },
    };
  },

  isEnabled(config) {
    return config.enabledTools.includes('add_todo');
  },
};

/** 列出待办 */
export const listTodosTool: RegisteredTool = {
  definition: {
    type: 'function',
    function: {
      name: 'list_todos',
      description: '查看小悦待办清单里的所有待办（含已完成）。当用户问「我有哪些待办/待办清单有什么/还有什么没做」时调用。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },

  async execute(_args, ctx: ToolContext): Promise<ToolExecutionResult> {
    if (!ctx.listTodos) return { content: '待办功能未启用', uiHint: { kind: 'info' } };
    const todos = await ctx.listTodos();
    if (todos.length === 0) return { content: '待办清单是空的，没有待办事项。', uiHint: { kind: 'todo', payload: { action: 'list', todos: [] } } };
    const pending = todos.filter((t) => !t.completed);
    const done = todos.filter((t) => t.completed);
    const lines: string[] = [];
    if (pending.length) lines.push(`未完成 ${pending.length} 项：`);
    pending.forEach((t, i) => lines.push(`${i + 1}. ${t.text}${t.dueAt ? `（截止 ${formatDue(t.dueAt)}）` : ''}`));
    if (done.length) lines.push(`已完成 ${done.length} 项。`);
    return {
      content: lines.join('\n'),
      uiHint: { kind: 'todo', payload: { action: 'list', todos } },
    };
  },

  isEnabled(config) {
    return config.enabledTools.includes('list_todos');
  },
};

/** 勾选/取消勾选待办 */
export const completeTodoTool: RegisteredTool = {
  definition: {
    type: 'function',
    function: {
      name: 'complete_todo',
      description: '把待办清单里的某条待办标记为已完成或取消完成。当用户说「做完了/搞定了 XX」「把 XX 划掉」时调用。todo_id 来自 list_todos 返回结果。',
      parameters: {
        type: 'object',
        properties: {
          todo_id: { type: 'string', description: '待办 id（先调用 list_todos 获取）' },
        },
        required: ['todo_id'],
      },
    },
  },

  async execute(args, ctx: ToolContext): Promise<ToolExecutionResult> {
    const id = String(args.todo_id ?? '').trim();
    if (!id) return { content: '缺少 todo_id 参数', uiHint: { kind: 'info' } };
    if (!ctx.toggleTodo) return { content: '待办功能未启用', uiHint: { kind: 'info' } };
    const completed = await ctx.toggleTodo(id);
    return { content: completed ? '好的，已把这件待办标记为完成 ✅' : '已把该待办恢复为未完成。', uiHint: { kind: 'todo', payload: { action: 'toggle', id, completed } } };
  },

  isEnabled(config) {
    return config.enabledTools.includes('complete_todo');
  },
};
