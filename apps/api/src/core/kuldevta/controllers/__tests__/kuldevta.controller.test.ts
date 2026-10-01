import { describe, expect, test, vi } from "vitest";

import { KuldevtaController } from "../kuldevta.controller.js";

/**
 * Controller-level unit coverage for `KuldevtaController.identify`
 * (TAM-165). Real service/matcher/registry run for real (no mocks — the
 * profile below is deliberately unparseable so `repairAndParseProfile`
 * throws `ProfileParseError` before any of them are reached); only the
 * network hop (`callParser`) and persistence (`saveAssignment`) are doubled.
 *
 * The point of this file: `ProfileParseError.raw` carries the family's full
 * unparsed answers (and can carry the guarded sati term, spec §9.2) — assert
 * the controller's error log NEVER contains it, regardless of whether pino
 * logging happens to be enabled at runtime.
 */

function fakeReply() {
  return {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
}

const ANSWERS = {
  surname: "Patil",
  ancestralPlace: "Satara, Maharashtra",
  community: "Maratha",
  gotra: "pata nahi",
  templeMentioned: "Jejuri wale khandoba",
  mandirPhoto: "bhandara wale devta",
};

describe("KuldevtaController.identify", () => {
  test("without req.user throws 401 Unauthorized", async () => {
    const controller = new KuldevtaController({
      callParser: () => Promise.resolve("{}"),
      loadRegistry: () => ({ deities: [], archetypes: [], regionDefaults: [] }),
      saveAssignment: () => Promise.resolve(),
    imageUrlFor: (slug: string) => `https://cdn.test/kuldevta/kuldevta/${slug}.webp`,
    });
    const req = { user: undefined, body: ANSWERS, log: { error: vi.fn() } } as never;

    await expect(controller.identify(req, fakeReply() as never)).rejects.toMatchObject({
      statusCode: 401,
      errorCode: "UNAUTHORIZED",
    });
  });

  test("an unparseable parser output logs only name/message, never the raw LLM text", async () => {
    // Contains the guarded term AND arbitrary family-answer text — exactly
    // what must never reach a log line, plus proof the assertion isn't
    // trivially true because the raw text happened to be empty.
    const RAW_WITH_SENSITIVE_TEXT = "not json at all — Rani Sati Dadi mandir Jhunjhunu, Patil family";
    const logError = vi.fn();
    const controller = new KuldevtaController({
      callParser: () => Promise.resolve(RAW_WITH_SENSITIVE_TEXT),
      loadRegistry: () => ({ deities: [], archetypes: [], regionDefaults: [] }),
      saveAssignment: () => Promise.resolve(),
    imageUrlFor: (slug: string) => `https://cdn.test/kuldevta/kuldevta/${slug}.webp`,
    });
    const req = {
      user: { id: "u-1" },
      body: ANSWERS,
      log: { error: logError },
    } as never;

    await expect(controller.identify(req, fakeReply() as never)).rejects.toMatchObject({
      statusCode: 502,
      errorCode: "PARSER_UNAVAILABLE",
    });

    expect(logError).toHaveBeenCalledOnce();
    const [loggedPayload] = logError.mock.calls[0] as [unknown, string];
    const serialized = JSON.stringify(loggedPayload);
    expect(serialized).not.toContain("Rani Sati Dadi");
    expect(serialized).not.toContain("Patil family");
    expect(serialized).not.toContain(RAW_WITH_SENSITIVE_TEXT);
    // What IS allowed to be logged: the error's name/message, nothing else.
    expect(loggedPayload).toMatchObject({
      err: { name: "ProfileParseError" },
    });
  });
});
