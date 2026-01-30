import type { AssistantRecord, Expand } from '@whisper-weave/shared';

export interface MemoryEntry {
  key: string;
  value: string;
  updatedAt: string;
}

export interface AssistantMemoryRecord extends Expand<{ assistant: AssistantRecord }> {
  assistant: string;
  userId: string;
  entries: MemoryEntry[];
}
