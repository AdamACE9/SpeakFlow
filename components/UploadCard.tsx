"use client";

import { useRef, useState, DragEvent, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { parsePdf } from "@/lib/parsePdf";
import { useSlidesStore } from "@/store/slidesStore";

type UploadState = "idle" | "loading" | "error";

export function UploadCard() {
  const router = useRouter();
  const { setSlides, setCurrentSlide } = useSlidesStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf") || file.type !== "application/pdf") {
      setState("error");
      setErrorMsg("Please upload a PDF file.");
      return;
    }

    setState("loading");
    setErrorMsg("");

    try {
      const slides = await parsePdf(file);
      if (slides.length === 0) {
        setState("error");
        setErrorMsg(
          "No readable text found. Make sure the PDF has real text (not scanned images)."
        );
        return;
      }
      setCurrentSlide(0);
      setSlides(slides);
      router.push("/prompter");
    } catch {
      setState("error");
      setErrorMsg("Failed to parse PDF. Please try another file.");
    }
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset input so same file can be re-uploaded
    e.target.value = "";
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function onDragLeave() {
    setIsDragOver(false);
  }

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "480px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "32px",
      }}
    >
      {/* Logo / Title */}
      <div style={{ textAlign: "center" }}>
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "clamp(2rem, 6vw, 3.2rem)",
            fontWeight: 700,
            color: "var(--text)",
            letterSpacing: "-0.02em",
            margin: 0,
          }}
        >
          Speak<span style={{ color: "var(--accent)" }}>Flow</span>
        </h1>
        <p
          style={{
            marginTop: "8px",
            color: "var(--text-mid)",
            fontSize: "15px",
            fontFamily: "var(--font-sans)",
          }}
        >
          Voice-synced teleprompter for speakers
        </p>
      </div>

      {/* Drop Zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload PDF"
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        style={{
          width: "100%",
          padding: "48px 32px",
          background: isDragOver ? "var(--surface2)" : "var(--surface)",
          border: `2px dashed ${isDragOver ? "var(--accent)" : "var(--border)"}`,
          borderRadius: "16px",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "12px",
          transition: "border-color 0.15s, background 0.15s",
          outline: "none",
        }}
      >
        {state === "loading" ? (
          <>
            <Spinner />
            <p style={{ color: "var(--text-mid)", fontSize: "14px", margin: 0 }}>
              Parsing PDF…
            </p>
          </>
        ) : (
          <>
            <UploadIcon />
            <p
              style={{
                color: "var(--text)",
                fontSize: "16px",
                fontWeight: 500,
                margin: 0,
                textAlign: "center",
              }}
            >
              Drop your speaker notes PDF here
            </p>
            <p style={{ color: "var(--text-dim)", fontSize: "13px", margin: 0 }}>
              or tap to pick a file
            </p>
          </>
        )}
      </div>

      {/* Error message */}
      {state === "error" && (
        <p
          style={{
            color: "var(--red)",
            fontSize: "14px",
            textAlign: "center",
            margin: 0,
          }}
        >
          {errorMsg}
        </p>
      )}

      {/* Tip */}
      <p
        style={{
          color: "var(--text-dim)",
          fontSize: "12px",
          textAlign: "center",
          maxWidth: "320px",
          margin: 0,
          lineHeight: 1.6,
        }}
      >
        Export speaker notes as PDF from PowerPoint or Google Slides.
        One page per slide.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={onFileChange}
        style={{ display: "none" }}
        aria-hidden="true"
      />
    </div>
  );
}

function UploadIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--accent)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function Spinner() {
  return (
    <div
      style={{
        width: "36px",
        height: "36px",
        border: "3px solid var(--border)",
        borderTopColor: "var(--accent)",
        borderRadius: "50%",
        animation: "speakflow-spin 0.8s linear infinite",
      }}
    >
      <style>{`
        @keyframes speakflow-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
