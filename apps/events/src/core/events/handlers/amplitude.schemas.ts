import { z } from "zod";

// The wire contract is Amplitude's HTTP V2 API (the shape amplitude_flutter
// POSTs to its configurable serverUrl). Extra SDK fields are tolerated and
// ignored — never reject a payload because the SDK got chattier.
// Scopes (docs/ANALYTICS-EVENT-CONTRACT.md): event_properties (this action),
// user_properties (user snapshot / $identify ops), groups (account), plus the
// SDK's auto-collected top-level device/app context fields.
//
// Nullish, not optional: Zod v4 `.optional()` == `T | undefined`, NOT `T | null`.
// amplitude_flutter can serialise unset fields as JSON `null` rather than
// stripping them; an `.optional()` field then fails validation and the WHOLE
// event drops silently (batch still 200 — Amplitude V2 has no partial-accept).
// Every optional field here is `.nullish()` so a null tolerates through.
// Identity-length gating (Amplitude's min-5 rule) is enforced by the handler's
// identity-selection step — NOT here — so an invalid user_id/device_id/
// pseudo_id no longer kills the entire event when another identity is valid.

export const AmplitudeEventSchema = z.looseObject({
  event_type: z.string().min(1),
  // identity fields: shape-only here (nullish string). Length rule (min 5) is
  // applied in the handler when selecting the identity, so a short id merely
  // makes THAT field ineligible — the event still ships if another identity is
  // present.
  user_id: z.string().nullish(),
  device_id: z.string().nullish(),
  pseudo_id: z.string().nullish(),
  // Amplitude standard is `time`; some clients send `timestamp` — accept both.
  time: z.number().int().positive().nullish(),
  timestamp: z.number().int().positive().nullish(),
  session_id: z.number().int().nullish(),
  insert_id: z.string().min(1).nullish(),
  // Amplitude's per-device monotonic event sequence — a tiebreaker for ordering
  // events within a corrected millisecond (warehouse synthetic_sequence_time)
  event_id: z.number().int().min(0).nullish(),
  // scoped property bags — value types preserved
  event_properties: z.record(z.string(), z.unknown()).nullish(),
  user_properties: z.record(z.string(), z.unknown()).nullish(),
  groups: z.record(z.string(), z.unknown()).nullish(),
  group_properties: z.record(z.string(), z.unknown()).nullish(),
  // auto-collected device/app context (top-level Amplitude fields)
  platform: z.string().nullish(),
  os_name: z.string().nullish(),
  os_version: z.string().nullish(),
  version_name: z.string().nullish(),
  device_brand: z.string().nullish(),
  device_model: z.string().nullish(),
  device_manufacturer: z.string().nullish(),
  carrier: z.string().nullish(),
  country: z.string().nullish(),
  language: z.string().nullish(),
  library: z.string().nullish(),
  ip: z.string().nullish(),
  adid: z.string().nullish(),
  // client-side delivery diagnostics (present only if the app sends them
  // per-event). Bounded to the warehouse UInt16 columns — an out-of-range
  // value fails the event's parse (skipped, batch still 200) instead of
  // producing a Kinesis record ClickPipe can't insert.
  attempts: z.number().int().min(0).max(65535).nullish(),
  retry_count: z.number().int().min(0).max(65535).nullish(),
});

export type AmplitudeEvent = z.infer<typeof AmplitudeEventSchema>;

export const AmplitudePayloadSchema = z.looseObject({
  api_key: z.string().min(1),
  // batch upload time (device clock). amplitude-analytics-android sends ISO-8601
  // (e.g. "2026-07-10T13:21:17.049Z"); some SDKs send epoch ms. This is the only
  // upload timestamp Amplitude V2 provides (there is NO per-event sent_at) — used
  // per-event for the warehouse skew correction (corrected_time).
  client_upload_time: z.union([z.string(), z.number()]).nullish(),
  // events are validated INDIVIDUALLY in the handler — one malformed event
  // must not 400 the whole batch (that would poison the SDK's retry queue)
  events: z.array(z.unknown()).min(1),
});
