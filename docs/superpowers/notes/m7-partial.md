# M7 — Launch prep (PARTIAL)

**Status:** code track partially complete; ops track is your responsibility.
**Tag:** `v1.0.0-code-complete` (NOT `m7-launch-prep` since M7 is not finished — ops track outstanding)

## Code track status

| Task | Status | Notes |
|---|---|---|
| T1: Postgres migration | ❌ DEFERRED | Local Postgres broken. Pick host first (Railway/Render), get DATABASE_URL, then migrate. Plan in M7 doc covers the full schema. |
| T2: Final Methodology + Limitations + TOS + Privacy copy | ❌ DEFERRED | User opted to skip during code session. Write before lawyer review. |
| T3: App icon + splash + visual assets | ❌ DEFERRED | Use default Expo icon for first build; replace before final submission. |
| T4: Production API_BASE_URL via env | ❌ DEFERRED | Hard-coded `192.168.50.176:4000` still in `mobile/src/config.ts`. Replace after backend deploy. |
| **T5: LLM eval suite (~10 fixtures)** | ✅ DONE | `backend/tests/evals/credibility.jsonl` + `run.ts`. Run with `npm run eval` from backend/ when backend is up with real key. |
| T6: Maestro mobile smoke flow | ❌ DEFERRED | Optional; manual web verify covers same paths. |

## Ops track status

All outstanding. See `docs/superpowers/plans/2026-05-26-m7-launch-prep.md` § A–G.

Short list (in order):
1. Apple Developer Program ($99/yr)
2. Google Play Console ($25)
3. Pick backend host (Railway or Render)
4. Provision Postgres (Railway add-on or Supabase)
5. Lawyer review (~$500–1500, 1 hour)
6. EAS Build pipeline setup
7. Backend deploy + env vars
8. Mobile prod build with EAS
9. Store listings + screenshots + privacy nutrition labels
10. Submit

## What the codebase is at v1.0.0-code-complete

- **Backend**: 138 tests, 19 suites, all green. Real Claude integration verified. SSRF guard, rate-limit, monthly cost cap, cache, feedback widget, Deep Analysis, dataset lookup, combined scoring — all wired. Currently in-memory storage (Postgres migration deferred).
- **Mobile**: Expo + React Native app with combined score headline, drill-down breakdown, publisher block, counter-argument card, feedback widget, Deep Analysis CTA + collapsible Skeptic/Advocate cards. Methodology + Limitations stub screens present.
- **Storage**: In-memory + JSONL files (`backend/data/cost-events.jsonl`, `backend/data/feedback-events.jsonl`). Both gitignored.
- **API key handling**: `backend/.env` with `ANTHROPIC_API_KEY`; never committed; dotenv override fix in place.
- **Verified end-to-end**: web (Expo `--web`) against real Claude Haiku 4.5. Cost ~$0.004 per single check, ~$0.015 per Deep Analysis.

## When you resume

Read `docs/superpowers/plans/2026-05-26-m7-launch-prep.md`. The Ops track checklist runs in parallel — most items are sequential blockers for each other. Critical path:

1. **Pick backend host** → triggers Postgres URL → unblocks T1 migration.
2. **Apple Dev account** ($99) → unblocks EAS iOS Build → unblocks App Store submission.
3. **Play Console** ($25) → unblocks EAS Android Build → unblocks Play Store submission.
4. **Lawyer review** → MUST happen before any external sharing or store submission per spec §9.

## Commands you'll use

```bash
# Run the eval suite (needs backend running with real key)
cd backend && npm run eval

# Run tests
cd backend && npm test

# Boot backend locally
cd backend && npm run dev

# Boot mobile in browser
cd mobile && npx expo start --web

# Boot mobile on phone (Expo Go)
cd mobile && npx expo start

# When you have an EAS account configured:
cd mobile && eas build --platform ios --profile production
cd mobile && eas build --platform android --profile production
```
