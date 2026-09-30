import type { RegisteredTool, ToolExecutionResult } from './types';

interface SearchResult {
  title: string;
  url: string;
  content: string;
}

async function tavilySearch(query: string, apiKey: string): Promise<SearchResult[] | null> {
  try {
    const resp = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        max_results: 5,
        include_answer: false,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { results?: Array<{ title: string; url: string; content: string }> };
    return (data.results ?? []).map((item) => ({ title: item.title, url: item.url, content: item.content }));
  } catch {
    return null;
  }
}

export const webSearchTool: RegisteredTool = {
  definition: {
    type: 'function',
    function: {
      name: 'web_search',
      description: '搜索网页获取最新信息。需要 TAVILY_API_KEY 环境变量。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
        },
        required: ['query'],
      },
    },
  },

  async execute(args): Promise<ToolExecutionResult> {
    const query = String(args.query ?? '').trim();
    if (!query) return { content: '缺少 query', uiHint: { kind: 'info' } };
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return {
        content: '未设置 TAVILY_API_KEY 环境变量，无法联网搜索',
        uiHint: { kind: 'info' },
      };
    }
    const results = await tavilySearch(query, apiKey);
    if (!results || results.length === 0) {
      return { content: `没搜到「${query}」的结果`, uiHint: { kind: 'info' } };
    }
    const summary = results.map((item, i) => `${i + 1}. ${item.title}\n${item.content.slice(0, 200)}\n${item.url}`).join('\n\n');
    return {
      content: `搜索「${query}」找到 ${results.length} 条结果：\n\n${summary}`,
      uiHint: { kind: 'search', payload: { query, results } },
    };
  },

  isEnabled(config) {
    return config.enableWebSearch;
  },
};