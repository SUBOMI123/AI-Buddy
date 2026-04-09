# Roadmap: AI Buddy

## Overview

Five phases take AI Buddy from nothing to a complete v1. Phase 1 establishes the Cloudflare proxy, Tauri shell, system tray, and overlay — the foundation everything else calls. Phase 2 delivers the first working vertical slice: user states intent, app captures the screen, Claude returns streaming guidance. Phase 3 adds voice so users never break eye contact with their work. Phase 4 lets users focus AI attention on a specific screen region. Phase 5 closes the loop with learning memory that makes the assistant smarter the more it's used.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Infrastructure & App Shell** - Cloudflare Worker proxy, Tauri tray app, overlay, screen capture permissions validated
- [ ] **Phase 2: Core AI Loop** - Text intent → screenshot → streaming Claude guidance; first working end-to-end flow
- [ ] **Phase 3: Voice I/O** - Push-to-talk STT and TTS output for eyes-on-screen operation
- [ ] **Phase 4: Screen Region Selection** - Box-select or highlight to focus AI on a specific area
- [ ] **Phase 5: Learning & Adaptation** - Local memory, degrading guidance, derived skill profiles

## Phase Details

### Phase 1: Infrastructure & App Shell
**Goal**: The technical skeleton is deployed and validated — proxy is live, app lives in the system tray, overlay renders without stealing focus, and screen capture permissions are granted on both platforms
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05
**Success Criteria** (what must be TRUE):
  1. Cloudflare Worker is deployed and returns a test response through the proxy without exposing API keys in the app binary
  2. App appears in the system tray / menu bar with no dock icon and no window switcher entry on both macOS and Windows
  3. Global keyboard shortcut invokes the overlay from any foreground app without that app losing focus
  4. Overlay panel renders on screen and can be dismissed without obscuring the user's active work area
  5. App requests and receives screen capture permission on first launch with a clear explanation of what is captured and why
**Plans**: TBD
**UI hint**: yes

### Phase 2: Core AI Loop
**Goal**: Users can describe what they want to do, the app captures the current screen, and Claude streams back actionable step-by-step guidance — the core product loop works end-to-end
**Depends on**: Phase 1
**Requirements**: CORE-01, CORE-02, CORE-03, CORE-04, CORE-05
**Success Criteria** (what must be TRUE):
  1. User types intent ("I want to do X") and receives directional, flow-correct guidance within 3-5 seconds of submission
  2. Guidance text streams into the overlay in real-time — characters appear progressively, not as a single block
  3. Screenshot of the current screen is captured on demand and sent to Claude as visual context without being stored locally
  4. When intent is ambiguous, the AI asks a clarifying question instead of generating a guess
  5. User can complete a task in an unfamiliar app using only the guidance provided
**Plans**: TBD
**UI hint**: yes

### Phase 3: Voice I/O
**Goal**: Users can interact with AI Buddy entirely by voice — push to talk, speak their intent, and hear guidance read back — keeping eyes on the work
**Depends on**: Phase 2
**Requirements**: VOICE-01, VOICE-02
**Success Criteria** (what must be TRUE):
  1. User holds a key, speaks intent, releases, and the transcribed text populates as if typed — no keyboard required
  2. Guidance text is spoken aloud via TTS at a pace and volume suitable for following along while looking at another app
  3. Voice pipeline streams STT in real-time so submission begins before the user finishes speaking (not batch-transcribed after release)
**Plans**: TBD

### Phase 4: Screen Region Selection
**Goal**: Users can draw a box around any part of the screen to focus the AI's attention on a specific area, producing more accurate and targeted guidance
**Depends on**: Phase 2
**Requirements**: SCRN-01
**Success Criteria** (what must be TRUE):
  1. User can draw a selection rectangle over any part of the screen and that region — not the full screenshot — is sent as AI context
  2. Selected region is visually indicated before submission so the user confirms what will be captured
  3. AI guidance explicitly references elements visible in the selected region rather than the broader screen
**Plans**: TBD
**UI hint**: yes

### Phase 5: Learning & Adaptation
**Goal**: The assistant gets smarter with use — tracking what users struggle with and completing, deriving skill profiles, and shortening guidance for concepts the user has already mastered
**Depends on**: Phase 2
**Requirements**: LEARN-01, LEARN-02, LEARN-03
**Success Criteria** (what must be TRUE):
  1. After a task is completed, a record of that completion (app, task type, outcome) is written to local storage — visible and inspectable by the user
  2. On second encounter with the same task type, guidance is measurably shorter than first encounter; on third+ it becomes hints only
  3. A derived skill profile summarizing strengths and recurring struggles is accessible to the user without requiring manual input
  4. All learning data is stored locally — no learning data leaves the device
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Infrastructure & App Shell | 0/TBD | Not started | - |
| 2. Core AI Loop | 0/TBD | Not started | - |
| 3. Voice I/O | 0/TBD | Not started | - |
| 4. Screen Region Selection | 0/TBD | Not started | - |
| 5. Learning & Adaptation | 0/TBD | Not started | - |
