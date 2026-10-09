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
 * 写入 macOS 系统提醒事项（Reminders.app）。
 * 与 set_reminder 的区别：set_reminder 只在桌宠内弹临时提醒；本工具写入系统提醒事项。
 */
export const addSystemReminderTool: RegisteredTool = {
  definition: {
    type: 'function',
    function: {
      name: 'add_system_reminder',
      description:
        '写入 macOS 系统提醒事项（Reminders.app），会出现在系统「提醒事项」应用中。当用户说「记到提醒事项」「加个系统提醒」「帮我记一个待办」时调用。与 set_reminder 不同：set_reminder 只在桌宠内临时提醒，本工具写入系统提醒事项。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '提醒内容，例如「周五还信用卡」' },
          due_time: { type: 'string', description: '可选，到期时间，支持相对中文（"明天上午9点"/"周五 10:00"）或 ISO 时间；不填则只有内容没有到期日' },
        },
        required: ['name'],
      },
    },
  },

  async execute(args): Promise<ToolExecutionResult> {
    const name = String(args.name ?? '').trim().slice(0, 200);
    const dueRaw = String(args.due_time ?? '').trim();
    if (!name) {
      return { content: '缺少 name 参数', uiHint: { kind: 'info' } };
    }

    const nameAS = escapeAS(name);

    let dueBlock = '';
    let displayDue = '无到期时间';
    if (dueRaw) {
      const parsed = parseScheduleTime(dueRaw);
      if (!parsed) {
        return {
          content: `无法解析时间：${dueRaw}。示例：「明天上午 9 点」「周五 10:00」「2026-09-30T14:30:00」`,
          uiHint: { kind: 'info' },
        };
      }
      const dueLocal = toLocalDateTimeString(parsed.iso);
      dueBlock = [
        buildDateDeltaScript(dueLocal),
        'set due date of newR to targetDate',
      ].join('\n');
      displayDue = parsed.display;
    }

    const script = [
      'tell application "Reminders"',
      `set newR to make new reminder with properties {name:"${nameAS}"}`,
      dueBlock,
      'end tell',
    ].join('\n');

    const result = await runOsascript(script);
    if (!result.ok) {
      const friendly = isAuthorizationError(result.error)
        ? '写入系统提醒事项需要授权：请在弹出的「小悦桌宠想要控制 提醒事项」对话框里点「允许」，然后重试'
        : `写入系统提醒事项失败：${result.error}`;
      return { content: friendly, uiHint: { kind: 'info' } };
    }

    return {
      content: `已记入系统提醒事项：「${name}」（${displayDue}）`,
      uiHint: { kind: 'info' },
    };
  },

  isEnabled(config) {
    return config.enabledTools.includes('add_system_reminder');
  },
};
