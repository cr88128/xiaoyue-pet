import type { ToolDefinition } from '../llm-client';
import { translateTool } from './translate';
import { setReminderTool } from './set-reminder';
import { changeStateTool } from './change-state';
import { noteTool } from './note';
import { musicControlTool } from './music-control';
import { stockQueryTool } from './stock-query';
import { webSearchTool } from './web-search';
import { screenshotTool } from './screenshot';
import type { RegisteredTool, ToolContext, ToolExecutionResult } from './types';

export const ALL_TOOLS: RegisteredTool[] = [
  setReminderTool,
  changeStateTool,
  translateTool,
  noteTool,
  musicControlTool,
  stockQueryTool,
  webSearchTool,
  screenshotTool,
];

export function getActiveToolDefinitions(config: {
  enabledTools: string[];
  enableTranslation: boolean;
  enableWebSearch: boolean;
  enableStockQuery: boolean;
  enableMusicControl: boolean;
  enableScreenshot: boolean;
}): ToolDefinition[] {
  return ALL_TOOLS
    .filter((tool) => !tool.isEnabled || tool.isEnabled(config))
    .map((tool) => tool.definition);
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolExecutionResult | null> {
  const tool = ALL_TOOLS.find((item) => item.definition.function.name === name);
  if (!tool) return null;
  return tool.execute(args, ctx);
}

export type { RegisteredTool, ToolContext, ToolExecutionResult };