#!/usr/bin/env -S npx tsx
/**
 * figma-export.ts — Prabhuji Figma asset pipeline (TAM-60).
 *
 * The single, reusable entry point every Phase-1 module ticket uses to pull the
 * EXACT icons/images out of the Prabhuji Figma file and commit them, plus a
 * provenance manifest proving each committed asset traces to a Figma node.
 *
 * It implements the REST + FIGMA_TOKEN fallback of the `figma-flutter` skill
 * (headless/CI-friendly): the same node ids the MCP path uses work here.
 *
 *   Auth  : X-Figma-Token from env (FIGMA_TOKEN). NEVER echoed, logged, or put
 *           on a command line. Read from process.env / repo .env only.
 *   Trees : GET /v1/files/{key}/nodes?ids=...   (geometry + child inventory)
 *   Images: GET /v1/images/{key}?ids=...&format=svg|png[&scale=N]
 *           → returns short-lived S3 URLs; we fetch the binary immediately.
 *
 * STRICT rule (TAM-56 decision 2): assets are DOWNLOADED from Figma, never
 * hand-generated. If an export path fails, the tool STOPS and surfaces the
 * blocker — it never substitutes a Material glyph or a placeholder.
 *
 * Usage (run with tsx, like the other repo scripts):
 *
 *   # Inspect a node subtree (geometry + child ids) — discovery step:
 *   npx tsx tools/figma-export.ts tree --ids 750:6252 --out scratch/nav.json
 *
 *   # Export icons (SVG, tinted at call site) into apps/mobile/assets/<module>/:
 *   npx tsx tools/figma-export.ts export --module nav --format svg \
 *     --ids '751:1=home,751:2=status'
 *
 *   # Export a raster reference frame PNG@2x anywhere (Phase-6 evidence):
 *   npx tsx tools/figma-export.ts export --format png --scale 2 \
 *     --out-dir specs/evidence/TAM-58/fidelity/figma-refs \
 *     --ids '750:6252=nav-shell' --no-manifest
 *
 * Flags:
 *   --file <key>     Figma file key (default: the Prabhuji Phase-1 file).
 *   --module <name>  Target module dir under apps/mobile/assets/<name>/.
 *   --ids <list>     Comma list of node ids, each optionally `id=filename`.
 *                    When filename is omitted the sanitized Figma node name is
 *                    used. Composite instance ids (I<inst>;<node>) are accepted.
 *   --format svg|png Asset format (default: svg — icons; png for raster art).
 *   --scale <n>      Raster scale for png (default: 2 → @2x).
 *   --out-dir <p>    Override output dir (repo-relative). Skips module layout.
 *   --no-manifest    Do not record entries in the provenance manifest
 *                    (use for throwaway evidence frame exports).
 *   --icon-plain     For each id, export the icon MASTER (segment after the last
 *                    ';' of a composite id) instead of the instance render.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS_ROOT = path.join(REPO_ROOT, 'apps', 'mobile', 'assets');
const MANIFEST_PATH = path.join(REPO_ROOT, 'tools', 'figma-assets.manifest.json');
const DEFAULT_FILE_KEY = 'ipSvV1FnmzvV8TK2Ig8Aiq';
const FIGMA_API = 'https://api.figma.com';

type Format = 'svg' | 'png';

interface ManifestEntry {
  asset: string; // repo-relative path of the committed file
  module: string;
  node: string; // Figma node id it was rendered from
  format: Format;
  fileKey: string;
  fetchedAt: string; // ISO date — URLs expire, so we record the fetch, not a URL
}

interface Manifest {
  fileKey: string;
  note: string;
  assets: ManifestEntry[];
}

// ---------------------------------------------------------------------------
// Token — read from env, then repo .env. NEVER printed.
// ---------------------------------------------------------------------------
async function loadToken(): Promise<string> {
  if (process.env.FIGMA_TOKEN && process.env.FIGMA_TOKEN.trim()) {
    return process.env.FIGMA_TOKEN.trim();
  }
  // Fallback: parse repo .env (never logged).
  try {
    const raw = await fs.readFile(path.join(REPO_ROOT, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*FIGMA_TOKEN\s*=\s*(.+)\s*$/);
      if (m) {
        return m[1].replace(/^["']|["']$/g, '').trim();
      }
    }
  } catch {
    // .env absent — fall through to the hard-blocker error.
  }
  fail(
    'FIGMA_TOKEN is not set (env or .env). It is a HARD blocker for asset export ' +
      '(TAM-56 Dependencies). Export a valid token and retry — the pipeline will ' +
      'NEVER hand-generate or substitute an asset to "unblock".',
  );
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function fail(msg: string): never {
  console.error(`\n[figma-export] ERROR: ${msg}\n`);
  process.exit(1);
}

function log(msg: string): void {
  console.log(`[figma-export] ${msg}`);
}

/** URL `285-3464` → canonical `285:3464`; validate NNN:NNN (composite ok). */
function normalizeId(raw: string): string {
  const id = raw.trim().replace(/-/g, ':');
  if (!/^I?\d+:\d+(;\d+:\d+)*$/.test(id)) {
    fail(`malformed node id "${raw}" — expected NNN:NNN (or composite I..;..).`);
  }
  return id;
}

/** Composite `I310:22;44:10` → icon master plain id `44:10`. */
function iconPlainId(id: string): string {
  const segs = id.replace(/^I/, '').split(';');
  return segs[segs.length - 1];
}

function sanitizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'asset';
}

async function figmaGet(url: string, token: string): Promise<Response> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { 'X-Figma-Token': token } });
    if (res.status === 429) {
      const wait = 2000 * (attempt + 1);
      log(`rate-limited (429); backing off ${wait}ms…`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    return res;
  }
  fail('repeated 429 rate-limits from Figma — aborting (no retry-storm).');
}

// ---------------------------------------------------------------------------
// arg parsing
// ---------------------------------------------------------------------------
interface Args {
  _: string[];
  [k: string]: string | boolean | string[];
}

function parseArgs(argv: string[]): Args {
  const args: Args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    } else {
      (args._ as string[]).push(a);
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// manifest
// ---------------------------------------------------------------------------
async function readManifest(fileKey: string): Promise<Manifest> {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, 'utf8');
    return JSON.parse(raw) as Manifest;
  } catch {
    return {
      fileKey,
      note:
        'Provenance for every Figma-exported asset committed under apps/mobile/assets/. ' +
        'Each entry proves the file was DOWNLOADED from the Figma node (never hand-drawn). ' +
        'Generated by tools/figma-export.ts (TAM-60). URLs are omitted deliberately — ' +
        'Figma image URLs expire (~30 days); re-export via the node id to refresh.',
      assets: [],
    };
  }
}

async function writeManifest(m: Manifest): Promise<void> {
  m.assets.sort((a, b) => a.asset.localeCompare(b.asset));
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(m, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// tree command — dump node subtree (geometry + child inventory)
// ---------------------------------------------------------------------------
async function cmdTree(args: Args): Promise<void> {
  const token = await loadToken();
  const fileKey = (args.file as string) || DEFAULT_FILE_KEY;
  const idsArg = args.ids as string;
  if (!idsArg) fail('tree requires --ids <a,b,c>');
  const ids = idsArg.split(',').map(normalizeId);

  const url = `${FIGMA_API}/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(ids.join(','))}`;
  const res = await figmaGet(url, token);
  if (!res.ok) {
    fail(`nodes request failed: HTTP ${res.status} ${res.statusText}`);
  }
  const json = await res.json();

  const outPath = args.out
    ? path.resolve(REPO_ROOT, args.out as string)
    : null;
  if (outPath) {
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(json, null, 2));
    log(`wrote node tree → ${path.relative(REPO_ROOT, outPath)}`);
  }

  // Print a compact child inventory so a human can pick icon ids.
  for (const id of ids) {
    const node = json.nodes?.[id]?.document;
    if (!node) {
      log(`node ${id}: NOT FOUND in response`);
      continue;
    }
    log(`node ${id} = "${node.name}" (${node.type})`);
    printInventory(node, 1);
  }
}

function printInventory(node: Record<string, unknown>, depth: number): void {
  const children = (node.children as Record<string, unknown>[]) || [];
  for (const c of children) {
    const bb = c.absoluteBoundingBox as { width?: number; height?: number } | undefined;
    const dims = bb ? `${Math.round(bb.width ?? 0)}×${Math.round(bb.height ?? 0)}` : '—';
    log(
      `${'  '.repeat(depth)}- ${c.id} "${c.name}" [${c.type}] ${dims}`,
    );
    if (depth < 3) printInventory(c, depth + 1);
  }
}

// ---------------------------------------------------------------------------
// export command — render + download assets
// ---------------------------------------------------------------------------
async function cmdExport(args: Args): Promise<void> {
  const token = await loadToken();
  const fileKey = (args.file as string) || DEFAULT_FILE_KEY;
  const format = ((args.format as string) || 'svg') as Format;
  if (format !== 'svg' && format !== 'png') fail(`--format must be svg or png (got "${format}")`);
  const scale = args.scale ? Number(args.scale) : 2;
  const module = (args.module as string) || '';
  const iconPlain = Boolean(args['icon-plain']);
  const noManifest = Boolean(args['no-manifest']);

  const idsArg = args.ids as string;
  if (!idsArg) fail('export requires --ids <id[=filename],...>');

  // Parse id[=filename] pairs.
  const requests = idsArg.split(',').map((chunk) => {
    const [rawId, name] = chunk.split('=');
    let id = normalizeId(rawId);
    if (iconPlain) id = iconPlainId(id);
    return { id, name: name?.trim() || null };
  });

  // Resolve output dir.
  let outDir: string;
  if (args['out-dir']) {
    outDir = path.resolve(REPO_ROOT, args['out-dir'] as string);
  } else {
    if (!module) fail('export requires --module <name> (or --out-dir <path>)');
    outDir = path.join(ASSETS_ROOT, module);
  }
  await fs.mkdir(outDir, { recursive: true });

  // If any request lacks a filename, fetch node names for those ids.
  const needNames = requests.some((r) => !r.name);
  const nameById: Record<string, string> = {};
  if (needNames) {
    const treeUrl = `${FIGMA_API}/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(
      requests.map((r) => r.id).join(','),
    )}`;
    const tr = await figmaGet(treeUrl, token);
    if (tr.ok) {
      const tj = await tr.json();
      for (const r of requests) {
        const n = tj.nodes?.[r.id]?.document;
        if (n?.name) nameById[r.id] = sanitizeName(n.name);
      }
    }
  }

  // Resolve render URLs (batched single call).
  const idList = requests.map((r) => r.id);
  let imgUrl = `${FIGMA_API}/v1/images/${fileKey}?ids=${encodeURIComponent(
    idList.join(','),
  )}&format=${format}`;
  if (format === 'png') imgUrl += `&scale=${scale}`;

  const res = await figmaGet(imgUrl, token);
  if (!res.ok) {
    fail(`images request failed: HTTP ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { err: string | null; images: Record<string, string | null> };
  if (body.err) fail(`Figma images error: ${body.err}`);

  const manifest = noManifest ? null : await readManifest(fileKey);
  const written: string[] = [];
  const failedNodes: string[] = [];

  for (const r of requests) {
    const renderUrl = body.images[r.id];
    if (!renderUrl) {
      // STRICT: an unrenderable node is a BLOCKER — never substitute.
      failedNodes.push(r.id);
      continue;
    }
    const bin = await fetch(renderUrl);
    if (!bin.ok) {
      failedNodes.push(r.id);
      continue;
    }
    const buf = Buffer.from(await bin.arrayBuffer());
    const base = r.name || nameById[r.id] || sanitizeName(r.id.replace(/[:;]/g, '-'));
    const filename = `${base}.${format}`;
    const filePath = path.join(outDir, filename);
    await fs.writeFile(filePath, buf);
    const rel = path.relative(REPO_ROOT, filePath);
    written.push(rel);
    log(`exported ${r.id} → ${rel} (${buf.length} bytes)`);

    if (manifest) {
      manifest.assets = manifest.assets.filter((e) => e.asset !== rel);
      manifest.assets.push({
        asset: rel,
        module: module || path.basename(outDir),
        node: r.id,
        format,
        fileKey,
        fetchedAt: new Date().toISOString().slice(0, 10),
      });
    }
  }

  if (manifest) await writeManifest(manifest);

  if (failedNodes.length > 0) {
    // Report every asset that could not be exported — DO NOT substitute.
    fail(
      `Figma returned NO render for ${failedNodes.length} node(s): ${failedNodes.join(', ')}. ` +
        'Per the STRICT gate these are BLOCKERS — do not substitute a Material glyph or ' +
        'placeholder. Verify the node id renders in Figma, or that the token has access.',
    );
  }

  log(`done: ${written.length} asset(s) written to ${path.relative(REPO_ROOT, outDir)}`);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cmd = (args._ as string[])[0];
  switch (cmd) {
    case 'tree':
      await cmdTree(args);
      break;
    case 'export':
      await cmdExport(args);
      break;
    default:
      fail(
        `unknown command "${cmd ?? ''}". Use: tree | export. See the header of ` +
          'tools/figma-export.ts or tools/README.md for usage.',
      );
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
