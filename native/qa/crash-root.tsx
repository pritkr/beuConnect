/**
 * QA fixture: the shell itself throws, one level above every screen.
 *
 * This is `src/app/root.tsx`'s shape exactly — `ErrorBoundary` with `RootCrash`
 * around the shell — so the last-resort page is proved against the same
 * boundary placement. "Reopen" is `reset()`: it must re-render the shell
 * rather than leave the student on an error page that cannot recover.
 */

import { ErrorBoundary, Text, mount } from "nsh";

import { RootCrash } from "../src/app/crash";

let renders = 0;

function BoomShell() {
  renders += 1;
  if (renders === 1) throw new Error("shell failed");
  return <Text>shell mounted</Text>;
}

export function CrashRoot() {
  return (
    <ErrorBoundary fallback={(error, reset) => <RootCrash error={error} onRetry={reset} />}>
      <BoomShell />
    </ErrorBoundary>
  );
}

mount(CrashRoot);
