import { Hono } from 'hono';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { isValidUrl } from '../services/url-validator.js';
import { createJobStore, type JobStore } from '../services/job-store.js';
import { extractArticle } from '../services/article-extractor.js';
import { analyzeContent, type AnalyzeResult, type UsageStats } from '../services/llm-analyzer.js';
import { analyzeContentStub } from '../services/stub-analyzer.js';
import { runDeepAnalysis, type DeepResult } from '../services/deep-analyzer.js';
import { runDeepAnalysisStub } from '../services/deep-analyzer-stub.js';
import type { FactCheckRunResult } from '../services/fact-checker.js';
import { canonicalDomain, isKnownShortener } from '../services/canonical-domain.js';
import { createDatasetLookup, type DatasetLookup } from '../services/dataset-lookup.js';
import { createRateLimiter, type RateLimiter } from '../services/rate-limiter.js';
import { createCostTracker, type CostTracker } from '../services/cost-tracker.js';
import { createCache, articleTextHash, ttlForUrl, type Cache } from '../services/cache.js';
import {
  researchPublisher as defaultResearchPublisher,
  type PublisherResearchResult
} from '../services/publisher-research.js';
import { researchPublisherStub } from '../services/publisher-research-stub.js';
import {
  sourceRepFromTier,
  computeOverall,
  bucketLabel,
  deriveConfidence,
  applyEvidenceDelta
} from '../services/scoring.js';
import { cheapSignals } from '../services/cheap-signals.js';
import { env, hasRealLlm } from '../config/env.js';
import type { ApiError, PublisherLookup } from '../types/api.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');

let store: JobStore = createJobStore();
let lookup: DatasetLookup = createDatasetLookup();
let rateLimiter: RateLimiter = createRateLimiter();
let costTracker: CostTracker = createCostTracker({ monthlyBudgetUsd: env.monthlyBudgetUsd, dataDir: DATA_DIR });
let cache: Cache = createCache();
let client: Anthropic | null = hasRealLlm()
  ? new Anthropic({ apiKey: env.anthropicApiKey })
  : null;
let extractorOpts: { skipSsrfCheck?: boolean } = {};
let runFactCheckFn: ((articleText: string) => Promise<FactCheckRunResult>) | undefined;
let researchPublisherFn: (domain: string) => Promise<PublisherResearchResult> = async (domain) => {
  if (client) {
    return defaultResearchPublisher(domain, { client, model: env.anthropicModel });
  }
  return researchPublisherStub(domain);
};

const articleTextByJob = new Map<string, string>();

// Simple in-memory cache keyed by canonical domain. 24h TTL.
// Lives at module scope so repeated checks of the same unknown publisher
// (across different jobIds) don't re-bill the AI call.
const PUBLISHER_RESEARCH_TTL_MS = 24 * 60 * 60 * 1000;
interface ResearchCacheEntry {
  value: PublisherResearchResult;
  expiresAt: number;
}
const publisherResearchCache = new Map<string, ResearchCacheEntry>();

function getCachedResearch(domain: string): PublisherResearchResult | undefined {
  const entry = publisherResearchCache.get(domain);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    publisherResearchCache.delete(domain);
    return undefined;
  }
  return entry.value;
}

function setCachedResearch(domain: string, value: PublisherResearchResult): void {
  publisherResearchCache.set(domain, {
    value,
    expiresAt: Date.now() + PUBLISHER_RESEARCH_TTL_MS
  });
}

function clearPublisherResearchCache(): void {
  publisherResearchCache.clear();
}

const EXCERPT_MAX_CHARS = 280;

/**
 * Build a short excerpt from the extracted article body:
 *   1. collapse all whitespace to single spaces, trim
 *   2. if <= EXCERPT_MAX_CHARS, return as-is
 *   3. otherwise trim at the last full word inside the budget and append "…"
 *
 * Returns undefined when the input has no usable text so callers can leave
 * the field unset rather than emitting an empty string.
 */
function buildExcerpt(rawText: string): string | undefined {
  const normalized = rawText.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;
  if (normalized.length <= EXCERPT_MAX_CHARS) return normalized;
  const slice = normalized.slice(0, EXCERPT_MAX_CHARS);
  const lastSpace = slice.lastIndexOf(' ');
  const wordTrimmed = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
  return wordTrimmed.replace(/[\s.,;:!?-]+$/, '') + '…';
}

export function setTestDeps(deps: {
  store?: JobStore;
  client?: Anthropic | null;
  lookup?: DatasetLookup;
  rateLimiter?: RateLimiter;
  costTracker?: CostTracker;
  cache?: Cache;
  skipSsrfCheck?: boolean;
  runFactCheckFn?: ((articleText: string) => Promise<FactCheckRunResult>) | null;
  researchPublisherFn?: ((domain: string) => Promise<PublisherResearchResult>) | null;
}): void {
  if (deps.store) store = deps.store;
  if (deps.client !== undefined) client = deps.client;
  if (deps.lookup) lookup = deps.lookup;
  if (deps.rateLimiter) rateLimiter = deps.rateLimiter;
  if (deps.costTracker) costTracker = deps.costTracker;
  if (deps.cache) cache = deps.cache;
  if (deps.skipSsrfCheck !== undefined) extractorOpts = { skipSsrfCheck: deps.skipSsrfCheck };
  if (deps.runFactCheckFn !== undefined) {
    runFactCheckFn = deps.runFactCheckFn ?? undefined;
  }
  if (deps.researchPublisherFn !== undefined) {
    researchPublisherFn = deps.researchPublisherFn ?? (async (domain) => {
      if (client) {
        return defaultResearchPublisher(domain, { client, model: env.anthropicModel });
      }
      return researchPublisherStub(domain);
    });
  }
  articleTextByJob.clear();
  clearPublisherResearchCache();
}

export const checkRoutes = new Hono();

function clientIp(c: any): string {
  const xff = c.req.header('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return c.req.header('x-real-ip') ?? 'unknown';
}

async function runAnalysisWithCost(jobId: string, deviceId: string, ip: string, articleText: string): Promise<AnalyzeResult> {
  if (client) {
    const result = await analyzeContent(articleText, { client, model: env.anthropicModel });
    if (result.usage) {
      await costTracker.record({
        jobId, deviceId, ip, model: env.anthropicModel,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens
      });
    }
    return result;
  }
  return analyzeContentStub(articleText);
}

async function runDeepWithCost(jobId: string, deviceId: string, ip: string, articleText: string): Promise<DeepResult> {
  if (client) {
    const result = await runDeepAnalysis(articleText, {
      client,
      model: env.anthropicModel,
      ...(runFactCheckFn ? { runFactCheckFn } : {})
    });
    if (result.usage.inputTokens + result.usage.outputTokens > 0) {
      await costTracker.record({
        jobId, deviceId, ip, model: env.anthropicModel,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens
      });
    }
    // M8: record fact-check (claim extractor + aggregator) usage too.
    if (result.ok && result.factCheckUsage) {
      const fcInput = result.factCheckUsage.input_tokens;
      const fcOutput = result.factCheckUsage.output_tokens;
      if (fcInput + fcOutput > 0) {
        await costTracker.record({
          jobId, deviceId, ip, model: env.anthropicModel,
          inputTokens: fcInput,
          outputTokens: fcOutput
        });
      }
    }
    return result;
  }
  return runDeepAnalysisStub(articleText);
}

function lookupPublisher(url: string): PublisherLookup {
  const domain = canonicalDomain(url);
  if (!domain) {
    return { canonicalDomain: null, reliabilityTier: 'unknown', verdicts: [] };
  }
  if (isKnownShortener(domain)) {
    return {
      canonicalDomain: domain,
      reliabilityTier: 'unknown',
      verdicts: [{
        source: 'curated-wikipedia',
        verdict: `URL is a known shortener (${domain}). Resolve the link and check the destination.`
      }]
    };
  }
  return lookup(domain);
}

async function runPipeline(jobId: string, url: string, deviceId: string, ip: string): Promise<void> {
  const publisher = lookupPublisher(url);

  const extraction = await extractArticle(url, extractorOpts);
  if (!extraction.ok) {
    store.update(jobId, { status: 'failed', publisher, error: extraction.error });
    return;
  }

  const excerpt = buildExcerpt(extraction.article.text);

  store.update(jobId, {
    status: 'partial',
    publisher,
    article: {
      title: extraction.article.title,
      byline: extraction.article.byline,
      siteName: extraction.article.siteName,
      excerpt
    }
  });

  // Cache lookup before LLM
  const canonUrl = canonicalDomain(url) ?? url;
  const hash = articleTextHash(extraction.article.text);
  const cached = cache.get(canonUrl, hash);
  if (cached) {
    const { jobId: _cachedJobId, ...cachedFields } = cached;
    store.update(jobId, cachedFields);
    articleTextByJob.set(jobId, extraction.article.text);
    return;
  }

  const analysis = await runAnalysisWithCost(jobId, deviceId, ip, extraction.article.text);
  if (!analysis.ok) {
    store.update(jobId, { status: 'failed', error: analysis.error });
    return;
  }

  const tierScore = sourceRepFromTier(publisher.reliabilityTier);
  let sourceRep: number;
  let sourceRepFrom: 'curated-wikipedia' | 'cheap-signals';
  let cheap: ReturnType<typeof cheapSignals> | undefined;
  if (tierScore !== null) {
    sourceRep = tierScore;
    sourceRepFrom = 'curated-wikipedia';
  } else {
    cheap = cheapSignals({
      url,
      byline: extraction.article.byline,
      siteName: extraction.article.siteName,
      articleText: extraction.article.text
    });
    sourceRep = cheap.score;
    sourceRepFrom = 'cheap-signals';
  }

  const overall = computeOverall({
    sourceRep,
    contentQuality: analysis.contentQuality,
    bias: analysis.biasScale
  });

  articleTextByJob.set(jobId, extraction.article.text);

  const completedResult = {
    jobId,
    status: 'complete' as const,
    article: {
      title: extraction.article.title,
      byline: extraction.article.byline,
      siteName: extraction.article.siteName,
      excerpt
    },
    publisher,
    overall,
    bucket: bucketLabel(overall),
    confidence: deriveConfidence({
      datasetCount: publisher.verdicts.length,
      extractionOk: true
    }),
    sourceRep,
    sourceRepFrom,
    cheapSignals: cheap,
    contentQuality: analysis.contentQuality,
    contentReasoning: analysis.contentReasoning,
    bias: { scale: analysis.biasScale, source: 'llm' as const },
    counterArgument: analysis.counterArgument,
    deepStatus: 'idle' as const
  };

  store.update(jobId, completedResult);

  // Cache the completed result (without jobId — caller overlays new jobId on hit).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { jobId: _ignore, ...cacheable } = completedResult;
  cache.set(canonUrl, hash, cacheable as any, ttlForUrl(url));
}

async function runDeepPipeline(jobId: string, deviceId: string, ip: string): Promise<void> {
  const text = articleTextByJob.get(jobId);
  if (!text) {
    store.update(jobId, {
      deepStatus: 'failed',
      deepError: {
        code: 'INTERNAL_ERROR',
        message: 'Article text no longer available. Re-check the URL first.',
        retryable: false
      }
    });
    return;
  }

  store.update(jobId, { deepStatus: 'pending' });

  const result = await runDeepWithCost(jobId, deviceId, ip, text);
  if (!result.ok) {
    store.update(jobId, { deepStatus: 'failed', deepError: result.error });
    return;
  }

  // M8: if external evidence shifted credibility, adjust overall + bucket.
  const evidence = result.evidence;
  const currentJob = store.get(jobId);
  const currentOverall =
    typeof currentJob?.overall === 'number' ? currentJob.overall : undefined;

  let nextOverall: number | undefined;
  let nextBucket: ReturnType<typeof bucketLabel> | undefined;
  if (evidence && typeof currentOverall === 'number') {
    const adjusted = applyEvidenceDelta(currentOverall, evidence);
    if (adjusted !== currentOverall) {
      nextOverall = adjusted;
      nextBucket = bucketLabel(adjusted);
    }
  }

  store.update(jobId, {
    deepStatus: 'complete',
    deepAnalysis: result.deepAnalysis,
    ...(nextOverall !== undefined ? { overall: nextOverall, bucket: nextBucket } : {})
  });
}

checkRoutes.post('/check', async (c) => {
  const body = await c.req.json().catch(() => null);

  if (!body || typeof body.url !== 'string' || typeof body.deviceId !== 'string') {
    const err: ApiError = {
      error: { code: 'URL_INVALID', message: 'Request must include {url, deviceId}.', retryable: false }
    };
    return c.json(err, 400);
  }
  if (!isValidUrl(body.url)) {
    const err: ApiError = {
      error: { code: 'URL_INVALID', message: 'URL is not a valid http or https URL.', retryable: false }
    };
    return c.json(err, 400);
  }

  const ip = clientIp(c);

  // Rate limit
  const rl = rateLimiter.consume(body.deviceId, ip, 'single');
  if (!rl.allowed) {
    const err: ApiError = {
      error: {
        code: 'RATE_LIMITED',
        message: 'Daily check limit reached. Try again after midnight UTC.',
        retryable: true,
        retryAfter: rl.retryAfter
      }
    };
    return c.json(err, 429);
  }

  // Budget check
  const budget = await costTracker.check();
  if (budget.exceeded) {
    const err: ApiError = {
      error: {
        code: 'BUDGET_EXCEEDED',
        message: `Service paused: monthly AI budget exceeded ($${budget.monthlySpendUsd.toFixed(2)}/$${budget.budgetUsd}). Try next month.`,
        retryable: false
      }
    };
    return c.json(err, 503);
  }

  const job = store.create({ url: body.url });
  runPipeline(job.jobId, body.url, body.deviceId, ip).catch(() => {
    store.update(job.jobId, {
      status: 'failed',
      error: { code: 'INTERNAL_ERROR', message: 'Unexpected error during analysis.', retryable: true }
    });
  });

  return c.json({ jobId: job.jobId, status: 'pending' }, 202);
});

checkRoutes.get('/check/:jobId', (c) => {
  const jobId = c.req.param('jobId');
  const job = store.get(jobId);
  if (!job) {
    const err: ApiError = {
      error: { code: 'INTERNAL_ERROR', message: 'Unknown jobId.', retryable: false }
    };
    return c.json(err, 404);
  }
  return c.json(job, 200);
});

checkRoutes.post('/check/:jobId/deep', async (c) => {
  const jobId = c.req.param('jobId');
  const job = store.get(jobId);
  if (!job) {
    const err: ApiError = {
      error: { code: 'INTERNAL_ERROR', message: 'Unknown jobId.', retryable: false }
    };
    return c.json(err, 404);
  }
  if (job.status !== 'complete') {
    const err: ApiError = {
      error: {
        code: 'JOB_NOT_COMPLETE',
        message: 'Deep Analysis requires a completed initial check.',
        retryable: false
      }
    };
    return c.json(err, 409);
  }
  if (job.deepStatus === 'pending') {
    return c.json({ jobId, deepStatus: 'pending' }, 202);
  }

  // Extract device + ip from body / headers (re-derive since this is a fresh request)
  const body = await c.req.json().catch(() => null) ?? {};
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId : 'unknown';
  const ip = clientIp(c);

  // Rate limit for deep
  const rl = rateLimiter.consume(deviceId, ip, 'deep');
  if (!rl.allowed) {
    const err: ApiError = {
      error: {
        code: 'RATE_LIMITED',
        message: 'Daily Deep Analysis limit reached. Try again after midnight UTC.',
        retryable: true,
        retryAfter: rl.retryAfter
      }
    };
    return c.json(err, 429);
  }

  const budget = await costTracker.check();
  if (budget.exceeded) {
    const err: ApiError = {
      error: { code: 'BUDGET_EXCEEDED', message: 'Service paused: monthly AI budget exceeded.', retryable: false }
    };
    return c.json(err, 503);
  }

  store.update(jobId, { deepStatus: 'pending', deepError: undefined, deepAnalysis: undefined });
  runDeepPipeline(jobId, deviceId, ip).catch(() => {
    store.update(jobId, {
      deepStatus: 'failed',
      deepError: { code: 'INTERNAL_ERROR', message: 'Unexpected error during deep analysis.', retryable: true }
    });
  });

  return c.json({ jobId, deepStatus: 'pending' }, 202);
});

/**
 * POST /api/check/:jobId/publisher-research — opt-in AI lookup for unknown publishers.
 *
 * Body: { deviceId: string }
 *
 * - 404 if jobId unknown
 * - 400 NOT_APPLICABLE unless publisher.reliabilityTier === 'unknown' and canonicalDomain present
 * - 429 RATE_LIMITED (shared with the single-check bucket)
 * - 503 BUDGET_EXCEEDED (shared monthly cost cap)
 * - 200 with { summary, sentiment, citations } on success; also persists onto
 *   job.publisher.aiResearch so subsequent GETs include it.
 *
 * Cached per canonical domain for 24h at module scope.
 */
checkRoutes.post('/check/:jobId/publisher-research', async (c) => {
  const jobId = c.req.param('jobId');
  const job = store.get(jobId);
  if (!job) {
    const err: ApiError = {
      error: { code: 'INTERNAL_ERROR', message: 'Unknown jobId.', retryable: false }
    };
    return c.json(err, 404);
  }

  const publisher = job.publisher;
  if (!publisher || publisher.reliabilityTier !== 'unknown' || !publisher.canonicalDomain) {
    const err: ApiError = {
      error: {
        code: 'NOT_APPLICABLE',
        message: 'Publisher research is only available for unknown publishers.',
        retryable: false
      }
    };
    return c.json(err, 400);
  }

  const body = await c.req.json().catch(() => null) ?? {};
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId : 'unknown';
  const ip = clientIp(c);

  // Reuse the existing single-check rate-limit bucket — don't introduce a new kind.
  const rl = rateLimiter.consume(deviceId, ip, 'single');
  if (!rl.allowed) {
    const err: ApiError = {
      error: {
        code: 'RATE_LIMITED',
        message: 'Daily check limit reached. Try again after midnight UTC.',
        retryable: true,
        retryAfter: rl.retryAfter
      }
    };
    return c.json(err, 429);
  }

  const budget = await costTracker.check();
  if (budget.exceeded) {
    const err: ApiError = {
      error: {
        code: 'BUDGET_EXCEEDED',
        message: `Service paused: monthly AI budget exceeded ($${budget.monthlySpendUsd.toFixed(2)}/$${budget.budgetUsd}). Try next month.`,
        retryable: false
      }
    };
    return c.json(err, 503);
  }

  const domain = publisher.canonicalDomain;
  let result = getCachedResearch(domain);

  if (!result) {
    try {
      result = await researchPublisherFn(domain);
    } catch {
      // researchPublisher catches its own errors and returns the safe default,
      // but guard against a misbehaving DI hook in tests just in case.
      result = {
        summary: 'Publisher research unavailable.',
        sentiment: 'unclear',
        citations: []
      };
    }
    setCachedResearch(domain, result);

    if (result.usage && (result.usage.input_tokens > 0 || result.usage.output_tokens > 0)) {
      await costTracker.record({
        jobId,
        deviceId,
        ip,
        model: env.anthropicModel,
        inputTokens: result.usage.input_tokens,
        outputTokens: result.usage.output_tokens
      });
    }
  }

  // Persist onto the job so polling clients see it on the next GET.
  const aiResearch = {
    summary: result.summary,
    sentiment: result.sentiment,
    citations: result.citations
  };
  store.update(jobId, {
    publisher: { ...publisher, aiResearch }
  });

  return c.json(aiResearch, 200);
});
