# Feature Landscape

**Domain:** AI-powered desktop task-completion guide (screen-aware)
**Researched:** 2026-04-09
**Products analyzed:** Clicky, Highlight AI, Precogni, Screenpipe, Rewind/Limitless, Microsoft Copilot (Click to Do / Copilot Vision), Apple Intelligence (Visual Intelligence / Screen Awareness), Pieces for Developers, Desktop AI Companion, Screenpipe

---

## Table Stakes

Features users expect from any screen-aware AI desktop assistant. Missing one of these and users feel the product is incomplete or broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Intent capture (text or voice) | Every AI tool in this space accepts natural language — text as minimum, voice as growing norm | Low | Text is MVP; voice differentiates but expected within V1 |
| Screen context understanding | Core mechanism of the product category. Without it, the tool is just another chatbot | High | Screenshot + vision model is the de facto approach. OCR + accessibility tree are faster alternatives |
| Step-by-step response | Users asking "how do I do X" expect a sequence, not a paragraph | Low | The output format, not the input. Critical that steps are ordered correctly and reference visible UI elements |
| System tray / background presence | Always-on tools must live at OS level — not open as a window users have to switch to | Low | Clicky, Highlight AI, Precogni all use this model. Absence signals a toy, not a tool |
| Global keyboard shortcut to invoke | Users must be able to trigger the assistant without leaving current context | Low | One shortcut is table stakes. Most tools use Cmd+Shift+Space or similar |
| Multimodal input (voice + text) | Voice for flow-state, text for precision. Products offering only one feel limited | Medium | Push-to-talk is the standard pattern for screen-aware tools |
| Non-obstructive overlay UI | Tool must not steal focus or obscure the screen being discussed | Medium | Floating panel, transparent overlay, or small docked widget are all acceptable |
| Privacy transparency | Screen capture sends frames to a server. Users demand to know this explicitly | Low | Must disclose what is captured, when, and where it goes. Absence triggers trust collapse |
| Response within 3-5 seconds | Any longer and users assume the tool is broken or not watching | Medium | Network + vision model latency. Streaming responses help perceived speed |

---

## Differentiators

Features that set this product apart. Not universally expected — but highly valued and hard to copy quickly.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Degrading guidance (progressive disclosure) | Users feel like they're getting better over time. Detail when needed, hints after mastery. Reduces fatigue from repetitive explanations | High | No other tool in this space implements this. Requires persistent memory + per-task familiarity model |
| Lightweight learning memory | The assistant skips steps the user already knows. Feels personal, not generic | High | Store granular task/step success per user. Derive skill profiles from raw data. Must be local-first |
| Directional guidance language | "Top toolbar → filter icon" beats coordinates or pixel positions. Works even when UI changes slightly | Medium | Clicky uses POINT tags for pixel-level pointing. Directional guidance is more robust to UI change |
| Screen region selection (box-select / highlight) | User focuses the AI on exactly what they mean. Reduces ambiguity and improves accuracy | Medium | Reduces "what am I looking at?" errors. Differentiates from pure voice-only tools like Clicky |
| Universal app coverage (zero integrations) | Works on any software out of the box. No API, no plugin needed | Low (concept) / High (accuracy) | This is a positioning differentiator — contrasts with app-specific tools that require integrations |
| Cross-platform (macOS + Windows) | Doubles addressable market vs Mac-only peers like Clicky | High | Clicky is Swift/macOS-only. Windows version built by third parties shows unmet demand |
| Task completion success as primary metric | Optimizes for "did the user do it" not "was the response accurate" | Low (metric) / High (culture) | Most AI tools optimize for response quality. This is a product philosophy that changes how features are designed |
| Voice output (TTS) | Allows eyes-on-screen, hands-off guidance. User hears steps while executing them | Medium | ElevenLabs (Clicky's approach) or OS TTS. Critical for complex multi-step workflows |
| Interruption support | User can barge in mid-response to correct course or ask follow-up | Medium | Standard in voice UX design — most screen AI tools don't implement it. Creates natural conversation feel |
| Contextual clarification prompts | When intent is ambiguous, AI asks one targeted question rather than guessing or failing | Medium | "Are you trying to filter the current view, or export a filtered report?" reduces guidance failure rate |

---

## Anti-Features

Features to deliberately NOT build. Each has a reason grounded in user experience, product scope, or architectural cost.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Proactive / always-watching suggestions | Microsoft Recall and always-on monitors triggered strong user backlash. Feels like surveillance, not help. Android users disabled AI features specifically to stop unsolicited suggestions | Stay user-initiated. User speaks or types → AI responds. Never push suggestions unprompted |
| Autonomous computer use / click automation | Changes trust model entirely. Users lose sense of control. High failure rate causes cascading errors. Outside V1 scope | Teach the user to do it themselves. Guidance, not automation. Mark for V3+ only |
| Screen history / persistent recording | Rewind AI generated a privacy nightmare label from press. Users rejected it even when the product was technically good | Capture only on demand (when user asks). No continuous recording. Communicate this clearly |
| App-specific integrations / API dependencies | Any integration is a maintenance surface and an onboarding friction point. Breaks the "works universally" promise | Vision-based universal understanding only. If the user can see it, the AI can help |
| Chatbot / open-ended conversation mode | Positions the product as "another AI chatbot." Dilutes focus on task completion. Users already have ChatGPT | Keep interaction model goal-oriented: intent → steps → done. No idle chat |
| Pixel-perfect cursor pointing | Brittle — breaks when app updates UI. High implementation cost. Poor ROI vs directional guidance which works at 70-80% accuracy | Directional references to screen regions, icons, labels. "Top right → gear icon" not "pixel 1240, 44" |
| Rich visual overlays / screen annotations | V1 scope risk. High complexity. Platform-specific rendering. Hard to do well without looking amateur | Text/voice guidance is sufficient for V1. Arrows and highlights deferred to V2+ |
| Mobile app | iOS/Android sandboxing prevents screen observation of other apps. Core mechanic doesn't exist on mobile | Desktop only. Web-based future-state if OS APIs mature |
| Team / enterprise sharing features | Wrong product stage. Adds auth complexity, multi-tenancy, compliance concerns. Dilutes individual user focus | Single-user, local-first. Revisit in V3+ after validating core loop |
| Onboarding tutorials / gamification | This is a task-completion tool, not a learning platform. Users want to accomplish something, not learn the app | Get users to their first successful task completion in under 2 minutes. That IS the onboarding |

---

## Feature Dependencies

Core features must be in place before dependent features are buildable:

```
Intent capture (REQ-001)
  → Step-by-step guidance (REQ-004)        [can't guide without knowing the goal]
  → Screen observation (REQ-002)           [gives context to interpret intent]
      → Screen region selection (REQ-003)  [refines which screen area to analyze]
      → Degrading guidance (REQ-006)       [needs observation to know what user sees]

Learning memory (REQ-005)
  → Degrading guidance (REQ-006)           [memory drives adaptation]
  → Task completion tracking              [source data for memory]

Voice I/O (REQ-008)
  → Intent capture (text variant first)   [voice builds on text input infrastructure]
  → TTS output                            [pairs with voice input but independently useful]

Step-by-step guidance (REQ-004)
  → Degrading guidance (REQ-006)          [must have base guidance before adapting it]
  → Contextual clarification prompts      [requires guidance to know what's ambiguous]
```

---

## MVP Recommendation

**Prioritize for V1:**

1. Intent capture — text first, voice alongside or shortly after
2. Screen observation — screenshot on demand, sent to Claude vision
3. Step-by-step guidance — directional, flow-correct, visually descriptive
4. System tray presence + global shortcut — product feels like part of the OS
5. Voice output (TTS) — lets users keep eyes on screen while following steps
6. Privacy transparency — required before any user adoption

**Defer:**

- Screen region selection (REQ-003): High value, but V1 can succeed without it. Add in V1.1 after basic guidance loop is validated
- Degrading guidance (REQ-006): Requires memory and multiple task observations to work well. Build memory infrastructure in V1, activate degrading behavior in V1.2+
- Interruption / barge-in: V1 push-to-talk can use stop/restart. True interruption handling is a V2 voice feature
- Contextual clarification prompts: Implement once failure modes of ambiguous intent are observed in real usage

---

## Competitive Gap Analysis

Where this product has clear open space vs. existing tools:

| Gap | Current State | AI Buddy Opportunity |
|-----|---------------|----------------------|
| Cross-platform task guidance | Clicky is Mac-only. Highlight AI is Mac+Windows but observation-focused, not guidance-focused | First cross-platform, guidance-first, screen-aware task completion tool |
| Adaptive guidance (degrading over time) | No tool in this space does this | Only tool that gets less verbose as user gets more capable |
| User-initiated only (no surveillance) | Most tools lean proactive (Screenpipe, Recall) and face backlash | Explicit privacy-safe model as product differentiator, not afterthought |
| Universal app coverage | Most tools specialize (coding, meetings, browser) | Works on any software including obscure enterprise tools, legacy apps |
| Goal-completion orientation | Most tools answer questions or summarize. Task completion is implicit | Explicit success metric: did the user finish the task? |

---

## Sources

- Clicky (farzaa/clicky): https://github.com/farzaa/clicky — architecture, cursor pointing, push-to-talk pattern
- Highlight AI: https://highlightai.com — screen awareness, MCP integration, local processing
- Precogni: https://precogniai.com — multimodal, non-obstructive overlay pattern
- Screenpipe: https://screenpi.pe — 24/7 recording approach, privacy tradeoffs, accessibility tree approach
- Microsoft Copilot Vision / Click to Do: https://futurework.blog/2025/10/29/when-copilot-sees-your-screen-copilot-vision/ — on-device processing, window-sharing UX
- Apple Intelligence screen awareness: https://www.macrumors.com/2025/06/12/apple-intelligence-siri-spring-2026/ — on-screen awareness status
- Pieces for Developers: https://pieces.app/features — long-term memory, contextual scoping
- Privacy backlash (Recall, browser extensions): https://techxplore.com/news/2025-08-ai-web-browser-privacy.html — anti-feature evidence
- Progressive disclosure / adaptive guidance: https://www.aiuxdesign.guide/patterns/progressive-disclosure
- Voice UX best practices: https://lollypop.design/blog/2025/august/voice-user-interface-design-best-practices/
- AI agent anti-patterns: https://achan2013.medium.com/ai-agent-anti-patterns-part-1-architectural-pitfalls-that-break-enterprise-agents-before-they-32d211dded43
- AI assistant trust / UX: https://orangeloops.com/2025/07/9-ux-patterns-to-build-trustworthy-ai-assistants/
- Screenpipe vs Limitless 2026: https://screenpi.pe/blog/screenpipe-vs-limitless-2026
