# M7 — Launch prep

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development for the code tasks. The external-ops tasks (developer accounts, lawyer, store submissions) are user-driven and tracked as a checklist; no agent action.

**Goal:** Take V1 from "works on Mac in real Claude mode" to "submittable to App Store + Play Store." Two tracks running in parallel:

- **Code track** — Postgres migration, final Methodology/Limitations/TOS copy, app icon + splash + assets cleanup, env-driven `API_BASE_URL` for production, LLM eval suite (small), Maestro smoke flow.
- **Ops track** (user-driven, $$ + time) — Apple Developer Program ($99/yr), Google Play Console ($25), EAS Build pipeline, pick backend host + Postgres URL, lawyer review (gate), prepare store listings, screenshots, deploy, submit.

This plan covers the code track in dispatched subagent tasks. The ops track is a user checklist.

**Out of scope (post-V1):**
- WHOIS domain-age signal
- Outbound-link count signal
- Multi-LLM-family Deep Analysis (Claude + GPT)
- Share extension (V2 strategic priority — separate milestone after V1 ships)
- Accounts + cross-device sync
- Paid dataset integration (MBFC, Ad Fontes, NewsGuard)

---

## Code track

### Task 1: Postgres migration

**Files:**
- Add `pg` to deps if not yet (M6 plan had this; verify)
- Create `backend/src/db/schema.sql` (or extend existing)
- Create `backend/src/db/pool.ts`, `backend/src/db/migrate.ts`
- Replace `backend/src/services/job-store.ts` with Postgres-backed version
- Migrate `cost-tracker.ts` from JSONL → Postgres `cost_events` table
- Migrate `feedback-store.ts` from JSONL → Postgres `feedback_events` table
- Move `articleTextByJob` Map (in `routes/check.ts`) to a `job_article_text` table OR keep in-memory (acceptable since Deep Analysis happens minutes after initial check, before any restart)
- All existing tests migrate to require a Postgres connection

Prereq: working local Postgres (fix the broken install, use Docker, or use a Supabase free tier DATABASE_URL).

**This is the same Task 1+2+3 as the original M6 plan deferred — execute now.**

### Task 2: Methodology + Limitations + TOS final wording

**Files:**
- Replace `mobile/src/screens/MethodologyScreen.tsx` (remove all "STUB" markers, land final wording)
- Replace `mobile/src/screens/LimitationsScreen.tsx` (same)
- Create `mobile/src/screens/TosScreen.tsx`
- Create `mobile/src/screens/PrivacyScreen.tsx`
- Update `mobile/App.tsx` router for the new screens
- Wire links to TOS + Privacy from result screen footer

Drafting prompt: model writes final copy that:
- Frames ratings as "according to data sources X, Y, Z" not "we say"
- Explicit AI disclaimer on every result
- Methodology page details the exact formula + data sources + tier definitions + cheap-signals math
- Limitations page is honest: paywalls, satire, opinion vs reporting, AI hallucination, no domain-age yet
- TOS covers user conduct, opinion-not-fact framing, no liability, dispute process
- Privacy covers: device ID (anonymous), IP (rate limit only), feedback (anonymous), no PII

**Lawyer reviews after this** — drafting is starting point, not final.

### Task 3: App icon + splash + visual assets

**Files:**
- Replace `mobile/assets/icon.png` (1024×1024) with branded icon
- Replace `mobile/assets/splash-icon.png`
- Replace `mobile/assets/favicon.png`
- Update `mobile/app.json` metadata (name, icon background color, splash bg)

Don't have a designer? Use Anthropic Console (or Midjourney / Stable Diffusion) for a "checkmark + shield + magnifying glass" credibility logo. Brand color: blue (#2563eb, the existing button color).

Alternative: ship V1 with the default Expo icon + a clean wordmark; iterate post-launch.

### Task 4: Production API_BASE_URL via env

**Files:**
- Replace `mobile/src/config.ts` with EAS-config-driven base URL
- Add `mobile/eas.json` with production/staging configs
- Document the EAS env-var system

```ts
// config.ts pattern:
import Constants from 'expo-constants';

const isDev = __DEV__;
export const API_BASE_URL =
  Constants.expoConfig?.extra?.apiBaseUrl
  ?? (isDev ? 'http://192.168.50.176:4000' : 'https://example.com'); // placeholder prod URL
```

Where EAS-driven `extra.apiBaseUrl` lives in `app.json` per-build:
```json
{
  "expo": {
    ...,
    "extra": {
      "apiBaseUrl": "https://YOUR-PROD-BACKEND.up.railway.app"
    }
  }
}
```

### Task 5: LLM eval suite (small, ~10 fixtures)

**Files:**
- Create `backend/tests/evals/credibility.jsonl` with ~10 known articles + expected score ranges
- Create `backend/tests/evals/run.ts` (separate script, not part of `npm test`)
- Add `npm run eval` script

Each row: `{url, expectedScoreRange: [min,max], expectedBucket, notes}`. Aim 3 high-cred, 3 low-cred, 2 unknown, 2 edge (paywall, satire).

When prompts change, dev runs `npm run eval` against real Claude. Failures gate the prompt change.

### Task 6: Maestro mobile smoke flow (skip if no time)

**Files:**
- Create `.maestro/smoke.yaml` — single flow: paste URL, see score, tap counter-arg, tap feedback 👍, tap back to home

Run on iOS Simulator OR Android Emulator. Verify that the basic flow rendering doesn't regress when bundles change.

---

## Ops track (user checklist — drive these yourself)

### A. Apple side

- [ ] Enroll Apple Developer Program ($99/year, ~24h approval)
- [ ] Create App ID in Apple Developer portal: `com.yourname.credibilitycheck`
- [ ] Create app in App Store Connect (name: "Credibility Check")
- [ ] Generate App Store certificates + provisioning profile (EAS does this via `eas credentials`)
- [ ] App Store metadata:
  - [ ] App name (≤30 chars): "Credibility Check"
  - [ ] Subtitle (≤30 chars): e.g., "AI media literacy"
  - [ ] Keywords (≤100 chars): media, news, credibility, fact check, AI
  - [ ] Description (long-form)
  - [ ] Privacy Policy URL (public-facing)
  - [ ] Support URL
  - [ ] Marketing URL (optional)
- [ ] Screenshots:
  - [ ] iPhone 6.7" (3 minimum): paste-URL, result with score+publisher, Deep Analysis result
  - [ ] iPhone 6.5" (3 minimum, can reuse)
  - [ ] iPad 12.9" (only if supporting iPad)
- [ ] App preview video (optional, 15-30s)
- [ ] Privacy nutrition labels: declare deviceId (anonymous), IP (operational), feedback (anonymous), URLs submitted (not stored beyond cache TTL).
- [ ] Age rating questionnaire
- [ ] Pricing: Free
- [ ] App review notes: explain the methodology + that ratings are AI/dataset-aggregated opinion. Anticipate questions about editorial responsibility — include link to Methodology + Limitations pages inside app.

### B. Google side

- [ ] Sign up for Google Play Console ($25 one-time)
- [ ] Create app: "Credibility Check"
- [ ] Generate signed AAB via `eas build --platform android --profile production`
- [ ] Content rating questionnaire
- [ ] Target audience + content
- [ ] Data safety form
- [ ] Store listing (similar to App Store: short + long description, screenshots, icon, feature graphic)

### C. EAS Build pipeline

- [ ] Install EAS CLI: `npm install -g eas-cli`
- [ ] `eas login` (uses your Expo account)
- [ ] In `mobile/`: `eas build:configure`
- [ ] Build production iOS: `eas build --platform ios --profile production`
- [ ] Build production Android: `eas build --platform android --profile production`
- [ ] First-time signing: EAS prompts to generate certificates (`eas credentials`)
- [ ] OTA channel: `eas update:configure` and use `eas update --branch production` for JS-only changes (no native = no resubmission)

### D. Backend deploy

- [ ] Pick host: **Railway** (recommended) or Render
- [ ] Create project, add Postgres add-on, set env vars:
  - `ANTHROPIC_API_KEY`
  - `ANTHROPIC_MODEL=claude-haiku-4-5`
  - `MONTHLY_BUDGET_USD=10` (or whatever)
  - `DATABASE_URL` (auto-populated by host)
  - `NODE_ENV=production`
- [ ] Deploy from git: connect repo, set root directory to `backend/`, deploy command `npm install && npm start`
- [ ] Get the public backend URL (e.g., `https://credibility-check-backend.up.railway.app`)
- [ ] Update mobile `app.json` `extra.apiBaseUrl` with this URL
- [ ] Rebuild mobile with EAS
- [ ] Smoke-test production: hit `/health`, submit a URL via the production app

### E. Legal (gate)

- [ ] Hire a lawyer for 1-hour review of TOS + Privacy + Methodology + actual app behavior. Budget $500–$1500.
- [ ] Common questions to be ready for:
  - "What if a publisher claims defamation?" (per-article on-demand only, no public list, always attributed, lawyer-approved disclaimers in TOS)
  - "What user data do you collect?" (deviceId UUID + IP for rate limit only; no PII)
  - "Where does the analysis happen?" (your backend; Anthropic API per call; no training on user inputs per Anthropic's data policy)
  - "What's the dispute process?" (Feedback widget + a documented support email)
- [ ] Lawyer signs off → submit.

### F. Pre-flight

- [ ] Test the full flow on real iPhone + real Android via Expo Go
- [ ] Manually verify: paste high-cred URL, low-cred URL, unknown publisher, paywalled URL. Score makes sense in all 4.
- [ ] Verify cost cap trips (set `MONTHLY_BUDGET_USD=0.001` temporarily, hit it, restore)
- [ ] Verify SSRF blocks (paste `http://localhost/admin` on production — should reject)
- [ ] Verify rate limit (script 21 single checks against production)
- [ ] Verify feedback widget — open production `feedback-events.jsonl` (or `feedback_events` table) and see your test row
- [ ] Verify Deep Analysis with real Claude on production

### G. Submit

- [ ] Submit to App Store via App Store Connect: select build, fill metadata, submit for review
- [ ] Submit to Play Store via Play Console: create release, attach AAB, submit
- [ ] Expect 1-3 round of rejections per spec §15 — anticipate questions about editorial responsibility, age rating, content moderation
- [ ] When approved → release to public

---

## Self-Review checklist (run before any external sharing)

- [ ] App ships as "Credibility Check," NOT "Fake News Detector" (spec §9)
- [ ] No public list of rated sites anywhere (spec §9)
- [ ] All ratings attributed to source ("AllSides rates Lean Left", "Wikipedia editors rate Generally Reliable") (spec §9)
- [ ] "AI-generated. May contain errors" disclaimer on every result
- [ ] Methodology + Limitations pages accessible from every result
- [ ] TOS + Privacy linked from in-app + on App Store listing
- [ ] Lawyer review complete (gate)
- [ ] Rate limit + cost cap + SSRF guard verified on production
- [ ] EAS Build pipeline produces signed iOS + Android artifacts
- [ ] Feedback widget connected to a real address you check

---

## What ships in V1 (recap from §3 of spec)

- ✅ Combined credibility score (0–100) with bucket label
- ✅ Source reputation from curated Wikipedia consensus + IFCN signatories
- ✅ Cheap-signals fallback for unknown publishers
- ✅ AI content-quality score + AI reasoning
- ✅ AI bias estimate (-5..+5)
- ✅ AI counter-argument (always shown)
- ✅ Deep Analysis multi-agent debate (opt-in)
- ✅ Confidence indicator (deterministic)
- ✅ Methodology + Limitations + TOS + Privacy in-app
- ✅ Feedback widget (👍/👎 + optional comment)
- ✅ Per-device + per-IP rate limit
- ✅ Monthly cost circuit-breaker
- ✅ SSRF guard
- ✅ Postgres-backed storage
- ✅ iOS + Android via EAS Build
- ✅ Backend deployed on Railway/Render

---

## What V2 brings (post-launch)

1. **Share extension** (iOS Share Sheet + Android Share Intent) — distribution priority
2. Pricing tier: 5 free/day, $4.99/mo unlimited
3. Multi-LLM-family Deep Analysis (Claude + GPT)
4. Accounts + cross-device sync
5. Paid dataset integration (MBFC, Ad Fontes)
6. Browser extension desktop companion
7. SSE / long-polling perf optimization
8. Community-contributable curated reliability list
