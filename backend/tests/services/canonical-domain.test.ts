import {
  canonicalDomain,
  isKnownShortener
} from '../../src/services/canonical-domain.js';

describe('canonicalDomain', () => {
  it('returns nytimes.com for a normal NYT URL', () => {
    expect(canonicalDomain('https://www.nytimes.com/2025/01/01/world/article.html')).toBe('nytimes.com');
  });

  it('returns nytimes.com for an AMP URL', () => {
    expect(canonicalDomain('https://amp.nytimes.com/2025/01/01/article.amp.html')).toBe('nytimes.com');
  });

  it('returns nytimes.com for a mobile subdomain', () => {
    expect(canonicalDomain('https://m.nytimes.com/2025/01/01/article.html')).toBe('nytimes.com');
  });

  it('returns nytimes.com for a blogs subdomain', () => {
    expect(canonicalDomain('https://blogs.nytimes.com/post')).toBe('nytimes.com');
  });

  it('handles UK eTLDs correctly', () => {
    expect(canonicalDomain('https://www.bbc.co.uk/news/article')).toBe('bbc.co.uk');
  });

  it('returns null for invalid URL', () => {
    expect(canonicalDomain('not a url')).toBeNull();
  });

  it('returns null for URL with IP host', () => {
    expect(canonicalDomain('https://192.168.1.1/')).toBeNull();
  });
});

describe('isKnownShortener', () => {
  it('flags t.co', () => {
    expect(isKnownShortener('t.co')).toBe(true);
  });

  it('flags bit.ly', () => {
    expect(isKnownShortener('bit.ly')).toBe(true);
  });

  it('does not flag nytimes.com', () => {
    expect(isKnownShortener('nytimes.com')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isKnownShortener('T.CO')).toBe(true);
  });
});
