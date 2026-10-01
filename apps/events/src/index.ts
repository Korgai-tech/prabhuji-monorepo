import type { EventsRepository } from "./core/events/repositories/events.repository";
import { KinesisEventsRepository } from "./core/events/repositories/kinesis-events.repository";
import { NoopEventsRepository } from "./core/events/repositories/noop-events.repository";
import { EventsService } from "./core/events/services/events.service";
import { buildServer } from "./server";
import { loadEnv } from "./shared/config/env";
import { createModuleLogger } from "./shared/logs";

const env = loadEnv();
const logger = createModuleLogger("events:bootstrap");

const repository: EventsRepository = env.ENABLE_KINESIS
  ? new KinesisEventsRepository({
      // presence is guaranteed by the env schema when ENABLE_KINESIS=true
      streamName: env.KINESIS_STREAM_NAME as string,
      batchSize: env.KINESIS_BATCH_SIZE,
      flushIntervalMs: env.KINESIS_FLUSH_INTERVAL_MS,
    })
  : new NoopEventsRepository();

// Both sinks off = every accepted batch is answered 200 and dropped on the
// floor. Silent total loss is the one failure mode worth a boot-time shout.
if (!env.ENABLE_KINESIS && !env.ANALYTICS_EVENTS_URL) {
  logger.warn(
    {},
    "no sink configured (ENABLE_KINESIS=false and ANALYTICS_EVENTS_URL unset) — events will be accepted and discarded"
  );
}

const app = buildServer({
  service: new EventsService(repository),
  apiKey: env.EVENTS_API_KEY,
  logRawPayload: env.EVENTS_LOG_RAW_PAYLOAD,
  forwardUrl: env.ANALYTICS_EVENTS_URL,
  forwardApiKey: env.ANALYTICS_EVENTS_API_KEY,
});

app
  .listen({ host: env.HOST, port: env.EVENTS_PORT })
  .then(() => {
    logger.info(
      {
        port: env.EVENTS_PORT,
        kinesis: env.ENABLE_KINESIS,
        forwardUrl: env.ANALYTICS_EVENTS_URL ?? null,
      },
      "events HTTP server listening (Amplitude V2 at /2/httpapi)"
    );
  })
  .catch((err: unknown) => {
    logger.error({ err }, "failed to start events server");
    process.exit(1);
  });

function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, "shutting down");
  void app
    .close()
    .catch((err: unknown) => logger.error({ err }, "server close failed"))
    .then(() => repository.close()) // final flush of buffered events
    .catch((err: unknown) => logger.error({ err }, "sink close failed"))
    .finally(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
