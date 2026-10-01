import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Mock } from "vitest";
import { AppError } from "@api/shared/errors";
import { SubscriptionCancelRequestController } from "../subscription-cancel-request.controller.js";
import type {
  CancellationRequestView,
  SubscriptionCancelRequestService,
} from "../../services/index.js";

/**
 * Controller-level unit coverage for the cancellation-request endpoints
 * (TAM-125). Real service is stubbed; the controller's job is thin — assert
 * auth guard, verify caller id is threaded from the JWT, verify the envelope
 * shape and status code.
 */

interface ServiceMock {
  createRequest: Mock;
  getLatestForUser: Mock;
}

function makeMocks(): {
  service: ServiceMock;
  controller: SubscriptionCancelRequestController;
} {
  const service: ServiceMock = {
    createRequest: vi.fn(),
    getLatestForUser: vi.fn(),
  };
  const controller = new SubscriptionCancelRequestController(
    service as unknown as SubscriptionCancelRequestService
  );
  return { service, controller };
}

function fakeReply() {
  const reply = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return reply;
}

const VIEW: CancellationRequestView = {
  id: "req-1",
  status: "pending",
  reason: null,
  requestedAt: "2026-07-31T12:00:00.000Z",
  processedAt: null,
};

describe("SubscriptionCancelRequestController.create", () => {
  let mocks: ReturnType<typeof makeMocks>;

  beforeEach(() => {
    mocks = makeMocks();
  });

  test("returns 201 with the envelope on success", async () => {
    mocks.service.createRequest.mockResolvedValueOnce(VIEW);
    const reply = fakeReply();
    const req = { user: { id: "user-1" }, body: {} } as never;

    await mocks.controller.create(req, reply as never);

    expect(mocks.service.createRequest).toHaveBeenCalledWith({
      userId: "user-1",
      reason: null,
    });
    expect(reply.code).toHaveBeenCalledWith(201);
    expect(reply.send).toHaveBeenCalledWith({
      success: true,
      message: "Cancellation request raised",
      data: VIEW,
    });
  });

  test("threads a reason from the body when present", async () => {
    mocks.service.createRequest.mockResolvedValueOnce({
      ...VIEW,
      reason: "too expensive",
    });
    const reply = fakeReply();
    const req = {
      user: { id: "user-1" },
      body: { reason: "too expensive" },
    } as never;

    await mocks.controller.create(req, reply as never);

    expect(mocks.service.createRequest).toHaveBeenCalledWith({
      userId: "user-1",
      reason: "too expensive",
    });
  });

  test("throws Unauthorized when req.user is missing", async () => {
    const reply = fakeReply();
    const req = { body: {} } as never;

    await expect(
      mocks.controller.create(req, reply as never)
    ).rejects.toMatchObject({
      constructor: AppError,
      statusCode: 401,
      errorCode: "UNAUTHORIZED",
    });
    expect(mocks.service.createRequest).not.toHaveBeenCalled();
  });
});

describe("SubscriptionCancelRequestController.getMineLatest", () => {
  let mocks: ReturnType<typeof makeMocks>;

  beforeEach(() => {
    mocks = makeMocks();
  });

  test("returns 200 with the row when one exists", async () => {
    mocks.service.getLatestForUser.mockResolvedValueOnce(VIEW);
    const reply = fakeReply();
    const req = { user: { id: "user-1" } } as never;

    await mocks.controller.getMineLatest(req, reply as never);

    expect(mocks.service.getLatestForUser).toHaveBeenCalledWith("user-1");
    expect(reply.code).toHaveBeenCalledWith(200);
    expect(reply.send).toHaveBeenCalledWith({
      success: true,
      message: "OK",
      data: VIEW,
    });
  });

  test("returns 200 with data: null when the user has no request", async () => {
    // Deliberately null, not 404 — matches `GET /payment/mandate`. The mobile
    // client renders "no active cancellation" from data: null.
    mocks.service.getLatestForUser.mockResolvedValueOnce(null);
    const reply = fakeReply();
    const req = { user: { id: "user-1" } } as never;

    await mocks.controller.getMineLatest(req, reply as never);

    expect(reply.code).toHaveBeenCalledWith(200);
    expect(reply.send).toHaveBeenCalledWith({
      success: true,
      message: "OK",
      data: null,
    });
  });

  test("throws Unauthorized when req.user is missing", async () => {
    const reply = fakeReply();
    const req = {} as never;

    await expect(
      mocks.controller.getMineLatest(req, reply as never)
    ).rejects.toMatchObject({
      constructor: AppError,
      statusCode: 401,
      errorCode: "UNAUTHORIZED",
    });
    expect(mocks.service.getLatestForUser).not.toHaveBeenCalled();
  });
});
