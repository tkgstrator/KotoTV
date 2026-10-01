#!/bin/sh
set -e

cd /app

echo "Running Prisma migrations..."
(cd packages/server && bunx --no-install prisma migrate deploy)

exec "$@"
