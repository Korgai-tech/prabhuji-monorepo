import type { EventBus } from "@api/shared/events";
import { registerUserRegisteredConsumer } from "@api/core/notifications/consumers/user-registered.consumer";

// Composition root of the notifications module. It is a pure consumer (no
// routes, no facade) — it owns its subscriptions and its consumer group id
// ("notifications"). Adding another consumer of the same event elsewhere uses a
// different consumerId, so both receive every event independently.
export function initNotificationsModule(bus: EventBus): void {
  bus.addConsumer("notifications", (on) => {
    registerUserRegisteredConsumer(on);
  });
}
