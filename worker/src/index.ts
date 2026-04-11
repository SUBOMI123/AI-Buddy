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

// CORS middleware — two origins are allowed:
//   http://localhost:1420  — Vite dev server used during `cargo tauri dev`
//   tauri://localhost      — Tauri custom URI scheme used in production builds on macOS/Windows.
//                           Tauri production WebViews load content from the `tauri://` scheme,
//                           not `http://`. Requests from Rust (non-browser) bypass CORS entirely;
//                           this header is only needed for the WebView fetch calls.
app.use('*', cors({ origin: ['http://localhost:1420', 'tauri://localhost'] }));

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

// Task classification endpoint — classifies user intent into a canonical snake_case label (D-02)
// Uses claude-haiku-4-5 for cost efficiency. Returns { label } always (never 5xx).
const CLASSIFY_SYSTEM_PROMPT =
  'You are a task classifier. Respond with ONLY a snake_case label (2-4 words, underscores only, no spaces, no punctuation). Extract the core task the user wants to perform. Make it app-agnostic. Examples: "I want to export this as a PDF" → export_pdf, "How do I create a pivot table" → create_pivot_table, "I need to insert a table" → insert_table, "rename this layer" → rename_layer';

app.post('/classify', async (c) => {
  let body: { intent?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  // T-05-02: Validate intent — non-empty string, max 500 chars
  const intent = typeof body.intent === 'string' ? body.intent.trim() : '';
  if (!intent) {
    return c.json({ error: 'intent must be a non-empty string' }, 400);
  }
  if (intent.length > 500) {
    return c.json({ error: 'intent must be 500 characters or fewer' }, 400);
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': c.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        system: CLASSIFY_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Intent: ${intent}` }],
        max_tokens: 20,
        stream: false,
      }),
    });

    if (!response.ok) {
      console.error('Anthropic classify call returned', response.status);
      return c.json({ label: 'unknown_task' });
    }

    const data = await response.json<{ content: Array<{ type: string; text: string }> }>();
    const rawLabel = data?.content?.[0]?.text ?? '';

    // Sanitise: lowercase, replace non-[a-z0-9_] with _, truncate to 50 chars
    const label = rawLabel
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .slice(0, 50);

    return c.json({ label: label || 'unknown_task' });
  } catch (err) {
    console.error('Classification error:', err);
    return c.json({ label: 'unknown_task' });
  }
});

// STT token endpoint — issues short-lived AssemblyAI streaming token (D-28)
// Auth middleware applies globally — this route only reached by authenticated clients (T-03-04)
app.post('/stt', async (c) => {
  const tokenUrl = 'https://streaming.assemblyai.com/v3/token?expires_in_seconds=300';

  let tokenResponse: Response;
  try {
    tokenResponse = await fetch(tokenUrl, {
      method: 'GET',
      headers: {
        Authorization: c.env.ASSEMBLYAI_API_KEY,
      },
    });
  } catch (err) {
    console.error('AssemblyAI token fetch failed:', err);
    return c.json({ error: 'STT service unavailable' }, 503);
  }

  if (!tokenResponse.ok) {
    console.error('AssemblyAI token endpoint returned', tokenResponse.status);
    return c.json({ error: 'STT token issuance failed' }, 502);
  }

  const body = await tokenResponse.json<{ token: string }>();

  if (!body.token) {
    return c.json({ error: 'STT token response missing token field' }, 502);
  }

  return c.json({ token: body.token });
});

// TTS proxy — streams ElevenLabs Turbo v2.5 MP3 audio (D-15, D-29)
// Auth middleware applies globally (T-03-04 pattern covers /tts too)
app.post('/tts', async (c) => {
  let body: { text?: string; voice_id?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  // T-03-05: Validate text — non-empty, max 2000 chars
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return c.json({ error: 'text must be a non-empty string' }, 400);
  }
  if (text.length > 2000) {
    return c.json({ error: 'text must be 2000 characters or fewer' }, 400);
  }

  // ElevenLabs voice ID — use "Rachel" (natural, clear instructional voice)
  // voice_id: Xb7hH8MSUJpSbSDYk0k2 is ElevenLabs "Alice" — available on free tier
  const voiceId = body.voice_id ?? 'Xb7hH8MSUJpSbSDYk0k2';
  const elevenUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`;

  let elevenResponse: Response;
  try {
    elevenResponse = await fetch(elevenUrl, {
      method: 'POST',
      headers: {
        'xi-api-key': c.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });
  } catch (err) {
    console.error('ElevenLabs request failed:', err);
    return c.json({ error: 'TTS service unavailable' }, 503);
  }

  if (!elevenResponse.ok) {
    const errText = await elevenResponse.text();
    console.error('ElevenLabs returned', elevenResponse.status, errText);
    return c.json({ error: 'TTS generation failed' }, 502);
  }

  // Stream MP3 audio back to caller
  return new Response(elevenResponse.body, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-cache',
      'Transfer-Encoding': 'chunked',
    },
  });
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export default app;
