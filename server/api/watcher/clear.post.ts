import { defineEventHandler } from 'h3'
import { useStorage } from '#imports'

export default defineEventHandler(async (event) => {
  const storage = useStorage('data')
  await storage.setItem('watcher:tasks', [])
  
  return {
    success: true,
    message: 'Nhật ký tác vụ đã được xóa thành công.'
  }
})
