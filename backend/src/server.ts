import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { checkRoutes } from './routes/check.js';

export const app = new Hono();

// Permissive CORS for V1 — backend has no auth and exposes only POST/GET /api/check.
// Tighten to specific origins when mobile builds ship + web version exists.
app.use('*', cors());

app.get('/health', (c) => {
  return c.json({ ok: true });
});

app.route('/api', checkRoutes);
