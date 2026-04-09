# Domain Pitfalls: AI-Powered Desktop Task-Completion Guide

**Domain:** Cross-platform AI desktop assistant (Tauri v2 + screen capture + voice I/O)
**Researched:** 2026-04-09
**Confidence:** MEDIUM-HIGH (multiple verified sources; some platform-specific behavior confirmed via active GitHub issues)

---

## Critical Pitfalls

Mistakes that cause rewrites, hard blockers, or App Store rejection.

---

### Pitfall 1: macOS Screen Recording Permission Breaks on App Update

**What goes wrong:** macOS requires explicit user permission for screen recording (System Preferences → Privacy & Security → Screen Recording). When you ship an app update with a new binary signature, macOS revokes the permission silently. The app continues to run but captures nothing. Users see no error — the AI just gives wrong or generic guidance.

**Why it happens:** macOS ties screen recording trust to the binary's code signature hash. A new version = new hash = untrusted. The OS does not prompt again automatically; it simply stops the capture.

**Consequences:** Every update breaks screen capture for all existing users. Support load spikes. Users churn because "the app stopped working."

**Prevention:**
- Test the full update flow in CI with a signed build before every release.
- Implement a pre-flight permission check at startup using `tauri-plugin-macos-permissions` — check `CGPreflightScreenCaptureAccess()` before attempting any capture and surface a clear UI prompt if permission is absent.
- Never assume permission is present just because it was granted before.
- Ship a "repair permissions" button in settings that opens System Preferences directly to the correct pane.

**Detection (warning signs):**
- xcap returns empty frames or throws without a clear OS-level error message.
- First captures after update succeed but subsequent ones fail.
- Issue only manifests on signed/notarized builds, not dev builds.

**Phase:** Address in the screen capture foundation phase before any AI integration. Build the permission check/repair flow before shipping capture to users.

---

### Pitfall 2: macOS Private API Requirement Locks You Out of the App Store

**What goes wrong:** Transparent overlay windows on macOS require `macOSPrivateApi: true` in the Tauri config. This flag is permanent and non-revocable per-build — it permanently disqualifies the app from Mac App Store distribution.

**Why it happens:** The private API is required to achieve borderless/transparent window rendering on macOS via WKWebView internals. Apple's sandbox prohibits this.

**Consequences:** If the roadmap ever includes App Store distribution, the overlay architecture must be rebuilt from scratch. This is not a small change — it affects the core window model.

**Prevention:**
- Decide the distribution strategy (direct download vs. App Store) in Phase 1. Do not defer.
- If App Store is ever a goal, research alternative overlay approaches that don't require private APIs before committing to the window architecture.
- For V1: direct download is appropriate; document this constraint explicitly in PROJECT.md.

**Detection:** `macOSPrivateApi: true` in `tauri.conf.json` — if you see this, App Store is off the table.

**Phase:** Distribution architecture decision must happen before scaffold, not after.

---

### Pitfall 3: Overlay Windows Don't Work Over Fullscreen Apps on macOS

**What goes wrong:** When the user is in a fullscreen app (games, Figma in fullscreen, video editors), standard Tauri overlay windows are hidden by macOS's fullscreen isolation layer. The assistant becomes invisible exactly when users need it most — when they're deep in a complex tool.

**Why it happens:** macOS spaces/fullscreen isolation prevents normal NSWindow types from appearing above fullscreen apps. Requires a specific NSWindowLevel override to appear over fullscreen content.

**Consequences:** Core use case broken for any fullscreen workflow. Users who need guidance in Figma fullscreen, DaVinci Resolve, or games can't see the assistant.

**Prevention:**
- Use a third-party plugin or custom Rust code to set the window level to `NSFloatingWindowLevel` or `NSScreenSaverWindowLevel` specifically when the target app is fullscreen.
- Test against: Figma (fullscreen), Final Cut Pro, gaming titles on both platforms.
- On Windows, test z-order behavior with DirectX/fullscreen exclusive mode apps — different problem, same symptom.

**Detection:** Overlay disappears when user presses Cmd+Ctrl+F or enters fullscreen. Test this in Phase 1 scaffold, not Phase 3.

**Phase:** Screen capture + overlay phase. Do not ship without validating fullscreen behavior.

---

### Pitfall 4: No Native Per-Region Hit-Testing in Tauri — CPU Polling Workaround Required

**What goes wrong:** Tauri v2 has no built-in API for making only parts of a window click-through (transparent to mouse events). The only workaround is a Rust loop polling cursor position at ~60fps and calling `setIgnoreCursorEvents()` based on whether the cursor is over a UI element or transparent space.

**Why it happens:** WebView2 (Windows) and WKWebView (macOS) don't expose per-pixel hit-testing to the hosting app. This is a framework-level gap.

**Consequences:** A 60fps polling loop runs continuously as long as the overlay is visible. On low-end machines or long sessions, this is measurable CPU overhead that compounds with screen capture and AI calls. If you disable click-through entirely, the overlay steals focus from the user's work — defeating the purpose.

**Prevention:**
- Implement the cursor-polling workaround from day one; don't defer it assuming "there's a better way."
- Add idle detection: reduce polling to 10fps when the cursor hasn't moved in 2 seconds.
- Consider the overlay's default state being hidden/minimized, only showing on hotkey, to reduce the time the polling loop is active.
- Profile CPU impact on a 2019-era MacBook Pro and a mid-range Windows laptop in Phase 1.

**Detection:** High `CPU% idle` in Activity Monitor / Task Manager when the overlay is visible but no interactions are happening.

**Phase:** Scaffold/overlay phase. Must be solved before performance evaluation.

---

### Pitfall 5: Screen Capture Crate Instability — xcap Has Active Platform Bugs

**What goes wrong:** xcap (the planned cross-platform capture crate) has active reported bugs: screen capture hangs on macOS (#209), memory leaks on M4 chips (#203), minimized windows not capturable (#205), and deprecated API warnings on macOS Sequoia 15.1. On Windows, capture fails in some configurations (#264) and window geometry is wrong on Windows 11 (#143).

**Why it happens:** Cross-platform screen capture is genuinely hard. Each OS exposes different APIs (CGWindowListCreateImage on macOS, Graphics.Capture on Windows) with different behaviors and edge cases. xcap abstracts them but is still maturing.

**Consequences:** Capture hangs silently mean the AI receives stale frames. Memory leaks accumulate over a long session. Wrong geometry means screen region selection targets the wrong area.

**Prevention:**
- Evaluate `scap` (CapSoftware/scap) as an alternative — it targets high-performance use cases and may have better maintenance cadence.
- Do not rely on a single crate. Abstract the capture interface in Rust so the underlying implementation can be swapped without touching the IPC layer.
- Pin the xcap version and review its changelog before every release.
- Implement a capture health check: if frames stop arriving or geometry changes unexpectedly, surface a diagnostic and restart the capture session.

**Detection:** Frame timestamp gaps in capture logs. Memory growth visible in Activity Monitor over a 30-minute session. Incorrect bounding boxes for screen regions.

**Phase:** Screen capture foundation phase. Run a 30-minute soak test before marking the phase complete.

---

## Moderate Pitfalls

Mistakes that cause significant rework or degrade core UX.

---

### Pitfall 6: Voice Latency Stack Compounds to Unacceptable Levels

**What goes wrong:** Each hop in the voice pipeline adds latency: microphone capture (~50ms) → STT API call (~150-300ms) → Claude API call (~500-1500ms) → TTS API call (~75-200ms) → audio playback (~50ms). Total: 825ms–2100ms. Human conversation feels broken above 500ms. Users experience the assistant as "slow" even when each component performs well.

**Why it happens:** Cloud STT + cloud LLM + cloud TTS is 3 sequential network round-trips before the user hears anything. Each vendor's "latency" claim excludes buffering, endpoint detection, and network transmission.

**Consequences:** Users switch to text input or abandon voice entirely. The "quick question → quick answer" interaction model fails. Push-to-talk feels like a phone call with satellite delay.

**Prevention:**
- Use streaming TTS: start playing audio as soon as the first sentence of the response is available, don't wait for the full response. ElevenLabs and Azure both support streaming output.
- Stream Claude's response: use the Anthropic streaming API so TTS can begin before the full response is generated.
- For STT: use Deepgram (streaming, ~150ms) or AssemblyAI streaming rather than batch endpoints. Avoid whisper.cpp in a remote round-trip configuration.
- Target: STT result within 200ms of speech end, first audio output within 800ms total. Measure this explicitly.
- Provide immediate visual feedback (spinner, "thinking..." indicator) on voice receipt so the latency feels intentional.

**Detection:** Measure time-to-first-audio from push-to-talk release. If above 1200ms on a good connection, the pipeline needs streaming work.

**Phase:** Voice I/O phase. Build the streaming pipeline from the start — retrofitting streaming onto a batch pipeline is painful.

---

### Pitfall 7: Claude Vision Hallucinates UI Element Locations at Small Sizes

**What goes wrong:** Claude's vision model can accurately describe general screen regions ("there's a toolbar at the top with filter icons") but struggles with compact or densely packed UI elements. It may misidentify which of several similar-looking icons to click, or describe an element's position incorrectly when elements are small or overlapping. This produces guidance that sounds confident but sends users to the wrong place.

**Why it happens:** Claude is not trained as a pixel-level UI grounding model. It reasons about images semantically, not spatially. Compact UI elements don't contain enough visual information per patch for reliable discrimination.

**Consequences:** Users follow confident-sounding wrong steps. Trust breaks on the first failure. The "directional accuracy 70-80%" target in the requirements becomes the ceiling, not the floor.

**Prevention:**
- Design prompts to request directional/regional guidance ("top toolbar, the funnel-shaped icon, second from right") not coordinate-based guidance.
- Instruct Claude to express uncertainty: "I see something that looks like a filter icon near the top right — try that area."
- Implement the screen region selection feature (REQ-003) early. Letting users box-select a region dramatically reduces the guidance surface area and improves accuracy.
- Test Claude against the 5 most common tools in the target market (Figma, Notion, VS Code, Excel, browser) before claiming the accuracy target.
- Resize screenshots to 1568px max dimension before sending — larger images increase latency with no accuracy gain.

**Detection:** Accuracy regression testing: present 20 known screenshots and measure step correctness. Do this before and after every Claude model version change.

**Phase:** AI integration phase. Establish the accuracy baseline before building the memory/degrading guidance layers on top.

---

### Pitfall 8: Learning Memory Schema Locks In Too Early, Can't Evolve

**What goes wrong:** The learning memory feature (REQ-005, REQ-006) requires tracking knowledge gaps, completions, and skill profiles. If the SQLite schema is designed for V1 without migration support, any schema change in V2 (e.g., adding a confidence decay field, tracking which app a skill applies to) requires a manual database migration or data loss for existing users.

**Why it happens:** Local desktop app databases are user-owned. There's no server to run a migration script. If you ship a breaking schema change, users either lose their learning history or the app crashes on startup.

**Consequences:** Either lock into the V1 schema forever, or force users to reset their memory on upgrade — destroying the core value proposition of personalization.

**Prevention:**
- Use a database migration library (e.g., `sqlx` with migrate feature in Rust, or `refinery`) from the first commit. Run migrations on startup automatically.
- Version the schema from day one: `schema_version` table, increment on every structural change.
- Store events (what happened) rather than derived state (current skill level). Skill levels are computed from events. This makes schema evolution much easier — add new event types rather than restructuring existing tables.
- Test migration from V1 schema to V2 schema as a CI step.

**Detection:** Any `ALTER TABLE` that drops a column or changes a type without a migration file = future data loss.

**Phase:** Memory/learning phase. Migration infrastructure must exist before the first schema is shipped to users.

---

### Pitfall 9: API Proxy (Cloudflare Worker) Has No Per-User Rate Limiting By Default

**What goes wrong:** The Cloudflare Worker proxies all Claude/STT/TTS API keys. Without per-user rate limiting, a single compromised or abusive client can exhaust the API quota for all users — or run up unbounded costs. There is no automatic user identity enforcement in a Workers deployment.

**Why it happens:** Cloudflare's rate limiting requires explicit configuration. Workers don't inherently know which desktop app instance is making a request. There's no built-in session/identity layer.

**Consequences:** One power user or bad actor causes API cost spikes. Service degrades for all other users. No visibility into which client is responsible.

**Prevention:**
- Issue per-installation tokens (UUIDs) at first launch; include them in all Worker requests as a header.
- Configure rate limiting rules in Cloudflare WAF keyed to this installation ID header (e.g., max 60 requests/minute per ID).
- Log per-installation request counts to Workers KV or D1 for visibility.
- Return meaningful 429 responses with retry-after headers — the desktop app should surface "rate limit reached, try again in X seconds" rather than hanging.
- Rotate tokens on suspected abuse; the worker can maintain a blocklist in KV.

**Detection:** Unexpected Claude API cost spikes with no corresponding increase in active users.

**Phase:** API proxy phase (before voice/vision features ship). Do not ship vision or voice without rate limiting in place.

---

### Pitfall 10: WebView2 Not Pre-Installed on Windows 10 Machines

**What goes wrong:** Tauri v2 on Windows depends on WebView2 (Chromium-based). On Windows 11, WebView2 is pre-installed. On older Windows 10 machines — common in enterprise and non-tech-savvy user segments — WebView2 may not be present. The NSIS installer fails silently or confusingly without it.

**Why it happens:** Microsoft started bundling WebView2 with Windows 10 through Windows Update, but machines that haven't updated, are air-gapped, or have IT-managed update policies may not have it.

**Consequences:** App won't launch on a significant subset of Windows users. Error messages are cryptic. Support tickets spike.

**Prevention:**
- Use the WebView2 bootstrapper bundle in the NSIS installer configuration (Tauri supports this option). It downloads and installs WebView2 automatically if absent.
- Test on a clean Windows 10 (20H2) VM with no Edge/WebView2 pre-installed.
- Add a startup check that verifies WebView2 presence and shows a clear "please install WebView2" prompt with a direct download link as a fallback.

**Detection:** "App fails to launch on Windows" bug reports from non-technical users.

**Phase:** Windows scaffold/distribution phase. Test on Windows 10 clean image before any user-facing release.

---

## Minor Pitfalls

Issues that cause friction but not blockers.

---

### Pitfall 11: CSS Rendering Differences Between WebKit (macOS) and WebView2 (Windows)

**What goes wrong:** The overlay UI looks correct on macOS (WebKit) but has font rendering differences, `backdrop-filter` inconsistencies, and occasional layout shifts on Windows (WebView2/Chromium). `backdrop-filter: blur()` is entirely incompatible with transparent windows on macOS, eliminating frosted-glass effects.

**Prevention:** Design the overlay UI without relying on `backdrop-filter`. Use opaque backgrounds with opacity instead. Run the UI on both platforms in Phase 1, not after the design is finalized.

**Phase:** Scaffold phase.

---

### Pitfall 12: Overlay Appears in Dock / Cmd+Tab Switcher on macOS

**What goes wrong:** By default, Tauri windows appear in the macOS Dock and the Cmd+Tab application switcher. For a background assistant app, this is confusing UX — users don't expect a floating overlay to behave like a regular application window.

**Prevention:** Set `ActivationPolicy::Accessory` in the Tauri macOS config to hide the app from the Dock and switcher. This is a one-line config change but must be intentional from the start — it also changes how the app handles focus.

**Phase:** Scaffold phase.

---

### Pitfall 13: Screen Captures Sent to Claude API Without Size Optimization

**What goes wrong:** Full-resolution screenshots (e.g., 4K Retina on macOS = 3840×2160) sent directly to Claude inflate token count, increase cost, and increase latency. Claude resizes internally to 1568px max — sending a 4K image wastes bandwidth and adds latency with zero accuracy benefit.

**Prevention:** Resize captured frames in Rust before encoding to base64 or calling the Files API. Target 1568px on the long edge. If the user has selected a screen region (REQ-003), crop first, then resize.

**Phase:** AI integration phase.

---

### Pitfall 14: RAM Variance Across macOS Versions for Tauri Overlay Apps

**What goes wrong:** Tauri overlay apps show dramatic RAM variance across macOS versions. Reported: 29MB on Sequoia, 110MB on Tahoe (macOS 26 beta) on identical hardware. The "15-30MB RAM" target in the project requirements may not hold as macOS evolves.

**Prevention:** Do not commit to a fixed RAM number in user-facing marketing. Measure RAM on the three most recent macOS versions before each release. Design the app to function correctly even at higher RAM usage — the Tauri advantage is relative (vs. 150-300MB Electron), not absolute.

**Phase:** Performance validation phase. Monitor across OS updates.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| Tauri scaffold | Dock/switcher presence on macOS | Set `ActivationPolicy::Accessory` on day one |
| Tauri scaffold | WebView2 missing on Windows 10 | Bundle WebView2 bootstrapper in installer |
| Tauri scaffold | Overlay invisible over fullscreen apps | Test fullscreen isolation in week 1 |
| Screen capture | macOS permission breaks on app update | Build permission check + repair flow before AI integration |
| Screen capture | xcap memory leaks / hangs | 30-min soak test; abstract crate interface for swap |
| Screen capture | Click-through polling at 60fps | Implement idle detection; profile CPU in Phase 1 |
| Overlay UI | WebKit vs WebView2 CSS differences | Test both platforms; avoid `backdrop-filter` |
| AI integration | Claude vision hallucination on compact UI | Establish accuracy baseline; use region selection early |
| AI integration | 4K screenshots inflating token cost | Resize to 1568px in Rust before API call |
| Voice I/O | Latency stacking to >1200ms | Use streaming STT + streaming TTS + streaming Claude from day one |
| API proxy | No per-user rate limiting | Issue installation tokens; configure WAF rate limits before launch |
| Learning memory | Schema locked with no migration path | Use sqlx migrations + event sourcing from first commit |
| Distribution | macOSPrivateApi bars App Store forever | Decide distribution model before architectural commitment |

---

## Sources

- Tauri GitHub Issues — transparent window bugs: https://github.com/tauri-apps/tauri/issues/13070, https://github.com/tauri-apps/tauri/issues/13415
- Tauri GitHub Issue — screen recording permission reset on update: https://github.com/tauri-apps/tauri/issues/7647
- xcap GitHub Issues — platform-specific bugs: https://github.com/nashaofu/xcap/issues
- Manasight blog — real Tauri v2 overlay pitfalls: https://blog.manasight.gg/why-i-chose-tauri-v2-for-a-desktop-overlay/
- tauri-plugin-macos-permissions: https://crates.io/crates/tauri-plugin-macos-permissions
- Claude Vision docs and limitations: https://platform.claude.com/docs/en/build-with-claude/vision
- Claude Computer Use latency note: https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool
- Voice AI latency breakdown (Dec 2025): https://medium.com/@reveoai/solving-voice-ai-latency-from-5-seconds-to-sub-1-second-responses-d0065e520799
- STT latency analysis: https://picovoice.ai/blog/speech-to-text-latency/
- TTS latency benchmark 2025: https://botfriends.de/en/blog/tts-latency-benchmark-2025-google-vs-microsoft-voices-fuer-phonebots/
- Cloudflare rate limiting docs: https://developers.cloudflare.com/waf/rate-limiting-rules/
- Cloudflare API security gaps: https://www.indusface.com/blog/cloudflare-api-security-limitations/
- Knowledge graph schema pitfalls: https://medium.com/@claudiubranzan/from-llms-to-knowledge-graphs-building-production-ready-graph-systems-in-2025-2b4aff1ec99a
- Microsoft Recall security analysis (screen capture precedent): https://doublepulsar.com/microsoft-recall-on-copilot-pc-testing-the-security-and-privacy-implications-ddb296093b6c
