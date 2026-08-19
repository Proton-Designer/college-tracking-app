// Deterministic gate on extracted PDF text quality, BEFORE any model call --
// docs/LLM_LAYER_SPEC.md §8: "If the PDF is scanned and text extraction yields little,
// say so and ask for a better file -- do not hand a garbage string to the model and let
// it hallucinate a semester." Pure function: no I/O, easy to test exhaustively.

const MIN_WORD_COUNT = 50;
const MIN_PRINTABLE_RATIO = 0.85;

export interface TextQualityResult {
  ok: boolean;
  reason?: string;
  wordCount: number;
  printableRatio: number;
}

export function assessExtractedText(text: string): TextQualityResult {
  const trimmed = text.trim();
  const wordCount = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;

  const printableChars = [...trimmed].filter((ch) => {
    const code = ch.codePointAt(0) ?? 0;
    // Printable ASCII, common whitespace, and Latin-1 supplement (covers most syllabus
    // text: accented names, curly quotes, etc.) count as "printable" for this check.
    return (code >= 0x20 && code <= 0x7e) || code === 0x0a || code === 0x09 || (code >= 0xa0 && code <= 0xff);
  }).length;
  const printableRatio = trimmed.length === 0 ? 0 : printableChars / trimmed.length;

  if (wordCount < MIN_WORD_COUNT) {
    return {
      ok: false,
      reason: `Extracted text has only ${wordCount} words (need at least ${MIN_WORD_COUNT}) -- this looks like a scanned PDF with no usable text layer.`,
      wordCount,
      printableRatio,
    };
  }
  if (printableRatio < MIN_PRINTABLE_RATIO) {
    return {
      ok: false,
      reason: `Extracted text is ${Math.round((1 - printableRatio) * 100)}% non-printable characters -- likely a garbled/corrupted text extraction.`,
      wordCount,
      printableRatio,
    };
  }
  return { ok: true, wordCount, printableRatio };
}
