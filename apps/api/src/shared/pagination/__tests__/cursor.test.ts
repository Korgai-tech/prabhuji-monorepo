import { describe, expect, it, test } from "vitest";
import {
  buildPage,
  decodeCursor,
  decodeRotationCursor,
  encodeCursor,
  encodeRotationCursor,
  type CursorKey,
} from "../cursor.js";
import { AppError } from "@api/shared/errors";

describe("cursor encode/decode", () => {
  test("round-trips the stable sort key", () => {
    const key: CursorKey = { sortOrder: 3, id: "abc-123" };
    const decoded = decodeCursor(encodeCursor(key));
    expect(decoded).toEqual(key);
  });

  test("produces an opaque base64url token (no raw json)", () => {
    const token = encodeCursor({ sortOrder: 1, id: "x" });
    expect(token).not.toContain("sortOrder");
    expect(token).not.toContain("{");
  });

  test("decode of a malformed cursor throws a 400 ValidationError", () => {
    try {
      decodeCursor("!!!not-base64-json!!!");
      throw new Error("expected decodeCursor to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(400);
      expect((err as AppError).errorCode).toBe("INVALID_CURSOR");
    }
  });

  test("decode of a valid base64 but wrong shape throws 400", () => {
    const bad = Buffer.from(JSON.stringify({ foo: "bar" }), "utf8").toString(
      "base64url"
    );
    expect(() => decodeCursor(bad)).toThrowError(/Invalid pagination cursor/);
  });
});

describe("buildPage", () => {
  const toKey = (r: { sortOrder: number; id: string }): CursorKey => ({
    sortOrder: r.sortOrder,
    id: r.id,
  });

  test("last page (rows <= limit) yields nextCursor null", () => {
    const rows = [
      { sortOrder: 0, id: "a" },
      { sortOrder: 1, id: "b" },
    ];
    const page = buildPage(rows, 20, toKey);
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  test("exactly-full page (rows === limit) yields nextCursor null", () => {
    const rows = [
      { sortOrder: 0, id: "a" },
      { sortOrder: 1, id: "b" },
    ];
    const page = buildPage(rows, 2, toKey);
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  test("over-fetched page (rows === limit + 1) trims + sets nextCursor to last kept key", () => {
    const rows = [
      { sortOrder: 0, id: "a" },
      { sortOrder: 1, id: "b" },
      { sortOrder: 2, id: "c" },
    ];
    const page = buildPage(rows, 2, toKey);
    expect(page.items.map((r) => r.id)).toEqual(["a", "b"]);
    expect(page.nextCursor).not.toBeNull();
    // The cursor points at the LAST KEPT row (b), not the dropped over-fetch (c).
    expect(decodeCursor(page.nextCursor as string)).toEqual({
      sortOrder: 1,
      id: "b",
    });
  });

  test("empty result yields nextCursor null", () => {
    const page = buildPage([] as { sortOrder: number; id: string }[], 20, toKey);
    expect(page.items).toHaveLength(0);
    expect(page.nextCursor).toBeNull();
  });
});

/**
 * TAM-175 — the deity pair rides in the rotation cursor so that a preference
 * changing mid-scroll cannot reorder a session already open (spec §7).
 */
describe("rotation cursor — deity pair", () => {
  it("round-trips a pair", () => {
    const encoded = encodeRotationCursor({
      epoch: 42,
      offset: 20,
      d1: "ganesha",
      d2: "shiva",
    });
    expect(decodeRotationCursor(encoded)).toEqual({
      epoch: 42,
      offset: 20,
      d1: "ganesha",
      d2: "shiva",
    });
  });

  it("keeps ABSENT and null distinct — one means 'not deity-aware', the other 'no god'", () => {
    const notAware = decodeRotationCursor(
      encodeRotationCursor({ epoch: 1, offset: 0 })
    );
    expect(notAware).not.toHaveProperty("d1");

    const noGod = decodeRotationCursor(
      encodeRotationCursor({ epoch: 1, offset: 0, d1: null, d2: null })
    );
    expect(noGod).toEqual({ epoch: 1, offset: 0, d1: null, d2: null });
  });

  it("still accepts a pre-TAM-175 cursor rather than restarting the session", () => {
    const legacy = Buffer.from(JSON.stringify({ epoch: 7, offset: 30 }), "utf8").toString(
      "base64url"
    );
    expect(decodeRotationCursor(legacy)).toEqual({ epoch: 7, offset: 30 });
  });

  it("rejects a non-string deity rather than handing it to the weave as a key", () => {
    const hostile = Buffer.from(
      JSON.stringify({ epoch: 1, offset: 0, d1: { evil: true } }),
      "utf8"
    ).toString("base64url");
    expect(decodeRotationCursor(hostile)).toBeNull();
  });

  it("rejects an over-long slug", () => {
    const hostile = Buffer.from(
      JSON.stringify({ epoch: 1, offset: 0, d1: "x".repeat(65) }),
      "utf8"
    ).toString("base64url");
    expect(decodeRotationCursor(hostile)).toBeNull();
  });

  it("rejects an empty-string slug — that is not a deity", () => {
    const hostile = Buffer.from(
      JSON.stringify({ epoch: 1, offset: 0, d1: "" }),
      "utf8"
    ).toString("base64url");
    expect(decodeRotationCursor(hostile)).toBeNull();
  });
});
