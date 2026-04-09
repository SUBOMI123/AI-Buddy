# Phase 2: Core AI Loop - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-09
**Phase:** 02-core-ai-loop
**Areas discussed:** Screenshot capture flow, Streaming guidance UX, Prompt engineering, Error & edge cases

---

## Screenshot Capture Flow

| Option | Description | Selected |
|--------|-------------|----------|
| On every submit | Capture right when user presses Enter | ✓ |
| On first submit, then on demand | Capture once, user manually re-triggers | |
| Auto-capture on timer | Periodic screenshots every 5-10 seconds | |

**User's choice:** On every submit
**Notes:** Ensures Claude always sees what the user sees at the moment they ask

| Option | Description | Selected |
|--------|-------------|----------|
| Full primary monitor | Captures everything visible | ✓ |
| Active window only | Crop to frontmost app window | |
| You decide | Claude's discretion | |

**User's choice:** Full primary monitor
**Notes:** Maximum context, xcap already supports this

| Option | Description | Selected |
|--------|-------------|----------|
| Resize to 1280px wide, JPEG 80% | ~200-400KB, good clarity | ✓ |
| Full resolution, JPEG 60% | Native res, compressed | |
| Resize to 768px wide, JPEG 70% | Smallest payload ~100KB | |

**User's choice:** Resize to 1280px wide, JPEG 80%

---

## Streaming Guidance UX

| Option | Description | Selected |
|--------|-------------|----------|
| Word-by-word streaming | Text flows in word by word | ✓ |
| Chunk-by-chunk (sentence/step) | Buffer until full step complete | |
| Character-by-character | Typewriter effect | |

**User's choice:** Word-by-word streaming

| Option | Description | Selected |
|--------|-------------|----------|
| Pulsing dots animation | Animated dots below input | ✓ |
| Skeleton placeholder | Gray placeholder lines | |
| Spinner with status text | Spinner + "Analyzing your screen..." | |

**User's choice:** Pulsing dots animation

| Option | Description | Selected |
|--------|-------------|----------|
| Clear and replace | Each new question replaces previous guidance | ✓ |
| Scroll history | Previous Q&A stays, new appends below | |
| You decide | Claude's discretion | |

**User's choice:** Clear and replace

---

## Prompt Engineering

| Option | Description | Selected |
|--------|-------------|----------|
| claude-3-5-sonnet | Best cost/speed/quality balance | ✓ |
| claude-3-7-sonnet | Newer, potentially better UI reasoning | |
| You decide | Use whichever performs best in testing | |

**User's choice:** claude-3-5-sonnet

| Option | Description | Selected |
|--------|-------------|----------|
| Screenshot + user intent only | Just image and text, let Claude infer | ✓ |
| Screenshot + intent + OS/app metadata | Also send OS name, window title | |
| Screenshot + intent + conversation history | Include previous Q&A | |

**User's choice:** Screenshot + user intent only

| Option | Description | Selected |
|--------|-------------|----------|
| Ask clarifying question | Claude asks what specifically they need | ✓ |
| Best guess from screenshot | Claude infers intent, may miss | |
| Hybrid | High confidence → guess, low → ask | |

**User's choice:** Ask clarifying question

---

## Error & Edge Cases

| Option | Description | Selected |
|--------|-------------|----------|
| Show error inline, offer retry | Brief error message + Retry button | ✓ |
| Silent retry then error | Auto-retry once, then show error | |
| You decide | Claude's discretion | |

**User's choice:** Show error inline, offer retry

| Option | Description | Selected |
|--------|-------------|----------|
| Send text-only request | Fall back without screenshot + notice | ✓ |
| Block and re-prompt permission | Show permission dialog again | |
| You decide | Claude's discretion | |

**User's choice:** Send text-only request (fall back gracefully)

---

## Claude's Discretion

- System prompt wording and structure
- SSE streaming chunk parsing approach
- Image encoding pipeline details
- API timeout thresholds

## Deferred Ideas

None — discussion stayed within phase scope.
