# ==============================================================================
# TECHX CTF 2026 — INGRESS & STATIC WEB PROXY (MULTI-STAGE)
# ==============================================================================
# Stage 1: Build production React Vite SPA
# Stage 2: Serve via high-performance NGINX Alpine with reverse proxy
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. BUILD STAGE
# ------------------------------------------------------------------------------
FROM node:20-alpine AS frontend-builder
WORKDIR /app

# Copy dependency manifests
COPY frontend/package*.json ./
RUN npm install

# Copy frontend source and build static bundle
COPY frontend/ ./
RUN npm run build

# ------------------------------------------------------------------------------
# 2. RUNTIME STAGE
# ------------------------------------------------------------------------------
FROM nginx:1.27-alpine

# Remove default configuration
RUN rm -rf /etc/nginx/conf.d/default.conf

# Create directory for static web files and protected challenge downloads
RUN mkdir -p /usr/share/nginx/html /data/challenges/static

# Copy compiled frontend SPA bundle from builder stage
COPY --from=frontend-builder /app/dist /usr/share/nginx/html

# Default to LAN configuration
COPY docker/nginx/nginx.lan.conf /etc/nginx/nginx.conf

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
