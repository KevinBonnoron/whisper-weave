import type { ConversationToolUsage } from '@whisper-weave/shared';
import { universalClient, withDelegate, withMethods } from 'universal-client';
import { config } from '@/lib/config';

interface ChatMessageImage {
  data: string;
  mediaType: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: ChatMessageImage[];
}

interface ChatResponse {
  content: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  finishReason?: string;
  toolUsages?: ConversationToolUsage[];
}

export const chatClient = universalClient(
  withDelegate({ type: 'http', impl: 'fetch', baseURL: config.api.url }),
  withMethods(({ delegate }) => ({
    sendChat: (assistantId: string, messages: ChatMessage[], options?: { temperature?: number; maxTokens?: number }) =>
      delegate.post<ChatResponse>('/chat', {
        assistantId,
        messages,
        ...(options?.temperature !== undefined && { temperature: options.temperature }),
        ...(options?.maxTokens !== undefined && { maxTokens: options.maxTokens }),
      }),
  })),
);
