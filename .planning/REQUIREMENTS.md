# AI Buddy — V1 Requirements

## REQ-001: Intent Capture
The app must accept user intent via voice or text input. User states what they want to accomplish (e.g., "I want to filter by last 30 days"). The system interprets intent, not UI element descriptions.

## REQ-002: Screen Observation
The app must capture the current screen state to understand what the user is looking at. Directional accuracy (~70-80%) is sufficient — identify regions (toolbar, sidebar, main area), icons, and labels. Pixel-perfect precision is NOT required.

## REQ-003: Screen Selection
Users must be able to highlight or box-select a region of the screen to focus the AI's attention on a specific area. This narrows context and improves guidance accuracy.

## REQ-004: Step-by-Step Guidance
The app must respond with clear, concise, sequential steps to complete the user's intended task. Steps must be:
- Directionally accurate ("top toolbar → filter icon")
- Flow-correct (steps actually lead to the outcome, no dead ends)
- Visually descriptive (reference positions, icons, labels — not coordinates)

## REQ-005: Lightweight Learning Memory
The app must track:
- What the user has struggled with
- What tasks they've completed successfully
- Specific knowledge gaps and strengths (granular)

This memory is used to:
- Skip steps the user already knows
- Shorten explanations over time
- Derive high-level skill profiles from granular data

## REQ-006: Degrading Guidance
Guidance must adapt based on memory:
- First encounter → detailed step-by-step
- Second encounter → shorter, skip known steps
- Third+ encounter → hints only

The user should feel like they're getting better over time.

## REQ-007: Cross-Platform Desktop
The app must run on macOS and Windows. Built with Tauri v2. Must support:
- System tray / menu bar presence
- Transparent overlay windows
- Background operation with low resource footprint (~15-30MB RAM)
- Microphone access for push-to-talk voice input

## REQ-008: Voice I/O
The app must support:
- Push-to-talk voice input (speech-to-text)
- Voice response output (text-to-speech)
- Text input as alternative to voice

## REQ-009: AI Backend
The app must use Claude as the AI backbone for:
- Screen understanding (vision)
- Intent interpretation
- Step generation
API keys proxied through a Cloudflare Worker (never shipped in app binary).
