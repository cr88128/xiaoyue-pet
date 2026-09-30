import type { RegisteredTool, ToolExecutionResult } from './types';

const LANG_NAMES: Record<string, string> = {
  zh: '简体中文',
  en: '英语',
  ja: '日语',
  ko: '韩语',
  fr: '法语',
  de: '德语',
  es: '西班牙语',
  ru: '俄语',
};

export const translateTool: RegisteredTool = {
  definition: {
    type: 'function',
    function: {
      name: 'translate',
      description: '把文本翻译成指定语言。中英日韩法德西俄。',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '要翻译的文本' },
          target_lang: { type: 'string', enum: Object.keys(LANG_NAMES), description: '目标语言代码' },
        },
        required: ['text', 'target_lang'],
      },
    },
  },

  async execute(args): Promise<ToolExecutionResult> {
    const text = String(args.text ?? '').slice(0, 2000);
    const target = String(args.target_lang ?? 'en');
    const targetName = LANG_NAMES[target] ?? target;

    let translated = '';
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(text)}`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (resp.ok) {
        const data = (await resp.json()) as Array<Array<Array<string | null>>>;
        translated = (data[0] ?? []).map((pair) => String(pair[0] ?? '')).join('');
      }
    } catch {
      translated = '';
    }

    if (!translated) {
      return {
        content: `翻译失败：Google Translate 镜像不可用，源文本：「${text.slice(0, 200)}」`,
        uiHint: { kind: 'translation', payload: { text, target, error: true } },
      };
    }

    return {
      content: `已翻译成${targetName}：${translated}`,
      uiHint: { kind: 'translation', payload: { text, target, translated } },
    };
  },

  isEnabled(config) {
    return config.enableTranslation;
  },
};