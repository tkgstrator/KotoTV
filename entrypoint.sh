#!/bin/sh
set -e

cd /app

echo "Running Prisma migrations..."
bunx prisma migrate deploy --schema=packages/server/prisma/schema.prisma

exec "$@"
