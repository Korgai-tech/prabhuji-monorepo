import { writeFileSync } from "node:fs";
import { buildOpenapiArtifacts } from "./openapi-artifacts.js";

async function main(): Promise<void> {
  // TAM-85: one pass emits BOTH docs — the full contract (api-client/admin SPA)
  // and the filtered public one (Dart codegen). Emitting them together is what
  // keeps them from ever describing different builds of the app.
  for (const artifact of await buildOpenapiArtifacts()) {
    writeFileSync(artifact.path, artifact.json);
    process.stdout.write(`wrote ${artifact.path}\n`);
  }
}
void main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    process.stderr.write(`${String(err instanceof Error ? err.stack : err)}\n`);
    process.exit(1);
  });
