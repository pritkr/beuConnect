/**
 * Notes & VVI — the shelf's pieces.
 *
 * Presentational only: these read the normalised types from `./data` and call
 * back into the screen for navigation, copying and course changes. The rails
 * take accessors, so the selected chip repaints when the course changes.
 */

import { Scroll, Text, View } from "nsh";
import { Badge, Chip, Label, Muted, Skeleton } from "../../ui";
import { Icon } from "../../ui/icons";
import { BRANCH_META } from "../syllabus/data/packs";
import {
  KIND_LABEL,
  confidenceLabel,
  marksLabel,
  plural,
  sizeLabel,
  type Confidence,
  type NoteFile,
  type NoteSubject,
  type NoteKind,
  type VviTopic,
} from "./data";

/* ------------------------------------------------------------------- rails */

/** The six BEU branches, in the app's canonical order. */
export function BranchRail(props: { value: () => string; onPick: (branch: string) => void }) {
  return (
    <View class="gap-2">
      <Label>Branch</Label>
      <Scroll horizontal scrollbar={false} bounces={false} contentClass="flex-row gap-2 pr-4">
        {() =>
          BRANCH_META.map((branch) => (
            <Chip
              label={branch.short}
              active={props.value() === branch.code}
              onPress={() => props.onPick(branch.code)}
            >
              {branch.short}
            </Chip>
          ))
        }
      </Scroll>
    </View>
  );
}

/** Semesters 1–8. An empty semester still opens, and says so honestly. */
export function SemesterRail(props: { value: () => number; onPick: (sem: number) => void }) {
  return (
    <View class="gap-2">
      <Label>Semester</Label>
      <Scroll horizontal scrollbar={false} bounces={false} contentClass="flex-row gap-2 pr-4">
        {() =>
          [1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
            <Chip
              label={`Semester ${sem}`}
              active={props.value() === sem}
              onPress={() => props.onPick(sem)}
            >
              {String(sem)}
            </Chip>
          ))
        }
      </Scroll>
    </View>
  );
}

/* -------------------------------------------------------------------- rows */

/** One subject: name, the first VVI topic, then the two counts that matter. */
export function SubjectRow(props: { subject: NoteSubject; onPress: () => void }) {
  const subject = props.subject;
  const lead = subject.vvi[0];
  return (
    <View
      class="min-h-11 flex-row items-start gap-3 px-4 py-3 active:bg-muted focus:ring-2 focus:ring-ring"
      onPress={props.onPress}
      role="button"
      accessibilityLabel={`${subject.name}, ${plural(subject.vvi.length, "VVI topic")}, ${plural(subject.files.length, "note")}`}
    >
      <View class="flex-1 gap-1">
        <Text class="text-[15px] font-semibold leading-5 text-foreground" numberOfLines={2}>
          {subject.name}
        </Text>
        {lead ? (
          <Text class="text-[12px] leading-4 text-muted-foreground" numberOfLines={1}>
            {lead.topic}
          </Text>
        ) : null}
        <View class="flex-row flex-wrap items-center gap-2 pt-0.5">
          {subject.code ? (
            <Text class="text-[11px] font-medium tabular-nums text-muted-foreground">{subject.code}</Text>
          ) : null}
          {subject.vvi.length > 0 ? <Badge tone="mint">{`VVI ${subject.vvi.length}`}</Badge> : null}
          {subject.files.length > 0 ? <Badge tone="neutral">{plural(subject.files.length, "note")}</Badge> : null}
        </View>
      </View>
      <View class="pt-0.5">
        <Icon name="chevron-right" size={18} class="text-muted-foreground" />
      </View>
    </View>
  );
}

/** One VVI topic: weight, confidence, the note, and a copy for the whole card. */
export function VviCard(props: {
  topic: VviTopic;
  copied: () => boolean;
  onCopy: () => void;
}) {
  const topic = props.topic;
  return (
    <View class="gap-3 rounded-3xl border border-border bg-card p-4">
      <View class="flex-row items-start gap-3">
        {topic.marks === null ? null : (
          <View class="pt-0.5">
            <Badge tone="ember">{marksLabel(topic.marks)}</Badge>
          </View>
        )}
        <Text class="flex-1 text-[15px] font-semibold leading-5 text-foreground">{topic.topic}</Text>
      </View>

      <View class="flex-row items-center gap-2">
        <ConfidenceDot confidence={topic.confidence} />
        <Muted class="text-[11px]">{confidenceLabel(topic.confidence)}</Muted>
      </View>

      {topic.note ? (
        <Text class="text-[15px] leading-6 text-foreground" selectable>
          {topic.note}
        </Text>
      ) : (
        <Muted>No note for this topic yet.</Muted>
      )}

      <View class="flex-row justify-end">
        <View
          class="-mr-2 min-h-11 flex-row items-center gap-1.5 rounded-full px-3 active:bg-primary/10 focus:ring-2 focus:ring-ring"
          onPress={props.onCopy}
          role="button"
          accessibilityLabel={`Copy ${topic.topic}`}
        >
          <Icon name={props.copied() ? "check" : "note"} size={14} class="text-primary-ink" />
          <Text class="text-[13px] font-semibold text-primary-ink" numberOfLines={1}>
            {props.copied() ? "Copied" : "Copy topic"}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** One PDF: kind, pages, size, and the chevron that opens the shared reader. */
export function NoteFileRow(props: { file: NoteFile; onPress: () => void }) {
  const file = props.file;
  const meta = [file.pages === null ? "" : plural(file.pages, "page"), sizeLabel(file.bytes)]
    .filter((part) => part !== "")
    .join(" · ");
  return (
    <View
      class="min-h-11 flex-row items-center gap-3 px-4 py-3 active:bg-muted focus:ring-2 focus:ring-ring"
      onPress={props.onPress}
      role="button"
      accessibilityLabel={`${file.title}, ${KIND_LABEL[file.kind]}${meta ? `, ${meta}` : ""}`}
    >
      <View class="h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
        <Icon name="file-pdf" size={18} class="text-primary-ink" />
      </View>
      <View class="flex-1 gap-1">
        <Text class="text-[14px] font-semibold leading-5 text-foreground" numberOfLines={2}>
          {file.title}
        </Text>
        <View class="flex-row flex-wrap items-center gap-2">
          <KindBadge kind={file.kind} />
          {meta ? <Muted class="text-[11px] tabular-nums">{meta}</Muted> : null}
        </View>
      </View>
      <Icon name="chevron-right" size={18} class="text-muted-foreground" />
    </View>
  );
}

/* ------------------------------------------------------------------- atoms */

const CONFIDENCE_TONE: Record<Confidence, string> = {
  high: "bg-accent-ink",
  medium: "bg-chart-3",
  low: "bg-muted-foreground",
};

export function ConfidenceDot(props: { confidence: Confidence }) {
  return (
    <View
      class={`h-2 w-2 rounded-full ${CONFIDENCE_TONE[props.confidence]}`}
      accessibilityElementsHidden
    />
  );
}

const KIND_TONE: Record<NoteKind, "ember" | "mint" | "amber" | "neutral"> = {
  handwritten: "mint",
  short: "neutral",
  vvi: "ember",
  formula: "amber",
};

export function KindBadge(props: { kind: NoteKind }) {
  return <Badge tone={KIND_TONE[props.kind]}>{KIND_LABEL[props.kind]}</Badge>;
}

/* ----------------------------------------------------------------- loading */

/** First paint only: the shelf's shape, no invented rows. */
export function NotesSkeleton() {
  return (
    <View class="gap-5" accessible accessibilityLabel="Loading notes">
      <View class="gap-2">
        <Skeleton h={28} w={220} />
        <Skeleton h={12} w={180} />
      </View>
      <View class="gap-2">
        <Skeleton h={10} w={56} />
        <Skeleton h={44} />
      </View>
      <View class="gap-2">
        <Skeleton h={10} w={72} />
        <Skeleton h={44} />
      </View>
      <Skeleton h={44} />
      <View class="gap-2">
        <Skeleton h={92} />
        <Skeleton h={92} />
        <Skeleton h={92} />
      </View>
    </View>
  );
}

/** The subject screen while the manifest is on its way. */
export function SubjectSkeleton() {
  return (
    <View class="gap-4" accessible accessibilityLabel="Loading subject notes">
      <Skeleton h={14} w={200} />
      <Skeleton h={12} w={140} />
      <Skeleton h={128} />
      <Skeleton h={128} />
      <Skeleton h={72} />
    </View>
  );
}
