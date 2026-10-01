import { describe, expect, it } from "vitest";
import { TARGETS } from "@prabhuji/media-profiles";
import { MEDIA_ALLOWLIST } from "../../src/core/media/media.allowlist.js";

describe("media-profiles TARGETS", () => {
  it("only targets columns the media allowlist registers", () => {
    for (const t of TARGETS) expect(MEDIA_ALLOWLIST[t.field], t.field).toBeDefined();
  });
});
