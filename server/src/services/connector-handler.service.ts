import type { Attachment, ConversationMessage, LLMMessage, Message, Tool, ToolContext } from '@whisper-weave/shared';
import { logger } from '../lib/logger';
import { assistantRepository, conversationRepository, pluginRepository } from '../repositories';
import type { PluginBase } from '../types';
import { hasConnector } from '../utils';
import { generateWithTools } from './tool-executor.service';

interface InstanceEntry {
  id: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
  plugin: PluginBase;
}

/** In-memory conversation context per connector+channel (not loaded from DB). Capped to avoid unbounded growth. */
const connectorConversationCache = new Map<string, LLMMessage[]>();
const MAX_CACHED_MESSAGES = 30;

/**
 * Handle incoming message from a connector
 * @param entry - The connector plugin instance
 * @param message - The incoming message
 * @param plugins - Map of plugin instances
 * @param getToolsForActionIds - Function to get tools for action IDs
 */
export async function handleConnectorMessage(entry: InstanceEntry, message: Message, plugins: Map<string, InstanceEntry>, getToolsForActionIds: (actionIds: string[]) => { tools: Tool[]; nameToInstanceId: Map<string, string> }): Promise<void> {
  if (!entry.enabled || !hasConnector(entry.plugin)) {
    return;
  }

  const connector = entry.plugin.getConnector();

  // Get assistant via the connector plugin's assistant field
  const connectorRecord = await pluginRepository.getOne(entry.id);
  const assistantId = connectorRecord?.assistant;
  const assistant = assistantId ? await assistantRepository.getOne(assistantId) : null;

  if (!assistant?.llmProvider || !assistant?.llmModel) {
    if (connector.sendMessage) {
      await connector
        .sendMessage({
          channelId: message.channelId,
          content: 'No assistant is configured for this bot. Configure one in the web UI (Assistants page).',
          replyTo: message.id,
        })
        .catch((err) => logger.error({ connectorId: entry.id, error: (err as Error)?.message }, 'Failed to send "no assistant" reply'));
    }
    return;
  }

  const toolIds = Array.isArray(assistant.tools) ? (assistant.tools as string[]) : [];
  const { tools, nameToInstanceId } = getToolsForActionIds(toolIds);

  const TYPING_INTERVAL_MS = 8_000;
  let typingInterval: ReturnType<typeof setInterval> | null = null;
  const stopTyping = () => {
    if (typingInterval !== null) {
      clearInterval(typingInterval);
      typingInterval = null;
    }
  };

  if (connector.sendTyping) {
    connector.sendTyping(message.channelId).catch(() => {});
    typingInterval = setInterval(() => {
      connector.sendTyping?.(message.channelId).catch(() => {});
    }, TYPING_INTERVAL_MS);
  }

  const systemPromps = [assistant.systemPrompt?.trim()];

  let userContent = message.content;
  const incomingImageAttachments = message.attachments?.filter((a) => a.type === 'image' || String(a.type).startsWith('image/'));
  if (incomingImageAttachments?.length) {
    const urls = incomingImageAttachments.map((a) => a.url).join('\n');
    userContent = userContent.trim()
      ? `${userContent}\n\n[IMAGE URL(s) — You MUST pass one of these exact URLs as imageUrl when calling img2img or img2txt. Do NOT use example.com or any other placeholder.]\n${urls}`
      : `[User sent image(s). You MUST pass one of these exact URLs as imageUrl when calling img2img or img2txt. Do NOT use example.com or any placeholder.]\n${urls}`;
  }

  const cacheKey = `${entry.id}:${message.channelId}`;
  let cached = connectorConversationCache.get(cacheKey) ?? [];
  if (cached.length > MAX_CACHED_MESSAGES) {
    cached = cached.slice(-MAX_CACHED_MESSAGES);
  }
  const newUserMessage: LLMMessage = { role: 'user', content: userContent };
  const messages: LLMMessage[] = [
    ...(systemPromps.length ? [{ role: 'system' as const, content: systemPromps.filter(Boolean).join('') }] : []),
    ...cached,
    newUserMessage,
  ];
  const actionContext: ToolContext = {
    userId: message.userId,
    channelId: message.channelId,
    platform: message.platform,
    message,
    assistantId: assistant.id,
  };

  let result;
  try {
    result = await generateWithTools(assistant.llmProvider, assistant.llmModel, messages, tools, nameToInstanceId, actionContext, plugins);
  } catch (err) {
    stopTyping();
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ connectorId: entry.id, channelId: message.channelId, error: errorMessage }, '[connector] LLM/tools failed');
    if (connector.sendError) {
      await connector.sendError(message.channelId, { message: errorMessage, code: 'llm_error' }).catch((sendErr) => logger.error({ connectorId: entry.id, error: (sendErr as Error)?.message }, 'Failed to send error to connector'));
    } else if (connector.sendMessage) {
      await connector
        .sendMessage({
          channelId: message.channelId,
          content: `Error: ${errorMessage}`,
          replyTo: message.id,
        })
        .catch((sendErr) => logger.error({ connectorId: entry.id, error: (sendErr as Error)?.message }, 'Failed to send error fallback'));
    }
    return;
  }

  const { response, toolUsages } = result;

  // Extract image URLs from tool results (e.g., ComfyUI image generation)
  const imageAttachments: Attachment[] = [];
  for (const usage of toolUsages) {
    const output = usage.output as Record<string, unknown> | undefined;
    if (output?.imageUrls && Array.isArray(output.imageUrls)) {
      for (const url of output.imageUrls) {
        if (typeof url === 'string') {
          // Try to extract filename from query params (ComfyUI uses ?filename=xxx)
          let filename = 'image.png';
          try {
            const urlObj = new URL(url);
            const filenameParam = urlObj.searchParams.get('filename');
            if (filenameParam) {
              filename = filenameParam;
            } else {
              // Fallback: extract from path
              const pathPart = urlObj.pathname.split('/').pop();
              if (pathPart && pathPart.includes('.')) {
                filename = pathPart;
              }
            }
          } catch {
            // Invalid URL, use default
          }
          imageAttachments.push({ type: 'image', url, filename });
        }
      }
    }
  }

  if (connector.sendMessage) {
    await connector.sendMessage({
      channelId: message.channelId,
      content: response.content,
      replyTo: message.id,
      ...(imageAttachments.length > 0 ? { attachments: imageAttachments } : {}),
    });
  }

  let nextCached = [...(connectorConversationCache.get(cacheKey) ?? []), newUserMessage, { role: 'assistant' as const, content: response.content }];
  if (nextCached.length > MAX_CACHED_MESSAGES) {
    nextCached = nextCached.slice(-MAX_CACHED_MESSAGES);
  }
  connectorConversationCache.set(cacheKey, nextCached);

  try {
    const conversations = await conversationRepository.findAll();
    const existing = conversations.find((r) => r.connectorId === entry.id && r.channelId === message.channelId);
    const userEntry: ConversationMessage = {
      id: message.id,
      role: 'user',
      content: message.content,
      created: (message.timestamp instanceof Date ? message.timestamp : new Date()).toISOString(),
    };

    // Create tool messages for debugging
    const toolMessages: ConversationMessage[] = toolUsages.map((usage, idx) => ({
      id: `tool-${message.id}-${idx}`,
      role: 'tool' as const,
      content: usage.error ?? (typeof usage.output === 'string' ? usage.output : JSON.stringify(usage.output)),
      created: new Date().toISOString(),
      toolUsage: usage,
    }));

    const assistantEntry: ConversationMessage = {
      id: `assistant-${message.id}`,
      role: 'assistant',
      content: response.content,
      created: new Date().toISOString(),
    };

    const newMessages = [userEntry, ...toolMessages, assistantEntry];

    if (existing) {
      const nextMessages = [...(existing.messages ?? []), ...newMessages];
      await conversationRepository.update(existing.id, { messages: nextMessages });
    } else {
      const defaultTitle = `${connector.platform} (${message.channelId})`;
      const title = message.subject ?? defaultTitle;
      await conversationRepository.create({
        title,
        messages: newMessages,
        connectorId: entry.id,
        channelId: message.channelId,
      });
    }
  } catch (err) {
    logger.error({ connectorId: entry.id, channelId: message.channelId, error: err instanceof Error ? err.message : err }, '[connector] Failed to persist conversation');
  }
}
