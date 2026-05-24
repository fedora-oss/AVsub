import { javinizer } from '../utils/javinizer-db'

export default defineNitroPlugin(async (nitroApp) => {
  console.log('[SQLite Optimize] Initializing database pragmas...')
  try {
    // PRAGMA journal_mode=WAL enables Write-Ahead Logging, allowing concurrent readers and one writer.
    // This dramatically improves throughput and prevents SQLITE_BUSY locking errors.
    const mode = await javinizer.$queryRaw`PRAGMA journal_mode=WAL;`
    // PRAGMA synchronous=NORMAL is safe in WAL mode and speeds up writes.
    const sync = await javinizer.$queryRaw`PRAGMA synchronous=NORMAL;`
    
    console.log('[SQLite Optimize] Successfully set SQLite pragmas:')
    console.log(`  - journal_mode:`, mode)
    console.log(`  - synchronous:`, sync)
  } catch (error) {
    console.error('[SQLite Optimize] Failed to set pragmas:', error)
  }
})
