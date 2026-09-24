# syntax=docker/dockerfile:1

# 1. Base Image
FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# 2. Dependencies Stage
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
RUN npm ci --include=dev

# 3. Build Stage
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Dummy env for build-time page generation if needed
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV DIRECT_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV NEXTAUTH_SECRET="build_secret_only_replace_at_runtime_123456789"
ENV NEXT_PUBLIC_SUPABASE_URL="http://localhost:8000"
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY="dummy"
ENV SUPABASE_SERVICE_ROLE_KEY="dummy"

RUN npx prisma generate
RUN npm run build

# 4. Production Runner Stage
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

WORKDIR /app

# Copy standalone build
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy assets required by endpoints
COPY --from=builder /app/extension ./extension
COPY --from=builder /app/client-agent-base.zip ./client-agent-base.zip

# Prisma client generated assets
COPY --from=builder /app/src/generated ./src/generated

EXPOSE 3000

CMD ["node", "server.js"]
