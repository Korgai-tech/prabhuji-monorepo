/* eslint-disable no-console */
// Demo client for the running events collector (pnpm nx serve events, or the
// deployed container):  pnpm tsx apps/events/scripts/smoke.ts
// POSTs Amplitude HTTP V2 payloads exactly the way amplitude_flutter does:
// wrong api_key (expect 400), then a valid generic batch (expect 200).
import { randomUUID } from "node:crypto";

const target = process.env.EVENTS_TARGET ?? `http://127.0.0.1:${process.env.EVENTS_PORT ?? "3001"}`;
const apiKey = process.env.EVENTS_API_KEY ?? "local-deploy-only-api-key-change-me";

function payload(key: string) {
  return {
    api_key: key,
    events: [
      {
        event_type: "chat_room_entered",
        user_id: "2123059",
        device_id: "device-smoke-1",
        pseudo_id: "pseudo-smoke-1",
        insert_id: randomUUID(),
        time: Date.now(),
        session_id: Date.now(),
        attempts: 0,
        // scopes stay separate through to Kinesis; value types preserved
        event_properties: { room_id: "room-7", free_disk: 242_286_034_944 },
        user_properties: { name: "smoke", plan: "premium" },
        groups: { workspace: "62646" },
        platform: "smoke",
        os_version: "14",
        version_name: "337",
        library: "smoke-script/1.0",
      },
      // $identify — skipped by the collector (no identity/persons resolution
      // downstream); demonstrates the skip-keeps-200 behavior like app_background
      {
        event_type: "$identify",
        user_id: "2123059",
        insert_id: randomUUID(),
        time: Date.now(),
        user_properties: { $set: { plan: "premium" } },
        library: "smoke-script/1.0",
      },
      // identity-less event the collector should skip (no partition key)
      { event_type: "app_background", time: Date.now() },
    ],
  };
}

async function post(key: string) {
  const response = await fetch(`${target}/2/httpapi`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload(key)),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const health = await fetch(`${target}/health`);
console.log(`GET /health -> ${health.status} ${JSON.stringify(await health.json())}`);

const bad = await post("wrong-key-wrong-key");
console.log(`POST /2/httpapi (bad key) -> ${bad.status} ${JSON.stringify(bad.body)}`);

const ok = await post(apiKey);
console.log(`POST /2/httpapi (valid) -> ${ok.status} ${JSON.stringify(ok.body)}`);
