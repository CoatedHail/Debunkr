# M4 — Combined scoring retro

**Tag:** m4-combined-scoring
**Date completed:** 2026-05-25
**Commits on branch:** 8 (plan + 7 implementation)

## What works

- `Overall = 0.45·SourceRep + 0.45·ContentQuality + 0.10·BiasAdjustment` per spec §6.
- Bucket labels: Highly credible / Mostly credible / Mixed / Questionable / Low credibility.
- Deterministic confidence: high (2+ datasets + extraction ok) / medium (1 dataset OR no extraction) / low (no datasets, cheap-signals only).
- Bias scale -5..+5 LLM-estimated (no AllSides yet).
- Counter-argument always shown — yellow card with media-literacy footnote.
- Cheap-signals fallback for unknown publishers: HTTPS +5, byline +10, siteName +5, articleLength>2000 +10, baseline 30 → range 30–60. Synchronous, no extra network.
- Mobile UI: big colored headline overall + bucket label + confidence pill. Breakdown card with sub-scores. When publisher unknown, white checklist box shows which cheap signals passed. Yellow counter-argument card.
- 88 backend tests pass across 11 suites.

## Verified in browser (STUB mode)

| URL | Overall | Bucket | Confidence | Notes |
|---|---|---|---|---|
| theonion.com article | 71 | Mostly credible | LOW | Unknown publisher; cheap-signals checklist visible (all 4 ✓); Onion extracted cleanly |

Math: 0.45×60 (cheap-signals SR) + 0.45×75 (stub content) + 0.10×100 (bias 0 → adj 100) = 70.75 → 71 ✓

## What surprised me

- Single LLM call returning all 4 fields (content + reasoning + bias + counterArgument) was cleaner than expected. ~50 extra output tokens vs separate calls. Cheaper at Haiku 4.5 prices.
- Cheap-signals + STUB combo demos surprisingly well — user sees a real differentiated score even without LLM credit.
- The counter-argument footnote ("strongest reason this rating could be wrong; media-literacy tool") shifts the framing in a useful way — it stops feeling like an oracle.

## Deviations from plan

None notable. Subagents followed the spec exactly across all 7 implementation tasks. No signature changes, no jest config tweaks needed (jsdom + transformIgnorePatterns work already established in M2).

## What's deferred to M5

- Deep Analysis multi-agent debate (Skeptic + Advocate + Judge LLM calls behind a button).
- Disagreement transparency UI (needs AllSides or 2nd bias dataset).

## Outstanding M4 follow-ups (low priority)

- Real AllSides integration. Spec §8 wants verification first. Until then bias.source is always 'llm'.
- WHOIS domain-age signal in cheap-signals (deferred to M6).
- Outbound-link count signal needs raw HTML pass-through from extractor (deferred to M6).

## Outstanding security debt (still deferred to M6)

- SSRF guard on extractor.
- Rate limit per device+IP composite.
- Cost circuit-breaker.
- Postgres migration (still in-memory JobStore).

## When user gets API key

Real Claude takes over: paste `ANTHROPIC_API_KEY=sk-ant-...` into `backend/.env`, restart. The LLM will return real `contentQuality`, real `biasScale` based on article content, and real `counterArgument` written for the specific article. UI rendering unchanged.
