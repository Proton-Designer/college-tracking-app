// Extracts plain text from an uploaded syllabus file so extract.ts's existing
// text -> quality gate -> LLM pipeline has something to work with. This piece genuinely
// didn't exist before P4 -- extractSyllabus() always took extractedText as a pre-supplied
// string; something has to produce it from the actual uploaded bytes.
//
// unpdf (not pdf-parse or a native binding) specifically because it runs in edge/Deno
// runtimes without native dependencies -- PDF.js compiled to pure JS/WASM, the same
// class of constraint this whole Edge Runtime already operates under.

import { extractText, getDocumentProxy } from "npm:unpdf@0.11.0";

export interface PdfTextResult {
  text: string;
  pageCount: number;
}

/** image/png and image/jpeg uploads (the bucket also allows them, migration 0011) have
 *  no text layer to extract -- OCR is out of scope tonight; callers should treat those
 *  as "low quality source text" the same way a scanned, non-OCR'd PDF is treated. */
export async function extractPdfText(bytes: Uint8Array): Promise<PdfTextResult> {
  const pdf = await getDocumentProxy(bytes);
  // mergePages: true guarantees `text` is a single string, not one entry per page.
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  return { text, pageCount: totalPages };
}
