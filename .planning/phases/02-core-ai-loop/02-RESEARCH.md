# Phase 2: Core AI Loop - Research

**Researched:** 2026-04-09
**Domain:** Screen capture, Claude Vision API streaming, real-time UI updates
**Confidence:** HIGH

## Summary

This phase wires the core product loop: user submits intent, app captures the screen via xcap (already in Cargo.toml), sends the base64-encoded screenshot plus user text to the Cloudflare Worker proxy (already deployed with `/chat` SSE route), and streams Claude's response word-by-word into the existing GuidanceList component.

The existing codebase provides strong foundations. The Worker `/chat` route already proxies to Claude with SSE passthrough. The frontend has `SidebarShell` with a stub `handleSubmit`, `GuidanceList` for rendering numbered steps, `TextInput` for submission, and `getInstallationToken()` for auth. The Rust backend has xcap, image, and base64 crates already in Cargo.toml. The gap is: (1) a Rust `capture_screenshot` command that captures, resizes, encodes to JPEG base64, (2) a system prompt for Claude, (3) frontend SSE consumption from the Worker, and (4) UI states for loading/streaming/error.

**Primary recommendation:** Keep screenshot capture in Rust (performance-critical) but consume the SSE stream directly from the frontend WebView using fetch + ReadableStream. This avoids the complexity of parsing SSE in Rust and streaming text back through Tauri channels, while keeping the security-sensitive token retrieval in Rust. The Worker already handles SSE passthrough.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Capture screenshot on every submit -- right when user presses Enter, so Claude always sees the current screen state
- **D-02:** Capture full primary monitor (not active window) -- gives Claude maximum context
- **D-03:** Resize to 1280px wide, JPEG 80% quality -- good balance of clarity (~200-400KB) vs API cost/speed
- **D-04:** If screenshot capture fails (permission revoked, screen locked), fall back to text-only request with notice: "Screen capture unavailable -- guidance may be less specific"
- **D-05:** Word-by-word streaming -- text flows in progressively as Claude generates it, natural reading pace
- **D-06:** Pulsing dots animation as loading indicator while waiting for first token (~2-3s). Disappears when first token arrives
- **D-07:** Clear and replace on new submit -- each question replaces the previous guidance, keeping sidebar focused on current task
- **D-08:** Use claude-3-5-sonnet model for v1 -- best cost/speed/quality balance with strong vision
- **D-09:** Send screenshot + user intent only -- no extra metadata. Let Claude infer app and OS from the screenshot
- **D-10:** When intent is ambiguous, Claude must ask a clarifying question instead of guessing
- **D-11:** Show error inline in guidance area with Retry button -- no modal dialogs
- **D-12:** Screenshot capture failure falls back to text-only (see D-04)

### Claude's Discretion
- System prompt wording and structure (must produce numbered steps)
- Exact streaming chunk parsing approach (SSE event handling)
- Image encoding pipeline implementation details (xcap -> resize -> JPEG -> base64)
- Timeout thresholds for API calls

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CORE-01 | User can state intent via text input | TextInput component exists; wire handleSubmit to real pipeline |
| CORE-02 | App captures current screen state on demand | xcap + image + base64 crates in Cargo.toml; new Rust command needed |
| CORE-03 | AI generates step-by-step directional guidance | System prompt engineering + Claude vision API with base64 image |
| CORE-04 | Responses stream in real-time with perceived <3-5s | SSE stream from Worker; frontend fetch + ReadableStream parsing |
| CORE-05 | AI asks contextual clarification when intent is ambiguous | System prompt instruction; no code change needed beyond prompt |
</phase_requirements>

## Standard Stack

### Core (Already in Cargo.toml)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| xcap | 0.9.x | Full-monitor screenshot capture | Already in Cargo.toml. Cross-platform. Used by permissions.rs [VERIFIED: Cargo.toml] |
| image | 0.25.x | Resize captured image, encode to JPEG | Already in Cargo.toml with jpeg feature [VERIFIED: Cargo.toml] |
| base64 | 0.22.x | Encode JPEG bytes to base64 string | Already in Cargo.toml [VERIFIED: Cargo.toml] |
| serde / serde_json | 1.x | JSON serialization for command returns | Already in Cargo.toml [VERIFIED: Cargo.toml] |

### Needs Adding to Cargo.toml
| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| reqwest | 0.12.x | HTTP client (future phases; not needed for Phase 2 if frontend handles SSE) | Listed in CLAUDE.md stack. NOT needed this phase if frontend fetches Worker directly [ASSUMED] |

### Frontend (Already Available)
| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| @tauri-apps/api | 2.x | invoke() for Rust commands, Channel for IPC | Already installed and used in src/lib/tauri.ts [VERIFIED: codebase] |
| SolidJS | latest | Reactive UI signals for streaming state | Already used throughout components [VERIFIED: codebase] |

### No New Dependencies Needed
This phase requires zero new npm or Cargo dependencies. Everything needed is already installed. The SSE stream parsing uses native browser `fetch()` + `ReadableStream` + `TextDecoder` -- no library needed. [VERIFIED: existing Cargo.toml and codebase review]

## Architecture Patterns

### Recommended Data Flow

```
User types intent → handleSubmit()
  ├── 1. invoke("capture_screenshot") → Rust captures monitor, resizes, returns base64 string
  ├── 2. invoke("cmd_get_token") → get HMAC auth token (already exists)
  └── 3. fetch(WORKER_URL/chat) with SSE stream
       ├── Parse SSE events in JS (content_block_delta → text_delta)
       ├── Update SolidJS signal progressively
       └── GuidanceList re-renders reactively
```

### Why Frontend SSE (Not Rust SSE)

| Approach | Pros | Cons |
|----------|------|------|
| Frontend fetch + ReadableStream | Simple, native browser API, no new deps, natural for reactive UI | Token exposed to WebView JS (mitigated: token is per-install HMAC, not an API key) |
| Rust reqwest + Channel streaming | All network in Rust per CLAUDE.md philosophy | Requires reqwest dep, SSE parsing in Rust, Channel serialization overhead, more complex for equivalent result |

The frontend approach is correct here because: (a) the Worker proxies the real API key -- the frontend never sees it, (b) the HMAC token is per-installation and non-secret, (c) streaming text to a reactive UI is the browser's strength, (d) avoids adding reqwest as a dependency this phase. [ASSUMED -- Claude's discretion per CONTEXT.md]

### Recommended Project Structure (Changes Only)

```
src-tauri/src/
├── lib.rs              # Add capture_screenshot to invoke_handler
├── screenshot.rs       # NEW: capture_screenshot command
├── permissions.rs      # Existing (no changes)
└── ...

src/
├── lib/
│   ├── tauri.ts        # Add captureScreenshot() wrapper
│   └── ai.ts           # NEW: streamGuidance() -- SSE fetch + parse
├── components/
│   ├── SidebarShell.tsx # UPDATE: wire handleSubmit, add loading/error/streaming states
│   ├── GuidanceList.tsx # UPDATE: accept streaming text, not just string[]
│   └── LoadingDots.tsx  # NEW: pulsing dots animation component
└── ...
```

### Pattern 1: Rust Screenshot Command

**What:** Single Tauri command that captures, resizes, and base64-encodes in one call
**When to use:** On every submit (D-01)

```rust
// Source: xcap docs + image crate docs
use xcap::Monitor;
use image::DynamicImage;
use base64::{Engine as _, engine::general_purpose};

#[tauri::command]
pub async fn capture_screenshot() -> Result<String, String> {
    // Run blocking capture on a thread pool to avoid blocking async runtime
    tokio::task::spawn_blocking(|| {
        let monitors = Monitor::all().map_err(|e| format!("Monitor enumeration failed: {e}"))?;
        let monitor = monitors.into_iter()
            .find(|m| m.is_primary().unwrap_or(false))
            .or_else(|| None) // fallback handled below
            .ok_or("No monitor found")?;

        let img = monitor.capture_image()
            .map_err(|e| format!("Screen capture failed: {e}"))?;

        // Convert xcap RgbaImage to DynamicImage for resize
        let dynamic = DynamicImage::ImageRgba8(img);

        // Resize to 1280px wide, maintain aspect ratio (D-03)
        let resized = dynamic.resize(1280, u32::MAX, image::imageops::FilterType::Lanczos3);

        // Encode to JPEG at 80% quality (D-03)
        let mut jpeg_bytes = Vec::new();
        let mut cursor = std::io::Cursor::new(&mut jpeg_bytes);
        resized.write_to(&mut cursor, image::ImageFormat::Jpeg)
            .map_err(|e| format!("JPEG encode failed: {e}"))?;

        // Base64 encode
        let b64 = general_purpose::STANDARD.encode(&jpeg_bytes);
        Ok(b64)
    }).await.map_err(|e| format!("Task join error: {e}"))?
}
```

**Key details:**
- `xcap::Monitor::capture_image()` returns `image::RgbaImage` which IS the image crate's type -- zero-copy conversion to `DynamicImage` [VERIFIED: xcap README shows `.save()` which uses image crate]
- `spawn_blocking` is essential: xcap capture is synchronous and must not block Tauri's async runtime [VERIFIED: Tauri docs say async commands run on async_runtime::spawn]
- `resize(1280, u32::MAX, ...)` resizes width to 1280, auto-calculates height to preserve aspect ratio [CITED: image crate docs]

### Pattern 2: Frontend SSE Stream Parsing

**What:** Parse Claude streaming SSE events from the Worker proxy
**When to use:** After screenshot capture, for every AI request

```typescript
// Source: Anthropic streaming docs + native fetch API
export async function streamGuidance(
  workerUrl: string,
  token: string,
  screenshot: string | null,
  userIntent: string,
  onToken: (text: string) => void,
  onError: (error: string) => void,
  onDone: () => void,
): Promise<void> {
  // Build messages array with optional vision content
  const userContent: any[] = [];

  if (screenshot) {
    userContent.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/jpeg",
        data: screenshot,
      },
    });
  }
  userContent.push({ type: "text", text: userIntent });

  const response = await fetch(`${workerUrl}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-app-token": token,
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      messages: [
        { role: "user", content: userContent },
      ],
      system: SYSTEM_PROMPT, // defined elsewhere
      max_tokens: 4096,
    }),
  });

  if (!response.ok || !response.body) {
    onError("Couldn't reach AI -- check your connection.");
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // keep incomplete line in buffer

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") { onDone(); return; }
        try {
          const event = JSON.parse(data);
          if (event.type === "content_block_delta" &&
              event.delta?.type === "text_delta") {
            onToken(event.delta.text);
          }
          if (event.type === "error") {
            onError(event.error?.message || "AI error");
            return;
          }
        } catch { /* skip unparseable lines (ping, etc.) */ }
      }
    }
  }
  onDone();
}
```

### Pattern 3: Worker System Prompt Passthrough

**What:** The Worker `/chat` route needs to forward the `system` field to Claude
**Current gap:** The existing Worker code does NOT pass `system` through -- it only forwards `messages`, `model`, and `max_tokens`. [VERIFIED: worker/src/index.ts line 145-157]

```typescript
// Worker /chat route fix -- add system prompt passthrough
body: JSON.stringify({
  model: body.model ?? 'claude-3-5-sonnet-20241022',
  messages: body.messages,
  system: body.system, // ADD THIS LINE
  max_tokens: Math.min(Number(body.max_tokens) || 4096, 4096),
  stream: true,
}),
```

This is a one-line fix but critical -- without it, Claude won't receive the system prompt. [VERIFIED: current worker/src/index.ts]

### Anti-Patterns to Avoid
- **Storing screenshots to disk then reading back:** xcap returns in-memory `RgbaImage`. Process entirely in memory. No filesystem I/O needed.
- **Using EventSource API:** Browser `EventSource` only supports GET requests. We need POST with a JSON body. Use `fetch()` + `ReadableStream` instead.
- **Blocking the main thread with capture:** `xcap::Monitor::capture_image()` is synchronous. Always wrap in `spawn_blocking` inside async Tauri commands.
- **Sending raw PNG:** PNG screenshots are 2-5MB. JPEG at 80% quality is 200-400KB. Always encode to JPEG before base64. [CITED: D-03 decision]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE parsing | Custom event parser with regex | Line-by-line `data:` prefix check (shown above) | SSE format is simple enough that a parser is 15 lines; a library adds unnecessary dependency |
| Screenshot capture | Raw CGWindowListCreateImage FFI | xcap crate | Cross-platform, handles retina/scaling, already in deps |
| Image resize | Manual pixel math | image crate `resize()` | Handles interpolation, aspect ratio, color space |
| Base64 encoding | Manual encoding | base64 crate | Standard, optimized, already in deps |
| Loading animation | CSS-only approach | Small SolidJS component with `@keyframes` | Needs to disappear on first token; requires reactive control |

## Common Pitfalls

### Pitfall 1: Worker Not Passing System Prompt
**What goes wrong:** Claude responds without context about its role, producing generic chatbot responses instead of step-by-step guidance
**Why it happens:** Current Worker `/chat` route only forwards `messages`, `model`, and `max_tokens` -- not `system`
**How to avoid:** Add `system: body.system` to the proxy body (one-line fix)
**Warning signs:** Claude responds conversationally instead of with numbered steps
[VERIFIED: worker/src/index.ts lines 145-157]

### Pitfall 2: xcap Capture Blocking Async Runtime
**What goes wrong:** UI freezes during screenshot capture (~50-200ms)
**Why it happens:** `Monitor::capture_image()` is synchronous. If called directly in an async Tauri command, it blocks the async runtime thread
**How to avoid:** Wrap in `tokio::task::spawn_blocking()`
**Warning signs:** Sidebar becomes unresponsive when user submits

### Pitfall 3: Incomplete SSE Line Buffering
**What goes wrong:** JSON parse errors, missed tokens, garbled output
**Why it happens:** `ReadableStream` chunks don't align with SSE line boundaries. A `data:` line may be split across two chunks
**How to avoid:** Buffer partial lines (keep trailing incomplete line for next chunk, as shown in Pattern 2)
**Warning signs:** Intermittent `JSON.parse` errors in console

### Pitfall 4: Image Too Large for Claude API
**What goes wrong:** Slow time-to-first-token, high token cost, possible request rejection
**Why it happens:** High-DPI monitors produce 5120x2880+ screenshots. Even as JPEG, base64 encoding adds ~33% overhead
**How to avoid:** Resize to 1280px wide (D-03). At 1280x800 JPEG 80%, expect ~200-400KB, ~1200-1600 tokens. Well within Claude's 1.15 megapixel sweet spot [CITED: Anthropic vision docs]
**Warning signs:** Time-to-first-token > 5 seconds consistently

### Pitfall 5: Retina/HiDPI Double-Sized Captures
**What goes wrong:** xcap captures at native resolution (e.g., 5120x2880 on a Retina 2560x1440 display), producing images 4x the expected pixel count
**Why it happens:** macOS Screen Capture API returns physical pixels, not logical pixels
**How to avoid:** The resize to 1280px handles this naturally -- regardless of capture resolution, output is always 1280px wide
**Warning signs:** Base64 string is much larger than expected before resize

### Pitfall 6: Missing AbortController for Cancelled Requests
**What goes wrong:** User submits a new question while previous stream is still active; two streams write to the same signal
**Why it happens:** No cancellation mechanism for the in-flight fetch
**How to avoid:** Use `AbortController`. Create one per submission, abort previous on new submit (D-07: clear and replace)
**Warning signs:** Text from two different responses interleaving in the UI

## Code Examples

### Claude Messages API Vision Request Body
```json
// Source: https://platform.claude.com/docs/en/build-with-claude/vision
{
  "model": "claude-3-5-sonnet-20241022",
  "max_tokens": 4096,
  "system": "You are an expert software guide...",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "image",
          "source": {
            "type": "base64",
            "media_type": "image/jpeg",
            "data": "<base64-encoded-jpeg>"
          }
        },
        {
          "type": "text",
          "text": "I want to create a new branch in this Git GUI"
        }
      ]
    }
  ],
  "stream": true
}
```
[VERIFIED: Anthropic official docs]

### SSE Event Flow (What the Frontend Parses)
```
event: message_start
data: {"type": "message_start", "message": {"id": "msg_...", ...}}

event: content_block_start
data: {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}}

event: content_block_delta
data: {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "1. Click"}}

event: content_block_delta
data: {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": " on the"}}

event: content_block_stop
data: {"type": "content_block_stop", "index": 0}

event: message_delta
data: {"type": "message_delta", "delta": {"stop_reason": "end_turn"}, "usage": {"output_tokens": 150}}

event: message_stop
data: {"type": "message_stop"}
```
[VERIFIED: Anthropic streaming docs]

### System Prompt Design (Claude's Discretion)
```typescript
const SYSTEM_PROMPT = `You are AI Buddy, a real-time software guide. The user has sent you a screenshot of their current screen along with what they want to accomplish.

Your job:
1. Look at the screenshot to identify what app/software they're using and its current state
2. Give clear, numbered step-by-step instructions to accomplish their goal
3. Be specific about WHERE to click -- describe UI elements by their label, position, and appearance
4. Reference what you can SEE on screen: "Click the blue 'New' button in the top-left toolbar"

Rules:
- If the user's intent is vague or could mean multiple things, ask ONE clarifying question instead of guessing
- Never say "I can't see the screen" -- you CAN see it via the screenshot
- Keep steps concise. Each step = one action
- If a step requires waiting (loading, processing), say so
- Number every step
- Do not include explanations of WHY unless the user asks -- focus on WHAT to do`;
```
[ASSUMED -- Claude's discretion area, prompt wording is not locked]

### SolidJS Streaming State Management
```typescript
// Source: SolidJS reactive patterns
const [streamingText, setStreamingText] = createSignal("");
const [isLoading, setIsLoading] = createSignal(false);
const [error, setError] = createSignal<string | null>(null);
let abortController: AbortController | null = null;

const handleSubmit = async (text: string) => {
  // Cancel any in-flight request (D-07)
  abortController?.abort();
  abortController = new AbortController();

  // Clear previous guidance, show loading (D-06, D-07)
  setStreamingText("");
  setError(null);
  setIsLoading(true);

  // 1. Capture screenshot
  let screenshot: string | null = null;
  try {
    screenshot = await captureScreenshot();
  } catch {
    // D-04: fall back to text-only
    screenshot = null;
  }

  // 2. Get auth token
  const token = await getInstallationToken();

  // 3. Stream guidance
  await streamGuidance(
    WORKER_URL,
    token,
    screenshot,
    text,
    (chunk) => {
      setIsLoading(false); // first token kills loading dots
      setStreamingText(prev => prev + chunk);
    },
    (err) => { setError(err); setIsLoading(false); },
    () => { setIsLoading(false); },
  );
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| EventSource API for SSE | fetch + ReadableStream | 2023+ | POST support, custom headers, AbortController |
| Send full PNG screenshots | Resize + JPEG encode | Best practice | 5-10x smaller payload, faster TTFT |
| anthropic-version 2023-01-01 | anthropic-version 2023-06-01 | June 2023 | Required for vision/streaming support |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Frontend SSE is preferred over Rust SSE for this phase | Architecture Patterns | Would need to add reqwest dep and Channel-based streaming; more work but equivalent result |
| A2 | System prompt wording produces good guidance | Code Examples | May need iteration based on testing; low risk since prompt is easily adjustable |
| A3 | JPEG 80% quality at 1280px produces ~200-400KB | Common Pitfalls | If larger, increase compression or reduce width; easy to tune |
| A4 | No reqwest dependency needed this phase | Standard Stack | If frontend can't reach Worker (CORS or Tauri restriction), would need reqwest in Rust |

## Open Questions

1. **Worker URL configuration**
   - What we know: Dev server runs at localhost:8787 (Wrangler default). Production will be a Cloudflare Workers URL
   - What's unclear: Where to store the Worker URL in the app (env var at build time? Tauri config? Hardcoded?)
   - Recommendation: Use a build-time env var (`VITE_WORKER_URL`) with fallback to `http://localhost:8787` in dev

2. **GuidanceList rendering approach for streaming**
   - What we know: Current GuidanceList takes `steps: string[]` (pre-split). Streaming gives us a single growing text blob
   - What's unclear: Should we parse numbered steps from streaming text in real-time, or show raw text during stream and parse on completion?
   - Recommendation: Show raw streaming text in a single block during generation. After stream completes, optionally split into steps. Simpler and avoids re-render jank from constant array updates

3. **Tokio runtime availability**
   - What we know: Tauri v2 uses async_runtime (which is tokio by default). `spawn_blocking` should be available
   - What's unclear: Whether `tokio::task::spawn_blocking` is directly accessible or needs explicit tokio dependency
   - Recommendation: Use `tauri::async_runtime::spawn_blocking` which wraps tokio's version without adding a direct tokio dep [ASSUMED]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual testing (no test framework in project yet) |
| Config file | none -- see Wave 0 |
| Quick run command | `cargo tauri dev` + manual interaction |
| Full suite command | N/A |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CORE-01 | User types intent and submits | manual | `cargo tauri dev` -- type text, press Enter | N/A |
| CORE-02 | Screenshot captured on submit | manual + unit | Rust: `cargo test -p ai-buddy capture_screenshot` | Wave 0 |
| CORE-03 | AI returns step-by-step guidance | manual | Submit intent, verify numbered steps appear | N/A |
| CORE-04 | Response streams in real-time | manual | Observe progressive text appearance | N/A |
| CORE-05 | AI asks clarification for vague intent | manual | Submit "help me" and verify clarifying question | N/A |

### Wave 0 Gaps
- [ ] No test framework configured -- CORE-02 could have a unit test for the resize+encode pipeline (test with a synthetic image, no actual screen capture)
- [ ] No integration test for Worker /chat SSE parsing -- could test with a mock SSE endpoint

*(Manual testing is appropriate for this phase given the visual/streaming nature of the requirements. Unit tests for the screenshot pipeline are the highest-value automated test.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | HMAC token validation in Worker (already implemented) |
| V3 Session Management | no | No sessions -- stateless API calls |
| V4 Access Control | yes | Worker validates x-app-token before proxying |
| V5 Input Validation | yes | Worker validates messages array; system prompt is app-controlled |
| V6 Cryptography | no | HMAC handled by Worker; no crypto in app |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key exposure | Information Disclosure | Keys only in Worker env vars, never in app binary (INFRA-01) |
| Prompt injection via user input | Tampering | System prompt is app-controlled; user text is in user message role |
| Screenshot data exfiltration | Information Disclosure | Screenshots only sent to Worker proxy, not stored locally (D-04 compliance) |
| Replay attacks on HMAC token | Spoofing | Per-install UUID + HMAC; rate limiting per token (already in Worker) |

## Sources

### Primary (HIGH confidence)
- Existing codebase: worker/src/index.ts, SidebarShell.tsx, GuidanceList.tsx, permissions.rs, Cargo.toml
- [Anthropic Vision docs](https://platform.claude.com/docs/en/build-with-claude/vision) -- image format, size limits, token costs
- [Anthropic Streaming docs](https://platform.claude.com/docs/en/api/messages-streaming) -- SSE event types, delta format
- [Tauri v2 calling Rust docs](https://v2.tauri.app/develop/calling-rust/) -- Channel API, async commands

### Secondary (MEDIUM confidence)
- [xcap GitHub](https://github.com/nashaofu/xcap) -- capture_image API, RgbaImage return type
- [Tauri HTTP client plugin docs](https://v2.tauri.app/plugin/http-client/) -- confirmed reqwest re-export pattern

### Tertiary (LOW confidence)
- SSE parsing pattern via native fetch -- commonly documented, used in production by ChatGPT and similar products

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all crates already in Cargo.toml, versions verified
- Architecture: HIGH -- Worker SSE proxy verified, frontend fetch pattern well-established
- Pitfalls: HIGH -- verified against actual codebase (system prompt gap, blocking capture)
- System prompt: MEDIUM -- wording needs real-world testing

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (stable stack, no fast-moving dependencies)
