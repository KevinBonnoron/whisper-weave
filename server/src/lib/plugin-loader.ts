/**
 * Plugin Loader
 *
 * Discovers and dynamically loads plugins from the plugins/ directory.
 * Supports both external plugins (with manifest.json) and built-in plugins.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CatalogEntry, PluginConfigField } from '@whisper-weave/shared';
import type { PluginBase } from '../types';
import { config } from './config';
import { logger } from './logger';

export interface PluginManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  icon?: string;
  entry: string;
  features: Array<'connector' | 'tools' | 'llm-provider'>;
  configSchema?: PluginConfigField[];
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  catalogEntry: CatalogEntry;
  load: (config: Record<string, unknown>) => Promise<PluginBase>;
}

const loadedPlugins = new Map<string, LoadedPlugin>();

/**
 * Get the plugins directory path from config.
 * Default: /workspaces/whisper-weave/plugins
 * Override with PLUGINS_DIR environment variable.
 */
function getPluginsDir(): string {
  return config.plugins.dir;
}

/**
 * Validates a manifest object.
 */
function validateManifest(manifest: unknown, pluginDir: string): manifest is PluginManifest {
  if (!manifest || typeof manifest !== 'object') {
    logger.warn({ pluginDir }, '[plugins] Invalid manifest: not an object');
    return false;
  }

  const m = manifest as Record<string, unknown>;

  const requiredStrings = ['id', 'name', 'description', 'version', 'entry'];
  for (const field of requiredStrings) {
    if (typeof m[field] !== 'string' || !(m[field] as string).trim()) {
      logger.warn({ pluginDir, field }, '[plugins] Invalid manifest: missing required field');
      return false;
    }
  }

  if (!Array.isArray(m.features) || m.features.length === 0) {
    logger.warn({ pluginDir }, '[plugins] Invalid manifest: features must be a non-empty array');
    return false;
  }

  const validFeatures = ['connector', 'tools', 'llm-provider'];
  for (const f of m.features) {
    if (!validFeatures.includes(f)) {
      logger.warn({ pluginDir, feature: f }, '[plugins] Invalid manifest: unknown feature');
      return false;
    }
  }

  return true;
}

/**
 * Discovers all plugins in the plugins directory.
 * Looks for directories containing a manifest.json file.
 */
export async function discoverPlugins(): Promise<void> {
  const pluginsDir = getPluginsDir();
  logger.info({ pluginsDir }, '[plugins] Discovering external plugins');

  let entries: string[];
  try {
    entries = await readdir(pluginsDir);
  } catch (err) {
    logger.warn({ pluginsDir, error: (err as Error).message }, '[plugins] Failed to read plugins directory');
    return;
  }

  for (const entry of entries) {
    // Skip sdk and hidden directories
    if (entry === 'sdk' || entry.startsWith('.')) {
      continue;
    }

    const pluginDir = join(pluginsDir, entry);
    const manifestPath = join(pluginDir, 'manifest.json');

    try {
      const manifestContent = await readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestContent);

      if (!validateManifest(manifest, pluginDir)) {
        continue;
      }

      // Resolve the entry point path
      const entryPath = join(pluginDir, manifest.entry);

      // Create catalog entry from manifest
      const catalogEntry: CatalogEntry = {
        id: manifest.id,
        type: manifest.id,
        name: manifest.name,
        description: manifest.description,
        icon: manifest.icon,
        features: manifest.features,
        configSchema: manifest.configSchema,
      };

      // Create loader function
      const load = async (config: Record<string, unknown>): Promise<PluginBase> => {
        const module = await import(entryPath);
        const PluginClass = module.default;

        if (typeof PluginClass !== 'function') {
          throw new Error(`Plugin ${manifest.id} does not export a default class`);
        }

        return new PluginClass(config);
      };

      loadedPlugins.set(manifest.id, {
        manifest,
        catalogEntry,
        load,
      });

      logger.info({ pluginId: manifest.id, version: manifest.version, features: manifest.features }, '[plugins] Discovered external plugin');
    } catch (err) {
      // No manifest.json or invalid JSON - skip silently unless it's a parse error
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn({ pluginDir, error: (err as Error).message }, '[plugins] Failed to load plugin manifest');
      }
    }
  }

  logger.info({ count: loadedPlugins.size }, '[plugins] External plugin discovery complete');
}

/**
 * Gets all discovered external plugins.
 */
export function getExternalPlugins(): Map<string, LoadedPlugin> {
  return loadedPlugins;
}

/**
 * Gets a specific external plugin by type/id.
 */
export function getExternalPlugin(type: string): LoadedPlugin | undefined {
  return loadedPlugins.get(type);
}

/**
 * Gets catalog entries for all external plugins.
 */
export function getExternalCatalogEntries(): CatalogEntry[] {
  return [...loadedPlugins.values()].map((p) => p.catalogEntry);
}

/**
 * Checks if a plugin type is an external plugin.
 */
export function isExternalPlugin(type: string): boolean {
  return loadedPlugins.has(type);
}

/**
 * Loads an external plugin instance with the given config.
 */
export async function loadExternalPlugin(type: string, config: Record<string, unknown>): Promise<PluginBase> {
  const plugin = loadedPlugins.get(type);
  if (!plugin) {
    throw new Error(`External plugin not found: ${type}`);
  }

  return plugin.load(config);
}
