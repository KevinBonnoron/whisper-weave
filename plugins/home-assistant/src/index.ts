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
        description:
          'Get the state of an entity. Prefer search over entity_id when the user gives a name: pass search with the exact name they said (do not translate, e.g. "Lumière salon"). We find by friendly_name/entity_id. Use entity_id only when you already know the exact id (e.g. from a previous list).',
        parameters: [
          { name: 'search', type: 'string', description: "Device or room name exactly as the user said (e.g. 'Lumière salon'). Do not translate. We search friendly_name and entity_id.", required: false },
          { name: 'entity_id', type: 'string', description: 'Exact entity ID (e.g. light.living_room). Use when you already know it; otherwise use search.', required: false },
          { name: 'domain', type: 'string', description: 'Filter by domain when using search or when listing (e.g. light, switch, sensor).', required: false },
        ],
        requiresApproval: false,
        handler: async (input) => {
          const searchStr = typeof input.search === 'string' ? input.search.trim() : undefined;
          const entityId = typeof input.entity_id === 'string' ? input.entity_id.trim() : undefined;
          const domain = typeof input.domain === 'string' ? input.domain.trim() : undefined;

          if (searchStr) {
            const { data, error } = await haRequest(this.baseUrl, this.accessToken, '/states');
            if (error) return { error };
            let states = (data as HAState[]) ?? [];
            if (domain) states = states.filter((s) => s.entity_id.startsWith(`${domain}.`));
            const matches = states.filter((s) => entityMatchesRoom(s, searchStr));
            if (matches.length === 0) {
              const available = states.slice(0, 20).map((s) => ({ entity_id: s.entity_id, friendly_name: (s.attributes?.friendly_name as string) ?? null }));
              return { error: `No entity matching "${searchStr}"${domain ? ` in domain ${domain}` : ''}.`, available };
            }
            if (matches.length === 1) return matches[0]!;
            return { matches: matches.map((s) => ({ entity_id: s.entity_id, friendly_name: (s.attributes?.friendly_name as string) ?? null, state: s.state })), hint: 'Multiple entities matched; use entity_id from one of them for a precise result.' };
          }

          if (entityId) {
            const { data, error } = await haRequest(this.baseUrl, this.accessToken, `/states/${encodeURIComponent(entityId)}`);
            if (!error) return data as HAState;
            if (error.includes('404')) {
              const domainFromId = entityId.includes('.') ? entityId.split('.')[0] : undefined;
              const { data: statesData, error: listErr } = await haRequest(this.baseUrl, this.accessToken, '/states');
              if (listErr) return { error };
              let states = (statesData as HAState[]) ?? [];
              if (domainFromId) states = states.filter((s) => s.entity_id.startsWith(`${domainFromId}.`));
              const available = states.slice(0, 20).map((s) => ({ entity_id: s.entity_id, friendly_name: (s.attributes?.friendly_name as string) ?? null }));
              return { error: `Entity ${entityId} not found. Use search with the exact name the user said (do not translate), or pick from available:`, available };
            }
            return { error };
          }

          const { data, error } = await haRequest(this.baseUrl, this.accessToken, '/states');
          if (error) return { error };
          let states = (data as HAState[]) ?? [];
          if (domain) states = states.filter((s) => s.entity_id.startsWith(`${domain}.`));
          return { states, count: states.length };
        },
      },
      {
        name: 'ha_call_service',
        description:
          'Call a Home Assistant service. For lights: domain "light", service "turn_on"; for color/brightness pass data with color_name, brightness_pct, etc. Always use the exact name the user said for the device/room—do not translate (e.g. if they say "Lumière salon", pass target "Lumière salon", not "living room"). If you do not know the entity: call ha_get_state without entity_id (with domain) first, then match the user\'s name to friendly_name or entity_id and pass that as target.',
        parameters: [
          { name: 'domain', type: 'string', description: 'Service domain (e.g. light, switch, climate)', required: true },
          { name: 'service', type: 'string', description: 'Service name (e.g. turn_on, turn_off). For lights, turn_on is used for both on and color/brightness.', required: true },
          { name: 'target', type: 'string', description: 'Exact device or room name as the user said (do not translate), or entity_id. E.g. "Lumière salon" not "living room". If unsure, call ha_get_state first to list entities.', required: true },
          { name: 'data', type: 'string', description: 'Optional JSON for service parameters. For light.turn_on: { "color_name": "red" }, { "brightness_pct": 80 }, etc.', required: false },
        ],
        requiresApproval: false,
        handler: async (input) => {
          // Accept "arguments" wrapper (some models send everything under one key)
          const raw = (input.arguments != null && typeof input.arguments === 'object' ? input.arguments : input) as Record<string, unknown>;

          let domain = String(raw.domain ?? input.domain ?? '').trim();
          let service = String(raw.service ?? input.service ?? '').trim();
          if (!domain || !service) {
            return { error: 'domain and service are required' };
          }

          let entityId: string | undefined;

          const targetRaw = raw.target ?? input.target;
          if (targetRaw != null && typeof targetRaw === 'object' && !Array.isArray(targetRaw)) {
            const tid = (targetRaw as { entity_id?: string | string[] }).entity_id;
            if (Array.isArray(tid) && tid.length > 0 && typeof tid[0] === 'string') entityId = tid[0];
            else if (typeof tid === 'string') entityId = tid;
          } else if (typeof targetRaw === 'string' && targetRaw.trim()) {
            const targetStr = targetRaw.trim();
            const { data: statesData, error: statesError } = await haRequest(this.baseUrl, this.accessToken, '/states');
            if (statesError) return { error: statesError };
            const states = (statesData as HAState[]) ?? [];
            const match = states
              .filter((s) => s.entity_id.startsWith(`${domain}.`))
              .find((s) => entityMatchesRoom(s, targetStr) || s.entity_id === targetStr);
            if (!match) {
              const domainStates = states.filter((s) => s.entity_id.startsWith(`${domain}.`));
              const available = domainStates.slice(0, 25).map((s) => ({
                entity_id: s.entity_id,
                friendly_name: (s.attributes?.friendly_name as string) ?? null,
              }));
              return {
                error: `No entity found for "${targetStr}" in domain ${domain}. Use ha_get_state (omit entity_id, domain="${domain}") to list entities and match by friendly_name, or use one of the entity_ids below as target.`,
                available,
              };
            }
            entityId = match.entity_id;
          } else if (typeof raw.entity_id === 'string' && raw.entity_id.trim()) {
            entityId = (raw.entity_id as string).trim();
          }

          if (!entityId) {
            return { error: 'target is required: room name, device name, or { entity_id: "light.xxx" }.' };
          }

          let serviceData: Record<string, unknown> = {};
          const dataRaw = raw.data ?? input.data;
          if (dataRaw != null) {
            if (typeof dataRaw === 'string') {
              try {
                serviceData = JSON.parse(dataRaw) as Record<string, unknown>;
              } catch {
                return { error: 'data must be valid JSON' };
              }
            } else if (typeof dataRaw === 'object' && dataRaw !== null) {
              serviceData = dataRaw as Record<string, unknown>;
            }
          }
          // If model put service params in "arguments", merge them (excluding domain, service, entity_id which we already used)
          if (input.arguments != null && typeof input.arguments === 'object') {
            const args = input.arguments as Record<string, unknown>;
            for (const [k, v] of Object.entries(args)) {
              if (k !== 'domain' && k !== 'service' && k !== 'entity_id' && v !== undefined) serviceData[k] = v;
            }
          }

          // Home Assistant REST API expects a flat body: entity_id + service parameters (no "target"/"data" wrapper)
          const body: Record<string, unknown> = { entity_id: entityId, ...serviceData };

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
