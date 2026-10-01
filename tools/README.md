# tools/

Repo-level dev tooling (run with `tsx`, like `scripts/*.ts`). Not part of any Nx
project — nothing here ships in a build.

## `figma-export.ts` — Figma asset pipeline (TAM-60)

The single, reusable way every Prabhuji Phase-1 module ticket pulls the EXACT
icons/images out of the Figma file and commits them, with a provenance manifest.
It implements the REST + `FIGMA_TOKEN` fallback of the `figma-flutter` skill, so
it runs headless/CI (no Figma Desktop needed).

### STRICT gate (TAM-56, product-owner mandate)

- **Every** icon/image is DOWNLOADED from Figma and committed. Hand-drawn or
  AI-generated art is forbidden.
- A design icon NEVER degrades to a Material `Icons.*` glyph. If an export path
  fails, the tool **stops and surfaces the blocker** — it never substitutes.
- Provenance lives in [`figma-assets.manifest.json`](./figma-assets.manifest.json):
  every committed asset → its Figma node id → module → fetch date. A reviewer
  confirms an asset's Figma origin from the manifest, not a promise.

### Auth

`FIGMA_TOKEN` is read from `process.env` first, then the repo `.env`. It is
**never** echoed, logged, or placed on a command line. It is a HARD blocker: with
no token the tool exits with a clear message and writes nothing.

    export FIGMA_TOKEN=…            # or put FIGMA_TOKEN=… in .env (gitignored)

### Node ids

From a Figma URL `…?node-id=285-3464` → canonical `285:3464`. Each module's ids
are listed authoritatively in `rough_plan/<module>/figma-links.md` — this tool
CONSUMES those, it never invents ids.

- **Icons** placed in a component instance have a **composite id**
  `I<frameInst>;…;<icon>` — the instance render (composite id) is what appears in
  the screen. `download`/REST accepts the composite id for `/v1/images`.
- Monochrome icons are exported once and **tinted at the call site** with the
  theme token (`ColorFilter.mode(navActive, srcIn)`), never the export's own fill.
- 2-tone icons (e.g. the nav Home badge + white om knockout) can't be tinted —
  export each state from Figma and render untinted.
- Multicolor raster icons (e.g. mandir-diya) → export **PNG@≥2x**, render as-is.

### Commands

Preferred: the `pnpm figma:export` script (uses the workspace `tsx`).

    # Discover a node subtree (geometry + child ids) — the inventory step:
    pnpm figma:export tree --ids 750:6252 --out scratch/nav.json

    # Export icons (SVG) into apps/mobile/assets/<module>/ + manifest:
    pnpm figma:export export --module nav --format svg \
      --ids 'I750:6252;750:5521;750:5912=status,I750:6252;750:5545;750:5912=books'

    # Export a raster icon / image (PNG@4x):
    pnpm figma:export export --module nav --format png --scale 4 \
      --ids 'I750:6252;750:5529;750:5912=mandir'

    # Export a reference FRAME PNG for Phase-6 evidence (no manifest entry):
    pnpm figma:export export --format png --scale 3 --no-manifest \
      --out-dir specs/evidence/TAM-58/fidelity/figma-refs --ids '750:6252=nav-frame'

> Direct invocation also works: `./node_modules/.bin/tsx tools/figma-export.ts …`.
> Avoid bare `npx tsx` — it can resolve a different tsx and error with "Class
> extends value undefined".

### Flags

| Flag | Meaning |
| --- | --- |
| `--file <key>` | Figma file key (default: the Prabhuji Phase-1 file `ipSvV1FnmzvV8TK2Ig8Aiq`). |
| `--module <name>` | Output dir `apps/mobile/assets/<name>/` + manifest `module`. |
| `--ids <list>` | Comma list; each `id` or `id=filename`. Composite ids accepted. |
| `--format svg\|png` | Default `svg` (icons); `png` for raster art. |
| `--scale <n>` | PNG scale (default 2 → @2x; use 4 for small icons). |
| `--out-dir <p>` | Override output dir (repo-relative) — skips the module layout. |
| `--no-manifest` | Don't record entries (use for throwaway evidence exports). |
| `--icon-plain` | Export the icon MASTER (segment after the last `;`) instead of the instance. |

### After exporting

1. **Read every exported PNG before wiring it** (dimmed master-component exports
   are a known trap). SVGs: check the fills (`grep -o 'fill="[^"]*"'`).
2. Register the new `assets/<module>/` dir in `apps/mobile/pubspec.yaml` (once).
3. Wire with the Phase-5 recipes in `.claude/skills/figma-flutter/references/translation.md`.
4. Run the fidelity harness — see [`docs/FIDELITY-CROSSCHECK.md`](../docs/FIDELITY-CROSSCHECK.md).

## Chatbot agent tools (Python)

Python 3 standard library only; they talk to RAGFlow with `RAGFLOW_BASE_URL` /
`RAGFLOW_API_KEY`.

| Folder | What it does |
| --- | --- |
| [`content-agent-retrieval/`](./content-agent-retrieval/README.md) | Builds, inspects and tests the content chat agent (TAM-263) |
| [`companion-agent/`](./companion-agent/README.md) | Shared RAGFlow helpers, plus the experimental companion agent |
| [`kuldevta-console/`](./kuldevta-console/README.md) | Local web console to chat with the kuldevta persona on stage |
