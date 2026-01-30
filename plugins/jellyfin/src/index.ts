import type { PluginBase, PluginMetadata, ToolsCapability, ToolWithHandler } from '@whisper-weave/plugin-sdk';

export interface JellyfinConfig {
  baseUrl: string;
  apiKey: string;
}

interface JellyfinItem {
  Id: string;
  Name: string;
  Type: string;
  Overview?: string;
  ProductionYear?: number;
  RunTimeTicks?: number;
  CommunityRating?: number;
  OfficialRating?: string;
  Genres?: string[];
  SeriesName?: string;
  SeasonName?: string;
  IndexNumber?: number;
  ParentIndexNumber?: number;
  UserData?: {
    PlaybackPositionTicks?: number;
    PlayedPercentage?: number;
    Played?: boolean;
    IsFavorite?: boolean;
  };
  MediaSources?: Array<{
    Id: string;
    Name: string;
    Size?: number;
    Container?: string;
  }>;
}

interface JellyfinSession {
  Id: string;
  UserName: string;
  Client: string;
  DeviceName: string;
  DeviceId: string;
  NowPlayingItem?: JellyfinItem;
  PlayState?: {
    PositionTicks?: number;
    IsPaused?: boolean;
    IsMuted?: boolean;
    VolumeLevel?: number;
  };
  SupportsRemoteControl?: boolean;
}

interface JellyfinSearchResult {
  Items: JellyfinItem[];
  TotalRecordCount: number;
}

function normalizeUrl(url: string): string {
  if (!url?.trim()) return '';
  return url.replace(/\/+$/, '');
}

function ticksToMinutes(ticks: number | undefined): number | undefined {
  if (!ticks) return undefined;
  return Math.round(ticks / 600000000);
}

function formatDuration(ticks: number | undefined): string | undefined {
  if (!ticks) return undefined;
  const totalMinutes = Math.round(ticks / 600000000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatItem(item: JellyfinItem): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: item.Id,
    name: item.Name,
    type: item.Type,
  };

  if (item.Overview) base.overview = item.Overview;
  if (item.ProductionYear) base.year = item.ProductionYear;
  if (item.RunTimeTicks) base.duration = formatDuration(item.RunTimeTicks);
  if (item.CommunityRating) base.rating = Math.round(item.CommunityRating * 10) / 10;
  if (item.OfficialRating) base.contentRating = item.OfficialRating;
  if (item.Genres?.length) base.genres = item.Genres;

  // Series info for episodes
  if (item.SeriesName) base.series = item.SeriesName;
  if (item.SeasonName) base.season = item.SeasonName;
  if (item.IndexNumber != null) base.episode = item.IndexNumber;
  if (item.ParentIndexNumber != null) base.seasonNumber = item.ParentIndexNumber;

  // Progress info
  if (item.UserData) {
    if (item.UserData.PlayedPercentage != null && item.UserData.PlayedPercentage > 0) {
      base.progress = `${Math.round(item.UserData.PlayedPercentage)}%`;
    }
    if (item.UserData.IsFavorite) base.isFavorite = true;
    if (item.UserData.Played) base.watched = true;
  }

  return base;
}

async function jellyfinRequest(
  baseUrl: string,
  apiKey: string,
  path: string,
  options?: { method?: 'GET' | 'POST'; body?: unknown; params?: Record<string, string | number | boolean | undefined> },
): Promise<{ data?: unknown; error?: string; status?: number }> {
  let url = `${baseUrl}${path}`;

  // Add query params
  if (options?.params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(options.params)) {
      if (value != null) {
        searchParams.append(key, String(value));
      }
    }
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  const headers: Record<string, string> = {
    Authorization: `MediaBrowser Token="${apiKey}"`,
    'Content-Type': 'application/json',
  };

  try {
    const res = await fetch(url, {
      method: options?.method ?? 'GET',
      headers,
      body: options?.body != null ? JSON.stringify(options.body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        error: `Jellyfin API error: ${res.status} ${res.statusText}${text ? ` - ${text.slice(0, 200)}` : ''}`,
        status: res.status,
      };
    }

    // Some endpoints return empty responses
    const contentLength = res.headers.get('content-length');
    if (contentLength === '0' || res.status === 204) {
      return { data: { success: true } };
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      return { data };
    }
    return { data: await res.text() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Request failed: ${message}` };
  }
}

export default class implements PluginBase, ToolsCapability {
  public readonly metadata: PluginMetadata = {
    id: 'jellyfin',
    name: 'Jellyfin',
    description: 'Search, browse and control media playback on Jellyfin',
    version: '1.0.0',
  };

  private readonly baseUrl: string;
  private readonly apiKey: string;

  public constructor(config: JellyfinConfig) {
    if (!config.baseUrl?.trim()) {
      throw new Error('Jellyfin: baseUrl is required');
    }
    if (!config.apiKey?.trim()) {
      throw new Error('Jellyfin: apiKey is required');
    }
    this.baseUrl = normalizeUrl(config.baseUrl);
    this.apiKey = config.apiKey.trim();
  }

  public async shutdown(): Promise<void> {}

  public getTools(): ToolWithHandler[] {
    return [
      {
        name: 'jellyfin_search',
        description:
          'Search for movies, TV shows, episodes, or music in the Jellyfin library. Use this to find content by name, genre, or other criteria.',
        parameters: [
          { name: 'query', type: 'string', description: 'Search query (title, actor, etc.)', required: true },
          {
            name: 'type',
            type: 'string',
            description: 'Filter by type: Movie, Series, Episode, Audio, MusicAlbum',
            required: false,
            enum: ['Movie', 'Series', 'Episode', 'Audio', 'MusicAlbum'],
          },
          { name: 'limit', type: 'number', description: 'Max results (default 10)', required: false },
        ],
        requiresApproval: false,
        handler: async (input) => {
          const query = String(input.query ?? '').trim();
          if (!query) {
            return { error: 'query is required' };
          }

          const params: Record<string, string | number | boolean | undefined> = {
            searchTerm: query,
            Limit: typeof input.limit === 'number' ? input.limit : 10,
            Recursive: true,
            Fields: 'Overview,Genres,CommunityRating,OfficialRating,RunTimeTicks,UserData',
          };

          if (input.type) {
            params.IncludeItemTypes = String(input.type);
          }

          const { data, error } = await jellyfinRequest(this.baseUrl, this.apiKey, '/Items', { params });
          if (error) return { error };

          const result = data as JellyfinSearchResult;
          return {
            results: result.Items.map(formatItem),
            totalCount: result.TotalRecordCount,
          };
        },
      },

      {
        name: 'jellyfin_get_item',
        description: 'Get detailed information about a specific item (movie, show, episode, etc.) by its ID.',
        parameters: [{ name: 'itemId', type: 'string', description: 'The Jellyfin item ID', required: true }],
        requiresApproval: false,
        handler: async (input) => {
          const itemId = String(input.itemId ?? '').trim();
          if (!itemId) {
            return { error: 'itemId is required' };
          }

          const { data, error } = await jellyfinRequest(this.baseUrl, this.apiKey, `/Items/${encodeURIComponent(itemId)}`, {
            params: {
              Fields: 'Overview,Genres,CommunityRating,OfficialRating,RunTimeTicks,UserData,People,Studios,MediaSources',
            },
          });
          if (error) return { error };

          return formatItem(data as JellyfinItem);
        },
      },

      {
        name: 'jellyfin_recently_added',
        description: 'Get recently added movies, shows, or episodes from the Jellyfin library.',
        parameters: [
          {
            name: 'type',
            type: 'string',
            description: 'Filter by type: Movie, Series, Episode',
            required: false,
            enum: ['Movie', 'Series', 'Episode'],
          },
          { name: 'limit', type: 'number', description: 'Max results (default 10)', required: false },
        ],
        requiresApproval: false,
        handler: async (input) => {
          const params: Record<string, string | number | boolean | undefined> = {
            SortBy: 'DateCreated',
            SortOrder: 'Descending',
            Limit: typeof input.limit === 'number' ? input.limit : 10,
            Recursive: true,
            Fields: 'Overview,Genres,CommunityRating,RunTimeTicks,UserData',
          };

          if (input.type) {
            params.IncludeItemTypes = String(input.type);
          } else {
            params.IncludeItemTypes = 'Movie,Episode';
          }

          const { data, error } = await jellyfinRequest(this.baseUrl, this.apiKey, '/Items', { params });
          if (error) return { error };

          const result = data as JellyfinSearchResult;
          return {
            recentlyAdded: result.Items.map(formatItem),
            count: result.Items.length,
          };
        },
      },

      {
        name: 'jellyfin_continue_watching',
        description: 'Get items that are in progress (started but not finished watching).',
        parameters: [{ name: 'limit', type: 'number', description: 'Max results (default 10)', required: false }],
        requiresApproval: false,
        handler: async (input) => {
          const params: Record<string, string | number | boolean | undefined> = {
            SortBy: 'DatePlayed',
            SortOrder: 'Descending',
            Limit: typeof input.limit === 'number' ? input.limit : 10,
            Recursive: true,
            Filters: 'IsResumable',
            Fields: 'Overview,RunTimeTicks,UserData',
            IncludeItemTypes: 'Movie,Episode',
          };

          const { data, error } = await jellyfinRequest(this.baseUrl, this.apiKey, '/Items', { params });
          if (error) return { error };

          const result = data as JellyfinSearchResult;
          return {
            continueWatching: result.Items.map(formatItem),
            count: result.Items.length,
          };
        },
      },

      {
        name: 'jellyfin_get_sessions',
        description: 'Get active playback sessions and connected devices. Shows who is watching what.',
        parameters: [],
        requiresApproval: false,
        handler: async () => {
          const { data, error } = await jellyfinRequest(this.baseUrl, this.apiKey, '/Sessions');
          if (error) return { error };

          const sessions = (data as JellyfinSession[]).map((s) => {
            const session: Record<string, unknown> = {
              id: s.Id,
              user: s.UserName,
              client: s.Client,
              device: s.DeviceName,
              supportsRemoteControl: s.SupportsRemoteControl,
            };

            if (s.NowPlayingItem) {
              session.nowPlaying = {
                name: s.NowPlayingItem.Name,
                type: s.NowPlayingItem.Type,
                series: s.NowPlayingItem.SeriesName,
              };
            }

            if (s.PlayState) {
              session.playState = {
                isPaused: s.PlayState.IsPaused,
                position: formatDuration(s.PlayState.PositionTicks),
                volume: s.PlayState.VolumeLevel,
                isMuted: s.PlayState.IsMuted,
              };
            }

            return session;
          });

          return {
            sessions,
            count: sessions.length,
          };
        },
      },

      {
        name: 'jellyfin_play',
        description: 'Start playing an item on a specific device/session. Get session IDs from jellyfin_get_sessions.',
        parameters: [
          { name: 'sessionId', type: 'string', description: 'The session/device ID to play on', required: true },
          { name: 'itemId', type: 'string', description: 'The item ID to play', required: true },
          { name: 'startPositionTicks', type: 'number', description: 'Start position in ticks (optional)', required: false },
        ],
        requiresApproval: false,
        handler: async (input) => {
          const sessionId = String(input.sessionId ?? '').trim();
          const itemId = String(input.itemId ?? '').trim();

          if (!sessionId) return { error: 'sessionId is required' };
          if (!itemId) return { error: 'itemId is required' };

          const params: Record<string, string | number | boolean | undefined> = {
            ItemIds: itemId,
            PlayCommand: 'PlayNow',
          };

          if (typeof input.startPositionTicks === 'number') {
            params.StartPositionTicks = input.startPositionTicks;
          }

          const { error } = await jellyfinRequest(
            this.baseUrl,
            this.apiKey,
            `/Sessions/${encodeURIComponent(sessionId)}/Playing`,
            { method: 'POST', params },
          );

          if (error) return { error };
          return { success: true, message: 'Playback started' };
        },
      },

      {
        name: 'jellyfin_playback_control',
        description: 'Control playback on a session: play, pause, stop, next, previous, seek.',
        parameters: [
          { name: 'sessionId', type: 'string', description: 'The session ID to control', required: true },
          {
            name: 'command',
            type: 'string',
            description: 'Playback command',
            required: true,
            enum: ['Play', 'Pause', 'PlayPause', 'Stop', 'NextTrack', 'PreviousTrack', 'Seek'],
          },
          { name: 'seekPositionTicks', type: 'number', description: 'Position in ticks for Seek command', required: false },
        ],
        requiresApproval: false,
        handler: async (input) => {
          const sessionId = String(input.sessionId ?? '').trim();
          const command = String(input.command ?? '').trim();

          if (!sessionId) return { error: 'sessionId is required' };
          if (!command) return { error: 'command is required' };

          const validCommands = ['Play', 'Pause', 'PlayPause', 'Stop', 'NextTrack', 'PreviousTrack', 'Seek'];
          if (!validCommands.includes(command)) {
            return { error: `Invalid command. Valid: ${validCommands.join(', ')}` };
          }

          const params: Record<string, string | number | boolean | undefined> = {};
          if (command === 'Seek' && typeof input.seekPositionTicks === 'number') {
            params.SeekPositionTicks = input.seekPositionTicks;
          }

          const { error } = await jellyfinRequest(
            this.baseUrl,
            this.apiKey,
            `/Sessions/${encodeURIComponent(sessionId)}/Playing/${encodeURIComponent(command)}`,
            { method: 'POST', params },
          );

          if (error) return { error };
          return { success: true, command };
        },
      },

      {
        name: 'jellyfin_get_libraries',
        description: 'List all media libraries (collections) on the server.',
        parameters: [],
        requiresApproval: false,
        handler: async () => {
          const { data, error } = await jellyfinRequest(this.baseUrl, this.apiKey, '/Library/VirtualFolders');
          if (error) return { error };

          const libraries = (data as Array<{ Name: string; CollectionType: string; ItemId: string; Locations: string[] }>).map((lib) => ({
            id: lib.ItemId,
            name: lib.Name,
            type: lib.CollectionType,
            paths: lib.Locations,
          }));

          return { libraries };
        },
      },

      {
        name: 'jellyfin_get_similar',
        description: 'Get items similar to a given item. Great for recommendations.',
        parameters: [
          { name: 'itemId', type: 'string', description: 'The item ID to find similar content for', required: true },
          { name: 'limit', type: 'number', description: 'Max results (default 10)', required: false },
        ],
        requiresApproval: false,
        handler: async (input) => {
          const itemId = String(input.itemId ?? '').trim();
          if (!itemId) return { error: 'itemId is required' };

          const { data, error } = await jellyfinRequest(this.baseUrl, this.apiKey, `/Items/${encodeURIComponent(itemId)}/Similar`, {
            params: {
              Limit: typeof input.limit === 'number' ? input.limit : 10,
              Fields: 'Overview,Genres,CommunityRating,RunTimeTicks',
            },
          });
          if (error) return { error };

          const result = data as JellyfinSearchResult;
          return {
            similar: result.Items.map(formatItem),
            count: result.Items.length,
          };
        },
      },

      {
        name: 'jellyfin_set_volume',
        description: 'Set the volume level on a playback session.',
        parameters: [
          { name: 'sessionId', type: 'string', description: 'The session ID', required: true },
          { name: 'volume', type: 'number', description: 'Volume level (0-100)', required: true },
        ],
        requiresApproval: false,
        handler: async (input) => {
          const sessionId = String(input.sessionId ?? '').trim();
          const volume = typeof input.volume === 'number' ? input.volume : undefined;

          if (!sessionId) return { error: 'sessionId is required' };
          if (volume == null || volume < 0 || volume > 100) {
            return { error: 'volume must be a number between 0 and 100' };
          }

          const { error } = await jellyfinRequest(
            this.baseUrl,
            this.apiKey,
            `/Sessions/${encodeURIComponent(sessionId)}/Command`,
            {
              method: 'POST',
              body: { Name: 'SetVolume', Arguments: { Volume: volume } },
            },
          );

          if (error) return { error };
          return { success: true, volume };
        },
      },
    ];
  }
}
