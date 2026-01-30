import type {
  LLM,
  LLMCapability,
  LLMGenerateOptions,
  LLMMessage,
  LLMResponse,
  Model,
  PluginBase,
  PluginMetadata,
  Tool,
  ToolUse,
} from '@whisper-weave/plugin-sdk';

export interface OllamaConfig {
  baseUrl?: string;
}

function toolToOllamaFormat(t: Tool): {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: { type: 'object'; properties: Record<string, { type: string; description?: string; enum?: string[] }>; required: string[] };
  };
} {
  const properties: Record<string, { type: string; description?: string; enum?: string[] }> = {};
  const required: string[] = [];
  for (const p of t.parameters ?? []) {
    properties[p.name] = { type: p.type, description: p.description };
    if (p.enum) properties[p.name]!.enum = p.enum;
    if (p.required) required.push(p.name);
  }
  return {
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: { type: 'object', properties, required },
    },
  };
}

function buildOllamaMessages(messages: LLMMessage[]): Array<{
  role: string;
  content: string;
  images?: string[];
  tool_calls?: Array<{ id?: string; function: { name: string; arguments: Record<string, unknown> } }>;
  tool_name?: string;
}> {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return { role: 'tool' as const, content: m.content, tool_name: m.toolName ?? undefined };
    }
    if (m.role === 'assistant' && m.toolUses?.length) {
      const tool_calls = m.toolUses.map((u) => ({
        id: u.id,
        function: { name: u.name, arguments: u.input as Record<string, unknown> },
      }));
      return { role: 'assistant' as const, content: m.content ?? '', tool_calls };
    }
    if (m.role === 'user' && m.images?.length) {
      return {
        role: 'user' as const,
        content: m.content ?? '',
        images: m.images.map((img) => img.data),
      };
    }
    return { role: m.role, content: m.content ?? '' };
  });
}

function parseToolCalls(message: { tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: Record<string, unknown> } }> }): ToolUse[] | undefined {
  const raw = message.tool_calls;
  if (!raw?.length) return undefined;
  return raw.map((tc, i) => ({
    id: tc.id ?? `call_${i}_${crypto.randomUUID().slice(0, 8)}`,
    name: tc.function?.name ?? 'unknown',
    input: (tc.function?.arguments as Record<string, unknown>) ?? {},
  }));
}

const TEXT_TOOL_CALL_PREFIX = '[TOOL_CALLS]';
const TEXT_TOOL_CALL_ARGS = '[ARGS]';

function parseTextFormatToolCalls(content: string): { cleanContent: string; toolUses: ToolUse[] } {
  const toolUses: ToolUse[] = [];
  const ranges: Array<{ start: number; end: number }> = [];

  for (let pos = 0; ; ) {
    const tagStart = content.indexOf(TEXT_TOOL_CALL_PREFIX, pos);
    if (tagStart === -1) break;

    const nameStart = tagStart + TEXT_TOOL_CALL_PREFIX.length;
    const argsTagStart = content.indexOf(TEXT_TOOL_CALL_ARGS, nameStart);
    if (argsTagStart === -1) break;

    const toolName = content.slice(nameStart, argsTagStart).trim();
    const jsonStart = argsTagStart + TEXT_TOOL_CALL_ARGS.length;
    const jsonEnd = content.indexOf(TEXT_TOOL_CALL_PREFIX, jsonStart);
    const jsonSlice = content.slice(jsonStart, jsonEnd === -1 ? undefined : jsonEnd).trim();

    let input: Record<string, unknown>;
    try {
      input = JSON.parse(jsonSlice) as Record<string, unknown>;
    } catch {
      pos = jsonStart;
      continue;
    }

    toolUses.push({
      id: `call_${toolUses.length}_${crypto.randomUUID().slice(0, 8)}`,
      name: toolName || 'unknown',
      input,
    });
    ranges.push({ start: tagStart, end: jsonEnd === -1 ? content.length : jsonEnd });
    pos = ranges[ranges.length - 1]!.end;
  }

  const cleanContent = removeRanges(content, ranges)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { cleanContent, toolUses };
}

function removeRanges(str: string, ranges: Array<{ start: number; end: number }>): string {
  let out = str;
  for (let i = ranges.length - 1; i >= 0; i--) {
    const { start, end } = ranges[i]!;
    out = out.slice(0, start) + out.slice(end);
  }
  return out;
}

const CACHE_TTL = 60_000;

export default class OllamaPlugin implements PluginBase, LLMCapability {
  public readonly metadata: PluginMetadata = {
    id: 'ollama',
    name: 'Ollama',
    description: 'Local LLM via Ollama API',
    version: '1.0.0',
  };
  private readonly baseUrl: string;
  private cachedModels: Model[] = [];
  private lastFetch = 0;

  public constructor(config: OllamaConfig) {
    this.baseUrl = config.baseUrl ?? 'http://localhost:11434';
  }

  public async shutdown(): Promise<void> {}

  public getLLM(): LLM {
    return {
      getAvailableModels: (): Model[] => {
        this.fetchModels().catch(() => {});
        return this.cachedModels;
      },

      generate: async (model: string, messages: LLMMessage[], options?: LLMGenerateOptions): Promise<LLMResponse> => {
        const url = `${this.baseUrl}/api/chat`;
        const ollamaMessages = buildOllamaMessages(messages);
        const supportsTools = this.modelSupportsTools(model);
        const toolsToSend = options?.tools?.length && supportsTools ? options.tools.map(toolToOllamaFormat) : undefined;

        const body = {
          model,
          messages: ollamaMessages,
          stream: false,
          ...(toolsToSend ? { tools: toolsToSend } : {}),
          options: {
            temperature: options?.temperature ?? 0.7,
            num_predict: options?.maxTokens ?? 4096,
          },
        };

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Ollama API error: ${res.status} ${text}`);
        }

        const data = (await res.json()) as {
          message?: {
            content?: string;
            tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: Record<string, unknown> } }>;
          };
          eval_count?: number;
          prompt_eval_count?: number;
          done?: boolean;
        };

        let content = data.message?.content ?? '';
        let toolUses = parseToolCalls(data.message ?? {});

        if (!toolUses?.length) {
          const parsed = parseTextFormatToolCalls(content);
          if (parsed.toolUses.length > 0) {
            content = parsed.cleanContent;
            toolUses = parsed.toolUses;
          }
        }

        return {
          content,
          usage: {
            inputTokens: data.prompt_eval_count,
            outputTokens: data.eval_count,
          },
          finishReason: data.done ? 'stop' : undefined,
          toolUses: toolUses ?? [],
        };
      },

      streamGenerate: async (model: string, messages: LLMMessage[], onChunk: (content: string) => void, options?: LLMGenerateOptions): Promise<LLMResponse> => {
        const url = `${this.baseUrl}/api/chat`;
        const ollamaMessages = buildOllamaMessages(messages);
        const body = {
          model,
          messages: ollamaMessages,
          stream: true,
          ...(options?.tools?.length && this.modelSupportsTools(model) ? { tools: options.tools.map(toolToOllamaFormat) } : {}),
          options: {
            temperature: options?.temperature ?? 0.7,
            num_predict: options?.maxTokens ?? 4096,
          },
        };

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Ollama API error: ${res.status} ${text}`);
        }

        const reader = res.body?.getReader();
        if (!reader) {
          throw new Error('Ollama: no response body');
        }

        const decoder = new TextDecoder();
        let fullContent = '';
        let buffer = '';
        let lastMessage: {
          content?: string;
          tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: Record<string, unknown> } }>;
        } = {};

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const obj = JSON.parse(line) as { message?: { content?: string; tool_calls?: typeof lastMessage.tool_calls } };
              if (obj.message) {
                lastMessage = { ...lastMessage, ...obj.message };
              }
              const content = obj.message?.content ?? '';
              if (content) {
                fullContent += content;
                onChunk(content);
              }
            } catch {}
          }
        }

        let content = fullContent;
        let toolUses = parseToolCalls(lastMessage);
        if (!toolUses?.length) {
          const parsed = parseTextFormatToolCalls(fullContent);
          if (parsed.toolUses.length > 0) {
            content = parsed.cleanContent;
            toolUses = parsed.toolUses;
          }
        }
        return { content, toolUses: toolUses ?? [] };
      },
    };
  }

  private capabilitiesCache = new Map<string, string[]>();

  private async checkModelSupportsTools(modelName: string): Promise<boolean> {
    const cached = this.cachedModels.find((m) => m.id === modelName);
    if (cached?.capabilities) {
      return cached.capabilities.includes('tools');
    }
    if (this.capabilitiesCache.has(modelName)) {
      return this.capabilitiesCache.get(modelName)!.includes('tools');
    }
    const capabilities = await this.fetchModelCapabilities(modelName);
    this.capabilitiesCache.set(modelName, capabilities);
    return capabilities.includes('tools');
  }

  private modelSupportsTools(modelName: string): boolean {
    const cached = this.cachedModels.find((m) => m.id === modelName);
    if (cached?.capabilities) {
      return cached.capabilities.includes('tools');
    }
    if (this.capabilitiesCache.has(modelName)) {
      return this.capabilitiesCache.get(modelName)!.includes('tools');
    }
    return true;
  }

  private async fetchModelCapabilities(modelName: string): Promise<string[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName }),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { capabilities?: string[] };
      return data.capabilities ?? [];
    } catch {
      return [];
    }
  }

  private async fetchModels(): Promise<Model[]> {
    const now = Date.now();
    if (this.cachedModels.length > 0 && now - this.lastFetch < CACHE_TTL) {
      return this.cachedModels;
    }

    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      if (!res.ok) {
        console.error('Ollama: failed to fetch models', res.status);
        return this.cachedModels.length > 0 ? this.cachedModels : [];
      }

      const data = (await res.json()) as { models?: Array<{ name: string; size?: number; details?: { parameter_size?: string } }> };
      if (!data.models) return [];

      const base = data.models.map((m) => ({
        id: m.name,
        name: m.name,
        description: `Ollama model${m.details?.parameter_size ? ` (${m.details.parameter_size})` : ''}`,
        contextWindow: 4096,
      }));

      const capabilities = await Promise.all(base.map((m) => this.fetchModelCapabilities(m.id)));
      this.cachedModels = base.map((m, i) => ({ ...m, capabilities: capabilities[i] }));
      this.lastFetch = now;
      return this.cachedModels;
    } catch (e) {
      console.error('Ollama: error fetching models', e instanceof Error ? e.message : String(e));
      return this.cachedModels.length > 0 ? this.cachedModels : [];
    }
  }
}
