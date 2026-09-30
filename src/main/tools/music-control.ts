import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { RegisteredTool, ToolExecutionResult } from './types';

const exec = promisify(execFile);

async function osascript(script: string): Promise<string> {
  try {
    const { stdout } = await exec('osascript', ['-e', script], { timeout: 5000 });
    return stdout.trim();
  } catch (error) {
    return `osascript error: ${(error as Error).message}`;
  }
}

async function pressKey(code: string): Promise<string> {
  return osascript(`tell application "System Events" to key code ${code}`);
}

export const musicControlTool: RegisteredTool = {
  definition: {
    type: 'function',
    function: {
      name: 'music_control',
      description: '控制 macOS 系统级媒体播放（Apple Music / Spotify / 网易云 / QQ 音乐 / 浏览器网页音频等都支持）。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['play', 'pause', 'toggle', 'next', 'previous', 'volume_up', 'volume_down', 'mute'],
            description: '操作类型',
          },
          volume_level: { type: 'number', description: '可选：直接设到指定音量 0-100（仅 macOS）' },
        },
        required: ['action'],
      },
    },
  },

  async execute(args): Promise<ToolExecutionResult> {
    if (process.platform !== 'darwin') {
      return { content: '当前平台不支持系统媒体键控制', uiHint: { kind: 'info' } };
    }
    const action = String(args.action ?? '');
    const KEY_PLAY = '49'; // space
    const KEY_NEXT = '124'; // right
    const KEY_PREV = '123'; // left
    const KEY_VOL_UP = '125'; // up
    const KEY_VOL_DOWN = '126'; // down
    const KEY_MUTE = '57'; // m

    let result: string = '';
    switch (action) {
      case 'play':
      case 'pause':
      case 'toggle':
        result = await pressKey(KEY_PLAY);
        break;
      case 'next':
        result = await pressKey(KEY_NEXT);
        break;
      case 'previous':
        result = await pressKey(KEY_PREV);
        break;
      case 'volume_up':
        result = await pressKey(KEY_VOL_UP);
        break;
      case 'volume_down':
        result = await pressKey(KEY_VOL_DOWN);
        break;
      case 'mute':
        result = await pressKey(KEY_MUTE);
        break;
      default:
        return { content: `未知操作：${action}`, uiHint: { kind: 'info' } };
    }
    if (typeof args.volume_level === 'number' && args.volume_level >= 0 && args.volume_level <= 100) {
      await osascript(`set volume output volume ${Math.round(args.volume_level)}`);
    }

    return {
      content: result ? `执行 ${action} 出错：${result}` : `已执行：${action}`,
      uiHint: { kind: 'music', payload: { action, volumeLevel: args.volume_level } },
    };
  },

  isEnabled(config) {
    return config.enableMusicControl;
  },
};