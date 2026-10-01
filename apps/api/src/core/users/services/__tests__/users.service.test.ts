import { beforeEach, describe, expect, test, vi } from "vitest";
import { UsersService } from "../users.service.js";
import type { UsersRepository, UserRow } from "@api/core/users/repositories";

/**
 * Unit coverage for the users service. All Prisma calls are mocked at the
 * repository seam so these tests exercise only the update-orchestration
 * logic (patch application + onboarding-complete flip semantics).
 *
 * Trimming and enum validation are enforced at the Zod boundary (see
 * routes/users.schemas.ts) — the service receives already-normalized input
 * and does NOT re-trim. The corresponding assertion lives in the integration
 * suite (raw HTTP body `"  Ram  "` → persisted `"Ram"`).
 */

function makeRepo(current: UserRow): {
  repo: UsersRepository;
  findById: ReturnType<typeof vi.fn>;
  updateById: ReturnType<typeof vi.fn>;
} {
  const state: UserRow = { ...current };
  const findById = vi.fn(() => Promise.resolve<UserRow>({ ...state }));
  const updateById = vi.fn(
    (
      _id: string,
      data: {
        name?: string;
        selectedLanguage?: string;
        onboardingCompletedAt?: Date;
      }
    ) => {
      if (data.name !== undefined) state.name = data.name;
      if (data.selectedLanguage !== undefined)
        state.selectedLanguage = data.selectedLanguage;
      if (data.onboardingCompletedAt !== undefined)
        state.onboardingCompletedAt = data.onboardingCompletedAt;
      return Promise.resolve<UserRow>({ ...state });
    }
  );
  const repo = { findById, updateById } as unknown as UsersRepository;
  return { repo, findById, updateById };
}

const BASE: UserRow = {
  id: "u-1",
  name: null,
  selectedLanguage: null,
  onboardingCompletedAt: null,
  phoneCountryCode: "+91",
  phoneNumber: "9876543210",
};

beforeEach(() => {
  vi.useRealTimers();
});

describe("UsersService.updateMe — onboarding-complete flip", () => {
  test("patching both name and language flips onboardingCompletedAt", async () => {
    const { repo, updateById } = makeRepo({ ...BASE });
    const service = new UsersService(repo);

    const result = await service.updateMe("u-1", {
      name: "Ram",
      selectedLanguage: "hi",
    });

    expect(result.name).toBe("Ram");
    expect(result.selectedLanguage).toBe("hi");
    expect(result.onboardingCompletedAt).not.toBeNull();

    const call = updateById.mock.calls[0]?.[1] as {
      name?: string;
      selectedLanguage?: string;
      onboardingCompletedAt?: Date;
    };
    expect(call.name).toBe("Ram");
    expect(call.selectedLanguage).toBe("hi");
    expect(call.onboardingCompletedAt).toBeInstanceOf(Date);
  });

  test("name-only patch on a user with no prior language keeps onboarding null", async () => {
    const { repo, updateById } = makeRepo({ ...BASE });
    const service = new UsersService(repo);

    const result = await service.updateMe("u-1", { name: "Ram" });

    expect(result.name).toBe("Ram");
    expect(result.selectedLanguage).toBeNull();
    expect(result.onboardingCompletedAt).toBeNull();

    const call = updateById.mock.calls[0]?.[1] as {
      onboardingCompletedAt?: Date;
    };
    expect(call.onboardingCompletedAt).toBeUndefined();
  });

  test("language-only patch on a user WITH a prior name flips onboardingCompletedAt", async () => {
    const { repo } = makeRepo({ ...BASE, name: "Ram" });
    const service = new UsersService(repo);

    const result = await service.updateMe("u-1", { selectedLanguage: "mr" });

    expect(result.selectedLanguage).toBe("mr");
    expect(result.onboardingCompletedAt).not.toBeNull();
  });

  test("idempotency — already-complete user with same values does NOT move onboardingCompletedAt", async () => {
    const originalCompleted = new Date("2025-01-01T00:00:00.000Z");
    const { repo, updateById } = makeRepo({
      ...BASE,
      name: "Ram",
      selectedLanguage: "hi",
      onboardingCompletedAt: originalCompleted,
    });
    const service = new UsersService(repo);

    const result = await service.updateMe("u-1", {
      name: "Ram",
      selectedLanguage: "hi",
    });

    expect(result.onboardingCompletedAt).toBe(originalCompleted.toISOString());

    // The repo write for this patch must NOT include onboardingCompletedAt —
    // otherwise a client could re-touch the timestamp on every save.
    const call = updateById.mock.calls[0]?.[1] as {
      onboardingCompletedAt?: Date;
    };
    expect(call.onboardingCompletedAt).toBeUndefined();
  });

  test("second patch after completion never rewrites onboardingCompletedAt", async () => {
    const { repo, updateById } = makeRepo({ ...BASE });
    const service = new UsersService(repo);

    // First save — flips the timestamp.
    await service.updateMe("u-1", { name: "Ram", selectedLanguage: "hi" });
    const firstCall = updateById.mock.calls[0]?.[1] as {
      onboardingCompletedAt?: Date;
    };
    expect(firstCall.onboardingCompletedAt).toBeInstanceOf(Date);

    // Second save — must NOT include onboardingCompletedAt (user is
    // already complete).
    await service.updateMe("u-1", { name: "Rama" });
    const secondCall = updateById.mock.calls[1]?.[1] as {
      onboardingCompletedAt?: Date;
    };
    expect(secondCall.onboardingCompletedAt).toBeUndefined();
  });
});

describe("UsersService.updateMe — public shape hygiene", () => {
  test("returned shape has only public fields (never email/passwordHash)", async () => {
    const { repo } = makeRepo({ ...BASE });
    const service = new UsersService(repo);
    const result = await service.updateMe("u-1", { name: "Ram" });
    // `phoneNumber` IS public now — the app has no other identity fact about
    // its own user, and it needs to show which number notifications reach.
    // Credentials never are.
    expect(Object.keys(result).sort()).toEqual(
      [
        "id",
        "name",
        "onboardingCompletedAt",
        "phoneCountryCode",
        "phoneNumber",
        "selectedLanguage",
      ].sort()
    );
  });

  test("selectedLanguage narrows unknown DB values to null (defensive)", async () => {
    const { repo } = makeRepo({
      ...BASE,
      selectedLanguage: "xx" /* not a Phase-1 code */,
    });
    const service = new UsersService(repo);
    const result = await service.getMe("u-1");
    expect(result.selectedLanguage).toBeNull();
  });

  test("onboardingCompletedAt is serialized as an ISO-8601 string", async () => {
    const at = new Date("2025-06-15T10:30:00.000Z");
    const { repo } = makeRepo({
      ...BASE,
      name: "Ram",
      selectedLanguage: "hi",
      onboardingCompletedAt: at,
    });
    const service = new UsersService(repo);
    const result = await service.getMe("u-1");
    expect(result.onboardingCompletedAt).toBe(at.toISOString());
  });
});

describe("UsersService.getMe / updateMe — user not found", () => {
  test("getMe throws UNAUTHORIZED (401) when the user row is gone", async () => {
    const repo = {
      findById: vi.fn(() => Promise.resolve(null)),
      updateById: vi.fn(),
    } as unknown as UsersRepository;
    const service = new UsersService(repo);
    await expect(service.getMe("u-missing")).rejects.toMatchObject({
      statusCode: 401,
      errorCode: "UNAUTHORIZED",
    });
  });

  test("updateMe throws UNAUTHORIZED (401) when the user row is gone", async () => {
    const repo = {
      findById: vi.fn(() => Promise.resolve(null)),
      updateById: vi.fn(),
    } as unknown as UsersRepository;
    const service = new UsersService(repo);
    await expect(
      service.updateMe("u-missing", { name: "Ram" })
    ).rejects.toMatchObject({ statusCode: 401, errorCode: "UNAUTHORIZED" });
  });
});

/**
 * TAM-258 — `getLanding` is the seam between the pure ladder (covered
 * exhaustively in `landing.service.test.ts`) and the database. What is worth
 * asserting HERE is only what that seam owns: the consume write actually
 * happens when the ladder asks for it, and nothing about this call can take
 * `/users/me` down.
 */
describe("UsersService.getLanding", () => {
  function makeLandingRepo(over: {
    findLandingRow?: ReturnType<typeof vi.fn>;
    markAdLandingConsumed?: ReturnType<typeof vi.fn>;
  }): {
    repo: UsersRepository;
    markAdLandingConsumed: ReturnType<typeof vi.fn>;
  } {
    const markAdLandingConsumed =
      over.markAdLandingConsumed ?? vi.fn(() => Promise.resolve());
    const repo = {
      findLandingRow: over.findLandingRow ?? vi.fn(() => Promise.resolve(null)),
      markAdLandingConsumed,
    } as unknown as UsersRepository;
    return { repo, markAdLandingConsumed };
  }

  test("out of the experiment ⇒ home, and nothing is written", async () => {
    const { repo, markAdLandingConsumed } = makeLandingRepo({});
    const service = new UsersService(repo);
    const landing = await service.getLanding("u-1", "1.2.0");
    expect(landing).toEqual({
      deeplink: "",
      module: "home",
      source: "not_in_experiment",
      utmCode: "",
    });
    expect(markAdLandingConsumed).not.toHaveBeenCalled();
  });

  /**
   * A profile read must not 500 because the landing lookup fell over — Home is
   * not a degraded answer here, it is what every user saw before this existed.
   */
  test("a repository failure falls back to home rather than throwing", async () => {
    const { repo } = makeLandingRepo({
      findLandingRow: vi.fn(() => Promise.reject(new Error("db down"))),
    });
    const service = new UsersService(repo);
    await expect(service.getLanding("u-1", "1.2.0")).resolves.toEqual({
      deeplink: "",
      module: "home",
      source: "not_in_experiment",
      utmCode: "",
    });
  });

  /** The write is AWAITED, so a double launch cannot serve the one-shot twice. */
  test("a failed consume write is swallowed, and the user still gets their landing", async () => {
    const { repo } = makeLandingRepo({
      findLandingRow: vi.fn(() => Promise.reject(new Error("db down"))),
      markAdLandingConsumed: vi.fn(() => Promise.reject(new Error("write failed"))),
    });
    const service = new UsersService(repo);
    await expect(service.getLanding("u-1", "1.2.0")).resolves.toHaveProperty("module", "home");
  });
});
