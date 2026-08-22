import type { BrightspaceFeedRow, IcsEventExtractionRow, IntegrationStatus, OAuthProvider } from "@collegeos/api";
import { color, space } from "@collegeos/design/native";
import { useState } from "react";
import { Text, View } from "react-native";
import { textStyle } from "../../design/typography";
import { confirmIcsEventAction, connectBrightspaceFeedAction, disconnectBrightspaceFeedAction, disconnectIntegrationAction } from "../../lib/settingsActions";
import { Badge, Button, Checkbox, Panel, Input } from "../ui";
import { useToast } from "../ui/ToastProvider";

const PROVIDER_LABEL: Record<OAuthProvider, string> = {
  whoop: "WHOOP",
  rescuetime: "RescueTime",
  google_calendar: "Google Calendar",
  microsoft: "Microsoft",
};

/** No real developer credentials exist for any provider in any environment this product
 *  has been built against -- there is no OAuth authorize/initiate flow to send a user
 *  to. Never fabricate a "Connect" button that goes nowhere; say plainly why it can't be
 *  used yet. Mirrors apps/web/src/components/settings/IntegrationsSection.tsx. */
const CONNECT_UNAVAILABLE_REASON: Record<OAuthProvider, string> = {
  whoop: "No WHOOP developer credentials are configured in this environment.",
  rescuetime: "No RescueTime API key is configured in this environment.",
  google_calendar: "This integration hasn't been built yet.",
  microsoft: "This integration hasn't been built yet.",
};

export function IntegrationsSection({
  userId,
  integrationStatuses,
  brightspaceFeed,
  pendingIcsEvents,
}: {
  userId: string;
  integrationStatuses: IntegrationStatus[];
  brightspaceFeed: Pick<BrightspaceFeedRow, "id" | "last_synced_at"> | null;
  pendingIcsEvents: IcsEventExtractionRow[];
}) {
  return (
    <View style={{ gap: space[3] }}>
      <BrightspaceCard userId={userId} feed={brightspaceFeed} />
      {pendingIcsEvents.length > 0 ? <PendingIcsEventsCard events={pendingIcsEvents} /> : null}
      {integrationStatuses.map((status) => (
        <OAuthProviderCard key={status.provider} userId={userId} status={status} />
      ))}
    </View>
  );
}

/** Mirrors apps/web/src/components/settings/IntegrationsSection.tsx's PendingIcsEventsCard
 *  exactly, including the "Couldn't save that decision: <reason>." error-wrapping fix from
 *  item 5's web pass -- never a bare SDK error string. */
function PendingIcsEventsCard({ events }: { events: IcsEventExtractionRow[] }) {
  const toast = useToast();
  const [decidedIds, setDecidedIds] = useState<Set<number>>(new Set());
  const [isClassMeetingById, setIsClassMeetingById] = useState<Record<number, boolean>>({});
  const [pendingId, setPendingId] = useState<number | null>(null);

  async function decide(event: IcsEventExtractionRow, decision: "confirmed" | "rejected") {
    setPendingId(event.id);
    try {
      const result = await confirmIcsEventAction(
        event.id,
        decision,
        isClassMeetingById[event.id] ?? false,
        event.course_id ?? undefined,
      );
      if (!result.ok) {
        toast.show(`Couldn't save that decision: ${result.error ?? "unknown error"}.`, "error");
        return;
      }
      setDecidedIds((prev) => new Set(prev).add(event.id));
      toast.show(decision === "confirmed" ? "Added to your calendar." : "Rejected.", "success");
    } catch (err) {
      toast.show(`Couldn't save that decision: ${err instanceof Error ? err.message : "unknown error"}.`, "error");
    } finally {
      setPendingId(null);
    }
  }

  const remaining = events.filter((e) => !decidedIds.has(e.id));

  return (
    <Panel style={{ gap: space[3] }}>
      <Text style={textStyle("body", color.ink)}>
        Pending Brightspace deadlines{remaining.length > 0 ? ` (${remaining.length})` : ""}
      </Text>
      <Text style={textStyle("caption", color.inkFaint)}>
        Staged from your synced feed. Nothing here is on your real calendar until you confirm it.
      </Text>
      {remaining.length === 0 ? (
        <Text style={textStyle("bodyS", color.inkFaint)}>Every staged deadline has been reviewed.</Text>
      ) : (
        <View style={{ gap: space[3] }}>
          {remaining.map((event) => {
            const isPending = pendingId === event.id;
            return (
              <View key={event.id} style={{ gap: space[2], borderRadius: 6, borderWidth: 1, borderColor: color.border, padding: space[3] }}>
                <Text style={textStyle("bodyS", color.ink)}>{event.summary}</Text>
                <Text style={textStyle("caption", color.inkFaint)}>
                  {event.is_all_day ? new Date(event.start_at).toISOString().slice(0, 10) : new Date(event.start_at).toLocaleString()}
                  {event.location ? ` · ${event.location}` : ""}
                </Text>
                <Checkbox
                  label="This is a class meeting (counts toward attendance)"
                  checked={isClassMeetingById[event.id] ?? false}
                  onValueChange={(checked) => setIsClassMeetingById((prev) => ({ ...prev, [event.id]: checked }))}
                />
                <View style={{ flexDirection: "row", gap: space[3] }}>
                  <Button variant="secondary" onPress={() => decide(event, "confirmed")} loading={isPending} disabled={isPending}>
                    Confirm
                  </Button>
                  <Button variant="ghost" onPress={() => decide(event, "rejected")} disabled={isPending}>
                    Reject
                  </Button>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Panel>
  );
}

function StatusBadge({ connected, status }: { connected: boolean; status: IntegrationStatus["connectionStatus"] }) {
  if (!connected) return <Badge tone="neutral">Not connected</Badge>;
  if (status === "active") return <Badge tone="accent">Connected</Badge>;
  if (status === "expired") return <Badge tone="neutral">Expired</Badge>;
  return <Badge tone="neutral">Revoked</Badge>;
}

function OAuthProviderCard({ userId, status }: { userId: string; status: IntegrationStatus }) {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const connected = status.connectionStatus === "active";

  async function handleDisconnect() {
    setPending(true);
    const result = await disconnectIntegrationAction(userId, status.provider);
    setPending(false);
    if (!result.ok) {
      toast.show(result.error ?? "Couldn't disconnect — try again.", "error");
      return;
    }
    toast.show(`${PROVIDER_LABEL[status.provider]} disconnected.`);
  }

  return (
    <Panel style={{ gap: space[2] }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[3] }}>
        <Text style={textStyle("body", color.ink)}>{PROVIDER_LABEL[status.provider]}</Text>
        <StatusBadge connected={connected} status={status.connectionStatus} />
      </View>
      {connected ? (
        <>
          <Text style={textStyle("caption", color.inkFaint)}>
            {status.lastSyncedLocalDate ? `Data through ${status.lastSyncedLocalDate}.` : "Connected, but no data synced yet."}
            {status.externalAccountId ? ` Account: ${status.externalAccountId}.` : ""}
          </Text>
          <Button variant="secondary" onPress={handleDisconnect} loading={pending}>
            Disconnect
          </Button>
        </>
      ) : (
        <Text style={textStyle("caption", color.inkFaint)}>{CONNECT_UNAVAILABLE_REASON[status.provider]}</Text>
      )}
    </Panel>
  );
}

function BrightspaceCard({ userId, feed }: { userId: string; feed: Pick<BrightspaceFeedRow, "id" | "last_synced_at"> | null }) {
  const toast = useToast();
  const [icsUrl, setIcsUrl] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const connected = feed != null;

  async function handleConnect() {
    setError(undefined);
    if (icsUrl.trim().length === 0) {
      setError("Paste your Brightspace calendar feed URL.");
      return;
    }
    setPending(true);
    const result = await connectBrightspaceFeedAction(userId, icsUrl.trim());
    setPending(false);
    if (!result.ok) {
      toast.show(result.error ?? "Couldn't connect — try again.", "error");
      return;
    }
    setIcsUrl("");
    toast.show("Brightspace connected.");
  }

  async function handleDisconnect() {
    setPending(true);
    const result = await disconnectBrightspaceFeedAction(userId);
    setPending(false);
    if (!result.ok) {
      toast.show(result.error ?? "Couldn't disconnect — try again.", "error");
      return;
    }
    toast.show("Brightspace disconnected.");
  }

  return (
    <Panel style={{ gap: space[2] }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[3] }}>
        <Text style={textStyle("body", color.ink)}>Brightspace calendar feed</Text>
        <StatusBadge connected={connected} status={connected ? "active" : null} />
      </View>
      {connected ? (
        <>
          <Text style={textStyle("caption", color.inkFaint)}>
            {feed.last_synced_at ? `Last synced ${new Date(feed.last_synced_at).toLocaleString()}.` : "Connected, but never synced yet."}
          </Text>
          <Button variant="secondary" onPress={handleDisconnect} loading={pending}>
            Disconnect
          </Button>
        </>
      ) : (
        <View style={{ gap: space[2] }}>
          <Text style={textStyle("caption", color.inkFaint)}>
            Paste your Brightspace calendar feed (iCal) URL. Extracted deadlines are always staged for your confirmation
            before they become real — nothing from this feed is added to your calendar automatically.
          </Text>
          <Input value={icsUrl} onChangeText={setIcsUrl} placeholder="https://..." autoCapitalize="none" error={error} />
          <Button onPress={handleConnect} loading={pending}>
            Connect
          </Button>
        </View>
      )}
    </Panel>
  );
}
