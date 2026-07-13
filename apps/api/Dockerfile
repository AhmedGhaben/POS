# Build context must be the repo root (npm workspaces monorepo):
#   docker build -f apps/api/Dockerfile -t pos-api .
FROM node:20-alpine AS base
# Prisma's query/schema engine binaries need OpenSSL — Alpine doesn't ship it by default.
RUN apk add --no-cache openssl
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run prisma:generate --workspace apps/api
RUN npm run build --workspace apps/api

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY apps/api/package.json ./apps/api/package.json

EXPOSE 3000
# Applies any pending migrations, then starts the API — safe to run on every
# boot since `prisma migrate deploy` is a no-op when already up to date.
CMD ["sh", "-c", "npx prisma migrate deploy --schema apps/api/prisma/schema.prisma && node apps/api/dist/src/main.js"]
