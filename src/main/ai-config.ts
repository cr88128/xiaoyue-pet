import { app, safeStorage } from 'electron';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { atomicWriteJson, readValidatedJson } from './persistence';

export interface AIConfig {
  id: string;
  baseUrl: string;
  model: string;
  apiKeyCipher: string;
  systemPrompt: string;
  enabledTools: string[];
  enableTranslation: boolean;
  enableWebSearch: boolean;
  enableStockQuery: boolean;
  enableMusicControl: boolean;
  enableScreenshot: boolean;
  shortcutChat: string;
  shortcutTranslate: string;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_AI_CONFIG: Omit<AIConfig, 'id' | 'apiKeyCipher' | 'createdAt' | 'updatedAt'> = {
  baseUrl: 'https://api.minimaxi.com/v1',
  model: 'MiniMax-M3',
  systemPrompt: '你是小悦，一位黑白女仆装的短发女仆，温柔体贴、细心周到。称呼用户为主人。说话简短可爱，带适当 emoji，关心主人的工作和心情。你能帮主人设提醒、记笔记、切换桌宠动作。回复用中文，每次不超过 80 字。',
  enabledTools: ['set_reminder', 'change_state', 'translate', 'note', 'music_control', 'screenshot'],
  enableTranslation: true,
  enableWebSearch: false,
  enableStockQuery: true,
  enableMusicControl: true,
  enableScreenshot: true,
  shortcutChat: 'CommandOrControl+Shift+/',
  shortcutTranslate: 'CommandOrControl+Shift+T',
};

let cached: AIConfig | undefined;

function configFile(): string {
  return path.join(app.getPath('userData'), 'ai-config.json');
}

function parseConfig(value: unknown): AIConfig | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.baseUrl !== 'string' || typeof obj.model !== 'string') return null;
  return {
    id: typeof obj.id === 'string' ? obj.id : randomUUID(),
    baseUrl: obj.baseUrl,
    model: obj.model,
    apiKeyCipher: typeof obj.apiKeyCipher === 'string' ? obj.apiKeyCipher : '',
    systemPrompt: typeof obj.systemPrompt === 'string' ? obj.systemPrompt : DEFAULT_AI_CONFIG.systemPrompt,
    enabledTools: Array.isArray(obj.enabledTools) ? obj.enabledTools.filter((item): item is string => typeof item === 'string') : DEFAULT_AI_CONFIG.enabledTools,
    enableTranslation: Boolean(obj.enableTranslation),
    enableWebSearch: Boolean(obj.enableWebSearch),
    enableStockQuery: Boolean(obj.enableStockQuery),
    enableMusicControl: Boolean(obj.enableMusicControl),
    enableScreenshot: Boolean(obj.enableScreenshot),
    shortcutChat: typeof obj.shortcutChat === 'string' ? obj.shortcutChat : DEFAULT_AI_CONFIG.shortcutChat,
    shortcutTranslate: typeof obj.shortcutTranslate === 'string' ? obj.shortcutTranslate : DEFAULT_AI_CONFIG.shortcutTranslate,
    createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : new Date().toISOString(),
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : new Date().toISOString(),
  };
}

export async function loadAIConfig(): Promise<AIConfig> {
  if (cached) return cached;
  const config = await readValidatedJson(configFile(), null, parseConfig);
  if (config) {
    cached = config;
    return config;
  }
  const fresh: AIConfig = {
    id: randomUUID(),
    baseUrl: DEFAULT_AI_CONFIG.baseUrl,
    model: DEFAULT_AI_CONFIG.model,
    apiKeyCipher: '',
    systemPrompt: DEFAULT_AI_CONFIG.systemPrompt,
    enabledTools: [...DEFAULT_AI_CONFIG.enabledTools],
    enableTranslation: DEFAULT_AI_CONFIG.enableTranslation,
    enableWebSearch: DEFAULT_AI_CONFIG.enableWebSearch,
    enableStockQuery: DEFAULT_AI_CONFIG.enableStockQuery,
    enableMusicControl: DEFAULT_AI_CONFIG.enableMusicControl,
    enableScreenshot: DEFAULT_AI_CONFIG.enableScreenshot,
    shortcutChat: DEFAULT_AI_CONFIG.shortcutChat,
    shortcutTranslate: DEFAULT_AI_CONFIG.shortcutTranslate,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  cached = fresh;
  await atomicWriteJson(configFile(), fresh);
  return fresh;
}

export async function saveAIConfig(patch: Partial<Omit<AIConfig, 'id' | 'createdAt' | 'apiKeyCipher'>> & { apiKey?: string }): Promise<AIConfig> {
  const current = await loadAIConfig();
  let apiKeyCipher = current.apiKeyCipher;
  if (typeof patch.apiKey === 'string') {
    apiKeyCipher = patch.apiKey.length === 0 ? '' : encryptApiKey(patch.apiKey);
  }
  const next: AIConfig = {
    ...current,
    ...patch,
    apiKeyCipher,
    updatedAt: new Date().toISOString(),
  };
  await atomicWriteJson(configFile(), next);
  cached = next;
  return next;
}

export function decryptApiKey(config: AIConfig): string {
  if (!config.apiKeyCipher) return '';
  try {
    return safeStorage.decryptString(Buffer.from(config.apiKeyCipher, 'base64')).toString();
  } catch {
    return '';
  }
}

export function encryptApiKey(plain: string): string {
  if (!plain) return '';
  return safeStorage.encryptString(plain).toString('base64');
}

export function isAIConfigured(config: AIConfig): boolean {
  return Boolean(config.apiKeyCipher) && config.baseUrl.length > 0 && config.model.length > 0;
}

export interface PublicAIConfig {
  id: string;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  systemPrompt: string;
  enabledTools: string[];
  enableTranslation: boolean;
  enableWebSearch: boolean;
  enableStockQuery: boolean;
  enableMusicControl: boolean;
  enableScreenshot: boolean;
  shortcutChat: string;
  shortcutTranslate: string;
  createdAt: string;
  updatedAt: string;
}

export function toPublicConfig(config: AIConfig): PublicAIConfig {
  return {
    id: config.id,
    baseUrl: config.baseUrl,
    model: config.model,
    hasApiKey: Boolean(config.apiKeyCipher),
    systemPrompt: config.systemPrompt,
    enabledTools: config.enabledTools,
    enableTranslation: config.enableTranslation,
    enableWebSearch: config.enableWebSearch,
    enableStockQuery: config.enableStockQuery,
    enableMusicControl: config.enableMusicControl,
    enableScreenshot: config.enableScreenshot,
    shortcutChat: config.shortcutChat,
    shortcutTranslate: config.shortcutTranslate,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}