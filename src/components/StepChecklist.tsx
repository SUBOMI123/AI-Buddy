import { For, Show, createSignal } from "solid-js";
import { Check, Square, Clipboard } from "lucide-solid";
import type { Step } from "../lib/parseSteps";

interface StepChecklistProps {
  steps: Step[];                    // D-10: locked interface shape
  currentStepIndex: number;         // Phase 10 UAT fix: explicit highlight state driven from parent
  onToggle: (index: number) => void;
}

// D-08: Command-line heuristic — single-line prefixes that get a copy button
// Note: Multi-line code fences cannot appear in step labels (step regex is single-line).
// The fence copy case is covered by the command heuristic for common patterns.
const COMMAND_PATTERN = /^(\$\s|git |npm |npx |yarn |pnpm |pip |python[23]?\s|node |cd |ls |mkdir |curl |brew |cargo |go |docker |kubectl )/;

// D-09: navigator.clipboard with execCommand fallback; silent fail
async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for unfocused window or restricted macOS context (D-09)
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy"); // deprecated but kept as fallback
    document.body.removeChild(el);
    if (!ok && import.meta.env.DEV) {
      console.warn("copyToClipboard: execCommand fallback also failed");
    }
  }
  // Silent fail if both paths error — copy is optional UX, never blocking (D-09)
}

function isCommandLine(label: string): boolean {
  return COMMAND_PATTERN.test(label.trim());
}

// Extract the first backtick-wrapped token from a step label.
// Returns the token if it matches COMMAND_PATTERN (is a command), otherwise null.
// This handles prose-prefixed steps like "Run `git branch -a` to see branches".
function extractInlineCommand(label: string): string | null {
  const match = label.match(/`([^`]+)`/);
  if (!match) return null;
  const token = match[1];
  return COMMAND_PATTERN.test(token) ? token : null;
}

export function StepChecklist(props: StepChecklistProps) {
  // Phase 10 UAT fix: currentStepIndex is now a prop driven from SidebarShell — not derived locally
  const [copiedIndex, setCopiedIndex] = createSignal<number | null>(null);

  return (
    // D-10: container aria attrs
    <div
      aria-label="Step checklist"
      aria-live="polite"
      style={{ display: "flex", "flex-direction": "column" }}
    >
      <For each={props.steps}>
        {(step, index) => {
          // D-03: reactive derivations — evaluated per render
          // NOTE: with createSignal<Step[]>, step is a snapshot; SolidJS re-runs
          // For items when the array signal changes (see RESEARCH.md Pitfall 1)
          // Phase 10 UAT fix: isCurrent uses prop directly — not derived from first-incomplete
          const isCurrent = () => index() === props.currentStepIndex && !step.completed;
          const isCompleted = () => step.completed;
          const inlineCmd = () => extractInlineCommand(step.label);
          const showCopyButton = () => inlineCmd() !== null || isCommandLine(step.label);

          return (
            <button
              onClick={() => props.onToggle(index())}
              aria-label={`Step ${index() + 1}: ${step.label}`}
              style={{
                // D-03: current step highlight
                background: isCurrent()
                  ? "var(--color-surface-secondary)"
                  : "transparent",
                "border-left": isCurrent()
                  ? "3px solid var(--color-accent)"
                  : "3px solid transparent",  // preserves column width (UI-SPEC)
                "min-height": "44px",           // D-10: accessibility touch target
                padding: "var(--space-sm) var(--space-md)",
                display: "flex",
                "align-items": "center",
                gap: "var(--space-sm)",
                border: "none",                 // reset button border (only left-border applies)
                "border-top": "none",
                "border-right": "none",
                "border-bottom": "none",
                "text-align": "left",
                cursor: "pointer",
                width: "100%",
              }}
            >
              {/* Step number — UAT fix: visible position indicator */}
              <span
                style={{
                  "font-size": "var(--font-size-body)",
                  "line-height": "var(--line-height-body)",
                  color: "var(--color-text-secondary)",
                  "min-width": "16px",
                  "text-align": "right",
                  "flex-shrink": "0",
                }}
              >
                {index() + 1}
              </span>

              {/* D-10: Check icon for completed, Square for incomplete */}
              <Show
                when={isCompleted()}
                fallback={
                  <Square
                    size={16}
                    style={{ color: "var(--color-text-primary)", "flex-shrink": "0" }}
                  />
                }
              >
                <Check
                  size={16}
                  style={{ color: "var(--color-text-secondary)", "flex-shrink": "0" }}
                />
              </Show>

              {/* Step label — styling per D-03 and UI-SPEC */}
              <span
                style={{
                  "font-size": "var(--font-size-body)",
                  "font-weight": "var(--font-weight-regular)",
                  "line-height": "var(--line-height-body)",
                  color: isCompleted()
                    ? "var(--color-text-secondary)"
                    : "var(--color-text-primary)",
                  "text-decoration": isCompleted() ? "line-through" : "none",
                  flex: "1",
                  "word-wrap": "break-word",
                }}
              >
                {step.label}
              </span>

              {/* D-08: Inline copy button for command-pattern labels */}
              <Show when={showCopyButton()}>
                <button
                  onClick={(e) => {
                    e.stopPropagation(); // D-04: prevent triggering onToggle on parent
                    copyToClipboard(inlineCmd() ?? step.label);
                    setCopiedIndex(index());
                    setTimeout(() => setCopiedIndex(null), 1500);
                  }}
                  aria-label="Copy command"
                  style={{
                    display: "inline-flex",
                    "align-items": "center",
                    "justify-content": "center",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    "min-height": "44px",   // UI-SPEC: touch target
                    "min-width": "44px",
                    "margin-left": "var(--space-xs)",  // UI-SPEC: 4px gap from text
                    color: "var(--color-text-secondary)",
                    "flex-shrink": "0",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color =
                      "var(--color-text-primary)";
                  }}
                  onMouseLeave={(e) => {
                    if (copiedIndex() !== index()) {
                      (e.currentTarget as HTMLButtonElement).style.color =
                        "var(--color-text-secondary)";
                    }
                  }}
                >
                  <Show
                    when={copiedIndex() === index()}
                    fallback={<Clipboard size={14} />}
                  >
                    <span
                      style={{
                        "font-size": "11px",
                        "font-weight": "600",
                        color: "var(--color-accent)",
                        "white-space": "nowrap",
                      }}
                    >
                      Copied!
                    </span>
                  </Show>
                </button>
              </Show>
            </button>
          );
        }}
      </For>
    </div>
  );
}
