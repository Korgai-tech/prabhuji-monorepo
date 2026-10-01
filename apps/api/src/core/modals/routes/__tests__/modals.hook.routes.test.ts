import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type * as LogsModule from "@api/shared/logs";
import { buildApp } from "@api/app";
import { resetEnvCache } from "@api/shared/config";
import type { ModalsService } from "@api/core/modals/services";
import type { ModalHookInput } from "@api/core/modals/types";
import { MODAL_HOOK_ROUTE, registerModalsRoutes } from "../modals.routes.js";

/**
 * TAM-261 — the hook route's wire edge, with a fake service and no database,
 * so it runs in `pnpm verify`. The integration suite proves the same payloads
 * against real Postgres.
 */

const emitted: { obj: Record<string, unknown>; msg: string }[] = [];
vi.mock("@api/shared/logs", async (importOriginal) => {
  const actual = await importOriginal<typeof LogsModule>();
  const record =
    () =>
    (objOrMsg: unknown, msg?: string): void => {
      if (typeof objOrMsg === "string") emitted.push({ obj: {}, msg: objOrMsg });
      else emitted.push({ obj: objOrMsg as Record<string, unknown>, msg: msg ?? "" });
    };
  const logger = {
    info: record(),
    warn: record(),
    error: record(),
    debug: record(),
    trace: record(),
    fatal: record(),
    child: () => logger,
  };
  return { ...actual, createModuleLogger: () => logger };
});

const HOOK_KEY = "unit-modal-hook-key";
const USER = "01a01482-6685-7233-8000-000000000001";

const received: ModalHookInput[] = [];
const fakeService = {
  handleHook: (input: ModalHookInput) => {
    received.push(input);
    return Promise.resolve({ applied: true, reason: "armed" });
  },
} as unknown as ModalsService;

/** The body the campaign platform really sends: author fields + its envelope. */
function platformBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    modal_key: "status_intro",
    action: "arm",
    trigger_source: "post_outcome",
    surface: "home",
    content: { en: { title: "t", ctaText: "c", ctaDeeplink: "prabhuji://status/personal-details" } },
    user_id: USER,
    campaign_id: 12,
    campaign_message_id: 44,
    ...overrides,
  };
}

let app: FastifyInstance;

beforeAll(async () => {
  process.env.MODAL_HOOK_KEY = HOOK_KEY;
  resetEnvCache();
  app = await buildApp();
  registerModalsRoutes(app, fakeService);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  delete process.env.MODAL_HOOK_KEY;
  resetEnvCache();
});

beforeEach(() => {
  received.length = 0;
  emitted.length = 0;
});

function post(body: unknown, headers: Record<string, string> = {}) {
  return app.inject({
    method: "POST",
    url: MODAL_HOOK_ROUTE,
    headers: { "x-modal-hook-key": HOOK_KEY, ...headers },
    ...(body === undefined ? {} : { payload: body as Record<string, unknown> }),
  });
}

describe("task_id", () => {
  test("a body with no task_id is accepted and gets a derived per-delivery key", async () => {
    const res = await post(platformBody());
    expect(res.statusCode).toBe(200);
    expect(received).toHaveLength(1);
    expect(received[0].taskId).toMatch(
      new RegExp(`^derived:cm-44:${USER}:[0-9a-f-]{36}$`)
    );
  });

  // A deterministic (campaign_message_id, user_id) key would dedupe every
  // later re-arm from the same message forever; each delivery is its own key.
  test("two identical task_id-less deliveries get different keys", async () => {
    await post(platformBody());
    await post(platformBody());
    expect(received).toHaveLength(2);
    expect(received[0].taskId).not.toBe(received[1].taskId);
  });

  test("no campaign_message_id still yields a derived key", async () => {
    await post(platformBody({ campaign_message_id: undefined }));
    expect(received[0].taskId).toMatch(new RegExp(`^derived:cm-none:${USER}:`));
  });

  test("a task_id that IS sent is used verbatim", async () => {
    await post(platformBody({ task_id: "campaign-delivery-91823" }));
    expect(received[0].taskId).toBe("campaign-delivery-91823");
  });
});

describe("rejected payloads", () => {
  test("a validation failure is logged with the message and body keys, still 400", async () => {
    const res = await post(platformBody({ user_id: "not-a-uuid" }));
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ errorCode: "VALIDATION_ERROR" });
    expect(received).toHaveLength(0);

    const line = emitted.find((e) => e.msg === "modal hook rejected: invalid payload");
    expect(line).toBeDefined();
    expect(String(line?.obj.reason)).toContain("user_id");
    expect(line?.obj.keys).toEqual(expect.arrayContaining(["modal_key", "user_id", "campaign_message_id"]));
    // Key NAMES only — never the payload's values.
    expect(JSON.stringify(line?.obj)).not.toContain("not-a-uuid");
  });

  test("an empty JSON body is a 400, not a 500", async () => {
    const res = await app.inject({
      method: "POST",
      url: MODAL_HOOK_ROUTE,
      headers: { "x-modal-hook-key": HOOK_KEY, "content-type": "application/json" },
    });
    expect(res.statusCode).toBe(400);
    expect(emitted.some((e) => e.msg === "unhandled error")).toBe(false);
  });
});
