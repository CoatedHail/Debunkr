import { aggregateEvidenceStub } from '../../src/services/evidence-aggregator-stub.js';

describe('aggregateEvidenceStub', () => {
  it('returns a result matching the EvidenceResult shape spec', async () => {
    const r = await aggregateEvidenceStub('article', [], [], [], []);
    expect(r.evidence.verdict).toBe('mixed');
    expect(r.evidence.confidence).toBe('medium');
    expect(r.evidence.citations).toEqual([]);
    expect(r.evidence.scoreDelta).toBe(0);
    expect(typeof r.evidence.reasoning).toBe('string');
    expect(r.evidence.reasoning).toContain('Stub');
  });

  it('reports zero usage tokens (no external call)', async () => {
    const r = await aggregateEvidenceStub('article', [], [], [], []);
    expect(r.usage.input_tokens).toBe(0);
    expect(r.usage.output_tokens).toBe(0);
  });

  it('does not require any client and ignores its inputs', async () => {
    // Should resolve regardless of inputs — no network, no SDK
    const r1 = await aggregateEvidenceStub('a', [], [], [], []);
    const r2 = await aggregateEvidenceStub(
      'b',
      [{ text: 't', type: 'event', namedEntities: [], checkable: true }],
      [],
      [],
      []
    );
    expect(r1.evidence.verdict).toBe(r2.evidence.verdict);
    expect(r1.evidence.scoreDelta).toBe(r2.evidence.scoreDelta);
  });
});
