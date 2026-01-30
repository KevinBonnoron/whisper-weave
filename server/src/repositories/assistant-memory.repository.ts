import { databaseRepositoryFactory } from '../factories';
import type { AssistantMemoryRecord } from '../types/memory.type';

export const assistantMemoryRepository = databaseRepositoryFactory<AssistantMemoryRecord>('assistant_memories', { expand: 'assistant' });
