"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSlidesStore } from "@/store/slidesStore";
import { createSpeechEngine } from "@/lib/speechEngine";
import { findPosition } from "@/lib/wordMatcher";
import { MicPill, MicStatus } from "@/components/MicPill";

type CountdownState = 3 | 2 | 1 | null;

interface SpeechRecognitionInstance {
  start: () => void;
  stop: () => void;
  abort: () => void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: unknown;
  onerror: unknown;
  onend: unknown;
  onstart: unknown;
}

export function Teleprompter() {
  const router = useRouter();
  const { slides, currentSlide, setCurrentSlide } = useSlidesStore();

  const [wordIdx, setWordIdx] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [micStatus, setMicStatus] = useState<MicStatus>("idle");
  const [countdown, setCountdown] = useState<CountdownState>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptRef = useRef("");
  const wordIdxRef = useRef(0);

  // Keep refs in sync with state
  transcriptRef.current = transcript;
  wordIdxRef.current = wordIdx;

  // Guard: redirect to upload if no slides loaded
  useEffect(() => {
    if (slides.length === 0) {
      router.replace("/");
    }
  }, [slides, router]);

  // Init speech engine
  useEffect(() => {
    if (slides.length === 0) return;

    const rec = createSpeechEngine(
      (t) => setTranscript(t),
      (err) => {
        if (err === "not-allowed") setMicStatus("error");
        else if (err === "not-supported") setMicStatus("not-supported");
        else setMicStatus("error");
      },
      (status) => setMicStatus(status)
    );

    recognitionRef.current = rec;
    if (rec) {
      try {
        rec.start();
      } catch {
        // Already started
      }
    }

    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, [slides.length]);

  // Update word position when transcript changes
  useEffect(() => {
    if (!slides[currentSlide]) return;
    const slideWords = slides[currentSlide].split(/\s+/).filter(Boolean);
    const newIdx = findPosition(slideWords, transcript, wordIdxRef.current);
    if (newIdx > wordIdxRef.current) {
      setWordIdx(newIdx);
    }
  }, [transcript, currentSlide, slides]);

  // Auto-scroll current word into view
  useEffect(() => {
    const el = wordRefs.current[wordIdx];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [wordIdx]);

  // Auto-advance at 87% completion
  useEffect(() => {
    if (!slides[currentSlide]) return;
    const slideWords = slides[currentSlide].split(/\s+/).filter(Boolean);
    const progress = slideWords.length > 0 ? wordIdx / slideWords.length : 0;

    if (
      progress >= 0.87 &&
      countdown === null &&
      currentSlide < slides.length - 1
    ) {
      setCountdown(3);
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null) return null;
          if (prev === 1) {
            clearInterval(countdownRef.current!);
            countdownRef.current = null;
            // Advance slide
            setCurrentSlide(currentSlide + 1);
            setWordIdx(0);
            setTranscript("");
            return null;
          }
          return (prev - 1) as CountdownState;
        });
      }, 1000);
    }
  }, [wordIdx, currentSlide, slides, countdown, setCurrentSlide]);

  const cancelCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(null);
  }, []);

  const restartRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      rec.abort();
    } catch {
      // ignore
    }
    setTimeout(() => {
      try {
        rec.start();
      } catch {
        // ignore
      }
    }, 300);
  }, []);

  const goToSlide = useCallback(
    (index: number) => {
      if (index < 0 || index >= slides.length) return;
      cancelCountdown();
      setCurrentSlide(index);
      setWordIdx(0);
      setTranscript("");
      restartRecognition();
    },
    [slides.length, cancelCountdown, setCurrentSlide, restartRecognition]
  );

  if (slides.length === 0) return null;

  const slideWords = slides[currentSlide]?.split(/\s+/).filter(Boolean) ?? [];
  const totalWords = slideWords.length;
  const progress = totalWords > 0 ? Math.min(wordIdx / totalWords, 1) : 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
        background: "var(--bg)",
      }}
    >
      {/* Header */}
      <header
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 20px",
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "13px",
            fontWeight: 600,
            color: "var(--text-mid)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          Slide {currentSlide + 1}{" "}
          <span style={{ color: "var(--text-dim)" }}>/ {slides.length}</span>
        </span>
        <MicPill status={micStatus} />
      </header>

      {/* Progress bar */}
      <div
        style={{
          flexShrink: 0,
          height: "3px",
          background: "var(--surface2)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${progress * 100}%`,
            background: "var(--accent)",
            transition: "width 0.3s ease",
          }}
        />
      </div>

      {/* Notes area */}
      <main
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "40px 24px",
          maxWidth: "800px",
          margin: "0 auto",
          width: "100%",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "clamp(18px, 3.8vw, 26px)",
            lineHeight: 2.0,
            color: "var(--text)",
            margin: 0,
            wordBreak: "break-word",
          }}
        >
          {slideWords.map((word, i) => {
            let color: string;
            let bg: string;

            if (i < wordIdx) {
              // Spoken
              color = "var(--text-dim)";
              bg = "transparent";
            } else if (i === wordIdx) {
              // Current
              color = "var(--accent)";
              bg = "var(--accent-glow)";
            } else {
              // Upcoming
              color = "var(--text)";
              bg = "transparent";
            }

            return (
              <span
                key={`${currentSlide}-${i}`}
                ref={(el) => {
                  wordRefs.current[i] = el;
                }}
                style={{
                  color,
                  background: bg,
                  borderRadius: "4px",
                  padding: i === wordIdx ? "1px 3px" : "0",
                  transition: "color 0.15s, background 0.15s",
                  display: "inline",
                }}
              >
                {word}
                {i < slideWords.length - 1 ? " " : ""}
              </span>
            );
          })}
        </p>
      </main>

      {/* Footer */}
      <footer
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 20px",
          background: "var(--surface)",
          borderTop: "1px solid var(--border)",
          gap: "12px",
        }}
      >
        {/* Status text */}
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "13px",
            color: countdown !== null ? "var(--accent)" : "var(--text-dim)",
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {countdown !== null
            ? `Advancing in ${countdown}…`
            : micStatus === "listening"
            ? "Listening…"
            : micStatus === "error"
            ? "Mic access denied — use buttons below"
            : micStatus === "not-supported"
            ? "Voice tracking unavailable — use buttons"
            : "Waiting for mic…"}
        </span>

        {/* Nav buttons */}
        <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
          <NavButton
            onClick={() => goToSlide(currentSlide - 1)}
            disabled={currentSlide === 0}
            label="← Prev"
          />
          <NavButton
            onClick={() => goToSlide(currentSlide + 1)}
            disabled={currentSlide === slides.length - 1}
            label="Next →"
          />
        </div>
      </footer>
    </div>
  );
}

function NavButton({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "8px 16px",
        borderRadius: "8px",
        border: "1px solid var(--border)",
        background: disabled ? "transparent" : "var(--surface2)",
        color: disabled ? "var(--text-dim)" : "var(--text)",
        fontFamily: "var(--font-sans)",
        fontSize: "13px",
        fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 0.15s, color 0.15s",
        opacity: disabled ? 0.4 : 1,
        userSelect: "none",
      }}
    >
      {label}
    </button>
  );
}
