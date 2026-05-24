import { defineEventHandler, readBody } from 'h3'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { magnet } = body

  if (!magnet) {
    return { success: false, message: 'Magnet link required' }
  }

  const engines = (global as any).__torrent_engines as Map<string, any> | undefined
  if (engines && engines.has(magnet)) {
    const engine = engines.get(magnet)
    if (engine) {
      console.log(`[TorrentStream] Stopping and destroying engine for torrent: ${engine.torrent ? engine.torrent.name : magnet}`)
      engine.destroy()
      engines.delete(magnet)
      return { success: true, message: 'Torrent engine destroyed' }
    }
  }

  return { success: true, message: 'Torrent engine not found or already stopped' }
})

