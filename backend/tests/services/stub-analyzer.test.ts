import { analyzeContentStub } from '../../src/services/stub-analyzer.js';

describe('analyzeContentStub', () => {
  it('returns fixed score, reasoning, bias 0, counter-argument regardless of input', async () => {
    const r = await analyzeContentStub('any text');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.contentQuality).toBe(75);
    expect(r.biasScale).toBe(0);
    expect(r.contentReasoning).toContain('STUB');
    expect(r.counterArgument).toContain('STUB');
  });
});
