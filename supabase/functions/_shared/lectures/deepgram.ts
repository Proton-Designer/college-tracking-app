// Deepgram integration -- LECTURE_CAPTURE_SPEC's Fork 2 winner. Two pure-ish pieces:
// submit (signed URL in, request id out; fetch injected via globalThis so it stubs) and
// the callback parser (Deepgram's response shape -> our transcript + compact segments).
//
// Callback auth: Deepgram callbacks carry no HMAC, so the unguessable per-row
// webhook_token travels in the callback URL and possession IS the auth -- the
// whoop-webhook pattern with the secret moved into the URL, because that is the only
// channel Deepgram gives us. The token is single-purpose and row-scoped: replaying it
// can only re-deliver that one transcript to its own row, which the status gate
// (processing -> ready, once) already makes a no-op.

const DEEPGRAM_LISTEN = "https://api.deepgram.com/v1/listen";

export interface SubmitResult {
  ok: boolean;
  requestId: string | null;
  error: string | null;
}

export async function submitToDeepgram(
  apiKey: string,
  audioSignedUrl: string,
  callbackUrl: string,
): Promise<SubmitResult> {
  const params = new URLSearchParams({
    model: "nova-2",
    smart_format: "true",
    punctuate: "true",
    paragraphs: "true",
    callback: callbackUrl,
  });
  let response: Response;
  try {
    response = await fetch(`${DEEPGRAM_LISTEN}?${params.toString()}`, {
      method: "POST",
      headers: { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: audioSignedUrl }),
    });
  } catch (err) {
    return { ok: false, requestId: null, error: `Could not reach Deepgram: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!response.ok) {
    const body = await response.text();
    return { ok: false, requestId: null, error: `Deepgram returned ${response.status}: ${body.slice(0, 300)}` };
  }
  const body = (await response.json()) as { request_id?: string };
  return { ok: true, requestId: body.request_id ?? null, error: null };
}

export interface TranscriptSegment {
  /** Seconds from the start of the audio -- the in-lecture source anchor. */
  start: number;
  end: number;
  text: string;
}

export type CallbackParse =
  | { kind: "ready"; requestId: string | null; transcript: string; segments: TranscriptSegment[] }
  | { kind: "failed"; requestId: string | null; reason: string };

/**
 * Deepgram's callback body -> transcript + compact paragraph segments. Prefers the
 * paragraphs structure (smart_format emits it); falls back to sentence-less whole-words
 * only when paragraphs are absent. An empty transcript is a FAILURE with a reason, not
 * a silent empty row -- 105 minutes of audio transcribing to nothing means the wrong
 * file or the wrong format, and the user must see that.
 */
export function parseDeepgramCallback(body: unknown): CallbackParse {
  if (typeof body !== "object" || body == null) {
    return { kind: "failed", requestId: null, reason: "Malformed callback body." };
  }
  const v = body as Record<string, unknown>;
  const metadata = (v.metadata ?? {}) as Record<string, unknown>;
  const requestId = typeof metadata.request_id === "string" ? metadata.request_id : null;

  if (typeof v.error === "string" || typeof v.err_msg === "string") {
    return { kind: "failed", requestId, reason: String(v.error ?? v.err_msg) };
  }

  // deno-lint-ignore no-explicit-any
  const alternative = (v as any)?.results?.channels?.[0]?.alternatives?.[0];
  if (alternative == null) {
    return { kind: "failed", requestId, reason: "Callback carried no transcription result." };
  }
  const transcript: string = typeof alternative.transcript === "string" ? alternative.transcript : "";
  if (transcript.trim().length === 0) {
    return { kind: "failed", requestId, reason: "Deepgram returned an empty transcript — wrong file or unsupported audio?" };
  }

  const segments: TranscriptSegment[] = [];
  // deno-lint-ignore no-explicit-any
  const paragraphs = (alternative as any)?.paragraphs?.paragraphs;
  if (Array.isArray(paragraphs)) {
    for (const p of paragraphs) {
      const text = Array.isArray(p?.sentences)
        ? // deno-lint-ignore no-explicit-any
          p.sentences.map((s: any) => (typeof s?.text === "string" ? s.text : "")).join(" ").trim()
        : "";
      if (typeof p?.start === "number" && typeof p?.end === "number" && text.length > 0) {
        segments.push({ start: p.start, end: p.end, text });
      }
    }
  } else if (Array.isArray(alternative.words) && alternative.words.length > 0) {
    const words = alternative.words as Array<Record<string, unknown>>;
    const first = words[0]!;
    const last = words[words.length - 1]!;
    segments.push({
      start: typeof first.start === "number" ? first.start : 0,
      end: typeof last.end === "number" ? (last.end as number) : 0,
      text: transcript,
    });
  }

  return { kind: "ready", requestId, transcript, segments };
}
