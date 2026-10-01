import { readFileSync } from "node:fs";
import { buildOpenapiArtifacts } from "./openapi-artifacts.js";

function readCommitted(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  // TAM-85: BOTH docs are generated artifacts, so BOTH are drift-gated. A
  // generated artifact that is not gated is a lie waiting to happen.
  // `buildOpenapiArtifacts` also enforces the tag⇔path invariant and the public
  // doc's self-consistency, so this gate fails on a mis-tagged admin route too.
  const artifacts = await buildOpenapiArtifacts();
  const stale = artifacts.filter(({ path, json }) => readCommitted(path) !== json);
  if (stale.length > 0) {
    const names = stale.map(({ path }) => path).join(", ");
    process.stderr.write(`${names} ${stale.length > 1 ? "are" : "is"} stale — run \`pnpm openapi:emit\` and commit\n`);
    process.exit(1);
  }
  process.stdout.write(`${artifacts.map(({ path }) => path).join(" + ")} are up to date\n`);
}
void main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    process.stderr.write(`${String(err instanceof Error ? err.stack : err)}\n`);
    process.exit(1);
  });
