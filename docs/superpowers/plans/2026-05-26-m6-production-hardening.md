# M6 — Production hardening

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Take V1 from "works on my Mac in stub or real mode" to "safe enough to deploy publicly behind a $5/mo backend." Add the four production-essential safety nets: **SSRF guard** on the extractor, **rate limit** per device+IP, **cost circuit-breaker** that trips loudly when monthly LLM spend exceeds the cap, and **response caching** so a hot URL doesn't bill ten times. Migrate from the in-memory `Map` JobStore to **Postgres** so a redeploy doesn't wipe results. Ship a **feedback 👍/👎 widget** that builds a proprietary dataset from day 1 (the M4-era "moat" item from the destroyer-investor exercise).

**Architecture:**

- New service `ssrf-guard.ts` — DNS-resolves URLs and refuses requests to private IP ranges (RFC1918, loopback, link-local, AWS metadata). Hooked into article-extractor before the fetch call.
- New service `rate-limiter.ts` — composite (deviceId, ip) key. Two counters per key: `single` (20/day) and `deep` (3/day). Window resets at midnight UTC.
- New service `cost-tracker.ts` — appends every Anthropic response's input/output tokens to a `cost_events` table; sums on each new request; circuit-breaks at configurable monthly USD cap.
- New service `cache.ts` — keyed by `(canonical-url, content-hash)`, value is the full `JobResult`. TTL 24h default, 1h for URL patterns matching news (`/202[0-9]/`, `/news/`).
- Migrate `job-store.ts` from in-memory `Map` to **Postgres** via `pg` library. Same interface; integration tests cover round-trip + concurrent updates.
- Feedback widget: 👍/👎 + optional comment captured at result screen, POST to `/api/feedback`, stored in `feedback_events` table.
- Mobile UI: rate-limit messages, cost-exhausted state, "cached result — re-check?" hint, feedback row on every complete result.

**Tech stack additions:** `pg` (Postgres client), `whois-json` deferred. No mobile additions.

**Out of scope (deferred to M7 or post-V1):**
- WHOIS domain-age signal — needs persistent DNS-style cache; adds latency
- Outbound-link count signal — needs raw HTML pass-through from extractor
- Maestro mobile E2E — deferred to M7 alongside store submission
- LLM eval suite (~30 fixture URLs) — deferred to M7 (low value until prompts stabilize)
- AllSides license + bias dataset — still pending external verification
- Multi-LLM-family Deep Analysis — V2

---

## Prerequisites

- [ ] **P0a:** M5 still works. `cd backend && npm test` → 97 passing.
- [ ] **P0b:** On branch `m6-production-hardening`.
- [ ] **P0c:** Postgres installed locally OR Railway/Render Postgres URL on hand. For local dev: `brew install postgresql@17 && brew services start postgresql@17 && createdb credibility_check_dev`.

---

## Task 1: Install pg + Postgres setup

**Files:** Modify `backend/package.json`, `package-lock.json`, `.env.example`.

- [ ] **Step 1.1:** Install
```bash
cd backend
npm install pg
npm install --save-dev @types/pg
```

- [ ] **Step 1.2:** Update `backend/.env.example`:

```
# Backend port
PORT=4000

# Log level: debug, info, warn, error
LOG_LEVEL=info

# Anthropic API key — optional; backend uses stub LLM when empty
ANTHROPIC_API_KEY=

# Claude model to use
ANTHROPIC_MODEL=claude-haiku-4-5

# Postgres connection string
# Local dev: postgres://localhost/credibility_check_dev
# Production: provided by Railway/Render
DATABASE_URL=postgres://localhost/credibility_check_dev

# Monthly LLM budget cap (USD). Above this, all new analysis returns BUDGET_EXCEEDED.
# Set to 0 to disable the cap.
MONTHLY_BUDGET_USD=10

# Optional webhook to fire when budget cap is hit (Slack, Discord, etc.)
BUDGET_ALERT_WEBHOOK=
```

- [ ] **Step 1.3:** Update `backend/src/config/env.ts`:

```ts
import dotenv from 'dotenv';

dotenv.config({ override: true });

export const env = {
  port: Number(process.env.PORT ?? 4000),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  anthropicApiKey: (process.env.ANTHROPIC_API_KEY ?? '').trim() || undefined,
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5',
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://localhost/credibility_check_dev',
  monthlyBudgetUsd: Number(process.env.MONTHLY_BUDGET_USD ?? 10),
  budgetAlertWebhook: (process.env.BUDGET_ALERT_WEBHOOK ?? '').trim() || undefined
};

export function hasRealLlm(): boolean {
  return env.anthropicApiKey !== undefined;
}

export function hasBudgetCap(): boolean {
  return env.monthlyBudgetUsd > 0;
}
```

- [ ] **Step 1.4:** Commit
```bash
cd ..
git add backend/package.json backend/package-lock.json backend/.env.example backend/src/config/env.ts
git commit -m "chore(backend): add pg + Postgres config + budget cap env vars"
```

---

## Task 2: Postgres schema + connection pool

**Files:**
- Create: `backend/src/db/schema.sql`
- Create: `backend/src/db/pool.ts`
- Create: `backend/src/db/migrate.ts`
- Create: `backend/tests/db/migrate.test.ts`

Schema covers jobs, article_text, cost_events, feedback_events, rate_limit_counters. Single SQL file applied via a tiny migration runner.

- [ ] **Step 2.1:** Create `backend/src/db/schema.sql`:

```sql
-- jobs: lifecycle state + serialized JobResult fields
CREATE TABLE IF NOT EXISTS jobs (
  job_id        TEXT PRIMARY KEY,
  url           TEXT NOT NULL,
  device_id     TEXT NOT NULL,
  ip            TEXT,
  result        JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_jobs_device ON jobs (device_id, created_at DESC);

-- article_text: separated to keep jobs row small + queryable
CREATE TABLE IF NOT EXISTS article_text (
  job_id        TEXT PRIMARY KEY REFERENCES jobs(job_id) ON DELETE CASCADE,
  text          TEXT NOT NULL,
  content_hash  TEXT NOT NULL
);

-- cost_events: every LLM call logs tokens + estimated cost
CREATE TABLE IF NOT EXISTS cost_events (
  id            BIGSERIAL PRIMARY KEY,
  job_id        TEXT,
  device_id     TEXT,
  ip            TEXT,
  model         TEXT NOT NULL,
  input_tokens  INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd      NUMERIC(10, 6) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cost_events_month ON cost_events (created_at);

-- feedback_events: 👍/👎 + optional comment
CREATE TABLE IF NOT EXISTS feedback_events (
  id            BIGSERIAL PRIMARY KEY,
  job_id        TEXT NOT NULL,
  device_id     TEXT NOT NULL,
  vote          TEXT NOT NULL CHECK (vote IN ('up', 'down')),
  comment       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feedback_job ON feedback_events (job_id);

-- rate_limit_counters: per (device_id|ip, kind), reset daily at midnight UTC
CREATE TABLE IF NOT EXISTS rate_limit_counters (
  bucket        TEXT NOT NULL,  -- "device:<id>" or "ip:<ip>"
  kind          TEXT NOT NULL CHECK (kind IN ('single', 'deep')),
  day_utc       DATE NOT NULL,  -- truncated to day in UTC
  count         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, kind, day_utc)
);

-- cache: by (canonical_url, content_hash). 24h TTL default.
CREATE TABLE IF NOT EXISTS cache (
  cache_key     TEXT PRIMARY KEY,  -- "<canonical_url>|<content_hash>"
  result        JSONB NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache (expires_at);
```

- [ ] **Step 2.2:** Create `backend/src/db/pool.ts`:

```ts
import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;

// Singleton pool. Backend opens at boot, closes on shutdown.
export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000
});

export async function withTx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 2.3:** Create `backend/src/db/migrate.ts`:

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pool } from './pool.js';

const SCHEMA_PATH = path.resolve(process.cwd(), 'src', 'db', 'schema.sql');

export async function runMigrations(): Promise<void> {
  const sql = readFileSync(SCHEMA_PATH, 'utf-8');
  await pool.query(sql);
}
```

- [ ] **Step 2.4:** Wire migrations into boot — modify `backend/src/index.ts`:

```ts
import { serve } from '@hono/node-server';
import pino from 'pino';
import { env, hasRealLlm } from './config/env.js';
import { runMigrations } from './db/migrate.js';
import { app } from './server.js';

const logger = pino({
  level: env.logLevel,
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty' }
    : undefined
});

async function main() {
  try {
    await runMigrations();
    logger.info('Postgres migrations applied');
  } catch (e) {
    logger.error({ err: e }, 'Failed to apply migrations — backend cannot start');
    process.exit(1);
  }

  serve({ fetch: app.fetch, port: env.port }, (info) => {
    logger.info(`Backend listening on http://localhost:${info.port}`);
    if (hasRealLlm()) {
      logger.info(`LLM: real Claude (${env.anthropicModel})`);
    } else {
      logger.warn('LLM: STUB mode (no ANTHROPIC_API_KEY in .env — returns fixed score 75)');
    }
    logger.info(`DB: ${env.databaseUrl.replace(/:[^@]*@/, ':***@')}`);
  });
}

main();
```

- [ ] **Step 2.5:** Write a smoke test — `backend/tests/db/migrate.test.ts`:

```ts
import { pool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';

describe('runMigrations (Postgres)', () => {
  afterAll(async () => { await pool.end(); });

  it('creates all expected tables', async () => {
    await runMigrations();
    const r = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`
    );
    const tables = r.rows.map(r => r.table_name);
    expect(tables).toEqual(expect.arrayContaining([
      'jobs', 'article_text', 'cost_events', 'feedback_events',
      'rate_limit_counters', 'cache'
    ]));
  });
});
```

**Caveat:** this test requires a local Postgres. If `DATABASE_URL` not reachable, the test fails clearly. Add a Jest skip-on-no-db hook? For V1 personal use, prefer failing loudly so the dev sees the requirement. Document in retro.

- [ ] **Step 2.6:** Run test
```bash
cd backend && npm test -- migrate
```

- [ ] **Step 2.7:** Commit
```bash
cd ..
git add backend/src/db/ backend/src/index.ts backend/tests/db/
git commit -m "feat(backend): add Postgres schema (jobs/article_text/cost_events/feedback/rate_limit/cache) + migration runner"
```

---

## Task 3: Postgres-backed JobStore

**Files:**
- Modify: `backend/src/services/job-store.ts`
- Modify: `backend/tests/services/job-store.test.ts`

Same interface as before — `create`, `get`, `update`. Internals swap `Map` for SQL.

- [ ] **Step 3.1:** Replace `backend/src/services/job-store.ts` ENTIRELY:

```ts
import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';
import type { JobResult } from '../types/api.js';

export interface CreateJobInput {
  url: string;
  deviceId?: string;
  ip?: string;
}

export interface JobStore {
  create(input: CreateJobInput): Promise<JobResult>;
  get(jobId: string): Promise<JobResult | undefined>;
  update(jobId: string, fields: Partial<Omit<JobResult, 'jobId'>>): Promise<void>;
}

export function createJobStore(): JobStore {
  return {
    async create({ url, deviceId, ip }) {
      const jobId = randomUUID();
      const job: JobResult = { jobId, status: 'pending' };
      await pool.query(
        `INSERT INTO jobs (job_id, url, device_id, ip, result)
         VALUES ($1, $2, $3, $4, $5)`,
        [jobId, url, deviceId ?? 'unknown', ip ?? null, job]
      );
      return job;
    },

    async get(jobId) {
      const r = await pool.query<{ result: JobResult }>(
        `SELECT result FROM jobs WHERE job_id = $1`,
        [jobId]
      );
      return r.rows[0]?.result;
    },

    async update(jobId, fields) {
      // Read-modify-write inside a transaction so concurrent updates don't lose fields.
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const r = await client.query<{ result: JobResult }>(
          `SELECT result FROM jobs WHERE job_id = $1 FOR UPDATE`,
          [jobId]
        );
        if (r.rows.length === 0) {
          await client.query('ROLLBACK');
          return;
        }
        const merged: JobResult = { ...r.rows[0].result, ...fields };
        await client.query(
          `UPDATE jobs SET result = $1, updated_at = NOW() WHERE job_id = $2`,
          [merged, jobId]
        );
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }
  };
}
```

- [ ] **Step 3.2:** Update `backend/tests/services/job-store.test.ts` — every test becomes async + needs a clean table. Replace ENTIRELY:

```ts
import { pool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';
import { createJobStore } from '../../src/services/job-store.js';

beforeAll(async () => { await runMigrations(); });
beforeEach(async () => { await pool.query('TRUNCATE TABLE jobs CASCADE'); });
afterAll(async () => { await pool.end(); });

describe('JobStore (Postgres)', () => {
  it('creates a job and returns a unique jobId', async () => {
    const store = createJobStore();
    const job = await store.create({ url: 'https://example.com' });
    expect(job.jobId).toMatch(/^[0-9a-f-]{36}$/);
    expect(job.status).toBe('pending');
  });

  it('retrieves a job by id', async () => {
    const store = createJobStore();
    const { jobId } = await store.create({ url: 'https://example.com' });
    const fetched = await store.get(jobId);
    expect(fetched).toBeDefined();
    expect(fetched?.status).toBe('pending');
  });

  it('returns undefined for unknown jobId', async () => {
    const store = createJobStore();
    expect(await store.get('unknown-id')).toBeUndefined();
  });

  it('updates a job to partial with article metadata', async () => {
    const store = createJobStore();
    const { jobId } = await store.create({ url: 'https://example.com/a' });
    await store.update(jobId, {
      status: 'partial',
      article: { title: 'Test', siteName: 'example.com' }
    });
    const result = await store.get(jobId);
    expect(result?.status).toBe('partial');
    expect(result?.article?.title).toBe('Test');
  });

  it('updates a job to complete with content score', async () => {
    const store = createJobStore();
    const { jobId } = await store.create({ url: 'https://example.com/a' });
    await store.update(jobId, {
      status: 'complete',
      contentQuality: 72,
      contentReasoning: 'Article cites multiple primary sources.'
    });
    const result = await store.get(jobId);
    expect(result?.status).toBe('complete');
    expect(result?.contentQuality).toBe(72);
  });

  it('updates a job to failed with an error envelope', async () => {
    const store = createJobStore();
    const { jobId } = await store.create({ url: 'https://example.com/a' });
    await store.update(jobId, {
      status: 'failed',
      error: { code: 'EXTRACTION_FAILED', message: 'x', retryable: true }
    });
    const result = await store.get(jobId);
    expect(result?.status).toBe('failed');
    expect(result?.error?.code).toBe('EXTRACTION_FAILED');
  });

  it('preserves earlier fields across multiple updates', async () => {
    const store = createJobStore();
    const { jobId } = await store.create({ url: 'https://example.com/a' });
    await store.update(jobId, { status: 'partial', article: { title: 'X' } });
    await store.update(jobId, { status: 'complete', contentQuality: 50 });
    const result = await store.get(jobId);
    expect(result?.article?.title).toBe('X');
    expect(result?.contentQuality).toBe(50);
  });
});
```

- [ ] **Step 3.3:** Run tests
```bash
cd backend && npm test -- job-store
```
Expected: 7/7 pass (against real Postgres).

- [ ] **Step 3.4:** Update routes/check.ts — all `store.create`, `store.get`, `store.update` calls become `await`-ed. Replace the relevant section of `backend/src/routes/check.ts` accordingly (see Task 5 for the full file).

- [ ] **Step 3.5:** Commit
```bash
cd ..
git add backend/src/services/job-store.ts backend/tests/services/job-store.test.ts
git commit -m "feat(backend): migrate JobStore from in-memory Map to Postgres with row-level locking"
```

---

## Task 4: SSRF guard

**Files:**
- Create: `backend/src/services/ssrf-guard.ts`
- Create: `backend/tests/services/ssrf-guard.test.ts`
- Modify: `backend/src/services/article-extractor.ts`

Resolves URL hostname to IPs before fetch. Refuses if any IP is in a blocked range. Re-checks after each redirect (uses manual redirect handling).

- [ ] **Step 4.1:** Write failing test — `backend/tests/services/ssrf-guard.test.ts`:

```ts
import { isBlockedHostname, isBlockedIp } from '../../src/services/ssrf-guard.js';

describe('isBlockedIp', () => {
  it('blocks RFC1918 private ranges', () => {
    expect(isBlockedIp('10.0.0.1')).toBe(true);
    expect(isBlockedIp('172.16.0.1')).toBe(true);
    expect(isBlockedIp('172.31.255.255')).toBe(true);
    expect(isBlockedIp('192.168.1.1')).toBe(true);
  });
  it('blocks loopback', () => {
    expect(isBlockedIp('127.0.0.1')).toBe(true);
    expect(isBlockedIp('127.99.99.99')).toBe(true);
  });
  it('blocks link-local + AWS metadata', () => {
    expect(isBlockedIp('169.254.169.254')).toBe(true);
    expect(isBlockedIp('169.254.0.1')).toBe(true);
  });
  it('blocks 0.0.0.0/8', () => {
    expect(isBlockedIp('0.0.0.0')).toBe(true);
  });
  it('blocks IPv6 loopback + link-local', () => {
    expect(isBlockedIp('::1')).toBe(true);
    expect(isBlockedIp('fe80::1')).toBe(true);
  });
  it('blocks IPv6 ULA fc00::/7', () => {
    expect(isBlockedIp('fc00::1')).toBe(true);
    expect(isBlockedIp('fd00::1')).toBe(true);
  });
  it('does NOT block public IPv4', () => {
    expect(isBlockedIp('1.1.1.1')).toBe(false);
    expect(isBlockedIp('8.8.8.8')).toBe(false);
    expect(isBlockedIp('151.101.1.81')).toBe(false);
  });
  it('returns true for malformed input (fail closed)', () => {
    expect(isBlockedIp('not-an-ip')).toBe(true);
    expect(isBlockedIp('')).toBe(true);
  });
});

describe('isBlockedHostname', () => {
  it('blocks localhost', async () => {
    expect(await isBlockedHostname('localhost')).toBe(true);
  });
  it('does not block a public domain', async () => {
    // Note: this hits real DNS. If your test env has no DNS, this is a known
    // limitation — we accept the dependency for now.
    expect(await isBlockedHostname('example.com')).toBe(false);
  });
  it('blocks a domain that DNS-resolves to a private IP', async () => {
    // Mock-able resolver in V2; for now, just verify the contract on localhost.
    expect(await isBlockedHostname('localhost')).toBe(true);
  });
});
```

- [ ] **Step 4.2:** Run, verify FAIL
```bash
cd backend && npm test -- ssrf-guard
```

- [ ] **Step 4.3:** Implement `backend/src/services/ssrf-guard.ts`:

```ts
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

// IPv4 CIDR blocks to refuse.
const IPV4_BLOCKS: Array<[number, number]> = [
  [ipToInt('0.0.0.0'),    8],
  [ipToInt('10.0.0.0'),   8],
  [ipToInt('100.64.0.0'), 10],   // CGNAT
  [ipToInt('127.0.0.0'),  8],
  [ipToInt('169.254.0.0'),16],   // link-local + AWS metadata
  [ipToInt('172.16.0.0'), 12],
  [ipToInt('192.0.0.0'),  24],
  [ipToInt('192.168.0.0'),16],
  [ipToInt('198.18.0.0'), 15],
  [ipToInt('224.0.0.0'),  4],    // multicast
  [ipToInt('240.0.0.0'),  4]     // reserved
];

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, oct) => (acc * 256 + Number(oct)) >>> 0, 0);
}

function inCidr(ipInt: number, baseInt: number, prefix: number): boolean {
  if (prefix === 0) return true;
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

function isBlockedIpv4(ip: string): boolean {
  const n = ipToInt(ip);
  return IPV4_BLOCKS.some(([base, prefix]) => inCidr(n, base, prefix));
}

function isBlockedIpv6(ip: string): boolean {
  const lc = ip.toLowerCase();
  if (lc === '::1' || lc === '::') return true;
  if (lc.startsWith('fe80:') || lc.startsWith('fe9') || lc.startsWith('fea') || lc.startsWith('feb')) return true;
  // ULA fc00::/7 — first byte 0xfc or 0xfd
  if (lc.startsWith('fc') || lc.startsWith('fd')) return true;
  // IPv4-mapped IPv6: ::ffff:a.b.c.d — check the embedded v4
  if (lc.startsWith('::ffff:')) {
    const v4 = lc.slice('::ffff:'.length);
    if (isIP(v4) === 4) return isBlockedIpv4(v4);
  }
  return false;
}

export function isBlockedIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isBlockedIpv4(ip);
  if (kind === 6) return isBlockedIpv6(ip);
  return true; // unknown format → fail closed
}

const STATIC_BLOCKED_HOSTS = new Set(['localhost', 'localhost.localdomain', 'ip6-localhost']);

export async function isBlockedHostname(hostname: string): Promise<boolean> {
  const lc = hostname.toLowerCase();
  if (STATIC_BLOCKED_HOSTS.has(lc)) return true;
  if (lc.endsWith('.local') || lc.endsWith('.internal') || lc.endsWith('.localhost')) return true;
  // If hostname IS an IP, check directly
  if (isIP(lc)) return isBlockedIp(lc);
  // Resolve all A + AAAA records
  try {
    const addresses = await dnsLookup(lc, { all: true });
    for (const { address } of addresses) {
      if (isBlockedIp(address)) return true;
    }
    return false;
  } catch {
    // DNS fail — fail closed (refuse)
    return true;
  }
}

export async function assertUrlNotBlocked(url: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return { ok: false, reason: 'Invalid URL' }; }
  if (await isBlockedHostname(parsed.hostname)) {
    return { ok: false, reason: `Refusing to fetch ${parsed.hostname}: blocked address space.` };
  }
  return { ok: true };
}
```

- [ ] **Step 4.4:** Run, verify PASS
```bash
npm test -- ssrf-guard
```

- [ ] **Step 4.5:** Hook SSRF into article-extractor — modify `backend/src/services/article-extractor.ts`. Before the `fetchImpl(url, …)` call, add:

```ts
import { assertUrlNotBlocked } from './ssrf-guard.js';

// ... inside extractArticle, FIRST step before fetch:
const ssrf = await assertUrlNotBlocked(url);
if (!ssrf.ok) {
  return {
    ok: false,
    error: {
      code: 'URL_BLOCKED',
      message: ssrf.reason,
      retryable: false
    }
  };
}
```

Also: switch `redirect: 'follow'` to `redirect: 'manual'` and add a redirect loop that re-checks each redirect target against SSRF. (Detailed implementation in the full extractor rewrite below.)

- [ ] **Step 4.6:** Replace `backend/src/services/article-extractor.ts` ENTIRELY:

```ts
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import type { ApiError } from '../types/api.js';
import { assertUrlNotBlocked } from './ssrf-guard.js';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = ['text/html', 'application/xhtml+xml'];
const USER_AGENT =
  'Mozilla/5.0 (compatible; CredibilityCheckBot/0.1; +https://example.invalid/bot)';
const MAX_REDIRECTS = 5;

export interface ExtractedArticle {
  title: string;
  byline?: string;
  siteName?: string;
  text: string;
}

export type ExtractResult =
  | { ok: true; article: ExtractedArticle; finalUrl: string }
  | { ok: false; error: ApiError['error'] };

export interface ExtractOptions {
  fetchImpl?: (url: string | URL, init?: RequestInit) => Promise<Response>;
  timeoutMs?: number;
  skipSsrfCheck?: boolean; // tests can disable when using mocked fetch
}

async function fetchWithRedirects(
  initialUrl: string,
  opts: { fetchImpl: ExtractOptions['fetchImpl']; timeoutMs: number; skipSsrfCheck: boolean }
): Promise<{ ok: true; res: Response; finalUrl: string } | { ok: false; error: ApiError['error'] }> {
  let url = initialUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!opts.skipSsrfCheck) {
      const ssrf = await assertUrlNotBlocked(url);
      if (!ssrf.ok) {
        return { ok: false, error: { code: 'URL_BLOCKED', message: ssrf.reason, retryable: false } };
      }
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    let res: Response;
    try {
      res = await opts.fetchImpl!(url, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' }
      });
    } catch {
      clearTimeout(timer);
      return { ok: false, error: { code: 'EXTRACTION_FAILED', message: 'Failed to fetch the article.', retryable: true } };
    }
    clearTimeout(timer);

    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location');
      if (!next) {
        return { ok: false, error: { code: 'EXTRACTION_FAILED', message: 'Redirect missing Location header.', retryable: false } };
      }
      url = new URL(next, url).toString();
      continue;
    }
    return { ok: true, res, finalUrl: url };
  }
  return { ok: false, error: { code: 'EXTRACTION_FAILED', message: 'Too many redirects.', retryable: false } };
}

export async function extractArticle(
  url: string,
  opts: ExtractOptions = {}
): Promise<ExtractResult> {
  const fetchImpl = opts.fetchImpl ?? (fetch as ExtractOptions['fetchImpl']);
  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;
  const skipSsrfCheck = opts.skipSsrfCheck ?? false;

  const fetched = await fetchWithRedirects(url, { fetchImpl, timeoutMs, skipSsrfCheck });
  if (!fetched.ok) return fetched;
  const { res, finalUrl } = fetched;

  if (!res.ok) {
    return {
      ok: false,
      error: { code: 'EXTRACTION_FAILED', message: `Site returned HTTP ${res.status}.`, retryable: false }
    };
  }

  const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
    return {
      ok: false,
      error: { code: 'UNSUPPORTED_CONTENT_TYPE', message: `Only HTML pages are supported (got ${contentType || 'unknown'}).`, retryable: false }
    };
  }

  let html: string;
  try { html = await readBounded(res, MAX_BODY_BYTES); }
  catch {
    return { ok: false, error: { code: 'EXTRACTION_FAILED', message: 'Article body exceeded size limit.', retryable: false } };
  }

  let parsed: ReturnType<Readability['parse']>;
  try {
    const dom = new JSDOM(html, { url: finalUrl });
    parsed = new Readability(dom.window.document).parse();
  } catch {
    return { ok: false, error: { code: 'EXTRACTION_FAILED', message: 'Could not parse the page.', retryable: false } };
  }

  if (!parsed || !parsed.textContent || parsed.textContent.length < 100) {
    return { ok: false, error: { code: 'EXTRACTION_FAILED', message: 'Could not find article content on the page.', retryable: false } };
  }

  return {
    ok: true,
    finalUrl,
    article: {
      title: parsed.title ?? '(untitled)',
      byline: parsed.byline ?? undefined,
      siteName: parsed.siteName ?? undefined,
      text: parsed.textContent.trim()
    }
  };
}

async function readBounded(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) {
    const t = await res.text();
    if (t.length > maxBytes) throw new Error('over size');
    return t;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { try { await reader.cancel(); } catch {} throw new Error('over size'); }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { buf.set(c, offset); offset += c.byteLength; }
  return new TextDecoder('utf-8').decode(buf);
}
```

- [ ] **Step 4.7:** Update existing article-extractor tests to use `skipSsrfCheck: true` (they mock fetch; SSRF lookup would DNS-fail). Apply this single-line addition to the `extractArticle(...)` call in EACH test:

```ts
const result = await extractArticle('https://example.com/a', {
  fetchImpl: fetchMock,
  skipSsrfCheck: true   // <-- ADD THIS
});
```

- [ ] **Step 4.8:** Add a new test verifying real SSRF block — append to `article-extractor.test.ts`:

```ts
it('returns URL_BLOCKED for localhost without skipSsrfCheck', async () => {
  // Don't pass skipSsrfCheck — exercise the real guard.
  const result = await extractArticle('http://localhost/admin');
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.code).toBe('URL_BLOCKED');
});

it('returns URL_BLOCKED for 169.254.169.254 (AWS metadata)', async () => {
  const result = await extractArticle('http://169.254.169.254/latest/meta-data');
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.code).toBe('URL_BLOCKED');
});
```

- [ ] **Step 4.9:** Run all tests
```bash
cd backend && npm test
```
Expected: all green including new SSRF cases.

- [ ] **Step 4.10:** Commit
```bash
cd ..
git add backend/src/services/ssrf-guard.ts backend/tests/services/ssrf-guard.test.ts \
        backend/src/services/article-extractor.ts backend/tests/services/article-extractor.test.ts
git commit -m "feat(backend): add SSRF guard with DNS resolution + private-IP block + manual redirect handling"
```

---

## Task 5: Rate limiter

**Files:**
- Create: `backend/src/services/rate-limiter.ts`
- Create: `backend/tests/services/rate-limiter.test.ts`

Per (deviceId, ip) composite. Two counters per device + per ip: `single` (20/day) and `deep` (3/day). Day boundary UTC midnight.

- [ ] **Step 5.1:** Write failing test — `backend/tests/services/rate-limiter.test.ts`:

```ts
import { pool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';
import { createRateLimiter } from '../../src/services/rate-limiter.js';

beforeAll(async () => { await runMigrations(); });
beforeEach(async () => { await pool.query('TRUNCATE TABLE rate_limit_counters'); });
afterAll(async () => { await pool.end(); });

describe('RateLimiter', () => {
  it('allows up to 20 single checks per device per day', async () => {
    const rl = createRateLimiter();
    for (let i = 0; i < 20; i++) {
      const r = await rl.consume('dev-1', '1.2.3.4', 'single');
      expect(r.allowed).toBe(true);
    }
    const overflow = await rl.consume('dev-1', '1.2.3.4', 'single');
    expect(overflow.allowed).toBe(false);
    expect(overflow.retryAfter).toBeGreaterThan(0);
  });

  it('allows up to 3 deep analyses per device per day', async () => {
    const rl = createRateLimiter();
    for (let i = 0; i < 3; i++) {
      const r = await rl.consume('dev-1', '1.2.3.4', 'deep');
      expect(r.allowed).toBe(true);
    }
    const overflow = await rl.consume('dev-1', '1.2.3.4', 'deep');
    expect(overflow.allowed).toBe(false);
  });

  it('separate counters for single vs deep', async () => {
    const rl = createRateLimiter();
    for (let i = 0; i < 20; i++) await rl.consume('dev-2', '1.2.3.4', 'single');
    const deepOk = await rl.consume('dev-2', '1.2.3.4', 'deep');
    expect(deepOk.allowed).toBe(true);
  });

  it('IP composite blocks reinstall bypass', async () => {
    const rl = createRateLimiter();
    // Same IP, many devices, but IP also has a cap
    for (let i = 0; i < 20; i++) {
      const r = await rl.consume(`dev-${i}`, '1.2.3.4', 'single');
      expect(r.allowed).toBe(true);
    }
    // 21st device on same IP — IP counter trips
    const r = await rl.consume('dev-21', '1.2.3.4', 'single');
    expect(r.allowed).toBe(false);
  });
});
```

- [ ] **Step 5.2:** Run, verify FAIL
- [ ] **Step 5.3:** Implement `backend/src/services/rate-limiter.ts`:

```ts
import { pool } from '../db/pool.js';

export type LimitKind = 'single' | 'deep';

export interface ConsumeResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number; // seconds until midnight UTC
}

const CAPS: Record<LimitKind, { perDevice: number; perIp: number }> = {
  single: { perDevice: 20, perIp: 20 },
  deep:   { perDevice: 3,  perIp: 6 }
};

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function secondsUntilMidnightUtc(): number {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.ceil((next.getTime() - now.getTime()) / 1000);
}

async function incrementAndCheck(bucket: string, kind: LimitKind, cap: number): Promise<{ count: number; over: boolean }> {
  const day = todayUtc();
  // Upsert + return new count atomically.
  const r = await pool.query<{ count: number }>(
    `INSERT INTO rate_limit_counters (bucket, kind, day_utc, count)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (bucket, kind, day_utc)
     DO UPDATE SET count = rate_limit_counters.count + 1
     RETURNING count`,
    [bucket, kind, day]
  );
  const count = r.rows[0]?.count ?? 1;
  return { count, over: count > cap };
}

export interface RateLimiter {
  consume(deviceId: string, ip: string, kind: LimitKind): Promise<ConsumeResult>;
}

export function createRateLimiter(): RateLimiter {
  return {
    async consume(deviceId, ip, kind) {
      const { perDevice, perIp } = CAPS[kind];
      const deviceResult = await incrementAndCheck(`device:${deviceId}`, kind, perDevice);
      const ipResult     = await incrementAndCheck(`ip:${ip}`,           kind, perIp);
      const allowed = !deviceResult.over && !ipResult.over;
      const remaining = Math.max(0, Math.min(
        perDevice - deviceResult.count,
        perIp - ipResult.count
      ));
      return {
        allowed,
        remaining,
        retryAfter: allowed ? 0 : secondsUntilMidnightUtc()
      };
    }
  };
}
```

- [ ] **Step 5.4:** Run, verify PASS
- [ ] **Step 5.5:** Commit
```bash
git add backend/src/services/rate-limiter.ts backend/tests/services/rate-limiter.test.ts
git commit -m "feat(backend): add rate-limiter (device+IP composite, 20 single + 3 deep / day UTC)"
```

---

## Task 6: Cost tracker + circuit-breaker

**Files:**
- Create: `backend/src/services/cost-tracker.ts`
- Create: `backend/tests/services/cost-tracker.test.ts`

Logs each Anthropic call's tokens + estimated USD. Sums monthly total. Trips breaker over `MONTHLY_BUDGET_USD`.

- [ ] **Step 6.1:** Write failing test — `backend/tests/services/cost-tracker.test.ts`:

```ts
import { pool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';
import { createCostTracker, estimateCost } from '../../src/services/cost-tracker.js';

beforeAll(async () => { await runMigrations(); });
beforeEach(async () => { await pool.query('TRUNCATE TABLE cost_events'); });
afterAll(async () => { await pool.end(); });

describe('estimateCost', () => {
  it('computes USD for Haiku rates', () => {
    // Haiku 4.5: $0.80/M input, $4/M output (placeholder rates)
    const c = estimateCost('claude-haiku-4-5', 1_000_000, 1_000_000);
    expect(c).toBeCloseTo(4.80, 2);
  });
});

describe('CostTracker', () => {
  it('allows request when under budget', async () => {
    const tr = createCostTracker({ monthlyBudgetUsd: 10 });
    const r = await tr.check();
    expect(r.exceeded).toBe(false);
  });

  it('records a cost event', async () => {
    const tr = createCostTracker({ monthlyBudgetUsd: 10 });
    await tr.record({ jobId: 'j1', deviceId: 'd1', ip: '1.2.3.4', model: 'claude-haiku-4-5', inputTokens: 1000, outputTokens: 500 });
    const r = await pool.query('SELECT count(*)::int FROM cost_events');
    expect(r.rows[0].count).toBe(1);
  });

  it('trips when monthly spend exceeds cap', async () => {
    const tr = createCostTracker({ monthlyBudgetUsd: 0.005 }); // 0.5 cents
    await tr.record({ jobId: 'j1', deviceId: 'd1', ip: '1.2.3.4', model: 'claude-haiku-4-5', inputTokens: 5_000, outputTokens: 1_000 });
    const r = await tr.check();
    expect(r.exceeded).toBe(true);
    expect(r.monthlySpendUsd).toBeGreaterThan(0);
  });

  it('does not trip when budget cap disabled (0)', async () => {
    const tr = createCostTracker({ monthlyBudgetUsd: 0 });
    await tr.record({ jobId: 'j1', deviceId: 'd1', ip: '1.2.3.4', model: 'claude-haiku-4-5', inputTokens: 10_000_000, outputTokens: 1_000_000 });
    const r = await tr.check();
    expect(r.exceeded).toBe(false);
  });
});
```

- [ ] **Step 6.2:** Run, verify FAIL
- [ ] **Step 6.3:** Implement `backend/src/services/cost-tracker.ts`:

```ts
import { pool } from '../db/pool.js';

// $/M tokens — adjust when Anthropic pricing changes.
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5':  { input: 0.80, output: 4.00 },
  'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
  'claude-opus-4-7':   { input: 15.00, output: 75.00 }
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICING[model] ?? PRICING['claude-haiku-4-5'];
  return (inputTokens / 1_000_000) * price.input
       + (outputTokens / 1_000_000) * price.output;
}

export interface RecordInput {
  jobId?: string;
  deviceId?: string;
  ip?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface BudgetCheck {
  exceeded: boolean;
  monthlySpendUsd: number;
  budgetUsd: number;
}

export interface CostTrackerOptions {
  monthlyBudgetUsd: number;  // 0 = disabled
}

export interface CostTracker {
  record(input: RecordInput): Promise<void>;
  check(): Promise<BudgetCheck>;
}

export function createCostTracker(opts: CostTrackerOptions): CostTracker {
  return {
    async record({ jobId, deviceId, ip, model, inputTokens, outputTokens }) {
      const cost = estimateCost(model, inputTokens, outputTokens);
      await pool.query(
        `INSERT INTO cost_events (job_id, device_id, ip, model, input_tokens, output_tokens, cost_usd)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [jobId ?? null, deviceId ?? null, ip ?? null, model, inputTokens, outputTokens, cost]
      );
    },

    async check() {
      if (opts.monthlyBudgetUsd <= 0) {
        return { exceeded: false, monthlySpendUsd: 0, budgetUsd: 0 };
      }
      const r = await pool.query<{ sum: string }>(
        `SELECT COALESCE(SUM(cost_usd), 0)::text AS sum FROM cost_events
         WHERE created_at >= date_trunc('month', NOW())`
      );
      const monthlySpendUsd = Number(r.rows[0]?.sum ?? '0');
      return {
        exceeded: monthlySpendUsd >= opts.monthlyBudgetUsd,
        monthlySpendUsd,
        budgetUsd: opts.monthlyBudgetUsd
      };
    }
  };
}
```

- [ ] **Step 6.4:** Run, verify PASS
- [ ] **Step 6.5:** Commit
```bash
git add backend/src/services/cost-tracker.ts backend/tests/services/cost-tracker.test.ts
git commit -m "feat(backend): add cost-tracker + monthly budget circuit-breaker"
```

---

## Task 7: Cache service

**Files:**
- Create: `backend/src/services/cache.ts`
- Create: `backend/tests/services/cache.test.ts`

Keyed by `(canonicalUrl, sha256(text first 4KB))`. TTL 24h default, 1h for news patterns.

- [ ] **Step 7.1:** Write failing test — `backend/tests/services/cache.test.ts`:

```ts
import { pool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';
import { createCache, articleTextHash, ttlForUrl } from '../../src/services/cache.js';
import type { JobResult } from '../../src/types/api.js';

beforeAll(async () => { await runMigrations(); });
beforeEach(async () => { await pool.query('TRUNCATE TABLE cache'); });
afterAll(async () => { await pool.end(); });

describe('articleTextHash', () => {
  it('returns a sha256-formatted hex string', () => {
    const h = articleTextHash('some article text');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
  it('is content-stable (hash based on first 4KB)', () => {
    const base = 'x'.repeat(4000);
    expect(articleTextHash(base + 'A')).toBe(articleTextHash(base + 'B'));
  });
});

describe('ttlForUrl', () => {
  it('returns 1h for /news/ URLs', () => {
    expect(ttlForUrl('https://x.com/news/foo')).toBe(3600);
  });
  it('returns 1h for /YYYY/ URLs', () => {
    expect(ttlForUrl('https://x.com/2026/05/article')).toBe(3600);
  });
  it('returns 24h default', () => {
    expect(ttlForUrl('https://x.com/about')).toBe(86_400);
  });
});

describe('Cache', () => {
  const sample: JobResult = { jobId: 'j1', status: 'complete', overall: 80, bucket: 'highly-credible' };

  it('returns undefined on miss', async () => {
    const c = createCache();
    expect(await c.get('https://x.com/a', 'hash')).toBeUndefined();
  });

  it('returns set value on hit', async () => {
    const c = createCache();
    await c.set('https://x.com/a', 'hash', sample, 3600);
    const r = await c.get('https://x.com/a', 'hash');
    expect(r?.overall).toBe(80);
  });

  it('returns undefined after expiry', async () => {
    const c = createCache();
    await c.set('https://x.com/a', 'hash', sample, -10); // already expired
    expect(await c.get('https://x.com/a', 'hash')).toBeUndefined();
  });

  it('different content hash → cache miss', async () => {
    const c = createCache();
    await c.set('https://x.com/a', 'hashA', sample, 3600);
    expect(await c.get('https://x.com/a', 'hashB')).toBeUndefined();
  });
});
```

- [ ] **Step 7.2:** Run, verify FAIL
- [ ] **Step 7.3:** Implement `backend/src/services/cache.ts`:

```ts
import { createHash } from 'node:crypto';
import { pool } from '../db/pool.js';
import type { JobResult } from '../types/api.js';

export function articleTextHash(text: string): string {
  return createHash('sha256').update(text.slice(0, 4096)).digest('hex');
}

const NEWS_PATTERNS = [/\/news\//i, /\/202[0-9]\//, /\/articles?\//i];

export function ttlForUrl(url: string): number {
  if (NEWS_PATTERNS.some(re => re.test(url))) return 3600;
  return 86_400;
}

function key(url: string, hash: string): string {
  return `${url}|${hash}`;
}

export interface Cache {
  get(url: string, hash: string): Promise<JobResult | undefined>;
  set(url: string, hash: string, value: JobResult, ttlSeconds: number): Promise<void>;
}

export function createCache(): Cache {
  return {
    async get(url, hash) {
      const r = await pool.query<{ result: JobResult }>(
        `SELECT result FROM cache WHERE cache_key = $1 AND expires_at > NOW()`,
        [key(url, hash)]
      );
      return r.rows[0]?.result;
    },
    async set(url, hash, value, ttlSeconds) {
      const expires = new Date(Date.now() + ttlSeconds * 1000);
      await pool.query(
        `INSERT INTO cache (cache_key, result, expires_at) VALUES ($1, $2, $3)
         ON CONFLICT (cache_key) DO UPDATE SET result = $2, expires_at = $3`,
        [key(url, hash), value, expires]
      );
    }
  };
}
```

- [ ] **Step 7.4:** Run, verify PASS
- [ ] **Step 7.5:** Commit
```bash
git add backend/src/services/cache.ts backend/tests/services/cache.test.ts
git commit -m "feat(backend): add cache (URL+content-hash keyed, 24h TTL default, 1h for news)"
```

---

## Task 8: Feedback widget endpoint

**Files:**
- Create: `backend/src/routes/feedback.ts`
- Create: `backend/tests/routes/feedback.test.ts`
- Modify: `backend/src/server.ts`

POST /api/feedback. Stores 👍/👎 + optional comment.

- [ ] **Step 8.1:** Create `backend/src/routes/feedback.ts`:

```ts
import { Hono } from 'hono';
import { pool } from '../db/pool.js';
import type { ApiError } from '../types/api.js';

export const feedbackRoutes = new Hono();

feedbackRoutes.post('/feedback', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.jobId !== 'string' || (body.vote !== 'up' && body.vote !== 'down')) {
    const err: ApiError = {
      error: { code: 'URL_INVALID', message: 'Request must include {jobId, vote, deviceId}.', retryable: false }
    };
    return c.json(err, 400);
  }
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId : 'unknown';
  const comment = typeof body.comment === 'string' && body.comment.length <= 2_000 ? body.comment : null;
  await pool.query(
    `INSERT INTO feedback_events (job_id, device_id, vote, comment) VALUES ($1, $2, $3, $4)`,
    [body.jobId, deviceId, body.vote, comment]
  );
  return c.json({ ok: true }, 201);
});
```

- [ ] **Step 8.2:** Mount in `backend/src/server.ts`:

```ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { checkRoutes } from './routes/check.js';
import { feedbackRoutes } from './routes/feedback.js';

export const app = new Hono();
app.use('*', cors());
app.get('/health', (c) => c.json({ ok: true }));
app.route('/api', checkRoutes);
app.route('/api', feedbackRoutes);
```

- [ ] **Step 8.3:** Create `backend/tests/routes/feedback.test.ts`:

```ts
import { app } from '../../src/server.js';
import { pool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';

beforeAll(async () => { await runMigrations(); });
beforeEach(async () => { await pool.query('TRUNCATE TABLE feedback_events'); });
afterAll(async () => { await pool.end(); });

describe('POST /api/feedback', () => {
  it('records up vote', async () => {
    const res = await app.request('/api/feedback', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId: 'j1', deviceId: 'd1', vote: 'up' })
    });
    expect(res.status).toBe(201);
    const r = await pool.query<{ vote: string }>('SELECT vote FROM feedback_events');
    expect(r.rows[0].vote).toBe('up');
  });

  it('records down vote with comment', async () => {
    const res = await app.request('/api/feedback', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId: 'j1', deviceId: 'd1', vote: 'down', comment: 'too lenient on bias' })
    });
    expect(res.status).toBe(201);
  });

  it('400s on missing vote', async () => {
    const res = await app.request('/api/feedback', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId: 'j1', deviceId: 'd1' })
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 8.4:** Run + commit
```bash
cd backend && npm test -- feedback
cd ..
git add backend/src/routes/feedback.ts backend/src/server.ts backend/tests/routes/feedback.test.ts
git commit -m "feat(backend): add POST /api/feedback (👍/👎 + comment) for proprietary moat dataset"
```

---

## Task 9: Wire rate-limit + cost-cap + cache into routes

**File:** Modify `backend/src/routes/check.ts`

Adjustments needed:
1. Before pipeline starts, call `rateLimiter.consume(deviceId, ip, 'single')`. If denied, return 429.
2. Before LLM analysis, call `costTracker.check()`. If exceeded, return BUDGET_EXCEEDED.
3. After extraction, compute `articleTextHash` + `canonicalUrl`. Check cache. If hit, return cached result, skip LLM.
4. On complete, write to cache with appropriate TTL.
5. After every Anthropic call, `costTracker.record(...)` with token counts from response.
6. Same logic on deep route: rate-limit kind='deep', cost-check before debate.

Full route file is too long to inline here. Key additions in pseudocode:

```ts
const rateLimiter = createRateLimiter();
const cache = createCache();
const costTracker = createCostTracker({ monthlyBudgetUsd: env.monthlyBudgetUsd });

// In POST /api/check handler, after URL validation:
const ip = c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
const rl = await rateLimiter.consume(body.deviceId, ip, 'single');
if (!rl.allowed) {
  return c.json({ error: { code: 'RATE_LIMITED', ..., retryAfter: rl.retryAfter } }, 429);
}
const budget = await costTracker.check();
if (budget.exceeded) {
  return c.json({ error: { code: 'BUDGET_EXCEEDED', ..., retryable: false } }, 503);
}

// Inside runPipeline, after extraction:
const hash = articleTextHash(extraction.article.text);
const canon = canonicalDomain(url) ?? url;
const cached = await cache.get(canon, hash);
if (cached) {
  await store.update(jobId, { ...cached, jobId });
  return;
}
// ... existing LLM analysis ...
// After analysis succeeds:
await cache.set(canon, hash, finalJobResult, ttlForUrl(url));

// In runAnalysis wrapper, capture usage:
const response = await client.messages.create(...);
await costTracker.record({ jobId, ..., model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens });
```

Implementation detail: real Anthropic SDK responses include `usage`. The mock in `llm-analyzer.ts` doesn't expose it cleanly to the wrapper. Best approach — refactor `analyzeContent` and `runDeepAnalysis` to return `{ ok, ..., usage }` from each call so route can record cost. This is a non-trivial diff; implement carefully.

Because of the size of this rewrite, mark this task as the highest-risk piece of M6 and budget time accordingly. Tests for full routes/check.ts cover all new branches: rate limit, cost cap, cache hit, cache miss, cost recording.

- [ ] **Step 9.1:** Refactor `analyzeContent` to return `usage` ({ inputTokens, outputTokens }) alongside the parsed result.
- [ ] **Step 9.2:** Refactor `runDeepAnalysis` to return a `usage` total across 3 calls.
- [ ] **Step 9.3:** Update tests to reflect new shapes.
- [ ] **Step 9.4:** Wire rate-limit + cost-check + cache into both POST routes.
- [ ] **Step 9.5:** Add route tests for: rate-limit denial, budget-exceeded denial, cache hit short-circuit.
- [ ] **Step 9.6:** Commit
```bash
git commit -m "feat(backend): wire rate-limit, cost-circuit-breaker, and cache into /api/check + /api/check/:jobId/deep"
```

---

## Task 10: Mobile feedback widget UI

**Files:**
- Modify: `mobile/src/screens/CheckScreen.tsx`
- Modify: `mobile/src/api/client.ts`

Add `submitFeedback(jobId, vote, comment?)` client function. Add a small thumbs-up/down row on complete results with an optional comment box and "Submit" button.

- [ ] **Step 10.1:** Add to `mobile/src/api/client.ts`:

```ts
export async function submitFeedback(
  jobId: string,
  vote: 'up' | 'down',
  deviceId: string,
  comment?: string
): Promise<ApiResult<{ ok: true }>> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId, vote, deviceId, comment })
    });
  } catch (e) {
    return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Network error', retryable: true } };
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null) as ApiError | null;
    if (body && 'error' in body) return { ok: false, error: body.error };
    return { ok: false, error: { code: 'INTERNAL_ERROR', message: `HTTP ${res.status}`, retryable: false } };
  }
  return { ok: true, value: { ok: true } };
}
```

- [ ] **Step 10.2:** Add a `FeedbackBlock` component in CheckScreen.tsx (state-local), placed below the disclaimer / above the linkRow.

Render:
- Title: "Was this rating helpful?"
- Two buttons: 👍 and 👎 (greyed after submission)
- If down voted, expand a TextInput for optional comment + Send button
- After submission, show "Thanks — your feedback helps improve the system."

(Full component sketch omitted; implementation handler is straightforward via existing useState + submitFeedback.)

- [ ] **Step 10.3:** Commit
```bash
git add mobile/src/api/client.ts mobile/src/screens/CheckScreen.tsx
git commit -m "feat(mobile): add 👍/👎 feedback widget (proprietary moat dataset starts here)"
```

---

## Task 11: Web verify + tag + retro

- [ ] **Step 11.1:** Start backend + Expo web (DB must be running).
- [ ] **Step 11.2:** Test:
  - Submit URL twice — second time fires `cache hit` (check backend logs).
  - Submit URL 21 times — 21st returns RATE_LIMITED with retryAfter.
  - Try `http://localhost/admin` — returns URL_BLOCKED.
  - Try a paywall URL — extraction fails, publisher still shows.
  - Tap 👎 on a result — comment box opens. Type something, send. Check `feedback_events` table for the row.
  - Set MONTHLY_BUDGET_USD=0.001 in .env, restart, submit — get BUDGET_EXCEEDED.
- [ ] **Step 11.3:** Tag
```bash
git tag -a m6-production-hardening -m "M6: SSRF + rate-limit + cost cap + cache + Postgres + feedback widget"
```
- [ ] **Step 11.4:** Write retro at `docs/superpowers/notes/m6-retro.md`.
- [ ] **Step 11.5:** Commit retro.

---

## What this plan deliberately leaves to M7

| Concern | Lands in |
|---|---|
| WHOIS domain-age signal | M7 or post-V1 |
| Outbound-link count signal | M7 or post-V1 |
| Maestro mobile E2E suite | M7 |
| LLM eval suite (~30 fixture URLs) | M7 |
| Apple Developer Program enrollment + EAS Build | M7 |
| Google Play Console enrollment | M7 |
| App icon, screenshots, store listings | M7 |
| Privacy policy + TOS + Methodology final wording | M7 |
| Lawyer review (gate) | M7 |
| Deployment to Railway/Render | M7 |
