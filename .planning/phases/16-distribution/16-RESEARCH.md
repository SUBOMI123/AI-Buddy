# Phase 16: Distribution — Research

**Researched:** 2026-04-14
**Domain:** Distribution — GitHub Pages, macOS Gatekeeper UX, README conventions
**Confidence:** HIGH (GitHub Pages mechanics), MEDIUM (exact Gatekeeper dialog wording), HIGH (structure of macOS guide)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 Feedback channel:** Email (`subibash02@gmail.com`) + GitHub Issues (`https://github.com/SUBOMI123/AI-Buddy/issues/new`). No Discord for beta.
- **D-02 Install guide home:** GitHub README (`README.md` in repo root) + GitHub Pages (`docs/index.html`). URL: `https://subomi123.github.io/AI-Buddy/`.
- **D-03 macOS install guide:** `docs/macos-beta-install.md`. Must cover: download (arm64 vs x86_64 chip guide), DMG open + drag to Applications, Gatekeeper first-launch block + workaround, all three permission dialogs (Screen Recording, Accessibility, Microphone), system tray discovery, FAQ.

### Claude's Discretion

- Exact HTML/CSS for `docs/index.html` — keep it simple, no build step, pure HTML
- Whether README uses a table or bullet list for download links
- Exact wording of FAQ entries in the macOS guide
- Whether to add `.nojekyll` to `docs/` (needed to prevent Jekyll processing)
- Beta contact email alias vs direct Gmail — use `subibash02@gmail.com`

### Deferred Ideas (OUT OF SCOPE)

- Discord community server (v1.0)
- Custom domain for GitHub Pages (v1.0)
- Marketing landing page with video, pricing, waitlist (Phase 17+)
- App Store / Microsoft Store distribution (v1.0)
- Automated feedback triage / issue templates (v1.0)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DIST-01 | First signed release on GitHub Releases (macOS DMG arm64 + x86_64, Windows EXE) | Already live at v0.1.1 — no release publishing work needed. Artifact filenames confirmed from CONTEXT.md. |
| DIST-02 | Beta install guide published — download, Gatekeeper, SmartScreen, first launch, feedback | macOS Gatekeeper flow researched. Guide structure defined by Windows guide template. |
| DIST-03 | Feedback channel established (email + GitHub Issues) | Email and Issues URL confirmed in CONTEXT.md. Both surfaces (README + Pages) must reference them. |
</phase_requirements>

---

## Summary

Phase 16 is a documentation and configuration phase — no code changes to the Tauri app itself. Three artifacts need creating: `README.md` (repo root), `docs/macos-beta-install.md`, and `docs/index.html`. GitHub Pages also needs a one-time Settings configuration and a `docs/.nojekyll` file.

DIST-01 is already satisfied: v0.1.1 is live at `https://github.com/SUBOMI123/AI-Buddy/releases/tag/v0.1.1` with all three platform artifacts. Research focused on the remaining two requirements.

The highest complexity in this phase is the macOS install guide (DIST-02). macOS Gatekeeper behavior changed materially in Sequoia (15.x), and the guide must cover both the pre-Sequoia right-click workaround path AND the new Sequoia-specific "Open Anyway in System Settings" path. Permission dialogs for Screen Recording, Accessibility, and Microphone each require distinct steps in System Settings.

**Primary recommendation:** Write macOS guide first (most research-dependent artifact), then `docs/index.html`, then `README.md`. Use the existing `docs/windows-beta-install.md` as the structural template for all three.

---

## Project Constraints (from CLAUDE.md)

- Tech stack is Tauri v2 / Rust / SolidJS — no Electron, no React
- No secrets in files committed to git
- No build step for frontend docs — `docs/index.html` must be plain HTML/CSS with no npm dependency

---

## Standard Stack

### GitHub Pages Mechanics

| Property | Value | Source |
|----------|-------|--------|
| Enable path | Repo Settings → Pages → Build and deployment → Deploy from a branch | [VERIFIED: docs.github.com] |
| Branch | `main` | [VERIFIED: docs.github.com] |
| Folder | `/docs` | [VERIFIED: docs.github.com] |
| Published URL | `https://subomi123.github.io/AI-Buddy/` | [ASSUMED — standard pattern for user `subomi123`] |
| Jekyll prevention | `docs/.nojekyll` (empty file inside `docs/`, NOT repo root) | [VERIFIED: GitHub community discussion] |
| Build time after push | ~1–3 minutes (Actions-driven) | [ASSUMED] |

**Critical gotcha:** `.nojekyll` must be inside the `/docs` folder when using `/docs` as the publish source. Placing it in the repo root does not prevent Jekyll from processing the docs folder content. [VERIFIED: GitHub community discussion #23564]

**Files needed in `docs/`:**
```
docs/
├── .nojekyll               # empty, prevents Jekyll processing
├── index.html              # GitHub Pages landing page
├── windows-beta-install.md # already exists
└── macos-beta-install.md   # to be created
```

The `.md` files in `docs/` are served as raw markdown by GitHub Pages (no rendering). Users navigating to the `docs/` URL directly will see raw markdown. The `index.html` landing page should link to the GitHub-rendered markdown views (i.e., `https://github.com/SUBOMI123/AI-Buddy/blob/main/docs/macos-beta-install.md`) rather than the raw GitHub Pages markdown URLs. [VERIFIED: GitHub Pages docs — folders without `index.html` 404]

---

## Architecture Patterns

### Recommended File Structure

```
/ (repo root)
├── README.md                         # NEW — download links + install guide links + feedback
docs/
├── .nojekyll                         # NEW — prevents Jekyll
├── index.html                        # NEW — GitHub Pages landing page
├── windows-beta-install.md           # EXISTS — SmartScreen walkthrough
└── macos-beta-install.md             # NEW — Gatekeeper + permission walkthrough
```

### Pattern 1: README Structure for Desktop App Beta

A beta desktop app README needs these sections in order:

1. **Title + one-line description** — what the app does, for whom
2. **Screenshot or demo gif** (optional but high value) — `<!-- screenshot: app-screenshot.png -->`
3. **Download badges/links** — platform-specific, links to the exact release
4. **Quick install links** — one sentence pointing to the install guide for each platform
5. **Feedback** — email + issues link
6. **About** — brief, 2–3 sentences on why the app exists

**Download section pattern (table):**

```markdown
## Download — v0.1.1

| Platform | Architecture | Download |
|----------|-------------|---------|
| macOS | Apple Silicon (M1/M2/M3/M4) | [AI.Buddy_0.1.1_aarch64.dmg](https://github.com/SUBOMI123/AI-Buddy/releases/download/v0.1.1/AI.Buddy_0.1.1_aarch64.dmg) |
| macOS | Intel | [AI.Buddy_0.1.1_x64.dmg](https://github.com/SUBOMI123/AI-Buddy/releases/download/v0.1.1/AI.Buddy_0.1.1_x64.dmg) |
| Windows | x64 | [AI.Buddy_0.1.1_x64-setup.exe](https://github.com/SUBOMI123/AI-Buddy/releases/download/v0.1.1/AI.Buddy_0.1.1_x64-setup.exe) |
```

**Alternative (bullet list) — simpler:**

```markdown
## Download — v0.1.1

- **macOS (Apple Silicon)** — [AI.Buddy_0.1.1_aarch64.dmg](...)
- **macOS (Intel)** — [AI.Buddy_0.1.1_x64.dmg](...)
- **Windows** — [AI.Buddy_0.1.1_x64-setup.exe](...)

[All releases and release notes](https://github.com/SUBOMI123/AI-Buddy/releases)
```

The table is cleaner for multi-artifact releases. Either works. [ASSUMED — README convention pattern]

### Pattern 2: GitHub Pages `docs/index.html` Minimal Structure

No build step, no framework, pure HTML/CSS. Pattern used by many project pages:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Buddy — Beta</title>
  <style>
    /* Inline critical styles — no external CSS files needed */
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           max-width: 700px; margin: 0 auto; padding: 2rem 1rem; color: #1a1a1a; }
    h1 { font-size: 2rem; }
    .download-table { width: 100%; border-collapse: collapse; }
    .download-table th, .download-table td { padding: 0.5rem 0.75rem; border: 1px solid #e0e0e0; text-align: left; }
    .btn { display: inline-block; background: #0f6cbd; color: white; padding: 0.5rem 1.25rem;
           border-radius: 6px; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <h1>AI Buddy <span style="font-size:1rem;color:#666;">Beta</span></h1>
  <p>AI Buddy watches your screen and gives you step-by-step guidance to complete any task
     in any software — without Googling or getting stuck.</p>

  <h2>Download — v0.1.1</h2>
  <table class="download-table">
    <tr><th>Platform</th><th>Architecture</th><th>Download</th></tr>
    <tr>
      <td>macOS</td>
      <td>Apple Silicon (M1–M4)</td>
      <td><a href="https://github.com/SUBOMI123/AI-Buddy/releases/download/v0.1.1/AI.Buddy_0.1.1_aarch64.dmg">AI.Buddy_0.1.1_aarch64.dmg</a></td>
    </tr>
    <tr>
      <td>macOS</td>
      <td>Intel</td>
      <td><a href="https://github.com/SUBOMI123/AI-Buddy/releases/download/v0.1.1/AI.Buddy_0.1.1_x64.dmg">AI.Buddy_0.1.1_x64.dmg</a></td>
    </tr>
    <tr>
      <td>Windows</td>
      <td>x64</td>
      <td><a href="https://github.com/SUBOMI123/AI-Buddy/releases/download/v0.1.1/AI.Buddy_0.1.1_x64-setup.exe">AI.Buddy_0.1.1_x64-setup.exe</a></td>
    </tr>
  </table>

  <h2>Install Guides</h2>
  <ul>
    <li><a href="https://github.com/SUBOMI123/AI-Buddy/blob/main/docs/macos-beta-install.md">macOS Install Guide</a> — Gatekeeper walkthrough + permission setup</li>
    <li><a href="https://github.com/SUBOMI123/AI-Buddy/blob/main/docs/windows-beta-install.md">Windows Install Guide</a> — SmartScreen click-through</li>
  </ul>

  <h2>Send Feedback</h2>
  <p>
    Email: <a href="mailto:subibash02@gmail.com">subibash02@gmail.com</a><br>
    Bug reports: <a href="https://github.com/SUBOMI123/AI-Buddy/issues/new">GitHub Issues</a>
  </p>

  <footer style="margin-top:3rem;color:#888;font-size:0.875rem;">
    AI Buddy is in closed beta. <a href="https://github.com/SUBOMI123/AI-Buddy">View on GitHub</a>
  </footer>
</body>
</html>
```

This pattern: no external dependencies, renders correctly without JavaScript, mobile-responsive via viewport meta, ~50 lines. [ASSUMED — based on standard minimal GitHub Pages patterns]

The install guide links point to GitHub's blob viewer (which renders Markdown), not the raw GitHub Pages URL (which would serve raw Markdown text). This is intentional — GitHub renders `.md` files with formatting. [VERIFIED: GitHub Pages behavior]

### Pattern 3: macOS Install Guide Structure

Mirror of `docs/windows-beta-install.md` in depth and conventions. Key structure:

```markdown
# Installing AI Buddy on macOS (Beta)

> **Note:** AI Buddy is currently in closed beta...

---

## Which Download Do I Need?

[Table: Apple Silicon vs Intel detection instructions]

---

## Step 1 — Download the DMG

[download link, screenshot placeholder]

## Step 2 — Open the DMG and Install

[drag to Applications, screenshot placeholder]

## Step 3 — First Launch: Gatekeeper

[Gatekeeper dialog text, right-click workaround, Sequoia-specific path]

## Step 4 — Grant Screen Recording Permission

[exact System Settings path, screenshot placeholder]

## Step 5 — Grant Accessibility Permission

[exact System Settings path, screenshot placeholder]

## Step 6 — Grant Microphone Permission

[dialog text, screenshot placeholder]

## Step 7 — Find AI Buddy in the Menu Bar

[system tray discovery, screenshot placeholder]

---

## Frequently Asked Questions

[Why does Gatekeeper block it / Is it safe / When will it go away / Why three permission dialogs]
```

Screenshot placeholder convention (matches Windows guide): `<!-- screenshot: step-name.png -->`

---

## macOS Gatekeeper Flow — Detailed Research

This is the most technically nuanced part of the guide. Behavior differs by macOS version.

### AI Buddy's Signing Status

AI Buddy is **notarized + signed with Developer ID**. This is the highest tier below the App Store. It is NOT an "unidentified developer" or unsigned app. This matters because the Gatekeeper experience for notarized apps is materially different (and less scary) than for unsigned apps. [VERIFIED: Phase 14 work completed signing + notarization]

### macOS 13 Ventura + macOS 14 Sonoma (pre-Sequoia)

For a notarized Developer ID app downloaded from the internet (quarantine bit set):

**First double-click attempt:**
The app does NOT launch. macOS shows an alert dialog:

> **"AI Buddy" cannot be opened because Apple cannot check it for malicious software.**
> This software needs to be updated. Contact the developer for more information.

OR (more common for notarized apps):

> **"AI Buddy" can't be opened.**
> macOS cannot verify the developer of "AI Buddy". Are you sure you want to open it?

The exact text depends on notarization status and macOS minor version. The key button is labeled **"Cancel"** (default) and **"Open"** or is absent. [MEDIUM confidence — based on multiple Apple support sources, exact phrasing varies]

**Workaround (Ventura/Sonoma):**
1. In Finder, navigate to Applications
2. Right-click (or Control-click) the AI Buddy app
3. Select **"Open"** from the context menu
4. A new dialog appears: **"macOS cannot verify the developer of 'AI Buddy'. Are you sure you want to open it?"** with buttons: **"Cancel"** and **"Open"**
5. Click **"Open"**
6. macOS remembers the exception — subsequent launches work normally by double-clicking

[CITED: support.apple.com/en-us/102445] — Apple's official guidance recommends the right-click/Open method.

### macOS 15 Sequoia — Important Change

Apple removed the right-click workaround in macOS Sequoia. The Control-click → Open path no longer produces an "Open" button for apps that trigger Gatekeeper. [CITED: idownloadblog.com/2024/08/07/apple-macos-sequoia-gatekeeper-change]

**New path (Sequoia only):**
1. Attempt to open the app (double-click) — it is blocked
2. Open **System Settings** → **Privacy & Security**
3. Scroll down to the "Security" section
4. A message appears: **"'AI Buddy' was blocked from use because it is not from an identified developer."** with an **"Open Anyway"** button
5. Click **"Open Anyway"** — a final confirmation dialog appears
6. Authenticate with admin password if prompted
7. The app launches; subsequent launches work normally

**Time limit:** The "Open Anyway" button only appears in System Settings within **approximately one hour** of the blocked attempt. If the user waits too long, they must attempt to open the app again to reset the one-hour window. [MEDIUM confidence — cited from Apple community forums]

**Sequoia Screen Recording (additional change):** macOS Sequoia 15 introduced a new monthly Screen Recording re-authorization prompt. The system shows a weekly (or per-reboot) warning: **"[App] can access this computer's screen and audio. Do you want to continue to allow access?"** with **"Allow for One Month"** and **"Don't Allow"** buttons. This is new in Sequoia and users should be warned. [CITED: developer.apple.com/news/?id=saqachfa]

### Permission Dialogs — All Three Required

**Screen Recording:**
- Trigger: First time the app takes a screenshot
- Dialog text pattern: **"'AI Buddy' would like to record this computer's screen."** with **"Don't Allow"** and **"Open System Settings"** buttons
- User path: Click **"Open System Settings"** → System Settings opens to Privacy & Security → Screen Recording → toggle AI Buddy ON → the app may need to be relaunched
- macOS 13+ path: **System Settings → Privacy & Security → Screen Recording → toggle AI Buddy**
- macOS 12- path: **System Preferences → Security & Privacy → Privacy → Screen Recording → checkbox**
- [CITED: docs.set.me/permissions-on-mac, Apple developer forums]

**Accessibility:**
- Trigger: App requires overlay positioning (Tauri window layer management)
- User path: **System Settings → Privacy & Security → Accessibility → toggle AI Buddy ON**
- Unlike Screen Recording, Accessibility does NOT have a system-level auto-prompt on first use. The app may show a custom prompt or the user must grant it manually before the overlay positions correctly.
- [ASSUMED — based on Tauri community reports about accessibility permissions]

**Microphone:**
- Trigger: First push-to-talk activation
- Dialog text pattern: **"'AI Buddy' would like to access the microphone."** with **"Don't Allow"** and **"OK"** buttons — standard macOS microphone TCC dialog
- User path: Click **"OK"** in the dialog — no System Settings navigation needed on first grant
- If denied: System Settings → Privacy & Security → Microphone → toggle AI Buddy ON
- [ASSUMED — standard macOS microphone permission flow]

**Permission order AI Buddy actually requests:**
Screen Recording fires first (on first guidance request that takes a screenshot), then Microphone (on first push-to-talk), Accessibility may be needed before these if the overlay fails to position. The guide should present them in the order the user will encounter them in normal use flow, not alphabetically.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Detecting Apple Silicon vs Intel | Custom uname parsing instructions | Tell user to check Apple menu → About This Mac → Chip field | Already built into macOS |
| Screenshot/badge generation for README | Custom image generation | `<!-- screenshot: name.png -->` placeholders | Same convention as Windows guide; screenshots added later |
| Jekyll-free GitHub Pages | Custom build workflow | `.nojekyll` empty file | GitHub Pages built-in feature |

---

## Common Pitfalls

### Pitfall 1: `.nojekyll` in wrong location
**What goes wrong:** Jekyll processes the docs folder anyway, potentially mangling the `index.html` or failing on filenames with underscores.
**Why it happens:** Developers place `.nojekyll` in repo root, but GitHub Pages only respects it in the publishing source folder (`docs/`).
**How to avoid:** Place `docs/.nojekyll` (empty file). [VERIFIED: GitHub community discussion #23564]
**Warning signs:** Pages build succeeds but `index.html` content is missing or malformed.

### Pitfall 2: Install guide links pointing to raw GitHub Pages markdown
**What goes wrong:** User clicks "macOS Install Guide" link and sees raw markdown text, not rendered guide.
**Why it happens:** Linking to `https://subomi123.github.io/AI-Buddy/macos-beta-install.md` instead of `https://github.com/SUBOMI123/AI-Buddy/blob/main/docs/macos-beta-install.md`.
**How to avoid:** All install guide links must point to GitHub's blob viewer URL, not the Pages URL.
**Warning signs:** Links work but display unrendered markdown.

### Pitfall 3: Missing chip selection guidance (macOS)
**What goes wrong:** User downloads the wrong DMG (Intel DMG on Apple Silicon or vice versa), app runs slowly under Rosetta or fails to launch.
**Why it happens:** arm64 vs x86_64 distinction not explained before the download link.
**How to avoid:** Include a one-step chip check ("Apple menu → About This Mac → look for 'Apple M' in Chip field") before showing download links.
**Warning signs:** User reports app "feels slow" or crashes immediately.

### Pitfall 4: Gatekeeper path not version-gated
**What goes wrong:** Sequoia users follow the right-click instructions from a pre-Sequoia guide and get confused when right-click → Open does not show an "Open" button.
**Why it happens:** Gatekeeper behavior changed in Sequoia. [CITED: idownloadblog.com report]
**How to avoid:** Guide must cover BOTH paths with a clear macOS version selector (e.g., "macOS 15 Sequoia or later" vs "macOS 13 or 14").
**Warning signs:** Beta user reports "I don't see an Open button."

### Pitfall 5: Sequoia monthly Screen Recording re-prompt
**What goes wrong:** User granted Screen Recording on first launch but gets blocked again after a reboot/week. They think something broke.
**Why it happens:** macOS Sequoia 15 introduced periodic Screen Recording re-authorization. [CITED: developer.apple.com/news/?id=saqachfa]
**How to avoid:** FAQ entry: "AI Buddy keeps asking for screen recording permission — is this normal?" Answer: yes, this is a macOS 15 Sequoia behavior affecting all screen-recording apps.
**Warning signs:** Beta user reports "it worked before but now I get a permission error."

### Pitfall 6: Artifact filename mismatch in download links
**What goes wrong:** Download links in README or `index.html` point to wrong filename and return 404.
**Why it happens:** Artifact filenames include the version number (`0.1.1`) — they must be updated on each release. When Phase 15 CI produces v0.1.2, the hardcoded links break.
**How to avoid:** For this beta phase, hardcode v0.1.1 links exactly as confirmed in CONTEXT.md. Add a code comment noting they must be updated on next release.
**Confirmed artifact filenames from v0.1.1:**
  - `AI.Buddy_0.1.1_aarch64.dmg` (macOS arm64)
  - `AI.Buddy_0.1.1_x64.dmg` (macOS x86_64)
  - `AI.Buddy_0.1.1_x64-setup.exe` (Windows)
  - `AI.Buddy_0.1.1_x64_en-US.msi` (Windows MSI)

---

## Code Examples

### GitHub Pages enable — UI sequence
```
Repo → Settings → Pages → Build and deployment
  Source: Deploy from a branch
  Branch: main    /docs
  [Save]
```
[VERIFIED: docs.github.com/en/pages]

### `.nojekyll` creation
```bash
touch docs/.nojekyll
git add docs/.nojekyll
git commit -m "chore: add .nojekyll to prevent Jekyll processing"
```
[VERIFIED: GitHub Pages docs]

### Direct download link pattern for GitHub Releases
```
https://github.com/{owner}/{repo}/releases/download/{tag}/{filename}
```
Example:
```
https://github.com/SUBOMI123/AI-Buddy/releases/download/v0.1.1/AI.Buddy_0.1.1_aarch64.dmg
```
[VERIFIED: standard GitHub Releases URL pattern]

### macOS "About This Mac" chip check for install guide
```markdown
To check your Mac's chip:
1. Click the  (Apple) menu in the top-left corner
2. Select **About This Mac**
3. Look at the **Chip** or **Processor** field:
   - **Apple M1, M2, M3, or M4** → download the arm64 (Apple Silicon) DMG
   - **Intel Core i5/i7/i9** → download the x64 (Intel) DMG
```
[ASSUMED — standard macOS chip detection instruction]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Right-click → Open (Gatekeeper bypass) | System Settings → Privacy & Security → Open Anyway | macOS 15 Sequoia (Sept 2024) | Install guide MUST document both paths |
| Screen Recording permission: one-time grant | Screen Recording: periodic re-authorization (weekly/monthly) | macOS 15 Sequoia (Sept 2024) | FAQ entry needed; users will be confused |
| System Preferences (macOS 12-) | System Settings (macOS 13+) | macOS Ventura (2022) | Guide should use "System Settings" consistently; macOS 12 users are edge case |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | GitHub Pages URL will be `https://subomi123.github.io/AI-Buddy/` | GitHub Pages Mechanics | Wrong URL in README and index.html; low risk — easy to fix post-publish |
| A2 | Exact Gatekeeper dialog text for notarized AI Buddy app | Gatekeeper Flow — Ventura/Sonoma | Dialog wording varies by notarization outcome; if SIGN-01/SIGN-02 were not fully completed, a different (more alarming) dialog may appear |
| A3 | Accessibility permission does NOT auto-prompt on first use | Permission Dialogs | If Tauri does trigger an auto-prompt, the guide step is still valid — just ordering may differ |
| A4 | Microphone permission shows standard "Allow/Don't Allow" TCC dialog | Permission Dialogs | Different dialog text possible; low risk — all TCC dialogs are structurally similar |
| A5 | Right-click workaround still works on macOS 13 Ventura + 14 Sonoma for notarized apps | Gatekeeper Flow | Reports are inconsistent for notarized vs unnotarized; notarized apps may skip the dialog entirely on Sonoma |
| A6 | The "Open Anyway" button in Sequoia System Settings has a ~1 hour timeout | Gatekeeper Flow — Sequoia | If timeout is different, the FAQ answer will be wrong; low impact |

**A5 is the highest-risk assumption.** For a properly notarized Developer ID app, Gatekeeper on Ventura/Sonoma may simply show a confirmation dialog on first launch (not require right-click at all). The guide should present: "If you see a dialog on first launch, click Open. If the app simply doesn't open, use the right-click workaround or the System Settings path." This covers all cases without false steps.

---

## Open Questions (RESOLVED)

1. **Does Phase 14 notarization actually pass Gatekeeper without any dialog?**
   - RESOLVED: Guide covers all possible cases (both Gatekeeper paths for Ventura/Sonoma and Sequoia 15+). A full re-test on a clean machine is recommended post-publish but is not a blocker.

2. **Is the GitHub repo public?**
   - RESOLVED: User confirmed repo is public. Install guide links to `github.com/.../blob/main/docs/...` will work for all beta users without login.

3. **Should Windows MSI be listed alongside the EXE in download links?**
   - RESOLVED: EXE only in user-facing links. MSI omitted from beta (power-user option, not needed for general install guide).

---

## Environment Availability

Step 2.6 SKIPPED — Phase 16 is documentation-only. No external tools, CLI utilities, or services need to be installed. The only external dependency is the GitHub repository settings UI (accessed via browser), which is always available.

---

## Validation Architecture

Validation for Phase 16 is manual-only. There are no automated tests for documentation content or GitHub Pages configuration.

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DIST-01 | v0.1.1 release on GitHub with all artifacts | manual smoke | `curl -I https://github.com/SUBOMI123/AI-Buddy/releases/tag/v0.1.1` | N/A |
| DIST-02 | macOS guide covers all Gatekeeper + permission steps | manual review | N/A — human review | ❌ Wave 0 |
| DIST-03 | Feedback email link works, GitHub Issues link works | manual click-through | N/A | N/A |

**Wave 0 gaps:** None for automated testing — this is a documentation phase. Human UAT covers DIST-02 by having a macOS beta user attempt the install guide cold.

---

## Security Domain

No new attack surface introduced in this phase. Documentation only.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | no | — |
| V6 Cryptography | no | — |
| V2 Authentication | no | — |

**Security note on docs/index.html:** No JavaScript, no form submission, no cookies. Static HTML serving via GitHub Pages. Zero attack surface. [VERIFIED: architecture decision]

**Security note on feedback email:** Direct `mailto:` link. No email capture form. No server. [VERIFIED: D-01 decision]

---

## Sources

### Primary (HIGH confidence)
- [GitHub Pages configuration docs](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) — publish source configuration, docs/ folder setup
- [Apple Support HT202491 — Safely open apps](https://support.apple.com/en-us/102445) — official Gatekeeper bypass guidance
- [Apple Developer — macOS Sequoia runtime protection updates](https://developer.apple.com/news/?id=saqachfa) — Screen Recording re-auth in Sequoia
- [GitHub Community Discussion #23564](https://github.com/orgs/community/discussions/23564) — `.nojekyll` must be in `/docs`, not repo root

### Secondary (MEDIUM confidence)
- [SetMe permissions guide](https://docs.set.me/permissions-on-mac/allow-accessibility-and-screen-recording-permissions-on-mac-instructions-for-client) — Screen Recording and Accessibility System Settings paths, macOS 13+
- [Eclectic Light Company — Living without notarization](https://eclecticlight.co/2024/10/01/living-without-notarization/) — Gatekeeper quarantine flow for notarized apps
- [iDownloadBlog — Sequoia Gatekeeper change](https://www.idownloadblog.com/2024/08/07/apple-macos-sequoia-gatekeeper-change-install-unsigned-apps-mac/) — right-click workaround removal in Sequoia

### Tertiary (LOW confidence)
- [TrozWare — App Permissions on macOS Sequoia](https://troz.net/post/2024/sequoia_app_permissions/) — monthly Screen Recording re-auth details
- [Simon Willison TIL — GitHub Pages](https://til.simonwillison.net/github/github-pages) — routing behavior, index.html handling

---

## Metadata

**Confidence breakdown:**
- GitHub Pages setup mechanics: HIGH — verified against official docs and community reports
- macOS Gatekeeper exact dialog text: MEDIUM — Apple does not publish verbatim dialog text; wording based on multiple user reports and Apple support docs
- macOS permission dialog flow: MEDIUM — paths verified via third-party guides; exact text assumed from TCC standard patterns
- README/index.html structure: ASSUMED — based on desktop app conventions and Tauri ecosystem examples

**Research date:** 2026-04-14
**Valid until:** GitHub Pages mechanics — stable (6 months). macOS Gatekeeper behavior — verify when macOS 16 releases.
