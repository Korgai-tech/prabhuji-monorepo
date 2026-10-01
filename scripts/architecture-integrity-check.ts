import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

interface Rule {
  layer: string;
  match: string;
  forbid: string[];
  allowTypeOnly?: string[];
}
interface Config {
  root: string;
  rules: Rule[];
}

// Multi-root: `{configs: [{root, rules}, ...]}`; the legacy single
// `{root, rules}` shape is still accepted.
const raw = JSON.parse(readFileSync("arch-boundaries.json", "utf8")) as
  | Config
  | { configs: Config[] };
const configs: Config[] = "configs" in raw ? raw.configs : [raw];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".ts") && !full.includes("__tests__")) out.push(full);
  }
  return out;
}

// Matches static imports: `import "x"`, `import type Foo from "x"`, `import { a } from "x"`, etc.
const importRe = /^\s*import\s+(type\s+)?[^'"]*['"]([^'"]+)['"]/gm;
// Matches re-exports: `export * from "x"`, `export { a, b } from "x"`, `export type { a } from "x"`.
const exportFromRe = /^\s*export\s+(type\s+)?(?:\*|\{[^}]*\})\s*from\s*['"]([^'"]+)['"]/gm;
// Matches dynamic imports: `import("x")`. Always treated as a value (non-type-only) import.
const dynamicImportRe = /import\s*\(\s*['"]([^'"]+)['"]/gm;

// Known limitations: inline type specifiers (`import { type Foo, bar } from "x"`) are treated
// as value imports because isTypeOnly only reflects the `import type` / `export type` prefix,
// not per-specifier `type` markers. This is over-restrictive (may flag an import that is
// actually all-type-only via inline markers), not a bypass, so it is left as-is for simplicity.

const violations: string[] = [];

function checkMatch(file: string, rule: Rule, spec: string, isTypeOnly: boolean): void {
  for (const bad of rule.forbid) {
    if (spec.includes(bad)) {
      if (isTypeOnly && rule.allowTypeOnly?.some((a) => spec.includes(a))) continue;
      violations.push(`${file}: [${rule.layer}] forbidden import of "${spec}"`);
    }
  }
}

for (const config of configs) {
  for (const file of walk(config.root)) {
    const src = readFileSync(file, "utf8");
    for (const rule of config.rules) {
      if (!file.includes(rule.match)) continue;

      let m: RegExpExecArray | null;

      importRe.lastIndex = 0;
      while ((m = importRe.exec(src)) !== null) {
        checkMatch(file, rule, m[2], Boolean(m[1]));
      }

      exportFromRe.lastIndex = 0;
      while ((m = exportFromRe.exec(src)) !== null) {
        checkMatch(file, rule, m[2], Boolean(m[1]));
      }

      dynamicImportRe.lastIndex = 0;
      while ((m = dynamicImportRe.exec(src)) !== null) {
        checkMatch(file, rule, m[1], false);
      }
    }
  }
}

if (violations.length > 0) {
  console.error("❌ Architecture boundary violations:");
  for (const v of violations) console.error("  " + v);
  process.exit(1);
}
console.log("✅ No architecture boundary violations");
