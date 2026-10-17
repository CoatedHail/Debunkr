# Debunkr

**Paste a news article URL, get a 0–100 credibility score and an explanation of why.**

Debunkr is an iOS app (React Native / Expo) backed by a TypeScript API. It's a media-literacy tool: the goal is to show *why* an article earns its score — who published it, how well it's sourced, and the strongest argument that the rating could be wrong — rather than act as an oracle.

> Download: [App Store link]

---

## How it works

### Standard check (~3 s, ~$0.004)

```
URL → SSRF guard → fetch + Readability extraction → ┬─ publisher lookup (curated datasets)
                                                    └─ Claude content analysis
                                                    → weighted score + explanation
```

The overall score combines three signals:

| Signal | Weight | Source |
|---|---|---|
| Publisher reputation | 45% | Hand-curated list based on Wikipedia's Perennial Sources consensus, plus the IFCN list of certified fact-checkers |
| Article quality | 45% | Claude reads the article and scores sourcing, writing quality and hedging |
| Tone & balance | 10% | Penalty for extreme political lean in either direction |

Every result also includes a **rating strength** indicator (how much data the score rests on) and a **counter-argument**: the strongest reason the rating could be wrong.

For publishers not in the datasets, the score falls back to cheap structural signals (HTTPS, byline, article length), and Claude researches the publisher's reputation with web search, returning a short summary with citations.

### Deep Analysis (opt-in, ~10 s, ~$0.025)

```
              ┌─ Skeptic agent ─────────────────────────────────────────┐
article ──────┼─ Advocate agent ────────────────────────────────────────┼─→ Judge agent → verdict + score adjustment
              └─ Fact-check: extract claims → [Google Fact Check API     ┘
                                               Brave Search (Tier-1 filter)
                                               Wikipedia entity check] → evidence aggregator
```

- A skeptic and an advocate argue the article point by point, while a fact-check pipeline runs in parallel.
- The fact-checker extracts up to 3 verifiable claims, then checks them against published fact-checks, results from a 30-outlet Tier-1 allowlist, and Wikipedia.
- A judge weighs all three and can shift the overall score (clamped to −30…+10).
- **Citation gate:** any citation URL the model returns that didn't come from the retrieved evidence is dropped, so the app can't show a hallucinated source.
- Each external API is isolated: if Google or Brave is down, that branch contributes nothing instead of failing the whole analysis.

---

## Engineering notes

- **SSRF protection.** The backend fetches user-supplied URLs, so every hostname is DNS-resolved and refused if *any* address falls in private, loopback, link-local (incl. cloud metadata), CGNAT or ULA ranges. Redirects are followed manually (max 5 hops) and each hop is re-checked. DNS failure fails closed.
- **Cost control.** Per-device and per-IP daily limits (20 standard / 3 deep checks), a monthly spend circuit-breaker driven by real token usage from each API response, and caching keyed on the publisher's canonical domain plus a SHA-256 hash of the extracted text, so the same article reached through different URLs (AMP, mobile, tracking params) is analyzed once.
- **Prompt-injection hardening.** Article text is passed inside explicit delimiters, model output is validated against a strict JSON schema with one retry, and every LLM step has a safe fallback.
- **Runs without API keys.** LLM steps fall back to stub implementations and the fact-check sources are skipped when their keys are empty, so the full app runs locally with no keys; real services switch in automatically when keys are set.
- **Localization.** English and Simplified Chinese.
- **Privacy.** No accounts. A random device ID is used only for rate limiting and optional feedback.

## Tech stack

- **Mobile:** React Native 0.85, Expo SDK 56, TypeScript, i18n-js
- **Backend:** Node.js, TypeScript, Hono, Mozilla Readability + jsdom, tldts, pino
- **AI / data:** Claude API (Haiku 4.5), Google Fact Check Tools API, Brave Search API, Wikipedia REST API
- **Testing:** Jest + ts-jest (334 tests across 30 suites), plus an end-to-end eval set of fixture URLs with expected score ranges
- **Hosting:** Railway (backend), EAS Build (iOS)

## Project layout

```
backend/
  src/routes/      HTTP endpoints (POST /api/check, GET /api/check/:jobId, POST /api/check/:jobId/deep, POST /api/feedback)
  src/services/    pipeline stages: extraction, SSRF guard, scoring, fact-checking, caching, rate limiting, cost tracking
  src/prompts/     LLM prompts for analysis, claim extraction, evidence aggregation, deep analysis
  src/data/        curated publisher, IFCN and Tier-1 source datasets (CSV)
  tests/           unit + route tests; tests/evals/ holds the end-to-end eval set
mobile/
  src/screens/     Check, Methodology, Limitations and Media Literacy screens
  src/components/  result UI (evidence cards, etc.)
docs/              privacy policy, terms (served via GitHub Pages)
```

## Running locally

Requires Node.js 20+.

```bash
# Backend
cd backend
npm install
cp .env.example .env   # API keys are optional; stubs are used when they're empty
npm run dev            # http://localhost:4000
npm test               # unit + route tests (no network or API keys needed)
npm run eval           # end-to-end eval against a running backend with real keys

# Mobile
cd mobile
npm install
npm start              # then press i for iOS Simulator or w for web
```

For local development, point `API_BASE_URL` in `mobile/src/config.ts` at your backend.

## Limitations

Debunkr rates writing quality and publisher reputation, not absolute truth. A well-written fabrication from an unknown site can still score Mixed; breaking news often has no fact-checks yet; the fact-check pipeline is English-only and its Tier-1 list skews US/UK; and LLMs can be wrong. The in-app Methodology and Limitations screens cover this in detail.
