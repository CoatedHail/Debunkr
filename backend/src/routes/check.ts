import { Hono } from 'hono';
import { isValidUrl } from '../services/url-validator.js';
import { createJobStore } from '../services/job-store.js';
import type { ApiError } from '../types/api.js';

// In M1 the JobStore is module-singleton. In M2+ this moves to a dependency-
// injection container so tests can use isolated stores.
const store = createJobStore();

export const checkRoutes = new Hono();

checkRoutes.post('/check', async (c) => {
  const body = await c.req.json().catch(() => null);

  if (!body || typeof body.url !== 'string' || typeof body.deviceId !== 'string') {
    const err: ApiError = {
      error: {
        code: 'URL_INVALID',
        message: 'Request must include {url, deviceId}.',
        retryable: false
      }
    };
    return c.json(err, 400);
  }

  if (!isValidUrl(body.url)) {
    const err: ApiError = {
      error: {
        code: 'URL_INVALID',
        message: 'URL is not a valid http or https URL.',
        retryable: false
      }
    };
    return c.json(err, 400);
  }

  const job = store.create({ url: body.url });
  // M1 stub: immediately "complete" the job with the URL echoed back.
  store.complete(job.jobId, { echo: body.url });

  return c.json({ jobId: job.jobId, status: 'pending' }, 202);
});

checkRoutes.get('/check/:jobId', (c) => {
  const jobId = c.req.param('jobId');
  const job = store.get(jobId);
  if (!job) {
    const err: ApiError = {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unknown jobId.',
        retryable: false
      }
    };
    return c.json(err, 404);
  }
  return c.json(job, 200);
});
