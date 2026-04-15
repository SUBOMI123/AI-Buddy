# Installing AI Buddy on macOS (Beta)

> **Note:** AI Buddy is currently in closed beta. It is signed and notarized with a Developer ID
> certificate, which means macOS may still show a first-launch security dialog. This is expected
> and safe to proceed through if you received the download link from the AI Buddy team.

---

## Which Download Do I Need?

To check your Mac's chip:
1. Click the Apple () menu in the top-left corner
2. Select **About This Mac**
3. Look at the **Chip** or **Processor** field:
   - **Apple M1, M2, M3, or M4** → download `AI.Buddy_0.1.1_aarch64.dmg` (Apple Silicon)
   - **Intel Core i5, i7, or i9** → download `AI.Buddy_0.1.1_x64.dmg` (Intel)

---

## Step 1 — Download the DMG

Download the correct DMG for your Mac:

- **Apple Silicon (M1/M2/M3/M4):** [AI.Buddy_0.1.1_aarch64.dmg](https://github.com/SUBOMI123/AI-Buddy/releases/download/v0.1.1/AI.Buddy_0.1.1_aarch64.dmg)
- **Intel:** [AI.Buddy_0.1.1_x64.dmg](https://github.com/SUBOMI123/AI-Buddy/releases/download/v0.1.1/AI.Buddy_0.1.1_x64.dmg)

[View all releases](https://github.com/SUBOMI123/AI-Buddy/releases)

<!-- screenshot: step1-download-github-release.png -->

---

## Step 2 — Open the DMG and Install

1. Double-click the downloaded `.dmg` file to mount it
2. A Finder window opens showing AI Buddy and an Applications folder alias
3. Drag AI Buddy into the Applications folder
4. Wait for the copy to complete, then eject the DMG (drag to Trash or press Cmd+E)

<!-- screenshot: step2-dmg-drag-to-applications.png -->

---

## Step 3 — First Launch: Gatekeeper

AI Buddy is signed and notarized, but macOS still applies a first-launch quarantine check for apps downloaded from the internet. The steps differ depending on your macOS version.

### macOS 13 Ventura or macOS 14 Sonoma

1. Double-click AI Buddy in Applications. macOS may show a dialog: **"'AI Buddy' cannot be opened"** or **"macOS cannot verify the developer of 'AI Buddy'."** Click **"Cancel"** — do NOT click "Move to Trash".
2. In Finder, navigate to the **Applications** folder
3. Right-click (or Control-click) the AI Buddy icon and select **"Open"** from the context menu
4. A dialog appears: **"macOS cannot verify the developer of 'AI Buddy'. Are you sure you want to open it?"** — click **"Open"**
5. AI Buddy launches. Subsequent launches work normally by double-clicking.

<!-- screenshot: step3a-right-click-open.png -->
<!-- screenshot: step3a-open-dialog.png -->

### macOS 15 Sequoia or later

> **Note:** Apple removed the right-click workaround in macOS 15 Sequoia. Use the System Settings path below instead.

1. Double-click AI Buddy in Applications — it will be blocked. Click **"OK"** in the alert.
2. Open **System Settings** (Apple menu → System Settings)
3. Go to **Privacy & Security**
4. Scroll down to the **Security** section
5. Look for: **"'AI Buddy' was blocked from use because it is not from an identified developer."**
6. Click **"Open Anyway"**
7. Authenticate with your admin password if prompted
8. AI Buddy launches. Subsequent launches work normally.

> **Note:** The "Open Anyway" button only appears in System Settings for approximately one hour after the blocked launch attempt. If it is not visible, try double-clicking AI Buddy again to reset the window, then return to System Settings immediately.

<!-- screenshot: step3b-system-settings-security.png -->
<!-- screenshot: step3b-open-anyway.png -->

---

## Step 4 — Grant Screen Recording Permission

AI Buddy needs Screen Recording permission to take screenshots of your screen and send them to the AI for analysis. This permission is required for the core guidance feature to work.

1. On first use of the guidance feature, macOS shows a dialog: **"'AI Buddy' would like to record this computer's screen."** Click **"Open System Settings"**.
2. System Settings opens to **Privacy & Security → Screen Recording**
3. Find **AI Buddy** in the list and toggle it **ON**
4. A dialog may prompt you to **quit and reopen** AI Buddy — do so if prompted

> **macOS 15 Sequoia note:** Sequoia introduced a periodic Screen Recording re-authorization prompt. You may see a dialog asking **"AI Buddy can access this computer's screen and audio. Do you want to continue to allow access?"** with an **"Allow for One Month"** button. Click **"Allow for One Month"** to continue. This prompt repeats roughly monthly and is a macOS security feature, not an AI Buddy bug.

<!-- screenshot: step4-screen-recording-permission.png -->
<!-- screenshot: step4-system-settings-screen-recording.png -->

---

## Step 5 — Grant Accessibility Permission

AI Buddy needs Accessibility permission to correctly position the overlay window on your screen.

1. Open **System Settings** → **Privacy & Security** → **Accessibility**
2. Click the **+** button (or toggle if AI Buddy already appears in the list) to add AI Buddy
3. Toggle AI Buddy **ON**
4. If the overlay does not position correctly after granting permission, quit and reopen AI Buddy

> **Note:** Unlike Screen Recording, Accessibility does not always trigger an automatic dialog. If the overlay appears in the wrong position, grant this permission manually using the steps above.

<!-- screenshot: step5-accessibility-permission.png -->

---

## Step 6 — Grant Microphone Permission

AI Buddy needs Microphone permission for push-to-talk voice input.

1. Press the push-to-talk key for the first time
2. macOS shows a dialog: **"'AI Buddy' would like to access the microphone."** Click **"OK"**
3. If you accidentally clicked "Don't Allow": open **System Settings → Privacy & Security → Microphone** and toggle AI Buddy **ON**

<!-- screenshot: step6-microphone-permission.png -->

---

## Step 7 — Find AI Buddy in the Menu Bar

AI Buddy runs from the macOS menu bar (top-right area of your screen). After launch, you will see the AI Buddy icon in the menu bar.

1. Look for the AI Buddy icon in the top-right of your screen, in the menu bar area
2. Click the icon to open the overlay
3. If you do not see the icon, your menu bar may be full — click the **>>** icon (Control Center overflow) or use the keyboard shortcut to bring up the overlay directly

<!-- screenshot: step7-menu-bar-icon.png -->

---

## Frequently Asked Questions

**Q: Why does Gatekeeper block AI Buddy if it is signed?**

A: AI Buddy is signed with a Developer ID certificate and notarized by Apple, which is the highest level of trust for apps distributed outside the App Store. macOS still shows a first-launch confirmation for all non-App-Store apps. Once you click "Open" or "Open Anyway", macOS remembers the exception and AI Buddy launches normally from then on.

**Q: Is AI Buddy safe to install?**

A: Yes, if you downloaded from the official GitHub Releases page: https://github.com/SUBOMI123/AI-Buddy/releases. AI Buddy is notarized by Apple, which means Apple has scanned the binary for malware. Only install from the official source.

**Q: When will Gatekeeper stop blocking AI Buddy?**

A: Once you approve AI Buddy the first time (using the steps above), Gatekeeper will not block it again on your Mac. The App Store is the only distribution channel that eliminates the first-launch dialog entirely — that is planned for v1.0.

**Q: AI Buddy keeps asking for Screen Recording permission — is this normal?**

A: Yes, on macOS 15 Sequoia this is expected. Apple introduced a periodic Screen Recording re-authorization requirement in Sequoia that affects all screen-recording apps, not just AI Buddy. When you see the dialog asking to continue allowing access, click "Allow for One Month". This is a macOS security feature.

---

## Send Feedback

Found a bug or have a question? Reach us at:

- **Email:** subibash02@gmail.com
- **Bug reports:** [GitHub Issues](https://github.com/SUBOMI123/AI-Buddy/issues/new)
