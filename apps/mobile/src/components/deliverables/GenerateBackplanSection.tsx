import { color, space } from "@collegeos/design/native";
import { useState } from "react";
import { Text, View } from "react-native";
import { BackplanChain } from "../courses/BackplanChain";
import { Button, FieldError, Panel } from "../ui";
import { useToast } from "../ui/ToastProvider";
import { textStyle } from "../../design/typography";
import { generateBackplanAction } from "../../lib/deliverableActions";
import type { BackplanChain as BackplanChainData } from "../../lib/loadBackplanChains";

/** Mirrors apps/web/src/components/deliverables/GenerateBackplanSection.tsx exactly,
 *  including the conflict-confirmation step before discarding a partly-done plan. */
export function GenerateBackplanSection({
  userId,
  deliverableId,
  chain,
  onGenerated,
}: {
  userId: string;
  deliverableId: number;
  chain: BackplanChainData | undefined;
  onGenerated: () => void;
}) {
  const toast = useToast();
  const [confirmingForce, setConfirmingForce] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  async function generate(force: boolean) {
    setError(undefined);
    setIsPending(true);
    const result = await generateBackplanAction(userId, deliverableId, force);
    setIsPending(false);
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
    onGenerated();
  }

  return (
    <Panel style={{ gap: space[3] }}>
      {chain ? (
        <>
          <BackplanChain chain={chain} />
          {confirmingForce ? (
            <View style={{ gap: space[2], borderRadius: 6, borderWidth: 1, borderColor: color.riskHigh, backgroundColor: color.riskHighWash, padding: space[3] }}>
              <Text style={textStyle("bodyS", color.riskHigh)}>
                This plan has milestones already marked done. Regenerating replaces the whole plan and discards that progress.
              </Text>
              <View style={{ flexDirection: "row", gap: space[3] }}>
                <Button variant="destructive" onPress={() => generate(true)} loading={isPending}>
                  Regenerate anyway
                </Button>
                <Button variant="ghost" onPress={() => setConfirmingForce(false)} disabled={isPending}>
                  Cancel
                </Button>
              </View>
            </View>
          ) : (
            <View style={{ alignSelf: "flex-start" }}>
              <Button variant="secondary" onPress={() => generate(false)} loading={isPending}>
                Regenerate backplan
              </Button>
            </View>
          )}
        </>
      ) : (
        <>
          <Text style={textStyle("bodyS", color.inkFaint)}>No backplan generated yet.</Text>
          <View style={{ alignSelf: "flex-start" }}>
            <Button variant="secondary" onPress={() => generate(false)} loading={isPending}>
              Generate backplan
            </Button>
          </View>
        </>
      )}
      {error ? <FieldError>{error}</FieldError> : null}
    </Panel>
  );
}
