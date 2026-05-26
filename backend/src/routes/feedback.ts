import { Hono } from 'hono';
import { createFeedbackStore, type FeedbackStore } from '../services/feedback-store.js';
import type { ApiError } from '../types/api.js';
import path from 'node:path';

let store: FeedbackStore = createFeedbackStore({
  dataDir: path.resolve(process.cwd(), 'data')
});

export function setFeedbackTestDeps(deps: { store?: FeedbackStore }): void {
  if (deps.store) store = deps.store;
}

export const feedbackRoutes = new Hono();

feedbackRoutes.post('/feedback', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.jobId !== 'string' || typeof body.deviceId !== 'string'
      || (body.vote !== 'up' && body.vote !== 'down')) {
    const err: ApiError = {
      error: {
        code: 'URL_INVALID',
        message: 'Request must include {jobId, deviceId, vote: "up"|"down"}.',
        retryable: false
      }
    };
    return c.json(err, 400);
  }
  const comment = (typeof body.comment === 'string' && body.comment.length > 0 && body.comment.length <= 2_000)
    ? body.comment
    : undefined;

  await store.record({
    jobId: body.jobId,
    deviceId: body.deviceId,
    vote: body.vote,
    comment
  });

  return c.json({ ok: true }, 201);
});
