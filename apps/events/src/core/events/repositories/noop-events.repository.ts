import type { Logger } from "pino";

import { createModuleLogger } from "../../../shared/logs";
import type { EventsRepository, StoredEvent } from "./events.repository";

// Selected when ENABLE_KINESIS=false: accepted events are logged and dropped,
// keeping the dev loop dependency-free (same philosophy as the api's opt-in
// ENABLE_* flags).
export class NoopEventsRepository implements EventsRepository {
  constructor(
    private readonly logger: Logger = createModuleLogger("events:repository:noop")
  ) {}

  addMany(events: StoredEvent[]): void {
    this.logger.debug({ count: events.length }, "kinesis disabled — events dropped");
  }

  flush(): Promise<void> {
    return Promise.resolve();
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}
