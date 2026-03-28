"use client";

export type MicStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "reconnecting"
  | "error"
  | "no-key"
  | "not-supported";

interface MicPillProps {
  status: MicStatus;
}

const statusConfig: Record<
  MicStatus,
  { label: string; dotColor: string; pulse: boolean; spin?: boolean }
> = {
  idle:          { label: "Mic idle",        dotColor: "var(--text-dim)", pulse: false },
  connecting:    { label: "Connecting…",     dotColor: "var(--accent)",   pulse: true  },
  listening:     { label: "Listening",       dotColor: "var(--green)",    pulse: true  },
  reconnecting:  { label: "Reconnecting…",  dotColor: "var(--accent)",   pulse: true  },
  error:         { label: "Mic denied",      dotColor: "var(--red)",      pulse: false },
  "no-key":      { label: "No API key",      dotColor: "var(--red)",      pulse: false },
  "not-supported": { label: "Unsupported",   dotColor: "var(--red)",      pulse: false },
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
        whiteSpace: "nowrap",
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
          animation: pulse ? "sf-pulse 1.4s ease-in-out infinite" : "none",
        }}
      />
      <style>{`
        @keyframes sf-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }
      `}</style>
      {label}
    </div>
  );
}
