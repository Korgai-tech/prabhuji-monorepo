import { expect, test } from "vitest";
import { createModuleLogger } from "../logger.js";

test("createModuleLogger binds the module namespace", () => {
  const log = createModuleLogger("auth:service");
  expect(log.bindings().module).toBe("auth:service");
});
