import { checkEntity, checkEntities } from '../../src/services/wikipedia-check.js';

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

const STANDARD_FIXTURE = {
  type: 'standard',
  extract: 'Joseph Robinette Biden Jr. is an American politician.',
  content_urls: {
    desktop: {
      page: 'https://en.wikipedia.org/wiki/Joe_Biden'
    }
  }
};

const DISAMBIGUATION_FIXTURE = {
  type: 'disambiguation',
  extract: 'Mercury may refer to:',
  content_urls: {
    desktop: {
      page: 'https://en.wikipedia.org/wiki/Mercury'
    }
  }
};

describe('checkEntity', () => {
  it('returns exists with extract and pageUrl on 200 standard page', async () => {
    const fetchFn = makeFetchFn(makeResponse({ status: 200, json: STANDARD_FIXTURE }));
    const out = await checkEntity('Joe Biden', { fetchFn });
    expect(out.name).toBe('Joe Biden');
    expect(out.exists).toBe(true);
    expect(out.isDisambiguation).toBe(false);
    expect(out.extract).toBe('Joseph Robinette Biden Jr. is an American politician.');
    expect(out.pageUrl).toBe('https://en.wikipedia.org/wiki/Joe_Biden');
  });

  it('returns exists=false on 404', async () => {
    const fetchFn = makeFetchFn(makeResponse({ status: 404 }));
    const out = await checkEntity('Nonexistent Person 1234', { fetchFn });
    expect(out.exists).toBe(false);
    expect(out.isDisambiguation).toBe(false);
  });

  it('returns isDisambiguation=true without extract on disambiguation page', async () => {
    const fetchFn = makeFetchFn(
      makeResponse({ status: 200, json: DISAMBIGUATION_FIXTURE })
    );
    const out = await checkEntity('Mercury', { fetchFn });
    expect(out.exists).toBe(true);
    expect(out.isDisambiguation).toBe(true);
    expect(out.extract).toBeUndefined();
    expect(out.pageUrl).toBe('https://en.wikipedia.org/wiki/Mercury');
  });

  it('returns exists=false on 5xx', async () => {
    const fetchFn = makeFetchFn(makeResponse({ status: 503 }));
    const out = await checkEntity('Joe Biden', { fetchFn });
    expect(out.exists).toBe(false);
    expect(out.isDisambiguation).toBe(false);
  });

  it('returns exists=false on network error', async () => {
    const fetchFn = jest.fn(async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    const out = await checkEntity('Joe Biden', { fetchFn });
    expect(out.exists).toBe(false);
  });

  it('returns exists=false on timeout', async () => {
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
    const out = await checkEntity('Joe Biden', { fetchFn, timeoutMs: 50 });
    const elapsed = Date.now() - start;
    expect(out.exists).toBe(false);
    expect(elapsed).toBeLessThan(1000);
  });

  it('returns empty-name shape for empty input without fetching', async () => {
    const fetchFn = makeFetchFn(makeResponse({ status: 200, json: STANDARD_FIXTURE }));
    const out = await checkEntity('   ', { fetchFn });
    expect(out).toEqual({ name: '', exists: false, isDisambiguation: false });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('properly encodes names with spaces/special chars in URL', async () => {
    const fetchFn = makeFetchFn(makeResponse({ status: 200, json: STANDARD_FIXTURE }));
    await checkEntity('Joe Biden', { fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const calledUrl = fetchFn.mock.calls[0][0] as string;
    expect(calledUrl).toContain('Joe%20Biden');
    expect(calledUrl).toContain('https://en.wikipedia.org/api/rest_v1/page/summary/');
  });

  it('sends User-Agent and Accept headers', async () => {
    const fetchFn = makeFetchFn(makeResponse({ status: 200, json: STANDARD_FIXTURE }));
    await checkEntity('Joe Biden', { fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const init = fetchFn.mock.calls[0][1] as { headers?: Record<string, string> };
    expect(init.headers).toBeDefined();
    expect(init.headers!['User-Agent']).toMatch(/^FakeNewsDetector\//);
    expect(init.headers!['Accept']).toBe('application/json');
  });

  it('hits zh.wikipedia.org first when locale starts with "zh" and returns hit', async () => {
    const ZH_FIXTURE = {
      type: 'standard',
      extract: '習近平是中華人民共和國政治人物。',
      content_urls: {
        desktop: { page: 'https://zh.wikipedia.org/wiki/%E7%BF%92%E8%BF%91%E5%B9%B3' }
      }
    };
    const fetchFn = makeFetchFn(makeResponse({ status: 200, json: ZH_FIXTURE }));
    const out = await checkEntity('习近平', { fetchFn, locale: 'zh-Hans' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const calledUrl = fetchFn.mock.calls[0][0] as string;
    expect(calledUrl).toContain('https://zh.wikipedia.org/api/rest_v1/page/summary/');
    expect(out.exists).toBe(true);
    expect(out.extract).toBe('習近平是中華人民共和國政治人物。');
    expect(out.pageUrl).toBe('https://zh.wikipedia.org/wiki/%E7%BF%92%E8%BF%91%E5%B9%B3');
  });

  it('falls back to en.wikipedia.org when zh returns 404', async () => {
    const calls: string[] = [];
    const fetchFn = jest.fn(async (url: string) => {
      calls.push(url);
      if (url.includes('zh.wikipedia.org')) {
        return makeResponse({ status: 404 });
      }
      return makeResponse({ status: 200, json: STANDARD_FIXTURE });
    }) as unknown as typeof fetch & jest.Mock;
    const out = await checkEntity('Joe Biden', { fetchFn, locale: 'zh' });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(calls[0]).toContain('zh.wikipedia.org');
    expect(calls[1]).toContain('en.wikipedia.org');
    expect(out.exists).toBe(true);
    expect(out.extract).toBe('Joseph Robinette Biden Jr. is an American politician.');
    expect(out.pageUrl).toBe('https://en.wikipedia.org/wiki/Joe_Biden');
  });

  it('returns exists=false when both zh and en return 404', async () => {
    const fetchFn = makeFetchFn(makeResponse({ status: 404 }));
    const out = await checkEntity('Nonexistent 1234', { fetchFn, locale: 'zh-CN' });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(out.exists).toBe(false);
  });

  it('ignores non-zh locales and hits en.wikipedia.org directly', async () => {
    const fetchFn = makeFetchFn(makeResponse({ status: 200, json: STANDARD_FIXTURE }));
    await checkEntity('Joe Biden', { fetchFn, locale: 'fr' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const calledUrl = fetchFn.mock.calls[0][0] as string;
    expect(calledUrl).toContain('en.wikipedia.org');
    expect(calledUrl).not.toContain('zh.wikipedia.org');
  });
});

describe('checkEntities', () => {
  it('dedupes case-insensitively and preserves first-occurrence casing', async () => {
    const fetchFn = makeFetchFn(makeResponse({ status: 200, json: STANDARD_FIXTURE }));
    const out = await checkEntities(
      ['Joe Biden', 'joe biden', 'JOE BIDEN', 'Kamala Harris'],
      { fetchFn }
    );
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(out).toHaveLength(2);
    expect(out[0].name).toBe('Joe Biden');
    expect(out[1].name).toBe('Kamala Harris');
  });

  it('caps at 5 entities', async () => {
    const fetchFn = makeFetchFn(makeResponse({ status: 200, json: STANDARD_FIXTURE }));
    const out = await checkEntities(
      ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
      { fetchFn }
    );
    expect(fetchFn).toHaveBeenCalledTimes(5);
    expect(out).toHaveLength(5);
  });

  it('returns [] for empty input without fetching', async () => {
    const fetchFn = makeFetchFn(makeResponse({ status: 200, json: STANDARD_FIXTURE }));
    const out = await checkEntities([], { fetchFn });
    expect(out).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('fans out fetches in parallel (all calls fire before any resolves)', async () => {
    let resolveCount = 0;
    let firedBeforeAnyResolve = 0;
    const pending: Array<() => void> = [];
    const fetchFn = jest.fn(
      (_url: string, _init?: unknown) =>
        new Promise<Response>((resolve) => {
          // At the moment this fetch is invoked, count how many resolves have happened.
          if (resolveCount === 0) firedBeforeAnyResolve += 1;
          pending.push(() => {
            resolveCount += 1;
            resolve(makeResponse({ status: 200, json: STANDARD_FIXTURE }));
          });
        })
    ) as unknown as typeof fetch;

    const promise = checkEntities(['A', 'B', 'C'], { fetchFn });
    // Give microtasks a tick so all parallel fetches are dispatched.
    await Promise.resolve();
    await Promise.resolve();
    expect(firedBeforeAnyResolve).toBe(3);
    // Resolve them all.
    pending.forEach((r) => r());
    const out = await promise;
    expect(out).toHaveLength(3);
  });
});
