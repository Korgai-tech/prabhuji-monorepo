import { getPrisma } from "@api/shared/database";
import type { PresignInput } from "@api/core/media/types";

/**
 * The ONLY place Prisma is reached for the media module (arch-boundaries.json
 * enforces it; the service stays Prisma-free). Owns the `media_objects` ledger.
 *
 * The ledger is written AT PRESIGN TIME (ADR §A6) — presign is the only moment
 * we know WHO asked (`uploadedBy` = the JWT subject) and WHY (`module`/`entity`/
 * `field`). Backfilling it later is impossible: S3 does not know who uploaded
 * what or why. It is the input to any future orphan reaper, the "who uploaded
 * this" for audit, and the backing store for a future media-library UI. Reaping
 * itself is explicitly NOT built (risk A-R3); a row here does not imply the
 * object is referenced by anything.
 */
export class MediaObjectRepository {
  /** Record a freshly minted key. Called once, at presign. */
  async record(input: PresignInput & { key: string }): Promise<void> {
    await getPrisma().mediaObject.create({
      data: {
        key: input.key,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        module: input.module,
        entity: input.entity,
        field: input.field,
        uploadedBy: input.uploadedBy,
      },
    });
  }
}
