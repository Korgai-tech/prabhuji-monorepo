import type { FastifyInstance } from "fastify";
import { registerGlobalService } from "@api/shared/workspace";
import { createModuleLogger } from "@api/shared/logs";
import { BooksRepository } from "@api/core/books/repositories";
import { BooksAdminService, BooksService } from "@api/core/books/services";
import { BooksApi } from "@api/core/books/api";
import {
  registerBooksAdminRoutes,
  registerBooksRoutes,
} from "@api/core/books/routes";

const log = createModuleLogger("books:bootstrap");

/**
 * Composition root for the Books & Scriptures module (TAM-75).
 *
 * Wires the layered dependencies (repo → service → controller/facade), publishes
 * the `IBooksApi` facade into `GlobalServiceMap` so sibling modules (Home/TAM-61)
 * reference books content via `performServiceCall("books", …)`, and mounts the
 * `/books/*` routes.
 *
 * Depends (at request time, via `performServiceCall`) on the `subscription`
 * (entitlement) facade for the #EXPORT_CRITICAL Pro gate on every reading path —
 * registered by its own module init in `bootstrap.ts`.
 */
export function initBooksModule(app: FastifyInstance): void {
  const repo = new BooksRepository();
  const service = new BooksService(repo);
  const adminService = new BooksAdminService(repo);
  const api = new BooksApi(service);
  registerGlobalService("books", api);

  void app.register((scoped) => {
    registerBooksRoutes(scoped, service);
  });

  // TAM-102: the admin write surface is a SEPARATE `/admin`-prefixed scope (ADR
  // §B5), not the public `/books/*` routes with a guard bolted on — the mobile
  // read contract must not churn to serve admin. `registerBooksAdminRoutes`
  // declares paths under `/books/<entity>`, so the full paths are
  // `/admin/books/…`. Every route inside is `registerAdminRoute`-guarded.
  void app.register(
    (scoped) => {
      registerBooksAdminRoutes(scoped, adminService);
    },
    { prefix: "/admin" }
  );

  log.info("books module initialised");
}
