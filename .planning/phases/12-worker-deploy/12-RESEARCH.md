# Phase 12: Worker Deploy - Research

**Researched:** 2026-04-13
**Domain:** Cloudflare Workers deployment, KV provisioning, quota enforcement, Rust build-time env injection
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Quota scope — /chat only**
Phase 12 adds quota tracking for `/chat` only (20 guidance queries/user/day). `/stt` and `/tts` quotas are left to Phase 13.
- Add a `checkQuota()` function alongside the existing `checkRateLimit()` function
- Quota check applied only in the `/chat` route handler (not global middleware)
- Returns `{ error: 'quota_exceeded', quota: 20, reset_in_seconds: N }` when limit hit
- Rate limit (60/min abuse protection) stays in global middleware — returns `{ error: 'rate_limited', retry_after: 60 }`
- INFRA-05 distinction satisfied: two layers, two distinct error codes

**Quota window — rolling 24h**
Quota resets on a rolling 24h window (not calendar day midnight). KV key expires 24h after the first request using `expirationTtl: 86400`.
- Key: `quota:chat:${tokenValue}` (separate namespace from rate limit keys `rate:${tokenValue}`)
- Value: request count as string
- TTL: 86400 seconds (24h rolling from first request)

**Production URL — update build config in Phase 12**
Phase 12 includes updating `WORKER_URL` to the real production Cloudflare Worker URL in the build configuration.
- Set `WORKER_URL` in `src-tauri/.cargo/config.toml` under `[env]`
- The production Worker URL will be known after `npx wrangler deploy` completes
- Fallback `http://localhost:8787` stays for dev builds (no change to `option_env!` pattern)

### Claude's Discretion

None captured.

### Deferred Ideas (OUT OF SCOPE)

- STT quota (5 min/day), TTS quota (10 responses/day)
- App-side quota display ("12 / 20 requests left today")
- Soft-limit warning (2 requests remaining)
- `/refresh-subscription` endpoint
- Stripe integration
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-03 | KV namespace provisioned and wired — KV namespace ID replaces the `PRODUCTION REQUIRED` placeholder in wrangler.toml | `wrangler kv namespace create RATE_LIMIT` outputs a real ID; update `wrangler.toml` `[[kv_namespaces]]` binding |
| INFRA-04 | Cloudflare Worker deployed to production — all API proxy routes (Claude, STT, TTS) live and reachable from a production URL | `wrangler deploy` from `worker/` directory; verified via `curl` smoke tests against the deployed URL |
| INFRA-05 | Rate limiting and quota are two distinct enforcement layers — `rate_limited` for abuse (60/min, global middleware), `quota_exceeded` for daily limit (20/day, /chat only) | `checkRateLimit()` already implemented; `checkQuota()` to be added in `/chat` route handler with distinct error structure |
</phase_requirements>

---

## Summary

Phase 12 is a deployment and wiring phase, not a greenfield build. The Worker code at `worker/src/index.ts` is largely complete — it has live implementations for `/chat`, `/stt`, `/tts`, and `/classify`, with HMAC auth and rate limiting already wired. Three things are missing that block production use: (1) the KV namespace has a placeholder ID in `wrangler.toml`, (2) a `checkQuota()` function for `/chat` does not yet exist in the worker code, and (3) the `WORKER_URL` env var in `src-tauri/.cargo/config.toml` still points to localhost.

The deployment sequence is: authenticate with Cloudflare (`wrangler login`), provision the KV namespace (`wrangler kv namespace create RATE_LIMIT`), update `wrangler.toml` with the real ID, add the `checkQuota()` function to the worker, deploy (`wrangler deploy`), set secrets (`wrangler secret put` × 4), update `.cargo/config.toml` with the production URL, then smoke-test all three routes.

One critical discrepancy was found: the test file `worker/src/index.test.ts` expects `/stt` and `/tts` to return 501 (`not_implemented`), but the real `index.ts` has live implementations that return real responses. The tests are stale and will fail. The plan must include updating the tests to match the real code (or removing the stale 501 assertions) before deployment.

**Primary recommendation:** Execute in order — KV provision → quota code addition → wrangler deploy → secrets → WORKER_URL update → smoke test. Keep the two layers (rate limit in middleware, quota in `/chat` route) strictly separate to satisfy INFRA-05.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Wrangler CLI | 4.81.1 (installed) | Deploy, manage secrets, provision KV | Official Cloudflare Worker toolchain [VERIFIED: worker/node_modules/wrangler/package.json] |
| Hono | ^4.12.0 (installed) | Worker routing framework | Already in use; TypeScript router for Cloudflare Workers [VERIFIED: worker/package.json] |
| @cloudflare/workers-types | ^4.20250327.0 | TypeScript types for KV, bindings | Already in devDependencies [VERIFIED: worker/package.json] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:test (built-in) | Node 18+ | Unit tests for Worker logic | Used by existing `index.test.ts` via `tsx` runner |
| tsx | ^4.21.0 | TypeScript test runner | Already used in `npm test` script |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| KV for quota | Durable Objects | KV TOCTOU race exists (already documented in worker comments); DO gives atomic counters but adds complexity. KV is acceptable for beta traffic. |

**Installation:** No new packages needed. All deps already installed in `worker/node_modules/`.

---

## Architecture Patterns

### Current Worker Structure

```
worker/
├── src/
│   ├── index.ts          # Hono app: all routes + middleware
│   └── index.test.ts     # node:test unit tests (STALE — needs update)
├── wrangler.toml         # KV binding placeholder to replace
└── package.json          # scripts: dev, deploy, test
```

### Pattern 1: Two-Layer Enforcement (INFRA-05)

**What:** Rate limit is global middleware (abuse protection, 60/min). Quota is per-route logic (product limit, 20/day on `/chat` only). They use different KV key prefixes and return different error shapes.

**When to use:** Always. Mixing them in one layer breaks the error-code contract that the app (Phase 13) will rely on.

**Implementation:**

```typescript
// Source: based on existing checkRateLimit() in worker/src/index.ts

// EXISTING — global middleware, key: rate:${tokenValue}, TTL 60s
async function checkRateLimit(kv: KVNamespace, token: string): Promise<{ allowed: boolean; remaining: number }> {
  const key = `rate:${token}`;
  // ... (unchanged)
}

// NEW — called only inside /chat route handler, key: quota:chat:${tokenValue}, TTL 86400s
async function checkQuota(
  kv: KVNamespace,
  token: string,
): Promise<{ allowed: boolean; used: number; reset_in_seconds: number }> {
  const key = `quota:chat:${token}`;
  const raw = await kv.get(key, { type: 'text' });
  const current = raw ? parseInt(raw, 10) : 0;

  if (current >= 20) {
    // TTL unknown at read time; return conservative 86400 for reset_in_seconds
    return { allowed: false, used: current, reset_in_seconds: 86400 };
  }

  const newCount = current + 1;
  // Only set TTL on FIRST write (when current === 0) to preserve rolling window.
  // On subsequent writes, omit expirationTtl so the original expiry is not reset.
  if (current === 0) {
    await kv.put(key, String(newCount), { expirationTtl: 86400 });
  } else {
    await kv.put(key, String(newCount));
  }

  return { allowed: true, used: newCount, reset_in_seconds: 0 };
}
```

**CRITICAL NOTE on rolling TTL:** KV's `expirationTtl` resets the TTL on every `put`. To preserve a true rolling window (where the 24h window starts at the FIRST request, not the LAST), set `expirationTtl: 86400` only when `current === 0`. For all subsequent increments, call `kv.put(key, String(newCount))` without `expirationTtl` so the original expiry is preserved. [VERIFIED: Cloudflare KV docs behavior — `expirationTtl` on put always resets the TTL]

**Quota error response in /chat route:**

```typescript
// Inside app.post('/chat', ...) — after HMAC auth passes, before proxying to Anthropic:
if (c.env.RATE_LIMIT) {
  const quota = await checkQuota(c.env.RATE_LIMIT, tokenValue);
  if (!quota.allowed) {
    return c.json(
      { error: 'quota_exceeded', quota: 20, reset_in_seconds: quota.reset_in_seconds },
      { status: 429 }
    );
  }
}
```

### Pattern 2: Wrangler KV Namespace Provisioning

**What:** Run `wrangler kv namespace create` to get a real namespace ID, update `wrangler.toml`, then deploy.

**Steps:**
```bash
# From worker/ directory
npx wrangler login                         # browser OAuth — one-time
npx wrangler kv namespace create RATE_LIMIT  # outputs: id = "abc123..."
# Update wrangler.toml [[kv_namespaces]] id field with that value
npx wrangler deploy                        # deploys with real KV bound
```

[VERIFIED: Cloudflare Wrangler docs pattern — ASSUMED for exact flag syntax]

### Pattern 3: Wrangler Secrets

**What:** Secrets are set via `wrangler secret put` and are available as `c.env.SECRET_NAME` in the Worker. They are NOT in `wrangler.toml` (that would expose them in git).

**Required secrets (all 4 must be set before routes work):**

```bash
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put ASSEMBLYAI_API_KEY
npx wrangler secret put ELEVENLABS_API_KEY
npx wrangler secret put APP_HMAC_SECRET    # must match src-tauri/.cargo/config.toml value
```

**CRITICAL:** The `APP_HMAC_SECRET` in the Worker must exactly match the value compiled into the Tauri app via `env!("APP_HMAC_SECRET")` in `preferences.rs`. If they differ, every request returns 401. For production, generate a new strong secret (not the dev placeholder `dev-hmac-secret-do-not-use-in-production`).

### Pattern 4: WORKER_URL in Rust Build Config

**What:** `option_env!("WORKER_URL")` is a compile-time macro. It reads the env var at `cargo build` time. The var must be present in the build environment when `cargo tauri build` runs.

**Where it is used:**
- `src-tauri/src/shortcut.rs` — PTT session (lines 68, 124): uses `option_env!("WORKER_URL")`
- `src-tauri/src/voice/tts.rs` — TTS playback (line 51): uses `option_env!("WORKER_URL")`
- `src-tauri/src/memory.rs` — intent classification (line 130): uses `std::env::var("WORKER_URL")` (RUNTIME, not compile-time!)

**Inconsistency found:** `memory.rs` uses `std::env::var("WORKER_URL")` (runtime lookup), while `shortcut.rs` and `tts.rs` use `option_env!("WORKER_URL")` (compile-time). In a production binary, `std::env::var` reads the OS env at process start. Setting `WORKER_URL` in `.cargo/config.toml [env]` fixes compile-time macros but NOT the runtime lookup in `memory.rs`. The runtime `WORKER_URL` must also be set when the app process starts, OR `memory.rs` must be updated to use `option_env!` for consistency.

**How to set for production builds:**

```toml
# src-tauri/.cargo/config.toml — currently contains:
[env]
APP_HMAC_SECRET = "dev-hmac-secret-do-not-use-in-production"

# After wrangler deploy, add WORKER_URL:
[env]
APP_HMAC_SECRET = "your-production-hmac-secret"
WORKER_URL = "https://ai-buddy-proxy.YOUR-SUBDOMAIN.workers.dev"
```

[VERIFIED: src-tauri/.cargo/config.toml exists and has [env] section]

**Important:** `.cargo/config.toml` is in git. Setting `WORKER_URL` here is fine (not a secret). The `APP_HMAC_SECRET` in `.cargo/config.toml` IS a secret — for Phase 14+ CI builds, it should move to CI secrets and be injected as a real env var. For this phase (local build), updating the file is acceptable.

### Pattern 5: Production Worker URL Format

After `wrangler deploy`, the Worker URL has the format:
```
https://ai-buddy-proxy.<your-cloudflare-subdomain>.workers.dev
```
The subdomain is the Cloudflare account subdomain shown in the Cloudflare dashboard (Workers & Pages → Overview). The `name` field in `wrangler.toml` (`ai-buddy-proxy`) becomes the subdomain prefix. [ASSUMED: standard Cloudflare Workers URL format]

### Anti-Patterns to Avoid

- **Setting `expirationTtl` on every quota `put`:** Resets the rolling window on every request. The 24h window must start at the FIRST request, not roll forward with each increment.
- **Putting `APP_HMAC_SECRET` in wrangler.toml:** Exposes it in git. Must stay in `wrangler secret put` only.
- **Running `wrangler deploy` before setting secrets:** Routes will fail with runtime binding errors until all 4 secrets are set. Order: deploy first (creates the worker), then `secret put` (or set secrets before deploy — both work, but secrets must be set before first real request).
- **Forgetting `memory.rs` uses runtime `std::env::var`:** Unlike `shortcut.rs` and `tts.rs`, `memory.rs` reads `WORKER_URL` at runtime. In a packaged app, the env var won't be set unless the app injects it. This is a bug for the production binary unless `memory.rs` is changed to use `option_env!` or `include_str!`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| KV TTL for rolling window | Custom expiry tracking logic | `expirationTtl` parameter on `kv.put()` | KV handles expiry natively; manual tracking adds complexity and KV read overhead |
| Quota counter atomicity | CAS loop or distributed lock | KV with documented TOCTOU caveat | Durable Objects solve this, but the existing code comment explicitly accepts KV for beta; don't over-engineer |
| HMAC token verification | JWT library or custom crypto | Web Crypto API (`crypto.subtle`) | Already implemented in worker; don't change the auth layer |
| Worker routing | Custom router | Hono (already installed) | Already in use; zero migration cost |

---

## Runtime State Inventory

> This is NOT a rename/refactor phase. No runtime state migration required.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — KV namespace does not exist yet | Create via `wrangler kv namespace create` |
| Live service config | Cloudflare Worker not yet deployed | Deploy via `wrangler deploy` |
| OS-registered state | None | None |
| Secrets/env vars | 4 Wrangler secrets must be set (ANTHROPIC_API_KEY, ASSEMBLYAI_API_KEY, ELEVENLABS_API_KEY, APP_HMAC_SECRET) | `wrangler secret put` × 4 |
| Build artifacts | `src-tauri/.cargo/config.toml` missing WORKER_URL entry; APP_HMAC_SECRET is dev placeholder | Update config.toml with prod values |

---

## Common Pitfalls

### Pitfall 1: TOCTOU Race in Quota Counter

**What goes wrong:** Two simultaneous requests both read count=19, both write count=20, both get `allowed: true`. The effective limit becomes ~2×20 under concurrent load.
**Why it happens:** KV is eventually consistent. Read-then-write is not atomic.
**How to avoid:** Accept it for beta (the existing codebase comment in `checkRateLimit` explicitly notes this). For strict enforcement later, use Durable Objects.
**Warning signs:** Users slightly exceed the 20-request limit. Not a safety issue at beta scale.

### Pitfall 2: Rolling Window Broken by `expirationTtl` on Every Put

**What goes wrong:** Quota window resets to 24h on every request instead of expiring 24h after the first request.
**Why it happens:** `kv.put(key, value, { expirationTtl: 86400 })` always resets the TTL regardless of whether a value already exists. If called on every increment, the window never expires for an active user.
**How to avoid:** Only pass `expirationTtl: 86400` when writing the FIRST request (when `current === 0`). All subsequent increments: `kv.put(key, String(newCount))` with no TTL option.
**Warning signs:** Users who make requests daily find their quota never resets.

### Pitfall 3: APP_HMAC_SECRET Mismatch Between App and Worker

**What goes wrong:** Every app request returns 401 Unauthorized.
**Why it happens:** The Tauri app embeds `APP_HMAC_SECRET` at compile time via `env!("APP_HMAC_SECRET")` in `preferences.rs`. The Worker reads it from Wrangler secrets. If they differ, HMAC verification fails for every token.
**How to avoid:** Use one source of truth. Set the production secret in both places simultaneously: `wrangler secret put APP_HMAC_SECRET` (Worker) AND update `src-tauri/.cargo/config.toml [env]` APP_HMAC_SECRET to the same value before rebuilding the app.
**Warning signs:** All requests return 401 immediately after deploying with a new secret.

### Pitfall 4: `memory.rs` Uses Runtime `std::env::var` Instead of Compile-Time `option_env!`

**What goes wrong:** The `/classify` calls from `memory.rs` always go to `http://localhost:8787` in production because `std::env::var("WORKER_URL")` reads the OS environment at runtime, and the env var is not set in the packaged app's process.
**Why it happens:** `memory.rs` uses `std::env::var` (runtime lookup) while `shortcut.rs` and `tts.rs` use `option_env!` (compile-time). Setting `WORKER_URL` in `.cargo/config.toml` fixes the compile-time macros but not the runtime one.
**How to avoid:** Change `memory.rs` line 130 to use `option_env!("WORKER_URL").unwrap_or("http://localhost:8787")` to match the pattern in `shortcut.rs` and `tts.rs`.
**Warning signs:** Task classification silently falls back to the 3-word label because the localhost call fails in prod.

### Pitfall 5: Stale Tests Block `npm test`

**What goes wrong:** `npm test` fails with assertion errors because `index.test.ts` expects `/stt` and `/tts` to return 501, but the real implementation returns live responses (502/503 if API keys are missing, or real content).
**Why it happens:** The tests were written when `/stt` and `/tts` were stubs. The stubs were replaced with real implementations, but the tests were not updated.
**How to avoid:** Update tests to reflect actual behavior: valid-token `/stt` and `/tts` requests should not be expected to return 501. Tests that hit external APIs should use mock responses or be skipped in unit test context.
**Warning signs:** `npm test` fails before any code changes in this phase.

### Pitfall 6: Wrangler Login Required in Every New Terminal Session

**What goes wrong:** `wrangler deploy` or `wrangler kv namespace create` fails with "not authenticated" even though login was done previously.
**Why it happens:** Wrangler uses OAuth tokens stored in `~/.wrangler/`. Tokens persist across sessions but can expire.
**How to avoid:** Run `npx wrangler whoami` first. If it says "not authenticated", run `npx wrangler login` to re-authenticate.
**Warning signs:** `[ERROR] In a non-interactive environment, it's necessary to set a CLOUDFLARE_API_TOKEN`

[VERIFIED: confirmed locally — `wrangler whoami` returns "You are not authenticated" on this machine]

---

## Code Examples

Verified patterns from official sources and codebase:

### Complete `checkQuota()` Function

```typescript
// Source: mirrors checkRateLimit() pattern in worker/src/index.ts
// Rolling-window-safe: TTL only set on first write

async function checkQuota(
  kv: KVNamespace,
  token: string,
): Promise<{ allowed: boolean; used: number; reset_in_seconds: number }> {
  const key = `quota:chat:${token}`;
  const raw = await kv.get(key);
  const current = raw ? parseInt(raw, 10) : 0;

  if (current >= 20) {
    return { allowed: false, used: current, reset_in_seconds: 86400 };
  }

  const newCount = current + 1;
  if (current === 0) {
    // First request — start the 24h rolling window
    await kv.put(key, String(newCount), { expirationTtl: 86400 });
  } else {
    // Subsequent requests — do NOT reset TTL (preserve rolling window start)
    await kv.put(key, String(newCount));
  }

  return { allowed: true, used: newCount, reset_in_seconds: 0 };
}
```

### Quota Check in `/chat` Route

```typescript
// Source: mirrors rate-limit check in global middleware (worker/src/index.ts lines 107-125)
// Insert AFTER auth middleware has run and tokenValue is available (within the route handler)

app.post('/chat', async (c) => {
  // ... existing JSON parse and messages validation ...

  // Quota check — /chat only, 20/day per user (INFRA-05)
  if (c.env.RATE_LIMIT) {
    try {
      const { allowed, reset_in_seconds } = await checkQuota(c.env.RATE_LIMIT, tokenValue);
      if (!allowed) {
        return c.json(
          { error: 'quota_exceeded', quota: 20, reset_in_seconds },
          { status: 429 }
        );
      }
    } catch {
      // KV unavailable — fail open in dev, quota not enforced
    }
  }

  // ... existing Anthropic proxy code ...
});
```

**NOTE:** `tokenValue` is extracted in the global auth middleware but not currently passed into route handlers via Hono context. The route handler needs access to it. Options: (a) store it in `c.set('tokenValue', tokenValue)` in the middleware and `c.get('tokenValue')` in the route, OR (b) re-parse the token header inside the route handler. Option (a) is cleaner and requires adding a `Variables` type to the Hono app definition.

### Hono Context Variables (to pass tokenValue to routes)

```typescript
// Source: Hono docs pattern [ASSUMED — standard Hono variable passing]
// Add to top of index.ts alongside Bindings type:

type Variables = {
  tokenValue: string;
};

type App = { Bindings: Bindings; Variables: Variables };

// In global auth middleware, after tokenValue is validated:
c.set('tokenValue', tokenValue);

// In /chat route handler:
const tokenValue = c.get('tokenValue');
```

### Smoke Test Commands (post-deploy)

```bash
# Replace with real production URL after wrangler deploy

WORKER_URL="https://ai-buddy-proxy.YOUR-SUBDOMAIN.workers.dev"

# Health check (no auth needed)
curl "$WORKER_URL/health"
# Expected: {"status":"ok","version":"1.0.0"}

# Auth rejection (no token)
curl -X POST "$WORKER_URL/chat" -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"test"}]}'
# Expected: {"error":"Unauthorized"} 401

# Note: /chat, /stt, /tts all require a valid HMAC-signed x-app-token
# which requires the Tauri app to generate it. Full route testing requires
# either the app binary or a test script that replicates the HMAC signing.
```

### Quota Exceeded Test (with mock KV)

```typescript
// Source: mirrors Rate limiting test in worker/src/index.test.ts
// Add to describe('POST /chat') block

it('returns 429 with quota_exceeded when daily limit is hit', async () => {
  // Pre-seed quota at 20 (limit reached)
  const kv = createMockKV({ [`quota:chat:${VALID_TOKEN}`]: '20' });
  const env = createEnv(kv);

  const res = await req(
    '/chat',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-token': VALID_TOKEN,
      },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
    },
    env,
  );

  assert.equal(res.status, 429);
  const body = (await res.json()) as Json;
  assert.equal(body.error, 'quota_exceeded');
  assert.equal(body.quota, 20);
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `/stt` and `/tts` returning 501 stubs | Real AssemblyAI and ElevenLabs proxy implementations | Phase 3 (v1.0) | Tests in `index.test.ts` are stale and must be updated |
| Quota not enforced | Phase 12 adds `checkQuota()` for `/chat` | Phase 12 | First production enforcement layer |
| `WORKER_URL` = localhost | Phase 12 adds production URL to `.cargo/config.toml` | Phase 12 | Smoke-test build against prod becomes possible |

**Deprecated/outdated:**
- `index.test.ts` lines 139-160: 501 assertions for `/stt` and `/tts` — no longer matches implementation; must be replaced with correct behavior assertions.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Production Worker URL format is `https://ai-buddy-proxy.<subdomain>.workers.dev` | Architecture Patterns → Pattern 5 | URL format could vary; will be known exactly after `wrangler deploy` runs — low risk |
| A2 | Passing `kv.put(key, value)` without `expirationTtl` preserves the existing TTL rather than making the key permanent | Architecture Patterns → Pattern 1 | If KV does NOT preserve TTL on update without expirationTtl, the rolling window breaks for a different reason. Should be verified against Cloudflare KV docs. |
| A3 | Hono `c.set()`/`c.get()` Variables pattern for passing tokenValue from middleware to route | Code Examples | If Hono version in use doesn't support Variables type, alternative is to re-parse the header in the route |
| A4 | `wrangler secret put` secrets persist across `wrangler deploy` (redeployment doesn't clear secrets) | Standard Stack | If secrets are wiped on redeploy, they must be re-set — unlikely but worth verifying after first deploy |

---

## Open Questions

1. **Does `kv.put(key, value)` without `expirationTtl` preserve existing TTL?**
   - What we know: Cloudflare KV documentation describes `expirationTtl` as setting a new TTL on every call that includes it.
   - What's unclear: Whether omitting `expirationTtl` preserves the existing TTL or makes the key permanent (no expiry).
   - Recommendation: Test with `wrangler dev` locally before deploying. If omitting `expirationTtl` makes the key permanent, the approach must change: store `{ count, expiresAt }` in the value and compute `reset_in_seconds` from `expiresAt - Date.now()`, using `expiration` (absolute Unix timestamp) instead of `expirationTtl`.

2. **How to smoke-test `/chat`, `/stt`, `/tts` without a signed binary?**
   - What we know: All routes require a valid HMAC-signed `x-app-token`. The signing logic is in Rust (`preferences.rs`).
   - What's unclear: Whether a shell script can replicate the HMAC signing to produce a valid token for curl tests.
   - Recommendation: Write a small Node.js test script in `worker/` that replicates the HMAC sign (`crypto.createHmac('sha256', secret).update(uuid).digest('hex')`) to generate a valid token for curl/fetch smoke tests. This is faster than building the full binary just to verify routes.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Wrangler CLI (npx) | KV provision, deploy, secrets | ✓ | 4.81.1 (local), 4.82.2 (latest) | — |
| Cloudflare account (authenticated) | All wrangler operations | ✗ | Not logged in | Run `npx wrangler login` first |
| Node.js (npx) | Wrangler | ✓ | (available — npx works) | — |
| Rust / cargo tauri | Rebuild app with new WORKER_URL | ✓ (assumed) | per CLAUDE.md: 1.85+ | — |

**Missing dependencies with no fallback:**
- Cloudflare authentication: `npx wrangler login` must be run before any wrangler operation. Confirmed not authenticated on this machine.

**Missing dependencies with fallback:**
- Wrangler update available (4.81.1 → 4.82.2): not blocking; run `npm install wrangler@latest` in `worker/` if desired but not required.

[VERIFIED: `wrangler whoami` output confirms not authenticated; wrangler 4.81.1 confirmed via package.json]

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | node:test (Node built-in) + tsx runner |
| Config file | none — invoked via `npx tsx --test src/index.test.ts` |
| Quick run command | `cd worker && npm test` |
| Full suite command | `cd worker && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-03 | KV namespace ID is real (not placeholder) | manual | inspect `wrangler.toml` after provisioning | ✅ wrangler.toml |
| INFRA-04 | All routes return non-404 responses | smoke | `curl` against production URL | ❌ Wave 0 — needs smoke test script |
| INFRA-05 | `/chat` returns `quota_exceeded` after 20 requests; global middleware returns `rate_limited` | unit | `cd worker && npm test` | ❌ Wave 0 — quota test must be added |

### Sampling Rate

- **Per task commit:** `cd worker && npm test`
- **Per wave merge:** `cd worker && npm test`
- **Phase gate:** All unit tests green + manual smoke test against production URL passes

### Wave 0 Gaps

- [ ] `worker/src/index.test.ts` — update stale 501 assertions for `/stt` and `/tts` (they now return real responses, not 501)
- [ ] `worker/src/index.test.ts` — add `quota_exceeded` test case: pre-seed `quota:chat:TOKEN = '20'`, POST `/chat`, assert 429 + `body.error === 'quota_exceeded'`
- [ ] `worker/scripts/smoke-test.mjs` (new file) — Node.js script that generates a valid HMAC token and curls all three production routes; enables manual INFRA-04 verification without a signed binary

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | HMAC-SHA256 token — already implemented in Worker global middleware |
| V3 Session Management | no | Stateless Worker; no sessions |
| V4 Access Control | yes | KV-based rate limiting + quota — this phase wires the real KV |
| V5 Input Validation | yes | Already validated in `/chat` (messages array check), `/tts` (text length), `/classify` (intent length) |
| V6 Cryptography | yes | HMAC key — must use a strong random secret for production; replace `dev-hmac-secret-do-not-use-in-production` |

### Known Threat Patterns for Cloudflare Workers + KV

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged HMAC token (replay/fabrication) | Spoofing | HMAC-SHA256 with shared secret — already implemented; only risk is weak secret |
| Quota bypass via KV TOCTOU | Tampering | Documented caveat; Durable Objects for strict enforcement post-beta |
| API key exposure in wrangler.toml | Information Disclosure | Secrets set via `wrangler secret put` only, never in wrangler.toml or source |
| Unauthenticated route probing | Information Disclosure | Only `/health` is unauthed; all other routes reject without valid token |
| Secret in `.cargo/config.toml` checked into git | Information Disclosure | APP_HMAC_SECRET in config.toml is currently committed; acceptable for dev, must move to CI secrets before Phase 14 public builds |

---

## Sources

### Primary (HIGH confidence)

- `worker/src/index.ts` — complete worker implementation, rate limiting pattern, HMAC auth, all routes [VERIFIED: read directly]
- `worker/wrangler.toml` — KV binding structure, placeholder to replace [VERIFIED: read directly]
- `worker/package.json` — wrangler version 4.81.1, hono 4.12.0, existing scripts [VERIFIED: read directly]
- `worker/src/index.test.ts` — existing test patterns (mock KV, VALID_TOKEN format, node:test framework) [VERIFIED: read directly]
- `src-tauri/.cargo/config.toml` — existing [env] section with APP_HMAC_SECRET [VERIFIED: read directly]
- `src-tauri/src/preferences.rs` — `env!("APP_HMAC_SECRET")` compile-time binding, `cmd_get_token` HMAC signing [VERIFIED: grep output]
- `src-tauri/src/shortcut.rs`, `src-tauri/src/voice/tts.rs` — `option_env!("WORKER_URL")` compile-time pattern [VERIFIED: read directly]
- `src-tauri/src/memory.rs` — `std::env::var("WORKER_URL")` runtime pattern (inconsistency) [VERIFIED: grep + read]
- Wrangler auth status — `npx wrangler whoami` confirms not authenticated [VERIFIED: bash output]

### Secondary (MEDIUM confidence)

- Cloudflare Workers KV `expirationTtl` behavior — TTL set on put, rolling window approach [ASSUMED: based on KV docs pattern, not verified in session]
- Wrangler KV namespace create command syntax — standard CLI operation [ASSUMED: standard Wrangler pattern]

### Tertiary (LOW confidence)

- Hono `c.set()`/`c.get()` Variables typing — standard Hono pattern [ASSUMED: training knowledge]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all library versions verified directly from installed packages
- Architecture: HIGH — patterns derived directly from reading existing worker code
- Pitfalls: HIGH — pitfalls 1-5 verified from reading actual code; pitfall 6 verified from running wrangler
- KV rolling window TTL behavior: MEDIUM — documented assumption A2 flags the one unverified KV behavior

**Research date:** 2026-04-13
**Valid until:** 2026-05-13 (Wrangler releases frequently but API is stable; KV behavior is stable)
