import type { Logger } from "pino";

import { createModuleLogger } from "../../../shared/logs";
import type { EventsRepository } from "../repositories/events.repository";
import type { AnalyticsEvent } from "../types";

// Transport-agnostic ingestion logic: no fastify, no @aws-sdk here
// (machine-enforced via arch-boundaries.json).
export class EventsService {
  constructor(
    private readonly repository: EventsRepository,
    private readonly logger: Logger = createModuleLogger("events:service")
  ) {}

  /** Accepts pre-validated analytics events; returns the accepted count. */
  ingest(events: AnalyticsEvent[], reqGuid: string): number {
    if (events.length === 0) return 0;
    // receivedAtMs is base + index: a unique, batch-order-preserving server
    // timestamp so downstream consumers can order events within a single SDK
    // flush deterministically (equal timestamps would make intra-batch order
    // ambiguous).
    const receivedAtMs = Date.now();
    this.repository.addMany(
      events.map((event, index) => ({ ...event, reqGuid, receivedAtMs: receivedAtMs + index }))
    );
    this.logger.debug({ count: events.length, reqGuid }, "accepted analytics events");
    return events.length;
  }
}
