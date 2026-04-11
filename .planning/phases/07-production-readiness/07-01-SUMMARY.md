---
phase: 07-production-readiness
plan: 01
subsystem: infra
tags: [cors, cloudflare-workers, hono, tauri, env-config, dead-code]

# Dependency graph
requires:
  - phase: 01-infrastructure-app-shell
    provides: Worker setup, CORS middleware, tauri.ts IPC surface, wrangler.toml
  - phase: 04-screen-region-selection
    provides: closeRegionSelect export (now removed as dead code)
provides:
  - Worker CORS origin accepts tauri://localhost for production WebView requests
  - .env.example as canonical single source for WORKER_URL configuration
  - Clean tauri.ts IPC surface with dead exports removed
  - Documented production deploy placeholders in wrangler.toml and tauri.conf.json
affects: [deploy, worker, tauri-conf, ipc-surface]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CORS origin as array to cover both dev (http://localhost:1420) and production (tauri://localhost) origins"
    - ".env.example with negation rule (!.env.example) in .gitignore to track template while blocking real .env files"
    - "_comment_* keys in tauri.conf.json for JSON-compatible inline documentation (Tauri ignores unknown keys)"

key-files:
  created:
    - .env.example
    - .planning/phases/07-production-readiness/07-01-SUMMARY.md
  modified:
    - worker/src/index.ts
    - src/lib/tauri.ts
    - worker/wrangler.toml
    - src-tauri/tauri.conf.json
    - .gitignore

key-decisions:
  - ".env.example negation added to .gitignore — .env.* pattern was blocking the template file from being tracked"
  - "CORS origin changed to array form ['http://localhost:1420', 'tauri://localhost'] — production Tauri WebViews use tauri:// scheme"
  - "VITE_WORKER_URL and WORKER_URL kept as separate variables — Vite and Rust consume them via different mechanisms; code not unified, only documented"
  - "_comment_endpoints key used in tauri.conf.json — JSON has no comment syntax; Tauri ignores unknown keys"

patterns-established:
  - "Production readiness comments: use explicit PRODUCTION REQUIRED banners with exact CLI commands, not descriptive prose"

requirements-completed: [INFRA-01, INFRA-02]

# Metrics
duration: 15min
completed: 2026-04-11
---

# Phase 07 Plan 01: Production Readiness — Tech Debt Closure Summary

**CORS fixed for tauri:// scheme, .env.example created for split WORKER_URL config, two dead IPC exports removed, and explicit PRODUCTION REQUIRED banners added to wrangler.toml and tauri.conf.json**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-11T03:00:00Z
- **Completed:** 2026-04-11T03:15:00Z
- **Tasks:** 4
- **Files modified:** 6

## Accomplishments

- Worker CORS now accepts `tauri://localhost` — production Tauri WebView fetch calls will no longer be rejected by the browser's CORS check
- `.env.example` is the single documented reference for both `VITE_WORKER_URL` (Vite frontend) and `WORKER_URL` (Rust backend), with links to each consumer file
- `closeRegionSelect` and `onOverlayHidden` removed from `src/lib/tauri.ts` — both were confirmed dead by v1.0 audit; `onOverlayShown` retained as live
- `wrangler.toml` KV namespace section now has a PRODUCTION REQUIRED banner with the exact `wrangler kv namespace create` command; `tauri.conf.json` updater section has a `_comment_endpoints` key and improved pubkey instruction string

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix Worker CORS origin for production builds** - `27e360a` (fix)
2. **Task 2: Create .env.example documenting unified WORKER_URL config** - `fd22a42` (chore)
3. **Task 3: Remove dead exports from tauri.ts** - `c1ea915` (refactor)
4. **Task 4: Document production deploy placeholders in wrangler.toml and tauri.conf.json** - `25487b6` (chore)

**Plan metadata:** (pending docs commit)

## Files Created/Modified

- `worker/src/index.ts` — CORS origin changed from single string to array `['http://localhost:1420', 'tauri://localhost']` with explanatory comments
- `.env.example` — New file; canonical reference for VITE_WORKER_URL and WORKER_URL with consumer links and Wrangler secrets guidance
- `.gitignore` — Added `!.env.example` negation so template file is tracked despite `.env.*` ignore rule
- `src/lib/tauri.ts` — Removed `closeRegionSelect` and `onOverlayHidden` exports (9 lines deleted); `onOverlayShown` unchanged
- `worker/wrangler.toml` — KV namespace section replaced with PRODUCTION REQUIRED banner and step-by-step wrangler command
- `src-tauri/tauri.conf.json` — Added `_comment_endpoints` key; improved pubkey placeholder string with exact `cargo tauri signer generate` command

## Decisions Made

- **`.gitignore` negation for .env.example:** The existing `.env.*` pattern blocked the template file. Added `!.env.example` negation rather than changing the broad pattern — preserves protection for `.env.local`, `.env.production`, etc.
- **VITE_WORKER_URL and WORKER_URL kept separate:** The plan explicitly states these serve different consumers (Vite import.meta.env vs Rust option_env!/std::env::var). Documented together in `.env.example` rather than attempting code-level unification.
- **Comment-only reference to closeRegionSelect in SidebarShell.tsx retained:** `grep` found one match in a code comment explaining why `closeRegionSelect()` is NOT called — not a live import. TypeScript exits 0. Comment is informational context, not dead code.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added !.env.example negation to .gitignore**
- **Found during:** Task 2 (Create .env.example)
- **Issue:** `git add .env.example` failed — `.env.*` pattern in .gitignore matched the template file, blocking the commit
- **Fix:** Added `!.env.example` negation rule immediately after `.env.*` in .gitignore
- **Files modified:** .gitignore
- **Verification:** `git add .env.example` succeeded; `.env`, `.env.local` etc. remain ignored
- **Committed in:** fd22a42 (Task 2 commit, includes both .env.example and .gitignore)

---

**Total deviations:** 1 auto-fixed (Rule 3 — blocking issue)
**Impact on plan:** Necessary to get .env.example tracked by git; no scope creep.

## Issues Encountered

None beyond the .gitignore negation deviation above.

## User Setup Required

None — this plan is documentation and dead-code cleanup. No external services reconfigured.

For production deploy setup, see the banners now embedded in:
- `worker/wrangler.toml` — KV namespace creation steps
- `src-tauri/tauri.conf.json` — auto-updater key generation steps
- `.env.example` — WORKER_URL configuration for both frontend and Rust consumers

## Next Phase Readiness

All v1.0 tech debt items from the milestone audit that were scoped to this plan are resolved. The remaining audit items (TTS auto-play toggle, PTT key config UI, `_currentTaskLabel` getter) are out of scope for this plan and tracked in the audit document.

---
*Phase: 07-production-readiness*
*Completed: 2026-04-11*
