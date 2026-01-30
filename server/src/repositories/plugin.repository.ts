import type { PluginRecord } from '@whisper-weave/shared';
import { databaseRepositoryFactory } from '../factories';

export const pluginRepository = databaseRepositoryFactory<PluginRecord>('plugins');
