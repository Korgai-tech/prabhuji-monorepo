/**
 * Domain types for the generalized modal module (TAM-174).
 *
 * `ModalsRepositoryPort` is declared here rather than in `repositories/` so the
 * service can depend on the SEAM instead of the Prisma implementation: service
 * unit tests hand it a plain object, and `pnpm check:arch-boundaries` keeps
 * `@prisma/client` confined to `repositories/`.
 */

export type ModalTriggerSource = string;
export type ModalHookAction = "arm" | "halt";
export type ModalHookOrigin = "event" | "cron";

/** A fully-resolved, guaranteed-servable locale entry — every field present. */
export interface ModalContentEntry {
  title: string;
  body?: string;
  imageUrl?: string;
  ctaText: string;
  ctaDeeplink: string;
}

/**
 * A locale's copy as it may arrive on the webhook or sit in storage — every
 * field OPTIONAL. Loosened by design (fix wave, Blocker 3a): every other wire
 * field on the hook body is snake_case, so a console author's `cta_text` typo
 * for `ctaText` must never 400 the whole webhook (dispatch treats a 4xx as
 * PERMANENT — one attempt, no retry, the arm silently lost). A
 * missing/misnamed field is therefore not a validation error; it just makes
 * this one locale entry unusable, which `isUsableContentEntry` below decides.
 * Only an entry that passes it is ever resolved into a `ModalContentEntry`
 * and actually served.
 */
export interface ModalContentEntryInput {
  title?: string;
  body?: string;
  imageUrl?: string;
  ctaText?: string;
  ctaDeeplink?: string;
}
export type ModalContentMap = Record<string, ModalContentEntryInput>;

/**
 * `ctaDeeplink` scheme gate. Only the app's own custom scheme or a real
 * `https://` link — whoever holds `MODAL_HOOK_KEY` decides what a served CTA
 * opens, so this check must not be the ONLY control (rotate the key on any
 * suspected leak), but a rogue scheme (`javascript:`, `intent:`, `file://`,
 * …) must still never reach a client `launchUrl`. Shared between the webhook
 * schema (`routes/modals.schemas.ts`) and `isUsableContentEntry` below so the
 * allowed-scheme list has exactly one definition.
 */
export const CTA_DEEPLINK_PATTERN = /^(prabhuji:\/\/|https:\/\/)/;

/**
 * True when `entry` carries everything needed to actually render a modal and
 * its CTA: a title, CTA text, and a deeplink with an allowed scheme. This is
 * the ONE definition of "usable" — shared by intake (an arm refused when no
 * locale entry passes it; see `modals.service.ts#handleHook`), serve
 * (`resolveContent` skips a locale entry that fails it), and the repository's
 * write guard (`upsertArm` never overwrites stored content with an entry that
 * fails it). Before this fix intake and serve each re-implemented this
 * inline, which is exactly the kind of pair that drifts.
 */
export function isUsableContentEntry(
  entry: ModalContentEntryInput | undefined
): entry is ModalContentEntry {
  return Boolean(
    entry?.title && entry.ctaText && entry.ctaDeeplink && CTA_DEEPLINK_PATTERN.test(entry.ctaDeeplink)
  );
}

/** True when at least one locale entry in `content` is usable (see above). */
export function hasUsableContent(content: ModalContentMap | null | undefined): boolean {
  if (!content) return false;
  return Object.values(content).some(isUsableContentEntry);
}

export interface ModalHookInput {
  taskId: string;
  action: ModalHookAction;
  origin: ModalHookOrigin;
  userId: string;
  modalKey: string;
  triggerSource: string;
  surface: string | null;
  content: ModalContentMap | null;
  maxLifetime: number | null;
  maxPerDay: number | null;
  sourceEventName: string | null;
  audienceId: number | null;
  audienceName: string | null;
  campaignId: number | null;
  occurredAt: Date;
}

export interface ModalStateRow {
  userId: string;
  modalKey: string;
  triggerSource: string;
  surface: string | null;
  content: ModalContentMap;
  armedAt: Date | null;
  lastOutcomeModule: string | null;
  showCount: number;
  shownTodayCount: number;
  lastShownDateIst: string | null;
  maxLifetime: number;
  maxPerDay: number;
  haltedAt: Date | null;
}

export interface ServableModal {
  key: string;
  triggerSource: string;
  showNumber: number;
  lastOutcomeModule: string | null;
  localeServed: string;
  content: ModalContentEntry;
}

export type ModalImpressionAction = "viewed" | "cta_clicked" | "dismissed";
export type ModalDismissMethod = "cross" | "back" | "outside_tap";

/** What `claimAndApply` does after it successfully claims `taskId`. */
export type ModalHookEffect = "arm" | "halt" | "clear" | "none";

/** The seam every service method depends on. The Prisma impl lands in Task 10. */
export interface ModalsRepositoryPort {
  findState(userId: string, modalKey: string, triggerSource: string): Promise<ModalStateRow | null>;
  /**
   * Claims `input.taskId` AND applies `effect` in ONE transaction. `false`
   * means "already seen" (a redelivery) and `effect` never runs. This is the
   * fix for Blocker 2: claiming the delivery and applying its effect used to
   * be two separate writes, so a failure between them (an `applyHalt` race,
   * an RDS failover, a statement timeout) left the delivery claimed but its
   * effect never applied — and the next redelivery would then read back as
   * "duplicate", silently losing the arm/halt forever while the stored
   * `applied` flag still claimed success.
   */
  claimAndApply(input: ModalHookInput, effect: ModalHookEffect, applied: boolean): Promise<boolean>;
  findServable(userId: string, surface: string, todayIst: string): Promise<ModalStateRow | null>;
  advanceLedger(input: {
    userId: string;
    modalKey: string;
    triggerSource: string;
    todayIst: string;
    rolled: boolean;
    expectedShowCount: number;
  }): Promise<boolean>;
  appendImpression(input: {
    userId: string;
    modalKey: string;
    triggerSource: string;
    action: ModalImpressionAction;
    dismissMethod: ModalDismissMethod | null;
    showNumber: number;
    lastOutcomeModule: string | null;
  }): Promise<void>;
}
