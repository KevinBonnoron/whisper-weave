import { initialSyncFromPb, subscribeToPlugins } from './lib/plugin';
import { discoverPlugins } from './lib/plugin-loader';
import { initializePocketBase } from './lib/pocketbase';
import { createServer } from './server';
import { initialSyncAutomations, subscribeToAutomations } from './services/scheduler.service';

await initializePocketBase();
await discoverPlugins();
await initialSyncFromPb();
await initialSyncAutomations();
subscribeToPlugins();
subscribeToAutomations();
const { app } = createServer();

export default {
  port: 3000,
  hostname: '0.0.0.0',
  fetch: app.fetch,
  idleTimeout: 255,
};
