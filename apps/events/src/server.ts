import { fastify, type FastifyInstance } from "fastify";

import { registerClickEventsRoutes } from "./core/events/handlers/click-events.handler";
import type { EventsService } from "./core/events/services/events.service";
import { registerHealthRoutes } from "./core/health/handlers/health.handler";

export interface ServerDeps {
  service: EventsService;
  apiKey: string;
  logRawPayload?: boolean;
  forwardUrl?: string;
  forwardApiKey?: string;
}

// Amplitude batches default to 30 events; 256 KiB is generous headroom
// while still capping an unauthenticated public POST.
const BODY_LIMIT_BYTES = 256 * 1024;

export function buildServer({
  service,
  apiKey,
  logRawPayload,
  forwardUrl,
  forwardApiKey,
}: ServerDeps): FastifyInstance {
  // module loggers (pino) handle logging; fastify's own logger stays off
  const app = fastify({ logger: false, bodyLimit: BODY_LIMIT_BYTES });

  registerHealthRoutes(app);
  registerClickEventsRoutes(app, { service, apiKey, logRawPayload, forwardUrl, forwardApiKey });

  return app;
}
