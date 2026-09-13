# ─────────────────────────────────────────────────────────────────────────────
# Imagen de Cloud Run. Multi-stage para que la capa final no lleve el toolchain.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Las NEXT_PUBLIC_* se hornean en el bundle del cliente: llegan como build-args.
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_BUILDING_ID
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 TZ=America/Montevideo
RUN apk add --no-cache tzdata && addgroup -S draga && adduser -S draga -G draga

# `output: standalone` deja un server.js con solo lo que hace falta en runtime.
COPY --from=build --chown=draga:draga /app/.next/standalone ./
COPY --from=build --chown=draga:draga /app/.next/static ./.next/static
COPY --from=build --chown=draga:draga /app/public ./public

USER draga
EXPOSE 8080
CMD ["node", "server.js"]
