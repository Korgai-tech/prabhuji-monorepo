/**
 * Lambda entry point (`index.handler`, nodejs22.x arm64) — the composition
 * root. Wires the S3 store and the ffmpeg tool (repositories) into the service
 * and the service into the S3-event handler; no layer reaches below the one
 * beneath it. Construction happens once per cold start and is reused across
 * warm invocations.
 *
 * Triggered by S3 `ObjectCreated:*` on `incoming/` of the media bucket
 * (infra/terraform/modules/stack/media-optimizer.tf). Spec:
 * specs/TAM-267-media-upload-optimizer.md.
 */
import { createS3EventHandler } from "./core/optimizer/handlers/s3-event.handler";
import { FfmpegTool } from "./core/optimizer/repositories/ffmpeg.tool";
import { S3MediaStore } from "./core/optimizer/repositories/s3-media.store";
import { OptimizerService } from "./core/optimizer/services/optimizer.service";
import { loadEnv } from "./shared/config/env";
import { createLogger } from "./shared/logs/logger";

const env = loadEnv();

export const handler = createS3EventHandler({
  service: new OptimizerService(new S3MediaStore(env.MEDIA_BUCKET), new FfmpegTool(env.FFMPEG_PATH, env.FFPROBE_PATH)),
  bucket: env.MEDIA_BUCKET,
  log: createLogger("media-optimizer"),
});
