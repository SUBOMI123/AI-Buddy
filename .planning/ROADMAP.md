# Roadmap: AI Buddy

## Milestones

- ✅ **v1.0 — Foundation + Core Loop + Voice + Learning** — Phases 1–7 (shipped 2026-04-11)
- ✅ **v2.0 — Task-Native Experience** — Phases 8–11 (shipped 2026-04-13)
- 📋 **v3.0 — Ship** — Phases 12–16 (active)

## Phases

<details>
<summary>✅ v1.0 — Foundation + Core Loop + Voice + Learning — SHIPPED 2026-04-11</summary>

7 phases, 15 plans, 18 requirements. Full details: [.planning/milestones/v1.0-ROADMAP.md](.planning/milestones/v1.0-ROADMAP.md)

| Phase | Description | Status |
|-------|-------------|--------|
| 1. Infrastructure & App Shell | Cloudflare Worker proxy, Tauri tray app, overlay, screen capture permissions | Complete |
| 2. Core AI Loop | Text intent → screenshot → streaming Claude guidance | Complete |
| 3. Voice I/O | Push-to-talk STT and TTS output | Complete |
| 4. Screen Region Selection | Box-select to focus AI on a specific area | Complete |
| 5. Learning & Adaptation | Local memory, degrading guidance, skill profiles | Complete |
| 6. Voice Settings | TTS auto-play toggle, PTT key-capture field in settings | Complete |
| 7. Production Readiness | CORS fix, dead export removal, placeholder docs, .env.example | Complete |

</details>

<details>
<summary>✅ v2.0 — Task-Native Experience — SHIPPED 2026-04-13</summary>

4 phases, 12 plans, 18 requirements. Full details: [.planning/milestones/v2.0-ROADMAP.md](.planning/milestones/v2.0-ROADMAP.md)

| Phase | Description | Status | Completed |
|-------|-------------|--------|-----------|
| 8. Backend Foundations | Multi-monitor overlay + active app detection via Rust | Complete | 2026-04-11 |
| 9. State Machine + Conversation Continuity | Session history, task header, follow-up context, hide/show persistence | Complete | 2026-04-13 |
| 10. Step Tracking + Response Quality | StepChecklist, parseSteps, copy buttons, step-first SYSTEM_PROMPT | Complete | 2026-04-13 |
| 11. Action-First UI | QuickActions 2×2 grid, TryAnotherWay, region-aware buttons | Complete | 2026-04-13 |

</details>

### v3.0 — Ship

- [ ] **Phase 12: Worker Deploy** — KV namespace provisioned, Worker live in production with rate limiting enforced
- [ ] **Phase 13: Quota & Monetization** — Free tier limits enforced server-side, Stripe subscriptions wired, paid users bypass quotas
- [ ] **Phase 14: Code Signing** — macOS signed + notarized, entitlements correct, Windows beta docs ready
- [ ] **Phase 15: CI Pipeline & Auto-Updater** — GitHub Actions release workflow produces signed builds, updater live
- [ ] **Phase 16: Distribution** — First signed release published, install guide live, feedback channel open

---

## Phase Details

### Phase 12: Worker Deploy
**Goal**: The Cloudflare Worker is live in production with all API proxy routes reachable and per-user rate limiting enforced via KV
**Depends on**: Nothing (first phase of v3.0)
**Requirements**: INFRA-03, INFRA-04, INFRA-05
**Success Criteria** (what must be TRUE):
  1. A request to the production Worker URL for `/chat`, `/stt`, and `/tts` returns a valid response (not a 404 or placeholder)
  2. The KV namespace ID in wrangler.toml is a real provisioned namespace, not the PRODUCTION REQUIRED placeholder
  3. Making more than 20 guidance requests from a single user identifier in one day causes the Worker to return a structured quota-exceeded response, not an error or a pass-through
**Plans**: TBD

### Phase 13: Quota & Monetization
**Goal**: Free tier users see their usage limits enforced and displayed, and paid subscribers can bypass all limits via Stripe
**Depends on**: Phase 12
**Requirements**: QUOT-01, QUOT-02, QUOT-03, QUOT-04, QUOT-05, QUOT-06, QUOT-07, QUOT-08, PAY-01, PAY-02, PAY-03, PAY-04, PAY-05
**Success Criteria** (what must be TRUE):
  1. A free user who has consumed 20 guidance queries sees a `quota_exceeded` message in the app (not a generic error or a `rate_limited` error) and cannot make further queries until the rolling 24h window resets
  2. A free user with 2 requests remaining sees a soft-limit warning ("2 AI requests left today") before hitting the hard limit
  3. The app displays remaining quota inline (e.g. "12 / 20 requests left today") on every guidance response
  4. Clicking "Upgrade" in the app opens the system browser to a Stripe Checkout page
  5. After completing payment, the app calls `/refresh-subscription` and the UI reflects paid status without a restart
  6. A paid subscriber can make more than 20 guidance queries in a single day without hitting any quota error
**Plans**: TBD

### Phase 14: Code Signing
**Goal**: macOS builds pass Gatekeeper and notarization without warnings; entitlements and Info.plist are correct; Windows beta onboarding is documented
**Depends on**: Phase 12 (Worker must be live before distributing a working signed build)
**Requirements**: SIGN-01, SIGN-02, SIGN-03, SIGN-04, SIGN-05
**Success Criteria** (what must be TRUE):
  1. A macOS user who downloads the DMG and opens it sees the app launch without any Gatekeeper security warning
  2. The app opens on a macOS machine with no internet connection after the first notarization check (stapled ticket works offline)
  3. Taking a screenshot via the app in a notarized signed build produces a real screenshot (not a blank image), confirming NSScreenCaptureUsageDescription is present
  4. A Windows user following the onboarding email can run the installer by clicking "More info → Run anyway" in the SmartScreen dialog
**Plans**: TBD

### Phase 15: CI Pipeline & Auto-Updater
**Goal**: A git tag push triggers a fully automated release that produces signed macOS DMGs, a Windows installer, and a latest.json; installed apps detect and apply updates without leaving the app
**Depends on**: Phase 14
**Requirements**: UPDT-01, UPDT-02, UPDT-03, UPDT-04
**Success Criteria** (what must be TRUE):
  1. Pushing a semver git tag triggers the GitHub Actions release workflow and produces signed macOS (arm64 + x86_64) DMG artifacts and a Windows EXE without manual intervention
  2. The release workflow publishes a latest.json to GitHub Releases that the app's updater endpoint can resolve
  3. An installed app on launch detects that a newer version is available and shows an in-app update dialog
  4. The user can install the update from within the app without opening a browser or downloading a file manually
**Plans**: TBD

### Phase 16: Distribution
**Goal**: Beta users can discover, download, install, and provide feedback on AI Buddy through documented, working channels
**Depends on**: Phase 15
**Requirements**: DIST-01, DIST-02, DIST-03
**Success Criteria** (what must be TRUE):
  1. A macOS and Windows download link exists on GitHub Releases pointing to signed, notarized artifacts
  2. A beta user following the install guide can complete installation on macOS without hitting any undocumented step (Gatekeeper, first-launch permission dialogs all covered)
  3. A beta user has a working channel (Discord or email) to report a bug and receive a response
**Plans**: TBD

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1–7. v1.0 phases | v1.0 | 15/15 | Complete | 2026-04-11 |
| 8. Backend Foundations | v2.0 | 2/2 | Complete | 2026-04-11 |
| 9. State Machine + Conversation Continuity | v2.0 | 3/3 | Complete | 2026-04-13 |
| 10. Step Tracking + Response Quality | v2.0 | 4/4 | Complete | 2026-04-13 |
| 11. Action-First UI | v2.0 | 3/3 | Complete | 2026-04-13 |
| 12. Worker Deploy | v3.0 | 0/? | Not started | — |
| 13. Quota & Monetization | v3.0 | 0/? | Not started | — |
| 14. Code Signing | v3.0 | 0/? | Not started | — |
| 15. CI Pipeline & Auto-Updater | v3.0 | 0/? | Not started | — |
| 16. Distribution | v3.0 | 0/? | Not started | — |
