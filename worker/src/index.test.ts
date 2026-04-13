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
  return {
    get(key: string) {
      return Promise.resolve(store[key] ?? null);
    },
    put(key: string, value: string, _opts?: unknown) {
      store[key] = value;
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
  } as unknown as KVNamespace;
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
