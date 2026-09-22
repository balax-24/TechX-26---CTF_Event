# ==============================================================================
# TECHX CTF 2026 — FASTIFY BACKEND DOCKERFILE (MULTI-STAGE)
# ==============================================================================

# Stage 1: Build & TypeScript Compilation
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json ./
RUN npm ci

# Copy source files
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript to JavaScript
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: Production Runtime
# ------------------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV APP_PORT=4000
ENV APP_HOST=0.0.0.0

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled JavaScript from builder stage
COPY --from=builder /app/dist ./dist

# Create storage directory for challenges
RUN mkdir -p /data/challenges/static && chown -R node:node /data/challenges /app

# Run as unprivileged node user
USER node

EXPOSE 4000

# Health check probe
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4000/health || exit 1

CMD ["node", "dist/server.js"]
