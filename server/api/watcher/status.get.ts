import { defineEventHandler } from 'h3'
import { watcherState } from '../../plugins/watcher'
import fs from 'node:fs'
import path from 'node:path'

export default defineEventHandler(async (event) => {
  let totalVideos = 0
  const movieDir = watcherState.watchedPath || process.env.MOVIE_DIRECTORY || '/movies'

  try {
    if (movieDir && fs.existsSync(movieDir)) {
      const walk = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            // Ignore non-essential folders like temp extraction or dotfiles
            if (entry.name.startsWith('.') || entry.name.toLowerCase() === 'extracted') continue
            walk(fullPath)
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase()
            if (['.mp4', '.mkv', '.avi', '.wmv', '.iso'].includes(ext)) {
              totalVideos++
            }
          }
        }
      }
      walk(movieDir)
    }
  } catch (err: any) {
    console.error('[API status] Error calculating folder files:', err.message)
  }

  // Update calculated statistics
  watcherState.totalFilesWatched = totalVideos

  return {
    success: true,
    state: {
      active: watcherState.active,
      watchedPath: movieDir,
      polling: watcherState.polling,
      interval: watcherState.interval,
      stabilityThreshold: watcherState.stabilityThreshold,
      totalFilesWatched: totalVideos,
      lastScannedAt: watcherState.lastScannedAt,
    }
  }
})
