# M1 — Hello World retro

**Tag:** m1-hello-world
**Date completed:** 2026-05-24
**Commits:** 13 (98a6db1 → 64db8d9)

## What works

- Mac runs Hono backend on :4000, mobile app (Expo) talks to it across origins.
- POST /api/check + GET /api/check/:jobId round-trip via UUID jobId.
- URL validation rejects javascript:/file:/no-scheme/non-string inputs.
- 4 backend test suites passing — 18 tests total (health, url-validator, job-store, routes/check).
- Verified end-to-end via Expo web in browser at http://localhost:8081 against backend at localhost:4000. Happy path returns echo correctly.

## Deviations from plan

- **CORS not in original plan.** Added `hono/cors` middleware so Expo web (cross-origin from :8081) can hit backend on :4000. Permissive in V1; tighten when production mobile builds ship.
- **Web deps added beyond plan.** Plan assumed phone-only via Expo Go. User phone unavailable, so installed `react-dom`, `react-native-web`, `@expo/metro-runtime` to enable browser testing. Cheap addition, also useful as a fast iteration loop.
- **URL validator signature.** Subagent initially changed `input: unknown` → `input: string`. Reverted to spec intent (defensive type-predicate at boundary).

## What surprised me

- Phone wasn't available during the session — plan assumed phone-only verification at T12, so I had to detour through Expo web. Web target worked cleanly because device-id.ts already had the `Platform.OS === 'web'` fallback (the only forward-looking thing in that file). Worth keeping that pattern in later milestones.
- Expo SDK 56 + React 19 in the scaffold — bleeding edge but worked without issue. ts-jest ESM config also worked first try.

## What's deferred to M2

- Real LLM call (Claude API) replaces echo.
- Methodology + Limitations stub pages live in mobile app (spec §14 requires before any external demo, so M2 is the latest these can land).
- Backend moves from in-memory JobStore to Postgres (Railway/Render managed) — current in-memory map wipes on every dev restart.
- Article extractor with SSRF guard + 10s timeout + 5MB body cap + Content-Type allowlist.
- Real partial→complete polling path (M1 just completes instantly with echo).

## Outstanding M1 follow-ups (low priority)

- Backend test files use `as any` casts on `res.json()` returns to satisfy TS strict mode. Either add response type generics on the helper or accept the pattern.
- Hardcoded `API_BASE_URL = http://192.168.50.176:4000` in `mobile/src/config.ts`. Becomes an env-driven config in M7 (EAS Build env vars).
- iOS Simulator path was not exercised; Xcode CLI tools currently point at Command Line Tools only.
- Phone test (Expo Go) deferred until phone available. Web equivalence verified.
