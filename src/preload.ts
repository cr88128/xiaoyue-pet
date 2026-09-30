import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { AIConfigPatch, InteractionResult, InteractionSpec, PetAPI, PetStats, PublicAIConfig, Reminder, RuntimeFailureReport, RuntimeReadyReport, Settings, StateActivity, StreamChunk, TypingStatus } from './shared/contracts';

function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const wrapped = (_event: Electron.IpcRendererEvent, value: T) => listener(value);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

const api: PetAPI = {
  settings: {
    get: () => ipcRenderer.invoke('settings:get') as Promise<Settings>,
    update: (patch) => ipcRenderer.invoke('settings:update', patch) as Promise<Settings>,
  },
  reminders: {
    list: () => ipcRenderer.invoke('reminders:list') as Promise<Reminder[]>,
    save: (input) => ipcRenderer.invoke('reminders:save', input) as Promise<Reminder>,
    remove: (id) => ipcRenderer.invoke('reminders:remove', id) as Promise<boolean>,
  },
  interactions: {
    list: () => ipcRenderer.invoke('interactions:list') as Promise<InteractionSpec[]>,
    trigger: (id) => ipcRenderer.invoke('interactions:trigger', id) as Promise<InteractionResult>,
    stats: () => ipcRenderer.invoke('interactions:stats') as Promise<PetStats>,
  },
  files: {
    getPathForFile: (file) => webUtils.getPathForFile(file),
    put: (paths) => ipcRenderer.invoke('files:put', paths),
    openPocket: () => ipcRenderer.invoke('files:open-pocket') as Promise<void>,
  },
  window: {
    beginDrag: () => ipcRenderer.invoke('window:drag-begin') as Promise<void>,
    updateDrag: () => ipcRenderer.invoke('window:drag-update') as Promise<void>,
    endDrag: () => ipcRenderer.invoke('window:drag-end') as Promise<void>,
    showContextMenu: () => ipcRenderer.invoke('window:show-context-menu') as Promise<void>,
    showReminder: () => ipcRenderer.invoke('window:show-reminder') as Promise<void>,
    showDashboard: () => ipcRenderer.invoke('window:show-dashboard') as Promise<void>,
    hideReminder: () => ipcRenderer.invoke('window:hide-reminder') as Promise<void>,
    hideDashboard: () => ipcRenderer.invoke('window:hide-dashboard') as Promise<void>,
    hidePet: () => ipcRenderer.invoke('window:hide-pet') as Promise<void>,
    showChat: () => ipcRenderer.invoke('window:show-chat') as Promise<void>,
    reloadPet: () => ipcRenderer.invoke('window:reload-pet') as Promise<void>,
    fetchCalendarToday: () => ipcRenderer.invoke('calendar:today') as Promise<Array<{ title: string; start: string; end: string; calendar: string }>>,
    setIgnoreMouse: (ignore: boolean) => ipcRenderer.send('pet:set-ignore-mouse', ignore),
    hideChat: () => ipcRenderer.invoke('window:hide-chat') as Promise<void>,
  },
  runtime: {
    ready: (report: RuntimeReadyReport) => ipcRenderer.invoke('runtime:ready', report) as Promise<void>,
    fail: (report: RuntimeFailureReport) => ipcRenderer.invoke('runtime:fail', report) as Promise<void>,
  },
  events: {
    onStateActivity: (listener) => subscribe<StateActivity>('state:activity', listener),
    onReminder: (listener) => subscribe<Reminder>('reminder:due', listener),
    onReminderCompose: (listener) => subscribe<void>('reminder:compose', listener),
    onStats: (listener) => subscribe<PetStats>('pet:stats', listener),
    onTypingStatus: (listener) => subscribe<TypingStatus>('typing:status', listener),
    onScreenshotDone: (listener) => subscribe<{ file: string; size: { width: number; height: number } }>('screenshot:done', listener),
    onScreenshotFailed: (listener) => subscribe<{ message: string }>('screenshot:failed', listener),
  },
  chat: {
    send: (content, handlers) => new Promise<void>((resolve, reject) => {
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const chunkListener = (_e: Electron.IpcRendererEvent, payload: { requestId: string; chunk: StreamChunk }) => {
        if (payload.requestId !== requestId) return;
        handlers.onChunk(payload.chunk);
      };
      const toolListener = (_e: Electron.IpcRendererEvent, payload: { requestId: string; name: string; args: Record<string, unknown>; result: { content: string; uiHint?: { kind: string; payload?: Record<string, unknown> } } }) => {
        if (payload.requestId !== requestId) return;
        handlers.onToolResult(payload.name, payload.args, payload.result);
      };
      const errorListener = (_e: Electron.IpcRendererEvent, payload: { requestId: string; message: string }) => {
        if (payload.requestId !== requestId) return;
        handlers.onError(payload.message);
      };
      const doneListener = (_e: Electron.IpcRendererEvent, payload: { requestId: string; sessionId: string }) => {
        if (payload.requestId !== requestId) return;
        ipcRenderer.removeListener('chat:chunk', chunkListener);
        ipcRenderer.removeListener('chat:tool-result', toolListener);
        ipcRenderer.removeListener('chat:error', errorListener);
        ipcRenderer.removeListener('chat:done', doneListener);
        handlers.onDone(payload.sessionId);
        resolve();
      };
      ipcRenderer.on('chat:chunk', chunkListener);
      ipcRenderer.on('chat:tool-result', toolListener);
      ipcRenderer.on('chat:error', errorListener);
      ipcRenderer.on('chat:done', doneListener);
      ipcRenderer.invoke('chat:send', { requestId, content }).catch((error) => {
        ipcRenderer.removeListener('chat:chunk', chunkListener);
        ipcRenderer.removeListener('chat:tool-result', toolListener);
        ipcRenderer.removeListener('chat:error', errorListener);
        ipcRenderer.removeListener('chat:done', doneListener);
        reject(error);
      });
    }),
    reset: () => ipcRenderer.invoke('chat:reset') as Promise<void>,
    getConfig: () => ipcRenderer.invoke('chat:config:get') as Promise<PublicAIConfig | null>,
    saveConfig: (patch: AIConfigPatch & { apiKey?: string }) => ipcRenderer.invoke('chat:config:save', patch) as Promise<PublicAIConfig>,
    listSessions: () => ipcRenderer.invoke('chat:sessions:list') as Promise<{ activeId: string | null; sessions: Array<{ id: string; createdAt: string; updatedAt: string; messageCount: number }> }>,
    switchSession: (id) => ipcRenderer.invoke('chat:sessions:switch', id) as Promise<boolean>,
    deleteSession: (id) => ipcRenderer.invoke('chat:sessions:delete', id) as Promise<boolean>,
    cancel: () => ipcRenderer.invoke('chat:cancel') as Promise<void>,
    getPersona: () => ipcRenderer.invoke('chat:get-persona') as Promise<{ displayName: string; welcomeTitle: string; welcomeSubtitle: string; inputPlaceholder: string }>,
  },
};

contextBridge.exposeInMainWorld('petAPI', api);
if (process.env.PET_E2E === '1') {
  contextBridge.exposeInMainWorld('__petE2E', {
    snapshot: () => ipcRenderer.invoke('runtime:e2e-snapshot'),
    quit: () => ipcRenderer.invoke('runtime:e2e-quit'),
  });
}

function currentRole(): 'pet' | 'dashboard' | 'reminder' | 'chat' | undefined {
  const pathname = window.location.pathname;
  if (pathname.includes('/pet_window/')) return 'pet';
  if (pathname.includes('/dashboard_window/')) return 'dashboard';
  if (pathname.includes('/reminder_window/')) return 'reminder';
  if (pathname.includes('/chat_window/')) return 'chat';
  return undefined;
}

function reportRendererFailure(message: string): void {
  const role = currentRole();
  if (!role) return;
  void ipcRenderer.invoke('runtime:renderer-failed', { role, message });
}

window.addEventListener('error', (event) => {
  reportRendererFailure(event.error instanceof Error ? event.error.stack || event.error.message : event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  reportRendererFailure(event.reason instanceof Error ? event.reason.stack || event.reason.message : String(event.reason));
});

window.addEventListener('DOMContentLoaded', () => {
  const role = currentRole();
  if (!role) {
    reportRendererFailure(`Cannot resolve renderer role from ${window.location.pathname}`);
    return;
  }
  window.setTimeout(() => {
    void ipcRenderer.invoke('runtime:renderer-ready', { role, bootstrapComplete: true });
  }, 0);
});
