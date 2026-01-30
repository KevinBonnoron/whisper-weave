/**
 * Plugin Manifest Schema
 *
 * Each plugin must have a manifest.json file that describes its metadata and capabilities.
 */

export type PluginFeature = 'connector' | 'tools' | 'llm-provider';

export interface PluginConfigField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'secret' | 'string-list' | 'select' | 'oauth' | 'record';
  label: string;
  description?: string;
  required?: boolean;
  default?: string | number | boolean | string[];
  placeholder?: string;
  /** Options for select type */
  options?: Array<{ value: string; label: string }>;
  /** Fixed keys for record type (rendered as tabs with a textarea per key) */
  keys?: Array<{ value: string; label: string }>;
}

export interface PluginManifest {
  /** Unique identifier for the plugin (e.g., "web-search") */
  id: string;

  /** Display name */
  name: string;

  /** Short description of what the plugin does */
  description: string;

  /** Semantic version (e.g., "1.0.0") */
  version: string;

  /** Author name or organization */
  author?: string;

  /** Icon name (for UI display) */
  icon?: string;

  /** Entry point file relative to manifest (e.g., "./src/index.ts") */
  entry: string;

  /** Capabilities this plugin provides */
  features: PluginFeature[];

  /** Configuration schema for the plugin */
  configSchema?: PluginConfigField[];
}

/**
 * Validates a plugin manifest object.
 * Returns an array of validation errors (empty if valid).
 */
export function validateManifest(manifest: unknown): string[] {
  const errors: string[] = [];

  if (!manifest || typeof manifest !== 'object') {
    return ['Manifest must be an object'];
  }

  const m = manifest as Record<string, unknown>;
  if (typeof m.id !== 'string' || !m.id.trim()) {
    errors.push('id is required and must be a non-empty string');
  }

  if (typeof m.name !== 'string' || !m.name.trim()) {
    errors.push('name is required and must be a non-empty string');
  }

  if (typeof m.description !== 'string') {
    errors.push('description is required and must be a string');
  }

  if (typeof m.version !== 'string' || !m.version.trim()) {
    errors.push('version is required and must be a non-empty string');
  }

  if (typeof m.entry !== 'string' || !m.entry.trim()) {
    errors.push('entry is required and must be a non-empty string');
  }

  if (!Array.isArray(m.features) || m.features.length === 0) {
    errors.push('features is required and must be a non-empty array');
  } else {
    const validFeatures = ['connector', 'tools', 'llm-provider'];
    for (const f of m.features) {
      if (!validFeatures.includes(f)) {
        errors.push(`Invalid feature: ${f}. Must be one of: ${validFeatures.join(', ')}`);
      }
    }
  }

  return errors;
}
