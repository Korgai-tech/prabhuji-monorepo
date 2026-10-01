import { createModuleLogger } from "@api/shared/logs";
import type { SubscribeFn } from "@api/shared/events";

const log = createModuleLogger("notifications:user-registered");

// A consumer owned by the notifications module — reacts to auth's
// `user.registered` without auth knowing this module exists. In a real app this
// would enqueue a welcome email; here it logs. Handlers must be idempotent
// (at-least-once delivery).
export function registerUserRegisteredConsumer(on: SubscribeFn): void {
  on("user.registered", (event) => {
    log.info(
      { userId: event.payload.userId, email: event.payload.email },
      "would send welcome notification"
    );
  });
}
