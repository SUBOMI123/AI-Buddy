import { createSignal, Show, onMount, onCleanup } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emitTo } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

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

  const cancel = async () => {
    setDrag(null);
    await invoke("cmd_close_region_select").catch(() => {});
    await emitTo("overlay", "region-cancelled", {}).catch(() => {});
  };

  const confirmRegion = async () => {
    const r = logicalRect();
    if (!r || r.w < 10 || r.h < 10) {
      await cancel();
      return;
    }
    setDrag(null);
    try {
      const factor = await getCurrentWindow().scaleFactor();
      const coords: RegionCoords = {
        x: Math.round(r.x * factor),
        y: Math.round(r.y * factor),
        width: Math.round(r.w * factor),
        height: Math.round(r.h * factor),
      };
      // emitTo("overlay") required in Tauri v2 — plain emit() only reaches Rust listeners
      await invoke("cmd_close_region_select").catch(() => {});
      await emitTo("overlay", "region-selected", coords);
    } catch (err) {
      console.error("RegionSelect: confirmRegion failed", err);
      await cancel();
    }
  };

  onMount(() => {
    containerRef?.focus();

    // Bind to document so events are captured even if cursor leaves the WebView boundary
    // (on macOS transparent windows, div-level onMouseUp misses releases at screen edges)
    const handleMouseDown = (e: MouseEvent) => {
      setDrag({
        startX: e.clientX,
        startY: e.clientY,
        endX: e.clientX,
        endY: e.clientY,
        dragging: true,
      });
    };

    const handleMouseMove = (e: MouseEvent) => {
      const d = drag();
      if (d?.dragging) {
        setDrag({ ...d, endX: e.clientX, endY: e.clientY });
      }
    };

    const handleMouseUp = () => {
      if (!drag()) return;
      confirmRegion();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("keydown", handleKeyDown);

    onCleanup(() => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("keydown", handleKeyDown);
    });
  });

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
