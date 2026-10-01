# AI build log — Prabhuji Phase-1 (TAM-56) + admin CMS (TAM-81)

Record of the Claude Code session that built the 8 Phase-1 feature modules (epic `specs/TAM-56-prabhuji-phase1-modules-epic.md`) and then the admin CMS, content-model correction and label localization (epic `specs/TAM-81-admin-cms-epic.md`), 2026-07-14 → 2026-07-17.

One continuous session (`994dc1f9-…`) covers both epics; this artifact is the whole thing.

## Contents

| File | What it is |
|---|---|
| `session-transcript.jsonl.gz` | The full orchestrator session transcript (JSONL, gzipped). Every decision, every subagent's final report, every verification command + output. |

**Secrets are redacted.** Every `.env` value of length ≥12 (`DATABASE_URL`, `JWT_SECRET`, `AUTH_OTP_PEPPER`, `REDIS_URL`, `MEDIA_BUCKET`, `MEDIA_PUBLIC_BASE_URL`, `FIGMA_TOKEN`, …) plus generic shapes — `figd_*`, `postgres://user:pass@`, JWTs, `AKIA…`/`ASIA…`, `gh[pousr]_*`, PEM private keys — are replaced with `<REDACTED:KEY>` markers. Verified mechanically: **0 occurrences of any `.env` secret remain** in the artifact.

**Not included:** the raw subagent transcripts (~120 MB). They would bloat every future clone permanently, and each subagent's *final report* is already embedded in the session transcript. They live outside the repo under `~/.claude/projects/-home-ubuntu-code-prabhuji-monorepo/<session-id>/` for as long as that directory survives.

Read it with:

```bash
gunzip -c docs/ai-build-log/session-transcript.jsonl.gz \
  | jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="text") | .text' | less
```

### One repaired record (known, deliberate)

The live transcript is appended to by concurrent writers (the parallel subagents). That left **one** record truncated mid-write with unbalanced braces — malformed JSON. `jq` aborts on the first parse error, so that single bad line made the *remaining ~4,600 records unreadable* via the command above.

It is therefore replaced with a valid marker record so the file is 100% parseable:

```json
{"type":"_corrupt_record","note":"…unrecoverable…","originalLength":1956}
```

Find it with `… | jq 'select(.type=="_corrupt_record")'`. Exactly one record was affected; nothing else was altered, dropped, or reordered.

## How the build was run

**Workflow:** in-repo spec tickets (TAM-57 → TAM-78, then TAM-82 → TAM-120), each with its own AC/DoD and evidence. Work was delegated to specialist subagents (`be-developer`, `fe-developer`, `qas`, `bsa`, `system-architect`); the orchestrator reviewed each diff and committed **by path** so parallel tracks never mixed.

**Parallelism:** disjoint file trees ran concurrently (`apps/api` vs `apps/mobile`; then one agent per admin module). Schema migrations were kept strictly serial — one database, one `schema.prisma`.

## Product mandates and how they were enforced

1. **"Nothing invented — everything from Figma, pixel-perfect."** Every asset is exported from Figma via `tools/figma-export.ts` and traced to its node in `tools/figma-assets.manifest.json`. Enforced in CI by `check:figma-tokens-committed` + `check:no-hex-literals`. (Explicitly **not** applied to the admin CMS — there is no Figma file for it.)
2. **"All data dynamic — no static data except icons."** A static-data audit found 7 violations; all fixed. The one deliberate hardcoded map is the destinations allowlist — it is what stops an untrusted CMS string becoming an arbitrary deep link.
3. **"Pro-gating."** Server-side and fail-closed everywhere.
4. **"One deity per asset; many languages."** Migrated additively across six modules (TAM-108).
5. **"Localize the labels too."** Per-entity translation tables + a shared resolver; translations ride in the entity's own create/update body (no sub-resource), on the language param the app already sends.

## What the gates actually caught

Real defects found by machine checks rather than review:

- Home carousel dots centred where Figma pins them bottom-right — **132px off**.
- The deity chip's "active" state had been **invented**; replaced with the real Figma variant.
- Generated `fromJson` force-unwraps enums: one unknown CMS `contentType` would have **blacked out the Books tab**.
- An OpenAPI integer `enum` silently produced an unusable Dart class, breaking `mobile:generate`.
- 9 analytics defects, including 3 events defined but never fired.
- `placehold.co` seeds served `image/svg+xml`, which Flutter's `Image.network` cannot decode.
- **The admin E2E caught a live security hole**: the deity write path was still a no-op TODO, so a `POST` with an external `iconUrl` was accepted (201). Now wired to `validateOwnedUrl`.
- `pnpm verify` passed locally but **failed on a clean clone** — nothing generated the Prisma client on install. Fixed with a root `postinstall`.
- Label translations were seeded for only 1 of 9 tables, so switching language left most labels falling back to English — localization wasn't actually testable end to end until the remaining 8 were seeded.

## Honest limits of this build

- **Nothing native is device-verified** — no Android emulator was available. Set-ringtone, set-wallpaper, background audio and TTS are unit-tested against fake channels only.
- **"Pixel-perfect" is headless** — Figma-exported assets + extracted tokens + measured geometry + golden renders, not live-device screenshots.
- **Prod is not deployed.** Terraform is wired for stage *and* prod, but `terraform apply` for prod was deliberately never run.
- **Media objects are public** (a product decision) and the admin JWT lives in `localStorage` — accepted, mitigated by admin being localhost-only this epic.
- A subagent's `git reset` once moved the shared branch back to a pre-work commit; recovered in full from the commit objects. The worktree hazard behind it is described in the transcript.

The full list of deferred items is in `docs/PHASE-NOTES.md`.
