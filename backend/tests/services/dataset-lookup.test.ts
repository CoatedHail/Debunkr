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

  // ---- Chinese-language publishers (v1.4) ----
  //
  // The Chinese diaspora is a real user segment and CredCheck's US-only
  // publisher list is a gap. These assertions pin the tiers we shipped so a
  // future edit to the CSV doesn't silently downgrade Caixin or promote
  // Global Times. Wikipedia perennial-source guidance is thin for Chinese
  // outlets, so the tier reflects a blend of that guidance + editorial
  // independence + track record in independent reporting.
  it('rates Caixin (caixin.com) as high — respected independent business/investigative outlet', () => {
    const lookup = createDatasetLookup();
    expect(lookup('caixin.com').reliabilityTier).toBe('high');
  });

  it('rates SCMP (scmp.com) as high — established HK broadsheet', () => {
    const lookup = createDatasetLookup();
    expect(lookup('scmp.com').reliabilityTier).toBe('high');
  });

  it('rates Sixth Tone (sixthtone.com) as high — English-language SUMG feature outlet', () => {
    const lookup = createDatasetLookup();
    expect(lookup('sixthtone.com').reliabilityTier).toBe('high');
  });

  it('rates Xinhua (xinhuanet.com) as mixed — official state news agency', () => {
    const lookup = createDatasetLookup();
    expect(lookup('xinhuanet.com').reliabilityTier).toBe('mixed');
  });

  it("rates People's Daily (people.com.cn) as mixed — official state paper", () => {
    const lookup = createDatasetLookup();
    expect(lookup('people.com.cn').reliabilityTier).toBe('mixed');
  });

  it('rates Global Times (globaltimes.cn) as low — tabloid state media', () => {
    const lookup = createDatasetLookup();
    expect(lookup('globaltimes.cn').reliabilityTier).toBe('low');
  });
});
