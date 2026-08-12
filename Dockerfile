FROM node:22-alpine AS build
WORKDIR /app
ENV CI=true
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm check && pnpm build && pnpm run build:web
RUN BUILD_ID=$(date -u +%Y%m%d%H%M%S) && sed -i "s/__BUILD_ID__/${BUILD_ID}/g" web/sw.js

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 STATIC_DIR=/app/web
RUN corepack enable && addgroup -S gymflow && adduser -S gymflow -G gymflow
COPY --from=build --chown=gymflow:gymflow /app/package.json ./
COPY --from=build --chown=gymflow:gymflow /app/node_modules ./node_modules
COPY --from=build --chown=gymflow:gymflow /app/dist ./dist
COPY --from=build --chown=gymflow:gymflow /app/web ./web
COPY --from=build --chown=gymflow:gymflow /app/drizzle ./drizzle
COPY --from=build --chown=gymflow:gymflow /app/drizzle.config.ts ./
USER gymflow
EXPOSE 3000
CMD ["node", "dist/index.js"]
