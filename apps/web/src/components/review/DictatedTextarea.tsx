"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Textarea } from "@/components/ui";

/**
 * SOURCE_BRIEF (night review mockup): all three reflection fields are specified as
 * `[voice/text]`, with the reasoning stated outright — "speaking for sixty seconds is much
 * easier than writing a long journal every evening." That matters more than convenience:
 * the brief's own thesis is that continuous self-reporting creates adherence problems, and
 * this is the last high-burden manual ritual in the product. A journal nobody fills in
 * produces no friction logs and no calibration actuals, and the Reflect step goes quiet.
 *
 * Web only, deliberately. Mobile needs no equivalent because every iOS and Android soft
 * keyboard already ships a dictation key, so a native TextInput *is* a voice field — with
 * better accuracy than anything we would wire up, and no dependency or custom dev build.
 * Browsers offer no such affordance inside a <textarea>, which is the whole reason this
 * component exists. Identical capability, different idiom: allowed under SCREEN_SPEC.
 *
 * Degrades to a plain Textarea where the API is absent (Firefox). It renders no control at
 * all rather than a button that does nothing — a dead affordance is worse than none.
 */

interface SpeechAlternative {
  readonly transcript: string;
}
interface SpeechResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechAlternative;
}
interface SpeechResultList {
  readonly length: number;
  readonly [index: number]: SpeechResult;
}
interface SpeechEvent {
  readonly resultIndex: number;
  readonly results: SpeechResultList;
}
interface SpeechErrorEvent {
  readonly error: string;
}
interface SpeechRecognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognizerConstructor = new () => SpeechRecognizer;

function getRecognizerConstructor(): SpeechRecognizerConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognizerConstructor;
    webkitSpeechRecognition?: SpeechRecognizerConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Support is read through useSyncExternalStore rather than an effect. The server has no
 *  `window`, so the server snapshot is `false` and the client snapshot is the real answer —
 *  which gives a correct hydration pass without a setState-in-effect cascade. `subscribe` is
 *  a no-op because browser support cannot change during a session. */
const subscribeToNothing = () => () => {};
const readSupportOnClient = () => getRecognizerConstructor() !== null;
const readSupportOnServer = () => false;

/** Spoken text is appended to whatever is already typed, never substituted for it — a user
 *  who types two sentences and then dictates a third must not lose the first two. */
function appendSpoken(existing: string, spoken: string): string {
  const addition = spoken.trim();
  if (!addition) return existing;
  if (!existing) return addition;
  return /\s$/.test(existing) ? existing + addition : `${existing} ${addition}`;
}

export function DictatedTextarea({
  label,
  value,
  onValueChange,
  rows = 3,
}: {
  label: string;
  value: string;
  onValueChange: (next: string) => void;
  rows?: number;
}) {
  const supported = useSyncExternalStore(subscribeToNothing, readSupportOnClient, readSupportOnServer);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognizerRef = useRef<SpeechRecognizer | null>(null);

  useEffect(() => {
    return () => {
      recognizerRef.current?.abort();
      recognizerRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    recognizerRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Recognizer = getRecognizerConstructor();
    if (!Recognizer) return;

    setError(null);
    setInterim("");

    const recognizer = new Recognizer();
    recognizer.lang = navigator.language || "en-US";
    recognizer.continuous = true;
    recognizer.interimResults = true;

    recognizer.onresult = (event) => {
      let finalText = "";
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result) continue;
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) finalText += text;
        else pending += text;
      }
      setInterim(pending);
      // Committed only once the engine marks it final — interim text is a live preview and
      // is routinely revised mid-utterance, so writing it into the field would make the
      // textarea rewrite itself under the user.
      if (finalText) onValueChange(appendSpoken(value, finalText));
    };

    recognizer.onerror = (event) => {
      setError(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone access was blocked. Allow it in your browser, or type instead."
          : "Dictation stopped unexpectedly. You can keep typing.",
      );
      setListening(false);
      setInterim("");
    };

    recognizer.onend = () => {
      setListening(false);
      setInterim("");
    };

    recognizerRef.current = recognizer;
    try {
      recognizer.start();
      setListening(true);
    } catch {
      // start() throws if called while already running — harmless, and not worth surfacing.
      setListening(false);
    }
  }, [onValueChange, value]);

  return (
    <div className="flex flex-col gap-1.5">
      <Textarea label={label} value={value} onChange={(e) => onValueChange(e.target.value)} rows={rows} />

      {supported ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={listening ? stop : start}
            aria-pressed={listening}
            aria-label={listening ? `Stop dictating ${label}` : `Dictate ${label} by voice`}
            className={[
              "inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5",
              "font-mono text-caption uppercase tracking-[0.08em]",
              "transition-colors duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
              "focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2",
              listening
                ? "border-accent bg-accent-wash text-accent"
                : "border-hairline text-ink-muted hover:border-ink-muted hover:text-ink",
            ].join(" ")}
          >
            <span
              aria-hidden="true"
              className={[
                "h-1.5 w-1.5 rounded-full",
                listening ? "animate-pulse bg-accent motion-reduce:animate-none" : "bg-ink-faint",
              ].join(" ")}
            />
            {listening ? "Listening — tap to stop" : "Speak instead"}
          </button>

          {/* Interim text is announced politely rather than assertively: it revises constantly
              while speaking, and an assertive region would interrupt the screen reader on every
              syllable. */}
          <p aria-live="polite" className="min-h-[1rem] flex-1 truncate font-sans text-caption text-ink-faint">
            {interim}
          </p>
        </div>
      ) : null}

      {error ? <p className="font-sans text-caption text-risk-high">{error}</p> : null}
    </div>
  );
}
