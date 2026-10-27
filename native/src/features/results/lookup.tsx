/**
 * Results — the lookup screen.
 *
 * One registration number and one semester in; the result is rendered from
 * JSON (live BEU, this device's saved copy, or BEU's published semester
 * table) as native views. BEU now puts a captcha in front of that JSON, so the
 * submit goes to `results.web`: the university's own page in a WebView, with
 * the number and semester already filled in. The student solves the captcha
 * there, the page is read on the phone, and the result is saved under the same
 * cache key as every other path.
 */

import { Text, View, cleanup, computed, effect, signal } from "nsh";
import type { Nav } from "../../app/router";
import { numParam, param } from "../../app/router";
import {
  Badge,
  Body,
  Btn,
  Card,
  Chip,
  ErrorState,
  Label,
  Muted,
  Panel,
  Row,
  Screen,
  SectionHeader,
  Skeleton,
  Subtitle,
  Title,
} from "../../ui";
import { Icon } from "../../ui/icons";
import { relativeTime } from "../../lib/net";
import { ActionTile, SemChips } from "./components";
import type { RecentLookup, ResultData } from "./data";
import { forgetRecent, loadResult, parseReg, readRecent, rememberLookup, savedCopy } from "./data";
import { branchShort } from "./data";
import type { Identity } from "./identity";
import { resolveIdentity } from "./identity";
import { shortCollegeName } from "./colleges";
import { ResultView } from "./result-view";
import type { Async } from "./shared";
import {
  Fresh,
  RegField,
  clampedSem,
  cleanReg,
  idle,
  isValidReg,
  readableError,
  suggestedSem,
} from "./shared";

interface LookupRequest {
  reg: string;
  sem: number;
}

export function ResultsScreen(props: { nav: Nav }) {
  const nav = props.nav;
  const routeReg = cleanReg(param(nav, "reg"));
  const routeSem = numParam(nav, "sem");

  const reg = signal(routeReg);
  const sem = signal(clampedSem(routeSem, routeReg));
  const semChosen = signal(routeSem >= 1 && routeSem <= 8);
  /* Opening a route with a number is a request already under way, so the first
     frame is a loading state — never an empty "check a result" panel. */
  const state = signal<Async<ResultData>>(
    isValidReg(routeReg)
      ? { status: "loading", data: null, error: "" }
      : idle<ResultData>(),
  );
  const request = signal<LookupRequest | null>(
    isValidReg(routeReg) ? { reg: routeReg, sem: clampedSem(routeSem, routeReg) } : null,
  );
  const recents = signal<RecentLookup[]>([]);
  const savedAt = signal<number | null>(null);
  const formError = signal("");

  const info = computed(() => (isValidReg(reg()) ? parseReg(reg()) : null));

  /*
   * Who this number belongs to. A name is cheap — the identity cache, a result
   * already saved here, a published roster — so the header can say whose result
   * it is while BEU's slow server is still being asked.
   *
   * `who` stores the number each answer was resolved for, and that is the guard:
   * a late roster read is dropped unless the field still holds the number it was
   * asked about, and the name only shows under the number it belongs to. One
   * resolve per registration change; the result load below never waits on it.
   */
  const who = signal<{ reg: string; identity: Identity } | null>(null);

  effect(() => {
    const value = reg();
    if (!isValidReg(value)) return;
    let alive = true;
    cleanup(() => {
      alive = false;
    });
    void resolveIdentity(value).then((identity) => {
      /* The guard: only the answer for the number in the field right now lands. */
      if (!alive || reg() !== value) return;
      who.set(identity ? { reg: value, identity } : null);
    });
  });

  const student = computed(() => {
    const found = who();
    return found !== null && found.reg === reg() ? found.identity : null;
  });

  const start = (regValue: string, semValue: number) => {
    const value = cleanReg(regValue);
    if (!isValidReg(value)) {
      formError.set("Enter at least 8 digits of your registration number.");
      return;
    }
    formError.set("");
    reg.set(value);
    sem.set(semValue);
    request.set({ reg: value, sem: semValue });
  };

  /**
   * The main path now: BEU publishes results only behind a captcha, so the
   * number and semester go to BEU's own page in a WebView, where the student
   * solves it. The captured page is parsed and saved on this phone.
   */
  const openPortal = () => {
    const value = cleanReg(reg());
    if (!isValidReg(value)) {
      formError.set("Enter at least 8 digits of your registration number.");
      return;
    }
    formError.set("");
    nav.push("results.web", { reg: value, sem: sem() });
  };

  const onReg = (next: string) => {
    reg.set(next);
    formError.set("");
    if (!semChosen() && isValidReg(next)) sem.set(suggestedSem(next));
  };

  const onSem = (next: number) => {
    semChosen.set(true);
    sem.set(next);
    if (request() !== null) start(reg(), next);
  };

  /* The one network read: every submit, retry and recent tap lands here. */
  effect(() => {
    const req = request();
    if (!req) return;
    let alive = true;
    cleanup(() => {
      alive = false;
    });

    state.set({ status: "loading", data: null, error: "" });
    void (async () => {
      try {
        const data = await loadResult(req.reg, req.sem);
        if (!alive) return;
        state.set({ status: "ready", data, error: "" });
        await rememberLookup({
          reg: data.reg || req.reg,
          sem: req.sem,
          name: data.name,
          at: Date.now(),
        });
        const rows = await readRecent();
        if (alive) recents.set(rows);
      } catch (error) {
        if (alive) {
          state.set({
            status: "error",
            data: null,
            /* No raw fetch line ("GET https://…: no response is listed for
               it") on a phone screen: a short sentence, and the captcha
               portal below stays the live path. */
            error: readableError(
              error,
              "BEU could not be reached, and no copy of this result is on this phone. Check your connection, or open the captcha portal below.",
            ),
          });
        }
      }
    })();
  });

  /* Recents once, and again after every successful lookup above. */
  effect(() => {
    void readRecent().then((rows) => recents.set(rows));
  });

  /* Does this device already hold a copy of the current reg + semester? */
  effect(() => {
    const value = reg();
    const target = sem();
    if (!isValidReg(value)) {
      savedAt.set(null);
      return;
    }
    let alive = true;
    cleanup(() => {
      alive = false;
    });
    void savedCopy(value, target).then((at) => {
      if (alive) savedAt.set(at);
    });
  });

  const clearRecents = () => {
    void forgetRecent();
    recents.set([]);
  };

  /** The number this phone used last: the one-tap path back to a result. */
  const latest = computed(() => (recents().length > 0 ? recents()[0] : null));

  /** Put a saved number in the form without loading it yet. */
  const useNumber = (row: RecentLookup) => {
    reg.set(cleanReg(row.reg));
    sem.set(row.sem);
    semChosen.set(true);
    formError.set("");
  };

  return (
    <Screen>
      <Body>
        <View class="gap-1 pt-1">
          <Label>{() => (student() === null ? "BEU · Results" : `Semester ${sem()}`)}</Label>
          <Title numberOfLines={2}>{() => student()?.name ?? "Check your result"}</Title>
        </View>

        {() => {
          const row = latest();
          if (row === null || state().data !== null) return null;
          return (
            <Card class="gap-3" testID="lookup-saved">
              <Row class="flex-wrap items-center justify-between gap-2">
                <Label>Saved on this phone</Label>
                <Muted class="tabular-nums">{relativeTime(row.at)}</Muted>
              </Row>
              <View class="gap-0.5">
                <Text class="text-[17px] font-semibold leading-5 text-foreground" numberOfLines={2}>
                  {row.name || "Your last lookup"}
                </Text>
                <Muted class="tabular-nums" numberOfLines={1}>
                  {`${row.reg} · semester ${row.sem}`}
                </Muted>
              </View>
              <Row class="gap-3">
                <Btn
                  class="flex-1 min-h-11"
                  onPress={() => start(row.reg, row.sem)}
                  label={`Open ${row.reg} semester ${row.sem}`}
                >
                  Open saved result
                </Btn>
                <Btn variant="ghost" class="min-h-11" onPress={() => useNumber(row)} label="Use this number">
                  Use number
                </Btn>
              </Row>
              <Muted class="text-[11px] leading-4">
                A result saved here opens even when BEU's server is down.
              </Muted>
            </Card>
          );
        }}

        <Card class="gap-4">
          <RegField
            value={reg()}
            onChange={onReg}
            onSubmit={openPortal}
            autoFocus={routeReg === ""}
          />

          <If when={info()}>
            <Fresh
              when={`preview:${info()?.batch}-${info()?.branch}-${info()?.college}`}
              build={() => (
                <Row class="flex-wrap gap-2">
                  <Chip>{`Batch 20${info()?.batch ?? ""}`}</Chip>
                  <Chip tone="mint">{branchShort(info()?.branch ?? "")}</Chip>
                  <Chip>{shortCollegeName(info()?.college ?? "")}</Chip>
                  {info()?.lateral ? <Chip tone="amber">Lateral entry</Chip> : null}
                </Row>
              )}
            />
          </If>

          <Fresh
            when={`sem:${sem()}`}
            build={() => <SemChips value={sem()} onChange={onSem} />}
          />

          {formError() ? (
            <Text class="text-[12px] font-medium text-destructive">{formError()}</Text>
          ) : null}

          <Fresh
            when={`go:${state().status}:${sem()}`}
            build={() => (
              <Btn
                class="min-h-12"
                disabled={state().status === "loading"}
                onPress={openPortal}
                label="Check result"
              >
                {state().status === "loading" ? "Contacting BEU…" : `Check semester ${sem()} result`}
              </Btn>
            )}
          />

          <Muted class="text-[11px] leading-4">
            BEU asks for a captcha now, so the next screen is BEU's own page with your number and semester ready.
            Solve it there; the result is read back here and saved on this phone, so it opens instantly next time.
          </Muted>
        </Card>

        <If when={savedAt() !== null && state().data === null}>
          <Panel tone="amber" class="gap-2">
            <Row class="flex-wrap items-center gap-2">
              <Badge tone="amber">Saved copy</Badge>
              <Muted class="tabular-nums">{relativeTime(savedAt() ?? 0)}</Muted>
            </Row>
            <Btn variant="secondary" class="min-h-11" onPress={() => start(reg(), sem())}>
              Open the saved copy
            </Btn>
          </Panel>
        </If>

        <If when={state().data === null && recents().length > 1}>
          <View class="gap-2">
            <SectionHeader title="Recent lookups" action="Clear" onAction={clearRecents} />
            <Each of={recents().slice(1, 7)} key={(row) => `${row.reg}-${row.sem}`}>
              {(row) => (
                <View
                  class="min-h-11 flex-row items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-3 active:bg-muted"
                  onPress={() => start(row().reg, row().sem)}
                  role="button"
                  accessibilityLabel={`Open ${row().reg} semester ${row().sem}`}
                >
                  <View class="flex-1 gap-0.5">
                    <Text class="text-[14px] font-semibold text-foreground" numberOfLines={1}>
                      {row().name || row().reg}
                    </Text>
                    <Muted class="tabular-nums">
                      {`${row().reg} · Sem ${row().sem} · ${relativeTime(row().at)}`}
                    </Muted>
                  </View>
                  <Icon name="chevron-right" size={18} class="text-muted-foreground" />
                </View>
              )}
            </Each>
          </View>
        </If>

        <If when={state().status === "loading"}>
          <View class="gap-3">
            <Muted>Contacting BEU. Their server can take up to a minute.</Muted>
            <Card class="gap-3">
              <Skeleton h={22} w={200} />
              <Skeleton h={14} />
              <Skeleton h={14} w={240} />
            </Card>
            <Row class="gap-3">
              <View class="flex-1">
                <Skeleton h={84} />
              </View>
              <View class="flex-1">
                <Skeleton h={84} />
              </View>
            </Row>
            <Card class="gap-3">
              <Skeleton h={14} />
              <Skeleton h={14} w={250} />
              <Skeleton h={14} w={220} />
            </Card>
          </View>
        </If>

        <If when={state().status === "error"}>
          <ErrorState
            title="No result this time"
            message={state().error}
            onRetry={() => start(reg(), sem())}
          />
        </If>

        <If when={state().status === "error"}>
          <Card class="gap-3" testID="captcha-explainer">
            <Row class="gap-2">
              <Badge tone="ember">Captcha</Badge>
              <Muted class="text-[12px]">BEU asks for a person</Muted>
            </Row>
            <Muted class="text-[12px] leading-5">
              BEU's result server now puts a captcha in front of the data, and only a human can solve one. This app
              does not solve it, replay it or go around it.
            </Muted>
            <Muted class="text-[12px] leading-5">
              Open the official page once, solve the captcha yourself, and submit. The app reads the answer BEU
              gives you, saves it on this phone and draws it natively.
            </Muted>
            <Btn
              variant="secondary"
              class="min-h-11"
              onPress={openPortal}
              label="Open BEU's result page"
            >
              Open BEU's result page
            </Btn>
            <Muted class="text-[11px] leading-4">
              Your registration number and semester are filled in on the page, so the only thing left to do is the
              captcha.
            </Muted>
          </Card>
        </If>

        <If when={state().data}>
          {(data) => (
            <ResultView
              data={data()}
              onRank={() => nav.push("results.rank", { reg: data().reg, sem: data().semester })}
              onBattle={() => nav.push("results.battle", { a: data().reg, sem: data().semester })}
            />
          )}
        </If>

        <View class="gap-3">
          <SectionHeader title="More result tools" />
          <Row class="gap-3">
            <ActionTile
              icon="table"
              title="Result table"
              hint="Every student, ranked"
              onPress={() => nav.push("results.table")}
            />
            <ActionTile
              icon="medal"
              title="Rank"
              hint="Where you stand"
              tone="mint"
              onPress={() => nav.push("results.rank", { reg: reg(), sem: sem() })}
            />
          </Row>
          <Row class="gap-3">
            <ActionTile
              icon="trophy"
              title="Merit list"
              hint="Toppers this semester"
              tone="amber"
              onPress={() => nav.push("results.merit")}
            />
            <ActionTile
              icon="git-compare"
              title="Battle"
              hint="Two results, head to head"
              onPress={() => nav.push("results.battle", { a: reg(), sem: sem() })}
            />
          </Row>
        </View>
      </Body>
    </Screen>
  );
}
