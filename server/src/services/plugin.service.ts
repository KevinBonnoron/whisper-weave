import type { CatalogEntry, PluginInstance } from '@whisper-weave/shared';
import { getExternalCatalogEntries } from '../lib/plugin-loader';
import { serverPluginManager } from './plugin-manager.service';

export const pluginService = {
  getCatalog(): CatalogEntry[] {
    return getExternalCatalogEntries();
  },

  getInstances(): PluginInstance[] {
    return serverPluginManager.getAllInstances();
  },
};
