import { createCollection } from '@tanstack/db';
import type { AssistantRecord } from '@whisper-weave/shared';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pocketbase';

const recordService = pb.collection<AssistantRecord>('assistants');

export const assistantsCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
    options: {
      expand: 'llmProvider,tools',
    },
  }),
);
