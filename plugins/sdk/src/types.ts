/**
 * Plugin SDK Types
 *
 * These types define the contract between Whisper Weave and external plugins.
 */

// ============================================================================
// Core Types (copied from shared to avoid circular dependencies)
// ============================================================================

export interface Attachment {
  type: string;
  url: string;
  filename: string;
  size?: number;
}

export interface Message {
  id: string;
  platform: string;
  channelId: string;
  userId: string;
  username: string;
  content: string;
  timestamp: Date;
  attachments?: Attachment[];
  replyTo?: string;
  subject?: string;
}

export interface SendMessageOptions {
  channelId: string;
  content: string;
  replyTo?: string;
  attachments?: Attachment[];
}

export interface SlashCommandContext {
  commandName: string;
  options: Record<string, string | number | boolean | undefined>;
  channelId?: string;
  reply: (content: string, ephemeral?: boolean) => Promise<void>;
}

export type ClearChannelHistoryResult = { deleted: number; warning?: string } | { error: string };

// ============================================================================
// LLM Types
// ============================================================================

export interface LLMImagePart {
  data: string;
  mediaType: string;
}

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  images?: LLMImagePart[];
  toolCallId?: string;
  toolName?: string;
  toolUses?: ToolUse[];
}

export interface ToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LLMResponse {
  content: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  finishReason?: string;
  toolUses?: ToolUse[];
}

export interface LLMGenerateOptions {
  temperature?: number;
  maxTokens?: number;
  tools?: Tool[];
}

export interface Model {
  id: string;
  name: string;
  description?: string;
  contextWindow?: number;
  inputPricePerMToken?: number;
  outputPricePerMToken?: number;
  capabilities?: string[];
}

// ============================================================================
// Tool Types
// ============================================================================

export interface ToolParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
  enum?: string[];
}

export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameter[];
  requiresApproval: boolean;
}

export interface ToolContext {
  userId: string;
  channelId: string;
  platform: string;
  message: Message;
  assistantId?: string;
}

export type ToolHandler = (input: Record<string, unknown>, context: ToolContext) => Promise<unknown>;

export interface ToolWithHandler extends Tool {
  handler: ToolHandler;
}

// ============================================================================
// Capability Interfaces
// ============================================================================

export interface Connector {
  platform: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  onMessage(callback: (message: Message) => void | Promise<void>): void;
  onSlashCommand?(callback: (context: SlashCommandContext) => Promise<void>): void;
  sendMessage?(options: SendMessageOptions): Promise<void>;
  sendTyping?(channelId: string): Promise<void>;
  clearChannelHistory?(channelId: string): Promise<ClearChannelHistoryResult>;
  sendError?(channelId: string, error: { message: string; code?: string }): Promise<void>;
}

export interface LLM {
  getAvailableModels(): Model[];
  generate(model: string, messages: LLMMessage[], options?: LLMGenerateOptions): Promise<LLMResponse>;
  streamGenerate?(
    model: string,
    messages: LLMMessage[],
    onChunk: (content: string) => void,
    options?: LLMGenerateOptions,
  ): Promise<LLMResponse>;
}

// ============================================================================
// Plugin Base & Capabilities
// ============================================================================

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

export interface ToolsCapability {
  getTools(): ToolWithHandler[];
  requestApproval?(tool: ToolWithHandler, input: Record<string, unknown>, context: ToolContext): Promise<boolean>;
}

// ============================================================================
// Plugin Constructor Type
// ============================================================================

export type PluginConstructor<TConfig = Record<string, unknown>> = new (config: TConfig) => PluginBase;
