#!/usr/bin/env node
/**
 * Gate: every media target the admin SPA names must exist in the api's allowlist.
 *
 * The presign body carries a (module, entity, field) triple that the server looks
 * up in `media.allowlist.ts`. An unknown triple fails closed with 400 "unknown
 * media target" — correct, but only discoverable by a human clicking Upload in
 * that exact form. Nothing else catches it: the triple is three plain strings, so
 * typecheck, lint and the OpenAPI drift gate are all blind to it.
 *
 * They drifted. `entity` is the camelCase MODEL name (`homeBanner`), but it gets
 * kebab-cased into the S3 KEY PATH (`home/home-banner/…`) — and the kebab form is
 * what people saw, so five features shipped kebab entities and 400'd on every
 * upload: home banners, home feed items, horoscope media assets, zodiac signs and
 * status items. A wrong JSDoc example (`entity: 'aarti'`) seeded it.
 *
 * This compares both directions and is cheap enough to run in `pnpm verify`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ALLOWLIST = "apps/api/src/core/media/media.allowlist.ts";
const ADMIN_SRC = "apps/admin/src";
const MIRROR = "apps/admin/src/components/media/media-constraints.ts";

const server = new Set(
  [...readFileSync(ALLOWLIST, "utf8").matchAll(/"([a-zA-Z]+\.[a-zA-Z]+\.[a-zA-Z]+)":/g)].map((m) => m[1])
);
if (server.size === 0) {
  console.error(`✖ parsed 0 triples from ${ALLOWLIST} — the gate would pass vacuously`);
  process.exit(1);
}

function* walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.tsx?$/.test(p)) yield p;
  }
}

const problems = [];
let sites = 0;

for (const file of walk(ADMIN_SRC)) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/mediaField\(\s*\{/g)) {
    // brace-match the config object
    const start = src.indexOf("{", m.index);
    let depth = 0, end = start;
    for (let i = start; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) { end = i; break; }
    }
    const body = src.slice(start, end + 1);
    const get = (k) => body.match(new RegExp(`${k}\\s*:\\s*['"]([^'"]+)['"]`))?.[1];
    const [module, entity, field] = [get("module"), get("entity"), get("field")];
    if (!module || !entity || !field) continue; // computed at runtime — can't check statically
    sites++;
    const triple = `${module}.${entity}.${field}`;
    if (!server.has(triple)) {
      const line = src.slice(0, start).split("\n").length;
      problems.push(`${file}:${line}  mediaField sends "${triple}" — not in the api allowlist (presign 400s)`);
    }
  }
}

for (const m of readFileSync(MIRROR, "utf8").matchAll(/'([a-z]+\/[a-zA-Z]+\/[a-zA-Z]+)'/g)) {
  const triple = m[1].replaceAll("/", ".");
  if (!server.has(triple)) {
    problems.push(`${MIRROR}  mirror lists "${m[1]}" — not in the api allowlist`);
  }
}

if (problems.length) {
  console.error(`✖ media targets out of sync with ${ALLOWLIST}:\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error(`\n  \`entity\` is the camelCase MODEL name (homeBanner, statusItem, audioItem) —`);
  console.error(`  NOT the kebab-cased S3 key path (home/home-banner/...).`);
  console.error(`  The allowlist is the source of truth; fix the caller, not the allowlist.\n`);
  process.exit(1);
}

console.log(`✔ media targets: ${sites} admin call sites match the api allowlist (${server.size} triples)`);
