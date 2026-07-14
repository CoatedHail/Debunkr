import type { Claim } from '../prompts/claim-extraction.js';
import { extractClaims as defaultExtractClaims } from './claim-extractor.js';
import {
  searchFactChecks as defaultSearchFactChecks,
  type FactCheckResult
} from './fact-check-api.js';
import {
  searchWeb as defaultSearchWeb,
  type SearchHit
} from './web-search.js';
import {
  checkEntities as defaultCheckEntities,
  type EntityCheck
} from './wikipedia-check.js';
import {
  aggregateEvidence as defaultAggregateEvidence,
  type EvidenceResult
} from './evidence-aggregator.js';

export type FactCheckUsage = { input_tokens: number; output_tokens: number };

export type FactCheckOptions = {
  extractClaimsFn?: typeof defaultExtractClaims;
  searchFactChecksFn?: typeof defaultSearchFactChecks;
  searchWebFn?: typeof defaultSearchWeb;
  checkEntitiesFn?: typeof defaultCheckEntities;
  aggregateEvidenceFn?: typeof defaultAggregateEvidence;
};

export interface FactCheckRunResult {
  evidence: EvidenceResult;
  usage: FactCheckUsage;
}

const MAX_CLAIMS = 3;
const MAX_ENTITIES = 5;
const MAX_SEARCH_HITS = 20;

function safeDefault(
  reasoning: string,
  usage: FactCheckUsage
): FactCheckRunResult {
  return {
    evidence: {
      verdict: 'uncorroborated',
      confidence: 'low',
      citations: [],
      scoreDelta: 0,
      reasoning
    },
    usage
  };
}

function buildQuery(claim: Claim): string {
  const entity =
    Array.isArray(claim.namedEntities) && claim.namedEntities.length > 0
      ? claim.namedEntities[0]
      : '';
  if (typeof entity === 'string' && entity.trim().length > 0) {
    return `${claim.text} ${entity}`.trim();
  }
  return claim.text;
}

function dedupeEntities(claims: Claim[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of claims) {
    if (!Array.isArray(c.namedEntities)) continue;
    for (const raw of c.namedEntities) {
      if (typeof raw !== 'string') continue;
      const trimmed = raw.trim();
      if (trimmed.length === 0) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(trimmed);
      if (out.length >= MAX_ENTITIES) return out;
    }
  }
  return out;
}

function dedupeFactChecks(arrays: FactCheckResult[][]): FactCheckResult[] {
  const seen = new Set<string>();
  const out: FactCheckResult[] = [];
  for (const arr of arrays) {
    if (!Array.isArray(arr)) continue;
    for (const fc of arr) {
      const url = fc && typeof fc.reviewUrl === 'string' ? fc.reviewUrl : '';
      if (url.length === 0) {
        out.push(fc);
        continue;
      }
      if (seen.has(url)) continue;
      seen.add(url);
      out.push(fc);
    }
  }
  return out;
}

function dedupeSearchHits(arrays: SearchHit[][]): SearchHit[] {
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const arr of arrays) {
    if (!Array.isArray(arr)) continue;
    for (const hit of arr) {
      const url = hit && typeof hit.url === 'string' ? hit.url : '';
      if (url.length === 0) {
        out.push(hit);
        if (out.length >= MAX_SEARCH_HITS) return out;
        continue;
      }
      if (seen.has(url)) continue;
      seen.add(url);
      out.push(hit);
      if (out.length >= MAX_SEARCH_HITS) return out;
    }
  }
  return out;
}

export async function runFactCheck(
  articleText: string,
  localeOrOptions?: string | FactCheckOptions,
  optionsArg: FactCheckOptions = {}
): Promise<FactCheckRunResult> {
  // Overload-ish: original signature was (text, options). v1.4 adds a locale
  // hint. To stay backwards-compatible with tests that pass an options bag
  // as the second argument, sniff the shape at runtime.
  let locale: string | undefined;
  let options: FactCheckOptions;
  if (typeof localeOrOptions === 'string') {
    locale = localeOrOptions;
    options = optionsArg;
  } else {
    options = localeOrOptions ?? {};
  }
  const extractClaimsFn = options.extractClaimsFn ?? defaultExtractClaims;
  const searchFactChecksFn =
    options.searchFactChecksFn ?? defaultSearchFactChecks;
  const searchWebFn = options.searchWebFn ?? defaultSearchWeb;
  const checkEntitiesFn = options.checkEntitiesFn ?? defaultCheckEntities;
  const aggregateEvidenceFn =
    options.aggregateEvidenceFn ?? defaultAggregateEvidence;

  // Step 1: claim extraction
  let claims: Claim[];
  let extractUsage: FactCheckUsage = { input_tokens: 0, output_tokens: 0 };
  try {
    const extracted = await extractClaimsFn(articleText);
    claims = extracted.claims;
    extractUsage = {
      input_tokens: extracted.usage?.input_tokens ?? 0,
      output_tokens: extracted.usage?.output_tokens ?? 0
    };
  } catch {
    return safeDefault('Claim extraction failed', {
      input_tokens: 0,
      output_tokens: 0
    });
  }

  // Step 2: short-circuit on no claims
  if (!Array.isArray(claims) || claims.length === 0) {
    return safeDefault(
      'No verifiable claims found in article',
      extractUsage
    );
  }

  // Defensive cap
  const capped = claims.slice(0, MAX_CLAIMS);

  // Step 3: build queries + parallel fan-out
  const queries = capped.map(buildQuery);
  const entityList = dedupeEntities(capped);

  const factCheckPromises = queries.map((q) =>
    searchFactChecksFn(q).catch((): FactCheckResult[] => [])
  );
  const webPromises = queries.map((q) =>
    searchWebFn(q).catch((): SearchHit[] => [])
  );
  // Only forward the second arg when a locale hint is present — keeps the
  // one-arg default call shape stable for existing tests that assert the
  // exact argument list on checkEntitiesFn.
  const entityPromise: Promise<EntityCheck[]> =
    entityList.length === 0
      ? Promise.resolve([])
      : locale
        ? checkEntitiesFn(entityList, { locale }).catch((): EntityCheck[] => [])
        : checkEntitiesFn(entityList).catch((): EntityCheck[] => []);

  const [factCheckResults, webResults, entityResults] = await Promise.all([
    Promise.allSettled(factCheckPromises),
    Promise.allSettled(webPromises),
    entityPromise
  ]);

  const factCheckArrays: FactCheckResult[][] = factCheckResults.map((r) =>
    r.status === 'fulfilled' ? r.value : []
  );
  const webArrays: SearchHit[][] = webResults.map((r) =>
    r.status === 'fulfilled' ? r.value : []
  );

  const factChecks = dedupeFactChecks(factCheckArrays);
  const searchHits = dedupeSearchHits(webArrays);
  const entityChecks = entityResults;

  // Step 4: aggregator
  let aggregatorUsage: FactCheckUsage = { input_tokens: 0, output_tokens: 0 };
  let evidence: EvidenceResult;
  try {
    const agg = await aggregateEvidenceFn(
      articleText,
      capped,
      factChecks,
      searchHits,
      entityChecks
    );
    evidence = agg.evidence;
    aggregatorUsage = {
      input_tokens: agg.usage?.input_tokens ?? 0,
      output_tokens: agg.usage?.output_tokens ?? 0
    };
  } catch {
    return safeDefault('Aggregator call failed', extractUsage);
  }

  return {
    evidence,
    usage: {
      input_tokens: extractUsage.input_tokens + aggregatorUsage.input_tokens,
      output_tokens: extractUsage.output_tokens + aggregatorUsage.output_tokens
    }
  };
}
