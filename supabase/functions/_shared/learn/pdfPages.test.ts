import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { decodeBase64 } from "jsr:@std/encoding@1/base64";
import { extractPdfPageRange } from "./pdfPages.ts";

// A real, hand-built THREE-page PDF (the syllabus test's single-page fixture proves
// unpdf parses PDF structure; this one proves the page-range slice actually slices).
// Generated once and embedded so the test has no external file dependency.
const THREE_PAGE_PDF_BASE64 = [
  "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC",
  "9LaWRzIFszIDAgUiA1IDAgUiA3IDAgUl0gL0NvdW50IDMgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAv",
  "UmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA5IDAgUiA+PiA+PiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvQ29udGVudHMgNCAwIFIgPj4KZW",
  "5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCAxODAgPj4Kc3RyZWFtCkJUIC9GMSAxMiBUZiA1MCA3NTAgVGQgMTYgVEwKKENoYXB0ZXIgMTogVGhl",
  "IFR3by1NaW51dGUgUnVsZSkgVGogVCoKKFN0YXJ0IGV2ZXJ5IGhhYml0IGF0IGEgc2NhbGUgc28gc21hbGwgaXQgaXMpIFRqIFQqCihpbXBvc3",
  "NpYmxlIHRvIHJlZnVzZS4gVHdvIG1pbnV0ZXMgaXMgdGhlIGNlaWxpbmcuKSBUaiBUKgpFVAplbmRzdHJlYW0KZW5kb2JqCjUgMCBvYmoKPDwg",
  "L1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA5IDAgUiA+PiA+PiAvTWVkaWFCb3ggWzAgMCA2MT",
  "IgNzkyXSAvQ29udGVudHMgNiAwIFIgPj4KZW5kb2JqCjYgMCBvYmoKPDwgL0xlbmd0aCAxNzggPj4Kc3RyZWFtCkJUIC9GMSAxMiBUZiA1MCA3",
  "NTAgVGQgMTYgVEwKKENoYXB0ZXIgMjogRW52aXJvbm1lbnQgQmVhdHMgV2lsbHBvd2VyKSBUaiBUKgooRGVzaWduIHRoZSByb29tIGFuZCB0aG",
  "Ugcm9vbSBkZXNpZ25zIHlvdS4pIFRqIFQqCihGcmljdGlvbiBpcyB0aGUgbGV2ZXIgbm9ib2R5IHJlYWNoZXMgZm9yLikgVGogVCoKRVQKZW5k",
  "c3RyZWFtCmVuZG9iago3IDAgb2JqCjw8IC9UeXBlIC9QYWdlIC9QYXJlbnQgMiAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgOSAwIF",
  "IgPj4gPj4gL01lZGlhQm94IFswIDAgNjEyIDc5Ml0gL0NvbnRlbnRzIDggMCBSID4+CmVuZG9iago4IDAgb2JqCjw8IC9MZW5ndGggMTU5ID4+",
  "CnN0cmVhbQpCVCAvRjEgMTIgVGYgNTAgNzUwIFRkIDE2IFRMCihDaGFwdGVyIDM6IElkZW50aXR5IFByZWNlZGVzIEFjdGlvbikgVGogVCoKKE",
  "V2ZXJ5IGFjdGlvbiBpcyBhIHZvdGUgZm9yIHRoZSBwZXJzb24geW91KSBUaiBUKgooYmVsaWV2ZSB5b3UgYXJlIGJlY29taW5nLikgVGogVCoK",
  "RVQKZW5kc3RyZWFtCmVuZG9iago5IDAgb2JqCjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+Pg",
  "plbmRvYmoKeHJlZgowIDEwCjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAw",
  "MDAxMjcgMDAwMDAgbiAKMDAwMDAwMDI1MyAwMDAwMCBuIAowMDAwMDAwNDg0IDAwMDAwIG4gCjAwMDAwMDA2MTAgMDAwMDAgbiAKMDAwMDAwMD",
  "gzOSAwMDAwMCBuIAowMDAwMDAwOTY1IDAwMDAwIG4gCjAwMDAwMDExNzUgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSAxMCAvUm9vdCAxIDAg",
  "UiA+PgpzdGFydHhyZWYKMTI0NQolJUVPRg==",
].join("");

const BYTES = decodeBase64(THREE_PAGE_PDF_BASE64);

Deno.test("extractPdfPageRange: extracts ONLY the requested slice, not the whole document", async () => {
  const result = await extractPdfPageRange(BYTES, 2, 2);

  assertEquals(result.pageCount, 3, "the real page count always comes from the document");
  assertEquals(result.pages.length, 1);
  assertEquals(result.pages[0]!.page, 2);
  assertStringIncludes(result.pages[0]!.text, "Environment Beats Willpower");
  assertEquals(result.pages[0]!.text.includes("Two-Minute Rule"), false, "page 1 must not leak into a page-2 slice");
  assertEquals(result.pages[0]!.text.includes("Identity Precedes"), false, "page 3 must not leak into a page-2 slice");
});

Deno.test("extractPdfPageRange: page numbers are 1-based and carried through in order", async () => {
  const result = await extractPdfPageRange(BYTES, 1, 3);
  assertEquals(result.pages.map((p) => p.page), [1, 2, 3]);
  assertStringIncludes(result.pages[0]!.text, "Two-Minute Rule");
  assertStringIncludes(result.pages[2]!.text, "Identity Precedes Action");
});

Deno.test("extractPdfPageRange: a range past the end clamps to the document instead of throwing", async () => {
  // The state machine walks fixed-size slices, so the last slice ALWAYS overshoots.
  const result = await extractPdfPageRange(BYTES, 3, 27);
  assertEquals(result.pageCount, 3);
  assertEquals(result.pages.map((p) => p.page), [3]);
});

Deno.test("extractPdfPageRange: a range entirely past the end yields no pages, not an error", async () => {
  const result = await extractPdfPageRange(BYTES, 10, 20);
  assertEquals(result.pageCount, 3);
  assertEquals(result.pages, []);
});

Deno.test("extractPdfPageRange: line breaks survive, so heading detection has lines to read", async () => {
  const result = await extractPdfPageRange(BYTES, 1, 1);
  const lines = result.pages[0]!.text.split("\n");
  assertEquals(lines.length >= 2, true, `expected multiple lines, got ${JSON.stringify(result.pages[0]!.text)}`);
  assertEquals(lines[0]!.trim(), "Chapter 1: The Two-Minute Rule");
});
