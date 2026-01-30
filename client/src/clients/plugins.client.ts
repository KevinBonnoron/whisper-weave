import type { CatalogEntry, GetPluginsResponse, PluginInstance } from '@whisper-weave/shared';
import { universalClient, withDelegate, withMethods } from 'universal-client';
import { config } from '@/lib/config';

export const pluginsClient = universalClient(
  withDelegate({ type: 'http', impl: 'fetch', baseURL: config.api.url }),
  withMethods(({ delegate }) => ({
    getCatalog: () => delegate.get<CatalogEntry[]>('/plugins/catalog'),
    getInstances: () => delegate.get<PluginInstance[]>('/plugins/instances'),
    getPlugins: async (): Promise<GetPluginsResponse> => {
      const [catalog, instances] = await Promise.all([delegate.get<CatalogEntry[]>('/plugins/catalog'), delegate.get<PluginInstance[]>('/plugins/instances')]);
      return { catalog, instances };
    },
  })),
);
