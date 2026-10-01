import { describe, expect, test } from "vitest";
import { StatusProfileBody } from "../status.schemas.js";

/**
 * Unit coverage for the Status overlay-profile Zod schema (TAM-71) — the single
 * source of truth for the char limits + Indian 10-digit mobile validation that
 * the route boundary enforces (a violation → 400 `VALIDATION_ERROR` via the
 * global error handler). No OTP in Phase 1; `businessName` is required on a
 * business save. Parsing the schema directly is the tightest unit proof of the
 * limits (q6): name ≤ 40, businessName ≤ 50, businessDetails ≤ 80.
 */

describe("StatusProfileBody char-limit validation", () => {
  test("rejects personalDisplayName longer than 40 chars", () => {
    const res = StatusProfileBody.safeParse({
      activeProfileType: "personal",
      personalDisplayName: "x".repeat(41),
    });
    expect(res.success).toBe(false);
  });

  test("accepts personalDisplayName at the 40-char boundary", () => {
    const res = StatusProfileBody.safeParse({
      activeProfileType: "personal",
      personalDisplayName: "x".repeat(40),
    });
    expect(res.success).toBe(true);
  });

  test("rejects businessName longer than 50 chars", () => {
    const res = StatusProfileBody.safeParse({
      activeProfileType: "business",
      businessName: "x".repeat(51),
    });
    expect(res.success).toBe(false);
  });

  test("accepts businessName at the 50-char boundary", () => {
    const res = StatusProfileBody.safeParse({
      activeProfileType: "business",
      businessName: "x".repeat(50),
    });
    expect(res.success).toBe(true);
  });

  test("rejects businessDetails longer than 80 chars", () => {
    const res = StatusProfileBody.safeParse({
      activeProfileType: "business",
      businessName: "Prabhuji Store",
      businessDetails: "x".repeat(81),
    });
    expect(res.success).toBe(false);
  });

  test("accepts businessDetails at the 80-char boundary", () => {
    const res = StatusProfileBody.safeParse({
      activeProfileType: "business",
      businessName: "Prabhuji Store",
      businessDetails: "x".repeat(80),
    });
    expect(res.success).toBe(true);
  });

  test("rejects a non-10-digit businessMobileNumber", () => {
    const res = StatusProfileBody.safeParse({
      activeProfileType: "business",
      businessName: "Prabhuji Store",
      businessMobileNumber: "12345",
    });
    expect(res.success).toBe(false);
  });

  test("rejects a businessMobileNumber that does not start with 6-9", () => {
    const res = StatusProfileBody.safeParse({
      activeProfileType: "business",
      businessName: "Prabhuji Store",
      businessMobileNumber: "1234567890",
    });
    expect(res.success).toBe(false);
  });

  test("accepts a valid Indian 10-digit businessMobileNumber", () => {
    const res = StatusProfileBody.safeParse({
      activeProfileType: "business",
      businessName: "Prabhuji Store",
      businessMobileNumber: "9876543210",
    });
    expect(res.success).toBe(true);
  });

  test("rejects a business save without businessName", () => {
    const res = StatusProfileBody.safeParse({
      activeProfileType: "business",
      businessMobileNumber: "9876543210",
    });
    expect(res.success).toBe(false);
  });

  test("accepts a valid personal profile with an https avatar URL", () => {
    const res = StatusProfileBody.safeParse({
      activeProfileType: "personal",
      personalDisplayName: "Ronak",
      avatarImageUrl: "https://cdn.example.com/avatars/ronak.png",
    });
    expect(res.success).toBe(true);
  });

  test("rejects a non-https avatar URL", () => {
    const res = StatusProfileBody.safeParse({
      activeProfileType: "personal",
      personalDisplayName: "Ronak",
      avatarImageUrl: "http://cdn.example.com/avatars/ronak.png",
    });
    expect(res.success).toBe(false);
  });
});
