#!/bin/sh
set -e

cd /app/packages/server

echo "Running Prisma migrations..."
bunx prisma migrate deploy --schema=prisma/schema.prisma

cd /app

exec "$@"
