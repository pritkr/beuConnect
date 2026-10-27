/**
 * PYQ library — the front door.
 *
 * The shelf is the syllabus: every branch, every semester and every subject
 * code the app knows about is listed, and a subject with no paper yet says so
 * instead of disappearing. Branch and semester narrow the shelf; search runs
 * across names, subject codes and paper years. Everything here is bundled
 * metadata, so it paints instantly and works offline.
 *
 * Ordering is deliberate (see `importance.ts`): the student's semester first,
 * then the rows worth revising — papers, credits, recency — then the rest. A
 * search keeps its relevance order instead. Until the student picks chips of
 * their own the shelf opens on the saved course, so "current semester primary"
 * is true the moment the app meets the student.
 * At 320 pt the branch and semester rails wrap instead of scrolling, so no
 * branch is hidden off the right edge.
 */

import { List, Scroll, View, computed, signal } from "nsh";
import type { Nav, RouteDef } from "../../app/router";
import { param } from "../../app/router";
import {
  Badge,
  Chip,
  EmptyState,
  Screen,
  Search,
  SectionHeader,
  Stat,
  ListBar,
} from "../../ui";
import { SITE } from "../../lib/net";
import {
  activeSemesters,
  branches,
  orderedSemesters,
  semestersOf,
  shortBranchName,
  subjectsOf,
  searchSubjects,
  totalPapers,
  type CatalogSubject,
} from "./catalog";
import { rankSubjects } from "./importance";
import { gateTotalPapers, searchGateSubjects } from "./gate-index";
import { openPdfPaper } from "./pdf-index";
import { cachedPaperSlugs } from "./api";
import {
  clearRecents,
  effectiveCourse,
  prefs,
  recents,
  setPrefs,
  type RecentPaper,
} from "./state";
import { Cell, Hero, JumpCard, openPaper, RecentCard } from "./components";
import { CardLink, RowLabel, SubjectRow } from "./shelf";

function openRecent(nav: Nav, item: RecentPaper): void {
  if (item.kind === "gate") {
    nav.push("pyqs.gate", {
      url: `${SITE}${item.file.startsWith("/") ? item.file : `/${item.file}`}`,
      title: item.name,
      subtitle: item.label,
      file: item.file,
    });
    return;
  }
  nav.push("pyqs.paper", {
    slug: item.slug,
    code: item.code,
    year: item.year,
    variant: item.variant,
    id: item.id,
    title: item.title,
    name: item.name,
    branch: item.branch,
    sem: item.sem,
  });
}

/** The shelf's two filters: the tapped chips, or the saved course until then. */
function selectionOf(): { branch: string | null; sem: number | null } {
  return effectiveCourse();
}

function BrowseScreen(props: { nav: Nav }) {
  const query = signal(param(props.nav, "q"));
  const openSubject = signal("");
  /** Slugs with papers already on the device, for the row badges. */
  const savedSlugs = signal<Set<string>>(new Set());
  const readSaved = (): void => {
    void cachedPaperSlugs()
      .then((slugs) => savedSlugs.set(slugs))
      .catch(() => undefined);
  };
  readSaved();
  const now = new Date();

  const matches = computed(() => {
    const selection = selectionOf();
    const rows = searchSubjects(query(), selection.branch, selection.sem);
    // A search hit keeps its relevance order; a browse is ranked for the
    // student — their semester, then papers, credits and recency.
    if (query().trim()) return rows;
    return rankSubjects(rows, {
      current: selection.sem,
      branch: selection.branch,
      now,
    });
  });
  const shelfTotal = computed(
    () => subjectsOf(selectionOf().branch, selectionOf().sem).length,
  );
  const availableSems = computed(() => orderedSemesters(now));
  const activeSems = computed(() => activeSemesters(now));
  const gateMatches = computed(() => searchGateSubjects(query()).length);
  const selectionEmpty = computed(() => {
    const selection = selectionOf();
    return (
      selection.sem !== null &&
      subjectsOf(selection.branch, selection.sem).length === 0
    );
  });
  const branchValue = computed(() => {
    const chosen = selectionOf().branch;
    const name = chosen === null ? "All branches" : shortBranchName(chosen);
    return prefs().custom ? name : `Your course · ${name}`;
  });

  const pickBranch = (branch: string | null) => {
    const sems = semestersOf(branch);
    const current = selectionOf().sem;
    const sem = current !== null && sems.includes(current) ? current : null;
    setPrefs({ branch, sem });
  };

  return (
    <Screen>
      {() => <ListBar title="Previous papers" meta={`${matches().length} subjects`} />}
      {() => (
        <List
          class="flex-1"
          each={matches()}
          keyExtractor={(subject: CatalogSubject) => subject.key}
          estimatedItemSize={104}
          contentClass="gap-2 px-4 pb-10"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          empty={
            <View class="gap-3 pt-2">
              <EmptyState
                icon="search"
                title={
                  query().trim()
                    ? "No subject matched"
                    : selectionEmpty()
                      ? `Sem ${selectionOf().sem} is not in the syllabus snapshot`
                      : "Nothing in this shelf"
                }
                hint={
                  query().trim()
                    ? "Try a shorter name or a subject code. GATE papers have their own search."
                    : selectionEmpty()
                      ? `The syllabus snapshot lists no Sem ${selectionOf().sem} subjects for ${shortBranchName(
                          selectionOf().branch ?? "cse",
                        )}. Pick another semester — the papers and codes that do exist are still listed.`
                      : "Pick another branch or semester."
                }
                action={
                  query().trim()
                    ? "Clear search"
                    : selectionEmpty()
                      ? "Show all semesters"
                      : undefined
                }
                onAction={() =>
                  query().trim()
                    ? query.set("")
                    : setPrefs({ ...selectionOf(), sem: null })
                }
              />
              <If when={query().trim().length > 0 && gateMatches() > 0}>
                <JumpCard
                  title={`GATE matched ${gateMatches()} paper${gateMatches() === 1 ? "" : "s"}`}
                  hint={`Search “${query().trim()}” in the GATE library`}
                  icon="certification"
                  tone="mint"
                  onPress={() => props.nav.push("pyqs.gate", { q: query() })}
                />
              </If>
            </View>
          }
          header={
            <View class="gap-4 pb-2 pt-4">
              <Hero>
                <View class="flex-row gap-4">
                  <Stat
                    value={String(totalPapers())}
                    label="BEU papers"
                    tone="ember"
                    class="flex-1"
                  />
                  <Stat
                    value={String(gateTotalPapers())}
                    label="GATE PDFs"
                    tone="mint"
                    class="flex-1"
                  />
                </View>
              </Hero>

              <Search
                value={query()}
                onChange={query.set}
                placeholder="Subject, code or year"
              />

              <View class="gap-2">
                <RowLabel label="Branch" value={branchValue()} />
                <View class="flex-row flex-wrap gap-2">
                  <Chip
                    active={selectionOf().branch === null}
                    onPress={() => pickBranch(null)}
                    label="All branches"
                  >
                    All
                  </Chip>
                  {branches().map((branch) => {
                    const active = selectionOf().branch === branch.key;
                    return (
                      <Chip
                        active={active}
                        onPress={() => pickBranch(branch.key)}
                        label={`${shortBranchName(branch.key)}, ${
                          subjectsOf(branch.key, null).length
                        } subjects`}
                      >
                        {shortBranchName(branch.key)}
                      </Chip>
                    );
                  })}
                </View>
              </View>

              <View class="gap-2">
                <RowLabel
                  label="Semester"
                  value={
                    effectiveCourse()?.sem
                      ? `Your semester · ${effectiveCourse()!.sem}`
                      : `In session · ${activeSems().join(" · ")}`
                  }
                />
                <View class="flex-row flex-wrap gap-2">
                  <Chip
                    active={selectionOf().sem === null}
                    onPress={() => setPrefs({ ...selectionOf(), sem: null })}
                    label="All semesters"
                  >
                    All
                  </Chip>
                  {availableSems().map((sem) => {
                    const active = selectionOf().sem === sem;
                    return (
                      <Chip
                        active={active}
                        tone={effectiveCourse()?.sem === sem ? "amber" : undefined}
                        onPress={() => setPrefs({ ...selectionOf(), sem })}
                        label={`Semester ${sem}${activeSems().includes(sem) ? ", in session" : ""}`}
                      >
                        {`Sem ${sem}`}
                      </Chip>
                    );
                  })}
                </View>
              </View>

              <If when={recents().length > 0}>
                <View class="gap-2">
                  <SectionHeader
                    title="Recently opened"
                    action="Clear"
                    onAction={clearRecents}
                    trailing={<Badge tone="mint">{`${recents().length}`}</Badge>}
                  />
                  <Scroll
                    horizontal
                    class="flex-1"
                    scrollbar={false}
                    bounces={false}
                    contentClass="flex-row gap-2 pr-4"
                  >
                    <Each of={recents()} key={(item: RecentPaper) => item.key}>
                      {(item) => (
                        <RecentCard
                          item={item()}
                          onPress={() => openRecent(props.nav, item())}
                        />
                      )}
                    </Each>
                  </Scroll>
                </View>
              </If>

              <View class="flex-row gap-2">
                <CardLink
                  title="GATE"
                  hint={`${gateTotalPapers()} PDFs`}
                  icon="certification"
                  tone="mint"
                  onPress={() => props.nav.push("pyqs.gate", {})}
                />
                <CardLink
                  title="Data"
                  hint="Result tables"
                  icon="table"
                  onPress={() =>
                    props.nav.push("data", query().trim() ? { q: query() } : {})
                  }
                />
              </View>

              <SectionHeader
                title={query().trim() ? "Search results" : "Subjects"}
                trailing={<Badge tone="mint">{`${matches().length} of ${shelfTotal()}`}</Badge>}
              />
            </View>
          }
          footer={<View class="h-4" />}
        >
          {(row: () => CatalogSubject) => (
            // Keyed by the row's item (and the open state, which the row body
            // reads once per mount) so a reused cell always remounts its row:
            // the same repaint discipline the recents strip and GATE cells keep.
            <Cell
              row={row}
              id={(item) => item.key}
              fresh={() => (openSubject() === row().key ? "open" : "")}
              build={(item) => (
                <SubjectRow
                  subject={item}
                  showBranch={selectionOf().branch === null}
                  expanded={openSubject() === item.key}
                  saved={savedSlugs().has(item.slug)}
                  onSavedChange={readSaved}
                  onToggle={() =>
                    openSubject.set(openSubject() === item.key ? "" : item.key)
                  }
                  onSyllabus={() =>
                    props.nav.push("syllabus.subject", {
                      branch: item.branch,
                      sem: item.sem,
                      code: item.code || item.codes[0] || "",
                    })
                  }
                  onPaper={(paper) => openPaper(props.nav, item, paper)}
                  onPdf={(paper) => openPdfPaper(props.nav, paper, item.name)}
                />
              )}
            />
          )}
        </List>
      )}
    </Screen>
  );
}

export const browseRoutes: RouteDef[] = [
  {
    name: "pyqs",
    title: () => "Previous papers",
    render: (nav) => <BrowseScreen nav={nav} />,
  },
];
