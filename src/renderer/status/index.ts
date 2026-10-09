import './index.css';

const memBar = document.getElementById('mem-bar') as HTMLDivElement;
const memVal = document.getElementById('mem-val') as HTMLSpanElement;
const diskBar = document.getElementById('disk-bar') as HTMLDivElement;
const diskVal = document.getElementById('disk-val') as HTMLSpanElement;
const batBar = document.getElementById('bat-bar') as HTMLDivElement;
const batVal = document.getElementById('bat-val') as HTMLSpanElement;
const netIface = document.getElementById('net-iface') as HTMLSpanElement;
const netVal = document.getElementById('net-val') as HTMLSpanElement;

// 速览卡自身 hover：通知主进程保持显示
const card = document.getElementById('status-card');
card?.addEventListener('pointerenter', () => { void window.petAPI?.system.statusHoverStart(); });
card?.addEventListener('pointerleave', () => { void window.petAPI?.system.statusHoverEnd(); });

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '--';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

function formatBps(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return '0';
  const units = ['B/s', 'KB/s', 'MB/s'];
  let value = bps;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

function setBar(el: HTMLDivElement, pct: number): void {
  el.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  el.classList.toggle('warn', pct >= 85);
}

/** 电池条：满格绿色，越少越红（连续渐变 hue 120→0） */
function setBatteryBar(el: HTMLDivElement, pct: number): void {
  if (pct < 0) {
    el.style.width = '0%';
    el.style.backgroundColor = '';
    return;
  }
  el.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  el.style.backgroundColor = `hsl(${Math.round(pct * 1.2)}, 75%, 45%)`;
}

async function refresh(): Promise<void> {
  try {
    const stats = await window.petAPI?.system.stats();
    if (!stats) return;
    setBar(memBar, stats.memory.usedPercent);
    memVal.textContent = `${stats.memory.usedPercent}%`;
    setBar(diskBar, stats.disk.usedPercent);
    diskVal.textContent = `${stats.disk.usedPercent}% · ${formatBytes(stats.disk.freeBytes)}剩`;
    const pct = stats.battery.present ? (stats.battery.percent ?? 0) : -1;
    setBatteryBar(batBar, pct);
    const stateMap: Record<string, string> = { discharging: '放电', charging: '充电', charged: '已满', ac: '电源' };
    batVal.textContent = pct < 0 ? '外接电源' : `${pct}%${stats.battery.state === 'discharging' && stats.battery.timeRemaining ? ` · ${stats.battery.timeRemaining}` : ` ${stateMap[stats.battery.state] ?? ''}`}`;
    netIface.textContent = stats.net.interfaceName || '网速';
    netVal.textContent = `↓ ${formatBps(stats.net.downBps)}  ↑ ${formatBps(stats.net.upBps)}`;
  } catch {
    /* 窗口隐藏时刷新失败静默 */
  }
}

void refresh();
setInterval(() => { void refresh(); }, 2000);
