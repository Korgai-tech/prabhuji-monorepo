import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
  jsonSchemaTransformObject,
} from 'fastify-type-provider-zod';
import { AppError } from './shared/errors/index.js';
import { sendError } from './shared/response/index.js';
import { createModuleLogger } from './shared/logs/index.js';

const log = createModuleLogger('app:error');

export interface BuildAppOptions {
  /**
   * Mount the interactive Swagger UI ("try it out") at /docs. Off by default so
   * the build-time OpenAPI emitter and tests stay lean; bootstrap turns it on
   * from `ENABLE_API_DOCS`. Keep it off in production.
   */
  apiDocs?: boolean;
  /**
   * Exact browser origins allowed to call this API with credentials. Empty or
   * omitted reflects ANY origin — see `buildApp` for when that is acceptable.
   * Bootstrap fills this from `CORS_ALLOWED_ORIGINS`.
   */
  corsOrigins?: readonly string[];
  /**
   * Backing-service probe for `GET /ready`. Resolves when the dependencies the
   * app cannot serve without are reachable, rejects otherwise.
   *
   * Injected rather than imported so `app.ts` stays free of infrastructure: the
   * OpenAPI emitter and the route tests build the same app with no database in
   * sight. Omitted => `/ready` reports ready without checking anything, which is
   * the honest answer for a process that has no dependencies wired.
   */
  readinessProbe?: () => Promise<void>;
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  // `origin: true` REFLECTS the caller's Origin header — every website its
  // visitors browse can call this API from their browser. That is fine for local
  // dev and for the tests and the OpenAPI emitter, which have no origin at all;
  // it is not fine on an internet-facing ALB.
  //
  // Deployed environments pass an explicit allowlist (CORS_ALLOWED_ORIGINS →
  // the admin CMS origin). Falling back to reflect-any when the list is empty is
  // deliberate: the mobile app is not a browser and sends no Origin, so an
  // unset list must not break it. The admin SPA is the only browser client, and
  // its origin is known at deploy time.
  const corsOrigins = opts.corsOrigins ?? [];
  await app.register(cors, {
    origin: corsOrigins.length > 0 ? [...corsOrigins] : true,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(swagger, {
    openapi: { info: { title: 'API', version: '0.0.1' } },
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  });

  // Interactive docs read the spec `@fastify/swagger` builds; registered here
  // (right after it) so it picks up every route the modules add later.
  if (opts.apiDocs) {
    await app.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: { docExpansion: 'list', deepLinking: true },
    });
  }

  app.addHook('onRequest', async (req, reply) => {
    const id = (req.headers['x-correlation-id'] as string | undefined) ?? randomUUID();
    void reply.header('x-correlation-id', id);
  });

  app.setErrorHandler<FastifyError>((err, req, reply) => {
    if (err instanceof AppError) {
      return sendError(reply, err.message, err.statusCode, err.errorCode);
    }
    if ((err as { validation?: unknown }).validation) {
      return sendError(reply, err.message, 400, 'VALIDATION_ERROR');
    }
    // Fastify's own client errors (an empty JSON body, bad JSON, an
    // unsupported content type) carry a 4xx `statusCode`. They used to fall
    // through to 500 + "unhandled error" — a caller's mistake paging as ours.
    if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500) {
      return sendError(reply, err.message, err.statusCode, 'BAD_REQUEST');
    }
    log.error({ err }, 'unhandled error');
    return sendError(reply, 'Internal Server Error', 500, 'INTERNAL_ERROR');
  });

  // Liveness: is the process up and serving? Deliberately touches nothing —
  // this is the ALB's health-check path, and failing it on a transient database
  // blip would pull every task out of the target group and turn a recoverable
  // dependency outage into a total one.
  app.get('/health', () => ({ status: 'ok', health: Date.now() }));

  // Readiness: are the backing services reachable? Reports 503 when they are
  // not, so an operator (or a future deployment gate) can tell "the process is
  // alive" from "the process can actually serve requests". NOT wired to the ALB
  // for the reason above — this is an observability surface, not a traffic gate.
  app.get('/ready', async (_req, reply) => {
    if (!opts.readinessProbe) return { status: 'ready' };
    try {
      await opts.readinessProbe();
      return { status: 'ready' };
    } catch (err) {
      log.error({ err }, 'readiness probe failed');
      return reply.code(503).send({ status: 'not-ready' });
    }
  });

  return app;
}
