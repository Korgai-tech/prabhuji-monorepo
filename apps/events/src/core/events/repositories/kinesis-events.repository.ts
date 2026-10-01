import { KinesisClient, PutRecordsCommand } from "@aws-sdk/client-kinesis";
import type { Logger } from "pino";

import { createModuleLogger } from "../../../shared/logs";
import type { EventsRepository, StoredEvent } from "./events.repository";

export interface KinesisEventsRepositoryOptions {
  streamName: string;
  batchSize: number; // <= 500 (PutRecords limit), enforced by env schema
  flushIntervalMs: number;
}

// Wire format: the Kinesis StoredEvent is emitted snake_case and already correctly
// typed, so ClickPipe maps it 1:1 into the `events` columns with no overrides —
// timestamps as epoch ms (-> DateTime64), the property bags + groups as JSON
// objects (-> JSON / the Map). The internal domain type is camelCase; this is the
// wire adapter. `sent_at` is not emitted (Amplitude V2 has no per-event sent_at;
// the batch client_upload_time is what feeds corrected_time).
export function toWireRecord(event: StoredEvent): string {
  const c = event.context;
  return JSON.stringify({
    insert_id: event.eventId,
    event_type: event.eventName,
    user_id: event.userId,
    device_id: event.deviceId,
    pseudo_id: event.pseudoId,
    session_id: event.sessionId,
    event_seq_id: event.eventSeqId,
    event_time: event.clientTsMs,
    server_time: event.receivedAtMs,
    client_upload_time: event.clientUploadTimeMs,
    event_properties: event.eventProperties,
    user_properties: event.userProperties,
    group_properties: event.groupProperties,
    groups: event.groups,
    platform: c.platform,
    os_name: c.osName,
    os_version: c.osVersion,
    app_version: c.appVersion,
    device_brand: c.deviceBrand,
    device_model: c.deviceModel,
    device_manufacturer: c.deviceManufacturer,
    carrier: c.carrier,
    country: c.country,
    language: c.language,
    adid: c.adid,
    library: c.library,
    ip: c.ip,
    attempts: event.attempts,
    retry_count: event.retryCount,
    req_guid: event.reqGuid,
  });
}

export class KinesisEventsRepository implements EventsRepository {
  private readonly client: KinesisClient;
  private readonly timer: NodeJS.Timeout;
  private buffer: StoredEvent[] = [];
  private flushing: Promise<void> | null = null;

  constructor(
    private readonly opts: KinesisEventsRepositoryOptions,
    private readonly logger: Logger = createModuleLogger("events:repository:kinesis")
  ) {
    // endpoint/region/credentials come from the standard AWS env chain
    // (AWS_ENDPOINT_URL / AWS_REGION / AWS_ACCESS_KEY_ID...) — locally that is
    // the floci-aws emulator, in production the real service.
    this.client = new KinesisClient({});
    this.timer = setInterval(() => {
      void this.flush();
    }, opts.flushIntervalMs);
    this.timer.unref();
  }

  addMany(events: StoredEvent[]): void {
    this.buffer.push(...events);
    if (this.buffer.length >= this.opts.batchSize) {
      void this.flush();
    }
  }

  flush(): Promise<void> {
    // single in-flight flush; concurrent triggers (timer + batch size) coalesce
    this.flushing ??= this.drain().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  async close(): Promise<void> {
    clearInterval(this.timer);
    await this.flush();
    this.client.destroy();
  }

  private async drain(): Promise<void> {
    while (this.buffer.length > 0) {
      const chunk = this.buffer.splice(0, this.opts.batchSize);
      try {
        const result = await this.client.send(
          new PutRecordsCommand({
            StreamName: this.opts.streamName,
            Records: chunk.map((event) => ({
              Data: Buffer.from(toWireRecord(event)),
              // per-identity ordering within a shard; validation guarantees at
              // least one of userId/deviceId/pseudoId is set
              PartitionKey: event.userId || event.deviceId || event.pseudoId,
            })),
          })
        );
        const failed = result.FailedRecordCount ?? 0;
        if (failed > 0) {
          this.logger.error(
            { failed, sent: chunk.length, stream: this.opts.streamName },
            "analytics.kinesis.flush.partial_failure — failed records dropped (v1 has no retry)"
          );
        } else {
          this.logger.info(
            { count: chunk.length, stream: this.opts.streamName },
            "analytics.kinesis.flush.success"
          );
        }
      } catch (err) {
        this.logger.error(
          { err, dropped: chunk.length, stream: this.opts.streamName },
          "analytics.kinesis.flush.failed — batch dropped (v1 has no retry)"
        );
      }
    }
  }
}
