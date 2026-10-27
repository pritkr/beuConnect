/**
 * One college, branch by branch.
 *
 * The register in this build is GEC Sheikhpura's, so `college` defaults to 157.
 * A route that names another college is not an error the student caused, and it
 * is not an empty register either: it says plainly that this build carries one
 * college, and offers the one it has.
 */

import { List, Text, View } from "nsh";
import type { Nav } from "../../app/router";
import { param } from "../../app/router";
import { Divider, EmptyState, Muted, Row, Screen } from "../../ui";
import {
  BRANCHES,
  BRANCH_COUNTS,
  COLLEGE_CODE,
  COLLEGE_NAME,
  formatCount,
  TOTAL,
} from "./data";

export function CollegeScreen(props: { nav: Nav }) {
  const nav = props.nav;
  const requested = param(nav, "college").trim() || COLLEGE_CODE;
  const known = requested === COLLEGE_CODE;

  if (!known) {
    return (
      <Screen>
        <View class="p-4">
          <EmptyState
            icon="building"
            title={`No register for college ${requested}`}
            hint={`This build carries ${COLLEGE_NAME} only.`}
            action="Open GEC Sheikhpura"
            onAction={() => nav.replace("students.college", { college: COLLEGE_CODE })}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View class="gap-2 border-b border-border bg-background px-4 pb-3 pt-3">
        <Row class="items-baseline justify-between gap-3">
          <Text class="flex-1 text-[15px] font-semibold text-foreground" numberOfLines={1}>
            {COLLEGE_NAME}
          </Text>
          <Muted class="tabular-nums">{`${formatCount(TOTAL)} students`}</Muted>
        </Row>
      </View>

      <List
        class="flex-1"
        contentClass="pb-6"
        testID="students-college-list"
        each={BRANCHES}
        keyExtractor={(branch) => branch.slug}
        estimatedItemSize={72}
        separator={<Divider />}
      >
        {(item) => (
          <Each of={[item()]} key={(branch) => branch.slug}>
            {() => {
              const branch = item();
              const count = BRANCH_COUNTS[branch.slug] ?? 0;
              return (
                <Row
                  class="min-h-16 gap-3 bg-card px-4 py-3 active:bg-muted"
                  onPress={
                    count > 0
                      ? () => nav.push("students.branch", { branch: branch.slug, college: COLLEGE_CODE })
                      : undefined
                  }
                  label={`${branch.name}, ${formatCount(count)} students`}
                >
                  <Text class="w-12 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                    {branch.short}
                  </Text>
                  <Text class="flex-1 text-[15px] font-semibold leading-5 text-foreground" numberOfLines={2}>
                    {branch.name}
                  </Text>
                  <Text class="text-[15px] font-semibold tabular-nums text-foreground">{formatCount(count)}</Text>
                </Row>
              );
            }}
          </Each>
        )}
      </List>
    </Screen>
  );
}
