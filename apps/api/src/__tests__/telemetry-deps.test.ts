import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The preloaded telemetry SDK must resolve ONE `@opentelemetry/sdk-trace-base`.
 *
 * `@hyperdx/instrumentation-sentry-node@0.2.0` requires
 * `sdk-trace-base/build/src/enums`, which 2.9.0 no longer ships. With 2.7.1 and
 * 2.9.0 both in the graph, the runtime image resolved a different one build to
 * build; the 2.9.0 build threw at `node --import ./telemetry.js`, every api task
 * exited 1, ECS rolled the deployment back and every 30-minute billing tick died
 * at boot (prod, 6 Sep 2026). The pin lives in `pnpm-workspace.yaml`; this
 * asserts it is still in force in the lockfile, so a dependency bump that quietly
 * re-splits the graph fails `pnpm verify` instead of the next deploy.
 */
describe("telemetry SDK dependency graph", () => {
  const lock = readFileSync(resolve(__dirname, "../../../../pnpm-lock.yaml"), "utf8");

  test("exactly one @opentelemetry/sdk-trace-base version is resolved", () => {
    const versions = new Set(
      [...lock.matchAll(/^  '@opentelemetry\/sdk-trace-base@([^'(]+)/gm)].map((m) => m[1])
    );
    expect([...versions]).toEqual(["2.7.1"]);
  });

  test("the pin is recorded as an override, not an accident of resolution", () => {
    expect(lock).toMatch(/^overrides:\n(?:.*\n)*?  '@opentelemetry\/sdk-trace-base': 2\.7\.1$/m);
  });
});
