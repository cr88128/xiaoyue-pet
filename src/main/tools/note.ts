import { app } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { RegisteredTool, ToolExecutionResult } from './types';

function notesDir(): string {
  return path.join(app.getPath('userData'), 'notes');
}

function todayStamp(): string {
  const d = new Date();
  return `${ `${d.getFullYear()}` }-${ `${String(d.getMonth() + 1).padStart(2, '0')}` }-${ `${String(d.getDate()).padStart(2, '0')}` }`;
}

export const noteTool: RegisteredTool = {
  definition: {
    type: 'function',
    function: {
      name: 'note',
      description: '保存一段笔记到本地（userData/notes/YYYY-MM-DD.md）。当用户说「记一下」「备忘」「写下」时调用。',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '要保存的笔记内容' },
          tag: { type: 'string', description: '可选标签，例如「工作」「灵感」' },
        },
        required: ['content'],
      },
    },
  },

  async execute(args): Promise<ToolExecutionResult> {
    const content = String(args.content ?? '').trim().slice(0, 4000);
    const tag = typeof args.tag === 'string' ? args.tag.trim() : '';
    if (!content) return { content: '笔记内容为空', uiHint: { kind: 'info' } };

    await mkdir(notesDir(), { recursive: true });
    const file = path.join(notesDir(), `${todayStamp()}.md`);
    const line = `\n- ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}${tag ? ` [${tag}]` : ''} ${content}`;
    await writeFile(file, line, { flag: 'a', encoding: 'utf-8' });

    return {
      content: `已记录：${content.slice(0, 80)}${content.length > 80 ? '...' : ''}（${todayStamp()}.md）`,
      uiHint: { kind: 'note', payload: { file, content, tag } },
    };
  },

  isEnabled(config) {
    return config.enabledTools.includes('note');
  },
};