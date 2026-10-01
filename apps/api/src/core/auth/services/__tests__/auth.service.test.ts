import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { beforeEach, expect, test, vi } from "vitest";
import { resetEnvCache } from "@api/shared/config";
import { AuthService } from "../auth.service.js";
import type { AuthRepository, UserRecord } from "@api/core/auth/repositories";

function makeRepo(overrides: Partial<AuthRepository> = {}): AuthRepository {
  return {
    createUser: vi.fn(),
    findByEmail: vi.fn(),
    findById: vi.fn(),
    listUsers: vi.fn(),
    updateRole: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  // EnvSchema validates as a unit, so every required var must be set even
  // though auth never reads the pepper (loadEnv() here is for JWT_SECRET).
  process.env.AUTH_OTP_PEPPER = "unit-test-pepper-not-secret-32chars";
  resetEnvCache();
});

test("register hashes the password and returns the public user", async () => {
  const stored: UserRecord = { id: "u1", email: "a@b.com", name: "A", passwordHash: "unused", role: "user", loginType: "email" };
  const createUser = vi.fn((i: { passwordHash: string; role: string }) => {
    expect(i.passwordHash).not.toBe("pw");
    // TAM-82 AC (e): register ALWAYS creates a `user`. `/auth/register` is
    // public and unguarded, so a role that could be influenced from outside
    // would be a self-service admin factory. `RegisterBody` has no `role` field
    // and Zod strips unknown keys — this asserts the second, independent layer:
    // the service hard-codes it rather than trusting that library default.
    expect(i.role).toBe("user");
    return Promise.resolve(stored);
  });
  const repo = makeRepo({ findByEmail: vi.fn(() => Promise.resolve(null)), createUser });
  const svc = new AuthService(repo);
  const user = await svc.register({
    email: "a@b.com",
    name: "A",
    password: "pw",
    // A caller trying to smuggle a role past the service. `RegisterInput` has no
    // such field, so this is a deliberate cast to simulate what a hostile body
    // would look like if Zod's unknown-key stripping ever stopped applying.
    ...({ role: "admin" } as object),
  });
  expect(user).toEqual({ id: "u1", email: "a@b.com" });
});

test("register emits a user.registered domain event", async () => {
  const stored: UserRecord = { id: "u1", email: "a@b.com", name: "A", passwordHash: "h", role: "user", loginType: "email" };
  const repo = makeRepo({
    findByEmail: vi.fn(() => Promise.resolve(null)),
    createUser: vi.fn(() => Promise.resolve(stored)),
  });
  const publish = vi.fn(() => Promise.resolve());
  const events = { publish, addConsumer: vi.fn(), start: vi.fn(), close: vi.fn() };
  const svc = new AuthService(repo, events);
  await svc.register({ email: "a@b.com", name: "A", password: "pw" });
  expect(publish).toHaveBeenCalledWith("user.registered", { userId: "u1", email: "a@b.com" }, "u1");
});

test("register does not emit for a duplicate email", async () => {
  const existing: UserRecord = { id: "u1", email: "a@b.com", name: "A", passwordHash: "h", role: "user", loginType: "email" };
  const repo = makeRepo({ findByEmail: vi.fn(() => Promise.resolve(existing)) });
  const publish = vi.fn(() => Promise.resolve());
  const events = { publish, addConsumer: vi.fn(), start: vi.fn(), close: vi.fn() };
  const svc = new AuthService(repo, events);
  await expect(svc.register({ email: "a@b.com", name: "A", password: "pw" })).rejects.toBeDefined();
  expect(publish).not.toHaveBeenCalled();
});

test("register rejects a duplicate email with ValidationError", async () => {
  const existing: UserRecord = { id: "u1", email: "a@b.com", name: "A", passwordHash: "h", role: "user", loginType: "email" };
  const repo = makeRepo({ findByEmail: vi.fn(() => Promise.resolve(existing)) });
  const svc = new AuthService(repo);
  await expect(svc.register({ email: "a@b.com", name: "A", password: "pw" })).rejects.toMatchObject(
    { statusCode: 400 }
  );
});

test("login returns a token that verifyToken accepts", async () => {
  const hash = await bcrypt.hash("pw", 10);
  const rec: UserRecord = { id: "u9", email: "a@b.com", name: "A", passwordHash: hash, role: "user", loginType: "email" };
  const repo = makeRepo({
    findByEmail: vi.fn(() => Promise.resolve(rec)),
    findById: vi.fn(() => Promise.resolve(rec)),
  });
  const svc = new AuthService(repo);
  const { token, user } = await svc.login({ email: "a@b.com", password: "pw" });
  expect(user).toEqual({ id: "u9", email: "a@b.com" });
  expect(await svc.verifyToken(token)).toEqual({ id: "u9", email: "a@b.com" });
});

test("login with a wrong password throws AppError(401)", async () => {
  const hash = await bcrypt.hash("right", 10);
  const rec: UserRecord = { id: "u9", email: "a@b.com", name: "A", passwordHash: hash, role: "user", loginType: "email" };
  const repo = makeRepo({ findByEmail: vi.fn(() => Promise.resolve(rec)) });
  const svc = new AuthService(repo);
  await expect(svc.login({ email: "a@b.com", password: "wrong" })).rejects.toMatchObject({
    statusCode: 401,
  });
});

/**
 * A phone account must be unreachable through the password endpoint.
 *
 * This used to hold BY ACCIDENT: OTP signups stored 32 random bytes of hex in
 * `passwordHash`, and `bcryptjs` happens to resolve `false` for any value that
 * isn't exactly 60 characters — so the account was safe because of a length
 * check inside a dependency, not because anyone decided it. `loginType` decides
 * it now, and these pin that.
 */
test("login against an otp account is rejected before bcrypt runs", async () => {
  const compare = vi.spyOn(bcrypt, "compare");
  const rec: UserRecord = {
    id: "u-otp",
    email: null,
    name: null,
    passwordHash: null,
    role: "user",
    loginType: "otp",
  };
  const repo = makeRepo({ findByEmail: vi.fn(() => Promise.resolve(rec)) });
  const svc = new AuthService(repo);

  await expect(
    svc.login({ email: "a@b.com", password: "anything" })
  ).rejects.toMatchObject({ statusCode: 401, errorCode: "INVALID_CREDENTIALS" });

  // Not merely "returns false" — the comparison never happens at all.
  expect(compare).not.toHaveBeenCalled();
  compare.mockRestore();
});

test("login against an otp account that somehow HAS a password is still rejected", async () => {
  // The CHECK constraint makes this row unrepresentable in Postgres. The guard
  // keys on `loginType` rather than on `passwordHash === null` precisely so the
  // two defences are independent — if the constraint were ever dropped, this
  // would still deny.
  const hash = await bcrypt.hash("pw", 10);
  const rec: UserRecord = {
    id: "u-otp",
    email: "a@b.com",
    name: null,
    passwordHash: hash,
    role: "user",
    loginType: "otp",
  };
  const repo = makeRepo({ findByEmail: vi.fn(() => Promise.resolve(rec)) });
  const svc = new AuthService(repo);

  await expect(
    svc.login({ email: "a@b.com", password: "pw" })
  ).rejects.toMatchObject({ statusCode: 401 });
});

test("verifyToken normalises a missing email claim to null", async () => {
  // Tokens minted by `core/otp` omit the claim entirely. `req.user.email` must
  // have one shape, not sometimes-undefined and sometimes-null.
  const svc = new AuthService(makeRepo());
  const token = jwt.sign({ sub: "u-otp" }, process.env.JWT_SECRET!, {
    expiresIn: "1h",
  });
  expect(await svc.verifyToken(token)).toEqual({ id: "u-otp", email: null });
});
