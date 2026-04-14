---
phase: 13-quota-monetization
asvs_level: 1
audited: 2026-04-13
result: SECURED
threats_open: 0
threats_total: 6
---

# Security Audit — Phase 13: Quota & Monetization

**Phase:** 13 — Quota & Monetization
**Threats Closed:** 6/6
**ASVS Level:** 1

## Threat Verification

| Threat ID | Category | Disposition | Evidence |
|-----------|----------|-------------|----------|
| T-13-01 | Tampering | mitigate | `worker/src/index.ts` lines 550-558: `stripe.webhooks.constructEventAsync()` with `Stripe.createSubtleCryptoProvider()` inside try/catch; catch returns `c.text('Webhook signature verification failed', 400)`. Missing signature header returns 400 at line 540. |
| T-13-02 | Elevation of Privilege | mitigate | `worker/src/index.ts` line 583: `/refresh-subscription` uses `c.get('tokenValue')` (HMAC-verified by middleware at line 183). Webhook KV write at line 563-565 keys on `session.metadata?.installation_uuid` from Stripe-signed event, not request body. |
| T-13-03 | Spoofing | mitigate | `worker/src/index.ts` lines 515-516: body.uuid used only in Stripe metadata fields. Subscription KV write (line 565) is performed by the webhook handler using Stripe-verified event data. `/create-checkout` route is HMAC-authenticated; no KV write occurs in that route handler. |
| T-13-07 | Tampering | mitigate | `worker/src/index.ts` line 583: `const uuid = c.get('tokenValue')` — UUID sourced from HMAC-verified auth middleware (line 183), not from request body. Stripe query at lines 591-594 uses this uuid. |
| T-13-10 | Spoofing | mitigate | `src-tauri/capabilities/default.json` lines 21-24: `opener:allow-open-url` uses scoped object form `{ "identifier": "opener:allow-open-url", "allow": [{ "url": "https://**" }] }` — restricts to https:// scheme only, blocking file:// and custom schemes. |
| T-13-12 | Elevation of Privilege | mitigate | `src/components/SidebarShell.tsx` lines 282-284: UI gates `setIsSubscribed(true)` on `data.status === "active"`. `worker/src/index.ts` lines 590-605: Worker queries Stripe directly via `stripe.subscriptions.search()` (not KV) for this endpoint, returning `'active'` only for live Stripe-confirmed subscriptions. |

## Accepted Risks

| Threat ID | Category | Rationale |
|-----------|----------|-----------|
| T-13-04 | Information Disclosure | /quota returns only authenticated user's own quota counts; no cross-user leakage. Intentional per QUOT-05. |
| T-13-05 | Denial of Service | checkQuota() TOCTOU race condition — KV eventual consistency allows minor bursts. Same tradeoff accepted in Phase 12. Acceptable for beta traffic; Durable Objects deferred. |
| T-13-06 | Repudiation | Stripe Dashboard provides webhook event audit log. No additional audit trail required for beta. |
| T-13-08 | Tampering | Body uuid in /create-checkout used only for Stripe metadata. Subscription KV write is controlled by verified webhook (T-13-01 mitigated). |
| T-13-09 | Information Disclosure | X-Quota-Remaining intentionally reveals quota to authenticated app user only (QUOT-05). No cross-user exposure. |
| T-13-11 | Denial of Service | QuotaBanner signal loop on repeated responses with X-Quota-Remaining=2 is harmless; Worker is trusted source. |

## Unregistered Threat Flags

None. SUMMARY.md reported no unregistered threat flags. Three auto-fixed deviations during implementation (CORS exposeHeaders, banner guard logic, opener URL scope) were design-time corrections, not unregistered threat vectors.
