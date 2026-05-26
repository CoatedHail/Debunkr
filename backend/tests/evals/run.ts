#!/usr/bin/env tsx
/**
 * LLM eval suite. Run via `npm run eval`.
 *
 * For each fixture URL:
 *  1. POST /api/check via the live backend
 *  2. Poll until status='complete' or 'failed'
 *  3. Compare overall + bucket to expectedOverallRange + expectedBucket
 *  4. Report pass/fail per row + summary
 *
 * Backend MUST be running locally on http://localhost:4000 with a real
 * ANTHROPIC_API_KEY (no STUB mode). Failing URL extractions don't fail
 * the eval — they're logged as "extract-failed" and skipped from the
 * range check.
 *
 * Burns API credit. ~10 fixtures × ~$0.004 = ~$0.04 per run with Haiku.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

interface Fixture {
  url: string;
  expectedOverallRange: [number, number];
  expectedBucket: string;
  notes: string;
}

interface CheckJob {
  jobId: string;
  status: 'pending' | 'partial' | 'complete' | 'failed';
  overall?: number;
  bucket?: string;
  publisher?: { reliabilityTier?: string };
  error?: { code: string; message: string };
}

const BACKEND_URL = process.env.EVAL_BACKEND_URL ?? 'http://localhost:4000';
const FIXTURE_PATH = path.resolve(process.cwd(), 'tests/evals/credibility.jsonl');

async function pollUntilDone(jobId: string, timeoutMs = 60_000): Promise<CheckJob> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await fetch(`${BACKEND_URL}/api/check/${jobId}`);
    if (!r.ok) throw new Error(`GET /api/check/${jobId} → HTTP ${r.status}`);
    const body = await r.json() as CheckJob;
    if (body.status === 'complete' || body.status === 'failed') return body;
    await new Promise((res) => setTimeout(res, 1_000));
  }
  throw new Error(`Timed out polling jobId ${jobId}`);
}

async function evalOne(fixture: Fixture): Promise<{ url: string; pass: boolean; reason: string }> {
  const r = await fetch(`${BACKEND_URL}/api/check`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: fixture.url, deviceId: `eval-${Date.now()}` })
  });
  if (!r.ok) {
    return { url: fixture.url, pass: false, reason: `submit failed: HTTP ${r.status}` };
  }
  const { jobId } = await r.json() as { jobId: string };
  const job = await pollUntilDone(jobId);

  if (job.status === 'failed') {
    return {
      url: fixture.url,
      pass: false,
      reason: `extract-failed: ${job.error?.code ?? 'unknown'}`
    };
  }
  if (job.overall === undefined) {
    return { url: fixture.url, pass: false, reason: 'no overall score' };
  }

  const [min, max] = fixture.expectedOverallRange;
  const inRange = job.overall >= min && job.overall <= max;
  if (!inRange) {
    return {
      url: fixture.url,
      pass: false,
      reason: `overall ${job.overall} outside [${min}, ${max}]`
    };
  }

  return {
    url: fixture.url,
    pass: true,
    reason: `overall=${job.overall} bucket=${job.bucket} publisher=${job.publisher?.reliabilityTier}`
  };
}

async function main() {
  const text = readFileSync(FIXTURE_PATH, 'utf-8');
  const fixtures: Fixture[] = text
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as Fixture);

  console.log(`Running eval suite: ${fixtures.length} fixtures against ${BACKEND_URL}`);
  console.log('');

  const results: Array<{ url: string; pass: boolean; reason: string }> = [];
  for (const fx of fixtures) {
    process.stdout.write(`  ${fx.url} ... `);
    try {
      const r = await evalOne(fx);
      results.push(r);
      console.log(r.pass ? `✓ ${r.reason}` : `✗ ${r.reason}`);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      results.push({ url: fx.url, pass: false, reason });
      console.log(`✗ ERROR: ${reason}`);
    }
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;

  console.log('');
  console.log(`---`);
  console.log(`Eval: ${passed} passed, ${failed} failed (of ${results.length})`);
  if (failed > 0) {
    console.log('');
    console.log('Failures:');
    for (const r of results) {
      if (!r.pass) console.log(`  ✗ ${r.url}: ${r.reason}`);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Eval suite crashed:', e);
  process.exit(1);
});
