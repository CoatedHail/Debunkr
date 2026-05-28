# M8 — Fact-check pipeline

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Move beyond writing-quality + publisher-reputation scoring to **claim-level verification**. The V1 pipeline can be fooled by a well-written fabrication from an unknown publisher because content quality is judged by an LLM with no grounding. M8 adds three external evidence sources (Google Fact Check Tools API, Brave Search filtered to Tier-1 publishers, Wikipedia entity check), an LLM-driven claim extractor, and an evidence aggregator. Output: a new **Evidence card** under the Deep Analysis section showing verdict (corroborated / contradicted / uncorroborated / mixed), citations with snippets, and an evidence-derived score delta applied to the overall.

**Why behind Deep Analysis CTA, not single-check:** adds ~3 LLM calls + ~3 API calls + ~6s latency + ~$0.01 per run. Single-check must stay fast and cheap. Deep Analysis users have already opted into a slower, more thorough pass.

**Architecture:**

- New service `claim-extractor.ts` — one Claude call. Returns up to 3 structured factual claims from the article: `{text, type: 'event'|'attribution'|'statistic'|'entity', namedEntities[]}`. Refuses opinion/forward-looking statements.
- New service `fact-check-api.ts` — wraps Google Fact Check Tools API (`factchecktools.googleapis.com/v1alpha1/claims:search`). Free, key-gated. Returns normalized `{claimText, reviewerName, rating, url, datePublished}` array.
- New service `web-search.ts` — wraps Brave Search API (`api.search.brave.com/res/v1/web/search`). Free tier 2k req/mo. Returns top 10 results, then filtered through `tier1-sources.ts` allowlist to Tier-1-only.
- New service `wikipedia-check.ts` — for each named entity in claim, GET `en.wikipedia.org/api/rest_v1/page/summary/<entity>`. Returns `{exists: boolean, lastEditDays?: number, isDisambiguation?: boolean}`.
- New service `tier1-sources.ts` + dataset `tier1-sources.csv` — hand-curated ~30 publishers (Reuters, AP, BBC, NYT, WaPo, Guardian, AFP, NPR, Bloomberg, FT, WSJ, Economist, NHK, ABC, CBS, NBC, PBS, etc.) for SERP filtering. Subset of curated-reliability.csv tier=high.
- New service `evidence-aggregator.ts` — second Claude call. Given the article + extracted claims + all evidence (fact-check matches, filtered SERP results, Wikipedia entity status), returns `{verdict, confidence, citations[], scoreDelta, reasoning}`. Strict JSON schema enforced.
- New service `fact-checker.ts` — orchestrator. Single entry `factCheck(article, articleText)` runs extractor → fan-out to 3 evidence services in parallel → aggregator → returns `EvidenceResult`.
- Modified `deep-analyzer.ts` — runs fact-check IN PARALLEL with existing Skeptic + Advocate calls (independent), then passes evidence summary into Judge prompt so Judge can weigh evidence alongside debate. Judge becomes the final synthesizer.
- Modified `scoring.ts` — new function `applyEvidenceDelta(overall, evidence)` clamps `scoreDelta` impact (-30 to +10) and applies floor at 5, ceiling at 95.
- New prompt files: `claim-extraction.ts`, `evidence-aggregation.ts`. Existing `deep-analysis.ts` Judge prompt updated to consume evidence.
- Mobile: new `EvidenceCard` component under Deep Analysis section above Skeptic/Advocate. Verdict badge (color-coded), top 3 citations with publisher chip + snippet + "supports" / "contradicts" tag, expandable reasoning, "We checked these claims: …" preface.
- Methodology screen: new section explaining the fact-check sources, limitations (English-only, US-biased fact-check coverage, can't verify breaking news < 24h old, fabricated entities slip through if not on Wikipedia).
- Limitations screen: explicitly call out fact-check failure modes.

**Tech stack additions:** No new npm deps for backend — all three external services hit via `fetch` (Node 22 native). Mobile: none.

**Cost & latency impact:**
- Deep Analysis: $0.015 → ~$0.025 (+$0.01)
- Deep Analysis latency: ~6s → ~10s (fact-check runs parallel with Skeptic+Advocate so net slowdown bounded by max of the two paths)
- Single check: unchanged ($0.004, ~3s)
- Rate-limit unchanged (3 Deep/day/device already gates this)
- Cost cap unchanged (MONTHLY_BUDGET_USD covers all Anthropic spend, including new extractor+aggregator calls)

**Out of scope (deferred to M9 or post-V1):**
- Semantic similarity to news corpus (needs vector DB + ongoing scrape)
- Multi-language fact-check (Google API supports it but UI/prompt work non-trivial)
- Image/video reverse search (TinEye / Google Lens) for AI-generated media
- Real-time news API (NewsAPI, GDELT) — Brave SERP covers headline events already
- Caching evidence results separately (cache.ts already caches the whole JobResult — sufficient)
- User-submitted counter-evidence (V2 feature)

---

## Prerequisites

- [ ] **P0a:** M7 code-track DONE. `cd backend && npm test` → 138 passing across 19 suites.
- [ ] **P0b:** On new branch `m8-fact-check-pipeline`.
- [ ] **P0c:** Google Fact Check Tools API key obtained from Google Cloud Console (free, requires a GCP project + enable "Fact Check Tools API"). Add to `backend/.env` as `GOOGLE_FACT_CHECK_API_KEY=`.
- [ ] **P0d:** Brave Search API key obtained from `api.search.brave.com` (free tier, no card). Add to `backend/.env` as `BRAVE_SEARCH_API_KEY=`.
- [ ] **P0e:** Both keys also added to `backend/.env.example` as empty entries with comments explaining where to get them.

---

## Task 1: Tier-1 source allowlist

**Files:** `backend/src/data/tier1-sources.csv`, `backend/src/services/tier1-sources.ts`, `backend/tests/tier1-sources.test.ts`.

- [ ] **Step 1.1:** Create `backend/src/data/tier1-sources.csv`. Format: `domain` (one column). Seed list (~30): reuters.com, apnews.com, bbc.com, bbc.co.uk, nytimes.com, washingtonpost.com, theguardian.com, afp.com, npr.org, bloomberg.com, ft.com, wsj.com, economist.com, nhk.or.jp, abcnews.go.com, cbsnews.com, nbcnews.com, pbs.org, propublica.org, theatlantic.com, newyorker.com, time.com, axios.com, politico.com, foreignpolicy.com, science.org, nature.com, nationalgeographic.com, smithsonianmag.com, latimes.com.

- [ ] **Step 1.2:** Create `backend/src/services/tier1-sources.ts`. Exports `loadTier1Domains(): Set<string>` (loads CSV once, caches) and `isTier1(domain: string): boolean` using `canonicalDomain()` from existing `canonical-domain.ts`.

- [ ] **Step 1.3:** Test that all seed domains return true, `example.com` returns false, subdomains (e.g. `www.reuters.com`, `business.reuters.com`) normalize correctly.

- [ ] **Step 1.4:** Run `cd backend && npm test`. New suite passes; existing suites still pass.

---

## Task 2: Claim extractor

**Files:** `backend/src/prompts/claim-extraction.ts`, `backend/src/services/claim-extractor.ts`, `backend/src/services/claim-extractor-stub.ts`, `backend/tests/claim-extractor.test.ts`.

- [ ] **Step 2.1:** `backend/src/prompts/claim-extraction.ts` — system prompt instructs Claude to extract up to 3 *verifiable factual claims* (not opinions, not forecasts, not rhetorical questions). Each claim:
  - `text`: verbatim or close paraphrase, ≤200 chars
  - `type`: `event` | `attribution` | `statistic` | `entity`
  - `namedEntities`: array of proper nouns mentioned in the claim (≤5)
  - `checkable`: boolean — false if the claim is too vague to verify

  Output strict JSON: `{claims: [...]}`. Use delimiter pattern `<<<ARTICLE_START>>> ... <<<ARTICLE_END>>>` matching existing `content-analysis.ts`. Strip control chars + truncate to 12k chars same as existing.

- [ ] **Step 2.2:** `backend/src/services/claim-extractor.ts` exports `extractClaims(articleText: string): Promise<{claims: Claim[], usage: {input_tokens, output_tokens}}>`. Calls Anthropic SDK with `claude-haiku-4-5`, `max_tokens: 1024`, `temperature: 0`. Parses JSON; on parse failure throws `ClaimExtractionError`.

- [ ] **Step 2.3:** `backend/src/services/claim-extractor-stub.ts` returns a canned 2-claim fixture so stub-mode dev works. Selected via existing `hasAnthropicKey()` gate in env config.

- [ ] **Step 2.4:** Tests with mocked Anthropic client:
  - parses valid JSON correctly
  - filters out `checkable: false` entries
  - throws on malformed JSON
  - truncates oversized input
  - stub returns expected canned fixture shape

- [ ] **Step 2.5:** `npm test` green.

---

## Task 3: Google Fact Check Tools API client

**Files:** `backend/src/services/fact-check-api.ts`, `backend/tests/fact-check-api.test.ts`.

- [ ] **Step 3.1:** `fact-check-api.ts` exports `searchFactChecks(query: string): Promise<FactCheckResult[]>` where:

  ```ts
  export type FactCheckResult = {
    claimText: string;
    reviewerName: string;       // e.g. "PolitiFact"
    rating: string;             // e.g. "False", "Mostly True"
    normalizedRating: 'true' | 'mostly-true' | 'mixed' | 'mostly-false' | 'false' | 'unknown';
    reviewUrl: string;
    datePublished?: string;
  };
  ```

  Fetch: `GET https://factchecktools.googleapis.com/v1alpha1/claims:search?query=<encoded>&languageCode=en&pageSize=5&key=<KEY>`. 5s timeout. On 404 or empty result, return `[]`. On 401/403 throw `FactCheckAuthError`. On 5xx return `[]` (degrade gracefully). On network/timeout return `[]`.

- [ ] **Step 3.2:** Normalization function maps the long-tail of reviewer rating strings ("False", "Pants on Fire", "Four Pinocchios", "Mostly False", "Misleading", "True", "Correct attribution") into the 6 normalized buckets. Unknown ratings → `'unknown'`. Keep a small lookup map; lowercase + trim before match.

- [ ] **Step 3.3:** Tests:
  - happy path with mocked fetch returning fixture JSON
  - empty `claims` array → empty result
  - 401 throws `FactCheckAuthError`
  - 503 returns `[]`
  - timeout returns `[]`
  - normalization covers all 6 buckets + `unknown` fallback

- [ ] **Step 3.4:** `npm test` green.

---

## Task 4: Brave Search client + Tier-1 filter

**Files:** `backend/src/services/web-search.ts`, `backend/tests/web-search.test.ts`.

- [ ] **Step 4.1:** `web-search.ts` exports `searchWeb(query: string): Promise<SearchHit[]>`:

  ```ts
  export type SearchHit = {
    url: string;
    domain: string;
    title: string;
    snippet: string;
    publishedDate?: string;
    isTier1: boolean;
  };
  ```

  Fetch: `GET https://api.search.brave.com/res/v1/web/search?q=<encoded>&count=10&safesearch=moderate` with header `X-Subscription-Token: <BRAVE_SEARCH_API_KEY>`. 5s timeout. Same degrade-gracefully pattern as Task 3.

- [ ] **Step 4.2:** For each result, compute `domain` via `canonicalDomain()`, set `isTier1` via `isTier1()` from Task 1. Return ALL results (caller decides whether to filter), but include the flag.

- [ ] **Step 4.3:** Tests with mocked fetch:
  - parses Brave response into normalized `SearchHit[]`
  - tier1 flag set correctly per fixture
  - 429 (rate-limited) returns `[]`
  - missing API key throws config error at module init

---

## Task 5: Wikipedia entity check

**Files:** `backend/src/services/wikipedia-check.ts`, `backend/tests/wikipedia-check.test.ts`.

- [ ] **Step 5.1:** Exports `checkEntity(name: string): Promise<EntityCheck>`:

  ```ts
  export type EntityCheck = {
    name: string;
    exists: boolean;
    isDisambiguation: boolean;
    extract?: string;            // first paragraph if exists
    pageUrl?: string;
  };
  ```

  Fetch: `GET https://en.wikipedia.org/api/rest_v1/page/summary/<URL-encoded name>`. 3s timeout. 404 → `{name, exists: false, isDisambiguation: false}`. 200 with `type: 'disambiguation'` → `exists: true, isDisambiguation: true`. Otherwise → `exists: true, extract, pageUrl`.

- [ ] **Step 5.2:** Exports `checkEntities(names: string[]): Promise<EntityCheck[]>`. Parallel fan-out via `Promise.all`. Dedup case-insensitively before fetch. Cap at 5 entities to avoid runaway Wikipedia load.

- [ ] **Step 5.3:** Tests:
  - existing entity (mocked "Joe Biden") → exists true with extract
  - 404 → exists false
  - disambiguation page → isDisambiguation true
  - dedup case-insensitive
  - cap at 5

- [ ] **Step 5.4:** `npm test` green.

---

## Task 6: Evidence aggregator

**Files:** `backend/src/prompts/evidence-aggregation.ts`, `backend/src/services/evidence-aggregator.ts`, `backend/src/services/evidence-aggregator-stub.ts`, `backend/tests/evidence-aggregator.test.ts`.

- [ ] **Step 6.1:** `evidence-aggregation.ts` system prompt: Claude is given the article text, the extracted claims, the fact-check API matches, the SERP results (split into Tier-1 vs non-Tier-1), and the Wikipedia entity statuses. Job is to synthesize:

  ```ts
  export type EvidenceResult = {
    verdict: 'corroborated' | 'contradicted' | 'uncorroborated' | 'mixed';
    confidence: 'high' | 'medium' | 'low';
    citations: Citation[];       // up to 5
    scoreDelta: number;          // -30 to +10
    reasoning: string;           // <=400 chars, plain-English
  };

  export type Citation = {
    source: string;              // e.g. "Reuters", "PolitiFact"
    url: string;
    snippet: string;             // <=200 chars
    supports: 'agrees' | 'contradicts' | 'context';
  };
  ```

  Prompt constrains scoreDelta logic:
  - `-30` if contradicted by Tier-1 source or rated False by fact-checker
  - `-15` if uncorroborated AND named entities don't exist on Wikipedia
  - `-5` uncorroborated (no Tier-1 coverage found, but no contradiction)
  - `0` mixed or low-confidence
  - `+5` corroborated by 1 Tier-1 source
  - `+10` corroborated by 2+ Tier-1 sources

  Strict JSON output. Delimiter + truncate same as other prompts.

- [ ] **Step 6.2:** `evidence-aggregator.ts` exports `aggregateEvidence(article, claims, factChecks, searchHits, entityChecks): Promise<{evidence: EvidenceResult, usage}>`. Anthropic SDK call same model + temp=0. Parses JSON; on parse failure or invalid `verdict`/`scoreDelta` range, returns safe fallback `{verdict: 'uncorroborated', confidence: 'low', citations: [], scoreDelta: 0, reasoning: 'Aggregator failed to parse evidence'}`.

- [ ] **Step 6.3:** Stub variant returns canned fixture.

- [ ] **Step 6.4:** Tests:
  - happy path produces well-formed result
  - bad LLM output → safe fallback (no exception bubbles)
  - scoreDelta clamped to [-30, +10] even if model returns out-of-range
  - citations capped at 5
  - reasoning truncated to 400 chars

- [ ] **Step 6.5:** `npm test` green.

---

## Task 7: Fact-checker orchestrator

**Files:** `backend/src/services/fact-checker.ts`, `backend/tests/fact-checker.test.ts`.

- [ ] **Step 7.1:** Exports `runFactCheck(articleText: string): Promise<{evidence: EvidenceResult, usage}>`:

  1. `claims = await extractClaims(articleText)` (1 LLM call)
  2. If `claims.length === 0` → short-circuit with `{verdict: 'uncorroborated', confidence: 'low', scoreDelta: 0, ...}` (no further API calls, no extra LLM cost)
  3. Build query strings per claim (concat claim text + top entity name)
  4. Parallel fan-out via `Promise.all`:
     - For each claim: `searchFactChecks(query)` (max 3 calls)
     - For each claim: `searchWeb(query)` (max 3 calls)
     - All unique named entities (deduped, capped at 5): `checkEntities(entities)` (1 call inside, fans out to 5 max)
  5. `aggregateEvidence(...)` (1 LLM call)
  6. Sum usage tokens across both LLM calls; return both.

- [ ] **Step 7.2:** Wraps each fan-out branch in its own try/catch so a single external API failure doesn't kill the whole pipeline. Failed branch contributes empty evidence; aggregator still runs.

- [ ] **Step 7.3:** Tests with all four downstream services mocked:
  - happy path returns full evidence
  - claim-extractor returns 0 → short-circuit, no other services called
  - fact-check API throws → other branches still complete, aggregator runs without that branch
  - SERP empty → aggregator runs with empty SERP
  - all branches fail → safe fallback

- [ ] **Step 7.4:** `npm test` green.

---

## Task 8: Wire into Deep Analysis

**Files:** Modify `backend/src/services/deep-analyzer.ts`, `backend/src/prompts/deep-analysis.ts`, `backend/src/types/api.ts`, `backend/src/services/scoring.ts`, `backend/src/routes/check.ts`. Update `backend/tests/deep-analyzer.test.ts`.

- [ ] **Step 8.1:** Extend `JobResult.deepAnalysis` type:

  ```ts
  deepAnalysis?: {
    skeptic: AgentTurn;
    advocate: AgentTurn;
    judge: AgentTurn;
    evidence?: EvidenceResult;   // NEW
  };
  ```

- [ ] **Step 8.2:** `deep-analyzer.ts`: launch `runFactCheck()` in parallel with Skeptic + Advocate. Once all three resolve, pass evidence summary INTO Judge prompt user message (new section: `<<<EVIDENCE>>> ... <<<EVIDENCE_END>>>`). Judge weighs evidence verdict + scoreDelta in final synthesis. Update Judge system prompt to instruct using evidence when present.

- [ ] **Step 8.3:** `scoring.ts`: new `applyEvidenceDelta(overall: number, evidence?: EvidenceResult): number`. If evidence missing, return overall unchanged. Else `clamp(overall + evidence.scoreDelta, 5, 95)`. Update `bucketLabel` to reflect new score.

- [ ] **Step 8.4:** `routes/check.ts` Deep endpoint: after Deep finishes, call `applyEvidenceDelta(currentOverall, evidence)` and update the job's `overall`. Persist evidence into job result so polling client sees it.

- [ ] **Step 8.5:** Record evidence-related token usage to cost-tracker (claim extractor + aggregator). Two new `recordCost()` calls in the orchestrator path.

- [ ] **Step 8.6:** Update existing Deep Analysis tests:
  - mock fact-checker to return canned evidence; verify evidence reaches `JobResult`
  - verify `overall` shifts when scoreDelta non-zero
  - verify Judge prompt receives evidence section
  - verify cost-tracker records both new LLM calls
  - verify stub-mode end-to-end works

- [ ] **Step 8.7:** `npm test` green. Manual integration test with real keys end-to-end (Brave + Google Fact Check + Wikipedia + Claude) on a known-fabricated URL (e.g. a stale Onion article) and a Tier-1 URL.

---

## Task 9: Mobile — EvidenceCard

**Files:** `mobile/src/types/api.ts` (mirror new types), `mobile/src/screens/CheckScreen.tsx`, new `mobile/src/components/EvidenceCard.tsx`.

- [ ] **Step 9.1:** Mirror `EvidenceResult` and `Citation` types in `mobile/src/types/api.ts`.

- [ ] **Step 9.2:** Build `EvidenceCard.tsx`:
  - Verdict badge: green (corroborated) / red (contradicted) / yellow (mixed) / gray (uncorroborated)
  - One-line confidence + reasoning preview
  - Up to 3 citations rendered as rows: publisher chip + snippet + supports tag (✓ agrees / ✗ contradicts / · context)
  - Expandable for full reasoning + remaining citations
  - "Tap to open source" → `Linking.openURL(citation.url)`

- [ ] **Step 9.3:** In `CheckScreen.tsx`, render `<EvidenceCard evidence={result.deepAnalysis.evidence} />` ABOVE the existing Skeptic/Advocate cards inside the Deep Analysis section. Render only if `result.deepAnalysis?.evidence` present.

- [ ] **Step 9.4:** Manual web verify: stub-mode Deep Analysis renders fake evidence card; real-key Deep Analysis renders real evidence card with working citation links.

---

## Task 10: Methodology + Limitations copy

**Files:** `mobile/src/screens/MethodologyScreen.tsx`, `mobile/src/screens/LimitationsScreen.tsx`.

- [ ] **Step 10.1:** Methodology — new section "How we fact-check claims (Deep Analysis only)":
  - We extract up to 3 verifiable claims from the article using an LLM
  - We search the Google Fact Check Tools API (PolitiFact, Snopes, AFP, Reuters Fact Check, others)
  - We search the web via Brave Search and filter to a Tier-1 publisher allowlist (Reuters, AP, BBC, NYT, etc.)
  - We check named entities against Wikipedia
  - A second LLM call synthesizes the evidence into a verdict and adjusts the overall score by ±30 points max

- [ ] **Step 10.2:** Limitations — new bullets:
  - English-only fact-check coverage; non-English articles checked weakly
  - Breaking news (<24h) often has no fact-check yet — verdict will be "uncorroborated"
  - Fabricated entities slip through if they're not yet on Wikipedia
  - Tier-1 allowlist is hand-curated and US/UK-biased
  - Aggregator LLM can hallucinate citations — we cap citations to 5 and require URLs come from actual search results

---

## Task 11: Eval suite additions

**Files:** `backend/tests/evals/credibility.jsonl`, `backend/tests/evals/run.ts`.

- [ ] **Step 11.1:** Add 5 new fixtures to `credibility.jsonl` covering fact-check pipeline:
  - Known-false claim with fact-check coverage (expect contradicted, scoreDelta ≤ -20)
  - Tier-1-corroborated breaking news (expect corroborated, scoreDelta ≥ +5)
  - Obscure but factually correct article from small site (expect uncorroborated, scoreDelta in [-10, 0])
  - Fabricated-entity article (made-up senator or org) (expect contradicted or uncorroborated low confidence)
  - Mixed: partly true, partly false (expect mixed)

- [ ] **Step 11.2:** Update `run.ts` to assert `evidence.verdict` and `evidence.scoreDelta` ranges per fixture.

- [ ] **Step 11.3:** Manual run (`npm run eval` with real keys) — log result, do not gate CI on eval pass (fixtures rot).

---

## Task 12: Final verify + tag

- [ ] **Step 12.1:** `cd backend && npm test` — all suites green (expected ~155+ tests across ~24 suites).
- [ ] **Step 12.2:** Boot backend, boot mobile web, manually verify:
  - Single check still works in <4s
  - Deep Analysis now shows Evidence card with real citations
  - Score shifts visibly when verdict is contradicted vs corroborated
  - Tap citation opens external URL
  - Cost tracker shows the extra calls in `cost-events.jsonl`
- [ ] **Step 12.3:** Commit final pass + tag `m8-fact-check-pipeline`.
- [ ] **Step 12.4:** Write `docs/superpowers/notes/m8-retro.md` covering what worked, what surprised, scope changes, deferred items.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Brave SERP rate limit (2k/mo free) hits ceiling | Deep Analysis is already capped 3/day/device. 3 claims × 1 SERP call/claim = 9 SERP/Deep. 2k / 9 ≈ 222 Deep Analyses/month free. Above that, fact-check branch degrades gracefully to empty. Upgrade plan or move to cheaper alt (DuckDuckGo HTML scrape, SerpAPI) when hit. |
| Google Fact Check API surface narrow | Coverage is uneven (US-biased, English-dominant). Mitigated by combining with SERP + Wikipedia; aggregator weighs evidence by source, not count. |
| Aggregator hallucinates citations | Prompt instructs URLs MUST come from the supplied search results. Test: assert all returned `citation.url` values appear in the fed search results. Reject hallucinated URLs at parse time. |
| Latency creep on Deep Analysis | Fan out parallel with Skeptic+Advocate. Net Deep latency dominated by Judge waiting for slowest branch. Budget: 10s p50. Monitor in production via timing logs. |
| Score delta too punitive on niche-but-correct articles | `-5` for uncorroborated is intentionally mild; bigger penalties require explicit contradiction or fabrication signal. Tune via eval suite. |
| New keys leak | Both keys added to `.env`, `.env.example` has empty placeholders only, `.env` already gitignored. Same posture as `ANTHROPIC_API_KEY`. |

---

## Verification checklist (gate before tagging)

- [ ] All new services have unit tests with mocked external APIs
- [ ] Fact-checker handles each external failure independently (Google down ≠ pipeline down)
- [ ] Aggregator parses bad LLM output without crashing
- [ ] Citation URLs validated against supplied search results (no hallucinated URLs)
- [ ] scoreDelta clamped to [-30, +10] at type-system level
- [ ] Cost tracker records claim-extraction + aggregator token usage
- [ ] Mobile EvidenceCard renders for both stub-mode and real-key
- [ ] Methodology + Limitations updated and pushed to mobile screens
- [ ] All 138 prior tests still pass alongside new suites
- [ ] Real-key end-to-end run on at least 3 fixture URLs (known-false, Tier-1-true, obscure-true)
