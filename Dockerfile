# Two stages. The build stage has the whole dev toolchain and typechecks, tests
# and builds the client. The runtime stage has only express: Node 24 strips the
# server's TypeScript itself, the way `npm test` already runs it, so neither tsx
# nor esbuild ships.
FROM node:24-alpine AS build
WORKDIR /app

# Dependencies first, so edits to source do not re-download the world.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig*.json vite.config.ts index.html ./
COPY public ./public
COPY shared ./shared
COPY server ./server
COPY src ./src
COPY scripts/compress.ts ./scripts/compress.ts

# Typechecks, builds the client into dist/ and precompresses it.
RUN npm run build && rm -f dist/assets/*.map


FROM node:24-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY shared ./shared
COPY server ./server

# The database lives on a mounted volume; without one it resets on every deploy.
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    DATA_FILE=/data/melodle.db

RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/ping || exit 1

CMD ["node", "server/index.ts"]
