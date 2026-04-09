import { Hono } from 'hono';
import { cors } from 'hono/cors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Bindings = {
  ANTHROPIC_API_KEY: string;
  ASSEMBLYAI_API_KEY: string;
  ELEVENLABS_API_KEY: string;
  RATE_LIMIT: KVNamespace;
};

type App = { Bindings: Bindings };

// ---------------------------------------------------------------------------
// Rate limiting helper (D-10) — 60 req/min per token via Cloudflare KV
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

// CORS middleware — allow all origins for development (T-01-05: restrict before production)
app.use('*', cors({ origin: '*' }));

// ---------------------------------------------------------------------------
// Auth + rate-limit middleware (applied to all routes except /health)
// ---------------------------------------------------------------------------

app.use('*', async (c, next) => {
  // Skip auth for health endpoint
  if (c.req.path === '/health') {
    return next();
  }

  // 1. Validate x-app-token header
  const token = c.req.header('x-app-token');

  if (!token || token.length < 32) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // 2. Check rate limit via KV
  const { allowed, remaining } = await checkRateLimit(c.env.RATE_LIMIT, token);

  if (!allowed) {
    return c.json(
      { error: 'Rate limit exceeded', retry_after: 60 },
      {
        status: 429,
        headers: { 'Retry-After': '60' },
      },
    );
  }

  // Set rate-limit remaining header on every successful auth
  c.header('X-RateLimit-Remaining', String(remaining));

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
    body: JSON.stringify({ ...body, stream: true }),
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
