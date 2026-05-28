import { useStorage, runTask } from '#imports'
import chokidar from 'chokidar'
import fs from 'node:fs'
import path from 'node:path'

export interface WatcherTask {
  id: string
  type: 'watch_detect' | 'subtitle_search' | 'subtitle_download' | 'manual_scan'
  status: 'pending' | 'running' | 'completed' | 'failed'
  movieCode: string
  filePath: string
  message: string
  error?: string
  timestamp: number
}

// Global active status and statistics
export const watcherState = {
  active: false,
  watchedPath: '',
  polling: true,
  interval: 5000,
  stabilityThreshold: 10000,
  totalFilesWatched: 0,
  lastScannedAt: 0,
}

// Track processed files in memory to avoid redundant dual-trigger events (add and change)
const processedFiles = new Set<string>()

// Helper to extract JAV Code
export function extractJavCode(str: string): string | null {
  const cleaned = str.replace(/hhd-?800/gi, '')
  const match = cleaned.match(/\b([A-Za-z]{2,10})-?(\d{2,10})(?!\d)/)
  if (!match?.[1] || !match?.[2]) return null
  return `${match[1].toUpperCase()}-${match[2]}`
}


// Helper to log watcher tasks into Nitro storage
export async function addWatcherTask(task: Omit<WatcherTask, 'id' | 'timestamp'>): Promise<WatcherTask> {
  const storage = useStorage('data')
  const tasks = (await storage.getItem<WatcherTask[]>('watcher:tasks')) ?? []
  
  const newTask: WatcherTask = {
    ...task,
    id: Math.random().toString(36).substring(2, 9),
    timestamp: Date.now()
  }
  
  tasks.unshift(newTask)
  if (tasks.length > 100) {
    tasks.length = 100
  }
  
  await storage.setItem('watcher:tasks', tasks)
  return newTask
}

// Helper to update log tasks in Nitro storage
export async function updateWatcherTask(id: string, updates: Partial<WatcherTask>) {
  const storage = useStorage('data')
  const tasks = (await storage.getItem<WatcherTask[]>('watcher:tasks')) ?? []
  const taskIndex = tasks.findIndex(t => t.id === id)
  if (taskIndex !== -1) {
    tasks[taskIndex] = { ...tasks[taskIndex], ...updates }
    await storage.setItem('watcher:tasks', tasks)
  }
}

/**
 * Triggers the post-download pipeline immediately and asynchronously in the background.
 */
function triggerPipeline(code: string) {
  console.log(`[Watcher] [${code}] Triggering targeted post-download sync immediately…`)
  try {
    runTask('javinizer:pipeline', { payload: { movieCode: code } })
      .then((res: any) => {
        console.log(`[Watcher] [${code}] Post-download targeted sync finished successfully:`, res)
      })
      .catch((err: any) => {
        console.error(`[Watcher] [${code}] Post-download targeted sync encountered error:`, err.message)
      })
  } catch (err: any) {
    console.error(`[Watcher] [${code}] Failed to execute targeted sync task:`, err.message)
  }
}

// Core function to process movie and download subtitles
export async function processMovieFile(filePath: string, source: 'watcher' | 'manual' = 'watcher') {
  const filename = path.basename(filePath)
  const code = extractJavCode(filename)
  
  if (!code) {
    console.log(`[Watcher] Could not extract JAV code from: ${filename}`)
    return
  }

  const parentDir = path.dirname(filePath)
  
  // Skip if we already have .srt files in the directory
  try {
    const files = fs.readdirSync(parentDir)
    const hasSrt = files.some(f => f.toLowerCase().endsWith('.srt'))
    if (hasSrt) {
      console.log(`[Watcher] Movie ${code} already has subtitles. Skipping subtitle search but triggering pipeline.`)
      triggerPipeline(code)
      return
    }
  } catch (err: any) {
    console.error(`[Watcher] Error reading parent directory ${parentDir}:`, err.message)
    triggerPipeline(code)
    return
  }

  console.log(`[Watcher] Processing missing subtitles for JAV code: ${code}`)
  
  // Register starting task
  const taskType = source === 'watcher' ? 'watch_detect' : 'manual_scan'
  const task = await addWatcherTask({
    type: taskType,
    status: 'running',
    movieCode: code,
    filePath,
    message: `Phát hiện phim mới: ${code}. Đang tìm kiếm phụ đề...`
  })

  try {
    // 1. Search for subtitles via internal endpoint
    console.log(`[Watcher] [${code}] Searching subtitle...`)
    await updateWatcherTask(task.id, {
      message: `Đang tìm kiếm phụ đề cho mã phim ${code} trên AVSubtitles...`
    })

    const searchResults = await $fetch<any[]>('/api/search', {
      query: { keyword: code }
    })

    if (!searchResults || searchResults.length === 0) {
      console.log(`[Watcher] [${code}] No subtitles found on AVSubtitles. Triggering pipeline anyway.`)
      await updateWatcherTask(task.id, {
        status: 'failed',
        message: `Không tìm thấy phụ đề nào cho mã ${code} trên hệ thống.`
      })
      triggerPipeline(code)
      return
    }

    const bestSub = searchResults[0]
    console.log(`[Watcher] [${code}] Found sub! Downloading from ${bestSub.detail_link}`)
    
    // 2. Download and extract subtitle via internal endpoint
    await updateWatcherTask(task.id, {
      message: `Đã tìm thấy phụ đề. Đang tiến hành tải và giải nén...`
    })

    const downloadResponse = await $fetch<any>('/api/download', {
      method: 'POST',
      body: {
        detail_link: bestSub.detail_link,
        keyword: code,
        code: code
      }
    })

    if (downloadResponse.success) {
      console.log(`[Watcher] [${code}] Successfully downloaded subtitles:`, downloadResponse.movedFiles)
      await updateWatcherTask(task.id, {
        status: 'completed',
        message: `Tải thành công phụ đề: ${downloadResponse.movedFiles.join(', ')}`
      })

      // Trigger Jellyfin library refresh if configured in environment
      const jellyfinUrl = process.env.JELLYFIN_URL
      const jellyfinApiKey = process.env.JELLYFIN_API_KEY
      if (jellyfinUrl && jellyfinApiKey) {
        console.log(`[Watcher] [${code}] Triggering Jellyfin library scan...`)
        $fetch(`${jellyfinUrl}/Library/Refresh`, {
          method: 'POST',
          query: { api_key: jellyfinApiKey }
        }).then(() => {
          console.log(`[Watcher] [${code}] Jellyfin library scan triggered successfully.`)
        }).catch((err: any) => {
          console.error(`[Watcher] [${code}] Failed to trigger Jellyfin scan:`, err.message)
        })
      }
    } else {
      console.error(`[Watcher] [${code}] Subtitle download reported failure:`, downloadResponse.error)
      await updateWatcherTask(task.id, {
        status: 'failed',
        message: `Lỗi khi tải phụ đề: ${downloadResponse.error}`
      })
    }

    // Trigger pipeline at the end of successful/failed download flow
    triggerPipeline(code)

  } catch (err: any) {
    console.error(`[Watcher] [${code}] Subtitle fetch/download threw an error:`, err.message)
    await updateWatcherTask(task.id, {
      status: 'failed',
      message: `Gặp lỗi hệ thống: ${err.message}`,
      error: err.message
    })
    // Trigger pipeline even on error
    triggerPipeline(code)
  }
}

export default defineNitroPlugin((nitroApp) => {
  if (process.env.DISABLE_WATCHER === 'true') {
    console.warn('[Watcher] Watcher is explicitly disabled via DISABLE_WATCHER=true environment variable.')
    return
  }

  const movieDir = process.env.MOVIE_DIRECTORY || '/movies'
  
  if (!movieDir) {
    console.warn('[Watcher] MOVIE_DIRECTORY is not set. Watcher is disabled.')
    return
  }

  if (!fs.existsSync(movieDir)) {
    console.warn(`[Watcher] MOVIE_DIRECTORY path "${movieDir}" does not exist. Watcher is disabled.`)
    return
  }

  // Watcher config variables
  const isPolling = process.env.WATCHER_POLLING !== 'false' // Default: true for Docker/NAS compatibility
  const pollInterval = parseInt(process.env.WATCHER_POLL_INTERVAL || '5000', 10)
  const stabilityThreshold = parseInt(process.env.WATCHER_STABILITY_THRESHOLD || '10000', 10)

  // Update global state
  watcherState.active = true
  watcherState.watchedPath = movieDir
  watcherState.polling = isPolling
  watcherState.interval = pollInterval
  watcherState.stabilityThreshold = stabilityThreshold

  console.log(`[Watcher] Initializing filesystem folder monitoring for path: ${movieDir}`)
  console.log(`[Watcher] Configurations: polling=${isPolling}, interval=${pollInterval}ms, stabilityThreshold=${stabilityThreshold}ms`)

  // Paths confirmed to be broken (I/O errors) — skipped on every watcher restart
  const brokenPaths = new Set<string>()

  // Track whether a graceful shutdown has been requested
  let isShuttingDown = false

  // Watch for newly added video files
  const videoExtensions = ['.mp4', '.mkv', '.avi', '.wmv', '.iso']

  // Active watcher reference (replaced on self-heal restart)
  let activeWatcher: ReturnType<typeof chokidar.watch> | null = null

  // Debounce timer for watcher restart to batch multiple rapid EIO errors
  let restartTimer: ReturnType<typeof setTimeout> | null = null

  function buildIgnoredList(): (RegExp | string)[] {
    const base: (RegExp | string)[] = [
      /(^|[\/\\])\../,            // ignore hidden files (.dotfiles)
      /\.(srt|txt|nfo|jpg|png)$/i, // ignore sub/meta assets to avoid recursive watching triggers
      /extracted/i,               // ignore temp extraction directories
      /node_modules/i,
      /\.git/i
    ]
    // Add all known broken paths to the ignore list
    for (const p of brokenPaths) {
      base.push(p)
    }
    return base
  }

  function attachHandlers(watcher: ReturnType<typeof chokidar.watch>) {
    watcher
      .on('add', async (filePath) => {
        const ext = path.extname(filePath).toLowerCase()
        if (!videoExtensions.includes(ext)) return

        // Handle duplicate triggers
        if (processedFiles.has(filePath)) return
        processedFiles.add(filePath)
        setTimeout(() => processedFiles.delete(filePath), 60000) // Reset after 1 minute

        console.log(`[Watcher] File added and stabilized: ${filePath}`)
        await processMovieFile(filePath, 'watcher')
      })
      .on('change', async (filePath) => {
        // In some operating systems or NAS setups, chokidar triggers "change" instead of "add" when files complete downloading
        const ext = path.extname(filePath).toLowerCase()
        if (!videoExtensions.includes(ext)) return

        if (processedFiles.has(filePath)) return
        processedFiles.add(filePath)
        setTimeout(() => processedFiles.delete(filePath), 60000)

        console.log(`[Watcher] File updated and stabilized: ${filePath}`)
        await processMovieFile(filePath, 'watcher')
      })
      .on('error', (error: any) => {
        // Extract the offending path from the error (EIO errors carry a `.path` property)
        const badPath: string | undefined = error?.path

        if (badPath) {
          if (!brokenPaths.has(badPath)) {
            brokenPaths.add(badPath)
            console.warn(`[Watcher] I/O error on path "${badPath}" — adding to skip list. Will restart watcher. Error: ${error.message}`)
          } else {
            // Already known bad path, just log quietly
            console.warn(`[Watcher] Repeated I/O error on already-skipped path "${badPath}". Error: ${error.message}`)
          }
        } else {
          console.error(`[Watcher] Directory watcher encountered an error:`, error)
        }

        // Debounce restart: collect all rapid EIO errors within 2s before restarting once
        if (!isShuttingDown) {
          if (restartTimer) clearTimeout(restartTimer)
          restartTimer = setTimeout(() => {
            restartTimer = null
            scheduleRestart()
          }, 2000)
        }
      })
      .on('ready', () => {
        const skipped = brokenPaths.size > 0 ? ` (skipping ${brokenPaths.size} broken path(s))` : ''
        console.log(`[Watcher] Directory watcher is active and ready to catch new file events 24/7.${skipped}`)
      })
  }

  async function scheduleRestart() {
    if (isShuttingDown) return

    console.log(`[Watcher] Restarting watcher, skipping ${brokenPaths.size} broken path(s)...`)

    // Close the old watcher safely
    if (activeWatcher) {
      try {
        await activeWatcher.close()
      } catch (e: any) {
        console.warn('[Watcher] Error closing old watcher during restart:', e.message)
      }
      activeWatcher = null
    }

    // Start a fresh watcher with the updated ignore list
    const newWatcher = chokidar.watch(movieDir, {
      ignored: buildIgnoredList(),
      persistent: true,
      ignoreInitial: true,
      usePolling: isPolling,
      interval: pollInterval,
      binaryInterval: pollInterval,
      awaitWriteFinish: {
        stabilityThreshold,
        pollInterval: 1000
      }
    })

    activeWatcher = newWatcher
    attachHandlers(newWatcher)
  }

  // Initialize chokidar
  const initialWatcher = chokidar.watch(movieDir, {
    ignored: buildIgnoredList(),
    persistent: true,
    ignoreInitial: true,          // do not scan existing files on boot (covered by Manual Bulk Scan)
    usePolling: isPolling,
    interval: pollInterval,
    binaryInterval: pollInterval,
    awaitWriteFinish: {
      stabilityThreshold,
      pollInterval: 1000
    }
  })

  activeWatcher = initialWatcher
  attachHandlers(initialWatcher)

  // Export watcher reference to be able to close it on shutdown
  nitroApp.hooks.hook('close', async () => {
    console.log('[Watcher] Closing folder watcher...')
    isShuttingDown = true
    watcherState.active = false
    if (restartTimer) clearTimeout(restartTimer)
    if (activeWatcher) {
      await activeWatcher.close()
    }
  })
})
