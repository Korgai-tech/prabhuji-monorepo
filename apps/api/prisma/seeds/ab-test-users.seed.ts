/**
 * TAM-174 — two LOCAL-ONLY test accounts that sit on opposite sides of the
 * shortcut-grid A/B split.
 *
 * ## Why this seed has to exist
 *
 * The arm is a salted hash of the USER ID, and a user id is a random uuid minted
 * the first time a phone number is seen. So a freshly-registered tester lands in
 * whichever arm the dice give them, and there is no way to ask for the other one
 * — which makes "show me both variants side by side" impossible to arrange by
 * signing up twice.
 *
 * These two rows fix that by PINNING the uuids. `OtpRepository.ensureUserForPhone`
 * is a find-or-create keyed on `(phoneCountryCode, phoneNumber)`, so logging in
 * with either number below reuses the row seeded here — uuid and therefore arm
 * intact — rather than minting a new one.
 *
 * The uuids are not arbitrary. Each was chosen because
 * `homeGridBucketFor(uuid)` lands it in the intended half of the 0–99 map, and
 * both buckets are pinned as goldens in `home.buckets.test.ts`. Changing either
 * uuid, or the salt in `home.buckets.ts`, re-buckets these accounts and this
 * seed stops doing its job — quietly, which is why the buckets are asserted
 * rather than commented.
 *
 * ## This is local-only, and it refuses to be anything else
 *
 * It writes verified accounts with no credential check behind them, which is a
 * back door anywhere it is not a developer's laptop. `runSeed` is not enough of
 * a guard on its own, so the body hard-fails on `NODE_ENV=production` and
 * whenever `PAYMENT_ENV=production`, mirroring how `env.ts` refuses to boot with
 * dev tools armed against production.
 *
 * Run:  pnpm --filter api run seed:ab-users
 */
import type { Prisma } from "@prisma/client";
import { type SeedCounts, isSeedCli, runSeed } from "./_shared.js";

/**
 * Pinned so the arm is deterministic. Buckets computed with
 * `home.buckets.ts`'s salt (`home_shortcut_grid_v1`) and asserted in its test.
 */
const AB_TEST_USERS = [
  {
    id: "019f5f4c-793c-7358-aec3-f7941d852db6", // bucket 57 → gradient_v1
    phoneCountryCode: "+91",
    phoneNumber: "9000000001",
    name: "AB Gradient",
    arm: "gradient_v1 (the NEW coloured grid)",
  },
  {
    id: "019f5f4c-793c-7358-aec3-f7941d852db8", // bucket 45 → control
    phoneCountryCode: "+91",
    phoneNumber: "9000000002",
    name: "AB Control",
    arm: "control (the CURRENT grid)",
  },
] as const;

export async function seedAbTestUsers(tx: Prisma.TransactionClient): Promise<SeedCounts> {
  if (process.env.NODE_ENV === "production" || process.env.PAYMENT_ENV === "production") {
    throw new Error(
      "ab-test-users.seed is local-only: it writes pre-verified accounts with no credential behind them. Refusing to run against production."
    );
  }

  const counts: SeedCounts = { abTestUsers: 0 };

  for (const u of AB_TEST_USERS) {
    // `phoneVerifiedAt` is set so the account behaves as a returning user the
    // moment the stub OTP (1234) is accepted, rather than being treated as a
    // brand-new signup and pushed back through onboarding.
    //
    // Upsert on the PINNED id, not the phone: if a previous run of the app
    // already created a row for this number with a random id, that row would
    // otherwise survive and keep its own (wrong) arm. Keying on the id makes
    // the pin authoritative — see the `deleteMany` below for the other half.
    await tx.user.deleteMany({
      where: {
        phoneCountryCode: u.phoneCountryCode,
        phoneNumber: u.phoneNumber,
        id: { not: u.id },
      },
    });

    await tx.user.upsert({
      where: { id: u.id },
      update: {
        phoneCountryCode: u.phoneCountryCode,
        phoneNumber: u.phoneNumber,
        phoneVerifiedAt: new Date(),
        name: u.name,
      },
      create: {
        id: u.id,
        loginType: "otp",
        phoneCountryCode: u.phoneCountryCode,
        phoneNumber: u.phoneNumber,
        phoneVerifiedAt: new Date(),
        name: u.name,
        // `selectedLanguage` is left unset on purpose: the app's onboarding
        // language picker is the natural place to choose one, and hardcoding it
        // here would skip a screen a tester may well want to see.
      },
    });
    counts.abTestUsers += 1;
  }

  return counts;
}

export async function runAbTestUsersSeed(): Promise<SeedCounts> {
  const counts = await runSeed("ab-test-users", seedAbTestUsers);
  // Printed rather than logged through the seed's counter, because the POINT of
  // this seed is the pairing — a row count tells the operator nothing useful.
  for (const u of AB_TEST_USERS) {
    process.stdout.write(
      `  ${u.phoneCountryCode} ${u.phoneNumber}  (OTP 1234)  →  ${u.arm}\n`
    );
  }
  return counts;
}

if (isSeedCli(import.meta.url)) {
  await runAbTestUsersSeed();
}
