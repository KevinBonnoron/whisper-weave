import type { ConversationToolUsage, LLMMessage, LLMResponse, Tool, ToolContext, ToolUse } from '@whisper-weave/shared';
import { logger } from '../lib/logger';
import type { PluginBase } from '../types';
import { hasLLM, hasTools } from '../utils';

interface InstanceEntry {
  id: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
  plugin: PluginBase;
}

export interface GenerateWithToolsResult {
  response: LLMResponse;
  toolUsages: ConversationToolUsage[];
}

const MAX_TOOL_LOOP_ITERATIONS = 10;

/**
 * Execute a tool from a plugin instance
 * @param instanceId - The plugin instance ID
 * @param toolUse - The tool use object from LLM
 * @param context - The tool execution context
 * @param plugins - Map of plugin instances
 */
export async function executeTool(instanceId: string, toolUse: ToolUse, context: ToolContext, plugins: Map<string, InstanceEntry>): Promise<unknown> {
  const entry = plugins.get(instanceId);
  if (!entry || !hasTools(entry.plugin)) {
    throw new Error(`Plugin with tools not found: ${instanceId}`);
  }

  const tool = entry.plugin.getTools().find((t) => t.name === toolUse.name);
  if (!tool) {
    throw new Error(`Tool not found: ${toolUse.name}`);
  }

  if (entry.plugin.requestApproval) {
    const approved = await entry.plugin.requestApproval(tool, toolUse.input, context);
    if (!approved) {
      return { error: 'Action was not approved' };
    }
  }

  return tool.handler(toolUse.input, context);
}

/**
 * Generate LLM response with tool use loop
 * @param providerId - The LLM provider plugin instance ID
 * @param model - The model to use
 * @param messages - The conversation messages
 * @param tools - Available tools for the LLM
 * @param nameToInstanceId - Map of tool names to plugin instance IDs
 * @param actionContext - The tool execution context
 * @param plugins - Map of plugin instances
 * @param options - Generation options (temperature, maxTokens)
 */
export async function generateWithTools(providerId: string, model: string, messages: LLMMessage[], tools: Tool[], nameToInstanceId: Map<string, string>, actionContext: ToolContext, plugins: Map<string, InstanceEntry>, options?: { temperature?: number; maxTokens?: number }): Promise<GenerateWithToolsResult> {
  const providerEntry = plugins.get(providerId);
  if (!providerEntry?.enabled || !hasLLM(providerEntry.plugin)) {
    throw new Error('LLM provider not found or disabled');
  }

  const llm = providerEntry.plugin.getLLM();
  let currentMessages = [...messages];
  const genOptions = { ...options, tools: tools.length > 0 ? tools : undefined };
  const toolUsages: ConversationToolUsage[] = [];

  logger.debug({ providerId, model, toolCount: tools.length, toolNames: tools.map((t) => t.name) }, '[generate] Starting generation with tools');

  for (let iter = 0; iter < MAX_TOOL_LOOP_ITERATIONS; iter++) {
    const response = await llm.generate(model, currentMessages, genOptions);
    if (!response.toolUses?.length) {
      return { response, toolUsages };
    }

    const assistantTurn: LLMMessage = {
      role: 'assistant',
      content: response.content ?? '',
      toolUses: response.toolUses,
    };
    currentMessages = [...currentMessages, assistantTurn];

    for (const toolUse of response.toolUses) {
      let result: unknown;
      let error: string | undefined;
      const startTime = Date.now();
      const instanceId = nameToInstanceId.get(toolUse.name);
      logger.debug(
        {
          toolName: toolUse.name,
          toolCallId: toolUse.id,
          input: toolUse.input,
          instanceId: instanceId ?? null,
          iteration: iter + 1,
        },
        '[tool] Invoking',
      );

      if (!instanceId) {
        result = { error: `Unknown tool: ${toolUse.name}` };
        error = `Unknown tool: ${toolUse.name}`;
      } else {
        try {
          result = await executeTool(instanceId, toolUse, actionContext, plugins);
        } catch (err) {
          // Try to extract and parse JSON from error message for better logging
          let errorData: unknown = err instanceof Error ? err.message : err;
          if (typeof errorData === 'string') {
            // Extract JSON from messages like "ComfyUI /prompt failed (400): {...}"
            const jsonMatch = errorData.match(/: (\{.+\})$/);
            if (jsonMatch && jsonMatch[1]) {
              try {
                const parsed = JSON.parse(jsonMatch[1]);
                const messagePrefix = errorData.substring(0, errorData.indexOf(': {'));
                errorData = { message: messagePrefix, details: parsed };
              } catch {
                // Keep original if parse fails
              }
            }
          }
          logger.error({ toolName: toolUse.name, error: errorData }, '[connector] Action failed');
          error = err instanceof Error ? err.message : 'Tool execution failed';
          result = {
            success: false,
            error,
            message: `The tool "${toolUse.name}" encountered a technical error. Please inform the user that there was a problem and suggest they try again later.`,
          };
        }
      }

      const durationMs = Date.now() - startTime;
      const content = typeof result === 'string' ? result : JSON.stringify(result);
      const outputSummary = typeof result === 'string' ? { type: 'string' as const, length: result.length } : result !== null && typeof result === 'object' ? { type: 'object' as const, keys: Object.keys(result as object) } : { type: typeof result };

      logger.debug(
        {
          toolName: toolUse.name,
          toolCallId: toolUse.id,
          durationMs,
          error: error ?? null,
          outputSummary,
        },
        '[tool] Result',
      );

      toolUsages.push({
        toolName: toolUse.name,
        input: toolUse.input,
        output: result,
        error,
        durationMs,
      });

      currentMessages.push({
        role: 'tool',
        content,
        toolCallId: toolUse.id,
        toolName: toolUse.name,
      });
    }
  }

  const finalResponse = await llm.generate(model, currentMessages, { ...options, tools: undefined });
  return { response: finalResponse, toolUsages };
}
