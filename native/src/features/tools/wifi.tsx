/**
 * The campus Wi-Fi screen: automatic sign-in, the account it uses, the manual
 * steps, and the desktop snippet.
 *
 * BEU's Omada portal logs a client out when its session ages out, when the
 * data quota resets, or when the phone reconnects. On Android the app puts the
 * session back by itself: a `JobService` in BEUConnect's own host probes the
 * captive portal, discovers the controller's entry URL and authenticates — the
 * same request a browser makes, sent to the same host. It runs with the app
 * closed, so the switch is not "keep this screen open".
 *
 * The screen only decides what to show. The account defaults are in
 * `state.ts`, the runner's states in `wifi-auto.ts`, and the wire to Android
 * in `wifi-bridge.tsx`.
 */

import { Text, View, signal, Clipboard } from "nsh";

import { Body, Btn, Card, Check, Col, Field, Label, Muted, Panel, Row, Screen, SectionHeader } from "../../ui";
import { persistWifi, nowMs, wifi, wifiStatus } from "./store";
import { checkWifiNow, wifiAutoSupported } from "./wifi-bridge";
import { PHASE_LABEL, statusLine, statusTone } from "./wifi-auto";
import type { WifiState } from "./state";

const copied = signal("");

const STEPS: readonly { title: string; detail: string }[] = [
  {
    title: "Join the campus Wi-Fi",
    detail: "Turn Wi-Fi on and pick the college network. A sign-in page should open by itself.",
  },
  {
    title: "Open the portal",
    detail: "If nothing opens, type the portal address into the browser. It is the page the network redirects you to.",
  },
  {
    title: "Sign in with your registration number",
    detail: "The username is your registration number. The password is the campus Wi-Fi password, not your BEU portal password.",
  },
  {
    title: "Still stuck?",
    detail: "Forget the network, join again, and open the portal in a private tab. Captive portals hate cached logins.",
  },
];

function escapeSnippet(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, " ");
}

function loginSnippet(regNo: string, passwordValue: string): string {
  return (
    "javascript:(function(){var u=document.querySelector('input[name=\"username\"]')||document.getElementById('user');" +
    "var p=document.querySelector('input[name=\"password\"]')||document.getElementById('pass');" +
    "var b=document.querySelector('input[type=\"submit\"]')||document.getElementById('loginBtn');" +
    `if(u)u.value='${escapeSnippet(regNo)}';if(p)p.value='${escapeSnippet(passwordValue)}';` +
    "if(b)b.click();else document.forms[0].submit();})();"
  );
}

async function copyValue(key: string, value: string): Promise<void> {
  if (!value.trim()) return;
  try {
    await Clipboard.writeText(value);
    copied.set(key);
  } catch {
    copied.set(`error:${key}`);
  }
  setTimeout(() => {
    if (copied() === key || copied() === `error:${key}`) copied.set("");
  }, 2200);
}

function patchWifi(patch: Partial<WifiState>): void {
  wifi.update((current) => ({ ...current, ...patch }));
  persistWifi();
}

/** The one switch on the screen: a 44 pt row, so the whole line is the target. */
function AutoSwitch(props: { on: boolean; onToggle: () => void }) {
  return (
    <View
      class="min-h-11 flex-row items-center gap-3 active:opacity-70"
      onPress={props.onToggle}
      role="switch"
      accessibilityLabel="Automatic sign-in"
      accessibilityState={{ checked: props.on }}
    >
      <Col class="flex-1 gap-0.5">
        <Text class="text-[15px] font-semibold text-foreground">Automatic sign-in</Text>
        <Muted class="text-[12px] leading-4">
          {props.on ? "Puts the session back when the portal drops it." : "The portal will ask you to sign in."}
        </Muted>
      </Col>
      <View
        class={`h-7 w-12 flex-row items-center rounded-full border px-1 ${
          props.on ? "justify-end border-primary bg-primary" : "justify-start border-border bg-muted"
        }`}
      >
        <View class={`h-5 w-5 rounded-full ${props.on ? "bg-primary-foreground" : "bg-card"}`} />
      </View>
    </View>
  );
}

export function WifiScreen() {
  const state = (): WifiState => wifi();
  const snippet = (): string => loginSnippet(state().regNo.trim(), state().password);
  const ready = (): boolean => state().regNo.trim().length > 0 && state().password.trim().length > 0;
  const android = wifiAutoSupported();
  const status = () => wifiStatus();

  const copyState = (key: string): string => {
    if (copied() === key) return "Copied";
    if (copied() === `error:${key}`) return "Select the text instead";
    return "";
  };

  return (
    <Screen>
      <Body contentClass="p-4 gap-4 pb-10">
        <Card class="gap-3 p-3.5">
          <Row class="items-center justify-between gap-2">
            <SectionHeader title="Campus sign-in" />
            {() => <Muted class="text-[11px]">{android ? PHASE_LABEL[status().phase] : "Android only"}</Muted>}
          </Row>

          {() =>
            android ? (
              <AutoSwitch on={state().auto} onToggle={() => patchWifi({ auto: !state().auto })} />
            ) : (
              <Muted class="text-[12px] leading-5">
                The app signs the portal back in by itself on Android. On this machine, use the snippet below.
              </Muted>
            )
          }

          {() => (
            <Panel tone={android ? statusTone(status().phase) : "plain"} class="gap-1">
              <Text class="text-[13px] leading-5 text-foreground">
                {() => (android ? statusLine(status(), nowMs()) : "Copy the registration number and password into the portal.")}
              </Text>
              {() =>
                android && status().attempts > 1 && status().phase !== "signed-in" && status().phase !== "online" ? (
                  <Muted class="text-[11px] leading-4">
                    {() => `Tried ${status().attempts} times. The runner waits a little longer between tries.`}
                  </Muted>
                ) : null
              }
            </Panel>
          )}

          {() =>
            android && state().auto ? (
              <Row class="flex-wrap gap-2">
                <Btn variant="secondary" onPress={() => checkWifiNow()}>
                  Check now
                </Btn>
              </Row>
            ) : null
          }

          {() =>
            android && state().auto ? (
              <Muted class="text-[11px] leading-4">
                Android runs the check about every 15 minutes in the background, and within seconds while the app is open.
                It never joins a network for you.
              </Muted>
            ) : null
          }
        </Card>

        <SectionHeader title="Your login" />
        <Card class="gap-3 p-3.5">
          <Field
            label="Registration number"
            value={state().regNo}
            onChange={(regNo) => patchWifi({ regNo })}
            placeholder="21101157017"
            keyboard="number-pad"
          />
          <Field
            label="Wi-Fi password"
            value={state().password}
            onChange={(password) => patchWifi({ password })}
            placeholder="The campus password"
            masked
            hint="Saved on this device, sent only to the campus portal."
          />
          <Field
            label="Portal address (optional)"
            value={state().portal}
            onChange={(portal) => patchWifi({ portal })}
            placeholder="http://10.0.0.1:8090/"
            keyboard="url"
            hint="Paste the whole sign-in address if the app cannot find it by itself."
          />

          <Row class="items-center gap-2">
            <Check
              checked={state().rotate}
              onPress={() => patchWifi({ rotate: !state().rotate })}
              label="Try nearby numbers"
            />
            <Col class="flex-1 gap-0.5">
              <Text class="text-[14px] font-semibold text-foreground">Try nearby numbers</Text>
              <Muted class="text-[12px] leading-4">
                If the portal says the user is unknown, try another 001–112 suffix with the same password.
              </Muted>
            </Col>
          </Row>

          <Row class="flex-wrap gap-2">
            <Btn
              variant="secondary"
              disabled={state().regNo.trim().length === 0}
              onPress={() => void copyValue("reg", state().regNo.trim())}
            >
              {copyState("reg") || "Copy registration no"}
            </Btn>
            <Btn
              variant="secondary"
              disabled={state().portal.trim().length === 0}
              onPress={() => void copyValue("portal", state().portal.trim())}
            >
              {copyState("portal") || "Copy portal address"}
            </Btn>
            <Btn
              variant="secondary"
              disabled={state().password.trim().length === 0}
              onPress={() => void copyValue("pass", state().password)}
            >
              {copyState("pass") || "Copy password"}
            </Btn>
          </Row>
        </Card>

        <SectionHeader title="Steps" />
        <Card class="gap-0 p-0">
          <Each of={STEPS} key={(step: (typeof STEPS)[number]) => step.title}>
            {(step, index) => (
              <View class="flex-row gap-3 px-4 py-3">
                <View class="h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                  <Text class="text-[12px] font-bold text-primary-ink">{String(index() + 1)}</Text>
                </View>
                <Col class="flex-1 gap-0.5">
                  <Text class="text-[14px] font-semibold leading-5 text-foreground">{step().title}</Text>
                  <Muted class="text-[12px] leading-5">{step().detail}</Muted>
                </Col>
              </View>
            )}
          </Each>
        </Card>

        <SectionHeader title="Desktop login helper" />
        <Card class="gap-3 p-3.5">
          <Muted class="text-[12px] leading-5">
            Paste this into the portal's address bar on a laptop. It fills both fields and signs in.
          </Muted>
          {() => (
            <View selectable>
              <View class="rounded-2xl border border-border bg-muted p-3">
                <Text class="text-[11px] leading-4 text-muted-foreground">
                  {ready() ? snippet() : "Add the details above to build the snippet."}
                </Text>
              </View>
            </View>
          )}
          <Row class="flex-wrap items-center justify-end gap-2">
            <Muted class="text-[11px]">{copyState("snippet")}</Muted>
            <Btn disabled={!ready()} onPress={() => void copyValue("snippet", snippet())}>
              {copyState("snippet") || "Copy login snippet"}
            </Btn>
          </Row>
          <If when={ready()}>
            <Panel tone="amber" class="gap-1">
              <Label>Keep it private</Label>
              <Muted class="text-[12px] leading-5">
                The snippet contains the password. Paste it only on the portal.
              </Muted>
            </Panel>
          </If>
        </Card>
      </Body>
    </Screen>
  );
}
