import type {
  HeadResult,
  PresignInput,
  PresignResult,
  ValidateOwnedUrlInput,
} from "@api/core/media/types";

/**
 * Public facade for the media module (TAM-84) — THE contract nine module admin
 * tickets depend on. Reached ONLY via `performServiceCall("media", …)`, never by
 * importing this module's files. Registered into `GlobalServiceMap` from the
 * composition root.
 *
 * **Its signature is frozen once the module tickets start** (ADR §A4 / spec note
 * 1): it is the epic's most re-used contract, so churning it mid-epic is the
 * most expensive mistake available. Publish early, keep stable.
 *
 * The re-used op is `validateOwnedUrl`: every module admin service calls it
 * BEFORE writing any media column, e.g.
 *
 *   ```ts
 *   await performServiceCall(
 *     "media",
 *     (m) => m.validateOwnedUrl({ url, module: "deity", entity: "deity", field: "iconUrl" }),
 *     "deity:admin:update",
 *     "media URL validation failed"
 *   );
 *   ```
 *
 * It throws `ValidationError` (→ 400) unless the URL was minted by this platform
 * (prefix), matches the expected key shape for that field, and the object exists
 * with an allowlisted content-type. Skipping it is a review-blocker: without it
 * an admin token could store `https://evil.example/tracker.gif` and the app
 * would render it on every user's home screen.
 */
export interface IMediaApi {
  /** Mint a presigned PUT + public URL and record the `media_objects` ledger row. */
  presign(input: PresignInput): Promise<PresignResult>;

  /** HEAD an object by its key or public URL — `{exists, contentType, sizeBytes}`. */
  head(keyOrUrl: string): Promise<HeadResult>;

  /**
   * The write-path ownership gate. Throws `ValidationError` unless the URL was
   * minted by us (prefix + key shape for the field) AND the object exists with a
   * content-type in that field's allowlist. Returns void on success.
   */
  validateOwnedUrl(input: ValidateOwnedUrlInput): Promise<void>;

  /**
   * Like `validateOwnedUrl` but permits REUSING an object minted for another
   * field (e.g. a home-feed hero pointing at a wallpaper's own thumbnail — no
   * re-upload). Keeps the ownership + existence + content-type checks; relaxes
   * only the per-field key prefix. Use ONLY where cross-field reuse is intended.
   */
  validateReusableUrl(input: ValidateOwnedUrlInput): Promise<void>;

  /**
   * Mint a short-TTL presigned GET for a stored object key (TAM-125 downloads).
   *
   * The single Pro-only delivery mechanism for downloads: the caller has already
   * looked the row up through its own repository AND resolved the object key via
   * `toKey`, so this facade is a thin "sign this key, this long" pass-through
   * that keeps `@aws-sdk/*` confined to the media repositories layer. Downloads
   * uses `PRESIGN_TTL_SECONDS` (5 minutes) from `media.service.ts` — long enough
   * for a slow start, short enough that a leaked URL is not a persistent read
   * primitive.
   *
   * NEVER log the returned URL.
   */
  presignGet(key: string, ttlSeconds: number): Promise<string>;

  /**
   * Strip the platform's `MEDIA_PUBLIC_BASE_URL` prefix from a stored URL to
   * recover its object key (TAM-125 downloads). Sibling modules resolve the
   * key of an audio row's stored `audioStreamUrl`/`audioUrl` through here so
   * URL-to-key translation is not duplicated per module.
   *
   * A pure string op; if `keyOrUrl` is already a key (no prefix match) it is
   * returned unchanged.
   */
  toKey(keyOrUrl: string): string;
}
