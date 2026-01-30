import type { LLM, LLMCapability, LLMGenerateOptions, LLMMessage, LLMResponse, Model, PluginBase, PluginMetadata } from '@whisper-weave/plugin-sdk';

export interface ClaudeConfig {
  apiKey: string;
  baseUrl?: string;
}

export default class ClaudePlugin implements PluginBase, LLMCapability {
  public readonly metadata: PluginMetadata = {
    id: 'claude',
    name: 'Anthropic Claude',
    description: 'Claude AI models from Anthropic',
    version: '1.0.0',
  };

  public constructor(private readonly config: ClaudeConfig) {
    if (!this.config.apiKey) {
      throw new Error('Claude: apiKey is required');
    }
  }

  public async shutdown(): Promise<void> {}

  public getLLM(): LLM {
    return {
      getAvailableModels: (): Model[] => [
        {
          id: 'claude-3-5-sonnet-20241022',
          name: 'Claude 3.5 Sonnet',
          description: 'Most intelligent model',
          contextWindow: 200000,
          inputPricePerMToken: 3.0,
          outputPricePerMToken: 15.0,
        },
        {
          id: 'claude-3-5-haiku-20241022',
          name: 'Claude 3.5 Haiku',
          description: 'Fastest and most compact model',
          contextWindow: 200000,
          inputPricePerMToken: 0.8,
          outputPricePerMToken: 4.0,
        },
        {
          id: 'claude-3-opus-20240229',
          name: 'Claude 3 Opus',
          description: 'Most capable model',
          contextWindow: 200000,
          inputPricePerMToken: 15.0,
          outputPricePerMToken: 75.0,
        },
      ],

      generate: async (model: string, messages: LLMMessage[], _options?: LLMGenerateOptions): Promise<LLMResponse> => {
        const lastUser = messages.filter((m) => m.role === 'user').pop();
        const text = lastUser?.content ?? '';
        const imageCount = lastUser?.images?.length ?? 0;
        const imageNote = imageCount > 0 ? ` [${imageCount} image(s) attached]` : '';
        return {
          content: `[Claude mock - ${model}] You said: ${text}${imageNote}`,
          usage: { inputTokens: 0, outputTokens: 0 },
          finishReason: 'stop',
        };
      },

      streamGenerate: async (model: string, messages: LLMMessage[], onChunk: (content: string) => void, _options?: LLMGenerateOptions): Promise<LLMResponse> => {
        const lastUser = messages.filter((m) => m.role === 'user').pop();
        const text = lastUser?.content ?? '';
        const imageCount = lastUser?.images?.length ?? 0;
        const imageNote = imageCount > 0 ? ` [${imageCount} image(s) attached]` : '';
        const content = `[Claude mock stream - ${model}] You said: ${text}${imageNote}`;
        onChunk(content);
        return { content };
      },
    };
  }
}
