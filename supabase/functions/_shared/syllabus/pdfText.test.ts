import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { decodeBase64 } from "jsr:@std/encoding@1/base64";
import { extractPdfText } from "./pdfText.ts";

// A real, minimal, hand-built single-page PDF (not a fixture library) with real text
// content -- proves unpdf genuinely parses PDF structure rather than being exercised
// only against garbage input. Generated once and embedded so this test has no external
// file dependency.
const REAL_PDF_BASE64 =
  "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA0IDAgUiA+PiA+PiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvQ29udGVudHMgNSAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iago1IDAgb2JqCjw8IC9MZW5ndGggNTI4ID4+CnN0cmVhbQpCVCAvRjEgMTIgVGYgNTAgNzUwIFRkIDE0IFRMCihCTUUgMzAxOiBJbnN0cnVtZW50YXRpb24gU3lzdGVtcykgVGogVCoKKEZhbGwgMjAyNiBTeWxsYWJ1cykgVGogVCoKKCkgVGogVCoKKFRoaXMgY291cnNlIGNvdmVycyBiaW9tZWRpY2FsIGluc3RydW1lbnRhdGlvbiBkZXNpZ24sIHNpZ25hbCBjb25kaXRpb25pbmcsKSBUaiBUKgooYW5kIHNlbnNvciBjYWxpYnJhdGlvbiBmb3IgcGh5c2lvbG9naWNhbCBtZWFzdXJlbWVudCBzeXN0ZW1zLikgVGogVCoKKCkgVGogVCoKKEdyYWRpbmc6IEhvbWV3b3JrIDIwIHBlcmNlbnQsIFF1aXp6ZXMgMTUgcGVyY2VudCwgTWlkdGVybSAyNSBwZXJjZW50LCBGaW5hbCA0MCBwZXJjZW50LikgVGogVCoKKEFzc2lnbm1lbnQgSFc2IGR1ZSBPY3RvYmVyIDE1IDIwMjYuKSBUaiBUKgooTWlkdGVybSBFeGFtIG9uIE9jdG9iZXIgMjIgMjAyNiBhdCAxMDozMCBBTSBpbiBNU0VFIDEyMC4pIFRqIFQqCihPZmZpY2UgaG91cnMgVHVlc2RheXMgMiB0byA0IFBNIGluIE1TRUUgMzQwLikgVGogVCoKRVQKZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyNDEgMDAwMDAgbiAKMDAwMDAwMDMxMSAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDYgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjg5MAolJUVPRg==";

Deno.test("extractPdfText: pulls real text out of a real, minimal PDF", async () => {
  const bytes = decodeBase64(REAL_PDF_BASE64);
  const result = await extractPdfText(bytes);

  assertStringIncludes(result.text, "BME 301");
  assertStringIncludes(result.text, "Instrumentation Systems");
  assertStringIncludes(result.text, "Office hours Tuesdays");
  assertEquals(result.pageCount, 1);
});

Deno.test("extractPdfText: rejects non-PDF bytes rather than silently returning empty text", async () => {
  const bytes = new TextEncoder().encode("this is not a pdf at all");
  let threw = false;
  try {
    await extractPdfText(bytes);
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});
