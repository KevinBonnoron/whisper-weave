import type { LLMMessage } from '@whisper-weave/shared';
import { Hono } from 'hono';
import { chatService } from '../services';

export const chatRoutes = new Hono().post('/', async (c) => {
  try {
    const body = await c.req.json<{
      assistantId?: string;
      providerId?: string;
      model?: string;
      messages: LLMMessage[];
      temperature?: number;
      maxTokens?: number;
    }>();
    const { assistantId, providerId, model, messages, temperature, maxTokens } = body;

    if (!messages?.length) {
      return c.json({ success: false, error: 'messages required' }, 400);
    }

    const options = temperature !== undefined || maxTokens !== undefined ? { temperature, maxTokens } : undefined;

    // If assistantId is provided, use assistant-based generation (with tools)
    if (assistantId) {
      const response = await chatService.generateWithAssistant(assistantId, messages, options);
      return c.json(response);
    }

    // Fallback to direct provider/model (legacy, no tools)
    if (!providerId || !model) {
      return c.json({ success: false, error: 'assistantId or (providerId + model) required' }, 400);
    }
    const response = await chatService.generate(providerId, model, messages, options);
    return c.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('not found') || message.includes('disabled')) {
      return c.json({ success: false, error: message }, 404);
    }
    return c.json({ success: false, error: message }, 400);
  }
});
