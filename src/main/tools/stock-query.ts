import type { RegisteredTool, ToolExecutionResult } from './types';

interface SinaQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
}

async function fetchQuote(symbol: string): Promise<SinaQuote | null> {
  // 新浪财经行情，支持 A 股 sh/sz 前缀、港股 rt_hk、美股 gb_
  let sinaSymbol = symbol.toLowerCase();
  if (/^\d{6}$/.test(sinaSymbol)) {
    sinaSymbol = sinaSymbol.startsWith('6') || sinaSymbol.startsWith('5') || sinaSymbol.startsWith('9') ? `sh${sinaSymbol}` : `sz${sinaSymbol}`;
  } else if (/^\d{4,5}\.hk$/i.test(sinaSymbol)) {
    sinaSymbol = `rt_hk${sinaSymbol.replace(/\.hk$/i, '')}`;
  } else if (/^[a-z]+\d*$/i.test(sinaSymbol)) {
    sinaSymbol = `gb_${sinaSymbol.toLowerCase()}`;
  }

  try {
    const url = `https://hq.sinajs.cn/list=${sinaSymbol}`;
    const resp = await fetch(url, {
      headers: {
        Referer: 'https://finance.sina.com.cn',
        'User-Agent': 'Mozilla/5.0',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const text = await resp.text();
    const m = text.match(/="([^"]+)"/);
    if (!m || !m[1]) return null;
    const parts = m[1].split(',');
    if (parts.length < 4) return null;
    const name = String(parts[0] ?? '');
    const open = Number(parts[1]);
    const prevClose = Number(parts[2]);
    const price = Number(parts[3]);
    const high = Number(parts[4]);
    const low = Number(parts[5]);
    const change = price - prevClose;
    const changePercent = prevClose === 0 ? 0 : (change / prevClose) * 100;
    return {
      symbol,
      name,
      price,
      change,
      changePercent,
      open,
      high,
      low,
      prevClose,
    };
  } catch {
    return null;
  }
}

export const stockQueryTool: RegisteredTool = {
  definition: {
    type: 'function',
    function: {
      name: 'stock_query',
      description: '查询股票/股票/股票实时行情。支持 A 股代码（600000、000001）、港股（0700.HK）、美股（AAPL）。',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: '股票代码或 ticker，例如「600000」「0700.HK」「AAPL」' },
        },
        required: ['symbol'],
      },
    },
  },

  async execute(args): Promise<ToolExecutionResult> {
    const symbol = String(args.symbol ?? '').trim();
    if (!symbol) return { content: '缺少 symbol', uiHint: { kind: 'info' } };
    const quote = await fetchQuote(symbol);
    if (!quote) {
      return {
        content: `查不到 ${symbol} 的行情。检查代码是否正确、当前是否是否休市。`,
        uiHint: { kind: 'info' },
      };
    }
    const arrow = quote.change >= 0 ? '🔴' : '🟢';
    return {
      content: `${arrow} ${quote.name}(${symbol}) 现价 ${quote.price.toFixed(2)} 涨跌 ${quote.change.toFixed(2)} (${quote.changePercent.toFixed(2)}%)\n今开 ${quote.open.toFixed(2)} 最高 ${quote.high.toFixed(2)} 最低 ${quote.low.toFixed(2)} 昨收 ${quote.prevClose.toFixed(2)}`,
      uiHint: { kind: 'stock', payload: quote as unknown as Record<string, unknown> },
    };
  },

  isEnabled(config) {
    return config.enableStockQuery;
  },
};