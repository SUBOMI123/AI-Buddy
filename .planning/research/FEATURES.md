# Feature Landscape

**Domain:** AI-powered desktop task-completion guide (screen-aware)
**Researched:** 2026-04-10 (v2.0 milestone supplement — answers six UX questions about v2 target features)
**Products analyzed:** Raycast AI, GitHub Copilot inline chat, Notion AI, Wispr Flow, Linear, VS Code agent mode, Cursor, installation wizards (PatternFly), Tauri multi-monitor APIs

---

## Scope Note

This file supplements the v1.0 FEATURES.md with research specific to the six feature questions raised for the v2.0 milestone. It answers:
1. Action-first UI — what is table stakes vs optional in action pickers?
2. Step progress tracking — what makes guided steps feel good vs clunky?
3. Conversation continuity — task session vs thread mental model?
4. App/context detection — how do tools detect the active app?
5. "Try another way" — when and how to surface fallback paths?
6. Multi-monitor overlay positioning — expected behaviors?

---

## 1. Action-First UI (Quick Action Buttons on Selection)

### How Leading Tools Implement This

**Notion AI inline toolbar** is the clearest reference. When text is selected, a contextual toolbar appears above the selection with prioritized one-click actions ("Improve writing," "Change tone," "Fix spelling & grammar," and a freeform "Ask AI" entry). The design principle: the toolbar does NOT show all possible actions — it surfaces the three to five most contextually relevant ones first, with freeform input as the escape hatch. Source: Notion's own design blog notes they deliberately prioritized editing actions over generative actions because users who have selected text are in editing mode, not generation mode.

**Raycast AI floating window** works as a quick-launch: a single hotkey appears a floating panel that can act on selected text or accept typed prompts. It offers one-liner action presets (Summarize, Fix Grammar, Translate) plus a freeform input. The UI never shows more than five to six preset actions before needing to scroll.

**GitHub Copilot inline chat** uses slash commands (`/explain`, `/fix`, `/tests`, `/doc`) as the action vocabulary. Triggered by `Cmd+I` in VS Code, the inline panel appears at the selection with a typeahead command list. Table stakes commands are `/explain` and `/fix` — every comparable tool has these. `/tests` and `/doc` are expected in coding contexts but not general contexts.

**Key pattern across all three:** Actions appear without the user navigating away. The user never leaves the current context to trigger an action on selected content. The menu is transient — it dismisses immediately when an action fires or when the user clicks elsewhere.

### Table Stakes vs Optional Actions

**Table stakes (absence feels broken):**
- "Explain this" / "What is this?" — the foundational action for a task guidance tool
- "Help me do this" / freeform prompt input — escape hatch for anything not covered by preset buttons
- Dismiss / close — user must be able to reject the action picker instantly

**Strong differentiators (highly valued in context):**
- Context-specific suggested actions (e.g., for a terminal screenshot: "What does this error mean?" vs for a form screenshot: "How do I fill this in?") — this is the AI-generated async action list described in PROJECT.md
- "Try another way" as a persistent action after guidance is delivered (covered in section 5)
- Copy guidance — copy the entire response to clipboard

**Optional / phase 2:**
- Custom saved actions ("My prompts") — Raycast and KeyShift AI both offer this; adds complexity without V2 payoff
- Action history / recently used — nice-to-have, deferred
- Action sharing across devices — enterprise feature, deferred

### Recommended Action Set for AI Buddy V2

Fixed buttons (always shown, no AI latency):
1. "What is this?" — explain the selected region
2. "How do I [last intent]?" — repeat the last task intent with fresh screenshot
3. Freeform text input (placeholder: "Ask about this...")

AI-suggested buttons (async, appear after ~1-2s):
- Two to three AI-inferred actions based on screenshot content (e.g., "Debug this error", "Show me how to configure this setting")
- These load after the fixed buttons to avoid blocking the UI

**Complexity:** Medium. Fixed buttons are trivial. The async AI-suggested actions require a fast preliminary screenshot + lightweight prompt to generate suggestions before the user types.

**Dependencies:** Requires existing screenshot capture (SCRN-01) and region selection (v1). Action suggestions need a fast non-streaming Claude call.

---

## 2. Step Progress Tracking

### How Guided UIs Handle Step State

Well-regarded guidance UIs (installation wizards, PatternFly Wizard, Stripe onboarding, interactive tutorials) converge on a small set of rules that separate "feels good" from "feels clunky."

**What makes them feel good:**
- **Current step is always visually dominant.** The active step uses a distinct color or weight (not just an indicator dot). Users should never have to ask "where am I?"
- **Completed steps show a checkmark, not just a grayed label.** The checkmark signals finality. A grayed-out number without a checkmark is ambiguous — is it complete or just not active?
- **Step count is visible upfront.** "Step 3 of 6" in a header costs nothing and sets expectation. Users who don't know how many steps remain have higher anxiety and abandon more.
- **Steps are independently re-runnable.** Clicking a completed step replays it. This is critical for task completion tools — if the user missed step 2, they must be able to re-hear/re-read it without starting over.
- **Steps do not disable forward navigation.** In installation wizards, future steps are often grayed out and unclickable. In a guidance context, the user should be able to jump ahead (they may have already done step 4 manually). Lock-step enforcement = clunky.

**What makes them feel clunky:**
- Steps that disappear after completion — user loses the reference
- Steps that cannot be jumped back to — forces re-running from start
- Step numbering that resets on a new guidance answer — breaks continuity within a task session
- Per-step confirmations (clicking "Mark done") instead of passive tracking — adds friction, especially when voice is in use

### Recommended Pattern for AI Buddy V2

**Passive progress, not active checkboxes.** The user clicks a step to mark it done (or check it off), but does not need to interact with steps to proceed. The AI guidance scrolls with a persistent sidebar or inline indicator showing step 1/4, 2/4, etc. Current step is highlighted. Completed steps show a checkmark and remain readable in context.

**Replay is click-to-jump.** Any step number is tappable and re-reads that step (text highlight + optional TTS re-read). This is essential for voice mode.

**No step gating.** User can jump to any step. This is a guidance tool, not a wizard. The AI does not enforce sequential execution.

**Step count from response structure.** Step count is derived from the numbered list in Claude's response, not a separate data source. The parsing logic reads "1.", "2.", etc. and renders the progress indicator accordingly.

**Complexity:** Medium. Requires parsing structured step responses into a step model with state (pending / active / completed). The TTS replay-per-step adds a thin layer of step-to-audio segment mapping.

**Dependencies:** Requires step-first system prompt enforcement (PROJECT.md v2 target). Step tracking is meaningless if guidance responses are not consistently numbered lists.

---

## 3. Conversation Continuity

### How Tools Maintain Multi-Turn Context Without Feeling Like Chat

The distinction between "task session" and "conversation thread" is real and consequential for product design.

**Conversation thread** (ChatGPT model): Infinite scroll of messages, each message paired with a response. History is the primary navigation surface. Users mentally model this as "talking to someone." The problem: the session never ends, threads accumulate, and returning to a previous task means hunting through message history.

**Task session** (the correct mental model for AI Buddy): A session is tied to a goal ("I'm trying to export this report as PDF"). All follow-ups within that session inherit context from the goal. The session ends when the user dismisses the overlay or explicitly starts a new task. Sessions can be archived and recalled by name/app/date, but they are not the primary surface — the current task is.

**Supporting evidence from the field:**
- Cursor's AI context model uses files + chat history within a "conversation" scoped to an editing session. The conversation context resets when a new file or new topic starts. Users reported this felt "natural" because the context boundary aligned with their own mental boundary.
- Wispr Flow's context awareness is scoped per-app: when you switch apps, the formatting context updates automatically. This implicit session scoping matches user expectations.
- Research on context windows (Digestible UX, 2025) shows users are confused when an AI "forgets" something from earlier in the same session. The solution is not infinite memory — it's making the session boundary explicit and respected within the session.

### Recommended Pattern for AI Buddy V2

**A task session is: one goal + all follow-ups + all screenshots taken while that goal is active.**

When the user starts a new session (opens overlay, states a goal), AI Buddy sends the goal + screenshot to Claude and begins streaming. Follow-up messages in the same session send the accumulated message history + a fresh screenshot (if the user re-captures). Claude maintains full multi-turn context.

When the user closes the overlay or types a new, unrelated intent, the previous session is archived. Response history is accessible via scroll-back within the current session; previous sessions are accessible via a history panel (V2 scope).

**Do not call it a "chat."** Call it a "session" or "task" in the UI. The mental model difference is meaningful — "chat" implies casual, open-ended conversation; "session" implies focus, a goal, and an end.

**Do not persist the system tray overlay across tasks.** When a user re-opens the overlay for a new task, they should see a clean state. Session history is opt-in (scroll up) not the default view.

**Complexity:** Low-to-medium. The multi-turn context is handled by passing message history array to Claude (already in Claude's Messages API format). The main work is UI state management: distinguishing "this is a follow-up in the current session" from "this is a new task."

**Dependencies:** Requires SolidJS signal/store to track session state (goal, message history, screenshots). Existing streaming infrastructure (CORE-04) handles the Claude calls.

---

## 4. App / Context Detection

### How Leading Tools Detect the Active App

**Wispr Flow** uses macOS Accessibility API permissions to identify the frontmost application and limited text content (e.g., email recipient names). It requests both Accessibility permission (for active app name, window title, focused element type) and Screen Capture permission for context-aware formatting. The active app name determines text formatting rules (email vs. code editor vs. document).

**Raycast** reads the frontmost application via `NSWorkspace.shared.frontmostApplication` on macOS. This is a standard AppKit API available without special permissions — it returns the bundle ID and display name of the currently active app.

**Windows equivalent:** `GetForegroundWindow()` from `winuser.h`, followed by `GetWindowThreadProcessId` to get PID and `GetWindowTextW` to get the window title. The `windows-rs` crate exposes this directly.

### What App Detection Enables in AI Buddy

The feature value is pre-suggesting relevant actions based on app context — not blocking usage. If the active app is VS Code, the action suggestions lean toward "explain this error," "what does this function do," etc. If it's Figma, suggestions lean toward "how do I do X in Figma."

**Important constraint:** App detection is a quality-of-life feature, not a gate. Every action should work regardless of whether app detection succeeds. App context improves the Claude prompt; it does not change the core mechanic.

### Recommended Implementation for AI Buddy V2 on macOS

```
1. On overlay open: call NSWorkspace.shared.frontmostApplication via objc2-app-kit crate
2. Extract: bundle ID (com.apple.dt.Xcode), display name ("Xcode"), and window title
3. Inject into Claude system prompt: "The user is currently working in [Xcode]. Window title: [Build target: MyApp]."
4. Use bundle ID to pre-filter action suggestions (VS Code → coding actions, Figma → design actions, Terminal → shell/error actions)
```

On Windows, `GetForegroundWindow` + `GetWindowTextW` gives equivalent information. No special permissions required on either platform for basic app name/window title detection.

**No Accessibility API required for V2.** Reading the active app name and window title does not require accessibility permission on macOS (that permission is needed for reading element values, not app identity). This avoids a permission-request friction point.

**Complexity:** Low. Single Rust function called at overlay-open time. Tauri command wraps it. The main work is mapping known bundle IDs to action suggestion sets (a small lookup table).

**Dependencies:** `objc2-app-kit` crate on macOS, `windows-rs` on Windows. Both already aligned with the Rust backend. No new permissions required.

---

## 5. "Try Another Way" / Alternative Approaches

### How Tools Surface Fallback Paths

Research on AI failure recovery patterns (Clearly Design, 2025; Microsoft Copilot Studio guidance) converges on a consistent finding: generic fallbacks fail, specific alternatives succeed.

**Bad pattern:** "I didn't understand. Try rephrasing." — user stranded, no direction.

**Good pattern:** "That approach may not work here. Here are two alternatives: [Option A button] [Option B button]." — user has immediate next action.

**The key design tension:** Should "Try another way" be user-triggered (explicit button) or AI-triggered (AI detects the previous suggestion didn't work)?

Evidence from deployed tools:
- **User-triggered is always table stakes.** A persistent "Try another way" or "That didn't work" button visible after every guidance response requires zero AI inference and handles 80% of failure cases. Users know their own context better than the AI.
- **AI-triggered is a differentiator.** If the AI can detect "the user asked a follow-up question that implies the last steps failed" (e.g., "it's not showing that button"), it can proactively offer alternatives without the user having to explicitly request them.

**Recommended trigger logic for V2:**
- Explicit button ("Try another way") on every response — always present, low cost
- AI-detected trigger: if user follow-up message contains failure signals ("it doesn't show," "I don't see," "that's not there," "it's not working"), Claude should open its response with an alternative approach before restating steps

### What "Another Way" Should Produce

Not a re-run of the same guidance. An alternative approach means:
- A different UI path to the same outcome (e.g., keyboard shortcut instead of menu navigation)
- A simpler sub-task decomposition ("Before that, you need to X first")
- An acknowledgment that the AI's first interpretation may have been wrong + a clarifying question

**Do NOT produce:** The same steps with slightly different wording. Users recognize and abandon this immediately.

**Complexity:** Low for explicit button (UI-only, no new AI logic). Medium for AI-detected failure signals (requires intent classification in the follow-up message handling). Recommend shipping explicit button in V2, AI-detected in V2.1 after observing real failure patterns.

**Dependencies:** Requires the conversation continuity session model (Section 3) — "try another way" is only meaningful within a task session where the previous approach is in context.

---

## 6. Multi-Monitor Overlay Positioning

### Expected Behaviors in Multi-Monitor Setups

The standard expectation for floating desktop panels (established by Raycast, Spotlight, Copilot, and other always-on tools) is: **the overlay appears on whichever monitor the cursor is on when the shortcut is triggered.** Not the primary monitor. Not the last-used monitor. The current monitor.

This is the least surprising behavior. Violating it (always opening on primary) is one of the most common desktop overlay bugs reported in user communities.

**Secondary expectations:**
- The panel positions near the center of the active monitor (not the center of the entire virtual desktop space, which is wrong in multi-monitor setups)
- On monitors with different scale factors (e.g., Retina + 1080p), the panel renders at the correct DPI for its current monitor
- If the overlay is dragged to another monitor, it stays there for the remainder of the session

### Tauri-Specific Implementation

Tauri v2 provides the building blocks but has known rough edges:

- `tauri::Monitor::from_point(x, y)` resolves a cursor position to its containing monitor (returns monitor bounds, scale factor)
- `Window::set_position(LogicalPosition)` can position the window at a logical coordinate on any monitor
- Known bug (#14019): when creating multiple overlay windows in multi-monitor setups, all windows may open on the primary monitor. Workaround: create one window, then call `set_position` with the target monitor's coordinate immediately after creation.
- The reference blog post "Why I Chose Tauri v2 for a Desktop Overlay in 2026" (Manasight) documents a working approach: poll cursor position at startup via Rust, resolve to monitor, then position window during the `setup` hook.

**Recommended implementation:**
```
1. On global shortcut trigger: call get_cursor_position() in Rust (platform-specific)
   - macOS: NSEvent.mouseLocation via objc2
   - Windows: GetCursorPos() via windows-rs
2. Call available_monitors() from Tauri App handle
3. Find the monitor whose bounds contain the cursor position
4. Position the overlay window at (monitor.x + monitor.width/2 - panel_width/2, monitor.y + offset)
5. Use monitor.scale_factor for any DPI-aware sizing
```

**Complexity:** Low-medium. The Rust cursor position call is a few lines. The monitor resolution and window positioning is straightforward. The main risk is the Tauri multi-monitor window creation bug — mitigated by the set_position-after-creation workaround.

**Dependencies:** Existing Tauri window management. No new crates required; `objc2-app-kit` (already needed for Section 4) provides the macOS cursor APIs.

---

## Table Stakes vs Differentiators: V2 Feature Classification

| Feature | Classification | Complexity | Depends On |
|---------|---------------|------------|------------|
| Fixed action buttons on region selection | Table stakes | Low | SCRN-01 (v1) |
| Step numbering visible in guidance response | Table stakes | Low | Step-first prompt (v2) |
| Current step highlight | Table stakes | Low | Step numbering |
| "Try another way" explicit button | Table stakes | Low | Session continuity |
| Multi-monitor overlay on active monitor | Table stakes | Medium | Rust cursor detection |
| Inline copy buttons for code/commands | Table stakes | Low | Streaming response parser |
| Session continuity within task (follow-up) | Table stakes | Medium | Claude message history |
| Completed step checkmark (click-to-mark) | Table stakes | Low | Step state model |
| AI-suggested async action buttons | Differentiator | Medium | Fast screenshot + quick Claude call |
| App/context detection → pre-suggested actions | Differentiator | Low | objc2 / windows-rs |
| Step replay (click step to re-read/re-hear) | Differentiator | Medium | Step state + TTS segment mapping |
| AI-detected failure → proactive "try another way" | Differentiator | Medium | Follow-up intent classification |
| Response history (scroll back in session) | Differentiator | Low | Session message store |

---

## Anti-Features (V2)

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Step gating (lock to sequential progress) | Users may have already done step 3 manually; forcing them to "complete" steps 1 and 2 first is patronizing and wrong | Allow any step to be jumped to; track state passively |
| Per-step "Mark done" required confirmation | In voice mode, the user's hands are busy. In all modes, adding a click per step increases friction for no payoff | Single click to mark done is optional; passive highlight of current step is default |
| Chat thread as primary navigation surface | Positions AI Buddy as another chatbot. History becomes the UI instead of the current task | Task session model: current task is always the primary view; history is scroll-up opt-in |
| Opening overlay on primary monitor always | Users with secondary monitors as primary workspace are alienated immediately | Cursor-based monitor detection on every invocation |
| Showing all possible actions in action picker | Overwhelming. Research shows five or fewer choices before needing scroll/search | Fixed 2-3 + AI-suggested 2-3, total never exceeds 6 buttons visible |
| "Try another way" that regenerates the same steps | Users recognize paraphrased repetition and lose trust | Alternative must take a genuinely different approach (different path, keyboard shortcut, simpler sub-task) |
| Conversation memory across sessions (auto) | Privacy implication. Users haven't opted in to "the AI remembers everything I asked across all sessions" | Session is scoped to current overlay open/close cycle. Cross-session memory is opt-in via LEARN-01 |

---

## Feature Dependencies (V2)

```
Step-first system prompt (v2)
  → Step number parsing → step progress indicator
  → Step state model → completed checkmarks, current step highlight
  → Step replay → TTS per-step segment → step state model

Session continuity (message history)
  → "Try another way" explicit button (needs context of what was tried)
  → AI-detected failure signals (needs follow-up in session context)
  → Response history (scroll-back in session)

Multi-monitor cursor detection (Rust)
  → Overlay positioned on active monitor
  → (also used by) App detection (cursor position + frontmost app resolve together)

App detection (bundle ID + window title)
  → AI-suggested action buttons (actions filtered by app context)
  → Richer Claude system prompt context
```

---

## Sources

- Raycast AI floating window and actions: https://manual.raycast.com/ai and https://www.raycast.com/core-features/ai
- Raycast Action Panel API: https://developers.raycast.com/api-reference/user-interface/action-panel
- Notion AI inline toolbar design thinking: https://www.notion.com/blog/the-design-thinking-behind-notion-ai
- GitHub Copilot inline chat slash commands: https://docs.github.com/en/copilot/reference/chat-cheat-sheet
- GitHub Copilot VS Code features: https://code.visualstudio.com/docs/copilot/reference/copilot-vscode-features
- ShapeOfAI inline action pattern: https://www.shapeof.ai/patterns/inline-action
- PatternFly Wizard design guidelines: https://www.patternfly.org/components/wizard/design-guidelines/
- Stepper UI design (Eleken): https://www.eleken.co/blog-posts/stepper-ui-examples
- Progress trackers UX (UXPin): https://www.uxpin.com/studio/blog/design-progress-trackers/
- Context window UX problem (DigestibleUX): https://www.digestibleux.com/p/context-window-ais-invisible-ux-challenge
- Session persistence in AI chat: https://predictabledialogs.com/learn/ai-stack/session-persistence-ai-chat-continuity-strategies
- Agent UX patterns (Hatchworks): https://hatchworks.com/blog/ai-agents/agent-ux-patterns/
- Agentic UX patterns (Sandhya Hegde): https://manialabs.substack.com/p/agentic-ux-and-design-patterns
- Wispr Flow context awareness docs: https://docs.wisprflow.ai/articles/4678293671-feature-context-awareness
- NSWorkspace active app detection (objc2-app-kit): https://docs.rs/objc2-app-kit/latest/objc2_app_kit/struct.NSWorkspace.html
- Windows GetForegroundWindow Rust: https://microsoft.github.io/windows-docs-rs/doc/windows/Win32/UI/WindowsAndMessaging/fn.GetForegroundWindow.html
- Tracking active process Windows Rust: https://hellocode.co/blog/post/tracking-active-process-windows-rust/
- AI failure recovery design patterns: https://clearly.design/articles/ai-design-4-designing-for-ai-failures
- Microsoft Copilot Studio fallback design: https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/cux-fallbacks
- Chatbot fallback logic design: https://uxcontent.com/designing-chatbots-fallbacks/
- Tauri multi-monitor window bug (#14019): https://github.com/tauri-apps/tauri/issues/14019
- Tauri Monitor::from_point feature request: https://github.com/tauri-apps/tauri/issues/3057
- Tauri v2 overlay positioning (Manasight 2026): https://blog.manasight.gg/why-i-chose-tauri-v2-for-a-desktop-overlay/
- Tauri cursor position discussion: https://github.com/tauri-apps/tauri/discussions/4943
