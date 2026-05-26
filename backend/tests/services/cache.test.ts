import { createCache, articleTextHash, ttlForUrl } from '../../src/services/cache.js';
import type { JobResult } from '../../src/types/api.js';

describe('articleTextHash', () => {
  it('returns a sha256 hex string', () => {
    const h = articleTextHash('some article text');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
  it('is content-stable based on first 4KB', () => {
    const base = 'x'.repeat(4000);
    expect(articleTextHash(base + 'A')).toBe(articleTextHash(base + 'B'));
  });
});

describe('ttlForUrl', () => {
  it('returns 1h for /news/ URLs', () => {
    expect(ttlForUrl('https://x.com/news/foo')).toBe(3600);
  });
  it('returns 1h for /YYYY/ URLs', () => {
    expect(ttlForUrl('https://x.com/2026/05/article')).toBe(3600);
  });
  it('returns 24h default', () => {
    expect(ttlForUrl('https://x.com/about')).toBe(86_400);
  });
});

describe('Cache', () => {
  const sample: JobResult = { jobId: 'j1', status: 'complete', overall: 80, bucket: 'highly-credible' };

  it('returns undefined on miss', () => {
    const c = createCache();
    expect(c.get('https://x.com/a', 'hash')).toBeUndefined();
  });

  it('returns set value on hit', () => {
    const c = createCache();
    c.set('https://x.com/a', 'hash', sample, 3600);
    expect(c.get('https://x.com/a', 'hash')?.overall).toBe(80);
  });

  it('returns undefined after expiry', () => {
    const c = createCache();
    c.set('https://x.com/a', 'hash', sample, -10);
    expect(c.get('https://x.com/a', 'hash')).toBeUndefined();
  });

  it('different content hash → cache miss', () => {
    const c = createCache();
    c.set('https://x.com/a', 'hashA', sample, 3600);
    expect(c.get('https://x.com/a', 'hashB')).toBeUndefined();
  });
});
