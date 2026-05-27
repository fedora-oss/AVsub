---
name: subtitle-downloader-watcher
description: Guidelines for managing the folder watcher plugin, Chokidar configurations, and automated subtitle downloading.
---

# Subtitle Downloader & Directory Watcher Runbook

Use this skill when debuging or optimizing filesystem watchers, configuring Chokidar options, or troubleshooting automated subtitle downloads.

## 📁 Chokidar Watcher Configurations (`server/plugins/watcher.ts`)
- **Docker & NAS Compatibility**: Filesystem events on NAS networks or mounted volumes can be missed by native OS watch descriptors. 
- Use polling `usePolling: true` by default, configured via:
  - `WATCHER_POLLING` (defaults to `true`)
  - `WATCHER_POLL_INTERVAL` (defaults to `5000` ms)
- **awaitWriteFinish**: To prevent the watcher from processing partial/incomplete downloads, always include `awaitWriteFinish` configuration with:
  - `stabilityThreshold` (defaults to `10000` ms)
  - `pollInterval: 1000` ms

## 📥 Watcher Task Logs persistence
- Watcher tasks and logs (such as pending, running, completed, or failed subtitle downloads) must be saved into Nitro's local storage system.
- Access the `watcher:tasks` store using:
  ```typescript
  const storage = useStorage('data')
  const tasks = await storage.getItem('watcher:tasks')
  ```
- Cap log tasks to a maximum of 100 entries to prevent performance degradation.

## 🔀 Subtitle Search Flow
1. Watcher detects a new file, stabilizes it, and extracts the JAV code.
2. If the folder already contains a `.srt` file, the watcher skips search but immediately calls `triggerPipeline(code)` to sync metadata.
3. Otherwise, search subtitles on the internal `/api/search?keyword=CODE` endpoint.
4. If found, download the best subtitle using the `/api/download` POST API.
5. Once subtitles are fetched (or fail), trigger `triggerPipeline(code)` to update metadata.
