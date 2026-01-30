import type { PluginBase, PluginMetadata, ToolsCapability, ToolWithHandler } from '../types';
import type { ToolContext } from '@whisper-weave/shared';
import { assistantMemoryRepository } from '../repositories';
import { logger } from '../lib/logger';
import type { MemoryEntry } from '../types';

export interface AssistantPluginConfig {
  // No config needed for now, but we keep the interface for future extensions
}

/**
 * Assistant plugin provides tools for managing assistant memory and capabilities.
 * Currently includes the "remember" tool for storing user-specific facts.
 */
export class AssistantPlugin implements PluginBase, ToolsCapability {
  public readonly metadata: PluginMetadata = {
    id: 'assistant',
    name: 'Assistant Tools',
    description: 'Built-in tools for assistant memory and capabilities',
    version: '1.0.0',
    author: 'Whisper Weave',
  };

  public constructor(private readonly config: AssistantPluginConfig) {}

  public async shutdown(): Promise<void> {}

  public getTools(): ToolWithHandler[] {
    return [
      {
        name: 'remember',
        description: 'Store or update a fact about this user for future conversations. Use for preferences, name, or any persistent detail they share.',
        parameters: [
          { name: 'key', type: 'string', description: 'Short label for the fact (e.g. preferred_name, favorite_color)', required: true },
          { name: 'value', type: 'string', description: 'The value to remember', required: true },
        ],
        requiresApproval: false,
        handler: async (input, context) => this.handleRemember(input, context),
      },
    ];
  }

  private async handleRemember(input: Record<string, unknown>, context: ToolContext): Promise<unknown> {
    // Validate required context
    if (!context.assistantId) {
      return { error: 'Remember tool requires an assistant context' };
    }

    // Validate input
    if (typeof input.key !== 'string' || typeof input.value !== 'string') {
      return { error: 'Both key and value must be strings' };
    }

    const key = input.key.trim();
    const value = input.value.trim();

    if (!key || !value) {
      return { error: 'Key and value cannot be empty' };
    }

    try {
      const { assistantId, userId } = context;
      const filter = `assistant = "${assistantId}" && userId = "${userId}"`;
      const existing = await assistantMemoryRepository.findOne(filter);
      const now = new Date().toISOString();

      // Get existing entries or initialize empty array
      const entries: MemoryEntry[] = Array.isArray(existing?.entries) ? [...existing.entries] : [];

      // Find existing entry with the same key
      const idx = entries.findIndex((e) => e.key === key);
      const newEntry: MemoryEntry = { key, value, updatedAt: now };

      if (idx >= 0) {
        // Update existing entry
        entries[idx] = newEntry;
      } else {
        // Add new entry
        entries.push(newEntry);
      }

      // Upsert memory record
      await assistantMemoryRepository.upsert(
        filter,
        existing
          ? { entries }
          : {
              assistant: assistantId,
              userId,
              entries,
            },
      );

      logger.debug({ assistantId, userId, key, value }, '[assistant-plugin] Memory updated');

      return {
        success: true,
        message: `Remembered: ${key} = ${value}`,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ error: errorMessage, input, context }, '[assistant-plugin] Failed to save memory');

      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}
