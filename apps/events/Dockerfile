# Build a runnable events-service image from the pruned Nx artifact.
# Context must be the repo root:  docker build -f apps/events/Dockerfile .

# ECR Public mirror: no Docker Hub pull limit in CI.
FROM public.ecr.aws/docker/library/node:22-alpine AS builder
RUN corepack enable && apk add --no-cache libc6-compat
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
# build (bundled, workspace code only) + pruned package.json/lockfile
RUN pnpm nx prune events

FROM public.ecr.aws/docker/library/node:22-alpine AS runtime
RUN corepack enable && apk add --no-cache libc6-compat
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /repo/apps/events/dist/ ./
# protobufjs (pulled in by the OpenTelemetry/HyperDX SDK) ships a build script;
# approve it so pnpm 11 doesn't fail on ignored builds (root allowBuilds analogue).
# The pruned lockfile carries the root `overrides` (pnpm-workspace.yaml), and a
# frozen install refuses a workspace file whose overrides differ — so the block
# regenerated here MUST repeat them. Keep in sync with the root file.
RUN printf 'allowBuilds:\n  protobufjs: true\noverrides:\n  "@opentelemetry/sdk-trace-base": 2.7.1\n' > pnpm-workspace.yaml \
  && pnpm install --prod --frozen-lockfile --config.node-linker=hoisted \
  && pnpm store prune
USER node
EXPOSE 3001
# healthcheck.js is a bundled GET /health probe — no curl needed
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD ["node", "healthcheck.js"]
# telemetry.js is preloaded so OpenTelemetry auto-instrumentation hooks the app's
# imports before they load (no-op unless ENABLE_TELEMETRY=true). See telemetry.ts.
CMD ["node", "--import", "./telemetry.js", "index.js"]
