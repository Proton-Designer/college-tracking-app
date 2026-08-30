// Page-range PDF text extraction — the scaling half of `extracting_text`.
//
// WHY NOT REUSE _shared/syllabus/pdfText.ts. That module's `extractPdfText` calls
// unpdf's `extractText(pdf, {mergePages: true})`, which walks EVERY page and returns one
// string. That is exactly right for a 3-page syllabus and exactly wrong here: a 300-page
// book would render every page's text content in a single invocation (minutes of CPU and
// tens of megabytes of string), which is the one thing migration 54's state machine
// exists to prevent. It is not a bug in that module; it is a different problem.
//
// This module keeps the same dependency and the same document handle
// (`getDocumentProxy`, PDF.js compiled to pure JS/WASM — the only PDF stack that runs in
// this runtime at all) and drives it lazily instead: open the document, then pull text
// for ONE page range. PDF.js parses the cross-reference table and page tree on open and
// renders a page's content stream only when `getPage(n).getTextContent()` asks for it,
// so the per-invocation cost is bounded by the slice, not by the book.
//
// Honest limit, stated rather than hidden: opening the document is re-paid on every
// invocation (roughly a linear scan of the xref/page tree — milliseconds for a normal
// book, and unavoidable without a cross-invocation handle, which Edge Functions do not
// have). What is NOT re-paid is per-page content-stream parsing, which is where the
// minutes live.

import { getDocumentProxy } from "npm:unpdf@0.11.0";

export interface PdfPageText {
  /** 1-based, matching `source_chunks.page_start` / `page_end`, which are `> 0`. */
  page: number;
  /** Line breaks are PRESERVED here (unlike the syllabus path's merged blob) because
   *  structure detection reads the first lines of a page to find chapter headings.
   *  Chunking normalises whitespace afterwards, on its own copy. */
  text: string;
}

export interface PdfPageRangeResult {
  /** The document's real page count — the caller writes it to `sources.page_count` and
   *  uses it as the loop bound, so it must come from the document, never from a guess. */
  pageCount: number;
  pages: PdfPageText[];
}

// deno-lint-ignore no-explicit-any
type TextItem = any;

/**
 * Text for pages [fromPage, toPage] inclusive, 1-based, clamped to the document.
 *
 * Blank pages (images, plates, section dividers) come back with `text: ""` rather than
 * being omitted, so the caller can tell "this page has no text layer" apart from "this
 * page was never extracted" — the same distinction migration 54's cursor depends on to
 * know where it got to.
 */
/**
 * Strip what Postgres will not accept, before it can become a poison pill.
 *
 * A `U+0000` in a `text` column is rejected outright by Postgres — not truncated, not escaped,
 * rejected. The resulting error is an ordinary `Error` with no structured code, so a retrying
 * pipeline classifies it as transient and retries forever against text that can never be stored.
 * One byte in one page of one PDF kills the whole book, permanently.
 *
 * Learned from ULM's L6 failure-injection campaign (`.brain/memory/known-issues.md`), where it was
 * found by adversarial PDF content rather than by review — our pipeline had the identical defect
 * and no test that would have caught it.
 *
 * Lone surrogates go too, for the same reason in a different layer: they survive JS string
 * handling happily and then fail at the UTF-8 boundary on the way into the database.
 */
export function sanitizePageText(text: string): string {
  return text
    .replace(/\u0000/g, "")
    // Unpaired surrogate halves — a high surrogate not followed by a low one, or a low one not
    // preceded by a high one.
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")
    .trim();
}

export async function extractPdfPageRange(
  bytes: Uint8Array,
  fromPage: number,
  toPage: number,
): Promise<PdfPageRangeResult> {
  // PDF.js TRANSFERS the backing ArrayBuffer to its worker port, which DETACHES it: the
  // caller's `bytes` is zero-length afterwards and a second call throws
  // `DataCloneError: ArrayBuffer at index 0 is already detached`. Found by calling this
  // function twice in one test, which is exactly what a retry inside one invocation
  // would do. A defensive copy is cheap next to parsing and makes the argument
  // read-only from the caller's point of view, which is what every caller already
  // assumes.
  const pdf = await getDocumentProxy(bytes.slice());
  const pageCount: number = pdf.numPages;

  const first = Math.max(1, Math.floor(fromPage));
  const last = Math.min(pageCount, Math.floor(toPage));

  const pages: PdfPageText[] = [];
  for (let pageNumber = first; pageNumber <= last; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const items: TextItem[] = Array.isArray(content?.items) ? content.items : [];

    let text = "";
    for (const item of items) {
      if (typeof item?.str !== "string") continue;
      text += item.str;
      // PDF.js flags the end of a rendered line; without this every page collapses to
      // one line and heading detection has nothing to detect.
      text += item.hasEOL ? "\n" : "";
    }
    pages.push({ page: pageNumber, text: sanitizePageText(text) });
  }

  return { pageCount, pages };
}
