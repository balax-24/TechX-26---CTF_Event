# ==============================================================================
# TECHX CTF 2026 — INGRESS & STATIC WEB PROXY (MULTI-STAGE)
# ==============================================================================
# Stage 1a: Build production Participant React Vite SPA
# Stage 1b: Build production Admin React Vite SPA
# Stage 2: Serve via high-performance NGINX Alpine with reverse proxy
# ==============================================================================

# ------------------------------------------------------------------------------
# 1a. PARTICIPANT BUILD STAGE
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
# 1b. ADMIN PORTAL BUILD STAGE
# ------------------------------------------------------------------------------
FROM node:20-alpine AS admin-builder
WORKDIR /app

# Copy dependency manifests
COPY admin-frontend/package*.json ./
RUN npm install

# Copy admin frontend source and build static bundle
COPY admin-frontend/ ./
RUN npm run build

# ------------------------------------------------------------------------------
# 2. RUNTIME STAGE
# ------------------------------------------------------------------------------
FROM nginx:1.27-alpine

# Remove default configuration
RUN rm -rf /etc/nginx/conf.d/default.conf

# Create directories for static web files and protected challenge downloads
RUN mkdir -p /usr/share/nginx/html /usr/share/nginx/admin-html /data/challenges/static

# Copy compiled participant frontend SPA bundle from builder stage
COPY --from=frontend-builder /app/dist /usr/share/nginx/html

# Copy compiled admin control portal SPA bundle from admin builder stage
COPY --from=admin-builder /app/dist /usr/share/nginx/admin-html

# Default to LAN configuration
COPY docker/nginx/nginx.lan.conf /etc/nginx/nginx.conf

EXPOSE 80 443 8080

CMD ["nginx", "-g", "daemon off;"]
