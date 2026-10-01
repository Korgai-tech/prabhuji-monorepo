import { describe, expect, test } from "vitest";
import {
  CancellationRequestData,
  CancellationRequestStatusEnum,
  CreateCancellationRequestBody,
} from "../subscription-cancel-request.schemas.js";

/**
 * Zod validation for TAM-125's wire shapes. These are the OpenAPI source of
 * truth — the same schemas the Fastify response serializer runs and the
 * OpenAPI emitter reads. If any of these tests fail, the emitted contract is
 * drifting.
 */

describe("CancellationRequestStatusEnum", () => {
  test.each(["pending", "processing", "completed", "rejected"])(
    "accepts %s",
    (status) => {
      expect(CancellationRequestStatusEnum.safeParse(status).success).toBe(true);
    }
  );

  test("rejects an unknown status on the wire", () => {
    // Unknown values are narrowed to `pending` by the service before the
    // response reaches the serializer — this asserts that if a narrowing
    // oversight ever lets one through, it fails LOUDLY.
    expect(CancellationRequestStatusEnum.safeParse("banana").success).toBe(false);
  });
});

describe("CancellationRequestData", () => {
  const VALID = {
    id: "b3f9f8f0-3f4a-4b0f-8f0f-0f0f0f0f0f0f",
    status: "pending" as const,
    reason: null,
    requestedAt: "2026-07-31T12:00:00.000Z",
    processedAt: null,
  };

  test("accepts a minimal pending row", () => {
    expect(CancellationRequestData.safeParse(VALID).success).toBe(true);
  });

  test("accepts a completed row with a processedAt datetime", () => {
    expect(
      CancellationRequestData.safeParse({
        ...VALID,
        status: "completed",
        processedAt: "2026-08-01T00:00:00.000Z",
      }).success
    ).toBe(true);
  });

  test("accepts a reason string", () => {
    expect(
      CancellationRequestData.safeParse({ ...VALID, reason: "too expensive" })
        .success
    ).toBe(true);
  });

  test("rejects a malformed requestedAt", () => {
    expect(
      CancellationRequestData.safeParse({
        ...VALID,
        requestedAt: "not-a-date",
      }).success
    ).toBe(false);
  });

  test("rejects a non-uuid id", () => {
    expect(
      CancellationRequestData.safeParse({ ...VALID, id: "not-a-uuid" }).success
    ).toBe(false);
  });

  test("rejects an unknown status", () => {
    expect(
      CancellationRequestData.safeParse({ ...VALID, status: "queued" }).success
    ).toBe(false);
  });
});

describe("CreateCancellationRequestBody", () => {
  test("accepts an empty body", () => {
    // The v1 UI sends no fields — reason is optional and never populated by
    // the Flutter app in this ticket.
    expect(CreateCancellationRequestBody.safeParse({}).success).toBe(true);
  });

  test("accepts a trimmed reason", () => {
    const result = CreateCancellationRequestBody.safeParse({
      reason: "too expensive",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reason).toBe("too expensive");
    }
  });

  test("trims whitespace on reason", () => {
    const result = CreateCancellationRequestBody.safeParse({
      reason: "  bloat  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reason).toBe("bloat");
    }
  });

  test("rejects an empty-string reason after trim", () => {
    expect(
      CreateCancellationRequestBody.safeParse({ reason: "   " }).success
    ).toBe(false);
  });

  test("rejects a reason over 500 characters", () => {
    expect(
      CreateCancellationRequestBody.safeParse({ reason: "x".repeat(501) })
        .success
    ).toBe(false);
  });
});
