# Phase 1: Infrastructure & App Shell - Research

**Researched:** 2026-04-09
**Domain:** Tauri v2 app scaffold, system tray, overlay window, global shortcut, Cloudflare Worker proxy, screen capture permissions
**Confidence:** HIGH

## Summary

Phase 1 delivers the technical skeleton: a Cloudflare Worker proxy (Hono), a Tauri v2 app with SolidJS frontend that lives in the system tray, a floating sidebar overlay that does not steal focus, a global keyboard shortcut toggle, and screen capture permission handling with privacy disclosure. No AI integration -- this is pure infrastructure.

The primary challenge is platform-specific window behavior. Tauri v2 supports transparent always-on-top windows, but focus-stealing prevention requires `setIgnoreCursorEvents` with cursor-position polling, `focusable: false` is broken on macOS (issue #14102), and `macOSPrivateApi: true` is required for transparent windows (permanently bars App Store -- accepted per D-14). The secondary challenge is that Rust is not installed on this machine, so the plan must include toolchain setup.

**Primary recommendation:** Build in strict dependency order: (1) Install Rust toolchain, (2) Deploy Cloudflare Worker with Hono, (3) Scaffold Tauri v2 + SolidJS app, (4) System tray with no-dock behavior, (5) Overlay window with click-through, (6) Global shortcut toggle, (7) Screen capture permission flow.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Floating sidebar panel docked to screen edge, ~300px fixed width, draggable to left or right edge (remembers position)
- **D-02:** Visual style follows system theme -- dark when OS is dark, light when OS is light
- **D-03:** Text input field built into the bottom of the sidebar panel. Auto-focuses when panel opens.
- **D-04:** Empty state shows prompt hint: "Ask me anything about what's on your screen" with input field ready
- **D-05:** Guidance steps displayed as numbered list (1. Click Filters  2. Select Date  3. Choose Last 30 days)
- **D-06:** Global keyboard shortcut is customizable by the user. Ship with a sensible default (e.g., Ctrl+Shift+Space)
- **D-07:** Shortcut is a toggle -- press once to open, press again to dismiss
- **D-08:** When panel opens, text input auto-focuses so user can type immediately
- **D-09:** Cloudflare Worker built with Hono framework for clean routing and middleware
- **D-10:** Authentication via installation token -- app generates unique token on first launch, Worker validates and rate-limits per token
- **D-11:** Three routes: `/chat` (Claude streaming), `/stt` (transcription token), `/tts` (text-to-speech)
- **D-12:** API keys (Anthropic, AssemblyAI, ElevenLabs) stored as Wrangler secrets, never in app binary
- **D-13:** Direct download only -- DMG for macOS, MSI/EXE for Windows. No App Store.
- **D-14:** macOSPrivateApi enabled (required for transparent overlay windows, permanently bars App Store -- accepted tradeoff)
- **D-15:** Auto-update via Tauri built-in updater plugin -- checks on launch, downloads in background, applies on restart

### Claude's Discretion
- Implementation details of screen capture permission flow (xcap abstraction layer, permission check/repair UX)
- Specific Tauri window configuration values (blur radius, opacity, corner radius)
- Default keyboard shortcut choice
- System tray menu items and layout

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | All API calls proxied through Cloudflare Worker -- API keys never shipped in app binary | Hono + Wrangler secrets pattern documented in Standard Stack; Worker proxy code examples below |
| INFRA-02 | App operates as always-on background process with minimal resource consumption | `ActivationPolicy::Accessory` hides from Dock; system tray presence documented in Architecture Patterns |
| FOUND-01 | App runs as system tray / menu bar presence (no dock icon, no window switcher entry) | Tauri v2 `set_activation_policy(Accessory)` + tray plugin documented with code examples |
| FOUND-02 | Global keyboard shortcut invokes the assistant without leaving current context | `tauri-plugin-global-shortcut` v2.3.1 with customizable key binding; code example below |
| FOUND-03 | Non-obstructive overlay UI displays guidance without stealing focus or obscuring the work area | Sidebar panel (300px, docked to edge), `setIgnoreCursorEvents` polling, `focusable: false` with workarounds |
| FOUND-04 | Privacy transparency -- clear disclosure of what is captured, when, and where data goes | In-sidebar permission dialog with disclosure text; `CGPreflightScreenCaptureAccess` check on macOS |
| FOUND-05 | Cross-platform support for macOS and Windows via Tauri v2 with low resource footprint (~15-30MB RAM) | Tauri v2.10.x scaffold; WebView2 bootstrapper for Windows; platform-specific window flags documented |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Tech stack**: Tauri v2 (Rust backend + SolidJS frontend) -- no React, no Electron
- **Screen capture**: xcap crate for cross-platform screenshots
- **Always-on**: Background process with system tray, minimal resources
- **API proxy**: Cloudflare Worker with Hono -- API keys never in binary
- **Privacy**: Screenshots in memory only, never persisted to disk
- **Cargo workspaces**: Split into `core`, `ai-client`, `tauri-app` crates
- **Frontend**: SolidJS + Vite + TypeScript -- do NOT use React

## Standard Stack

### Core (Phase 1 Only)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Tauri | 2.10.x | App shell, IPC, window management, tray | Only framework hitting 15-30MB RAM target [VERIFIED: npm registry @tauri-apps/cli 2.10.1] |
| Rust | 1.85+ | Backend logic | Required by Tauri [ASSUMED -- rustup installs latest stable] |
| SolidJS | latest | Frontend UI | Smallest runtime (~7kB), true reactivity, no VDOM [CITED: CLAUDE.md] |
| Vite | 6.x | Frontend build | Standard Tauri v2 scaffold [CITED: CLAUDE.md] |
| TypeScript | 5.x | Type safety | Non-negotiable per CLAUDE.md |
| Hono | 4.12.x | Worker routing | Lightweight router for CF Workers, zero cold-start [VERIFIED: npm registry 4.12.12] |
| Wrangler | 4.81.x | CF Worker CLI | Deploy and manage Workers [VERIFIED: npm registry 4.81.1] |

### Tauri Plugins (Phase 1)

| Plugin | Version | Purpose | When to Use |
|--------|---------|---------|-------------|
| tauri-plugin-global-shortcut | 2.3.1 | Register global hotkey toggle | Overlay show/hide shortcut [VERIFIED: npm registry] |
| tauri-plugin-macos-permissions | latest | Check macOS screen recording permission | Pre-flight permission check [CITED: crates.io] |

### Frontend Dependencies

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-solid | 1.8.0 | Icon library | Tray-like icons, send button, grip handle [VERIFIED: npm registry] |
| @tauri-apps/api | latest | Tauri IPC from JS | All command invocations and event listeners |
| @tauri-apps/plugin-global-shortcut | 2.3.1 | JS bindings for shortcut plugin | Register/unregister shortcuts from frontend |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hono | Plain fetch handler | Hono adds readable routing + middleware for 3 routes; plain fetch gets messy fast |
| lucide-solid | heroicons | Lucide has native SolidJS bindings; heroicons requires manual SVG wrapping |
| tauri-plugin-macos-permissions | Raw objc crate calls | Plugin handles the FFI boilerplate; raw objc is error-prone |

**Installation (Rust toolchain):**
```bash
# Install Rust (REQUIRED -- not currently installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# Install Tauri CLI
cargo install tauri-cli
```

**Installation (Tauri app scaffold):**
```bash
npm create tauri-app@latest ai-buddy -- --template solid-ts
cd ai-buddy
npm install
```

**Installation (Cloudflare Worker):**
```bash
npm create cloudflare@latest ai-buddy-proxy -- --template hello-world-ts
cd ai-buddy-proxy
npm install hono
```

## Architecture Patterns

### Recommended Project Structure
```
ai-buddy/
├── src/                          # SolidJS frontend
│   ├── App.tsx                   # Root component
│   ├── components/
│   │   ├── SidebarShell.tsx      # 300px sidebar container
│   │   ├── DragHandle.tsx        # Top drag handle
│   │   ├── TextInput.tsx         # Bottom input field
│   │   ├── EmptyState.tsx        # Default "ready to help" state
│   │   ├── GuidanceList.tsx      # Numbered step list (placeholder)
│   │   └── PermissionDialog.tsx  # Privacy disclosure + grant
│   ├── styles/
│   │   └── theme.css             # CSS custom properties (from UI-SPEC)
│   └── lib/
│       └── tauri.ts              # IPC wrappers
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json           # Window config, plugins, permissions
│   ├── capabilities/
│   │   └── default.json          # Plugin permissions (global-shortcut, etc.)
│   └── src/
│       ├── lib.rs                # Tauri setup, plugin registration
│       ├── tray.rs               # System tray menu and handlers
│       ├── window.rs             # Overlay window management
│       ├── shortcut.rs           # Global shortcut registration
│       └── permissions.rs        # Screen capture permission check (macOS)
├── worker/                       # Cloudflare Worker (monorepo)
│   ├── src/
│   │   └── index.ts              # Hono app with 3 routes
│   ├── wrangler.toml
│   └── package.json
└── package.json
```

### Pattern 1: System Tray as Process Entry Point (FOUND-01, INFRA-02)

**What:** App runs as a background process accessible only via system tray icon. No dock icon, no window switcher entry on macOS.

**When to use:** Always -- this is the primary interaction model.

**Example:**
```rust
// Source: https://github.com/tauri-apps/tauri/discussions/10774
// In src-tauri/src/lib.rs
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            // Hide from Dock and Cmd+Tab on macOS
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // Build tray menu
            let show_hide = tauri::menu::MenuItem::with_id(app, "show_hide", "Show AI Buddy", true, None::<&str>)?;
            let preferences = tauri::menu::MenuItem::with_id(app, "preferences", "Preferences...", true, None::<&str>)?;
            let quit = tauri::menu::MenuItem::with_id(app, "quit", "Quit AI Buddy", true, None::<&str>)?;
            let separator = tauri::menu::PredefinedMenuItem::separator(app)?;

            let menu = tauri::menu::Menu::with_items(app, &[&show_hide, &separator, &preferences, &separator, &quit])?;

            let _tray = tauri::tray::TrayIconBuilder::new()
                .menu(&menu)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "show_hide" => { /* toggle overlay visibility */ }
                        "quit" => app.exit(0),
                        _ => {}
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Pattern 2: Overlay Window Configuration (FOUND-03)

**What:** Transparent, always-on-top, non-focusable sidebar window docked to screen edge.

**When to use:** The main overlay that displays guidance.

**Configuration in `tauri.conf.json`:**
```json
{
  "app": {
    "windows": [
      {
        "label": "overlay",
        "title": "AI Buddy",
        "url": "/",
        "width": 300,
        "height": 900,
        "x": null,
        "y": 0,
        "decorations": false,
        "transparent": true,
        "alwaysOnTop": true,
        "focus": false,
        "visible": false,
        "resizable": false,
        "skipTaskbar": true,
        "shadow": false
      }
    ],
    "macOSPrivateApi": true
  }
}
```

**Critical: Focus-stealing prevention requires runtime code, not just config.** [CITED: https://github.com/tauri-apps/tauri/issues/14102]

```rust
// Cursor-position polling for click-through behavior
// Source: https://blog.manasight.gg/why-i-chose-tauri-v2-for-a-desktop-overlay/
use std::time::Duration;

fn start_cursor_polling(window: tauri::WebviewWindow) {
    std::thread::spawn(move || {
        loop {
            // Check if cursor is over a UI element or transparent space
            // If over transparent space, enable click-through
            // If over UI element, disable click-through
            let _ = window.set_ignore_cursor_events(/* true or false based on cursor pos */);
            std::thread::sleep(Duration::from_millis(16)); // ~60fps
        }
    });
}
```

### Pattern 3: Global Shortcut Toggle (FOUND-02)

**What:** System-wide keyboard shortcut toggles overlay visibility.

**Example:**
```rust
// Source: https://v2.tauri.app/plugin/global-shortcut/
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri::Manager;

// In setup closure:
let shortcut: Shortcut = "CommandOrControl+Shift+Space".parse()?;
app.handle().plugin(
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(move |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                if let Some(window) = app.get_webview_window("overlay") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus(); // auto-focus text input
                    }
                }
            }
        })
        .build(),
)?;
```

### Pattern 4: Cloudflare Worker Proxy (INFRA-01)

**What:** Hono-based Worker that holds API keys and proxies requests.

**Example:**
```typescript
// Source: https://hono.dev/docs/getting-started/cloudflare-workers
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { stream } from 'hono/streaming';

type Bindings = {
  ANTHROPIC_API_KEY: string;
  ASSEMBLYAI_API_KEY: string;
  ELEVENLABS_API_KEY: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', cors());

// Health check / test endpoint
app.get('/health', (c) => c.json({ status: 'ok' }));

// Claude streaming proxy
app.post('/chat', async (c) => {
  const body = await c.req.json();
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': c.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ ...body, stream: true }),
  });
  // Stream SSE passthrough
  return new Response(response.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
});

// STT token endpoint (placeholder for Phase 3)
app.post('/stt', async (c) => {
  return c.json({ message: 'STT endpoint placeholder' });
});

// TTS endpoint (placeholder for Phase 3)
app.post('/tts', async (c) => {
  return c.json({ message: 'TTS endpoint placeholder' });
});

export default app;
```

### Pattern 5: Screen Capture Permission Flow (FOUND-04)

**What:** Check and request screen capture permission on macOS with privacy disclosure.

```rust
// macOS screen capture permission check
// Source: https://crates.io/crates/tauri-plugin-macos-permissions
#[tauri::command]
fn check_screen_capture_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        // CGPreflightScreenCaptureAccess returns true if permission is granted
        // CGRequestScreenCaptureAccess triggers the OS permission dialog
        unsafe {
            use core_graphics::access::CGPreflightScreenCaptureAccess;
            CGPreflightScreenCaptureAccess()
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        true // Windows doesn't require explicit permission
    }
}

#[tauri::command]
fn request_screen_capture_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        unsafe {
            use core_graphics::access::CGRequestScreenCaptureAccess;
            CGRequestScreenCaptureAccess()
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}
```

### Anti-Patterns to Avoid

- **Embedding API keys in binary:** All secrets stay in Wrangler secrets, never in the Tauri app. [CITED: ARCHITECTURE.md]
- **Blocking main thread with screen capture:** Use `#[tauri::command] async fn` for capture operations. [CITED: ARCHITECTURE.md]
- **Using `backdrop-filter: blur()` on macOS:** Incompatible with transparent windows. Use opaque backgrounds with opacity. [CITED: PITFALLS.md]
- **Relying on `focusable: false` alone:** Broken on macOS (#14102). Must use `setIgnoreCursorEvents` polling. [VERIFIED: GitHub issue]
- **Polling from frontend for state:** Use Tauri events (`app.emit()`) for push updates, not frontend polling. [CITED: ARCHITECTURE.md]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Global shortcuts | Custom keyboard hook | `tauri-plugin-global-shortcut` v2.3.1 | OS-level shortcut registration is platform-specific and error-prone |
| macOS permission check | Raw FFI to CoreGraphics | `tauri-plugin-macos-permissions` or `core-graphics` crate | Permission API requires unsafe FFI; plugin handles it cleanly |
| System tray | Custom native menu | Tauri's built-in `TrayIconBuilder` | Cross-platform tray abstraction is solved |
| Worker routing | Manual Request/Response parsing | Hono framework | Middleware, CORS, streaming helpers built-in |
| Theme detection | Custom JS media query polling | CSS `prefers-color-scheme` + Tauri theme events | OS integration is built into the platform |
| Window positioning | Manual screen geometry math | Tauri's `set_position` + `available_monitors()` | Handles DPI scaling, multi-monitor, taskbar offsets |

## Common Pitfalls

### Pitfall 1: `focusable: false` Broken on macOS
**What goes wrong:** Setting `focusable: false` in tauri.conf.json does not prevent focus stealing on macOS. The overlay window still steals focus from the user's active app when clicked. [VERIFIED: https://github.com/tauri-apps/tauri/issues/14102]
**Why it happens:** WebKit-level focus behavior overrides the config flag.
**How to avoid:** Implement cursor-position polling with `setIgnoreCursorEvents`. Set ignore to true for transparent areas. Reduce polling to 10fps when cursor is idle. Consider starting with a simpler model: the sidebar is "always visible" but uses `setIgnoreCursorEvents(true)` globally, only disabling it when mouse enters a known interactive region (detected via frontend mouseover events sent to Rust via IPC).
**Warning signs:** Clicking anywhere on the overlay causes the user's active app to lose focus.

### Pitfall 2: macOS Overlay Invisible Over Fullscreen Apps
**What goes wrong:** Standard Tauri always-on-top windows are hidden when another app enters fullscreen (macOS Spaces isolation). [CITED: PITFALLS.md]
**Why it happens:** macOS fullscreen isolation uses a separate window layer that standard NSWindow levels cannot penetrate.
**How to avoid:** Use a plugin or custom Rust code to set window level to `NSFloatingWindowLevel` or higher when target app is fullscreen. Test against Figma fullscreen, Safari fullscreen.
**Warning signs:** Overlay disappears when user presses Cmd+Ctrl+F or another app enters fullscreen.

### Pitfall 3: Rust Toolchain Not Installed
**What goes wrong:** This machine has no Rust installation (no rustup, cargo, or rustc). The plan MUST include Rust installation as step 0.
**Why it happens:** Greenfield project on a machine not yet set up for Rust development. [VERIFIED: `command -v cargo` returns empty]
**How to avoid:** First task in the plan must be `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh` followed by verifying `cargo --version` and `rustc --version`.
**Warning signs:** Any `cargo` command fails with "command not found".

### Pitfall 4: WebView2 Missing on Windows 10
**What goes wrong:** Tauri v2 on Windows depends on WebView2. Not pre-installed on older Windows 10 machines. App fails to launch. [CITED: PITFALLS.md]
**Why it happens:** Microsoft bundles WebView2 with Windows 11 but not all Windows 10 builds.
**How to avoid:** Configure NSIS installer to bundle WebView2 bootstrapper. Test on clean Windows 10 VM.
**Warning signs:** "App fails to launch" reports from Windows users.

### Pitfall 5: Tauri v2 Capabilities / Permissions Not Configured
**What goes wrong:** Tauri v2 has a strict capability system. Plugins like global-shortcut won't work without explicit permission grants in `capabilities/default.json`. [CITED: https://v2.tauri.app/security/permissions/]
**Why it happens:** Security-by-default design in Tauri v2 -- all plugin commands blocked unless explicitly allowed.
**How to avoid:** Configure capabilities file for each plugin used. Example:
```json
{
  "identifier": "default",
  "description": "Default capabilities",
  "windows": ["overlay"],
  "permissions": [
    "core:default",
    "global-shortcut:allow-register",
    "global-shortcut:allow-unregister",
    "global-shortcut:allow-is-registered"
  ]
}
```
**Warning signs:** Plugin commands silently fail or throw permission errors in the JS console.

### Pitfall 6: Overlay Appears in macOS Dock and Cmd+Tab
**What goes wrong:** By default, Tauri windows appear in the macOS Dock and Cmd+Tab switcher. A background assistant should not. [CITED: PITFALLS.md]
**Why it happens:** Default activation policy is `NSApplicationActivationPolicyRegular`.
**How to avoid:** Call `app.set_activation_policy(tauri::ActivationPolicy::Accessory)` in the setup hook. Must be done before any window is shown.
**Warning signs:** App icon visible in Dock despite being a tray-only app.

## Code Examples

### Cloudflare Worker Deployment
```bash
# Source: https://developers.cloudflare.com/workers/
cd worker/
# Set API keys as secrets (never in code)
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put ASSEMBLYAI_API_KEY
npx wrangler secret put ELEVENLABS_API_KEY
# Deploy
npx wrangler deploy
# Test health endpoint
curl https://ai-buddy-proxy.<account>.workers.dev/health
```

### Tauri Window Show/Hide with Position Memory
```typescript
// Source: https://v2.tauri.app/reference/javascript/api/namespacewindow/
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

const appWindow = getCurrentWebviewWindow();

export async function toggleOverlay() {
  const visible = await appWindow.isVisible();
  if (visible) {
    await appWindow.hide();
  } else {
    await appWindow.show();
    // Text input auto-focus handled by SolidJS onMount
  }
}
```

### CSS Theme Variables (from UI-SPEC)
```css
/* Source: 01-UI-SPEC.md -- CSS Custom Properties Contract */
:root {
  --sidebar-width: 300px;
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
}

@media (prefers-color-scheme: light) {
  :root {
    --color-surface: rgba(255, 255, 255, 0.72);
    --color-text-primary: rgba(0, 0, 0, 0.88);
    --color-accent: #007AFF;
  }
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-surface: rgba(28, 28, 30, 0.72);
    --color-text-primary: rgba(255, 255, 255, 0.92);
    --color-accent: #0A84FF;
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tauri v1 global shortcut (built-in) | Tauri v2 plugin system (`tauri-plugin-global-shortcut`) | Oct 2024 (v2 stable) | Must install plugin separately, configure capabilities |
| Tauri v1 system tray API | Tauri v2 `TrayIconBuilder` API | Oct 2024 | New builder pattern, menu construction changed |
| Tauri v1 window config (flat) | Tauri v2 nested under `app.windows[]` | Oct 2024 | Config structure changed significantly |
| `window.transparent` in v1 | Same flag + `macOSPrivateApi: true` required | v2 | Must explicitly opt in to private API for transparency on macOS |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `rustup` installs Rust 1.85+ (latest stable) | Standard Stack | LOW -- rustup always installs latest stable; can pin if needed |
| A2 | `core-graphics` crate exposes `CGPreflightScreenCaptureAccess` and `CGRequestScreenCaptureAccess` | Pattern 5 | MEDIUM -- may need `tauri-plugin-macos-permissions` instead or raw `objc` FFI |
| A3 | Cursor-position polling at 60fps has acceptable CPU overhead on modern hardware | Pattern 2 / Pitfall 1 | MEDIUM -- if too heavy, reduce to 30fps or use idle detection (10fps when cursor stationary) |
| A4 | Tauri v2 `create-tauri-app` has a working `solid-ts` template | Installation | LOW -- multiple sources confirm this template exists |
| A5 | Cloudflare Worker free tier (100k req/day) sufficient for development and private beta | Standard Stack | LOW -- development usage is orders of magnitude below this limit |

## Open Questions

1. **Exact cursor-polling implementation for click-through**
   - What we know: Tauri exposes `setIgnoreCursorEvents`. Manasight blog confirms 60fps polling works. macOS `focusable: false` is buggy.
   - What's unclear: Best approach for determining cursor position relative to UI elements (Rust-side screen coordinates vs frontend mouseover events via IPC).
   - Recommendation: Start with frontend approach -- sidebar sends `mouseenter`/`mouseleave` events via IPC to toggle `setIgnoreCursorEvents`. Simpler than 60fps position polling. Fall back to polling only if frontend events are unreliable.

2. **Installation token generation and validation (D-10)**
   - What we know: App generates UUID on first launch, Worker validates per-token rate limits.
   - What's unclear: Where to store the token on the client (Tauri app data dir? OS keychain?). How Worker validates without a database (KV? D1?).
   - Recommendation: Store token in Tauri `app_data_dir()` as a plain JSON file for V1. Worker validates against Cloudflare KV store. Simple and sufficient for private beta.

3. **Sidebar drag-to-edge behavior (D-01)**
   - What we know: User can drag sidebar to left or right edge. Position persists.
   - What's unclear: Tauri's drag region behavior with `decorations: false`. Need to test whether custom drag handle works with `set_position`.
   - Recommendation: Implement via custom drag handle component that calls `appWindow.startDragging()` on mousedown. On drag end, snap to nearest edge. Store last edge in local preferences (JSON file or rusqlite).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Frontend build, Wrangler | Yes | v24.2.0 | -- |
| npm | Package management | Yes | 11.3.0 | -- |
| Rust (rustup + cargo) | Tauri backend | **No** | -- | Must install: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Xcode CLT | macOS compilation | Yes | Installed | -- |
| Wrangler CLI | CF Worker deploy | No (global) | npm 4.81.1 available | Use `npx wrangler` (no global install needed) |
| cargo-tauri | Tauri build/dev | No | -- | Install after Rust: `cargo install tauri-cli` |

**Missing dependencies with no fallback:**
- Rust toolchain (rustup, cargo, rustc) -- MUST be installed before any Tauri work

**Missing dependencies with fallback:**
- Wrangler: use `npx wrangler` instead of global install
- cargo-tauri: installed via `cargo install tauri-cli` after Rust setup

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (frontend) + cargo test (Rust) |
| Config file | None -- Wave 0 must create vitest.config.ts and add test deps |
| Quick run command | `npm run test` (frontend) / `cargo test` (Rust) |
| Full suite command | `npm run test && cd src-tauri && cargo test` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | Worker returns test response, no API keys in binary | smoke (curl) | `curl https://<worker-url>/health` | No -- Wave 0 |
| INFRA-02 | App runs as background process (no dock icon) | manual-only | Visual check on macOS | N/A |
| FOUND-01 | System tray visible, no dock/switcher entry | manual-only | Visual check on macOS/Windows | N/A |
| FOUND-02 | Global shortcut toggles overlay | integration | Manual trigger + verify window state | No -- Wave 0 |
| FOUND-03 | Overlay renders without stealing focus | manual-only | Click test in another app | N/A |
| FOUND-04 | Permission dialog shows disclosure text | unit | `vitest tests/PermissionDialog.test.tsx` | No -- Wave 0 |
| FOUND-05 | App launches on macOS (and builds for Windows) | smoke | `cargo tauri dev` succeeds without error | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cargo check && npm run build` (compile check)
- **Per wave merge:** Full `cargo tauri dev` launch test + visual verification
- **Phase gate:** All success criteria verified manually before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] Install vitest + @testing-library/solidjs for frontend unit tests
- [ ] Create `vitest.config.ts` with SolidJS JSX transform
- [ ] Create `tests/` directory in frontend
- [ ] Verify `cargo test` works in src-tauri after scaffold

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes (Worker auth) | Installation token + rate limiting per token (D-10) |
| V3 Session Management | No | No user sessions in Phase 1 |
| V4 Access Control | Yes (Worker) | Token validation middleware in Hono |
| V5 Input Validation | Yes (Worker) | Validate request body structure before proxying |
| V6 Cryptography | No | No crypto operations in Phase 1 (token is UUID, not signed) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key extraction from binary | Information Disclosure | All keys in Wrangler secrets, never in app binary (D-12) |
| Worker endpoint abuse (no auth) | Denial of Service | Installation token + Cloudflare rate limiting (D-10) |
| Man-in-the-middle on Worker calls | Tampering | HTTPS only (Cloudflare enforces TLS) |
| Malicious shortcut override | Elevation of Privilege | Tauri capability system limits plugin permissions |

## Sources

### Primary (HIGH confidence)
- Tauri v2 official docs -- window customization, system tray, global shortcut: https://v2.tauri.app/
- Hono official docs -- streaming, Cloudflare Workers: https://hono.dev/docs/
- npm registry -- verified versions for hono (4.12.12), @tauri-apps/cli (2.10.1), wrangler (4.81.1), lucide-solid (1.8.0), tauri-plugin-global-shortcut (2.3.1)
- Environment audit -- confirmed Node v24.2.0, npm 11.3.0, Xcode CLT installed, NO Rust toolchain

### Secondary (MEDIUM confidence)
- Manasight blog -- real-world Tauri v2 overlay pitfalls: https://blog.manasight.gg/why-i-chose-tauri-v2-for-a-desktop-overlay/
- Tauri GitHub discussions -- ActivationPolicy::Accessory for hiding dock icon: https://github.com/tauri-apps/tauri/discussions/10774
- Tauri GitHub issue #14102 -- focusable:false broken on macOS: https://github.com/tauri-apps/tauri/issues/14102

### Tertiary (LOW confidence)
- A2 (CGPreflightScreenCaptureAccess via core-graphics crate) -- inferred from Apple docs, not verified in Rust crate API

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all versions verified against npm registry and crates.io references
- Architecture: HIGH -- patterns validated against existing research docs and real-world Tauri overlay implementations
- Pitfalls: HIGH -- most pitfalls verified via GitHub issues and the Manasight blog (a production Tauri overlay app)
- Environment: HIGH -- directly probed with `command -v` and `--version` checks

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (stable domain, 30-day validity)
