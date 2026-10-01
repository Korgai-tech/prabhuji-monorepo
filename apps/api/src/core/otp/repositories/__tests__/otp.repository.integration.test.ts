import { afterAll, beforeAll, expect, test } from "vitest";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { disconnectPrisma, getPrisma } from "@api/shared/database";
import { OtpRepository } from "../otp.repository.js";

const repo = new OtpRepository();

beforeAll(async () => {
  await startTestDb();
}, 120_000);

afterAll(async () => {
  await disconnectPrisma();
  await stopTestDb();
});

/** Distinct per call — `user_phone_unique` rejects a repeat. */
let phoneSeq = 0;
function uniquePhone(): string {
  phoneSeq += 1;
  return `9${String(phoneSeq).padStart(9, "0")}`;
}

test("markPhoneVerified creates a phone-only user with NO credentials", async () => {
  const phone = uniquePhone();
  const result = await repo.markPhoneVerified("+91", phone);
  expect(result.isNewUser).toBe(true);
  expect(result.user.phoneNumber).toBe(phone);

  const row = await getPrisma().user.findUnique({ where: { id: result.user.id } });
  // Selected for `bk_account_created` — the analytics service never reads the
  // database, so if it is not on this result the event cannot carry it.
  expect(result.user.createdAt).toEqual(row?.createdAt);
  expect(row?.phoneCountryCode).toBe("+91");
  expect(row?.phoneNumber).toBe(phone);
  expect(row?.loginType).toBe("otp");
  expect(row?.phoneVerifiedAt).not.toBeNull();

  // The point of the change: no fabricated credentials. These used to hold an
  // `otp-<id>@prabhuji.internal` address and 32 random bytes of hex purely to
  // satisfy NOT NULL, and the junk reached the JWT and the analytics warehouse.
  expect(row?.email).toBeNull();
  expect(row?.passwordHash).toBeNull();
});

test("verifying the same phone twice returns the same user with isNewUser=false", async () => {
  const phone = uniquePhone();
  const first = await repo.markPhoneVerified("+91", phone);
  const second = await repo.markPhoneVerified("+91", phone);
  expect(second.isNewUser).toBe(false);
  expect(second.user.id).toBe(first.user.id);
  expect(second.user.phoneNumber).toBe(first.user.phoneNumber);
  // Unmoved by the second verify: it is the row's insert moment (the SEND since
  // TAM-154), not the stamp — which is why the event does not use it as `time`.
  expect(second.user.createdAt).toEqual(first.user.createdAt);
});

test("ensureUserForPhone creates the lead row UNVERIFIED", async () => {
  // TAM-154: what a send writes. `phoneVerifiedAt` null is the whole signal —
  // it is what separates a dropped-off lead from someone who actually signed up.
  const phone = uniquePhone();
  const userId = await repo.ensureUserForPhone("+91", phone);

  const row = await getPrisma().user.findUnique({
    where: { user_phone_unique: { phoneCountryCode: "+91", phoneNumber: phone } },
  });
  expect(row?.loginType).toBe("otp");
  expect(row?.phoneVerifiedAt).toBeNull();
  // The returned id is the row's — it is what `/auth/otp/send` hands the client.
  expect(userId).toBe(row?.id);
});

test("concurrent ensureUserForPhone does not throw on the unique index", async () => {
  // The reason it is createMany+skipDuplicates and not upsert: `/auth/otp/send`
  // is public, so two sends for one number really can be in flight together, and
  // a SELECT-then-INSERT would surface that as a P2002.
  const phone = uniquePhone();
  const [a, b] = await Promise.all([
    repo.ensureUserForPhone("+91", phone),
    repo.ensureUserForPhone("+91", phone),
  ]);
  // Whichever call lost the insert race still reads back the winner's id.
  expect(a).toBe(b);
});

test("verify stamps the lead row in place rather than creating a second one", async () => {
  const phone = uniquePhone();
  await repo.ensureUserForPhone("+91", phone);
  const before = await getPrisma().user.findUniqueOrThrow({
    where: { user_phone_unique: { phoneCountryCode: "+91", phoneNumber: phone } },
  });

  const verified = await repo.markPhoneVerified("+91", phone);
  expect(verified.isNewUser).toBe(true);
  expect(verified.user.id).toBe(before.id);
});

test("a second verify does NOT move phone_verified_at", async () => {
  // The content of the `IS NULL` precondition: the column records the FIRST
  // verify, so every later login must leave it alone.
  const phone = uniquePhone();
  const first = await repo.markPhoneVerified("+91", phone);
  const stampedAt = (
    await getPrisma().user.findUniqueOrThrow({ where: { id: first.user.id } })
  ).phoneVerifiedAt;

  await repo.markPhoneVerified("+91", phone);
  const after = await getPrisma().user.findUniqueOrThrow({
    where: { id: first.user.id },
  });
  expect(after.phoneVerifiedAt).toEqual(stampedAt);
});

test("only ONE of two concurrent verifies reports isNewUser", async () => {
  // Two racing verifies that each READ a null would both claim to be the first,
  // which is why `isNewUser` comes from the conditional update's row count.
  const phone = uniquePhone();
  const [a, b] = await Promise.all([
    repo.markPhoneVerified("+91", phone),
    repo.markPhoneVerified("+91", phone),
  ]);
  expect([a.isNewUser, b.isNewUser].filter(Boolean)).toHaveLength(1);
});

test("two phone users coexist, both with a null email under the unique index", async () => {
  // `email` is `@unique` and null on every phone account. This passes only
  // because Postgres treats NULLs as distinct in a unique index — if that
  // assumption were wrong, the SECOND phone signup in the system would fail.
  const a = await repo.markPhoneVerified("+91", uniquePhone());
  const b = await repo.markPhoneVerified("+91", uniquePhone());
  expect(a.user.id).not.toBe(b.user.id);

  const rows = await getPrisma().user.findMany({
    where: { id: { in: [a.user.id, b.user.id] } },
    select: { email: true },
  });
  expect(rows).toHaveLength(2);
  expect(rows.every((r) => r.email === null)).toBe(true);
});

/**
 * `user_login_type_shape` — the invariant enforced by the DATABASE.
 *
 * `loginType` says which credentials a row is supposed to carry; without a
 * constraint that is a naming convention, and the state it forbids — an `otp`
 * account holding a password — is exactly the one `/auth/login` must never
 * meet. These write through raw Prisma, deliberately bypassing every service
 * guard, so what is being tested is Postgres and nothing else.
 */
test("CHECK rejects an otp row that carries credentials", async () => {
  await expect(
    getPrisma().user.create({
      data: {
        phoneCountryCode: "+91",
        phoneNumber: uniquePhone(),
        loginType: "otp",
        email: `sneaky-${Date.now()}@example.com`,
        passwordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMN",
      },
    })
  ).rejects.toThrow();
});

test("CHECK rejects an email row with no email", async () => {
  await expect(
    getPrisma().user.create({
      data: { loginType: "email", passwordHash: "ph", email: null },
    })
  ).rejects.toThrow();
});

test("CHECK rejects an otp row with no phone number", async () => {
  // The near-miss worth pinning: a country code alone is not an identity, and
  // it is the shape every legacy hashed row has.
  await expect(
    getPrisma().user.create({
      data: { loginType: "otp", phoneCountryCode: "+91", phoneNumber: null },
    })
  ).rejects.toThrow();
});
