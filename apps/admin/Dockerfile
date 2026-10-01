# Build a static image for the admin CMS SPA and serve it from a slim,
# non-root nginx (TAM-120). Mirrors apps/api/Dockerfile's builder->runtime
# shape, adapted for a Vite static bundle instead of a Node server.
# Context must be the repo root:  docker build -f apps/admin/Dockerfile .
#
# TWO LAYOUTS, selected by VITE_BASE_PATH. A Vite bundle inlines import.meta.env
# at BUILD time, so the serving location is fixed when the image is built and
# cannot be changed by the task definition — which is why these are build args
# and why modules/cicd carries per-service `build_args`.
#
#   (default) VITE_BASE_PATH=/cms/  — shared ALB, CMS under the /cms prefix,
#     same-origin with the API, so VITE_API_URL is left unset and the SPA uses
#     window.location.origin. This is stage.
#
#   VITE_BASE_PATH=/ VITE_API_URL=https://api.example.com — split-host: the CMS
#     owns its own hostname's root (`admin_domain_name` in modules/stack). It is
#     a DIFFERENT origin from the API now, so VITE_API_URL is REQUIRED and the
#     API's cors_allowed_origins must carry the CMS origin.
#
# Mismatching the two halves fails in a specific way: a /cms/-built bundle on a
# host with no /cms rule requests /cms/assets/* and 404s every asset, so the page
# loads blank with no error in the server logs.

# ECR Public mirror: no Docker Hub pull limit in CI.
FROM public.ecr.aws/docker/library/node:22-alpine AS builder
ARG VITE_BASE_PATH=/cms/
ARG VITE_API_URL=
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
# Both are read by vite.config.mts / import.meta.env at build time.
RUN VITE_BASE_PATH="$VITE_BASE_PATH" VITE_API_URL="$VITE_API_URL" pnpm nx build admin

# Pick the matching nginx config HERE, in the builder, rather than in the runtime
# stage: nginxinc/nginx-unprivileged runs as uid 101 and cannot write /etc/nginx,
# so doing it there would need a USER root round-trip.
RUN if [ "$VITE_BASE_PATH" = "/" ]; then \
      cp apps/admin/nginx.root.conf /tmp/default.conf; \
    else \
      cp apps/admin/nginx.conf /tmp/default.conf; \
    fi

# nginx-unprivileged already runs as a non-root user (uid 101) and listens on
# 8080 — no root, no privileged port.
FROM public.ecr.aws/nginx/nginx-unprivileged:1.27-alpine AS runtime
ARG VITE_BASE_PATH=/cms/
# The bundle must live at the path it was built for: html/cms/ for the prefix
# layout, html/ for root. Expanding the build arg in the destination keeps the
# two in lockstep without a second conditional.
COPY --from=builder /repo/apps/admin/dist/ /usr/share/nginx/html${VITE_BASE_PATH}
COPY --from=builder /tmp/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
# CMD/USER inherited from the base image (non-root nginx, foreground).
