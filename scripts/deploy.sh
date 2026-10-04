#!/usr/bin/env bash
# Builds the image and (re)starts the always-on container on this machine.
# Docker's restart policy brings it back after a crash or a reboot, because the
# docker service itself is enabled at boot. Run again after every change.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="$(grep -E '^PORT=' .env | cut -d= -f2)"
PORT="${PORT:-8787}"

docker build -t melodle:latest .

docker rm -f melodle >/dev/null 2>&1 || true
docker run -d --name melodle \
  --restart unless-stopped \
  --env-file .env \
  -e DATA_FILE=/data/melodle.db \
  -e PORT="$PORT" \
  -p "$PORT:$PORT" \
  -v melodle_data:/data \
  --memory 512m \
  --log-opt max-size=10m --log-opt max-file=3 \
  melodle:latest >/dev/null

for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/api/ping" >/dev/null 2>&1; then
    echo "melodle is up on port $PORT"
    docker image prune -f >/dev/null
    exit 0
  fi
  sleep 1
done
echo "melodle did not answer on port $PORT; recent log:" >&2
docker logs --tail 40 melodle >&2
exit 1
