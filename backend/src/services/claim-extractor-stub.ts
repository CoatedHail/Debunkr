import type { Claim } from '../prompts/claim-extraction.js';
import type { ExtractClaimsResult } from './claim-extractor.js';

const STUB_CLAIMS: Claim[] = [
  {
    text: 'The CDC reported 150,000 new flu cases in January 2025.',
    type: 'statistic',
    namedEntities: ['CDC'],
    checkable: true
  },
  {
    text: 'President Smith signed the bill on March 3, 2025.',
    type: 'event',
    namedEntities: ['President Smith'],
    checkable: true
  }
];

export async function extractClaimsStub(
  _articleText: string
): Promise<ExtractClaimsResult> {
  return {
    claims: STUB_CLAIMS.map((c) => ({ ...c, namedEntities: [...c.namedEntities] })),
    usage: { input_tokens: 0, output_tokens: 0 }
  };
}
