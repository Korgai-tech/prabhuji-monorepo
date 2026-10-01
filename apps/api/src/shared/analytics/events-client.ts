import { loadEnv } from "@api/shared/config";
import { createModuleLogger } from "@api/shared/logs";
import { loadDeviceContexts, type DeviceContext } from "./device-context.js";

const logger = createModuleLogger("analytics:events-client");

/** Cap on response-body text carried into a log line. */
const LOGGED_BODY_MAX_CHARS = 500;

/**
 * One analytics event, in the wire shape `apps/events` accepts.
 *
 * Snake_case because that IS the contract — the collector maps each field 1:1
 * into its ClickHouse column with no renaming. See
 * `docs/ANALYTICS-EVENT-CONTRACT.md` for the full matrix.
 *
 * `event_properties` carries facts about the ACTION only. Never the user's
 * identity, plan state, or app version — those are other scopes, and putting
 * them here is what makes a warehouse unqueryable by cohort.
 *
 * The device/app context it extends (`version_name`, `device_model`, …) is
 * top-level for the same reason, and no caller is expected to fill it in:
 * `send` attaches it from the per-user cache. A caller that DOES set a field
 * wins — see the spread order there.
 */
export interface AnalyticsEventInput extends DeviceContext {
  event_type: string;
  user_id: string;
  /**
   * Firebase `app_instance_id` — the client's own `pseudo_id`, forwarded by
   * whichever request carried it. Top-level because the collector promotes it
   * to a column; set it ONLY when a real value is in hand, never as "".
   */
  pseudo_id?: string;
  time?: number;
  /** Dedup key. Deterministic, keyed on the entity — never on the attempt. */
  insert_id?: string;
  event_properties?: Record<string, unknown>;
}

interface AnalyticsEventsPayload {
  api_key: string;
  client_upload_time: string;
  events: AnalyticsEventInput[];
}

/**
 * Server-side producer for the analytics warehouse.
 *
 * Posts to the SAME door the Flutter SDK uses (`apps/events`, Amplitude HTTP
 * V2) rather than reaching for Kinesis or ClickHouse directly: one producer
 * contract, one place that owns batching and the warehouse schema, and no
 * warehouse credentials in the API task.
 *
 * Throws on failure. Every caller is expected to swallow that — an analytics
 * outage must never change the outcome of a payment.
 */
export class AnalyticsEventsClient {
  async send(events: AnalyticsEventInput[]): Promise<void> {
    if (events.length === 0) return;
    const env = loadEnv();
    if (!env.ANALYTICS_EVENTS_ENABLED) {
      logger.debug({ count: events.length }, "analytics events disabled; skipping send");
      return;
    }
    if (!env.ANALYTICS_EVENTS_URL || !env.ANALYTICS_EVENTS_API_KEY) {
      // Enabled but unconfigured is a DEPLOY defect, not a quiet no-op: someone
      // flipped the flag expecting data. It gets a warn so the gap is visible
      // in the first minute rather than in next month's empty funnel.
      logger.warn(
        {
          count: events.length,
          hasUrl: Boolean(env.ANALYTICS_EVENTS_URL),
          hasApiKey: Boolean(env.ANALYTICS_EVENTS_API_KEY),
        },
        "analytics events enabled but not configured; skipping send"
      );
      return;
    }

    // Device/app context is attached HERE and nowhere else. Every server event
    // funnels through this method and none of them have a request in scope, so
    // one lookup keyed on `user_id` covers all of them — no tracker has to
    // remember to thread headers through. Never throws; a miss simply sends the
    // event exactly as it arrived.
    const contexts = await loadDeviceContexts(events.map((event) => event.user_id));

    const nowMs = Date.now();
    const payload: AnalyticsEventsPayload = {
      api_key: env.ANALYTICS_EVENTS_API_KEY,
      client_upload_time: new Date(nowMs).toISOString(),
      // Context first: an event that set a field explicitly overwrites the
      // cached one, never the other way round. Absent fields stay `undefined`
      // and `JSON.stringify` drops them — omitted on the wire, as required.
      events: events.map((event) => ({
        ...contexts.get(event.user_id),
        ...event,
        time: event.time ?? nowMs,
      })),
    };

    // Carried into every outcome log below — which events were in the batch is
    // the first thing anyone asks when a funnel has a hole.
    const eventTypes = events.map((event) => event.event_type);

    const abortController = new AbortController();
    const timeoutHandle = setTimeout(
      () => abortController.abort(),
      env.ANALYTICS_EVENTS_TIMEOUT_MS
    );
    const startedAt = Date.now();
    try {
      const response = await fetch(env.ANALYTICS_EVENTS_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          // Which tenant's warehouse the batch lands in on the SHARED collector.
          // Constant because this deployment is one tenant (apps/api is
          // single-tenant); an env var if a clone ever needs a different one.
          "x-tenant-id": "prabhuji",
        },
        body: JSON.stringify(payload),
        signal: abortController.signal,
      });
      const durationMs = Date.now() - startedAt;
      if (response.status >= 400) {
        const text = await response.text();
        logger.warn(
          {
            status: response.status,
            durationMs,
            url: env.ANALYTICS_EVENTS_URL,
            eventTypes,
            body: text.slice(0, LOGGED_BODY_MAX_CHARS),
          },
          "analytics events send failed"
        );
        throw new Error(
          `Analytics events failed (${response.status}): ${text.slice(0, LOGGED_BODY_MAX_CHARS)}`
        );
      }
      // info, not debug: this is the ONLY positive evidence that a batch left
      // the api and the collector took it. Without it a silently-dropped tenant
      // or a misrouted endpoint looks identical to "nothing was ever sent".
      logger.info(
        { count: events.length, durationMs, status: response.status, eventTypes },
        "analytics events published"
      );
    } catch (err) {
      // A timeout, abort or DNS failure never reaches the HTTP branch above, so
      // it must be logged here or a dead collector stays completely invisible.
      logger.warn(
        {
          err,
          count: events.length,
          durationMs: Date.now() - startedAt,
          url: env.ANALYTICS_EVENTS_URL,
          eventTypes,
        },
        "analytics events request failed in transport"
      );
      throw err;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

export const analyticsEventsClient = new AnalyticsEventsClient();
