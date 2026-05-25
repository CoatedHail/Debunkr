import { Hono } from 'hono';
import { checkRoutes } from './routes/check.js';

export const app = new Hono();

app.get('/health', (c) => {
  return c.json({ ok: true });
});

app.route('/api', checkRoutes);
