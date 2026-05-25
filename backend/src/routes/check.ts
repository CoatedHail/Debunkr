import { Hono } from 'hono';
import Anthropic from '@anthropic-ai/sdk';
import { isValidUrl } from '../services/url-validator.js';
import { createJobStore, type JobStore } from '../services/job-store.js';
import { extractArticle } from '../services/article-extractor.js';
import { analyzeContent, type AnalyzeResult } from '../services/llm-analyzer.js';
import { analyzeContentStub } from '../services/stub-analyzer.js';
import { env, hasRealLlm } from '../config/env.js';
import type { ApiError } from '../types/api.js';

// Module singletons. Replaceable via setTestDeps() for integration tests.
let store: JobStore = createJobStore();
let client: Anthropic | null = hasRealLlm()
  ? new Anthropic({ apiKey: env.anthropicApiKey })
  : null;

export function setTestDeps(deps: { store?: JobStore; client?: Anthropic | null }): void {
  if (deps.store) store = deps.store;
  if (deps.client !== undefined) client = deps.client;
}

export const checkRoutes = new Hono();

async function runAnalysis(articleText: string): Promise<AnalyzeResult> {
  if (client) {
    return analyzeContent(articleText, { client, model: env.anthropicModel });
  }
  return analyzeContentStub(articleText);
}

async function runPipeline(jobId: string, url: string): Promise<void> {
  const extraction = await extractArticle(url);
  if (!extraction.ok) {
    store.update(jobId, { status: 'failed', error: extraction.error });
    return;
  }

  store.update(jobId, {
    status: 'partial',
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

  store.update(jobId, {
    status: 'complete',
    contentQuality: analysis.score,
    contentReasoning: analysis.reasoning
  });
}

checkRoutes.post('/check', async (c) => {
  const body = await c.req.json().catch(() => null);

  if (!body || typeof body.url !== 'string' || typeof body.deviceId !== 'string') {
    const err: ApiError = {
      error: {
        code: 'URL_INVALID',
        message: 'Request must include {url, deviceId}.',
        retryable: false
      }
    };
    return c.json(err, 400);
  }
  if (!isValidUrl(body.url)) {
    const err: ApiError = {
      error: {
        code: 'URL_INVALID',
        message: 'URL is not a valid http or https URL.',
        retryable: false
      }
    };
    return c.json(err, 400);
  }

  const job = store.create({ url: body.url });
  runPipeline(job.jobId, body.url).catch(() => {
    store.update(job.jobId, {
      status: 'failed',
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unexpected error during analysis.',
        retryable: true
      }
    });
  });

  return c.json({ jobId: job.jobId, status: 'pending' }, 202);
});

checkRoutes.get('/check/:jobId', (c) => {
  const jobId = c.req.param('jobId');
  const job = store.get(jobId);
  if (!job) {
    const err: ApiError = {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unknown jobId.',
        retryable: false
      }
    };
    return c.json(err, 404);
  }
  return c.json(job, 200);
});
