import { createSignal, Show, onMount } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit } from "@tauri-apps/api/event";

// RegionCoords uses physical pixel coordinates — xcap expects physical pixels (D-09)
export interface RegionCoords {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DragState {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  dragging: boolean;
}

export function RegionSelect() {
  const [drag, setDrag] = createSignal<DragState | null>(null);
  let containerRef: HTMLDivElement | undefined;

  // Pitfall 4: focus root div on mount so Escape key is captured
  onMount(() => {
    containerRef?.focus();
  });

  // Derived rect in logical pixels (for CSS positioning during draw)
  const logicalRect = () => {
    const d = drag();
    if (!d) return null;
    return {
      x: Math.min(d.startX, d.endX),
      y: Math.min(d.startY, d.endY),
      w: Math.abs(d.endX - d.startX),
      h: Math.abs(d.endY - d.startY),
    };
  };

  const onMouseDown = (e: MouseEvent) => {
    setDrag({
      startX: e.clientX,
      startY: e.clientY,
      endX: e.clientX,
      endY: e.clientY,
      dragging: true,
    });
  };

  const onMouseMove = (e: MouseEvent) => {
    const d = drag();
    if (d?.dragging) {
      setDrag({ ...d, endX: e.clientX, endY: e.clientY });
    }
  };

  const cancel = async () => {
    setDrag(null);
    await emit("region-cancelled", {});
  };

  const onMouseUp = async () => {
    const d = drag();
    if (!d) return;
    const r = logicalRect();
    if (!r || r.w < 10 || r.h < 10) {
      // Pitfall 6: too small — treat as cancel (D-10)
      await cancel();
      return;
    }
    setDrag(null);

    // D-09: Convert logical px → physical px before emitting
    // Pattern 3: scaleFactor() from Tauri DPI API
    const factor = await getCurrentWindow().scaleFactor();
    const coords: RegionCoords = {
      x: Math.round(r.x * factor),
      y: Math.round(r.y * factor),
      width: Math.round(r.w * factor),
      height: Math.round(r.h * factor),
    };
    // Pattern 7: global emit — SidebarShell listens with listen("region-selected")
    await emit("region-selected", coords);
  };

  const onKeyDown = async (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      // D-10: Esc cancels, emits region-cancelled so SidebarShell restores
      await cancel();
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      style={{
        position: "fixed",
        inset: "0",
        cursor: "crosshair",
        // UI-SPEC: rgba(0,0,0,0.35) scrim — intentionally not a CSS var (overlay-only)
        background: "rgba(0, 0, 0, 0.35)",
        "user-select": "none",
        outline: "none",
      }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onKeyDown={onKeyDown}
    >
      {/* Instruction text — hidden during drag (UI-SPEC) */}
      <Show when={!drag()}>
        <div
          style={{
            position: "absolute",
            top: "0",
            left: "0",
            right: "0",
            "text-align": "center",
            "padding-top": "var(--space-lg)",
            color: "rgba(255, 255, 255, 0.75)",
            "font-size": "var(--font-size-body)",
            "font-weight": "var(--font-weight-regular)",
            "pointer-events": "none",
          }}
        >
          Drag to select a region&nbsp; •&nbsp; Esc to cancel
        </div>
      </Show>

      {/* Rubber-band selection rectangle (UI-SPEC: 2px accent border, 0.12 tint fill) */}
      <Show when={logicalRect()}>
        {(r) => (
          <div
            style={{
              position: "absolute",
              left: `${r().x}px`,
              top: `${r().y}px`,
              width: `${r().w}px`,
              height: `${r().h}px`,
              border: "2px solid #007AFF",
              background: "rgba(0, 122, 255, 0.12)",
              "box-sizing": "border-box",
              "border-radius": "0",
              "pointer-events": "none",
            }}
          />
        )}
      </Show>
    </div>
  );
}
