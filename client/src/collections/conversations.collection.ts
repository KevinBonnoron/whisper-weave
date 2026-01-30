import { createCollection } from '@tanstack/db';
import type { ConversationRecord } from '@whisper-weave/shared';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pocketbase';

const recordService = pb.collection<ConversationRecord>('conversations');

export const conversationsCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
  }),
);
