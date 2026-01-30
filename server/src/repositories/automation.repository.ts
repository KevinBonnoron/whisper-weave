import type { AutomationRecord } from '@whisper-weave/shared';
import { databaseRepositoryFactory } from '../factories';

export const automationRepository = databaseRepositoryFactory<AutomationRecord>('automations', {
  expand: 'assistant',
});
