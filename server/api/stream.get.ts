import { defineEventHandler, getQuery, setResponseHeaders, createError, sendStream } from 'h3'
import torrentStream from 'torrent-stream'
import { fetchBufferWithCustomDns } from '../utils/dns-fetch'

// Singleton engine manager to keep active torrent engines alive across requests
let engines = (global as any).__torrent_engines as Map<string, any> | undefined

if (!engines) {
  engines = new Map<string, any>()
  ;(global as any).__torrent_engines = engines
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const magnet = query.magnet as string | undefined
  const torrentUrl = query.torrent as string | undefined

  if (!magnet && !torrentUrl) {
    throw createError({ statusCode: 400, statusMessage: 'Magnet link or Torrent URL is required' })
  }

  // Sanitize magnet links: scrapers often return malformed UTF-8 in the "dn" (display name) parameter.
  // We strip out the &dn= parameter entirely since it is purely cosmetic.
  let targetId: string | Buffer | null = null
  if (torrentUrl) {
    try {
      targetId = await fetchBufferWithCustomDns(torrentUrl)
    } catch (err: any) {
      console.warn('[TorrentStream] Failed to download .torrent file, falling back to magnet:', err.message)
    }
  } 
  
  if (!targetId && magnet) {
    targetId = magnet.replace(/&dn=[^&]*/g, '')
  }

  if (!targetId) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch .torrent and no magnet link provided' })
  }

  const key = magnet || torrentUrl!
  let engine = engines!.get(key)

  if (!engine) {
    console.log(`[TorrentStream] Starting new torrent engine for key: ${key.substring(0, 80)}...`)
    try {
      engine = torrentStream(targetId, {
        connections: 80,             // Limit connections for Gluetun/VPN stability
        uploads: 0,                  // Disable uploads to maximize download stream bandwidth
        tmp: '/tmp/torrent-stream',  // Storage path for chunks cache
      })
      engines!.set(key, engine)
    } catch (err: any) {
      console.error('[TorrentStream] Failed to initialize engine:', err)
      throw createError({ statusCode: 500, statusMessage: `Failed to initialize engine: ${err.message}` })
    }
  }

  // Wait for the engine to be ready and files loaded
  const file = await new Promise<any>((resolve, reject) => {
    if (engine.files && engine.files.length > 0) {
      const video = engine.files.reduce((a: any, b: any) => (a.length > b.length ? a : b))
      return resolve(video)
    }

    engine.on('ready', () => {
      const video = engine.files.reduce((a: any, b: any) => (a.length > b.length ? a : b))
      console.log(`[TorrentStream] Engine ready. Main video: ${video.name} (${(video.length / 1024 / 1024).toFixed(2)} MB)`)
      resolve(video)
    })

    engine.on('error', (err: any) => {
      console.error('[TorrentStream] Engine emitted error:', err)
      reject(err)
    })
  }).catch((err: any) => {
    console.error('[TorrentStream] Error resolving torrent files:', err)
    throw createError({ statusCode: 500, statusMessage: `Failed to resolve torrent files: ${err.message}` })
  })

  // Diagnostic log for peers, downloaded bytes, and speed
  const peerCount = engine.swarm ? engine.swarm.wires.length : 0
  const speed = engine.swarm && typeof engine.swarm.downloadSpeed === 'function' ? engine.swarm.downloadSpeed() : 0
  const downloaded = engine.swarm ? engine.swarm.downloaded : 0
  console.log(`[TorrentStream] [Diagnostics] Key: ${key.substring(0, 30)}... | Peers: ${peerCount} | Downloaded: ${(downloaded / 1024 / 1024).toFixed(2)} MB | Speed: ${(speed / 1024).toFixed(2)} KB/s`)

  const range = event.node.req.headers.range
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-")
    const start = parseInt(parts[0], 10)
    const end = parts[1] ? parseInt(parts[1], 10) : file.length - 1
    const chunksize = (end - start) + 1

    setResponseHeaders(event, {
      'Content-Range': `bytes ${start}-${end}/${file.length}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4', // Defaulting to mp4
    })

    event.node.res.statusCode = 206
    
    return sendStream(event, file.createReadStream({ start, end }))
  } else {
    setResponseHeaders(event, {
      'Content-Length': file.length,
      'Content-Type': 'video/mp4',
    })
    
    return sendStream(event, file.createReadStream())
  }
})

