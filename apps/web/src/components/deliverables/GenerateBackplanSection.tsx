"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BackplanChain } from "@/components/courses/BackplanChain";
import { Button, Panel } from "@/components/ui";
import { useToast } from "@/components/ui/ToastProvider";
import { generateBackplanAction } from "@/app/(app)/deliverables/[id]/actions";
import type { BackplanChain as BackplanChainData } from "@/lib/loadBackplanChains";

export function GenerateBackplanSection({ deliverableId, chain }: { deliverableId: number; chain: BackplanChainData | undefined }) {
  const router = useRouter();
  const toast = useToast();
  const [confirmingForce, setConfirmingForce] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function generate(force: boolean) {
    setError(undefined);
    startTransition(async () => {
      const result = await generateBackplanAction(deliverableId, force);
      if (!result.ok) {
        if (result.conflict) {
          setConfirmingForce(true);
          return;
        }
        setError(result.error);
        return;
      }
      setConfirmingForce(false);
      toast.show(force ? "Backplan regenerated." : "Backplan generated.", "success");
      router.refresh();
    });
  }

  return (
    <Panel className="flex flex-col gap-3">
      {chain ? (
        <>
          <BackplanChain chain={chain} />
          {confirmingForce ? (
            <div className="flex flex-col gap-2 rounded-md border border-risk-high bg-risk-high-wash p-3">
              <p className="text-body-s text-risk-high">
                This plan has milestones already marked done. Regenerating replaces the whole plan and discards that progress.
              </p>
              <div className="flex gap-3">
                <Button variant="destructive" onClick={() => generate(true)} loading={isPending}>
                  Regenerate anyway
                </Button>
                <Button variant="ghost" onClick={() => setConfirmingForce(false)} disabled={isPending}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => generate(false)} loading={isPending} className="self-start">
              Regenerate backplan
            </Button>
          )}
        </>
      ) : (
        <>
          <p className="text-body-s text-ink-faint">No backplan generated yet.</p>
          <Button variant="secondary" onClick={() => generate(false)} loading={isPending} className="self-start">
            Generate backplan
          </Button>
        </>
      )}
      {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}
    </Panel>
  );
}
