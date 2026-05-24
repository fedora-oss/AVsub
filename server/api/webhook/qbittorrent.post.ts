import { defineEventHandler, readBody } from '#imports'
import { qbitPost } from '../../utils/qbittorrent'
import { runTask } from '#imports'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { hash, torrentName, filePath, category } = body

  console.log(`[qBittorrent Webhook] Received completion hook for: "${torrentName || 'Unknown'}" (hash=${hash || 'none'})`)

  // 1. Stop seeding if hash is provided (by pausing the torrent)
  if (hash) {
    try {
      console.log(`[qBittorrent Webhook] Stopping seeding (pausing torrent) for hash: ${hash}`)
      const response = await qbitPost('/api/v2/torrents/pause', `hashes=${encodeURIComponent(hash)}`)
      if (response.ok) {
        console.log(`[qBittorrent Webhook] Torrent seeding stopped successfully.`)
      } else {
        console.warn(`[qBittorrent Webhook] Failed to stop seeding. qBittorrent HTTP ${response.status}`)
      }
    } catch (err: any) {
      console.error(`[qBittorrent Webhook] Failed to pause seeding for hash ${hash}:`, err.message)
    }
  }

  // 2. Trigger Post-Download Pipeline immediately and asynchronously
  console.log(`[qBittorrent Webhook] Triggering post-download pipeline immediately…`)
  try {
    runTask('javinizer:pipeline')
      .then((res: any) => {
        console.log(`[qBittorrent Webhook] Post-download pipeline completed successfully:`, res)
      })
      .catch((err: any) => {
        console.error(`[qBittorrent Webhook] Post-download pipeline failed:`, err.message)
      })
  } catch (err: any) {
    console.error(`[qBittorrent Webhook] Failed to start pipeline task:`, err.message)
  }

  return {
    success: true,
    message: 'Torrent completed webhook processed successfully. Seeding paused and pipeline triggered.',
  }
})
