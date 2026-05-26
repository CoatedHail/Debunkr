import type { AnalyzeResult } from './llm-analyzer.js';

export async function analyzeContentStub(_articleText: string): Promise<AnalyzeResult> {
  return {
    ok: true,
    contentQuality: 75,
    contentReasoning:
      'STUB: real LLM analysis pending. Paste ANTHROPIC_API_KEY into backend/.env and restart to enable Claude-based scoring.',
    biasScale: 0,
    counterArgument:
      'STUB: the stub does not actually read the article — any rating it returns is fixed, including this counter-argument.',
    usage: { inputTokens: 0, outputTokens: 0 }
  };
}
