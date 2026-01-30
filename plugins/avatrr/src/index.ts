import type {
  Connector,
  ConnectorCapability,
  Message,
  PluginBase,
  PluginMetadata,
  SendMessageOptions,
} from '@whisper-weave/plugin-sdk';

/** WebSocket frame types from avatrr protocol */
interface AvatrrRegister {
  type: 'register';
  avatarId: string;
}

interface AvatrrRegistered {
  type: 'registered';
  avatarId: string;
}

/** One message in avatrr chat: either legacy (content) or parts-based (parts[].content). */
interface AvatrrChatMessage {
  role: string;
  content?: string | Array<{ type?: string; text?: string }> | Record<string, unknown>;
  parts?: Array<{ type?: string; text?: string; content?: string }>;
}

interface AvatrrChat {
  type: 'chat';
  messages?: AvatrrChatMessage[];
  data?: { messages?: AvatrrChatMessage[] };
  payload?: { messages?: AvatrrChatMessage[] };
  message?: string;
  input?: string;
  content?: string;
  systemPrompt?: string;
}

interface AvatrrToken {
  type: 'token';
  delta: string;
}

interface AvatrrEnd {
  type: 'end';
  runId?: string;
  messageId?: string;
}

interface AvatrrError {
  type: 'error';
  message: string;
  code?: string;
}

type AvatrrIncoming = AvatrrRegistered | AvatrrChat | AvatrrError;
type AvatrrOutgoing = AvatrrRegister | AvatrrToken | AvatrrEnd | AvatrrError;

export interface AvatrrConfig {
  avatrrUrl: string;
  avatarId: string;
}

function toWsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  const ws = trimmed.startsWith('https') ? trimmed.replace(/^https/, 'wss') : trimmed.replace(/^http/, 'ws');
  return `${ws}/api/ws`;
}

const RECONNECT_DELAY_MS = 3_000;

export default class AvatrrPlugin implements PluginBase, ConnectorCapability {
  public readonly metadata: PluginMetadata = {
    id: 'avatrr',
    name: 'Avatrr',
    description: 'Connect to an Avatrr avatar as an external channel (WebSocket)',
    version: '1.0.0',
  };

  private readonly messageCallbacks: Array<(message: Message) => void | Promise<void>> = [];
  private readonly wsUrl: string;
  private readonly avatarId: string;
  private ws: WebSocket | null = null;
  private registered = false;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  public constructor(private readonly config: AvatrrConfig) {
    if (!this.config.avatrrUrl?.trim()) {
      throw new Error('Avatrr: avatrrUrl is required');
    }

    if (!this.config.avatarId?.trim()) {
      throw new Error('Avatrr: avatarId is required');
    }

    this.wsUrl = toWsUrl(this.config.avatrrUrl);
    this.avatarId = this.config.avatarId.trim();
  }

  public async shutdown(): Promise<void> {
    if (this.reconnectTimeout !== null) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close(1000, 'shutdown');
      this.ws = null;
    }

    this.registered = false;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout !== null) {
      return;
    }

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.doConnect().catch(() => {});
    }, RECONNECT_DELAY_MS);
  }

  private async doConnect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN && this.registered) {
      return;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    await this.connectWs();
    this.attachChatHandler();
  }

  private connectWs(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.wsUrl);

      socket.onopen = () => {
        const payload: AvatrrRegister = { type: 'register', avatarId: this.avatarId };
        socket.send(JSON.stringify(payload));
      };

      socket.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(String(event.data)) as AvatrrIncoming;
          if (data.type === 'registered') {
            this.registered = true;
            this.ws = socket;
            resolve();
            return;
          }
          if (data.type === 'chat') {
            this.handleChat(data);
            return;
          }
          if (data.type === 'error') {
            socket.close();
            reject(new Error(data.message ?? 'Avatrr error'));
            return;
          }
        } catch {
          // Ignore unknown frames
        }
      };

      socket.onerror = () => {
        socket.close();
        reject(new Error('WebSocket error'));
      };

      socket.onclose = () => {
        this.registered = false;
        this.ws = null;
        this.scheduleReconnect();
      };
    });
  }

  private attachChatHandler(): void {
    if (!this.ws) {
      return;
    }

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(String(event.data)) as AvatrrIncoming;
        if (data.type === 'chat') {
          this.handleChat(data);
        }
      } catch {
        // Ignore
      }
    };
  }

  private messageContentToText(raw: string | Array<{ type?: string; text?: string; content?: string }> | Record<string, unknown> | undefined): string {
    if (raw == null) {
      return '';
    }

    if (typeof raw === 'string') {
      return raw;
    }

    if (Array.isArray(raw)) {
      return raw
        .filter((block): block is { type?: string; text?: string; content?: string } => block != null && typeof block === 'object')
        .map((block) => {
          if (block.type === 'text' && typeof block.content === 'string') {
            return block.content;
          }
          if (typeof block.content === 'string') {
            return block.content;
          }
          if (typeof block.text === 'string') {
            return block.text;
          }
          return '';
        })
        .join('');
    }
    if (typeof raw === 'object' && raw !== null && 'text' in raw && typeof (raw as { text?: unknown }).text === 'string') {
      return (raw as { text: string }).text;
    }
    return '';
  }

  private messageToText(m: AvatrrChatMessage): string {
    if (typeof m.content === 'string') {
      return m.content;
    }

    if (Array.isArray(m.parts) && m.parts.length > 0) {
      return m.parts.map((p) => (typeof p.content === 'string' ? p.content : typeof p.text === 'string' ? p.text : '')).join('');
    }
    return this.messageContentToText(m.content);
  }

  private handleChat(frame: AvatrrChat): void {
    const messages = frame.messages ?? frame.data?.messages ?? frame.payload?.messages ?? [];
    const isUserOrHuman = (m: { role: string }) => {
      const r = String(m?.role).toLowerCase();
      return r === 'user' || r === 'human';
    };

    let content = messages
      .filter(isUserOrHuman)
      .map((m) => this.messageToText(m))
      .join('\n\n')
      .trim();
    if (!content && messages.length > 0) {
      const last = messages[messages.length - 1];
      content = this.messageToText(last).trim();
    }
    if (!content && typeof frame.message === 'string') {
      content = frame.message.trim();
    }
    if (!content && typeof frame.input === 'string') {
      content = frame.input.trim();
    }
    if (!content && typeof frame.content === 'string') {
      content = frame.content.trim();
    }

    const messageId = `avatrr-${this.avatarId}-${Date.now()}`;
    const message: Message = {
      id: messageId,
      platform: 'avatrr',
      channelId: this.avatarId,
      userId: 'avatrr-user',
      username: 'avatrr-user',
      content: content.trim() || '(empty message)',
      timestamp: new Date(),
    };
    for (const cb of this.messageCallbacks) {
      void Promise.resolve(cb(message)).catch(() => {});
    }
  }

  private sendFrame(frame: AvatrrOutgoing): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(frame));
    }
  }

  public getConnector(): Connector {
    return {
      platform: 'avatrr',

      connect: async () => this.doConnect(),

      disconnect: async () => {
        if (this.reconnectTimeout !== null) {
          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = null;
        }
        if (this.ws) {
          this.ws.close(1000, 'disconnect');
          this.ws = null;
        }
        this.registered = false;
      },

      isConnected: () => this.ws?.readyState === WebSocket.OPEN && this.registered,

      onMessage: (callback) => {
        this.messageCallbacks.push(callback);
      },

      sendMessage: async (options: SendMessageOptions) => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          throw new Error('Avatrr: not connected');
        }
        const content = options.content ?? '';
        const words = content.split(/(\s+)/);
        for (const w of words) {
          if (w.length > 0) {
            this.sendFrame({ type: 'token', delta: w });
          }
        }
        this.sendFrame({ type: 'end' });
      },

      sendError: async (_channelId: string, error: { message: string; code?: string }) => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          return;
        }
        this.sendFrame({ type: 'error', message: error.message, code: error.code });
      },
    };
  }
}
