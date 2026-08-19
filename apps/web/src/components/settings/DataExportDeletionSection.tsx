"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteAccountAction, exportAccountAction } from "@/app/(app)/settings/actions";
import { Button, Input, Panel } from "@/components/ui";
import { useToast } from "@/components/ui/ToastProvider";

export function DataExportDeletionSection({ userEmail }: { userEmail: string }) {
  return (
    <div className="flex flex-col gap-4">
      <ExportCard />
      <DeleteCard userEmail={userEmail} />
    </div>
  );
}

function ExportCard() {
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  function handleExport() {
    startTransition(async () => {
      const result = await exportAccountAction();
      if (!result.ok) {
        toast.show(result.error ?? "Export failed — try again.", "error");
        return;
      }
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `collegeos-export-${result.data.exportedAt.slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.show("Export downloaded.");
    });
  }

  return (
    <Panel className="flex flex-col gap-2">
      <h3 className="font-sans text-title font-semibold tracking-[-0.01em] text-ink">Export your data</h3>
      <p className="text-body-s text-ink-muted">
        Downloads everything: your courses, tasks, journals, check-ins and reviews, focus sessions, kill-list history, and
        every interpretation the system has formed about you — including agent reports and the insights derived from your
        behavior. Not just the raw records.
      </p>
      <div>
        <Button variant="secondary" onClick={handleExport} loading={isPending}>
          Download my data (JSON)
        </Button>
      </div>
    </Panel>
  );
}

function DeleteCard({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const toast = useToast();
  const [confirmEmail, setConfirmEmail] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();
  const matches = confirmEmail.trim().toLowerCase() === userEmail.toLowerCase();

  function handleDelete() {
    setError(undefined);
    if (!matches) {
      setError("Type your email exactly to confirm.");
      return;
    }
    startTransition(async () => {
      const result = await deleteAccountAction(confirmEmail.trim());
      if (!result.ok) {
        toast.show(result.error ?? "Deletion failed — try again.", "error");
        return;
      }
      router.push("/login");
    });
  }

  return (
    <Panel className="flex flex-col gap-3">
      <h3 className="font-sans text-title font-semibold tracking-[-0.01em] text-ink">Delete account</h3>
      <p className="text-body-s text-ink-muted">
        Permanently deletes everything: every course, task, journal entry, review, check-in, kill-list habit and history,
        agent report, and every file you&apos;ve uploaded — including Vault-stored integration credentials. This cannot be
        undone. Download your data first if you want to keep it.
      </p>
      <div className="flex flex-col gap-2">
        <Input
          label={`Type your email (${userEmail}) to confirm`}
          value={confirmEmail}
          onChange={(e) => setConfirmEmail(e.target.value)}
          error={error}
        />
        <div>
          <Button variant="destructive" onClick={handleDelete} loading={isPending} disabled={!matches}>
            Permanently delete my account
          </Button>
        </div>
      </div>
    </Panel>
  );
}
