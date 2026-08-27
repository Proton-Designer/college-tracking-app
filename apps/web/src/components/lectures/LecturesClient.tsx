"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LectureTranscriptRow } from "@collegeos/api";
import { Button, DatePicker, EmptyState, Panel, Select } from "@/components/ui";
import { deleteLectureAudioAction, importLectureAction } from "@/app/(app)/lectures/lecturesActions";

const STATUS_LABEL: Record<string, string> = {
  processing: "Transcribing…",
  ready: "Ready",
  failed: "Failed",
};

export interface LecturesClientProps {
  courses: { id: number; code: string }[];
  selectedCourseId: number | null;
  lectures: LectureTranscriptRow[];
}

export function LecturesClient({ courses, selectedCourseId, lectures }: LecturesClientProps) {
  const router = useRouter();
  const [lectureDate, setLectureDate] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleCourseChange(value: string) {
    router.push(`/lectures?courseId=${value}`);
  }

  function handleImport() {
    if (selectedCourseId == null || lectureDate == null) return;
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Choose an audio file first.");
      return;
    }
    setError(undefined);
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      const result = await importLectureAction(formData, selectedCourseId, lectureDate);
      if (!result.ok) {
        setError(result.error ?? "Couldn't import that recording.");
        return;
      }
      setLectureDate(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    });
  }

  function handleDeleteAudio(lecture: LectureTranscriptRow) {
    setError(undefined);
    startTransition(async () => {
      const result = await deleteLectureAudioAction(lecture);
      if (!result.ok) setError(result.error ?? "Couldn't delete that audio.");
      router.refresh();
    });
  }

  if (selectedCourseId == null) {
    return (
      <EmptyState
        title="Pick a course"
        description="Lectures are imported per course. Choose which one this recording belongs to."
        action={
          <div className="w-64">
            <Select
              options={courses.map((c) => ({ value: String(c.id), label: c.code }))}
              value={null}
              onValueChange={handleCourseChange}
              placeholder="Choose a course…"
              aria-label="Course"
            />
          </div>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="w-64">
        <Select
          label="Course"
          options={courses.map((c) => ({ value: String(c.id), label: c.code }))}
          value={String(selectedCourseId)}
          onValueChange={handleCourseChange}
        />
      </div>

      {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}

      <Panel title="Import a recording" className="flex flex-col gap-3">
        <p className="text-body-s text-ink-muted">
          Record with a voice memo app, then import the file here. The transcript stays; the audio is yours to
          delete after.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <DatePicker label="Lecture date" value={lectureDate} onValueChange={setLectureDate} />
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="text-body-s text-ink"
          />
          <Button onClick={handleImport} loading={isPending} disabled={isPending || lectureDate == null}>
            Import
          </Button>
        </div>
      </Panel>

      {lectures.length === 0 ? (
        <p className="text-body-s text-ink-muted">No lectures imported yet for this course.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {lectures.map((lecture) => (
            <Panel key={lecture.id} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-4">
                <span className="text-body text-ink">{lecture.lecture_date}</span>
                <span
                  className={`font-mono text-body-s ${
                    lecture.status === "failed" ? "text-risk-critical" : lecture.status === "ready" ? "text-accent" : "text-ink-muted"
                  }`}
                >
                  {STATUS_LABEL[lecture.status] ?? lecture.status}
                </span>
              </div>

              {lecture.status === "failed" && lecture.failure_reason != null ? (
                <p className="text-body-s text-risk-critical">{lecture.failure_reason}</p>
              ) : null}

              {lecture.status === "ready" && lecture.transcript != null ? (
                <>
                  <button
                    type="button"
                    onClick={() => setExpandedId((prev) => (prev === lecture.id ? null : lecture.id))}
                    className="text-left"
                  >
                    <p className={`text-body-s text-ink ${expandedId === lecture.id ? "" : "line-clamp-3"}`}>{lecture.transcript}</p>
                    <span className="font-mono text-caption text-ink-faint">
                      {expandedId === lecture.id ? "Collapse" : "Expand"}
                    </span>
                  </button>
                  <div className="flex flex-wrap gap-3 pt-1">
                    <a
                      href={`/courses/${lecture.course_id}/bank`}
                      className="font-mono text-body-s text-accent underline underline-offset-2"
                    >
                      Draft questions
                    </a>
                    {!lecture.audio_deleted ? (
                      <Button variant="ghost" onClick={() => handleDeleteAudio(lecture)} disabled={isPending}>
                        Delete audio
                      </Button>
                    ) : null}
                  </div>
                </>
              ) : null}
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
