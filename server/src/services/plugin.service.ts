import type { CatalogEntry, PluginInstance, PluginRecord } from '@whisper-weave/shared';
import { getPluginCatalog } from '../plugins/catalog-metadata';
import { serverPluginManager } from './plugin-manager.service';

export const pluginService = {
  getCatalog(): CatalogEntry[] {
    return getPluginCatalog();
  },

  getInstances(): PluginInstance[] {
    return serverPluginManager.getAllInstances();
  },
};
