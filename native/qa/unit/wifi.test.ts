/**
 * Campus Wi-Fi auto sign-in — the screen's half.
 *
 * The request itself is Java (`android/java/com/longbridge/nsh/WifiAutoLogin.java`)
 * because it runs with the app closed. What is testable here is what the
 * student sees and what the runner is told: the suffix rotation, the order the
 * numbers are tried in, and that every state has an honest sentence.
 */

import { describe, expect, test } from "nsh/test";

import {
  EMPTY_WIFI_STATUS,
  PHASE_LABEL,
  isWifiPhase,
  loginNames,
  rotateRegNo,
  statusLine,
  statusTone,
} from "../../src/features/tools/wifi-auto";

const PHASES = [
  "off",
  "idle",
  "checking",
  "online",
  "signed-in",
  "rejected",
  "unreachable",
  "unsupported",
] as const;

describe("wifi rotation", () => {
  test("keeps the prefix and zero-pads the suffix", () => {
    expect(rotateRegNo("24105157049", 1)).toBe("24105157001");
    expect(rotateRegNo("24105157049", 112)).toBe("24105157112");
    // Out of range is clamped, never sent as-is.
    expect(rotateRegNo("24105157049", 999)).toBe("24105157112");
    expect(rotateRegNo("24105157049", 0)).toBe("24105157001");
    // A number with no three-digit suffix is not rewritten into another account.
    expect(rotateRegNo("241", 12)).toBe("241");
    expect(rotateRegNo("  24105157049 ", 7)).toBe("24105157007");
  });

  test("the typed number goes first, then two different accounts", () => {
    const names = loginNames("24105157049", true, 3, 0);
    expect(names[0]).toBe("24105157049");
    expect(names.length).toBe(3);
    expect(new Set(names).size).toBe(3);
    for (const name of names) expect(name.startsWith("24105157")).toBe(true);
  });

  test("rotation off leaves exactly one attempt", () => {
    expect(loginNames("24105157049", false, 3, 0)).toEqual(["24105157049"]);
    expect(loginNames("   ", true)).toEqual([]);
  });
});

describe("wifi status", () => {
  test("every phase has a label and a sentence", () => {
    for (const phase of PHASES) {
      expect(PHASE_LABEL[phase].length).toBeGreaterThan(0);
      const line = statusLine({ ...EMPTY_WIFI_STATUS, phase }, 1_000);
      expect(line.length).toBeGreaterThan(0);
    }
  });

  test("a time never reads as a negative age", () => {
    const status = { ...EMPTY_WIFI_STATUS, phase: "signed-in" as const, at: 2_000, okAt: 2_000 };
    expect(statusLine(status, 1_000)).toContain("just now");
    expect(statusLine(status, 2_000 + 5 * 60_000)).toContain("5 min ago");
    expect(statusLine(status, 2_000 + 3 * 60 * 60_000)).toContain("3 h ago");
  });

  test("the portal's own sentence wins over a generic one", () => {
    const line = statusLine(
      { ...EMPTY_WIFI_STATUS, phase: "rejected", message: "The portal says the password is wrong." },
      0,
    );
    expect(line).toBe("The portal says the password is wrong.");
  });

  test("junk phases are not trusted", () => {
    expect(isWifiPhase("signed-in")).toBe(true);
    expect(isWifiPhase("SIGNED-IN")).toBe(false);
    expect(isWifiPhase(null)).toBe(false);
    expect(isWifiPhase(7)).toBe(false);
  });

  test("tone separates a live session from a refusal", () => {
    expect(statusTone("signed-in")).toBe("mint");
    expect(statusTone("online")).toBe("mint");
    expect(statusTone("rejected")).toBe("amber");
    expect(statusTone("off")).toBe("plain");
  });
});
