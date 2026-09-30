import type { RegisteredTool, ToolExecutionResult, ToolContext } from './types';

const STATE_EMOJI: Record<string, string> = {
  'pet-head': '🤗',
  'kiss': '💋',
  'meditate': '🧘',
  'peek-typing': '👀',
  'phone': '📱',
  'sleep': '😴',
};

export const changeStateTool: RegisteredTool = {
  definition: {
    type: 'function',
    function: {
      name: 'change_state',
      description: '让桌宠切换到指定状态（亲亲、抱抱、唱歌、睡觉、冥想等）。让用户点击桌宠一下时可选这个工具表达情绪。',
      parameters: {
        type: 'object',
        properties: {
          state: {
            type: 'string',
            enum: Object.keys(STATE_EMOJI),
            description: '桌宠状态 id',
          },
        },
        required: ['state'],
      },
    },
  },

  async execute(args, ctx: ToolContext): Promise<ToolExecutionResult> {
    const state = String(args.state ?? '');
    if (!STATE_EMOJI[state]) {
      return {
        content: `未知状态：${state}，可选：${Object.keys(STATE_EMOJI).join(', ')}`,
        uiHint: { kind: 'info' },
      };
    }
    if (!ctx.triggerInteraction) {
      return { content: '互动功能未启用', uiHint: { kind: 'info' } };
    }
    await ctx.triggerInteraction(state);
    return {
      content: `已切换到 ${STATE_EMOJI[state]} ${state}`,
      uiHint: { kind: 'interaction', payload: { id: state } },
    };
  },

  isEnabled(config) {
    return config.enabledTools.includes('change_state');
  },
};