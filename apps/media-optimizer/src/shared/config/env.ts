export interface OptimizerEnv {
  /** The media bucket (set by Terraform from aws_s3_bucket.media). */
  readonly MEDIA_BUCKET: string;
  /** ffmpeg/ffprobe — the Lambda layer mounts them under /opt/bin. Override for local runs. */
  readonly FFMPEG_PATH: string;
  readonly FFPROBE_PATH: string;
}

/** Fail fast at cold start: a missing bucket name would otherwise surface as a confusing S3 error per record. */
export function loadEnv(env: NodeJS.ProcessEnv = process.env): OptimizerEnv {
  const bucket = env.MEDIA_BUCKET?.trim();
  if (!bucket) throw new Error("MEDIA_BUCKET is required");
  return {
    MEDIA_BUCKET: bucket,
    FFMPEG_PATH: env.FFMPEG_PATH?.trim() || "/opt/bin/ffmpeg",
    FFPROBE_PATH: env.FFPROBE_PATH?.trim() || "/opt/bin/ffprobe",
  };
}
