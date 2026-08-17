FROM node:22-alpine AS build
WORKDIR /app
ENV CI=true
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm check && pnpm build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 STATIC_DIR=/app/web
RUN corepack enable && addgroup -S coachora && adduser -S coachora -G coachora
COPY --from=build --chown=coachora:coachora /app/package.json ./
COPY --from=build --chown=coachora:coachora /app/node_modules ./node_modules
COPY --from=build --chown=coachora:coachora /app/dist ./dist
COPY --from=build --chown=coachora:coachora /app/web ./web
COPY --from=build --chown=coachora:coachora /app/drizzle ./drizzle
COPY --from=build --chown=coachora:coachora /app/drizzle.config.ts ./
USER coachora
EXPOSE 3000
CMD ["node", "dist/index.js"]
