import { expect, test } from "vitest";
import { AppError, ValidationError } from "../errors.js";

test("AppError carries status code and defaults to 500", () => {
  const e = new AppError("boom");
  expect(e).toBeInstanceOf(Error);
  expect(e.statusCode).toBe(500);
  expect(e.name).toBe("AppError");
});

test("ValidationError is an AppError with status 400", () => {
  const e = new ValidationError("bad input");
  expect(e).toBeInstanceOf(AppError);
  expect(e.statusCode).toBe(400);
  expect(e.errorCode).toBe("VALIDATION_ERROR");
});
