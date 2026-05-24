import { defineEventHandler, readBody, createError, useStorage } from '#imports'
import { runTask } from '#imports'
import type { ScheduledPipelineJob } from '../../tasks/javinizer/scheduler'

const STORAGE_KEY = 'pipeline:pending'

export default defineEventHandler(async (event) => {
  const method = event.node.req.method
  const storage = useStorage('data')

  const pending = (await storage.getItem<ScheduledPipelineJob[]>(STORAGE_KEY)) ?? []

  // 1. GET: Trả về danh sách job đang chờ chạy ngầm
  if (method === 'GET') {
    const now = Date.now()
    const formattedJobs = pending.map((job) => {
      const remainingMs = job.fireAt - now
      return {
        id: job.id,
        scheduledAt: new Date(job.scheduledAt).toISOString(),
        fireAt: new Date(job.fireAt).toISOString(),
        moviesDir: job.moviesDir ?? '/movies',
        remainingSeconds: Math.max(0, Math.round(remainingMs / 1000)),
      }
    })

    return {
      success: true,
      jobs: formattedJobs,
    }
  }

  // 2. POST: Kích hoạt chạy ngay lập tức một job chỉ định
  if (method === 'POST') {
    const body = await readBody(event)
    const { id } = body

    if (!id) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Job ID is required in the body to trigger it immediately',
      })
    }

    const jobIndex = pending.findIndex((j) => j.id === id)
    if (jobIndex === -1) {
      throw createError({
        statusCode: 404,
        statusMessage: `Job with ID ${id} not found in the queue`,
      })
    }

    const job = pending[jobIndex]

    // Xoá job khỏi hàng đợi trong storage
    pending.splice(jobIndex, 1)
    await storage.setItem(STORAGE_KEY, pending)

    console.log(`[API Pipeline Jobs] Manually triggering job ${id} now…`)

    try {
      // Gọi Nitro task chạy ngầm javinizer:pipeline
      // Nitro's runTask is async, we can run it asynchronously or await it.
      // Awaiting it allows returning the actual execution logs/results to the user! That's much better!
      const result = await runTask('javinizer:pipeline', {
        payload: { moviesDir: job.moviesDir },
      })

      return {
        success: true,
        message: `Job ${id} has been manually triggered and finished successfully`,
        result,
      }
    } catch (err: any) {
      console.error(`[API Pipeline Jobs] Manual trigger failed for job ${id}:`, err.message)
      throw createError({
        statusCode: 500,
        statusMessage: `Failed to manually run pipeline for job ${id}: ${err.message}`,
      })
    }
  }

  // 3. DELETE: Hủy bỏ một job khỏi hàng đợi
  if (method === 'DELETE') {
    const body = await readBody(event)
    const { id } = body

    if (!id) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Job ID is required in the body to cancel it',
      })
    }

    const filteredPending = pending.filter((j) => j.id !== id)
    const cancelledCount = pending.length - filteredPending.length

    if (cancelledCount === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: `Job with ID ${id} not found in the queue`,
      })
    }

    await storage.setItem(STORAGE_KEY, filteredPending)
    console.log(`[API Pipeline Jobs] Cancelled job ${id} from the queue`)

    return {
      success: true,
      message: `Job ${id} has been cancelled successfully`,
    }
  }

  throw createError({
    statusCode: 405,
    statusMessage: 'Method Not Allowed',
  })
})
