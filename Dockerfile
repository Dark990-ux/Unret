# One Dockerfile, three targets: api, web, mobile-web. Used by docker-compose.yml.
# Full Debian image: includes OpenSSL (needed by Prisma) and CA certificates.
FROM node:22-bookworm AS base
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @unret/shared build

# ── API: applies migrations, loads demo data (idempotent), starts the server ──
FROM build AS api
WORKDIR /app/apps/api
RUN npx prisma generate && npx nest build
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && npx ts-node prisma/seed.ts && node dist/main.js"]

# ── Website (Next.js); proxies /api/v1 and /socket.io to the API container ──
FROM build AS web
ARG API_INTERNAL_URL=http://api:4000
ENV API_INTERNAL_URL=$API_INTERNAL_URL NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/apps/web
RUN npx next build
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]

# ── Mobile app, web build: same code as the iOS/Android app, served in the browser ──
FROM build AS mobile-web
WORKDIR /app/apps/mobile
RUN EXPO_PUBLIC_API_URL=/ CI=1 npx expo export --platform web --output-dir dist --clear
ENV API_HOST=api API_PORT=4000 PORT=8081
EXPOSE 8081
CMD ["node", "scripts/serve-web.js", "dist"]
