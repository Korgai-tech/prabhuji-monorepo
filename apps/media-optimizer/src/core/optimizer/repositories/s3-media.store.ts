import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  CopyObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { MediaStore, WriteResult } from "../types";

/**
 * The ONLY place `@aws-sdk/*` is reached (arch-boundaries.json). Region and
 * credentials come from the Lambda's standard AWS chain (`AWS_REGION`, the
 * execution role); `AWS_ENDPOINT_URL` points it at an emulator for local runs.
 *
 * 404 vs 403: without `s3:ListBucket` S3 answers a HEAD/GET on a missing key
 * with 403, indistinguishable from a real permission fault. The function's role
 * is granted ListBucket (media-optimizer.tf) precisely so "missing" is a clean
 * 404 here; anything else is rethrown.
 */
export class S3MediaStore implements MediaStore {
  constructor(
    private readonly bucket: string,
    // Path-style only against an emulator (floci has no per-bucket DNS); real
    // S3 on Lambda keeps the default virtual-hosted style.
    private readonly client: S3Client = new S3Client({ forcePathStyle: Boolean(process.env.AWS_ENDPOINT_URL) })
  ) {}

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (err) {
      if (isStatus(err, 404)) return false;
      throw err;
    }
  }

  async download(key: string, destPath: string): Promise<number | null> {
    let body: Readable;
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      body = res.Body as Readable;
    } catch (err) {
      if (isStatus(err, 404)) return null;
      throw err;
    }
    await pipeline(body, createWriteStream(destPath));
    return (await stat(destPath)).size;
  }

  async putFile(
    key: string,
    path: string,
    meta: { contentType: string; cacheControl: string }
  ): Promise<WriteResult> {
    const { size } = await stat(path);
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: createReadStream(path),
          ContentLength: size,
          ContentType: meta.contentType,
          CacheControl: meta.cacheControl,
          // Keys are immutable (ADR A3): a key that exists is a redelivered
          // event that won the race, never something to overwrite.
          IfNoneMatch: "*",
        })
      );
      return "written";
    } catch (err) {
      if (isStatus(err, 412)) return "exists";
      throw err;
    }
  }

  async copy(from: string, to: string): Promise<WriteResult | "source-missing"> {
    try {
      await this.client.send(
        new CopyObjectCommand({
          Bucket: this.bucket,
          // CopySource is `<bucket>/<key>`, URL-encoded (keys are
          // `[a-z0-9-]/…` today, but encode anyway — a `+` or space would
          // otherwise name a different object).
          CopySource: `${this.bucket}/${from.split("/").map(encodeURIComponent).join("/")}`,
          Key: to,
          // COPY (the default, stated for the reader): Content-Type and
          // Cache-Control — both signed into the CMS's presigned PUT — carry
          // over from the upload unchanged.
          MetadataDirective: "COPY",
          // CopyObject honours If-None-Match since S3's 2024 conditional-write
          // launch; 412 means the final key already exists.
          IfNoneMatch: "*",
        })
      );
      return "written";
    } catch (err) {
      if (isStatus(err, 412)) return "exists";
      if (isStatus(err, 404)) return "source-missing";
      throw err;
    }
  }
}

function isStatus(err: unknown, status: number): boolean {
  const meta = (err as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata;
  return meta?.httpStatusCode === status;
}
