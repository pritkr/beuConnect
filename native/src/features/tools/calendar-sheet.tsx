/**
 * BEU's own 2026 holiday sheet — the page a BEU student is actually handed, not
 * a re-typed version of it.
 *
 * `assets/holidays-2026.png` is **imported**, so the bundler ships the file with
 * the app (`asset:/assets/holidays-2026.png`) and it loads from disk: the sheet
 * reads with no network, and no host allowlist is involved. It is the
 * university's notice — बिहार अभियंत्रण विश्वविद्यालय, पटना — reduced to eight
 * tones and 1000 px wide: 86 KB instead of the 950 KB scan, because this copy
 * rides inside the APK budget. The school list in `holidays-data.ts` is derived
 * from this same notice, so the two can never describe different calendars.
 *
 * Two views of it: `CalendarSheet` is the card at the top of Holidays, and
 * `CalendarReader` is the full-screen reader a press opens. The reader is a
 * native `Dialog`, so the Android back button, the Escape key and a swipe all
 * close the sheet and never the screen behind it, and a `Scroll` with a zoom
 * range is the pinch-and-drag surface ("Scrolling" in the NSH docs).
 */

import { Image, Scroll, Text, View } from "nsh";
import { Dialog } from "nsh/base";
import sheet from "../../../assets/holidays-2026.png";
import { Card, Chip, Label } from "../../ui";

/** The shipped sheet, 1000 × 1415 px. One ratio for both views: it never squashes. */
const SHEET_RATIO = 1000 / 1415;

/** The print is a dense table, so the reader opens above fit and pinches out to the whole page. */
const READER_ZOOM = 2.5;

/** The sheet as a card: the first thing the Holidays screen shows. */
export function CalendarSheet(props: { onOpen: () => void }) {
  return (
    <Card
      onPress={props.onOpen}
      label="Official BEU holiday calendar 2026, open it full screen"
      class="gap-2.5 p-3"
      testID="holidays-sheet"
    >
      <View class="flex-row items-center justify-between gap-2">
        <Label>Official calendar 2026</Label>
        <Text class="text-[12px] font-semibold text-primary-ink">Open</Text>
      </View>
      <Image
        src={sheet}
        resizeMode="contain"
        class="w-full rounded-2xl border border-border bg-card"
        style={{ aspectRatio: SHEET_RATIO }}
        accessibilityElementsHidden
      />
    </Card>
  );
}

/** The same sheet, full screen, pinch to zoom and drag both ways. */
export function CalendarReader(props: { open: boolean; onChange: (open: boolean) => void }) {
  return (
    <Dialog
      open={props.open}
      animation="fade"
      onOpenChange={(open) => props.onChange(open)}
      class="flex-1 bg-background"
      backdropClass="bg-foreground/40"
      testID="holidays-sheet-reader"
    >
      <View
        class="flex-1 bg-background"
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 6px)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 6px)",
        }}
      >
        <View class="flex-row items-center justify-between gap-3 px-4 pb-2">
          <Label>BEU calendar 2026</Label>
          <Chip onPress={() => props.onChange(false)} label="Close the calendar">
            Close
          </Chip>
        </View>
        <Scroll
          class="flex-1 bg-muted"
          minimumZoomScale={1}
          maximumZoomScale={5}
          zoomScale={READER_ZOOM}
          centerContent
          contentClass="p-1"
        >
          <Image src={sheet} resizeMode="contain" class="w-full" style={{ aspectRatio: SHEET_RATIO }} />
        </Scroll>
      </View>
    </Dialog>
  );
}
