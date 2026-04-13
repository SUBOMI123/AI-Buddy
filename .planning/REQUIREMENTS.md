# Requirements — v3.0 Ship

## Milestone Goal

Take AI Buddy from working prototype to a real product that beta users can download and run on macOS and Windows, with usage-based monetization enforced server-side.

---

## Active Requirements

### Backend Infrastructure

- [ ] **INFRA-03**: Cloudflare Worker KV namespace provisioned and wired — KV namespace ID replaces the PRODUCTION REQUIRED placeholder in wrangler.toml
- [ ] **INFRA-04**: Cloudflare Worker deployed to production — all API proxy routes (Claude, STT, TTS) live and reachable from a production URL
- [ ] **INFRA-05**: Rate limiting and quota are two distinct enforcement layers in the Worker — rate limiting (`rate_limited` error code) is abuse protection (requests-per-second/minute), quota (`quota_exceeded` error code) is the product's daily feature limit; each returns a different structured error so the app can show the correct UI

### Quota & Monetization

- [ ] **QUOT-01**: Free tier enforces 20 AI guidance queries per user per day — enforced in Worker, not the app
- [ ] **QUOT-02**: Free tier enforces 5 minutes of STT (speech-to-text) per user per day — enforced in Worker
- [ ] **QUOT-03**: Free tier enforces 10 TTS (text-to-speech) responses per user per day — enforced in Worker
- [ ] **QUOT-04**: When a free tier limit is hit, the Worker returns a structured quota-exceeded response (not a generic error) so the app can show an upgrade prompt
- [ ] **QUOT-05**: App displays remaining quota to the user inline (e.g. "12 / 20 requests left today") — sourced from Worker response headers or a quota endpoint
- [ ] **QUOT-06**: Paid subscribers bypass all daily quotas — Worker validates subscription status before enforcing limits
- [ ] **QUOT-07**: Daily quotas reset on a rolling 24-hour window (not midnight UTC) — a user who first requests at 14:00 gets their quota reset at 14:00 the next day; window start time tracked per user in KV
- [ ] **QUOT-08**: App shows a soft-limit warning when the user has 2 or fewer requests remaining in any quota category (e.g. "2 AI requests left today") — surfaced before the hard limit is hit to reduce frustration and increase upgrade conversion
- [ ] **PAY-01**: Stripe subscription product created — monthly and/or annual plan configured in Stripe Dashboard
- [ ] **PAY-02**: Clicking "Upgrade" in the app opens the system browser to a hosted Stripe Checkout page
- [ ] **PAY-03**: After successful payment, Stripe webhook updates subscriber status in Cloudflare KV so the Worker recognises the user as paid
- [ ] **PAY-04**: User identity is a UUID generated on first launch and persisted locally — sent with every Worker request as the user identifier; no login or email required for beta
- [ ] **PAY-05**: After Stripe Checkout completes, the app calls a Worker `/refresh-subscription` endpoint to fetch the latest Stripe status and update KV immediately — UI reflects paid status without a restart (does not rely solely on webhook timing)

### Code Signing & Notarization

- [ ] **SIGN-01**: macOS build is signed with a Developer ID Application certificate — Gatekeeper accepts the app on first launch without security warnings
- [ ] **SIGN-02**: macOS build is notarized and stapled — app opens on machines with no internet connection after first notarization check
- [ ] **SIGN-03**: `Entitlements.plist` includes JIT entitlements required by Tauri's WebView (`allow-jit`, `allow-unsigned-executable-memory`, `allow-dyld-environment-variables`, `disable-library-validation`) — missing causes silent crash post-notarization
- [ ] **SIGN-04**: `Info.plist` includes `NSScreenCaptureUsageDescription` — missing causes silent blank screenshots in signed builds
- [ ] **SIGN-05**: Windows build produced for closed beta without code signing — onboarding email documents SmartScreen click-through ("More info → Run anyway")

### Auto-Updater

- [ ] **UPDT-01**: Ed25519 signing keypair generated once — public key embedded in `tauri.conf.json`, private key stored in CI secrets and a password manager
- [ ] **UPDT-02**: `tauri-plugin-updater` configured with production GitHub Releases endpoint (`latest.json`) — app checks for updates on launch
- [ ] **UPDT-03**: In-app update dialog appears when a new version is available — user can install update without leaving the app
- [ ] **UPDT-04**: GitHub Actions release workflow (`release.yml`) produces signed + notarized macOS DMGs and a Windows installer on git tag push, and publishes `latest.json` automatically via `tauri-action`

### Distribution

- [ ] **DIST-01**: First signed release published to GitHub Releases — macOS DMG (arm64 + x86_64) and Windows EXE available as direct download links
- [ ] **DIST-02**: Beta install guide published — covers download, macOS Gatekeeper, Windows SmartScreen click-through, first launch, and how to send feedback
- [ ] **DIST-03**: Feedback channel established (Discord server or email alias) — beta users have a structured way to report issues

---

## Future Requirements

- Windows code signing (Azure Trusted Signing) — deferred from v3.0; closed beta can tolerate SmartScreen click-through
- Mac App Store / Microsoft Store submission — v4.0 public launch scope
- In-app payment form (Stripe Elements) — v4.0; Stripe Checkout via browser is sufficient for beta
- Crash reporting / telemetry (Aptabase, Sentry) — evaluate after first beta cohort
- Usage analytics dashboard — post-beta
- Team/seat pricing — post-beta

## Out of Scope

- Mobile app — iOS/Android sandbox prevents screen observation
- App Store submission — v3.0 is closed beta via direct download only
- Custom update server — GitHub Releases + `latest.json` is sufficient
- In-app payment UI — Stripe Checkout via browser covers beta needs
- Windows EV code signing hardware token — CI-incompatible; Azure Trusted Signing deferred

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| INFRA-03 | Phase 12 | Pending |
| INFRA-04 | Phase 12 | Pending |
| INFRA-05 | Phase 12 | Pending |
| QUOT-01 | Phase 13 | Pending |
| QUOT-02 | Phase 13 | Pending |
| QUOT-03 | Phase 13 | Pending |
| QUOT-04 | Phase 13 | Pending |
| QUOT-05 | Phase 13 | Pending |
| QUOT-06 | Phase 13 | Pending |
| QUOT-07 | Phase 13 | Pending |
| QUOT-08 | Phase 13 | Pending |
| PAY-01 | Phase 13 | Pending |
| PAY-02 | Phase 13 | Pending |
| PAY-03 | Phase 13 | Pending |
| PAY-04 | Phase 13 | Pending |
| PAY-05 | Phase 13 | Pending |
| SIGN-01 | Phase 14 | Pending |
| SIGN-02 | Phase 14 | Pending |
| SIGN-03 | Phase 14 | Pending |
| SIGN-04 | Phase 14 | Pending |
| SIGN-05 | Phase 14 | Pending |
| UPDT-01 | Phase 15 | Pending |
| UPDT-02 | Phase 15 | Pending |
| UPDT-03 | Phase 15 | Pending |
| UPDT-04 | Phase 15 | Pending |
| DIST-01 | Phase 16 | Pending |
| DIST-02 | Phase 16 | Pending |
| DIST-03 | Phase 16 | Pending |
