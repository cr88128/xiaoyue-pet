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

// 初始化
async function init(): Promise<void> {
  await loadInteractions();
  await loadSettings();
  await loadStats();
  await loadAIConfig();
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
