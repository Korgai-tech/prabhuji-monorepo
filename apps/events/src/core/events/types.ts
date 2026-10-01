// Domain shape of an accepted analytics event. Owned by the events module (the
// wire contract is Amplitude's HTTP V2 API, validated by the Zod schemas in
// handlers/; the JSON stored in Kinesis is StoredEvent).
//
// Properties are SCOPED, industry-style (Amplitude/Segment/PostHog — see
// docs/ANALYTICS-EVENT-CONTRACT.md): eventProperties describe THIS action;
// userProperties are a point-in-time snapshot of who the user is; groups is
// the account scope; context is the SDK's auto-collected device/app fields.
// `$identify` events are skipped by the collector (there is no persons/identity
// resolution downstream, and the single events table has no insert-time filter).
// userProperties still carries the $set/$setOnce ops on the wire — they are just
// not ingested.

// Auto-collected device/app context (Amplitude top-level fields). Absent
// fields default to "" so the Kinesis JSON has a stable shape.
export interface EventContext {
  platform: string;
  osName: string;
  osVersion: string;
  appVersion: string; // Amplitude version_name
  deviceBrand: string;
  deviceModel: string;
  deviceManufacturer: string;
  carrier: string;
  country: string;
  language: string;
  library: string;
  ip: string;
  adid: string;
}

export interface AnalyticsEvent {
  eventId: string; // client insert_id (idempotency key) or server-generated
  eventName: string; // Amplitude event_type — the funnel dimension ("$identify" = user-state change)
  userId: string; // user_id (the app calls setUserId(playerId)); "" for anonymous
  deviceId: string; // may be empty when userId is set
  pseudoId: string; // Amplitude pseudo_id; may be empty
  sessionId: number; // Amplitude session_id (numeric); -1 when absent
  eventSeqId: number; // Amplitude event_id — per-device event sequence (ordering tiebreaker); 0 when absent
  clientTsMs: number; // client event time (time ?? timestamp)
  clientUploadTimeMs: number; // batch client_upload_time (device clock) -> ms; 0 when absent

  eventProperties: Record<string, unknown>; // event scope ONLY — value types preserved
  userProperties: Record<string, unknown>; // user snapshot / $identify ops — types preserved
  groups: Record<string, string>; // account scope, e.g. { workspace: "62646" }
  groupProperties: Record<string, unknown>; // Amplitude group_properties — pass-through
  context: EventContext;
  attempts: number; // client delivery counter (0 when absent)
  retryCount: number; // client delivery counter (0 when absent)
}

export interface StoredEvent extends AnalyticsEvent {
  reqGuid: string; // ingest request id — stamped by the service
  receivedAtMs: number; // server-side ingestion timestamp
}
