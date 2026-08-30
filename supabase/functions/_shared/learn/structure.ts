// Chapter/section detection from page text — `parsing_structure` in migration 54's state
// machine, and a DETERMINISTIC step on purpose.
//
// D9: the LLM never chooses what matters, and "which pages are Chapter 3" is a
// structural fact about the document, not an interpretation. A model asked to segment a
// book would (a) need the whole book in a prompt, which the state machine exists to
// avoid, (b) return a different answer on a re-drive, so a resumed job would disagree
// with itself, and (c) cost real money for a job that regular expressions do.
//
// When the heuristics find nothing — a document with no chapter headings at all, or one
// whose headings live in a font size this text layer does not expose — the honest answer
// is NO sections, not one fabricated "Chapter 1" spanning the book. `source_chunks
// .section_id` is nullable precisely so a section-less source is a real, supported state
// rather than a gap someone fills with an invention (D40's rule, applied to structure).

import type { PageText } from "./chunking.ts";

export interface DetectedSection {
  /** `source_sections.title` is nullable, but a section we detected always has the line
   *  we detected it FROM — an untitled detected section would be indistinguishable from
   *  no detection. */
  title: string;
  pageStart: number;
  pageEnd: number;
  sortOrder: number;
}

/** Longer than this and it is a sentence that happens to start with "Chapter", not a
 *  heading. Real chapter headings are short by convention and by typography. */
const MAX_HEADING_CHARS = 90;

/** How many leading lines of a page can hold a heading. A heading below the fourth line
 *  is body text mentioning a chapter. */
const HEADING_LINE_WINDOW = 4;

const NAMED_DIVISION = /^(chapter|part|section|book|appendix|lesson|principle|rule|law|step)\b[\s.:\-—]*([0-9]+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)?\b/i;

/** "3. Identity Precedes Action" / "3.2 The Habit Loop" — a numbered heading, which must
 *  be followed by a capitalised word so a decimal in prose ("3.2 percent of") does not
 *  match. */
const NUMBERED_HEADING = /^\d+(\.\d+)*[\s.:\-—]+\p{Lu}/u;

function looksLikeHeading(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_HEADING_CHARS) return false;
  // A heading is not a sentence. A trailing period is common on numbered headings, but a
  // line with internal sentence punctuation is prose.
  if (/[.!?]\s+\p{L}/u.test(trimmed)) return false;
  return NAMED_DIVISION.test(trimmed) || NUMBERED_HEADING.test(trimmed);
}

/**
 * One section per detected heading, running from its own page to the page before the
 * next heading (the last runs to `lastPage`).
 *
 * `lastPage` is passed in rather than taken from `pages` because the state machine may
 * detect structure from a subset of pages while knowing the document's real length; a
 * final section that stopped at the last page we happened to look at would silently
 * exclude the end of the book.
 */
export function detectSections(pages: PageText[], lastPage?: number): DetectedSection[] {
  const found: Array<{ title: string; page: number }> = [];

  for (const page of pages) {
    const lines = page.text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    for (const line of lines.slice(0, HEADING_LINE_WINDOW)) {
      if (looksLikeHeading(line)) {
        // One heading per page: a page carrying two headings is a table of contents, and
        // treating each entry as a section start would shred the book into one-page
        // sections. The first is the page's own.
        found.push({ title: line, page: page.page });
        break;
      }
    }
  }

  if (found.length === 0) return [];

  const finalPage = lastPage ?? Math.max(...pages.map((p) => p.page));

  return found.map((heading, index) => {
    const next = found[index + 1];
    return {
      title: heading.title,
      pageStart: heading.page,
      pageEnd: next ? Math.max(heading.page, next.page - 1) : Math.max(heading.page, finalPage),
      sortOrder: index,
    };
  });
}

/** The section a page falls inside, or null. Used to attach `section_id` to chunks. */
export function sectionForPage(sections: DetectedSection[], page: number): DetectedSection | null {
  for (const section of sections) {
    if (page >= section.pageStart && page <= section.pageEnd) return section;
  }
  return null;
}
