import type { FastifyInstance } from "fastify";
import { registerGlobalService } from "@api/shared/workspace";
import { createModuleLogger } from "@api/shared/logs";
import { WallpaperRepository } from "@api/core/wallpaper/repositories";
import { WallpaperAdminService, WallpaperService } from "@api/core/wallpaper/services";
import { WallpaperApi } from "@api/core/wallpaper/api";
import {
  registerWallpaperAdminRoutes,
  registerWallpaperRoutes,
} from "@api/core/wallpaper/routes";

const log = createModuleLogger("wallpaper:bootstrap");

/**
 * Composition root for the Wallpaper module (TAM-69).
 *
 * Wires the layered dependencies (repo → service → controller/facade),
 * publishes the `IWallpaperApi` facade into `GlobalServiceMap` so sibling
 * modules (e.g. a cross-module share sheet / home embed) reference wallpaper
 * content via `performServiceCall("wallpaper", …)`, and mounts the
 * `/wallpaper/*` routes.
 *
 * Depends (at request time, via `performServiceCall`) on the `engagement`
 * (like/share counts + likedByMe + like toggle) and `deity` (taxonomy display
 * names + icons) facades — registered by their own module inits in
 * `bootstrap.ts`. There is NO `subscription` dependency: wallpaper discovery is
 * free and has no server entitlement gate.
 */
export function initWallpaperModule(app: FastifyInstance): void {
  const repo = new WallpaperRepository();
  const service = new WallpaperService(repo);
  const adminService = new WallpaperAdminService(repo);
  const api = new WallpaperApi(service);
  registerGlobalService("wallpaper", api);

  void app.register((scoped) => {
    registerWallpaperRoutes(scoped, service);
  });

  // TAM-96: the admin write surface is a SEPARATE `/admin`-prefixed scope (ADR
  // §B5), not the public `/wallpaper/*` routes with a guard bolted on — the
  // mobile read contract must not churn to serve admin. `registerWallpaperAdmin
  // Routes` declares paths under `/wallpapers`, so the full paths are
  // `/admin/wallpapers…`. Every route inside is `registerAdminRoute`-guarded.
  void app.register(
    (scoped) => {
      registerWallpaperAdminRoutes(scoped, adminService);
    },
    { prefix: "/admin" }
  );

  log.info("wallpaper module initialised");
}
