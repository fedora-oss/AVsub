import { defineTask } from 'nitropack/runtime'
import { useStorage, runTask } from '#imports'

/**
 * Nitro Task: javinizer:scheduler  (cron: every 5 minutes)
 *
 * Đọc danh sách pending pipeline jobs từ Nitro storage.
 * Mỗi job có trường `fireAt` (timestamp ms).
 * Nếu `fireAt <= now` → gọi task `javinizer:pipeline`.
 * Các job chưa đến giờ được giữ lại trong storage.
 */

export interface ScheduledPipelineJob {
  /** Unique id để trace log */
  id: string
  /** Thời điểm add torrent */
  scheduledAt: number
  /** Thời điểm muốn chạy pipeline */
  fireAt: number
  /** Override thư mục movies (tuỳ chọn) */
  moviesDir?: string
}

const STORAGE_KEY = 'pipeline:pending'

export default defineTask({
  meta: {
    name: 'javinizer:scheduler',
    description: 'Cron: check and run pending javinizer pipeline jobs',
  },

  async run() {
    const storage = useStorage('data')

    const pending = (await storage.getItem<ScheduledPipelineJob[]>(STORAGE_KEY)) ?? []
    const now = Date.now()

    const due: ScheduledPipelineJob[] = []
    const notYet: ScheduledPipelineJob[] = []

    for (const job of pending) {
      if (job.fireAt <= now) {
        due.push(job)
      } else {
        notYet.push(job)
      }
    }

    if (due.length === 0) {
      console.log(`[task:javinizer:scheduler] No jobs due. ${notYet.length} pending.`)
      return { result: { ran: 0, remaining: notYet.length } }
    }

    // Lưu lại các job chưa đến giờ trước khi chạy
    await storage.setItem(STORAGE_KEY, notYet)

    for (const job of due) {
      console.log(`[task:javinizer:scheduler] Running job ${job.id} (scheduled=${new Date(job.scheduledAt).toISOString()})`)
      try {
        await runTask('javinizer:pipeline', {
          payload: { moviesDir: job.moviesDir },
        })
        console.log(`[task:javinizer:scheduler] Job ${job.id} completed ✅`)
      } catch (err: any) {
        console.error(`[task:javinizer:scheduler] Job ${job.id} failed ❌:`, err.message)
      }
    }

    return { result: { ran: due.length, remaining: notYet.length } }
  },
})
