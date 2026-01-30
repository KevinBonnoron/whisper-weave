import type { Connector, LLM, Message, Tool, ToolContext } from '@whisper-weave/shared';

export interface PluginMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  icon?: string;
}

export interface PluginBase {
  readonly metadata: PluginMetadata;
  shutdown(): Promise<void>;
}

export interface ConnectorCapability {
  getConnector(): Connector;
}

export interface LLMCapability {
  getLLM(): LLM;
}

export type ToolHandler = (input: Record<string, unknown>, context: ToolContext) => Promise<unknown>;

export interface ToolWithHandler extends Tool {
  handler: ToolHandler;
}

export interface ToolsCapability {
  getTools(): ToolWithHandler[];
  requestApproval?(tool: ToolWithHandler, input: Record<string, unknown>, context: ToolContext): Promise<boolean>;
}
