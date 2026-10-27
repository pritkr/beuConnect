/**
 * Profile — where the app learns who is using it.
 *
 * One input carries the screen: the registration number. BEU publishes a roster
 * per batch and branch, and Results already reads a name, branch and college out
 * of it (`resolveIdentity`). The answer shows under the number the moment it is
 * valid, so the number alone is enough to be greeted by name; the name field is
 * only an override.
 *
 * Fields validate inline before they can be stored. A save dismisses the
 * keyboard and confirms once; deleting the profile is confirmed with what goes.
 *
 * Storage: "beu.profile", written only by ./profile.ts. Results caches the roster
 * answer under "beu.cache.identity:<reg>"; this screen never writes it.
 */

import { Keyboard, Text, View, computed, effect, signal } from "nsh";
import type { JSX } from "nsh";
import { Badge, Body, Btn, Chip, Field, Label, Muted, Panel, Screen, SectionHeader } from "../../ui";
import type { Identity } from "../results/identity";
import { resolveIdentity } from "../results/identity";
import {
  BRANCHES,
  EMPTY_PROFILE,
  NAME_LIMIT,
  REG_MAX,
  REG_MIN,
  SEMESTERS,
  branchName,
  branchShort,
  clearProfile,
  collegeLabel,
  courseLine,
  greetingName,
  isValidCollege,
  isValidProfile,
  isValidReg,
  normalizeCollege,
  normalizeProfile,
  normalizeReg,
  saveProfile,
  useProfile,
  useProfileReady,
} from "./profile";
import type { Profile } from "./profile";
import { confirmDestructive, ScreenIntro, SettingsGroup, SettingsRow } from "./ui";

type Status = "idle" | "saved" | "error" | "deleted";

/** The roster answer for the number in the field, or why there is none. */
type Lookup =
  | { state: "idle" }
  | { state: "checking"; reg: string }
  | { state: "found"; reg: string; identity: Identity }
  | { state: "unknown"; reg: string }
  | { state: "failed"; reg: string };

const IDLE_LOOKUP: Lookup = { state: "idle" };

/** Long enough that typing the last digit does not fire a roster read per key. */
const LOOKUP_DELAY = 350;

/** A BEU results branch ("Computer Science & Engineering") as a profile code. */
function branchCodeOf(name: string): string {
  const wanted = name.trim().toLowerCase();
  if (wanted === "") return "";
  const exact = BRANCHES.find((branch) => branch.name.toLowerCase() === wanted || branch.short.toLowerCase() === wanted);
  if (exact) return exact.code;
  const prefixed = BRANCHES.find((branch) => wanted.startsWith(`${branch.name.toLowerCase()} `));
  return prefixed ? prefixed.code : "";
}

/** Where a found name came from, in the app's own words. */
function sourceNote(identity: Identity): string {
  if (identity.source === "result") return "From your saved result";
  if (identity.source === "cache") return "Remembered on this phone";
  return "Checked against BEU's roster";
}

function sameProfile(a: Profile, b: Profile): boolean {
  return a.name === b.name && a.reg === b.reg && a.college === b.college && a.branch === b.branch && a.sem === b.sem;
}

/**
 * The kit's `Chip` reads `active` once, in its body, so a chosen strip has to be
 * a new strip when the choice changes. `Each` keys on the choice and rebuilds.
 */
function ChipRow(props: { chosen: string; children: () => JSX.Element }) {
  return (
    <Each of={[props.chosen]} key={(value) => value}>
      {() => props.children()}
    </Each>
  );
}

export function ProfileScreen() {
  const stored = useProfile();
  const ready = useProfileReady();
  const draft = signal<Profile>(stored());
  const status = signal<Status>("idle");
  const busy = signal(false);
  const lookup = signal<Lookup>(IDLE_LOOKUP);

  let seeded = false;
  let touched = false;
  let semTouched = false;
  let asked = "";
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stopTimer = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  /* Seed the form once the stored profile has been read, unless typing has begun. */
  effect(() => {
    if (seeded || !ready()) return;
    seeded = true;
    if (!touched) draft.set(stored());
  });

  /*
   * Ask Results who this number belongs to. Cheap answers (the identity cache, a
   * saved result) cost no network; a roster read is debounced so a fast thumb
   * does not start seven of them. `asked` is the guard: a late answer lands only
   * while the field still holds the number it was asked about.
   */
  effect(() => {
    const reg = draft().reg;
    if (!isValidReg(reg)) {
      asked = "";
      stopTimer();
      lookup.set(IDLE_LOOKUP);
      return;
    }
    if (reg === asked) return;
    asked = reg;
    stopTimer();
    lookup.set({ state: "checking", reg });
    timer = setTimeout(() => {
      timer = undefined;
      void resolveIdentity(reg).then(
        (identity) => {
          if (draft().reg !== reg) return;
          lookup.set(identity ? { state: "found", reg, identity } : { state: "unknown", reg });
        },
        () => {
          if (draft().reg !== reg) return;
          lookup.set({ state: "failed", reg });
        },
      );
    }, LOOKUP_DELAY);
  });

  const found = computed<Identity | null>(() => {
    const current = lookup();
    return current.state === "found" && current.reg === draft().reg ? current.identity : null;
  });

  /** BEU's branch as one of this screen's codes, when the roster names one. */
  const beuBranch = computed<string>(() => branchCodeOf(found()?.branchName ?? ""));

  /*
   * A registration number implies the class the student is in. Fill the semester
   * from the roster unless they have picked one, and never for a number that is
   * already saved — profile.ts owns that correction.
   */
  effect(() => {
    const identity = found();
    const value = draft();
    if (!identity || value.reg === "") return;
    const semester = identity.semester;
    if (semester === null || semTouched) return;
    if (stored().reg !== "" && stored().reg === value.reg) return;
    if (value.sem === semester) return;
    draft.update((current) => ({ ...current, sem: semester }));
  });

  /** What Home will show: the typed name wins, then BEU's. */
  const preview = computed<Profile>(() => {
    const value = draft();
    return { ...value, name: value.name || found()?.name || "", branch: value.branch || beuBranch() };
  });

  /** The college code packed into the first eight digits of a BEU number. */
  const derivedCollege = (): string => (draft().reg.length >= 8 ? draft().reg.slice(5, 8) : "");

  /** Offer the number's college only once the roster has had its say. */
  const collegeFromNumber = (): string => {
    const state = lookup().state;
    if (state === "checking" || state === "found") return "";
    return draft().college === "" ? derivedCollege() : "";
  };

  const canSave = (): boolean => isValidProfile(draft());

  const blocked = (): string => {
    const value = draft();
    if (!isValidReg(value.reg)) return `Your registration number needs ${REG_MIN}–${REG_MAX} digits.`;
    if (!value.branch) return "Pick your branch.";
    if (!isValidCollege(value.college)) return "A college code is three digits starting with 1, or blank.";
    return "";
  };

  const regHint = (): string => {
    const reg = draft().reg;
    return reg !== "" && !isValidReg(reg) ? `${reg.length} of ${REG_MIN} digits.` : "";
  };

  const nameHint = (): string => {
    const identity = found();
    if (!identity) return "";
    const typed = draft().name.trim().toLowerCase();
    if (typed === "") return "Blank uses BEU's name.";
    return typed === identity.name.toLowerCase() ? "" : "Saved instead of BEU's name.";
  };

  const collegeHint = (): string => {
    const code = draft().college;
    if (code === "") return "";
    if (code.length < 3) return `${code.length} of 3 digits.`;
    if (!isValidCollege(code)) return "A college code starts with 1.";
    return collegeLabel(code) ? "" : "Not in BEU's college list.";
  };

  /** BEU's branch and college, ready to apply to the form. */
  const fromBeu = computed<{ branch: string; college: string; label: string } | null>(() => {
    const identity = found();
    if (!identity) return null;
    const branch = beuBranch();
    const college = isValidCollege(identity.collegeCode) ? normalizeCollege(identity.collegeCode) : "";
    if (branch === "" && college === "") return null;
    return { branch, college, label: [branchShort(branch), college].filter(Boolean).join(" · ") };
  });

  const needsBeu = (): boolean => {
    const details = fromBeu();
    if (!details) return false;
    return (details.branch !== "" && draft().branch === "") || (details.college !== "" && draft().college === "");
  };

  const update = (patch: Partial<Profile>): void => {
    touched = true;
    if (patch.sem !== undefined) semTouched = true;
    draft.update((value) => ({ ...value, ...patch }));
    if (status() !== "idle") status.set("idle");
  };

  const applyBeu = (): void => {
    const details = fromBeu();
    if (!details) return;
    const value = draft();
    update({ branch: value.branch || details.branch, college: value.college || details.college });
  };

  const save = (): void => {
    if (busy() || !canSave()) return;
    Keyboard.dismiss();
    const next = normalizeProfile(draft());
    if (sameProfile(next, stored())) {
      draft.set(next);
      status.set("saved");
      return;
    }
    busy.set(true);
    void (async () => {
      const saved = await saveProfile(next);
      busy.set(false);
      if (!saved) {
        status.set("error");
        return;
      }
      draft.set(next);
      status.set("saved");
    })();
  };

  const remove = (): void => {
    void (async () => {
      Keyboard.dismiss();
      const current = stored();
      const who = current.name || "your name";
      const reg = current.reg ? `registration number ${current.reg}` : "your registration number";
      const confirmed = await confirmDestructive(
        "Delete your profile?",
        `This removes ${who}, ${reg}, your branch and semester from this phone. Saved results, read marks and attendance stay.`,
        "Delete profile",
      );
      if (!confirmed) return;
      touched = true;
      await clearProfile();
      draft.set(EMPTY_PROFILE);
      status.set("deleted");
    })();
  };

  /** The answer, or why there is none — one panel, never two. */
  const beuAnswer = (): JSX.Element | null => {
    const current = lookup();
    if (current.state === "idle" || current.reg !== draft().reg) return null;
    const identity = found();
    if (identity) {
      const branch = beuBranch();
      const badge = branch ? branchShort(branch) : identity.branchName;
      return (
        <Panel tone="mint" class="gap-2">
          <Label>What BEU says</Label>
          <Text class="text-[20px] font-bold tracking-tight text-foreground" numberOfLines={2}>
            {identity.name}
          </Text>
          {identity.collegeName || identity.collegeCode ? (
            <Muted class="text-[13px] leading-5">
              {identity.collegeName || `College ${identity.collegeCode}`}
            </Muted>
          ) : null}
          <View class="flex-row flex-wrap items-center gap-2">
            {badge ? <Badge tone="mint">{badge}</Badge> : null}
            <Muted class="text-[11px] leading-4">{sourceNote(identity)}</Muted>
          </View>
        </Panel>
      );
    }
    if (current.state === "checking") {
      return (
        <Panel tone="plain" class="gap-1">
          <Label>What BEU says</Label>
          <Muted class="text-[13px] leading-5">Checking BEU's roster…</Muted>
        </Panel>
      );
    }
    return (
      <Panel tone="amber" class="gap-1">
        <Label>What BEU says</Label>
        <Muted class="text-[13px] leading-5">
          {current.state === "failed"
            ? "BEU's roster could not be reached."
            : "No row for this number in BEU's roster yet."}
        </Muted>
      </Panel>
    );
  };

  /** One confirmation, or the reason it failed. */
  const statusPanel = (): JSX.Element | null => {
    const current = status();
    if (current === "saved") {
      return (
        <Panel tone="mint" class="gap-1">
          <Label>Saved</Label>
          <Muted class="text-[12px] leading-5">
            {draft().name !== "" || found() !== null ? `Home greets you as ${greetingName(preview())}.` : "Add a name to be greeted."}
          </Muted>
        </Panel>
      );
    }
    if (current === "error") {
      return (
        <Panel tone="amber" class="gap-1">
          <Label>Could not save</Label>
          <Muted class="text-[12px] leading-5">Check the number and branch, then try again.</Muted>
        </Panel>
      );
    }
    if (current === "deleted") {
      return (
        <Panel tone="plain" class="gap-1">
          <Label>Profile deleted</Label>
          <Muted class="text-[12px] leading-5">Saved results, read marks and attendance were left untouched.</Muted>
        </Panel>
      );
    }
    return null;
  };

  const hasProfile = (): boolean => stored().reg !== "" || stored().name !== "";

  return (
    <Screen>
      <Body>
        <ScreenIntro label="You" title="Your profile" />

        <Panel tone="ember" class="gap-1">
          <Label>Home greets you</Label>
          <Text class="text-[22px] font-bold tracking-tight text-foreground">Hi, {greetingName(preview())}</Text>
          {courseLine(preview()) ? <Muted>{courseLine(preview())}</Muted> : null}
        </Panel>

        <Field
          label="Registration number"
          value={draft().reg}
          onChange={(value: string) => update({ reg: normalizeReg(value) })}
          placeholder="e.g. 23101107001"
          keyboard="number-pad"
          hint={regHint()}
        />

        {beuAnswer()}

        <Field
          label="Name (optional)"
          value={draft().name}
          onChange={(value: string) => update({ name: value.slice(0, NAME_LIMIT) })}
          placeholder="e.g. Aashish Pandey"
          maxLength={NAME_LIMIT}
          hint={nameHint()}
        />

        <View class="gap-2">
          <Label>Branch</Label>
          <ChipRow chosen={draft().branch}>
            {() => (
              <View class="flex-row flex-wrap gap-2">
                {BRANCHES.map((branch) => (
                  <Chip
                    active={draft().branch === branch.code}
                    onPress={() => update({ branch: branch.code })}
                    class="min-h-10 px-3"
                  >
                    {branch.short}
                  </Chip>
                ))}
              </View>
            )}
          </ChipRow>
          {draft().branch ? <Muted>{branchName(draft().branch)}</Muted> : null}
        </View>

        <View class="gap-2">
          <Label>Semester</Label>
          <ChipRow chosen={String(draft().sem)}>
            {() => (
              <View class="flex-row flex-wrap gap-2">
                {SEMESTERS.map((sem) => (
                  <Chip active={draft().sem === sem} onPress={() => update({ sem })} class="min-h-10">
                    {String(sem)}
                  </Chip>
                ))}
              </View>
            )}
          </ChipRow>
        </View>

        <Field
          label="College code"
          value={draft().college}
          onChange={(value: string) => update({ college: normalizeCollege(value) })}
          placeholder="e.g. 157"
          keyboard="number-pad"
          maxLength={3}
          hint={collegeHint()}
        />

        {needsBeu() ? (
          <View class="flex-row items-center gap-2">
            <Muted class="flex-1">From BEU</Muted>
            <Chip tone="mint" onPress={applyBeu}>
              Use {fromBeu()?.label ?? ""}
            </Chip>
          </View>
        ) : null}

        {collegeFromNumber() !== "" ? (
          <View class="flex-row items-center gap-2">
            <Muted class="flex-1">From your number</Muted>
            <Chip tone="mint" onPress={() => update({ college: collegeFromNumber() })}>
              Use {collegeFromNumber()}
            </Chip>
          </View>
        ) : null}

        <Btn disabled={!canSave() || busy()} onPress={save} label="Save profile">
          {busy() ? "Saving…" : "Save profile"}
        </Btn>

        {!canSave() && draft().reg !== "" ? <Muted class="px-1">{blocked()}</Muted> : null}

        {statusPanel()}

        {hasProfile() ? (
          <View class="gap-3 pt-2">
            <SectionHeader title="Danger zone" />
            <SettingsGroup>
              <SettingsRow
                title="Delete profile"
                hint="Name, registration number, college, branch and semester"
                destructive
                last
                onPress={remove}
                label="Delete profile"
              />
            </SettingsGroup>
          </View>
        ) : null}
      </Body>
    </Screen>
  );
}
