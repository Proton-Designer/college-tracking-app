import {
  VISION_MANDATES,
  VISION_MANDATE_LABELS,
  type VisionChainView,
  type VisionMandate,
} from "@collegeos/api";
import { CHAIN_LAYER_LABELS, type ChainLayer } from "@collegeos/core";
import { color, radius, space } from "@collegeos/design/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Aurora, Badge, Button, DatePicker, EmptyState, Input, NavLink, Panel, Textarea } from "../components/ui";
import { textStyle } from "../design/typography";
import { useAuthSession } from "../lib/useAuthSession";
import {
  loadVision,
  saveBeachheadAction,
  saveMissionAction,
  saveMomAction,
  saveVisionAction,
  setGoalAnchorAction,
  setTaskAnchorAction,
} from "../lib/visionActions";

/**
 * The vision chain, mobile (D48). Mirrors apps/web/src/components/vision/VisionClient.tsx section
 * for section and word for word; both call `loadVisionChain`, so neither platform decides anything
 * about the chain on its own (Law 2).
 *
 * **A stack screen, not a tab.** The dock is five destinations and it is full — see
 * `(tabs)/_layout.tsx`'s header comment for why a sixth would not be an addition but a
 * replacement. Vision is reached from Today's Work Engine links, the same way the War Map it sits
 * above is.
 *
 * **Nothing is seeded (D40).** Four layers, four empty invitations on a first run, each saying
 * what the layer is for rather than showing a placeholder. A M.O.M. with no end date shows no
 * countdown at all — not a zero.
 *
 * **Drift is a count with its items, never a verdict.** No risk colour is used anywhere on this
 * screen and none should be added: the sentence comes from core's `driftLine`, and the door beside
 * each item is offered without the app implying which way to walk through it.
 */

/** Top down — the order the chain is read in. */
const LAYERS: ChainLayer[] = ["vision", "beachhead", "mission", "mom"];
/** Bottom up — the order the resolver walks, which is what `firstMissing` is expressed in. */
const UPWARD: ChainLayer[] = ["mom", "mission", "beachhead", "vision"];

const OUTCOME_WORDS: Record<string, string> = {
  hit: "Hit",
  partial: "Partial",
  missed: "Missed",
  changed: "Changed",
};

function Connector({ connected }: { connected: boolean }) {
  return (
    <View style={styles.connectorRow}>
      <View
        style={[
          styles.connector,
          connected
            ? { borderColor: color.accent, borderStyle: "solid" }
            : { borderColor: color.border, borderStyle: "dashed" },
        ]}
      />
      {!connected ? <Text style={textStyle("label", color.inkMuted)}>NOT LINKED YET</Text> : null}
    </View>
  );
}

function LayerPanel({ layer, children }: { layer: ChainLayer; children: ReactNode }) {
  return (
    <Panel>
      <View style={styles.panelGap}>
        <Text style={textStyle("label", color.inkMuted)}>{CHAIN_LAYER_LABELS[layer].toUpperCase()}</Text>
        {children}
      </View>
    </Panel>
  );
}

function metaLine(target: string | null, startsOn: string | null, endsOn: string | null): string | null {
  const window =
    startsOn == null && endsOn == null ? null : `${startsOn ?? "no start date"} → ${endsOn ?? "no end date"}`;
  const parts = [target, window].filter((p): p is string => p != null);
  return parts.length === 0 ? null : parts.join(" · ");
}

export default function VisionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user.id ?? null;

  const [view, setView] = useState<VisionChainView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<ChainLayer | null>(null);

  const refresh = useCallback(async () => {
    if (userId == null) return;
    const result = await loadVision(userId);
    if (result.ok) {
      setView(result.data);
      setError(null);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async (action: () => Promise<{ ok: boolean; error?: string }>, fallback: string) => {
      setBusy(true);
      setError(null);
      const result = await action();
      if (!result.ok) {
        setBusy(false);
        setError(result.error ?? fallback);
        return;
      }
      setEditing(null);
      await refresh();
      setBusy(false);
    },
    [refresh],
  );

  // The link out of a layer is real exactly when the layer above it was reached before the
  // resolver stopped. `firstMissing` names where it stopped.
  function linkedUpFrom(layer: ChainLayer): boolean {
    if (view?.firstMissing == null) return true;
    return UPWARD.indexOf(layer) + 1 < UPWARD.indexOf(view.firstMissing);
  }

  return (
    <View style={styles.screen}>
      <Aurora band={null} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[8] },
        ]}
      >
        <NavLink label="Today" onPress={() => router.back()} />

        <Text style={textStyle("displayM", color.ink)}>Vision</Text>
        <Text style={textStyle("bodyS", color.inkMuted)}>
          Ten years, three years, one year, ninety days. Each layer links to the one above it when
          there is a link to make.
        </Text>

        {error != null ? (
          <Panel>
            <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text>
          </Panel>
        ) : null}

        {loading || view == null ? (
          <Text style={textStyle("bodyS", color.inkMuted)}>Loading…</Text>
        ) : (
          <>
            {view.reviewDue ? (
              <Panel>
                <View style={styles.panelGap}>
                  <Text style={textStyle("label", color.inkMuted)}>THE 90 DAYS ARE UP</Text>
                  <Text style={textStyle("bodyS", color.inkMuted)}>
                    Score this M.O.M. on its own terms, write what happened, and set the next one
                    when you are ready to.
                  </Text>
                  <Button variant="secondary" onPress={() => router.push("/vision-review")}>
                    Open the 90-day review
                  </Button>
                </View>
              </Panel>
            ) : null}

            {LAYERS.map((layer, index) => (
              <View key={layer}>
                {index > 0 ? <Connector connected={linkedUpFrom(layer)} /> : null}
                <LayerPanel layer={layer}>
                  {layer === "vision" ? (
                    <VisionLayer
                      view={view}
                      editing={editing === "vision"}
                      busy={busy}
                      onEdit={() => setEditing("vision")}
                      onCancel={() => setEditing(null)}
                      onSave={(input) =>
                        void run(
                          () => saveVisionAction(userId as string, input),
                          "Could not save the vision.",
                        )
                      }
                    />
                  ) : null}

                  {layer === "beachhead" ? (
                    <ChainNodeLayer
                      title={view.beachhead?.title ?? null}
                      target={view.beachhead?.target ?? null}
                      startsOn={view.beachhead?.starts_on ?? null}
                      endsOn={view.beachhead?.ends_on ?? null}
                      linkedParentId={view.beachhead?.vision_id ?? null}
                      parentId={view.vision?.id ?? null}
                      parentLabel={CHAIN_LAYER_LABELS.vision.toLowerCase()}
                      emptyTitle="No three-year beachhead yet"
                      emptyDescription="A beachhead is the position you have to be holding in three years for the ten-year vision to still be reachable. One at a time — it is a foothold, not a list."
                      writeLabel="Write the beachhead"
                      editing={editing === "beachhead"}
                      busy={busy}
                      onEdit={() => setEditing("beachhead")}
                      onCancel={() => setEditing(null)}
                      onSave={(input) =>
                        void run(
                          () =>
                            saveBeachheadAction(
                              userId as string,
                              view.beachhead == null ? input : { ...input, id: view.beachhead.id },
                            ),
                          "Could not save the beachhead.",
                        )
                      }
                    />
                  ) : null}

                  {layer === "mission" ? (
                    <ChainNodeLayer
                      title={view.mission?.title ?? null}
                      target={view.mission?.target ?? null}
                      startsOn={view.mission?.starts_on ?? null}
                      endsOn={view.mission?.ends_on ?? null}
                      linkedParentId={view.mission?.beachhead_id ?? null}
                      parentId={view.beachhead?.id ?? null}
                      parentLabel={CHAIN_LAYER_LABELS.beachhead.toLowerCase()}
                      emptyTitle="No one-year mission yet"
                      emptyDescription="The mission is what this year has to produce for the beachhead to be taken. One year, one mission."
                      writeLabel="Write the mission"
                      editing={editing === "mission"}
                      busy={busy}
                      onEdit={() => setEditing("mission")}
                      onCancel={() => setEditing(null)}
                      onSave={(input) =>
                        void run(
                          () =>
                            saveMissionAction(
                              userId as string,
                              view.mission == null ? input : { ...input, id: view.mission.id },
                            ),
                          "Could not save the mission.",
                        )
                      }
                    />
                  ) : null}

                  {layer === "mom" ? (
                    <>
                      <ChainNodeLayer
                        title={view.mom?.title ?? null}
                        target={view.mom?.target ?? null}
                        startsOn={view.mom?.starts_on ?? null}
                        endsOn={view.mom?.ends_on ?? null}
                        linkedParentId={view.mom?.mission_id ?? null}
                        parentId={view.mission?.id ?? null}
                        parentLabel={CHAIN_LAYER_LABELS.mission.toLowerCase()}
                        emptyTitle="No 90-day M.O.M. yet"
                        emptyDescription="The M.O.M. is the one measurable outcome the next ninety days are for. Give it an end date and this screen counts down to it; leave the date off and there is simply no countdown."
                        writeLabel="Set the M.O.M."
                        editing={editing === "mom"}
                        busy={busy}
                        onEdit={() => setEditing("mom")}
                        onCancel={() => setEditing(null)}
                        onSave={(input) =>
                          void run(
                            () =>
                              saveMomAction(
                                userId as string,
                                view.mom == null ? input : { ...input, id: view.mom.id },
                              ),
                            "Could not save the M.O.M.",
                          )
                        }
                      />
                      {view.mom != null ? <Countdown view={view} /> : null}
                    </>
                  ) : null}
                </LayerPanel>
              </View>
            ))}

            <Panel title="The War Map, under the M.O.M.">
              <View style={styles.panelGap}>
                {view.goals.length === 0 ? (
                  <Text style={textStyle("bodyS", color.inkMuted)}>
                    No active goals yet. The War Map is where they are written.
                  </Text>
                ) : (
                  view.goals.map(({ goal, anchored }) => (
                    <View key={goal.id} style={styles.row}>
                      <Text style={[textStyle("body", color.ink), styles.rowTitle]}>{goal.title}</Text>
                      {anchored ? (
                        <Badge tone="accent">Serves the M.O.M.</Badge>
                      ) : (
                        <Text style={textStyle("label", color.inkMuted)}>NOT LINKED</Text>
                      )}
                      {view.mom != null ? (
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onPress={() =>
                            void run(
                              () =>
                                setGoalAnchorAction(
                                  userId as string,
                                  goal.id,
                                  anchored ? null : (view.mom?.id ?? null),
                                ),
                              "Could not change what that goal answers to.",
                            )
                          }
                        >
                          {anchored ? "Unlink" : "Link"}
                        </Button>
                      ) : null}
                    </View>
                  ))
                )}
                {view.mom == null && view.goals.length > 0 ? (
                  <Text style={textStyle("bodyS", color.inkMuted)}>
                    Set a M.O.M. above and these can be linked to it. Until then they stand on their
                    own, which is a legitimate way for a goal to exist.
                  </Text>
                ) : null}
              </View>
            </Panel>

            <Panel title="What the nights connected to">
              <View style={styles.panelGap}>
                {view.driftLine == null ? (
                  <Text style={textStyle("bodyS", color.inkMuted)}>
                    No MITs were planned in this window, so there is nothing to trace yet.
                  </Text>
                ) : (
                  <Text style={textStyle("body", color.ink)}>{view.driftLine}</Text>
                )}

                {view.drift.items.map((item) => (
                  <View key={item.id} style={styles.row}>
                    <Text style={[textStyle("bodyS", color.ink), styles.rowTitle]}>{item.title}</Text>
                    <Text style={textStyle("label", color.inkMuted)}>{item.date}</Text>
                    {view.mom != null ? (
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onPress={() =>
                          void run(
                            () =>
                              setTaskAnchorAction(userId as string, item.id, view.mom?.id ?? null),
                            "Could not attach that MIT.",
                          )
                        }
                      >
                        Attach
                      </Button>
                    ) : null}
                  </View>
                ))}

                {view.drift.items.length > 0 ? (
                  <Text style={textStyle("bodyS", color.inkMuted)}>
                    Leaving these as they are is a complete answer. Sometimes the night was right and
                    the chain above it is what needs rewriting.
                  </Text>
                ) : null}
              </View>
            </Panel>

            <Panel title="Closed M.O.M.s">
              <View style={styles.panelGap}>
                {view.history.length === 0 ? (
                  <Text style={textStyle("bodyS", color.inkMuted)}>
                    None yet. The first one lands here the day you close it.
                  </Text>
                ) : (
                  view.history.map(({ mom, review }) => (
                    <View key={mom.id} style={styles.historyRow}>
                      <View style={styles.row}>
                        <Text style={[textStyle("body", color.ink), styles.rowTitle]}>{mom.title}</Text>
                        <Badge>{review == null ? "Not reviewed" : OUTCOME_WORDS[review.outcome]}</Badge>
                      </View>
                      {review?.what_happened != null ? (
                        <Text style={textStyle("bodyS", color.inkMuted)}>{review.what_happened}</Text>
                      ) : null}
                    </View>
                  ))
                )}
              </View>
            </Panel>
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** The countdown, or the honest absence of one (D40). */
function Countdown({ view }: { view: VisionChainView }) {
  const countdown = view.countdown;
  if (countdown == null) return null;

  if (countdown.daysRemaining == null) {
    return (
      <Text style={textStyle("bodyS", color.inkMuted)}>
        No end date set, so there is no countdown. Add one and this line starts counting.
      </Text>
    );
  }

  const days = countdown.daysRemaining;
  const headline =
    days > 0
      ? `${days} ${days === 1 ? "day" : "days"} left`
      : days === 0
        ? "Last day"
        : `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} past the end date`;

  return (
    <View style={styles.countdown}>
      <Text style={textStyle("metric", color.ink)}>{headline}</Text>
      {countdown.elapsedDays != null && countdown.totalDays != null ? (
        <Text style={textStyle("label", color.inkMuted)}>
          day {countdown.elapsedDays} of {countdown.totalDays}
        </Text>
      ) : null}
    </View>
  );
}

function VisionLayer({
  view,
  editing,
  busy,
  onEdit,
  onCancel,
  onSave,
}: {
  view: VisionChainView;
  editing: boolean;
  busy: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (input: { body: string; mandates: Partial<Record<VisionMandate, string | null>> }) => void;
}) {
  const vision = view.vision;
  const [body, setBody] = useState(vision?.body ?? "");
  const [mandates, setMandates] = useState<Record<VisionMandate, string>>(() => ({
    financial: vision?.mandate_financial ?? "",
    professional: vision?.mandate_professional ?? "",
    physical: vision?.mandate_physical ?? "",
    relational: vision?.mandate_relational ?? "",
    family: vision?.mandate_family ?? "",
    environmental: vision?.mandate_environmental ?? "",
  }));
  const [showMandates, setShowMandates] = useState(false);

  if (editing) {
    return (
      <View style={styles.panelGap}>
        <Textarea
          label="Ten years from now, in your own words"
          value={body}
          rows={6}
          onChangeText={setBody}
          placeholder="Present tense. Write it as though you are already living in it."
          editable={!busy}
        />
        <Button variant="ghost" onPress={() => setShowMandates((s) => !s)}>
          {showMandates ? "Hide the six mandates" : "Break it down by mandate (optional)"}
        </Button>
        {showMandates ? (
          <>
            <Text style={textStyle("bodyS", color.inkMuted)}>
              Six sections of the same statement, not six goals. Every one of them is optional.
            </Text>
            {VISION_MANDATES.map((mandate) => (
              <Textarea
                key={mandate}
                label={VISION_MANDATE_LABELS[mandate]}
                rows={2}
                value={mandates[mandate]}
                onChangeText={(text) => setMandates((prev) => ({ ...prev, [mandate]: text }))}
                editable={!busy}
              />
            ))}
          </>
        ) : null}
        <Button
          loading={busy}
          onPress={() =>
            onSave({
              body,
              mandates: Object.fromEntries(
                VISION_MANDATES.map((m) => [m, mandates[m].trim() === "" ? null : mandates[m]]),
              ) as Partial<Record<VisionMandate, string | null>>,
            })
          }
        >
          Save
        </Button>
        <Button variant="ghost" onPress={onCancel}>
          Cancel
        </Button>
      </View>
    );
  }

  if (vision == null) {
    return (
      <EmptyState
        title="No ten-year vision yet"
        description="This is the top of the chain: one written statement, present tense, in your own words — the life you are aiming at in ten years. Nothing below it is required to have one, and nothing here is filled in for you."
        actionLabel="Write it"
        onAction={onEdit}
      />
    );
  }

  const written = VISION_MANDATES.filter((m) => vision[`mandate_${m}` as keyof typeof vision] != null);

  return (
    <View style={styles.panelGap}>
      <Text style={textStyle("body", color.ink)}>{vision.body}</Text>
      {written.map((mandate) => (
        <View key={mandate} style={styles.mandate}>
          <Text style={textStyle("label", color.inkMuted)}>
            {VISION_MANDATE_LABELS[mandate].toUpperCase()}
          </Text>
          <Text style={textStyle("bodyS", color.ink)}>
            {vision[`mandate_${mandate}` as keyof typeof vision] as string}
          </Text>
        </View>
      ))}
      <Button variant="ghost" onPress={onEdit}>
        Edit
      </Button>
    </View>
  );
}

interface ChainNodeDraft {
  title: string;
  target: string | null;
  startsOn: string | null;
  endsOn: string | null;
  parentId: number | null;
}

function ChainNodeLayer(props: {
  title: string | null;
  target: string | null;
  startsOn: string | null;
  endsOn: string | null;
  linkedParentId: number | null;
  parentId: number | null;
  parentLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  writeLabel: string;
  editing: boolean;
  busy: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (input: ChainNodeDraft) => void;
}) {
  const [title, setTitle] = useState(props.title ?? "");
  const [target, setTarget] = useState(props.target ?? "");
  const [startsOn, setStartsOn] = useState<string | null>(props.startsOn);
  const [endsOn, setEndsOn] = useState<string | null>(props.endsOn);
  const [linked, setLinked] = useState(props.linkedParentId != null);

  if (props.editing) {
    return (
      <View style={styles.panelGap}>
        <Input label="What it is" value={title} onChangeText={setTitle} editable={!props.busy} />
        <Input
          label="Measurable target (optional)"
          value={target}
          onChangeText={setTarget}
          editable={!props.busy}
          placeholder="Left blank, this layer is judged on its words alone."
        />
        <DatePicker label="Starts" value={startsOn} onValueChange={setStartsOn} disabled={props.busy} />
        <DatePicker label="Ends" value={endsOn} onValueChange={setEndsOn} disabled={props.busy} />

        {props.parentId != null ? (
          <Button variant="secondary" onPress={() => setLinked((l) => !l)}>
            {linked ? `Steps down from the ${props.parentLabel}` : "Not linked to anything above"}
          </Button>
        ) : (
          <Text style={textStyle("bodyS", color.inkMuted)}>
            Nothing is written above this yet, so there is nothing to link it to. That is allowed —
            the layer above can be written later and linked then.
          </Text>
        )}

        <Button
          loading={props.busy}
          onPress={() =>
            props.onSave({
              title,
              target: target.trim() === "" ? null : target,
              startsOn,
              endsOn,
              parentId: props.parentId != null && linked ? props.parentId : null,
            })
          }
        >
          Save
        </Button>
        <Button variant="ghost" onPress={props.onCancel}>
          Cancel
        </Button>
      </View>
    );
  }

  if (props.title == null) {
    return (
      <EmptyState
        title={props.emptyTitle}
        description={props.emptyDescription}
        actionLabel={props.writeLabel}
        onAction={props.onEdit}
      />
    );
  }

  const meta = metaLine(props.target, props.startsOn, props.endsOn);

  return (
    <View style={styles.panelGap}>
      <Text style={textStyle("bodyL", color.ink)}>{props.title}</Text>
      {meta != null ? <Text style={textStyle("label", color.inkMuted)}>{meta}</Text> : null}
      <Button variant="ghost" onPress={props.onEdit}>
        Edit
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  content: { paddingHorizontal: space[5], gap: space[4] },
  panelGap: { gap: space[3] },
  connectorRow: { flexDirection: "row", alignItems: "center", gap: space[3], paddingLeft: space[5] },
  connector: { height: space[6], borderLeftWidth: 1 },
  countdown: { gap: space[1] },
  row: { flexDirection: "row", alignItems: "center", gap: space[3], flexWrap: "wrap" },
  rowTitle: { flexGrow: 1, flexShrink: 1, minWidth: 140 },
  historyRow: {
    gap: space[1],
    paddingBottom: space[3],
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
    borderRadius: radius.sm,
  },
  mandate: { gap: space[1] },
});
