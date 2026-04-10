---
status: awaiting_human_verify
trigger: "After drawing a crop region and releasing the mouse, the overlay closes correctly but no thumbnail appears in the sidebar."
created: 2026-04-10T00:00:00Z
updated: 2026-04-10T00:00:00Z
---

## Current Focus

hypothesis: RegionSelect.tsx multiplies logical CSS coords by scaleFactor() before sending to cmd_confirm_region, producing physical pixel coords. xcap's capture_region + bounds check uses CGDisplayBounds (logical points). Physical pixel coords exceed logical monitor dimensions → bounds check fails → error returned → catch sets thumbnailB64(null) silently.
test: Remove scaleFactor multiplication from RegionSelect.tsx — send raw logical coords
expecting: captureRegion(coords) succeeds, thumbnailB64 is set, thumbnail renders in sidebar
next_action: Edit RegionSelect.tsx to remove scaleFactor() call and send logical coords

## Symptoms

expected: After releasing mouse, overlay closes → sidebar shows thumbnail image + W×H dimensions above input field
actual: Overlay closes correctly, but sidebar shows no thumbnail. No visible errors.
errors: None visible to user — captureRegion throws silently, caught by try/catch, sets thumbnailB64(null)
reproduction: Open AI Buddy → click Crop button → draw rectangle → release → overlay closes → sidebar has no thumbnail
started: New feature (phase 04), never worked

## Eliminated

- hypothesis: Cross-window event not received (emitTo bug)
  evidence: overlay closes correctly, meaning cmd_confirm_region is called AND region-selected fires AND SidebarShell receives it (setSelectedRegion is called)
  timestamp: 2026-04-10

- hypothesis: onRegionSelected listener not registered
  evidence: Same as above — overlay closes, so the listener is firing

- hypothesis: TypeScript RegionCoords field name mismatch with Rust payload
  evidence: Rust serializes {x, y, width, height} snake_case; TS expects {x, y, width, height} — they match exactly

## Evidence

- timestamp: 2026-04-10
  checked: xcap 0.9.4 src/macos/impl_monitor.rs — width(), height(), capture_region()
  found: width()/height() use CGDisplayBounds which returns LOGICAL POINT dimensions. capture_region() bounds check: x + width > monitor_width uses those logical dims. The CGRect passed to CGWindowListCreateImage is in logical points.
  implication: xcap capture_region() expects logical point coordinates, not physical pixels.

- timestamp: 2026-04-10
  checked: RegionSelect.tsx confirmRegion() — scaleFactor multiplication
  found: const factor = await getCurrentWindow().scaleFactor(); coords multiplied by factor before invoke("cmd_confirm_region", {x, y, width, height})
  implication: On Retina (scale=2), a 400×300 logical region becomes 800×600 physical. xcap receives 800×600 vs monitor logical width ~1440 — bounds check passes OR fails depending on position. But the CGRect is in logical coords so xcap interprets them correctly only if they ARE logical. Physical coords passed as logical → captured region is wrong position/size, OR the bounds check in our Rust code rejects it.

- timestamp: 2026-04-10
  checked: screenshot.rs capture_region Rust command — bounds validation
  found: validates (x as u32) + width > mon_width using monitor.width() (logical). Physical pixel coords (up to 2x larger) will trigger this validation → returns Err() → SidebarShell catch block → setThumbnailB64(null)
  implication: This is the exact failure path. Error is swallowed silently. thumbnailB64 stays null. Show condition fails. No thumbnail.

- timestamp: 2026-04-10
  checked: RegionSelect.tsx comment line 5
  found: "// RegionCoords uses physical pixel coordinates — xcap expects physical pixels (D-09)"
  implication: The comment is incorrect — xcap uses logical points. This incorrect assumption drove the scaleFactor multiplication bug.

## Resolution

root_cause: RegionSelect.tsx multiplies CSS logical coords by scaleFactor() before invoking cmd_confirm_region, producing physical pixel coordinates. xcap's capture_region() uses CGDisplayBounds-based logical point dimensions for bounds checking and for the CGRect passed to CGWindowListCreateImage. The bounds check in screenshot.rs (using monitor.width() which is also CGDisplayBounds logical) rejects the oversized physical-pixel coords with an error. SidebarShell's catch block swallows this error and sets thumbnailB64(null). The Show condition requires both selectedRegion and thumbnailB64 non-null, so nothing renders.

fix: Remove scaleFactor() multiplication in RegionSelect.tsx. Send raw logical CSS coordinates directly. Update RegionCoords comment to reflect logical points. The Rust cmd_confirm_region and screenshot.rs capture_region need no changes — xcap already works in logical points.

verification: awaiting human confirmation
files_changed: [src/components/RegionSelect.tsx]
