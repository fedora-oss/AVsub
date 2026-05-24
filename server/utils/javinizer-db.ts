// Prisma client for javinizer.db (read-only external DB)
// Uses the standard @prisma/client generated from prisma/schema.prisma (javinizer models)
import { PrismaClient } from '@prisma/client'

declare global {
  var javinizerDb: PrismaClient | undefined
}

/**
 * Build the SQLite connection URL with tuned timeouts to avoid
 * "Operations timed out after N/A" under concurrent load.
 *
 * connection_timeout — how long Prisma waits for a free connection (ms)
 * socket_timeout     — how long a single query can run (ms)
 *
 * SQLite is single-writer; under concurrent reads the busy_timeout pragma
 * (set via the URL query param) tells libsql/better-sqlite3 how long to
 * wait for a write lock before throwing SQLITE_BUSY.
 */
function buildDatasourceUrl(): string {
  const base = process.env.JAVINIZER_DATABASE_URL ?? 'file:/data/javinizer.db'
  // Prisma SQLite URL format: file:path?connection_timeout=X&socket_timeout=Y
  const separator = base.includes('?') ? '&' : '?'
  return `${base}${separator}connection_timeout=30000&socket_timeout=60000`
}

const javinizerDb =
  globalThis.javinizerDb ||
  new PrismaClient({
    datasources: {
      db: {
        url: buildDatasourceUrl(),
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalThis.javinizerDb = javinizerDb
}

export { javinizerDb as javinizer }
