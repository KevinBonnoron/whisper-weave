import type { Connector, ConnectorCapability, Message, PluginBase, PluginMetadata, SendMessageOptions, SlashCommandContext } from '@whisper-weave/plugin-sdk';
import { Telegraf, type Context, type Update } from 'telegraf';

export interface TelegramConfig {
  botToken: string;
  allowedChatIds?: (string | number)[];
}

function chatIdToString(chatId: number | string): string {
  return typeof chatId === 'string' ? chatId : String(chatId);
}

export default class implements PluginBase, ConnectorCapability {
  public readonly metadata: PluginMetadata = {
    id: 'telegram',
    name: 'Telegram',
    description: 'Connect to Telegram chats and groups via a bot',
    version: '1.0.0',
  };

  private readonly messageCallbacks: Array<(message: Message) => void | Promise<void>> = [];
  private readonly slashCommandCallbacks: Array<(context: SlashCommandContext) => Promise<void>> = [];
  private _connected = false;
  private bot: Telegraf<Context<Update>> | null = null;

  public constructor(private readonly config: TelegramConfig) {
    if (!config.botToken) {
      throw new Error('Telegram: botToken is required');
    }
  }

  public async shutdown(): Promise<void> {
    if (this.bot) {
      this.bot.stop('shutdown');
      this.bot = null;
    }
    this._connected = false;
  }

  private isChatAllowed(chatId: number | string): boolean {
    const ids = this.config.allowedChatIds;
    if (!ids?.length) return true;
    const str = chatIdToString(chatId);
    return ids.some((id) => chatIdToString(id) === str);
  }

  private parseCommand(text: string): { commandName: string; options: Record<string, string | number | boolean | undefined> } | null {
    const trimmed = text.trim();
    if (!trimmed.startsWith('/')) return null;
    const parts = trimmed.slice(1).split(/\s+/);
    const commandName = parts[0]?.toLowerCase() ?? '';
    const options: Record<string, string | number | boolean | undefined> = {};
    if (parts[1] !== undefined) {
      options.model = parts[1];
    }
    return { commandName, options };
  }

  public getConnector(): Connector {
    return {
      platform: 'telegram',

      connect: async () => {
        if (this._connected) return;

        this.bot = new Telegraf(this.config.botToken);

        this.bot.on('message', async (ctx) => {
          const msg = ctx.message;
          const text = 'text' in msg ? msg.text : undefined;
          if (!text) return;

          const chatId = ctx.chat.id;
          if (!this.isChatAllowed(chatId)) return;

          const from = ctx.from;
          if (!from) return;

          const command = this.parseCommand(text);
          if (command) {
            const context: SlashCommandContext = {
              commandName: command.commandName,
              options: command.options,
              channelId: chatIdToString(chatId),
              reply: async (content: string) => {
                await ctx.reply(content);
              },
            };
            for (const cb of this.slashCommandCallbacks) {
              try {
                await cb(context);
              } catch (err) {
                await ctx.reply(`Error: ${err instanceof Error ? err.message : String(err)}`).catch(() => {});
              }
            }
            return;
          }

          const message: Message = {
            id: String(msg.message_id),
            platform: 'telegram',
            channelId: chatIdToString(chatId),
            userId: String(from.id),
            username: from.username ?? from.first_name ?? 'user',
            content: text,
            timestamp: new Date(msg.date * 1000),
            replyTo: msg.reply_to_message ? String(msg.reply_to_message.message_id) : undefined,
          };

          for (const cb of this.messageCallbacks) {
            await cb(message);
          }
        });

        this._connected = true;
        this.bot.launch({ dropPendingUpdates: true }).catch(() => {
          this._connected = false;
          this.bot = null;
        });
      },

      disconnect: async () => {
        if (this.bot) {
          this.bot.stop('disconnect');
          this.bot = null;
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
        if (!this._connected || !this.bot) throw new Error('Telegram: not connected');
        const chatId = options.channelId;
        const extra = options.replyTo ? { reply_parameters: { message_id: Number(options.replyTo) } } : {};

        const images = options.attachments?.filter((a) => a.type === 'image') ?? [];
        for (const img of images) {
          await this.bot.telegram.sendPhoto(chatId, img.url, extra);
        }

        if (options.content.trim()) {
          await this.bot.telegram.sendMessage(chatId, options.content, extra);
        }
      },

      sendTyping: async (channelId: string) => {
        if (!this._connected || !this.bot) return;
        await this.bot.telegram.sendChatAction(channelId, 'typing').catch(() => {});
      },
    };
  }
}
