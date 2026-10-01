import type { FastifyInstance } from "fastify";
import { registerGlobalService } from "@api/shared/workspace";
import { createModuleLogger } from "@api/shared/logs";
import { PinnedContentApi } from "@api/core/pinned-content/api";
import {
  PinnedContentAuditRepository,
  PinnedContentRepository,
} from "@api/core/pinned-content/repositories";
import { registerPinnedContentAdminRoutes } from "@api/core/pinned-content/routes";
import {
  PinnedContentLookupService,
  PinnedContentService,
} from "@api/core/pinned-content/services";

const log = createModuleLogger("pinned-content:bootstrap");

/**
 * Composition root for the pinned-content module (TAM-173).
 *
 * Wires two services on the same repository pair — the WRITE-path
 * `PinnedContentService` (Zod'd routes → controller → this) and the READ-path
 * `PinnedContentLookupService` (registered as the facade so cross-module reads
 * from `home` / `status` do not resolve a class carrying admin-write deps like
 * the audit repo and the deity facade).
 *
 * MUST init AFTER `deity`, `home`, and `status` — the write service resolves
 * all three facades via `performServiceCall` at REQUEST time, which throws
 * `SERVICE_UNAVAILABLE` if the callee is not yet registered (same hazard as
 * the TAM-47 subscription/OTP ordering note).
 */
export function initPinnedContentModule(app: FastifyInstance): void {
  const repo = new PinnedContentRepository();
  const auditRepo = new PinnedContentAuditRepository();
  const writeService = new PinnedContentService(repo, auditRepo);
  const lookupService = new PinnedContentLookupService(repo);
  const api = new PinnedContentApi(lookupService);
  registerGlobalService("pinnedContent", api);

  // Admin write surface — a SEPARATE `/admin`-prefixed scope, matching the
  // TAM-88 exemplar. Every route inside is `registerAdminRoute`-guarded, so
  // the guard pair + the `admin` OpenAPI tag are applied uniformly.
  void app.register(
    (scoped) => {
      registerPinnedContentAdminRoutes(scoped, writeService);
    },
    { prefix: "/admin" }
  );

  log.info("pinned-content module initialised");
}
