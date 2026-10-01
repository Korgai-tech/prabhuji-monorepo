import { expect, test } from "vitest";
import { buildUserWhere } from "@api/core/auth/repositories/auth.repository";

/**
 * `GET /admin/users`'s `q` filter. Pure query-shape assertions — no DB — because
 * the only interesting logic is how a typed-in identifier becomes phone terms.
 */

test("no q filters to non-admins only — never a `contains: \"\"` table scan", () => {
  expect(buildUserWhere()).toEqual({ role: { not: "admin" } });
  expect(buildUserWhere(undefined)).toEqual({ role: { not: "admin" } });
});

/**
 * The admin exclusion is the endpoint's CONTRACT, so it must survive a search:
 * `role` and `OR` are ANDed, and no `q` can widen the set back to include a CMS
 * operator account.
 */
test("searching never widens the set back to include admins", () => {
  expect(buildUserWhere("a@e.com").role).toEqual({ not: "admin" });
  expect(buildUserWhere("9876543210").role).toEqual({ not: "admin" });
});

test("a plain term searches phone, email and name", () => {
  const where = buildUserWhere("9876543210");
  expect(where.OR).toEqual([
    { phoneNumber: { contains: "9876543210" } },
    { email: { contains: "9876543210", mode: "insensitive" } },
    { name: { contains: "9876543210", mode: "insensitive" } },
  ]);
});

/**
 * THE REGRESSION THIS FILE EXISTS FOR. `phoneNumber` is stored bare, with the
 * country code in its own column — so a number typed or pasted the way it is
 * DISPLAYED must still match. A raw `contains` found nothing for either of
 * these, which is the most natural way for an editor to search.
 */
test("a formatted number matches: spaces stripped, pasted country code dropped", () => {
  // Spaces/punctuation: digits-only leaves the stored value.
  expect(buildUserWhere("+91 98765 43210").OR).toContainEqual({
    phoneNumber: { contains: "9876543210" },
  });

  // >10 digits ⇒ the last 10 are tried too, so a pasted +91-prefixed number hits
  // the bare stored column.
  const pasted = buildUserWhere("+919876543210");
  expect(pasted.OR).toContainEqual({ phoneNumber: { contains: "919876543210" } });
  expect(pasted.OR).toContainEqual({ phoneNumber: { contains: "9876543210" } });
});

/**
 * `id` is `@db.Uuid`, so a `contains` on it is `uuid LIKE text` in Postgres — an
 * "operator does not exist" ERROR, not a slow query. The id clause must be an
 * exact match, and must appear ONLY when `q` is a whole UUID.
 */
test("a full UUID matches the id exactly", () => {
  const id = "ff039777-e9e7-4351-8942-eda8a87a96d8";
  expect(buildUserWhere(id).OR).toContainEqual({ id });
});

test("a partial or non-UUID term never produces an id clause", () => {
  for (const term of ["ff039777", "ff039777-e9e7", "ada", "9876543210"]) {
    const or = buildUserWhere(term).OR;
    expect(Array.isArray(or) && or.some((c) => "id" in c)).toBe(false);
  }
});

test("a term with no digits searches only email and name", () => {
  const where = buildUserWhere("ada@e.com");
  expect(where.OR).toEqual([
    { email: { contains: "ada@e.com", mode: "insensitive" } },
    { name: { contains: "ada@e.com", mode: "insensitive" } },
  ]);
});
