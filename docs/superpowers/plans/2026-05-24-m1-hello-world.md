# M1 — Hello World Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the smallest possible end-to-end version of Credibility Check. Phone runs the mobile app, pastes a URL, the backend echoes it back, phone displays the echo. Proves the full stack (Expo → HTTP → Node backend) works before any LLM, datasets, or scoring is added.

**Architecture:**
Two folders in the repo: `backend/` (Node.js + TypeScript + Hono web framework) and `mobile/` (Expo + React Native + TypeScript). Backend runs locally on your Mac (port 4000). Mobile app runs on your phone via Expo Go and talks to your Mac over your Wi-Fi network. Job store is a plain in-memory `Map` for M1 (Postgres comes in M2 or M3).

**Tech Stack:**
- Backend: Node.js 20+, TypeScript, Hono (web framework), Jest (tests), pino (structured logs)
- Mobile: Expo SDK 51+, React Native, TypeScript, `fetch` (no third-party HTTP client yet)
- Dev tools: nvm (Node version manager), Expo Go app on phone

---

## Prerequisites (one-time setup before Task 1)

These are not full tasks but verify your machine is ready. Run each check; if it fails, follow the install link.

- [ ] **P0a:** Check Node.js 20+ is installed
  - Run: `node --version`
  - Expected: `v20.x.x` or higher
  - If not installed: install nvm from https://github.com/nvm-sh/nvm, then `nvm install 20 && nvm use 20`

- [ ] **P0b:** Check npm works
  - Run: `npm --version`
  - Expected: `10.x.x` or higher (ships with Node 20)

- [ ] **P0c:** Install Expo Go on your phone
  - iPhone: App Store → search "Expo Go" → install
  - Android: Play Store → search "Expo Go" → install
  - Sign up for a free Expo account in the app (needed for QR-code pairing)

- [ ] **P0d:** Find your Mac's local IP address (you'll need this in Task 10)
  - Run: `ipconfig getifaddr en0` (Wi-Fi) or `ipconfig getifaddr en1` (Ethernet)
  - Expected: something like `192.168.1.42`
  - Save this. We'll call it `<MAC_IP>` for the rest of the plan.

- [ ] **P0e:** Make sure your Mac and phone are on the same Wi-Fi network
  - Expo Go pairing requires both devices on the same LAN.

---

## Task 1: Repo hygiene + folder structure

**Files:**
- Modify: `.gitignore`
- Create: `backend/` (empty folder)
- Create: `mobile/` (empty folder)

- [ ] **Step 1.1: Create the two top-level folders**

Run:
```bash
mkdir -p backend mobile
```

- [ ] **Step 1.2: Expand the root `.gitignore`**

Replace the current `.gitignore` (which only has `.superpowers/`) with:

```gitignore
# Brainstorm session files
.superpowers/

# Node
node_modules/
dist/
build/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Env
.env
.env.local
.env.*.local

# Expo
.expo/
.expo-shared/
web-build/

# IDE
.vscode/
.idea/
*.swp
.DS_Store

# Coverage
coverage/

# TypeScript
*.tsbuildinfo
```

- [ ] **Step 1.3: Commit**

```bash
git add .gitignore backend/ mobile/
git commit -m "chore: add backend + mobile folders and expand .gitignore"
```

---

## Task 2: Backend scaffold + first passing test

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/jest.config.js`
- Create: `backend/.env.example`
- Create: `backend/src/index.ts`
- Create: `backend/src/server.ts`
- Create: `backend/tests/health.test.ts`

The split between `index.ts` (boots the server) and `server.ts` (defines the routes) is intentional: tests import `server.ts` without starting an actual HTTP listener.

- [ ] **Step 2.1: Initialize the backend package**

Run:
```bash
cd backend
npm init -y
```

Then open `backend/package.json` and replace its contents with:

```json
{
  "name": "credibility-check-backend",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "node --experimental-specifier-resolution=node dist/index.js",
    "build": "tsc",
    "test": "jest",
    "test:watch": "jest --watch"
  },
  "dependencies": {
    "hono": "^4.5.0",
    "@hono/node-server": "^1.12.0",
    "pino": "^9.0.0",
    "pino-pretty": "^11.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/jest": "^29.5.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.0",
    "tsx": "^4.16.0",
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2.2: Install dependencies**

Run (still in `backend/`):
```bash
npm install
```

Expected: no errors, `node_modules/` created.

- [ ] **Step 2.3: Create `backend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 2.4: Create `backend/jest.config.js`**

```js
/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true }]
  },
  testMatch: ['<rootDir>/tests/**/*.test.ts']
};
```

- [ ] **Step 2.5: Create `backend/.env.example`**

```
# Backend port
PORT=4000

# Log level: debug, info, warn, error
LOG_LEVEL=info
```

- [ ] **Step 2.6: Write the failing test FIRST**

Create `backend/tests/health.test.ts`:

```ts
import { app } from '../src/server.js';

describe('GET /health', () => {
  it('returns 200 with {ok: true}', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2.7: Run the test — verify it fails**

Run (in `backend/`):
```bash
npm test
```

Expected: FAIL with `Cannot find module '../src/server.js'` or similar — `server.ts` doesn't exist yet. This is the correct first state for TDD.

- [ ] **Step 2.8: Create `backend/src/server.ts` (minimal Hono app)**

```ts
import { Hono } from 'hono';

export const app = new Hono();

app.get('/health', (c) => {
  return c.json({ ok: true });
});
```

- [ ] **Step 2.9: Create `backend/src/index.ts` (server entry point)**

```ts
import { serve } from '@hono/node-server';
import pino from 'pino';
import { app } from './server.js';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty' }
    : undefined
});

const port = Number(process.env.PORT ?? 4000);

serve({ fetch: app.fetch, port }, (info) => {
  logger.info(`Backend listening on http://localhost:${info.port}`);
});
```

- [ ] **Step 2.10: Run the test — verify it passes**

Run (in `backend/`):
```bash
npm test
```

Expected: PASS — 1 passing test.

- [ ] **Step 2.11: Run the dev server, verify by hand**

In one terminal (in `backend/`):
```bash
npm run dev
```

Expected log line: `Backend listening on http://localhost:4000`

In another terminal:
```bash
curl http://localhost:4000/health
```

Expected output: `{"ok":true}`

Stop the dev server with Ctrl-C when done.

- [ ] **Step 2.12: Commit**

```bash
git add backend/
git commit -m "feat(backend): scaffold Hono server with /health endpoint and Jest"
```

---

## Task 3: Shared API types

**Files:**
- Create: `backend/src/types/api.ts`

The spec section 5 defines the API contract. Even in M1 with stubs, we lock down the *shape* so M2+ slots in cleanly. The mobile app will mirror these types in Task 8 (we hand-copy for V1; OpenAPI codegen comes in V2).

- [ ] **Step 3.1: Create `backend/src/types/api.ts`**

```ts
// Shared API types — kept in sync (by hand) with mobile/src/types/api.ts.
// When you change a type here, update the mobile copy in the same commit.

export type ErrorCode =
  | 'URL_INVALID'
  | 'URL_BLOCKED'
  | 'EXTRACTION_FAILED'
  | 'LLM_UNAVAILABLE'
  | 'LLM_MALFORMED'
  | 'RATE_LIMITED'
  | 'BUDGET_EXCEEDED'
  | 'UNSUPPORTED_CONTENT_TYPE'
  | 'INTERNAL_ERROR';

export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
    retryable: boolean;
    retryAfter?: number; // seconds
  };
}

export interface CheckRequest {
  url: string;
  deviceId: string;
}

export interface CheckResponseAccepted {
  jobId: string;
  status: 'pending';
}

export type JobStatus = 'pending' | 'partial' | 'complete';

// In M1, the only field beyond the standard envelope is `echo`.
// Later milestones add sourceRep, contentQuality, bias, confidence, etc.
export interface JobResult {
  jobId: string;
  status: JobStatus;
  echo?: string; // M1 only — removed in M2
}
```

- [ ] **Step 3.2: Commit**

```bash
git add backend/src/types/api.ts
git commit -m "feat(backend): add shared API types for M1 contract"
```

---

## Task 4: URL validation (pure function, TDD)

**Files:**
- Create: `backend/src/services/url-validator.ts`
- Create: `backend/tests/services/url-validator.test.ts`

Validation is a pure function — easiest possible TDD. Practice the pattern here before touching HTTP.

- [ ] **Step 4.1: Write the failing test**

Create `backend/tests/services/url-validator.test.ts`:

```ts
import { isValidUrl } from '../../src/services/url-validator.js';

describe('isValidUrl', () => {
  it('accepts a normal https URL', () => {
    expect(isValidUrl('https://example.com/article/1')).toBe(true);
  });

  it('accepts a normal http URL', () => {
    expect(isValidUrl('http://example.com/article/1')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidUrl('')).toBe(false);
  });

  it('rejects non-string input', () => {
    // @ts-expect-error testing runtime behaviour with wrong type
    expect(isValidUrl(null)).toBe(false);
  });

  it('rejects javascript: URLs', () => {
    expect(isValidUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects file: URLs', () => {
    expect(isValidUrl('file:///etc/passwd')).toBe(false);
  });

  it('rejects URLs without a scheme', () => {
    expect(isValidUrl('example.com/article')).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(isValidUrl('http://')).toBe(false);
  });
});
```

- [ ] **Step 4.2: Run the test — verify it fails**

Run (in `backend/`):
```bash
npm test -- url-validator
```

Expected: FAIL — `Cannot find module`.

- [ ] **Step 4.3: Implement `backend/src/services/url-validator.ts`**

```ts
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

export function isValidUrl(input: unknown): input is string {
  if (typeof input !== 'string' || input.length === 0) {
    return false;
  }
  try {
    const parsed = new URL(input);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      return false;
    }
    if (!parsed.hostname || parsed.hostname.length === 0) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4.4: Run the test — verify it passes**

Run:
```bash
npm test -- url-validator
```

Expected: PASS — 8 passing assertions.

- [ ] **Step 4.5: Commit**

```bash
git add backend/src/services/url-validator.ts backend/tests/services/url-validator.test.ts
git commit -m "feat(backend): add URL validator with http/https-only policy"
```

---

## Task 5: In-memory job store (M1 stub, replaced by Postgres in M2)

**Files:**
- Create: `backend/src/services/job-store.ts`
- Create: `backend/tests/services/job-store.test.ts`

For M1 the store is a `Map<jobId, JobResult>`. The interface is what matters — Task 9 swaps the implementation for Postgres without changing callers.

- [ ] **Step 5.1: Write the failing test**

Create `backend/tests/services/job-store.test.ts`:

```ts
import { createJobStore } from '../../src/services/job-store.js';

describe('JobStore', () => {
  it('creates a job and returns a unique jobId', () => {
    const store = createJobStore();
    const job = store.create({ url: 'https://example.com' });
    expect(job.jobId).toMatch(/^[0-9a-f-]{36}$/);
    expect(job.status).toBe('pending');
  });

  it('retrieves a job by id', () => {
    const store = createJobStore();
    const { jobId } = store.create({ url: 'https://example.com' });
    const fetched = store.get(jobId);
    expect(fetched).toBeDefined();
    expect(fetched?.status).toBe('pending');
  });

  it('returns undefined for unknown jobId', () => {
    const store = createJobStore();
    expect(store.get('unknown-id')).toBeUndefined();
  });

  it('completes a job with an echo payload (M1 only)', () => {
    const store = createJobStore();
    const { jobId } = store.create({ url: 'https://example.com/a' });
    store.complete(jobId, { echo: 'https://example.com/a' });
    const result = store.get(jobId);
    expect(result?.status).toBe('complete');
    expect(result?.echo).toBe('https://example.com/a');
  });
});
```

- [ ] **Step 5.2: Run the test — verify it fails**

```bash
npm test -- job-store
```

Expected: FAIL.

- [ ] **Step 5.3: Implement `backend/src/services/job-store.ts`**

```ts
import { randomUUID } from 'node:crypto';
import type { JobResult } from '../types/api.js';

export interface CreateJobInput {
  url: string;
}

export interface JobStore {
  create(input: CreateJobInput): JobResult;
  get(jobId: string): JobResult | undefined;
  complete(jobId: string, fields: { echo?: string }): void;
}

export function createJobStore(): JobStore {
  const jobs = new Map<string, JobResult>();

  return {
    create({ url }) {
      void url; // M1: url not persisted beyond echo, used for logging in callers
      const jobId = randomUUID();
      const job: JobResult = { jobId, status: 'pending' };
      jobs.set(jobId, job);
      return job;
    },

    get(jobId) {
      return jobs.get(jobId);
    },

    complete(jobId, fields) {
      const existing = jobs.get(jobId);
      if (!existing) return;
      jobs.set(jobId, {
        ...existing,
        status: 'complete',
        ...fields
      });
    }
  };
}
```

- [ ] **Step 5.4: Run the test — verify it passes**

```bash
npm test -- job-store
```

Expected: PASS — 4 assertions.

- [ ] **Step 5.5: Commit**

```bash
git add backend/src/services/job-store.ts backend/tests/services/job-store.test.ts
git commit -m "feat(backend): add in-memory JobStore with create/get/complete"
```

---

## Task 6: POST /api/check route

**Files:**
- Modify: `backend/src/server.ts`
- Create: `backend/src/routes/check.ts`
- Create: `backend/tests/routes/check.test.ts`

In M1 the route immediately completes the job with `echo`. In M2 it kicks off real analysis.

- [ ] **Step 6.1: Write the failing test**

Create `backend/tests/routes/check.test.ts`:

```ts
import { app } from '../../src/server.js';

describe('POST /api/check', () => {
  it('returns 202 with a jobId for a valid URL', async () => {
    const res = await app.request('/api/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/a', deviceId: 'dev-1' })
    });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.jobId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.status).toBe('pending');
  });

  it('returns 400 with URL_INVALID for a bad URL', async () => {
    const res = await app.request('/api/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'not-a-url', deviceId: 'dev-1' })
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('URL_INVALID');
    expect(body.error.retryable).toBe(false);
  });

  it('returns 400 when deviceId is missing', async () => {
    const res = await app.request('/api/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/a' })
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('URL_INVALID');
  });
});

describe('GET /api/check/:jobId', () => {
  it('returns 200 with status=complete and the echo for a known jobId', async () => {
    // Submit
    const submit = await app.request('/api/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/echo', deviceId: 'dev-1' })
    });
    const { jobId } = await submit.json();

    // Poll
    const res = await app.request(`/api/check/${jobId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('complete');
    expect(body.echo).toBe('https://example.com/echo');
  });

  it('returns 404 INTERNAL_ERROR for unknown jobId', async () => {
    const res = await app.request('/api/check/unknown-id');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });
});
```

- [ ] **Step 6.2: Run the test — verify it fails**

```bash
npm test -- routes/check
```

Expected: FAIL — `/api/check` route doesn't exist.

- [ ] **Step 6.3: Create `backend/src/routes/check.ts`**

```ts
import { Hono } from 'hono';
import { isValidUrl } from '../services/url-validator.js';
import { createJobStore } from '../services/job-store.js';
import type { ApiError } from '../types/api.js';

// In M1 the JobStore is module-singleton. In M2+ this moves to a dependency-
// injection container so tests can use isolated stores.
const store = createJobStore();

export const checkRoutes = new Hono();

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
  // M1 stub: immediately "complete" the job with the URL echoed back.
  store.complete(job.jobId, { echo: body.url });

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
```

- [ ] **Step 6.4: Mount the check routes in `backend/src/server.ts`**

Replace the contents of `backend/src/server.ts` with:

```ts
import { Hono } from 'hono';
import { checkRoutes } from './routes/check.js';

export const app = new Hono();

app.get('/health', (c) => {
  return c.json({ ok: true });
});

app.route('/api', checkRoutes);
```

- [ ] **Step 6.5: Run the test — verify it passes**

```bash
npm test
```

Expected: PASS — all tests in `health.test.ts`, `url-validator.test.ts`, `job-store.test.ts`, and `routes/check.test.ts` should pass.

- [ ] **Step 6.6: Verify by hand with curl**

In one terminal:
```bash
cd backend && npm run dev
```

In another:
```bash
# Submit a check
curl -i -X POST http://localhost:4000/api/check \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com/article","deviceId":"dev-1"}'
```

Expected: HTTP 202, body like `{"jobId":"<uuid>","status":"pending"}`. Copy the jobId.

```bash
# Poll the job (substitute <jobId>)
curl http://localhost:4000/api/check/<jobId>
```

Expected: `{"jobId":"<uuid>","status":"complete","echo":"https://example.com/article"}`

Stop the dev server with Ctrl-C.

- [ ] **Step 6.7: Commit**

```bash
git add backend/src/server.ts backend/src/routes/check.ts backend/tests/routes/check.test.ts
git commit -m "feat(backend): add POST /api/check + GET /api/check/:jobId with M1 echo stub"
```

---

## Task 7: Mobile scaffold via Expo template

**Files:**
- Create: everything under `mobile/` (via `create-expo-app`)

- [ ] **Step 7.1: Run the Expo template generator**

From the repo root (not `backend/`):
```bash
npx create-expo-app@latest mobile --template blank-typescript
```

When prompted to install dependencies, accept (it runs `npm install` automatically).

Expected: `mobile/` is now populated with `App.tsx`, `app.json`, `package.json`, `tsconfig.json`, `assets/`, etc.

- [ ] **Step 7.2: Verify the template runs on your phone**

```bash
cd mobile
npx expo start
```

Expected: a QR code appears in the terminal. On your phone, open Expo Go and scan the QR code (iPhone: use the Camera app first; Android: use Expo Go's "Scan QR code" button).

Expected on phone: the default template screen showing "Open up App.tsx to start working on your app!"

Stop the Expo dev server with Ctrl-C (or `q` in the terminal) when done.

- [ ] **Step 7.3: Commit the Expo scaffold**

```bash
cd ..  # back to repo root
git add mobile/
git commit -m "feat(mobile): scaffold Expo + React Native + TypeScript template"
```

---

## Task 8: Mobile API types (hand-copied from backend)

**Files:**
- Create: `mobile/src/types/api.ts`

Until OpenAPI codegen (V2), the mobile types are a hand-maintained mirror of `backend/src/types/api.ts`. The "in sync by hand" rule: if you change one, change the other in the same commit.

- [ ] **Step 8.1: Create `mobile/src/types/api.ts`**

```ts
// Hand-mirrored from backend/src/types/api.ts.
// When you change one, change the other in the SAME commit.

export type ErrorCode =
  | 'URL_INVALID'
  | 'URL_BLOCKED'
  | 'EXTRACTION_FAILED'
  | 'LLM_UNAVAILABLE'
  | 'LLM_MALFORMED'
  | 'RATE_LIMITED'
  | 'BUDGET_EXCEEDED'
  | 'UNSUPPORTED_CONTENT_TYPE'
  | 'INTERNAL_ERROR';

export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
    retryable: boolean;
    retryAfter?: number;
  };
}

export interface CheckRequest {
  url: string;
  deviceId: string;
}

export interface CheckResponseAccepted {
  jobId: string;
  status: 'pending';
}

export type JobStatus = 'pending' | 'partial' | 'complete';

export interface JobResult {
  jobId: string;
  status: JobStatus;
  echo?: string; // M1 only
}
```

- [ ] **Step 8.2: Commit**

```bash
git add mobile/src/types/api.ts
git commit -m "feat(mobile): mirror backend API types"
```

---

## Task 9: Mobile API client

**Files:**
- Create: `mobile/src/config.ts`
- Create: `mobile/src/api/client.ts`

Phone reaches your Mac over Wi-Fi. The base URL must be your Mac's LAN IP (the `<MAC_IP>` from P0d), not `localhost` — `localhost` on your phone means *the phone*, not your Mac.

- [ ] **Step 9.1: Create `mobile/src/config.ts`**

Replace `<MAC_IP>` with the value from Prerequisite P0d (for example `192.168.1.42`).

```ts
// Pre-V2 we hard-code the LAN IP. In V2 this comes from EAS Build config.
// Replace <MAC_IP> with the value of `ipconfig getifaddr en0` on your Mac.
export const API_BASE_URL = 'http://<MAC_IP>:4000';
```

- [ ] **Step 9.2: Create `mobile/src/api/client.ts`**

```ts
import type {
  ApiError,
  CheckResponseAccepted,
  JobResult
} from '../types/api';
import { API_BASE_URL } from '../config';

export type ApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ApiError['error'] };

async function parseJsonSafe(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function submitCheck(
  url: string,
  deviceId: string
): Promise<ApiResult<CheckResponseAccepted>> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/check`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url, deviceId })
    });
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Network error — is the backend running?',
        retryable: true
      }
    };
  }

  const body = (await parseJsonSafe(res)) as
    | CheckResponseAccepted
    | ApiError
    | null;

  if (!res.ok) {
    if (body && 'error' in body) return { ok: false, error: body.error };
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: `HTTP ${res.status}`,
        retryable: false
      }
    };
  }

  return { ok: true, value: body as CheckResponseAccepted };
}

export async function getJob(jobId: string): Promise<ApiResult<JobResult>> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/check/${jobId}`);
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Network error — is the backend running?',
        retryable: true
      }
    };
  }

  const body = (await parseJsonSafe(res)) as JobResult | ApiError | null;

  if (!res.ok) {
    if (body && 'error' in body) return { ok: false, error: body.error };
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: `HTTP ${res.status}`,
        retryable: false
      }
    };
  }

  return { ok: true, value: body as JobResult };
}
```

- [ ] **Step 9.3: Commit**

```bash
git add mobile/src/config.ts mobile/src/api/client.ts
git commit -m "feat(mobile): add API client (submitCheck + getJob)"
```

---

## Task 10: Mobile device-ID helper

**Files:**
- Modify: `mobile/package.json` (adds `expo-secure-store` dependency)
- Create: `mobile/src/lib/device-id.ts`

Persist a per-install UUID. Will become the rate-limit key in M6, but we wire it up now so the API contract is honored from day 1.

- [ ] **Step 10.1: Install expo-secure-store**

```bash
cd mobile
npx expo install expo-secure-store
```

Expected: `expo-secure-store` is added to `mobile/package.json` dependencies.

- [ ] **Step 10.2: Create `mobile/src/lib/device-id.ts`**

```ts
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'credibility-check.device-id';

function uuidv4(): string {
  // RFC4122 v4 fallback that works in React Native (no Node crypto module).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let cached: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;

  // SecureStore is unavailable on web; fall back to AsyncStorage-style in-memory.
  if (Platform.OS === 'web') {
    cached = uuidv4();
    return cached;
  }

  const existing = await SecureStore.getItemAsync(KEY);
  if (existing) {
    cached = existing;
    return existing;
  }

  const fresh = uuidv4();
  await SecureStore.setItemAsync(KEY, fresh);
  cached = fresh;
  return fresh;
}
```

- [ ] **Step 10.3: Commit**

```bash
cd ..  # repo root
git add mobile/package.json mobile/src/lib/device-id.ts
git commit -m "feat(mobile): persist per-install deviceId via SecureStore"
```

---

## Task 11: CheckScreen — paste URL, submit, render echo

**Files:**
- Create: `mobile/src/screens/CheckScreen.tsx`
- Modify: `mobile/App.tsx`

For M1 there's no React Navigation yet — just one screen rendered by `App.tsx`.

- [ ] **Step 11.1: Create `mobile/src/screens/CheckScreen.tsx`**

```tsx
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { submitCheck, getJob } from '../api/client';
import { getDeviceId } from '../lib/device-id';
import type { JobResult } from '../types/api';

type ScreenState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'polling'; jobId: string }
  | { kind: 'result'; job: JobResult }
  | { kind: 'error'; message: string };

const POLL_INTERVAL_MS = 1000;
const POLL_MAX_ATTEMPTS = 30;

export function CheckScreen() {
  const [url, setUrl] = useState('');
  const [state, setState] = useState<ScreenState>({ kind: 'idle' });

  async function pollUntilComplete(jobId: string): Promise<void> {
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      const result = await getJob(jobId);
      if (!result.ok) {
        setState({ kind: 'error', message: result.error.message });
        return;
      }
      if (result.value.status === 'complete') {
        setState({ kind: 'result', job: result.value });
        return;
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    setState({ kind: 'error', message: 'Timed out waiting for result.' });
  }

  async function onSubmit() {
    if (!url.trim()) return;
    setState({ kind: 'submitting' });
    const deviceId = await getDeviceId();
    const submission = await submitCheck(url.trim(), deviceId);
    if (!submission.ok) {
      setState({ kind: 'error', message: submission.error.message });
      return;
    }
    setState({ kind: 'polling', jobId: submission.value.jobId });
    await pollUntilComplete(submission.value.jobId);
  }

  function onReset() {
    setUrl('');
    setState({ kind: 'idle' });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Credibility Check</Text>
        <Text style={styles.subtitle}>
          M1 — paste a URL, see the backend echo it back.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="https://example.com/article"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          value={url}
          onChangeText={setUrl}
          editable={state.kind === 'idle' || state.kind === 'error'}
        />

        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            (state.kind === 'submitting' || state.kind === 'polling') &&
              styles.buttonDisabled
          ]}
          disabled={state.kind === 'submitting' || state.kind === 'polling'}
          onPress={onSubmit}
        >
          <Text style={styles.buttonText}>Check</Text>
        </Pressable>

        <View style={styles.resultBox}>
          {state.kind === 'idle' && (
            <Text style={styles.muted}>Awaiting a URL.</Text>
          )}
          {(state.kind === 'submitting' || state.kind === 'polling') && (
            <View style={styles.inline}>
              <ActivityIndicator />
              <Text style={styles.muted}>
                {state.kind === 'submitting'
                  ? 'Submitting…'
                  : `Polling jobId ${state.jobId.slice(0, 8)}…`}
              </Text>
            </View>
          )}
          {state.kind === 'result' && (
            <View>
              <Text style={styles.label}>Status</Text>
              <Text style={styles.value}>{state.job.status}</Text>
              <Text style={styles.label}>Echo (M1)</Text>
              <Text style={styles.value}>{state.job.echo}</Text>
              <Pressable onPress={onReset} style={styles.resetLink}>
                <Text style={styles.resetText}>Check another URL</Text>
              </Pressable>
            </View>
          )}
          {state.kind === 'error' && (
            <View>
              <Text style={styles.errorTitle}>Error</Text>
              <Text style={styles.errorMessage}>{state.message}</Text>
              <Pressable onPress={onReset} style={styles.resetLink}>
                <Text style={styles.resetText}>Try again</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fafaf7' },
  container: { padding: 20, gap: 12 },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { fontSize: 14, color: '#5f6368', marginBottom: 8 },
  input: {
    backgroundColor: '#fff',
    borderColor: '#e6e3dc',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center'
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  resultBox: {
    backgroundColor: '#fff',
    borderColor: '#e6e3dc',
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    marginTop: 8
  },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  muted: { color: '#5f6368' },
  label: {
    color: '#5f6368',
    fontSize: 12,
    textTransform: 'uppercase',
    marginTop: 8
  },
  value: { fontSize: 16, color: '#1a1a1a' },
  errorTitle: { color: '#b91c1c', fontWeight: '600', marginBottom: 4 },
  errorMessage: { color: '#1a1a1a' },
  resetLink: { marginTop: 16 },
  resetText: { color: '#2563eb', fontWeight: '600' }
});
```

- [ ] **Step 11.2: Replace `mobile/App.tsx`**

```tsx
import { StatusBar } from 'expo-status-bar';
import { CheckScreen } from './src/screens/CheckScreen';

export default function App() {
  return (
    <>
      <StatusBar style="dark" />
      <CheckScreen />
    </>
  );
}
```

- [ ] **Step 11.3: Commit**

```bash
git add mobile/App.tsx mobile/src/screens/CheckScreen.tsx
git commit -m "feat(mobile): add M1 CheckScreen with submit + poll + echo render"
```

---

## Task 12: End-to-end manual test (Mac + phone)

No code in this task — just verification that the full M1 pipeline works.

- [ ] **Step 12.1: Open two terminal windows on your Mac**

- [ ] **Step 12.2: Terminal 1 — run the backend**

```bash
cd backend
npm run dev
```

Expected: `Backend listening on http://localhost:4000` log line.

- [ ] **Step 12.3: Terminal 2 — run the Expo dev server**

```bash
cd mobile
npx expo start
```

Expected: QR code appears.

- [ ] **Step 12.4: Open the app on your phone**

iPhone: scan QR with Camera app. Android: scan QR with Expo Go's scan button.

Expected: the "Credibility Check" M1 screen renders on your phone with an input field and Check button.

- [ ] **Step 12.5: Test the happy path**

On your phone, paste `https://www.bbc.com/news/articles/c8ddyx12y2do` into the input. Tap **Check**.

Expected sequence on the phone:
1. Button greys out, spinner shows "Submitting…"
2. Switches to "Polling jobId <8-char-prefix>…"
3. Within ~1–2s, displays:
   - Status: `complete`
   - Echo (M1): `https://www.bbc.com/news/articles/c8ddyx12y2do`
4. A "Check another URL" link appears.

Expected sequence in Terminal 1 (backend logs): one log line per request, no errors.

- [ ] **Step 12.6: Test the invalid-URL path**

Tap "Check another URL". Paste `not-a-url`. Tap **Check**.

Expected on phone: red **Error** block reading "URL is not a valid http or https URL." (or "Request must include {url, deviceId}.").

- [ ] **Step 12.7: Test the backend-down path**

In Terminal 1, stop the backend (Ctrl-C). On the phone, tap "Try again", paste a valid URL, tap **Check**.

Expected on phone: red **Error** block reading "Network error — is the backend running?"

Restart the backend (`npm run dev`) for sanity, confirm the phone now works again.

---

## Task 13: M1 complete — tag the milestone

- [ ] **Step 13.1: Final review**

Run from the repo root:
```bash
cd backend && npm test && cd ..
git status   # should be clean
git log --oneline -20
```

Expected: all backend tests pass, working tree clean, you can see all the M1 commits.

- [ ] **Step 13.2: Tag the milestone**

```bash
git tag -a m1-hello-world -m "M1 complete: end-to-end paste-URL → backend → echo round-trip working"
git log --oneline -1
```

- [ ] **Step 13.3: Write a short M1 retro note**

Create `docs/superpowers/notes/m1-retro.md`:

```markdown
# M1 — Hello World retro

**Tag:** m1-hello-world
**Date completed:** <today>

## What works
- Mac runs Hono backend on :4000, mobile (Expo Go) talks to it over Wi-Fi.
- POST /api/check + GET /api/check/:jobId stub round-trip via UUID jobId.
- URL validation rejects javascript:/file:/no-scheme URLs.
- 4 backend test suites passing (health, url-validator, job-store, routes/check).

## What surprised me
- (Fill in: anything that didn't behave as the plan said.)

## What's deferred to M2
- Real LLM call (Claude API) replaces echo.
- Methodology + Limitations stub pages in mobile app (spec §14 requires before any external demo).
- Backend moves from in-memory JobStore to Postgres or Railway persistent volume.
```

- [ ] **Step 13.4: Commit the retro + tag**

```bash
git add docs/superpowers/notes/m1-retro.md
git commit -m "docs: M1 retro"
```

---

## Self-Review checklist (run before declaring M1 done)

- [ ] Every step has either code, a command, or both (no "implement appropriate handling" placeholders).
- [ ] `npm test` in `backend/` passes with all suites green.
- [ ] Mobile app on your phone successfully echoes a pasted URL via the backend.
- [ ] Invalid URLs return the uniform error envelope shape from spec §12.
- [ ] Backend `Stopping` the server makes the phone display a "Network error" message (graceful failure).
- [ ] `git log --oneline` shows a commit per task, not one giant commit.
- [ ] Method/property names in `backend/src/types/api.ts` and `mobile/src/types/api.ts` are byte-identical.

If any item fails, fix and re-test before moving to M2 planning.

---

## What this plan deliberately leaves to later milestones

| Concern | Lands in |
|---|---|
| Real LLM analysis (Claude API) | M2 |
| Methodology + Limitations stub screens | M2 |
| Postgres / Railway persistent volume | M2 or M3 |
| Dataset lookups (curated CSV, IFCN, maybe AllSides) | M3 |
| `tldts` canonical domain | M3 |
| Combined scoring + drill-down UI | M4 |
| Counter-argument view | M4 |
| Deep Analysis (multi-agent debate) | M5 |
| Caching + rate-limiting + cost circuit-breaker | M6 |
| SSRF guard | M6 |
| Uniform error envelope (we use the shape but only `URL_INVALID` + `INTERNAL_ERROR` are emitted in M1) | expands in M6 |
| Maestro mobile E2E | M6 |
| LLM eval suite | M6 |
| Apple Developer / Play Console / EAS Build / Lawyer review | M7 |
