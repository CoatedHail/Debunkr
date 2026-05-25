import { analyzeContentStub } from '../../src/services/stub-analyzer.js';

describe('analyzeContentStub', () => {
  it('returns a fixed score and reasoning regardless of input', async () => {
    const result = await analyzeContentStub('any article text here');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.score).toBe(75);
    expect(result.reasoning).toContain('STUB');
  });

  it('returns the same fixed result for empty input', async () => {
    const result = await analyzeContentStub('');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.score).toBe(75);
  });
});
