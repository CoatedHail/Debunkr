# M2 — Single-LLM rating + stub legal pages retro

**Tag:** m2-llm-rating
**Date completed:** 2026-05-25
**Commits on branch:** 14

## What works

- Backend pipeline: paste URL → fetch + Readability extract → LLM analyze → score + reasoning. Async via fire-and-forget job; polled via GET /api/check/:jobId.
- Job lifecycle: pending → partial (title + siteName) → complete (with score) OR failed (with error envelope).
- Article extractor: 10s timeout, 5MB body cap, Content-Type allowlist (`text/html`, `application/xhtml+xml`). Handles 404, timeout, oversize, non-HTML, unparseable.
- LLM analyzer: real Claude path with delimiter pattern + JSON schema validation + 1 retry on malformed.
- Stub analyzer fallback when ANTHROPIC_API_KEY absent — returns `{score: 75, reasoning: "STUB: ..."}`. Real Claude swaps in automatically when key arrives.
- Mobile UI: score badge (colored 0–100 + Highly/Mostly/Mixed/Questionable/Low label), AI reasoning, article title + siteName, failed-state error display, partial-state "Analyzing…" with article title showing.
- Methodology + Limitations stub screens accessible from result. Required before any external demo per spec §9.
- Backend env loader (`config/env.ts`) + `hasRealLlm()` predicate. Startup log line states real vs stub.
- CORS still working from M1 (cross-origin web → backend).
- 35 tests passing across 7 suites: health (1), url-validator (8), job-store (7), article-extractor (5), llm-analyzer (5), stub-analyzer (2), routes/check (7).

## Deviations from plan

- **Plan-revision: stub LLM analyzer added (Task 6.5, NEW).** User had no API key yet. Stub returns fixed score with delimiter-style reasoning. Real Claude analyzer (Task 6) still implemented per plan and tested in isolation — Task 7 picks at runtime based on `hasRealLlm()`. Zero code change needed when key arrives, only `.env` paste + restart.
- **Plan-revision: ANTHROPIC_API_KEY made optional** (was required in plan §5). Backend boots without it; logs WARN-level stub-mode notice on startup.
- **Subagent deviation: `ExtractOptions.fetchImpl` signature narrowed** from `typeof fetch` to `(url: string | URL, init?: RequestInit) => Promise<Response>` because TypeScript can't assign jest-mock types to full `fetch` signature. Functionally equivalent.
- **Jest config tweak:** added `transformIgnorePatterns: []` + `.mjs` transform rule because jsdom v29 has ESM-only transitive deps that ts-jest must process. Required for article-extractor tests to compile.
- **MethodologyScreen has an unused `View` import.** Cosmetic, no runtime effect. Lint will warn if ESLint enabled later.

## What surprised me

- Stub-fallback architecture turned out to be cleaner than expected. Same `AnalyzeResult` return type, same module signature — `routes/check.ts` just picks at boot time. Pattern reusable for any future expensive-dependency component (Postgres → SQLite fallback for dev, etc.).
- Pipeline orchestration in `runPipeline()` ended up tiny (~20 lines) because each service returns a discriminated union. Hard to mess up the error paths.
- 35 tests took ~14s. Mostly jsdom warmup. Acceptable for M2 size.

## What's deferred to M3

- Dataset lookups: hand-curated reliability CSV + IFCN + maybe AllSides if license clears.
- `tldts` canonical domain extraction (AMP/subdomain/mobile/shortener handling).
- Postgres migration — current in-memory `Map` JobStore wipes on every dev restart, so re-paste after `npm run dev` restart shows fresh job (not cached).

## Outstanding security debt (still deferred to M6)

- SSRF guard on extractor. Mitigation: backend not deployed publicly, no untrusted users.
- Rate limit not yet enforced.
- Cost circuit-breaker not yet enforced. Stub mode also dodges this issue.
- Job-completion timeout (60s) not enforced.
- Postgres race-condition tests not added (still in-memory).

All land in M6 alongside production-hardening work.

## When user gets API key

1. Open `backend/.env` (does not exist — create from `backend/.env.example`).
2. Set `ANTHROPIC_API_KEY=sk-ant-api03-...`.
3. Save. `tsx watch` auto-reloads.
4. Backend log line changes from `LLM: STUB mode` to `LLM: real Claude (claude-haiku-4-5)`.
5. Submit a real article URL — real scores start coming through.

No code change required.
