import { createDatasetLookup } from '../../src/services/dataset-lookup.js';

describe('createDatasetLookup', () => {
  it('returns high tier + wikipedia verdict for nytimes.com', () => {
    const lookup = createDatasetLookup();
    const result = lookup('nytimes.com');
    expect(result.canonicalDomain).toBe('nytimes.com');
    expect(result.reliabilityTier).toBe('high');
    expect(result.verdicts.some((v) => v.source === 'curated-wikipedia')).toBe(true);
  });

  it('returns low tier for infowars.com', () => {
    const lookup = createDatasetLookup();
    const result = lookup('infowars.com');
    expect(result.reliabilityTier).toBe('low');
  });

  it('returns unknown tier + empty verdicts for an unknown domain', () => {
    const lookup = createDatasetLookup();
    const result = lookup('some-unknown-blog-xyz.com');
    expect(result.reliabilityTier).toBe('unknown');
    expect(result.verdicts).toHaveLength(0);
  });

  it('returns IFCN verdict for snopes.com', () => {
    const lookup = createDatasetLookup();
    const result = lookup('snopes.com');
    expect(result.verdicts.some((v) => v.source === 'ifcn')).toBe(true);
  });

  it('returns BOTH wikipedia AND ifcn verdicts for reuters.com', () => {
    const lookup = createDatasetLookup();
    const result = lookup('reuters.com');
    const sources = result.verdicts.map((v) => v.source);
    expect(sources).toContain('curated-wikipedia');
    expect(sources).toContain('ifcn');
  });

  it('lowercases the input domain', () => {
    const lookup = createDatasetLookup();
    const result = lookup('NYTimes.COM');
    expect(result.reliabilityTier).toBe('high');
  });
});
