import { afterEach, describe, expect, it, vi } from "vitest";

// the subset of the kafkajs client config the bus sets (captured per construction)
type CapturedConfig = {
  ssl?: boolean;
  sasl?: { mechanism: string; oauthBearerProvider: () => Promise<{ value: string }> };
};

const send = vi.hoisted(() =>
  vi.fn<(args: { topic: string; messages: { key: string; value: string }[] }) => Promise<void>>()
);
const producerConnect = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const consumerConnect = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const consumerSubscribe = vi.hoisted(() =>
  vi.fn<(args: { topic: string; fromBeginning: boolean }) => Promise<void>>()
);
const consumerRun = vi.hoisted(() => vi.fn(() => Promise.resolve()));
// records the groupId of every kafka.consumer({ groupId }) call
const consumerGroups = vi.hoisted(() => [] as string[]);
// records the config passed to each new Kafka({...}) (ssl/sasl assertions)
const kafkaConfigs = vi.hoisted(() => [] as CapturedConfig[]);
// stands in for aws-msk-iam-sasl-signer-js: returns a fixed IAM token
const generateAuthToken = vi.hoisted(() =>
  vi.fn<(opts: { region: string }) => Promise<{ token: string; expiryTime: number }>>(() =>
    Promise.resolve({ token: "iam-token-xyz", expiryTime: 999 })
  )
);

vi.mock("kafkajs", () => ({
  Kafka: class {
    constructor(config: CapturedConfig) {
      kafkaConfigs.push(config);
    }
    producer() {
      return { connect: producerConnect, send, disconnect: vi.fn(() => Promise.resolve()) };
    }
    consumer(opts: { groupId: string }) {
      consumerGroups.push(opts.groupId);
      return {
        connect: consumerConnect,
        subscribe: consumerSubscribe,
        run: consumerRun,
        disconnect: vi.fn(() => Promise.resolve()),
      };
    }
  },
}));

vi.mock("aws-msk-iam-sasl-signer-js", () => ({ generateAuthToken }));

import { KafkaEventBus } from "../kafka-event-bus.js";

afterEach(() => {
  vi.clearAllMocks();
  consumerGroups.length = 0;
  kafkaConfigs.length = 0;
});

describe("KafkaEventBus", () => {
  it("publishes to the per-aggregate topic, partitioned by the entity id", async () => {
    const bus = new KafkaEventBus({ brokers: ["localhost:9092"] });
    await bus.publish("user.registered", { userId: "u1", email: "a@b.com" }, "u1");

    expect(producerConnect).toHaveBeenCalledOnce();
    const arg = send.mock.calls[0][0];
    expect(arg.topic).toBe("user"); // aggregate prefix of "user.registered"
    expect(arg.messages[0].key).toBe("u1"); // entity id → ordered per user
    const event = JSON.parse(arg.messages[0].value) as { name: string; payload: { userId: string } };
    expect(event.name).toBe("user.registered");
    expect(event.payload.userId).toBe("u1");
  });

  it("gives each registered consumer its own Kafka consumer group", () => {
    const bus = new KafkaEventBus({ brokers: ["localhost:9092"] });
    bus.addConsumer("audit", (on) => on("user.registered", vi.fn()));
    bus.addConsumer("notifications", (on) => on("user.registered", vi.fn()));
    expect(consumerGroups).toEqual(["audit", "notifications"]);
  });

  it("connects + subscribes each consumer to its aggregate topic(s) on start", async () => {
    const bus = new KafkaEventBus({ brokers: ["localhost:9092"] });
    bus.addConsumer("notifications", (on) => on("user.registered", vi.fn()));
    await bus.start();
    expect(consumerConnect).toHaveBeenCalledOnce();
    expect(consumerSubscribe).toHaveBeenCalledWith({ topic: "user", fromBeginning: false });
    expect(consumerRun).toHaveBeenCalledOnce();
  });

  it("prefixes both topic and group id for environment isolation", async () => {
    const bus = new KafkaEventBus({ brokers: ["localhost:9092"], topicPrefix: "staging" });
    bus.addConsumer("notifications", (on) => on("user.registered", vi.fn()));
    await bus.publish("user.registered", { userId: "u1", email: "a@b.com" }, "u1");
    await bus.start();
    expect(send.mock.calls[0][0].topic).toBe("staging.user");
    expect(consumerGroups).toEqual(["staging.notifications"]);
    expect(consumerSubscribe).toHaveBeenCalledWith({ topic: "staging.user", fromBeginning: false });
  });

  it("skips consumers that subscribed to nothing", async () => {
    const bus = new KafkaEventBus({ brokers: ["localhost:9092"] });
    bus.addConsumer("idle", () => {
      /* no subscriptions */
    });
    await bus.start();
    expect(consumerConnect).not.toHaveBeenCalled();
  });

  it("connects in plaintext by default (no ssl, no sasl) — local redpanda", () => {
    new KafkaEventBus({ brokers: ["localhost:9092"] });
    expect(kafkaConfigs[0].ssl).toBeUndefined();
    expect(kafkaConfigs[0].sasl).toBeUndefined();
  });

  it("uses TLS + SASL/OAUTHBEARER signed by the IAM role when sasl=aws-iam — MSK", async () => {
    new KafkaEventBus({ brokers: ["b-1:9098"], sasl: "aws-iam", region: "ap-south-1" });
    const config = kafkaConfigs[0];
    expect(config.ssl).toBe(true);
    expect(config.sasl?.mechanism).toBe("oauthbearer");

    // the provider signs a fresh token from the region via the MSK IAM signer
    const bearer = await config.sasl?.oauthBearerProvider();
    expect(generateAuthToken).toHaveBeenCalledWith({ region: "ap-south-1" });
    expect(bearer).toEqual({ value: "iam-token-xyz" });
  });

  it("refuses sasl=aws-iam without a region (would fail to sign)", () => {
    expect(() => new KafkaEventBus({ brokers: ["b-1:9098"], sasl: "aws-iam" })).toThrow(/region/);
  });
});
