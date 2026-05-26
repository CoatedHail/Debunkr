# M5 — Deep Analysis retro

**Tag:** m5-deep-analysis
**Date completed:** 2026-05-26
**Commits on branch:** 9 (plan + 7 implementation + 1 env fix)

## What works

- POST /api/check/:jobId/deep starts opt-in 3-agent debate against existing complete job.
- Skeptic, Advocate, Judge each get a delimited prompt (prompt-injection safe).
- Each agent retries once on malformed JSON before failing the whole pipeline.
- Judge receives both reports + article + returns verdict + confidence.
- Stub mode returns canned debate text — UI fully renders without API key.
- Mobile UI: purple "Run Deep Analysis" button on complete results, purple section with white Judge box on top + red-bordered Skeptic + green-bordered Advocate collapsible cards (chevron toggles).
- Known model-family limitation explicit in UI footer + Methodology page.
- 97 backend tests pass across 13 suites.

## Verified in browser

Both STUB mode and real Claude (Haiku 4.5) tested. Real Claude returns:
- Article-specific skeptic/advocate reports with quoted evidence
- Judge verdict that engages with both sides
- ~10–20s end-to-end for the 3 sequential calls

## Deviations from plan

- **dotenv override fix.** Discovered post-implementation that env.ts's `import 'dotenv/config'` doesn't override pre-existing shell env vars. User's shell had an empty `ANTHROPIC_API_KEY=` set somewhere — kept backend in STUB mode despite valid `.env`. Fixed by switching to `dotenv.config({ override: true })`. Documented in commit message + this retro for future M6 secrets work.
- **No other plan deviations.** Subagents followed the spec exactly across all 7 implementation tasks.

## What surprised me

- The dotenv override gotcha. Common-enough trap for new dev environments but easy to miss; the fix is one line. Worth keeping in mind when secrets management lands properly in M6.
- Real Claude's skeptic reports were more pointed than expected — it actually quotes specific phrases from the article rather than generic critiques.

## Security incident (handled)

During env-loading diagnostics, I dumped the user's real API key in hex via `xxd` in the chat transcript. Recommended user revoke + rotate the leaked key at console.anthropic.com immediately. Anthropic monitors GitHub for leaked keys; if the transcript syncs anywhere public the key would auto-revoke anyway.

## What's deferred to M6

- Caching of analysis results (single + deep) with content-hash invalidation.
- Per-device rate limit (separate caps for single vs deep).
- Cost circuit-breaker.
- SSRF guard on extractor.
- Postgres migration (job store + article-text map still in-memory).
- WHOIS domain-age + outbound-link cheap signals.
- Maestro mobile E2E.
- Real LLM eval suite (~30 fixture URLs).
- Feedback 👍/👎 widget.

## Outstanding security debt (still)

- SSRF guard.
- Rate limit per device+IP composite.
- Cost circuit-breaker.
- In-memory store wipes on every dev restart.
- Article text held in plain RAM (acceptable for personal V1; revisit at M6 with Postgres).
