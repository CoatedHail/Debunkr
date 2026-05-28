import { extractClaimsStub } from '../../src/services/claim-extractor-stub.js';

describe('extractClaimsStub', () => {
  it('returns the canned 2-claim fixture regardless of input', async () => {
    const r = await extractClaimsStub('any article text');
    expect(r.claims).toHaveLength(2);
    expect(r.claims[0]).toEqual({
      text: 'The CDC reported 150,000 new flu cases in January 2025.',
      type: 'statistic',
      namedEntities: ['CDC'],
      checkable: true
    });
    expect(r.claims[1]).toEqual({
      text: 'President Smith signed the bill on March 3, 2025.',
      type: 'event',
      namedEntities: ['President Smith'],
      checkable: true
    });
    expect(r.usage).toEqual({ input_tokens: 0, output_tokens: 0 });
  });

  it('ignores its input — empty string yields the same fixture', async () => {
    const a = await extractClaimsStub('');
    const b = await extractClaimsStub('something completely different');
    expect(a.claims).toEqual(b.claims);
  });

  it('returns fresh array copies (mutation of result does not affect future calls)', async () => {
    const a = await extractClaimsStub('x');
    a.claims.pop();
    a.claims[0].namedEntities.push('mutated');
    const b = await extractClaimsStub('x');
    expect(b.claims).toHaveLength(2);
    expect(b.claims[0].namedEntities).toEqual(['CDC']);
  });
});
