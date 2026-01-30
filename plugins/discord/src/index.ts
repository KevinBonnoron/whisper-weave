import type { Connector, ConnectorCapability, Message, PluginBase, PluginMetadata, SendMessageOptions, SlashCommandContext } from '@whisper-weave/plugin-sdk';
import { ChannelType, Client, GatewayIntentBits, MessageFlags, Partials, REST, Routes, SlashCommandBuilder, type TextChannel } from 'discord.js';

const SLASH_COMMANDS_DEFINITIONS = [
  new SlashCommandBuilder()
    .setName('model')
    .setDescription('Show current LLM model or switch to another model')
    .addStringOption((opt) => opt.setName('model').setDescription('Model ID to switch to').setRequired(false))
    .toJSON(),
  new SlashCommandBuilder().setName('tools').setDescription('List active tools available to the assistant').toJSON(),
  new SlashCommandBuilder().setName('skills').setDescription('List available skills').toJSON(),
  new SlashCommandBuilder().setName('clear').setDescription('Delete message history in this channel').toJSON(),
  new SlashCommandBuilder().setName('help').setDescription('List available slash commands').toJSON(),
];

export interface DiscordConfig {
  botToken: string;
  allowedChannels?: string[];
}

export default class implements PluginBase, ConnectorCapability {
  public readonly metadata: PluginMetadata = {
    id: 'discord',
    name: 'Discord',
    description: 'Connect to Discord servers and channels',
    version: '1.0.0',
  };

  private readonly client: Client;
  private readonly messageCallbacks: Array<(message: Message) => void | Promise<void>> = [];
  private readonly slashCommandCallbacks: Array<(context: SlashCommandContext) => Promise<void>> = [];
  private _connected = false;

  public constructor(private readonly config: DiscordConfig) {
    if (!config.botToken) {
      throw new Error('Discord: botToken is required');
    }

    this.client = new Client({
      intents: [GatewayIntentBits.DirectMessages, GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
      partials: [Partials.Channel],
    });

    this.client.on('messageCreate', async (msg) => {
      if (msg.author.bot) return;

      const isDM = msg.channel.type === ChannelType.DM;
      if (!isDM && this.config.allowedChannels?.length && !this.config.allowedChannels.includes(msg.channelId)) {
        return;
      }

      const botUser = this.client.user;
      const mentioned = Boolean(botUser && msg.mentions.has(botUser));
      const contentIncludesBotName = botUser && Boolean(msg.content.trim().length > 0) && msg.content.toLowerCase().includes(botUser.username.toLowerCase());
      if (!isDM && !mentioned && !contentIncludesBotName) return;

      const attachments = [...msg.attachments.values()].map((a) => ({
        type: a.contentType?.startsWith('image/') ? 'image' : (a.contentType ?? 'application/octet-stream'),
        url: a.url,
        filename: a.name ?? 'attachment',
      }));

      const message: Message = {
        id: msg.id,
        platform: 'discord',
        channelId: msg.channelId,
        userId: msg.author.id,
        username: msg.author.username,
        content: msg.content,
        timestamp: msg.createdAt,
        replyTo: msg.reference?.messageId,
        ...(attachments.length > 0 ? { attachments } : {}),
      };

      for (const cb of this.messageCallbacks) {
        await cb(message);
      }
    });

    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const options: Record<string, string | number | boolean | undefined> = {};
      for (const opt of interaction.options.data) {
        options[opt.name] = opt.value as string | number | boolean | undefined;
      }

      const context: SlashCommandContext = {
        commandName: interaction.commandName,
        options,
        channelId: interaction.channelId,
        reply: async (content: string, ephemeral = true) => {
          await interaction.reply({ content, flags: ephemeral ? MessageFlags.Ephemeral : undefined });
        },
      };

      for (const cb of this.slashCommandCallbacks) {
        try {
          await cb(context);
        } catch (err) {
          await interaction.reply({ content: `Error: ${err instanceof Error ? err.message : String(err)}`, flags: MessageFlags.Ephemeral }).catch(() => {});
        }
      }
    });
  }

  public async shutdown(): Promise<void> {
    if (this.client) {
      await this.client.destroy();
      this._connected = false;
    }
  }

  public getConnector(): Connector {
    return {
      platform: 'discord',

      connect: async () => {
        if (this._connected) return;
        this._connected = true;
        try {
          await this.client.login(this.config.botToken);
          if (!this.client.isReady()) {
            await new Promise<void>((resolve) => this.client.once('clientReady', resolve));
          }

          const { id } = this.client.application ?? {};
          if (id) {
            const rest = new REST({ version: '10' }).setToken(this.config.botToken);
            const route = Routes.applicationCommands(id);
            await rest.put(route, { body: SLASH_COMMANDS_DEFINITIONS });
          }
        } catch (e) {
          this._connected = false;
          throw e;
        }
      },

      disconnect: async () => {
        if (this.client) {
          await this.client.destroy();
        }
        this._connected = false;
      },

      isConnected: () => this._connected,

      onMessage: (callback) => {
        this.messageCallbacks.push(callback);
      },

      onSlashCommand: (callback) => {
        this.slashCommandCallbacks.push(callback);
      },

      sendMessage: async (options: SendMessageOptions) => {
        if (!this._connected) throw new Error('Discord: not connected');
        const channel = await this.client.channels.fetch(options.channelId);
        if (!channel?.isSendable()) throw new Error('Discord: channel not sendable');

        const replyRef = options.replyTo ? { messageReference: options.replyTo } : {};
        const files = options.attachments?.map((a) => ({ attachment: a.url, name: a.filename })) ?? [];
        await channel.send({
          content: options.content,
          ...replyRef,
          ...(files.length > 0 ? { files } : {}),
        });
      },

      sendTyping: async (channelId: string) => {
        if (!this._connected) return;
        const channel = await this.client.channels.fetch(channelId);
        if (channel?.isSendable() && 'sendTyping' in channel) {
          await (channel as TextChannel).sendTyping();
        }
      },

      clearChannelHistory: async (channelId: string) => {
        if (!this._connected) return { error: 'Bot is not connected.' };
        const channel = await this.client.channels.fetch(channelId);
        if (!channel?.isSendable()) return { error: 'Cannot access this channel.' };

        type ChannelWithMessages = {
          type: number;
          messages: { fetch(opts?: { limit: number }): Promise<Map<string, { id: string; createdTimestamp: number; delete(): Promise<unknown> }>> };
          bulkDelete?(ids: string[], filterOld?: boolean): Promise<Map<string, unknown>>;
        };
        const ch = channel as ChannelWithMessages;
        if (!ch.messages) return { error: 'Cannot read message history in this channel.' };

        const isDM = ch.type === ChannelType.DM;
        const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
        let totalDeleted = 0;
        const maxBatches = 10;
        const useBulkDelete = typeof ch.bulkDelete === 'function';
        let permissionWarning = false;

        for (let batch = 0; batch < maxBatches; batch++) {
          const messages = await ch.messages.fetch({ limit: 100 });
          const toDelete = [...messages.values()].filter((m) => m.createdTimestamp >= twoWeeksAgo);
          if (toDelete.length === 0) break;

          if (useBulkDelete && toDelete.length >= 2) {
            const ids = toDelete.map((m) => m.id);
            const deleted = await ch.bulkDelete!(ids, true);
            totalDeleted += deleted.size;
            if (deleted.size < toDelete.length) permissionWarning = true;
            if (deleted.size < 100) break;
          } else {
            for (const msg of toDelete) {
              try {
                await msg.delete();
                totalDeleted += 1;
              } catch {
                permissionWarning = true;
              }
            }
            if (toDelete.length < 100) break;
          }
        }

        let warning: string | undefined;
        if (isDM) {
          warning = "En MP, Discord n'autorise pas les bots à supprimer les messages des utilisateurs.";
        } else if (permissionWarning) {
          warning = 'Pour supprimer aussi vos messages, donnez au bot la permission « Gérer les messages ».';
        }

        return { deleted: totalDeleted, warning };
      },
    };
  }
}
