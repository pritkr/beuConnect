/**
 * One notice: its facts, the official attachment, and the read toggle.
 *
 * A notice is read when it opens; the row on the board says so. The toggle is
 * here because "opened by mistake" is common and the unread count is what the
 * board is for.
 */

import { Text, View } from "nsh";
import type { Nav } from "../../app/router";
import { param } from "../../app/router";
import { formatDate, SITE } from "../../lib/net";
import {
  Badge, Body, Btn, Card, Divider, EmptyState, ErrorState, Loading, Mono, Muted, Panel, Row, Screen, Title,
} from "../../ui";
import { findNotice, isRead, markRead, toggleRead, type Notice } from "./api";
import { busy, copyText, failure, flash, once, openExternal, published, syncNotices } from "./parts";
import { pdfUrl } from "./pdf";

export function DetailScreen(props: { nav: Nav }) {
  const id = param(props.nav, "id");
  once(syncNotices);
  once(() => {
    if (id) markRead(id);
  });
  const toast = flash();
  const reading = (): boolean => id !== "" && isRead(id);
  const viewer = (notice: Notice): string | null => pdfUrl(notice.link);

  const copyLink = async (notice: Notice): Promise<void> => {
    const ok = await copyText(notice.link || `${SITE}/notices/`);
    toast.say(ok ? "Link copied." : "Could not reach the clipboard — select the link and copy it.");
  };

  const share = async (notice: Notice): Promise<void> => {
    const text = `${notice.title}\n${notice.link || `${SITE}/notices/`}\n\nShared from BEUConnect`;
    const ok = await copyText(text);
    toast.say(ok ? "Share text copied — paste it anywhere." : "Could not reach the clipboard — select the link and copy it.");
  };

  const openAttachment = (notice: Notice): void => {
    const safe = viewer(notice);
    if (safe) {
      props.nav.push("notices.pdf", { url: safe, title: notice.title });
      return;
    }
    void openExternal(notice.link).then((opened) => {
      if (opened) return;
      void copyText(notice.link || `${SITE}/notices/`).then((copied) => {
        toast.say(copied ? "Could not open that file. Link copied — open it in your browser." : "Select the link above and copy it.");
      });
    });
  };

  const flip = (notice: Notice): void => {
    const nowRead = toggleRead(notice.id);
    toast.say(nowRead ? "Marked read. It counts as read on the board." : "Marked unread. It is back in the unread count.");
  };

  return (
    <Screen>
      <Body contentClass="p-4 gap-4 pb-8">
        {() => {
          const notice = findNotice(id);
          if (!notice) {
            if (busy()) return <Loading label="Loading notice…" />;
            if (failure()) return <ErrorState message={failure()} onRetry={() => syncNotices(true)} />;
            return <EmptyState title="Notice not found" hint="It may have dropped off the board." action="Back to notices" onAction={() => props.nav.pop()} />;
          }
          const attachment = viewer(notice);
          return (
            <View class="gap-4">
              <View class="gap-2">
                <Row class="flex-wrap items-center gap-1.5">
                  <Badge tone={notice.important ? "ember" : "neutral"}>{notice.category}</Badge>
                  {notice.important ? <Badge tone="amber">PINNED</Badge> : null}
                  <Badge tone={reading() ? "mint" : "ember"}>{reading() ? "READ" : "UNREAD"}</Badge>
                </Row>
                <Title class="leading-8">{notice.title}</Title>
                <Muted numberOfLines={2}>{published(notice)}</Muted>
              </View>

              <Card class="gap-2">
                <Fact label="Course" value={notice.course} />
                <Divider />
                <Fact label="Semester" value={notice.semester} />
                <Divider />
                <Fact label="Published" value={notice.date ? formatDate(notice.date) : "Not published"} />
                <Divider />
                <Fact label="Source" value={notice.source} />
                <Divider />
                <Fact label="Reference" value={notice.id.toUpperCase()} mono />
              </Card>

              <Panel tone={notice.link ? "amber" : "plain"} class="gap-3">
                <Row class="flex-wrap items-center gap-1.5">
                  <Badge tone="amber">{attachment ? "PDF" : notice.link ? "LINK" : "NONE"}</Badge>
                  <Text class="flex-1 text-[14px] font-semibold text-foreground" numberOfLines={1}>
                    {notice.link ? "Official attachment" : "No attachment"}
                  </Text>
                </Row>
                <Muted numberOfLines={2}>
                  {notice.link
                    ? attachment
                      ? "Opens in the app."
                      : "Not on the university's file server, so it opens in your browser."
                    : "The board lists no file for this notice."}
                </Muted>
                {notice.link ? <Text class="text-[12px] leading-4 text-primary-ink" numberOfLines={2}>{notice.link}</Text> : null}
                {notice.link ? (
                  <Btn onPress={() => openAttachment(notice)}>
                    {attachment ? "Open in the viewer" : "Open in browser"}
                  </Btn>
                ) : null}
              </Panel>

              <Row class="gap-2">
                <Btn class="flex-1 px-3" variant="secondary" onPress={() => void copyLink(notice)}>Copy link</Btn>
                <Btn class="flex-1 px-3" variant="ghost" onPress={() => void share(notice)}>Share</Btn>
              </Row>
              <Btn
                variant="ghost"
                label={reading() ? "Mark this notice unread" : "Mark this notice read"}
                onPress={() => flip(notice)}
              >
                {reading() ? "Mark as unread" : "Mark as read"}
              </Btn>
              <Btn variant="ghost" label="Search notices and announcements" onPress={() => props.nav.push("notices.search")}>
                Search everything
              </Btn>
              {() => (toast.note() ? (
                <Panel tone="mint" class="p-3">
                  <Text class="text-[13px] leading-5 text-foreground">{toast.note()}</Text>
                </Panel>
              ) : null)}
            </View>
          );
        }}
      </Body>
    </Screen>
  );
}

/** One label/value line in the notice's fact card; the value can truncate. */
function Fact(props: { label: string; value: string; mono?: boolean }) {
  return (
    <Row class="justify-between gap-3">
      <Muted>{props.label}</Muted>
      {props.mono ? (
        <Mono class="flex-1 text-right" numberOfLines={1}>{props.value}</Mono>
      ) : (
        <Text class="flex-1 text-right text-[13px] font-semibold text-foreground" numberOfLines={1}>{props.value}</Text>
      )}
    </Row>
  );
}
