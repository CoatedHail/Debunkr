import { serve } from '@hono/node-server';
import pino from 'pino';
import { app } from './server.js';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty' }
    : undefined
});

const port = Number(process.env.PORT ?? 4000);

serve({ fetch: app.fetch, port }, (info) => {
  logger.info(`Backend listening on http://localhost:${info.port}`);
});
