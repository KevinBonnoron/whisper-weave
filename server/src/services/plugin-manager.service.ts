import type { LLMMessage, LLMResponse, Message, Model, PluginInstance, SlashCommandContext, Tool, ToolContext } from '@whisper-weave/shared';
import { logger } from '../lib/logger';
import { getExternalCatalogEntries, loadExternalPlugin } from '../lib/plugin-loader';
import type { PluginBase } from '../types';
import { hasConnector, hasLLM, hasTools, toTools } from '../utils';
import { handleConnectorMessage as handleConnectorMessageImpl } from './connector-handler.service';
import { handleSlashCommand as handleSlashCommandImpl } from './slash-commands.service';
import { generateWithTools as generateWithToolsImpl } from './tool-executor.service';

interface InstanceEntry {
  id: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
  plugin: PluginBase;
}

const plugins = new Map<string, InstanceEntry>();

/** Wrapper that calls the slash command service with plugin-manager dependencies */
async function handleSlashCommand(connectorId: string, context: SlashCommandContext): Promise<void> {
  return handleSlashCommandImpl(connectorId, context, plugins, getToolsForActionIds);
}

async function loadPlugin(type: string, config: Record<string, unknown>): Promise<PluginBase> {
  return loadExternalPlugin(type, config);
}

function toPluginInstance(entry: InstanceEntry): PluginInstance {
  const { id, type, name, config, enabled, plugin } = entry;
  const instance: PluginInstance = {
    id,
    type,
    name,
    enabled,
    config,
    metadata: plugin.metadata,
  };

  if (hasConnector(plugin)) {
    const connector = plugin.getConnector();
    instance.connected = connector.isConnected();
  }

  if (hasLLM(plugin)) {
    const llm = plugin.getLLM();
    instance.models = llm.getAvailableModels();
  }

  if (hasTools(plugin)) {
    instance.tools = toTools(plugin.getTools());
  }

  return instance;
}

function getToolsForActionIds(actionIds: string[]): { tools: Tool[]; nameToInstanceId: Map<string, string> } {
  const tools: Tool[] = [];
  const nameToInstanceId = new Map<string, string>();

  // Add tools from requested action plugins
  for (const id of actionIds) {
    const entry = plugins.get(id);
    if (!entry?.enabled) {
      continue;
    }

    if (hasTools(entry.plugin)) {
      const pluginTools = entry.plugin.getTools();
      // Strip handlers before passing to LLM
      tools.push(...toTools(pluginTools));
      for (const tool of pluginTools) {
        nameToInstanceId.set(tool.name, id);
      }
    }
  }

  return { tools, nameToInstanceId };
}

function getAllEnabledPluginWithToolIds(): string[] {
  const ids: string[] = [];
  for (const [id, entry] of plugins) {
    if (entry.enabled && hasTools(entry.plugin)) {
      ids.push(id);
    }
  }
  return ids;
}

export const serverPluginManager = {
  async addPlugin(type: string, config: Record<string, unknown>, instanceId?: string): Promise<PluginInstance> {
    const catalogEntry = getExternalCatalogEntries().find((e) => e.type === type);
    if (!catalogEntry) {
      throw new Error(`Plugin not found in catalog: ${type}`);
    }

    const id = instanceId ?? `${type}-${Date.now()}`;

    // If the same instance id already exists, unload it first so we don't leave an orphaned connector (e.g. two Discord clients = double messages).
    const existing = plugins.get(id);
    if (existing) {
      if (hasConnector(existing.plugin)) {
        const connector = existing.plugin.getConnector();
        if (connector.isConnected()) {
          await connector.disconnect();
        }
      }
      await existing.plugin.shutdown();
      plugins.delete(id);
    }

    const plugin = await loadPlugin(type, config);
    const entry: InstanceEntry = {
      id,
      type,
      name: catalogEntry.name,
      config,
      enabled: true,
      plugin,
    };

    plugins.set(id, entry);

    if (hasConnector(plugin)) {
      const connector = plugin.getConnector();
      connector.onMessage((message: Message) => {
        handleConnectorMessageImpl(entry, message, plugins, getToolsForActionIds).catch((err) => logger.error({ connectorId: id, error: (err as Error)?.message }, 'Connector reply failed'));
      });
      connector.onSlashCommand?.((context: SlashCommandContext) => handleSlashCommand(id, context));
      connector.connect().catch((err) => logger.error({ connectorId: id, error: (err as Error)?.message }, '[plugins] Connect failed'));
    }

    return toPluginInstance(entry);
  },

  async configurePlugin(instanceId: string, config: Record<string, unknown>): Promise<void> {
    const entry = plugins.get(instanceId);
    if (!entry) {
      throw new Error('Instance not found');
    }

    await entry.plugin.shutdown();
    entry.config = config;
    entry.plugin = await loadPlugin(entry.type, config);

    if (hasConnector(entry.plugin)) {
      const connector = entry.plugin.getConnector();
      connector.onMessage((message: Message) => {
        handleConnectorMessageImpl(entry, message, plugins, getToolsForActionIds).catch((err) => logger.error({ connectorId: instanceId, error: (err as Error)?.message }, 'Connector reply failed'));
      });
      connector.onSlashCommand?.((context: SlashCommandContext) => handleSlashCommand(instanceId, context));
      connector.connect().catch((err) => logger.error({ connectorId: instanceId, error: (err as Error)?.message }, '[plugins] Connect after configure failed'));
    }
  },

  async unloadPlugin(instanceId: string): Promise<void> {
    const entry = plugins.get(instanceId);
    if (!entry) {
      return;
    }

    if (hasConnector(entry.plugin)) {
      const connector = entry.plugin.getConnector();
      if (connector.isConnected()) {
        await connector.disconnect();
      }
    }

    await entry.plugin.shutdown();
    plugins.delete(instanceId);
  },

  toggleEnabled(instanceId: string): void {
    const entry = plugins.get(instanceId);
    if (!entry) {
      throw new Error('Instance not found');
    }

    entry.enabled = !entry.enabled;
  },

  async connectConnector(instanceId: string): Promise<void> {
    const entry = plugins.get(instanceId);
    if (!entry || !hasConnector(entry.plugin)) {
      throw new Error('Connector not found');
    }

    const connector = entry.plugin.getConnector();
    await connector.connect();
  },

  async disconnectConnector(instanceId: string): Promise<void> {
    const entry = plugins.get(instanceId);
    if (!entry || !hasConnector(entry.plugin)) {
      throw new Error('Connector not found');
    }

    const connector = entry.plugin.getConnector();
    await connector.disconnect();
  },

  getAllInstances(): PluginInstance[] {
    return [...plugins.values()].map(toPluginInstance);
  },

  getModelsForProvider(providerId: string): Model[] | null {
    const entry = plugins.get(providerId);
    if (!entry || !hasLLM(entry.plugin)) {
      return null;
    }

    return entry.plugin.getLLM().getAvailableModels();
  },

  async generateWithProvider(
    instanceId: string,
    model: string,
    messages: LLMMessage[],
    options?: {
      temperature?: number;
      maxTokens?: number;
      tools?: Tool[];
      toolNameToInstanceId?: Map<string, string>;
      actionContext?: ToolContext;
    },
  ): Promise<LLMResponse> {
    const entry = plugins.get(instanceId);
    if (!entry || !hasLLM(entry.plugin)) {
      throw new Error('LLM provider not found');
    }

    if (!entry.enabled) {
      throw new Error('LLM provider is disabled');
    }

    const llm = entry.plugin.getLLM();
    let { tools, toolNameToInstanceId, actionContext } = options ?? {};

    // Fallback for connector flow when tools weren't provided: use all enabled action plugins.
    if (actionContext != null && (!tools?.length || toolNameToInstanceId == null)) {
      const pluginIds = getAllEnabledPluginWithToolIds();
      if (pluginIds.length > 0) {
        const built = getToolsForActionIds(pluginIds);
        tools = built.tools;
        toolNameToInstanceId = built.nameToInstanceId;
      }
    }

    // In-app chat (Conversations): no actionContext passed, but we still add action tools so the LLM can use them.
    if (actionContext == null && (!tools?.length || toolNameToInstanceId == null)) {
      const pluginIds = getAllEnabledPluginWithToolIds();
      const { tools: actionTools, nameToInstanceId } = getToolsForActionIds(pluginIds);
      if (actionTools.length > 0) {
        tools = [...(tools ?? []), ...actionTools];
        toolNameToInstanceId = toolNameToInstanceId ?? new Map();
        for (const [name, id] of nameToInstanceId) {
          toolNameToInstanceId.set(name, id);
        }
        actionContext = {
          userId: 'web',
          channelId: 'web',
          platform: 'web',
          message: {
            id: 'web',
            platform: 'web',
            channelId: 'web',
            userId: 'web',
            username: 'user',
            content: '',
            timestamp: new Date(),
          },
        };
      }
    }

    if (tools?.length && toolNameToInstanceId != null && actionContext != null) {
      const result = await generateWithToolsImpl(instanceId, model, messages, tools, toolNameToInstanceId, actionContext, plugins, options);
      return result.response;
    }

    return llm.generate(model, messages, options);
  },

  getPluginEntry(instanceId: string): InstanceEntry | undefined {
    return plugins.get(instanceId);
  },

  getToolsForActionIds,

  getPluginsMap(): Map<string, InstanceEntry> {
    return plugins;
  },
};
