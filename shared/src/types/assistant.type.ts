import type { PluginBase } from './plugins.type';
import type { Expand } from './pocketbase.type';

export interface AssistantRecord extends Expand<{ llmProvider: PluginBase; tools: PluginBase[] }> {
  name: string;
  llmProvider: string;
  llmModel: string;
  tools: string[];
  systemPrompt?: string;
  isDefault?: boolean;
}
