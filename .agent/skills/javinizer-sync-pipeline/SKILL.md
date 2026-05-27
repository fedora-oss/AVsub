---
name: javinizer-sync-pipeline
description: Operational runbook for Javinizer metadata syncing, SQLite integration, and preserving torrent seeding health.
---

# Javinizer Sync & Seeding Protection Runbook

Use this skill when modifying Javinizer connection parameters, updating the Prisma database model, or optimizing post-download automation workflows.

## ⚡ Dual-Mode Pipeline Design (`server/tasks/javinizer/pipeline.ts`)
The `javinizer:pipeline` task supports two execution workflows:
1. **Targeted Sync Mode (Automatic / Lightweight)**:
   - Triggered when `payload.movieCode` (e.g. `ABP-420`) is provided.
   - Bypasses all filesystem actions (no cleaning, no file renames, no file relocations).
   - Makes a single serialised POST request to Javinizer's `/api/v1/scrape` API.
   - Saves metadata directly into `javinizer.db` SQLite database instantly.
   - **Benefit**: Ensures that active qBittorrent seeds are NOT broken due to "Missing Files".
2. **Batch Directory Mode (Manual / Fallback)**:
   - Triggered when `payload.movieCode` is empty.
   - Scans the entirety of the `/movies` directory.
   - Performs file cleaning, renaming, and calls Javinizer's batch scrape and organization mechanisms.

## 🤝 Javinizer Scraper Queue (`server/utils/javinizer-scrape.ts`)
- Javinizer's scraper container operates single-threaded. Flooding it with multiple concurrent API scraping requests will lead to HTTP timeouts.
- All outgoing API calls to Javinizer `/api/v1/scrape` MUST be serialised using the queue utility `enqueueTask()` provided in `server/utils/javinizer-scrape.ts`.
- Default scrapers recommended for optimal coverage:
  - `r18dev`
  - `dmm`
  - `jav321`
  - `libredmm`
  - `javlibrary`
  - `javdb`
  - `javbus`

## 🗄️ SQLite database connection (`prisma/schema.prisma`)
- AVsub connects to the Javinizer database (`javinizer.db`) in read-only mode to populate the Plex-style local library page.
- Direct database writes should only be triggered via Javinizer container APIs to ensure database structure integrity.
