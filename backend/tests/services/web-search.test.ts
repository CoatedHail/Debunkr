import { searchWeb } from '../../src/services/web-search.js';

type MockResponseInit = {
  status: number;
  json?: unknown;
  jsonThrows?: boolean;
};

function makeResponse(init: MockResponseInit): Response {
  return {
    status: init.status,
    ok: init.status >= 200 && init.status < 300,
    json: async () => {
      if (init.jsonThrows) throw new Error('bad json');
      return init.json;
    }
  } as unknown as Response;
}

function makeFetchFn(resp: Response | (() => Promise<Response>)) {
  const fn = jest.fn(async (_url: string, _init?: unknown) => {
    if (typeof resp === 'function') return resp();
    return resp;
  });
  return fn as unknown as typeof fetch & jest.Mock;
}

const THREE_RESULT_FIXTURE = {
  web: {
    results: [
      {
        url: 'https://www.reuters.com/world/article-1',
        title: 'Reuters: Big Story',
        description: 'A <strong>Reuters</strong> wire report.',
        page_age: '2025-04-01T00:00:00Z'
      },
      {
        url: 'https://randomsite.com/post-2',
        title: 'Random Blog',
        description: 'Some random commentary.',
        page_age: '2025-04-02T00:00:00Z'
      },
      {
        url: 'https://www.nytimes.com/2025/04/03/article',
        title: 'NYT: Coverage',
        description: 'The NYT reports.',
        page_age: '2025-04-03T00:00:00Z'
      }
    ]
  }
};

describe('searchWeb', () => {
  it('happy path: returns 3 hits with isTier1 flags set', async () => {
    const fetchFn = makeFetchFn(makeResponse({ status: 200, json: THREE_RESULT_FIXTURE }));
    const out = await searchWeb('breaking news', {
      fetchFn,
      apiKey: 'test-key'
    });
    expect(out).toHaveLength(3);
    expect(out[0].domain).toBe('reuters.com');
    expect(out[0].isTier1).toBe(true);
    expect(out[1].domain).toBe('randomsite.com');
    expect(out[1].isTier1).toBe(false);
    expect(out[2].domain).toBe('nytimes.com');
    expect(out[2].isTier1).toBe(true);
  });

  it('strips HTML highlights from snippets', async () => {
    const fixture = {
      web: {
        results: [
          {
            url: 'https://example.com/a',
            title: 'T',
            description: 'The <strong>fact</strong> is X'
          }
        ]
      }
    };
    const fetchFn = makeFetchFn(makeResponse({ status: 200, json: fixture }));
    const out = await searchWeb('q', { fetchFn, apiKey: 'k' });
    expect(out).toHaveLength(1);
    expect(out[0].snippet).toBe('The fact is X');
  });

  it('caps snippet length at 300 chars', async () => {
    const longSnippet = 'a'.repeat(500);
    const fixture = {
      web: {
        results: [
          {
            url: 'https://example.com/a',
            title: 'T',
            description: longSnippet
          }
        ]
      }
    };
    const fetchFn = makeFetchFn(makeResponse({ status: 200, json: fixture }));
    const out = await searchWeb('q', { fetchFn, apiKey: 'k' });
    expect(out).toHaveLength(1);
    expect(out[0].snippet.length).toBeLessThanOrEqual(300);
  });

  it('defaults missing optional fields (title/description/page_age)', async () => {
    const fixture = {
      web: {
        results: [
          {
            url: 'https://example.com/a'
            // no title, no description, no page_age
          }
        ]
      }
    };
    const fetchFn = makeFetchFn(makeResponse({ status: 200, json: fixture }));
    const out = await searchWeb('q', { fetchFn, apiKey: 'k' });
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('');
    expect(out[0].snippet).toBe('');
    expect(out[0].publishedDate).toBeUndefined();
  });

  it('skips results with no url', async () => {
    const fixture = {
      web: {
        results: [
          { title: 'no url here', description: 'd' },
          { url: '', title: 'empty url', description: 'd' },
          { url: 'https://example.com/keep', title: 'kept', description: 'd' }
        ]
      }
    };
    const fetchFn = makeFetchFn(makeResponse({ status: 200, json: fixture }));
    const out = await searchWeb('q', { fetchFn, apiKey: 'k' });
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe('https://example.com/keep');
  });

  it('returns [] when web.results is empty', async () => {
    const fetchFn = makeFetchFn(
      makeResponse({ status: 200, json: { web: { results: [] } } })
    );
    const out = await searchWeb('q', { fetchFn, apiKey: 'k' });
    expect(out).toEqual([]);
  });

  it('returns [] when web key is missing', async () => {
    const fetchFn = makeFetchFn(makeResponse({ status: 200, json: {} }));
    const out = await searchWeb('q', { fetchFn, apiKey: 'k' });
    expect(out).toEqual([]);
  });

  it('returns [] and does not call fetch when no API key', async () => {
    const fetchFn = makeFetchFn(makeResponse({ status: 200, json: THREE_RESULT_FIXTURE }));
    const out = await searchWeb('q', { fetchFn, apiKey: '' });
    expect(out).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns [] on 401 (no throw)', async () => {
    const fetchFn = makeFetchFn(makeResponse({ status: 401 }));
    const out = await searchWeb('q', { fetchFn, apiKey: 'k' });
    expect(out).toEqual([]);
  });

  it('returns [] on 429 (rate limited)', async () => {
    const fetchFn = makeFetchFn(makeResponse({ status: 429 }));
    const out = await searchWeb('q', { fetchFn, apiKey: 'k' });
    expect(out).toEqual([]);
  });

  it('returns [] on 503', async () => {
    const fetchFn = makeFetchFn(makeResponse({ status: 503 }));
    const out = await searchWeb('q', { fetchFn, apiKey: 'k' });
    expect(out).toEqual([]);
  });

  it('returns [] when fetch throws (network error)', async () => {
    const fetchFn = jest.fn(async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    const out = await searchWeb('q', { fetchFn, apiKey: 'k' });
    expect(out).toEqual([]);
  });

  it('returns [] on timeout (never-resolving fetch with small timeout)', async () => {
    const fetchFn = jest.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise<Response>((_resolve, reject) => {
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              const err = new Error('aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }
        })
    ) as unknown as typeof fetch;
    const start = Date.now();
    const out = await searchWeb('q', { fetchFn, apiKey: 'k', timeoutMs: 50 });
    const elapsed = Date.now() - start;
    expect(out).toEqual([]);
    expect(elapsed).toBeLessThan(1000);
  });

  it('respects count param in URL', async () => {
    const fetchFn = makeFetchFn(
      makeResponse({ status: 200, json: { web: { results: [] } } })
    );
    await searchWeb('q', { fetchFn, apiKey: 'k', count: 3 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const calledUrl = fetchFn.mock.calls[0][0] as string;
    expect(calledUrl).toContain('count=3');
    expect(calledUrl).toContain('q=q');
    expect(calledUrl).toContain('safesearch=moderate');
  });

  it('sends X-Subscription-Token header with API key', async () => {
    const fetchFn = makeFetchFn(
      makeResponse({ status: 200, json: { web: { results: [] } } })
    );
    await searchWeb('q', { fetchFn, apiKey: 'my-secret-key' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const init = fetchFn.mock.calls[0][1] as { headers?: Record<string, string> };
    expect(init.headers).toBeDefined();
    expect(init.headers!['X-Subscription-Token']).toBe('my-secret-key');
    expect(init.headers!['Accept']).toBe('application/json');
  });
});
