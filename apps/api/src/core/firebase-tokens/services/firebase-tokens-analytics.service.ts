import { createHash } from "node:crypto";
import {
  analyticsEventsClient,
  PROFILE_ANALYTICS_EVENT as E,
  type AnalyticsEventInput,
} from "@api/shared/analytics";
import { createModuleLogger } from "@api/shared/logs";
import type { FirebaseTokenUpsertInput } from "@api/core/firebase-tokens/types";

const log = createModuleLogger("firebase-tokens:analytics");

/**
 * Tells audience-campaign which device token a user has, so push campaigns
 * can address them. Mirrors `OtpAnalyticsService`.
 *
 * The one property that matters here is the `insert_id`. It is the collector's
 * idempotency key, and the app re-registers on every token REFRESH — so an id
 * that only named the user would dedupe every refreshed token as a replay,
 * and `user_profiles` would hold the first token forever, long after FCM had
 * retired it. The id therefore names the token too, hashed: raw tokens run to
 * ~160 chars against a 200-char cap, and the id is logged where the token must
 * not be. Same device, same token → same id → deduped, which is correct; the
 * app already skips unchanged tokens client-side anyway.
 *
 * Only `fcm_token` is sent. The profile is keep-if-absent, so leaving
 * `phone_number` out preserves whatever OTP verification already stored;
 * sending "" would not clear it either — "" means "not provided" there.
 */
export class FirebaseTokenAnalyticsService {
  async trackTokenRegistered(input: FirebaseTokenUpsertInput): Promise<void> {
    await this.safeSend({
      event_type: E.USER_PROFILE_UPDATE,
      user_id: input.userId,
      insert_id: [E.USER_PROFILE_UPDATE, input.userId, input.deviceId, tokenDigest(input.token)].join(":"),
      event_properties: {
        fcm_token: input.token,
        device_id: input.deviceId,
        platform: input.platform,
      },
    });
  }

  private async safeSend(...events: AnalyticsEventInput[]): Promise<void> {
    if (events.length === 0) return;
    try {
      await analyticsEventsClient.send(events);
    } catch (err) {
      log.warn(
        { err, event_type: events.map((e) => e.event_type), user_id: events[0].user_id },
        "firebase-token analytics event send failed"
      );
    }
  }
}

/** First 16 hex chars of SHA-256 — enough to tell tokens apart, never the token itself. */
function tokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

export const firebaseTokenAnalytics = new FirebaseTokenAnalyticsService();
