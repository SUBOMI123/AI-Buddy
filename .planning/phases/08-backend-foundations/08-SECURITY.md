---
phase: 8
slug: backend-foundations
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-11
---

# Phase 8 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| OS → Tauri AppHandle | cursor_position() and available_monitors() return OS-provided data; coordinates are trusted as physical measurements | Physical pixel coordinates (non-sensitive) |
| OS process table → app_name string | app_name is user-controlled (any process can set any name); crosses from OS into AI prompt | App name string (sanitized: trimmed, capped at 100 chars) |
| Rust → JS (IPC) | cmd_get_active_app return value crosses Tauri IPC boundary | Option\<String\> — None on any error |
| JS → Claude API (via Worker) | appContext string injected into system prompt sent to Claude | App name (cosmetic enrichment only; Claude does not execute prompt strings) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-08-01-01 | Tampering | window.rs coordinate math | accept | OS-provided coords; `as i32` truncation at window.rs:53,56 guards against overflow on screen-sized values (~4K px max) | closed |
| T-08-01-02 | Denial of Service | available_monitors() returning empty | accept | `.unwrap_or_default()` at window.rs:25 — empty list → fallback chain → overlay shows on cursor's monitor or doesn't reposition; no panic path | closed |
| T-08-02-01 | Tampering | app_name → system prompt injection | mitigate | `chars().take(100).collect()` cap at app_context.rs:26; Claude does not execute prompt strings — injection risk is cosmetic only | closed |
| T-08-02-02 | Information Disclosure | active-win-pos-rs `title` field | mitigate | Only `win.app_name` read in app_context.rs; no `.title` access (would expose document names and require Screen Recording permission) | closed |
| T-08-02-03 | Denial of Service | getActiveApp() blocking overlay | mitigate | Fire-and-forget `.then().catch()` at SidebarShell.tsx:125; never awaited; OS failure returns Ok(None); overlay always opens | closed |
| T-08-02-04 | Elevation of Privilege | Windows elevated process app_name | accept | Returns Ok(None) on empty app_name from UAC-elevated processes — no data leak, no crash; detection is best-effort enrichment, not a security gate | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-08-01 | T-08-01-01 | Coordinate overflow impossible in practice — screen-sized physical values max ~15,360px on 8K display; `as i32` (max 2,147,483,647) cannot overflow | gsd-secure-phase | 2026-04-11 |
| AR-08-02 | T-08-01-02 | Empty monitor list means OS is in inconsistent state; overlay not repositioning is acceptable degradation vs. crashing | gsd-secure-phase | 2026-04-11 |
| AR-08-03 | T-08-02-04 | Windows elevated process returns empty app_name — UAC isolation prevents app enumeration across privilege levels; this is correct OS behavior, not a bug | gsd-secure-phase | 2026-04-11 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-11 | 6 | 6 | 0 | gsd-secure-phase (automated) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-11
