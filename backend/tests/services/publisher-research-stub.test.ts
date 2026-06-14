import { researchPublisherStub } from '../../src/services/publisher-research-stub.js';

describe('researchPublisherStub', () => {
  it('returns a canned 2-sentence summary, mixed sentiment, and one citation', async () => {
    const r = await researchPublisherStub('any-domain.example');
    expect(r.summary).toContain('STUB');
    expect(r.summary.length).toBeLessThanOrEqual(280);
    expect(r.sentiment).toBe('mixed');
    expect(r.citations).toHaveLength(1);
    expect(r.citations[0].url.startsWith('https://')).toBe(true);
    expect(r.citations[0].title.length).toBeGreaterThan(0);
  });

  it('does not depend on the input domain', async () => {
    const a = await researchPublisherStub('aaa.example');
    const b = await researchPublisherStub('bbb.example');
    expect(a).toEqual(b);
  });
});
