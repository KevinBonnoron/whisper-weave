import type { Tool } from '@whisper-weave/shared';
import type { ConnectorCapability, LLMCapability, PluginBase, ToolsCapability, ToolWithHandler } from '../types/plugin-system';

export function hasConnector(plugin: PluginBase): plugin is PluginBase & ConnectorCapability {
  return 'getConnector' in plugin;
}

export function hasTools(plugin: PluginBase): plugin is PluginBase & ToolsCapability {
  return 'getTools' in plugin;
}

export function hasLLM(plugin: PluginBase): plugin is PluginBase & LLMCapability {
  return 'getLLM' in plugin;
}

/** Strip handler from ToolWithHandler for serialization (e.g., sending to LLM). */
export function toTool(tool: ToolWithHandler): Tool {
  const { handler: _, ...rest } = tool;
  return rest;
}

/** Strip handlers from an array of ToolWithHandler. */
export function toTools(tools: ToolWithHandler[]): Tool[] {
  return tools.map(toTool);
}

export function normalizeUrl(url: string, defaultUrl?: string): string {
  return url.trim().replace(/\/+$/, '') ?? defaultUrl;
}
