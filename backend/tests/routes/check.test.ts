import { app } from '../../src/server.js';
import { setTestDeps } from '../../src/routes/check.js';
import { createJobStore } from '../../src/services/job-store.js';
import { createRateLimiter } from '../../src/services/rate-limiter.js';
import { createCache } from '../../src/services/cache.js';

function mockCostTracker() {
  return {
    check: async () => ({ exceeded: false, monthlySpendUsd: 0, budgetUsd: 0 }),
    record: async () => {}
  };
}

function mockClient(scoreJson?: string) {
  const text = scoreJson ?? JSON.stringify({
    contentQuality: 80,
    contentReasoning: 'Well-sourced.',
    biasScale: 0,
    counterArgument: 'Counter test.'
  });
  return {
    messages: {
      create: jest.fn(async () => ({
        content: [{ type: 'text', text }],
        usage: { input_tokens: 100, output_tokens: 50 }
      }))
    }
  };
}

const SAMPLE_HTML = `<!doctype html><html><head><title>Reuters Test</title></head>
<body><article>${'<p>Substantial article text with multiple cited details. </p>'.repeat(20)}</article></body></html>`;

beforeEach(() => {
  setTestDeps({
    store: createJobStore(),
    client: mockClient() as any,
    rateLimiter: createRateLimiter(),
    costTracker: mockCostTracker() as any,
    cache: createCache(),
    skipSsrfCheck: true
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
    expect(final.overall).toBeGreaterThan(0);
    expect(final.bucket).toBeDefined();
    expect(final.confidence).toBeDefined();
    expect(final.sourceRep).toBeDefined();
    expect(final.bias?.scale).toBe(0);
    expect(final.counterArgument).toBe('Counter test.');
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
    expect(final.overall).toBeGreaterThan(0);
    expect(final.bias?.scale).toBe(0);
    expect(final.bias?.source).toBe('llm');
    expect(final.counterArgument).toContain('STUB');
    expect(final.contentReasoning).toContain('STUB');
  });
});

describe('Dataset lookup integration', () => {
  it('attaches publisher info (high tier) for a known publisher URL', async () => {
    (globalThis as any).fetch = jest.fn(async () =>
      new Response(SAMPLE_HTML, { status: 200, headers: { 'content-type': 'text/html' } })
    );
    const submit = await app.request('/api/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.nytimes.com/2025/x.html', deviceId: 'dev-1' })
    });
    const { jobId } = (await submit.json()) as any;

    let final: any;
    for (let i = 0; i < 50; i++) {
      const r = await app.request(`/api/check/${jobId}`);
      const body = await r.json() as any;
      if (body.status === 'complete' || body.status === 'failed') { final = body; break; }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(final.publisher.canonicalDomain).toBe('nytimes.com');
    expect(final.publisher.reliabilityTier).toBe('high');
    expect(final.publisher.verdicts.length).toBeGreaterThan(0);
  });

  it('returns unknown tier for an unknown publisher URL', async () => {
    (globalThis as any).fetch = jest.fn(async () =>
      new Response(SAMPLE_HTML, { status: 200, headers: { 'content-type': 'text/html' } })
    );
    const submit = await app.request('/api/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://some-random-unknown-blog.example/post', deviceId: 'dev-1' })
    });
    const { jobId } = (await submit.json()) as any;

    let final: any;
    for (let i = 0; i < 50; i++) {
      const r = await app.request(`/api/check/${jobId}`);
      const body = await r.json() as any;
      if (body.status === 'complete' || body.status === 'failed') { final = body; break; }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(final.publisher.reliabilityTier).toBe('unknown');
    expect(final.publisher.verdicts).toHaveLength(0);
  });

  it('attaches publisher info even on extraction failure', async () => {
    (globalThis as any).fetch = jest.fn(async () => { throw new TypeError('boom'); });
    const submit = await app.request('/api/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.bbc.co.uk/news/x', deviceId: 'dev-1' })
    });
    const { jobId } = (await submit.json()) as any;

    let final: any;
    for (let i = 0; i < 50; i++) {
      const r = await app.request(`/api/check/${jobId}`);
      const body = await r.json() as any;
      if (body.status === 'failed') { final = body; break; }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(final.status).toBe('failed');
    expect(final.publisher.canonicalDomain).toBe('bbc.co.uk');
    expect(final.publisher.reliabilityTier).toBe('high');
  });
});

describe('Combined scoring', () => {
  it('uses cheap-signals fallback when publisher is unknown', async () => {
    (globalThis as any).fetch = jest.fn(async () =>
      new Response(SAMPLE_HTML, { status: 200, headers: { 'content-type': 'text/html' } })
    );
    const submit = await app.request('/api/check', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://random-unknown-blog.example/x', deviceId: 'd1' })
    });
    const { jobId } = (await submit.json()) as any;
    let final: any;
    for (let i = 0; i < 50; i++) {
      const r = await app.request(`/api/check/${jobId}`);
      const body = await r.json() as any;
      if (body.status === 'complete' || body.status === 'failed') { final = body; break; }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(final.sourceRepFrom).toBe('cheap-signals');
    expect(final.cheapSignals).toBeDefined();
    expect(final.confidence).toBe('low');
  });

  it('uses publisher tier (high) for nytimes.com', async () => {
    (globalThis as any).fetch = jest.fn(async () =>
      new Response(SAMPLE_HTML, { status: 200, headers: { 'content-type': 'text/html' } })
    );
    const submit = await app.request('/api/check', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.nytimes.com/x.html', deviceId: 'd1' })
    });
    const { jobId } = (await submit.json()) as any;
    let final: any;
    for (let i = 0; i < 50; i++) {
      const r = await app.request(`/api/check/${jobId}`);
      const body = await r.json() as any;
      if (body.status === 'complete' || body.status === 'failed') { final = body; break; }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(final.sourceRepFrom).toBe('curated-wikipedia');
    expect(final.sourceRep).toBe(90); // high tier
  });

  it('confidence is high when publisher in 2+ datasets AND extraction ok', async () => {
    (globalThis as any).fetch = jest.fn(async () =>
      new Response(SAMPLE_HTML, { status: 200, headers: { 'content-type': 'text/html' } })
    );
    const submit = await app.request('/api/check', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.reuters.com/x', deviceId: 'd1' })
    });
    const { jobId } = (await submit.json()) as any;
    let final: any;
    for (let i = 0; i < 50; i++) {
      const r = await app.request(`/api/check/${jobId}`);
      const body = await r.json() as any;
      if (body.status === 'complete' || body.status === 'failed') { final = body; break; }
      await new Promise((r) => setTimeout(r, 100));
    }
    // reuters.com is in BOTH curated + ifcn → datasetCount=2
    expect(final.confidence).toBe('high');
  });
});

describe('POST /api/check/:jobId/deep', () => {
  it('returns 404 INTERNAL_ERROR for unknown jobId', async () => {
    const res = await app.request('/api/check/unknown/deep', { method: 'POST' });
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  it('returns 409 JOB_NOT_COMPLETE if job is still pending', async () => {
    // Never advance the pipeline — submit and immediately request deep
    (globalThis as any).fetch = jest.fn(() => new Promise(() => { /* hang */ }));
    const submit = await app.request('/api/check', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/a', deviceId: 'd1' })
    });
    const { jobId } = (await submit.json()) as any;
    const res = await app.request(`/api/check/${jobId}/deep`, { method: 'POST' });
    expect(res.status).toBe(409);
    const body = await res.json() as any;
    expect(body.error.code).toBe('JOB_NOT_COMPLETE');
  });

  it('runs full deep pipeline against a completed job (stub LLM)', async () => {
    setTestDeps({
      store: createJobStore(),
      client: null  // stub mode
    });
    (globalThis as any).fetch = jest.fn(async () =>
      new Response(SAMPLE_HTML, { status: 200, headers: { 'content-type': 'text/html' } })
    );

    // 1. Submit + wait for complete
    const submit = await app.request('/api/check', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.bbc.co.uk/news/x', deviceId: 'd1' })
    });
    const { jobId } = (await submit.json()) as any;

    let initial: any;
    for (let i = 0; i < 50; i++) {
      const r = await app.request(`/api/check/${jobId}`);
      const body = await r.json() as any;
      if (body.status === 'complete') { initial = body; break; }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(initial.status).toBe('complete');
    expect(initial.deepStatus).toBe('idle');

    // 2. Trigger deep
    const deepRes = await app.request(`/api/check/${jobId}/deep`, { method: 'POST' });
    expect(deepRes.status).toBe(202);

    // 3. Poll for deepStatus complete
    let final: any;
    for (let i = 0; i < 50; i++) {
      const r = await app.request(`/api/check/${jobId}`);
      const body = await r.json() as any;
      if (body.deepStatus === 'complete' || body.deepStatus === 'failed') { final = body; break; }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(final.deepStatus).toBe('complete');
    expect(final.deepAnalysis.skeptic.reasoning).toContain('STUB');
    expect(final.deepAnalysis.advocate.reasoning).toContain('STUB');
    expect(final.deepAnalysis.judge.confidence).toBe('low');
  });
});

describe('POST /api/check/:jobId/deep — M8 fact-check integration', () => {
  function deepMockClient() {
    // Returns valid skeptic/advocate/judge JSON in sequence.
    // Need to also support a base /check call producing content-analysis JSON.
    const responses = [
      // First: the /check pipeline content analysis
      JSON.stringify({
        contentQuality: 80,
        contentReasoning: 'Well-sourced.',
        biasScale: 0,
        counterArgument: 'Counter test.'
      }),
      // Then deep: skeptic + advocate + judge
      JSON.stringify({
        reasoning: 'Sourcing is thin.',
        evidence: ['No named experts.']
      }),
      JSON.stringify({
        reasoning: 'Byline named.',
        evidence: ['Author Jane Doe.']
      }),
      JSON.stringify({
        verdict: 'Mostly credible but fact-check shows issues.',
        confidence: 'medium'
      })
    ];
    let call = 0;
    return {
      messages: {
        create: jest.fn(async () => {
          const text = responses[call] ?? responses[responses.length - 1];
          call += 1;
          return {
            content: [{ type: 'text', text }],
            usage: { input_tokens: 100, output_tokens: 50 }
          };
        })
      }
    };
  }

  const CONTRADICTING_EVIDENCE = {
    verdict: 'contradicted' as const,
    confidence: 'high' as const,
    citations: [
      {
        source: 'Snopes',
        url: 'https://snopes.com/x',
        snippet: 'Claim refuted.',
        supports: 'contradicts' as const
      }
    ],
    scoreDelta: -20,
    reasoning: 'Fact-check sources refute the central claim.'
  };

  it('shifts overall by evidence scoreDelta and persists evidence to JobResult', async () => {
    const recordedCosts: any[] = [];
    setTestDeps({
      store: createJobStore(),
      client: deepMockClient() as any,
      rateLimiter: createRateLimiter(),
      costTracker: {
        check: async () => ({ exceeded: false, monthlySpendUsd: 0, budgetUsd: 100 }),
        record: async (c: any) => { recordedCosts.push(c); }
      } as any,
      cache: createCache(),
      skipSsrfCheck: true,
      runFactCheckFn: jest.fn(async () => ({
        evidence: CONTRADICTING_EVIDENCE,
        usage: { input_tokens: 555, output_tokens: 111 }
      }))
    });
    (globalThis as any).fetch = jest.fn(async () =>
      new Response(SAMPLE_HTML, { status: 200, headers: { 'content-type': 'text/html' } })
    );

    // Submit + wait for complete
    const submit = await app.request('/api/check', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.nytimes.com/2025/x.html', deviceId: 'd1' })
    });
    const { jobId } = (await submit.json()) as any;

    let initial: any;
    for (let i = 0; i < 50; i++) {
      const r = await app.request(`/api/check/${jobId}`);
      const body = await r.json() as any;
      if (body.status === 'complete') { initial = body; break; }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(initial.status).toBe('complete');
    const initialOverall = initial.overall;
    expect(typeof initialOverall).toBe('number');

    // Trigger deep
    const deepRes = await app.request(`/api/check/${jobId}/deep`, { method: 'POST' });
    expect(deepRes.status).toBe(202);

    // Poll for deepStatus complete
    let final: any;
    for (let i = 0; i < 50; i++) {
      const r = await app.request(`/api/check/${jobId}`);
      const body = await r.json() as any;
      if (body.deepStatus === 'complete' || body.deepStatus === 'failed') { final = body; break; }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(final.deepStatus).toBe('complete');
    expect(final.deepAnalysis.evidence).toBeDefined();
    expect(final.deepAnalysis.evidence.verdict).toBe('contradicted');
    expect(final.deepAnalysis.evidence.scoreDelta).toBe(-20);
    // overall shifted by -20 (clamped [5,95]).
    const expectedShifted = Math.max(5, Math.min(95, Math.round(initialOverall - 20)));
    expect(final.overall).toBe(expectedShifted);
    // bucket recomputed
    expect(final.bucket).toBeDefined();

    // Cost tracker recorded the fact-check usage as a separate entry.
    const factCheckCost = recordedCosts.find(
      (c) => c.inputTokens === 555 && c.outputTokens === 111
    );
    expect(factCheckCost).toBeDefined();
    expect(factCheckCost.jobId).toBe(jobId);
  });

  it('does not shift overall when fact-check returns no evidence (scoreDelta 0)', async () => {
    setTestDeps({
      store: createJobStore(),
      client: deepMockClient() as any,
      rateLimiter: createRateLimiter(),
      costTracker: mockCostTracker() as any,
      cache: createCache(),
      skipSsrfCheck: true,
      runFactCheckFn: jest.fn(async () => ({
        evidence: {
          verdict: 'uncorroborated' as const,
          confidence: 'low' as const,
          citations: [],
          scoreDelta: 0,
          reasoning: 'No verifiable claims'
        },
        usage: { input_tokens: 0, output_tokens: 0 }
      }))
    });
    (globalThis as any).fetch = jest.fn(async () =>
      new Response(SAMPLE_HTML, { status: 200, headers: { 'content-type': 'text/html' } })
    );

    const submit = await app.request('/api/check', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.nytimes.com/2025/x.html', deviceId: 'd1' })
    });
    const { jobId } = (await submit.json()) as any;

    let initial: any;
    for (let i = 0; i < 50; i++) {
      const r = await app.request(`/api/check/${jobId}`);
      const body = await r.json() as any;
      if (body.status === 'complete') { initial = body; break; }
      await new Promise((r) => setTimeout(r, 100));
    }
    const initialOverall = initial.overall;

    await app.request(`/api/check/${jobId}/deep`, { method: 'POST' });
    let final: any;
    for (let i = 0; i < 50; i++) {
      const r = await app.request(`/api/check/${jobId}`);
      const body = await r.json() as any;
      if (body.deepStatus === 'complete' || body.deepStatus === 'failed') { final = body; break; }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(final.deepStatus).toBe('complete');
    expect(final.overall).toBe(initialOverall);
  });
});

describe('Production hardening wiring', () => {
  it('returns 429 RATE_LIMITED when single-check cap hit', async () => {
    setTestDeps({
      store: createJobStore(),
      client: mockClient() as any,
      rateLimiter: {
        consume: () => ({ allowed: false, remaining: 0, retryAfter: 3600 })
      },
      skipSsrfCheck: true
    });
    (globalThis as any).fetch = jest.fn(async () =>
      new Response(SAMPLE_HTML, { status: 200, headers: { 'content-type': 'text/html' } })
    );
    const res = await app.request('/api/check', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/a', deviceId: 'd1' })
    });
    expect(res.status).toBe(429);
    const body = await res.json() as any;
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.retryAfter).toBeGreaterThan(0);
  });

  it('returns 503 BUDGET_EXCEEDED when monthly cap hit', async () => {
    setTestDeps({
      store: createJobStore(),
      client: mockClient() as any,
      costTracker: {
        check: async () => ({ exceeded: true, monthlySpendUsd: 100, budgetUsd: 10 }),
        record: async () => {}
      },
      skipSsrfCheck: true
    });
    const res = await app.request('/api/check', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/a', deviceId: 'd1' })
    });
    expect(res.status).toBe(503);
    const body = await res.json() as any;
    expect(body.error.code).toBe('BUDGET_EXCEEDED');
  });
});
