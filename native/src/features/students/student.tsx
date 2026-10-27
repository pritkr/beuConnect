/**
 * One student, from the register that ships with the app.
 *
 * Everything on this screen is offline: name, registration number, batch,
 * branch and college come from `./data`. The two actions hand off to Results,
 * which is where a live or published score is actually read — this screen never
 * claims a mark it does not have.
 *
 * A provisional admission (the 2026 intake) has a class roll, not a BEU number,
 * so it gets an honest panel instead of two buttons that can only fail.
 */

import { View } from "nsh";
import type { Nav } from "../../app/router";
import { param } from "../../app/router";
import { Badge, Body, Btn, Card, EmptyState, Mono, Panel, Row, Screen, Subtitle, Title } from "../../ui";
import { currentSemester, parseReg } from "../results/data";
import { Fact } from "./components";
import { COLLEGE_NAME, branchShort, cleanReg, studentByReg } from "./data";

function lateralOf(reg: string): boolean {
  const numeric = reg.replace(/\D/g, "");
  if (numeric.length !== 11) return false;
  return Number.parseInt(numeric.slice(8), 10) >= 900;
}

export function StudentScreen(props: { nav: Nav }) {
  const nav = props.nav;
  const typed = cleanReg(param(nav, "reg"));
  const student = studentByReg(typed);

  if (!student) {
    const info = parseReg(typed);
    const sem = info ? currentSemester(info.batch, info.lateral) : 1;
    return (
      <Screen>
        <View class="p-4">
          <EmptyState
            icon="user-x"
            title={typed ? `${typed} is not in the register` : "No student"}
            hint="The register carries GEC Sheikhpura's students from 2019 to 2026."
            action="Search students"
            onAction={() => nav.replace("students")}
          />
          {typed ? (
            <Row class="mt-3">
              <Btn variant="secondary" class="flex-1" onPress={() => nav.push("results", { reg: typed, sem })}>
                Open result
              </Btn>
            </Row>
          ) : null}
        </View>
      </Screen>
    );
  }

  const sem = currentSemester(student.session.slice(2, 4), lateralOf(student.reg));
  const openResult = () => nav.push("results", { reg: student.reg, sem });
  const openRank = () => nav.push("results.rank", { reg: student.reg, sem });

  return (
    <Screen>
      <Body>
        <Card class="gap-3">
          <View class="gap-1.5">
            <Title class="text-[24px] leading-8" numberOfLines={3}>
              {student.name}
            </Title>
            <Mono class="text-[13px] text-muted-foreground">{student.reg}</Mono>
          </View>
          <Row class="gap-2">
            <Badge tone="ember">{student.batch}</Badge>
            <Badge tone="mint">{branchShort(student.branch)}</Badge>
            {student.provisional ? <Badge tone="amber">Provisional</Badge> : null}
          </Row>
        </Card>

        <View class="overflow-hidden rounded-3xl border border-border bg-card">
          <View class="px-4">
            <Fact label="Batch" value={student.session} first />
            <Fact label="Branch" value={branchShort(student.branch)} />
            <Fact label="College" value={COLLEGE_NAME} />
            {student.roll && student.roll !== student.reg ? <Fact label="Class roll" value={student.roll} /> : null}
          </View>
        </View>

        {student.provisional ? (
          <Panel tone="amber">
            <Subtitle class="text-[13px] leading-5">
              This is a class roll from the 2026 intake. BEU has not issued a registration number yet, so there is no
              published result or rank to open.
            </Subtitle>
          </Panel>
        ) : (
          <Row class="gap-2">
            <Btn class="flex-1" onPress={openResult}>
              Result
            </Btn>
            <Btn variant="secondary" class="flex-1" onPress={openRank}>
              Rank
            </Btn>
          </Row>
        )}
      </Body>
    </Screen>
  );
}
