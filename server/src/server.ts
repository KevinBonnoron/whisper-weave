import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { config } from './lib/config';
import { authRoutes } from './routes/auth.routes';
import { automationsRoutes } from './routes/automations.routes';
import { chatRoutes } from './routes/chat.routes';
import { pluginsRoutes } from './routes';
import { skillsRoutes } from './routes/skills.routes';

export function createServer() {
  const app = new Hono();

  app
    .use(
      '*',
      cors({
        origin: config.cors.origins,
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
        allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
        credentials: config.cors.credentials,
        maxAge: config.cors.maxAge,
      }),
    )
    .route('/api/plugins', pluginsRoutes)
    .route('/api/chat', chatRoutes)
    .route('/api/auth', authRoutes)
    .route('/api/skills', skillsRoutes)
    .route('/api/automations', automationsRoutes);

  return { app };
}
