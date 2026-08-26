import { listCourses, type CanvasCourseLinkInput, type CanvasCourseOption, type CanvasStatus, type Course } from "@collegeos/api";
import { color, space } from "@collegeos/design/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { textStyle } from "../../design/typography";
import {
  connectCanvasAction,
  disconnectCanvasAction,
  loadCanvasStatus,
  saveCanvasLinksAction,
  syncCanvasNowAction,
} from "../../lib/canvasActions";
import { getMobileSupabaseClient } from "../../lib/supabase/client";
import { Badge, Button, Input, Panel, Select } from "../ui";
import { useToast } from "../ui/ToastProvider";

/**
 * Canvas connect + course mapping + poll (docs/CANVAS_AUDIT.md §4.1-4.2). The token
 * field is a pass-through to Vault -- never stored, previewed, or echoed here. The
 * mapping picker is the human confirmation the audit requires: every Canvas course is
 * matched to a local course by the user, or deliberately left unlinked.
 */
export function CanvasSection({ userId }: { userId: string }) {
  const toast = useToast();
  const router = useRouter();
  const [status, setStatus] = useState<CanvasStatus | null>(null);
  const [courses, setCourses] = useState<Pick<Course, "id" | "code">[]>([]);
  const [baseUrl, setBaseUrl] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set after a successful connect: the Canvas course list to map against.
  const [canvasCourses, setCanvasCourses] = useState<CanvasCourseOption[] | null>(null);
  const [picks, setPicks] = useState<Record<number, number | null>>({});

  const refresh = useCallback(async () => {
    const [statusResult, coursesResult] = await Promise.all([
      loadCanvasStatus(userId),
      listCourses(getMobileSupabaseClient()),
    ]);
    if (statusResult.ok) setStatus(statusResult.data);
    if (coursesResult.ok) setCourses(coursesResult.data);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onConnect = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await connectCanvasAction(baseUrl.trim(), token.trim());
    setBusy(false);
    setToken("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.show(`Connected as ${result.data.canvasUser}. Now map your courses.`, "success");
    setCanvasCourses(result.data.courses);
    await refresh();
  }, [baseUrl, token, toast, refresh]);

  const onSaveLinks = useCallback(async () => {
    if (canvasCourses == null) return;
    const links: CanvasCourseLinkInput[] = [];
    for (const canvasCourse of canvasCourses) {
      const localCourseId = picks[canvasCourse.id];
      if (localCourseId != null) {
        links.push({ courseId: localCourseId, canvasCourseId: canvasCourse.id, canvasCourseName: canvasCourse.name });
      }
    }
    setBusy(true);
    setError(null);
    const result = await saveCanvasLinksAction(links);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.show(`Mapped ${result.data.saved} course${result.data.saved === 1 ? "" : "s"}.`, "success");
    setCanvasCourses(null);
    await refresh();
  }, [canvasCourses, picks, toast, refresh]);

  const onSync = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await syncCanvasNowAction();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.data.kind !== "polled") {
      setError(
        result.data.kind === "noLinks"
          ? "No courses mapped yet — connect and map first."
          : result.data.kind === "noToken"
            ? "No token stored — reconnect."
            : "Not connected yet.",
      );
      return;
    }
    const d = result.data;
    toast.show(
      d.staged === 0
        ? "Nothing new."
        : `${d.staged} new announcement${d.staged === 1 ? "" : "s"} staged, ${d.parsed} parsed.` +
            (d.skippedUnmapped > 0 ? ` ${d.skippedUnmapped} skipped (unmapped course).` : ""),
      "success",
    );
    await refresh();
  }, [toast, refresh]);

  const onDisconnect = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await disconnectCanvasAction(userId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.show("Canvas disconnected. The token is deleted.", "success");
    setCanvasCourses(null);
    await refresh();
  }, [userId, toast, refresh]);

  const connected = status?.connection != null;

  return (
    <Panel style={{ gap: space[3] }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={textStyle("body", color.ink)}>Canvas</Text>
        {connected ? <Badge tone="accent">Connected</Badge> : <Badge tone="neutral">Not connected</Badge>}
      </View>

      {error != null ? <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text> : null}

      {!connected || canvasCourses == null ? null : (
        <View style={{ gap: space[3] }}>
          <Text style={textStyle("caption", color.inkFaint)}>
            Match each Canvas course to one of yours, or leave it unmapped to ignore it.
          </Text>
          {canvasCourses.map((canvasCourse) => (
            <Select
              key={canvasCourse.id}
              label={canvasCourse.name}
              options={[
                { value: "", label: "Not mapped" },
                ...courses.map((c) => ({ value: String(c.id), label: c.code })),
              ]}
              value={picks[canvasCourse.id] != null ? String(picks[canvasCourse.id]) : ""}
              onValueChange={(v) =>
                setPicks((prev) => ({ ...prev, [canvasCourse.id]: v === "" ? null : Number(v) }))
              }
            />
          ))}
          <Button onPress={onSaveLinks} loading={busy} disabled={busy}>
            Save mapping
          </Button>
        </View>
      )}

      {!connected ? (
        <View style={{ gap: space[3] }}>
          <Text style={textStyle("caption", color.inkFaint)}>
            Personal access token, not a school login: Canvas → Account → Settings → New access token.
            It goes straight to encrypted storage.
          </Text>
          <Input
            label="Canvas URL"
            value={baseUrl}
            onChangeText={setBaseUrl}
            placeholder="https://school.instructure.com"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
          />
          <Input
            label="Access token"
            value={token}
            onChangeText={setToken}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
          />
          <Button onPress={onConnect} loading={busy} disabled={busy || baseUrl.trim() === "" || token.trim() === ""}>
            Connect Canvas
          </Button>
        </View>
      ) : (
        <View style={{ gap: space[3] }}>
          <Text style={textStyle("caption", color.inkFaint)}>
            {status!.links.length === 0
              ? "No courses mapped yet — reconnect to fetch the course list, then map."
              : `${status!.links.length} course${status!.links.length === 1 ? "" : "s"} mapped · ` +
                (status!.connection!.last_polled_at != null
                  ? `last poll ${new Date(status!.connection!.last_polled_at).toLocaleString()}`
                  : "never polled")}
          </Text>
          <View style={{ flexDirection: "row", gap: space[3], flexWrap: "wrap" }}>
            <Button variant="secondary" onPress={onSync} loading={busy} disabled={busy}>
              Sync now
            </Button>
            <Button variant="secondary" onPress={() => router.push("/announcements")} disabled={busy}>
              Review announcements
            </Button>
            <Button variant="ghost" onPress={onDisconnect} disabled={busy}>
              Disconnect
            </Button>
          </View>
        </View>
      )}
    </Panel>
  );
}
