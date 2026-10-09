import spec from '../../../pet-spec.json';
import type { PetSpec, PetStats, Settings, InteractionSpec } from '../../shared/contracts';
import './index.css';

// 用于 asset link 检查的占位符（实际不需要导入所有图片）
// require.context('../../assets/pet', true, /\.png$/);

const petSpec = spec as PetSpec;
document.title = `${petSpec.character.displayName}的小屋`;

// 设置主题色
const theme = petSpec.experience.theme;
document.documentElement.style.setProperty('--primary', theme.primary);
document.documentElement.style.setProperty('--accent', theme.accent);
document.documentElement.style.setProperty('--background', theme.background);
document.documentElement.style.setProperty('--surface', theme.surface);
document.documentElement.style.setProperty('--text', theme.text);
document.documentElement.style.setProperty('--muted', theme.muted);
document.documentElement.style.setProperty('--radius', `${theme.cornerRadius}px`);

// 设置宠物信息
document.getElementById('pet-name')!.textContent = petSpec.character.displayName;
document.getElementById('pet-personality')!.textContent = petSpec.character.personality.join('、');

const closeBtn = document.getElementById('close-btn') as HTMLButtonElement;
const affectionEl = document.getElementById('affection') as HTMLDivElement;
const moodEl = document.getElementById('mood') as HTMLDivElement;
const todayInteractionsEl = document.getElementById('today-interactions') as HTMLDivElement;
const companionMinutesEl = document.getElementById('companion-minutes') as HTMLDivElement;
const interactionsList = document.getElementById('interactions-list') as HTMLDivElement;
const toggleAlwaysOnTop = document.getElementById('toggle-always-on-top') as HTMLDivElement;
const toggleClickThrough = document.getElementById('toggle-click-through') as HTMLDivElement;
const toggleVoiceAnnounce = document.getElementById('toggle-voice-announce') as HTMLDivElement;
const sizeSelector = document.getElementById('size-selector') as HTMLDivElement;

let currentSettings: Settings | null = null;

// 加载互动列表
async function loadInteractions(): Promise<void> {
  try {
    const interactions = await window.petAPI?.interactions.list();
    if (!interactions) return;

    interactionsList.replaceChildren();
    for (const interaction of interactions) {
      const btn = document.createElement('button');
      btn.className = 'interaction-btn';
      const emoji = document.createElement('span');
      emoji.textContent = interaction.emoji;
      const label = document.createElement('span');
      label.textContent = interaction.label;
      btn.append(emoji, label);
      btn.addEventListener('click', async () => {
        try {
          await window.petAPI?.interactions.trigger(interaction.id);
        } catch (error) {
          console.error('Failed to trigger interaction:', error);
        }
      });
      interactionsList.appendChild(btn);
    }
  } catch (error) {
    console.error('Failed to load interactions:', error);
  }
}

// 加载设置
async function loadSettings(): Promise<void> {
  try {
    const settings = await window.petAPI?.settings.get();
    if (!settings) return;
    currentSettings = settings;

    // 更新开关状态
    if (settings.alwaysOnTop) {
      toggleAlwaysOnTop.classList.add('active');
    } else {
      toggleAlwaysOnTop.classList.remove('active');
    }

    if (settings.clickThrough) {
      toggleClickThrough.classList.add('active');
    } else {
      toggleClickThrough.classList.remove('active');
    }

    if (settings.voiceAnnounce) {
      toggleVoiceAnnounce.classList.add('active');
    } else {
      toggleVoiceAnnounce.classList.remove('active');
    }

    // 更新大小选择
    const sizeBtns = sizeSelector.querySelectorAll('.size-btn');
    sizeBtns.forEach((btn) => {
      const scale = parseFloat((btn as HTMLElement).dataset.scale || '1');
      if (Math.abs(scale - settings.petScale) < 0.01) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    highlightSkin();
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

// 加载统计数据
async function loadStats(): Promise<void> {
  try {
    const stats = await window.petAPI?.interactions.stats();
    if (!stats) return;
    updateStats(stats);
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

function updateStats(stats: PetStats): void {
  affectionEl.textContent = String(stats.affection);
  moodEl.textContent = String(stats.mood);
  todayInteractionsEl.textContent = String(stats.todayInteractions);
  const unit = document.createElement('small');
  unit.textContent = '分钟';
  companionMinutesEl.replaceChildren(String(stats.companionMinutes), unit);
}

// 关闭按钮
closeBtn.addEventListener('click', async () => {
  await window.petAPI?.window.hideDashboard();
});

// 置顶开关
toggleAlwaysOnTop.addEventListener('click', async () => {
  if (!currentSettings) return;
  const newVal = !currentSettings.alwaysOnTop;
  try {
    await window.petAPI?.settings.update({ alwaysOnTop: newVal });
    currentSettings.alwaysOnTop = newVal;
    if (newVal) {
      toggleAlwaysOnTop.classList.add('active');
    } else {
      toggleAlwaysOnTop.classList.remove('active');
    }
  } catch (error) {
    console.error('Failed to update setting:', error);
  }
});

// 鼠标穿透开关
toggleClickThrough.addEventListener('click', async () => {
  if (!currentSettings) return;
  const newVal = !currentSettings.clickThrough;
  try {
    await window.petAPI?.settings.update({ clickThrough: newVal });
    currentSettings.clickThrough = newVal;
    if (newVal) {
      toggleClickThrough.classList.add('active');
    } else {
      toggleClickThrough.classList.remove('active');
    }
  } catch (error) {
    console.error('Failed to update setting:', error);
  }
});

// 语音播报开关
toggleVoiceAnnounce.addEventListener('click', async () => {
  if (!currentSettings) return;
  const newVal = !currentSettings.voiceAnnounce;
  try {
    await window.petAPI?.settings.update({ voiceAnnounce: newVal });
    currentSettings.voiceAnnounce = newVal;
    if (newVal) {
      toggleVoiceAnnounce.classList.add('active');
    } else {
      toggleVoiceAnnounce.classList.remove('active');
    }
  } catch (error) {
    console.error('Failed to update setting:', error);
  }
});

// 大小选择
sizeSelector.addEventListener('click', async (e) => {
  const target = e.target as HTMLElement;
  if (!target.classList.contains('size-btn')) return;
  if (!currentSettings) return;

  const scale = parseFloat(target.dataset.scale || '1');
  try {
    await window.petAPI?.settings.update({ petScale: scale });
    currentSettings.petScale = scale;

    const sizeBtns = sizeSelector.querySelectorAll('.size-btn');
    sizeBtns.forEach((btn) => btn.classList.remove('active'));
    target.classList.add('active');
  } catch (error) {
    console.error('Failed to update pet scale:', error);
  }
});

// 皮肤选择
const skinSelector = document.getElementById('skin-selector') as HTMLDivElement;
skinSelector.addEventListener('click', async (e) => {
  const target = (e.target as HTMLElement).closest('.size-btn') as HTMLElement | null;
  if (!target || !currentSettings) return;
  const skin = target.dataset.skin || 'default';
  try {
    await window.petAPI?.settings.update({ skin });
    currentSettings.skin = skin;
    skinSelector.querySelectorAll('.size-btn').forEach((b) => b.classList.remove('active'));
    target.classList.add('active');
    // 刷新桌宠窗口以加载新皮肤
    await window.petAPI?.window.reloadPet?.();
    window.location.reload();
  } catch (error) {
    console.error('Failed to switch skin:', error);
  }
});

// 加载时高亮当前皮肤
function highlightSkin(): void {
  if (!currentSettings) return;
  skinSelector.querySelectorAll('.size-btn').forEach((btn) => {
    btn.classList.toggle('active', ((btn as HTMLElement).dataset.skin || 'default') === currentSettings!.skin);
  });
}

// 监听统计数据更新
window.petAPI?.events.onStats((stats: PetStats) => {
  updateStats(stats);
});

// ---- 待办清单 ----
const todoInput = document.getElementById('todo-input') as HTMLInputElement;
const todoDueInput = document.getElementById('todo-due-input') as HTMLInputElement;
const todoAddBtn = document.getElementById('todo-add-btn') as HTMLButtonElement;
const todoList = document.getElementById('todo-list') as HTMLDivElement;

function formatDue(dueAt?: string): { text: string; overdue: boolean } {
  if (!dueAt) return { text: '', overdue: false };
  const d = new Date(dueAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    text: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`,
    overdue: d.getTime() < Date.now(),
  };
}

async function loadTodos(): Promise<void> {
  try {
    const todos = await window.petAPI?.todos.list();
    if (!todos) return;
    todoList.replaceChildren();
    const pending = todos.filter((t) => !t.completed).sort((a, b) => (a.dueAt || '9999').localeCompare(b.dueAt || '9999'));
    const done = todos.filter((t) => t.completed).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    if (pending.length === 0 && done.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'todo-empty';
      empty.textContent = '暂无待办，让主人吩咐吧～';
      todoList.appendChild(empty);
      return;
    }
    for (const todo of pending) {
      const item = document.createElement('div');
      item.className = 'todo-item';
      const check = document.createElement('div');
      check.className = 'todo-check';
      const text = document.createElement('div');
      text.className = 'todo-text';
      text.textContent = todo.text;
      item.append(check, text);
      const due = formatDue(todo.dueAt);
      if (due.text) {
        const dueEl = document.createElement('div');
        dueEl.className = 'todo-due' + (due.overdue ? ' overdue' : '');
        dueEl.textContent = due.text;
        item.appendChild(dueEl);
      }
      const del = document.createElement('button');
      del.className = 'todo-del';
      del.textContent = '✕';
      del.title = '删除待办';
      item.appendChild(del);
      check.addEventListener('click', async () => {
        try { await window.petAPI?.todos.toggle(todo.id); await loadTodos(); } catch { /* 忽略 */ }
      });
      del.addEventListener('click', async () => {
        try { await window.petAPI?.todos.remove(todo.id); await loadTodos(); } catch { /* 忽略 */ }
      });
      todoList.appendChild(item);
    }
    if (done.length > 0) {
      const header = document.createElement('div');
      header.className = 'todo-done-header';
      header.textContent = `已完成 ${done.length} 项`;
      todoList.appendChild(header);
      for (const todo of done) {
        const item = document.createElement('div');
        item.className = 'todo-item done';
        const check = document.createElement('div');
        check.className = 'todo-check done';
        check.textContent = '✓';
        const text = document.createElement('div');
        text.className = 'todo-text';
        text.textContent = todo.text;
        const del = document.createElement('button');
        del.className = 'todo-del';
        del.textContent = '✕';
        del.title = '删除待办';
        item.append(check, text, del);
        check.addEventListener('click', async () => {
          try { await window.petAPI?.todos.toggle(todo.id); await loadTodos(); } catch { /* 忽略 */ }
        });
        del.addEventListener('click', async () => {
          try { await window.petAPI?.todos.remove(todo.id); await loadTodos(); } catch { /* 忽略 */ }
        });
        todoList.appendChild(item);
      }
    }
  } catch (error) {
    console.error('Failed to load todos:', error);
  }
}

async function addTodo(): Promise<void> {
  const text = todoInput.value.trim();
  if (!text) return;
  try {
    const due = todoDueInput.value;
    await window.petAPI?.todos.add({ text, ...(due ? { dueAt: new Date(due).toISOString() } : {}) });
    todoInput.value = '';
    todoDueInput.value = '';
    await loadTodos();
  } catch (error) {
    console.error('Failed to add todo:', error);
  }
}

todoAddBtn.addEventListener('click', () => void addTodo());
todoInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); void addTodo(); }
});

// ---- 系统监控 ----
const memPct = document.getElementById('mem-pct') as HTMLSpanElement;
const memBar = document.getElementById('mem-bar') as HTMLDivElement;
const memDetail = document.getElementById('mem-detail') as HTMLDivElement;
const diskPct = document.getElementById('disk-pct') as HTMLSpanElement;
const diskBar = document.getElementById('disk-bar') as HTMLDivElement;
const diskDetail = document.getElementById('disk-detail') as HTMLDivElement;
const batPct = document.getElementById('bat-pct') as HTMLSpanElement;
const batBar = document.getElementById('bat-bar') as HTMLDivElement;
const batDetail = document.getElementById('bat-detail') as HTMLDivElement;
const netDown = document.getElementById('net-down') as HTMLDivElement;
const netUp = document.getElementById('net-up') as HTMLDivElement;
const netIface = document.getElementById('net-iface') as HTMLSpanElement;

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
  if (!Number.isFinite(bps) || bps <= 0) return '0 KB/s';
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
  const clamped = Math.max(0, Math.min(100, pct));
  el.style.width = `${clamped}%`;
  el.classList.toggle('warn', pct >= 85);
}

/** 电池条：满格绿色，越少越红（连续渐变 hue 120→0） */
function setBatteryBar(el: HTMLDivElement, pct: number): void {
  if (pct < 0) {
    el.style.width = '0%';
    el.style.backgroundColor = '';
    return;
  }
  const clamped = Math.max(0, Math.min(100, pct));
  el.style.width = `${clamped}%`;
  el.style.backgroundColor = `hsl(${Math.round(1.2 * pct)}, 75%, 45%)`;
}

async function refreshStats(): Promise<void> {
  try {
    const stats = await window.petAPI?.system.stats();
    if (!stats) return;
    memPct.textContent = `${stats.memory.usedPercent}%`;
    setBar(memBar, stats.memory.usedPercent);
    memDetail.textContent = `${formatBytes(stats.memory.usedBytes)} / ${formatBytes(stats.memory.totalBytes)}`;
    diskPct.textContent = `${stats.disk.usedPercent}%`;
    setBar(diskBar, stats.disk.usedPercent);
    diskDetail.textContent = `剩余 ${formatBytes(stats.disk.freeBytes)}`;
    if (stats.battery.present) {
      const pct = stats.battery.percent ?? 0;
      batPct.textContent = `${pct}%`;
      setBatteryBar(batBar, pct);
      const stateMap: Record<string, string> = { discharging: '使用电池', charging: '充电中', charged: '已充满', ac: '外接电源' };
      const extra = stats.battery.state === 'discharging' && stats.battery.timeRemaining ? ` · ${stats.battery.timeRemaining}` : '';
      batDetail.textContent = `${stateMap[stats.battery.state] ?? stats.battery.state}${extra}`;
    } else {
      batPct.textContent = '—';
      setBatteryBar(batBar, -1);
      batDetail.textContent = '外接电源（无电池）';
    }
    netDown.textContent = `↓ ${formatBps(stats.net.downBps)}`;
    netUp.textContent = `↑ ${formatBps(stats.net.upBps)}`;
    netIface.textContent = stats.net.interfaceName || '—';
  } catch (error) {
    console.error('Failed to refresh system stats:', error);
  }
}

// ---- 内存大户 ----
const topMemList = document.getElementById('top-mem-list') as HTMLDivElement;

async function loadTopMemory(): Promise<void> {
  try {
    const processes = await window.petAPI?.system.topMemory();
    if (!processes) return;
    topMemList.replaceChildren();
    for (const proc of processes) {
      const item = document.createElement('div');
      item.className = 'top-mem-item';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = proc.name;
      const mem = document.createElement('span');
      mem.className = 'mem';
      mem.textContent = formatBytes(proc.memBytes);
      item.append(name, mem);
      topMemList.appendChild(item);
    }
  } catch (error) {
    console.error('Failed to load top memory:', error);
  }
}

// ---- 磁盘清理 ----
const cleanupList = document.getElementById('cleanup-list') as HTMLDivElement;
const cleanupTotal = document.getElementById('cleanup-total') as HTMLSpanElement;
const cleanupBtn = document.getElementById('cleanup-btn') as HTMLButtonElement;
let cleanupItems: Array<{ id: string; bytes: number }> = [];

async function scanCleanup(): Promise<void> {
  try {
    const result = await window.petAPI?.system.cleanupScan();
    if (!result) return;
    cleanupItems = result.items.map((item) => ({ id: item.id, bytes: item.bytes }));
    cleanupList.replaceChildren();
    for (const item of result.items) {
      const label = document.createElement('label');
      label.className = 'cleanup-item';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = item.id;
      checkbox.checked = item.id !== 'trash';
      const text = document.createElement('span');
      text.className = 'label';
      text.textContent = item.label;
      const size = document.createElement('span');
      size.className = 'size';
      size.textContent = item.bytes > 0 ? formatBytes(item.bytes) : '0 B';
      label.append(checkbox, text, size);
      cleanupList.appendChild(label);
    }
    updateCleanupTotal();
  } catch (error) {
    console.error('Failed to scan cleanup:', error);
  }
}

function selectedCleanupIds(): string[] {
  const ids: string[] = [];
  cleanupList.querySelectorAll('input[type="checkbox"]:checked').forEach((box) => {
    ids.push((box as HTMLInputElement).value);
  });
  return ids;
}

function updateCleanupTotal(): void {
  const ids = selectedCleanupIds();
  const total = cleanupItems.filter((item) => ids.includes(item.id)).reduce((sum, item) => sum + item.bytes, 0);
  cleanupTotal.textContent = total > 0 ? `可释放约 ${formatBytes(total)}` : '没有选中可清理项';
  cleanupBtn.disabled = ids.length === 0;
}

cleanupList.addEventListener('change', updateCleanupTotal);
cleanupBtn.addEventListener('click', async () => {
  const ids = selectedCleanupIds();
  if (ids.length === 0) return;
  if (ids.includes('trash') && !window.confirm('确定要清空废纸篓吗？清空后不可恢复。')) return;
  cleanupBtn.disabled = true;
  cleanupBtn.textContent = '清理中…';
  try {
    const result = await window.petAPI?.system.cleanupRun(ids);
    cleanupTotal.textContent = result && result.freedBytes > 0 ? `已释放 ${formatBytes(result.freedBytes)}` : '已清理完成';
    await scanCleanup();
  } catch (error) {
    cleanupTotal.textContent = '清理失败: ' + (error as Error).message;
  } finally {
    cleanupBtn.textContent = '清理所选';
    updateCleanupTotal();
  }
});

// 初始化
async function init(): Promise<void> {
  await loadInteractions();
  await loadSettings();
  await loadStats();
  await loadAIConfig();
  await loadTodos();
  await refreshStats();
  setInterval(() => { void refreshStats(); }, 2000);
  await loadTopMemory();
  setInterval(() => { void loadTopMemory(); }, 5000);
  await scanCleanup();
}

// ---- AI 配置 ----
const aiBaseUrl = document.getElementById('ai-base-url') as HTMLInputElement;
const aiApiKey = document.getElementById('ai-api-key') as HTMLInputElement;
const aiModel = document.getElementById('ai-model') as HTMLInputElement;
const aiSave = document.getElementById('ai-save') as HTMLButtonElement;
const aiStatus = document.getElementById('ai-status') as HTMLDivElement;

async function loadAIConfig(): Promise<void> {
  try {
    const config = await window.petAPI?.chat?.getConfig();
    if (!config) { aiStatus.textContent = '未配置'; return; }
    aiBaseUrl.value = config.baseUrl || '';
    aiModel.value = config.model || '';
    aiStatus.textContent = config.hasApiKey ? '✅ 已配置' : '⚠️ 未填 API Key';
  } catch {
    aiStatus.textContent = '未配置';
  }
}

document.querySelectorAll('.preset-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const el = btn as HTMLElement;
    aiBaseUrl.value = el.dataset.base || '';
    aiModel.value = el.dataset.model || '';
  });
});

aiSave.addEventListener('click', async () => {
  try {
    aiStatus.textContent = '保存中…';
    await window.petAPI?.chat?.saveConfig({
      baseUrl: aiBaseUrl.value.trim(),
      model: aiModel.value.trim(),
      ...(aiApiKey.value ? { apiKey: aiApiKey.value } : {}),
    });
    aiApiKey.value = '';
    aiStatus.textContent = '✅ 已保存';
  } catch (error) {
    aiStatus.textContent = '❌ 保存失败: ' + (error as Error).message;
  }
});

init();
