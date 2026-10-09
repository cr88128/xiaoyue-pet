import { randomUUID } from 'node:crypto';
import type { RegisteredTool, ToolExecutionResult, ToolContext } from './types';

interface ParsedTime {
  iso: string;
  display: string;
}

export function parseRelative(text: string, now = Date.now()): ParsedTime | null {
  const m = text.match(/(\d+)\s*(秒|分钟|分|小时|天|日|周|个星期)/i);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2];
  let ms = 0;
  switch (unit) {
    case '秒': ms = n * 1000; break;
    case '分钟':
    case '分': ms = n * 60_000; break;
    case '小时': ms = n * 3_600_000; break;
    case '天':
    case '日': ms = n * 86_400_000; break;
    case '周':
    case '个星期': ms = n * 7 * 86_400_000; break;
    default: return null;
  }
  const iso = new Date(now + ms).toISOString();
  return { iso, display: text };
}

export function parseAbsolute(text: string): ParsedTime | null {
  // 接受 "今天 14:30"、"明天下午 3 点"、"2026-09-09 14:30"
  const now = new Date();
  let candidate: Date | null = null;
  const reDate = text.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\s*(\d{1,2})?:?(\d{1,2})?/);
  if (reDate) {
    const [, y, mo, d, h = '0', mi = '0'] = reDate;
    candidate = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  } else {
    const reTime = text.match(/(今天|明天|后天)?\s*(上午|下午|早上|晚上)?\s*(\d{1,2})\s:(\d{1,2})/);
    if (reTime) {
      const [, day, period, hh, mm] = reTime;
      const base = new Date(now);
      if (day === '明天') base.setDate(base.getDate() + 1);
      else if (day === '后天') base.setDate(base.getDate() + 2);
      let hour = Number(hh);
      if (period === '下午' && hour < 12) hour += 12;
      if (period === '晚上' && hour < 12) hour += 12;
      if (period === '上午' && hour === 12) hour = 0;
      if (period === '早上' && hour === 12) hour = 0;
      candidate = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, Number(mm));
    }
  }
  if (!candidate) return null;
  return { iso: candidate.toISOString(), display: candidate.toLocaleString('zh-CN') };
}

export const setReminderTool: RegisteredTool = {
  definition: {
    type: 'function',
    function: {
      name: 'set_reminder',
      description: '创建一个新的本地提醒事项。time_text 支持相对时间（"30分钟后"/"2小时后"/"明天下午 3 点"/"2026-09-09 14:30"）或 absolute ISO 时间。',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '提醒内容，例如「休息眼睛」' },
          time_text: { type: 'string', description: '触发时间，相对或绝对中文/ISO 字符串' },
        },
        required: ['text', 'time_text'],
      },
    },
  },

  async execute(args, ctx: ToolContext): Promise<ToolExecutionResult> {
    const text = String(args.text ?? '').trim().slice(0, 500);
    const timeText = String(args.time_text ?? '').trim();
    if (!text || !timeText) {
      return { content: '缺少 text 或 time_text 参数', uiHint: { kind: 'info' } };
    }
    const parsed = parseRelative(timeText) ?? parseAbsolute(timeText);
    if (!parsed) {
      return {
        content: `无法解析时间：${timeText}。示例：「30 分钟后」「」「明天下午 3 点」「2026-09-09 14:30」`,
        uiHint: { kind: 'info' },
      };
    }
    if (!ctx.saveReminder) {
      return { content: '提醒功能未启用', uiHint: { kind: 'info' } };
    }
    const saved = await ctx.saveReminder({ text, dueAt: parsed.iso });
    return {
      content: `已设置提醒：${text}（${parsed.display}）`,
      uiHint: {
        kind: 'reminder',
        payload: { id: saved.id, text, dueAt: parsed.iso, display: parsed.display },
      },
    };
  },

  isEnabled(config) {
    return config.enabledTools.includes('set_reminder');
  },
};