import { defineEventHandler } from 'h3'
import { useStorage } from '#imports'
import type { WatcherTask } from '../../plugins/watcher'

export default defineEventHandler(async (event) => {
  const storage = useStorage('data')
  const tasks = (await storage.getItem<WatcherTask[]>('watcher:tasks')) ?? []
  
  return {
    success: true,
    tasks
  }
})
