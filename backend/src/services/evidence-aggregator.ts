import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import {
  SYSTEM_PROMPT,
  buildUserMessage
} from '../prompts/evidence-aggregation.js';
import type { Claim } from '../prompts/claim-extraction.js';
import type { FactCheckResult } from './fact-check-api.js';
import type { SearchHit } from './web-search.js';
import type { EntityCheck } from './wikipedia-check.js';

export type Verdict = 'corroborated' | 'contradicted' | 'uncorroborated' | 'mixed';
export type Confidence = 'high' | 'medium' | 'low';
export type CitationSupport = 'agrees' | 'contradicts' | 'context';

export interface Citation {
  source: string;
  url: string;
  snippet: string;
  supports: CitationSupport;
}

export interface EvidenceResult {
  verdict: Verdict;
  confidence: Confidence;
  citations: Citation[];
  scoreDelta: number;
  reasoning: string;
}

export interface EvidenceUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface AggregateEvidenceOptions {
  client?: Anthropic;
  model?: string;
}

export interface AggregateEvidenceResult {
  evidence: EvidenceResult;
  usage: EvidenceUsage;
}

const VALID_VERDICTS: ReadonlySet<Verdict> = new Set([
  'corroborated',
  'contradicted',
  'uncorroborated',
  'mixed'
]);

const VALID_CONFIDENCES: ReadonlySet<Confidence> = new Set([
  'high',
  'medium',
  'low'
]);

const VALID_SUPPORTS: ReadonlySet<CitationSupport> = new Set([
  'agrees',
  'contradicts',
  'context'
]);

const MAX_CITATIONS = 5;
const MAX_SNIPPET_LEN = 200;
const MAX_REASONING_LEN = 400;
const SCORE_MIN = -30;
const SCORE_MAX = 10;

function fallbackResult(usage: EvidenceUsage): AggregateEvidenceResult {
  return {
    evidence: {
      verdict: 'uncorroborated',
      confidence: 'low',
      citations: [],
      scoreDelta: 0,
      reasoning: 'Aggregator failed to parse evidence'
    },
    usage
  };
}

function clampScore(n: number): number {
  if (n > SCORE_MAX) return SCORE_MAX;
  if (n < SCORE_MIN) return SCORE_MIN;
  return n;
}

function collectAllowedUrls(
  factChecks: FactCheckResult[],
  searchHits: SearchHit[],
  entityChecks: EntityCheck[]
): Set<string> {
  const urls = new Set<string>();
  for (const fc of factChecks) {
    if (fc && typeof fc.reviewUrl === 'string' && fc.reviewUrl.length > 0) {
      urls.add(fc.reviewUrl);
    }
  }
  for (const hit of searchHits) {
    if (hit && typeof hit.url === 'string' && hit.url.length > 0) {
      urls.add(hit.url);
    }
  }
  for (const ec of entityChecks) {
    if (ec && typeof ec.pageUrl === 'string' && ec.pageUrl.length > 0) {
      urls.add(ec.pageUrl);
    }
  }
  return urls;
}

function parseAndValidate(
  text: string,
  allowedUrls: Set<string>
): EvidenceResult | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*|```\s*$/g, '');
  let obj: unknown;
  try {
    obj = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null) return null;
  const root = obj as Record<string, unknown>;

  // verdict: required, must be valid
  const verdict = root.verdict;
  if (typeof verdict !== 'string' || !VALID_VERDICTS.has(verdict as Verdict)) {
    return null;
  }

  // scoreDelta: required, must be finite number → fallback if not
  const scoreRaw = root.scoreDelta;
  if (typeof scoreRaw !== 'number' || !Number.isFinite(scoreRaw)) {
    return null;
  }
  const scoreDelta = clampScore(scoreRaw);

  // confidence: default 'low' if invalid
  const confidenceRaw = root.confidence;
  const confidence: Confidence =
    typeof confidenceRaw === 'string' && VALID_CONFIDENCES.has(confidenceRaw as Confidence)
      ? (confidenceRaw as Confidence)
      : 'low';

  // reasoning: default ''; truncate to MAX_REASONING_LEN
  const reasoningRaw = root.reasoning;
  const reasoning =
    typeof reasoningRaw === 'string'
      ? reasoningRaw.slice(0, MAX_REASONING_LEN)
      : '';

  // citations: must be array; slice to first MAX_CITATIONS; per-citation validation
  const citationsRaw = root.citations;
  if (!Array.isArray(citationsRaw)) {
    return null;
  }
  const citations: Citation[] = [];
  for (const c of citationsRaw.slice(0, MAX_CITATIONS)) {
    if (typeof c !== 'object' || c === null) continue;
    const cc = c as Record<string, unknown>;
    const url = typeof cc.url === 'string' ? cc.url : '';
    // Anti-hallucination gate: URL must appear in supplied inputs
    if (!allowedUrls.has(url)) continue;
    const source = typeof cc.source === 'string' ? cc.source : 'Unknown';
    const snippet =
      typeof cc.snippet === 'string' ? cc.snippet.slice(0, MAX_SNIPPET_LEN) : '';
    const supportsRaw = cc.supports;
    const supports: CitationSupport =
      typeof supportsRaw === 'string' && VALID_SUPPORTS.has(supportsRaw as CitationSupport)
        ? (supportsRaw as CitationSupport)
        : 'context';
    citations.push({ source, url, snippet, supports });
  }

  return {
    verdict: verdict as Verdict,
    confidence,
    citations,
    scoreDelta,
    reasoning
  };
}

export async function aggregateEvidence(
  article: string,
  claims: Claim[],
  factChecks: FactCheckResult[],
  searchHits: SearchHit[],
  entityChecks: EntityCheck[],
  options: AggregateEvidenceOptions = {}
): Promise<AggregateEvidenceResult> {
  const safeClaims = Array.isArray(claims) ? claims : [];
  const safeFactChecks = Array.isArray(factChecks) ? factChecks : [];
  const safeHits = Array.isArray(searchHits) ? searchHits : [];
  const safeEntities = Array.isArray(entityChecks) ? entityChecks : [];

  const client = options.client ?? new Anthropic({ apiKey: env.anthropicApiKey });
  const model = options.model ?? env.anthropicModel;
  const userMessage = buildUserMessage(
    article,
    safeClaims,
    safeFactChecks,
    safeHits,
    safeEntities
  );

  let response: any;
  try {
    response = await client.messages.create({
      model,
      max_tokens: 1024,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }]
    });
  } catch {
    return fallbackResult({ input_tokens: 0, output_tokens: 0 });
  }

  const usage: EvidenceUsage = {
    input_tokens: response?.usage?.input_tokens ?? 0,
    output_tokens: response?.usage?.output_tokens ?? 0
  };

  let text = '';
  try {
    const content = response?.content;
    if (Array.isArray(content)) {
      const block = content.find((b: { type: string }) => b && b.type === 'text');
      if (block && block.type === 'text') {
        text = typeof block.text === 'string' ? block.text : '';
      }
    }
  } catch {
    return fallbackResult(usage);
  }

  const allowedUrls = collectAllowedUrls(safeFactChecks, safeHits, safeEntities);
  const evidence = parseAndValidate(text, allowedUrls);
  if (!evidence) {
    return fallbackResult(usage);
  }

  return { evidence, usage };
}
