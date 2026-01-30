import type { RecordModel } from './pocketbase.type';

export interface PluginMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  icon?: string;
}

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
  /** Optional system prompt sent by the connector (e.g. Avatrr chat frame). Merged with assistant system prompt when calling the LLM. */
  systemPrompt?: string;
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
  /** Channel where the command was run (e.g. Discord channel id). Used to target the current conversation. */
  channelId?: string;
  reply: (content: string, ephemeral?: boolean) => Promise<void>;
}

/** Result of clearing message history in a channel (e.g. Discord). */
export type ClearChannelHistoryResult = { deleted: number; warning?: string } | { error: string };

export interface Connector {
  platform: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  onMessage(callback: (message: Message) => void | Promise<void>): void;
  onSlashCommand?(callback: (context: SlashCommandContext) => Promise<void>): void;
  sendMessage?(options: SendMessageOptions): Promise<void>;
  sendTyping?(channelId: string): Promise<void>;
  /** Notify the channel of an error (e.g. LLM failure). Optional; used by connectors that support error frames (e.g. Avatrr). */
  sendError?(channelId: string, error: { message: string; code?: string }): Promise<void>;
  /** Clear message history in the channel (e.g. delete messages in Discord). Optional; not all connectors support it. */
  clearChannelHistory?(channelId: string): Promise<ClearChannelHistoryResult>;
}

/** Base64-encoded image for vision inputs. */
export interface LLMImagePart {
  data: string;
  mediaType: string;
}

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  /** Images attached to this message (user messages only; base64 data). */
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

export interface LLM {
  getAvailableModels(): Model[];
  generate(model: string, messages: LLMMessage[], options?: LLMGenerateOptions): Promise<LLMResponse>;
  streamGenerate?(model: string, messages: LLMMessage[], onChunk: (content: string) => void, options?: LLMGenerateOptions): Promise<LLMResponse>;
}

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
  /** Set when handling a connector message; used by built-in tools (e.g. remember). */
  assistantId?: string;
}

export interface PluginConfigField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'secret' | 'string-list' | 'select' | 'oauth' | 'record';
  label: string;
  description?: string;
  required?: boolean;
  default?: string | number | boolean | string[];
  placeholder?: string;
  /** Options for select type */
  options?: Array<{ value: string; label: string }>;
  /** Fixed keys for record type (rendered as tabs with a textarea per key) */
  keys?: Array<{ value: string; label: string }>;
  /** Conditional visibility based on another field's value */
  showIf?: { field: string; equals: string | number | boolean };
  /** OAuth provider configuration (for oauth type) */
  oauth?: {
    provider: 'google';
    clientIdField: string;
    clientSecretField: string;
  };
}

export interface CatalogEntry {
  id: string;
  type: string;
  name: string;
  description: string;
  icon?: string;
  features: Array<'connector' | 'tools' | 'llm-provider'>;
  configSchema?: PluginConfigField[];
}

export interface PluginInstance {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
  metadata: PluginMetadata;
  connected?: boolean;
  models?: Model[];
  tools?: Tool[];
}

export interface GetPluginsResponse {
  instances: PluginInstance[];
  catalog: CatalogEntry[];
}

export interface PluginRecord extends RecordModel {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
  /** Assistant linked to this connector plugin (connectors only). */
  assistant?: string;
}

/** Alias for relation fields that reference a plugin record (e.g. assistant.connector). */
export type PluginBase = PluginRecord;
