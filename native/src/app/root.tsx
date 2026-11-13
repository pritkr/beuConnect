/**
 * The app root, one level above the shell.
 *
 * `Shell` owns navigation; this owns the promise that a failure inside it still
 * paints something a student can act on. Without this boundary a throw in the
 * shell's own body (the first-run read, the tab bar, a native bridge mount)
 * ends the JavaScript context and the window goes blank — the failure mode a
 * student reports as "the app crashed".
 *
 * Kept apart from `boot.ts` because that file is plain TypeScript and this one
 * needs JSX; both entry points (`App.tsx`, `App.play.tsx`) still call `boot()`.
 */

import { ErrorBoundary } from "nsh";

import { RootCrash } from "./crash";
import { Shell } from "./shell";

export function Root() {
  return (
    <ErrorBoundary fallback={(error, reset) => <RootCrash error={error} onRetry={reset} />}>
      <Shell />
    </ErrorBoundary>
  );
}
