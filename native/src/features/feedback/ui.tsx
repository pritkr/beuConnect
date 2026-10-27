/**
 * The feedback surface, in three pieces:
 *
 *   FeedbackComposer  the form itself — type, message, optional details, send
 *   FeedbackSheet     the quick bottom sheet the footer opens anywhere
 *   FeedbackScreen    the full page behind More › Send feedback
 *
 * One form serves both so a bug report looks the same wherever it starts. The
 * compact variant hides the optional fields behind one chip: the sheet has to
 * survive a 320 pt screen with the keyboard up.
 */

import { Text, View, cleanup, computed, effect, keyboardFrame, signal, untracked } from "nsh";
import { Input, Sheet } from "nsh/base";

import type { Nav } from "../../app/router";
import { relativeTime } from "../../lib/net";
import { Body, Btn, Card, Chip, Col, ErrorState, Field, Label, Mono, Muted, Panel, Row, Screen, SectionHeader } from "../../ui";
import {
  MAX_MESSAGE,
  MIN_MESSAGE,
  FEEDBACK_TYPES,
  placeholderFor,
  typeLabel,
} from "./state";
import {
  canSend,
  closeFeedback,
  cooldownRemaining,
  draft,
  failure,
  memory,
  patchDraft,
  prepareFeedback,
  resetSent,
  sendFeedback,
  sheetOpen,
  status,
  target,
  tick,
  typedLength,
} from "./store";

/**
 * Counts the cooldown down, and only then: an always-on one-second timer would
 * keep the app from ever going quiet (and burn a wake-up per second for nothing).
 * The interval stops itself when the wait is over.
 */
function useCooldownClock(): void {
  effect(() => {
    if (memory().lastSentAt === 0) return;
    const timer = setInterval(() => {
      tick.set(Date.now());
      if (cooldownRemaining() === 0) clearInterval(timer);
    }, 1000);
    cleanup(() => clearInterval(timer));
  });
}

export function FeedbackComposer(props: { compact?: boolean; onDone?: () => void }) {
  useCooldownClock();
  const details = signal(props.compact !== true);
  const selected = computed(() => draft().type);
  const typed = computed(() => typedLength());
  const waiting = (): number => Math.ceil(cooldownRemaining(tick()) / 1000);

  return (
    <View class="gap-3">
      {() =>
        status() === "sent" ? (
          <View class="gap-3">
            <Panel tone="mint" class="gap-1">
              <Text class="text-[15px] font-semibold text-foreground">Sent — thank you</Text>
              <Muted class="text-[12px] leading-5">It reached the maintainer.</Muted>
            </Panel>
            {props.onDone ? (
              <Btn onPress={props.onDone}>Done</Btn>
            ) : (
              <Row class="gap-2">
                <Chip onPress={resetSent}>Send another</Chip>
              </Row>
            )}
          </View>
        ) : (
          <View class="gap-3">
            <Row class="flex-wrap gap-1.5" role="tablist">
              {() =>
                FEEDBACK_TYPES.map((option) => (
                  <Chip
                    active={selected() === option.value}
                    onPress={() => patchDraft({ type: option.value })}
                  >
                    {option.label}
                  </Chip>
                ))
              }
            </Row>

            <Col class="gap-1">
              <Label>Message</Label>
              <View class="rounded-2xl border border-border-strong bg-card px-3.5 py-1 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring">
                <Input
                  class={`${
                    props.compact ? "min-h-[96px]" : "min-h-[136px]"
                  } bg-transparent py-2 text-[16px] leading-6 text-foreground placeholder:text-muted-foreground`}
                  value={draft().message}
                  onChange={(message) => patchDraft({ message })}
                  placeholder={placeholderFor(selected())}
                  accessibilityLabel="Message"
                  multiline
                  maxLength={MAX_MESSAGE}
                />
              </View>
              <Row class="justify-between gap-2">
                <Text class="text-[11px] text-muted-foreground">
                  {() => (typed() < MIN_MESSAGE ? `${MIN_MESSAGE - typed()} more characters` : "")}
                </Text>
                <Text class="text-[11px] tabular-nums text-muted-foreground">
                  {() => `${typed()}/${MAX_MESSAGE}`}
                </Text>
              </Row>
            </Col>

            {() =>
              details() ? (
                <View class="gap-3">
                  <Field
                    label="Registration no (optional)"
                    value={draft().regNo}
                    onChange={(regNo) => patchDraft({ regNo: regNo.slice(0, 20) })}
                    placeholder="21105157017"
                    keyboard="number-pad"
                  />
                  <Field
                    label="Contact (optional)"
                    value={draft().contact}
                    onChange={(contact) => patchDraft({ contact })}
                    placeholder="Telegram, email or phone"
                  />
                </View>
              ) : (
                <Chip onPress={() => details.set(true)}>Add reg no or contact</Chip>
              )
            }

            {() =>
              keyboardFrame().height > 0 ? null : (
                <View class="gap-0.5">
                  <Label class="text-[10px]">Attached</Label>
                  {() =>
                    target().page.length === 0 ? null : (
                      <Mono class="text-[11px]" numberOfLines={1}>
                        {target().page}
                      </Mono>
                    )
                  }
                  <Text class="text-[11px] leading-4 text-muted-foreground" numberOfLines={2}>
                    {target().context}
                  </Text>
                </View>
              )
            }

            {() =>
              failure().length > 0 ? (
                <ErrorState title="Not sent" message={failure()} onRetry={() => void sendFeedback()} />
              ) : null
            }

            {() => (
              <Btn
                disabled={!canSend(tick())}
                onPress={() => void sendFeedback()}
                label="Send feedback"
                testID="feedback-send"
              >
                {status() === "sending" ? "Sending…" : "Send feedback"}
              </Btn>
            )}

            {() =>
              waiting() > 0 ? (
                <Text class="text-center text-[11px] text-muted-foreground">
                  {`Another report in ${waiting()}s`}
                </Text>
              ) : null
            }
          </View>
        )
      }
    </View>
  );
}

/** The quick sheet: opened from the footer on any screen. */
export function FeedbackSheet() {
  return (
    <Sheet
      open={sheetOpen()}
      onOpenChange={(open: boolean) => {
        if (!open) closeFeedback();
      }}
      closeOnSwipe
      backdropClass="bg-foreground/40"
      popupClass="rounded-t-[28px] border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <View class="gap-3 px-4 pb-5 pt-2">
        <View class="items-center py-1">
          <View class="h-1 w-10 rounded-full bg-border" />
        </View>
        <Text class="text-[18px] font-bold tracking-tight text-foreground">Feedback</Text>
        <FeedbackComposer compact onDone={closeFeedback} />
        {/* The sheet sits on the root view, so the keyboard covers it unless the
            content lifts by exactly the keyboard's height. */}
        {() =>
          keyboardFrame().height > 0 ? <View style={{ height: keyboardFrame().height }} /> : null
        }
      </View>
    </Sheet>
  );
}

/** The full page: the same form, plus what was sent from this phone. */
export function FeedbackScreen(props: { nav: Nav }) {
  // Once, on mount, and untracked: `prepareFeedback` writes the draft it reads,
  // which would otherwise re-run this effect forever.
  effect(() => {
    untracked(() => {
      prepareFeedback({ route: props.nav.route });
      status.set("idle");
      failure.set("");
    });
  });

  return (
    <Screen>
      <Body footer={false} contentClass="p-4 gap-4 pb-10">
        <FeedbackComposer />

        {() =>
          memory().sent.length === 0 ? null : (
            <View class="gap-2">
              <SectionHeader title="Recent reports" />
              <Card class="gap-0 p-0">
                {memory().sent.map((report, index) => (
                  <View class="gap-1 px-4 py-3">
                    <Row class="justify-between gap-2">
                      <Text class="text-[13px] font-semibold text-foreground">{typeLabel(report.type)}</Text>
                      <Text class="text-[11px] text-muted-foreground">{relativeTime(report.at)}</Text>
                    </Row>
                    <Text class="text-[12px] leading-4 text-muted-foreground" numberOfLines={2}>
                      {report.message}
                    </Text>
                    {index < memory().sent.length - 1 ? (
                      <View class="absolute bottom-0 left-4 right-0 h-px bg-border" />
                    ) : null}
                  </View>
                ))}
              </Card>
            </View>
          )
        }

        <Panel tone="plain" class="gap-1">
          <Label>What is sent</Label>
          <Muted class="text-[12px] leading-5">
            The message, the type, the registration number and contact you fill in, the screen you opened this from, the
            build and the platform. Nothing else — no account, no analytics.
          </Muted>
        </Panel>
      </Body>
    </Screen>
  );
}
