/**
 * Parses a PDF file and returns an array of slide text strings.
 * Each PDF page becomes one slide. Pages with fewer than 5 characters are skipped.
 *
 * Uses a dynamic import to avoid SSR crashes — pdfjs-dist references
 * browser globals (document, canvas, worker) that don't exist server-side.
 */
export async function parsePdf(file: File): Promise<string[]> {
  const pdfjsLib = await import("pdfjs-dist");

  // Must be set after dynamic import, before any getDocument() call
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const slides: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? (item as { str: string }).str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (text.length >= 5) {
      slides.push(text);
    }
  }

  return slides;
}
