import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * Provider callback routes must never reach EITHER OpenAPI artifact.
 *
 * The failure this prevents is concrete and expensive to undo: the Dart
 * generator emits a model per schema in the document, so a callback route
 * appearing in `openapi.public.json` ships Decentro's payload shape — the
 * vendor's field names, our callback contract — inside every Android APK. That
 * is the same class of leak `filter-public-openapi.ts` exists to stop for
 * admin schemas, and it is unrecoverable once a build is out.
 *
 * They are excluded via `schema: { hide: true }` rather than the `admin` tag,
 * because the tag⇔path invariant hard-fails the build for an `admin`-tagged
 * route that is not under `/admin/`. `hide` is a `@fastify/swagger` behaviour
 * we do not control, so this asserts the OUTCOME against the committed
 * artifacts rather than trusting the mechanism.
 *
 * Reads the artifacts on disk, which `pnpm check:openapi` separately proves
 * are current. A drifted artifact fails that gate, not this one.
 */

const ROOT = join(import.meta.dirname, "../..");

interface Doc {
  paths: Record<string, unknown>;
  components?: { schemas?: Record<string, unknown> };
}

function load(name: string): Doc {
  return JSON.parse(readFileSync(join(ROOT, name), "utf8")) as Doc;
}

const ARTIFACTS = ["openapi.json", "openapi.public.json"] as const;

describe.each(ARTIFACTS)("%s", (artifact) => {
  const doc = load(artifact);
  const paths = Object.keys(doc.paths);

  test("contains no provider callback path", () => {
    const leaked = paths.filter(
      (p) => p.includes("/callbacks/") || p.includes("callback")
    );
    expect(leaked).toEqual([]);
  });

  test("contains no schema describing a provider callback payload", () => {
    // The route being hidden is not enough on its own — a named component
    // referenced only by a hidden route could still be emitted, and the Dart
    // generator would turn it into a model.
    const schemas = Object.keys(doc.components?.schemas ?? {});
    const leaked = schemas.filter((s) => /callback/i.test(s));
    expect(leaked).toEqual([]);
  });

  test("serialised bytes mention neither vendor callback field", () => {
    // Belt and braces: catches the payload shape arriving under a name this
    // test did not anticipate. `callback_txn_id` and `decentro_mandate_id` are
    // vendor wire names that exist nowhere in our public contract.
    const raw = readFileSync(join(ROOT, artifact), "utf8");
    expect(raw).not.toContain("callback_txn_id");
    expect(raw).not.toContain("decentro_mandate_id");
  });

  test("the user-facing payment routes ARE present", () => {
    // The other failure direction: over-broad exclusion silently dropping the
    // routes the mobile client is generated against would surface as a
    // missing Dart model, which looks nothing like its cause.
    expect(paths).toContain("/payment/mandate");
    expect(paths).toContain("/payment/mandate/cancel");
  });
});
