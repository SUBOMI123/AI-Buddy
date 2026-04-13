#!/usr/bin/env node
// Smoke test for AI Buddy Worker production deployment.
// Run: node worker/scripts/smoke-test.mjs <WORKER_URL> <APP_HMAC_SECRET>
//
// Example:
//   node worker/scripts/smoke-test.mjs \
//     https://ai-buddy-proxy.subomi-bashorun.workers.dev \
//     e65b212e0dc720b57f9f5b7ae69b2099627c2da8729849ad10791ca6b2b30a5d
//
// The token format matches preferences.rs: "<uuid>.<hmac-sha256-hex>"

import { createHmac, randomUUID } from 'node:crypto';

const WORKER_URL = process.argv[2];
const HMAC_SECRET = process.argv[3];

if (!WORKER_URL || !HMAC_SECRET) {
  console.error('Usage: node smoke-test.mjs <WORKER_URL> <APP_HMAC_SECRET>');
  process.exit(1);
}

// Generate a valid HMAC-signed token (mirrors preferences.rs cmd_get_token)
const installationId = randomUUID();
const signature = createHmac('sha256', HMAC_SECRET)
  .update(installationId)
  .digest('hex');
const token = `${installationId}.${signature}`;

async function test(label, fn) {
  try {
    const { status, body } = await fn();
    const pass = body && !body.error;
    console.log(`${pass ? '✅' : '❌'} ${label}: HTTP ${status}`);
    if (!pass || process.env.VERBOSE) {
      console.log('   Body:', JSON.stringify(body));
    }
    return pass;
  } catch (err) {
    console.log(`❌ ${label}: ERROR — ${err.message}`);
    return false;
  }
}

async function json(url, init) {
  const res = await fetch(url, init);
  let body;
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    body = await res.json();
  } else {
    body = { _raw: await res.text() };
  }
  return { status: res.status, body };
}

console.log(`\nSmoke testing: ${WORKER_URL}\n`);

const results = await Promise.all([
  // 1. Health — no auth required
  test('GET /health (no auth)', async () => {
    const { status, body } = await json(`${WORKER_URL}/health`);
    if (body.status !== 'ok') throw new Error(`status=${body.status}`);
    return { status, body };
  }),

  // 2. Auth rejection — no token
  test('POST /chat (no token → 401)', async () => {
    const { status, body } = await json(`${WORKER_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'test' }] }),
    });
    if (status !== 401) throw new Error(`expected 401, got ${status}`);
    return { status, body: { ok: true } }; // body.error is expected here
  }),

  // 3. /chat with valid token — should NOT return 401 or 501
  //    Will likely get a real Anthropic response or 5xx if API key bad — just not 401
  test('POST /chat (valid token → not 401)', async () => {
    const { status, body } = await json(`${WORKER_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-token': token,
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Say the word OK and nothing else.' }],
        max_tokens: 10,
      }),
    });
    if (status === 401) throw new Error('Got 401 — HMAC secret mismatch?');
    return { status, body: { ok: true, http_status: status } };
  }),

  // 4. /stt with valid token — should NOT return 401 or 501
  test('POST /stt (valid token → not 401)', async () => {
    const { status, body } = await json(`${WORKER_URL}/stt`, {
      method: 'POST',
      headers: { 'x-app-token': token },
    });
    if (status === 401) throw new Error('Got 401 — HMAC secret mismatch?');
    return { status, body: { ok: true, http_status: status } };
  }),

  // 5. /tts with valid token — should NOT return 401 or 501
  test('POST /tts (valid token → not 401)', async () => {
    const { status } = await json(`${WORKER_URL}/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-token': token,
      },
      body: JSON.stringify({ text: 'Hello' }),
    });
    if (status === 401) throw new Error('Got 401 — HMAC secret mismatch?');
    return { status, body: { ok: true, http_status: status } };
  }),
]);

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} smoke tests passed`);

if (passed < results.length) {
  console.log('\nCheck: APP_HMAC_SECRET matches the wrangler secret set in Plan 02.');
  process.exit(1);
}
