import { app } from '../../src/server.js';
import { setTestDeps } from '../../src/routes/check.js';
import { createJobStore } from '../../src/services/job-store.js';

function mockClient(scoreText: string) {
  return {
    messages: {
      create: jest.fn(async () => ({
        content: [{ type: 'text', text: scoreText }],
        usage: { input_tokens: 100, output_tokens: 30 }
      }))
    }
  };
}

const SAMPLE_HTML = `<!doctype html><html><head><title>Reuters Test</title></head>
<body><article>${'<p>Substantial article text with multiple cited details. </p>'.repeat(20)}</article></body></html>`;

beforeEach(() => {
  setTestDeps({
    store: createJobStore(),
    client: mockClient('{"contentQuality": 80, "contentReasoning": "Well-sourced."}') as any
  });

  (globalThis as any).fetch = jest.fn(async () =>
    new Response(SAMPLE_HTML, { status: 200, headers: { 'content-type': 'text/html' } })
  );
});

afterEach(() => {
  delete (globalThis as any).fetch;
});

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

  it('returns 400 URL_INVALID for a bad URL', async () => {
    const res = await app.request('/api/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'not-a-url', deviceId: 'dev-1' })
    });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error.code).toBe('URL_INVALID');
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

describe('GET /api/check/:jobId — full pipeline', () => {
  it('progresses pending → partial → complete', async () => {
    const submit = await app.request('/api/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/a', deviceId: 'dev-1' })
    });
    const { jobId } = (await submit.json()) as any;

    let final: any;
    for (let i = 0; i < 50; i++) {
      const r = await app.request(`/api/check/${jobId}`);
      const body = await r.json() as any;
      if (body.status === 'complete' || body.status === 'failed') { final = body; break; }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(final).toBeDefined();
    expect(final.status).toBe('complete');
    expect(final.contentQuality).toBe(80);
    expect(final.article.title).toBe('Reuters Test');
  });

  it('moves to failed when fetch errors', async () => {
    (globalThis as any).fetch = jest.fn(async () => { throw new TypeError('boom'); });
    const submit = await app.request('/api/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/dead', deviceId: 'dev-1' })
    });
    const { jobId } = (await submit.json()) as any;

    let final: any;
    for (let i = 0; i < 50; i++) {
      const r = await app.request(`/api/check/${jobId}`);
      const body = await r.json() as any;
      if (body.status === 'failed' || body.status === 'complete') { final = body; break; }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(final.status).toBe('failed');
    expect(final.error.code).toBe('EXTRACTION_FAILED');
  });

  it('returns 404 INTERNAL_ERROR for unknown jobId', async () => {
    const res = await app.request('/api/check/unknown-id');
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });
});

describe('Stub LLM mode (no client)', () => {
  it('produces a complete job with stub score when client is null', async () => {
    setTestDeps({
      store: createJobStore(),
      client: null
    });

    const submit = await app.request('/api/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/a', deviceId: 'dev-1' })
    });
    const { jobId } = (await submit.json()) as any;

    let final: any;
    for (let i = 0; i < 50; i++) {
      const r = await app.request(`/api/check/${jobId}`);
      const body = await r.json() as any;
      if (body.status === 'complete' || body.status === 'failed') { final = body; break; }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(final.status).toBe('complete');
    expect(final.contentQuality).toBe(75);
    expect(final.contentReasoning).toContain('STUB');
  });
});
