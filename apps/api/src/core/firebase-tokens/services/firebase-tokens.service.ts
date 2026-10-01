import { createModuleLogger } from "@api/shared/logs";
import type { FirebaseTokenRepository } from "@api/core/firebase-tokens/repositories";
import type {
  FirebaseTokenDeleteInput,
  FirebaseTokenUpsertInput,
} from "@api/core/firebase-tokens/types";
import { firebaseTokenAnalytics } from "./firebase-tokens-analytics.service.js";

/** Structural, so a test hands in a two-line fake rather than the real client. */
export interface FirebaseTokenAnalytics {
  trackTokenRegistered(input: FirebaseTokenUpsertInput): Promise<void>;
}

const log = createModuleLogger("firebase-tokens:service");

export class FirebaseTokenService {
  constructor(
    private readonly repo: FirebaseTokenRepository,
    private readonly analytics: FirebaseTokenAnalytics = firebaseTokenAnalytics
  ) {}

  async register(input: FirebaseTokenUpsertInput): Promise<void> {
    await this.repo.upsert(input);
    log.info(
      { userId: input.userId, deviceId: input.deviceId, platform: input.platform },
      "firebase token registered"
    );
    // AFTER the upsert, never before: the event tells audience-campaign "this
    // user's device token is X", and it must not claim a token that failed to
    // store. `safeSend` swallows its own failures, so awaiting it cannot fail
    // the request — it only keeps the order deterministic.
    await this.analytics.trackTokenRegistered(input);
  }

  async unregister(input: FirebaseTokenDeleteInput): Promise<boolean> {
    const deleted = await this.repo.deleteByUserDevice(input);
    if (deleted) {
      log.info(
        { userId: input.userId, deviceId: input.deviceId },
        "firebase token unregistered"
      );
    }
    return deleted;
  }
}
