import {
  isTier1,
  loadTier1Domains
} from '../../src/services/tier1-sources.js';

const SEED_DOMAINS = [
  'reuters.com',
  'apnews.com',
  'bbc.com',
  'bbc.co.uk',
  'nytimes.com',
  'washingtonpost.com',
  'theguardian.com',
  'afp.com',
  'npr.org',
  'bloomberg.com',
  'ft.com',
  'wsj.com',
  'economist.com',
  'nhk.or.jp',
  'abcnews.go.com',
  'cbsnews.com',
  'nbcnews.com',
  'pbs.org',
  'propublica.org',
  'theatlantic.com',
  'newyorker.com',
  'time.com',
  'axios.com',
  'politico.com',
  'foreignpolicy.com',
  'science.org',
  'nature.com',
  'nationalgeographic.com',
  'smithsonianmag.com',
  'latimes.com',
  'caixin.com',
  'scmp.com',
  'sixthtone.com'
];

describe('loadTier1Domains', () => {
  it('returns a Set with 33 entries', () => {
    const set = loadTier1Domains();
    expect(set.size).toBe(33);
  });
});

describe('isTier1', () => {
  it.each(SEED_DOMAINS)('returns true for seed domain %s', (domain) => {
    expect(isTier1(domain)).toBe(true);
  });

  it('returns false for example.com', () => {
    expect(isTier1('example.com')).toBe(false);
  });

  it('returns true for www.reuters.com (subdomain normalization)', () => {
    expect(isTier1('www.reuters.com')).toBe(true);
  });

  it('returns true for business.reuters.com (subdomain normalization)', () => {
    expect(isTier1('business.reuters.com')).toBe(true);
  });

  it('returns true for a full BBC URL', () => {
    expect(isTier1('https://www.bbc.co.uk/news/article')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isTier1('')).toBe(false);
  });
});
