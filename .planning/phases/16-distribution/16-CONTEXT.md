# Phase 16: Distribution — Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Make it possible for beta users to discover, download, install, and report feedback on AI Buddy. Phase 16 ends when:
- A macOS and Windows download link is findable on both the GitHub README and a GitHub Pages site
- A beta user can follow the macOS install guide through Gatekeeper and all first-launch permission dialogs without hitting an undocumented step
- A feedback channel (email + GitHub Issues) is documented and reachable

Phase 15 already shipped DIST-01: signed macOS DMGs (arm64 + x86_64) and Windows EXE are live at https://github.com/SUBOMI123/AI-Buddy/releases/tag/v0.1.1. No release publishing work needed in Phase 16.

Phase 17+ handles paid landing page, marketing site, and broader distribution.

</domain>

<decisions>
## Implementation Decisions

### Feedback channel — Email + GitHub Issues

**D-01:** Two feedback channels:
1. **Email** — for non-technical beta users. Use `subibash02@gmail.com` as the beta contact (or a dedicated alias if the user sets one up — planner should ask). Referenced in install guides and README.
2. **GitHub Issues** — for bug reports from technical users. Link directly to `https://github.com/SUBOMI123/AI-Buddy/issues/new`. No custom template required for beta.

Discord is deferred to v1.0 when community size justifies it.

### Install guide home — GitHub README + GitHub Pages

**D-02:** Two surfaces:
1. **GitHub README** (`README.md` in repo root) — Updated with: brief product description, download links for v0.1.1 (arm64 DMG, x86_64 DMG, Windows EXE), links to both install guides, feedback channel info.
2. **GitHub Pages** — Enable via repo Settings → Pages → Source: `docs/` folder on `main` branch. Create `docs/index.html` as the landing page with the same download links and install guide links. URL: `https://subomi123.github.io/AI-Buddy/`.

Both surfaces link to the same install guides in `docs/`.

### macOS install guide — Full Gatekeeper walkthrough

**D-03:** Create `docs/macos-beta-install.md` at the same depth as `docs/windows-beta-install.md`. Must cover:
1. Download the DMG from GitHub Releases (arm64 for M1/M2/M3 Mac, x86_64 for Intel Mac)
2. Open the DMG and drag AI Buddy to Applications
3. First launch — Gatekeeper blocks with "cannot be opened because the developer cannot be verified"
4. Fix: right-click the app in Applications → Open → "Open" in the dialog
5. First-launch permission dialogs (in order they appear):
   - **Screen Recording** — required for screenshot feature. System Settings → Privacy & Security → Screen Recording → enable AI Buddy
   - **Accessibility** — required for overlay positioning. System Settings → Privacy & Security → Accessibility → enable AI Buddy
   - **Microphone** — required for push-to-talk voice input
6. App appears in system tray (menu bar) — how to find it and open the overlay
7. Brief FAQ: "Why does Gatekeeper block it?" / "Is it safe?" / "When will this go away?" (notarized but not App Store — explain the distinction)

Screenshot placeholders follow the same `<!-- screenshot: step-name.png -->` convention as the Windows guide.

### Claude's Discretion

- Exact HTML/CSS for `docs/index.html` GitHub Pages landing page — keep it simple, no build step, pure HTML
- Whether README uses a table or bullet list for download links
- Exact wording of FAQ entries in the macOS guide
- Whether to add a `.nojekyll` file to docs/ (needed if GitHub Pages tries to process the files with Jekyll)
- Beta contact email alias vs direct Gmail — use `subibash02@gmail.com` unless a dedicated alias is simpler

</decisions>

<canonical_refs>
## Canonical References

- `.planning/REQUIREMENTS.md` — DIST-01, DIST-02, DIST-03
- `.planning/ROADMAP.md` §Phase 16 — success criteria
- `docs/windows-beta-install.md` — existing Windows guide, template for macOS guide depth and format
- `https://github.com/SUBOMI123/AI-Buddy/releases/tag/v0.1.1` — live release with exact artifact filenames

### Exact artifact filenames from v0.1.1 release (use these in download links):
- macOS arm64: `AI.Buddy_aarch64.app.tar.gz` / DMG: `AI.Buddy_0.1.1_aarch64.dmg`
- macOS x86_64: `AI.Buddy_x64.app.tar.gz` / DMG: `AI.Buddy_0.1.1_x64.dmg`  
- Windows MSI: `AI.Buddy_0.1.1_x64_en-US.msi`
- Windows EXE: `AI.Buddy_0.1.1_x64-setup.exe`

</canonical_refs>

<code_context>
## Existing Assets

### Reusable
- `docs/windows-beta-install.md` — full SmartScreen walkthrough, template for macOS guide structure, screenshot placeholder convention
- GitHub Releases v0.1.1 — live, all three platform artifacts uploaded

### What Needs Creating
- `README.md` — currently absent (no README in repo root)
- `docs/macos-beta-install.md` — macOS Gatekeeper + permission walkthrough
- `docs/index.html` — GitHub Pages landing page

### GitHub Pages Setup
- Enable in repo Settings → Pages → Source: `docs/` folder, `main` branch
- Add `docs/.nojekyll` to prevent Jekyll processing
- URL will be: `https://subomi123.github.io/AI-Buddy/`

</code_context>

<deferred>
## Deferred Ideas

- Discord community server — v1.0 when user base justifies moderation overhead
- Custom domain for GitHub Pages (e.g. `aibuddy.app`) — v1.0
- Marketing landing page with video demo, pricing, waitlist — Phase 17+
- App Store / Microsoft Store distribution — v1.0
- Automated feedback triage / issue templates — v1.0

</deferred>

---

*Phase: 16-distribution*
*Context gathered: 2026-04-15*
