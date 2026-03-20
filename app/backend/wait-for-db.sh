#!/bin/sh
# Wait for PostgreSQL to be ready
echo "Waiting for database to be ready..."
until pg_isready -h db -p 5432 -U ras > /dev/null 2>&1; do
  echo "Database is unavailable - sleeping"
  sleep 2
done
echo "Database is up - executing command"
exec "$@"
