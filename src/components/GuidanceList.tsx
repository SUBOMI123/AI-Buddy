import { Show } from "solid-js";

interface GuidanceListProps {
  streamingText: string;
}

export function GuidanceList(props: GuidanceListProps) {
  let containerRef: HTMLDivElement | undefined;

  // Auto-scroll to bottom as text grows
  const scrollToBottom = () => {
    if (containerRef) {
      const isNearBottom =
        containerRef.scrollHeight - containerRef.scrollTop - containerRef.clientHeight < 40;
      if (isNearBottom) {
        containerRef.scrollTop = containerRef.scrollHeight;
      }
    }
  };

  return (
    <div
      ref={(el) => { containerRef = el; }}
      style={{
        flex: "1",
        "overflow-y": "auto",
        padding: "0",
      }}
    >
      <Show when={props.streamingText}>
        <pre
          style={{
            "font-family": "inherit",
            "font-size": "var(--font-size-body)",
            "font-weight": "var(--font-weight-regular)",
            "line-height": "var(--line-height-body)",
            color: "var(--color-text-primary)",
            "white-space": "pre-wrap",
            "word-wrap": "break-word",
            margin: "0",
          }}
        >
          {(() => { scrollToBottom(); return props.streamingText; })()}
        </pre>
      </Show>
    </div>
  );
}
