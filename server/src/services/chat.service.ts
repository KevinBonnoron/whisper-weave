import type { LLMMessage, LLMResponse, ToolContext } from '@whisper-weave/shared';
import { assistantRepository } from '../repositories';
import { serverPluginManager } from './plugin-manager.service';
import { type GenerateWithToolsResult, generateWithTools } from './tool-executor.service';

export interface ChatWithAssistantResponse extends LLMResponse {
  toolUsages?: GenerateWithToolsResult['toolUsages'];
}

export const chatService = {
  async generate(providerId: string, model: string, messages: LLMMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<LLMResponse> {
    return serverPluginManager.generateWithProvider(providerId, model, messages, options);
  },

  async generateWithAssistant(assistantId: string, messages: LLMMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<ChatWithAssistantResponse> {
    const assistant = await assistantRepository.getOne(assistantId);
    if (!assistant) {
      throw new Error(`Assistant not found: ${assistantId}`);
    }
    if (!assistant.llmProvider || !assistant.llmModel) {
      throw new Error('Assistant has no LLM provider or model configured');
    }

    const toolIds = Array.isArray(assistant.tools) ? (assistant.tools as string[]) : [];
    const { tools, nameToInstanceId } = serverPluginManager.getToolsForActionIds(toolIds);

    // Prepend system prompt if configured
    let finalMessages: LLMMessage[] = [...messages];
    if (assistant.systemPrompt?.trim()) {
      const hasSystemMessage = messages.length > 0 && messages[0].role === 'system';
      if (hasSystemMessage) {
        finalMessages = [{ role: 'system', content: `${assistant.systemPrompt}\n\n${messages[0].content}` }, ...messages.slice(1)];
      } else {
        finalMessages = [{ role: 'system', content: assistant.systemPrompt }, ...messages];
      }
    }

    const actionContext: ToolContext = {
      userId: 'web-ui',
      channelId: 'web-ui',
      platform: 'web',
      assistantId: assistant.id,
      message: {
        id: 'web-ui',
        platform: 'web',
        channelId: 'web-ui',
        userId: 'web-ui',
        username: 'user',
        content: '',
        timestamp: new Date(),
      },
    };

    const plugins = serverPluginManager.getPluginsMap();
    const result = await generateWithTools(assistant.llmProvider, assistant.llmModel, finalMessages, tools, nameToInstanceId, actionContext, plugins, options);

    return {
      ...result.response,
      toolUsages: result.toolUsages.length > 0 ? result.toolUsages : undefined,
    };
  },
};
