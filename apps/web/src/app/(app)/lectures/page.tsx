import Link from "next/link";
import { listCourses, listLectureTranscripts, type LectureTranscriptRow } from "@collegeos/api";
import { Aurora, PageHeader } from "@/components/ui";
import { LecturesClient } from "@/components/lectures/LecturesClient";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Lecture capture, import-only, web port -- LECTURE_CAPTURE_SPEC's ruling (2026-08-24):
 * in-app recording failed the Expo Go probe (suspension at lock destroys the file), so
 * recording happens elsewhere and this screen only imports the finished file. Web has
 * no recording story of its own either -- import is the whole feature on both platforms.
 */
export default async function LecturesPage({
  searchParams,
}: {
  searchParams: Promise<{ courseId?: string }>;
}) {
  const { courseId: courseIdParam } = await searchParams;

  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col gap-3 px-8 py-12">
        <p className="text-body text-ink-muted">Not signed in.</p>
      </main>
    );
  }

  const coursesResult = await listCourses(client);
  if (!coursesResult.ok) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">Couldn&apos;t load lectures</p>
        <p className="text-body text-ink-muted">{coursesResult.error.message}</p>
        <Link href="/today" className="font-mono text-body-s text-accent underline underline-offset-2">
          Back to Today
        </Link>
      </main>
    );
  }

  const courseId = courseIdParam != null && Number.isFinite(Number(courseIdParam)) ? Number(courseIdParam) : null;
  const selectedCourse = courseId != null ? (coursesResult.data.find((c) => c.id === courseId) ?? null) : null;

  let lectures: LectureTranscriptRow[] = [];
  if (selectedCourse != null) {
    const lecturesResult = await listLectureTranscripts(client, user.id, selectedCourse.id);
    if (lecturesResult.ok) lectures = lecturesResult.data;
  }

  return (
    <main className="mx-auto flex w-full max-w-report flex-1 flex-col gap-8 px-8 py-10">
      <Aurora band={null} />
      <PageHeader
        title="Lectures"
        context={selectedCourse != null ? `${selectedCourse.code} · import-only` : "Pick a course"}
      />
      <LecturesClient
        courses={coursesResult.data.map((c) => ({ id: c.id, code: c.code }))}
        selectedCourseId={selectedCourse?.id ?? null}
        lectures={lectures}
      />
    </main>
  );
}
