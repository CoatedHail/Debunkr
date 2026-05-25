import { serve } from '@hono/node-server';
import pino from 'pino';
import { env, hasRealLlm } from './config/env.js';
import { app } from './server.js';

const logger = pino({
  level: env.logLevel,
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty' }
    : undefined
});

serve({ fetch: app.fetch, port: env.port }, (info) => {
  logger.info(`Backend listening on http://localhost:${info.port}`);
  if (hasRealLlm()) {
    logger.info(`LLM: real Claude (${env.anthropicModel})`);
  } else {
    logger.warn('LLM: STUB mode (no ANTHROPIC_API_KEY in .env — returns fixed score 75)');
  }
});
