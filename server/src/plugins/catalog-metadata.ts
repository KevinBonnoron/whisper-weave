import type { CatalogEntry } from '@whisper-weave/shared';
import { getExternalCatalogEntries } from '../lib/plugin-loader';

/** Built-in plugins catalog (only core LLM providers) */
const BUILTIN_CATALOG: CatalogEntry[] = [
  {
    id: 'claude',
    type: 'claude',
    name: 'Claude',
    description: 'Anthropic Claude API',
    icon: 'claude',
    features: ['llm-provider'],
    configSchema: [
      {
        name: 'apiKey',
        type: 'secret',
        label: 'API Key',
        description: 'Anthropic API key',
        required: true,
      },
    ],
  },
  {
    id: 'ollama',
    type: 'ollama',
    name: 'Ollama',
    description: 'Local LLM via Ollama API',
    icon: 'ollama',
    features: ['llm-provider'],
    configSchema: [
      {
        name: 'baseUrl',
        type: 'string',
        label: 'Base URL',
        description: 'Ollama server URL',
        required: false,
        default: 'http://localhost:11434',
      },
    ],
  },
];

/**
 * Get the full plugin catalog (built-in + external plugins).
 * External plugins are discovered at startup from the plugins/ directory.
 */
export function getPluginCatalog(): CatalogEntry[] {
  return [...BUILTIN_CATALOG, ...getExternalCatalogEntries()];
}

/** @deprecated Use getPluginCatalog() instead */
export const PLUGIN_CATALOG = BUILTIN_CATALOG;

export function getCatalogEntry(type: string): CatalogEntry | undefined {
  // Check built-in first
  const builtin = BUILTIN_CATALOG.find((e) => e.type === type);
  if (builtin) {
    return builtin;
  }

  // Check external plugins
  return getExternalCatalogEntries().find((e) => e.type === type);
}
