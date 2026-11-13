#!/usr/bin/env bun
/**
 * Campus Wi-Fi sign-in is wired correctly, and stays wired.
 *
 * The request runs in Java (`android/java/com/longbridge/nsh/WifiAutoLogin.java`)
 * because it has to work with the app closed, so no route test can reach it and
 * nothing in `qa/` can import it. Every way it breaks is silent: drop the boot
 * receiver and the feature dies after a reboot; drop `setPersisted` and it dies
 * with the process; drop the wake lock and a sleeping phone abandons the
 * request mid-authentication. In all three the screen still says "on", because
 * the screen reads preferences, not the job.
 *
 * So this reads the host the way the list-height scan reads the screens: the
 * manifest, the job, the receiver and the bridge, checked against the facts
 * that make the feature survive.
 *
 *   bun scripts/lint-wifi-host.mjs           # exit 1 on a missing fact
 *   bun scripts/lint-wifi-host.mjs --quiet   # only failures
 */

import { readFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const QUIET = process.argv.includes("--quiet");
const JAVA = "android/java/com/longbridge/nsh";

const read = (path) => readFileSync(`${ROOT}${path}`, "utf8");

const problems = [];

/** `must(file, needle, why)` — the needle is the fact, the why is the failure. */
function must(file, needle, why) {
  if (!read(file).includes(needle)) problems.push({ file, needle, why });
}

const MANIFEST = "android/AndroidManifest.xml";
const JOB = `${JAVA}/WifiAutoLoginJob.java`;
const RECEIVER = `${JAVA}/WifiBootReceiver.java`;
const CLIENT = `${JAVA}/WifiAutoLogin.java`;

must(MANIFEST, "android.permission.RECEIVE_BOOT_COMPLETED", "the job cannot be restored after a reboot");
must(MANIFEST, "android.permission.ACCESS_NETWORK_STATE", "the Wi-Fi callback cannot be registered");
must(MANIFEST, "com.longbridge.nsh.WifiAutoLoginJob", "the job service is not declared");
must(MANIFEST, "android.permission.BIND_JOB_SERVICE", "the job service is not a job service");
must(MANIFEST, "com.longbridge.nsh.WifiBootReceiver", "nothing re-arms the job after a reboot or an update");
must(MANIFEST, "android.intent.action.BOOT_COMPLETED", "the receiver never hears a reboot");
must(MANIFEST, "android.intent.action.MY_PACKAGE_REPLACED", "an app update silently drops the job");

must(JOB, "setPersisted(true)", "the job dies with the process and never comes back");
must(JOB, "setPeriodic(", "there is no safety net once the app closes");
must(JOB, "PARTIAL_WAKE_LOCK", "a sleeping phone abandons the request mid-authentication");
must(JOB, "lock.acquire(", "the wake lock is never taken");
must(JOB, "lock.release(", "the wake lock is never given back");
must(JOB, "interrupt()", "a stopped job keeps its worker running");
must(JOB, "jobFinished(", "the scheduler is never told the work ended");

must(RECEIVER, "WifiAutoLogin.load(context).enabled", "the receiver re-arms a feature the student turned off");
must(RECEIVER, "WifiAutoLoginJob.schedule(context)", "the periodic job is not restored");
must(RECEIVER, "WifiAutoLoginJob.checkSoon(context)", "a reboot waits a full window for its first check");

// `HttpURLConnection` is not `AutoCloseable`: `close()` alone leaves the
// socket open until the collector runs.
must(CLIENT, ".disconnect()", "connections are never disconnected and leak sockets");

must("src/app/shell.tsx", "WifiAutoBridge", "nothing arms the runner on launch");

/** A log line is the one place a credential must never appear. */
for (const file of [CLIENT, JOB, RECEIVER, `${JAVA}/WifiAutoLoginComponent.java`]) {
  for (const line of read(file).split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("Log.")) continue;
    if (/password|reg_no|regNo/i.test(trimmed)) {
      problems.push({ file, needle: trimmed, why: "a log line carries a credential" });
    }
  }
}

const red = (text) => (process.stdout.isTTY ? `\u001b[31m${text}\u001b[0m` : text);
const dim = (text) => (process.stdout.isTTY ? `\u001b[2m${text}\u001b[0m` : text);

if (!QUIET) console.log(`▸ wi-fi host ${dim("(manifest, job, receiver, bridge)")}`);

if (problems.length === 0) {
  if (!QUIET) console.log("  the runner survives a reboot, an update and a sleeping phone");
  process.exit(0);
}

console.error(red(`✗ ${problems.length} missing fact(s) in the campus Wi-Fi host`));
for (const problem of problems) {
  console.error(`  ${problem.file}`);
  console.error(dim(`    ${problem.why}`));
  console.error(dim(`    expected: ${problem.needle}`));
}
process.exit(1);
