import { defineEventHandler, readBody, createError, useStorage } from '#imports'
import { getQuery } from 'h3'
import fs from 'node:fs'
import path from 'node:path'
import { cleanupJunkVideos } from '../../utils/javinizer-batch'

const STORAGE_KEY = 'pipeline:junk_patterns'
const DEFAULT_PATTERNS = ['996gg\\.cc', '18\\+游戏大全', '游戏大全']

export default defineEventHandler(async (event) => {
  const method = event.node.req.method
  const storage = useStorage('data')

  const patterns = (await storage.getItem<string[]>(STORAGE_KEY)) ?? DEFAULT_PATTERNS
  const movieDir = process.env.MOVIE_DIRECTORY || '/movies'

  // 1. GET: Lấy danh sách Regex rác & check quyền hệ thống
  if (method === 'GET') {
    let hasDeletePermission = false
    let permErrorMessage = ''

    try {
      if (fs.existsSync(movieDir)) {
        // Thực hiện kiểm tra quyền thực tế bằng cách tạo tệp tạm rồi xóa đi
        const tempTestFile = path.join(movieDir, `.avsub_perm_test_${Date.now()}.tmp`)
        fs.writeFileSync(tempTestFile, 'test')
        fs.unlinkSync(tempTestFile)
        hasDeletePermission = true
      } else {
        permErrorMessage = `Thư mục ${movieDir} không tồn tại.`
      }
    } catch (err: any) {
      permErrorMessage = err.message || 'Lỗi không xác định khi ghi/xóa.'
    }

    return {
      success: true,
      patterns,
      hasDeletePermission,
      permErrorMessage,
      movieDir,
    }
  }

  // 2. POST: Lưu/cập nhật danh sách mẫu Regex lọc video rác HOẶC Chạy dọn dẹp thủ công
  if (method === 'POST') {
    const query = getQuery(event)
    if (query.action === 'cleanup') {
      try {
        console.log(`[API Junk Filters] Running manual cleanup of junk video files in ${movieDir}…`)
        const result = cleanupJunkVideos(movieDir, patterns)
        return {
          success: true,
          message: 'Manual cleanup completed',
          deleted: result.deleted,
          errors: result.errors,
        }
      } catch (err: any) {
        throw createError({
          statusCode: 500,
          statusMessage: `Failed to run manual cleanup: ${err.message}`,
        })
      }
    }

    const body = await readBody(event)
    const { patterns: newPatterns } = body

    if (!Array.isArray(newPatterns)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'patterns must be a string array',
      })
    }

    // Kiểm tra tính hợp lệ của từng Regex
    for (const pattern of newPatterns) {
      try {
        new RegExp(pattern)
      } catch (err: any) {
        throw createError({
          statusCode: 400,
          statusMessage: `Mẫu Regex không hợp lệ: "${pattern}". Chi tiết: ${err.message}`,
        })
      }
    }

    await storage.setItem(STORAGE_KEY, newPatterns)
    console.log(`[API Junk Filters] Updated junk patterns queue filter to:`, newPatterns)

    return {
      success: true,
      message: 'Regex junk filter patterns updated successfully',
    }
  }

  throw createError({
    statusCode: 405,
    statusMessage: 'Method Not Allowed',
  })
})
