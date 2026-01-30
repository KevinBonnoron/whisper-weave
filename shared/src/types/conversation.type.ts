import type { RecordModel } from './pocketbase.type';

/** Stored image attachment (base64). */
export type ConversationMessageImage = {
  data: string;
  mediaType: string;
};

/** Tool usage entry for debugging (role: 'tool'). */
export type ConversationToolUsage = {
  toolName: string;
  input: Record<string, unknown>;
  output: unknown;
  error?: string;
  durationMs?: number;
};

export type ConversationMessage = {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  created: string;
  /** Display name of the model that produced this message (assistant only). */
  modelName?: string;
  /** Image attachments (user messages). */
  images?: ConversationMessageImage[];
  /** Tool usage details (role: 'tool' only). */
  toolUsage?: ConversationToolUsage;
};

export interface ConversationRecord extends RecordModel {
  title: string;
  messages: ConversationMessage[];
  connectorId?: string;
  channelId?: string;
  /** Assistant used for this conversation (web UI). */
  assistant?: string;
}
