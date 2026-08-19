import { color, riskBandColor, riskBands, space, type as typeScale } from "@collegeos/design/native";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  FieldError,
  Input,
  Label,
  Metric,
  Panel,
  RiskPill,
  SegmentedControl,
  Skeleton,
  Textarea,
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
  const insets = useSafeAreaInsets();

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + space[5] }]}>
      <Text style={textStyle("label", color.inkFaint)}>DESIGN SYSTEM</Text>
      <Text style={[textStyle("displayL", color.ink), styles.pageTitle]}>Instrument</Text>
      <Text style={textStyle("body", color.inkMuted)}>
        Every token and primitive from docs/DESIGN_SYSTEM.md, rendered live.
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
        <Text style={textStyle("body", color.inkMuted)}>Panel body content sits here, no shadow, ever.</Text>
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
    borderRadius: 5,
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
});
