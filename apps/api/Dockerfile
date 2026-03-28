# ============================================================
# Dockerfile — SBDMM API
# ============================================================
#
# SECURITY HARDENING:
# 1. Multi-stage build — only production artifacts in final image
# 2. Non-root user — principle of least privilege
# 3. node:alpine — minimal attack surface
# 4. No dev dependencies in final image
# 5. NODE_ENV=production forces Express into prod mode (no stack traces)
# 6. Read-only filesystem where possible (secrets via env vars, not files)
# 7. Health check wired to /health endpoint
#
# BUILD ARGs:
#   NODE_VERSION   — Node.js major version (e.g. 20)
#   BUILD_SHA      — Git commit SHA for tracing / observability
#
# USAGE:
#   docker build -t sbdmm-api --build-arg BUILD_SHA=$(git rev-parse HEAD) -f apps/api/Dockerfile .
#   docker run -p 3001:3001 --env-file apps/api/.env sbdmm-api
# ============================================================

ARG NODE_VERSION=20

# ─── Stage 1: Dependencies ───────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app

# Copy root workspace manifest + lockfile first (layer caching)
COPY package.json package-lock.json turbo.json ./

# Copy all workspace package manifests (for npm workspaces resolution)
COPY packages/shared/package.json  packages/shared/
COPY apps/api/package.json         apps/api/

# Install ALL dependencies (including devDeps needed for build)
RUN npm ci --ignore-scripts

# ─── Stage 2: Build ─────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS builder
WORKDIR /app

ARG BUILD_SHA=unknown
ENV BUILD_SHA=${BUILD_SHA}

# Copy deps from previous stage
COPY --from=deps /app/node_modules ./node_modules
# Workspace-level API node_modules (may not exist if hoisted) — use RUN to copy optionally
RUN if [ -d /app/apps/api/node_modules ]; then cp -r /app/apps/api/node_modules ./apps/api/; fi

# Copy source
COPY packages/ packages/
COPY apps/api/  apps/api/
COPY turbo.json package.json ./

# Build shared package first, then API
RUN npx tsc -p packages/shared/tsconfig.json || true
RUN cd apps/api && npx tsc --project tsconfig.json

# ─── Stage 3: Production Image ───────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS production

# SECURITY: Run as non-root user
RUN addgroup -S sbdmm && adduser -S sbdmm -G sbdmm

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

ARG BUILD_SHA=unknown
ENV BUILD_SHA=${BUILD_SHA}

# Copy built output and production node_modules only
COPY --from=builder /app/apps/api/dist        ./dist
# shared/dist may not exist if shared is bundled inline — copy if present
RUN mkdir -p ./packages/shared/dist
COPY --from=builder /app/packages/shared/dist/ ./packages/shared/dist/

# Copy and install PRODUCTION-ONLY deps
COPY apps/api/package.json  ./package.json
COPY package-lock.json       ./package-lock.json
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# SECURITY: Set permissions — app files owned by non-root user
RUN chown -R sbdmm:sbdmm /app

USER sbdmm

EXPOSE 3001

# Health check — matches the Express /health route
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

# SECURITY: Use exec form (not shell form) to prevent signal hijacking
CMD ["node", "dist/server.js"]
