import type { AutomationExecution, AutomationRecord, LLMMessage, Tool, ToolContext } from '@whisper-weave/shared';
import { CronJob } from 'cron';
import { logger } from '../lib/logger';
import { pb } from '../lib/pocketbase';
import { assistantRepository, automationRepository } from '../repositories';
import { serverPluginManager } from './plugin-manager.service';

const DEFAULT_MAX_EXECUTIONS = 10;

interface ScheduledJob {
  automationId: string;
  job: CronJob;
}

const scheduledJobs = new Map<string, ScheduledJob>();

async function addExecution(automation: AutomationRecord, execution: AutomationExecution): Promise<void> {
  const existingExecutions = automation.executions ?? [];
  const maxExecutions = automation.maxExecutions ?? DEFAULT_MAX_EXECUTIONS;
  const newExecutions = [execution, ...existingExecutions].slice(0, maxExecutions);
  await automationRepository.update(automation.id, { executions: newExecutions });
}

async function executeAutomation(automation: AutomationRecord): Promise<void> {
  logger.debug({ automationId: automation.id, name: automation.name }, '[scheduler] Executing automation');
  const startTime = Date.now();

  try {
    // Get the assistant config
    const assistant = await assistantRepository.getOne(automation.assistant);
    if (!assistant) {
      throw new Error(`Assistant not found: ${automation.assistant}`);
    }

    if (!assistant.llmProvider || !assistant.llmModel) {
      throw new Error('Assistant has no LLM provider or model configured');
    }

    // Build tools from assistant's tool plugins
    const toolIds = Array.isArray(assistant.tools) ? (assistant.tools as string[]) : [];
    const tools: Tool[] = [];
    const nameToInstanceId = new Map<string, string>();

    const instances = serverPluginManager.getAllInstances();
    for (const id of toolIds) {
      const instance = instances.find((i) => i.id === id);
      if (instance?.enabled && instance.tools) {
        tools.push(...instance.tools);
        for (const tool of instance.tools) {
          nameToInstanceId.set(tool.name, id);
        }
      }
    }

    // TODO: Automations need a connector/channel to send results to
    // For now, automations execute tools but don't send messages
    const channelId = 'automation';

    // Build messages
    const messages: LLMMessage[] = [];
    if (assistant.systemPrompt?.trim()) {
      messages.push({ role: 'system', content: assistant.systemPrompt });
    }
    messages.push({ role: 'user', content: automation.prompt });

    // Create action context for tool execution
    const actionContext: ToolContext = {
      userId: 'automation',
      channelId,
      platform: 'automation',
      message: {
        id: `automation-${automation.id}-${Date.now()}`,
        platform: 'automation',
        channelId,
        userId: 'automation',
        username: 'Automation',
        content: automation.prompt,
        timestamp: new Date(),
      },
      assistantId: assistant.id,
    };

    // Generate response with tools
    const response = await serverPluginManager.generateWithProvider(assistant.llmProvider, assistant.llmModel, messages, {
      tools,
      toolNameToInstanceId: nameToInstanceId,
      actionContext,
    });

    // TODO: Send result to a connector - needs connector/channel on automation
    logger.info({ automationId: automation.id, response: response.content.substring(0, 200) }, '[scheduler] Automation completed (no message sent - connector not configured)');

    const durationMs = Date.now() - startTime;
    await addExecution(automation, { timestamp: new Date().toISOString(), success: true, result: 'Success', durationMs });

    logger.debug({ automationId: automation.id, durationMs }, '[scheduler] Automation executed successfully');
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ automationId: automation.id, error: errorMsg }, '[scheduler] Automation failed');

    const durationMs = Date.now() - startTime;
    await addExecution(automation, { timestamp: new Date().toISOString(), success: false, result: errorMsg, durationMs });
  }
}

function scheduleAutomation(automation: AutomationRecord): void {
  // Remove existing job if any
  unscheduleAutomation(automation.id);

  if (!automation.enabled) {
    return;
  }

  try {
    const job = new CronJob(
      automation.cron,
      () => {
        executeAutomation(automation).catch((err) => {
          logger.error({ automationId: automation.id, error: err instanceof Error ? err.message : err }, '[scheduler] Unhandled error in automation execution');
        });
      },
      null,
      true, // start immediately
      'UTC', // timezone
    );

    scheduledJobs.set(automation.id, { automationId: automation.id, job });
    logger.debug({ automationId: automation.id, cron: automation.cron, name: automation.name }, '[scheduler] Automation scheduled');
  } catch (err) {
    logger.error({ automationId: automation.id, cron: automation.cron, error: err instanceof Error ? err.message : err }, '[scheduler] Invalid cron expression');
  }
}

function unscheduleAutomation(automationId: string): void {
  const scheduled = scheduledJobs.get(automationId);
  if (scheduled) {
    scheduled.job.stop();
    scheduledJobs.delete(automationId);
    logger.debug({ automationId }, '[scheduler] Automation unscheduled');
  }
}

export async function initialSyncAutomations(): Promise<void> {
  const automations = await automationRepository.findAll();
  for (const automation of automations) {
    if (automation.enabled) {
      scheduleAutomation(automation);
    }
  }

  logger.info({ count: scheduledJobs.size, total: automations.length }, '[scheduler] Initial automations sync complete');
}

export function subscribeToAutomations(): void {
  pb.collection('automations').subscribe<AutomationRecord>('*', async (e) => {
    const record = e.record;
    const id = record?.id;
    if (!id) {
      return;
    }

    logger.debug({ action: e.action, automationId: id }, '[scheduler] Received automation event');

    if (e.action === 'create') {
      if (record.enabled) {
        scheduleAutomation(record);
      }
      return;
    }

    if (e.action === 'delete') {
      unscheduleAutomation(id);
      return;
    }

    if (e.action === 'update') {
      // Re-schedule (handles enable/disable and cron changes)
      scheduleAutomation(record);
    }
  });
  logger.info('[scheduler] Subscribed to automations collection (realtime)');
}

export const schedulerService = {
  scheduleAutomation,
  unscheduleAutomation,
  executeAutomation,
  getScheduledCount: () => scheduledJobs.size,
};
