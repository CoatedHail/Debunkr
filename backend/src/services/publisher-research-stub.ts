import type { PublisherResearchResult } from './publisher-research.js';

/**
 * Deterministic stub used in tests and when no Anthropic key is configured.
 * Never calls the SDK and never throws.
 */
export async function researchPublisherStub(_domain: string): Promise<PublisherResearchResult> {
  return {
    summary:
      'STUB: real publisher research disabled. With ANTHROPIC_API_KEY set, this would summarize the publisher\'s reputation from independent reporting.',
    sentiment: 'mixed',
    citations: [
      {
        url: 'https://en.wikipedia.org/wiki/Media_bias',
        title: 'Media bias — Wikipedia'
      }
    ]
  };
}
