#!/bin/bash
set -e

echo "===================================================="
echo " Starting AVsub Database Entrypoint Script"
echo "===================================================="

# Function to run database schema synchronization
run_migrations() {
    echo "[INFO] Running Prisma database schema synchronization (avsub.db only)..."
    export DATABASE_URL="file:/data/avsub.db"

    # Ensure the parent data directory exists
    mkdir -p /data

    # IMPORTANT: Only push the avsub schema (writable app DB).
    # javinizer.db is mounted read-only — never run prisma against it.
    npx prisma db push --schema=prisma/schema.avsub.prisma --accept-data-loss
}

# Run database synchronization before starting Node app
run_migrations

# 7. Execute the Node.js application
echo "[INFO] Starting Nuxt Node.js application..."
exec node .output/server/index.mjs
