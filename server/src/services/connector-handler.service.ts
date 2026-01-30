import type { Attachment, ConversationMessage, LLMMessage, Message, Tool, ToolContext } from '@whisper-weave/shared';
import { logger } from '../lib/logger';
import { assistantMemoryRepository, assistantRepository, conversationRepository, pluginRepository } from '../repositories';
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

  const memoryFilter = `assistant = "${assistant.id}" && userId = "${message.userId}"`;
  const memory = await assistantMemoryRepository.getOrCreate({ assistant: assistant.id, userId: message.userId, entries: [] }, memoryFilter);
  const systemPromps = [assistant.systemPrompt?.trim()];
  if (memory) {
    const memoryBlock = memory.entries?.length > 0 ? `\n\nKnown facts about this user (use the "remember" tool to add or update):\n${memory.entries.map((e) => `- ${e.key}: ${e.value}`).join('\n')}` : '';
    systemPromps.push(memoryBlock);
  }

  let userContent = message.content;
  const incomingImageAttachments = message.attachments?.filter((a) => a.type === 'image' || String(a.type).startsWith('image/'));
  if (incomingImageAttachments?.length) {
    const urls = incomingImageAttachments.map((a) => a.url).join('\n');
    userContent = userContent.trim()
      ? `${userContent}\n\n[IMAGE URL(s) — You MUST pass one of these exact URLs as imageUrl when calling img2img or img2txt. Do NOT use example.com or any other placeholder.]\n${urls}`
      : `[User sent image(s). You MUST pass one of these exact URLs as imageUrl when calling img2img or img2txt. Do NOT use example.com or any placeholder.]\n${urls}`;
  }
  const messages: LLMMessage[] = [...(systemPromps.length ? [{ role: 'system' as const, content: systemPromps.filter(Boolean).join('') }] : []), { role: 'user' as const, content: userContent }];
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
  } finally {
    stopTyping();
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
