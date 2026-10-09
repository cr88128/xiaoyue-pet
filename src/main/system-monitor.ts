/**
 * 系统状态与网速监控采集（macOS）。
 * - 内存：Node os 模块
 * - 磁盘：fs.statfsSync（根卷）
 * - 电池：pmset -g batt
 * - 网速：netstat -ib 两次采样差值（选择字节增量最大的非回环接口作为活跃接口）
 * 本模块只输出匿名化系统指标，不记录应用名、进程、路径或任何用户内容。
 */
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import type { DiskCleanupItem, TopMemoryProcess } from '../shared/contracts';

export interface SystemSnapshot {
  memory: {
    totalBytes: number;
    usedBytes: number;
    usedPercent: number;
  };
  disk: {
    totalBytes: number;
    freeBytes: number;
    usedPercent: number;
  };
  battery: {
    present: boolean;
    percent?: number;
    /** 'discharging' | 'charging' | 'charged' | 'ac' */
    state: string;
    timeRemaining?: string;
  };
  net: {
    downBps: number;
    upBps: number;
    interfaceName: string;
  };
}

interface NetSample {
  name: string;
  rxBytes: number;
  txBytes: number;
  at: number;
}

let lastNetSample: NetSample | null = null;

function parseBattery(output: string): SystemSnapshot['battery'] {
  const drawing = /Now drawing from '([^']+) Power'/.exec(output);
  const detail = /(\d+)%;\s*(discharging|charging|charged|AC attached)/.exec(output);
  if (!drawing) {
    return { present: false, state: 'ac' };
  }
  const source = drawing[1];
  if (source === 'AC') {
    if (!detail) return { present: false, state: 'ac' };
    return { present: true, percent: Number(detail[1]), state: detail[2] === 'charged' ? 'charged' : 'charging' };
  }
  const remaining = /(\d+:\d+) remaining/.exec(output);
  return {
    present: true,
    percent: detail ? Number(detail[1]) : undefined,
    state: detail?.[2] === 'discharging' ? 'discharging' : 'unknown',
    timeRemaining: remaining?.[1],
  };
}

function parseNetstat(output: string): Array<{ name: string; rxBytes: number; txBytes: number }> {
  const rows: Array<{ name: string; rxBytes: number; txBytes: number }> = [];
  for (const line of output.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 10) continue;
    const name = parts[0] ?? '';
    const network = parts[2] ?? '';
    if (!network.startsWith('<Link')) continue;
    // 只统计物理网络接口，排除回环/隧道/虚拟接口（gif/stf/utun/ap/awdl/bridge/p2p 等）
    if (!/^(en|eth|wlan)\d+$/.test(name)) continue;
    const rx = Number(parts[6] ?? 0);
    const tx = Number(parts[9] ?? 0);
    if (!Number.isFinite(rx) || !Number.isFinite(tx)) continue;
    rows.push({ name, rxBytes: rx, txBytes: tx });
  }
  return rows;
}

interface MemoryStats {
  usedBytes: number;
  usedPercent: number;
}

/** macOS 内存口径：用 vm_stat 把可回收的 inactive/speculative 页算作可用，避免 freemem 显示虚高占用 */
async function collectMemory(): Promise<MemoryStats> {
  const totalBytes = os.totalmem();
  try {
    const output = await new Promise<string>((resolve, reject) => {
      execFile('/usr/bin/vm_stat', [], { timeout: 3000 }, (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      });
    });
    // vm_stat 页大小因机器而异（Intel 常为 4096，Apple Silicon 常见 16384），必须从输出解析，不能写死
    const pageSizeMatch = /page size of (\d+) bytes/i.exec(output);
    const pageSize = pageSizeMatch ? Number(pageSizeMatch[1]) : 4096;
    const get = (label: string): number => {
      const m = new RegExp(`${label}:\\s+(\\d+)`).exec(output);
      return m ? Number(m[1]) * pageSize : 0;
    };
    // 可用内存 ≈ free + inactive + speculative（可被系统回收的缓存都算可用）
    const freeBytes = get('Pages free') + get('Pages inactive') + get('Pages speculative');
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    return {
      usedBytes,
      usedPercent: totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 1000) / 10 : 0,
    };
  } catch {
    const freeBytes = os.freemem();
    return {
      usedBytes: totalBytes - freeBytes,
      usedPercent: totalBytes > 0 ? Math.round(((totalBytes - freeBytes) / totalBytes) * 1000) / 10 : 0,
    };
  }
}

function execPmset(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/pmset', ['-g', 'batt'], { timeout: 3000 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

function execNetstat(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('/usr/sbin/netstat', ['-ib'], { timeout: 3000 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

/** 计算网速：与上一次采样做差值，返回当前活跃接口的上下行速率（字节/秒） */
function computeNetRate(rows: Array<{ name: string; rxBytes: number; txBytes: number }>): { downBps: number; upBps: number; interfaceName: string } {
  const now = Date.now();
  const first = rows[0];
  if (!first) return { downBps: 0, upBps: 0, interfaceName: '' };
  // 活跃接口 = 与上次采样相比字节增量最大的接口
  let active = first;
  if (lastNetSample) {
    let bestDelta = -1;
    for (const row of rows) {
      const delta = (row.rxBytes + row.txBytes) - (lastNetSample.rxBytes + lastNetSample.txBytes);
      if (delta > bestDelta) {
        bestDelta = delta;
        active = row;
      }
    }
  }
  let downBps = 0;
  let upBps = 0;
  if (lastNetSample && lastNetSample.name === active.name) {
    const elapsedMs = Math.max(1, now - lastNetSample.at);
    downBps = Math.max(0, Math.round((active.rxBytes - lastNetSample.rxBytes) * 1000 / elapsedMs));
    upBps = Math.max(0, Math.round((active.txBytes - lastNetSample.txBytes) * 1000 / elapsedMs));
  }
  lastNetSample = { name: active.name, rxBytes: active.rxBytes, txBytes: active.txBytes, at: now };
  return { downBps, upBps, interfaceName: active.name };
}

export async function collectSystemSnapshot(): Promise<SystemSnapshot> {
  const memory = await collectMemory();
  let disk: SystemSnapshot['disk'];
  try {
    const stat = fs.statfsSync('/');
    const diskTotal = stat.blocks * stat.bsize;
    const diskFree = stat.bavail * stat.bsize;
    disk = {
      totalBytes: diskTotal,
      freeBytes: diskFree,
      usedPercent: diskTotal > 0 ? Math.round((1 - diskFree / diskTotal) * 1000) / 10 : 0,
    };
  } catch {
    disk = { totalBytes: 0, freeBytes: 0, usedPercent: 0 };
  }
  let battery: SystemSnapshot['battery'] = { present: false, state: 'ac' };
  try {
    battery = parseBattery(await execPmset());
  } catch { /* 保持默认 */ }
  let net: SystemSnapshot['net'] = { downBps: 0, upBps: 0, interfaceName: '' };
  try {
    net = computeNetRate(parseNetstat(await execNetstat()));
  } catch { /* 保持默认 */ }
  return {
    memory: {
      totalBytes: os.totalmem(),
      usedBytes: memory.usedBytes,
      usedPercent: memory.usedPercent,
    },
    disk,
    battery,
    net,
  };
}

// ---- 内存大户：ps 读进程 RSS（零权限，仅匿名化指标） ----
function execPs(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('/bin/ps', ['-axo', 'pid=,rss=,comm='], { timeout: 5000 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

/** 内存占用最高的进程（同名进程合并，排除小悦自身） */
export async function listTopMemoryProcesses(limit = 6): Promise<TopMemoryProcess[]> {
  try {
    const output = await execPs();
    const selfRoot = appExecutablePath();
    const merged = new Map<string, { pid: number; memBytes: number }>();
    for (const line of output.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 3) continue;
      const pid = Number(parts[0]);
      const rssKb = Number(parts[1]);
      const comm = parts.slice(2).join(' ');
      if (!Number.isFinite(pid) || !Number.isFinite(rssKb) || rssKb <= 0) continue;
      // 排除小悦自己的进程树
      if (selfRoot && comm.includes(selfRoot)) continue;
      const name = path.basename(comm).replace(/\.app$/, '');
      const entry = merged.get(name);
      if (entry) {
        entry.memBytes += rssKb * 1024;
      } else {
        merged.set(name, { pid, memBytes: rssKb * 1024 });
      }
    }
    return [...merged.entries()]
      .sort((a, b) => b[1].memBytes - a[1].memBytes)
      .slice(0, limit)
      .map(([name, { pid, memBytes }]) => ({ pid, name, memBytes }));
  } catch {
    return [];
  }
}

function appExecutablePath(): string {
  try {
    return (process.execPath || '').replace(/\/Contents\/MacOS\/.*$/, '');
  } catch {
    return '';
  }
}

// ---- 磁盘安全清理：只处理固定白名单内的低风险位置，删除内容保留目录 ----
const CLEANUP_TARGETS: Array<{ id: string; label: string; path: () => string }> = [
  { id: 'caches', label: '系统缓存（可重建）', path: () => path.join(os.homedir(), 'Library', 'Caches') },
  { id: 'logs', label: '日志文件', path: () => path.join(os.homedir(), 'Library', 'Logs') },
  { id: 'tmp', label: '临时文件', path: () => '/tmp' },
  { id: 'trash', label: '废纸篓（不可恢复）', path: () => path.join(os.homedir(), '.Trash') },
];

function dirSizeKb(dir: string): Promise<number> {
  return new Promise((resolve) => {
    execFile('/usr/bin/du', ['-sk', dir], { timeout: 15000 }, (error, stdout) => {
      if (error) { resolve(0); return; }
      const m = /^\s*(\d+)/.exec(stdout);
      resolve(m ? Number(m[1]) : 0);
    });
  });
}

/** 扫描各清理位置大小 */
export async function scanCleanupItems(): Promise<{ items: DiskCleanupItem[]; totalBytes: number }> {
  const items: DiskCleanupItem[] = [];
  for (const target of CLEANUP_TARGETS) {
    const dir = target.path();
    if (!fs.existsSync(dir)) continue;
    const kb = await dirSizeKb(dir);
    items.push({ id: target.id, label: target.label, path: dir, bytes: kb * 1024 });
  }
  const totalBytes = items.reduce((sum, item) => sum + item.bytes, 0);
  return { items, totalBytes };
}

/** 删除所选位置内的内容（保留目录本身）；返回预计释放字节数 */
export async function runCleanup(ids: string[]): Promise<{ freedBytes: number }> {
  const allowed = new Set(CLEANUP_TARGETS.map((target) => target.id));
  const seen = new Set<string>();
  let freedBytes = 0;
  for (const id of ids) {
    if (!allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    const target = CLEANUP_TARGETS.find((item) => item.id === id);
    if (!target) continue;
    const dir = target.path();
    if (!fs.existsSync(dir)) continue;
    const kb = await dirSizeKb(dir);
    freedBytes += kb * 1024;
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(dir);
    } catch { continue; }
    for (const entry of entries) {
      const full = path.join(dir, entry);
      try {
        fs.rmSync(full, { recursive: true, force: true });
      } catch { /* 单个失败不影响其它 */ }
    }
  }
  return { freedBytes };
}
