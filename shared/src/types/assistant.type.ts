import type { PluginBase } from './plugins.type';
import type { Expand } from './pocketbase.type';

export interface AssistantRecord extends Expand<{ llmProvider: PluginBase; tools: PluginBase[] }> {
  name: string;
  isDefault?: boolean;
  memoryEnabled?: boolean;
  llmProvider: string;
  llmModel: string;
  systemPrompt?: string;
  tools: string[];
}
