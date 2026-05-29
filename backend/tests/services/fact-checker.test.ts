import { runFactCheck } from '../../src/services/fact-checker.js';
import type { Claim } from '../../src/prompts/claim-extraction.js';
import type { FactCheckResult } from '../../src/services/fact-check-api.js';
import type { SearchHit } from '../../src/services/web-search.js';
import type { EntityCheck } from '../../src/services/wikipedia-check.js';
import type {
  EvidenceResult,
  AggregateEvidenceResult
} from '../../src/services/evidence-aggregator.js';

const SAMPLE_ARTICLE = 'Sample article text about CDC flu cases.';

function makeClaim(
  text: string,
  namedEntities: string[] = []
): Claim {
  return { text, type: 'event', namedEntities, checkable: true };
}

function makeFactCheck(reviewUrl: string): FactCheckResult {
  return {
    claimText: 'some claim',
    reviewerName: 'Snopes',
    rating: 'True',
    normalizedRating: 'true',
    reviewUrl
  };
}

function makeHit(url: string): SearchHit {
  return {
    url,
    domain: 'example.com',
    title: 't',
    snippet: 's',
    isTier1: false
  };
}

function makeEntity(name: string): EntityCheck {
  return {
    name,
    exists: true,
    isDisambiguation: false,
    pageUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(name)}`
  };
}

const HAPPY_EVIDENCE: EvidenceResult = {
  verdict: 'corroborated',
  confidence: 'high',
  citations: [],
  scoreDelta: 5,
  reasoning: 'All sources agree.'
};

function happyAggregator(): jest.Mock<Promise<AggregateEvidenceResult>, any> {
  return jest.fn(async () => ({
    evidence: HAPPY_EVIDENCE,
    usage: { input_tokens: 500, output_tokens: 400 }
  }));
}

describe('runFactCheck', () => {
  test('happy path: all services succeed, calls + sums usage', async () => {
    const claims = [makeClaim('Claim A', ['Alice']), makeClaim('Claim B', ['Bob'])];
    const fcA = [makeFactCheck('https://snopes.com/a')];
    const fcB = [makeFactCheck('https://snopes.com/b')];
    const hitsA = [makeHit('https://reuters.com/a')];
    const hitsB = [makeHit('https://apnews.com/b')];
    const entities = [makeEntity('Alice'), makeEntity('Bob')];

    const extractClaimsFn = jest.fn(async () => ({
      claims,
      usage: { input_tokens: 300, output_tokens: 200 }
    }));
    const searchFactChecksFn = jest
      .fn<Promise<FactCheckResult[]>, [string]>()
      .mockResolvedValueOnce(fcA)
      .mockResolvedValueOnce(fcB);
    const searchWebFn = jest
      .fn<Promise<SearchHit[]>, [string]>()
      .mockResolvedValueOnce(hitsA)
      .mockResolvedValueOnce(hitsB);
    const checkEntitiesFn = jest.fn(async () => entities);
    const aggregateEvidenceFn = happyAggregator();

    const result = await runFactCheck(SAMPLE_ARTICLE, {
      extractClaimsFn: extractClaimsFn as any,
      searchFactChecksFn: searchFactChecksFn as any,
      searchWebFn: searchWebFn as any,
      checkEntitiesFn: checkEntitiesFn as any,
      aggregateEvidenceFn: aggregateEvidenceFn as any
    });

    expect(extractClaimsFn).toHaveBeenCalledTimes(1);
    expect(extractClaimsFn).toHaveBeenCalledWith(SAMPLE_ARTICLE);
    expect(searchFactChecksFn).toHaveBeenCalledTimes(2);
    expect(searchWebFn).toHaveBeenCalledTimes(2);
    expect(checkEntitiesFn).toHaveBeenCalledTimes(1);
    expect(checkEntitiesFn).toHaveBeenCalledWith(['Alice', 'Bob']);
    expect(aggregateEvidenceFn).toHaveBeenCalledTimes(1);

    // Positional args to aggregator
    const aggArgs = aggregateEvidenceFn.mock.calls[0];
    expect(aggArgs[0]).toBe(SAMPLE_ARTICLE);
    expect(aggArgs[1]).toEqual(claims);
    expect(aggArgs[2]).toEqual([...fcA, ...fcB]);
    expect(aggArgs[3]).toEqual([...hitsA, ...hitsB]);
    expect(aggArgs[4]).toEqual(entities);

    expect(result.evidence).toEqual(HAPPY_EVIDENCE);
    expect(result.usage).toEqual({ input_tokens: 800, output_tokens: 600 });
  });

  test('claim extractor throws → safe default, no other services called', async () => {
    const extractClaimsFn = jest.fn(async () => {
      throw new Error('extractor boom');
    });
    const searchFactChecksFn = jest.fn();
    const searchWebFn = jest.fn();
    const checkEntitiesFn = jest.fn();
    const aggregateEvidenceFn = jest.fn();

    const result = await runFactCheck(SAMPLE_ARTICLE, {
      extractClaimsFn: extractClaimsFn as any,
      searchFactChecksFn: searchFactChecksFn as any,
      searchWebFn: searchWebFn as any,
      checkEntitiesFn: checkEntitiesFn as any,
      aggregateEvidenceFn: aggregateEvidenceFn as any
    });

    expect(searchFactChecksFn).not.toHaveBeenCalled();
    expect(searchWebFn).not.toHaveBeenCalled();
    expect(checkEntitiesFn).not.toHaveBeenCalled();
    expect(aggregateEvidenceFn).not.toHaveBeenCalled();

    expect(result.evidence.reasoning).toBe('Claim extraction failed');
    expect(result.evidence.verdict).toBe('uncorroborated');
    expect(result.evidence.confidence).toBe('low');
    expect(result.evidence.scoreDelta).toBe(0);
    expect(result.evidence.citations).toEqual([]);
    expect(result.usage).toEqual({ input_tokens: 0, output_tokens: 0 });
  });

  test('zero claims → safe default, no other services called, extractor usage preserved', async () => {
    const extractClaimsFn = jest.fn(async () => ({
      claims: [],
      usage: { input_tokens: 100, output_tokens: 50 }
    }));
    const searchFactChecksFn = jest.fn();
    const searchWebFn = jest.fn();
    const checkEntitiesFn = jest.fn();
    const aggregateEvidenceFn = jest.fn();

    const result = await runFactCheck(SAMPLE_ARTICLE, {
      extractClaimsFn: extractClaimsFn as any,
      searchFactChecksFn: searchFactChecksFn as any,
      searchWebFn: searchWebFn as any,
      checkEntitiesFn: checkEntitiesFn as any,
      aggregateEvidenceFn: aggregateEvidenceFn as any
    });

    expect(searchFactChecksFn).not.toHaveBeenCalled();
    expect(searchWebFn).not.toHaveBeenCalled();
    expect(checkEntitiesFn).not.toHaveBeenCalled();
    expect(aggregateEvidenceFn).not.toHaveBeenCalled();

    expect(result.evidence.reasoning).toBe(
      'No verifiable claims found in article'
    );
    expect(result.usage).toEqual({ input_tokens: 100, output_tokens: 50 });
  });

  test('fact-check service throws on one claim → other branches still run', async () => {
    const claims = [makeClaim('A', ['Alice']), makeClaim('B', ['Bob'])];
    const hitsA = [makeHit('https://reuters.com/a')];
    const hitsB = [makeHit('https://apnews.com/b')];
    const entities = [makeEntity('Alice'), makeEntity('Bob')];

    const extractClaimsFn = jest.fn(async () => ({
      claims,
      usage: { input_tokens: 10, output_tokens: 5 }
    }));
    const searchFactChecksFn = jest
      .fn<Promise<FactCheckResult[]>, [string]>()
      .mockRejectedValueOnce(new Error('FactCheckAuthError'))
      .mockResolvedValueOnce([makeFactCheck('https://snopes.com/b')]);
    const searchWebFn = jest
      .fn<Promise<SearchHit[]>, [string]>()
      .mockResolvedValueOnce(hitsA)
      .mockResolvedValueOnce(hitsB);
    const checkEntitiesFn = jest.fn(async () => entities);
    const aggregateEvidenceFn = happyAggregator();

    const result = await runFactCheck(SAMPLE_ARTICLE, {
      extractClaimsFn: extractClaimsFn as any,
      searchFactChecksFn: searchFactChecksFn as any,
      searchWebFn: searchWebFn as any,
      checkEntitiesFn: checkEntitiesFn as any,
      aggregateEvidenceFn: aggregateEvidenceFn as any
    });

    const aggArgs = aggregateEvidenceFn.mock.calls[0];
    // Fact-checks: only the second branch's result (first threw → [])
    expect(aggArgs[2]).toEqual([makeFactCheck('https://snopes.com/b')]);
    expect(aggArgs[3]).toEqual([...hitsA, ...hitsB]);
    expect(aggArgs[4]).toEqual(entities);
    expect(result.evidence).toEqual(HAPPY_EVIDENCE);
  });

  test('web search throws on all claims → searchHits = [] passed to aggregator', async () => {
    const claims = [makeClaim('A', ['Alice']), makeClaim('B', ['Bob'])];
    const fcA = [makeFactCheck('https://snopes.com/a')];
    const fcB = [makeFactCheck('https://snopes.com/b')];
    const entities = [makeEntity('Alice'), makeEntity('Bob')];

    const extractClaimsFn = jest.fn(async () => ({
      claims,
      usage: { input_tokens: 10, output_tokens: 5 }
    }));
    const searchFactChecksFn = jest
      .fn<Promise<FactCheckResult[]>, [string]>()
      .mockResolvedValueOnce(fcA)
      .mockResolvedValueOnce(fcB);
    const searchWebFn = jest.fn(async () => {
      throw new Error('brave down');
    });
    const checkEntitiesFn = jest.fn(async () => entities);
    const aggregateEvidenceFn = happyAggregator();

    const result = await runFactCheck(SAMPLE_ARTICLE, {
      extractClaimsFn: extractClaimsFn as any,
      searchFactChecksFn: searchFactChecksFn as any,
      searchWebFn: searchWebFn as any,
      checkEntitiesFn: checkEntitiesFn as any,
      aggregateEvidenceFn: aggregateEvidenceFn as any
    });

    const aggArgs = aggregateEvidenceFn.mock.calls[0];
    expect(aggArgs[2]).toEqual([...fcA, ...fcB]);
    expect(aggArgs[3]).toEqual([]);
    expect(aggArgs[4]).toEqual(entities);
    expect(result.evidence).toEqual(HAPPY_EVIDENCE);
  });

  test('all evidence branches throw → aggregator still called with empty arrays', async () => {
    const claims = [makeClaim('A', ['Alice'])];
    const extractClaimsFn = jest.fn(async () => ({
      claims,
      usage: { input_tokens: 10, output_tokens: 5 }
    }));
    const searchFactChecksFn = jest.fn(async () => {
      throw new Error('fc down');
    });
    const searchWebFn = jest.fn(async () => {
      throw new Error('web down');
    });
    const checkEntitiesFn = jest.fn(async () => {
      throw new Error('wiki down');
    });
    const aggregateEvidenceFn = happyAggregator();

    const result = await runFactCheck(SAMPLE_ARTICLE, {
      extractClaimsFn: extractClaimsFn as any,
      searchFactChecksFn: searchFactChecksFn as any,
      searchWebFn: searchWebFn as any,
      checkEntitiesFn: checkEntitiesFn as any,
      aggregateEvidenceFn: aggregateEvidenceFn as any
    });

    const aggArgs = aggregateEvidenceFn.mock.calls[0];
    expect(aggArgs[2]).toEqual([]);
    expect(aggArgs[3]).toEqual([]);
    expect(aggArgs[4]).toEqual([]);
    expect(result.evidence).toEqual(HAPPY_EVIDENCE);
  });

  test('aggregator throws → safe default, extractor usage preserved', async () => {
    const claims = [makeClaim('A', ['Alice'])];
    const extractClaimsFn = jest.fn(async () => ({
      claims,
      usage: { input_tokens: 77, output_tokens: 33 }
    }));
    const searchFactChecksFn = jest.fn(async () => []);
    const searchWebFn = jest.fn(async () => []);
    const checkEntitiesFn = jest.fn(async () => []);
    const aggregateEvidenceFn = jest.fn(async () => {
      throw new Error('agg boom');
    });

    const result = await runFactCheck(SAMPLE_ARTICLE, {
      extractClaimsFn: extractClaimsFn as any,
      searchFactChecksFn: searchFactChecksFn as any,
      searchWebFn: searchWebFn as any,
      checkEntitiesFn: checkEntitiesFn as any,
      aggregateEvidenceFn: aggregateEvidenceFn as any
    });

    expect(result.evidence.reasoning).toBe('Aggregator call failed');
    expect(result.evidence.verdict).toBe('uncorroborated');
    expect(result.usage).toEqual({ input_tokens: 77, output_tokens: 33 });
  });

  test('entity dedup: case-insensitive, first-occurrence casing preserved', async () => {
    const claims = [
      makeClaim('A', ['Joe Biden']),
      makeClaim('B', ['joe biden', 'Kamala Harris']),
      makeClaim('C', ['JOE BIDEN'])
    ];
    const extractClaimsFn = jest.fn(async () => ({
      claims,
      usage: { input_tokens: 0, output_tokens: 0 }
    }));
    const searchFactChecksFn = jest.fn(async () => []);
    const searchWebFn = jest.fn(async () => []);
    const checkEntitiesFn = jest.fn(async () => []);
    const aggregateEvidenceFn = happyAggregator();

    await runFactCheck(SAMPLE_ARTICLE, {
      extractClaimsFn: extractClaimsFn as any,
      searchFactChecksFn: searchFactChecksFn as any,
      searchWebFn: searchWebFn as any,
      checkEntitiesFn: checkEntitiesFn as any,
      aggregateEvidenceFn: aggregateEvidenceFn as any
    });

    expect(checkEntitiesFn).toHaveBeenCalledTimes(1);
    expect(checkEntitiesFn).toHaveBeenCalledWith(['Joe Biden', 'Kamala Harris']);
  });

  test('entity cap at 5 distinct entities', async () => {
    // The extractor itself caps at 3 claims, so spread 8 entities across 3 claims.
    const claims = [
      makeClaim('A', ['E1', 'E2', 'E3']),
      makeClaim('B', ['E4', 'E5', 'E6']),
      makeClaim('C', ['E7', 'E8'])
    ];
    const extractClaimsFn = jest.fn(async () => ({
      claims,
      usage: { input_tokens: 0, output_tokens: 0 }
    }));
    const searchFactChecksFn = jest.fn(async () => []);
    const searchWebFn = jest.fn(async () => []);
    const checkEntitiesFn = jest.fn(async () => []);
    const aggregateEvidenceFn = happyAggregator();

    await runFactCheck(SAMPLE_ARTICLE, {
      extractClaimsFn: extractClaimsFn as any,
      searchFactChecksFn: searchFactChecksFn as any,
      searchWebFn: searchWebFn as any,
      checkEntitiesFn: checkEntitiesFn as any,
      aggregateEvidenceFn: aggregateEvidenceFn as any
    });

    const arg = checkEntitiesFn.mock.calls[0][0] as string[];
    expect(arg).toHaveLength(5);
    expect(arg).toEqual(['E1', 'E2', 'E3', 'E4', 'E5']);
  });

  test('fact-check dedup by reviewUrl across claims', async () => {
    const claims = [makeClaim('A'), makeClaim('B')];
    const shared = makeFactCheck('https://snopes.com/shared');
    const onlyA = makeFactCheck('https://snopes.com/onlyA');
    const onlyB = makeFactCheck('https://snopes.com/onlyB');

    const extractClaimsFn = jest.fn(async () => ({
      claims,
      usage: { input_tokens: 0, output_tokens: 0 }
    }));
    const searchFactChecksFn = jest
      .fn<Promise<FactCheckResult[]>, [string]>()
      .mockResolvedValueOnce([shared, onlyA])
      .mockResolvedValueOnce([shared, onlyB]);
    const searchWebFn = jest.fn(async () => []);
    const checkEntitiesFn = jest.fn(async () => []);
    const aggregateEvidenceFn = happyAggregator();

    await runFactCheck(SAMPLE_ARTICLE, {
      extractClaimsFn: extractClaimsFn as any,
      searchFactChecksFn: searchFactChecksFn as any,
      searchWebFn: searchWebFn as any,
      checkEntitiesFn: checkEntitiesFn as any,
      aggregateEvidenceFn: aggregateEvidenceFn as any
    });

    const aggFc = aggregateEvidenceFn.mock.calls[0][2] as FactCheckResult[];
    expect(aggFc).toEqual([shared, onlyA, onlyB]);
  });

  test('search hits: dedup + cap at 20', async () => {
    const claims = [makeClaim('A'), makeClaim('B'), makeClaim('C')];
    // Branch A: 10 unique. Branch B: 10 unique. Branch C: 5 dupes from A + 5 new = 25 total raw, 5 dupes → 20 after dedup
    const branchA: SearchHit[] = [];
    for (let i = 0; i < 10; i++) branchA.push(makeHit(`https://a.com/${i}`));
    const branchB: SearchHit[] = [];
    for (let i = 0; i < 10; i++) branchB.push(makeHit(`https://b.com/${i}`));
    const branchC: SearchHit[] = [];
    for (let i = 0; i < 5; i++) branchC.push(makeHit(`https://a.com/${i}`)); // dupes
    for (let i = 0; i < 5; i++) branchC.push(makeHit(`https://c.com/${i}`));

    const extractClaimsFn = jest.fn(async () => ({
      claims,
      usage: { input_tokens: 0, output_tokens: 0 }
    }));
    const searchFactChecksFn = jest.fn(async () => []);
    const searchWebFn = jest
      .fn<Promise<SearchHit[]>, [string]>()
      .mockResolvedValueOnce(branchA)
      .mockResolvedValueOnce(branchB)
      .mockResolvedValueOnce(branchC);
    const checkEntitiesFn = jest.fn(async () => []);
    const aggregateEvidenceFn = happyAggregator();

    await runFactCheck(SAMPLE_ARTICLE, {
      extractClaimsFn: extractClaimsFn as any,
      searchFactChecksFn: searchFactChecksFn as any,
      searchWebFn: searchWebFn as any,
      checkEntitiesFn: checkEntitiesFn as any,
      aggregateEvidenceFn: aggregateEvidenceFn as any
    });

    const aggHits = aggregateEvidenceFn.mock.calls[0][3] as SearchHit[];
    expect(aggHits).toHaveLength(20);
    // No duplicates
    const urls = aggHits.map((h) => h.url);
    expect(new Set(urls).size).toBe(20);
  });

  test('query building includes both claim text and first named entity', async () => {
    const claims = [makeClaim('X happened', ['Joe Biden'])];
    const extractClaimsFn = jest.fn(async () => ({
      claims,
      usage: { input_tokens: 0, output_tokens: 0 }
    }));
    const searchFactChecksFn = jest.fn(async () => []);
    const searchWebFn = jest.fn(async () => []);
    const checkEntitiesFn = jest.fn(async () => []);
    const aggregateEvidenceFn = happyAggregator();

    await runFactCheck(SAMPLE_ARTICLE, {
      extractClaimsFn: extractClaimsFn as any,
      searchFactChecksFn: searchFactChecksFn as any,
      searchWebFn: searchWebFn as any,
      checkEntitiesFn: checkEntitiesFn as any,
      aggregateEvidenceFn: aggregateEvidenceFn as any
    });

    const factCheckQuery = searchFactChecksFn.mock.calls[0][0] as string;
    expect(factCheckQuery).toContain('X happened');
    expect(factCheckQuery).toContain('Joe Biden');
  });
});
