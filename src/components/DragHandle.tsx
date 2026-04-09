import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

export function DragHandle() {
  const handleMouseDown = async (e: MouseEvent) => {
    e.preventDefault();
    await getCurrentWebviewWindow().startDragging();
  };

  return (
    <div
      class="drag-handle"
      onMouseDown={handleMouseDown}
      style={{
        height: "8px",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        cursor: "grab",
        "flex-shrink": "0",
        "user-select": "none",
        "-webkit-user-select": "none",
      }}
    >
      <div
        style={{
          display: "flex",
          "flex-direction": "column",
          gap: "2px",
          "align-items": "center",
        }}
      >
        <div
          style={{
            width: "24px",
            height: "2px",
            "background-color": "var(--color-text-secondary)",
            opacity: "0.5",
            "border-radius": "1px",
          }}
        />
        <div
          style={{
            width: "24px",
            height: "2px",
            "background-color": "var(--color-text-secondary)",
            opacity: "0.5",
            "border-radius": "1px",
          }}
        />
        <div
          style={{
            width: "24px",
            height: "2px",
            "background-color": "var(--color-text-secondary)",
            opacity: "0.5",
            "border-radius": "1px",
          }}
        />
      </div>
    </div>
  );
}
