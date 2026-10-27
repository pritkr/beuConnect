/**
 * Notes & VVI — the shelf a student actually revises from.
 *
 * Two things answer the same question ("what do I read for this exam?"):
 *
 *  - VVI topics with short notes, written for BEU's own syllabus.
 *  - PDFs uploaded per subject, opened in the app's shared PDF reader.
 *
 * The manifest is remote (`docs/NOTES.md`, `scripts/notes/build-notes.py`) and
 * cached, so the shelf opens offline. The course defaults to the last one read
 * here, then the saved profile; branch and semester are always switchable, so
 * notes for a friend's branch are two taps away.
 */

import { Clipboard, View, announce, effect, signal, untracked } from "nsh";
import type { Nav, RouteDef } from "../../app/router";
import { numParam, param } from "../../app/router";
import {
  Badge,
  Body,
  Divider,
  EmptyState,
  ErrorState,
  Muted,
  Panel,
  Screen,
  Search,
  SectionHeader,
  Title,
} from "../../ui";
import { debounce } from "../../lib/net";
import {
  branchMeta,
  courseTitle,
  findSubject,
  firstCourse,
  isBranch,
  loadNotes,
  readSavedCourse,
  saveCourse,
  searchSubjects,
  shelfSummary,
  subjectSummary,
  subjectsFor,
  topicText,
  updatedLabel,
} from "./data";
import type { Course, NoteFile, NoteSubject, NotesManifest, VviTopic } from "./data";
import { BranchRail, NoteFileRow, NotesSkeleton, SemesterRail, SubjectRow, SubjectSkeleton, VviCard } from "./parts";

/* ------------------------------------------------------------------- state */

const manifest = signal<NotesManifest | null>(null);
const stale = signal(false);
const problem = signal("");
const savedCourse = signal<Course | null>(null);
const courseReady = signal(false);
const picked = signal<Course | null>(null);
const query = signal("");
const needle = signal("");

let reading: Promise<void> | null = null;
let savedReading: Promise<void> | null = null;

/** Loads the manifest (or the cached copy) for this screen open; `force` is retry. */
function load(force = false): Promise<void> {
  if (reading) return reading;
  reading = loadNotes({ refresh: force })
    .then((result) => {
      manifest.set(result.manifest);
      stale.set(result.stale);
      problem.set("");
      if (result.revalidate) {
        void result.revalidate.then((fresh) => {
          if (fresh === null && manifest() === result.manifest) stale.set(true);
        });
      }
    })
    .catch((error) => {
      problem.set(error instanceof Error ? error.message : "Could not load the notes shelf.");
    })
    .finally(() => {
      reading = null;
    });
  return reading;
}

function ensureSavedCourse(): void {
  if (courseReady() || savedReading) return;
  savedReading = readSavedCourse()
    .then((course) => {
      if (course) savedCourse.set(course);
    })
    .catch(() => undefined)
    .then(() => {
      courseReady.set(true);
      savedReading = null;
    });
}

/** Picked here, then remembered from the profile, then the first covered course. */
function currentCourse(): Course | null {
  const pick = picked();
  if (pick) return pick;
  const remembered = savedCourse();
  if (remembered) return remembered;
  const snapshot = manifest();
  return snapshot ? firstCourse(snapshot) : null;
}

const laterQuery = debounce((value: string) => needle.set(value.trim()), 180);

function changeQuery(value: string): void {
  query.set(value);
  if (value.trim() === "") {
    needle.set("");
    return;
  }
  laterQuery(value);
}

/* ------------------------------------------------------------- shelf screen */

function NotesScreen(props: { nav: Nav }) {
  void load();
  ensureSavedCourse();

  // A deep link (`notes` with `branch`/`sem`) wins over the remembered course;
  // an unknown branch or a semester outside 1–8 is ignored, not guessed at.
  const routeBranch = param(props.nav, "branch").toLowerCase();
  const routeSem = numParam(props.nav, "sem");
  effect(() => {
    untracked(() => {
      if (routeBranch === "" || !isBranch(routeBranch)) return;
      if (routeSem < 1 || routeSem > 8) return;
      picked.set({ branch: routeBranch, sem: routeSem });
    });
  });

  const pick = (branch: string, sem: number): void => {
    const next = { branch, sem };
    picked.set(next);
    void saveCourse(next);
    query.set("");
    needle.set("");
  };

  const open = (subject: NoteSubject): void => {
    props.nav.push("notes.subject", {
      branch: subject.branch,
      sem: subject.sem,
      code: subject.code,
      name: subject.name,
    });
  };

  return (
    <Screen>
      <Body>
        {() => {
          if (manifest() === null) {
            return problem() ? (
              <ErrorState message={problem()} onRetry={() => void load(true)} />
            ) : (
              <NotesSkeleton />
            );
          }
          if (!courseReady()) return <NotesSkeleton />;

          const snapshot = manifest() as NotesManifest;
          const course = currentCourse() ?? { branch: "cse", sem: 1 };
          const all = subjectsFor(snapshot, course.branch, course.sem);
          const typed = query().trim();
          const active = needle().trim() || typed;
          const rows = typed === "" ? all : searchSubjects(all, active);
          const clear = (): void => {
            query.set("");
            needle.set("");
          };
          const updated = updatedLabel(snapshot.updatedAt);
          const provenance = stale() ? (updated ? `${updated} · Offline copy` : "Offline copy") : updated;

          return (
            <View class="gap-4">
              <View class="gap-0.5">
                <Title>{courseTitle(course)}</Title>
                <Muted class="text-[12px] tabular-nums">{shelfSummary(all)}</Muted>
                {provenance ? (
                  <Muted class="text-[11px] tabular-nums" numberOfLines={1}>
                    {provenance}
                  </Muted>
                ) : null}
              </View>

              <BranchRail value={() => course.branch} onPick={(branch) => pick(branch, course.sem)} />
              <SemesterRail value={() => course.sem} onPick={(sem) => pick(course.branch, sem)} />

              <Search value={query()} onChange={changeQuery} placeholder="Subject, code or VVI topic" />

              {all.length === 0 ? (
                <EmptyState
                  icon="note"
                  title={`No notes for ${branchMeta(course.branch).name} semester ${course.sem} yet.`}
                  action="Papers for the same subjects"
                  onAction={() => props.nav.push("pyqs")}
                />
              ) : (
                <>
                  <SectionHeader
                    title={typed === "" ? "Subjects" : "Matches"}
                    trailing={<Badge tone="neutral">{String(rows.length)}</Badge>}
                  />

                  {rows.length === 0 ? (
                    <EmptyState
                      icon="search"
                      title={`No match for “${typed}”`}
                      action="Clear search"
                      onAction={clear}
                    />
                  ) : (
                    <View class="overflow-hidden rounded-3xl border border-border bg-card">
                      {rows.map((subject, index) => (
                        <View>
                          {index > 0 ? <Divider /> : null}
                          <SubjectRow subject={subject} onPress={() => open(subject)} />
                        </View>
                      ))}
                    </View>
                  )}
                </>
              )}
            </View>
          );
        }}
      </Body>
    </Screen>
  );
}

/* ----------------------------------------------------------- subject screen */

function SubjectScreen(props: { nav: Nav }) {
  void load();

  const branch = param(props.nav, "branch").toLowerCase();
  const sem = numParam(props.nav, "sem");
  const code = param(props.nav, "code");
  const copied = signal("");

  const copy = (subject: NoteSubject, topic: VviTopic): void => {
    void Clipboard.writeText(topicText(subject, topic))
      .then(() => {
        copied.set(topic.topic);
        announce("Topic copied");
        setTimeout(() => {
          if (copied() === topic.topic) copied.set("");
        }, 2000);
      })
      .catch(() => announce("Could not copy the topic"));
  };

  const openFile = (file: NoteFile): void => {
    props.nav.push("pyqs.pdf", { url: file.url, title: file.title });
  };

  return (
    <Screen>
      <Body>
        {() => {
          if (manifest() === null) {
            return problem() ? (
              <ErrorState message={problem()} onRetry={() => void load(true)} />
            ) : (
              <SubjectSkeleton />
            );
          }

          const subject = findSubject(manifest() as NotesManifest, branch, sem, code);
          if (!subject) {
            return (
              <EmptyState
                icon="note"
                title="This subject is not on the notes shelf."
                action="Go back"
                onAction={() => props.nav.pop()}
              />
            );
          }

          return (
            <View class="gap-4">
              <View class="gap-1">
                <Title>{subject.name}</Title>
                <Muted class="text-[12px] tabular-nums">
                  {[subject.code, `Semester ${subject.sem}`, subjectSummary(subject)]
                    .filter((part) => part !== "")
                    .join(" · ")}
                </Muted>
              </View>

              <View class="gap-3">
                <SectionHeader
                  title="VVI topics"
                  trailing={<Badge tone="mint">{String(subject.vvi.length)}</Badge>}
                />
                {subject.vvi.length === 0 ? (
                  <Panel tone="plain">
                    <Muted>No VVI topics for this subject yet.</Muted>
                  </Panel>
                ) : (
                  subject.vvi.map((topic) => (
                    <VviCard
                      topic={topic}
                      copied={() => copied() === topic.topic}
                      onCopy={() => copy(subject, topic)}
                    />
                  ))
                )}
              </View>

              <View class="gap-3">
                <SectionHeader
                  title="Notes"
                  trailing={<Badge tone="neutral">{String(subject.files.length)}</Badge>}
                />
                {subject.files.length === 0 ? (
                  <Panel tone="plain">
                    <Muted>No PDFs for this subject yet.</Muted>
                  </Panel>
                ) : (
                  <View class="overflow-hidden rounded-3xl border border-border bg-card">
                    {subject.files.map((file, index) => (
                      <View>
                        {index > 0 ? <Divider /> : null}
                        <NoteFileRow file={file} onPress={() => openFile(file)} />
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          );
        }}
      </Body>
    </Screen>
  );
}

/* ----------------------------------------------------------------- routes */

export const notesRoutes: RouteDef[] = [
  {
    name: "notes",
    title: () => "Notes & VVI",
    render: (nav) => <NotesScreen nav={nav} />,
  },
  {
    name: "notes.subject",
    title: (params) => String(params.name || "Subject notes"),
    render: (nav) => <SubjectScreen nav={nav} />,
  },
];
