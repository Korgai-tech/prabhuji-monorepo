import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import type { FastifyInstance } from "fastify";
// side-effect type import: brings @fastify/swagger's `declare module 'fastify'`
// augmentation (FastifyInstance#swagger()) into scope for this file.
import type {} from "@fastify/swagger";
import { buildApp } from "@api/app";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { disconnectPrisma, getPrisma } from "@api/shared/database";
import { clearGlobalServices } from "@api/shared/workspace";
import { resetEnvCache } from "@api/shared/config";
import { initAuthModule } from "@api/core/auth";
import { initModalsModule } from "@api/core/modals";

/**
 * Integration coverage for the generalized modal module (TAM-174) against real
 * Postgres via testcontainers.
 *
 * The unit suite proves the RULES; this proves they survive the database — the
 * `showNumber`-keyed impression idempotency (both concurrent and sequential
 * duplicate reports), the cross-trigger halt, the unique keys, and the
 * `hide: true` contract guarantee.
 */

const JWT_SECRET = "a-sufficiently-long-secret-for-modal-tests";
const HOOK_KEY = "test-modal-hook-key";
const USER = randomUUID();

interface HookResponseBody {
  data: { applied: boolean; reason: string };
}
interface NextResponseModal {
  showNumber: number;
  lastOutcomeModule: string | null;
  localeServed: string;
}
interface NextResponseBody {
  data: { modal: NextResponseModal | null };
}
interface ImpressionResponseBody {
  data: { counted: boolean };
}

let app: FastifyInstance;
let dbUrl: string;

function token(userId = USER): string {
  return jwt.sign({ sub: userId, email: `${userId}@test.local` }, JWT_SECRET, { expiresIn: "1h" });
}

function hookBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    modal_key: "status_intro",
    action: "arm",
    trigger_source: "post_outcome",
    surface: "home",
    max_lifetime: 3,
    max_per_day: 1,
    content: {
      hi: { title: "नाम और फोटो", ctaText: "डालें", ctaDeeplink: "prabhuji://status" },
      en: { title: "Name and photo", ctaText: "Add", ctaDeeplink: "prabhuji://status" },
    },
    user_id: USER,
    task_id: `campaign-delivery-${randomUUID()}`,
    origin: "event",
    source_event_name: "set_wallpaper_result",
    audience_id: 42,
    audience_name: "prabhuji-status-intro",
    campaign_id: 12,
    occurred_at: new Date().toISOString(),
    ...overrides,
  };
}

async function postHook(body: Record<string, unknown>, key = HOOK_KEY) {
  return app.inject({
    method: "POST",
    url: "/internal/modals/hooks",
    headers: { "x-modal-hook-key": key },
    payload: body,
  });
}

async function getNext(surface = "home", locale = "hi") {
  return app.inject({
    method: "GET",
    url: `/modals/next?surface=${surface}&locale=${locale}`,
    headers: { authorization: `Bearer ${token()}` },
  });
}

async function postViewed() {
  return app.inject({
    method: "POST",
    url: "/modals/impressions",
    headers: { authorization: `Bearer ${token()}` },
    // `showNumber: 1` echoes what `GET /modals/next` served in this suite's
    // fixtures (a fresh arm always starts at showNumber 1) — this is now the
    // idempotency key the CAS is keyed on, so the concurrent test below
    // passes because both calls report the SAME show, deterministically, not
    // because their reads happened to race.
    payload: {
      modalKey: "status_intro",
      triggerSource: "post_outcome",
      action: "viewed",
      showNumber: 1,
    },
  });
}

beforeAll(async () => {
  dbUrl = await startTestDb();
  process.env.DATABASE_URL = dbUrl;
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.MODAL_HOOK_KEY = HOOK_KEY;
  resetEnvCache();
  clearGlobalServices();

  app = await buildApp();
  initAuthModule(app);
  initModalsModule(app);
  await app.ready();

  // `login_type` defaults to 'email', and `user_login_type_shape` requires a
  // passwordHash on that branch — a real constraint the brief's seed omitted.
  await getPrisma().user.create({
    data: {
      id: USER,
      email: `${USER}@test.local`,
      name: "Modal Tester",
      passwordHash: "not-a-real-hash-modal-integration-test",
    },
  });
}, 180_000);

afterAll(async () => {
  await app.close();
  await disconnectPrisma();
  await stopTestDb();
});

beforeEach(async () => {
  const prisma = getPrisma();
  await prisma.modalImpression.deleteMany({});
  await prisma.modalHookDelivery.deleteMany({});
  await prisma.modalUserState.deleteMany({});
});

describe("the hook route", () => {
  test("a wrong key is 401", async () => {
    expect((await postHook(hookBody(), "wrong")).statusCode).toBe(401);
  });

  test("a missing key is 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/modals/hooks",
      payload: hookBody(),
    });
    expect(res.statusCode).toBe(401);
  });

  // Dispatch is at-least-once AND treats a 4xx as permanent. A duplicate must
  // therefore be a 200 that changes nothing, never a 409.
  test("a repeated task_id is 200 and changes nothing", async () => {
    const body = hookBody();
    expect((await postHook(body)).statusCode).toBe(200);

    const second = await postHook(body);
    expect(second.statusCode).toBe(200);
    const secondBody: HookResponseBody = second.json();
    expect(secondBody.data.applied).toBe(false);
    expect(secondBody.data.reason).toBe("duplicate");
    expect(await getPrisma().modalUserState.count()).toBe(1);
  });

  // TAM-261: the platform's live envelope has no task_id. Each delivery gets
  // its own derived key, so a later re-arm from the same message still applies.
  test("a task_id-less delivery arms, and a second one re-arms rather than reading duplicate", async () => {
    const body = hookBody({ task_id: undefined, campaign_message_id: 44 });

    const first = await postHook(body);
    expect(first.statusCode).toBe(200);
    const firstBody: HookResponseBody = first.json();
    expect(firstBody.data).toEqual({ applied: true, reason: "armed" });

    const second = await postHook(body);
    const secondBody: HookResponseBody = second.json();
    expect(secondBody.data).toEqual({ applied: true, reason: "armed" });

    const deliveries = await getPrisma().modalHookDelivery.findMany();
    expect(deliveries).toHaveLength(2);
    for (const d of deliveries) expect(d.taskId).toMatch(new RegExp(`^derived:cm-44:${USER}:`));
    // Re-arm refreshes the offer; it never rewinds or duplicates the ledger row.
    const state = await getPrisma().modalUserState.findMany();
    expect(state).toHaveLength(1);
    expect(state[0].showCount).toBe(0);
  });
});

describe("the full cycle", () => {
  test("arm, serve, view, then null for the rest of the IST day", async () => {
    await postHook(hookBody());

    const first = await getNext();
    expect(first.statusCode).toBe(200);
    const firstBody: NextResponseBody = first.json();
    const modal = firstBody.data.modal;
    expect(modal).not.toBeNull();
    expect(modal?.showNumber).toBe(1);
    expect(modal?.lastOutcomeModule).toBe("set_wallpaper_result");
    expect(modal?.localeServed).toBe("hi");

    const viewedBody: ImpressionResponseBody = (await postViewed()).json();
    expect(viewedBody.data.counted).toBe(true);

    const secondBody: NextResponseBody = (await getNext()).json();
    expect(secondBody.data.modal).toBeNull();
  });

  test("the lifetime cap stops the fourth show", async () => {
    await postHook(hookBody());
    // Drive the ledger directly to the cap — the alternative is faking the
    // clock across three IST days, which proves nothing this does not.
    await getPrisma().modalUserState.updateMany({
      where: { userId: USER },
      data: { showCount: 3, shownTodayCount: 0, lastShownDateIst: "2020-01-01" },
    });

    const body: NextResponseBody = (await getNext()).json();
    expect(body.data.modal).toBeNull();
  });

  // Proves duplicate-REPORT idempotency, not a race per se: both calls echo
  // the SAME `showNumber`, so this would pass exactly the same way if the two
  // calls were awaited sequentially instead of concurrently (see the sibling
  // test below) — the `Promise.all` here only additionally confirms the CAS
  // also holds when the two reports genuinely overlap at the database.
  test("a duplicate viewed for the same showNumber advances the count by exactly one", async () => {
    await postHook(hookBody());

    const [a, b] = await Promise.all([postViewed(), postViewed()]);
    const aBody: ImpressionResponseBody = a.json();
    const bBody: ImpressionResponseBody = b.json();
    const counted = [aBody.data.counted, bBody.data.counted].filter(Boolean);

    expect(counted).toHaveLength(1);
    const state = await getPrisma().modalUserState.findFirstOrThrow({ where: { userId: USER } });
    expect(state.showCount).toBe(1);
  });

  // The sequential sibling: a network retry or a double widget rebuild,
  // nothing concurrent at all. This is the case a fresh-read-derived CAS
  // (round 1) could NOT cover — each call would see fresh, matching state and
  // legitimately advance. Echoing `showNumber` back fixes it regardless of
  // timing, which this test states under its own name rather than leaving it
  // to be inferred from the concurrent test above.
  test("a sequential duplicate viewed for the same showNumber does not count twice", async () => {
    await postHook(hookBody());

    const first: ImpressionResponseBody = (await postViewed()).json();
    const second: ImpressionResponseBody = (await postViewed()).json();

    expect(first.data.counted).toBe(true);
    expect(second.data.counted).toBe(false);
    const state = await getPrisma().modalUserState.findFirstOrThrow({ where: { userId: USER } });
    expect(state.showCount).toBe(1);
  });
});

// TAM-174 prod bug: the mobile app never constructs this body from scratch —
// it goes through the OpenAPI-generated `ModalImpressionBody.toJson()`
// (apps/mobile/lib/api/generated/models/modal_impression_body.dart), whose
// optional-field template ALWAYS emits the `dismissMethod` key, writing an
// explicit `null` when the field is unset rather than omitting the key. Every
// other impression test in this file (see `postViewed` above) builds its own
// payload and simply leaves `dismissMethod` out, which is a shape neither the
// original bare-`.optional()` defect NOR this fix would ever be exercised by.
// These two cases post the EXACT shape the generated Dart client sends for a
// `viewed` and a `dismissed` impression — do not "simplify" them by dropping
// the explicit null key, that is the entire point of the regression test.
describe("the exact body shape the generated Dart client sends (TAM-174)", () => {
  test("accepts the explicit-null dismissMethod the generated Dart client always sends", async () => {
    await postHook(hookBody());

    const res = await app.inject({
      method: "POST",
      url: "/modals/impressions",
      headers: { authorization: `Bearer ${token()}` },
      payload: {
        modalKey: "status_intro",
        triggerSource: "post_outcome",
        action: "viewed",
        dismissMethod: null,
        showNumber: 1,
      },
    });

    expect(res.statusCode).toBe(200);
    const body: ImpressionResponseBody = res.json();
    expect(body.data.counted).toBe(true);

    const row = await getPrisma().modalImpression.findFirstOrThrow({ where: { userId: USER } });
    expect(row.dismissMethod).toBeNull();
  });

  test("accepts a real dismissMethod alongside the same declared-keys shape", async () => {
    await postHook(hookBody());

    const res = await app.inject({
      method: "POST",
      url: "/modals/impressions",
      headers: { authorization: `Bearer ${token()}` },
      payload: {
        modalKey: "status_intro",
        triggerSource: "post_outcome",
        action: "dismissed",
        dismissMethod: "cross",
        showNumber: 1,
      },
    });

    expect(res.statusCode).toBe(200);
    const body: ImpressionResponseBody = res.json();
    // `dismissed` never advances the ledger — only `viewed` does (see the
    // service) — so `counted: false` here is correct; this pins the OTHER
    // branch, that a real dismissMethod round-trips into the impression row.
    expect(body.data.counted).toBe(false);

    const row = await getPrisma().modalImpression.findFirstOrThrow({ where: { userId: USER } });
    expect(row.dismissMethod).toBe("cross");
  });
});

describe("halting", () => {
  test("a halt makes the modal null permanently, and a later arm does not revive it", async () => {
    await postHook(hookBody());
    await postHook(hookBody({ action: "halt", source_event_name: "status_share_result" }));

    const afterHalt: NextResponseBody = (await getNext()).json();
    expect(afterHalt.data.modal).toBeNull();

    const revive = await postHook(hookBody({ task_id: `campaign-delivery-${randomUUID()}` }));
    const reviveBody: HookResponseBody = revive.json();
    expect(reviveBody.data.reason).toBe("halted");
    const afterRevive: NextResponseBody = (await getNext()).json();
    expect(afterRevive.data.modal).toBeNull();
  });

  // Audience B's whole reason for existing: an EXIT rule cannot fire for a
  // non-member, so the halt must work with no prior arm.
  test("a halt before any arm blocks the future arm", async () => {
    await postHook(hookBody({ action: "halt", source_event_name: "status_share_result" }));

    const arm = await postHook(hookBody({ task_id: `campaign-delivery-${randomUUID()}` }));
    const armBody: HookResponseBody = arm.json();
    expect(armBody.data.reason).toBe("halted");
    const body: NextResponseBody = (await getNext()).json();
    expect(body.data.modal).toBeNull();
  });

  test("a halt spans every trigger source of the same modal", async () => {
    await postHook(hookBody());
    await postHook(hookBody({ trigger_source: "first_time", task_id: `campaign-delivery-${randomUUID()}` }));

    await postHook(hookBody({ action: "halt", task_id: `campaign-delivery-${randomUUID()}` }));

    const rows = await getPrisma().modalUserState.findMany({ where: { userId: USER } });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.haltedAt !== null)).toBe(true);
  });

  test("both halt paths firing keeps the first timestamp", async () => {
    await postHook(hookBody());
    const first = new Date("2026-09-11T06:00:00.000Z").toISOString();
    await postHook(hookBody({ action: "halt", occurred_at: first, task_id: `campaign-delivery-${randomUUID()}` }));
    await postHook(
      hookBody({
        action: "halt",
        occurred_at: new Date("2026-09-11T09:00:00.000Z").toISOString(),
        task_id: `campaign-delivery-${randomUUID()}`,
      })
    );

    const state = await getPrisma().modalUserState.findFirstOrThrow({ where: { userId: USER } });
    expect(state.haltedAt?.toISOString()).toBe(first);
  });

  // Blocker 1 of the TAM-174 fix wave: this IS the designed path — the exit
  // campaign and the shared-named campaign both fire off one
  // `status_share_result`, so two halts with NO pre-existing row landing
  // together is ordinary traffic, not an edge case. Before the fix,
  // `applyHalt`'s `upsert` with an empty `update` made Prisma fall back to a
  // read-then-write race (`SELECT` then a bare `INSERT`, no `ON CONFLICT`),
  // and one of the two requests 500ed almost every time. `createMany({
  // skipDuplicates: true })` compiles to `INSERT … ON CONFLICT DO NOTHING`,
  // so both must now succeed deterministically, not "usually".
  test("two concurrent halts with no existing row both succeed (Blocker 1)", async () => {
    const occurredAt = new Date().toISOString();
    const [a, b] = await Promise.all([
      postHook(
        hookBody({
          action: "halt",
          source_event_name: "status_share_result",
          occurred_at: occurredAt,
          task_id: `campaign-delivery-${randomUUID()}`,
        })
      ),
      postHook(
        hookBody({
          action: "halt",
          source_event_name: "status_share_result",
          occurred_at: occurredAt,
          task_id: `campaign-delivery-${randomUUID()}`,
        })
      ),
    ]);

    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    const aBody: HookResponseBody = a.json();
    const bBody: HookResponseBody = b.json();
    expect(aBody.data.reason).toBe("halted");
    expect(bBody.data.reason).toBe("halted");

    const rows = await getPrisma().modalUserState.findMany({ where: { userId: USER } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.haltedAt).not.toBeNull();
  });

  // Dead code for THIS modal, live insurance for the next one.
  test("a cron halt clears the arm without halting", async () => {
    await postHook(hookBody());
    await postHook(
      hookBody({
        action: "halt",
        origin: "cron",
        source_event_name: null,
        task_id: `campaign-delivery-${randomUUID()}`,
      })
    );

    const state = await getPrisma().modalUserState.findFirstOrThrow({ where: { userId: USER } });
    expect(state.haltedAt).toBeNull();
    expect(state.armedAt).toBeNull();
    const body: NextResponseBody = (await getNext()).json();
    expect(body.data.modal).toBeNull();
  });
});

describe("unservable arms (Blocker 3a)", () => {
  // The exact hazard: `findServable` is `findFirst` + `orderBy armedAt desc`
  // with NO `modalKey` filter, so a contentless arm for a DIFFERENT modal key
  // on the same surface sorts ahead of a perfectly good one and used to hide
  // it forever. Refusing the unservable arm at intake means it is never
  // stored, so there is nothing to sort ahead of anything.
  test("an unservable arm is refused, and does not blind a later servable one", async () => {
    await postHook(hookBody({ task_id: `campaign-delivery-${randomUUID()}` }));

    const refused = await postHook(
      hookBody({
        modal_key: "other_modal",
        task_id: `campaign-delivery-${randomUUID()}`,
        content: undefined,
      })
    );
    const refusedBody: HookResponseBody = refused.json();
    expect(refused.statusCode).toBe(200);
    expect(refusedBody.data.applied).toBe(false);
    expect(refusedBody.data.reason).toBe("unservable");

    // Refused at intake, not stored: only the first arm's row exists.
    const rows = await getPrisma().modalUserState.findMany({ where: { userId: USER } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.modalKey).toBe("status_intro");

    // The genuinely servable first arm is unaffected.
    const body: NextResponseBody = (await getNext()).json();
    expect(body.data.modal).not.toBeNull();
    expect(body.data.modal?.showNumber).toBe(1);
  });

  test("an arm with no surface is refused, not stored", async () => {
    const res = await postHook(hookBody({ surface: undefined }));
    const resBody: HookResponseBody = res.json();
    expect(res.statusCode).toBe(200);
    expect(resBody.data.reason).toBe("unservable");
    expect(await getPrisma().modalUserState.count()).toBe(0);
  });

  test("a re-arm that omits content does not blank out the stored copy", async () => {
    await postHook(hookBody({ task_id: `campaign-delivery-${randomUUID()}` }));

    // A re-arm for the SAME (user, modalKey, triggerSource) with no content
    // at all. On its own this input is unservable and is refused at intake
    // (Blocker 3a) — it never reaches the write path — so this end-to-end
    // case is covered there. `upsertArmTx`'s own guard (Blocker 3b) is a
    // second line of defense for a future caller that reaches it directly,
    // bypassing the intake check; either way, the stored copy must survive.
    await postHook(
      hookBody({ task_id: `campaign-delivery-${randomUUID()}`, content: undefined })
    );

    const body: NextResponseBody = (await getNext()).json();
    expect(body.data.modal).not.toBeNull();
    expect(body.data.modal?.localeServed).toBe("hi");
  });
});

/**
 * A separate app instance, because MODAL_HOOK_KEY is read at REGISTRATION time
 * and the suite above sets it once in beforeAll. Building a second app is the
 * only way to observe the unconfigured branch.
 */
describe("an unconfigured environment", () => {
  test("does not register the hook route at all", async () => {
    process.env.MODAL_HOOK_KEY = "";
    resetEnvCache();
    const bare = await buildApp();
    initModalsModule(bare);
    await bare.ready();

    const res = await bare.inject({
      method: "POST",
      url: "/internal/modals/hooks",
      payload: hookBody(),
    });

    // 404, not 401: an endpoint that exists and rejects still tells an attacker
    // it is there. The estate's convention for machine callbacks is to not
    // register them at all.
    expect(res.statusCode).toBe(404);

    await bare.close();
    process.env.MODAL_HOOK_KEY = HOOK_KEY;
    resetEnvCache();
  });
});

describe("the contract", () => {
  test("the hook route is absent from the emitted OpenAPI document", () => {
    const doc = app.swagger() as { paths: Record<string, unknown> };
    expect(Object.keys(doc.paths)).not.toContain("/internal/modals/hooks");
    expect(Object.keys(doc.paths)).toContain("/modals/next");
  });
});
