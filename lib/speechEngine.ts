/**
 * Deepgram-powered speech engine for SpeakFlow.
 *
 * Architecture:
 *  1. Browser fetches a 60s short-lived token from /api/deepgram-token
 *     (the real API key never leaves the server)
 *  2. A WebSocket opens to wss://api.deepgram.com/v1/listen with that token
 *  3. MediaRecorder captures mic audio (webm/opus on Chrome/Firefox, mp4 on iOS)
 *     and sends 250ms chunks to the WebSocket
 *  4. Deepgram streams back interim + final Results in real-time
 *  5. On WebSocket close (network blip, ~idle timeout), reconnect with
 *     exponential back-off, reusing the existing MediaStream
 *  6. A KeepAlive JSON message is sent every 8s so Deepgram doesn't close
 *     the socket during silence
 */

export type TranscriptCallback = (payload: {
  finalWords: string[];   // cumulative finalized words (rolling 40-word buffer)
  interimText: string;    // current partial phrase being processed
}) => void;

export type ErrorCallback = (
  error: "not-allowed" | "not-supported" | "no-key" | "unknown"
) => void;

export type StatusCallback = (
  status: "connecting" | "listening" | "reconnecting" | "idle"
) => void;

export interface SpeechEngine {
  start: () => void;
  stop: () => void;
  resetBuffer: () => void;
}

// ── Deepgram response types ──────────────────────────────────────────────────

interface DeepgramWord {
  word: string;
  punctuated_word: string;
  start: number;
  end: number;
  confidence: number;
}

interface DeepgramAlternative {
  transcript: string;
  confidence: number;
  words: DeepgramWord[];
}

interface DeepgramResult {
  type: string;
  is_final: boolean;
  speech_final: boolean;
  channel: { alternatives: DeepgramAlternative[] };
}

// ── WebSocket URL params ─────────────────────────────────────────────────────

const DG_PARAMS = new URLSearchParams({
  model: "nova-2",          // most accurate model for English speech
  language: "en-US",
  punctuate: "true",
  interim_results: "true",  // real-time word-by-word streaming
  smart_format: "true",     // formats numbers, dates, etc.
  endpointing: "300",       // ms silence → is_final = true
  utterance_end_ms: "1000", // extra signal after long pause
}).toString();

const KEEPALIVE_MS = 8_000;
const MAX_RECONNECT = 6;
const BASE_RECONNECT_MS = 800;

// ── Factory ──────────────────────────────────────────────────────────────────

export function createSpeechEngine(
  onTranscript: TranscriptCallback,
  onError: ErrorCallback,
  onStatusChange?: StatusCallback
): SpeechEngine | null {
  if (typeof window === "undefined") return null;

  // Check MediaRecorder support (not available in very old browsers)
  if (typeof MediaRecorder === "undefined") {
    onError("not-supported");
    return null;
  }

  let socket: WebSocket | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempts = 0;
  let shouldReconnect = false;
  let isConnecting = false;

  // Rolling buffer of finalized spoken words (capped at 40)
  let finalWords: string[] = [];

  // ── Audio helpers ──────────────────────────────────────────────────────────

  function getBestMimeType(): string {
    // Prefer webm/opus (Chrome, Firefox, Edge, Android)
    // Fall back to mp4 (iOS Safari 14.3+)
    // Fall back to plain webm
    for (const t of [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ]) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return "";
  }

  async function acquireMic(): Promise<MediaStream> {
    return navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  }

  // ── KeepAlive ──────────────────────────────────────────────────────────────

  function startKeepAlive(ws: WebSocket) {
    stopKeepAlive();
    keepAliveTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "KeepAlive" }));
      }
    }, KEEPALIVE_MS);
  }

  function stopKeepAlive() {
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }
  }

  // ── Core connect ───────────────────────────────────────────────────────────

  async function connect() {
    if (isConnecting || !shouldReconnect) return;
    isConnecting = true;

    onStatusChange?.(reconnectAttempts > 0 ? "reconnecting" : "connecting");

    try {
      // Acquire microphone (once — reuse stream on reconnects)
      if (!stream || stream.getTracks().every((t) => t.readyState === "ended")) {
        try {
          stream = await acquireMic();
        } catch {
          onError("not-allowed");
          shouldReconnect = false;
          isConnecting = false;
          onStatusChange?.("idle");
          return;
        }
      }

      // Fetch short-lived token from our server-side API route
      let token: string;
      try {
        const res = await fetch("/api/deepgram-token");
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (res.status === 500 && body?.error?.includes("not configured")) {
            onError("no-key");
            shouldReconnect = false;
            isConnecting = false;
            onStatusChange?.("idle");
            return;
          }
          throw new Error(`Token endpoint returned ${res.status}`);
        }
        ({ token } = await res.json());
      } catch (err) {
        console.error("[SpeakFlow] Token fetch failed:", err);
        scheduleReconnect();
        isConnecting = false;
        return;
      }

      // Open WebSocket — auth via subprotocol header (no API key in URL)
      const ws = new WebSocket(
        `wss://api.deepgram.com/v1/listen?${DG_PARAMS}`,
        ["token", token]
      );
      ws.binaryType = "arraybuffer";
      socket = ws;

      ws.onopen = () => {
        isConnecting = false;
        reconnectAttempts = 0;
        onStatusChange?.("listening");
        startKeepAlive(ws);

        // Start MediaRecorder after socket opens to avoid sending audio before ready
        const mimeType = getBestMimeType();
        const recorder = new MediaRecorder(stream!, {
          ...(mimeType ? { mimeType } : {}),
          audioBitsPerSecond: 16_000,
        });
        mediaRecorder = recorder;

        recorder.addEventListener("dataavailable", (e) => {
          if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            ws.send(e.data);
          }
        });

        recorder.start(250); // 250ms chunks — sweet spot for latency vs overhead
      };

      ws.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        try {
          const data: DeepgramResult = JSON.parse(event.data);
          if (data.type !== "Results") return;

          const alt = data.channel?.alternatives?.[0];
          if (!alt) return;

          const transcript = alt.transcript?.trim() ?? "";

          if (data.is_final) {
            // Commit words to the rolling buffer
            if (transcript) {
              const words = transcript.split(/\s+/).filter(Boolean);
              finalWords = [...finalWords, ...words].slice(-40);
            }
            onTranscript({ finalWords: [...finalWords], interimText: "" });
          } else {
            // Interim: fire real-time preview without committing
            onTranscript({
              finalWords: [...finalWords],
              interimText: transcript,
            });
          }
        } catch {
          // Ignore malformed JSON (Deepgram metadata messages, etc.)
        }
      };

      ws.onclose = (evt) => {
        isConnecting = false;
        stopKeepAlive();
        mediaRecorder?.stop();
        mediaRecorder = null;
        socket = null;

        if (!shouldReconnect) {
          onStatusChange?.("idle");
          return;
        }

        // 1008 = policy violation (bad/expired key) — don't retry
        if (evt.code === 1008) {
          console.error("[SpeakFlow] Deepgram policy violation (1008) — check API key");
          onError("unknown");
          onStatusChange?.("idle");
          return;
        }

        onStatusChange?.("reconnecting");
        scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose fires right after onerror, so just log here
        isConnecting = false;
        console.error("[SpeakFlow] WebSocket error");
      };
    } catch (err) {
      isConnecting = false;
      console.error("[SpeakFlow] connect() error:", err);
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (!shouldReconnect) return;
    if (reconnectAttempts >= MAX_RECONNECT) {
      console.error("[SpeakFlow] Max reconnect attempts reached");
      onError("unknown");
      onStatusChange?.("idle");
      return;
    }
    const delay = Math.min(
      BASE_RECONNECT_MS * Math.pow(2, reconnectAttempts),
      15_000
    );
    reconnectAttempts++;
    reconnectTimer = setTimeout(connect, delay);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    start() {
      if (shouldReconnect) return; // already running
      shouldReconnect = true;
      connect();
    },

    stop() {
      shouldReconnect = false;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      stopKeepAlive();

      // Ask Deepgram to flush + finalize pending transcript
      if (socket?.readyState === WebSocket.OPEN) {
        try { socket.send(JSON.stringify({ type: "CloseStream" })); } catch { /* ignore */ }
        // Hard-close after 500ms (gives Deepgram time to flush)
        setTimeout(() => {
          try { socket?.close(1000, "stopped"); } catch { /* ignore */ }
        }, 500);
      }

      mediaRecorder?.stop();
      mediaRecorder = null;

      // Release mic tracks
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;

      onStatusChange?.("idle");
    },

    resetBuffer() {
      // Call on slide navigation to start fresh for the new slide's text
      finalWords = [];
      onTranscript({ finalWords: [], interimText: "" });
    },
  };
}
