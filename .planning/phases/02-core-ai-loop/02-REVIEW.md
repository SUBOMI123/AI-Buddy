---
phase: 02-core-ai-loop
reviewed: 2026-04-09T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - src-tauri/src/screenshot.rs
  - src-tauri/src/preferences.rs
  - src-tauri/src/lib.rs
  - src/components/GuidanceList.tsx
  - src/components/LoadingDots.tsx
  - src/components/SidebarShell.tsx
  - src/lib/ai.ts
  - src/lib/tauri.ts
  - worker/src/index.ts
  - worker/wrangler.toml
  - src-tauri/Cargo.toml
  - src-tauri/.cargo/config.toml
findings:
  critical: 2
  warning: 3
  info: 2
  total: 7
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-04-09
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

The Phase 2 core AI loop implementation is well-structured: the Rust backend handles screen capture and HMAC signing, the SolidJS frontend manages the streaming UX, and the Cloudflare Worker proxies requests to Anthropic with auth and rate limiting. The main concerns are (1) a timing-attack-vulnerable HMAC comparison in the Worker auth middleware, (2) the Worker accepting client-controlled `system` and `model` fields without server-side enforcement, and (3) a development HMAC secret baked into the Cargo config that must not reach production.

## Critical Issues

### CR-01: Timing-attack-vulnerable HMAC signature comparison

**File:** `worker/src/index.ts:98`
**Issue:** The HMAC signature is compared using JavaScript `===` (string equality), which is not constant-time. An attacker can iteratively guess the correct signature byte-by-byte by measuring response time differences. While practical exploitation requires many requests and precise timing, this is a well-known vulnerability class for HMAC verification.
**Fix:**
```typescript
// Replace the direct === comparison (line 98) with a constant-time comparison.
// Cloudflare Workers support crypto.subtle.timingSafeEqual (via Node.js compat)
// or use a byte-by-byte XOR approach:

const sigBytes = new TextEncoder().encode(signature);
const expectedBytes = new TextEncoder().encode(expectedHex);

if (sigBytes.byteLength !== expectedBytes.byteLength) {
  return c.json({ error: 'Unauthorized' }, 401);
}

// crypto.subtle.timingSafeEqual is available in Workers with nodejs_compat
// Alternatively, implement constant-time compare:
let mismatch = 0;
for (let i = 0; i < sigBytes.byteLength; i++) {
  mismatch |= sigBytes[i] ^ expectedBytes[i];
}
if (mismatch !== 0) {
  return c.json({ error: 'Unauthorized' }, 401);
}
```

### CR-02: Client controls system prompt and model -- server should enforce

**File:** `worker/src/index.ts:158-162`
**Issue:** The Worker blindly passes `body.system` and `body.model` from the client request to Anthropic. A compromised or modified client can (a) inject an arbitrary system prompt to manipulate Claude's behavior (e.g., "ignore all safety guidelines"), and (b) specify an expensive model (e.g., `claude-3-opus`) to inflate API costs. The system prompt and model selection are security-relevant decisions that should be enforced server-side.
**Fix:**
```typescript
// In the /chat route handler, hardcode or allowlist system prompt and model:
const ALLOWED_MODELS = ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022'];
const model = ALLOWED_MODELS.includes(body.model as string)
  ? body.model
  : 'claude-sonnet-4-20250514';

// Enforce system prompt server-side (move SYSTEM_PROMPT to the Worker)
const SYSTEM_PROMPT = `You are AI Buddy, a real-time software guide...`; // full prompt here

body: JSON.stringify({
  model,
  messages: body.messages,
  system: SYSTEM_PROMPT,  // Server-controlled, not client-provided
  max_tokens: Math.min(Number(body.max_tokens) || 4096, 4096),
  stream: true,
}),
```

## Warnings

### WR-01: Development HMAC secret in version-controlled cargo config

**File:** `src-tauri/.cargo/config.toml:2`
**Issue:** The file contains `APP_HMAC_SECRET = "dev-hmac-secret-do-not-use-in-production"`. While clearly labeled as dev-only, this file is checked into version control. If the production build pipeline does not explicitly override this environment variable, the dev secret ships in the binary. An attacker who reads this value from the repo (or extracts it from the binary) can forge valid `x-app-token` headers.
**Fix:** Add a build-time check in `build.rs` or a runtime assertion that panics if the secret matches the dev placeholder in release mode:
```rust
// In src-tauri/build.rs or at the top of preferences.rs:
#[cfg(not(debug_assertions))]
const _: () = {
    if APP_HMAC_SECRET.as_bytes() == b"dev-hmac-secret-do-not-use-in-production" {
        panic!("APP_HMAC_SECRET must be overridden for release builds");
    }
};
```
Also add `src-tauri/.cargo/config.toml` to `.gitignore` and provide a `config.toml.example` instead.

### WR-02: No request body size limit on Worker /chat endpoint

**File:** `worker/src/index.ts:139-165`
**Issue:** The Worker parses the full JSON body from the client without any size constraint before proxying to Anthropic. A malicious client could send a very large body (e.g., repeated large base64 screenshots in many messages) to exhaust Worker memory or abuse the Anthropic API quota. Cloudflare Workers have a 128MB memory limit, and large payloads could cause OOM crashes.
**Fix:**
```typescript
// Add a size check before parsing JSON:
const contentLength = parseInt(c.req.header('content-length') || '0', 10);
if (contentLength > 5 * 1024 * 1024) { // 5MB max
  return c.json({ error: 'Request too large' }, 413);
}
```

### WR-03: onDone never called on error paths in streamGuidance

**File:** `src/lib/ai.ts:69-71`
**Issue:** When `response.ok` is false or `response.body` is null (line 69), `onError` is called but `onDone` is never called. Similarly, when the fetch itself throws a non-abort error (line 65), `onDone` is not called. The caller in `SidebarShell.tsx` uses `onDone` to finalize state. While the current caller handles errors separately, the `streamGuidance` contract is inconsistent: sometimes `onDone` fires, sometimes it does not. This can cause subtle bugs when new callers rely on `onDone` as a "finally" callback.
**Fix:** Call `onDone()` after `onError()` on all error paths, or document that `onDone` is only called on success. The cleaner fix:
```typescript
// At the end of streamGuidance, add a finally-like pattern:
// Option A: Always call onDone after onError
if (!response.ok || !response.body) {
  onError("Couldn't reach AI -- check your connection.");
  onDone();
  return;
}
```

## Info

### IN-01: Placeholder KV namespace ID in wrangler.toml

**File:** `worker/wrangler.toml:19`
**Issue:** The KV namespace ID is `"placeholder-create-via-wrangler"`. The comments explain how to create it, but deploying with this value will fail. Consider adding a CI check or a deploy script that validates the ID before `wrangler deploy`.
**Fix:** Add a pre-deploy validation step or a `deploy.sh` script that checks the ID is not the placeholder value.

### IN-02: Installation token logged in debug builds

**File:** `src-tauri/src/lib.rs:31`
**Issue:** The first 8 characters of the installation token are printed to stdout in debug builds via `println!`. While gated behind `#[cfg(debug_assertions)]`, this token is used for HMAC signing and should be treated as semi-sensitive. If debug builds are shared with testers, the token leaks in console output.
**Fix:** Consider removing or reducing this to a less identifying log (e.g., just "Installation token ready" without the value):
```rust
#[cfg(debug_assertions)]
println!("Installation token ready");
```

---

_Reviewed: 2026-04-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
