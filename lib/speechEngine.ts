type TranscriptCallback = (transcript: string) => void;
type ErrorCallback = (error: "not-allowed" | "not-supported" | "unknown") => void;

type SpeechRecognitionEvent = {
  results: SpeechRecognitionResultList;
};

type SpeechRecognitionErrorEvent = {
  error: string;
};

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

/**
 * Creates a SpeechRecognition instance configured for continuous, real-time
 * transcription. Automatically restarts after 600ms when recognition ends
 * (Chrome stops automatically after ~60s of silence).
 *
 * Returns null if SpeechRecognition is not supported in the current browser.
 * Must be called in a browser context (inside useEffect).
 */
export function createSpeechEngine(
  onTranscript: TranscriptCallback,
  onError: ErrorCallback,
  onStatusChange?: (status: "listening" | "idle") => void
): SpeechRecognitionInstance | null {
  if (typeof window === "undefined") return null;

  const SR =
    (window as unknown as { SpeechRecognition: new () => SpeechRecognitionInstance }).SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition: new () => SpeechRecognitionInstance }).webkitSpeechRecognition;

  if (!SR) {
    onError("not-supported");
    return null;
  }

  const recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  let shouldRestart = true;

  recognition.onstart = () => {
    onStatusChange?.("listening");
  };

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    let transcript = "";
    for (let i = 0; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    onTranscript(transcript);
  };

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    if (event.error === "not-allowed") {
      shouldRestart = false;
      onError("not-allowed");
    }
    // Ignore 'no-speech' — onend will trigger a restart
  };

  recognition.onend = () => {
    onStatusChange?.("idle");
    if (shouldRestart) {
      // 600ms delay is critical — Chrome crashes if restarted synchronously
      setTimeout(() => {
        try {
          recognition.start();
        } catch {
          // Already started (race condition), ignore
        }
      }, 600);
    }
  };

  // Expose a stop method that also prevents auto-restart
  const originalStop = recognition.stop.bind(recognition);
  recognition.stop = () => {
    shouldRestart = false;
    originalStop();
  };

  return recognition;
}
