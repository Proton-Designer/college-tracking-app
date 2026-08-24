# Lecture Capture — spec (nothing built)

> Requested 2026-08-24, mid-Tier-2. **Spec only; build is explicitly deferred until after
> Tier 2.** Scope: record or import a lecture, transcribe it server-side, store the
> transcript per-course with source anchors, and feed it into study planning — Question
> Bank drafting (the Part X exception: AI drafts, you edit every card), topic-informed
> session planning, and answer verification against the raw transcript.

## The one-paragraph recommendation

**Import-only (probe-confirmed), Deepgram, landing with S3 (Tier 3.5), with its LLM
halves gated to Tier 4.** File import via `expo-document-picker` is the floor because Apple Voice Memos
already records perfectly with the screen locked — the capability in-app recording has to
prove it can match. Deepgram over Whisper because Whisper's 25 MB request cap forces
audio chunking that a Deno edge function cannot do (no ffmpeg), while Deepgram takes a
signed URL and answers by webhook — which is *exactly* the `whoop-webhook` shape this repo
already runs in production. The feature belongs beside the Question Bank (S3), because
that is its first real consumer; building capture before the Bank exists would repeat the
N5 mistake this repo already documented once.

---

## Fork 1 — Capture

| | In-app recording (`expo-audio`) | Import (`expo-document-picker`) |
|---|---|---|
| In Expo Go SDK 54? | Module ships (`~1.1.1`). **Probed 2026-08-24: FAILS — suspension at lock, and the file is lost entirely (0 s reported), not truncated.** Dev-build only. | Module ships (`~14.0.8`). No background question exists: Voice Memos did the recording. |
| Failure mode | Screen locks 10 minutes into a 75-minute lecture and the recording silently stops — the worst possible failure, discovered at review time. | User forgets to record. No silent-loss mode: the file either exists or it doesn't. |
| N5 status | — | N5 denied the picker *for lacking a consumer*. The denial's own text says to revisit when a consumer exists. Transcription is that consumer; the denial no longer applies. |

**The probe — RUN 2026-08-24, on a real device, in Expo Go SDK 54. VERDICT: FAILED.**
iOS suspended the recording at screen lock. Worse than truncation: in a ~35 s window with
~15 s of active-app time, the recorder reported **0 s** — so suspension appears to
**destroy the recording entirely, not merely cut it short at the lock**. Design
consequence: in-app recording in Expo Go cannot be shipped even as a
"foreground-only, keep the screen awake" compromise, because a single accidental lock
would not cost the tail of a lecture — it would cost the lecture. There is no partial
file to salvage.

**Ruling (2026-08-24): import-only until the Phase 4 dev build**, which grants the
`audio` `UIBackgroundModes` entitlement. In-app recording moves to the dev-build fork
alongside the widget and push, and must re-run this probe under the dev client before
being trusted there.

Import ships regardless — that is what "import as the floor" bought: the feature's
viability never depended on the probe.

## Fork 2 — Transcription

First non-Anthropic model vendor in the stack. Pricing below is **as of my knowledge
cutoff (May 2026) — verify current rates before committing**; the *architecture* argument
is version-stable, the prices move.

| | Whisper API (OpenAI) | Deepgram (Nova family) | AssemblyAI |
|---|---|---|---|
| ~$/audio-min | $0.006 | ~$0.0043 | ~$0.006 |
| **Per 75-min lecture** | ~$0.45 | ~$0.32 | ~$0.45 |
| **Per semester** (~200 lecture-hrs: 4 courses × 40 × 1.25 h) | ~$72 | ~$52 | ~$74 |
| Input | **Multipart upload, ≤25 MB/request** | Signed URL | Signed URL |
| Async + webhook | No (synchronous) | **Yes** | **Yes** |
| Edge-function fit | **Poor.** A 75-min file at 64 kbps ≈ 36 MB → exceeds the cap → chunking. Deno edge functions have no ffmpeg, so chunking means either a lossy client-side pipeline or a second service. Also synchronous: the function holds the connection for the whole transcription against a wall-clock limit. | **Excellent.** Function passes a signed Storage URL, gets a callback. Fire-and-return. | Same shape as Deepgram. |
| Word timestamps (for source anchors) | Segment-level | Word-level | Word-level |

**Recommendation: Deepgram**, with AssemblyAI as the drop-in alternate (same
architecture, so switching costs one provider module, not a redesign). Whisper is
eliminated by the 25 MB cap + no-ffmpeg reality, not by price. All three are ~$50–75 a
semester — cost is not the deciding axis at this scale.

**Architecture** (every piece is an existing pattern):

```
client --(TUS resumable upload)--> Supabase Storage  [bucket: lectures, private]
client --> edge fn `lecture-transcribe` (verify_jwt=true)
             └─ creates lecture_transcripts row (status='processing'),
                submits signed URL to Deepgram with callback URL
Deepgram --> edge fn `lecture-transcript-webhook` (verify_jwt=false,
             signature check IS the auth -- the whoop-webhook pattern verbatim)
             └─ stores transcript text + word-timestamped segments jsonb,
                status='ready'
```

- **Bucket**: `lectures`, private, signed URLs only, owner-prefix RLS — copied from
  migration 11's `syllabi` pattern. `file_size_limit` ~200 MB (a 2-h lecture at 128 kbps
  is ~115 MB). MIME allowlist: m4a/mp3/wav/aac.
- **Table**: `lecture_transcripts` — `course_id` FK, `lecture_date date` (**the source
  anchor**; local date, B4 rules apply), `storage_path`, `status`
  (`processing|ready|failed` — text+CHECK per the enum policy), `transcript text`,
  `segments jsonb` (word/segment timestamps), RLS all-own.
- **Secret**: `DEEPGRAM_API_KEY` + a webhook secret via `supabase secrets set` — same
  lifecycle as `CRON_SHARED_SECRET`.
- **Audio retention**: transcript is permanent; raw audio is deletable by the user once
  status='ready' (UI offers it, never auto-deletes — a recording is the user's property).
  At ~50 MB/lecture × 160 lectures ≈ 8 GB/semester, storage cost is the real number to
  watch, not transcription.

## Fork 3 — Downstream (where this plugs in)

| Consumer | Needs | Tier |
|---|---|---|
| Transcript retrievable per-course, anchored by lecture date | Nothing beyond the above | lands with the feature |
| **Question Bank drafting from transcript** (AI drafts, user edits every card — the Part X exception) | `questions` table (S3) + `ANTHROPIC_API_KEY` | **Tier 4** activation; the Bank's `origin` enum already reserves `'ai'` |
| Topic extraction → session planning | S3's session/mode layer + `ANTHROPIC_API_KEY` | **Tier 4** |
| Answer verification against source | Transcript + anchors (nothing AI-side; the anchor IS the feature) | lands with the feature |

**Tier placement: build with S3 (Tier 3.5), not before and not as an orphan.** Before S3
there is no Question Bank to feed and the transcript would be a filing cabinet; after
Tier 4's key lands, the drafting pipeline activates on data that has been accumulating
since 3.5. The one deliberately-unresolved question: whether transcripts should also
back-fill `syllabus-extract`-style deadline detection ("exam moved to Friday" said aloud
in lecture) — that is `parse_announcement`'s job (S2), and wiring lectures into it should
be decided when both exist, not now.

## Costs, summarized

- **Build**: import + upload + transcribe + store + per-course transcript view:
  **4–5 days** (probe settled the capture fork: no in-app recording path to build). LLM halves are Tier 4's estimate, not
  this one's.
- **Run**: ~$52/semester transcription (Deepgram, cutoff pricing) + Supabase storage for
  ~8 GB/semester of audio the user can prune. Zero Anthropic cost until Tier 4.
