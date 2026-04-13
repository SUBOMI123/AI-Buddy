---
phase: 13
slug: quota-monetization
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-13
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (worker/), vitest (src/) |
| **Config file** | worker/package.json, vitest.config.ts |
| **Quick run command** | `cd worker && npm test` / `npm test` (root) |
| **Full suite command** | `cd worker && npm test && cd .. && npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd worker && npm test`
- **After every plan wave:** Run full suite (worker + frontend)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 0 | QUOT-02, QUOT-03 | — | N/A | unit | `cd worker && npm test` | ✅ | ⬜ pending |
| 13-01-02 | 01 | 1 | QUOT-06 | — | Paid user bypasses quota | unit | `cd worker && npm test` | ✅ | ⬜ pending |
| 13-01-03 | 01 | 1 | PAY-03 | — | Webhook writes KV correctly | unit | `cd worker && npm test` | ✅ | ⬜ pending |
| 13-02-01 | 02 | 2 | QUOT-05 | — | X-Quota-Remaining header present | unit | `npm test` | ✅ | ⬜ pending |
| 13-02-02 | 02 | 2 | QUOT-08 | — | Banner shows when ≤2 remain | unit | `npm test` | ✅ | ⬜ pending |
| 13-02-03 | 02 | 2 | PAY-02 | — | Upgrade opens browser | manual | `npm run tauri dev` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `worker/src/index.test.ts` — add tests: STT quota enforcement, TTS quota enforcement, subscription bypass, `/stripe-webhook` KV write, `/refresh-subscription` return
- [ ] `npm install stripe` in worker/ — Stripe SDK required before any test can import it
- [ ] Stripe product + price created in Stripe Dashboard (PAY-01) — required before checkout URL can be generated

*Note: PAY-01 (Stripe Dashboard setup) is a manual Wave 0 prerequisite, not a test task.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Upgrade button opens Stripe Checkout in browser | PAY-02 | Requires system browser launch and Stripe live/test session | Run app, click Upgrade, confirm browser opens to Stripe Checkout URL |
| After payment, refresh-subscription reflects paid status | PAY-05 | Requires live Stripe test payment | Complete test mode checkout, click refresh, confirm UI shows paid state |
| Paid subscriber makes >20 chat requests without quota error | QUOT-06 | Requires live KV with subscription:${uuid} = active | Set KV manually or complete test payment, fire 21+ requests |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
