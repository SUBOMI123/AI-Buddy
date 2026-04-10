export function LoadingDots() {
  return (
    <div
      style={{
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        gap: "var(--space-xs)",
        flex: "1",
      }}
    >
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>
      <span
        style={{
          width: "8px",
          height: "8px",
          "border-radius": "50%",
          "background-color": "var(--color-text-secondary)",
          animation: "pulse 1.2s ease-in-out infinite",
          "animation-delay": "0ms",
        }}
      />
      <span
        style={{
          width: "8px",
          height: "8px",
          "border-radius": "50%",
          "background-color": "var(--color-text-secondary)",
          animation: "pulse 1.2s ease-in-out infinite",
          "animation-delay": "200ms",
        }}
      />
      <span
        style={{
          width: "8px",
          height: "8px",
          "border-radius": "50%",
          "background-color": "var(--color-text-secondary)",
          animation: "pulse 1.2s ease-in-out infinite",
          "animation-delay": "400ms",
        }}
      />
    </div>
  );
}
