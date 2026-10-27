/**
 * The campus Wi-Fi helper: the captive-portal steps, the login details, and a
 * desktop snippet built in memory. The password is never written to storage.
 */

import { Text, View, signal, Clipboard } from "nsh";

import { Body, Btn, Card, Col, Field, Label, Muted, Panel, Row, Screen, SectionHeader } from "../../ui";
import { persistWifi, wifi } from "./store";
import type { WifiState } from "./state";

const password = signal("");
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

export function WifiScreen() {
  const state = (): WifiState => wifi();
  const snippet = (): string => loginSnippet(state().regNo.trim(), password());
  const ready = (): boolean => state().regNo.trim().length > 0 && password().trim().length > 0;

  const copyState = (key: string): string => {
    if (copied() === key) return "Copied";
    if (copied() === `error:${key}`) return "Select the text instead";
    return "";
  };

  return (
    <Screen>
      <Body contentClass="p-4 gap-4 pb-10">
        <Card class="gap-3 p-3.5">
          <SectionHeader title="Your login" />
          <Field
            label="Registration number"
            value={state().regNo}
            onChange={(regNo) => patchWifi({ regNo })}
            placeholder="21101157017"
            keyboard="number-pad"
          />
          <Field
            label="Portal address (optional)"
            value={state().portal}
            onChange={(portal) => patchWifi({ portal })}
            placeholder="http://10.0.0.1:8090/"
            keyboard="url"
            hint="The address the sign-in page shows, if you want it saved."
          />
          <Field
            label="Wi-Fi password"
            value={password()}
            onChange={(value) => password.set(value)}
            placeholder="Kept only until the app closes"
            masked
            hint="Never written to storage."
          />
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
              disabled={password().trim().length === 0}
              onPress={() => void copyValue("pass", password())}
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
          <Row class="flex-wrap items-center justify-between gap-2">
            <Muted class="text-[11px]">{copyState("snippet") || "Selectable"}</Muted>
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
