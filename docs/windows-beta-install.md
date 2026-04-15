# Installing AI Buddy on Windows (Beta)

> **Note:** AI Buddy is currently in closed beta. The Windows installer is not yet code-signed,
> which triggers a Microsoft SmartScreen warning during installation. This is expected and safe to
> bypass if you received the installer link from the AI Buddy team.

---

## Why Does SmartScreen Appear?

Microsoft SmartScreen warns users when an application does not have a code-signing certificate
from a known publisher. AI Buddy's Windows beta build is unsigned — this is intentional for the
closed beta period.

**This warning does NOT mean the app is harmful.** It means the binary has not yet gone through
EV code signing, which is planned for v1.0 (see note at the bottom of this page).

To protect yourself: only install AI Buddy from the **official GitHub Releases page**:
`https://github.com/SUBOMI123/AI-Buddy/releases`

Do not install from any other source.

---

## How to Install (SmartScreen Click-Through)

### Step 1 — Download the installer

Download `AI.Buddy_x.x.x_x64-setup.exe` from the GitHub Releases page.

<!-- screenshot: step1-download-github-release.png -->

### Step 2 — Run the installer

Double-click the downloaded `.exe` file. SmartScreen will block it and show a blue dialog:

> **"Windows protected your PC"**
> Microsoft Defender SmartScreen prevented an unrecognized app from starting.

<!-- screenshot: smartscreen-blocked.png -->

### Step 3 — Click "More info"

Click the **"More info"** link in the SmartScreen dialog. The dialog expands to show the app name
and publisher details.

<!-- screenshot: smartscreen-more-info.png -->

### Step 4 — Click "Run anyway"

Click the **"Run anyway"** button that appears after clicking "More info".

<!-- screenshot: smartscreen-run-anyway.png -->

### Step 5 — Proceed through the installer

The installer will open normally. Follow the on-screen prompts to complete installation.

AI Buddy installs to `%LOCALAPPDATA%\AI Buddy\` and creates a Start Menu shortcut.

---

## After Installation

- AI Buddy starts in the system tray (bottom-right corner of your taskbar)
- Click the tray icon to open the overlay
- Use the push-to-talk shortcut to activate voice input

If you run into any issues, reach out to the beta support channel you received with your invite.

---

## Why Will This Warning Go Away?

In **v1.0**, AI Buddy will be signed with an Extended Validation (EV) code-signing certificate.
EV-signed applications are immediately recognized by SmartScreen without any warning — no click-through
required.

For the closed beta, bypassing SmartScreen via "More info → Run anyway" is the correct and safe
procedure.

---

## Frequently Asked Questions

**Q: Is it safe to click "Run anyway"?**
A: Yes, if you received this link from the AI Buddy team or downloaded from the official GitHub
Releases page. Only bypass SmartScreen for software you trust from a known source.

**Q: Why doesn't AI Buddy just sign the Windows binary now?**
A: EV code signing for Windows requires a hardware security key (HSM) for the private key, which is
incompatible with automated CI builds. We plan to implement this properly in v1.0 using Azure Trusted
Signing.

**Q: My antivirus flagged the installer. Is that normal?**
A: Antivirus products sometimes flag unsigned binaries from new publishers. If you downloaded from
the official GitHub Releases page, the file is safe. You can whitelist the installer in your
antivirus settings.
