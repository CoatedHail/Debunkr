import { app } from '../../src/server.js';

describe('POST /api/check', () => {
  it('returns 202 with a jobId for a valid URL', async () => {
    const res = await app.request('/api/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/a', deviceId: 'dev-1' })
    });
    expect(res.status).toBe(202);
    const body = await res.json() as any;
    expect(body.jobId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.status).toBe('pending');
  });

  it('returns 400 with URL_INVALID for a bad URL', async () => {
    const res = await app.request('/api/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'not-a-url', deviceId: 'dev-1' })
    });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error.code).toBe('URL_INVALID');
    expect(body.error.retryable).toBe(false);
  });

  it('returns 400 when deviceId is missing', async () => {
    const res = await app.request('/api/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/a' })
    });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error.code).toBe('URL_INVALID');
  });
});

describe('GET /api/check/:jobId', () => {
  it('returns 200 with status=complete and the echo for a known jobId', async () => {
    // Submit
    const submit = await app.request('/api/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/echo', deviceId: 'dev-1' })
    });
    const { jobId } = await submit.json() as any;

    // Poll
    const res = await app.request(`/api/check/${jobId}`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe('complete');
    expect(body.echo).toBe('https://example.com/echo');
  });

  it('returns 404 INTERNAL_ERROR for unknown jobId', async () => {
    const res = await app.request('/api/check/unknown-id');
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });
});
