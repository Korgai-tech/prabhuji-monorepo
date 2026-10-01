import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import type { KuldevtaController } from "../controllers/kuldevta.controller.js";
import { registerKuldevtaRoutes } from "../routes/kuldevta.routes.js";

/**
 * This module publishes exactly ONE route. The persona conversation moved to
 * `core/chat` (the `kuldevta_chat` variant), which already owns sessions,
 * transcripts and history — so a second chat surface here would be a second
 * place for crisis handling to be forgotten.
 *
 * A stub app is enough here: this asserts which paths are handed to Fastify,
 * which is exactly the decision under test. The composition root's own gating
 * (reading the env var) is exercised by the emitted OpenAPI artifacts, which
 * `pnpm check:openapi` drift-gates.
 */
function stubApp(): { app: FastifyInstance; paths: string[] } {
  const paths: string[] = [];
  const app = {
    post: (path: string) => {
      paths.push(path);
    },
    withTypeProvider: () => app,
  } as unknown as FastifyInstance;
  return { app, paths };
}

const controller = {} as KuldevtaController;

describe("registerKuldevtaRoutes", () => {
  it("registers only /kuldevta/identify — the persona chat lives in core/chat", () => {
    const { app, paths } = stubApp();
    registerKuldevtaRoutes(app, controller);
    expect(paths).toEqual(["/kuldevta/identify"]);
    expect(paths).not.toContain("/kuldevta/chat");
  });
});
