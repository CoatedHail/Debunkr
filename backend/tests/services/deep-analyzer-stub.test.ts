import { runDeepAnalysisStub } from '../../src/services/deep-analyzer-stub.js';

describe('runDeepAnalysisStub', () => {
  it('returns canned skeptic/advocate/judge', async () => {
    const r = await runDeepAnalysisStub('any');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.deepAnalysis.skeptic.reasoning).toContain('STUB');
    expect(r.deepAnalysis.advocate.reasoning).toContain('STUB');
    expect(r.deepAnalysis.judge.verdict).toContain('STUB');
    expect(r.deepAnalysis.judge.confidence).toBe('low');
    expect(r.deepAnalysis.modelLimitation).toContain('same model family');
  });
});
