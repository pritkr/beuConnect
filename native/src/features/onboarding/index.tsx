/**
 * First run — one number, and the app knows who you are.
 *
 * The product promise is that a student never types their name twice: the
 * registration number is enough, because Results can resolve it against BEU's
 * published roster (`src/features/results/identity.ts`). This screen is that
 * promise as a single step.
 *
 * Three states, all driven by the number in the field:
 *   - too short      → the hint, no spinner, no error colour;
 *   - checking       → a skeleton line, because the roster file is ~200 KB;
 *   - found / none   → a name and college, or an honest "not on the roster yet".
 *
 * It writes two things: `beu.profile` (through `saveProfile`, so the settings
 * screen sees exactly the same record) and `beu.onboarding` (`{done, at}`),
 * which is the flag the shell gates on. Nothing is sent anywhere: the number is
 * resolved with the same public CSV the Result table reads.
 */

import { Text, View, effect, signal } from "nsh";
import type { RouteDef } from "../../app/router";
import { Body, Btn, Card, Chip, Field, Label, Muted, Screen, Skeleton, Subtitle, Title } from "../../ui";
import { readStore, writeStore } from "../../lib/net";
import { currentSemester, parseReg, branchShort, branchName, digits } from "../results/data";
import { collegeName } from "../results/colleges";
import { resolveIdentity, type Identity } from "../results/identity";
import { BRANCH_META } from "../syllabus/data/packs";
import { SEMESTERS, saveProfile } from "../settings/profile";

export const ONBOARDING_KEY = "onboarding";

/** True when the intro has already been completed (or skipped) on this device. */
export async function introDone(): Promise<boolean> {
  const saved = await readStore<{ done?: boolean } | null>(ONBOARDING_KEY, null);
  return saved !== null && saved.done === true;
}

/** "CHECKING" | "FOUND" | "NONE" — what the number has earned so far. */
type Phase = "idle" | "checking" | "found" | "none";

function statusLine(phase: Phase, reg: string, who: Identity | null): string {
  if (phase === "checking") return "Looking you up on BEU's roster";
  if (phase === "found" && who) return [who.branchName, who.collegeName].filter((part) => part !== "").join(" · ");
  if (phase === "none") return "BEU has not published this number yet. You can still use every tool.";
  if (reg.length > 0 && reg.length < 8) return "That is short — BEU numbers have 8 to 11 digits.";
  return "";
}

function Onboarding(props: { onDone: () => void }) {
  const reg = signal("");
  const phase = signal<Phase>("idle");
  const who = signal<Identity | null>(null);
  const branch = signal("");
  const sem = signal(1);
  /** True once the student picks a semester themselves; the number stops overriding it. */
  const semPicked = signal(false);
  const busy = signal(false);

  /** Branch slug the syllabus + profile understand (numeric BEU code → "cse"). */
  const detected = (value: string): string => {
    const info = parseReg(value);
    if (!info) return "";
    const short = branchShort(info.branch);
    return BRANCH_META.find((item) => item.short === short)?.code ?? "";
  };

  // One lookup per valid number, and only the answer for the number in the
  // field right now is allowed to land.
  effect(() => {
    const value = digits(reg());
    if (value.length < 8) {
      phase.set("idle");
      who.set(null);
      return;
    }
    const info = parseReg(value);
    phase.set("checking");
    if (info) {
      const slug = detected(value);
      if (slug !== "") branch.update((current) => (current === "" ? slug : current));
      // The class they are attending, not the newest roster BEU has published:
      // the roster lags by a semester or two, which is how a batch-24 student
      // was being told they were in Sem 2 while sitting in Sem 4. A semester
      // the student picked themselves is never overwritten.
      if (!semPicked()) sem.set(currentSemester(info.batch, info.lateral));
    }
    void resolveIdentity(value)
      .then((found) => {
        if (digits(reg()) !== value) return;
        who.set(found);
        if (found) {
          phase.set("found");
          const short = branchShort(found.branchCode);
          const slug = BRANCH_META.find((item) => item.short === short)?.code;
          if (slug) branch.set(slug);
        } else {
          phase.set("none");
        }
      })
      .catch(() => {
        if (digits(reg()) !== value) return;
        who.set(null);
        phase.set("none");
      });
  });

  const canStart = (): boolean => digits(reg()).length >= 8 && branch() !== "" && !busy();

  const finish = async (skipped: boolean): Promise<void> => {
    busy.set(true);
    const value = digits(reg());
    if (!skipped && value.length >= 8 && branch() !== "") {
      const info = parseReg(value);
      await saveProfile({
        name: who()?.name ?? "",
        reg: value,
        college: info?.college ?? "",
        branch: branch(),
        sem: sem(),
      });
    }
    await writeStore(ONBOARDING_KEY, { done: true, skipped, at: Date.now() });
    busy.set(false);
    props.onDone();
  };

  return (
    <Screen>
      <Body contentClass="gap-6 p-5 pb-10" footer={false}>
        <View class="gap-2 pt-6">
          <Label>BEUConnect</Label>
          <Title class="text-[30px] leading-9">Every mark, every paper, one place.</Title>
        </View>

        <Card class="gap-3">
          <Field
            label="Registration number"
            value={reg()}
            onChange={(value: string) => reg.set(value)}
            placeholder="24105157010"
            keyboard="number-pad"
            maxLength={11}
            autoFocus
          />

          {() => {
            const now = phase();
            if (now === "checking") {
              return (
                <View class="gap-2">
                  <Skeleton w={190} h={16} />
                  <Skeleton w={140} h={12} />
                </View>
              );
            }
            const found = who();
            if (now === "found" && found) {
              return (
                <View class="gap-1">
                  <Text class="text-[20px] font-bold tracking-tight text-foreground" numberOfLines={2}>
                    {found.name}
                  </Text>
                  <Text class="text-[12px] leading-4 text-muted-foreground" numberOfLines={2}>
                    {statusLine(now, digits(reg()), found)}
                  </Text>
                  <View class="mt-1 flex-row items-center gap-1.5">
                    <View class="h-1.5 w-1.5 rounded-full bg-accent" />
                    <Text class="text-[11px] font-semibold text-accent-ink">Found in BEU's roster</Text>
                  </View>
                </View>
              );
            }
            return statusLine(now, digits(reg()), null) === "" ? null : (
              <Text class="text-[12px] leading-4 text-muted-foreground" numberOfLines={3}>
                {statusLine(now, digits(reg()), null)}
              </Text>
            );
          }}
        </Card>

        {() => {
          if (digits(reg()).length < 8) return null;
          return (
            <View class="gap-4">
              <View class="gap-2">
                <Label>Branch</Label>
                <View class="flex-row flex-wrap gap-2">
                  {BRANCH_META.map((item) => (
                    <Chip active={branch() === item.code} onPress={() => branch.set(item.code)} label={item.name}>
                      {item.short}
                    </Chip>
                  ))}
                </View>
              </View>
              <View class="gap-2">
                <Label>Semester</Label>
                <View class="flex-row flex-wrap gap-2">
                  {SEMESTERS.map((value) => (
                    <Chip
                      active={sem() === value}
                      onPress={() => {
                        semPicked.set(true);
                        sem.set(value);
                      }}
                    >
                      {String(value)}
                    </Chip>
                  ))}
                </View>
              </View>
            </View>
          );
        }}

        <View class="gap-2">
          <Btn onPress={() => void finish(false)} disabled={!canStart()} label="Open BEUConnect">
            {busy() ? "Saving…" : "Open BEUConnect"}
          </Btn>
          <Btn variant="ghost" onPress={() => void finish(true)} disabled={busy()}>
            Skip for now
          </Btn>
        </View>

        {() =>
          phase() === "found" && who() ? (
            <Muted class="text-[11px] leading-4">
              {branchName(branchShort(parseReg(digits(reg()))?.branch ?? ""))} · {collegeName(who()?.collegeCode ?? "")}
            </Muted>
          ) : null
        }
      </Body>
    </Screen>
  );
}

export const onboardingRoutes: RouteDef[] = [
  { name: "onboarding", title: () => "Welcome", render: () => <Onboarding onDone={() => {}} /> },
];

export { Onboarding as OnboardingScreen };
