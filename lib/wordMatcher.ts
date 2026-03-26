export function norm(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Finds the new word position in `slideWords` based on the spoken transcript.
 * Scans forward from `fromIdx`, never backwards.
 * Uses a sliding window of the last 7 spoken words with a 45% match threshold.
 * Returns `fromIdx` unchanged if no match is found.
 */
export function findPosition(
  slideWords: string[],
  transcript: string,
  fromIdx: number
): number {
  const spokenWords = transcript
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(norm);

  const windowSize = Math.min(7, spokenWords.length);
  const window = spokenWords.slice(-windowSize);

  if (window.length === 0) return fromIdx;

  const threshold = Math.ceil(window.length * 0.45);

  for (let i = fromIdx; i <= slideWords.length - window.length; i++) {
    let matches = 0;
    for (let j = 0; j < window.length; j++) {
      if (norm(slideWords[i + j]) === window[j]) matches++;
    }
    if (matches >= threshold) return i + window.length;
  }

  return fromIdx;
}
