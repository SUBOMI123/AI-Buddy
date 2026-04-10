import { Hono } from 'hono';
import { cors } from 'hono/cors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Bindings = {
  ANTHROPIC_API_KEY: string;
  ASSEMBLYAI_API_KEY: string;
  ELEVENLABS_API_KEY: string;
  APP_HMAC_SECRET: string;
  RATE_LIMIT: KVNamespace;
};

type App = { Bindings: Bindings };

// ---------------------------------------------------------------------------
// Rate limiting helper (D-10) — 60 req/min per token via Cloudflare KV
//
// NOTE: KV is eventually consistent. The read-then-write pattern below has a
// TOCTOU race: under high concurrency, multiple requests may read the same
// count before any write lands, allowing bursts of up to ~2x the limit.
// For strict enforcement, migrate to Cloudflare Durable Objects (atomic
// counter). This KV approach is acceptable for private beta traffic levels.
// ---------------------------------------------------------------------------

async function checkRateLimit(
  kv: KVNamespace,
  token: string,
): Promise<{ allowed: boolean; remaining: number }> {
  const key = `rate:${token}`;
  const raw = await kv.get(key);
  const current = raw ? parseInt(raw, 10) : 0;

  if (current >= 60) {
    return { allowed: false, remaining: 0 };
  }

  const newCount = current + 1;
  await kv.put(key, String(newCount), { expirationTtl: 60 });

  return { allowed: true, remaining: 60 - newCount };
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = new Hono<App>();

// CORS middleware — restricted to Tauri dev server origin.
// Tauri production builds make requests from Rust (not a browser), so CORS is
// irrelevant in production. This covers the dev-server case only.
app.use('*', cors({ origin: 'http://localhost:1420' }));

// ---------------------------------------------------------------------------
// Auth + rate-limit middleware (applied to all routes except /health)
// ---------------------------------------------------------------------------

app.use('*', async (c, next) => {
  // Skip auth for health endpoint
  if (c.req.path === '/health') {
    return next();
  }

  // 1. Validate x-app-token header via HMAC signature (per CLAUDE.md D-10)
  //    Token format: "<installationId>.<hex-signature>"
  //    The client signs its installation UUID with the shared APP_HMAC_SECRET.
  const token = c.req.header('x-app-token');

  if (!token || !token.includes('.')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const [tokenValue, signature] = token.split('.', 2);
  if (!tokenValue || !signature) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Verify HMAC-SHA256 signature
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(c.env.APP_HMAC_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const expectedBuf = await crypto.subtle.sign(
    'HMAC',
    hmacKey,
    new TextEncoder().encode(tokenValue),
  );
  const expectedHex = [...new Uint8Array(expectedBuf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  if (signature !== expectedHex) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // 2. Check rate limit via KV (keyed on installation ID, not full token)
  // Gracefully skip rate limiting if KV namespace is not available (local dev)
  try {
    if (c.env.RATE_LIMIT) {
      const { allowed, remaining } = await checkRateLimit(c.env.RATE_LIMIT, tokenValue);

      if (!allowed) {
        return c.json(
          { error: 'Rate limit exceeded', retry_after: 60 },
          {
            status: 429,
            headers: { 'Retry-After': '60' },
          },
        );
      }

      c.header('X-RateLimit-Remaining', String(remaining));
    }
  } catch {
    // KV not available in local dev — skip rate limiting
  }

  return next();
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Health check — no auth required (D-11)
app.get('/health', (c) => {
  return c.json({ status: 'ok', version: '1.0.0' });
});

// Claude streaming proxy (D-11)
app.post('/chat', async (c) => {
  // Input validation — messages array is required
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.messages || !Array.isArray(body.messages)) {
    return c.json({ error: 'messages array is required' }, 400);
  }

  // Proxy to Anthropic Messages API with SSE streaming
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': c.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: body.model ?? 'claude-sonnet-4-20250514',
      messages: body.messages,
      system: body.system,
      max_tokens: Math.min(Number(body.max_tokens) || 4096, 4096),
      stream: true,
    }),
  });

  // SSE passthrough
  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
});

// STT placeholder (D-11) — will be implemented in Phase 3
app.post('/stt', (c) => {
  return c.json(
    { message: 'STT endpoint placeholder', status: 'not_implemented' },
    501,
  );
});

// TTS placeholder (D-11) — will be implemented in Phase 3
app.post('/tts', (c) => {
  return c.json(
    { message: 'TTS endpoint placeholder', status: 'not_implemented' },
    501,
  );
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export default app;
