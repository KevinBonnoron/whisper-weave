import type { PluginBase, PluginMetadata, ToolsCapability, ToolWithHandler } from '@whisper-weave/plugin-sdk';

export interface HomeAssistantConfig {
  baseUrl: string;
  accessToken: string;
}

interface HAState {
  entity_id: string;
  state: string;
  attributes?: Record<string, unknown>;
}

function normalizeUrl(url: string, fallback: string): string {
  if (!url?.trim()) return fallback;
  return url.replace(/\/+$/, '');
}

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, '_')
    .trim();
}

function entityMatchesRoom(state: HAState, targetRoom: string): boolean {
  const normalizedRoom = normalizeForMatch(targetRoom);
  const roomWords = normalizedRoom.split(/[\s_]+/).filter((w) => w.length > 1);
  const eid = state.entity_id.toLowerCase();
  const objectId = eid.includes('.') ? (eid.split('.')[1] ?? '') : eid;
  const friendly = (state.attributes?.friendly_name as string) ?? '';
  const friendlyNorm = normalizeForMatch(friendly);

  if (eid.includes(normalizedRoom) || objectId.includes(normalizedRoom) || friendlyNorm.includes(normalizedRoom)) {
    return true;
  }
  if (friendly.toLowerCase().includes(targetRoom.toLowerCase())) {
    return true;
  }
  for (const word of roomWords) {
    if (word.length < 2) continue;
    if (eid.includes(word) || objectId.includes(word) || friendlyNorm.includes(word) || friendly.toLowerCase().includes(word)) {
      return true;
    }
  }
  return false;
}

async function haRequest(baseUrl: string, accessToken: string, path: string, options?: { method?: 'GET' | 'POST'; body?: unknown }): Promise<{ data?: unknown; error?: string; status?: number }> {
  const url = `${baseUrl}/api${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
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
        error: `Home Assistant API error: ${res.status} ${res.statusText}${text ? ` - ${text.slice(0, 200)}` : ''}`,
        status: res.status,
      };
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
    id: 'home-assistant',
    name: 'Home Assistant',
    description: 'Control your smart home via Home Assistant',
    version: '1.0.0',
  };

  private readonly baseUrl: string;
  private readonly accessToken: string;

  public constructor(config: HomeAssistantConfig) {
    if (!config.baseUrl?.trim()) {
      throw new Error('Home Assistant: baseUrl is required');
    }
    if (!config.accessToken?.trim()) {
      throw new Error('Home Assistant: accessToken is required');
    }
    this.baseUrl = normalizeUrl(config.baseUrl, 'http://localhost:8123');
    this.accessToken = config.accessToken.trim();
  }

  public async shutdown(): Promise<void> {}

  public getTools(): ToolWithHandler[] {
    return [
      {
        name: 'ha_get_state',
        description: 'Get the state of one or more Home Assistant entities.',
        parameters: [
          { name: 'entity_id', type: 'string', description: 'Entity ID (e.g. light.living_room). Omit to list all states.', required: false },
          { name: 'domain', type: 'string', description: 'Filter by domain when listing (e.g. light, switch, sensor).', required: false },
        ],
        requiresApproval: false,
        handler: async (input) => {
          const entityId = typeof input.entity_id === 'string' ? input.entity_id.trim() : undefined;
          const domain = typeof input.domain === 'string' ? input.domain.trim() : undefined;

          if (entityId) {
            const { data, error } = await haRequest(this.baseUrl, this.accessToken, `/states/${encodeURIComponent(entityId)}`);
            if (error) return { error };
            return data;
          }

          const { data, error } = await haRequest(this.baseUrl, this.accessToken, '/states');
          if (error) return { error };

          let states = (data as HAState[]) ?? [];
          if (domain) {
            states = states.filter((s) => s.entity_id === domain || s.entity_id.startsWith(`${domain}.`));
          }
          return { states, count: states.length };
        },
      },
      {
        name: 'ha_call_service',
        description: 'Call a Home Assistant service (e.g. light.turn_on, switch.turn_off).',
        parameters: [
          { name: 'domain', type: 'string', description: 'Service domain (e.g. light, switch, climate)', required: true },
          { name: 'service', type: 'string', description: 'Service name (e.g. turn_on, turn_off)', required: true },
          { name: 'target', type: 'string', description: 'Room or device name', required: true },
          { name: 'data', type: 'string', description: 'Optional JSON for service parameters', required: false },
        ],
        requiresApproval: false,
        handler: async (input) => {
          const domain = String(input.domain ?? '').trim();
          const service = String(input.service ?? '').trim();
          if (!domain || !service) {
            return { error: 'domain and service are required' };
          }

          const targetStr = typeof input.target === 'string' ? input.target.trim() : '';
          if (!targetStr) {
            return { error: 'target is required: room or device name.' };
          }

          const { data: statesData, error: statesError } = await haRequest(this.baseUrl, this.accessToken, '/states');
          if (statesError) return { error: statesError };

          const states = (statesData as HAState[]) ?? [];
          const [match] = states.filter((s) => s.entity_id === domain || s.entity_id.startsWith(`${domain}.`)).filter((s) => entityMatchesRoom(s, targetStr));
          if (!match) {
            const available = states.slice(0, 25).map((s) => ({
              entity_id: s.entity_id,
              friendly_name: (s.attributes?.friendly_name as string) ?? null,
            }));
            return { error: `No entity found for "${targetStr}" in domain ${domain}.`, available };
          }

          const target = { entity_id: [match.entity_id], mode: 'single' };
          let data: Record<string, unknown> = {};
          if (input.data != null) {
            if (typeof input.data === 'string') {
              try {
                data = JSON.parse(input.data) as Record<string, unknown>;
              } catch {
                return { error: 'data must be valid JSON' };
              }
            } else if (typeof input.data === 'object' && input.data !== null) {
              data = input.data as Record<string, unknown>;
            }
          }

          const body: { target: Record<string, unknown>; data?: Record<string, unknown> } = { target };
          if (Object.keys(data).length > 0) body.data = data;

          const path = `/${encodeURIComponent(domain)}/${encodeURIComponent(service)}`;
          const { data: result, error: err } = await haRequest(this.baseUrl, this.accessToken, `/services${path}`, {
            method: 'POST',
            body,
          });

          if (err) return { error: err };
          return { success: true, result };
        },
      },
    ];
  }
}
