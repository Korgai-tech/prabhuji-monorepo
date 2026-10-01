/**
 * TAM-125 — backfill `size_bytes`, `duration_ms`, `checksum` on `audio_items`
 * (aarti + bhajan share this table) and `mantra_audio_items`.
 *
 * WHY:
 * The `GET /content/:type/:id/download` manifest endpoint promises three
 * download-oriented fields the current audio rows do not carry. This script
 * fills them from the underlying S3 objects (HEAD-only — no bytes downloaded)
 * so an existing catalogue lights up without a re-ingest.
 *
 * BEHAVIOUR (per row, ordered):
 *   - `size_bytes`  ← S3 HEAD `ContentLength`. Always populated on success.
 *   - `checksum`    ← S3 HEAD `ETag` iff it matches `^[0-9a-f]{64}$` (SHA-256
 *                     buckets). Otherwise `null` + warn — we DO NOT download +
 *                     re-hash multi-GB objects here.
 *   - `duration_ms` ← S3 HEAD user-metadata `duration-ms` (from
 *                     `x-amz-meta-duration-ms`) when present. Otherwise `null`;
 *                     the mobile client probes locally on first play (the
 *                     manifest Zod schema tolerates null).
 *
 * INVARIANTS:
 *   - Idempotent. A row with `size_bytes IS NOT NULL` is skipped (already
 *     backfilled). Running twice does no additional S3 work.
 *   - Chunked at 200 rows per batch to keep memory + DB round-trips flat under
 *     a large catalogue. Progress + failure counts are logged every batch.
 *   - Dry-run by default. `--commit` is required to persist writes; without it
 *     the S3 HEAD calls still run and the resolved values are logged, so an
 *     operator can eyeball the result before flipping the switch.
 *   - `--table aarti|mantra|both` selects the target table(s); defaults to
 *     `both`.
 *
 * MODULE BOUNDARY:
 *   This script sits at "repository altitude" for a one-off maintenance task
 *   (per the DE role guidance) — it may touch Prisma AND the AWS/media surface
 *   directly. `arch-boundaries.json` does not gate `scripts/` (no `match:` rule
 *   fires), so the direct imports below are compliant. Cross-module reads of
 *   S3 metadata go through `MediaService.head(publicUrl)` so URL→key conversion
 *   uses the SAME helper the runtime endpoint uses — no drift between backfill
 *   and serve.
 *
 * USAGE:
 *   pnpm tsx apps/api/src/core/downloads/scripts/backfill-download-metadata.ts
 *   pnpm tsx apps/api/src/core/downloads/scripts/backfill-download-metadata.ts --commit
 *   pnpm tsx apps/api/src/core/downloads/scripts/backfill-download-metadata.ts --table aarti --commit
 *   pnpm tsx apps/api/src/core/downloads/scripts/backfill-download-metadata.ts --table mantra --commit
 */
import { fileURLToPath } from "node:url";

import { loadEnv } from "@api/shared/config";
import { getPrisma, disconnectPrisma } from "@api/shared/database";
import { createModuleLogger } from "@api/shared/logs";
import { MediaObjectRepository, S3MediaRepository } from "@api/core/media/repositories";
import { MediaService } from "@api/core/media/services";
import type { HeadResult } from "@api/core/media/types";

const log = createModuleLogger("downloads:backfill");

const BATCH_SIZE = 200;
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
/** S3 `x-amz-meta-duration-ms` — AWS SDK lowercases the key and strips the prefix. */
const DURATION_METADATA_KEYS = ["duration-ms", "durationms"] as const;

type TableSelection = "aarti" | "mantra" | "both";

interface CliArgs {
  commit: boolean;
  table: TableSelection;
}

interface BackfillResult {
  scanned: number;
  updated: number;
  skipped: number;
  sizeMissing: number;
  checksumMissing: number;
  durationMissing: number;
  errors: number;
}

interface RowMetadata {
  sizeBytes: bigint | null;
  durationMs: number | null;
  checksum: string | null;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let commit = false;
  let table: TableSelection = "both";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--commit") {
      commit = true;
    } else if (arg === "--dry-run") {
      commit = false;
    } else if (arg === "--table") {
      const next = argv[i + 1];
      if (next !== "aarti" && next !== "mantra" && next !== "both") {
        throw new Error(`--table must be one of aarti|mantra|both (got ${String(next)})`);
      }
      table = next;
      i += 1;
    } else if (arg?.startsWith("--table=")) {
      const value = arg.slice("--table=".length);
      if (value !== "aarti" && value !== "mantra" && value !== "both") {
        throw new Error(`--table must be one of aarti|mantra|both (got ${value})`);
      }
      table = value;
    }
  }
  return { commit, table };
}

function extractDurationMs(metadata: Record<string, string> | null | undefined): number | null {
  if (!metadata) return null;
  // AWS SDK v3 lowercases the header key and strips the `x-amz-meta-` prefix.
  const lower = Object.fromEntries(
    Object.entries(metadata).map(([k, v]) => [k.toLowerCase(), v])
  );
  for (const key of DURATION_METADATA_KEYS) {
    const raw = lower[key];
    if (typeof raw !== "string") continue;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

function extractChecksum(head: HeadResult): string | null {
  const etag = head.etag;
  if (!etag) return null;
  const lower = etag.toLowerCase();
  if (SHA256_HEX_RE.test(lower)) return lower;
  return null;
}

async function resolveRowMetadata(
  id: string,
  publicUrl: string,
  media: MediaService
): Promise<RowMetadata | Error> {
  try {
    const head = await media.head(publicUrl);
    if (!head.exists) {
      return new Error(`S3 object does not exist for row ${id} (url=${publicUrl})`);
    }
    const sizeBytes =
      typeof head.sizeBytes === "number" && head.sizeBytes >= 0 ? BigInt(head.sizeBytes) : null;
    const checksum = extractChecksum(head);
    const durationMs = extractDurationMs(head.metadata);
    return { sizeBytes, durationMs, checksum };
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err));
  }
}

interface AudioRow {
  id: string;
  /** The public S3 URL — `audio_stream_url` for aarti, `audio_url` for mantra. */
  url: string;
}

async function fetchAudioBatch(cursor: string | null): Promise<AudioRow[]> {
  const rows = await getPrisma().audioItem.findMany({
    where: {
      sizeBytes: null,
      ...(cursor !== null ? { id: { gt: cursor } } : {}),
    },
    select: { id: true, audioStreamUrl: true },
    orderBy: { id: "asc" },
    take: BATCH_SIZE,
  });
  return rows.map((r) => ({ id: r.id, url: r.audioStreamUrl }));
}

async function fetchMantraBatch(cursor: string | null): Promise<AudioRow[]> {
  const rows = await getPrisma().mantraAudioItem.findMany({
    where: {
      sizeBytes: null,
      ...(cursor !== null ? { id: { gt: cursor } } : {}),
    },
    select: { id: true, audioUrl: true },
    orderBy: { id: "asc" },
    take: BATCH_SIZE,
  });
  return rows.map((r) => ({ id: r.id, url: r.audioUrl }));
}

async function updateAudioRow(id: string, meta: RowMetadata): Promise<void> {
  await getPrisma().audioItem.update({
    where: { id },
    data: { sizeBytes: meta.sizeBytes, durationMs: meta.durationMs, checksum: meta.checksum },
  });
}

async function updateMantraRow(id: string, meta: RowMetadata): Promise<void> {
  await getPrisma().mantraAudioItem.update({
    where: { id },
    data: { sizeBytes: meta.sizeBytes, durationMs: meta.durationMs, checksum: meta.checksum },
  });
}

function initResult(): BackfillResult {
  return {
    scanned: 0,
    updated: 0,
    skipped: 0,
    sizeMissing: 0,
    checksumMissing: 0,
    durationMissing: 0,
    errors: 0,
  };
}

async function backfillTable(
  table: "aarti" | "mantra",
  commit: boolean,
  media: MediaService
): Promise<BackfillResult> {
  const result = initResult();
  let cursor: string | null = null;
  let batchNumber = 0;

  for (;;) {
    const rows: AudioRow[] =
      table === "aarti" ? await fetchAudioBatch(cursor) : await fetchMantraBatch(cursor);
    if (rows.length === 0) break;

    batchNumber += 1;
    for (const row of rows) {
      result.scanned += 1;
      const publicUrl = row.url;
      const outcome = await resolveRowMetadata(row.id, publicUrl, media);

      if (outcome instanceof Error) {
        result.errors += 1;
        log.warn(
          { table, id: row.id, url: publicUrl, err: outcome.message },
          "backfill row failed"
        );
        continue;
      }

      if (outcome.sizeBytes === null) {
        result.sizeMissing += 1;
        result.skipped += 1;
        log.warn(
          { table, id: row.id, url: publicUrl },
          "S3 HEAD returned no ContentLength — skipping row"
        );
        continue;
      }
      if (outcome.checksum === null) result.checksumMissing += 1;
      if (outcome.durationMs === null) result.durationMissing += 1;

      if (commit) {
        try {
          if (table === "aarti") {
            await updateAudioRow(row.id, outcome);
          } else {
            await updateMantraRow(row.id, outcome);
          }
          result.updated += 1;
        } catch (err) {
          result.errors += 1;
          log.warn(
            { table, id: row.id, err: err instanceof Error ? err.message : String(err) },
            "row update failed"
          );
        }
      } else {
        // Dry-run: don't write. Count as scanned only.
        log.info(
          {
            table,
            id: row.id,
            sizeBytes: outcome.sizeBytes.toString(),
            durationMs: outcome.durationMs,
            checksum: outcome.checksum,
          },
          "dry-run: would update"
        );
      }
    }

    log.info(
      {
        table,
        batch: batchNumber,
        commit,
        progress: {
          scanned: result.scanned,
          updated: result.updated,
          skipped: result.skipped,
          errors: result.errors,
          sizeMissing: result.sizeMissing,
          checksumMissing: result.checksumMissing,
          durationMissing: result.durationMissing,
        },
      },
      "batch complete"
    );

    // In dry-run mode nothing is persisted, so `sizeBytes` stays NULL and the
    // WHERE clause would re-select the SAME rows on the next iteration — walk
    // by the last id explicitly so we don't loop forever.
    cursor = rows[rows.length - 1].id;

    // In commit mode the WHERE `sizeBytes: null` also naturally excludes the
    // rows we just updated, so the cursor is redundant but harmless (belt +
    // suspenders on ordering).
    if (rows.length < BATCH_SIZE) break;
  }

  return result;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const publicBaseUrl = env.MEDIA_PUBLIC_BASE_URL.replace(/\/+$/, "");
  const s3 = new S3MediaRepository(env.MEDIA_BUCKET);
  const ledger = new MediaObjectRepository();
  const media = new MediaService(s3, ledger, publicBaseUrl);

  log.info(
    { commit: args.commit, table: args.table, publicBaseUrl, bucket: env.MEDIA_BUCKET },
    args.commit
      ? "starting backfill (COMMIT MODE — writes will persist)"
      : "starting backfill (DRY-RUN — no writes; pass --commit to persist)"
  );

  const totals = initResult();
  if (args.table === "aarti" || args.table === "both") {
    const r = await backfillTable("aarti", args.commit, media);
    log.info({ table: "aarti", ...r }, "aarti backfill done");
    totals.scanned += r.scanned;
    totals.updated += r.updated;
    totals.skipped += r.skipped;
    totals.sizeMissing += r.sizeMissing;
    totals.checksumMissing += r.checksumMissing;
    totals.durationMissing += r.durationMissing;
    totals.errors += r.errors;
  }
  if (args.table === "mantra" || args.table === "both") {
    const r = await backfillTable("mantra", args.commit, media);
    log.info({ table: "mantra", ...r }, "mantra backfill done");
    totals.scanned += r.scanned;
    totals.updated += r.updated;
    totals.skipped += r.skipped;
    totals.sizeMissing += r.sizeMissing;
    totals.checksumMissing += r.checksumMissing;
    totals.durationMissing += r.durationMissing;
    totals.errors += r.errors;
  }

  log.info({ commit: args.commit, table: args.table, ...totals }, "backfill complete");
}

/**
 * Guarded CLI entry — mirrors `_shared.ts:isSeedCli`. Only executes when THIS
 * file is the process entrypoint (`pnpm tsx …/backfill-download-metadata.ts`),
 * so a downstream `import` of the script (e.g. from a unit test) has no side
 * effect. The `.ts` / `.js` suffix guard also keeps the block inert if a future
 * bundler collapses `import.meta.url` to a shared value.
 */
function isCliEntry(moduleUrl: string): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  return entry === fileURLToPath(moduleUrl) && /backfill-download-metadata\.[tj]s$/.test(entry);
}

if (isCliEntry(import.meta.url)) {
  main()
    .catch((err) => {
      log.error({ err: err instanceof Error ? err.message : String(err) }, "backfill failed");
      process.exitCode = 1;
    })
    .finally(() => {
      void disconnectPrisma();
    });
}

export { main, parseArgs, extractChecksum, extractDurationMs };
