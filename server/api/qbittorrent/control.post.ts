import { defineEventHandler, readBody, createError } from '#imports'
import { qbitPost } from '../../utils/qbittorrent'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { action, hash, deleteFiles = false } = body

  if (!action || !hash) {
    throw createError({
      statusCode: 400,
      statusMessage: 'action and hash are required in request body',
    })
  }

  try {
    let response: Response
    if (action === 'pause') {
      console.log(`[QBit Control] Pausing torrent: ${hash} (attempting legacy /pause)`)
      response = await qbitPost('/api/v2/torrents/pause', `hashes=${encodeURIComponent(hash)}`)
      if (response.status === 404) {
        console.log(`[QBit Control] /pause returned 404. Retrying with v5.0+ /stop endpoint...`)
        response = await qbitPost('/api/v2/torrents/stop', `hashes=${encodeURIComponent(hash)}`)
      }
    } else if (action === 'resume') {
      console.log(`[QBit Control] Resuming torrent: ${hash} (attempting legacy /resume)`)
      response = await qbitPost('/api/v2/torrents/resume', `hashes=${encodeURIComponent(hash)}`)
      if (response.status === 404) {
        console.log(`[QBit Control] /resume returned 404. Retrying with v5.0+ /start endpoint...`)
        response = await qbitPost('/api/v2/torrents/start', `hashes=${encodeURIComponent(hash)}`)
      }
    } else if (action === 'delete') {
      console.log(`[QBit Control] Deleting torrent: ${hash} (deleteFiles=${deleteFiles})`)
      response = await qbitPost('/api/v2/torrents/delete', `hashes=${encodeURIComponent(hash)}&deleteFiles=${deleteFiles}`)
    } else {
      throw createError({
        statusCode: 400,
        statusMessage: `Invalid action: ${action}`,
      })
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`qBittorrent returned HTTP ${response.status}: ${text}`)
    }

    return {
      success: true,
      message: `Torrent successfully action=${action} completed`,
    }
  } catch (err: any) {
    console.error(`[API QBit Control] Action=${action} failed for hash=${hash}:`, err.message)
    throw createError({
      statusCode: 500,
      statusMessage: `qBittorrent command execution failed: ${err.message}`,
    })
  }
})
