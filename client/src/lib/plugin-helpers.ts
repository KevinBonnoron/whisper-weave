import type { PluginInstance } from '@whisper-weave/shared';

export function hasConnector(plugin: PluginInstance): boolean {
  return plugin.connected !== undefined;
}

export function hasLLMProvider(plugin: PluginInstance): boolean {
  return plugin.models !== undefined && plugin.models.length > 0;
}

export function hasTools(plugin: PluginInstance): boolean {
  return plugin.tools !== undefined && plugin.tools.length > 0;
}

export function filterConnectors(plugins: PluginInstance[]): PluginInstance[] {
  return plugins.filter(hasConnector);
}

export function filterLLMProviders(plugins: PluginInstance[]): PluginInstance[] {
  return plugins.filter(hasLLMProvider);
}

export function filterActions(plugins: PluginInstance[]): PluginInstance[] {
  return plugins.filter(hasTools);
}
