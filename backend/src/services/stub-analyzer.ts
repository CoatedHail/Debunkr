import type { AnalyzeResult } from './llm-analyzer.js';

// Fixed-result analyzer used when ANTHROPIC_API_KEY is absent.
// Same return shape as real analyzeContent() so routes can call either.
// Real LLM swap is automatic: paste key into .env, restart, done.
export async function analyzeContentStub(_articleText: string): Promise<AnalyzeResult> {
  return {
    ok: true,
    score: 75,
    reasoning:
      'STUB: real LLM analysis pending. Paste ANTHROPIC_API_KEY into backend/.env and restart to enable Claude-based scoring.'
  };
}
