import type { AssistantRecord } from '@whisper-weave/shared';
import { databaseRepositoryFactory } from '../factories';

export const assistantRepository = databaseRepositoryFactory<AssistantRecord>('assistants');
