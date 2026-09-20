# syntax=docker/dockerfile:1

# Debian-slim, not alpine: argon2/dockerode's optional native deps (cpu-features, ssh2) build more
# reliably against glibc than musl. Prisma 7 here uses the `@prisma/adapter-pg` driver adapter
# (src/utils/prisma.ts), so there is no native query-engine binary to worry about matching to this
# platform — the generated client is plain JS/TS, compiled by tsc like everything else.
FROM node:22-bookworm-slim AS base
WORKDIR /app
# Prisma's generator probes libssl to pick an engine binary target; without it present it just
# warns and defaults (harmless here since @prisma/adapter-pg means no native engine binary is ever
# used — see src/utils/prisma.ts), but installing it is one line and makes the warning go away.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# ---- deps: install once, reused by both the build and prod-deps stages ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---- build: compile TypeScript + generate the Prisma client ----
FROM deps AS build
COPY . .
# `prisma generate` only introspects prisma/schema.prisma — it never connects — but prisma.config.ts
# (env("DATABASE_URL")) still fails to even load without *a* resolvable value. This placeholder is
# build-time only: it isn't set in the final runtime stage, which gets its real DATABASE_URL at
# container start from the environment (see docker-compose.yml / README).
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npm run build

# ---- prod-deps: a second, dev-dependency-free install for the runtime image ----
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- runtime: the actual deployable image ----
FROM base AS runtime
ENV NODE_ENV=production
RUN groupadd --system --gid 1001 veritrust && useradd --system --uid 1001 --gid veritrust veritrust

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY templates ./templates
COPY prisma/schema.prisma prisma/migrations ./prisma/

# Two files from outside backend/ that src/config/calibrated-weights.ts reads. Its repo root is `/`
# in this image, hence these paths. They arrive as named build contexts (compose `additional_contexts`,
# or `--build-context ml-weights=../ml/weights --build-context contracts=../contracts`), so the ml/ lab stays out.
COPY --from=ml-weights weights.json /ml/weights/weights.json
COPY --from=contracts detector-registry.json /contracts/detector-registry.json

# Local disk storage (STORAGE_PROVIDER=local, the only provider built so far — see
# docs/REMAINING_WORK.md) needs a writable, and in production persistent, directory. Mount a volume
# at this path; without one, uploaded/rendered files vanish on every container restart.
RUN mkdir -p /app/storage && chown -R veritrust:veritrust /app/storage
VOLUME ["/app/storage"]

USER veritrust
EXPOSE 9000

# No curl/wget in a slim image — Node 22 has global fetch, so the healthcheck needs nothing extra.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||9000)+'/api/v1/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# Default role is the API process; the worker role overrides this CMD (see docker-compose.yml's
# `worker` service, or `docker run ... node dist/worker.js`). Exec form (JSON array), not shell
# form — this runs as PID 1 with no shell wrapping, so SIGTERM reaches src/index.ts's/src/worker.ts's
# own graceful-shutdown handlers directly instead of being swallowed by `/bin/sh -c`.
CMD ["node", "dist/index.js"]
