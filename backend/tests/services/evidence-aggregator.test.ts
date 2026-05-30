import { aggregateEvidence } from '../../src/services/evidence-aggregator.js';
import type { Claim } from '../../src/prompts/claim-extraction.js';
import type { FactCheckResult } from '../../src/services/fact-check-api.js';
import type { SearchHit } from '../../src/services/web-search.js';
import type { EntityCheck } from '../../src/services/wikipedia-check.js';

function makeMockClient(scriptedResponses: string[]) {
  let call = 0;
  return {
    messages: {
      create: jest.fn(async () => {
        const text =
          scriptedResponses[call] ??
          scriptedResponses[scriptedResponses.length - 1];
        call += 1;
        return {
          content: [{ type: 'text', text }],
          usage: { input_tokens: 321, output_tokens: 54 }
        };
      })
    }
  };
}

const CLAIMS: Claim[] = [
  {
    text: 'The CDC reported 150,000 new flu cases in January 2025.',
    type: 'statistic',
    namedEntities: ['CDC'],
    checkable: true
  }
];

const FACT_CHECKS: FactCheckResult[] = [
  {
    claimText: 'CDC reported flu cases',
    reviewerName: 'Snopes',
    rating: 'True',
    normalizedRating: 'true',
    reviewUrl: 'https://snopes.com/fact/cdc-flu'
  }
];

const SEARCH_HITS: SearchHit[] = [
  {
    url: 'https://reuters.com/article/cdc-flu',
    domain: 'reuters.com',
    title: 'CDC reports surge in flu cases',
    snippet: 'CDC data confirms the report.',
    isTier1: true
  },
  {
    url: 'https://apnews.com/article/cdc-flu',
    domain: 'apnews.com',
    title: 'AP: CDC flu data',
    snippet: 'AP confirms the data.',
    isTier1: true
  },
  {
    url: 'https://randomblog.example/cdc-flu',
    domain: 'randomblog.example',
    title: 'Some blog',
    snippet: 'Blog post.',
    isTier1: false
  }
];

const ENTITY_CHECKS: EntityCheck[] = [
  {
    name: 'CDC',
    exists: true,
    isDisambiguation: false,
    extract: 'The Centers for Disease Control.',
    pageUrl: 'https://en.wikipedia.org/wiki/CDC'
  }
];

const MODEL = 'claude-haiku-4-5';

describe('aggregateEvidence', () => {
  it('returns parsed result and usage on a well-formed corroborated response', async () => {
    const payload = JSON.stringify({
      verdict: 'corroborated',
      confidence: 'high',
      citations: [
        {
          source: 'Reuters',
          url: 'https://reuters.com/article/cdc-flu',
          snippet: 'CDC data confirms.',
          supports: 'agrees'
        },
        {
          source: 'AP',
          url: 'https://apnews.com/article/cdc-flu',
          snippet: 'AP confirms.',
          supports: 'agrees'
        }
      ],
      scoreDelta: 10,
      reasoning: 'Two Tier-1 sources corroborate the claim.'
    });
    const mock = makeMockClient([payload]);
    const r = await aggregateEvidence(
      'article body',
      CLAIMS,
      FACT_CHECKS,
      SEARCH_HITS,
      ENTITY_CHECKS,
      { client: mock as any, model: MODEL }
    );
    expect(r.evidence.verdict).toBe('corroborated');
    expect(r.evidence.confidence).toBe('high');
    expect(r.evidence.scoreDelta).toBe(10);
    expect(r.evidence.citations).toHaveLength(2);
    expect(r.evidence.citations[0].source).toBe('Reuters');
    expect(r.evidence.citations[0].supports).toBe('agrees');
    expect(r.usage.input_tokens).toBe(321);
    expect(r.usage.output_tokens).toBe(54);
  });

  it('clamps scoreDelta above range to 10', async () => {
    const payload = JSON.stringify({
      verdict: 'corroborated',
      confidence: 'high',
      citations: [],
      scoreDelta: 15,
      reasoning: 'High'
    });
    const mock = makeMockClient([payload]);
    const r = await aggregateEvidence('', CLAIMS, FACT_CHECKS, SEARCH_HITS, ENTITY_CHECKS, {
      client: mock as any,
      model: MODEL
    });
    expect(r.evidence.scoreDelta).toBe(10);
    expect(r.evidence.verdict).toBe('corroborated');
  });

  it('clamps scoreDelta below range to -30', async () => {
    const payload = JSON.stringify({
      verdict: 'contradicted',
      confidence: 'high',
      citations: [],
      scoreDelta: -50,
      reasoning: 'Low'
    });
    const mock = makeMockClient([payload]);
    const r = await aggregateEvidence('', CLAIMS, FACT_CHECKS, SEARCH_HITS, ENTITY_CHECKS, {
      client: mock as any,
      model: MODEL
    });
    expect(r.evidence.scoreDelta).toBe(-30);
    expect(r.evidence.verdict).toBe('contradicted');
  });

  it('falls back safely when scoreDelta is non-numeric', async () => {
    const payload = JSON.stringify({
      verdict: 'corroborated',
      confidence: 'high',
      citations: [],
      scoreDelta: 'hi',
      reasoning: ''
    });
    const mock = makeMockClient([payload]);
    const r = await aggregateEvidence('', CLAIMS, FACT_CHECKS, SEARCH_HITS, ENTITY_CHECKS, {
      client: mock as any,
      model: MODEL
    });
    expect(r.evidence.verdict).toBe('uncorroborated');
    expect(r.evidence.confidence).toBe('low');
    expect(r.evidence.scoreDelta).toBe(0);
    expect(r.evidence.reasoning).toBe('Aggregator failed to parse evidence');
  });

  it('falls back safely on invalid verdict', async () => {
    const payload = JSON.stringify({
      verdict: 'definitely-fake',
      confidence: 'high',
      citations: [],
      scoreDelta: -10,
      reasoning: 'x'
    });
    const mock = makeMockClient([payload]);
    const r = await aggregateEvidence('', CLAIMS, FACT_CHECKS, SEARCH_HITS, ENTITY_CHECKS, {
      client: mock as any,
      model: MODEL
    });
    expect(r.evidence.verdict).toBe('uncorroborated');
    expect(r.evidence.reasoning).toBe('Aggregator failed to parse evidence');
  });

  it('defaults confidence to low when invalid, preserving other fields', async () => {
    const payload = JSON.stringify({
      verdict: 'mixed',
      confidence: 'certain',
      citations: [
        {
          source: 'Reuters',
          url: 'https://reuters.com/article/cdc-flu',
          snippet: 'Snip.',
          supports: 'context'
        }
      ],
      scoreDelta: 0,
      reasoning: 'Mixed signals.'
    });
    const mock = makeMockClient([payload]);
    const r = await aggregateEvidence('', CLAIMS, FACT_CHECKS, SEARCH_HITS, ENTITY_CHECKS, {
      client: mock as any,
      model: MODEL
    });
    expect(r.evidence.confidence).toBe('low');
    expect(r.evidence.verdict).toBe('mixed');
    expect(r.evidence.scoreDelta).toBe(0);
    expect(r.evidence.citations).toHaveLength(1);
    expect(r.evidence.reasoning).toBe('Mixed signals.');
  });

  it('caps citations at 5 when more are returned', async () => {
    const citations = Array.from({ length: 8 }).map((_, i) => ({
      source: `Src${i}`,
      // Cycle through known-valid URLs from input set
      url:
        i % 2 === 0
          ? 'https://reuters.com/article/cdc-flu'
          : 'https://apnews.com/article/cdc-flu',
      snippet: 'snip',
      supports: 'agrees'
    }));
    const payload = JSON.stringify({
      verdict: 'corroborated',
      confidence: 'high',
      citations,
      scoreDelta: 10,
      reasoning: 'Many cites.'
    });
    const mock = makeMockClient([payload]);
    const r = await aggregateEvidence('', CLAIMS, FACT_CHECKS, SEARCH_HITS, ENTITY_CHECKS, {
      client: mock as any,
      model: MODEL
    });
    expect(r.evidence.citations).toHaveLength(5);
  });

  it('drops citations whose URLs are not in the supplied input set', async () => {
    const payload = JSON.stringify({
      verdict: 'corroborated',
      confidence: 'medium',
      citations: [
        {
          source: 'Reuters',
          url: 'https://reuters.com/article/cdc-flu',
          snippet: 'real',
          supports: 'agrees'
        },
        {
          source: 'AP',
          url: 'https://apnews.com/article/cdc-flu',
          snippet: 'real',
          supports: 'agrees'
        },
        {
          source: 'FakeSite',
          url: 'https://hallucinated.example/fake',
          snippet: 'fake',
          supports: 'agrees'
        }
      ],
      scoreDelta: 5,
      reasoning: 'ok'
    });
    const mock = makeMockClient([payload]);
    const r = await aggregateEvidence('', CLAIMS, FACT_CHECKS, SEARCH_HITS, ENTITY_CHECKS, {
      client: mock as any,
      model: MODEL
    });
    expect(r.evidence.citations).toHaveLength(2);
    for (const c of r.evidence.citations) {
      expect(c.url).not.toBe('https://hallucinated.example/fake');
    }
  });

  it('truncates citation snippets over 200 chars', async () => {
    const longSnippet = 'a'.repeat(500);
    const payload = JSON.stringify({
      verdict: 'corroborated',
      confidence: 'high',
      citations: [
        {
          source: 'Reuters',
          url: 'https://reuters.com/article/cdc-flu',
          snippet: longSnippet,
          supports: 'agrees'
        }
      ],
      scoreDelta: 5,
      reasoning: 'x'
    });
    const mock = makeMockClient([payload]);
    const r = await aggregateEvidence('', CLAIMS, FACT_CHECKS, SEARCH_HITS, ENTITY_CHECKS, {
      client: mock as any,
      model: MODEL
    });
    expect(r.evidence.citations).toHaveLength(1);
    expect(r.evidence.citations[0].snippet.length).toBeLessThanOrEqual(200);
    expect(r.evidence.citations[0].snippet.length).toBe(200);
  });

  it('defaults invalid supports value to "context"', async () => {
    const payload = JSON.stringify({
      verdict: 'corroborated',
      confidence: 'high',
      citations: [
        {
          source: 'Reuters',
          url: 'https://reuters.com/article/cdc-flu',
          snippet: 'snip',
          supports: 'totally-agrees'
        }
      ],
      scoreDelta: 5,
      reasoning: 'x'
    });
    const mock = makeMockClient([payload]);
    const r = await aggregateEvidence('', CLAIMS, FACT_CHECKS, SEARCH_HITS, ENTITY_CHECKS, {
      client: mock as any,
      model: MODEL
    });
    expect(r.evidence.citations[0].supports).toBe('context');
  });

  it('falls back safely on malformed JSON', async () => {
    const mock = makeMockClient(['this is not json at all']);
    const r = await aggregateEvidence('', CLAIMS, FACT_CHECKS, SEARCH_HITS, ENTITY_CHECKS, {
      client: mock as any,
      model: MODEL
    });
    expect(r.evidence.verdict).toBe('uncorroborated');
    expect(r.evidence.scoreDelta).toBe(0);
    expect(r.evidence.reasoning).toBe('Aggregator failed to parse evidence');
  });

  it('falls back safely when verdict field is missing', async () => {
    const payload = JSON.stringify({
      confidence: 'high',
      citations: [],
      scoreDelta: 0,
      reasoning: 'no verdict'
    });
    const mock = makeMockClient([payload]);
    const r = await aggregateEvidence('', CLAIMS, FACT_CHECKS, SEARCH_HITS, ENTITY_CHECKS, {
      client: mock as any,
      model: MODEL
    });
    expect(r.evidence.verdict).toBe('uncorroborated');
    expect(r.evidence.reasoning).toBe('Aggregator failed to parse evidence');
  });

  it('does not throw even when LLM returns total garbage', async () => {
    const mock = makeMockClient(['not json at all']);
    await expect(
      aggregateEvidence('', CLAIMS, FACT_CHECKS, SEARCH_HITS, ENTITY_CHECKS, {
        client: mock as any,
        model: MODEL
      })
    ).resolves.toBeDefined();
  });

  it('truncates reasoning over 400 chars exactly to 400', async () => {
    const longReason = 'r'.repeat(800);
    const payload = JSON.stringify({
      verdict: 'mixed',
      confidence: 'medium',
      citations: [],
      scoreDelta: 0,
      reasoning: longReason
    });
    const mock = makeMockClient([payload]);
    const r = await aggregateEvidence('', CLAIMS, FACT_CHECKS, SEARCH_HITS, ENTITY_CHECKS, {
      client: mock as any,
      model: MODEL
    });
    expect(r.evidence.reasoning.length).toBe(400);
  });

  it('extracts usage from the response', async () => {
    const payload = JSON.stringify({
      verdict: 'mixed',
      confidence: 'medium',
      citations: [],
      scoreDelta: 0,
      reasoning: 'x'
    });
    const mock = makeMockClient([payload]);
    const r = await aggregateEvidence('', CLAIMS, FACT_CHECKS, SEARCH_HITS, ENTITY_CHECKS, {
      client: mock as any,
      model: MODEL
    });
    expect(r.usage.input_tokens).toBe(321);
    expect(r.usage.output_tokens).toBe(54);
  });

  it('passes the system prompt and structured user message to the client', async () => {
    const payload = JSON.stringify({
      verdict: 'mixed',
      confidence: 'medium',
      citations: [],
      scoreDelta: 0,
      reasoning: 'x'
    });
    const mock = makeMockClient([payload]);
    await aggregateEvidence(
      'article text',
      CLAIMS,
      FACT_CHECKS,
      SEARCH_HITS,
      ENTITY_CHECKS,
      { client: mock as any, model: MODEL }
    );
    const call = mock.messages.create.mock.calls[0][0];
    expect(call.model).toBe(MODEL);
    expect(call.max_tokens).toBe(1024);
    expect(call.temperature).toBe(0);
    expect(typeof call.system).toBe('string');
    expect(call.system).toContain('evidence aggregator');
    expect(call.messages[0].role).toBe('user');
    expect(call.messages[0].content).toContain('<<<ARTICLE_START>>>');
    expect(call.messages[0].content).toContain('<<<ARTICLE_END>>>');
    expect(call.messages[0].content).toContain('<<<TIER1_HITS_START>>>');
    expect(call.messages[0].content).toContain('<<<OTHER_HITS_START>>>');
    expect(call.messages[0].content).toContain('<<<FACT_CHECKS_START>>>');
    expect(call.messages[0].content).toContain('<<<ENTITIES_START>>>');
    expect(call.messages[0].content).toContain('<<<CLAIMS_START>>>');
    // Tier-1/non-Tier-1 partitioning by isTier1 flag
    expect(call.messages[0].content).toContain('reuters.com');
    expect(call.messages[0].content).toContain('randomblog.example');
  });
});
