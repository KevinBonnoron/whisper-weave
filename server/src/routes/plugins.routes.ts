import { Hono } from 'hono';
import { pluginService } from '../services';

export const pluginsRoutes = new Hono()
  .get('/catalog', (c) => {
    const catalog = pluginService.getCatalog();
    return c.json(catalog);
  })

  .get('/instances', (c) => {
    const instances = pluginService.getInstances();
    return c.json(instances);
  });
