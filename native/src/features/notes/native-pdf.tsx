/**
 * The native PDF page.
 *
 * Android's WebView has no PDF viewer, so for years the shortest honest answer
 * was to hand the file to Google Docs. That is a web page with someone else's
 * chrome around it, it needs a connection every time, and the file was never
 * really the student's.
 *
 * `PdfPage` is a component in BEUConnect's own Android host
 * (`android/java/com/longbridge/nsh/PdfPageView.java`): android.graphics.pdf
 * .PdfRenderer draws the page, the platform's pinch and pan move it, and the
 * same downloaded file can be written to Downloads. No WebView, no JavaScript
 * PDF engine, no server-side rendering.
 *
 * On every other platform nothing is registered under that name, so these
 * screens are only reached when `usesNativePdf()` says so.
 */

import { Text, View, computed, nativeComponent, platform, signal, type YNode } from "nsh";

import { Btn, Muted, Panel, Screen } from "../../ui";
import type { Nav } from "../../app/router";

interface PdfPageProps {
  /** The PDF's https address. */
  src: string;
  /** What the saved file should be called, without ".pdf". */
  name?: string;
  /** The page to show, 1-based. */
  page?: number;
}

interface PdfPageEvents {
  ready: { pages: number };
  page: { page: number };
  fail: { message: string };
  saved: { name: string; path: string };
}

const PdfPage = nativeComponent<PdfPageProps, PdfPageEvents>("PdfPage", {
  props: ["src", "name", "page"],
  events: ["ready", "page", "fail", "saved"],
});

/** Whether this platform has the native page renderer: Android only, for now. */
export function usesNativePdf(): boolean {
  return platform.os === "android";
}

/**
 * A PDF as pages, natively.
 *
 * The pages run down one surface, the way every reader the student already
 * knows works: drag to scroll, fling to keep going, pinch into the text,
 * double tap to toggle 1× and 2.5×. The page number follows the scroll, so
 * there are no page buttons.
 */
export function NativePdfScreen(props: { nav: Nav; url: string; title: string; name?: string }) {
  let node: YNode | null = null;
  const pages = signal(0);
  const page = signal(1);
  const failed = signal("");
  const saved = signal("");

  const save = () => {
    saved.set("");
    node?.command("download");
  };

  const retry = () => {
    failed.set("");
    pages.set(0);
    page.set(1);
    node?.command("reload");
  };

  const counter = computed(() => {
    const count = pages();
    if (count === 0) return "Opening the PDF";
    return `Page ${page()} of ${count}`;
  });

  return (
    <Screen>
      <View class="flex-row items-center justify-between gap-3 border-b border-border bg-card px-4 py-2">
        <Text class="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          {() => (pages() === 0 ? "Opening the PDF" : `${pages()} pages`)}
        </Text>
        <Btn variant="secondary" onPress={save} label="Save this PDF to Downloads">
          Save PDF
        </Btn>
      </View>

      <View class="flex-1 bg-muted">
        <PdfPage
          src={props.url}
          name={props.name ?? props.title}
          page={1}
          style={{ flex: 1 }}
          ref={(element: YNode) => {
            node = element;
          }}
          onReady={(event) => {
            pages.set(event.pages);
            page.set(1);
          }}
          onPage={(event) => {
            page.set(event.page);
          }}
          onFail={(event) => {
            failed.set(event.message || "This PDF could not be opened.");
          }}
          onSaved={(event) => {
            saved.set(event.name ? `Saved ${event.name} to Downloads` : "Saved to Downloads");
          }}
        />
      </View>

      {() =>
        saved() !== "" ? (
          <View class="border-t border-border bg-card px-4 py-2">
            <Muted class="text-[12px] text-accent-ink">{() => saved()}</Muted>
          </View>
        ) : null
      }

      {() =>
        failed() !== "" ? (
          <View class="border-t border-border bg-card p-4">
            <Panel tone="plain">
              <Text class="text-[14px] font-semibold text-foreground">This PDF did not open</Text>
              <Muted class="mt-1">{() => failed()}</Muted>
              <View class="mt-3 flex-row gap-2">
                <Btn variant="secondary" onPress={retry} label="Try opening the PDF again">
                  Try again
                </Btn>
                <Btn variant="ghost" onPress={() => props.nav.pop()} label="Back to the subject">
                  Close
                </Btn>
              </View>
            </Panel>
          </View>
        ) : null
      }

      <View class="flex-row items-center justify-center gap-2 border-t border-border bg-card px-3 py-2">
        <Text class="text-[12px] tabular-nums text-muted-foreground">{() => counter()}</Text>
        <Muted class="text-[11px]">· pinch to zoom</Muted>
      </View>
    </Screen>
  );
}
