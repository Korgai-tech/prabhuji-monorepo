#!/usr/bin/env node
/**
 * Gate: `subscription.getStatus` may be called from exactly one directory.
 *
 * `computeIsEntitled` has always been the single entitlement RULE. What drifted
 * was the way to REACH it. Three call sites read the facade directly, and ended
 * up with three different failure behaviours — not by decision, but by whichever
 * file each was copied from: two threw, one failed closed, and nothing recorded
 * which was correct where. Failing the wrong way in the wrong place is not a
 * style issue: fail-closed inside `MandateService.createMandate` retires a
 * paying subscriber's live mandate and mints a second one.
 *
 * So the read is confined to `shared/entitlement/`, which exposes three wrappers
 * whose failure policy is in the name. Picking one becomes a deliberate act.
 *
 * Nothing else catches a fourth call site. `pnpm check:arch-boundaries` cannot:
 * every one of these is a legal `shared/` import from a core module. Typecheck
 * and lint see a perfectly ordinary function call. Hence a dedicated gate.
 *
 * Cheap enough for `pnpm verify`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const API_SRC = "apps/api/src";
/** The one directory allowed to make the call. */
const SANCTUARY = join("apps", "api", "src", "shared", "entitlement");

/**
 * `performServiceCall("subscription", …)` reaching `getStatus`.
 *
 * Bounded rather than greedy so a single call site cannot span two unrelated
 * blocks and produce a false positive; 200 characters comfortably covers the
 * multi-line formatting Prettier produces for these.
 */
const CALL = /performServiceCall\(\s*["']subscription["'][\s\S]{0,200}?getStatus/g;

/**
 * The WRITE facade methods are deliberately unrestricted — they are transitions,
 * not entitlement reads, and confining them would say nothing useful.
 */
function* walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.tsx?$/.test(p)) yield p;
  }
}

const offenders = [];
let sanctuarySites = 0;

for (const file of walk(API_SRC)) {
  const matches = [...readFileSync(file, "utf8").matchAll(CALL)];
  if (matches.length === 0) continue;
  if (file.startsWith(SANCTUARY)) {
    sanctuarySites += matches.length;
    continue;
  }
  offenders.push({ file, count: matches.length });
}

// Self-check, mirroring check-media-targets.mjs: if the pattern stops matching
// the sanctioned call (a rename, a reformat), this gate would silently pass
// forever while enforcing nothing. An empty sanctuary means the gate is broken,
// not that the codebase is clean.
if (sanctuarySites === 0) {
  console.error(
    `✖ found 0 sanctioned getStatus calls in ${SANCTUARY} — the gate would pass vacuously.\n` +
      `  Either the call moved, or the regex no longer matches it. Fix this script.`
  );
  process.exit(1);
}

if (offenders.length > 0) {
  console.error("✖ subscription.getStatus called outside shared/entitlement/:\n");
  for (const { file, count } of offenders) {
    console.error(`  ${file} (${count} call${count === 1 ? "" : "s"})`);
  }
  console.error(
    "\n  Use one of the wrappers instead — the name states the failure policy:\n" +
      "    resolveProEntitlement(userId, ctx)   false on failure   (content reads)\n" +
      "    requireProEntitlement(userId, ctx)   throws             (money decisions)\n" +
      "    readSubscriptionStatus(userId, ctx)  throws             (needs the full row)\n"
  );
  process.exit(1);
}

console.log(
  `✅ subscription.getStatus confined to shared/entitlement/ (${sanctuarySites} call site${sanctuarySites === 1 ? "" : "s"})`
);
