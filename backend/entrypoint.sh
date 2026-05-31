#!/bin/bash
set -e

echo "==> Waiting for PostgreSQL..."
until pg_isready -h db -U mindvaults; do sleep 1; done

echo "==> Waiting for Redis..."
until redis-cli -h redis ping | grep -q PONG; do sleep 1; done

echo "==> Running Alembic migrations..."
alembic upgrade head

if [ "${DEMO_MODE:-false}" = "true" ]; then
    echo "==> Demo mode: seeding sample data..."
    python -m app.seed_demo
fi

echo "==> Starting FastAPI..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
