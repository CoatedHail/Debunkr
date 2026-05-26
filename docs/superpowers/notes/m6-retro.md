# M6 — Production hardening retro

**Tag:** m6-production-hardening
**Date completed:** 2026-05-26
**Commits on branch:** ~10 (plan + 9 implementation/fix)

## What works

- **SSRF guard** on article extractor. DNS-resolves URL hostname, refuses RFC1918/loopback/link-local/AWS-metadata/IPv6 ULA + private ranges. Re-checks each redirect target. Manual redirect handling caps at 5 hops. Fails closed on DNS errors.
- **Rate limiter** in-memory. Per (deviceId, ip) composite. Single = 20/day/device + 20/day/ip. Deep = 3/day/device + 6/day/ip. Resets at midnight UTC. State wiped on backend restart (acceptable for V1; deferred Postgres makes it truly persistent in M7).
- **Cost tracker** in-memory monthly sum + JSONL persistence (`backend/data/cost-events.jsonl`). Real token usage extracted from each Anthropic response (`response.usage.input_tokens` / `output_tokens`). On boot, replays the current-month log file back into memory. Circuit-breaker trips when monthly spend ≥ `MONTHLY_BUDGET_USD` (default 0 = disabled).
- **Cache** in-memory with TTL. Key = `(canonicalUrl, sha256-first-4KB-of-text)`. 1h TTL for `/news/`, `/202[0-9]/`, `/articles?/` URL patterns; 24h default. Lookup happens after extraction (so cache key is content-stable across URL aliasing); hit short-circuits LLM call.
- **Feedback widget** with JSONL persistence (`backend/data/feedback-events.jsonl`). POST /api/feedback validates `{jobId, deviceId, vote: up|down, comment?}`. Mobile UI: 👍/👎 buttons below counter-argument card; 👎 expands a comment box + Send button; "Thanks" confirmation on submit.
- Routes wire all four services: rate-limit check (returns 429 RATE_LIMITED), budget check (returns 503 BUDGET_EXCEEDED), cache lookup, cost record on every LLM call.
- 138 backend tests pass across 19 suites (up from 97 at start of M6).

## Scope changes from plan

- **Postgres SKIPPED.** User's local Postgres install was broken (permission denied on data dir, brew service in error state). Decision: keep in-memory + JSONL files for V1 since data wipes only matter in production. Postgres migration moves to **M7** alongside Railway/Render deploy when the user actually picks a managed DB URL. Plan document still describes Postgres as the target architecture — kept for reference; retro notes the deferral.
- **Eval suite SKIPPED.** Deferred to M7. Real LLM eval suite (~30 fixture URLs) has lower ROI until prompts stabilize after M5 Deep Analysis hits real-world use.
- **WHOIS + outbound-link signals SKIPPED.** Both require additional network/parsing infra. Deferred to post-V1.
- **Maestro mobile E2E SKIPPED.** Manual web verify covers the same paths; native test infra delayed until M7 native build pipeline.

## What surprised me

- (Fill in if anything.)

## Verified in browser

- Feedback widget renders below counter-argument card. 👍 immediately submits. 👎 opens comment box + Send. Confirmation message appears after submit. JSONL file at `backend/data/feedback-events.jsonl` gains a new line per submission.

## What's deferred to M7

- **Postgres migration** (job store, cost events, feedback events all become DB-backed). Requires picking deploy target first.
- **WHOIS domain-age signal** in cheap-signals.
- **Outbound-link count signal** (requires raw HTML pass-through).
- **Maestro mobile E2E suite** (real iOS Simulator + Android Emulator).
- **LLM eval suite** (~30 fixture URLs with expected score ranges).
- **AllSides license verification** (still pending external).
- **Apple Developer Program enrollment** ($99/yr) + **Google Play Console** ($25 one-time).
- **EAS Build pipeline** + **Expo Updates** for OTA.
- **App icon + screenshots + store listings.**
- **Privacy policy + TOS + Methodology final wording.**
- **Lawyer review** (launch gate per spec §9).
- **Deployment to Railway/Render** + production env config.

## Outstanding security/quality debt (resolved in this milestone)

- ✅ SSRF — blocks private-range URLs.
- ✅ Rate limiting — single + deep, device + IP composite.
- ✅ Budget cap — monthly USD circuit-breaker.
- ✅ Cache — cuts repeat-URL cost.
- ✅ Feedback channel — moat dataset begins accumulating.

## Outstanding from prior milestones

- In-memory store still wipes on restart (mitigation: cost events persist via JSONL, so budget tracking survives; rate-limit counters and cache do not, but that's acceptable since they're per-day/per-content-hash and wipe naturally anyway).
- Article text held in plain RAM (`articleTextByJob` Map) — still needed for Deep Analysis between routes. Postgres migration in M7 fixes this.

## How to enable budget cap

Set in `backend/.env`:
```
MONTHLY_BUDGET_USD=10
```
Restart backend. The circuit-breaker now trips at $10/month.
