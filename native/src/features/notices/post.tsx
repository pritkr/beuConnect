/**
 * One announcement post: native markdown, its PDF when it carries one, and the
 * copy/share pair that makes it portable.
 */

import { Text, View, effect, signal } from "nsh";
import { TextView } from "nsh/base";
import type { Nav } from "../../app/router";
import { param } from "../../app/router";
import { formatDate, SITE } from "../../lib/net";
import { Badge, Body, Btn, Card, EmptyState, ErrorState, Loading, Muted, Panel, Row, Screen, Title } from "../../ui";
import { fetchAnnouncement, markPostRead, type AnnouncementPost } from "./api";
import { copyText, flash, once, openExternal, reason } from "./parts";
import { pdfUrl, postPdf } from "./pdf";

export function PostScreen(props: { nav: Nav }) {
  const slug = param(props.nav, "slug");
  const post = signal<AnnouncementPost | null>(null);
  const loading = signal(false);
  const problem = signal("");
  const toast = flash();
  const load = (): void => {
    if (!slug) return;
    loading.set(true);
    problem.set("");
    fetchAnnouncement(slug)
      .then((value) => post.set(value))
      .catch((error: unknown) => problem.set(reason(error)))
      .finally(() => loading.set(false));
  };
  once(load);
  // Opening a post is reading it: the NEW badge on the feed clears.
  effect(() => {
    if (post() !== null && slug !== "") markPostRead(slug);
  });

  const attachment = (): string | null => {
    const item = post();
    return item ? postPdf(item) : null;
  };

  const openLink = (item: AnnouncementPost, url: string): void => {
    if (url.startsWith("#")) return;
    const safe = pdfUrl(url);
    if (safe) {
      props.nav.push("notices.pdf", { url: safe, title: item.title });
      return;
    }
    void openExternal(url).then((opened) => {
      if (opened) return;
      void copyText(url).then((copied) => {
        toast.say(copied ? "Link copied — open it in your browser." : "Could not open that link.");
      });
    });
  };

  return (
    <Screen>
      <Body contentClass="p-4 gap-4 pb-8">
        {() => {
          const item = post();
          if (!item) {
            if (loading()) return <Loading label="Opening announcement…" />;
            if (problem()) return <ErrorState message={problem()} onRetry={load} />;
            return <EmptyState title="Announcement not found" hint="It may have been unpublished." action="Back to feed" onAction={() => props.nav.pop()} />;
          }
          const body = item.body.join("\n\n");
          return (
            <View class="gap-4">
              <View class="gap-1">
                <Row class="flex-wrap items-center gap-2">
                  <Badge tone="mint">ANNOUNCEMENT</Badge>
                  <Muted class="tabular-nums" numberOfLines={1}>{formatDate(item.publishedAt)}</Muted>
                </Row>
                <Title class="leading-8">{item.title}</Title>
                <Muted numberOfLines={1}>{item.author}</Muted>
              </View>
              {item.tags.length > 0 ? (
                <View class="flex-row flex-wrap gap-1.5">{item.tags.map((tag) => <Badge>#{tag}</Badge>)}</View>
              ) : null}
              <Card>
                {body ? (
                  <TextView
                    markdown={body}
                    selectable
                    classes={{ paragraph: "text-[15px] leading-6", strong: "font-semibold", link: "text-primary-ink" }}
                    onLinkPress={(event) => openLink(item, event.url)}
                  />
                ) : <Muted>This post has no body text.</Muted>}
              </Card>
              {() => (attachment() ? (
                <Panel tone="amber" class="gap-3">
                  <Row class="flex-wrap items-center gap-1.5">
                    <Badge tone="amber">PDF</Badge>
                    <Text class="flex-1 text-[14px] font-semibold text-foreground" numberOfLines={1}>Official attachment</Text>
                  </Row>
                  <Muted>Opens in the app.</Muted>
                  <Btn onPress={() => props.nav.push("notices.pdf", { url: attachment() ?? "", title: item.title })}>
                    Open the PDF
                  </Btn>
                </Panel>
              ) : null)}
              <Row class="gap-2">
                <Btn
                  class="flex-1 px-3"
                  variant="secondary"
                  onPress={() => void copyText(`${SITE}/announcements/${slug}/`).then((ok) => toast.say(ok ? "Link copied." : "Could not reach the clipboard."))}
                >
                  Copy link
                </Btn>
                <Btn
                  class="flex-1 px-3"
                  variant="ghost"
                  onPress={() => void copyText(`${item.title}\n${SITE}/announcements/${slug}/\n\nShared from BEUConnect`).then((ok) => toast.say(ok ? "Share text copied — paste it anywhere." : "Could not reach the clipboard."))}
                >
                  Share
                </Btn>
              </Row>
              <Btn variant="ghost" onPress={() => props.nav.push("notices.announcements")}>More posts</Btn>
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
