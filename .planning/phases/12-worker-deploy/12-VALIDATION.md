---
phase: 12
slug: worker-deploy
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-13
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (worker/package.json) |
| **Config file** | worker/package.json (vitest config) |
| **Quick run command** | `cd worker && npm test` |
| **Full suite command** | `cd worker && npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd worker && npm test`
- **After every plan wave:** Run `cd worker && npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 0 | INFRA-03 | — | N/A | unit | `cd worker && npm test` | ✅ | ⬜ pending |
| 12-01-02 | 01 | 1 | INFRA-03 | — | KV namespace ID is real (not placeholder) | manual | `grep -v REPLACE worker/wrangler.toml` | ✅ | ⬜ pending |
| 12-01-03 | 01 | 1 | INFRA-04 | — | Production URL returns 200 on /health | manual | `curl https://{worker}.workers.dev/health` | N/A | ⬜ pending |
| 12-01-04 | 01 | 2 | INFRA-05 | — | >20 /chat requests returns quota_exceeded | unit | `cd worker && npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `worker/src/index.test.ts` — update stale /stt and /tts assertions (currently expect 501, now return real responses)
- [ ] Add quota enforcement tests to `worker/src/index.test.ts`

*Existing test infrastructure (vitest) is already installed — no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| KV namespace ID is a real provisioned namespace | INFRA-03 | Requires Cloudflare account auth — cannot be automated locally | `grep -v "REPLACE" worker/wrangler.toml` passes; confirm ID exists in Cloudflare dashboard |
| Production Worker URL returns valid responses | INFRA-04 | Requires live deployment | `curl https://{worker-name}.workers.dev/health` returns `{"status":"ok"}` |
| WORKER_URL baked into Tauri binary | INFRA-04 | Requires building Tauri app | `WORKER_URL=https://... cargo tauri build` succeeds without localhost fallback |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
