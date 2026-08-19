import type { BrightspaceFeedRow, IntegrationStatus, OAuthProvider } from "@collegeos/api";
import { color, space } from "@collegeos/design/native";
import { useState } from "react";
import { Text, View } from "react-native";
import { textStyle } from "../../design/typography";
import { connectBrightspaceFeedAction, disconnectBrightspaceFeedAction, disconnectIntegrationAction } from "../../lib/settingsActions";
import { Badge, Button, Input, Panel } from "../ui";
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
}: {
  userId: string;
  integrationStatuses: IntegrationStatus[];
  brightspaceFeed: Pick<BrightspaceFeedRow, "id" | "last_synced_at"> | null;
}) {
  return (
    <View style={{ gap: space[3] }}>
      <BrightspaceCard userId={userId} feed={brightspaceFeed} />
      {integrationStatuses.map((status) => (
        <OAuthProviderCard key={status.provider} userId={userId} status={status} />
      ))}
    </View>
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
