/**
 * TAM-265 — re-encode heavy media and point the database at the smaller copies.
 *
 *   tsx apps/api/scripts/media-reencode/main.ts <step> [--workdir DIR] [...]
 *
 * Steps (each resumable; state lives in <workdir>/manifest.json):
 *   plan                    READ-ONLY. DB → candidate URLs → HeadObject + ffprobe → decision; plus a
 *                           scan of every text/json column for other references to those URLs.
 *   encode                  LOCAL ONLY. Download originals from S3, ffmpeg, verify the output.
 *   upload   --confirm <bucket> --uploaded-by <admin uuid>
 *                           PUT the new objects (new keys, never overwrites) + media_objects rows.
 *                           Nothing references them yet — safe, invisible to users.
 *   repoint  [--apply --confirm <bucket>]
 *                           Dry-run by default. With --apply: one transaction per object, every
 *                           exact-match text column old URL → new URL (+ size/duration columns).
 *   rollback --apply --confirm <bucket>
 *                           Reverse every applied repoint. Old objects are never deleted (ADR A6),
 *                           so rolling back is always possible.
 *
 * `--only <module.entity.field>` limits encode/upload/repoint/rollback to one column's objects, so
 * the heaviest surface can ship first (e.g. the paywall hero) while the rest keeps its state.
 *
 * Env: DATABASE_URL, MEDIA_BUCKET, MEDIA_PUBLIC_BASE_URL, AWS_REGION (default ap-south-1) and AWS
 * credentials (AWS_PROFILE=…). Runbook: specs/TAM-265-media-reencode-backfill.md.
 */
import { execFile } from "node:child_process";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import pg from "pg";
import {
  CONTENT_TYPE_BY_EXT,
  IMMUTABLE_CACHE_CONTROL,
  PROFILES,
  TARGETS,
  acceptOutput,
  decide,
  extOf,
  ffmpegArgs,
  keyFromUrl,
  mintKey,
  ownerOf,
  type Probe,
  type Target,
} from "@prabhuji/media-profiles";

const run = promisify(execFile);

// --- manifest ---------------------------------------------------------------

type Status = "planned" | "skipped" | "encoded" | "uploaded" | "repointed" | "rolled-back";

interface Ref {
  table: string;
  column: string;
  rows: number;
}

interface Item {
  field: string;
  oldUrl: string;
  oldKey: string;
  oldBytes: number;
  probe: Probe;
  status: Status;
  reason?: string;
  newKey?: string;
  newUrl?: string;
  outFile?: string;
  newBytes?: number;
  newProbe?: Probe;
  /** Exact-match text columns referencing the URL (plan-time scan). */
  refs?: Ref[];
  /** json/jsonb columns whose text CONTAINS the URL — reported, never rewritten. */
  jsonRefs?: Ref[];
  /** What repoint changed, so rollback can undo exactly that. */
  applied?: { table: string; column: string; rows: number }[];
  previousSizes?: { table: string; id: string; sizeBytes: string | null; durationMs: number | null }[];
}

interface Manifest {
  bucket: string;
  publicBaseUrl: string;
  createdAt: string;
  items: Item[];
}

function out(line = ""): void {
  process.stdout.write(`${line}\n`);
}

function mb(bytes: number): string {
  return `${(bytes / 1e6).toFixed(1)} MB`;
}

// --- args + env ---------------------------------------------------------------

const [step, ...rest] = process.argv.slice(2);
function flag(name: string): string | undefined {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
}
const has = (name: string): boolean => rest.includes(`--${name}`);

/** `--only <field>`: restrict a step to one target column. */
const only = flag("only");
function selected(i: Item): boolean {
  return !only || i.field === only;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

const bucket = requireEnv("MEDIA_BUCKET");
const publicBaseUrl = requireEnv("MEDIA_PUBLIC_BASE_URL").replace(/\/+$/, "");
const workdir = flag("workdir") ?? join(tmpdir(), "media-reencode", bucket);
const manifestPath = join(workdir, "manifest.json");
// Same client shape as core/media's S3 repository: path-style, and
// AWS_ENDPOINT_URL points it at floci locally.
const s3Endpoint = process.env.AWS_ENDPOINT_URL;
const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "ap-south-1",
  forcePathStyle: true,
  ...(s3Endpoint ? { endpoint: s3Endpoint } : {}),
});

function requireConfirm(): void {
  if (flag("confirm") !== bucket) {
    throw new Error(`this step writes to ${bucket} — re-run with --confirm ${bucket}`);
  }
}

function load(): Manifest {
  if (!existsSync(manifestPath)) throw new Error(`no manifest at ${manifestPath} — run \`plan\` first`);
  const m = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
  if (m.bucket !== bucket || m.publicBaseUrl !== publicBaseUrl) {
    throw new Error(`manifest is for ${m.bucket} / ${m.publicBaseUrl}, env says ${bucket} / ${publicBaseUrl}`);
  }
  return m;
}

function save(m: Manifest): void {
  mkdirSync(workdir, { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(m, null, 2));
}

function targetOf(field: string): Target {
  const t = TARGETS.find((x) => x.field === field);
  if (!t) throw new Error(`unknown target ${field}`);
  return t;
}

// --- db -----------------------------------------------------------------------

async function withDb<T>(fn: (db: pg.Client) => Promise<T>): Promise<T> {
  const db = new pg.Client({ connectionString: requireEnv("DATABASE_URL") });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

const IDENT = /^[a-z_][a-z0-9_]*$/;
function q(ident: string): string {
  if (!IDENT.test(ident)) throw new Error(`refusing to interpolate identifier ${JSON.stringify(ident)}`);
  return `"${ident}"`;
}

/** Tables never rewritten: the migration ledger and the media ledger itself (keys, not URLs). */
const SCAN_EXCLUDE = new Set(["_prisma_migrations", "media_objects"]);

interface Column {
  table: string;
  column: string;
  json: boolean;
}

async function textColumns(db: pg.Client): Promise<Column[]> {
  const res = await db.query<{ table_name: string; column_name: string; data_type: string }>(
    `SELECT c.table_name, c.column_name, c.data_type
       FROM information_schema.columns c
       JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
        AND c.data_type IN ('text', 'character varying', 'json', 'jsonb')
      ORDER BY 1, 2`
  );
  return res.rows
    .filter((r) => !SCAN_EXCLUDE.has(r.table_name) && IDENT.test(r.table_name) && IDENT.test(r.column_name))
    .map((r) => ({ table: r.table_name, column: r.column_name, json: r.data_type.startsWith("json") }));
}

/** Where does each URL appear? Exact matches in text columns, substring matches in json. */
async function scanRefs(db: pg.Client, urls: string[]): Promise<Map<string, { refs: Ref[]; jsonRefs: Ref[] }>> {
  const found = new Map<string, { refs: Ref[]; jsonRefs: Ref[] }>(urls.map((u) => [u, { refs: [], jsonRefs: [] }]));
  const host = new URL(publicBaseUrl).host;
  for (const col of await textColumns(db)) {
    if (!col.json) {
      const res = await db.query<{ v: string; n: number }>(
        `SELECT ${q(col.column)} AS v, count(*)::int AS n FROM ${q(col.table)} WHERE ${q(col.column)} = ANY($1) GROUP BY 1`,
        [urls]
      );
      for (const r of res.rows) found.get(r.v)?.refs.push({ table: col.table, column: col.column, rows: r.n });
    } else {
      const res = await db.query<{ v: string }>(
        `SELECT ${q(col.column)}::text AS v FROM ${q(col.table)} WHERE ${q(col.column)}::text LIKE $1`,
        [`%${host}%`]
      );
      for (const url of urls) {
        const n = res.rows.filter((r) => r.v.includes(url)).length;
        if (n > 0) found.get(url)?.jsonRefs.push({ table: col.table, column: col.column, rows: n });
      }
    }
  }
  return found;
}

// --- media --------------------------------------------------------------------

async function ffprobe(input: string): Promise<Probe> {
  const { stdout } = await run(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration,bit_rate:stream=codec_type,codec_name,width,height", "-of", "json", input],
    { maxBuffer: 1 << 20 }
  );
  const j = JSON.parse(stdout) as {
    format?: { duration?: string; bit_rate?: string };
    streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number }[];
  };
  const video = j.streams?.find((s) => s.codec_type === "video" && (s.width ?? 0) > 0);
  return {
    durationSec: Number(j.format?.duration ?? 0),
    bitRate: Number(j.format?.bit_rate ?? 0),
    width: video?.width,
    height: video?.height,
    videoCodec: video?.codec_name,
    hasAudio: Boolean(j.streams?.some((s) => s.codec_type === "audio")),
  };
}

async function download(key: string, dest: string): Promise<void> {
  mkdirSync(dirname(dest), { recursive: true });
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  await pipeline(res.Body as Readable, createWriteStream(dest));
}

// --- steps --------------------------------------------------------------------

async function plan(): Promise<void> {
  const items: Item[] = [];
  await withDb(async (db) => {
    for (const t of TARGETS) {
      const res = await db.query<{ url: string }>(
        `SELECT DISTINCT ${q(t.column)} AS url FROM ${q(t.table)} WHERE ${q(t.column)} IS NOT NULL`
      );
      for (const { url } of res.rows) {
        const key = keyFromUrl(url, publicBaseUrl);
        if (!key || !t.exts.includes(extOf(key))) continue;
        // One object, one item: a URL copied into a second target column (a
        // status clip reused as a banner) is encoded once, under the FIRST
        // target's profile — TARGETS order is the priority — and the reference
        // scan repoints every copy.
        if (items.some((i) => i.oldUrl === url)) continue;
        let oldBytes: number;
        try {
          oldBytes = (await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))).ContentLength ?? 0;
        } catch {
          items.push({ field: t.field, oldUrl: url, oldKey: key, oldBytes: 0, probe: { durationSec: 0, bitRate: 0, hasAudio: false }, status: "skipped", reason: "object missing in bucket" });
          continue;
        }
        // Probe over a short-lived presigned S3 URL: reads headers, not the whole
        // file, and never goes through (or bills) the CDN.
        const signed = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 600 });
        const probe = await ffprobe(signed);
        const d = decide(PROFILES[t.profile], probe);
        items.push({
          field: t.field,
          oldUrl: url,
          oldKey: key,
          oldBytes,
          probe,
          status: d.action === "encode" ? "planned" : "skipped",
          ...(d.action === "skip" ? { reason: d.reason } : {}),
        });
        out(`  ${d.action === "encode" ? "ENCODE" : "skip  "} ${mb(oldBytes).padStart(9)}  ${key}${d.action === "skip" ? `  (${d.reason})` : ""}`);
      }
    }
    const planned = items.filter((i) => i.status === "planned");
    out(`\nscanning every text/json column for references to ${planned.length} URLs…`);
    const refs = await scanRefs(db, planned.map((i) => i.oldUrl));
    for (const i of planned) Object.assign(i, refs.get(i.oldUrl));
  });
  save({ bucket, publicBaseUrl, createdAt: new Date().toISOString(), items });
  summary(items);
}

function summary(items: Item[]): void {
  const byField = new Map<string, { n: number; enc: number; bytes: number; encBytes: number; newBytes: number }>();
  for (const i of items) {
    const s = byField.get(i.field) ?? { n: 0, enc: 0, bytes: 0, encBytes: 0, newBytes: 0 };
    s.n++;
    s.bytes += i.oldBytes;
    if (i.status !== "skipped") {
      s.enc++;
      s.encBytes += i.oldBytes;
      s.newBytes += i.newBytes ?? 0;
    }
    byField.set(i.field, s);
  }
  out("\n== per column: objects · to re-encode · stored bytes → after (once encoded)");
  for (const [f, s] of byField) {
    const after = s.newBytes ? ` → ${mb(s.newBytes)}` : "";
    out(`  ${f.padEnd(48)} ${String(s.n).padStart(4)} · ${String(s.enc).padStart(4)} · ${mb(s.encBytes)}${after}`);
  }
  const refTables = new Map<string, number>();
  const jsonTables = new Map<string, number>();
  for (const i of items) {
    for (const r of i.refs ?? []) refTables.set(`${r.table}.${r.column}`, (refTables.get(`${r.table}.${r.column}`) ?? 0) + r.rows);
    for (const r of i.jsonRefs ?? []) jsonTables.set(`${r.table}.${r.column}`, (jsonTables.get(`${r.table}.${r.column}`) ?? 0) + r.rows);
  }
  out("\n== columns repoint will rewrite (exact match) · rows");
  for (const [k, n] of refTables) out(`  ${k.padEnd(48)} ${n}`);
  if (jsonTables.size) {
    out("\n== json columns that MENTION these URLs — NOT rewritten, review by hand");
    for (const [k, n] of jsonTables) out(`  ${k.padEnd(48)} ${n}`);
  }
  const counts = new Map<Status, number>();
  for (const i of items) counts.set(i.status, (counts.get(i.status) ?? 0) + 1);
  out(`\nstatus: ${[...counts].map(([k, v]) => `${k}=${v}`).join("  ")}   manifest: ${manifestPath}`);
}

async function encode(): Promise<void> {
  const m = load();
  const todo = m.items.filter((i) => i.status === "planned" && selected(i));
  let n = 0;
  for (const i of todo) {
    n++;
    const t = targetOf(i.field);
    const src = join(workdir, "src", i.oldKey);
    const newKey = i.newKey ?? mintKey(i.oldKey);
    const dest = join(workdir, "out", newKey);
    if (!existsSync(src)) await download(i.oldKey, src);
    mkdirSync(dirname(dest), { recursive: true });
    const started = Date.now();
    try {
      await run("ffmpeg", ffmpegArgs(PROFILES[t.profile], src, dest, i.probe), { maxBuffer: 1 << 24 });
    } catch (err) {
      Object.assign(i, { status: "skipped", reason: `ffmpeg failed: ${String(err).slice(0, 200)}` });
      save(m);
      rmSync(src, { force: true });
      out(`  [${n}/${todo.length}] FAILED ${i.oldKey}`);
      continue;
    }
    const newProbe = await ffprobe(dest);
    const newBytes = statSync(dest).size;
    const ok = acceptOutput(PROFILES[t.profile], i.probe, i.oldBytes, newProbe, newBytes);
    if (ok.action === "skip") {
      Object.assign(i, { status: "skipped", reason: ok.reason });
    } else {
      Object.assign(i, { status: "encoded", newKey, outFile: dest, newBytes, newProbe });
    }
    save(m);
    // The original can always be re-downloaded; keeping ~2 GB of them is what
    // filled the operator's disk on the first prod run.
    rmSync(src, { force: true });
    out(
      `  [${n}/${todo.length}] ${ok.action === "skip" ? `REJECTED (${ok.reason})` : `${mb(i.oldBytes)} → ${mb(newBytes)}`}  ${i.oldKey}  ${((Date.now() - started) / 1000).toFixed(0)}s`
    );
  }
  summary(m.items);
}

async function upload(): Promise<void> {
  requireConfirm();
  const uploadedBy = flag("uploaded-by");
  if (!uploadedBy || !/^[0-9a-f-]{36}$/.test(uploadedBy)) throw new Error("--uploaded-by <admin user uuid> is required");
  const m = load();
  await withDb(async (db) => {
    for (const i of m.items.filter((x) => x.status === "encoded" && selected(x))) {
      if (!i.newKey || !i.outFile || i.newBytes === undefined) continue;
      // Ledger the object under the field that owns its key prefix, not the
      // column that happened to reference it (a status clip reused as a banner
      // is still a status object).
      const [module, entity, field] = (ownerOf(i.newKey)?.field ?? i.field).split(".");
      const contentType = CONTENT_TYPE_BY_EXT[extOf(i.newKey)];
      if (!contentType) throw new Error(`no content type for ${i.newKey}`);
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: i.newKey,
          Body: createReadStream(i.outFile),
          ContentLength: i.newBytes,
          ContentType: contentType,
          CacheControl: IMMUTABLE_CACHE_CONTROL,
          // Never overwrite: a key that somehow exists is a bug, not a retry.
          IfNoneMatch: "*",
        })
      );
      await db.query(
        `INSERT INTO media_objects (id, key, content_type, size_bytes, module, entity, field, uploaded_by)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7) ON CONFLICT (key) DO NOTHING`,
        [i.newKey, contentType, i.newBytes, module, entity, field, uploadedBy]
      );
      Object.assign(i, { status: "uploaded", newUrl: `${publicBaseUrl}/${i.newKey}` });
      save(m);
      out(`  uploaded ${i.newKey} (${mb(i.newBytes)})`);
    }
  });
  summary(m.items);
}

async function repoint(): Promise<void> {
  const apply = has("apply");
  if (apply) requireConfirm();
  const m = load();
  const todo = m.items.filter((i) => i.status === "uploaded" && i.newUrl && selected(i));
  await withDb(async (db) => {
    // Re-scan now: rows may have changed since `plan`.
    const refs = await scanRefs(db, todo.map((i) => i.oldUrl));
    for (const i of todo) {
      const newUrl = i.newUrl as string;
      const found = refs.get(i.oldUrl) ?? { refs: [], jsonRefs: [] };
      const t = targetOf(i.field);
      if (!apply) {
        out(`  would repoint ${i.oldKey} → ${i.newKey}: ${found.refs.map((r) => `${r.table}.${r.column}×${r.rows}`).join(", ") || "no references left"}`);
        continue;
      }
      await db.query("BEGIN");
      try {
        const applied: NonNullable<Item["applied"]> = [];
        const previousSizes: NonNullable<Item["previousSizes"]> = [];
        if (t.sizeBytesColumn || t.durationMsColumn) {
          const prev = await db.query<{ id: string; s: string | null; d: number | null }>(
            `SELECT id::text AS id, ${t.sizeBytesColumn ? q(t.sizeBytesColumn) : "NULL"}::text AS s, ${t.durationMsColumn ? q(t.durationMsColumn) : "NULL"}::int AS d
               FROM ${q(t.table)} WHERE ${q(t.column)} = $1`,
            [i.oldUrl]
          );
          for (const r of prev.rows) previousSizes.push({ table: t.table, id: r.id, sizeBytes: r.s, durationMs: r.d });
        }
        for (const r of found.refs) {
          const res = await db.query(`UPDATE ${q(r.table)} SET ${q(r.column)} = $1 WHERE ${q(r.column)} = $2`, [newUrl, i.oldUrl]);
          applied.push({ table: r.table, column: r.column, rows: res.rowCount ?? 0 });
        }
        if (t.sizeBytesColumn) {
          await db.query(`UPDATE ${q(t.table)} SET ${q(t.sizeBytesColumn)} = $1 WHERE ${q(t.column)} = $2`, [i.newBytes, newUrl]);
        }
        if (t.durationMsColumn && i.newProbe) {
          await db.query(`UPDATE ${q(t.table)} SET ${q(t.durationMsColumn)} = $1 WHERE ${q(t.column)} = $2`, [
            Math.round(i.newProbe.durationSec * 1000),
            newUrl,
          ]);
        }
        await db.query("COMMIT");
        Object.assign(i, { status: "repointed", applied, previousSizes, jsonRefs: found.jsonRefs });
        save(m);
        out(`  repointed ${i.oldKey} → ${i.newKey}: ${applied.map((a) => `${a.table}.${a.column}×${a.rows}`).join(", ")}`);
      } catch (err) {
        await db.query("ROLLBACK");
        throw err;
      }
    }
  });
  if (!apply) out("\n(dry run — nothing written; add --apply --confirm <bucket> to write)");
  summary(m.items);
}

async function rollback(): Promise<void> {
  if (!has("apply")) throw new Error("rollback writes the database — pass --apply --confirm <bucket>");
  requireConfirm();
  const m = load();
  await withDb(async (db) => {
    for (const i of m.items.filter((x) => x.status === "repointed" && x.newUrl && selected(x))) {
      await db.query("BEGIN");
      try {
        for (const a of i.applied ?? []) {
          await db.query(`UPDATE ${q(a.table)} SET ${q(a.column)} = $1 WHERE ${q(a.column)} = $2`, [i.oldUrl, i.newUrl]);
        }
        const t = targetOf(i.field);
        for (const p of i.previousSizes ?? []) {
          if (t.sizeBytesColumn) await db.query(`UPDATE ${q(p.table)} SET ${q(t.sizeBytesColumn)} = $1 WHERE id::text = $2`, [p.sizeBytes, p.id]);
          if (t.durationMsColumn) await db.query(`UPDATE ${q(p.table)} SET ${q(t.durationMsColumn)} = $1 WHERE id::text = $2`, [p.durationMs, p.id]);
        }
        await db.query("COMMIT");
        Object.assign(i, { status: "rolled-back" });
        save(m);
        out(`  rolled back ${i.newKey} → ${i.oldKey}`);
      } catch (err) {
        await db.query("ROLLBACK");
        throw err;
      }
    }
  });
  summary(m.items);
}

const STEPS: Record<string, () => Promise<void>> = { plan, encode, upload, repoint, rollback };

async function main(): Promise<void> {
  const fn = step ? STEPS[step] : undefined;
  if (!fn) throw new Error(`usage: main.ts <${Object.keys(STEPS).join("|")}> [--workdir DIR] …`);
  if (only && !TARGETS.some((t) => t.field === only)) throw new Error(`--only ${only} is not a target field`);
  out(`${step}: bucket=${bucket} base=${publicBaseUrl} workdir=${workdir}${only ? ` only=${only}` : ""}`);
  await fn();
}

void main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    process.stderr.write(`${String(err instanceof Error ? err.stack : err)}\n`);
    process.exit(1);
  });
