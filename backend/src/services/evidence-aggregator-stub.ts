import type { Claim } from '../prompts/claim-extraction.js';
import type { FactCheckResult } from './fact-check-api.js';
import type { SearchHit } from './web-search.js';
import type { EntityCheck } from './wikipedia-check.js';
import type { AggregateEvidenceResult } from './evidence-aggregator.js';

export async function aggregateEvidenceStub(
  _article: string,
  _claims: Claim[],
  _factChecks: FactCheckResult[],
  _searchHits: SearchHit[],
  _entityChecks: EntityCheck[]
): Promise<AggregateEvidenceResult> {
  return {
    evidence: {
      verdict: 'mixed',
      confidence: 'medium',
      citations: [],
      scoreDelta: 0,
      reasoning: 'Stub evidence: aggregator running without API key.'
    },
    usage: { input_tokens: 0, output_tokens: 0 }
  };
}
