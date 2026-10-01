import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * The ONLY mechanical guard on TAM-256's warehouse-read exception (D-2
 * condition 2).
 *
 * `arch-boundaries.json` can express "`@clickhouse/client` only inside
 * `repositories/`" — and it does — but it CANNOT express "admin only". Nothing
 * in the build stops the next module adding a warehouse read behind a
 * mobile-facing route's repository, which is exactly the thing TAM-175's
 * Invariant 1 forbids and exactly how a scoped exception becomes the norm.
 *
 * So this test asserts the import graph directly: the warehouse repository is
 * reachable from ONE service, and that service is the admin-only performance
 * report. If a second importer appears, this fails and the reviewer has to
 * decide deliberately — which is the point. Widening the allowlist below is a
 * System Architect decision, not a test fix.
 */

const API_SRC = resolve(import.meta.dirname, "../../../..");

/** The file whose reach is being constrained. */
const GUARDED = "core/status/repositories/status.analytics.warehouse.repository";

/**
 * Who may import it. Deliberately tiny.
 *
 * - the status module's barrel, which is how the composition root reaches it;
 * - the composition root itself, which constructs it and closes its client;
 * - the one service that uses it;
 * - tests.
 */
const ALLOWED = [
  "core/status/repositories/index.ts",
  "core/status/index.ts",
  "core/status/services/status.performance.service.ts",
];

/** Drop block and line comments so prose about the rule is not read as a dependency. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (full.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("warehouse repository import graph (TAM-256 D-2 condition 2)", () => {
  test("only the admin performance service and its wiring may import it", () => {
    const offenders: string[] = [];

    for (const file of walk(API_SRC)) {
      const rel = relative(API_SRC, file).replaceAll("\\", "/");
      if (rel.includes("__tests__")) continue;
      if (rel.startsWith(GUARDED)) continue;

      // Comments are stripped first. Prose that NAMES the file — the two
      // invariants written on `deity-preference-warehouse.repository.ts`, this
      // test's own docblock — is documentation, not a dependency, and matching
      // it would punish explaining the rule.
      const source = stripComments(readFileSync(file, "utf8"));

      // Only real import/export-from statements count. `import type` counts
      // too: a type-only import cannot construct the client, but it still means
      // the module reached for this dependency, which is what needs reviewing.
      const importsIt =
        /(?:import|export)[^;]*from\s+["'][^"']*status\.analytics\.warehouse\.repository/.test(
          source,
        ) ||
        /(?:import|export)\s*(?:type\s*)?\{[^}]*StatusAnalyticsWarehouseRepository[^}]*\}\s*from/.test(
          source,
        );

      if (importsIt && !ALLOWED.includes(rel)) offenders.push(rel);
    }

    expect(
      offenders,
      `Unexpected importer(s) of the warehouse repository:\n  ${offenders.join("\n  ")}\n\n` +
        "The TAM-256 exception is admin-only. A public or mobile request path must read a " +
        "Postgres mirror instead (TAM-175 Invariant 1). If this import is genuinely admin-only, " +
        "it needs System Architect sign-off before the allowlist in this test is widened — see " +
        "patterns_library/api/warehouse-read-on-request-path.md.",
    ).toEqual([]);
  });

  test("the warehouse repository is never constructed at module load", () => {
    const source = readFileSync(
      join(API_SRC, `${GUARDED}.ts`),
      "utf8",
    );

    // Invariant 2: the serving API must boot with no ClickHouse configuration.
    // A top-level createClient() would make the import itself require creds.
    const topLevelClient = /^const\s+\w+\s*=\s*createClient\(/m.test(source);
    expect(
      topLevelClient,
      "createClient() must stay inside the lazy getter — a module-level client makes an " +
        "unconfigured API fail at import time instead of degrading the report.",
    ).toBe(false);
  });
});
