import type { RegisteredTool, ToolExecutionResult } from './types';
import {
  escapeAS,
  isAuthorizationError,
  parseScheduleTime,
  runOsascript,
  toLocalDateTimeString,
  buildDateDeltaScript,
} from './system-schedule-common';

/**
 * 写入 macOS 系统日历（Calendar.app）。
 * 与 set_reminder 的区别：set_reminder 只在桌宠内弹临时提醒；本工具让日程出现在系统日历里。
 */
export const addSystemCalendarTool: RegisteredTool = {
  definition: {
    type: 'function',
    function: {
      name: 'add_system_calendar',
      description:
        '写入 macOS 系统日历（Calendar.app），日程会出现在系统日历应用中。当用户说「加到日历」「建个日程」「安排到日历」「周六下午3点开会记到日历」时调用。与 set_reminder 不同：set_reminder 只在桌宠内临时提醒，本工具写入系统日历。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '日程标题，例如「项目评审会」' },
          start_time: { type: 'string', description: '开始时间，支持相对中文（"30分钟后"/"明天下午 3 点"/"周六 14:00"）或 ISO 时间（"2026-09-30T14:30:00"）' },
          duration_minutes: { type: 'number', description: '持续时间（分钟），默认 60' },
          calendar: { type: 'string', description: '可选，目标日历名称，缺省用第一个日历' },
        },
        required: ['title', 'start_time'],
      },
    },
  },

  async execute(args): Promise<ToolExecutionResult> {
    const title = String(args.title ?? '').trim().slice(0, 200);
    const startRaw = String(args.start_time ?? '').trim();
    const durationMin = Math.min(60 * 24, Math.max(1, Number(args.duration_minutes) || 60));
    const calendarName = String(args.calendar ?? '').trim();
    if (!title || !startRaw) {
      return { content: '缺少 title 或 start_time 参数', uiHint: { kind: 'info' } };
    }

    const parsed = parseScheduleTime(startRaw);
    if (!parsed) {
      return {
        content: `无法解析时间：${startRaw}。示例：「30 分钟后」「明天下午 3 点」「周六 14:00」「2026-09-30T14:30:00」`,
        uiHint: { kind: 'info' },
      };
    }

    const startLocal = toLocalDateTimeString(parsed.iso);
    const titleAS = escapeAS(title);
    const calTarget = calendarName
      ? `tell calendar (${escapeAS(calendarName)} as string)`
      : 'set calName to name of first calendar\ntell calendar (calName as string)';

    const script = [
      'tell application "Calendar"',
      buildDateDeltaScript(startLocal),
      calTarget,
      `  make new event with properties {summary:"${titleAS}", start date:targetDate, end date:(targetDate + ${durationMin * 60})}`,
      'end tell',
      'end tell',
    ].join('\n');

    const result = await runOsascript(script);
    if (!result.ok) {
      const friendly = isAuthorizationError(result.error)
        ? '写入系统日历需要授权：请在弹出的「小悦桌宠想要控制 日历」对话框里点「允许」，然后重试'
        : `写入系统日历失败：${result.error}`;
      return { content: friendly, uiHint: { kind: 'info' } };
    }

    return {
      content: `已添加到系统日历：${parsed.display}「${title}」（${durationMin} 分钟）`,
      uiHint: { kind: 'info' },
    };
  },

  isEnabled(config) {
    return config.enabledTools.includes('add_system_calendar');
  },
};
