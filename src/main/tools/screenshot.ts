import { app, desktopCapturer, BrowserWindow } from 'electron';
import { spawn } from 'node:child_process';
import { writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { RegisteredTool, ToolExecutionResult } from './types';

interface CapturedImage {
  dataUrl: string;
  size: { width: number; height: number };
}

async function captureFullScreen(): Promise<CapturedImage | null> {
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 2880, height: 1800 } });
    const primary = sources[0];
    if (!primary) return null;
    const image = primary.thumbnail;
    return {
      dataUrl: image.toDataURL(),
      size: image.getSize(),
    };
  } catch {
    return null;
  }
}

async function captureFocusedWindow(): Promise<CapturedImage | null> {
  const focused = BrowserWindow.getFocusedWindow();
  if (!focused) return null;
  try {
    const image = await focused.webContents.capturePage();
    return {
      dataUrl: image.toDataURL(),
      size: image.getSize(),
    };
  } catch {
    return null;
  }
}

/** macOS 原生区域选择截图：调用 screencapture -i 交互式选区 */
function captureAreaMac(filePath: string): Promise<{ ok: boolean; cancelled?: boolean; error?: string }> {
  return new Promise((resolve) => {
    if (process.platform !== 'darwin') {
      resolve({ ok: false, error: '区域选择仅支持 macOS' });
      return;
    }
    const child = spawn('screencapture', ['-i', '-s', '-t', 'png', filePath]);
    child.on('error', (err) => resolve({ ok: false, error: err.message }));
    child.on('exit', async (code) => {
      // -s = 选区模式（拖框/选窗），无选区则视为取消
      // -t png = 输出 PNG
      // 退出码 0 = 选区成功（非空 PNG），退出码非 0 = 取消或失败
      if (code === 0) {
        try {
          const s = await stat(filePath);
          if (s.size > 0) resolve({ ok: true });
          else resolve({ ok: false, cancelled: true });
        } catch (error) {
          resolve({ ok: false, error: (error as Error).message });
        }
      } else {
        resolve({ ok: false, cancelled: true });
      }
    });
  });
}

/** 文件口袋路径：~/Documents/小悦桌宠/（与 files:put 共用） */
function filePocket(): string {
  return path.join(app.getPath('documents'), '小悦桌宠');
}

/** 格式化时间戳：YYYY-MM-DD-HHMMSS */
function ts(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export const screenshotTool: RegisteredTool = {
  definition: {
    type: 'function',
    function: {
      name: 'screenshot',
      description: '截取主屏幕/前台窗口/手动框选区域，保存为 PNG 文件到小悦文件口袋（~/Documents/小悦桌宠/）。area 模式在 macOS 上调原生 screencapture -i 用户拖框；其他平台 fallback 到全屏。',
      parameters: {
        type: 'object',
        properties: {
          region: {
            type: 'string',
            enum: ['full', 'window', 'area'],
            description: '截图范围。full=全屏，window=当前前台窗口，area=手动框选区域（仅 macOS）',
          },
        },
      },
    },
  },

  async execute(args): Promise<ToolExecutionResult> {
    const region = String(args.region ?? 'full');
    const dir = filePocket();
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `截图-${ts()}.png`);

    // 区域选择走 macOS 原生
    if (region === 'area') {
      const r = await captureAreaMac(file);
      if (r.cancelled) {
        return { content: '已取消截图', uiHint: { kind: 'info' } };
      }
      if (!r.ok) {
        return { content: `区域截图失败：${r.error ?? '未知错误'}`, uiHint: { kind: 'info' } };
      }
      return {
        content: `已框选截图保存到小悦文件口袋：${path.basename(file)}`,
        uiHint: { kind: 'screenshot', payload: { file, area: true } },
      };
    }

    // 全屏 / 窗口走 Electron API
    const captured = region === 'window' ? await captureFocusedWindow() : await captureFullScreen();
    if (!captured) {
      return { content: '截屏失败：无法获取屏幕源（macOS 请在「系统设置 → 隐私与安全性 → 屏幕录制」允许小悦桌宠）', uiHint: { kind: 'info' } };
    }
    const base64 = captured.dataUrl.replace(/^data:image\/\w+;base64,/, '');
    await writeFile(file, Buffer.from(base64, 'base64'));
    return {
      content: `已截图保存到小悦文件口袋：${path.basename(file)}（${captured.size.width}×${captured.size.height}）`,
      uiHint: { kind: 'screenshot', payload: { file, size: captured.size } },
    };
  },

  isEnabled(config) {
    return config.enableScreenshot;
  },
};