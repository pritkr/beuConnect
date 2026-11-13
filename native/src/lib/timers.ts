/**
 * One guard for every timer in the app.
 *
 * nsh has no global error hook. An exception thrown inside a `setTimeout`,
 * `setInterval`, `requestAnimationFrame` or `queueMicrotask` callback ends the
 * JavaScript context: the window keeps its last frame, and Android may kill the
 * process. A screen body is covered by `ErrorBoundary` (`src/app/crash.tsx`);
 * a timer body is covered by nothing — so the globals themselves are wrapped
 * once, before the shell mounts.
 *
 * The wrapper returns the engine's own id, so `clearTimeout` / `clearInterval` /
 * `cancelAnimationFrame` keep working, and the test harness's manual clock
 * still drives them (it installs its own globals before `boot()` runs, and this
 * wraps whatever is there).
 *
 * This is the reason `setTimeout` is not called bare anywhere else: a timer body
 * may be as small as it likes, it is never the thing that kills the app.
 */

/** The guard already installed, so a second `boot()` cannot wrap twice. */
let installed = false;

type AnyHandler = (...args: unknown[]) => void;

function guarded<A extends unknown[]>(handler: (...args: A) => void): (...args: A) => void {
  return (...args) => {
    try {
      handler(...args);
    } catch (error) {
      // The timer that threw is gone; the app is not. `console.error` reaches
      // logcat on Android, which is where a real report is read from.
      console.error("timer:", error);
    }
  };
}

export function guardTimers(): void {
  if (installed) return;
  installed = true;

  const timeout = globalThis.setTimeout;
  const interval = globalThis.setInterval;
  const frame = globalThis.requestAnimationFrame;
  const microtask = globalThis.queueMicrotask;

  globalThis.setTimeout = ((handler: AnyHandler, ms?: number, ...args: unknown[]) =>
    timeout(guarded(handler), ms, ...args)) as typeof setTimeout;

  globalThis.setInterval = ((handler: AnyHandler, ms?: number, ...args: unknown[]) =>
    interval(guarded(handler), ms, ...args)) as typeof setInterval;

  globalThis.requestAnimationFrame = ((handler: (time: number) => void) =>
    frame(guarded(handler))) as typeof requestAnimationFrame;

  globalThis.queueMicrotask = ((handler: () => void) => microtask(guarded(handler))) as typeof queueMicrotask;
}
