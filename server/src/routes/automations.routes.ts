import { Hono } from 'hono';
import { logger } from '../lib/logger';
import { automationRepository } from '../repositories';
import { schedulerService } from '../services';

export const automationsRoutes = new Hono()
  .get('/', async (c) => {
    const automations = await automationRepository.findAll();
    return c.json(automations);
  })

  .post('/:id/run', async (c) => {
    const id = c.req.param('id');
    const automation = await automationRepository.getOne(id);
    if (!automation) {
      return c.json({ error: 'Automation not found' }, 404);
    }

    // Execute immediately in background (don't block the response)
    schedulerService.executeAutomation(automation).catch((err) => {
      logger.error({ automationId: id, error: err instanceof Error ? err.message : String(err) }, '[automations] Manual run failed');
    });

    return c.json({ success: true, message: 'Automation triggered' });
  })

  .get('/status', (c) => {
    return c.json({
      scheduledCount: schedulerService.getScheduledCount(),
    });
  });
