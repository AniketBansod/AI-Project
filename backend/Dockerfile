# Backend Dockerfile
FROM node:20-bookworm-slim AS base
WORKDIR /app

# Install dependencies separately to leverage caching
COPY package.json package-lock.json* .npmrc* ./
RUN npm ci --only=production || npm ci

# Build stage
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY . .
RUN npm ci && npm run build

# Runtime image
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Prisma needs OpenSSL and certs
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# Copy node_modules from base for production deps
COPY --from=base /app/node_modules ./node_modules
# Copy built dist and necessary runtime files
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY prisma ./prisma

EXPOSE 5000
CMD ["npm", "run", "start"]
