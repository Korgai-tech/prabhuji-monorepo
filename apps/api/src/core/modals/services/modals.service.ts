import { createModuleLogger } from "@api/shared/logs";
import { resolveDateIst } from "@api/shared/time";
import {
  isUsableContentEntry,
  hasUsableContent,
  type ModalContentEntry,
  type ModalContentMap,
  type ModalDismissMethod,
  type ModalHookEffect,
  type ModalHookInput,
  type ModalImpressionAction,
  type ModalStateRow,
  type ModalsRepositoryPort,
  type ServableModal,
} from "@api/core/modals/types";

const log = createModuleLogger("modals:service");

/**
 * The fallback chain, in order. `hi` before `en` because this app's users are
 * overwhelmingly Hindi-first; an English string is the last resort, not the
 * default.
 */
const LOCALE_FALLBACKS = ["hi", "en"] as const;

function resolveContent(
  content: ModalContentMap,
  requested: string | undefined
): { locale: string; entry: ModalContentEntry } | null {
  const candidates = [
    ...(requested ? [requested] : []),
    ...LOCALE_FALLBACKS,
    ...Object.keys(content),
  ];
  for (const locale of candidates) {
    const entry = content[locale];
    // A present-but-unusable entry (empty, or missing a required field, or an
    // untrusted deeplink scheme) is treated as absent: a modal with no title
    // and no CTA is an empty sheet the user has to dismiss, which is worse
    // than no modal at all. `isUsableContentEntry` is the SAME check intake
    // applies in `handleHook` below — one definition of "usable", not two.
    if (isUsableContentEntry(entry)) {
      return { locale, entry };
    }
  }
  return null;
}

/**
 * Which parts of an arm keep it from ever being servable — empty when the arm
 * is fine. `findServable`'s SQL can never select for content usability (no
 * column captures it), so an arm that fails this can only be caught HERE,
 * before it is stored: `findServable` picks a single row by `armedAt`, so an
 * unservable one sorting first would hide a modal that WAS servable, forever.
 */
function unservableReasons(input: Pick<ModalHookInput, "surface" | "content">): string[] {
  const reasons: string[] = [];
  if (input.surface == null) reasons.push("surface");
  if (!hasUsableContent(input.content)) reasons.push("content");
  return reasons;
}

export interface HookOutcome {
  applied: boolean;
  /** Why, for the log and the 200 body. Never surfaced to an end user. */
  reason: string;
}

/**
 * The generalized modal service.
 *
 * Nothing here names a modal. `modalKey`, `triggerSource`, the copy, the caps
 * and the surface all arrive on the webhook, so a second modal is configuration.
 */
export class ModalsService {
  constructor(private readonly repo: ModalsRepositoryPort) {}

  /**
   * Applies one campaign webhook.
   *
   * NEVER throws for a payload it understood. Dispatch treats a 4xx as a
   * PERMANENT failure — one attempt, no retry, the arm is lost — so "I have
   * already seen this", "this user is halted" and "this arm could never be
   * served" are all successful outcomes that happen to change nothing.
   */
  async handleHook(input: ModalHookInput): Promise<HookOutcome> {
    // Whether an arm will apply is knowable BEFORE the claim: `haltedAt` is
    // set once and never cleared. That is one-directional, though — a halt
    // landing AFTER this read but BEFORE `claimAndApply` below commits is not
    // observed here, so this arm still claims and records `applied: true` for
    // a row that will in fact never be served (it is stored, but
    // `findServable`/`next` will find it already halted). Harmless — the halt
    // still wins — but it is not the "cannot go stale" guarantee that holds
    // in the opposite direction: once an arm actually claims `applied: true`,
    // `claimAndApply` (Blocker 2) guarantees the write really happened, so a
    // redelivery can never read back "duplicate" for an arm that silently
    // never applied.
    const halted =
      input.action === "arm" &&
      (await this.repo.findState(input.userId, input.modalKey, input.triggerSource))?.haltedAt != null;

    if (halted) {
      return this.claim(input, "none", false, "halted", () =>
        log.debug({ modal_key: input.modalKey }, "arm onto a halted modal ignored")
      );
    }

    if (input.action === "arm") {
      // An arm we could never serve is worse than no arm at all: refused at
      // intake rather than stored (Blocker 3a). 200, not 4xx — dispatch
      // treats 4xx as permanent, and this is a campaign misconfiguration a
      // console edit can fix and redeliver — PROVIDED the redelivery carries
      // a NEW task_id. `claimAndApply` claims on task_id (Blocker 2); a
      // redelivery of the SAME task_id is swallowed as a duplicate ("false"
      // from claim, never reaching this branch again), so the corrected
      // content never actually applies unless the caller also mints a fresh
      // task_id for the retry.
      const missing = unservableReasons(input);
      if (missing.length > 0) {
        return this.claim(input, "none", false, "unservable", () =>
          log.warn(
            { modal_key: input.modalKey, missing },
            "arm refused at intake: would never be servable"
          )
        );
      }
      return this.claim(input, "arm", true, "armed", () =>
        log.info(
          { modal_key: input.modalKey, trigger_source: input.triggerSource, source_event: input.sourceEventName },
          "modal armed"
        )
      );
    }

    return this.halt(input);
  }

  /**
   * A `halt` webhook.
   *
   * Two origins, opposite meanings. `event` is the real halt condition — the
   * user did the thing the modal was asking for, and it must never appear
   * again. `cron` is a time-to-exit sweep expiring a membership, which is not a
   * user action at all: it clears the pending arm and nothing more.
   *
   * The cron branch is DEAD CODE for the Status intro modal, whose audience sets
   * no `timeToExitDays` and therefore produces no cron exits. It ships anyway,
   * because the day a modal does set an expiry its absence is a silent
   * permanent-halt bug.
   */
  private async halt(input: ModalHookInput): Promise<HookOutcome> {
    if (input.origin === "cron") {
      return this.claim(input, "clear", true, "expired", () =>
        log.debug({ modal_key: input.modalKey }, "modal arm expired by a cron exit")
      );
    }

    // Spans every trigger source for this (user, modal): the halt condition
    // means this modal is DONE for this user, not done for one trigger. With
    // no row at all it creates one carrying only the halt, so a halt arriving
    // before any arm still blocks the future arm (Blocker 1: atomically now).
    return this.claim(input, "halt", true, "halted", () =>
      log.info({ modal_key: input.modalKey, reason: input.sourceEventName }, "modal halted permanently")
    );
  }

  /**
   * Claims `input.taskId` and applies `effect` in one transaction (Blocker
   * 2), then reports the outcome. `false` from the claim means a redelivery
   * of a `taskId` already processed — `effect` never ran, and this can only
   * mean it ran the first time, because a claim that commits without its
   * effect committing is exactly what `claimAndApply` no longer allows.
   */
  private async claim(
    input: ModalHookInput,
    effect: ModalHookEffect,
    applied: boolean,
    reason: string,
    onApplied: () => void
  ): Promise<HookOutcome> {
    const claimed = await this.repo.claimAndApply(input, effect, applied);
    if (!claimed) {
      log.debug({ task_id: input.taskId }, "duplicate modal hook delivery ignored");
      return { applied: false, reason: "duplicate" };
    }
    onApplied();
    return { applied, reason };
  }

  /**
   * The modal to show this user on this surface right now, or null.
   *
   * Does NOT count a show. The app can fetch this and never render it — the
   * user backgrounds the app, a higher-priority sheet wins — so the count
   * belongs on the impression, which is the app SAYING it painted.
   *
   * The gate is applied here as well as in SQL. The repository's WHERE clause is
   * the fast path; this is the one that is unit-testable and the one a reviewer
   * reads.
   */
  async next(
    userId: string,
    surface: string,
    locale: string | undefined,
    now: Date = new Date()
  ): Promise<ServableModal | null> {
    const todayIst = resolveDateIst(now);
    const state: ModalStateRow | null = await this.repo.findServable(userId, surface, todayIst);
    if (!state) return null;

    if (state.haltedAt !== null) return null;
    if (state.armedAt === null) return null;
    if (state.showCount >= state.maxLifetime) return null;
    if (state.lastShownDateIst === todayIst && state.shownTodayCount >= state.maxPerDay) {
      return null;
    }

    const resolved = resolveContent(state.content, locale);
    if (!resolved) {
      log.warn(
        { modal_key: state.modalKey, requested_locale: locale },
        "armed modal has no usable copy in any locale; serving nothing"
      );
      return null;
    }

    return {
      key: state.modalKey,
      triggerSource: state.triggerSource,
      // What this show WOULD be. The client puts it on
      // `modal_viewed.show_number` (with `modal_key` carrying which modal),
      // so the number the funnel sees is the server's, not a client-side
      // guess that can drift.
      showNumber: state.showCount + 1,
      lastOutcomeModule: state.lastOutcomeModule,
      localeServed: resolved.locale,
      content: resolved.entry,
    };
  }

  /**
   * Records what the app says it did with a modal.
   *
   * Only `viewed` advances the ledger — a click and a dismissal are both things
   * that happen to a modal already counted as shown, and counting them would
   * spend two of the user's three lifetime shows on one appearance.
   *
   * The advance is a compare-and-swap keyed on the `showNumber` the CLIENT was
   * actually served (`GET /modals/next`'s `ServableModal.showNumber`), not on
   * a fresh server-side read. That distinction is the whole fix: a fresh read
   * is current BY DEFINITION, so deriving `expectedShowCount` from one always
   * lets the call advance — which is why a `viewed` that fires twice
   * SEQUENTIALLY (a network retry, a double widget rebuild — nothing
   * concurrent at all) used to count twice, and CAS-on-a-fresh-read cannot
   * fix that no matter how tightly it's pinned. Echoing the server-issued
   * number back turns it into a real idempotency key: a second report of the
   * SAME show fails the compare-and-swap whether it lands a microsecond or a
   * minute after the first. `showCount < maxLifetime` remains ANDed in
   * (repository) so the cap is still honoured at the boundary.
   */
  async recordImpression(input: {
    userId: string;
    modalKey: string;
    triggerSource: string;
    action: ModalImpressionAction;
    dismissMethod: ModalDismissMethod | null;
    showNumber: number;
    now?: Date;
  }): Promise<{ counted: boolean }> {
    const now = input.now ?? new Date();
    const state = await this.repo.findState(input.userId, input.modalKey, input.triggerSource);
    // Nothing to attribute the impression to. A no-op rather than a 404: the
    // app is reporting something it already did, and failing the call would
    // make it retry a report that can never succeed.
    if (!state) {
      log.debug(
        { modal_key: input.modalKey, action: input.action },
        "impression for an unknown modal state ignored"
      );
      return { counted: false };
    }

    // The client may only report a show the server actually issued. Without
    // this, an arbitrary `showNumber` writes a fabricated impression row (the
    // table has no `counted` column, so a losing report is indistinguishable
    // from a real one) and can push `shownTodayCount` past `maxPerDay`.
    // Not an error: the app is reporting something it believes already
    // happened, and failing the call would make it retry forever.
    if (input.showNumber > state.showCount + 1) {
      log.warn(
        { modal_key: input.modalKey, reported: input.showNumber, issued: state.showCount + 1 },
        "impression reported a show number the server never issued; ignored"
      );
      return { counted: false };
    }

    const todayIst = resolveDateIst(now);
    let counted = false;

    if (input.action === "viewed") {
      counted = await this.repo.advanceLedger({
        userId: input.userId,
        modalKey: input.modalKey,
        triggerSource: input.triggerSource,
        todayIst,
        // `state.lastShownDateIst` cannot go stale between this read and
        // `advanceLedger`'s write: `advanceLedger` is the SOLE writer of that
        // column, and it moves `showCount` in the same statement — so any
        // interleaving write is a different `showNumber` and is rejected by
        // the CAS above before it ever reaches this line. If a second writer
        // of `lastShownDateIst` is ever added, this assumption breaks
        // silently; keep it the only one.
        rolled: state.lastShownDateIst !== todayIst,
        // The show the client was actually served, not whatever the counter
        // reads now. Sourcing this from a fresh read would make it current by
        // definition and therefore always advance — which is why a retried or
        // double-fired `viewed` used to count twice. Echoing the number back
        // makes the second report of show N fail the compare-and-swap,
        // whether it arrives concurrently or a minute later.
        expectedShowCount: input.showNumber - 1,
      });
    }

    await this.repo.appendImpression({
      userId: input.userId,
      modalKey: input.modalKey,
      triggerSource: input.triggerSource,
      action: input.action,
      dismissMethod: input.dismissMethod,
      // The show this impression is ABOUT is whatever the client says it is —
      // the same idempotency key `advanceLedger` just checked — not a value
      // re-derived from `state`, which on a losing CAS would already be stale.
      showNumber: input.showNumber,
      lastOutcomeModule: state.lastOutcomeModule,
    });

    return { counted };
  }
}
