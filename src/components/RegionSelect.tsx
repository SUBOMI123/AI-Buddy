import { createSignal, Show, onMount, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

// RegionCoords uses logical point coordinates — xcap's capture_region uses CGDisplayBounds
// (logical points) for bounds checking and CGWindowListCreateImage (logical CGRect).
// Do NOT multiply by scaleFactor — xcap handles physical pixel mapping internally. (D-09)
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
    // Rust hides the window and emits region-cancelled to all windows atomically
    await invoke("cmd_cancel_region").catch((err) => console.error("cmd_cancel_region failed", err));
  };

  const confirmRegion = async () => {
    const r = logicalRect();
    if (!r || r.w < 10 || r.h < 10) {
      await cancel();
      return;
    }
    setDrag(null);
    try {
      // Send logical point coordinates — xcap uses CGDisplayBounds (logical points) for
      // bounds validation and CGWindowListCreateImage (logical CGRect) for capture.
      // Multiplying by scaleFactor here would send physical pixels, which exceed the
      // logical monitor dimensions and trigger xcap's bounds check error. (D-09)
      await invoke("cmd_confirm_region", {
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.round(r.w),
        height: Math.round(r.h),
      });
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
      {/* Instruction pill — centered, below macOS menu bar, hidden during drag */}
      <Show when={!drag()}>
        <div
          style={{
            position: "absolute",
            top: "56px", // clears macOS menu bar (~25px) with breathing room
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0, 0, 0, 0.72)",
            "backdrop-filter": "blur(8px)",
            "-webkit-backdrop-filter": "blur(8px)",
            color: "rgba(255, 255, 255, 0.95)",
            "font-size": "13px",
            "font-weight": "500",
            "letter-spacing": "0.01em",
            padding: "8px 16px",
            "border-radius": "20px",
            "white-space": "nowrap",
            "pointer-events": "none",
          }}
        >
          Drag to select a region&nbsp;&nbsp;·&nbsp;&nbsp;Esc to cancel
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
