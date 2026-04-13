# Requirements — v3.0 Ship

## Milestone Goal

Take AI Buddy from working prototype to a real product that beta users can download and run on macOS and Windows, with usage-based monetization enforced server-side.

---

## Active Requirements

### Backend Infrastructure

- [ ] **INFRA-03**: Cloudflare Worker KV namespace provisioned and wired — KV namespace ID replaces the PRODUCTION REQUIRED placeholder in wrangler.toml
- [ ] **INFRA-04**: Cloudflare Worker deployed to production — all API proxy routes (Claude, STT, TTS) live and reachable from a production URL
- [ ] **INFRA-05**: Rate limiting enforced via KV — Worker uses KV to track and enforce per-user daily quotas server-side

### Quota & Monetization

- [ ] **QUOT-01**: Free tier enforces 20 AI guidance queries per user per day — enforced in Worker, not the app
- [ ] **QUOT-02**: Free tier enforces 5 minutes of STT (speech-to-text) per user per day — enforced in Worker
- [ ] **QUOT-03**: Free tier enforces 10 TTS (text-to-speech) responses per user per day — enforced in Worker
- [ ] **QUOT-04**: When a free tier limit is hit, the Worker returns a structured quota-exceeded response (not a generic error) so the app can show an upgrade prompt
- [ ] **QUOT-05**: App displays remaining quota to the user inline (e.g. "12 / 20 requests left today") — sourced from Worker response headers or a quota endpoint
- [ ] **QUOT-06**: Paid subscribers bypass all daily quotas — Worker validates subscription status before enforcing limits
- [ ] **PAY-01**: Stripe subscription product created — monthly and/or annual plan configured in Stripe Dashboard
- [ ] **PAY-02**: Clicking "Upgrade" in the app opens the system browser to a hosted Stripe Checkout page
- [ ] **PAY-03**: After successful payment, Stripe webhook updates subscriber status in Cloudflare KV so the Worker recognises the user as paid
- [ ] **PAY-04**: User identity is tied to a stable identifier (email or device ID) so quota and subscription status persists across app restarts

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

*(Populated by roadmapper)*

| REQ-ID | Phase | Status |
|--------|-------|--------|
| INFRA-03 | — | — |
| INFRA-04 | — | — |
| INFRA-05 | — | — |
| QUOT-01 | — | — |
| QUOT-02 | — | — |
| QUOT-03 | — | — |
| QUOT-04 | — | — |
| QUOT-05 | — | — |
| QUOT-06 | — | — |
| PAY-01 | — | — |
| PAY-02 | — | — |
| PAY-03 | — | — |
| PAY-04 | — | — |
| SIGN-01 | — | — |
| SIGN-02 | — | — |
| SIGN-03 | — | — |
| SIGN-04 | — | — |
| SIGN-05 | — | — |
| UPDT-01 | — | — |
| UPDT-02 | — | — |
| UPDT-03 | — | — |
| UPDT-04 | — | — |
| DIST-01 | — | — |
| DIST-02 | — | — |
| DIST-03 | — | — |
