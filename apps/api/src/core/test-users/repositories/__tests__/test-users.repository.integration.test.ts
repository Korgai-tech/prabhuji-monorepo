import { afterAll, beforeAll, expect, test } from "vitest";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { disconnectPrisma, getPrisma } from "@api/shared/database";
import { OtpRepository } from "@api/core/otp/repositories";
import { SubscriptionRepository } from "@api/core/subscription/repositories";
import { TestUsersRepository } from "../test-users.repository.js";

const repo = new TestUsersRepository();
const otpRepo = new OtpRepository();
const subs = new SubscriptionRepository();

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
  return `8${String(phoneSeq).padStart(9, "0")}`;
}

test("a new number becomes a flagged test user that the OTP lookup sees", async () => {
  const phone = uniquePhone();
  const first = await repo.ensureTestUser("+91", phone);
  expect(first).toMatchObject({ isTestUser: true, created: true });
  await expect(otpRepo.isTestUserPhone("+91", phone)).resolves.toBe(true);

  // Re-submitting is an update, never a second row.
  const again = await repo.ensureTestUser("+91", phone);
  expect(again).toMatchObject({ id: first.id, isTestUser: true, created: false });
});

test("an existing REAL account is never flagged", async () => {
  const phone = uniquePhone();
  const realId = await otpRepo.ensureUserForPhone("+91", phone);

  const row = await repo.ensureTestUser("+91", phone);

  expect(row).toMatchObject({ id: realId, isTestUser: false, created: false });
  await expect(otpRepo.isTestUserPhone("+91", phone)).resolves.toBe(false);
});

test("complimentary Pro grants lifetime active, and revoke returns it to free", async () => {
  const { id } = await repo.ensureTestUser("+91", uniquePhone());
  await subs.upsertFreeForUser(id);

  await subs.setComplimentaryPro(id, true);
  const granted = await subs.findByUserId(id);
  expect(granted).toMatchObject({ status: "active", provider: "admin_test", expiresAt: null });
  // A null expiry is lifetime: the lapse sweep must never pick it up.
  const swept = await subs.expireLapsed(new Date(Date.now() + 10 * 365 * 86_400_000));
  expect(swept.map((r) => r.userId)).not.toContain(id);

  await subs.setComplimentaryPro(id, false);
  await expect(subs.findByUserId(id)).resolves.toMatchObject({ status: "free", provider: null });
});

test("revoke never touches a subscription it did not grant", async () => {
  const { id } = await repo.ensureTestUser("+91", uniquePhone());
  await getPrisma().subscription.create({
    data: { userId: id, status: "active", provider: "decentro", expiresAt: new Date(Date.now() + 86_400_000) },
  });

  await subs.setComplimentaryPro(id, false);

  await expect(subs.findByUserId(id)).resolves.toMatchObject({
    status: "active",
    provider: "decentro",
  });
});

test("the list returns only test users, with the recorded bucket, searchable by number", async () => {
  const phone = uniquePhone();
  const { id } = await repo.ensureTestUser("+91", phone);
  await repo.recordBucket(id, 314);
  const realPhone = uniquePhone();
  const realId = await otpRepo.ensureUserForPhone("+91", realPhone);
  // Guarded: a real account never carries a bucket, even if asked.
  await repo.recordBucket(realId, 1);

  const all = await repo.listTestUsers({ page: 1, pageSize: 100 });
  const ids = all.rows.map((r) => r.id);
  expect(ids).toContain(id);
  expect(ids).not.toContain(realId);
  expect(all.rows.find((r) => r.id === id)?.testBucket).toBe(314);
  const real = await getPrisma().user.findUnique({ where: { id: realId } });
  expect(real?.testBucket).toBeNull();

  const searched = await repo.listTestUsers({ page: 1, pageSize: 100, q: phone.slice(-4) });
  expect(searched.rows.map((r) => r.id)).toEqual([id]);
});

test("findByUserIds returns one query's worth of rows for a batch", async () => {
  const a = await repo.ensureTestUser("+91", uniquePhone());
  const b = await repo.ensureTestUser("+91", uniquePhone());
  await subs.upsertFreeForUser(a.id);
  await subs.setComplimentaryPro(a.id, true);

  const rows = await subs.findByUserIds([a.id, b.id]);

  expect(rows.map((r) => r.userId)).toEqual([a.id]);
  expect(rows[0]).toMatchObject({ status: "active", provider: "admin_test" });
});
