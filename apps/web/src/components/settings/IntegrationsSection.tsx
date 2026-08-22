"use client";

import type { BrightspaceFeedRow, IcsEventExtractionRow, IntegrationStatus, OAuthProvider } from "@collegeos/api";
import { useState, useTransition } from "react";
import {
  confirmIcsEventAction,
  connectBrightspaceFeedAction,
  disconnectBrightspaceFeedAction,
  disconnectIntegrationAction,
} from "@/app/(app)/settings/actions";
import { Badge, Button, Checkbox, Panel, Input } from "@/components/ui";
import { useToast } from "@/components/ui/ToastProvider";

const PROVIDER_LABEL: Record<OAuthProvider, string> = {
  whoop: "WHOOP",
  rescuetime: "RescueTime",
  google_calendar: "Google Calendar",
  microsoft: "Microsoft",
};

/** No real developer credentials exist for any provider in any environment this product
 *  has been built against (docs/SUPABASE_SETUP.md's own WHOOP/RescueTime sections say so
 *  explicitly) -- there is no OAuth authorize/initiate flow to send a user to. Never
 *  fabricate a "Connect" button that goes nowhere; say plainly why it can't be used yet. */
const CONNECT_UNAVAILABLE_REASON: Record<OAuthProvider, string> = {
  whoop: "No WHOOP developer credentials are configured in this environment.",
  rescuetime: "No RescueTime API key is configured in this environment.",
  google_calendar: "This integration hasn't been built yet.",
  microsoft: "This integration hasn't been built yet.",
};

export function IntegrationsSection({
  integrationStatuses,
  brightspaceFeed,
  pendingIcsEvents,
}: {
  integrationStatuses: IntegrationStatus[];
  brightspaceFeed: Pick<BrightspaceFeedRow, "id" | "last_synced_at"> | null;
  pendingIcsEvents: IcsEventExtractionRow[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <BrightspaceCard feed={brightspaceFeed} />
      {pendingIcsEvents.length > 0 ? <PendingIcsEventsCard events={pendingIcsEvents} /> : null}
      {integrationStatuses.map((status) => (
        <OAuthProviderCard key={status.provider} status={status} />
      ))}
    </div>
  );
}

function PendingIcsEventsCard({ events }: { events: IcsEventExtractionRow[] }) {
  const toast = useToast();
  const [decidedIds, setDecidedIds] = useState<Set<number>>(new Set());
  const [isClassMeetingById, setIsClassMeetingById] = useState<Record<number, boolean>>({});
  const [isPending, startTransition] = useTransition();

  function decide(event: IcsEventExtractionRow, decision: "confirmed" | "rejected") {
    startTransition(async () => {
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
        // A thrown server error (Edge Function unreachable, etc.) must still surface as
        // a real, visible outcome -- never a silent no-op that leaves the item sitting
        // there with no explanation.
        toast.show(`Couldn't save that decision: ${err instanceof Error ? err.message : "unknown error"}.`, "error");
      }
    });
  }

  const remaining = events.filter((e) => !decidedIds.has(e.id));

  return (
    <Panel className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-body font-medium text-ink">
          Pending Brightspace deadlines {remaining.length > 0 ? `(${remaining.length})` : ""}
        </span>
      </div>
      <p className="text-caption text-ink-faint">
        Staged from your synced feed. Nothing here is on your real calendar until you confirm it.
      </p>
      {remaining.length === 0 ? (
        <p className="text-body-s text-ink-faint">Every staged deadline has been reviewed.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {remaining.map((event) => (
            <li key={event.id} className="flex flex-col gap-2 rounded-md border border-border p-3">
              <span className="text-body-s text-ink">{event.summary}</span>
              <span className="font-mono text-caption tabular-nums text-ink-faint">
                {event.is_all_day
                  ? new Date(event.start_at).toISOString().slice(0, 10)
                  : new Date(event.start_at).toLocaleString()}
                {event.location ? ` · ${event.location}` : ""}
              </span>
              <Checkbox
                label="This is a class meeting (counts toward attendance)"
                checked={isClassMeetingById[event.id] ?? false}
                onChange={(checked) => setIsClassMeetingById((prev) => ({ ...prev, [event.id]: checked }))}
              />
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => decide(event, "confirmed")} loading={isPending} disabled={isPending}>
                  Confirm
                </Button>
                <Button variant="ghost" onClick={() => decide(event, "rejected")} disabled={isPending}>
                  Reject
                </Button>
              </div>
            </li>
          ))}
        </ul>
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

function OAuthProviderCard({ status }: { status: IntegrationStatus }) {
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const connected = status.connectionStatus === "active";
  const unavailableReason = CONNECT_UNAVAILABLE_REASON[status.provider];

  function handleDisconnect() {
    startTransition(async () => {
      const result = await disconnectIntegrationAction(status.provider);
      if (!result.ok) {
        toast.show(result.error ?? "Couldn't disconnect — try again.", "error");
        return;
      }
      toast.show(`${PROVIDER_LABEL[status.provider]} disconnected.`);
    });
  }

  return (
    <Panel className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-body font-medium text-ink">{PROVIDER_LABEL[status.provider]}</span>
        <StatusBadge connected={connected} status={status.connectionStatus} />
      </div>
      {connected ? (
        <>
          <p className="text-caption text-ink-faint">
            {status.lastSyncedLocalDate ? `Data through ${status.lastSyncedLocalDate}.` : "Connected, but no data synced yet."}
            {status.externalAccountId ? ` Account: ${status.externalAccountId}.` : ""}
          </p>
          <div>
            <Button variant="secondary" onClick={handleDisconnect} loading={isPending}>
              Disconnect
            </Button>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-caption text-ink-faint">{unavailableReason}</p>
          <Button variant="secondary" disabled title={unavailableReason}>
            Connect
          </Button>
        </div>
      )}
    </Panel>
  );
}

function BrightspaceCard({ feed }: { feed: Pick<BrightspaceFeedRow, "id" | "last_synced_at"> | null }) {
  const toast = useToast();
  const [icsUrl, setIcsUrl] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();
  const connected = feed != null;

  function handleConnect() {
    setError(undefined);
    if (icsUrl.trim().length === 0) {
      setError("Paste your Brightspace calendar feed URL.");
      return;
    }
    startTransition(async () => {
      const result = await connectBrightspaceFeedAction(icsUrl.trim());
      if (!result.ok) {
        toast.show(result.error ?? "Couldn't connect — try again.", "error");
        return;
      }
      setIcsUrl("");
      toast.show("Brightspace connected.");
    });
  }

  function handleDisconnect() {
    startTransition(async () => {
      const result = await disconnectBrightspaceFeedAction();
      if (!result.ok) {
        toast.show(result.error ?? "Couldn't disconnect — try again.", "error");
        return;
      }
      toast.show("Brightspace disconnected.");
    });
  }

  return (
    <Panel className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-body font-medium text-ink">Brightspace calendar feed</span>
        <StatusBadge connected={connected} status={connected ? "active" : null} />
      </div>
      {connected ? (
        <>
          <p className="text-caption text-ink-faint">
            {feed.last_synced_at ? `Last synced ${new Date(feed.last_synced_at).toLocaleString()}.` : "Connected, but never synced yet."}
          </p>
          <div>
            <Button variant="secondary" onClick={handleDisconnect} loading={isPending}>
              Disconnect
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-caption text-ink-faint">
            Paste your Brightspace calendar feed (iCal) URL. Extracted deadlines are always staged for your confirmation
            before they become real — nothing from this feed is added to your calendar automatically.
          </p>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input value={icsUrl} onChange={(e) => setIcsUrl(e.target.value)} placeholder="https://..." error={error} />
            </div>
            <Button onClick={handleConnect} loading={isPending}>
              Connect
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
