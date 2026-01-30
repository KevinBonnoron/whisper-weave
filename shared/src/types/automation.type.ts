import type { RecordModel } from './pocketbase.type';

export interface AutomationExecution {
  timestamp: string;
  success: boolean;
  result?: string;
  durationMs?: number;
}

export interface AutomationRecord extends RecordModel {
  name: string;
  enabled: boolean;
  cron: string;
  assistant: string;
  prompt: string;
  executions?: AutomationExecution[];
  maxExecutions?: number;
}
