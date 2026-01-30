import { createCollection } from '@tanstack/db';
import type { PluginRecord } from '@whisper-weave/shared';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pocketbase';

const recordService = pb.collection<PluginRecord>('plugins');

export const pluginsCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
  }),
);
