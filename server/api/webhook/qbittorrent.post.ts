import { defineEventHandler, readBody, runTask  } from '#imports'
import { qbitPost } from '../../utils/qbittorrent'
import { extractJavCode } from '../../utils/javinizer-scrape'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { hash, torrentName, filePath, category } = body

  console.log(`[qBittorrent Webhook] Received completion hook for: "${torrentName || 'Unknown'}" (hash=${hash || 'none'})`)

  // 1. Stop seeding if hash is provided (by pausing the torrent)
  if (hash) {
    try {
      console.log(`[qBittorrent Webhook] Stopping seeding (pausing torrent) for hash: ${hash} (attempting legacy /pause)`)
      let response = await qbitPost('/api/v2/torrents/pause', `hashes=${encodeURIComponent(hash)}`)
      if (response.status === 404) {
        console.log(`[qBittorrent Webhook] /pause returned 404. Retrying with v5.0+ /stop endpoint...`)
        response = await qbitPost('/api/v2/torrents/stop', `hashes=${encodeURIComponent(hash)}`)
      }
      if (response.ok) {
        console.log(`[qBittorrent Webhook] Torrent seeding stopped successfully.`)
      } else {
        console.warn(`[qBittorrent Webhook] Failed to stop seeding. qBittorrent HTTP ${response.status}`)
      }
    } catch (err: any) {
      console.error(`[qBittorrent Webhook] Failed to pause seeding for hash ${hash}:`, err.message)
    }
  }

  // 2. Trigger targeted metadata sync or full pipeline immediately and asynchronously
  const code = extractJavCode(torrentName || filePath || '')
  if (code) {
    console.log(`[qBittorrent Webhook] Extracted JAV code: ${code}. Triggering targeted metadata sync immediately…`)
  } else {
    console.log(`[qBittorrent Webhook] No JAV code found in torrent name/path. Triggering full directory scan…`)
  }

  try {
    runTask('javinizer:pipeline', { payload: { movieCode: code || undefined } })
      .then((res: any) => {
        console.log(`[qBittorrent Webhook] Post-download pipeline task completed:`, res)
      })
      .catch((err: any) => {
        console.error(`[qBittorrent Webhook] Post-download pipeline task failed:`, err.message)
      })
  } catch (err: any) {
    console.error(`[qBittorrent Webhook] Failed to start pipeline task:`, err.message)
  }

  return {
    success: true,
    message: code 
      ? `Torrent completion processed. Triggered targeted Javinizer sync for movie code: ${code}`
      : 'Torrent completion processed. JAV code not found, triggered full directory scan pipeline.',
  }
})
