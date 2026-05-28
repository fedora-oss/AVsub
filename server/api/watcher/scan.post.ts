import { defineEventHandler } from 'h3'
import { watcherState, processMovieFile, addWatcherTask } from '../../plugins/watcher'
import { useStorage } from '#imports'
import fs from 'node:fs'
import path from 'node:path'

async function updateWatcherTask(id: string, updates: any) {
  const storage = useStorage('data')
  const tasks = (await storage.getItem<any[]>('watcher:tasks')) ?? []
  const taskIndex = tasks.findIndex(t => t.id === id)
  if (taskIndex !== -1) {
    tasks[taskIndex] = { ...tasks[taskIndex], ...updates }
    await storage.setItem('watcher:tasks', tasks)
  }
}

async function runBackgroundScan(movieDir: string) {
  console.log(`[Scan] Starting manual bulk scan on: ${movieDir}`)
  
  const videoFiles: string[] = []
  
  const walk = (dir: string) => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (entry.name.startsWith('.') || entry.name.toLowerCase() === 'extracted') continue
          walk(fullPath)
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase()
          if (['.mp4', '.mkv', '.avi', '.wmv', '.iso'].includes(ext)) {
            videoFiles.push(fullPath)
          }
        }
      }
    } catch (walkErr: any) {
      console.warn(`[Scan] Skip broken subdirectory ${dir} due to error:`, walkErr.message)
    }
  }
  
  try {
    walk(movieDir)
  } catch (err: any) {
    console.error('[Scan] Error walking directory:', err.message)
    return
  }

  console.log(`[Scan] Found ${videoFiles.length} video files on disk. Checking subtitles...`)

  // Log scan start task
  const scanTask = await addWatcherTask({
    type: 'manual_scan',
    status: 'running',
    movieCode: 'BULK-SCAN',
    filePath: movieDir,
    message: `Khởi chạy quét ổ đĩa: Tìm thấy ${videoFiles.length} tệp video. Đang kiểm tra trạng thái phụ đề...`
  })

  let missingCount = 0
  const missingFiles: string[] = []

  for (const filePath of videoFiles) {
    const parentDir = path.dirname(filePath)
    try {
      const hasSrt = fs.readdirSync(parentDir).some(f => f.toLowerCase().endsWith('.srt'))
      if (!hasSrt) {
        missingFiles.push(filePath)
        missingCount++
      }
    } catch {}
  }

  console.log(`[Scan] Found ${missingCount} movies missing subtitles.`)

  if (missingCount === 0) {
    await updateWatcherTask(scanTask.id, {
      status: 'completed',
      message: `Quét hoàn tất: Không phát hiện phim nào thiếu phụ đề tiếng Việt/Nhật. (Tổng tệp video đã quét: ${videoFiles.length})`
    })
    return
  }

  await updateWatcherTask(scanTask.id, {
    message: `Quét hoàn tất: Phát hiện ${missingCount}/${videoFiles.length} phim chưa có phụ đề. Bắt đầu tiến trình tải ngầm hàng loạt...`
  })

  // Sequentially process each missing movie in background with a slight delay to prevent rate limits
  for (let i = 0; i < missingFiles.length; i++) {
    const filePath = missingFiles[i]
    const filename = path.basename(filePath)
    
    // We update the general scan log status progress
    await updateWatcherTask(scanTask.id, {
      message: `Đang tải phụ đề hàng loạt: Xử lý phim ${i + 1}/${missingCount} - ${filename}...`
    })

    await processMovieFile(filePath, 'manual')
    
    // Wait 3.5 seconds before next request to play nice with avsubtitles.com
    await new Promise(resolve => setTimeout(resolve, 3500))
  }

  await updateWatcherTask(scanTask.id, {
    status: 'completed',
    message: `Đã hoàn tất tiến trình quét và tải hàng loạt ngầm cho ${missingCount} phim thiếu phụ đề!`
  })
}

export default defineEventHandler(async (event) => {
  const movieDir = watcherState.watchedPath || process.env.MOVIE_DIRECTORY || '/movies'

  if (!movieDir || !fs.existsSync(movieDir)) {
    return {
      success: false,
      message: `Thư mục phim không khả dụng hoặc không tồn tại: ${movieDir}`
    }
  }

  // Update last scanned timestamp
  watcherState.lastScannedAt = Date.now()

  // Run scan asynchronously in background
  runBackgroundScan(movieDir).catch(err => {
    console.error('[API Scan] Background scan crashed:', err)
  })

  return {
    success: true,
    message: 'Tiến trình quét và tải phụ đề hàng loạt đã được khởi chạy ngầm!'
  }
})
