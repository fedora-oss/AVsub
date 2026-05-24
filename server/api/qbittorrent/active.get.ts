import { defineEventHandler } from '#imports'
import { qbitGet } from '../../utils/qbittorrent'

export default defineEventHandler(async (event) => {
  try {
    const response = await qbitGet('/api/v2/torrents/info')
    if (!response.ok) {
      throw new Error(`qBittorrent returned HTTP ${response.status}`)
    }

    const torrents = await response.json() as any[]
    
    const formatted = torrents.map((t) => {
      return {
        hash: t.hash,
        name: t.name,
        size: t.size,
        progress: t.progress,      // float 0 to 1
        dlspeed: t.dlspeed,        // B/s
        upspeed: t.upspeed,        // B/s
        eta: t.eta,                // seconds
        state: t.state,            // e.g. downloading, stalledDL, pausedDL, pausedUP, seeding
        category: t.category,
        num_seeds: t.num_seeds,
        num_leechs: t.num_leechs,
      }
    })

    return {
      success: true,
      torrents: formatted,
    }
  } catch (err: any) {
    console.error('[API QBit Active] Failed to fetch active torrents:', err.message)
    return {
      success: false,
      error: err.message,
      torrents: [],
    }
  }
})
