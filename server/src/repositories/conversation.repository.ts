import type { ConversationRecord } from '@whisper-weave/shared';
import { databaseRepositoryFactory } from '../factories';

export const conversationRepository = databaseRepositoryFactory<ConversationRecord>('conversations');
