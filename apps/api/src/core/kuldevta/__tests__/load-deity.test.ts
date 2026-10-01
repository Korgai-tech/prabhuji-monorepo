import { describe, expect, test } from "vitest";

import { makeLoadDeity } from "@api/core/kuldevta";
import type { makeKuldevtaRepository } from "@api/core/kuldevta/repositories";

/**
 * `IKuldevtaApi.getPersonaIdentity` documents its own contract: "Returns null
 * rather than throwing: 'no kuldevta yet' is an ordinary state for a user in
 * the kuldevta chat arm, not an error." `makeLoadDeity` is the implementation
 * behind that facade, and it used to violate the contract by throwing a 404.
 *
 * Two things broke, both only visible against a live stage:
 *
 *  1. `POST /chat/messages` answered **404** for an unassigned user in the
 *     kuldevta arm, while its own route contract declares **409**. The
 *     `errorCode` was right, so the mismatch was invisible in the body.
 *  2. `hasKuldevta` — which catches, because it sits on the `GET /users/me`
 *     launch path — logged `kuldevta_assignment_lookup_failed` for every user
 *     who simply had not answered the six questions yet, making an ordinary
 *     state indistinguishable from a real kuldevta outage.
 *
 * Neither surfaced in a test, because nothing exercised the facade against a
 * user with no assignment. This is that test.
 */

type Repo = ReturnType<typeof makeKuldevtaRepository>;

function repoReturning(assignment: unknown): Repo {
  return { findAssignment: () => Promise.resolve(assignment) } as unknown as Repo;
}

describe("makeLoadDeity — the IKuldevtaApi contract", () => {
  test("resolves to null for a user with no assignment, and does not throw", async () => {
    const load = makeLoadDeity(repoReturning(null));
    await expect(load("user-with-no-kuldevta")).resolves.toBeNull();
  });

  test("resolves the deity identity for an assigned user", async () => {
    const load = makeLoadDeity(repoReturning({ kuldevtaSlug: "khandoba" }));
    const identity = await load("user-with-khandoba");
    expect(identity?.slug).toBe("khandoba");
    expect(identity?.nameRoman).toBe("Khandoba");
    // The archetype join is what makes this more than a registry lookup.
    expect(typeof identity?.archetypeVoice).toBe("string");
    expect(identity?.archetypeVoice.length).toBeGreaterThan(0);
  });

  test("an assigned slug missing from the registry is a real error, not a null", async () => {
    const load = makeLoadDeity(repoReturning({ kuldevtaSlug: "not-a-real-deity" }));
    await expect(load("user-with-bad-slug")).rejects.toThrow(/not found in registry/);
  });
});
