import { createCollection } from '@tanstack/db';
import type { AutomationRecord } from '@whisper-weave/shared';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pocketbase';

const recordService = pb.collection<AutomationRecord>('automations');

export const automationsCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
    options: {
      expand: 'assistant',
    },
  }),
);
