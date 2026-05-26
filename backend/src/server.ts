import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { checkRoutes } from './routes/check.js';
import { feedbackRoutes } from './routes/feedback.js';

export const app = new Hono();

// Permissive CORS for V1.
app.use('*', cors());

app.get('/health', (c) => {
  return c.json({ ok: true });
});

app.route('/api', checkRoutes);
app.route('/api', feedbackRoutes);
