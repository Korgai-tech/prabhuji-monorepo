import { afterAll, beforeAll, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
// side-effect type import: brings @fastify/swagger's `declare module 'fastify'`
// augmentation (FastifyInstance#swagger()) into scope for this file.
import type {} from "@fastify/swagger";
import { buildApp } from "@api/app";
import { initAuthModule } from "@api/core/auth";
import { clearGlobalServices } from "@api/shared/workspace";

interface OperationDoc {
  requestBody?: unknown;
  responses: Record<string, { content?: Record<string, { schema: unknown }> }>;
}
type PathsDoc = Record<string, Record<string, OperationDoc>>;

let app: FastifyInstance;
let paths: PathsDoc;
beforeAll(async () => {
  app = await buildApp();
  initAuthModule(app);
  await app.ready();
  const doc = app.swagger() as unknown as { paths: PathsDoc };
  paths = doc.paths;
});
afterAll(async () => {
  await app.close();
  clearGlobalServices();
});

test("register documents a request body AND a 201 response schema", () => {
  const post = paths["/auth/register"].post;
  expect(post.requestBody).toBeTruthy();
  expect(post.responses["201"]).toBeTruthy();
  // the 201 schema is the success envelope with a data object
  const schema = post.responses["201"].content?.["application/json"]?.schema;
  expect(JSON.stringify(schema)).toContain("data");
});

test("login documents a 200 response and me documents 200 + 401", () => {
  expect(paths["/auth/login"].post.responses["200"]).toBeTruthy();
  expect(paths["/auth/me"].get.responses["200"]).toBeTruthy();
  expect(paths["/auth/me"].get.responses["401"]).toBeTruthy();
});
