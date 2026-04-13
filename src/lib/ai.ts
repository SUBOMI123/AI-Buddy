const WORKER_URL = import.meta.env.VITE_WORKER_URL || "http://localhost:8787";

export const SYSTEM_PROMPT = `You are AI Buddy, a real-time software guide. The user has sent you a screenshot of their current screen along with what they want to accomplish.

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

// Phase 5: Tier-based prompt suffix — appended to SYSTEM_PROMPT when tier > 1 (D-03)
// Tier 1 (first encounter): no change — full step-by-step behavior
// Tier 2 (second encounter): shorter summary mode
// Tier 3 (third+ encounter): hints only
const TIER_SUFFIX: Record<number, string> = {
  1: "",
  2: "\n\nThis user has completed this task before. Give a shorter summary — skip obvious sub-steps, consolidate related actions into single steps. Still number the steps. Do not mention that you're giving a shorter version.",
  3: "\n\nThis user has completed this task multiple times. Give directional hints only — one or two sentences pointing them in the right direction. No numbered list, no sub-steps. Assume they know the basics.",
};

export interface StreamGuidanceOptions {
  token: string;
  screenshot: string | null;
  userIntent: string;
  onToken: (text: string) => void;
  onError: (error: string) => void;
  onDone: () => void;
  signal?: AbortSignal;
  // Phase 5: Learning & Adaptation
  tier?: number;          // 1=full, 2=summary, 3=hints. Default: 1 (D-03)
  memoryContext?: string; // Short summary string injected into system prompt (D-08)
  taskLabel?: string;     // For post-completion recording (D-01)
  // Phase 8: CTX-02 — active app context for prompt enrichment
  appContext?: string;
  // Phase 9: SESS-01 — prior turns for multi-turn conversation (D-08)
  // Caller is responsible for enforcing the 3-turn cap (D-09) before passing this array.
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
}

export async function streamGuidance(opts: StreamGuidanceOptions): Promise<void> {
  const { token, screenshot, userIntent, onToken, onError, onDone, signal } = opts;
  const { tier = 1, memoryContext, appContext, conversationHistory } = opts;
  const systemPrompt =
    SYSTEM_PROMPT +
    (TIER_SUFFIX[tier] ?? "") +
    (appContext ? `\n\nThe user is currently working in: ${appContext}` : "") +
    (memoryContext
      ? `\n\n## User skill context\n${memoryContext}`
      : "");

  // Build user content array with optional vision (D-09: screenshot + intent only)
  const userContent: Array<Record<string, unknown>> = [];

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

  let response: Response;
  try {
    response = await fetch(`${WORKER_URL}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-app-token": token,
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        messages: [
          ...(conversationHistory ?? []).map((turn) => ({
            role: turn.role,
            content: turn.content,  // text-only for prior turns (D-08)
          })),
          { role: "user" as const, content: userContent },  // current turn with screenshot
        ],
        system: systemPrompt,
        max_tokens: 4096,
      }),
      signal,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") return;
    onError("Couldn't reach AI -- check your connection.");
    return;
  }

  if (!response.ok) {
    // Attempt to read error body for richer diagnostics
    let detail = "";
    try {
      const body = await response.json() as { error?: string };
      detail = body.error ? ` (${body.error})` : "";
    } catch { /* ignore parse failure */ }

    if (response.status === 429) {
      onError(`Rate limit reached -- please wait a moment and try again.${detail}`);
    } else if (response.status === 401 || response.status === 403) {
      onError(`Authentication error -- check your app token.${detail}`);
    } else {
      onError(`AI service error (${response.status})${detail} -- try again.`);
    }
    return;
  }
  if (!response.body) {
    onError("Couldn't reach AI -- check your connection.");
    return;
  }

  // Parse SSE stream (Pitfall 3: buffer partial lines)
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // keep incomplete line in buffer

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;

        const data = line.slice(6);
        if (data === "[DONE]") {
          onDone();
          return;
        }

        try {
          const event = JSON.parse(data);
          if (
            event.type === "content_block_delta" &&
            event.delta?.type === "text_delta"
          ) {
            onToken(event.delta.text);
          }
          if (event.type === "error") {
            onError(event.error?.message || "Something went wrong. Try again in a moment.");
            return;
          }
        } catch {
          // Skip unparseable lines (ping, empty data, etc.)
        }
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") return;
    onError("Connection lost -- try again.");
    return;
  }

  onDone();
}
