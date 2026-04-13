import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import app from './index.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

// ---------------------------------------------------------------------------
// Mock KV Namespace
// ---------------------------------------------------------------------------

function createMockKV(initialStore: Record<string, string> = {}): KVNamespace {
  const store: Record<string, string> = { ...initialStore };
  const putCalls: Array<{ key: string; value: string; opts?: unknown }> = [];
  const kv = {
    get(key: string) {
      return Promise.resolve(store[key] ?? null);
    },
    put(key: string, value: string, opts?: unknown) {
      store[key] = value;
      putCalls.push({ key, value, opts });
      return Promise.resolve();
    },
    delete(_key: string) {
      return Promise.resolve();
    },
    list() {
      return Promise.resolve({ keys: [], list_complete: true, cacheStatus: null });
    },
    getWithMetadata() {
      return Promise.resolve({ value: null, metadata: null, cacheStatus: null });
    },
    _putCalls: putCalls,
  } as unknown as KVNamespace & { _putCalls: Array<{ key: string; value: string; opts?: unknown }> };
  return kv;
}

// ---------------------------------------------------------------------------
// Mock environment bindings
// ---------------------------------------------------------------------------

// Token UUID — the "installationId" portion of the signed token
const TOKEN_UUID = '550e8400-e29b-41d4-a716-446655440000'; // 36 chars

// Pre-computed HMAC-SHA256(TOKEN_UUID, 'test-hmac-secret') as hex
// Computed with: crypto.createHmac('sha256', 'test-hmac-secret').update(TOKEN_UUID).digest('hex')
const TOKEN_SIGNATURE = 'd117be8940129a8c38863e8ea916e5224a2c347d6b86d493a00edef81088e19e';

// Full signed token in format <uuid>.<hex-signature>
const VALID_TOKEN = `${TOKEN_UUID}.${TOKEN_SIGNATURE}`;

function createEnv(kvOverride?: KVNamespace) {
  return {
    ANTHROPIC_API_KEY: 'test-anthropic-key',
    ASSEMBLYAI_API_KEY: 'test-assemblyai-key',
    ELEVENLABS_API_KEY: 'test-elevenlabs-key',
    APP_HMAC_SECRET: 'test-hmac-secret',
    STRIPE_SECRET_KEY: 'sk_test_fake',
    STRIPE_WEBHOOK_SECRET: 'whsec_fake',
    STRIPE_PRICE_ID: 'price_fake',
    RATE_LIMIT: kvOverride ?? createMockKV(),
  };
}

// ---------------------------------------------------------------------------
// Helper — make a request with bindings
// ---------------------------------------------------------------------------

function req(
  path: string,
  init?: RequestInit,
  env?: ReturnType<typeof createEnv>,
) {
  return app.request(
    path,
    init,
    env ?? createEnv(),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /health', () => {
  it('returns 200 with status ok and version', async () => {
    const res = await req('/health');
    assert.equal(res.status, 200);
    const body = ((await res.json()) as Json) as Json;
    assert.equal(body.status, 'ok');
    assert.equal(body.version, '1.0.0');
  });

  it('requires no auth (no x-app-token header)', async () => {
    // No token header at all — should still return 200
    const res = await req('/health');
    assert.equal(res.status, 200);
  });
});

describe('POST /chat', () => {
  it('returns 401 without x-app-token header', async () => {
    const res = await req('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
    });
    assert.equal(res.status, 401);
    const body = ((await res.json()) as Json) as Json;
    assert.equal(body.error, 'Unauthorized');
  });

  it('returns 401 with invalid (short) token', async () => {
    const res = await req('/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-token': 'short',
      },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
    });
    assert.equal(res.status, 401);
  });

  it('returns 400 when messages array is missing', async () => {
    const res = await req('/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-token': VALID_TOKEN,
      },
      body: JSON.stringify({ model: 'claude-3-5-sonnet' }),
    });
    assert.equal(res.status, 400);
    const body = ((await res.json()) as Json) as Json;
    assert.equal(body.error, 'messages array is required');
  });

  it('returns 400 when body is empty', async () => {
    const res = await req('/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-token': VALID_TOKEN,
      },
      body: '{}',
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as Json;
    assert.equal(body.error, 'messages array is required');
  });

  it('returns 429 with quota_exceeded when daily limit is hit', async () => {
    const kv = createMockKV({ [`quota:chat:${TOKEN_UUID}`]: '20' });
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
    assert.ok(typeof body.reset_in_seconds === 'number');
  });

  it('X-Quota-Remaining header is absent when quota_exceeded (429 has no remaining header)', async () => {
    const kv = createMockKV({ [`quota:chat:${TOKEN_UUID}`]: '20' });
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
    // 429 response should not include X-Quota-Remaining
    assert.equal(res.headers.get('X-Quota-Remaining'), null);
  });
});

describe('POST /stt', () => {
  it('returns 429 with quota_exceeded when STT sessions exhausted', async () => {
    const kv = createMockKV({ [`quota:stt:${TOKEN_UUID}`]: '10' });
    const env = createEnv(kv);

    const res = await req(
      '/stt',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-app-token': VALID_TOKEN,
        },
      },
      env,
    );

    assert.equal(res.status, 429);
    const body = (await res.json()) as Json;
    assert.equal(body.error, 'quota_exceeded');
    assert.equal(body.service, 'stt');
    assert.equal(body.quota, 10);
  });

  it('returns non-429 when STT sessions not exhausted (quota 5 < limit 10)', async () => {
    const kv = createMockKV({ [`quota:stt:${TOKEN_UUID}`]: '5' });
    const env = createEnv(kv);

    const res = await req(
      '/stt',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-app-token': VALID_TOKEN,
        },
      },
      env,
    );

    // Will be 502/503 since AssemblyAI is mocked — but NOT 429
    assert.notEqual(res.status, 429);
  });
});

describe('POST /tts', () => {
  it('returns 400 when text body is missing', async () => {
    const res = await req('/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-token': VALID_TOKEN,
      },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as Json;
    assert.equal(body.error, 'text must be a non-empty string');
  });

  it('returns 429 with quota_exceeded when TTS limit hit', async () => {
    const kv = createMockKV({ [`quota:tts:${TOKEN_UUID}`]: '10' });
    const env = createEnv(kv);

    const res = await req(
      '/tts',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-app-token': VALID_TOKEN,
        },
        body: JSON.stringify({ text: 'Hello world' }),
      },
      env,
    );

    assert.equal(res.status, 429);
    const body = (await res.json()) as Json;
    assert.equal(body.error, 'quota_exceeded');
    assert.equal(body.service, 'tts');
    assert.equal(body.quota, 10);
  });
});

describe('Subscription bypass', () => {
  it('/chat allows request when subscription:uuid = active even with quota:chat = 20', async () => {
    const kv = createMockKV({
      [`quota:chat:${TOKEN_UUID}`]: '20',
      [`subscription:${TOKEN_UUID}`]: 'active',
    });
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

    // Should NOT be 429 — subscribed users bypass quota
    // Will be 503/other since Anthropic is mocked — but not 429
    assert.notEqual(res.status, 429);
  });
});

describe('GET /quota', () => {
  it('returns quota counts for all three services', async () => {
    const kv = createMockKV({
      [`quota:chat:${TOKEN_UUID}`]: '5',
      [`quota:stt:${TOKEN_UUID}`]: '3',
      [`quota:tts:${TOKEN_UUID}`]: '1',
    });
    const env = createEnv(kv);

    const res = await req(
      '/quota',
      {
        method: 'GET',
        headers: { 'x-app-token': VALID_TOKEN },
      },
      env,
    );

    assert.equal(res.status, 200);
    const body = (await res.json()) as Json;
    assert.equal(body.chat.used, 5);
    assert.equal(body.chat.limit, 20);
    assert.equal(body.stt.used, 3);
    assert.equal(body.stt.limit, 10);
    assert.equal(body.tts.used, 1);
    assert.equal(body.tts.limit, 10);
  });

  it('returns subscribed: true when subscription:uuid = active', async () => {
    const kv = createMockKV({
      [`subscription:${TOKEN_UUID}`]: 'active',
    });
    const env = createEnv(kv);

    const res = await req(
      '/quota',
      {
        method: 'GET',
        headers: { 'x-app-token': VALID_TOKEN },
      },
      env,
    );

    assert.equal(res.status, 200);
    const body = (await res.json()) as Json;
    assert.equal(body.subscribed, true);
  });
});

describe('checkQuota() rolling-window invariant', () => {
  it('KV.put does NOT include expirationTtl when quota key already exists (rolling window must not reset)', async () => {
    const kv = createMockKV({ [`quota:stt:${TOKEN_UUID}`]: '5' }) as KVNamespace & {
      _putCalls: Array<{ key: string; value: string; opts?: unknown }>;
    };
    const env = createEnv(kv);

    // Send a valid /stt request that is under the limit (5 < 10)
    await req(
      '/stt',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-app-token': VALID_TOKEN,
        },
      },
      env,
    );

    // Find any put calls for the stt quota key
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sttPuts = (kv as any)._putCalls.filter(
      (call: { key: string }) => call.key === `quota:stt:${TOKEN_UUID}`,
    );

    assert.ok(sttPuts.length > 0, 'Should have at least one KV.put for the quota:stt key');

    // None of the increment puts should include expirationTtl
    for (const put of sttPuts) {
      const hasExpiry =
        put.opts !== undefined &&
        put.opts !== null &&
        typeof put.opts === 'object' &&
        'expirationTtl' in (put.opts as object);
      assert.equal(
        hasExpiry,
        false,
        `KV.put for quota:stt:${TOKEN_UUID} should NOT include expirationTtl when key already exists`,
      );
    }
  });
});

describe('Rate limiting', () => {
  it('returns 429 when rate limit is exceeded', async () => {
    // Pre-seed the KV store with a count of 60 (limit reached)
    const kv = createMockKV({ [`rate:${TOKEN_UUID}`]: '60' });
    const env = createEnv(kv);

    const res = await req(
      '/chat',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-app-token': VALID_TOKEN,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'hello' }],
        }),
      },
      env,
    );

    assert.equal(res.status, 429);
    assert.equal(res.headers.get('Retry-After'), '60');
    const body = (await res.json()) as Json;
    assert.equal(body.error, 'Rate limit exceeded');
    assert.equal(body.retry_after, 60);
  });

  it('sets X-RateLimit-Remaining header on successful auth', async () => {
    const kv = createMockKV();
    const env = createEnv(kv);

    // Hit /chat with missing messages body — returns 400 via c.json() which
    // preserves middleware-set headers (c.header). Avoids outbound Anthropic call.
    const res = await req(
      '/chat',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-app-token': VALID_TOKEN,
        },
        body: JSON.stringify({}),
      },
      env,
    );

    const remaining = res.headers.get('X-RateLimit-Remaining');
    assert.ok(remaining !== null, 'X-RateLimit-Remaining header should be set');
    assert.equal(remaining, '59'); // first request, 60 - 1 = 59
  });
});

describe('POST /create-checkout', () => {
  it('returns 401 without x-app-token', async () => {
    const res = await req('/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid: TOKEN_UUID }),
    });
    assert.equal(res.status, 401);
  });

  it('returns 400 when uuid is missing in body', async () => {
    const res = await req('/create-checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-token': VALID_TOKEN,
      },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as Json;
    assert.ok(typeof body.error === 'string' && body.error.includes('uuid'));
  });
});

describe('POST /stripe-webhook', () => {
  it('returns 400 when Stripe-Signature header is missing', async () => {
    // No Stripe-Signature header, no x-app-token — webhook bypasses app auth
    const res = await req('/stripe-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'checkout.session.completed' }),
    });
    assert.equal(res.status, 400);
  });
});

describe('POST /refresh-subscription', () => {
  it('returns 401 without x-app-token', async () => {
    const res = await req('/refresh-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    assert.equal(res.status, 401);
  });
});
