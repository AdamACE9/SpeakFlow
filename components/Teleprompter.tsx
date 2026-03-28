"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSlidesStore } from "@/store/slidesStore";
import { createSpeechEngine, SpeechEngine } from "@/lib/speechEngine";
import { findPosition } from "@/lib/wordMatcher";
import { MicPill, MicStatus } from "@/components/MicPill";

type CountdownState = 3 | 2 | 1 | null;

export function Teleprompter() {
  const router = useRouter();
  const { slides, currentSlide, setCurrentSlide } = useSlidesStore();

  const [wordIdx, setWordIdx] = useState(0);
  const [micStatus, setMicStatus] = useState<MicStatus>("idle");
  const [countdown, setCountdown] = useState<CountdownState>(null);
  const [interimText, setInterimText] = useState("");

  const engineRef = useRef<SpeechEngine | null>(null);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stable refs — avoid stale closures inside engine callbacks
  const wordIdxRef = useRef(0);
  const currentSlideRef = useRef(currentSlide);
  const slidesRef = useRef(slides);
  wordIdxRef.current = wordIdx;
  currentSlideRef.current = currentSlide;
  slidesRef.current = slides;

  // Guard: redirect to upload if no slides loaded
  useEffect(() => {
    if (slides.length === 0) router.replace("/");
  }, [slides, router]);

  // Init Deepgram engine once slides are available
  useEffect(() => {
    if (slides.length === 0) return;

    const engine = createSpeechEngine(
      ({ finalWords, interimText: interim }) => {
        setInterimText(interim);

        const slideText = slidesRef.current[currentSlideRef.current];
        if (!slideText) return;
        const slideWords = slideText.split(/\s+/).filter(Boolean);

        // Combine committed final words + live interim words for real-time tracking.
        // This makes the highlight move word-by-word AS you speak (not after).
        const interimWords = interim.trim().split(/\s+/).filter(Boolean);
        const allWords = [...finalWords, ...interimWords];
        if (allWords.length === 0) return;

        // Tighter look-ahead on interim-only to prevent false positives
        const lookAhead = finalWords.length > 0 ? 60 : 15;
        const newIdx = findPosition(slideWords, allWords, wordIdxRef.current, lookAhead);
        if (newIdx > wordIdxRef.current) setWordIdx(newIdx);
      },
      (err) => {
        if (err === "not-supported") setMicStatus("not-supported");
        else if (err === "no-key") setMicStatus("no-key");
        else setMicStatus("error");
      },
      (status) => {
        // Map engine status → MicStatus
        if (status === "connecting") setMicStatus("connecting");
        else if (status === "listening") setMicStatus("listening");
        else if (status === "reconnecting") setMicStatus("reconnecting");
        else setMicStatus("idle");
      }
    );

    engineRef.current = engine;
    engine?.start();

    return () => {
      engine?.stop();
      engineRef.current = null;
    };
  }, [slides.length]);

  // Auto-scroll current word into view
  useEffect(() => {
    wordRefs.current[wordIdx]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [wordIdx]);

  // Auto-advance at 87% completion
  useEffect(() => {
    const slideText = slides[currentSlide];
    if (!slideText) return;
    const slideWords = slideText.split(/\s+/).filter(Boolean);
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
            const next = currentSlideRef.current + 1;
            setCurrentSlide(next);
            setWordIdx(0);
            engineRef.current?.resetBuffer();
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

  const goToSlide = useCallback(
    (index: number) => {
      if (index < 0 || index >= slides.length) return;
      cancelCountdown();
      setCurrentSlide(index);
      setWordIdx(0);
      setInterimText("");
      engineRef.current?.resetBuffer();
    },
    [slides.length, cancelCountdown, setCurrentSlide]
  );

  if (slides.length === 0) return null;

  const slideText = slides[currentSlide] ?? "";
  const slideWords = slideText.split(/\s+/).filter(Boolean);
  const totalWords = slideWords.length;
  const progress = totalWords > 0 ? Math.min(wordIdx / totalWords, 1) : 0;

  const isError = micStatus === "error" || micStatus === "not-supported" || micStatus === "no-key";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh", // dvh for mobile: accounts for browser chrome
        overflow: "hidden",
        background: "var(--bg)",
      }}
    >
      {/* ── Header ── */}
      <header
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          gap: "8px",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "13px",
            fontWeight: 600,
            color: "var(--text-mid)",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          Slide {currentSlide + 1}
          <span style={{ color: "var(--text-dim)" }}> / {slides.length}</span>
        </span>
        <MicPill status={micStatus} />
      </header>

      {/* ── Progress bar ── */}
      <div
        style={{
          flexShrink: 0,
          height: "3px",
          background: "var(--surface2)",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "0 auto 0 0",
            width: `${progress * 100}%`,
            background: "var(--accent)",
            transition: "width 0.35s ease",
          }}
        />
      </div>

      {/* ── No API key banner ── */}
      {micStatus === "no-key" && (
        <div
          style={{
            flexShrink: 0,
            padding: "10px 16px",
            background: "rgba(232,84,84,0.12)",
            borderBottom: "1px solid var(--red)",
            color: "var(--red)",
            fontFamily: "var(--font-sans)",
            fontSize: "13px",
            textAlign: "center",
          }}
        >
          ⚠ DEEPGRAM_API_KEY is not set. Add it to your Vercel environment variables and redeploy.
          Manual Prev / Next navigation still works.
        </div>
      )}

      {/* ── Notes area ── */}
      <main
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "32px 20px 20px",
          maxWidth: "820px",
          margin: "0 auto",
          width: "100%",
          WebkitOverflowScrolling: "touch", // smooth momentum scrolling on iOS
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "clamp(18px, 3.8vw, 26px)",
            lineHeight: 2.1,
            margin: 0,
            wordBreak: "break-word",
          }}
        >
          {slideWords.map((word, i) => {
            const isSpoken = i < wordIdx;
            const isCurrent = i === wordIdx;
            return (
              <span
                key={`${currentSlide}-${i}`}
                ref={(el) => { wordRefs.current[i] = el; }}
                onClick={() => setWordIdx(i)}
                style={{
                  color: isSpoken
                    ? "var(--text-dim)"
                    : isCurrent
                    ? "var(--accent)"
                    : "var(--text)",
                  background: isCurrent ? "var(--accent-glow)" : "transparent",
                  borderRadius: "4px",
                  padding: isCurrent ? "1px 4px" : "0",
                  transition: "color 0.1s ease, background 0.1s ease",
                  display: "inline",
                  cursor: "pointer",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                {word}
                {i < slideWords.length - 1 ? " " : ""}
              </span>
            );
          })}
        </p>

        {/* Live interim preview — shows what Deepgram is currently hearing */}
        {interimText && (
          <p
            style={{
              marginTop: "20px",
              padding: "8px 14px",
              background: "var(--surface2)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              color: "var(--text-dim)",
              fontFamily: "var(--font-sans)",
              fontSize: "12px",
              fontStyle: "italic",
              opacity: 0.8,
              margin: "20px 0 0",
            }}
          >
            🎙 {interimText}
          </p>
        )}
      </main>

      {/* ── Footer ── */}
      <footer
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
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
            color: countdown !== null
              ? "var(--accent)"
              : isError
              ? "var(--red)"
              : "var(--text-dim)",
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
            : micStatus === "connecting"
            ? "Connecting to Deepgram…"
            : micStatus === "reconnecting"
            ? "Reconnecting…"
            : micStatus === "error"
            ? "Mic denied — use Prev / Next"
            : micStatus === "no-key"
            ? "Add API key to Vercel"
            : micStatus === "not-supported"
            ? "Voice unavailable — use buttons"
            : "Starting…"}
        </span>

        {/* Nav buttons — larger tap targets on mobile */}
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
        minWidth: "72px",
        padding: "10px 18px",
        borderRadius: "8px",
        border: "1px solid var(--border)",
        background: disabled ? "transparent" : "var(--surface2)",
        color: disabled ? "var(--text-dim)" : "var(--text)",
        fontFamily: "var(--font-sans)",
        fontSize: "14px",
        fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "background 0.12s, opacity 0.12s",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
      }}
    >
      {label}
    </button>
  );
}
