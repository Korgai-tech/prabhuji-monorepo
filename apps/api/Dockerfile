# Build a runnable API image from the pruned Nx artifact.
# Context must be the repo root:  docker build -f apps/api/Dockerfile .

# ECR Public mirror: no Docker Hub pull limit in CI.
FROM public.ecr.aws/docker/library/node:22-alpine AS builder
RUN corepack enable && apk add --no-cache libc6-compat openssl
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --dir apps/api exec prisma generate
# build (bundled, workspace code only) + pruned package.json/lockfile
RUN pnpm nx prune api

FROM public.ecr.aws/docker/library/node:22-alpine AS runtime
RUN corepack enable && apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /repo/apps/api/dist/ ./
COPY --from=builder /repo/apps/api/prisma/ ./prisma/
# hoisted layout keeps prisma's generated client resolvable; the prisma CLI
# stays in the image so it can also run `prisma migrate deploy` (e.g. as a
# one-off ECS task) — allowBuilds approves the prisma postinstall scripts.
# The pruned lockfile carries the root `overrides` (pnpm-workspace.yaml), and a
# frozen install refuses a workspace file whose overrides differ — so the block
# regenerated here MUST repeat them. Keep in sync with the root file.
RUN printf 'allowBuilds:\n  "@prisma/client": true\n  "@prisma/engines": true\n  prisma: true\n  protobufjs: true\noverrides:\n  "@opentelemetry/sdk-trace-base": 2.7.1\n' > pnpm-workspace.yaml \
  && pnpm install --prod --frozen-lockfile --config.node-linker=hoisted \
  && pnpm add prisma@6.19.3 --config.node-linker=hoisted \
  && pnpm exec prisma generate --schema ./prisma/schema.prisma \
  && pnpm store prune
USER node
EXPOSE 3000
# telemetry.js is preloaded so OpenTelemetry auto-instrumentation hooks the app's
# imports before they load (no-op unless ENABLE_TELEMETRY=true). See telemetry.ts.
CMD ["node", "--import", "./telemetry.js", "index.js"]
