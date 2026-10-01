import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.hoisted(() => vi.fn());

vi.mock("@aws-sdk/client-kinesis", () => {
  class PutRecordsCommand {
    constructor(public readonly input: unknown) {}
  }
  class KinesisClient {
    send = sendMock;
    destroy = vi.fn();
  }
  return { KinesisClient, PutRecordsCommand };
});

import { KinesisEventsRepository } from "../repositories/kinesis-events.repository";
import type { StoredEvent } from "../repositories/events.repository";

function stored(id: string): StoredEvent {
  return {
    eventId: id,
    eventName: "chat_room_entered",
    userId: `user-of-${id}`,
    deviceId: `device-of-${id}`,
    pseudoId: "",
    sessionId: 1_750_000_000_000,
    eventSeqId: 0,
    clientTsMs: 1_750_000_000_000,
    clientUploadTimeMs: 0,
    eventProperties: {},
    userProperties: {},
    groups: {},
    groupProperties: {},
    context: {
      platform: "",
      osName: "",
      osVersion: "",
      appVersion: "",
      deviceBrand: "",
      deviceModel: "",
      deviceManufacturer: "",
      carrier: "",
      country: "",
      language: "",
      library: "",
      ip: "",
      adid: "",
    },
    attempts: 0,
    retryCount: 0,
    reqGuid: "req-test",
    receivedAtMs: 1_750_000_000_500,
  };
}

interface PutRecordsInput {
  input: { StreamName: string; Records: { PartitionKey: string; Data: Uint8Array }[] };
}

describe("KinesisEventsRepository", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sendMock.mockReset();
    sendMock.mockResolvedValue({ FailedRecordCount: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function repo(batchSize = 3, flushIntervalMs = 1000) {
    return new KinesisEventsRepository({ streamName: "events", batchSize, flushIntervalMs });
  }

  it("flushes when the batch size is reached", async () => {
    const r = repo(2);
    r.addMany([stored("e-1"), stored("e-2")]);
    await r.flush();

    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0][0] as PutRecordsInput;
    expect(command.input.StreamName).toBe("events");
    expect(command.input.Records).toHaveLength(2);
    expect(command.input.Records[0].PartitionKey).toBe("user-of-e-1");
    await r.close();
  });

  it("partitions anonymous events by device id", async () => {
    const r = repo(1);
    r.addMany([{ ...stored("e-1"), userId: "" }]);
    await r.close();

    const command = sendMock.mock.calls[0][0] as PutRecordsInput;
    expect(command.input.Records[0].PartitionKey).toBe("device-of-e-1");
  });

  it("flushes on the interval timer", async () => {
    const r = repo(100, 500);
    r.addMany([stored("e-1")]);
    expect(sendMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(600);
    expect(sendMock).toHaveBeenCalledTimes(1);
    await r.close();
  });

  it("flushes the remaining buffer on close", async () => {
    const r = repo(100);
    r.addMany([stored("e-1"), stored("e-2")]);
    await r.close();

    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0][0] as PutRecordsInput;
    expect(command.input.Records).toHaveLength(2);
  });

  it("chunks oversized buffers into multiple PutRecords calls", async () => {
    const r = repo(2, 60_000);
    r.addMany([stored("e-1"), stored("e-2"), stored("e-3")]);
    await r.close();

    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it("drops the batch and keeps serving when PutRecords rejects", async () => {
    sendMock.mockRejectedValueOnce(new Error("kinesis unavailable"));
    const r = repo(1);
    r.addMany([stored("e-1")]);
    await expect(r.flush()).resolves.toBeUndefined();
    await r.close();
  });

  it("serializes the stored event snake_case + typed (ms ints, object bags) for ClickPipe", async () => {
    const r = repo(1);
    const ev = stored("e-1");
    ev.context = { ...ev.context, platform: "android", osName: "Android 14" };
    ev.eventProperties = { room_id: "room-7" };
    ev.groups = { workspace: "62646" };
    r.addMany([ev]);
    await r.close();

    const command = sendMock.mock.calls[0][0] as PutRecordsInput;
    const payload = JSON.parse(Buffer.from(command.input.Records[0].Data).toString("utf8")) as Record<string, unknown>;
    // snake_case, correctly typed: timestamps as epoch ms, bags/groups as JSON objects
    expect(payload.insert_id).toBe("e-1");
    expect(payload.event_type).toBe("chat_room_entered");
    expect(payload.event_time).toBe(1_750_000_000_000); // clientTsMs
    expect(payload.server_time).toBe(1_750_000_000_500); // receivedAtMs
    expect(payload.event_properties).toEqual({ room_id: "room-7" });
    expect(payload.groups).toEqual({ workspace: "62646" });
    expect(payload.platform).toBe("android");
    expect(payload.os_name).toBe("Android 14");
    // no camelCase duplicates, no nested context, no sent_at
    expect(payload.eventId).toBeUndefined();
    expect(payload.context).toBeUndefined();
    expect(payload.sent_at).toBeUndefined();
  });
});
