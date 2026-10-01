import type { MediaService } from "@api/core/media/services";
import type {
  HeadResult,
  PresignInput,
  PresignResult,
  ValidateOwnedUrlInput,
} from "@api/core/media/types";
import type { IMediaApi } from "./media.api.js";

/**
 * Facade implementation — a thin passthrough to the module's `MediaService`
 * singleton built in the composition root, so cross-module callers and the
 * module's own HTTP controller see identical behavior.
 */
export class MediaApi implements IMediaApi {
  constructor(private readonly service: MediaService) {}

  async presign(input: PresignInput): Promise<PresignResult> {
    return this.service.presign(input);
  }

  async head(keyOrUrl: string): Promise<HeadResult> {
    return this.service.head(keyOrUrl);
  }

  async validateOwnedUrl(input: ValidateOwnedUrlInput): Promise<void> {
    return this.service.validateOwnedUrl(input);
  }

  async validateReusableUrl(input: ValidateOwnedUrlInput): Promise<void> {
    return this.service.validateReusableUrl(input);
  }

  async presignGet(key: string, ttlSeconds: number): Promise<string> {
    return this.service.presignGet(key, ttlSeconds);
  }

  toKey(keyOrUrl: string): string {
    return this.service.toKey(keyOrUrl);
  }
}
