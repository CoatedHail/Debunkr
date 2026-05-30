import {
  searchFactChecks,
  normalizeRating,
  FactCheckAuthError
} from '../../src/services/fact-check-api.js';

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

const TWO_CLAIM_FIXTURE = {
  claims: [
    {
      text: 'The CDC reported 150,000 new flu cases in January 2025.',
      claimReview: [
        {
          publisher: { name: 'PolitiFact' },
          url: 'https://politifact.com/article/1',
          textualRating: 'False',
          reviewDate: '2025-02-01T00:00:00Z'
        }
      ]
    },
    {
      text: 'President Smith signed the bill on March 3, 2025.',
      claimReview: [
        {
          publisher: { name: 'Snopes' },
          url: 'https://snopes.com/article/2',
          textualRating: 'Mostly True',
          reviewDate: '2025-03-04T00:00:00Z'
        }
      ]
    }
  ]
};

describe('searchFactChecks', () => {
  it('happy path: parses and normalizes 2 claims', async () => {
    const fetchFn = makeFetchFn(makeResponse({ status: 200, json: TWO_CLAIM_FIXTURE }));
    const out = await searchFactChecks('flu cases', {
      fetchFn,
      apiKey: 'test-key'
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      claimText: 'The CDC reported 150,000 new flu cases in January 2025.',
      reviewerName: 'PolitiFact',
      rating: 'False',
      normalizedRating: 'false',
      reviewUrl: 'https://politifact.com/article/1',
      datePublished: '2025-02-01T00:00:00Z'
    });
    expect(out[1].reviewerName).toBe('Snopes');
    expect(out[1].normalizedRating).toBe('mostly-true');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const calledUrl = fetchFn.mock.calls[0][0] as string;
    expect(calledUrl).toContain('factchecktools.googleapis.com');
    expect(calledUrl).toContain('query=flu%20cases');
    expect(calledUrl).toContain('languageCode=en');
    expect(calledUrl).toContain('pageSize=5');
    expect(calledUrl).toContain('key=test-key');
  });

  it('returns [] when claims array is empty', async () => {
    const fetchFn = makeFetchFn(makeResponse({ status: 200, json: { claims: [] } }));
    const out = await searchFactChecks('q', { fetchFn, apiKey: 'k' });
    expect(out).toEqual([]);
  });

  it('returns [] when claims key is missing', async () => {
    const fetchFn = makeFetchFn(makeResponse({ status: 200, json: {} }));
    const out = await searchFactChecks('q', { fetchFn, apiKey: 'k' });
    expect(out).toEqual([]);
  });

  it('returns [] and does not call fetch when no API key', async () => {
    const fetchFn = makeFetchFn(makeResponse({ status: 200, json: TWO_CLAIM_FIXTURE }));
    // Pass empty apiKey override to suppress env-based key.
    const out = await searchFactChecks('q', { fetchFn, apiKey: '' });
    expect(out).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('throws FactCheckAuthError on 401', async () => {
    const fetchFn = makeFetchFn(makeResponse({ status: 401 }));
    await expect(
      searchFactChecks('q', { fetchFn, apiKey: 'k' })
    ).rejects.toBeInstanceOf(FactCheckAuthError);
  });

  it('throws FactCheckAuthError on 403', async () => {
    const fetchFn = makeFetchFn(makeResponse({ status: 403 }));
    await expect(
      searchFactChecks('q', { fetchFn, apiKey: 'k' })
    ).rejects.toBeInstanceOf(FactCheckAuthError);
  });

  it('returns [] on 503', async () => {
    const fetchFn = makeFetchFn(makeResponse({ status: 503 }));
    const out = await searchFactChecks('q', { fetchFn, apiKey: 'k' });
    expect(out).toEqual([]);
  });

  it('returns [] on 404', async () => {
    const fetchFn = makeFetchFn(makeResponse({ status: 404 }));
    const out = await searchFactChecks('q', { fetchFn, apiKey: 'k' });
    expect(out).toEqual([]);
  });

  it('returns [] when fetch throws (network error)', async () => {
    const fetchFn = jest.fn(async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    const out = await searchFactChecks('q', { fetchFn, apiKey: 'k' });
    expect(out).toEqual([]);
  });

  it('returns [] on timeout (never-resolving fetch with small timeout)', async () => {
    const fetchFn = jest.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise<Response>((_resolve, reject) => {
          // Reject when the AbortController fires, simulating real fetch behavior.
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
    const out = await searchFactChecks('q', { fetchFn, apiKey: 'k', timeoutMs: 50 });
    const elapsed = Date.now() - start;
    expect(out).toEqual([]);
    expect(elapsed).toBeLessThan(1000);
  });

  it('returns [] when JSON body fails to parse', async () => {
    const fetchFn = makeFetchFn(makeResponse({ status: 200, jsonThrows: true }));
    const out = await searchFactChecks('q', { fetchFn, apiKey: 'k' });
    expect(out).toEqual([]);
  });

  it('degrades to defaults for missing optional fields', async () => {
    const fixture = {
      claims: [
        {
          // no text, no claimReview
        },
        {
          text: 'A claim',
          claimReview: [
            {
              // no publisher, no url, no textualRating, no reviewDate
            }
          ]
        }
      ]
    };
    const fetchFn = makeFetchFn(makeResponse({ status: 200, json: fixture }));
    const out = await searchFactChecks('q', { fetchFn, apiKey: 'k' });
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      claimText: '',
      reviewerName: 'Unknown',
      rating: '',
      normalizedRating: 'unknown',
      reviewUrl: ''
    });
    expect(out[0].datePublished).toBeUndefined();
    expect(out[1]).toEqual({
      claimText: 'A claim',
      reviewerName: 'Unknown',
      rating: '',
      normalizedRating: 'unknown',
      reviewUrl: ''
    });
  });
});

describe('normalizeRating', () => {
  const cases: Array<[string, string]> = [
    // true bucket
    ['True', 'true'],
    ['correct', 'true'],
    ['Correct Attribution', 'true'],
    ['Accurate', 'true'],
    // mostly-true bucket
    ['Mostly True', 'mostly-true'],
    ['mostly accurate', 'mostly-true'],
    ['Mostly Correct', 'mostly-true'],
    // mixed bucket
    ['Mixed', 'mixed'],
    ['Half True', 'mixed'],
    ['Partly True', 'mixed'],
    ['Partly False', 'mixed'],
    ['Misleading', 'mixed'],
    ['Half False', 'mixed'],
    // mostly-false bucket
    ['Mostly False', 'mostly-false'],
    ['Mostly Inaccurate', 'mostly-false'],
    // false bucket
    ['False', 'false'],
    ['Pants on Fire!', 'false'],
    ['Four Pinocchios', 'false'],
    ['Inaccurate', 'false'],
    ['Fabricated', 'false'],
    // unknown
    ['Spicy Take', 'unknown'],
    ['', 'unknown']
  ];

  for (const [raw, expected] of cases) {
    it(`maps "${raw}" -> "${expected}"`, () => {
      expect(normalizeRating(raw)).toBe(expected);
    });
  }
});
