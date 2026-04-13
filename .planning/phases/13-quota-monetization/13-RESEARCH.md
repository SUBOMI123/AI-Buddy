# Phase 13: Quota & Monetization — Research

**Researched:** 2026-04-13
**Domain:** Cloudflare Worker + Stripe + SolidJS quota state
**Confidence:** HIGH (Worker/Stripe SDK), MEDIUM (SolidJS quota signal flow)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Quota display:**
- Persistent badge in `SidebarShell` header — "12 / 20 left today" — always visible when guidance has been used
- Updated from Worker response headers after every `/chat` call
- Soft-limit banner (dismissible inline) rendered above text input when ≤2 requests remain
- Quota-exceeded hard-limit: error replaces guidance, input NOT disabled, Upgrade CTA visible
- Components: `SidebarShell.tsx` (badge), `App.tsx`/`SessionFeed.tsx` (quota_exceeded handling), new `QuotaBanner.tsx`, `ai.ts` (parse `X-Quota-Remaining` header)

**STT quota:** 10 token requests/day (1 session = 1 token). Not duration-based. KV key: `quota:stt:${tokenValue}`, limit 10, expirationTtl: 86400 on first write only.

**TTS quota:** 10 TTS responses/day. KV key: `quota:tts:${tokenValue}`, same rolling 24h TTL.

**Stripe checkout flow:**
1. User clicks Upgrade → app calls Worker `/create-checkout` with `{ uuid: installationToken }`
2. Worker creates Stripe Checkout Session, `mode: 'subscription'`, `metadata: { installation_uuid: uuid }`
3. Worker returns `{ url: checkoutUrl }` → app opens URL in system browser
4. Stripe fires `checkout.session.completed` webhook → Worker writes `subscription:${uuid} = 'active'` in KV
5. User clicks "Payment complete? Refresh status" button → app calls `/refresh-subscription`

**User identity:** `installation_token` UUID from `preferences.rs` — already persisted, already sent via `x-app-token`

**No deep link for Phase 13:** `success_url` points to static page. Deep link deferred to v4.0.

**Subscription KV key:** `subscription:${installationUuid}` — values: `'active'` | `'cancelled'` | absent (free tier)

**Quota bypass:** Read `subscription:${uuid}` KV before all quota enforcement. If `'active'`, skip quota.

**New Worker endpoints:**
- `POST /create-checkout` — auth middleware applies, returns `{ url: string }`
- `POST /stripe-webhook` — NO auth middleware, Stripe signature validation instead
- `POST /refresh-subscription` — auth middleware applies, returns `{ status: 'active' | 'free' }`
- `GET /quota` — auth middleware applies, returns all three quota counts (chat/stt/tts)

**New secrets:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

### Claude's Discretion

None stated — all architectural decisions are locked.

### Deferred Ideas (OUT OF SCOPE)

- Deep link (ai-buddy:// scheme) after payment — v4.0
- Per-seat or team pricing — post-beta
- In-app Stripe Elements — post-beta
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| QUOT-01 | Free tier: 20 AI guidance queries/user/day, Worker-enforced | Phase 12 already ships checkQuota() for /chat — pattern to replicate for /stt and /tts |
| QUOT-02 | Free tier: 5 min STT/day (implemented as 10 sessions/day per CONTEXT.md) | STT quota uses same KV pattern as chat quota; key: `quota:stt:${tokenValue}` |
| QUOT-03 | Free tier: 10 TTS responses/day | TTS quota; key: `quota:tts:${tokenValue}` |
| QUOT-04 | quota_exceeded structured response on limit hit | Already implemented for /chat; extend to /stt and /tts with `service` field |
| QUOT-05 | App displays remaining quota inline | X-Quota-Remaining header from Worker → signal in SidebarShell |
| QUOT-06 | Paid subscribers bypass all quotas | subscription:${uuid} KV read before all checkQuota() calls |
| QUOT-07 | Rolling 24h window (not midnight UTC) | Already implemented in checkQuota(); first-write expirationTtl pattern |
| QUOT-08 | Soft-limit warning at ≤2 remaining | QuotaBanner.tsx component, derived from quota signal |
| PAY-01 | Stripe product created in Dashboard | Manual pre-requisite — price ID needed before /create-checkout works |
| PAY-02 | Upgrade opens system browser to Stripe Checkout | opener plugin already in Cargo.toml and npm — needs capability permission + openUrl() call |
| PAY-03 | Webhook updates subscriber status in KV | /stripe-webhook route with stripe-node constructEventAsync + KV write |
| PAY-04 | User identity = UUID persisted locally | Already exists: preferences.rs installation_token, sent via x-app-token header |
| PAY-05 | /refresh-subscription after Checkout, UI updates without restart | /refresh-subscription endpoint + SolidJS signal for paid status |
</phase_requirements>

---

## Summary

Phase 13 has two independent subsystems: (1) Worker quota enforcement and Stripe subscription wiring, and (2) app-side quota display and upgrade flow. Both are well-understood — the Worker already has the exact pattern to replicate (checkQuota() from Phase 12), and Stripe now ships a native-compatible SDK for Cloudflare Workers.

The Stripe integration does NOT require raw Web Crypto HMAC — the `stripe` npm package (v22.0.1) supports Cloudflare Workers natively using `stripe.webhooks.constructEventAsync()` with `Stripe.createSubtleCryptoProvider()`. Install `stripe` in the worker package and use the SDK. This eliminates the need to hand-roll HMAC verification.

The app-side opener flow is already wired: `tauri-plugin-opener` is in Cargo.toml and `@tauri-apps/plugin-opener` is in package.json. The Rust plugin just needs to be initialized in `lib.rs` and the `opener:allow-open-url` permission added to `capabilities/default.json`.

**Primary recommendation:** Use `stripe` npm SDK in Worker (not raw fetch to stripe.com), use `createSignal` for quota state in SidebarShell (no need for a store — scalar values), wire opener plugin by adding two lines to lib.rs and one permission entry.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| stripe (npm) | 22.0.1 | Stripe Checkout Session creation + webhook verification in Worker | Official SDK, native Cloudflare Workers support via `createFetchHttpClient()` + `createSubtleCryptoProvider()`; no node_compat needed as of v11.10+ |
| hono | 4.12.0 | Worker routing — already installed | Existing stack; `/stripe-webhook` route bypasses the global auth middleware by registering before it or using a path-specific skip |
| @tauri-apps/plugin-opener | ^2 | Open Stripe Checkout URL in system browser | Already in package.json; preferred over deprecated shell.open |
| tauri-plugin-opener | 2 | Rust-side plugin init for opener | Already in Cargo.toml — just needs init() call in lib.rs |

[VERIFIED: npm registry] stripe@22.0.1 is the current latest.
[VERIFIED: worker/package.json] hono@^4.12.0 already installed.
[VERIFIED: package.json line 19] @tauri-apps/plugin-opener@^2 already installed.
[VERIFIED: src-tauri/Cargo.toml] tauri-plugin-opener = "2" already present.

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @cloudflare/workers-types | ^4.20250327.0 | TypeScript types for KV, etc. | Already installed — add Stripe Bindings type extension |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| stripe npm SDK | Raw fetch to api.stripe.com with form-encoded body | SDK is cleaner, types are better, webhook verification is one call vs. 30 lines of Web Crypto HMAC |
| openUrl() from plugin-opener | invoke() to a custom Tauri command | Plugin-opener is the official Tauri v2 way; custom command adds unnecessary Rust boilerplate |

**Installation:**
```bash
# In /worker:
npm install stripe
# Already installed (no action needed):
# @tauri-apps/plugin-opener (package.json)
# tauri-plugin-opener (Cargo.toml)
```

---

## Architecture Patterns

### Worker: Stripe SDK Initialization Pattern

```typescript
// Source: blog.cloudflare.com/announcing-stripe-support-in-workers/ + hono.dev/examples/stripe-webhook
import Stripe from 'stripe';

// In the route handler (or factored into a helper):
const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, {
  httpClient: Stripe.createFetchHttpClient(),
});
```

[CITED: blog.cloudflare.com/announcing-stripe-support-in-workers/]

### Worker: Create Checkout Session Pattern

```typescript
// Source: Stripe API docs + Cloudflare Workers blog
app.post('/create-checkout', async (c) => {
  const { uuid } = await c.req.json<{ uuid: string }>();
  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
  });

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: PRICE_ID, quantity: 1 }],
    metadata: { installation_uuid: uuid },
    success_url: 'https://your-domain.com/success',
    cancel_url:  'https://your-domain.com/cancel',
  });

  return c.json({ url: session.url });
});
```

The `PRICE_ID` is the Stripe Dashboard price ID (created manually as PAY-01). Store as a Worker env var or hardcode in source — it is not a secret.

[CITED: docs.stripe.com/api/checkout/sessions/create]

### Worker: Webhook Signature Verification Pattern

```typescript
// Source: hono.dev/examples/stripe-webhook
app.post('/stripe-webhook', async (c) => {
  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
  });

  const signature = c.req.header('stripe-signature');
  if (!signature) return c.text('', 400);

  const body = await c.req.text();  // CRITICAL: raw text, not .json()

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      c.env.STRIPE_WEBHOOK_SECRET,
      undefined,
      Stripe.createSubtleCryptoProvider(),  // Web Crypto — no node_compat needed
    );
  } catch (err) {
    return c.text(`Webhook signature verification failed`, 400);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const uuid = session.metadata?.installation_uuid;
    if (uuid) {
      await c.env.RATE_LIMIT.put(`subscription:${uuid}`, 'active');
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    // Extract UUID from subscription metadata
    const sub = event.data.object as Stripe.Subscription;
    const uuid = sub.metadata?.installation_uuid;
    if (uuid) {
      await c.env.RATE_LIMIT.put(`subscription:${uuid}`, 'cancelled');
    }
  }

  return c.text('', 200);
});
```

**Critical pitfall:** The webhook route must NOT be inside the global auth middleware scope. In Hono, the global `app.use('*', ...)` middleware applies to all routes. You must either: (a) check the path and skip (`if (c.req.path === '/stripe-webhook') return next()`) in the existing middleware, or (b) create a separate Hono instance. Option (a) is the simplest change to the existing pattern.

[CITED: hono.dev/examples/stripe-webhook]

### Worker: subscription:${uuid} Bypass Pattern

```typescript
// Before any quota check (applies to /chat, /stt, /tts):
async function isSubscribed(kv: KVNamespace, uuid: string): Promise<boolean> {
  const status = await kv.get(`subscription:${uuid}`);
  return status === 'active';
}

// In /chat route, before checkQuota():
if (c.env.RATE_LIMIT) {
  const subscribed = await isSubscribed(c.env.RATE_LIMIT, c.get('tokenValue'));
  if (!subscribed) {
    const { allowed, reset_in_seconds } = await checkQuota(c.env.RATE_LIMIT, c.get('tokenValue'), 'chat', 20);
    if (!allowed) {
      return c.json({ error: 'quota_exceeded', service: 'chat', quota: 20, reset_in_seconds }, 429);
    }
  }
}
```

### Worker: /refresh-subscription Pattern

The `/refresh-subscription` endpoint must look up the current Stripe subscription status by the installation UUID. Stripe's Search API supports `metadata['field_name']:'value'` queries on subscriptions — this is how you find a subscription without storing a Stripe customer ID.

```typescript
// Source: docs.stripe.com/api/subscriptions/search
app.post('/refresh-subscription', async (c) => {
  const uuid = c.get('tokenValue');
  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
  });

  const results = await stripe.subscriptions.search({
    query: `metadata['installation_uuid']:'${uuid}' AND status:'active'`,
    limit: 1,
  });

  const isActive = results.data.length > 0;
  const newStatus = isActive ? 'active' : 'cancelled';
  await c.env.RATE_LIMIT.put(`subscription:${uuid}`, newStatus);

  return c.json({ status: isActive ? 'active' : 'free' });
});
```

**Search API limitation:** Stripe Search is eventually consistent — propagation up to 1 hour during outages. Normal case is < 1 minute. This is acceptable for /refresh-subscription (user-initiated). The webhook path is the primary source of truth.

[CITED: docs.stripe.com/api/subscriptions/search]

### Worker: /quota Endpoint Pattern

Returns all three quota counts for UI initialization and post-payment refresh.

```typescript
app.get('/quota', async (c) => {
  const uuid = c.get('tokenValue');
  const kv = c.env.RATE_LIMIT;

  const [chatRaw, sttRaw, ttsRaw, subRaw] = await Promise.all([
    kv.get(`quota:chat:${uuid}`),
    kv.get(`quota:stt:${uuid}`),
    kv.get(`quota:tts:${uuid}`),
    kv.get(`subscription:${uuid}`),
  ]);

  const subscribed = subRaw === 'active';

  return c.json({
    subscribed,
    chat:  { used: parseInt(chatRaw  ?? '0', 10), limit: 20 },
    stt:   { used: parseInt(sttRaw   ?? '0', 10), limit: 10 },
    tts:   { used: parseInt(ttsRaw   ?? '0', 10), limit: 10 },
  });
});
```

### Worker: X-Quota-Remaining Header Pattern

After a successful `/chat` response, include the remaining count so the UI can update without a separate /quota call.

```typescript
// After quota check passes (in /chat, /stt, /tts):
const remaining = LIMIT - newCount;
c.header('X-Quota-Remaining', String(remaining));
c.header('X-Quota-Limit',     String(LIMIT));
```

Note: The existing `/chat` route returns `new Response(response.body, {...})` — a raw Response that bypasses Hono's `c.header()`. To attach headers to the SSE stream response, you must include them in the raw Response headers object directly, not via `c.header()`. See Common Pitfalls section.

### App-Side: Quota State in SolidJS

`createSignal` is sufficient — quota is three scalar counters and a boolean flag. No need for `createStore`.

```typescript
// In SidebarShell.tsx (or hoisted to a shared quota.ts module):
const [quotaChat,  setQuotaChat]  = createSignal<number | null>(null);  // remaining
const [quotaStt,   setQuotaStt]   = createSignal<number | null>(null);
const [quotaTts,   setQuotaTts]   = createSignal<number | null>(null);
const [isSubscribed, setIsSubscribed] = createSignal(false);

// Derived soft-limit signal:
const showSoftLimitWarning = () =>
  !isSubscribed() && quotaChat() !== null && quotaChat()! <= 2;
```

Update after every `/chat` call by parsing the `X-Quota-Remaining` header from the Worker response. The header is read in `ai.ts` before the SSE stream consumes the body — Response headers are available immediately on `fetch()` resolve, before the body is read.

```typescript
// In streamGuidance(), after `response = await fetch(...)` succeeds:
const remaining = response.headers.get('X-Quota-Remaining');
const limit     = response.headers.get('X-Quota-Limit');
if (remaining !== null && opts.onQuotaUpdate) {
  opts.onQuotaUpdate({ remaining: parseInt(remaining, 10), limit: parseInt(limit ?? '20', 10) });
}
```

Add `onQuotaUpdate?: (q: { remaining: number; limit: number }) => void` to `StreamGuidanceOptions`.

### App-Side: opener Plugin Integration

The opener plugin is already present in Cargo.toml and package.json but NOT yet initialized in lib.rs. Two additions needed:

**1. lib.rs — add plugin init:**
```rust
.plugin(tauri_plugin_opener::init())
```

**2. capabilities/default.json — add permission:**
```json
"opener:allow-open-url"
```

Note: The default permission set for `opener:allow-open-url` permits `https://` and `http://` URLs without an explicit allow-list. Since the Stripe Checkout URL is dynamically generated (unknown at build time), the default permission is sufficient — no `allow: [{ url: "..." }]` needed.

[CITED: v2.tauri.app/plugin/opener/]

**3. TypeScript usage in SidebarShell.tsx:**
```typescript
import { openUrl } from '@tauri-apps/plugin-opener';

const handleUpgrade = async () => {
  const token = await getInstallationToken();
  const uuid  = token.split('.')[0];  // UUID is the part before the HMAC signature
  const res   = await fetch(`${WORKER_URL}/create-checkout`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'x-app-token': token },
    body:    JSON.stringify({ uuid }),
  });
  const { url } = await res.json<{ url: string }>();
  await openUrl(url);
};
```

### Hono Bindings Type Extension

Add Stripe secrets to the `Bindings` type in `worker/src/index.ts`:

```typescript
type Bindings = {
  ANTHROPIC_API_KEY:     string;
  ASSEMBLYAI_API_KEY:    string;
  ELEVENLABS_API_KEY:    string;
  APP_HMAC_SECRET:       string;
  STRIPE_SECRET_KEY:     string;   // NEW
  STRIPE_WEBHOOK_SECRET: string;   // NEW
  STRIPE_PRICE_ID:       string;   // NEW (non-secret, but convenient as env var)
  RATE_LIMIT:            KVNamespace;
};
```

### Recommended Project Structure (additions only)

```
src/
├── components/
│   ├── QuotaBanner.tsx      # NEW — soft-limit warning (≤2 remaining), includes Upgrade CTA
│   └── SidebarShell.tsx     # MODIFIED — add quota badge in header, quota signals
src/lib/
│   └── ai.ts                # MODIFIED — add onQuotaUpdate callback, parse X-Quota-Remaining
worker/src/
│   └── index.ts             # MODIFIED — Stripe endpoints, STT/TTS quota, subscription bypass
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Stripe webhook signature verification | Custom HMAC-SHA256 Web Crypto code | `stripe.webhooks.constructEventAsync()` with `createSubtleCryptoProvider()` | 30+ lines of crypto vs. 3 lines; Stripe SDK handles timing-safe comparison, replay prevention, and timestamp tolerance automatically |
| Stripe Checkout Session creation | Raw `fetch('https://api.stripe.com/v1/checkout/sessions', { body: new URLSearchParams(...) })` | `stripe.checkout.sessions.create({})` | URL-encoding nested parameters (line_items[0][price], metadata[key]) is error-prone; SDK handles serialization |
| Opening system browser | Custom Tauri command with `open::that()` Rust crate | `@tauri-apps/plugin-opener` + `openUrl()` | Plugin already installed; Rust `open` crate would require adding it to Cargo.toml and writing a Tauri command wrapper |

**Key insight:** The `stripe` npm SDK version 17+ works natively in Cloudflare Workers without Node.js compat mode. Using raw fetch to api.stripe.com adds significant complexity with zero benefit.

---

## Common Pitfalls

### Pitfall 1: Hono c.header() Doesn't Apply to raw Response() Returns
**What goes wrong:** Setting `c.header('X-Quota-Remaining', '15')` before returning `new Response(stream, { headers: {...} })` — the header is NOT on the final response. Hono's `c.header()` only attaches to responses built via `c.json()`, `c.text()`, or Hono's Response builder.
**Why it happens:** The `/chat` route currently returns `new Response(response.body, { status, headers })` to pass through the SSE stream. This bypasses Hono's response wrapper entirely.
**How to avoid:** Merge the quota header directly into the raw Response headers:
```typescript
return new Response(response.body, {
  status: response.status,
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'X-Quota-Remaining': String(remaining),
    'X-Quota-Limit': '20',
  },
});
```
**Warning signs:** Header is set in worker code but not visible in client-side `response.headers.get(...)`.

### Pitfall 2: Reading Request Body Twice in Webhook Handler
**What goes wrong:** Calling `c.req.json()` AND then `c.req.text()` (or vice versa) — the second read returns empty.
**Why it happens:** Web Streams are single-use; the Request body is consumed on first read.
**How to avoid:** In `/stripe-webhook`, use only `c.req.text()` — pass raw string to `constructEventAsync`. Never call `.json()` before `.text()` in this route.
**Warning signs:** `constructEventAsync` throws "No signatures found matching the expected signature for payload" — this can indicate body was already consumed or mutated.

### Pitfall 3: Webhook Route Getting 401 from Auth Middleware
**What goes wrong:** The global `app.use('*', ...)` auth middleware runs before `/stripe-webhook`, rejecting Stripe's POST (no `x-app-token` header on Stripe requests).
**Why it happens:** Hono's `app.use('*', ...)` runs for every path including `/stripe-webhook`.
**How to avoid:** Add a path exclusion to the existing auth middleware (alongside the existing `/health` exclusion):
```typescript
if (c.req.path === '/health' || c.req.path === '/stripe-webhook') {
  return next();
}
```
**Warning signs:** Stripe Dashboard shows webhook delivery failures with HTTP 401.

### Pitfall 4: TTS/SSE Response and quota header visibility
**What goes wrong:** `/tts` returns `new Response(elevenResponse.body, { headers: {...} })` — same raw Response pattern as `/chat`. Quota header for TTS must also be injected directly into the headers object, not via `c.header()`.
**Why it happens:** Same as Pitfall 1 — TTS route streams binary audio, uses raw Response.
**How to avoid:** Same fix — inject into the headers literal in the TTS return statement.

### Pitfall 5: customer.subscription.deleted event missing UUID
**What goes wrong:** The `customer.subscription.deleted` event's metadata may not contain `installation_uuid` if it was set on the Checkout Session but not propagated to the Subscription object.
**Why it happens:** Stripe has two metadata locations: Checkout Session metadata and Subscription metadata. These are separate objects. Setting `metadata` at the top level of `sessions.create()` applies to the Session, not the Subscription.
**How to avoid:** Use `subscription_data: { metadata: { installation_uuid: uuid } }` in `sessions.create()` — this propagates metadata to the created Subscription object. Also set top-level `metadata` for the Session itself. Both:
```typescript
{
  metadata: { installation_uuid: uuid },           // on Session
  subscription_data: { metadata: { installation_uuid: uuid } },  // on Subscription
}
```
**Warning signs:** `sub.metadata?.installation_uuid` is undefined in the webhook handler for deletion events.

### Pitfall 6: Stripe Search is Eventually Consistent
**What goes wrong:** User completes payment, immediately clicks "Refresh status", `/refresh-subscription` searches Stripe subscriptions by metadata — subscription not yet indexed, returns empty, KV written as `'cancelled'`.
**Why it happens:** Stripe Search propagation can take up to 1 minute normally, and longer during incidents.
**How to avoid:** The webhook is the primary write path. `/refresh-subscription` is a secondary sync. Document this tradeoff in code comments — if search returns empty, check if KV already shows `'active'` (from webhook) and preserve that state. Alternatively: on empty search result, return current KV state rather than forcing `'cancelled'`.

### Pitfall 7: X-Quota-Remaining visible to CORS preflight but blocked in app
**What goes wrong:** Custom response headers (`X-Quota-Remaining`) are blocked by CORS when accessed from the WebView.
**Why it happens:** Browsers enforce "simple headers" vs "exposed headers". Custom headers must be listed in `Access-Control-Expose-Headers`.
**How to avoid:** The existing Hono CORS middleware exposes only default simple headers. Add explicit exposure:
```typescript
app.use('*', cors({
  origin: ['http://localhost:1420', 'tauri://localhost'],
  exposeHeaders: ['X-Quota-Remaining', 'X-Quota-Limit', 'X-RateLimit-Remaining'],
}));
```
Note: Tauri WebView requests from Rust (via `reqwest`) are not browser requests and bypass CORS. This only affects frontend `fetch()` calls from the SolidJS layer (e.g., the `/quota` endpoint fetch and future `/chat` header reads).

---

## Code Examples

### STT quota check (replicates checkQuota() from Phase 12)

```typescript
// Source: existing checkQuota() in worker/src/index.ts — Phase 12 pattern
async function checkQuotaStt(
  kv: KVNamespace,
  token: string,
): Promise<{ allowed: boolean; used: number; reset_in_seconds: number }> {
  const key = `quota:stt:${token}`;
  const raw = await kv.get(key);
  const current = raw ? parseInt(raw, 10) : 0;

  if (current >= 10) {
    return { allowed: false, used: current, reset_in_seconds: 86400 };
  }

  const newCount = current + 1;
  if (current === 0) {
    await kv.put(key, String(newCount), { expirationTtl: 86400 });
  } else {
    await kv.put(key, String(newCount));
  }

  return { allowed: true, used: newCount, reset_in_seconds: 0 };
}
```

### Refactored generic checkQuota() (optional — reduces repetition)

```typescript
// Generalise Phase 12's checkQuota to take service + limit params:
async function checkQuota(
  kv: KVNamespace,
  token: string,
  service: 'chat' | 'stt' | 'tts',
  limit: number,
): Promise<{ allowed: boolean; used: number; remaining: number; reset_in_seconds: number }> {
  const key = `quota:${service}:${token}`;
  const raw = await kv.get(key);
  const current = raw ? parseInt(raw, 10) : 0;

  if (current >= limit) {
    return { allowed: false, used: current, remaining: 0, reset_in_seconds: 86400 };
  }

  const newCount = current + 1;
  if (current === 0) {
    await kv.put(key, String(newCount), { expirationTtl: 86400 });
  } else {
    await kv.put(key, String(newCount));
  }

  return { allowed: true, used: newCount, remaining: limit - newCount, reset_in_seconds: 0 };
}
```

This is a pure refactor of Phase 12's implementation — same behavior, same TTL semantics, parameterized.

### QuotaBanner component skeleton

```tsx
// src/components/QuotaBanner.tsx
import { Show } from "solid-js";

interface Props {
  remaining: number;
  onDismiss: () => void;
  onUpgrade: () => void;
}

export function QuotaBanner(props: Props) {
  return (
    <Show when={props.remaining <= 2 && props.remaining >= 0}>
      <div class="quota-banner">
        <span>{props.remaining} AI {props.remaining === 1 ? 'request' : 'requests'} left today</span>
        <button onClick={props.onUpgrade}>Upgrade</button>
        <button onClick={props.onDismiss}>✕</button>
      </div>
    </Show>
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `shell.open()` for URLs | `openUrl()` from `@tauri-apps/plugin-opener` | Tauri 2.1.0 | shell.open is deprecated; opener plugin is the canonical path |
| `stripe.webhooks.constructEvent()` (sync) | `stripe.webhooks.constructEventAsync()` with `createSubtleCryptoProvider()` | stripe-node v11.10+ | Async required in Cloudflare Workers (no Node.js crypto module) |
| node_compat = true in wrangler.toml | No node_compat needed with stripe v17+ | 2023 | Wrangler bundles are smaller; stripe imports from `stripe/lib/stripe.js` |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `opener:allow-open-url` default permission allows any `https://` URL without explicit allow-list, including dynamic Stripe Checkout URLs | Architecture Patterns / opener | If wrong: Stripe Checkout URL is blocked by Tauri capability system; fix is adding a wildcard `https://checkout.stripe.com/*` allow entry in capabilities |
| A2 | `customer.subscription.deleted` Stripe webhook event contains subscription metadata (set via `subscription_data.metadata`) | Code Examples / Pitfall 5 | If wrong: cancellation detection via webhook fails; fix is to store customer ID in KV at checkout and look up by customer_id instead |
| A3 | Stripe subscription metadata search (`metadata['installation_uuid']:'...'`) is a supported query field for subscriptions | Architecture Patterns / refresh-subscription | If wrong: /refresh-subscription cannot find subscription by UUID; fix is to store Stripe customer_id in KV at webhook time and use `customer:'cus_xxx'` filter instead |

---

## Open Questions

1. **Stripe product + price ID (PAY-01)**
   - What we know: A Stripe Price ID (format `price_xxx`) must exist before `/create-checkout` can be coded or tested
   - What's unclear: Whether PAY-01 is done as a manual pre-step before the coding plan, or whether it's a task in the plan itself
   - Recommendation: Make PAY-01 Wave 0 task — "Create Stripe product and price in Dashboard, record the `price_xxx` ID". All other Stripe tasks depend on this ID existing.

2. **Stripe Checkout success/cancel URLs**
   - What we know: CONTEXT.md says success_url points to "a static 'Payment complete — return to app' page"
   - What's unclear: Where is this page hosted? A Cloudflare Worker route serving static HTML? Or an external page?
   - Recommendation: Serve a minimal static HTML page from the existing Worker at `/checkout-success` — keeps everything in one deployment. Alternatively, use a GitHub Pages URL. Either works for beta.

3. **Subscription metadata on checkout.session.completed vs subscription object**
   - What we know: Setting top-level `metadata` in `sessions.create()` attaches to the Session object. Setting `subscription_data.metadata` attaches to the Subscription.
   - What's unclear: Does `checkout.session.completed` event include the Session's metadata or the Subscription's metadata?
   - Recommendation: Set metadata in BOTH places (documented in Pitfall 5). The `checkout.session.completed` event's `event.data.object` is the Session — so `session.metadata.installation_uuid` is available. The `customer.subscription.deleted` event's object is the Subscription — so you need `subscription_data.metadata` for that path.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node / npm | Worker dev + deploy | ✓ | node v24.2.0, wrangler 4.82.2 | — |
| Stripe account | PAY-01 | Unknown | — | None — blocking |
| STRIPE_SECRET_KEY secret | /create-checkout, /stripe-webhook | Unknown | — | Cannot test Stripe routes without it |
| STRIPE_WEBHOOK_SECRET | /stripe-webhook | Unknown | — | Cannot verify webhooks without it |
| Stripe price_id (product) | /create-checkout | Unknown | — | Blocking — must exist before code runs |

**Missing dependencies with no fallback:**
- Stripe account + product/price setup (PAY-01) — required before any Stripe endpoint works
- STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET — required Worker secrets (set via `wrangler secret put`)

**Missing dependencies with fallback:**
- None in this category.

**Note:** The opener plugin is already installed on both Rust and JS sides. The only gap is the `lib.rs` init call and the capability permission entry — both are code changes, not environment dependencies.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (built-in) + tsx runner |
| Config file | none — run via `npx tsx --test src/index.test.ts` |
| Quick run command | `npm test` (in `/worker`) |
| Full suite command | `npm test` (same — single test file) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QUOT-01 | /chat returns quota_exceeded after 20 calls | unit | `npm test` (in /worker) | ✅ already passes |
| QUOT-02 | /stt returns quota_exceeded after 10 sessions | unit | `npm test` | ❌ Wave 0 |
| QUOT-03 | /tts returns quota_exceeded after 10 responses | unit | `npm test` | ❌ Wave 0 |
| QUOT-04 | quota_exceeded has service field | unit | `npm test` | ❌ Wave 0 |
| QUOT-05 | X-Quota-Remaining header present on /chat success | unit | `npm test` | ❌ Wave 0 |
| QUOT-06 | subscription:active KV → quota bypass on /chat | unit | `npm test` | ❌ Wave 0 |
| QUOT-07 | Rolling 24h TTL set only on first write | unit (existing pattern) | `npm test` | ✅ already tested via chat quota |
| QUOT-08 | UI soft-limit warning — ≤2 remaining | manual smoke | visual check | N/A |
| PAY-01 | Stripe product exists | manual | Stripe Dashboard | N/A |
| PAY-02 | Upgrade opens browser | manual smoke | run app, click Upgrade | N/A |
| PAY-03 | /stripe-webhook writes subscription:active | unit | `npm test` | ❌ Wave 0 |
| PAY-04 | UUID sent via x-app-token | unit (existing) | `npm test` | ✅ existing auth tests |
| PAY-05 | /refresh-subscription updates KV + returns status | unit | `npm test` | ❌ Wave 0 |

### Wave 0 Gaps
- [ ] Add STT quota test: `describe('POST /stt quota')` — pre-seed `quota:stt:TOKEN = '10'`, assert 429 + `error === 'quota_exceeded'` + `service === 'stt'`
- [ ] Add TTS quota test: same pattern with `quota:tts:TOKEN = '10'`
- [ ] Add subscription bypass test: pre-seed `subscription:TOKEN_UUID = 'active'`, assert /chat does not return quota_exceeded even when `quota:chat:TOKEN = '20'`
- [ ] Add X-Quota-Remaining header test: assert header present on /chat 400 response (Pitfall 2 from Phase 12 note: use missing body path to avoid outbound Anthropic call)
- [ ] Add /stripe-webhook test: verify 400 on missing stripe-signature, verify 200 on valid mock event, verify KV write
- [ ] Add /refresh-subscription test: verify returns `{ status: 'active' }` when `subscription:uuid = 'active'` in KV

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | HMAC-signed app token (existing) — webhook bypasses with Stripe sig verification |
| V3 Session Management | no | Stateless Worker; no sessions |
| V4 Access Control | yes | Subscription check before quota bypass — verify KV value is exactly `'active'`, not truthy |
| V5 Input Validation | yes | Validate `uuid` in /create-checkout body; validate `stripe-signature` header presence |
| V6 Cryptography | yes | Stripe SDK `constructEventAsync` + SubtleCrypto — never hand-roll |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged subscription:${uuid} KV write | Tampering | Only Worker can write KV; /stripe-webhook validates Stripe signature before writing |
| Replay attack on webhook | Repudiation | Stripe SDK `constructEventAsync` enforces timestamp tolerance (5 minutes) — included automatically |
| UUID enumeration to steal subscription | Information Disclosure | UUID is a V4 random UUID — 2^122 space, not guessable |
| User sets their own x-app-token to a known-subscribed UUID | Elevation of Privilege | HMAC signature on token prevents forging; Worker validates signature before extracting UUID |
| Stripe Checkout URL interception (MITM) | Information Disclosure | URL returned over HTTPS from Worker; Tauri opener passes to OS default browser over HTTPS |

---

## Sources

### Primary (HIGH confidence)
- [VERIFIED: npm registry] stripe@22.0.1 — confirmed current latest
- [CITED: hono.dev/examples/stripe-webhook] — Hono + Stripe webhook pattern with `constructEventAsync`
- [CITED: blog.cloudflare.com/announcing-stripe-support-in-workers/] — Stripe SDK native Cloudflare Workers support
- [CITED: v2.tauri.app/plugin/opener/] — opener plugin installation, TypeScript API, capabilities
- [CITED: docs.stripe.com/api/checkout/sessions/create] — Checkout Session required params + metadata
- [CITED: docs.stripe.com/api/subscriptions/search] — search by metadata query syntax

### Secondary (MEDIUM confidence)
- [VERIFIED: worker/src/index.ts + 12-01-SUMMARY.md] — existing checkQuota() pattern, TOCTOU caveat
- [VERIFIED: src-tauri/Cargo.toml] — tauri-plugin-opener = "2" already present
- [VERIFIED: package.json] — @tauri-apps/plugin-opener@^2 already installed
- [VERIFIED: src-tauri/src/lib.rs] — opener plugin NOT yet initialized (missing `.plugin(tauri_plugin_opener::init())`)
- [VERIFIED: src-tauri/capabilities/default.json] — `opener:allow-open-url` permission NOT yet present

### Tertiary (LOW confidence)
- [ASSUMED] — opener:allow-open-url default permits any https:// without explicit allow entries (see A1)
- [ASSUMED] — Stripe subscription metadata propagates from subscription_data.metadata to subscription object for deletion event (see A2, A3)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified npm versions and existing Cargo.toml/package.json
- Architecture (Worker): HIGH — cited from Hono official example and Stripe Cloudflare blog
- Architecture (App-side opener): HIGH — verified plugin already installed, only init step missing
- Pitfalls: HIGH for P1-P4 (found via prior Phase 12 experience and Hono SSE pattern), MEDIUM for P5-P7 (Stripe-specific, from docs)
- Stripe metadata propagation: MEDIUM (A2, A3 are assumed)

**Research date:** 2026-04-13
**Valid until:** 2026-05-13 (Stripe API stable; Tauri plugin API stable for v2.x)
