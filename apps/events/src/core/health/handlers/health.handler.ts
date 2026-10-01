import type { FastifyInstance } from "fastify";

// Deliberately UNauthenticated — container orchestrators and load balancers
// probe it without credentials. Same shape as the api's /health.
export function registerHealthRoutes(app: FastifyInstance): void {
  app.get("/health", () => ({ status: "ok" }));
}
