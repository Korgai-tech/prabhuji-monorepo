import type { FirebasePlatform as PrismaFirebasePlatform } from "@prisma/client";
import { getPrisma } from "@api/shared/database";
import type {
  FirebaseTokenDeleteInput,
  FirebaseTokenUpsertInput,
} from "@api/core/firebase-tokens/types";

/**
 * Firebase Tokens repository — the ONLY place `@prisma/client` is reached for
 * this module.
 *
 * The upsert is keyed on `(userId, deviceId)` (`firebase_token_user_device_unique`).
 * The `token` column is separately `UNIQUE` globally so a device handed off
 * between users — the same physical device signed into a different account —
 * can't be registered under two owners. When a re-register would collide on the
 * global token, `moveTokenOwnership` reassigns the existing row to the current
 * caller rather than 409-ing.
 */
export class FirebaseTokenRepository {
  async upsert(input: FirebaseTokenUpsertInput): Promise<void> {
    const prisma = getPrisma();
    const platform: PrismaFirebasePlatform = input.platform;

    await prisma.$transaction(async (tx) => {
      // If the same token is already owned by a different (userId, deviceId),
      // reassign it. This is the common device-handoff case.
      const existingByToken = await tx.firebaseToken.findUnique({
        where: { token: input.token },
        select: { userId: true, deviceId: true },
      });
      if (
        existingByToken &&
        (existingByToken.userId !== input.userId ||
          existingByToken.deviceId !== input.deviceId)
      ) {
        await tx.firebaseToken.delete({ where: { token: input.token } });
      }

      await tx.firebaseToken.upsert({
        where: {
          firebase_token_user_device_unique: {
            userId: input.userId,
            deviceId: input.deviceId,
          },
        },
        create: {
          userId: input.userId,
          deviceId: input.deviceId,
          token: input.token,
          platform,
        },
        update: {
          token: input.token,
          platform,
        },
      });
    });
  }

  async deleteByUserDevice(input: FirebaseTokenDeleteInput): Promise<boolean> {
    const prisma = getPrisma();
    const result = await prisma.firebaseToken.deleteMany({
      where: { userId: input.userId, deviceId: input.deviceId },
    });
    return result.count > 0;
  }
}
