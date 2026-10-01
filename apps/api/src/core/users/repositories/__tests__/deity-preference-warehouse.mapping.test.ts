import { describe, expect, it } from "vitest";
import {
  toSyncRow,
  type WarehouseRow,
} from "@api/core/users/repositories/deity-preference-warehouse.repository";

/**
 * TAM-175 — regression cover for the warehouse row mapping.
 *
 * This exists because of a bug that shipped and was caught in manual
 * verification: `updated_at` is `DateTime64(3, 'Asia/Kolkata')`, and a
 * ClickHouse timestamp RENDERS in its column's timezone. Reading the rendered
 * text as UTC put the sync watermark 5h30m into the future, which made the next
 * run skip every preference change inside that window — silent, permanent data
 * loss. The fix is to move the instant as epoch milliseconds in both
 * directions; these tests pin that contract.
 */

function row(overrides: Partial<WarehouseRow> = {}): WarehouseRow {
  return {
    userId: "11111111-1111-4111-8111-111111111111",
    primaryDeitySlug: "ganesha",
    secondaryDeitySlug: "shiva",
    adDeitySlug: null,
    source: "outcome",
    // 2026-09-17T10:00:00Z — the instant behind the text "2026-09-17 15:30:00"
    // that ClickHouse would render for an Asia/Kolkata column.
    warehouseUpdatedAtMs: "1789639200000",
    ...overrides,
  };
}

describe("toSyncRow", () => {
  it("reads the stamp as epoch milliseconds, not as a local-time string", () => {
    expect(toSyncRow(row()).warehouseUpdatedAt).toEqual(
      new Date("2026-09-17T10:00:00.000Z")
    );
  });

  it("accepts the stamp as a JSON string — ClickHouse emits Int64 that way", () => {
    const fromString = toSyncRow(row({ warehouseUpdatedAtMs: "1789639200000" }));
    const fromNumber = toSyncRow(row({ warehouseUpdatedAtMs: 1789639200000 }));
    expect(fromString.warehouseUpdatedAt).toEqual(fromNumber.warehouseUpdatedAt);
  });

  it("normalises empty and whitespace slugs to null so a pool is never keyed on ''", () => {
    const mapped = toSyncRow(
      row({ primaryDeitySlug: "", secondaryDeitySlug: "   ", source: "" })
    );
    expect(mapped.primaryDeitySlug).toBeNull();
    expect(mapped.secondaryDeitySlug).toBeNull();
    expect(mapped.source).toBeNull();
  });

  it("trims a padded slug rather than passing a non-matching key through", () => {
    expect(toSyncRow(row({ primaryDeitySlug: " hanuman " })).primaryDeitySlug).toBe(
      "hanuman"
    );
  });

  it("normalises the production slug spellings the CMS does not have", () => {
    // Found on prod, not stage: the warehouse emits both `ganesh` (371 users)
    // and `ganesha` (26), and both `ram` (8) and `rama` (16), while only the
    // longer spelling exists in `deities.slug`. Unmapped, those users get an
    // empty pool and silently fall through to the unpersonalised feed.
    expect(toSyncRow(row({ primaryDeitySlug: "ganesh" })).primaryDeitySlug).toBe("ganesha");
    expect(toSyncRow(row({ secondaryDeitySlug: "ram" })).secondaryDeitySlug).toBe("rama");
    expect(toSyncRow(row({ adDeitySlug: "ganesh" })).adDeitySlug).toBe("ganesha");
  });

  it("leaves an already-canonical slug alone", () => {
    expect(toSyncRow(row({ primaryDeitySlug: "ganesha" })).primaryDeitySlug).toBe("ganesha");
    expect(toSyncRow(row({ primaryDeitySlug: "hanuman" })).primaryDeitySlug).toBe("hanuman");
  });

  it("does NOT invent a mapping for a slug with no CMS equivalent", () => {
    // `narsingh` (16 users) has no deity in the CMS at all. Guessing would be
    // inventing product data; it stays as-is and shows up in the sync's slug
    // histogram instead.
    expect(toSyncRow(row({ primaryDeitySlug: "narsingh" })).primaryDeitySlug).toBe("narsingh");
  });

  it("is case- and whitespace-tolerant, since the value is data we do not control", () => {
    expect(toSyncRow(row({ primaryDeitySlug: "  Ganesh " })).primaryDeitySlug).toBe("ganesha");
    expect(toSyncRow(row({ primaryDeitySlug: "HANUMAN" })).primaryDeitySlug).toBe("hanuman");
  });

  it("does not touch `source` — it is provenance text, not a slug", () => {
    expect(toSyncRow(row({ source: "Outcome" })).source).toBe("Outcome");
  });

  it("passes real nulls through untouched", () => {
    const mapped = toSyncRow(
      row({ primaryDeitySlug: null, secondaryDeitySlug: null, adDeitySlug: null })
    );
    expect(mapped.primaryDeitySlug).toBeNull();
    expect(mapped.adDeitySlug).toBeNull();
  });
});
