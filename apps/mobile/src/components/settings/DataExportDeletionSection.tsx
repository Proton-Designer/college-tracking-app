import { color, space } from "@collegeos/design/native";
import { useRouter } from "expo-router";
import { File, Paths } from "expo-file-system";
import { useState } from "react";
import { Platform, Share, Text, View } from "react-native";
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
    // Sharing the JSON as a plain string (Share.share({message})) doesn't reliably
    // offer a real "Save to Files" action -- the share sheet infers actions from the
    // item's type, and a bare string mostly surfaces Mail/Messages/Notes/Copy, not a
    // file save. Writing a real file first and sharing its URL is what actually lets
    // the user keep the export, confirmed against a real demo-account export (~220KB,
    // 45 tables) -- see docs/FOLLOWUPS.md.
    //
    // iOS-only: RN's Share module documents `url` as an iOS content key; Android's
    // share intent only takes `title`/`message` through this API (real file-attachment
    // sharing on Android needs a FileProvider content:// URI, which is expo-sharing's
    // job, not installed here -- see docs/FOLLOWUPS.md for the platform gap this
    // leaves: Android users get the JSON as share text, not a saved file).
    //
    // The cache copy is transient, deleted in `finally` regardless of outcome. This file
    // is the user's entire personal record -- journals, grades, kill-list history, every
    // interpretation the system has formed about them -- so it must not sit on disk under
    // a predictable name after the share sheet closes, and it must not outlive an account
    // deletion the user believes erased everything. Share.share() only resolves after the
    // sheet is dismissed, so if the user chose "Save to Files" their own copy already
    // exists elsewhere by the time this deletes the temp one.
    let tempFile: File | null = null;
    try {
      if (Platform.OS === "ios") {
        tempFile = new File(Paths.cache, `collegeos-export-${result.data.exportedAt.slice(0, 10)}.json`);
        tempFile.create({ overwrite: true });
        tempFile.write(JSON.stringify(result.data, null, 2));
        await Share.share({ title: "Ihsan data export", url: tempFile.uri });
      } else {
        await Share.share({ title: "Ihsan data export", message: JSON.stringify(result.data, null, 2) });
      }
    } catch {
      toast.show("Couldn't open the share sheet — try again.", "error");
      return;
    } finally {
      try {
        tempFile?.delete();
      } catch {
        // Best-effort cleanup -- nothing more to do if it's already gone or unwritable.
      }
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
