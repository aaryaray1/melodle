# Melodle runs its TypeScript directly through tsx, so the runtime keeps the
# full dependency tree rather than compiling the server to JavaScript first.
FROM node:24-alpine

WORKDIR /app

# Dependencies first, so edits to source do not re-download the world.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig*.json vite.config.ts index.html ./
COPY public ./public
COPY shared ./shared
COPY server ./server
COPY src ./src

# Typechecks and builds the client into dist/, which the server then serves.
RUN npm run build

# The database lives on a mounted volume; without one it resets on every deploy.
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    DATA_FILE=/data/melodle.db

RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:8080/api/ping || exit 1

CMD ["npx", "tsx", "server/index.ts"]
