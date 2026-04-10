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

export interface StreamGuidanceOptions {
  token: string;
  screenshot: string | null;
  userIntent: string;
  onToken: (text: string) => void;
  onError: (error: string) => void;
  onDone: () => void;
  signal?: AbortSignal;
}

export async function streamGuidance(opts: StreamGuidanceOptions): Promise<void> {
  const { token, screenshot, userIntent, onToken, onError, onDone, signal } = opts;

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
        model: "claude-3-5-sonnet-20241022",
        messages: [{ role: "user", content: userContent }],
        system: SYSTEM_PROMPT,
        max_tokens: 4096,
      }),
      signal,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") return;
    onError("Couldn't reach AI -- check your connection.");
    return;
  }

  if (!response.ok || !response.body) {
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
