import { assertEquals } from "jsr:@std/assert@1";
import { chunkPages, type PageText } from "./chunking.ts";
import { detectSections, sectionForPage } from "./structure.ts";

const SENTENCE = "Habits compound quietly across months and the first step matters less than its repeatability. ";

function bookPages(count: number, sentencesPerPage = 4): PageText[] {
  return Array.from({ length: count }, (_, i) => ({ page: i + 1, text: SENTENCE.repeat(sentencesPerPage) }));
}

Deno.test("chunkPages: an empty book, and a book of blank pages, produce no chunks", () => {
  assertEquals(chunkPages([]), []);
  assertEquals(chunkPages([{ page: 1, text: "   \n\n " }]), []);
});

Deno.test("chunkPages: chunks stay under the target and carry a real page span", () => {
  const chunks = chunkPages(bookPages(30), { targetChars: 1_000, overlapChars: 0 });

  assertEquals(chunks.length > 1, true);
  for (const chunk of chunks) {
    assertEquals(chunk.text.length <= 1_000, true, `chunk ran to ${chunk.text.length} chars`);
    assertEquals(chunk.pageStart >= 1, true);
    assertEquals(chunk.pageEnd >= chunk.pageStart, true);
  }
  assertEquals(chunks[0]!.pageStart, 1);
  assertEquals(chunks[chunks.length - 1]!.pageEnd, 30);
});

Deno.test("chunkPages: sort order is contiguous and starts where the cursor says", () => {
  // The chunking step processes one page window per invocation and carries the running
  // sort_order in its cursor; a restart at the wrong number would silently reorder a book.
  const first = chunkPages(bookPages(10), { targetChars: 800, startSortOrder: 0 });
  const second = chunkPages(bookPages(10), { targetChars: 800, startSortOrder: first.length });

  assertEquals(first.map((c) => c.sortOrder), first.map((_, i) => i));
  assertEquals(second[0]!.sortOrder, first.length);
});

Deno.test("chunkPages: overlap re-shows the tail of the previous chunk", () => {
  const chunks = chunkPages(bookPages(20), { targetChars: 900, overlapChars: 200 });
  assertEquals(chunks.length > 1, true);

  const previousTail = chunks[0]!.text.slice(-100);
  assertEquals(chunks[1]!.text.includes(previousTail.slice(-60)), true, "an argument straddling a boundary must be visible to both calls");
});

Deno.test("chunkPages: with zero overlap, no chunk repeats the previous one's tail", () => {
  // Every page carries a UNIQUE marker; with identical pages this assertion would be
  // vacuously satisfiable by the repetition rather than by the overlap setting.
  const pages: PageText[] = Array.from({ length: 20 }, (_, i) => ({
    page: i + 1,
    text: [0, 1, 2, 3]
      .map((s) => `Sentence ${i}-${s} states that habits compound quietly across the months that follow.`)
      .join(" "),
  }));

  const overlapped = chunkPages(pages, { targetChars: 900, overlapChars: 250 });
  const bare = chunkPages(pages, { targetChars: 900, overlapChars: 0 });

  const lastSentenceOf = (text: string) => text.split(". ").slice(-2).join(". ");
  assertEquals(overlapped[1]!.text.includes(lastSentenceOf(overlapped[0]!.text).slice(0, 40)), true);
  assertEquals(bare[1]!.text.includes(lastSentenceOf(bare[0]!.text).slice(0, 40)), false);
});

Deno.test("chunkPages: a single sentence longer than a whole chunk is hard-split, not emitted oversized", () => {
  const monster = { page: 1, text: "word ".repeat(2_000) }; // 10,000 chars, no sentence breaks
  const chunks = chunkPages([monster], { targetChars: 1_000, overlapChars: 0 });

  assertEquals(chunks.length > 1, true);
  for (const chunk of chunks) assertEquals(chunk.text.length <= 1_000, true);
});

Deno.test("chunkPages: a trailing fragment is folded into the previous chunk, not emitted alone", () => {
  const pages = [...bookPages(9), { page: 10, text: "One short tail sentence." }];
  const chunks = chunkPages(pages, { targetChars: 900, minChars: 400, overlapChars: 0 });

  assertEquals(chunks[chunks.length - 1]!.text.includes("One short tail sentence."), true);
  assertEquals(chunks.every((c) => c.text.length >= 400 || chunks.length === 1), true, "no sub-minimum chunk survives");
});

Deno.test("chunkPages: layout newlines are normalised away — a chunk is prose, not a layout", () => {
  const chunks = chunkPages([{ page: 1, text: "Line one.\n   Line   two.\n\nLine three." }], { targetChars: 500 });
  assertEquals(chunks[0]!.text, "Line one. Line two. Line three.");
});

// ============================================================================
// Structure detection
// ============================================================================

Deno.test("detectSections: finds chapter headings and runs each to the page before the next", () => {
  const pages: PageText[] = [
    { page: 1, text: "Chapter 1: Beginning Small\nSome prose about starting." },
    { page: 2, text: "More prose that mentions Chapter 1 in passing but is a sentence, so it is not a heading." },
    { page: 3, text: "Chapter 2: Environment\nMore prose." },
    { page: 4, text: "Even more prose." },
  ];

  assertEquals(detectSections(pages), [
    { title: "Chapter 1: Beginning Small", pageStart: 1, pageEnd: 2, sortOrder: 0 },
    { title: "Chapter 2: Environment", pageStart: 3, pageEnd: 4, sortOrder: 1 },
  ]);
});

Deno.test("detectSections: numbered headings count; a decimal in prose does not", () => {
  const pages: PageText[] = [
    { page: 1, text: "3.2 The Habit Loop\nprose" },
    { page: 2, text: "3.2 percent of participants dropped out of the trial before the second week." },
  ];
  assertEquals(detectSections(pages).map((s) => s.title), ["3.2 The Habit Loop"]);
});

Deno.test("detectSections: a book with no headings yields NO sections, never a fabricated one", () => {
  // D40's rule applied to structure: an honest empty result, not an invented "Chapter 1".
  assertEquals(detectSections(bookPages(20)), []);
});

Deno.test("detectSections: a heading deep in body text is ignored", () => {
  const pages: PageText[] = [
    { page: 1, text: "line\nline\nline\nline\nChapter 9: Not A Heading Here" },
  ];
  assertEquals(detectSections(pages), []);
});

Deno.test("detectSections: only the first heading on a page counts, so a contents page is not shredded", () => {
  const pages: PageText[] = [
    { page: 1, text: "Chapter 1: One\nChapter 2: Two\nChapter 3: Three" },
    { page: 2, text: "prose" },
  ];
  assertEquals(detectSections(pages).length, 1);
});

Deno.test("detectSections: the last section runs to the document's real last page, not the last page inspected", () => {
  const pages: PageText[] = [{ page: 1, text: "Chapter 1: One\nprose" }];
  assertEquals(detectSections(pages, 300)[0]!.pageEnd, 300);
});

Deno.test("sectionForPage: maps a page into its section, or null outside every section", () => {
  const sections = detectSections([
    { page: 1, text: "Chapter 1: One\nprose" },
    { page: 5, text: "Chapter 2: Two\nprose" },
  ], 9);

  assertEquals(sectionForPage(sections, 3)?.title, "Chapter 1: One");
  assertEquals(sectionForPage(sections, 7)?.title, "Chapter 2: Two");
  assertEquals(sectionForPage(sections, 40), null);
});
