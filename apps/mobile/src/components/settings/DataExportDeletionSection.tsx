import { color, space } from "@collegeos/design/native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Share, Text, View } from "react-native";
import { textStyle } from "../../design/typography";
import { deleteAccountAction, exportAccountAction } from "../../lib/settingsActions";
import { signOut } from "@collegeos/api";
import { getMobileSupabaseClient } from "../../lib/supabase/client";
import { Button, Input, Panel } from "../ui";
import { useToast } from "../ui/ToastProvider";

export function DataExportDeletionSection({ userEmail }: { userEmail: string }) {
  return (
    <View style={{ gap: space[4] }}>
      <ExportCard />
      <DeleteCard userEmail={userEmail} />
    </View>
  );
}

function ExportCard() {
  const toast = useToast();
  const [pending, setPending] = useState(false);

  async function handleExport() {
    setPending(true);
    const result = await exportAccountAction();
    setPending(false);
    if (!result.ok) {
      toast.show(result.error ?? "Export failed — try again.", "error");
      return;
    }
    // No expo-file-system/expo-sharing dependency in this app yet -- the native Share
    // sheet (built into React Native, no new install) lets the user save the JSON to
    // Files, AirDrop it, or send it to themselves. A file-based download would need
    // those two packages added; this is the dependency-free equivalent for now.
    try {
      await Share.share({ title: "CollegeOS data export", message: JSON.stringify(result.data, null, 2) });
    } catch {
      toast.show("Couldn't open the share sheet — try again.", "error");
      return;
    }
    toast.show("Export ready to save.");
  }

  return (
    <Panel style={{ gap: space[2] }}>
      <Text style={textStyle("title", color.ink)}>Export your data</Text>
      <Text style={textStyle("bodyS", color.inkMuted)}>
        Shares everything: your courses, tasks, journals, check-ins and reviews, focus sessions, kill-list history, and
        every interpretation the system has formed about you — including agent reports and the insights derived from your
        behavior. Not just the raw records.
      </Text>
      <Button variant="secondary" onPress={handleExport} loading={pending}>
        Share my data (JSON)
      </Button>
    </Panel>
  );
}

function DeleteCard({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const toast = useToast();
  const [confirmEmail, setConfirmEmail] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const matches = confirmEmail.trim().toLowerCase() === userEmail.toLowerCase();

  async function handleDelete() {
    setError(undefined);
    if (!matches) {
      setError("Type your email exactly to confirm.");
      return;
    }
    setPending(true);
    const result = await deleteAccountAction(confirmEmail.trim());
    setPending(false);
    if (!result.ok) {
      toast.show(result.error ?? "Deletion failed — try again.", "error");
      return;
    }
    await signOut(getMobileSupabaseClient());
    router.replace("/login");
  }

  return (
    <Panel style={{ gap: space[3] }}>
      <Text style={textStyle("title", color.ink)}>Delete account</Text>
      <Text style={textStyle("bodyS", color.inkMuted)}>
        Permanently deletes everything: every course, task, journal entry, review, check-in, kill-list habit and history,
        agent report, and every file you&apos;ve uploaded — including Vault-stored integration credentials. This cannot be
        undone. Export your data first if you want to keep it.
      </Text>
      <View style={{ gap: space[2] }}>
        <Input
          label={`Type your email (${userEmail}) to confirm`}
          value={confirmEmail}
          onChangeText={setConfirmEmail}
          autoCapitalize="none"
          error={error}
        />
        <Button variant="destructive" onPress={handleDelete} loading={pending} disabled={!matches}>
          Permanently delete my account
        </Button>
      </View>
    </Panel>
  );
}
