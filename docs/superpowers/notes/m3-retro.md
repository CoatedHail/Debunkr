# M3 — Dataset lookups retro

**Tag:** m3-datasets
**Date completed:** 2026-05-25
**Commits on branch:** 12

## What works

- Canonical domain via `tldts` — handles AMP, mobile, blogs subdomains, UK eTLDs, IP rejection, shortener detection. 11 unit tests covering edge cases.
- Curated reliability CSV: 30 publishers, hand-picked from Wikipedia Perennial Sources. 4 tiers (high/medium/mixed/low).
- IFCN signatory CSV: 20 entries.
- `dataset-lookup` service loads both CSVs at boot into `Map<domain, verdict>`. ~O(1) lookups. 6 unit tests.
- Pipeline integration: publisher lookup runs synchronously before extraction. Surfaces in `partial` AND `failed` job updates per spec §10.
- Mobile UI: `PublisherBlock` component with colored tier badge, per-source verdict rows (WIKIPEDIA / IFCN), and "unknown publisher" fallback message. Source name attribution visible per spec §9.
- Methodology screen copy updated to reflect M3 reality (lists actual datasets in use).
- 55 backend tests pass across 9 suites.

## Verified in browser (Expo web, STUB mode)

| URL | Result | Status |
|---|---|---|
| nytimes.com article | green badge + WIKIPEDIA verdict; HTTP 403 from NYT (bot block) → fail message + publisher still rendered | ✓ matches spec |
| reuters.com article | green badge + WIKIPEDIA + IFCN both verdicts; HTTP 401 paywall → fail + publisher rendered | ✓ matches spec |
| theonion.com article | grey "Unknown publisher" + AI STUB score 75 | ✓ matches spec |

The 403/401 paywall behavior surfaces a real M2-era hole: many real news sites block our extractor UA. Not a regression — spec §12 already classifies as EXTRACTION_FAILED. Mitigations (paywall-friendly headers, JS-rendering fallback) belong in M6 hardening.

## Deviations from plan

- **Subagent deviation: dataset-lookup CSV path resolution.** Plan used `import.meta.url`-based `__dirname`. Failed under ts-jest (`Cannot use 'import.meta' outside a module` — ts-jest compiles to CJS internally, needs `NODE_OPTIONS=--experimental-vm-modules` to enable). Swapped to `path.resolve(process.cwd(), 'src', 'data')`. Works because both `npm test` and `npm run dev` are run from `backend/`. Fragile if anyone invokes from repo root; tracked as M6 hardening note.
- **AllSides skipped entirely.** Spec §8 said "if license verified." User had no time to verify, so dropped. LLM-estimated bias becomes the only bias signal until either AllSides clears or M4 adds the LLM-bias call.
- **30 publishers, not 100.** Plan said "~100"; ~30 high-traffic publishers covers most paste flows for a personal-test V1. Add more incrementally.

## What surprised me

- `tldts` `parse()` handles UK eTLDs (`bbc.co.uk`) without configuration. Was prepared to add public-suffix list manually.
- Failed-extraction-but-publisher-still-shows is genuinely useful UX, not just a spec checkbox. When NYT 403s, user still sees "nytimes.com — Generally reliable", which is the high-value answer for most casual checks (they trust the publisher, didn't need the article scored).
- Stub LLM + real publisher lookup combo is a perfectly usable demo. User can show "see, our publisher tiering works" without spending API credits.

## What's deferred to M4

- Combined weighted overall score: `0.45·SourceRep + 0.45·ContentQuality + 0.10·BiasAdjustment` per spec §6.
- Confidence indicator (high/medium/low — derived from dataset coverage + extraction success).
- Counter-argument view (LLM call with explicit "strongest argument the rating could be wrong" prompt).
- Disagreement transparency UI (when 2+ datasets disagree, surface the disagreement instead of averaging).
- Cheap-signals fallback for unknown publishers (domain age, HTTPS, byline/date presence, contact info).
- Bias scale (-5..+5) — surfaced separately from overall score.

## Outstanding M3 follow-ups (low priority)

- 30 publishers is a small list. Expand to 100+ before any real public usage.
- IFCN snapshot needs a quarterly refresh process — not automated yet.
- Shortener detection only flags the URL but doesn't resolve redirects. Real shortener handling lands in M4 or M6.
- CSV loader path resolution depends on cwd — tighten in M6.

## Outstanding security debt (still deferred to M6)

- SSRF guard on extractor.
- Rate limit per device+IP composite.
- Cost circuit-breaker.
- Postgres migration (still in-memory).

## How to enable real Claude any time

`backend/.env` (create from `.env.example`):
```
ANTHROPIC_API_KEY=sk-ant-api03-...
```
Restart `npm run dev`. Backend log line flips from `LLM: STUB mode` to `LLM: real Claude (claude-haiku-4-5)`. Zero code change.
