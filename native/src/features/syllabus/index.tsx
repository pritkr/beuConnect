/**
 * Syllabus — the paper you are on, its units, a search across every topic, and
 * what you kept.
 *
 * A student with a profile lands on their own branch and semester: their
 * semester leads the rail, the card says whose branch it is, and a paper shared
 * with their own semester is marked while they browse another branch. A
 * student without one gets the old screen unchanged — saved course, else CSE
 * Sem 1. Either way the landing remembers branch, semester and the last paper,
 * so a returning student taps once. `./you.ts` holds the profile rules,
 * `./course.ts` the semester rule, and `./parts.tsx` the shared state.
 *
 * Framework rule: a component body runs once, so `course()` / `studied()` are
 * only read inside the JSX or a `computed` — never into a `const` above it.
 * Shared state, lookups and rows live in ./parts.tsx.
 */

import { List, Scroll, Text, View, cleanup, computed, effect, signal } from "nsh";
import type { Nav, RouteDef } from "../../app/router";
import { numParam, param } from "../../app/router";
import { Btn, EmptyState, Label, ListBar, Muted, Row, Screen, SectionHeader, Search } from "../../ui";
import { Icon } from "../../ui/icons";
import { FeedbackFooter } from "../feedback/footer";
import { BRANCH_META, GATE_META } from "./data/packs";
import type { Unit } from "./parse";
import { isOwnCourse, ownLine, ownSemesterFirst } from "./you";
import { copyText } from "./topic-actions";
import {
  ContinueCard,
  CourseRail,
  GateHeader,
  GateLineView,
  HitRow,
  MatchList,
  NoticePanel,
  OwnBranchCard,
  Pick,
  ProgressCard,
  SavedLineView,
  SourceBox,
  SubjectCard,
  SubjectRow,
  UndoLine,
  UnitBlock,
  branchName,
  chooseCourse,
  course,
  dismissRemoval,
  entriesOf,
  gatePack,
  gateRows,
  lastRemoval,
  lastSubject,
  matchesIn,
  once,
  own,
  pack,
  pinCourse,
  rememberSubject,
  removeSaved,
  saved,
  savedItems,
  searchHits,
  semesterStats,
  semestersOf,
  setUnitOpen,
  setUnitsOpen,
  shortBranch,
  subjectKey,
  subjectOf,
  subjectsOf,
  subjectProgress,
  toggleOpen,
  toggleSaved,
  undoSaved,
  unitKey,
  unitOpen,
  unitsOf,
  type GateLine,
  type Hit,
  type SavedLine,
  type SubjectEntry,
  type SubjectMatch,
} from "./parts";

/* ---------------------------------------------------------------- landing */

function LandingScreen(props: { nav: Nav }) {
  const branch = computed(() => course().branch);
  const sem = computed(() => course().sem);
  // The student's own course, from the profile. `null` without one, and every
  // rule below is written so that `null` is exactly the old behaviour.
  const mine = computed(() => own());
  const onOwn = computed(() => isOwnCourse(mine(), branch(), sem()));
  const ownCodes = computed(() => {
    const me = mine();
    return me ? new Set(subjectsOf(me.branch, me.sem).map((subject) => subject.code)) : new Set<string>();
  });
  // Their semester leads the rail; the rest keep their published order.
  const sems = computed(() => ownSemesterFirst(semestersOf(branch()), mine()));
  const entries = computed(() => entriesOf(branch(), sem()));
  const stats = computed(() => semesterStats(branch(), sem()));
  const last = computed(() => lastSubject());
  const lastStats = computed(() => {
    const item = last();
    return item ? subjectProgress(item.branch, item.sem, item.code) : null;
  });
  const savedTotal = computed(() => Object.keys(saved()).length);

  /**
   * A paper of the semester on screen that is also a paper of the student's
   * own semester — the shared first-year papers are the common case. Only ever
   * true while browsing another course; on their own course every paper is
   * theirs and a badge on all of them says nothing.
   */
  const ownPaper = (entry: SubjectEntry): boolean => {
    const me = mine();
    return me !== null && !isOwnCourse(me, entry.branch, entry.sem) && ownCodes().has(entry.subject.code);
  };

  const openOwn = (): void => {
    const me = mine();
    if (me) chooseCourse(me);
  };

  // The route is read once: a deep link (`/cse/3`) wins over the stored course,
  // which wins over the default. `routeBranch` stays for the notice below, so a
  // link naming a branch or semester the snapshot does not carry says so
  // instead of quietly showing a different course.
  const routeBranch = param(props.nav, "branch");
  const routeSem = numParam(props.nav, "sem");
  const branchKnown = computed(() => routeBranch === "" || pack(routeBranch) !== null);
  const published = computed(() => semestersOf(routeBranch && branchKnown() ? routeBranch : branch()));
  // A notice is about the link the student arrived on, so it goes away once
  // they take its action — the path cannot be rewritten from here, but the
  // course can, and a notice that outlives its own button is a lie.
  const branchNotice = signal(true);
  const semNotice = computed(
    () =>
      routeSem > 0 &&
      branchKnown() &&
      !published().some((info) => info.sem === routeSem) &&
      course().sem === routeSem,
  );
  const nearest = computed(() => {
    const code = routeBranch && branchKnown() ? routeBranch : branch();
    const list = semestersOf(code);
    const wanted = routeSem > 0 ? list.filter((info) => info.sem <= routeSem).pop() : undefined;
    return { branch: code, sem: wanted?.sem ?? list[0]?.sem ?? 1 };
  });

  once(() => {
    if (routeBranch) pinCourse(routeBranch, routeSem);
  });

  const pickBranch = (code: string): void => {
    branchNotice.set(false);
    const list = semestersOf(code);
    const current = course().sem;
    // Switching branch keeps the semester being read; when the new branch does
    // not publish it, the student's own semester is the better guess than the
    // first one, and its own first semester is the last resort.
    const me = mine();
    const next = list.some((info) => info.sem === current)
      ? current
      : me && me.branch === code && list.some((info) => info.sem === me.sem)
        ? me.sem
        : (list[0]?.sem ?? 1);
    chooseCourse({ branch: code, sem: next });
  };

  const openEntry = (entry: SubjectEntry): void =>
    props.nav.push("syllabus.subject", { code: entry.subject.code, branch: entry.branch, sem: entry.sem });

  return (
    <Screen>
      {() => (
        <List
        testID="syllabus-subjects"
        class="flex-1"
        each={entries()}
        keyExtractor={(entry: SubjectEntry) => entry.key}
        estimatedItemSize={92}
        contentClass="gap-2 px-4 pb-10"
        empty={
          // A link to an unpublished semester already has its notice above;
          // repeating the same fact under the header would say it twice.
          semNotice() ? (
            <View />
          ) : (
            <EmptyState
              title="No papers in this semester"
              hint="Not every branch publishes every semester. Pick another semester in the rail above."
            />
          )
        }
        header={
          <View class="gap-4 pb-2 pt-4">
            {!branchKnown() && branchNotice() ? (
              <NoticePanel
                tone="ember"
                label="Branch not in the snapshot"
                body={`“${routeBranch.toUpperCase()}” is not one of the six branches the app carries (${BRANCH_META.map(
                  (meta) => meta.short,
                ).join(", ")}). Your saved course is shown below.`}
                action={`Open ${shortBranch(nearest().branch)} · Sem ${nearest().sem}`}
                onAction={() => {
                  branchNotice.set(false);
                  chooseCourse({ branch: nearest().branch, sem: nearest().sem });
                }}
              />
            ) : null}

            {semNotice() ? (
              <NoticePanel
                tone="amber"
                label="Semester not published"
                body={`${shortBranch(branch())} publishes ${published()
                  .map((info) => info.sem)
                  .join(", ")}. Sem ${routeSem} has no papers in the snapshot.`}
                action={`Open Sem ${nearest().sem}`}
                onAction={() => chooseCourse({ ...course(), sem: nearest().sem })}
              />
            ) : null}

            {/* Off their own course, the way back is one tap — and it cannot be
                confused with the course on screen, which the card below names. */}
            {mine() && !onOwn() ? <OwnBranchCard line={() => ownLine(mine())} onOpen={openOwn} /> : null}

            {last() ? (
              <ContinueCard
                name={last()?.name ?? ""}
                branch={last()?.branch ?? branch()}
                sem={last()?.sem ?? sem()}
                done={lastStats()?.done ?? 0}
                total={lastStats()?.topics ?? 0}
                onOpen={() => {
                  const item = last();
                  if (item) props.nav.push("syllabus.subject", { code: item.code, branch: item.branch, sem: item.sem });
                }}
              />
            ) : null}

            <CourseRail
              branch={() => branch()}
              sem={() => sem()}
              sems={sems}
              onBranch={pickBranch}
              onSemester={(next) => chooseCourse({ ...course(), sem: next })}
            />

            <ProgressCard
              branch={branch()}
              sem={sem()}
              progress={stats}
              own={() => onOwn()}
            />

            <View
              class="min-h-11 flex-row items-center gap-2 rounded-full border border-border-strong bg-card px-4 active:bg-muted"
              onPress={() => props.nav.push("syllabus.search")}
              role="button"
              accessibilityLabel="Search every topic or subject code"
            >
              <Icon name="search" size={16} class="text-muted-foreground" />
              <Text class="text-[13px] text-muted-foreground">Search every topic or code…</Text>
            </View>

            <SectionHeader title="Subjects" />
          </View>
        }
        footer={
          <Row class="gap-2 pb-2 pt-2">
            <Btn class="flex-1" variant="secondary" onPress={() => props.nav.push("syllabus.saved")}>
              {`Saved · ${savedTotal()}`}
            </Btn>
            <Btn class="flex-1" variant="secondary" onPress={() => props.nav.push("syllabus.gate")}>
              GATE syllabus
            </Btn>
          </Row>
        }
      >
        {(entry: () => SubjectEntry) => (
          <SubjectRow item={entry} onOpen={openEntry} mine={() => ownPaper(entry())} />
        )}
        </List>
      )}
    </Screen>
  );
}

/* ---------------------------------------------------------------- subject */

function SubjectScreen(props: { nav: Nav }) {
  const routeBranch = param(props.nav, "branch");
  const routeSem = numParam(props.nav, "sem");
  const code = param(props.nav, "code");
  const branch = computed(() => routeBranch || course().branch);
  const sem = computed(() => routeSem || course().sem);
  const subject = computed(() => subjectOf(branch(), sem(), code));
  const units = computed(() => unitsOf(branch(), sem(), code));
  const progress = computed(() => subjectProgress(branch(), sem(), code));
  const key = computed(() => subjectKey(branch(), sem(), code));
  const tab = signal<"topics" | "text">("topics");
  const query = signal("");
  const focus = signal("");
  const paperNote = signal("");
  // The copy banner clears itself; leaving the paper cancels the timer so a
  // late tick cannot write into a screen that is gone.
  let noteTimer: ReturnType<typeof setTimeout> | undefined;
  let jumpTimer: ReturnType<typeof setTimeout> | undefined;
  cleanup(() => {
    if (noteTimer !== undefined) clearTimeout(noteTimer);
    if (jumpTimer !== undefined) clearTimeout(jumpTimer);
  });
  const keys = computed(() => units().map((unit) => unitKey(branch(), sem(), code, unit.id)));
  const matches = computed(() => (query().trim().length < 2 ? [] : matchesIn(units(), query())));
  const everyUnitOpen = computed(() => keys().length > 0 && keys().every((mark) => unitOpen()[mark] === true));

  // The scroll view is a reading position, not state the UI renders: the unit
  // offsets are measured on layout and only read by a jump.
  let scroller: { scrollTo?: (options: { x?: number; y?: number; animated?: boolean }) => void } | null = null;
  const offsets: number[] = [];

  const scrollToUnit = (index: number): void => {
    const y = offsets[index];
    if (y === undefined || !scroller || typeof scroller.scrollTo !== "function") return;
    scroller.scrollTo({ y: Math.max(0, y - 8), animated: true });
  };

  /** `branch|sem|code|unitId`, always built from the live course. */
  const markOf = (unitId: string): string => unitKey(branch(), sem(), code, unitId);

  const jumpTo = (match: SubjectMatch): void => {
    setUnitOpen(markOf(match.unitId), true);
    focus.set(match.topicId ?? "");
    // One frame for the opened unit to lay out, then scroll to its header.
    if (jumpTimer !== undefined) clearTimeout(jumpTimer);
    jumpTimer = setTimeout(() => {
      jumpTimer = undefined;
      scrollToUnit(match.unitIndex);
    }, 40);
  };

  /** The whole source text of the paper, with enough of a header to stand alone. */
  const copyPaper = async (): Promise<void> => {
    const item = subject();
    if (!item) return;
    const text = `${item.name} (${item.code}) · Sem ${sem()}\n\n${item.content ?? ""}`.trim();
    const copied = await copyText(text);
    const note = copied ? "Copied." : "Could not reach the clipboard.";
    if (noteTimer !== undefined) clearTimeout(noteTimer);
    paperNote.set(note);
    noteTimer = setTimeout(() => {
      noteTimer = undefined;
      if (paperNote() === note) paperNote.set("");
    }, 2600);
  };

  once(() => {
    const item = subject();
    if (item) rememberSubject(branch(), sem(), code, item.name);
    // Open the first unit that prints topics, so the paper is readable without
    // a first tap but a 12-unit paper still starts as a list of units.
    const first = units().find((unit) => unit.topics.length > 0);
    const mark = first ? markOf(first.id) : "";
    if (first && unitOpen()[mark] === undefined) setUnitOpen(mark, true);
  });

  return (
    <Screen>
      <Scroll
        class="flex-1"
        testID="subject-scroll"
        contentClass="p-4 gap-4 pb-10"
        keyboardShouldPersistTaps="handled"
        ref={(node: unknown) => {
          scroller = node as typeof scroller;
        }}
      >
        <View class="gap-4">
          {() => {
            const item = subject();
            if (!item) {
              return (
                <EmptyState
                  icon="search"
                  title="Subject not found"
                  hint={`“${code || "No code given"}” is not a paper in ${branchName(branch())} · Sem ${sem()}. Try the search if it belongs to another branch.`}
                  action="Search the syllabus"
                  onAction={() => props.nav.push("syllabus.search", { q: code })}
                />
              );
            }
            return (
              <SubjectCard
                subject={item}
                sem={sem()}
                progress={progress}
                saved={() => saved()[key()] === true}
                onToggleSaved={() => toggleSaved(key())}
                onNotes={() =>
                  props.nav.push("notes.subject", { branch: branch(), sem: sem(), code, name: item.name })
                }
                onPapers={() => props.nav.push("pyqs", { q: code })}
              />
            );
          }}

          {() =>
            subject() ? (
              <Row class="gap-2">
                <Pick active={tab() === "topics"} label="Units and topics" onPress={() => tab.set("topics")}>
                  {`Units · ${units().length}`}
                </Pick>
                <Pick active={tab() === "text"} label="Full source text" onPress={() => tab.set("text")}>
                  Full text
                </Pick>
              </Row>
            ) : null
          }

          {() =>
            subject() && tab() === "text" ? (
              <SourceBox
                content={() => subject()?.content ?? ""}
                note={paperNote}
                onCopy={() => void copyPaper()}
              />
            ) : null
          }

          {/*
            Kept mounted across tab and query changes on purpose: the native
            text input must keep its instance while `query` changes, or a
            keystroke lands on a disposed signal ("not a live signal"). The
            hide is a style, not a remount.
          */}
          <View
            class="gap-3"
            style={{ display: subject() && tab() === "topics" && units().length > 0 ? "flex" : "none" }}
          >
            <View class="gap-2">
              <Search value={query()} onChange={query.set} placeholder="Find a topic in this paper" />
              <Row class="items-center gap-2">
                <Label class="flex-1">
                  {() =>
                    query().trim().length >= 2
                      ? `${matches().length} ${matches().length === 1 ? "match" : "matches"}`
                      : `${units().length} units · ${progress().topics} topics`
                  }
                </Label>
                {() =>
                  query().trim().length >= 2 ? (
                    <Btn
                      variant="link"
                      class="min-h-11 px-2"
                      label="Clear the search"
                      onPress={() => query.set("")}
                    >
                      Clear
                    </Btn>
                  ) : (
                    <Btn
                      variant="link"
                      class="min-h-11 px-2"
                      label={everyUnitOpen() ? "Collapse every unit" : "Expand every unit"}
                      onPress={() => setUnitsOpen(keys(), !everyUnitOpen())}
                    >
                      {() => (everyUnitOpen() ? "Collapse all" : "Expand all")}
                    </Btn>
                  )
                }
              </Row>
            </View>

            {() =>
              query().trim().length < 2 ? null : <MatchList items={matches} term={query} onJump={jumpTo} />
            }

            {() => (
              <Each of={units()} key={(unit: Unit) => unit.id}>
                {(unit: () => Unit, index: () => number) => (
                  <UnitBlock
                    unit={unit}
                    index={index()}
                    branch={branch()}
                    sem={sem()}
                    code={code}
                    name={subject()?.name ?? code}
                    open={() => unitOpen()[markOf(unit().id)] === true}
                    onToggle={() => setUnitOpen(markOf(unit().id), unitOpen()[markOf(unit().id)] !== true)}
                    onMeasure={(y: number) => {
                      offsets[index()] = y;
                    }}
                    query={query}
                    focus={focus}
                    onShortNote={() =>
                      props.nav.push("notes.subject", {
                        branch: branch(),
                        sem: sem(),
                        code,
                        name: subject()?.name ?? code,
                      })
                    }
                  />
                )}
              </Each>
            )}
          </View>
          <FeedbackFooter />
        </View>
      </Scroll>
    </Screen>
  );
}

/* ----------------------------------------------------------------- search */

function SearchScreen(props: { nav: Nav }) {
  const initial = param(props.nav, "q");
  const query = signal(initial);
  const term = signal(initial);
  const everywhere = signal(false);

  // Debounce: the list searches what the student stopped typing (180 ms), not
  // every keystroke. `cleanup` clears the previous timer on the next keystroke.
  effect(() => {
    const text = query();
    const timer = setTimeout(() => term.set(text), 180);
    cleanup(() => clearTimeout(timer));
  });

  const branches = computed(() => (everywhere() ? BRANCH_META.map((meta) => meta.code) : [course().branch]));
  const result = computed(() => searchHits(term(), branches()));
  const settled = computed(() => query().trim() === term().trim());
  const short = computed(() => term().trim().length < 2);

  const openHit = (hit: Hit): void =>
    props.nav.push("syllabus.subject", { code: hit.code, branch: hit.branch, sem: hit.sem });

  return (
    <Screen>
      {/*
        The search field and scope picks sit outside the reactive List block on
        purpose: the re-mounted List re-created the Input under them, and a
        pending native text event then set a disposed signal ("not a live
        signal" crash on the first keystroke). A toolbar above a stable title
        bar cannot be disposed while the student is typing.
      */}
      <ListBar title="Search" meta={short() ? "every paper" : `${result().total} matches`} />
      <View class="gap-3 pb-2 pt-3">
        <Search value={query()} onChange={query.set} placeholder="Topic, paper or code" />
        <Row class="items-center gap-2">
          <Pick active={!everywhere()} label="My branch" onPress={() => everywhere.set(false)}>
            {shortBranch(course().branch)}
          </Pick>
          <Pick active={everywhere()} label="All branches" onPress={() => everywhere.set(true)}>
            All branches
          </Pick>
          <View class="flex-1" />
          <Muted class="text-[11px] tabular-nums">{settled() ? `${result().hits.length}/${result().total}` : "…"}</Muted>
        </Row>
        <Muted class="text-[11px]">
          {settled()
            ? "Code first, then paper names, then topics. Tap a hit to open the paper."
            : "Searching…"}
        </Muted>
      </View>
      {() => (
        <List
        class="flex-1"
        each={result().hits}
        keyExtractor={(hit: Hit) => hit.key}
        estimatedItemSize={108}
        contentClass="gap-2 px-4 pb-10"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        empty={
          <View class="pt-4">
            <EmptyState
              icon="search"
              title={short() ? "Search the whole syllabus" : `Nothing matched “${term().trim()}”`}
              hint={
                short()
                  ? "Two letters is enough: a code like 105301, a paper name, or any word inside a topic."
                  : everywhere()
                    ? "Try a shorter word, or the paper's code. Every title and topic body is searched."
                    : "Nothing in this branch matched. The other branches carry their own papers."
              }
              action={short() ? undefined : everywhere() ? "Clear search" : "Search all branches"}
              onAction={() => (everywhere() ? query.set("") : everywhere.set(true))}
            />
          </View>
        }
      >
        {(hit: () => Hit) => <HitRow item={hit} term={term} onOpen={openHit} />}
        </List>
      )}
    </Screen>
  );
}

/* ------------------------------------------------------------------ saved */

function SavedScreen(props: { nav: Nav }) {
  const lines = computed(() => savedItems());
  const removal = computed(() => lastRemoval());
  const total = computed(() => lines().filter((line) => line.kind === "row").length);

  const openLine = (line: SavedLine): void =>
    props.nav.push("syllabus.subject", { code: line.code, branch: line.branch, sem: line.sem });

  return (
    <Screen>
      <ListBar title="Saved" meta={`${total()} items`} />
      {removal() ? <UndoLine label={removal()?.label ?? ""} onUndo={undoSaved} onDismiss={dismissRemoval} /> : null}
      {() => (
        <List
        class="flex-1"
        each={lines()}
        keyExtractor={(line: SavedLine) => line.key}
        estimatedItemSize={76}
        contentClass="gap-2 p-4 pb-10"
        empty={
          <EmptyState
            icon="star"
            title="Nothing saved yet"
            hint="Tap the star beside a topic, or save a whole paper from its header. What you keep lands here, grouped by branch."
            action="Browse the syllabus"
            onAction={() => props.nav.push("syllabus")}
          />
        }
      >
        {(line: () => SavedLine) => <SavedLineView item={line} onOpen={openLine} onRemove={removeSaved} />}
        </List>
      )}
    </Screen>
  );
}

/* ------------------------------------------------------------------- GATE */

function GateScreen(props: { nav: Nav }) {
  const paper = signal(param(props.nav, "paper") || GATE_META[0]?.code || "CS");
  const rows = computed(() => gateRows(paper()));
  const sections = computed(() => rows().filter((line) => line.kind === "section").length);
  const topics = computed(() => rows().filter((line) => line.kind === "topic").length);

  return (
    <Screen>
      <ListBar title="GATE syllabus" meta={`${sections()} sections · ${topics()} topics`} />
      {() => (
        <List
        class="flex-1"
        each={rows()}
        keyExtractor={(line: GateLine) => line.key}
        estimatedItemSize={72}
        contentClass="gap-2 px-4 pb-10"
        empty={<EmptyState title="Paper not available" hint="Pick another GATE paper above." />}
        header={<GateHeader paper={paper} onPick={paper.set} />}
      >
        {(line: () => GateLine) => <GateLineView item={line} onToggle={toggleOpen} />}
        </List>
      )}
    </Screen>
  );
}

/* ---------------------------------------------------------------- routes */

export const syllabusRoutes: RouteDef[] = [
  { name: "syllabus", title: () => "Syllabus", render: (nav) => <LandingScreen nav={nav} /> },
  {
    name: "syllabus.subject",
    // The bar carries the paper's name; the code stays in the hero, where it is
    // the thing a student reads off a notice.
    title: (params) => {
      const code = String(params.code ?? "");
      const branch = String(params.branch ?? course().branch);
      const sem = Number(params.sem ?? course().sem) || course().sem;
      return subjectOf(branch, sem, code)?.name ?? (code || "Subject");
    },
    render: (nav) => <SubjectScreen nav={nav} />,
  },
  { name: "syllabus.search", title: () => "Search syllabus", render: (nav) => <SearchScreen nav={nav} /> },
  { name: "syllabus.saved", title: () => "Saved", render: (nav) => <SavedScreen nav={nav} /> },
  { name: "syllabus.gate", title: () => "GATE syllabus", render: (nav) => <GateScreen nav={nav} /> },
];
