export function norm(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Finds the speaker's current position in the slide text.
 *
 * Improvements over v1:
 * - maxLookAhead: caps how far forward we scan (prevents wild page-skips)
 * - Higher threshold: 60% match required (was 45%) — prevents false positives
 * - Multi-window: tries 7-word then 5-word then 3-word windows with scaled thresholds
 * - Never goes backward (forward-only scanning from fromIdx)
 *
 * @param slideWords - The slide's words (pre-split)
 * @param spokenWords - The last N finalized spoken words
 * @param fromIdx - The current word position (scan starts here)
 * @param maxLookAhead - Max words to scan ahead from fromIdx (default 60)
 * @returns New word index, or fromIdx if no confident match found
 */
export function findPosition(
  slideWords: string[],
  spokenWords: string[],
  fromIdx: number,
  maxLookAhead = 60
): number {
  if (spokenWords.length === 0) return fromIdx;

  const normSlide = slideWords.map(norm);
  const normSpoken = spokenWords.map(norm).filter(Boolean);

  if (normSpoken.length === 0) return fromIdx;

  const scanEnd = Math.min(fromIdx + maxLookAhead, slideWords.length);

  // Try progressively smaller windows, each with an appropriate threshold
  const windows = [
    { size: Math.min(7, normSpoken.length), minMatchRatio: 0.65 },
    { size: Math.min(5, normSpoken.length), minMatchRatio: 0.70 },
    { size: Math.min(3, normSpoken.length), minMatchRatio: 0.80 },
  ];

  for (const { size, minMatchRatio } of windows) {
    if (normSpoken.length < size) continue;

    const window = normSpoken.slice(-size);
    const threshold = Math.ceil(size * minMatchRatio);

    let bestPos = -1;
    let bestScore = 0;

    for (let i = fromIdx; i <= scanEnd - size; i++) {
      let score = 0;
      for (let j = 0; j < size; j++) {
        // Exact match only — 'norm' already strips punctuation/case
        if (normSlide[i + j] === window[j]) score++;
      }
      if (score >= threshold && score > bestScore) {
        bestScore = score;
        bestPos = i + size;
      }
    }

    if (bestPos !== -1) {
      return bestPos;
    }
  }

  return fromIdx; // No confident match — hold position
}
