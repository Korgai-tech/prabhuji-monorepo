import { randomUUID } from "node:crypto";
import { incomingKeyFor, optimizableTarget } from "@prabhuji/media-profiles";
import { ValidationError } from "@api/shared/errors";
import { createModuleLogger } from "@api/shared/logs";
import type {
  S3MediaRepository,
  MediaObjectRepository,
} from "@api/core/media/repositories";
import {
  SIZE_CAPS_BYTES,
  UUID_PATTERN,
  allowlistKey,
  extensionForContentType,
  isFinalMediaKey,
  keyPrefixFor,
  lookupAllowlist,
  type AllowlistEntry,
} from "@api/core/media/media.allowlist.js";
import type {
  HeadResult,
  MediaServiceOptions,
  MediaStatusResult,
  PresignInput,
  PresignResult,
  ValidateOwnedUrlInput,
} from "@api/core/media/types";

const log = createModuleLogger("media:service");

/**
 * Presign TTL — 5 minutes (AC (b)). Long enough for a slow client to start,
 * short enough that a leaked presign is not a general write primitive: it is a
 * single-key, type-pinned, size-pinned, expiring capability.
 *
 * Exported for cross-module consumers (TAM-125 downloads) that mint their own
 * short-TTL presigned GETs against `IMediaApi.presignGet` and need the same
 * expiry both on the wire and in `expiresAt` on the response envelope.
 */
export const PRESIGN_TTL_SECONDS = 5 * 60;

/**
 * Cache-Control pinned on every upload (AC (e)) — a signed header on the
 * presigned PUT, so the stored object carries it. Immutable keys make this safe:
 * a new asset is always a new URL, so nothing is ever stale.
 */
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

// A canonical uuid (v4) as it appears in a key — see `UUID_PATTERN`.
const UUID_RE = UUID_PATTERN;

/**
 * The media module's business logic (TAM-84). SDK-free and Prisma-free — it
 * enforces the allowlist + caps, mints the immutable key, and orchestrates the
 * S3 repo (presign / HEAD) and the ledger repo. The `IMediaApi` facade is a thin
 * passthrough to this class, so cross-module callers and the HTTP controller see
 * identical behavior.
 */
export class MediaService {
  private readonly optimizeUploads: boolean;

  constructor(
    private readonly s3: S3MediaRepository,
    private readonly ledger: MediaObjectRepository,
    /** `MEDIA_PUBLIC_BASE_URL`, trailing slash trimmed. Always the CDN base. */
    private readonly publicBaseUrl: string,
    options: MediaServiceOptions = {}
  ) {
    this.optimizeUploads = options.optimizeUploads ?? false;
  }

  /**
   * Mint a presigned PUT + the eventual public URL, and record the ledger row.
   *
   * Fails closed on an unknown `(module, entity, field)` triple, a content type
   * outside that field's allowlist, or a size over the class cap. The key is
   * `<module>/<entity>/<uuid>.<ext>` where the uuid is server-minted and the ext
   * is derived from the allowlisted content type — the client's `filename`
   * influences NOTHING that reaches the key.
   */
  async presign(input: PresignInput): Promise<PresignResult> {
    const entry = this.requireAllowed(input.module, input.entity, input.field, input.contentType);

    const cap = SIZE_CAPS_BYTES[entry.mediaClass];
    if (input.sizeBytes <= 0 || input.sizeBytes > cap) {
      throw new ValidationError(
        `File size ${input.sizeBytes} bytes exceeds the ${entry.mediaClass} cap of ${cap} bytes`
      );
    }

    const ext = extensionForContentType(input.contentType);
    if (!ext) {
      // Unreachable: the allowlist load-time check guarantees a mapping. Defensive.
      throw new ValidationError(`No extension mapping for content type '${input.contentType}'`);
    }

    // Server-minted uuid; filename is NEVER used to build the key.
    const key = `${keyPrefixFor(input.module, input.entity)}/${randomUUID()}.${ext}`;
    const publicUrl = `${this.publicBaseUrl}/${key}`;
    const expiresAt = new Date(Date.now() + PRESIGN_TTL_SECONDS * 1000).toISOString();

    // TAM-267: a heavy video/audio upload is PUT to `incoming/<key>` instead; the
    // media optimizer (S3 event → Lambda) writes the FINAL key from it —
    // compressed, or a byte copy when compression is skipped or fails. Only the
    // signed PUT target moves: the returned key/publicUrl and the ledger row
    // stay FINAL, because the final key is the only one a row may ever hold.
    const processing =
      this.optimizeUploads &&
      optimizableTarget(allowlistKey(input.module, input.entity, input.field), ext) !== null;
    const putKey = processing ? incomingKeyFor(key) : key;

    const uploadUrl = await this.s3.presignPut({
      key: putKey,
      contentType: input.contentType,
      contentLength: input.sizeBytes,
      cacheControl: IMMUTABLE_CACHE_CONTROL,
      expiresInSeconds: PRESIGN_TTL_SECONDS,
    });

    // Ledger written AT PRESIGN — the only moment we know who + why.
    await this.ledger.record({ ...input, key });

    // NEVER log uploadUrl — it is a 5-minute bearer write-capability.
    log.info(
      { key, module: input.module, entity: input.entity, field: input.field, processing },
      "presigned media upload"
    );
    return {
      uploadUrl,
      publicUrl,
      key,
      expiresAt,
      // Built from the SAME values handed to presignPut above — that shared
      // origin is the point. The client echoes these verbatim instead of
      // reconstructing them, so the signed set cannot drift from what the
      // caller sends. Content-Length is omitted: the browser derives it from
      // the body and forbids setting it by hand.
      headers: {
        "Content-Type": input.contentType,
        "Cache-Control": IMMUTABLE_CACHE_CONTROL,
      },
      processing,
    };
  }

  /**
   * TAM-267: has the FINAL object for a `processing` upload been written yet?
   * The CMS polls this after its PUT to `incoming/<key>` and saves `publicUrl`
   * only once it is `ready` (saving earlier is a 400 anyway — `validateOwnedUrl`
   * HEADs the same key).
   *
   * Only a final owned-shape key is accepted — never an `incoming/` staging key,
   * never an arbitrary bucket path: this is a HEAD oracle, so it answers for
   * nothing but the platform's own minted objects.
   */
  async status(key: string): Promise<MediaStatusResult> {
    if (!isFinalMediaKey(key)) {
      throw new ValidationError(
        "key must be a final media object key (<module>/<entity>/<uuid>.<ext>)"
      );
    }
    const head = await this.s3.headObject(key);
    return { ready: head.exists };
  }

  /** HEAD an object by key or by its public URL. */
  async head(keyOrUrl: string): Promise<HeadResult> {
    return this.s3.headObject(this.toKey(keyOrUrl));
  }

  /**
   * Mint a short-TTL presigned GET for a stored object (TAM-125 downloads).
   *
   * Accepts a key (module-owned convention) rather than a URL because the
   * caller has already asserted ownership by looking the row up through its
   * own repository. Delegates straight to the S3 repo — the SERVICE stays
   * SDK-free (`arch-boundaries.json` forbids `@aws-sdk/*` outside
   * `repositories/`).
   *
   * NEVER logs the returned URL — it is a bearer read-capability.
   */
  async presignGet(key: string, ttlSeconds: number): Promise<string> {
    return this.s3.presignGet({ key, expiresInSeconds: ttlSeconds });
  }

  /**
   * THE WRITE-PATH GATE (AC (f)/(i)). Every module admin service calls this
   * before writing any media column. Throws `ValidationError` unless ALL hold:
   *   1. the URL starts with `MEDIA_PUBLIC_BASE_URL` (no third-party origins);
   *   2. its key matches `<module>/<entity>/<uuid>.<ext>` for THAT field;
   *   3. the object exists (HEAD) and its stored content-type is in the field's
   *      allowlist.
   *
   * Without (1) an admin token could point the home screen at a tracker; without
   * (3) it could store a URL that 404s in production. Both are non-negotiable.
   */
  async validateOwnedUrl(input: ValidateOwnedUrlInput): Promise<void> {
    const entry = lookupAllowlist(input.module, input.entity, input.field);
    if (!entry) {
      throw new ValidationError(
        `Unknown media target ${input.module}.${input.entity}.${input.field}`
      );
    }

    // (1) prefix — the CMS is structurally incapable of a foreign origin.
    const prefix = `${this.publicBaseUrl}/`;
    if (!input.url.startsWith(prefix)) {
      throw new ValidationError("Media URL is not one this platform minted");
    }
    const key = input.url.slice(prefix.length);

    // (2) key shape for this specific field.
    if (!this.keyShapeRe(input.module, input.entity, entry).test(key)) {
      throw new ValidationError("Media URL key does not match the expected shape for this field");
    }

    // (3) existence + stored content-type in the field's allowlist.
    const head = await this.s3.headObject(key);
    if (!head.exists) {
      throw new ValidationError("Media object does not exist");
    }
    if (!head.contentType || !entry.contentTypes.includes(head.contentType)) {
      throw new ValidationError(
        `Stored content-type '${head.contentType ?? "unknown"}' is not allowed for this field`
      );
    }
  }

  /**
   * Like `validateOwnedUrl`, but the URL may REUSE an object minted for a
   * DIFFERENT field — so a home-feed hero can point straight at a wallpaper's own
   * thumbnail instead of a duplicate re-upload of the same bytes (the cost the
   * per-field key prefix otherwise forces).
   *
   * The two non-negotiable checks are unchanged: (1) the URL is one THIS platform
   * minted (prefix), and (3) the object exists with a content-type in the TARGET
   * field's allowlist — so a hero is still provably one of our images of the right
   * class, never a foreign tracker and never a 404. Only check (2) is relaxed:
   * the key must match a generic owned-object shape (`<seg>/<seg>/<uuid>.<ext>`),
   * not this field's specific prefix. Nothing here can point at bytes we did not
   * mint or at the wrong media class.
   */
  async validateReusableUrl(input: ValidateOwnedUrlInput): Promise<void> {
    const entry = lookupAllowlist(input.module, input.entity, input.field);
    if (!entry) {
      throw new ValidationError(
        `Unknown media target ${input.module}.${input.entity}.${input.field}`
      );
    }
    const prefix = `${this.publicBaseUrl}/`;
    if (!input.url.startsWith(prefix)) {
      throw new ValidationError("Media URL is not one this platform minted");
    }
    const key = input.url.slice(prefix.length);
    if (!this.reusableKeyShapeRe(entry).test(key)) {
      throw new ValidationError("Media URL is not a reusable object of the expected type");
    }
    const head = await this.s3.headObject(key);
    if (!head.exists) {
      throw new ValidationError("Media object does not exist");
    }
    if (!head.contentType || !entry.contentTypes.includes(head.contentType)) {
      throw new ValidationError(
        `Stored content-type '${head.contentType ?? "unknown"}' is not allowed for this field`
      );
    }
  }

  private requireAllowed(
    module: string,
    entity: string,
    field: string,
    contentType: string
  ): AllowlistEntry {
    const entry = lookupAllowlist(module, entity, field);
    if (!entry) {
      // Fail closed — never a permissive default (AC (c)).
      throw new ValidationError(`Unknown media target ${module}.${entity}.${field}`);
    }
    if (!entry.contentTypes.includes(contentType)) {
      throw new ValidationError(
        `Content type '${contentType}' is not allowed for ${module}.${entity}.${field}`
      );
    }
    return entry;
  }

  /**
   * A generic owned-object key of a compatible extension — `<seg>/<seg>/<uuid>.<ext>`
   * for ANY module/entity, with the ext constrained to this field's allowlist so a
   * hero (image) can't reuse an audio key. Backs `validateReusableUrl`.
   */
  private reusableKeyShapeRe(entry: AllowlistEntry): RegExp {
    const exts = [
      ...new Set(
        entry.contentTypes
          .map((ct) => extensionForContentType(ct))
          .filter((e): e is string => e !== null)
      ),
    ].map(escapeRegExp);
    const seg = "[a-z0-9]+(?:-[a-z0-9]+)*";
    return new RegExp(`^${seg}/${seg}/${UUID_RE}\\.(?:${exts.join("|")})$`);
  }

  /** `<module>/<kebab(entity)>/<uuid>.<one of the field's allowed exts>`. */
  private keyShapeRe(module: string, entity: string, entry: AllowlistEntry): RegExp {
    const exts = [
      ...new Set(
        entry.contentTypes
          .map((ct) => extensionForContentType(ct))
          .filter((e): e is string => e !== null)
      ),
    ].map(escapeRegExp);
    const prefix = escapeRegExp(keyPrefixFor(module, entity));
    return new RegExp(`^${prefix}/${UUID_RE}\\.(?:${exts.join("|")})$`);
  }

  /**
   * Strip the platform's `MEDIA_PUBLIC_BASE_URL` prefix from a stored URL to
   * recover its object key. If the input is already a key (no prefix match), it
   * is returned unchanged. Cross-module callers (TAM-125 downloads → aarti /
   * mantras `getDownloadSource`) reach this via the `IMediaApi.toKey` facade
   * so URL-to-key translation is not duplicated per module.
   */
  toKey(keyOrUrl: string): string {
    const prefix = `${this.publicBaseUrl}/`;
    return keyOrUrl.startsWith(prefix) ? keyOrUrl.slice(prefix.length) : keyOrUrl;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
