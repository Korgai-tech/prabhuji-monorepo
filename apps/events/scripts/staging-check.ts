/* eslint-disable no-console */
// End-to-end smoke check against a DEPLOYED collector (staging/prod). Sends one
// realistic Amplitude V2 batch — shaped exactly like amplitude-analytics-android
// puts on the wire (batch `client_upload_time`, flat snake_case context, per-user
// `event_id` sequence, `time` in ms, `groups` as objects) — plus a `$identify`
// and an identity-less event so you can confirm both ingest AND skip behaviour.
//
// Then it prints the ClickHouse queries to verify the rows landed with every
// derived column (IST times, corrected_time, synthetic_sequence_time, flat
// context, groups Map, JSON bags).
//
// Usage (staging):
//   EVENTS_URL=https://<stage-host> EVENTS_API_KEY=<staging key> \
//     pnpm tsx apps/events/scripts/staging-check.ts
// (EVENTS_URL is the base host; the script appends /2/httpapi. Defaults to
//  http://127.0.0.1:3001 if unset.)
//
// Dry-run modes (print, no send):
//   --print   (PRINT_PAYLOAD=true) -> the HTTP payload POSTed to /2/httpapi
//   --kinesis (PRINT_KINESIS=true) -> the transformed StoredEvent records the
//             collector writes to Kinesis (what ClickPipe reads; $identify +
//             identity-less already dropped, bags -> JSON strings, context flat).
import { randomUUID } from "node:crypto";

import { toAnalyticsEvent } from "../src/core/events/handlers/click-events.handler";
import { toWireRecord } from "../src/core/events/repositories/kinesis-events.repository";
import type { AnalyticsEvent, StoredEvent } from "../src/core/events/types";

const base = process.env.EVENTS_URL ?? process.env.EVENTS_TARGET ?? "http://127.0.0.1:3001";
const apiKey = process.env.EVENTS_API_KEY ?? "local-deploy-only-api-key-change-me";

const now = Date.now();
// batch upload time — one per POST, device clock. amplitude-analytics-android
// sends ISO-8601; the collector also accepts epoch ms.
const clientUploadTime = new Date(now).toISOString();

interface Ctx {
  platform: string;
  os_name: string;
  os_version: string;
  version_name: string;
  device_brand: string;
  device_model: string;
  carrier: string;
  country: string;
  language: string;
}
const android: Ctx = {
  platform: "Android",
  os_name: "android",
  os_version: "15",
  version_name: "1.4.2",
  device_brand: "google",
  device_model: "Pixel 8",
  carrier: "Airtel",
  country: "IN",
  language: "en",
};
const ios: Ctx = {
  platform: "iOS",
  os_name: "ios",
  os_version: "18.1",
  version_name: "1.4.2",
  device_brand: "Apple",
  device_model: "iPhone15,3",
  carrier: "Jio",
  country: "IN",
  language: "en",
};

// One track event, wire-shaped like the real SDK: flat context, event_id sequence,
// time in ms, groups as an object, insert_id unique per run.
function track(opts: {
  user: string;
  device: string;
  session: number;
  type: string;
  seq: number; // per-device event_id sequence
  secondsAgo: number;
  ctx: Ctx;
  eventProps?: Record<string, unknown>;
  userProps?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    event_type: opts.type,
    user_id: opts.user,
    device_id: opts.device,
    session_id: opts.session,
    insert_id: randomUUID(),
    event_id: opts.seq,
    time: now - opts.secondsAgo * 1000,
    event_properties: opts.eventProps ?? {},
    user_properties: opts.userProps ?? {},
    groups: { workspace: "62646" },
    library: "amplitude-flutter/4.6.0_amplitude-analytics-android/1.27.0",
    ...opts.ctx,
  };
}

const sessionA = now - 12_000;
const sessionB = now - 11_000;

const events: Record<string, unknown>[] = [
  // user A — a small journey (event_id 1..3), Android
  track({ user: "player-100001", device: "dev-A-0001", session: sessionA, type: "app_opened", seq: 1, secondsAgo: 10, ctx: android, userProps: { plan: "premium" } }),
  track({ user: "player-100001", device: "dev-A-0001", session: sessionA, type: "chat_room_entered", seq: 2, secondsAgo: 7, ctx: android, eventProps: { room_id: "room-7", entry_point: "home_banner", free_disk: 242_286_034_944 } }),
  track({ user: "player-100001", device: "dev-A-0001", session: sessionA, type: "game_started", seq: 3, secondsAgo: 4, ctx: android, eventProps: { game_id: "ludo", mode: "ranked", players: 4 } }),
  // user B — iOS, different workspace-less flow (event_id 1..2)
  track({ user: "player-200002", device: "dev-B-0002", session: sessionB, type: "app_opened", seq: 1, secondsAgo: 9, ctx: ios, userProps: { plan: "free" } }),
  track({ user: "player-200002", device: "dev-B-0002", session: sessionB, type: "chat_room_entered", seq: 2, secondsAgo: 5, ctx: ios, eventProps: { room_id: "room-3", entry_point: "deep_link" } }),
  // SKIP cases — should NOT land in `events`:
  //  $identify (dropped at the collector — no downstream consumer)
  { event_type: "$identify", user_id: "player-100001", insert_id: randomUUID(), event_id: 4, time: now, user_properties: { $set: { plan: "premium" } }, ...android },
  //  no identity (no user_id/device_id/pseudo_id) — skipped, batch still 200
  { event_type: "app_backgrounded", insert_id: randomUUID(), time: now },
];

const trackCount = 5; // the 5 real events above; expected events_ingested

async function main(): Promise<void> {
  console.log(`target:   ${base}/2/httpapi`);
  console.log(`sent:     ${events.length} events (${trackCount} track + 1 $identify + 1 identity-less)`);
  console.log(`batch client_upload_time: ${clientUploadTime}\n`);

  // Health is a nicety — behind a deployed ALB, /health may route to a DIFFERENT
  // service than /2/httpapi, so don't rely on it. The POST below is the real test.
  try {
    const h = await fetch(`${base}/health`);
    console.log(`GET /health -> ${h.status} (may route to another service behind the ALB)`);
  } catch (e) {
    console.log(`GET /health -> unreachable (${e instanceof Error ? e.message : String(e)}); trying the POST anyway`);
  }

  const res = await fetch(`${base}/2/httpapi`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, client_upload_time: clientUploadTime, events }),
  });
  const body = (await res.json()) as { code?: number; events_ingested?: number; error?: string };
  console.log(`POST /2/httpapi -> ${res.status} ${JSON.stringify(body)}`);

  if (res.status !== 200) {
    console.error(`\n✗ expected 200 — check EVENTS_API_KEY matches the deployed collector.`);
    process.exit(1);
  }
  const ok = body.events_ingested === trackCount;
  console.log(
    `\n${ok ? "✓" : "✗"} events_ingested = ${body.events_ingested} (expected ${trackCount}: the $identify + identity-less were skipped)`
  );

  console.log(`
Now verify in ClickHouse (staging DB). The rows should show IST timestamps, a
skew-corrected corrected_time, per-user synthetic_sequence_time ordering, flat
context columns, the groups Map, and JSON bags:

  SELECT event_time, server_time, corrected_time, event_type, user_id, session_id,
         event_seq_id, synthetic_sequence_time, platform, country,
         event_properties, user_properties, groups
  FROM staging.events
  WHERE user_id IN ('player-100001','player-200002')
  ORDER BY user_id, synthetic_sequence_time
  LIMIT 1 BY insert_id;

  -- $identify must NOT be here (skipped at the collector) -> 0
  SELECT count() FROM staging.events WHERE event_type = '$identify';

  -- partition should be the current server month (IST)
  SELECT partition, count() FROM system.parts
  WHERE database='staging' AND table='events' AND active GROUP BY partition;

(ClickPipe polls Kinesis, so allow a few seconds before the rows appear.)`);
}

// --print: the HTTP payload POSTed to /2/httpapi (Amplitude V2), for curl/replay.
if (process.env.PRINT_PAYLOAD === "true" || process.argv.includes("--print")) {
  console.log(JSON.stringify({ api_key: "<EVENTS_API_KEY>", client_upload_time: clientUploadTime, events }, null, 2));
  process.exit(0);
}

// --kinesis: the transformed StoredEvent records the collector puts on Kinesis —
// what ClickPipe reads. Runs the events through the REAL collector transform
// (toAnalyticsEvent skips $identify + identity-less and maps fields; toWireRecord
// serialises: bags -> JSON strings, groups stays an object, context stays flat) and
// stamps the server fields (reqGuid/receivedAtMs) + batch clientUploadTimeMs.
if (process.env.PRINT_KINESIS === "true" || process.argv.includes("--kinesis")) {
  const uploadMs = Date.parse(clientUploadTime);
  const base = Date.now();
  const records = events
    .map((raw) => toAnalyticsEvent(raw))
    .filter((e): e is AnalyticsEvent => e !== null)
    .map((e, i): Record<string, unknown> => {
      e.clientUploadTimeMs = uploadMs;
      const stored: StoredEvent = { ...e, reqGuid: `req-probe-${i + 1}`, receivedAtMs: base + i };
      return JSON.parse(toWireRecord(stored)) as Record<string, unknown>;
    });
  console.log(JSON.stringify(records, null, 2));
  process.exit(0);
}

await main();
