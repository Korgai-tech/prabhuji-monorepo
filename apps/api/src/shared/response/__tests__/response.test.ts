import { expect, test, vi } from "vitest";
import type { FastifyReply } from "fastify";
import { sendSuccess, sendError } from "../response.js";

function mockReply(): { reply: FastifyReply; code: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> } {
  const r = {} as unknown as FastifyReply & { code: unknown; send: unknown };
  const code = vi.fn().mockReturnValue(r);
  const send = vi.fn().mockReturnValue(r);
  r.code = code;
  r.send = send;
  return { reply: r, code, send };
}

test("sendSuccess wraps data in the envelope with defaults", () => {
  const { reply, code, send } = mockReply();
  sendSuccess(reply, { id: 1 });
  expect(code).toHaveBeenCalledWith(200);
  expect(send).toHaveBeenCalledWith({ success: true, message: "OK", data: { id: 1 } });
});

test("sendError produces a failure envelope with null data", () => {
  const { reply, code, send } = mockReply();
  sendError(reply, "nope", 404);
  expect(code).toHaveBeenCalledWith(404);
  expect(send).toHaveBeenCalledWith({ success: false, message: "nope", data: null });
});
