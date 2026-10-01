import { createModuleLogger } from "@api/shared/logs";
import type { PinnedContentRepository } from "@api/core/pinned-content/repositories";
import type { ActivePinnedId, PinSurface } from "@api/core/pinned-content/types";

const log = createModuleLogger("pinned-content:lookup");

/**
 * Read-side pinned-content service. Backs `IPinnedContentApi.getActivePinnedIds`
 * and nothing else — kept OUT of the write-path service so a cross-module read
 * never has an admin-write dep graph (audit repo, deity facade) hanging off it.
 *
 * The window semantics are the one thing worth reading before touching: pins
 * are ACTIVE when `start_at <= atMs < end_at`. Start is inclusive because the
 * CMS "goes live at" input should mean "visible from that instant"; end is
 * exclusive because "expires at" should mean "no longer visible from that
 * instant". Both are `@db.Timestamptz(6)`, so the boundary is precise to a
 * microsecond — a pin scheduled for `12:00:00.000000` is served at that instant
 * and gone at `12:00:00.000001`.
 */
export class PinnedContentLookupService {
  constructor(private readonly repo: PinnedContentRepository) {}

  async getActivePinnedIds(input: {
    surface: PinSurface;
    deitySlug?: string;
    atMs: number;
  }): Promise<ActivePinnedId[]> {
    const { surface, deitySlug, atMs } = input;
    // Defence-in-depth on the facade shape: `home` / `status_all_gods` MUST have
    // no deitySlug. A caller that violates this would silently miss every pin
    // (the DB row's slug IS NULL, and IS NOT DISTINCT FROM 'ganesha' is false).
    const normalizedSlug =
      surface === "status_deity" ? deitySlug ?? null : null;
    if (surface === "status_deity" && normalizedSlug === null) {
      // Not a 500 — the caller is a peer module and a missing slug is a bug,
      // but returning [] here means the pin block is silently empty and the
      // rotation path serves as before. Loudly log so this never ships.
      log.warn(
        { event: "pinned_content_lookup_missing_deity", surface },
        "status_deity lookup with no deitySlug — returning empty pin block"
      );
      return [];
    }
    const rows = await this.repo.findActive({
      surface,
      deitySlug: normalizedSlug,
      at: new Date(atMs),
    });
    log.debug(
      {
        event: "pinned_content_lookup",
        surface,
        deity_slug: normalizedSlug,
        count: rows.length,
      },
      "pinned-content lookup"
    );
    return rows;
  }
}
