/**
 * 语音播报：macOS 系统 TTS（say 命令，零权限）。
 * 串行队列避免多段播报叠音；超长文本截断；失败静默降级（不影响主流程）。
 */
import { spawn } from 'node:child_process';

const MAX_LENGTH = 120;
let speaking = false;
const queue: string[] = [];

function speakOnce(text: string): void {
  if (!text) return;
  const child = spawn('/usr/bin/say', ['-v', 'Ting-Ting', text], { stdio: 'ignore' });
  child.on('error', () => {
    // 首选中文声线不存在时，退回系统默认声线
    const fallback = spawn('/usr/bin/say', [text], { stdio: 'ignore' });
    fallback.on('error', () => { /* 静默降级 */ });
    fallback.on('close', () => { next(); });
  });
  child.on('close', () => { next(); });
}

function next(): void {
  const text = queue.shift();
  if (text === undefined) {
    speaking = false;
    return;
  }
  speakOnce(text);
}

/** 播报一段文本；队列串行，不会叠音 */
export function announce(text: string): void {
  const clean = String(text).trim();
  if (!clean) return;
  const clipped = clean.length > MAX_LENGTH ? `${clean.slice(0, MAX_LENGTH)}…` : clean;
  queue.push(clipped);
  if (!speaking) {
    speaking = true;
    next();
  }
}
