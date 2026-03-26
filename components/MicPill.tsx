"use client";

export type MicStatus = "idle" | "listening" | "error" | "not-supported";

interface MicPillProps {
  status: MicStatus;
}

const statusConfig: Record<
  MicStatus,
  { label: string; dotColor: string; pulse: boolean }
> = {
  idle: { label: "Mic idle", dotColor: "var(--text-dim)", pulse: false },
  listening: { label: "Listening", dotColor: "var(--green)", pulse: true },
  error: { label: "Mic denied", dotColor: "var(--red)", pulse: false },
  "not-supported": {
    label: "Mic unsupported",
    dotColor: "var(--red)",
    pulse: false,
  },
};

export function MicPill({ status }: MicPillProps) {
  const { label, dotColor, pulse } = statusConfig[status];

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "4px 10px",
        background: "var(--surface2)",
        border: "1px solid var(--border)",
        borderRadius: "9999px",
        fontSize: "12px",
        fontFamily: "var(--font-sans)",
        color: "var(--text-mid)",
        userSelect: "none",
      }}
    >
      <span
        style={{
          width: "7px",
          height: "7px",
          borderRadius: "50%",
          background: dotColor,
          display: "inline-block",
          flexShrink: 0,
          animation: pulse ? "speakflow-pulse 1.4s ease-in-out infinite" : "none",
        }}
      />
      <style>{`
        @keyframes speakflow-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
      {label}
    </div>
  );
}
