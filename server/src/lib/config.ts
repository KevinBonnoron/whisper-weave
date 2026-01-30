import { dirname, join } from 'node:path';

function getEnvOrDefault<T>(name: string, defaultValue: T): T {
  return (process.env[name] as T) || defaultValue;
}

const PROJECT_ROOT = dirname(dirname(dirname(import.meta.dir)));

export const config = {
  nodeEnv: getEnvOrDefault('NODE_ENV', 'development'),
  logLevel: getEnvOrDefault('LOG_LEVEL', 'error'),
  cors: {
    origins: getEnvOrDefault('CORS_ORIGINS', '*'),
    credentials: getEnvOrDefault<'true' | 'false'>('CORS_CREDENTIALS', 'false') === 'true',
    maxAge: Number(getEnvOrDefault('CORS_MAX_AGE', '600')),
  },
  pocketbase: {
    url: getEnvOrDefault('PB_URL', 'http://localhost:8090'),
    superuserEmail: getEnvOrDefault('PB_SUPERUSER_EMAIL', 'admin@whisper-weave.local'),
    superuserPassword: getEnvOrDefault('PB_SUPERUSER_PASSWORD', 'changeme123'),
  },
  plugins: {
    dir: getEnvOrDefault('PLUGINS_DIR', join(PROJECT_ROOT, 'plugins')),
  },
  skills: {
    dir: getEnvOrDefault('SKILLS_DIR', 'skills'),
  },
  files: {
    dir: getEnvOrDefault('FILES_DIR', 'output'),
  },
};
