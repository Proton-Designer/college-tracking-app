import { BarChart3, Home } from "lucide-react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  aurora,
  auroraForRisk,
  color,
  glass,
  glassEdge,
  island,
  radius,
  riskBandColor,
  riskBands,
  shadow,
  space,
  type as typeScale,
} from "@collegeos/design/native";
import type { RiskBand } from "@collegeos/design/native";
import {
  Badge,
  Button,
  Checkbox,
  ChipGroup,
  DatePicker,
  EmptyState,
  FieldError,
  Input,
  Label,
  Metric,
  Modal,
  NavLink,
  Panel,
  RiskPill,
  SegmentedControl,
  Select,
  Skeleton,
  Textarea,
  TimePicker,
  Toast,
  Toggle,
  useToast,
} from "../components/ui";
import { textStyle } from "../design/typography";

const TYPE_SAMPLE: Record<keyof typeof typeScale, string> = {
  displayXl: "The Sunday plan",
  displayL: "Main win: both MITs",
  displayM: "Today",
  title: "BME 301",
  bodyL: "You completed both high-priority tasks today.",
  body: "Upload a syllabus to build this course's map.",
  bodyS: "Last three blocks started 1.4 days late.",
  label: "PANEL LABEL",
  metricXl: "1,204.5",
  metric: "72",
  caption: "6.3 h · 2 min ago",
};

/** DESIGN_LANGUAGE_V2 §6 — every non-null band, in order, plus the honest no-data case. */
const AURORA_PREVIEW_BANDS: readonly (RiskBand | null)[] = [...riskBands, null];

/** §2 — native has no literal CSS blur-radius; these are hand-calibrated to *read* right at
 *  the three tiers' relative strength (24 / 32 / 16 web px), not a unit conversion. */
const GLASS_TIER_INTENSITY: Record<"base" | "raised" | "sunken", number> = {
  base: 60,
  raised: 80,
  sunken: 35,
};

function SectionTitle({ children, note }: { children: string; note?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={textStyle("displayM", color.ink)}>{children}</Text>
      {note ? <Text style={[textStyle("bodyS", color.inkMuted), styles.sectionNote]}>{note}</Text> : null}
    </View>
  );
}

function StateLabel({ children }: { children: string }) {
  return <Text style={[textStyle("label", color.inkFaint), styles.stateLabel]}>{children}</Text>;
}

function Swatch({ name, hex }: { name: string; hex: string }) {
  return (
    <View style={styles.swatch}>
      <View style={[styles.swatchColor, { backgroundColor: hex }]} />
      <Text style={textStyle("caption", color.ink)}>{name}</Text>
      <Text style={textStyle("caption", color.inkFaint)}>{hex}</Text>
    </View>
  );
}

interface GlassTier {
  fill: string;
  fallback: string;
  blur: number;
  saturate: number;
}

function GlassTile({ tierName, tier }: { tierName: string; tier: GlassTier }) {
  return (
    <View style={styles.glassTileShadow}>
      <View style={styles.glassTileClip}>
        {/* Android renders a solid tinted fill here, never a blur, unless `blurTarget` is
            wired -- see FOLLOWUPS G1. Readable either way: `tier.fill` alone is opaque enough. */}
        <BlurView intensity={GLASS_TIER_INTENSITY[tierName as keyof typeof GLASS_TIER_INTENSITY]} tint="light" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: tier.fill }]} />
        <Text style={textStyle("label", color.ink)}>{tierName}</Text>
        <Text style={textStyle("caption", color.inkMuted)}>{tier.blur}px blur</Text>
        <Text style={textStyle("caption", color.inkFaint)}>fallback {tier.fallback}</Text>
      </View>
    </View>
  );
}

function AuroraSwatch({ band }: { band: RiskBand | null }) {
  const stops = auroraForRisk(band);
  return (
    <View style={styles.auroraRow}>
      {stops ? (
        <LinearGradient colors={stops} style={styles.auroraBar} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
      ) : (
        <View style={[styles.auroraBar, { backgroundColor: color.ground, borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline }]} />
      )}
      <Text style={textStyle("caption", color.inkMuted)}>{band ?? "no data — flat ground, no aurora"}</Text>
    </View>
  );
}

/** Static preview only — not wired to real navigation. The live, wired dock is
 *  `components/shell/Island.tsx`, rendered as `(tabs)/_layout.tsx`'s custom `tabBar`. */
function IslandPreview() {
  return (
    <View style={styles.islandPreviewShadow}>
      <View style={styles.islandPreviewClip}>
        <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: `${island.fill}e0` }]} />
        <View style={styles.islandPreviewRow}>
          <View style={styles.islandPreviewItemActive}>
            <Home size={20} color={island.ink} strokeWidth={2} />
            <Text style={[textStyle("body", island.ink)]}>Today</Text>
          </View>
          <View style={styles.islandPreviewItem}>
            <BarChart3 size={20} color={island.inkDim} strokeWidth={2} />
          </View>
        </View>
      </View>
    </View>
  );
}

function ToastDemoButton() {
  const { show } = useToast();
  return (
    <Button variant="secondary" onPress={() => show("Focus session logged.", "success")}>
      Trigger toast
    </Button>
  );
}

export default function DesignPreviewScreen() {
  const [scale, setScale] = useState<number | null>(7);
  const [checked, setChecked] = useState(true);
  const [toggled, setToggled] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [studyTime, setStudyTime] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [derailment, setDerailment] = useState<string | null>("phone");
  const insets = useSafeAreaInsets();

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + space[5] }]}>
      <Text style={textStyle("label", color.inkFaint)}>DESIGN SYSTEM</Text>
      <Text style={[textStyle("displayL", color.ink), styles.pageTitle]}>Aurora</Text>
      <Text style={textStyle("body", color.inkMuted)}>
        Every token and primitive from docs/DESIGN_LANGUAGE_V2.md, rendered live.
      </Text>

      <SectionTitle note="Foundation + risk scale.">Color</SectionTitle>
      <View style={styles.swatchRow}>
        <Swatch name="ground" hex={color.ground} />
        <Swatch name="surface" hex={color.surface} />
        <Swatch name="ink" hex={color.ink} />
        <Swatch name="accent" hex={color.accent} />
      </View>
      <View style={styles.swatchRow}>
        {riskBands.map((band) => (
          <Swatch key={band} name={`risk-${band}`} hex={riskBandColor[band].fg} />
        ))}
      </View>
      <View style={styles.swatchRow}>
        <Swatch name="aurora-periwinkle" hex={aurora.periwinkle} />
        <Swatch name="aurora-lilac" hex={aurora.lilac} />
        <Swatch name="aurora-mint" hex={aurora.mint} />
        <Swatch name="aurora-blush" hex={aurora.blush} />
      </View>

      <SectionTitle note="§2 — only these three tiers exist. Every tier's opaque fallback is mandatory, not decorative.">
        Glass
      </SectionTitle>
      <View style={styles.glassStage}>
        <LinearGradient colors={[aurora.periwinkle, aurora.lilac]} style={StyleSheet.absoluteFill} />
        <View style={styles.glassRow}>
          <GlassTile tierName="base" tier={glass.base} />
          <GlassTile tierName="raised" tier={glass.raised} />
          <GlassTile tierName="sunken" tier={glass.sunken} />
        </View>
      </View>

      <SectionTitle note="§6 — an instrument reading, derived from a real computed RiskBand. Never a fabricated one.">
        Aurora
      </SectionTitle>
      <View style={styles.stack}>
        {AURORA_PREVIEW_BANDS.map((band) => (
          <AuroraSwatch key={band ?? "none"} band={band} />
        ))}
      </View>

      <SectionTitle note="§5 — the primary nav. Static preview; the wired dock lives in components/shell/Island.tsx.">
        Island
      </SectionTitle>
      <IslandPreview />

      <SectionTitle>Typography</SectionTitle>
      <View style={styles.stack}>
        {(Object.keys(typeScale) as (keyof typeof typeScale)[]).map((step) => (
          <View key={step} style={styles.typeRow}>
            <Text style={textStyle(step, color.ink)}>{TYPE_SAMPLE[step]}</Text>
            <Text style={textStyle("caption", color.inkFaint)}>{step}</Text>
          </View>
        ))}
      </View>

      <SectionTitle note="primary / secondary / ghost / destructive.">Button</SectionTitle>
      <StateLabel>default</StateLabel>
      <View style={styles.row}>
        <Button variant="primary">Start focus</Button>
        <Button variant="secondary">Move block</Button>
      </View>
      <View style={styles.row}>
        <Button variant="ghost">Dismiss</Button>
        <Button variant="destructive">Delete course</Button>
      </View>
      <StateLabel>disabled</StateLabel>
      <View style={styles.row}>
        <Button variant="primary" disabled>Start focus</Button>
        <Button variant="destructive" disabled>Delete course</Button>
      </View>
      <StateLabel>loading</StateLabel>
      <View style={styles.row}>
        <Button variant="primary" loading>Saving</Button>
      </View>

      <SectionTitle>Input & Textarea</SectionTitle>
      <View style={styles.stack}>
        <Input label="Course name" placeholder="BIOL 23000" />
        <Input label="Target grade" defaultValue="A" required />
        <Input label="Office hours" defaultValue="bad value" error="Use the format: Day HH:MM–HH:MM." />
        <Input label="Locked" defaultValue="Cannot edit" editable={false} />
        <Textarea label="What went wrong?" placeholder="One or two sentences." />
      </View>

      <SectionTitle note="Used standalone (Input/Textarea compose them internally).">
        Label & FieldError
      </SectionTitle>
      <View style={styles.stack}>
        <Label required>Target grade</Label>
        <FieldError>Grade boundaries must be between 0 and 100.</FieldError>
      </View>

      <SectionTitle>Panel</SectionTitle>
      <Panel title="BME 301">
        <Text style={textStyle("body", color.inkMuted)}>
          Panel body content sits here -- v2 requires glass elevation (§4); a flat, shadowless card is
          the old rule, not this one.
        </Text>
      </Panel>

      <SectionTitle>RiskPill & Badge</SectionTitle>
      <View style={styles.row}>
        <RiskPill band="low" label="LOW" />
        <RiskPill band="moderate" label="MODERATE" />
      </View>
      <View style={styles.row}>
        <RiskPill band="high" label="HIGH ATTENTION" />
        <RiskPill band="critical" label="CRITICAL" />
      </View>
      <View style={styles.row}>
        <Badge tone="neutral">3 new</Badge>
        <Badge tone="accent">Selected</Badge>
      </View>

      <SectionTitle>Metric</SectionTitle>
      <View style={styles.row}>
        <Metric label="deep work" value="138" unit="min" size="xl" />
      </View>
      <View style={styles.row}>
        <Metric label="sleep" value="6.3" unit="h" delta={{ direction: "down", label: "1.4 vs 30-day avg" }} />
        <Metric label="mit completion" value="2 / 3" />
      </View>

      <SectionTitle note="10 discrete cells — never a slider.">SegmentedControl</SectionTitle>
      <SegmentedControl label="Energy" value={scale} onValueChange={setScale} />
      <View style={{ height: space[4] }} />
      <SegmentedControl label="Disabled" value={4} onValueChange={() => {}} disabled />

      <SectionTitle note="Unselected chip is glass-base; selected is a decision, not a surface.">
        ChipGroup
      </SectionTitle>
      <ChipGroup
        label="Likely derailment"
        options={[
          { value: "phone", label: "Phone" },
          { value: "oversleep", label: "Overslept" },
          { value: "social", label: "Social plans" },
        ]}
        value={derailment}
        onValueChange={setDerailment}
      />

      <SectionTitle note="Same glass-base chip material as Button secondary and ChipGroup.">
        NavLink
      </SectionTitle>
      <View style={styles.row}>
        <NavLink label="Courses" onPress={() => {}} />
        <NavLink label="Next deliverable" direction="forward" onPress={() => {}} />
      </View>

      <SectionTitle note="Trigger opens a picker sheet built on Modal.">Select</SectionTitle>
      <StateLabel>unset / chosen (live)</StateLabel>
      <Select
        label="Category"
        placeholder="Choose a category"
        options={[
          { value: "homework", label: "Homework" },
          { value: "exam", label: "Exam" },
          { value: "reading", label: "Reading" },
        ]}
        value={category}
        onValueChange={setCategory}
      />

      <SectionTitle note="Unset is a real state, not a fabricated default -- Clear returns to it.">
        DatePicker & TimePicker
      </SectionTitle>
      <View style={styles.stack}>
        <DatePicker label="Due date" value={dueDate} onValueChange={setDueDate} />
        <TimePicker label="Study block start" value={studyTime} onValueChange={setStudyTime} />
      </View>

      <SectionTitle note="A bottom sheet, not a centered dialog -- the design system's dedicated sheet spring.">
        Modal
      </SectionTitle>
      <Button variant="secondary" onPress={() => setModalOpen(true)}>
        Open modal
      </Button>
      <Modal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add a course"
        footer={
          <>
            <Button variant="ghost" onPress={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onPress={() => setModalOpen(false)}>
              Save
            </Button>
          </>
        }
      >
        <Text style={textStyle("body", color.inkMuted)}>
          Demo content only -- this is where a real form (Input/Select/DatePicker) would sit.
        </Text>
      </Modal>

      <SectionTitle>Checkbox & Toggle</SectionTitle>
      <StateLabel>checkbox — unchecked / checked (live)</StateLabel>
      <Checkbox label="No Instagram before 6 PM" checked={checked} onValueChange={setChecked} />
      <StateLabel>checkbox — disabled</StateLabel>
      <Checkbox label="Disabled" checked={true} onValueChange={() => {}} disabled />
      <StateLabel>checkbox — error</StateLabel>
      <Checkbox
        label="Confirm this commitment"
        checked={false}
        onValueChange={() => {}}
        error="Confirm this commitment."
      />
      <StateLabel>toggle — off (live) / on</StateLabel>
      <Toggle label="Weekly digest" checked={toggled} onValueChange={setToggled} />
      <Toggle label="Weekly digest" checked={true} onValueChange={() => {}} />
      <StateLabel>toggle — disabled off / on</StateLabel>
      <Toggle label="Disabled" checked={false} onValueChange={() => {}} disabled />
      <Toggle label="Disabled" checked={true} onValueChange={() => {}} disabled />

      <SectionTitle note="Mirrors the real layout's geometry.">Skeleton</SectionTitle>
      <View style={styles.stack}>
        <Skeleton height={20} width="60%" />
        <Skeleton height={14} />
        <Skeleton height={14} width="80%" />
      </View>

      <SectionTitle>EmptyState</SectionTitle>
      <EmptyState
        title="No courses yet"
        description="Upload a syllabus to build this course's semester map."
        actionLabel="Upload syllabus"
        onAction={() => {}}
      />

      <SectionTitle>Toast</SectionTitle>
      <View style={styles.stack}>
        <Toast variant="success" message="Focus session logged." onDismiss={() => {}} />
        <Toast variant="error" message="Couldn't save — check your connection." onDismiss={() => {}} />
        <ToastDemoButton />
      </View>
      <View style={{ height: space[10] }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: space[5],
    gap: space[2],
  },
  pageTitle: {
    marginTop: space[1],
  },
  sectionHeader: {
    marginTop: space[8],
    marginBottom: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
    paddingTop: space[6],
  },
  sectionNote: {
    marginTop: space[1],
  },
  stateLabel: {
    marginTop: space[3],
    marginBottom: space[2],
  },
  swatchRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[4],
    marginBottom: space[4],
  },
  swatch: {
    width: 84,
    gap: space[1],
  },
  swatchColor: {
    height: 44,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
  },
  stack: {
    gap: space[5],
  },
  typeRow: {
    gap: space[1],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
    paddingBottom: space[3],
    marginBottom: space[2],
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[3],
    marginBottom: space[3],
  },
  glassStage: {
    borderRadius: radius.lg,
    overflow: "hidden",
    padding: space[4],
  },
  glassRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[3],
  },
  glassTileShadow: {
    borderRadius: radius.lg,
    ...shadow.glass,
  },
  glassTileClip: {
    width: 108,
    height: 96,
    borderRadius: radius.lg,
    overflow: "hidden",
    padding: space[3],
    gap: space[1],
    ...glassEdge,
  },
  auroraRow: {
    gap: space[2],
  },
  auroraBar: {
    height: 28,
    borderRadius: radius.sm,
  },
  islandPreviewShadow: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    ...shadow.islandDock,
  },
  islandPreviewClip: {
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  islandPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  islandPreviewItem: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  islandPreviewItemActive: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    borderRadius: radius.pill,
    backgroundColor: color.accent,
  },
});
