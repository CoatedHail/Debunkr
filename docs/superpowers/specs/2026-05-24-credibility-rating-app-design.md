# Credibility Rating App — V1 Design

**Date:** 2026-05-24
**Status:** Draft for review
**Working name:** Credibility Check (internal codename: Fake News Detector)

## 1. Problem and goals

People encounter articles online and want to quickly judge whether to trust them. Existing tools have gaps: most are browser-only (NewsGuard), paid (NewsGuard, Ad Fontes), rate publishers but not individual articles (MBFC, AllSides), or hide their uncertainty behind a single confident number.

**Goal:** Build a mobile app that takes a URL and returns a per-article credibility rating with transparent reasoning, multiple data sources, and honest uncertainty.

**Non-goals for V1:**
- Public list of rated sites (legal exposure)
- Browser/share extensions (V2 — but architected for it)
- User accounts and cross-device sync (V2)
- Paid datasets (MBFC licensed data, Ad Fontes, NewsGuard)
- Web version (V2)

## 2. Target user

General public / casual news readers. Explanations are plain English, no jargon, written for someone scrolling on their phone.

## 3. Scope — what's in V1

| Feature | In V1? |
|---|---|
| Paste URL → get combined rating + drill-down | ✅ |
| Source reputation from aggregated datasets (AllSides + Wikipedia Perennial Sources + IFCN) | ✅ |
| Single-LLM content analysis (fast default) | ✅ |
| Deep Analysis button — opt-in multi-agent debate | ✅ |
| Confidence indicator on every result | ✅ |
| Disagreement transparency — surface when datasets disagree | ✅ |
| Strongest counter-argument view | ✅ |
| "Was this rating fair?" feedback (👍/👎 + comment) | ✅ |
| Fallback for unknown publishers (cheap signals only) | ✅ |
| Local history (device-only, no accounts) | ✅ |
| Methodology + Limitations in-app pages | ✅ |
| Caching by URL (~24h) | ✅ |
| Per-device rate limits + monthly backend budget cap | ✅ |
| Cross-platform via Expo / React Native | ✅ |

**Deferred to V2 (explicitly architected to support, not implement):**
- Share extension (iOS Share Sheet + Android Intent) — the strategic distribution priority
- Pricing model: 5 free checks/day, $4.99/mo unlimited + Deep Analysis
- Multi-LLM-family debate (e.g., Claude + GPT for less correlated bias)
- Accounts, cross-device sync, favorites
- Paid datasets if license obtained
- Browser extension

## 4. Architecture overview

Three-tier system: mobile app → backend API → external services (LLM + dataset sources).

```
┌─────────────────────────────────────┐
│  Mobile App (Expo / React Native)   │
│  - Paste URL UI                     │
│  - Result screen + drill-down       │
│  - Deep Analysis button             │
│  - Local history (AsyncStorage)     │
│  - Methodology / Limitations pages  │
│  - Feedback widget                  │
└────────────────┬────────────────────┘
                 │  HTTPS
                 ▼
┌─────────────────────────────────────┐
│  Backend API                        │
│  ┌─────────────────────────────┐    │
│  │ Rating Service              │    │
│  │  - Coordinates the pipeline │    │
│  └──────┬───────────┬──────────┘    │
│         ▼           ▼               │
│  ┌──────────┐  ┌──────────────┐     │
│  │ Dataset  │  │ Article      │     │
│  │ Lookup   │  │ Extractor    │     │
│  └──────────┘  └──────┬───────┘     │
│                       ▼             │
│              ┌──────────────────┐   │
│              │ LLM Analyzer     │   │
│              │ - Single-pass    │   │
│              │ - Deep (debate)  │   │
│              └──────────────────┘   │
│  ┌─────────────────────────────┐    │
│  │ Cache (URL → result, 24h)   │    │
│  │ Rate Limiter (per device)   │    │
│  │ Feedback Store              │    │
│  └─────────────────────────────┘    │
└────────────────┬────────────────────┘
                 │
       ┌─────────┼─────────┐
       ▼         ▼         ▼
   AllSides  Wikipedia   Claude API
   (CSV)     (CSV/JSON)  (Anthropic)
```

### Components and responsibilities

Each component has one clear purpose, a well-defined input/output, and can be tested in isolation.

| Component | Lives in | Purpose | Input → Output |
|---|---|---|---|
| **URL Input UI** | Mobile | Validate + submit URL | User text → submitted URL |
| **Result UI** | Mobile | Render score + drill-down + counter-argument + disagreement | API response JSON → screen |
| **Deep Analysis UI** | Mobile | Triggers and renders debate output | Button tap → debate result |
| **Local History Store** | Mobile (AsyncStorage) | Persist past checks on device | New rating → list of past ratings |
| **Feedback Widget** | Mobile | Capture 👍/👎 + optional comment | User input → POST to backend |
| **Rating Service** | Backend | Orchestrate the pipeline | URL → combined result JSON |
| **Article Extractor** | Backend | Fetch and clean article text | URL → cleaned text + metadata (title, author, date) |
| **Dataset Lookup** | Backend | Find publisher in our datasets | Domain → list of dataset ratings |
| **LLM Analyzer (single)** | Backend | Score article content quality | Article text → content score + reasoning + counter-argument |
| **LLM Analyzer (deep)** | Backend | Multi-agent debate | Article text → skeptic report + advocate report + judge ruling |
| **Cache** | Backend | Avoid re-analyzing recent URLs | URL → cached result (24h TTL) |
| **Rate Limiter** | Backend | Cap per-device usage | Device ID + endpoint → allow/deny |
| **Feedback Store** | Backend | Capture user judgments for future moat | Feedback payload → DB |

Boundary check: each component can be understood without reading the others. Changes to the LLM prompts don't affect the Dataset Lookup. Adding new datasets doesn't change the mobile app.

## 5. Data flow — a single check

1. User pastes URL in mobile app, taps Check.
2. App validates URL format, sends `POST /api/check { url, deviceId }` to backend.
3. Backend Rate Limiter checks: under daily limit for this device? If no → 429.
4. Cache lookup: have we rated this URL in last 24h? If yes → return cached result immediately.
5. In parallel:
   - **Dataset Lookup** by domain → returns ratings from AllSides / Wikipedia / IFCN (or "unknown")
   - **Article Extractor** fetches and cleans the article via Mozilla Readability
6. App receives a **partial result** as soon as dataset lookup returns (~sub-second). UI displays source reputation immediately. (10-second rule: never blank-screen.)
7. Backend feeds extracted article text to **LLM Analyzer (single)** → returns content score, reasoning, and counter-argument.
8. App polls the backend (1s interval) for the completed result and updates UI when ready. Content score + counter-argument view fill in. (Polling chosen over streaming for V1 simplicity; can switch to Server-Sent Events in V2 if latency feels poor.)
9. Result cached in backend; saved to local history on device.
10. User may tap **Deep Analysis** for the same URL → backend runs multi-agent debate, returns extended result. (Costs roughly 3–5× a single check.)
11. User may tap 👍/👎 on the result → POST to backend feedback store.

## 6. Scoring methodology

### Overall score (0–100)

A weighted blend of three sub-scores:

```
Overall = 0.45 × SourceRep + 0.45 × ContentQuality + 0.10 × BiasAdjustment
```

- **SourceRep (0–100):** From dataset aggregation. Higher = more reliable publisher.
- **ContentQuality (0–100):** From LLM analysis of the article itself. Higher = stronger sourcing, less sensationalism, fewer logical issues.
- **BiasAdjustment (0–100):** Derived from the bias scale below. Formula: `100 - (|bias| × 10)`. So center bias (0) → 100; extreme bias (±5) → 50. This is a small penalty for extreme bias (either direction) — bias itself is not "wrong," but extreme bias correlates with selective reporting. Capped at 10% weight.

Output bucket labels (shown to user, not raw numbers alone):

- 80–100: ✅ Highly credible
- 60–79: 🟢 Mostly credible
- 40–59: 🟡 Mixed
- 20–39: 🟠 Questionable
- 0–19: 🔴 Low credibility

### Bias (-5 ↔ +5 scale)

Shown separately from the score. Negative = left, positive = right, 0 = center. Sourced from AllSides where available, otherwise LLM-estimated with a low-confidence marker.

### Confidence levels

Confidence is reported independently:

- ✅ **High** — Publisher in 2+ rating datasets AND article text successfully extracted
- ⚠️ **Medium** — Publisher in 1 dataset, OR article partially extracted (paywall/JS-rendered)
- ❓ **Low** — Unknown publisher AND/OR article text unavailable. Falls back to cheap signals (domain age via WHOIS, HTTPS presence, presence of bylines/dates, contact info). LLM rating is flagged as "based on metadata only."

**Cheap signals (used only when datasets and content are unavailable):**

| Signal | Weight | Why |
|---|---|---|
| Domain age > 2 years | +10 | Older domains less likely to be quick-spin disinfo |
| HTTPS present | +5 | Minimum technical hygiene |
| Byline + date present in extracted metadata | +10 | Editorial accountability signal |
| Listed contact info / about page | +5 | Editorial accountability signal |
| Multiple outbound source links in article | +10 | Sourcing signal |

These add up to a max +40 boost on a baseline of 30 → max 70/100 for unknown sites. Confidence remains Low regardless.

Confidence is computed deterministically (rules, not LLM judgment) so it's consistent across calls.

### Disagreement transparency

When datasets disagree, do NOT average — surface the disagreement:

> AllSides: Lean Left · Wikipedia Perennial: Generally Reliable · IFCN: Not listed
>
> *Datasets agree this publisher is reliable but differ slightly on bias direction.*

The drill-down shows each dataset's verdict with its name and a link to the dataset's methodology page.

### Strongest counter-argument

Every result includes a **counter-argument view** — the most compelling reason to *distrust* a highly-rated article, or *trust* a low-rated one. Generated by the LLM with a system prompt like: "Given this article and its rating, write the strongest possible argument that the rating could be wrong."

Always shown; not buried behind a click. This is a unique differentiator and a media literacy tool.

## 7. Deep Analysis (multi-agent debate)

Opt-in only, triggered by a button. Costs ~3–5× a single check; takes ~10–20 seconds.

Three LLM calls in sequence:

1. **Skeptic agent** — system prompt: "You are a skeptical media analyst. Find every reason to distrust this article. Cite specific evidence." → produces Skeptic Report.
2. **Advocate agent** — system prompt: "You are defending this article's credibility. Find every reason it deserves trust. Cite specific evidence." → produces Advocate Report.
3. **Judge agent** — system prompt: "Weigh these two analyses neutrally. Return a final assessment." → produces final ruling + reasoning.

Result UI shows all three: collapsible Skeptic and Advocate cards, Judge's summary on top.

**Known limitation surfaced in UI:** All three agents use the same model family (Claude) in V1, so they share underlying biases. V2 plans to use mixed model families.

## 8. Data sources for V1

Only freely-licensed sources in V1. License compliance is non-negotiable.

| Dataset | What it provides | License/Access |
|---|---|---|
| **AllSides** | Bias rating (Left ↔ Right), some reliability | Public API with attribution |
| **Wikipedia Perennial Sources** | Editor consensus on reliability | CC BY-SA, scrape with attribution |
| **IFCN signatory list** | Whether a publisher is a certified fact-checker | Public, attributed |

Each dataset is imported as a snapshot into the backend at deploy time (refreshed weekly via scheduled job). Domain matching is done via canonical domain extraction (strip `www.`, handle redirects, lowercase).

## 9. Risk mitigations (legal + reputational)

- **No public list of ratings.** Ratings are only generated on-demand for a URL the user submits. Not crawled, not indexed, not shareable as a permanent URL in V1.
- **Always attributed.** UI never says "we say X." It says "AllSides rates this Lean Left."
- **AI output explicitly framed as AI analysis** with a "may contain errors" disclaimer on every result.
- **Methodology page** documents how scores are computed, datasets used, and known limitations.
- **Limitations page** explicitly tells users what the app cannot do (paywalled articles, breaking news, satire detection, etc.).
- **TOS + Privacy Policy** drafted before public release; lawyer review recommended before App Store submission.
- **Feedback channel** (the 👍/👎 widget) doubles as a correction-request path.

## 10. Caching, rate limiting, cost control

- **Cache:** Backend cache by canonical URL with 24h TTL. Mobile app respects backend cache. Users see a small "cached result — re-check?" hint on cached results.
- **Rate limit per device:** V1 hard cap of 20 single checks + 3 Deep Analyses per device per day. Anonymous device ID generated locally (UUID stored in AsyncStorage), sent in API requests.
- **Backend monthly budget cap:** Configurable monthly LLM spend ceiling. Above the cap, new requests return a friendly "service paused, try tomorrow" message.
- **Architected for future paywalls:** Per-device usage is already tracked, so V2 can introduce tiers without backend rewrite.

## 11. Tech stack

- **Mobile:** Expo / React Native (one codebase ships to iOS + Android; live preview on phone via Expo Go).
- **Backend language:** Node.js (TypeScript). Reasoning: matches React Native ecosystem, fewer concepts for a new-to-coding developer to context-switch between.
- **Backend hosting:** Railway or Render for V1 (simple, generous free tiers, no DevOps required).
- **Database:** SQLite via better-sqlite3 in V1 (single-file, no infra to manage). Easy migration to Postgres later.
- **LLM provider:** Anthropic Claude API for V1.
- **Article extraction:** Mozilla Readability + `node-fetch` with a real User-Agent.
- **Local storage:** React Native AsyncStorage for history and device ID.

## 12. Error handling

Errors are first-class results, not exceptions:

- **URL invalid:** UI catches before submission; helpful message.
- **Article extraction failed:** Result returns with explicit "Article text could not be retrieved" + low confidence + dataset-only rating.
- **LLM API error:** Result returns with dataset rating + "AI analysis unavailable, try again later."
- **Rate limit exceeded:** UI shows time-until-reset, suggests Deep Analysis is the more valuable use of a remaining check.
- **Backend down:** Local history still accessible; clear offline indicator.
- **All retried with exponential backoff before user-facing failure where transient.**

## 13. Testing strategy

- **Unit tests** for each backend component (Dataset Lookup, Article Extractor, scoring math) — pure functions where possible.
- **Integration test** for the full Rating Service pipeline with mocked LLM responses (snapshot test on a curated set of ~20 known articles).
- **Manual test plan** for the mobile app: a fixed list of URLs covering high-credibility (NYT, Reuters), low-credibility (known fake-news sites), unknown sites (small blogs), and edge cases (paywalled, JS-only, very short).
- **LLM regression checks**: when prompts change, re-run the snapshot test set and review diffs before deploying.

## 14. Milestones (suggested build order)

Built in shippable slices so something visible exists from week 1:

1. **M1 — Hello World:** Mobile app paste-URL UI → backend → echo response. Verifies stack end to end.
2. **M2 — Single-LLM rating:** No datasets yet; just send article text to Claude, parse response, show single score. Smallest possible end-to-end credibility check.
3. **M3 — Dataset lookups:** Import AllSides + Wikipedia + IFCN. Backend returns dataset findings alongside LLM result.
4. **M4 — Combined scoring + UI polish:** Compute weighted overall score, drill-down screen, confidence indicators, counter-argument view, disagreement transparency.
5. **M5 — Deep Analysis:** Multi-agent debate behind a button. Result UI for it.
6. **M6 — Caching, rate limits, feedback widget, history.** Production hardening.
7. **M7 — Methodology / Limitations / TOS pages.** App Store prep.

Each milestone is a working app — you can demo M2 to friends, not just M7.

## 15. Future (V2) priorities, in order

1. **Share extension** — appear in the iOS Share Sheet / Android Share Intent. This is where the *real* product is. Distribution flows through the share moment.
2. **Pricing tier:** 5 free / day, $4.99/mo unlimited.
3. **Multi-LLM-family debate** (Claude + GPT) for genuine bias reduction.
4. **Accounts + cross-device sync.**
5. **Paid dataset integration** (MBFC, Ad Fontes) once revenue supports licensing.
6. **Browser extension** desktop companion.

## 16. Glossary

- **Credibility:** The aggregated likelihood an article is accurate, well-sourced, and not misleading. Always uncertain; always attributed.
- **Source reputation:** A publisher-level rating from external datasets.
- **Content quality:** An article-level rating from LLM analysis of the text.
- **Bias:** Political lean of the publisher. Reported separately, lightly weighted in the score.
- **Confidence:** How much trust to place in our rating itself (high/medium/low), computed deterministically.
- **Deep Analysis:** Multi-agent debate mode. Opt-in, more expensive, more transparent reasoning.
