import { FocusSessionView } from "@/components/focus/FocusSessionView";
import { loadFocusSession } from "./data";

export default async function FocusSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const id = Number(sessionId);

  if (!Number.isInteger(id)) {
    return (
      <main className="mx-auto flex w-full max-w-report flex-1 flex-col items-center justify-center gap-3 px-8 py-12">
        <p className="text-body text-ink-muted">Not a valid focus session.</p>
      </main>
    );
  }

  const result = await loadFocusSession(id);

  if (!result.ok) {
    return (
      <main className="mx-auto flex w-full max-w-report flex-1 flex-col items-center justify-center gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">Couldn&apos;t load this session</p>
        <p className="text-body text-ink-muted">{result.error}</p>
      </main>
    );
  }

  const { session, task, course } = result.data;

  if (session.status !== "active") {
    return (
      <main className="mx-auto flex w-full max-w-report flex-1 flex-col items-center justify-center gap-3 px-8 py-12">
        <p className="text-body text-ink-muted">This focus session already ended.</p>
      </main>
    );
  }

  return <FocusSessionView session={session} task={task} course={course} />;
}
