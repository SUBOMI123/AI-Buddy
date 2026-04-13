# Technology Stack

**Project:** AI Buddy v3.0 — Ship (Deploy & Distribution)
**Researched:** 2026-04-13
**Scope:** Additions only — covers what is needed to go from working prototype to closed beta. Existing validated stack (Tauri v2 + SolidJS + Rust, Cloudflare Worker/Hono, xcap, AssemblyAI, ElevenLabs, rusqlite, Claude API) is unchanged and not re-researched here.

---

## v3.0 Stack Additions by Capability

### 1. Cloudflare Worker KV — Activate the Real Backend

**What it is:** The existing Cloudflare Worker (Hono) already proxies Claude, AssemblyAI, and ElevenLabs API calls. The KV namespace is the missing piece flagged in PROJECT.md — there is a `PRODUCTION REQUIRED` banner in `wrangler.toml` for the KV namespace ID. KV is used for per-user rate limiting and beta access token validation.

**No new library.** KV is a first-party Cloudflare binding — it is accessed as `env.RATE_LIMIT_STORE` (or whatever binding name is used) directly inside the existing Hono worker. Nothing installs on the app side.

**Setup steps:**

```bash
# 1. Create the namespace
npx wrangler kv namespace create AI_BUDDY_BETA

# 2. wrangler outputs the namespace ID — paste into wrangler.toml
# [[kv_namespaces]]
# binding = "AI_BUDDY_BETA"
# id = "<namespace-id-from-output>"

# 3. Create a preview namespace for local dev (optional but recommended)
npx wrangler kv namespace create AI_BUDDY_BETA --preview
```

**wrangler.toml addition:**

```toml
[[kv_namespaces]]
binding = "AI_BUDDY_BETA"
id = "<production-namespace-id>"
preview_id = "<preview-namespace-id>"
```

**Use cases in the Worker:**

| Use Case | Pattern |
|----------|---------|
| Beta access token validation | Store `token → {email, created}` in KV. Worker checks `env.AI_BUDDY_BETA.get(token)` before forwarding any API request. Invalid token → 403. |
| Per-user rate limiting | Store `token:day → request_count` with a 24-hour TTL. Read, increment, write on each request. Reject over limit. Note: KV has ~1 write/second consistency per key — acceptable for daily limits, not per-second throttling. |
| Beta user enrollment | Write entries via `npx wrangler kv key put` or a simple admin script. No UI needed for beta. |

**Why NOT Durable Objects for rate limiting:** Durable Objects offer stronger per-second consistency but cost more and add operational complexity. For a closed beta with limited users and daily limits (not per-second), KV consistency is sufficient.

**Confidence:** HIGH — KV is a stable, production Cloudflare primitive. The wrangler CLI commands are documented. KV write-consistency limitations are well-documented (1 write/second per key) and do not affect daily rate limit use case.

---

### 2. Tauri Updater Plugin — Auto-Update Infrastructure

**Plugin:** `tauri-plugin-updater` (official Tauri plugin)

**What it does:** Allows the shipped app to check an endpoint for newer versions on startup, download the update, verify its cryptographic signature, and install it — replacing the old binary. Without this, beta users need manual reinstalls for every fix.

**Installation:**

```bash
cargo add tauri-plugin-updater --target 'cfg(any(target_os = "macos", windows))'
```

Register in `src-tauri/src/lib.rs`:

```rust
.plugin(tauri_plugin_updater::Builder::new().build())
```

**Key generation (one-time, done once before first beta build):**

```bash
npm run tauri -- signer generate -w ~/.tauri/ai-buddy.key
# Outputs: ~/.tauri/ai-buddy.key (private) and ~/.tauri/ai-buddy.key.pub (public)
# The private key must NEVER be committed. Add to .gitignore.
# The public key content goes into tauri.conf.json.
```

**tauri.conf.json configuration:**

```json
{
  "bundle": {
    "createUpdaterArtifacts": true
  },
  "plugins": {
    "updater": {
      "pubkey": "<content of ai-buddy.key.pub>",
      "endpoints": [
        "https://github.com/<org>/ai-buddy/releases/latest/download/latest.json"
      ]
    }
  }
}
```

**How the update flow works:**

1. `tauri-action` (GitHub Actions, see CI section) builds signed binaries and calls the action with `includeUpdaterJson: true`.
2. This generates `latest.json` and uploads it as a release asset on the GitHub Release.
3. On app startup, the updater plugin fetches that JSON, compares versions, downloads the new binary if newer, verifies the signature against the embedded public key, and installs.

**Static update manifest format (generated automatically by tauri-action):**

```json
{
  "version": "1.2.0",
  "notes": "Bug fixes",
  "pub_date": "2026-04-20T00:00:00Z",
  "platforms": {
    "darwin-aarch64": { "url": "...", "signature": "..." },
    "darwin-x86_64":  { "url": "...", "signature": "..." },
    "windows-x86_64": { "url": "...", "signature": "..." }
  }
}
```

**CI environment variables required for signing build artifacts:**

```
TAURI_SIGNING_PRIVATE_KEY       # content of ai-buddy.key (base64 or path)
TAURI_SIGNING_PRIVATE_KEY_PASSWORD  # password set during key generation
```

**Known limitation:** Draft releases and pre-releases cannot be marked as GitHub "latest" — the updater endpoint `releases/latest/download/latest.json` only picks up published (non-draft) releases. For beta, publish releases to a specific tag instead of relying on "latest". Use the endpoint format:

```
https://github.com/<org>/ai-buddy/releases/download/v{{current_version}}/latest.json
```

Or host `latest.json` on Cloudflare R2 / a Workers route for full control over which version beta users see.

**Confidence:** HIGH — tauri-plugin-updater is the official Tauri updater, stable in v2.x. The key generation and configuration are fully documented. The GitHub Releases limitation on drafts is documented in community discussions.

---

### 3. macOS Code Signing and Notarization

**What is required:** Apple requires all apps distributed outside the Mac App Store (which is the case here — direct download) to be:
1. Signed with a **Developer ID Application** certificate (not App Store certificate)
2. Notarized by Apple's notary service (automated; takes ~2-5 minutes)

Without this, macOS Gatekeeper blocks the app on first launch on every user's machine with "cannot be opened because the developer cannot be verified."

**Apple prerequisites (one-time setup, not in CI):**

| Requirement | Details |
|-------------|---------|
| Apple Developer Program membership | $99/year. Required for Developer ID certs. |
| Developer ID Application certificate | Created in Apple Developer portal → Certificates. Export as `.p12` with a password. |
| App Store Connect API key | Preferred over Apple ID for notarization in CI. Create in App Store Connect → Users and Access → Integrations → App Store Connect API. Download the `.p8` key file. |

**Entitlements file — mandatory for Tauri WebView apps:**

Tauri uses a WebView that requires JIT compilation. Without the JIT entitlement, the app crashes after notarization. Create `src-tauri/entitlements.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
</dict>
</plist>
```

Reference in `tauri.conf.json`:

```json
{
  "bundle": {
    "macOS": {
      "entitlements": "./entitlements.plist",
      "signingIdentity": "Developer ID Application: <Your Name> (<TeamID>)"
    }
  }
}
```

**GitHub Actions secrets required for macOS signing:**

| Secret | What it contains |
|--------|-----------------|
| `APPLE_CERTIFICATE` | Base64-encoded `.p12` file: `base64 -i cert.p12 | pbcopy` |
| `APPLE_CERTIFICATE_PASSWORD` | Password set when exporting the `.p12` |
| `APPLE_API_ISSUER` | Issuer ID from App Store Connect API keys page |
| `APPLE_API_KEY` | Key ID from App Store Connect (10-char string) |
| `APPLE_API_KEY_PATH` | Path to `.p8` file — handled in CI by writing to temp file |
| `KEYCHAIN_PASSWORD` | Any random string — used to create a temp keychain in the runner |

Tauri reads these environment variables during `cargo tauri build` and handles signing + notarization automatically via the `apple-codesign` / `xcrun notarytool` integration.

**Confidence:** HIGH — official Tauri v2 macOS signing docs at `v2.tauri.app/distribute/sign/macos/` are current. Entitlement requirements for JIT in WebView apps are confirmed in multiple community reports from 2026.

---

### 4. Windows Code Signing — Microsoft Trusted Signing (Artifact Signing)

**What is required:** Windows SmartScreen shows a "Windows protected your PC" warning for unsigned executables. Users must click "More info → Run anyway." For a beta, this is acceptable but poor UX. Signing eliminates the warning.

**Recommended: Microsoft Trusted Signing (formerly Azure Trusted Signing, renamed to Artifact Signing in January 2026)**

Why Trusted Signing over a traditional EV certificate:

| Factor | Trusted Signing | Traditional EV Certificate |
|--------|----------------|--------------------------|
| Cost | $9.99/month (Basic, 5,000 sigs) | $400+/year |
| Hardware token | None — cloud signing | Required (HSM/USB token) |
| CI/CD compatibility | Native — authenticates via Azure service principal | Painful — must copy token to runner or use special CI hardware |
| SmartScreen reputation | Immediate, same as EV | Same as EV (immediate) |
| Certificate validity changes (Feb 2026) | Not affected — cloud-managed | Max 458 days per CA/Browser Forum ruling |

**Prerequisites (one-time Azure setup):**

1. Azure subscription (free tier or existing)
2. Register `Microsoft.CodeSigning` resource provider in Azure subscription settings
3. Create a Trusted Signing Account in Azure Portal
4. Create a Certificate Profile (PublicTrustTest for beta, PublicTrust for production)
5. Create an App Registration (service principal) → get `client_id`, `client_secret`, `tenant_id`
6. Grant the service principal the "Trusted Signing Certificate Profile Signer" role

**Install the signing CLI:**

```bash
dotnet tool install --global sign
# The Tauri signCommand calls this under the hood
```

Or use `trusted-signing-cli`:

```bash
cargo install trusted-signing-cli
```

**tauri.conf.json for Windows signing:**

```json
{
  "bundle": {
    "windows": {
      "signCommand": "trusted-signing-cli -e https://wus2.codesigning.azure.net -a <AccountName> -c <CertificateProfile> -d AI-Buddy %1"
    }
  }
}
```

**GitHub Actions secrets required for Windows signing:**

| Secret | Value |
|--------|-------|
| `AZURE_CLIENT_ID` | App Registration client ID |
| `AZURE_CLIENT_SECRET` | App Registration client secret |
| `AZURE_TENANT_ID` | Azure directory tenant ID |

**Note on EV certificates:** If the team already has an EV certificate from DigiCert, Sectigo, or similar, it can also be used with Tauri's `signCommand`. But EV certs now have 458-day max validity (enforced Feb 27, 2026) and require physical hardware tokens, making CI integration painful. Trusted Signing is the better path for new setups.

**Confidence:** MEDIUM — Microsoft Trusted Signing is well-documented and the Tauri community has working examples. The rename from "Azure Trusted Signing" to "Artifact Signing" (January 2026) means some documentation still uses old naming — be aware when searching. The Tauri `signCommand` approach (shell out to CLI) is confirmed working in community reports.

---

### 5. GitHub Actions CI — Signed Build Pipeline

**Action:** `tauri-apps/tauri-action@v0` (official Tauri GitHub Action)

**What it does:** Builds the Tauri app for all specified targets, signs the binaries (using the environment variables set above), drafts a GitHub Release, uploads all artifacts (`.dmg`, `.app.tar.gz`, `.msi`, `.exe`, `latest.json`), and generates the updater manifest.

**Complete workflow structure:**

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  release:
    permissions:
      contents: write

    strategy:
      fail-fast: false
      matrix:
        include:
          # macOS Apple Silicon
          - platform: macos-latest
            args: '--target aarch64-apple-darwin'
            rust-target: aarch64-apple-darwin
          # macOS Intel
          - platform: macos-latest
            args: '--target x86_64-apple-darwin'
            rust-target: x86_64-apple-darwin
          # Windows
          - platform: windows-latest
            args: ''
            rust-target: x86_64-pc-windows-msvc

    runs-on: ${{ matrix.platform }}

    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.rust-target }}

      - name: Install Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install frontend deps
        run: npm install

      # macOS: import signing certificate into runner keychain
      - name: Import macOS certificate
        if: matrix.platform == 'macos-latest'
        env:
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          KEYCHAIN_PASSWORD: ${{ secrets.KEYCHAIN_PASSWORD }}
        run: |
          echo "$APPLE_CERTIFICATE" | base64 --decode > certificate.p12
          security create-keychain -p "$KEYCHAIN_PASSWORD" build.keychain
          security default-keychain -s build.keychain
          security unlock-keychain -p "$KEYCHAIN_PASSWORD" build.keychain
          security import certificate.p12 -k build.keychain -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign
          security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" build.keychain

      # Windows: install trusted-signing-cli
      - name: Install trusted-signing-cli (Windows)
        if: matrix.platform == 'windows-latest'
        run: cargo install trusted-signing-cli

      - name: Build and release
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # Tauri updater signing
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
          # macOS notarization
          APPLE_API_ISSUER: ${{ secrets.APPLE_API_ISSUER }}
          APPLE_API_KEY: ${{ secrets.APPLE_API_KEY }}
          APPLE_API_KEY_PATH: ${{ secrets.APPLE_API_KEY_PATH }}
          # Windows Trusted Signing
          AZURE_CLIENT_ID: ${{ secrets.AZURE_CLIENT_ID }}
          AZURE_CLIENT_SECRET: ${{ secrets.AZURE_CLIENT_SECRET }}
          AZURE_TENANT_ID: ${{ secrets.AZURE_TENANT_ID }}
        with:
          tagName: ai-buddy-v__VERSION__
          releaseName: 'AI Buddy v__VERSION__'
          releaseBody: 'See the release notes for this version.'
          releaseDraft: true
          prerelease: false
          includeUpdaterJson: true
          args: ${{ matrix.args }}
```

**Trigger strategy for beta:** Use `workflow_dispatch` (manual trigger) rather than automatic tag pushes. This gives full control over when a build is published to beta users. Promote drafts to published releases manually after QA.

**Total secrets list (across all capabilities):**

| Secret | Used For |
|--------|---------|
| `TAURI_SIGNING_PRIVATE_KEY` | Updater artifact signing |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Updater artifact signing |
| `APPLE_CERTIFICATE` | macOS code signing |
| `APPLE_CERTIFICATE_PASSWORD` | macOS code signing |
| `KEYCHAIN_PASSWORD` | macOS CI keychain |
| `APPLE_API_ISSUER` | macOS notarization |
| `APPLE_API_KEY` | macOS notarization |
| `APPLE_API_KEY_PATH` | macOS notarization (write `.p8` to temp file in CI step) |
| `AZURE_CLIENT_ID` | Windows Trusted Signing |
| `AZURE_CLIENT_SECRET` | Windows Trusted Signing |
| `AZURE_TENANT_ID` | Windows Trusted Signing |

**Confidence:** HIGH — `tauri-apps/tauri-action@v0` is the official action, actively maintained. The workflow structure is taken from official Tauri v2 documentation. Matrix configuration for both macOS architectures and Windows is confirmed current.

---

### 6. Beta Distribution — Closed Beta Download

**Mechanism: GitHub Releases (private repo or unlisted direct links)**

For a closed beta, GitHub Releases on a private repository is the lowest-friction option:

| Property | Detail |
|----------|--------|
| Build artifacts | `.dmg` (macOS), `.msi` or `.exe` (Windows), `latest.json` |
| Access control | Private GitHub repo — only invited collaborators see releases |
| Shareable link | Direct asset download URL is shareable without GitHub login if the repo is public; use a private repo for access control |
| Updater integration | `latest.json` at the release endpoint drives automatic updates |

**For a truly invite-only closed beta with non-GitHub users:**

Option A — Cloudflare R2 + short-lived signed URLs:
1. CI uploads artifacts to an R2 bucket after build
2. A Cloudflare Worker validates the beta token (from KV) and generates a presigned URL
3. Beta users visit a simple form, enter their token, get a time-limited download link
4. The updater endpoint also proxies through the Worker for KV-gated access

Option B — GitHub Releases (public repo) + manual invite list:
1. Publish releases to a public repo
2. Share direct asset URLs (e.g., `https://github.com/org/ai-buddy/releases/download/v1.0.0/ai-buddy_1.0.0_aarch64.dmg`) in a private beta invite email
3. Anyone with the URL can download — no GitHub account required
4. Acceptable for small closed beta where URL secrecy is the gate

**Recommendation for v3.0 beta:** Start with Option B (public repo + URL-as-gate). Zero infrastructure overhead. The beta is closed by social contract (not technical enforcement). If beta grows or leaks are a concern, add Option A later with the KV infrastructure already in place.

**Updater endpoint for beta:**

```
https://github.com/<org>/ai-buddy/releases/latest/download/latest.json
```

This points to the most recently published (non-draft) release. When you are ready to push an update, publish the draft release and all installed clients update on next startup.

**Confidence:** HIGH for GitHub Releases approach. MEDIUM for R2 presigned URL approach (implementation detail — the concept is sound, specifics need implementation validation).

---

## Summary of v3.0 Stack Additions

| Capability | Addition | Type | Cost |
|-----------|----------|------|------|
| KV namespace | Cloudflare Workers KV binding | Cloudflare service | Free tier: 1M reads/day, 1GB storage |
| Auto-updater | `tauri-plugin-updater` (Cargo) | Official Tauri plugin | Free |
| macOS signing | Developer ID Application cert + notarization | Apple Developer Program | $99/year |
| Windows signing | Microsoft Trusted Signing (Artifact Signing) | Azure service | $9.99/month (Basic) |
| CI pipeline | `tauri-apps/tauri-action@v0` | GitHub Action | Free (GitHub Actions minutes) |
| Beta distribution | GitHub Releases | GitHub feature | Free (private repo requires GitHub team plan if org) |

**Net new code dependencies: 1**
- `tauri-plugin-updater` (Rust crate, official)

Everything else is services, credentials, and configuration — no new libraries on the app side.

---

## Secrets and Credentials Inventory

A complete list of what must be set up before the first beta build:

### One-Time Local Setup
- [ ] Generate Tauri updater keypair: `npm run tauri -- signer generate -w ~/.tauri/ai-buddy.key`
- [ ] Export `ai-buddy.key.pub` content → paste into `tauri.conf.json` `plugins.updater.pubkey`
- [ ] Add `~/.tauri/ai-buddy.key` to `.gitignore`

### Apple (macOS)
- [ ] Apple Developer Program enrollment ($99/year)
- [ ] Create Developer ID Application certificate in Apple Developer portal
- [ ] Export `.p12` with password
- [ ] Create App Store Connect API key (issuer ID + key ID + `.p8` file)
- [ ] Create `src-tauri/entitlements.plist` with JIT entitlements

### Azure (Windows)
- [ ] Azure subscription (free tier works)
- [ ] Register `Microsoft.CodeSigning` resource provider
- [ ] Create Trusted Signing Account
- [ ] Create Certificate Profile (PublicTrustTest for beta)
- [ ] Create App Registration → get client ID, secret, tenant ID
- [ ] Assign "Trusted Signing Certificate Profile Signer" role to App Registration
- [ ] Install `trusted-signing-cli` locally for testing

### GitHub Actions Secrets (11 total)
Add to repository Settings → Secrets and variables → Actions:
`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `KEYCHAIN_PASSWORD`, `APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_KEY_PATH`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`

### Cloudflare
- [ ] Run `npx wrangler kv namespace create AI_BUDDY_BETA`
- [ ] Paste namespace ID into `wrangler.toml`
- [ ] Deploy Worker: `npx wrangler deploy`

---

## What NOT to Add for v3.0

| Avoided Addition | Why |
|-----------------|-----|
| Sparkle (macOS native updater framework) | Tauri's built-in updater plugin replaces Sparkle entirely. Adding Sparkle would create conflicts. |
| Electron-builder / NSIS custom scripts | Not applicable — Tauri uses WiX Toolset and NSIS for Windows MSI/EXE natively. No additional installer tooling needed. |
| `CrabNebula Cloud` | Managed Tauri distribution service. Valid option but adds vendor dependency and cost. GitHub Releases is sufficient for a small closed beta. Revisit for v4.0 scale. |
| macOS App Store distribution | Requires App Store certificate (not Developer ID). Different certificate type, sandboxing requirements, App Review. Out of scope for closed beta. |
| Microsoft Store distribution | Requires MSIX packaging, Store review. Out of scope for closed beta. |
| Durable Objects for rate limiting | Stronger consistency than KV but more expensive and complex. Daily rate limits do not require Durable Object coordination. |
| Code signing via 3rd-party CA (DigiCert, Sectigo) | Traditional EV certs now have 458-day max validity and require hardware tokens — incompatible with CI/CD. Microsoft Trusted Signing is the current best path. |
| Custom update server | Static JSON on GitHub Releases is sufficient. A custom server adds operational overhead with no v3.0 benefit. |

---

## Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Cloudflare KV setup | HIGH | First-party Cloudflare primitive. Wrangler commands are stable and documented. |
| Tauri updater plugin | HIGH | Official plugin, stable in v2.x. Key generation and config are fully documented at v2.tauri.app. |
| macOS signing + notarization | HIGH | Official Tauri docs at v2.tauri.app/distribute/sign/macos/ are current. JIT entitlements requirement confirmed across multiple 2026 community reports. |
| Windows Trusted Signing | MEDIUM | Service is well-documented and Tauri community has working examples. Renamed to "Artifact Signing" in Jan 2026 — older guides use "Azure Trusted Signing" but the technical setup is the same. First-time Azure setup has several steps requiring careful sequencing. |
| GitHub Actions CI workflow | HIGH | tauri-apps/tauri-action@v0 is the official action. Workflow structure taken directly from official Tauri v2 pipeline docs. |
| Beta distribution via GitHub Releases | HIGH | Established pattern. Direct asset URL sharing confirmed as viable for URL-gated closed beta. |

---

## Sources

- Tauri updater plugin: https://v2.tauri.app/plugin/updater/
- Tauri GitHub CI pipeline: https://v2.tauri.app/distribute/pipelines/github/
- Tauri macOS signing: https://v2.tauri.app/distribute/sign/macos/
- Tauri Windows signing: https://v2.tauri.app/distribute/sign/windows/
- tauri-apps/tauri-action GitHub: https://github.com/tauri-apps/tauri-action
- Cloudflare KV namespaces: https://developers.cloudflare.com/kv/concepts/kv-namespaces/
- Cloudflare KV bindings: https://developers.cloudflare.com/kv/concepts/kv-bindings/
- Cloudflare KV get started: https://developers.cloudflare.com/kv/get-started/
- Wrangler configuration: https://developers.cloudflare.com/workers/wrangler/configuration/
- Microsoft Trusted Signing (Artifact Signing): https://techcommunity.microsoft.com/blog/microsoft-security-blog/simplifying-code-signing-for-windows-apps-artifact-signing-ga/4482789
- Microsoft Trusted Signing GitHub Action: https://github.com/marketplace/actions/trusted-signing
- Azure Trusted Signing in GitHub Actions: https://www.hendrik-erz.de/post/code-signing-with-azure-trusted-signing-on-github-actions
- Apple Developer ID signing: https://developer.apple.com/developer-id/
- Apple notarization docs: https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution
- Ship Tauri v2 like a pro (Part 1 - signing): https://dev.to/tomtomdu73/ship-your-tauri-v2-app-like-a-pro-code-signing-for-macos-and-windows-part-12-3o9n
- Ship Tauri v2 like a pro (Part 2 - CI): https://dev.to/tomtomdu73/ship-your-tauri-v2-app-like-a-pro-github-actions-and-release-automation-part-22-2ef7
- Tauri production macOS shipping (notarization + Homebrew): https://dev.to/0xmassi/shipping-a-production-macos-app-with-tauri-20-code-signing-notarization-and-homebrew-mc3
- Tauri private GitHub Releases discussion: https://github.com/tauri-apps/tauri/discussions/7553
- Tauri updater + GitHub releases automation: https://github.com/tauri-apps/tauri/discussions/10206
- SSL.com EV vs OV cert guide: https://www.ssl.com/faqs/which-code-signing-certificate-do-i-need-ev-ov/
- Tauri Azure Trusted Signing feature request: https://github.com/tauri-apps/tauri/issues/9578
