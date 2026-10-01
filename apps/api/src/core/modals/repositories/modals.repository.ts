import type { Prisma } from "@prisma/client";
import { getPrisma } from "@api/shared/database";
import {
  hasUsableContent,
  type ModalContentMap,
  type ModalHookEffect,
  type ModalHookInput,
  type ModalImpressionAction,
  type ModalDismissMethod,
  type ModalStateRow,
  type ModalsRepositoryPort,
} from "@api/core/modals/types";

/**
 * Modals repository — the ONLY place `@prisma/client` is reached for this
 * module.
 */
export class ModalsRepository implements ModalsRepositoryPort {
  async findState(
    userId: string,
    modalKey: string,
    triggerSource: string
  ): Promise<ModalStateRow | null> {
    const row = await getPrisma().modalUserState.findUnique({
      where: { userId_modalKey_triggerSource: { userId, modalKey, triggerSource } },
    });
    return row ? toStateRow(row) : null;
  }

  /**
   * Claims `input.taskId` and applies `effect` in ONE transaction (Blocker 2
   * of the TAM-174 fix wave). `task_id` is the primary key, so the
   * `createMany`/`skipDuplicates` insert either wins or conflicts; the
   * conflict IS the deduplication and needs no read-then-write race. Because
   * the claim and the effect share a transaction, there is no window where a
   * redelivery can be claimed without its effect applying: either both commit
   * or neither does. So a failure between the two (an `applyHalt` race, an
   * RDS failover, a statement timeout) rolls the claim back too — the next
   * redelivery of the same `taskId` finds no row, claims it, and applies the
   * effect for real, instead of finding a claimed-but-unapplied row and
   * reading back "duplicate" for a delivery that changed nothing.
   */
  async claimAndApply(
    input: ModalHookInput,
    effect: ModalHookEffect,
    applied: boolean
  ): Promise<boolean> {
    const prisma = getPrisma();
    return prisma.$transaction(async (tx) => {
      const created = await tx.modalHookDelivery.createMany({
        data: [
          {
            taskId: input.taskId,
            action: input.action,
            origin: input.origin,
            userId: input.userId,
            modalKey: input.modalKey,
            sourceEventName: input.sourceEventName,
            audienceId: input.audienceId,
            campaignId: input.campaignId,
            applied,
          },
        ],
        skipDuplicates: true,
      });
      if (created.count === 0) return false;

      switch (effect) {
        case "arm":
          await upsertArmTx(tx, input);
          break;
        case "halt":
          await applyHaltTx(tx, input);
          break;
        case "clear":
          await clearArmTx(tx, input.userId, input.modalKey, input.triggerSource);
          break;
        case "none":
          break;
      }
      return true;
    });
  }

  /**
   * The one indexed read on the Home path.
   *
   * Both caps are expressed here, not just the daily one. This is NOT merely an
   * optimisation over the service's own gate: `findFirst` returns a single
   * candidate, so a row this clause lets through and the service then rejects
   * does not fall back to the next eligible row — it becomes "no modal". A
   * lifetime-exhausted row sorting first would therefore hide a servable one.
   *
   * The service re-checks every SQL-expressible predicate here (caps, halted,
   * armed) for the same reason, and because that is where the rules are
   * unit-testable. Content USABILITY has no SQL counterpart, though, and is
   * deliberately NOT re-checked here: it is enforced at INTAKE instead (an arm
   * with no usable locale entry is refused before it is ever stored — see
   * `modals.service.ts#handleHook`), so every row this query can return is
   * already known to have usable content. `resolveContent` keeps a
   * belt-and-braces check on the serve path anyway, sharing the identical
   * `isUsableContentEntry` definition, but that is a safety net for future
   * writers, not a gate this query needs to duplicate.
   */
  async findServable(
    userId: string,
    surface: string,
    todayIst: string
  ): Promise<ModalStateRow | null> {
    const row = await getPrisma().modalUserState.findFirst({
      where: {
        userId,
        surface,
        haltedAt: null,
        armedAt: { not: null },
        showCount: { lt: getPrisma().modalUserState.fields.maxLifetime },
        OR: [
          { lastShownDateIst: null },
          { lastShownDateIst: { not: todayIst } },
          { shownTodayCount: { lt: getPrisma().modalUserState.fields.maxPerDay } },
        ],
      },
      orderBy: { armedAt: "desc" },
    });
    return row ? toStateRow(row) : null;
  }

  /**
   * Advances the ledger via optimistic concurrency (compare-and-swap).
   *
   * `updateMany` rather than `update`, because the affected-row count is the
   * authority on whether this show really counted — but only because the
   * WHERE pins `showCount` to `expectedShowCount`, which is `showNumber - 1`
   * FOR THE `showNumber` THE SERVER ISSUED ON `GET /modals/next` AND THE
   * CLIENT ECHOED BACK. It is not read from the database here or by the
   * caller at write time — that is what makes it fixed independently of read
   * timing. Two reports of the same `showNumber` — whether they land a
   * microsecond apart or a client retries minutes later — compute the
   * IDENTICAL `expectedShowCount`, so whichever `UPDATE` lands first flips
   * `showCount` away from that value and the second's WHERE simply no longer
   * matches: zero rows affected, `count === 0`, correctly reports it did not
   * count. A bare `showCount < maxLifetime` range would NOT have this
   * property — every report below the cap satisfies it regardless of which
   * `showNumber` it claims, so it cannot tell "the same show, reported twice"
   * from "two different shows" and both would increment. This is the same
   * shape as a classic optimistic-lock CAS (`WHERE id = ? AND version = ?`),
   * with the client-echoed `showNumber` standing in for the version token.
   * `showCount < maxLifetime` remains ANDed in so the lifetime cap is still
   * honoured at the boundary, and the `OR` below enforces the daily cap on
   * this same write, not only on the serve path.
   */
  async advanceLedger(input: {
    userId: string;
    modalKey: string;
    triggerSource: string;
    todayIst: string;
    rolled: boolean;
    expectedShowCount: number;
  }): Promise<boolean> {
    const prisma = getPrisma();
    const result = await prisma.modalUserState.updateMany({
      where: {
        userId: input.userId,
        modalKey: input.modalKey,
        triggerSource: input.triggerSource,
        haltedAt: null,
        armedAt: { not: null },
        // Compare-and-swap, not a range check. Pinning `showCount` to the
        // `showNumber` the client was actually issued — not a fresh read — is
        // what makes this predicate SELF-DISABLING: after the first update
        // the row no longer matches, so a second report of the SAME
        // `showNumber` matches zero rows, whether it arrives concurrently or
        // long after. `lt maxLifetime` alone is a RANGE that any report below
        // the cap satisfies regardless of which show it claims — both would
        // increment, and one logical view would burn two lifetime shows.
        AND: [
          { showCount: input.expectedShowCount },
          { showCount: { lt: prisma.modalUserState.fields.maxLifetime } },
          {
            // The daily cap belongs on the write path too, not just the serve
            // path: an invariant enforced only where it is READ is a
            // convention, not an invariant. A rolled day is always allowed —
            // `shownTodayCount` resets to 1 in the same statement below.
            OR: [
              { lastShownDateIst: null },
              { lastShownDateIst: { not: input.todayIst } },
              { shownTodayCount: { lt: prisma.modalUserState.fields.maxPerDay } },
            ],
          },
        ],
      },
      data: {
        showCount: { increment: 1 },
        lastShownAt: new Date(),
        lastShownDateIst: input.todayIst,
        ...(input.rolled ? { shownTodayCount: 1 } : { shownTodayCount: { increment: 1 } }),
      },
    });
    return result.count === 1;
  }

  async appendImpression(input: {
    userId: string;
    modalKey: string;
    triggerSource: string;
    action: ModalImpressionAction;
    dismissMethod: ModalDismissMethod | null;
    showNumber: number;
    lastOutcomeModule: string | null;
  }): Promise<void> {
    await getPrisma().modalImpression.create({ data: input });
  }
}

/**
 * Ensures the arm's row exists and carries the latest offer, run inside
 * `claimAndApply`'s transaction.
 */
async function upsertArmTx(tx: Prisma.TransactionClient, input: ModalHookInput): Promise<void> {
  // Only overwrite `surface`/`content` on an UPDATE when the incoming arm
  // actually carries a usable one (Blocker 3b). After Blocker 3a an
  // unservable arm never reaches here — `handleHook` refuses it at intake —
  // but this guards the invariant against a future caller that skips that
  // check: a re-arm that omits `content` must refresh the offer, never blank
  // out a working row's copy with `{}`.
  const hasSurface = input.surface != null;
  const hasContent = hasUsableContent(input.content);

  const shared = {
    lastOutcomeModule: input.sourceEventName,
    audienceId: input.audienceId,
    audienceName: input.audienceName,
    campaignId: input.campaignId,
    // Caps ride the webhook so a new modal needs no deploy. Defaulted here
    // rather than in the schema alone, because a campaign that omits them
    // should get the documented defaults, not whatever a previous arm left.
    maxLifetime: input.maxLifetime ?? 3,
    maxPerDay: input.maxPerDay ?? 1,
  };

  await tx.modalUserState.upsert({
    where: {
      userId_modalKey_triggerSource: {
        userId: input.userId,
        modalKey: input.modalKey,
        triggerSource: input.triggerSource,
      },
    },
    create: {
      userId: input.userId,
      modalKey: input.modalKey,
      triggerSource: input.triggerSource,
      surface: input.surface,
      content: (input.content ?? {}) as unknown as Prisma.InputJsonValue,
      armedAt: input.occurredAt,
      ...shared,
    },
    // Deliberately does NOT touch haltedAt, showCount, shownTodayCount or
    // lastShownDateIst: a re-arm refreshes the offer, it does not rewind the
    // ledger or revive a halted modal.
    update: {
      armedAt: input.occurredAt,
      ...shared,
      ...(hasSurface ? { surface: input.surface } : {}),
      ...(hasContent ? { content: input.content as unknown as Prisma.InputJsonValue } : {}),
    },
  });
}

/**
 * Halts every row for this `(user, modal)`, whatever its trigger source, and
 * creates one when none exists. Run inside `claimAndApply`'s transaction.
 *
 * Two statements rather than one upsert, because the halt spans rows the
 * unique key cannot address: `updateMany` covers every existing trigger
 * source, and the "ensure a row exists" insert guarantees at least the named
 * one exists — which is the case that matters when a halt arrives before any
 * arm.
 *
 * The "ensure a row exists" step is `createMany({ skipDuplicates: true })`,
 * NOT `upsert` with an empty `update` (Blocker 1). An `upsert` whose `update`
 * is `{}` makes Prisma decline the native upsert and fall back to
 * SELECT-then-INSERT — a read-then-write race with no `ON CONFLICT`. Two
 * halts for a user with no existing row is the ORDINARY path here (the exit
 * campaign and the shared-named campaign both fire off `status_share_result`
 * for the same event), so that race was reproducible on demand and one of the
 * two requests 500ed. `createMany({ skipDuplicates: true })` compiles to
 * `INSERT … ON CONFLICT DO NOTHING`, which is atomic and needs no update
 * clause at all.
 */
async function applyHaltTx(tx: Prisma.TransactionClient, input: ModalHookInput): Promise<void> {
  await tx.modalUserState.createMany({
    data: [
      {
        userId: input.userId,
        modalKey: input.modalKey,
        triggerSource: input.triggerSource,
        haltedAt: input.occurredAt,
        haltedReason: input.sourceEventName,
      },
    ],
    skipDuplicates: true,
  });
  await tx.modalUserState.updateMany({
    // Set-once, across every trigger source: a row already halted keeps its
    // original timestamp, so the second of two halt paths firing is a
    // genuine no-op.
    where: { userId: input.userId, modalKey: input.modalKey, haltedAt: null },
    data: { haltedAt: input.occurredAt, haltedReason: input.sourceEventName },
  });
}

/** Clears a pending arm on a `cron` time-to-exit sweep. Never touches a halted row. */
async function clearArmTx(
  tx: Prisma.TransactionClient,
  userId: string,
  modalKey: string,
  triggerSource: string
): Promise<void> {
  await tx.modalUserState.updateMany({
    where: { userId, modalKey, triggerSource, haltedAt: null },
    data: { armedAt: null },
  });
}

/** Prisma row → domain row. `content` is `Json`, which Prisma types as unknown. */
function toStateRow(row: {
  userId: string;
  modalKey: string;
  triggerSource: string;
  surface: string | null;
  content: Prisma.JsonValue;
  armedAt: Date | null;
  lastOutcomeModule: string | null;
  showCount: number;
  shownTodayCount: number;
  lastShownDateIst: string | null;
  maxLifetime: number;
  maxPerDay: number;
  haltedAt: Date | null;
}): ModalStateRow {
  return {
    userId: row.userId,
    modalKey: row.modalKey,
    triggerSource: row.triggerSource,
    surface: row.surface,
    content: asContentMap(row.content),
    armedAt: row.armedAt,
    lastOutcomeModule: row.lastOutcomeModule,
    showCount: row.showCount,
    shownTodayCount: row.shownTodayCount,
    lastShownDateIst: row.lastShownDateIst,
    maxLifetime: row.maxLifetime,
    maxPerDay: row.maxPerDay,
    haltedAt: row.haltedAt,
  };
}

/** Anything that is not a plain object reads as "no content", never as a throw. */
function asContentMap(value: Prisma.JsonValue): ModalContentMap {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return value as unknown as ModalContentMap;
}
