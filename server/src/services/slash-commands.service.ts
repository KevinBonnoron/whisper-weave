import type { SlashCommandContext, Tool, ToolContext } from '@whisper-weave/shared';
import { assistantRepository, pluginRepository } from '../repositories';
import type { PluginBase } from '../types';
import { hasConnector, hasLLM, hasTools } from '../utils';

interface InstanceEntry {
  id: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
  plugin: PluginBase;
}

/**
 * Handle slash commands from connectors
 * @param connectorId - The connector instance ID
 * @param context - The slash command context
 * @param plugins - Map of plugin instances
 * @param getToolsForActionIds - Function to get tools for action IDs
 */
export async function handleSlashCommand(connectorId: string, context: SlashCommandContext, plugins: Map<string, InstanceEntry>, getToolsForActionIds: (actionIds: string[]) => { tools: Tool[]; nameToInstanceId: Map<string, string> }): Promise<void> {
  const { commandName, options, reply } = context;

  if (commandName === 'help') {
    const lines = [
      '**Slash commands**',
      '',
      '`/model` — Show current LLM model and list of available models, or switch to another model.',
      '`/tools` — List active tools available to the assistant.',
      '`/skills` — List available skills.',
      '`/clear` — Delete message history in this channel (Discord only).',
      '`/help` — List available slash commands.',
    ];
    await reply(lines.join('\n'), true);
    return;
  }

  if (commandName === 'clear') {
    const channelId = context.channelId;
    if (!channelId) {
      await reply('This command must be run in a channel.', true);
      return;
    }

    const entry = plugins.get(connectorId);
    const connector = entry && hasConnector(entry.plugin) ? entry.plugin.getConnector() : null;
    if (!connector?.clearChannelHistory) {
      await reply('Clearing channel history is not supported by this connector.', true);
      return;
    }

    try {
      const result = await connector.clearChannelHistory(channelId);
      if ('error' in result) {
        await reply(result.error, true);
        return;
      }
      let msg = `Cleared ${result.deleted} message(s) in this channel.`;
      if (result.warning) msg += `\n\n${result.warning}`;
      await reply(msg, true);
    } catch (err) {
      await reply(`Failed to clear channel history: ${err instanceof Error ? err.message : String(err)}`, true);
    }
    return;
  }

  if (commandName === 'skills') {
    // Find skills plugin instance
    const skillsEntry = [...plugins.values()].find((e) => e.type === 'skills' && e.enabled && hasTools(e.plugin));
    if (!skillsEntry) {
      await reply('Skills plugin is not installed or enabled.', true);
      return;
    }

    try {
      const dummyContext: ToolContext = {
        userId: 'slash-command',
        channelId: 'slash-command',
        platform: 'slash-command',
        message: { id: '', platform: '', channelId: '', userId: '', username: '', content: '', timestamp: new Date() },
      };
      const listSkillsTool = skillsEntry.plugin.getTools().find((t) => t.name === 'list_skills');
      if (!listSkillsTool) {
        await reply('Skills plugin has no list_skills tool.', true);
        return;
      }
      const result = (await listSkillsTool.handler({}, dummyContext)) as { skills?: Array<{ id: string; title?: string }>; error?: string };
      if (result.error) {
        await reply(result.error, true);
        return;
      }
      const skills = result.skills ?? [];
      if (skills.length === 0) {
        await reply('No skills available.', true);
        return;
      }
      const lines = ['**Available skills**', ''];
      for (const s of skills) {
        const title = s.title ? ` — ${s.title}` : '';
        lines.push(`• \`${s.id}\`${title}`);
      }
      await reply(lines.join('\n'), true);
    } catch (err) {
      await reply(`Failed to list skills: ${err instanceof Error ? err.message : String(err)}`, true);
    }
    return;
  }

  if (commandName === 'tools') {
    const connectorRecord = await pluginRepository.getOne(connectorId);
    const assistantId = connectorRecord?.assistant;
    const assistant = assistantId ? await assistantRepository.getOne(assistantId) : null;
    if (!assistant) {
      await reply('No assistant is configured for this connector.', true);
      return;
    }

    const toolIds = Array.isArray(assistant.tools) ? (assistant.tools as string[]) : [];
    const { tools } = getToolsForActionIds(toolIds);

    if (tools.length === 0) {
      await reply('No active tools are configured for this assistant.', true);
      return;
    }

    const lines = ['**Active tools**', ''];
    for (const t of tools) {
      const params = t.parameters?.length ? ` (${t.parameters.map((p) => p.name).join(', ')})` : '';
      lines.push(`• \`${t.name}\`${params} — ${t.description ?? '—'}`);
    }
    await reply(lines.join('\n'), true);
    return;
  }

  if (commandName === 'model') {
    const connectorRecord2 = await pluginRepository.getOne(connectorId);
    const assistantId2 = connectorRecord2?.assistant;
    const assistant = assistantId2 ? await assistantRepository.getOne(assistantId2) : null;
    if (!assistant) {
      await reply('No assistant is configured for this connector.', true);
      return;
    }

    const providerId = assistant.llmProvider;
    const entry = providerId ? plugins.get(providerId) : null;
    const models = entry && hasLLM(entry.plugin) ? entry.plugin.getLLM().getAvailableModels() : null;
    const currentModel = assistant.llmModel ?? '—';

    const modelOption = options.model as string | undefined;

    if (!modelOption) {
      const lines = [`**Current model:** \`${currentModel}\``];
      if (models?.length) {
        lines.push('');
        lines.push('**Available models:**');
        for (const m of models) {
          const marker = m.id === currentModel ? ' ← current' : '';
          lines.push(`• \`${m.id}\` — ${m.name}${marker}`);
        }
      } else {
        lines.push('');
        lines.push('_No model list available for this provider._');
      }
      await reply(lines.join('\n'), true);
      return;
    }

    const validIds = models?.map((m) => m.id) ?? [];
    if (!validIds.includes(modelOption)) {
      await reply(`Unknown model \`${modelOption}\`. Use \`/model\` without arguments to see available models.`, true);
      return;
    }

    try {
      await assistantRepository.update(assistant.id, { llmModel: modelOption });
    } catch (err) {
      await reply(`Failed to update model: ${err instanceof Error ? err.message : String(err)}`, true);
      return;
    }

    const modelName = models?.find((m) => m.id === modelOption)?.name ?? modelOption;
    await reply(`Model switched to **${modelName}** (\`${modelOption}\`).`, true);
    return;
  }

  await reply(`Unknown command: ${commandName}`, true);
}
