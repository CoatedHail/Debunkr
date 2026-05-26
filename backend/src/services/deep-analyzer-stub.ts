import type { DeepResult } from './deep-analyzer.js';

const MODEL_LIMITATION =
  'All three agents (Skeptic, Advocate, Judge) use the same model family (Claude). They share underlying biases. A future update will mix model families for genuine bias reduction.';

export async function runDeepAnalysisStub(_articleText: string): Promise<DeepResult> {
  return {
    ok: true,
    deepAnalysis: {
      skeptic: {
        reasoning:
          'STUB: real Skeptic agent disabled. With a real API key, this section would list reasons NOT to trust the article.',
        evidence: ['STUB evidence — no actual article was read.']
      },
      advocate: {
        reasoning:
          'STUB: real Advocate agent disabled. With a real API key, this section would list reasons TO trust the article.',
        evidence: ['STUB evidence — no actual article was read.']
      },
      judge: {
        verdict:
          'STUB judge ruling: cannot adjudicate without real agent outputs. Paste ANTHROPIC_API_KEY into backend/.env to enable real Deep Analysis.',
        confidence: 'low'
      },
      modelLimitation: MODEL_LIMITATION
    }
  };
}
