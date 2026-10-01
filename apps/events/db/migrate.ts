/* eslint-disable no-console */
// ClickHouse migration runner — owned, no hosted tooling (TAM-16).
//
// Prisma-style workflow on plain SQL:
//   migrations/*.sql  — ordered, hand-authored, immutable once applied (sha-256
//                       checksums recorded in a _migrations table per database)
//   schema.sql        — DUMPED from the live schema after `migrate` (local) and
//                       verified by `check` (CI: fresh apply → dump → diff)
//
// Commands (run via nx targets or `pnpm tsx apps/events/db/migrate.ts …`):
//   migrate [--env local|staging|prod]   create db if missing, apply pending, dump (local)
//   status  [--env …]                    applied / pending per migration
//   check                                fresh throwaway db: apply ALL, dump, diff vs schema.sql
//   create <name>                        scaffold migrations/<UTC-ts>_<name>.sql
//
// Env model: selected by --env or $CLICKHOUSE_ENV (default local). local = compose
// container (http://localhost:8123, db `analytics`) — bring it up yourself first
// (docker compose up -d clickhouse). staging/prod = ClickHouse Cloud
// (https://CLICKHOUSE_HOST:8443, db `staging`/`prod`), credentials ONLY from
// CLICKHOUSE_HOST / CLICKHOUSE_USER / CLICKHOUSE_PASSWORD.
// Statement convention: each statement ends with `;` at end of line.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient, type ClickHouseClient } from "@clickhouse/client";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, "migrations");
const SCHEMA_FILE = join(HERE, "schema.sql");

interface Target {
  url: string;
  username: string;
  password: string;
  database: string;
}

function resolveTarget(env: string): Target {
  let target: Target;
  if (env === "local" || env === "check") {
    const port = process.env.CLICKHOUSE_HTTP_PORT ?? "8123";
    target = {
      url: `http://localhost:${port}`,
      // single-sourced with docker-compose.yml via the same env var + default
      username: "default",
      password: process.env.CLICKHOUSE_LOCAL_PASSWORD ?? "local-dev-only",
      database: env === "check" ? "analytics_check" : "analytics",
    };
  } else if (env === "staging" || env === "prod") {
    const host = process.env.CLICKHOUSE_HOST;
    const password = process.env.CLICKHOUSE_PASSWORD;
    if (!host || !password) {
      console.error(`✗ ${env} needs CLICKHOUSE_HOST and CLICKHOUSE_PASSWORD (and optionally CLICKHOUSE_USER) in the environment`);
      process.exit(1);
    }
    target = {
      url: `https://${host}:${process.env.CLICKHOUSE_PORT ?? "8443"}`,
      username: process.env.CLICKHOUSE_USER ?? "default",
      password,
      database: env,
    };
  } else {
    console.error(`✗ unknown env "${env}" (local | staging | prod)`);
    process.exit(1);
  }
  assertSafeIdentifier(target.database);
  return target;
}

// Escape a value for inclusion inside a single-quoted ClickHouse string
// literal (dictionary SOURCE credentials) — backslash first, then quote.
function sqlStringLiteral(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

// Database names are spliced into DDL as identifiers — ours are fixed
// (analytics | analytics_check | staging | prod), so a strict allowlist shape.
function assertSafeIdentifier(name: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    console.error(`✗ unsafe database identifier "${name}"`);
    process.exit(1);
  }
}

function client(t: Target, database?: string): ClickHouseClient {
  return createClient({
    url: t.url,
    username: t.username,
    password: t.password,
    database: database ?? t.database,
    clickhouse_settings: { allow_experimental_json_type: 1 }, // no-op on ≥25.3 where JSON is GA
  });
}

interface MigrationFile {
  version: string; // leading timestamp, e.g. 20260707120000
  name: string; // full filename
  checksum: string;
  statements: string[];
}

function loadMigrations(): MigrationFile[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  return files.map((name) => {
    const version = name.split("_")[0];
    if (!/^\d{14}$/.test(version)) {
      console.error(`✗ migration "${name}" must be named <YYYYMMDDhhmmss>_<slug>.sql`);
      process.exit(1);
    }
    const content = readFileSync(join(MIGRATIONS_DIR, name), "utf8");
    const statements = content
      .split(/;\s*$\n?/m) // convention: statements end with `;` at end of line
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.split("\n").every((line) => line.trim() === "" || line.trim().startsWith("--")));
    return { version, name, checksum: createHash("sha256").update(content).digest("hex"), statements };
  });
}

async function ensureDatabase(t: Target): Promise<void> {
  const admin = client(t, "default");
  await admin.command({ query: `CREATE DATABASE IF NOT EXISTS ${t.database}` });
  await admin.close();
}

async function ensureLedger(ch: ClickHouseClient): Promise<void> {
  await ch.command({
    query: `CREATE TABLE IF NOT EXISTS _migrations (
      version String, name String, checksum String, applied_at DateTime DEFAULT now()
    ) ENGINE = MergeTree ORDER BY version`,
  });
}

async function appliedMigrations(ch: ClickHouseClient): Promise<Map<string, string>> {
  const rs = await ch.query({
    query: `SELECT version, checksum FROM _migrations ORDER BY version`,
    format: "JSONEachRow",
  });
  const rows = await rs.json<{ version: string; checksum: string }>();
  return new Map(rows.map((r) => [r.version, r.checksum]));
}

/** Fail hard if any applied migration's file was edited afterwards. */
function verifyChecksums(files: MigrationFile[], applied: Map<string, string>): void {
  for (const f of files) {
    const recorded = applied.get(f.version);
    if (recorded !== undefined && recorded !== f.checksum) {
      console.error(`✗ ${f.name} was EDITED after being applied (checksum mismatch).`);
      console.error("  Applied migrations are immutable — add a new migration instead.");
      process.exit(1);
    }
  }
}

async function apply(t: Target, opts: { quiet?: boolean } = {}): Promise<number> {
  await ensureDatabase(t);
  const ch = client(t);
  await ensureLedger(ch);
  const files = loadMigrations();
  const applied = await appliedMigrations(ch);
  verifyChecksums(files, applied);

  let ran = 0;
  for (const f of files) {
    if (applied.has(f.version)) continue;
    if (!opts.quiet) console.log(`==> applying ${f.name} (${f.statements.length} statements)`);
    for (const statement of f.statements) {
      // Per-env placeholders (checksums are computed on the RAW file, so they
      // stay env-independent). Needed by DICTIONARY sources, which must embed
      // the database name + credentials — SHOW CREATE masks the password.
      // __DATABASE__ is an identifier (validated in resolveTarget); user and
      // password are spliced into single-quoted literals, so escape them.
      const query = statement
        .replaceAll("__DATABASE__", t.database)
        .replaceAll("__USER__", sqlStringLiteral(t.username))
        .replaceAll("__PASSWORD__", sqlStringLiteral(t.password));
      await ch.command({ query });
    }
    await ch.insert({
      table: "_migrations",
      values: [{ version: f.version, name: f.name, checksum: f.checksum }],
      format: "JSONEachRow",
    });
    ran += 1;
  }
  await ch.close();
  return ran;
}

/** SHOW CREATE for every object (tables + MVs), db-prefix stripped so dumps compare across dbs. */
async function dumpSchema(t: Target): Promise<string> {
  const ch = client(t);
  const rs = await ch.query({
    query: `SELECT name, engine FROM system.tables
            WHERE database = {db:String} AND name != '_migrations' AND NOT startsWith(name, '.')
            ORDER BY name`,
    query_params: { db: t.database },
    format: "JSONEachRow",
  });
  const tables = await rs.json<{ name: string; engine: string }>();
  const parts: string[] = [
    "-- GENERATED by apps/events/db/migrate.ts — do not edit by hand.",
    "-- Current schema as applied by migrations/ (CI verifies this file matches a fresh apply).",
    "",
  ];
  for (const { name, engine } of tables) {
    const show = await ch.query({
      query: `SHOW CREATE ${engine === "Dictionary" ? "DICTIONARY" : "TABLE"} ${t.database}.\`${name}\``,
      format: "JSONEachRow",
    });
    const [row] = await show.json<{ statement: string }>();
    const cleaned = row.statement
      .replaceAll(`${t.database}.\`${name}\``, `\`${name}\``)
      .replaceAll(`\`${t.database}\`.`, "")
      .replaceAll(`${t.database}.`, "");
    parts.push(`${cleaned};`, "");
  }
  await ch.close();
  return parts.join("\n");
}

async function dropDatabase(t: Target): Promise<void> {
  const admin = client(t, "default");
  await admin.command({ query: `DROP DATABASE IF EXISTS ${t.database}` });
  await admin.close();
}

// Env selection precedence: --env flag > $CLICKHOUSE_ENV > local. The nx targets
// pass no flag and rely on CLICKHOUSE_ENV (unset = local); CI/Cloud sets it.
function argEnv(): string {
  const i = process.argv.indexOf("--env");
  if (i !== -1) return process.argv[i + 1];
  return process.env.CLICKHOUSE_ENV ?? "local";
}

const command = process.argv[2];

switch (command) {
  case "migrate": {
    const env = argEnv();
    const t = resolveTarget(env);
    const ran = await apply(t);
    console.log(ran === 0 ? "✅ up to date (nothing to apply)" : `✅ applied ${ran} migration(s) to ${env}/${t.database}`);
    if (env === "local") {
      writeFileSync(SCHEMA_FILE, await dumpSchema(t));
      console.log("==> schema.sql refreshed from the live schema");
    }
    break;
  }

  case "status": {
    const t = resolveTarget(argEnv());
    await ensureDatabase(t);
    const ch = client(t);
    await ensureLedger(ch);
    const applied = await appliedMigrations(ch);
    const files = loadMigrations();
    verifyChecksums(files, applied);
    for (const f of files) console.log(`${applied.has(f.version) ? "✅ applied" : "⏳ pending"}  ${f.name}`);
    const stray = [...applied.keys()].filter((v) => !files.some((f) => f.version === v));
    for (const v of stray) console.log(`⚠️  applied on server but missing locally: ${v}`);
    await ch.close();
    break;
  }

  // CI drift gate: every migration must apply cleanly to a FRESH database, and
  // the resulting schema must equal the committed schema.sql.
  case "check": {
    const t = resolveTarget("check");
    await dropDatabase(t);
    await apply(t, { quiet: true });
    const fresh = await dumpSchema(t);
    await dropDatabase(t);
    const committed = readFileSync(SCHEMA_FILE, "utf8");
    if (fresh !== committed) {
      console.error("✗ schema.sql does not match a fresh apply of migrations/.");
      console.error("  Run `pnpm nx run events:migrate` locally and commit the updated schema.sql.");
      const freshLines = fresh.split("\n");
      const committedLines = committed.split("\n");
      for (let i = 0; i < Math.max(freshLines.length, committedLines.length); i++) {
        if (freshLines[i] !== committedLines[i]) {
          console.error(`  first difference at line ${i + 1}:`);
          console.error(`    fresh:     ${freshLines[i] ?? "<missing>"}`);
          console.error(`    committed: ${committedLines[i] ?? "<missing>"}`);
          break;
        }
      }
      process.exit(1);
    }
    console.log("✅ check passed: migrations apply cleanly and schema.sql is current");
    break;
  }

  case "create": {
    const slug = process.argv[3];
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
      console.error("✗ usage: migrate.ts create <kebab-case-name>");
      process.exit(1);
    }
    const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    mkdirSync(MIGRATIONS_DIR, { recursive: true });
    const file = join(MIGRATIONS_DIR, `${ts}_${slug.replaceAll("-", "_")}.sql`);
    writeFileSync(file, `-- ${slug}\n-- Statements end with \`;\` at end of line. Applied migrations are immutable.\n`);
    console.log(`==> created ${file}`);
    break;
  }

  default:
    console.error("usage: migrate.ts <migrate|status|check|create> [--env local|staging|prod]");
    process.exit(1);
}
