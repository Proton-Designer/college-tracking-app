import Link from "next/link";
import { getCourse, listQuestionsForCourse } from "@collegeos/api";
import { Aurora, PageHeader } from "@/components/ui";
import { BankClient } from "@/components/bank/BankClient";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/** The Question Bank, web port -- same rules as mobile's /bank: the write path is
 *  first-class (writing the question IS the study technique), anchors are
 *  required-or-explicitly-skipped, and AI drafts are proposals the user edits. Web is
 *  where question-writing naturally happens: after a reading session, at a keyboard. */
export default async function BankPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const courseId = Number(id);

  if (!Number.isInteger(courseId)) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col gap-3 px-8 py-12">
        <p className="text-body text-ink-muted">Not a valid course.</p>
      </main>
    );
  }

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

  const [courseResult, questionsResult] = await Promise.all([
    getCourse(client, courseId),
    listQuestionsForCourse(client, user.id, courseId),
  ]);

  if (!courseResult.ok) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">Couldn&apos;t load this course</p>
        <p className="text-body text-ink-muted">{courseResult.error.message}</p>
        <Link href="/courses" className="font-mono text-body-s text-accent underline underline-offset-2">
          Back to Courses
        </Link>
      </main>
    );
  }

  const course = courseResult.data;

  return (
    <main className="mx-auto flex w-full max-w-app flex-1 flex-col gap-8 px-8 py-10">
      <Aurora band={null} />
      <div className="flex flex-col gap-1">
        <Link
          href={`/courses/${courseId}`}
          className="font-mono text-caption uppercase tracking-[0.08em] text-ink-faint hover:text-ink"
        >
          ← {course.code}
        </Link>
        <PageHeader
          title="Question Bank"
          context={`${course.code} · Writing the question is half the studying. Anchor every answer to real material.`}
          actions={
            <Link href="/drill" className="font-mono text-body-s text-accent underline underline-offset-2">
              Drill what&apos;s due →
            </Link>
          }
        />
      </div>

      <BankClient courseId={courseId} initialQuestions={questionsResult.ok ? questionsResult.data : []} />
    </main>
  );
}
