// Real Kinesis integration: floci-aws in a throwaway container (testcontainers),
// the actual KinesisEventsRepository writing to a real stream, verified by
// reading the records back. Mirrors apps/api's testcontainers Postgres test.
// Needs Docker; runs under `pnpm nx test events --configuration=integration`.
import {
  CreateStreamCommand,
  DescribeStreamCommand,
  GetRecordsCommand,
  GetShardIteratorCommand,
  KinesisClient,
} from "@aws-sdk/client-kinesis";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StoredEvent } from "../repositories/events.repository";
import { KinesisEventsRepository } from "../repositories/kinesis-events.repository";

const STREAM = "events-it";
const FLOCI_PORT = 4566;

let container: StartedTestContainer;
let client: KinesisClient;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stored(id: string, userId = `user-${id}`): StoredEvent {
  return {
    eventId: id,
    eventName: "chat_room_entered",
    userId,
    deviceId: userId === "" ? `device-${id}` : "",
    pseudoId: "",
    sessionId: 1_750_000_000_000,
    eventSeqId: 0,
    clientTsMs: 1_750_000_000_000,
    clientUploadTimeMs: 0,
    eventProperties: { room_id: "room-7" },
    userProperties: { plan: "premium" },
    groups: { workspace: "62646" },
    groupProperties: {},
    context: {
      platform: "Android",
      osName: "android",
      osVersion: "14",
      appVersion: "337",
      deviceBrand: "",
      deviceModel: "",
      deviceManufacturer: "",
      carrier: "",
      country: "",
      language: "",
      library: "integration-test",
      ip: "",
      adid: "",
    },
    attempts: 0,
    retryCount: 0,
    reqGuid: "req-integration",
    receivedAtMs: 1_750_000_000_500,
  };
}

beforeAll(async () => {
  container = await new GenericContainer("public.ecr.aws/floci/floci:latest").withExposedPorts(FLOCI_PORT).start();
  // KinesisEventsRepository reads the standard AWS env chain — point it (and our
  // verification client) at the emulator.
  process.env.AWS_ENDPOINT_URL = `http://${container.getHost()}:${container.getMappedPort(FLOCI_PORT)}`;
  process.env.AWS_REGION = "ap-south-1";
  process.env.AWS_ACCESS_KEY_ID = "test";
  process.env.AWS_SECRET_ACCESS_KEY = "test";

  client = new KinesisClient({});
  await client.send(new CreateStreamCommand({ StreamName: STREAM, ShardCount: 1 }));
  for (let i = 0; i < 50; i++) {
    const desc = await client.send(new DescribeStreamCommand({ StreamName: STREAM }));
    if (desc.StreamDescription?.StreamStatus === "ACTIVE") break;
    await sleep(200);
  }
}, 120_000);

afterAll(async () => {
  client?.destroy();
  await container?.stop();
});

describe("KinesisEventsRepository against floci-aws", () => {
  it("PutRecords lands click events on the stream, readable back", async () => {
    const repo = new KinesisEventsRepository({
      streamName: STREAM,
      batchSize: 10,
      flushIntervalMs: 60_000,
    });
    repo.addMany([stored("e-1"), stored("e-2", "")]); // one identified, one anonymous
    await repo.flush();
    await repo.close();

    const iter = await client.send(
      new GetShardIteratorCommand({
        StreamName: STREAM,
        ShardId: "shardId-000000000000",
        ShardIteratorType: "TRIM_HORIZON",
      })
    );
    const result = await client.send(new GetRecordsCommand({ ShardIterator: iter.ShardIterator }));

    const records = result.Records ?? [];
    expect(records).toHaveLength(2);

    // wire shape: snake_case + correctly typed for ClickPipe 1:1 — timestamps as
    // epoch ms, property bags + groups as JSON objects. Matches the events columns.
    interface WireRecord {
      insert_id: string;
      event_type: string;
      event_time: number;
      server_time: number;
      event_properties: Record<string, unknown>;
      user_properties: Record<string, unknown>;
      groups: Record<string, string>;
      os_version: string;
      req_guid: string;
    }
    const payloads = records.map(
      (r) => JSON.parse(Buffer.from(r.Data as Uint8Array).toString("utf8")) as WireRecord
    );
    expect(payloads.map((p) => p.insert_id).sort()).toEqual(["e-1", "e-2"]);
    const first = payloads.find((p) => p.insert_id === "e-1");
    // bags/groups as JSON objects; timestamps as epoch ms; snake_case
    expect(first?.event_properties).toEqual({ room_id: "room-7" });
    expect(first?.user_properties).toEqual({ plan: "premium" });
    expect(first?.groups).toEqual({ workspace: "62646" });
    expect(typeof first?.event_time).toBe("number");
    expect(first?.os_version).toBe("14");
    expect(first?.req_guid).toBe("req-integration");
    // anonymous event partitioned by deviceId, identified by userId
    expect(records.map((r) => r.PartitionKey).sort()).toEqual(["device-e-2", "user-e-1"]);
  });
});
