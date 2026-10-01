import type { StoredEvent } from "../types";

export type { AnalyticsEvent, StoredEvent } from "../types";

// The events "repository" is the durable sink for accepted events (Kinesis in
// production — the analogue of apps/api's Prisma-only-in-repositories rule:
// the AWS SDK may only be imported inside repositories/).
export interface EventsRepository {
  /** Enqueue accepted events; flushing happens on batch size / interval / close. */
  addMany(events: StoredEvent[]): void;
  /** Drain the buffer now. Never rejects — sink errors are logged and dropped (v1: no retry/DLQ). */
  flush(): Promise<void>;
  /** Final flush + release resources (timers, clients). */
  close(): Promise<void>;
}
