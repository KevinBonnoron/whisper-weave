import type { PluginRecord } from '@whisper-weave/shared';
import { serverPluginManager } from '../services/plugin-manager.service';
import { logger } from './logger';
import { pb } from './pocketbase';

function configDigest(config: Record<string, unknown>): string {
  return JSON.stringify(config, Object.keys(config).sort());
}

async function loadPluginRecord(record: PluginRecord): Promise<void> {
  try {
    await serverPluginManager.addPlugin(record.type, record.config ?? {}, record.id);
  } catch (err) {
    logger.error({ recordId: record.id, type: record.type, error: err instanceof Error ? err.message : String(err) }, '[plugins] Failed to load plugin');
  }
}

async function unloadPluginById(id: string): Promise<void> {
  try {
    await serverPluginManager.unloadPlugin(id);
  } catch (err) {
    logger.error({ id, error: err instanceof Error ? err.message : String(err) }, '[plugins] Failed to unload plugin');
  }
}

/** One-shot sync: load all enabled plugins from PocketBase (used at startup). */
export async function initialSyncFromPb(): Promise<void> {
  const records = await pb.collection('plugins').getFullList<PluginRecord>();
  const enabledIds = new Set(records.filter((r) => r.enabled).map((r) => r.id));
  const recordById = new Map(records.map((r) => [r.id, r]));

  const instances = serverPluginManager.getAllInstances();
  const loadedIds = new Set(instances.map((i) => i.id));

  for (const id of loadedIds) {
    if (enabledIds.has(id)) {
      continue;
    }

    await unloadPluginById(id);
  }

  for (const id of enabledIds) {
    if (loadedIds.has(id)) {
      continue;
    }

    const record = recordById.get(id);
    if (!record) {
      continue;
    }

    await loadPluginRecord(record);
  }

  for (const instance of instances) {
    if (!enabledIds.has(instance.id)) {
      continue;
    }
    const record = recordById.get(instance.id);
    if (!record) {
      continue;
    }
    const recordConfig = record.config ?? {};
    if (configDigest(recordConfig) === configDigest(instance.config ?? {})) {
      continue;
    }
    try {
      await serverPluginManager.configurePlugin(instance.id, recordConfig);
    } catch (err) {
      logger.error({ instanceId: instance.id, error: err instanceof Error ? err.message : String(err) }, '[plugins] Failed to reconfigure plugin');
    }
  }
}

interface RealtimeEvent {
  action: 'create' | 'update' | 'delete';
  record: PluginRecord;
}

/** Subscribe to plugins collection; react to create/update/delete in realtime. */
export function subscribeToPlugins(): void {
  pb.collection('plugins').subscribe<PluginRecord>(
    '*',
    async (e: RealtimeEvent) => {
      const record = e.record as PluginRecord;
      const id = record?.id;
      if (!id) {
        return;
      }

      const loadedIds = new Set(serverPluginManager.getAllInstances().map((i) => i.id));
      if (e.action === 'create') {
        if (record.enabled) {
          await loadPluginRecord(record);
        }

        return;
      }

      if (e.action === 'delete') {
        if (loadedIds.has(id)) {
          await unloadPluginById(id);
        }

        return;
      }

      if (e.action === 'update') {
        if (!record.enabled) {
          if (loadedIds.has(id)) {
            await unloadPluginById(id);
          }

          return;
        }

        if (!loadedIds.has(id)) {
          await loadPluginRecord(record);
          return;
        }

        const instance = serverPluginManager.getAllInstances().find((i) => i.id === id);
        if (!instance) {
          return;
        }

        const recordConfig = record.config ?? {};
        if (configDigest(recordConfig) !== configDigest(instance.config ?? {})) {
          try {
            await serverPluginManager.configurePlugin(id, recordConfig);
          } catch (err) {
            logger.error({ id, error: err instanceof Error ? err.message : String(err) }, '[plugins] Failed to reconfigure plugin');
          }
        } else {
          try {
            await serverPluginManager.connectConnector(id);
          } catch {
            // Not a connector or already connected; ignore
          }
        }
      }
    },
    {},
  );

  logger.info('[plugins] Subscribed to plugins collection (realtime)');
}
