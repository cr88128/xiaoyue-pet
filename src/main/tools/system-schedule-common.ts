import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseRelative, parseAbsolute } from './set-reminder';

const execFileAsync = promisify(execFile);

export interface ParsedScheduleTime {
  iso: string;
  display: string;
}

/** 把 ISO 时间转成本地时区的 "YYYY-MM-DD HH:MM:SS"，供 BSD date -j -f 解析 */
export function toLocalDateTimeString(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** AppleScript 字符串转义：反斜杠与双引号 */
export function escapeAS(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** 解析工具参数里的时间：相对中文 / 绝对中文 / ISO / 原生 Date */
export function parseScheduleTime(raw: string, now = Date.now()): ParsedScheduleTime | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const rel = parseRelative(text, now);
  if (rel) return rel;
  const abs = parseAbsolute(text);
  if (abs) return abs;
  const direct = new Date(text);
  if (!Number.isNaN(direct.getTime())) {
    return { iso: direct.toISOString(), display: direct.toLocaleString('zh-CN') };
  }
  return null;
}

export interface OsascriptResult {
  ok: boolean;
  output: string;
  error: string;
}

/** 执行 osascript。返回 ok/output/error，不抛异常。 */
export async function runOsascript(script: string): Promise<OsascriptResult> {
  try {
    const { stdout } = await execFileAsync('osascript', ['-e', script], { timeout: 20_000 });
    return { ok: true, output: stdout.trim(), error: '' };
  } catch (error) {
    const err = error as { stderr?: string; message?: string };
    const stderr = (err.stderr ?? '').trim();
    return { ok: false, output: '', error: stderr || (err.message ?? String(error)) };
  }
}

/** 是否因 macOS 自动化授权被拒（用户点了「不允许」或从未授权） */
export function isAuthorizationError(error: string): boolean {
  return /not authorized|not permitted|error -1743|Not authorized to send Apple events/i.test(error);
}

/** 用 epoch 差值构造目标时刻的 AppleScript date 表达式（避免直接解析本地化日期字符串） */
export function buildDateDeltaScript(localDateTime: string): string {
  return [
    `set targetEpoch to (do shell script "date -j -f '%Y-%m-%d %H:%M:%S' '" & "${localDateTime}" & "' '+%s'")`,
    `set nowEpoch to (do shell script "date '+%s'")`,
    `set targetDate to (current date) + ((targetEpoch as number) - (nowEpoch as number))`,
  ].join('\n');
}
