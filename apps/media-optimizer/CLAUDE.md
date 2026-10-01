# apps/media-optimizer

S3-triggered Lambda (Node 22, arm64) that compresses CMS video/audio uploads before their URL is saved (TAM-267). The CMS PUTs to `incoming/<final key>`; this writes `<final key>` — re-encoded with the TAM-265 quality ladder (`@prabhuji/media-profiles`) when the file is over budget and the output passes `acceptOutput`, otherwise a byte copy of the original. Spec: `specs/TAM-267-media-upload-optimizer.md`. Infra: `infra/terraform/modules/stack/media-optimizer.tf`.

## Rules that must not break

- **Fail-open.** Every path that has a source ends with the final key existing. Probe/encode/verify/PUT failures all fall back to a copy; only the copy itself failing throws (Lambda then retries). An editor must never be left polling for a final key that never appears.
- **Idempotent + immutable.** An existing final key is a `duplicate` no-op; every write is `If-None-Match: *` (ADR A3 — never overwrite). S3 events arrive at least once.
- **Never write under `incoming/`** — it would re-trigger the function (the IAM role also denies it).
- **Beat the timeout.** ffmpeg gets the remaining time minus `POST_ENCODE_RESERVE_MS`; a killed encode falls back to the copy.
- Event keys are form-URL-encoded (`+` = space, `%XX`) — decode with `decodeS3Key` before anything else.

## Layering (CI-enforced via `pnpm check:arch-boundaries`)

Handler → Service → Repository, composed in `src/index.ts`; ports in `core/optimizer/types.ts`.

- `handlers/` — S3 event parsing + one JSON log line per record; never `@aws-sdk/*`, `repositories/` or `node:child_process`
- `services/` — the decision flow; never `@aws-sdk/*`, `repositories/` or `node:child_process`
- `repositories/` — `S3MediaStore` (the only `@aws-sdk/*` import) and `FfmpegTool` (the only child processes)
- `shared/` — env + logger; never imports `core/`

## Build, test, deploy

- `pnpm nx build media-optimizer` → `dist/index.mjs` (single ESM bundle, AWS SDK included)
- `bash scripts/build-ffmpeg-layer.sh` → `dist-layer/ffmpeg-layer.zip` (pinned, sha256-verified static arm64 ffmpeg/ffprobe; runs the encoder check in the Lambda base image when Docker can run arm64)
- `pnpm nx test media-optimizer` — fakes for S3 + ffmpeg; the real-ffmpeg test runs only when `ffmpeg` is on PATH
- Deployed ONLY by `pnpm deploy:infra <env>` (builds both artifacts, then Terraform). The CodeBuild pipeline ships images and never touches this function.
- Logs: CloudWatch `/aws/lambda/app-<env>-media-optimizer`, one JSON line per upload (`action` = compressed | copied | duplicate | skipped | failed).
