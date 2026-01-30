import type { Connector, ConnectorCapability, Message, PluginBase, PluginMetadata, ToolsCapability, ToolWithHandler } from '@whisper-weave/plugin-sdk';
import { google } from 'googleapis';

export interface GoogleConfig {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  refresh_token?: string;
  pollIntervalMs?: number;
}

function decodeBase64Url(str: string): string {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

function getHeader(headers: Array<{ name?: string; value?: string }> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const h = headers.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value;
}

function getBodyText(payload: { mimeType?: string; body?: { data?: string }; parts?: Array<{ mimeType?: string; body?: { data?: string } }> }): string {
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts) {
    const textPart = payload.parts.find((p) => p.mimeType === 'text/plain');
    if (textPart?.body?.data) return decodeBase64Url(textPart.body.data);
    const htmlPart = payload.parts.find((p) => p.mimeType === 'text/html');
    if (htmlPart?.body?.data) {
      const html = decodeBase64Url(htmlPart.body.data);
      return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }
  return '';
}

export default class implements PluginBase, ConnectorCapability, ToolsCapability {
  public readonly metadata: PluginMetadata = {
    id: 'google',
    name: 'Google',
    description: 'Connect to Gmail and access Google Calendar',
    version: '1.0.0',
  };

  private readonly config: GoogleConfig;
  private readonly messageCallbacks: Array<(message: Message) => void | Promise<void>> = [];
  private readonly seenMessageIds = new Set<string>();
  private readonly threadReplyMeta = new Map<string, { to: string; messageId?: string }>();
  private gmail: ReturnType<typeof google.gmail> | null = null;
  private calendar: ReturnType<typeof google.calendar> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private _connected = false;

  public constructor(config: GoogleConfig = {}) {
    this.config = { ...config };
  }

  public shutdown(): Promise<void> {
    return this.getConnector().disconnect();
  }

  public getConnector(): Connector {
    return {
      platform: 'google',

      connect: async () => {
        const clientId = this.config.clientId;
        const clientSecret = this.config.clientSecret;
        const refreshToken = this.config.refreshToken ?? this.config.refresh_token;
        if (!clientId || !clientSecret || !refreshToken) {
          throw new Error('Google: clientId, clientSecret and refreshToken are required');
        }

        if (this._connected) return;

        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'urn:ietf:wg:oauth:2.0:oob');
        oauth2Client.setCredentials({ refresh_token: refreshToken });

        this.gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        this.calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        this._connected = true;

        const pollIntervalMs = this.config.pollIntervalMs ?? 30_000;
        this.pollTimer = setInterval(() => {
          this.pollNewMessages().catch(() => {});
        }, pollIntervalMs);
        await this.pollNewMessages();
      },

      disconnect: async () => {
        if (this.pollTimer) {
          clearInterval(this.pollTimer);
          this.pollTimer = null;
        }
        this.gmail = null;
        this.calendar = null;
        this._connected = false;
        this.seenMessageIds.clear();
        this.threadReplyMeta.clear();
      },

      isConnected: () => this._connected,

      onMessage: (callback) => {
        this.messageCallbacks.push(callback);
      },
    };
  }

  private async pollNewMessages(): Promise<void> {
    const gmail = this.gmail;
    if (!gmail) return;

    const res = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread',
      maxResults: 20,
    });

    const list = res.data.messages ?? [];
    for (const ref of list) {
      const msgId = ref.id;
      if (!msgId || this.seenMessageIds.has(msgId)) continue;

      try {
        const msgRes = await gmail.users.messages.get({ userId: 'me', id: msgId });
        const msg = msgRes.data;
        const payload = msg.payload;
        if (!payload) continue;

        const headers = payload.headers;
        const from = getHeader(headers, 'From') ?? '';
        const subject = getHeader(headers, 'Subject') ?? '';
        const dateStr = getHeader(headers, 'Date');
        const threadId = msg.threadId ?? msgId;
        const inReplyTo = getHeader(headers, 'In-Reply-To');
        const messageId = getHeader(headers, 'Message-ID');

        const content = getBodyText(payload);
        const timestamp = dateStr ? new Date(dateStr) : new Date(Number(msg.internalDate ?? Date.now()));

        const fromMatch = from.match(/^(?:"?([^"]*)"?\s*)?<?([^>]+)>?$/);
        const username = fromMatch ? fromMatch[1]?.trim() || fromMatch[2] || from : from;
        const userId = fromMatch?.[2] ?? from;

        const message: Message = {
          id: msgId,
          platform: 'google',
          channelId: threadId,
          userId,
          username,
          content: content || subject || '(no content)',
          timestamp,
          replyTo: inReplyTo ?? messageId ?? undefined,
          subject: subject || undefined,
        };

        this.threadReplyMeta.set(threadId, { to: userId, messageId: messageId ?? undefined });
        this.seenMessageIds.add(msgId);
        for (const cb of this.messageCallbacks) {
          await cb(message);
        }
      } catch {
        // Skip failed messages
      }
    }
  }

  public getTools(): ToolWithHandler[] {
    return [
      {
        name: 'google_calendar_list_calendars',
        description: "List the user's Google Calendar calendars.",
        parameters: [],
        requiresApproval: false,
        handler: async () => {
          const cal = this.getCalendarClient();
          if (!cal) {
            throw new Error('Google: not connected.');
          }
          const res = await cal.calendarList.list();
          const items = (res.data.items ?? []).map((c) => ({
            id: c.id,
            summary: c.summary ?? c.id,
            accessRole: c.accessRole,
            primary: c.primary ?? false,
          }));
          return { calendars: items };
        },
      },
      {
        name: 'google_calendar_list_events',
        description: 'List events from a Google Calendar in a time range.',
        parameters: [
          { name: 'calendarId', type: 'string', description: 'Calendar id: "primary" for main calendar', required: true },
          { name: 'timeMin', type: 'string', description: 'Start of time range (ISO 8601)', required: false },
          { name: 'timeMax', type: 'string', description: 'End of time range (ISO 8601)', required: false },
          { name: 'maxResults', type: 'number', description: 'Maximum number of events (default 20)', required: false },
        ],
        requiresApproval: false,
        handler: async (input) => {
          const cal = this.getCalendarClient();
          if (!cal) {
            throw new Error('Google: not connected.');
          }
          const calendarId = String(input.calendarId ?? 'primary');
          const timeMin = input.timeMin ? String(input.timeMin) : undefined;
          const timeMax = input.timeMax ? String(input.timeMax) : undefined;
          const maxResults = typeof input.maxResults === 'number' ? Math.min(100, Math.max(1, input.maxResults)) : 20;

          const res = await cal.events.list({
            calendarId,
            timeMin,
            timeMax,
            maxResults,
            singleEvents: true,
            orderBy: 'startTime',
          });

          const events = (res.data.items ?? []).map((e) => ({
            id: e.id,
            summary: e.summary ?? '(no title)',
            description: e.description ?? undefined,
            start: e.start?.dateTime ?? e.start?.date ?? undefined,
            end: e.end?.dateTime ?? e.end?.date ?? undefined,
            location: e.location ?? undefined,
            status: e.status,
            htmlLink: e.htmlLink ?? undefined,
          }));
          return { events };
        },
      },
      {
        name: 'google_mark_email_read',
        description: 'Mark an email as read. Call this after taking action on an email (e.g., replying, forwarding, or completing a requested task). If no action is needed, leave the email unread.',
        parameters: [
          { name: 'messageId', type: 'string', description: 'The email message ID to mark as read', required: true },
        ],
        requiresApproval: false,
        handler: async (input) => {
          const gmail = this.gmail;
          if (!gmail) {
            throw new Error('Google: not connected.');
          }
          const messageId = String(input.messageId);
          if (!messageId) {
            throw new Error('Google: messageId is required.');
          }
          await gmail.users.messages.modify({
            userId: 'me',
            id: messageId,
            requestBody: { removeLabelIds: ['UNREAD'] },
          });
          return { success: true, messageId };
        },
      },
    ];
  }

  private getCalendarClient(): ReturnType<typeof google.calendar> | null {
    if (this.calendar) return this.calendar;
    const { clientId, clientSecret, refreshToken } = this.config;
    const token = refreshToken ?? this.config.refresh_token;
    if (!clientId || !clientSecret || !token) return null;
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'urn:ietf:wg:oauth:2.0:oob');
    oauth2Client.setCredentials({ refresh_token: token });
    this.calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    return this.calendar;
  }
}
