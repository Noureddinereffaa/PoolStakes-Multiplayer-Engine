#!/bin/sh
set -e

echo "Waiting for PostgreSQL to be ready..."
until pg_isready -h db -U postgres -q; do
  sleep 2
done

echo "Running database migrations..."
npx prisma migrate deploy

echo "Starting application..."
exec node dist/server.cjs