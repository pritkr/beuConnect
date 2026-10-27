/**
 * One official PDF in a native frame.
 *
 * Only `http(s)` URLs on the BEU hosts the app's WebView allowlists are
 * accepted (the pure check lives in `./pdf-url`); anything else gets a native
 * refusal instead of a request. A thin bar tracks the load, a stalled or failed
 * file becomes a native error state, and "Open in browser" hands the link to
 * the system opener (or the clipboard).
 *
 * The address the WebView is given is `pdfViewSource(url, platform.os)`: a
 * platform whose WebView cannot paint a PDF (Android) gets Google's viewer for
 * the same file, so the notice still opens in the app instead of a blank frame.
 */

import { Text, View, WebView, effect, platform, signal } from "nsh";
import type { Nav } from "../../app/router";
import { param } from "../../app/router";
import { Body, Btn, EmptyState, ErrorState, Muted, Screen } from "../../ui";
import { needsRemotePdf, pdfViewSource } from "../../lib/pdf";
import { copyText, flash, openExternal } from "./parts";
import { pdfUrl, type PdfScope } from "./pdf-url";
import { NativePdfScreen, usesNativePdf } from "../notes/native-pdf";

export { pdfUrl, postPdf } from "./pdf-url";
export type { PdfScope } from "./pdf-url";

const LOAD_TIMEOUT = 20_000;

export function PdfScreen(props: { nav: Nav; scope?: PdfScope }) {
  const scope = props.scope ?? "beu";
  const url = pdfUrl(param(props.nav, "url"), scope) ?? "";

  // Android draws the pages itself (PdfRenderer in the app's own host): no
  // WebView, no Google Docs, and the file can be saved to Downloads. The
  // platform never changes while the app runs, so this branch is stable.
  if (url !== null && usesNativePdf()) {
    return <NativePdfScreen nav={props.nav} url={url} title={param(props.nav, "title") || "PDF"} />;
  }

  const remote = needsRemotePdf(platform.os);
  const source = url ? pdfViewSource(url, platform.os) : "";
  const loaded = signal(false);
  const problem = signal("");
  const failed = signal(false);
  const toast = flash();

  effect(() => {
    if (!url || loaded() || failed()) return;
    const timer = setTimeout(() => failed.set(true), LOAD_TIMEOUT);
    return () => clearTimeout(timer);
  });

  const retry = (): void => {
    loaded.set(false);
    problem.set("");
    failed.set(false);
  };

  const openInBrowser = async (): Promise<void> => {
    if (!url) return;
    if (await openExternal(url)) return;
    const copied = await copyText(url);
    toast.say(copied ? "Link copied — open it in your browser." : "Could not open this file. Copy the link from the notice.");
  };

  return (
    <Screen>
      {() => {
        if (!url) {
          return (
            <Body contentClass="p-4 gap-3 grow justify-center">
              <EmptyState
                icon="error-circle"
                title="This link cannot open in the app"
                hint={
                  scope === "notes"
                    ? "Only BEUConnect note files can be shown here. Copy the link instead and open it in your browser."
                    : "Only official BEU files on beu-bih.ac.in or beu.ac.in can be shown here. Copy the link instead and open it in your browser."
                }
                action="Back"
                onAction={() => props.nav.pop()}
              />
            </Body>
          );
        }
        if (failed()) {
          return (
            <Body contentClass="p-4 gap-3 grow justify-center">
              <ErrorState
                title="This PDF did not load"
                message={problem() || "The file did not finish loading. The server may be slow, or it may be blocking the request."}
                onRetry={retry}
              />
              <Btn variant="secondary" onPress={() => void openInBrowser()}>Open in browser</Btn>
              {toast.note() ? <Muted class="text-center">{toast.note()}</Muted> : null}
            </Body>
          );
        }
        return (
          <View class="flex-1">
            <View class={`h-0.5 w-full ${loaded() ? "bg-border" : "animate-pulse bg-primary"}`} />
            <WebView
              class="flex-1"
              testID={scope === "notes" ? "notes-pdf" : "notices-pdf"}
              src={source}
              onLoadStart={() => {
                loaded.set(false);
                problem.set("");
              }}
              onLoad={() => {
                loaded.set(true);
                failed.set(false);
              }}
              onError={(event) => {
                problem.set(event.message);
                failed.set(true);
              }}
            />
            {loaded() ? null : (
              <View class="absolute bottom-3 left-3 right-3 rounded-full bg-card px-3 py-2">
                <Text class="text-center text-[12px] text-muted-foreground">
                  {scope === "notes" ? "Loading the notes PDF…" : "Loading the official PDF…"}
                </Text>
              </View>
            )}
            {remote ? (
              <View class="flex-row items-center gap-2 border-t border-border bg-card px-3 py-1.5">
                <Text class="flex-1 text-[10px] leading-4 text-muted-foreground">
                  Rendered by Google Docs — open in browser if it stays blank.
                </Text>
                <Btn
                  variant="link"
                  class="min-h-11 shrink-0 px-1"
                  onPress={() => void openInBrowser()}
                  label="Open this PDF in the browser"
                >
                  Browser
                </Btn>
              </View>
            ) : null}
          </View>
        );
      }}
    </Screen>
  );
}
