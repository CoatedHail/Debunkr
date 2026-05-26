import { Hono } from 'hono';
import Anthropic from '@anthropic-ai/sdk';
import { isValidUrl } from '../services/url-validator.js';
import { createJobStore, type JobStore } from '../services/job-store.js';
import { extractArticle } from '../services/article-extractor.js';
import { analyzeContent, type AnalyzeResult } from '../services/llm-analyzer.js';
import { analyzeContentStub } from '../services/stub-analyzer.js';
import { runDeepAnalysis, type DeepResult } from '../services/deep-analyzer.js';
import { runDeepAnalysisStub } from '../services/deep-analyzer-stub.js';
import { canonicalDomain, isKnownShortener } from '../services/canonical-domain.js';
import { createDatasetLookup, type DatasetLookup } from '../services/dataset-lookup.js';
import {
  sourceRepFromTier,
  computeOverall,
  bucketLabel,
  deriveConfidence
} from '../services/scoring.js';
import { cheapSignals } from '../services/cheap-signals.js';
import { env, hasRealLlm } from '../config/env.js';
import type { ApiError, PublisherLookup } from '../types/api.js';

let store: JobStore = createJobStore();
let lookup: DatasetLookup = createDatasetLookup();
let client: Anthropic | null = hasRealLlm()
  ? new Anthropic({ apiKey: env.anthropicApiKey })
  : null;
let skipSsrfCheck = false;

// Track article text per jobId so the deep route can re-analyze without
// re-fetching. In M6 this moves to Postgres alongside the job store.
const articleTextByJob = new Map<string, string>();

export function setTestDeps(deps: {
  store?: JobStore;
  client?: Anthropic | null;
  lookup?: DatasetLookup;
  skipSsrfCheck?: boolean;
}): void {
  if (deps.store) store = deps.store;
  if (deps.client !== undefined) client = deps.client;
  if (deps.lookup) lookup = deps.lookup;
  if (deps.skipSsrfCheck !== undefined) skipSsrfCheck = deps.skipSsrfCheck;
  // Always clear inter-job text on test override
  articleTextByJob.clear();
}

export const checkRoutes = new Hono();

async function runAnalysis(articleText: string): Promise<AnalyzeResult> {
  if (client) return analyzeContent(articleText, { client, model: env.anthropicModel });
  return analyzeContentStub(articleText);
}

async function runDeep(articleText: string): Promise<DeepResult> {
  if (client) return runDeepAnalysis(articleText, { client, model: env.anthropicModel });
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

async function runPipeline(jobId: string, url: string): Promise<void> {
  const publisher = lookupPublisher(url);

  const extraction = await extractArticle(url, { skipSsrfCheck });
  if (!extraction.ok) {
    store.update(jobId, { status: 'failed', publisher, error: extraction.error });
    return;
  }

  store.update(jobId, {
    status: 'partial',
    publisher,
    article: {
      title: extraction.article.title,
      byline: extraction.article.byline,
      siteName: extraction.article.siteName
    }
  });

  const analysis = await runAnalysis(extraction.article.text);
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

  // Stash article text for potential Deep Analysis later.
  articleTextByJob.set(jobId, extraction.article.text);

  store.update(jobId, {
    status: 'complete',
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
    bias: { scale: analysis.biasScale, source: 'llm' },
    counterArgument: analysis.counterArgument,
    deepStatus: 'idle'
  });
}

async function runDeepPipeline(jobId: string): Promise<void> {
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

  const result = await runDeep(text);
  if (!result.ok) {
    store.update(jobId, { deepStatus: 'failed', deepError: result.error });
    return;
  }

  store.update(jobId, {
    deepStatus: 'complete',
    deepAnalysis: result.deepAnalysis
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

  const job = store.create({ url: body.url });
  runPipeline(job.jobId, body.url).catch(() => {
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

  // Kick off deep pipeline (fire-and-forget; result lands in store).
  store.update(jobId, { deepStatus: 'pending', deepError: undefined, deepAnalysis: undefined });
  runDeepPipeline(jobId).catch(() => {
    store.update(jobId, {
      deepStatus: 'failed',
      deepError: { code: 'INTERNAL_ERROR', message: 'Unexpected error during deep analysis.', retryable: true }
    });
  });

  return c.json({ jobId, deepStatus: 'pending' }, 202);
});
