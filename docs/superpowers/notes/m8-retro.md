# M8 — Fact-check pipeline retro

**Tag (pending PR merge):** `m8-fact-check-pipeline`
**Date completed:** 2026-05-28
**Branch:** `m8-fact-check-pipeline` (PR pending review on github.com/CoatedHail/Fake_News_Detector)
**Commits on branch:** 12 (plan + 11 implementation/fix)

## What works

- **Tier-1 source allowlist** — 30 hand-curated authoritative publishers (Reuters, AP, BBC, NYT, WaPo, Guardian, AFP, NPR, Bloomberg, FT, WSJ, Economist, NHK, ABC, CBS, NBC, PBS, ProPublica, Atlantic, New Yorker, Time, Axios, Politico, Foreign Policy, Science, Nature, NatGeo, Smithsonian, LA Times) for SERP filtering. `isTier1(domain)` handles subdomain normalization and full-URL input. Reuses `canonicalDomain()` with fallback for exact-match subdomains like `abcnews.go.com`.
- **Claim extractor** — single LLM call (Claude Haiku 4.5, temperature 0, max 1024 tokens). Returns up to 3 verifiable claims with type (`event` | `attribution` | `statistic` | `entity`), named entities (max 5/claim), and `checkable` flag. Strict JSON output. Stub variant for no-key dev.
- **Google Fact Check Tools API client** — wraps `factchecktools.googleapis.com/v1alpha1/claims:search`. Normalizes the long-tail of reviewer rating strings ("Pants on Fire!", "Four Pinocchios", "Mostly True", "Misleading", "Correct Attribution") into 6 buckets (`true` / `mostly-true` / `mixed` / `mostly-false` / `false` / `unknown`). 5s timeout, degrades to `[]` on 5xx/network/timeout. Throws `FactCheckAuthError` on 401/403.
- **Brave Search client** — wraps `api.search.brave.com/res/v1/web/search` with `X-Subscription-Token` header. Strips HTML highlight tags from snippets, caps length at 300 chars, flags each hit's `isTier1`. Degrades to `[]` on every error path. Caller picks filter policy.
- **Wikipedia entity check** — wraps `en.wikipedia.org/api/rest_v1/page/summary/<name>`. No API key needed. Distinguishes existing entity, disambiguation page, and 404. `checkEntities()` parallel-fans-out with case-insensitive dedup and 5-entity cap.
- **Evidence aggregator** — second LLM call. Synthesizes article + claims + fact-check matches + Tier-1/non-Tier-1 SERP split + Wikipedia entity statuses into a single `EvidenceResult`: `{verdict, confidence, citations[], scoreDelta, reasoning}`. Strict JSON parse with safe fallback (NEVER throws — even SDK transport errors degrade). Anti-hallucination gate: drops any citation URL not present in the union of supplied inputs. `scoreDelta` clamped to `[-30, +10]` at parse time. Stub variant.
- **Fact-checker orchestrator** — single entry `runFactCheck(articleText)`. Chains extract → short-circuit on 0 claims → parallel fan-out (Google + Brave + Wikipedia, each branch isolated via per-promise `.catch(() => [])`) → aggregator. Each external API failure substitutes `[]` for that branch without killing the pipeline. Three safe-default exit reasons: `Claim extraction failed`, `No verifiable claims found in article`, `Aggregator call failed`.
- **Deep Analysis integration** — Skeptic + Advocate + fact-checker now launched in parallel via `Promise.all`. Judge waits for all three. Judge prompt extended with new `<<<EVIDENCE_START>>>...<<<EVIDENCE_END>>>` section and instructed to weight evidence heavily. Evidence persisted to `JobResult.deepAnalysis.evidence`. `applyEvidenceDelta(overall, evidence)` adjusts the final overall score, clamped `[5, 95]` and rounded. Cost tracker records the two extra LLM calls as a single fact-check usage record.
- **Mobile EvidenceCard** — verdict badge (color-coded: green / red / amber / gray), confidence chip, expandable reasoning (truncates at ~120 chars), up to 3 citations shown with publisher chip + snippet + supports tag (✓ Agrees / ✗ Contradicts / · Context), "Show more" toggle for additional citations, taps open the source URL via `Linking.openURL`. Renders inside the existing Deep Analysis section, above Skeptic/Advocate cards. Empty citations array shows subdued "no citations" message.
- **Methodology + Limitations copy** — Methodology gets a new "How we fact-check claims (Deep Analysis only)" section with the 5-stage pipeline numbered out. Limitations adds 5 honest bullets covering English-only coverage, breaking-news lag, Wikipedia-entity blind spots, Tier-1 regional skew, and aggregator hallucination risk.
- **Eval suite extended** — 5 new fixtures covering known-false (Snopes URL, real), Tier-1 corroborated (Reuters slug — placeholder pending curator confirmation), obscure-but-true, fabricated entity, and mixed (last three are obvious `example.com/m8-fixture-*-PLACEHOLDER` URLs). Runner now POSTs to the Deep endpoint and asserts `evidence.verdict` + `evidence.scoreDelta` range when fixture sets those fields. Backward-compatible with M7 fixtures.
- 296 backend tests pass across 28 suites (up from 138 / 19 at start of M8 = +158 tests, +9 suites).

## Architecture in one sentence

`articleText → claim-extractor (LLM #1) → parallel fan-out [Google Fact Check + Brave SERP + Wikipedia] → evidence-aggregator (LLM #2) → {verdict, scoreDelta -30..+10, citations[]} → Judge consumes evidence in Deep synthesis → applyEvidenceDelta shifts overall score.`

## Scope changes from plan

None substantive. Sub-agent deviations were all sensible (naming convention matches, defensive validation slightly stricter than spec on a few error paths, mobile types mirrored proactively because the existing project comment requested it).

## What surprised me

- **`canonicalDomain()` returns eTLD+1**, which collapsed `abcnews.go.com` (a Tier-1 seed) to `go.com`. Task 1 sub-agent caught this and added exact-subdomain matching before falling back to eTLD+1. Without that, `isTier1("abcnews.go.com")` would have returned `false` — silent failure.
- **`Claim` type lives in `prompts/claim-extraction.ts`, not `services/claim-extractor.ts`** despite being a "data type." Task 6 sub-agent imported from the wrong location; tests passed via ts-jest leniency, but strict `tsc --noEmit` caught it. Fixed in commit `8b0f83f`.
- **Two pre-existing tsc errors uncovered** (M3 dataset-lookup `unknown` tier missing from `TIER_TO_VERDICT` record; M6 `check.ts` passing `jobId` in a partial-update spread that excludes it). Both predate M8 and are unrelated; flagged for separate cleanup PR via task chip.

## Verified

- All 296 backend tests pass: `cd backend && npm test`.
- Mobile EvidenceCard added zero new tsc errors; one pre-existing error in `src/api/client.ts(80,54)` is unchanged.
- Backend `tsc --noEmit` clean except for the two pre-existing M3 + M6 errors documented above.
- Stub-mode end-to-end: claim-extractor-stub, evidence-aggregator-stub all produce well-formed shapes the rest of the pipeline accepts.

## What's deferred to M9 or post-V1

- **Semantic similarity to news corpus** (vector DB + ongoing scrape) — too much for V1.
- **Multi-language fact-check** — Google API supports it but UI/prompt work non-trivial.
- **Image/video reverse search** (TinEye / Google Lens) for AI-generated media.
- **User-submitted counter-evidence** (V2 feature).
- **Separate evidence-result caching** — current `cache.ts` already caches whole `JobResult`, sufficient for V1.
- **Real API keys end-to-end smoke test** — requires user to sign up for Google Cloud (Fact Check Tools API) + Brave Search API. Both free. Drop into `backend/.env`:
  ```
  GOOGLE_FACT_CHECK_API_KEY=
  BRAVE_SEARCH_API_KEY=
  ```
  Then `cd backend && npm run dev` and POST a real article URL to `/api/check` → `/api/check/:jobId/deep`. Evidence card renders in mobile if `result.deepAnalysis.evidence` populated.
- **Eval suite real-key run** — placeholder fixtures must be replaced with real stable URLs before running `npm run eval`.

## Cost & latency

- Deep Analysis: $0.015 → ~$0.025 (+$0.01 per Deep)
- Deep latency: ~6s → ~10s (fact-check runs parallel with Skeptic+Advocate so net slowdown bounded by max-of-branches)
- Single check: unchanged ($0.004, ~3s)
- Rate limit unchanged (existing 3 Deep/day/device already caps this)
- Cost cap unchanged (`MONTHLY_BUDGET_USD` covers all Anthropic spend including the two new calls)

## Outstanding security/quality debt

- ✅ Anti-hallucination citation gate (URLs must come from supplied inputs)
- ✅ `scoreDelta` clamped at type-level [-30, +10] before any application
- ✅ Each external API failure isolated (Google down ≠ pipeline down)
- ✅ Safe fallback on every LLM step (aggregator NEVER throws)
- ✅ Both new API keys gitignored via existing `.env` rule
- ⚠️ **Two pre-existing tsc errors** (M3 + M6) — see task chip spawned
- ⚠️ Eval fixtures 2-5 are placeholders pending curator URLs

## Tagging

Per workflow B (feature branch + PR), tag `m8-fact-check-pipeline` should be created on `master` AFTER PR merge:
```bash
git checkout master
git pull
git tag m8-fact-check-pipeline
git push origin m8-fact-check-pipeline
```

## How to enable the fact-check branch

1. Get Google Fact Check Tools API key: `https://console.cloud.google.com` → enable "Fact Check Tools API" → create API key.
2. Get Brave Search API key: `https://api.search.brave.com` (free tier 2k req/mo, no card required).
3. Add to `backend/.env`:
   ```
   GOOGLE_FACT_CHECK_API_KEY=AIza...
   BRAVE_SEARCH_API_KEY=BSA...
   ```
4. Restart backend. Each Deep Analysis now runs the full fact-check pipeline. Empty keys disable the corresponding branch (graceful degrade).
