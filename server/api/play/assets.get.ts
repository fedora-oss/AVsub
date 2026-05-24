import { defineEventHandler, getQuery, createError, setResponseHeaders, sendStream } from 'h3'
import { findMovieFolder } from '../../utils/movies'
import fs from 'node:fs'
import path from 'node:path'

export default defineEventHandler((event) => {
  const query = getQuery(event) as { code?: string; type?: 'poster' | 'cover' | 'screenshot' | 'trailer'; index?: string }
  const { code, type = 'poster', index } = query

  if (!code) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Movie JAV code is required (?code=ABC-123)',
    })
  }

  const movieDir = process.env.MOVIE_DIRECTORY || '/movies'
  if (!fs.existsSync(movieDir)) {
    throw createError({
      statusCode: 500,
      statusMessage: `Movie directory not configured or does not exist: ${movieDir}`,
    })
  }

  // 1. Find the movie folder
  const targetPath = findMovieFolder(movieDir, code)
  if (!targetPath) {
    throw createError({
      statusCode: 404,
      statusMessage: `Movie folder not found for code: ${code}`,
    })
  }
  let filePath = ''
  let contentType = 'image/jpeg'

  // 2. Resolve the asset path based on type
  if (type === 'poster') {
    const posterCandidates = ['poster.jpg', 'poster.png', 'folder.jpg', 'folder.png', 'cover.jpg', 'cover.png']
    const found = posterCandidates.find((c) => fs.existsSync(path.join(targetPath, c)))
    if (!found) {
      throw createError({ statusCode: 404, statusMessage: 'Poster asset not found' })
    }
    filePath = path.join(targetPath, found)
    if (filePath.endsWith('.png')) contentType = 'image/png'
  } 
  
  else if (type === 'cover') {
    const coverCandidates = ['cover.jpg', 'cover.png', 'fanart.jpg', 'fanart.png', 'poster.jpg', 'poster.png']
    const found = coverCandidates.find((c) => fs.existsSync(path.join(targetPath, c)))
    if (!found) {
      throw createError({ statusCode: 404, statusMessage: 'Cover asset not found' })
    }
    filePath = path.join(targetPath, found)
    if (filePath.endsWith('.png')) contentType = 'image/png'
  } 
  
  else if (type === 'screenshot') {
    const extrafanartPath = path.join(targetPath, 'extrafanart')
    if (!fs.existsSync(extrafanartPath) || !fs.statSync(extrafanartPath).isDirectory()) {
      throw createError({ statusCode: 404, statusMessage: 'Screenshots directory (extrafanart) not found' })
    }

    const screenshots = fs.readdirSync(extrafanartPath).filter((f) => /\.(jpg|jpeg|png)$/i.test(f))
    if (screenshots.length === 0) {
      throw createError({ statusCode: 404, statusMessage: 'No screenshots found' })
    }

    const idx = index ? parseInt(index, 10) : 0
    const targetFile = screenshots[idx] || screenshots[0]
    filePath = path.join(extrafanartPath, targetFile)
    if (filePath.endsWith('.png')) contentType = 'image/png'
  } 
  
  else if (type === 'trailer') {
    const trailerCandidates = ['trailer.mp4', 'trailer.mkv', 'trailer.mov']
    const found = trailerCandidates.find((c) => fs.existsSync(path.join(targetPath, c)))
    if (!found) {
      throw createError({ statusCode: 404, statusMessage: 'Trailer asset not found' })
    }
    filePath = path.join(targetPath, found)
    
    // Trailer stream (video) - handles HTTP range requests
    contentType = 'video/mp4'
    if (filePath.endsWith('.mkv')) contentType = 'video/x-matroska'
    if (filePath.endsWith('.mov')) contentType = 'video/quicktime'

    const stat = fs.statSync(filePath)
    const fileSize = stat.size
    const range = event.node.req.headers.range

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1

      if (start >= fileSize || end >= fileSize) {
        throw createError({
          statusCode: 416,
          statusMessage: `Requested Range Not Satisfiable: ${start}-${end}/${fileSize}`,
        })
      }

      const chunkSize = end - start + 1
      setResponseHeaders(event, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
        'Content-Type': contentType,
      })

      event.node.res.statusCode = 206
      return sendStream(event, fs.createReadStream(filePath, { start, end }))
    } else {
      setResponseHeaders(event, {
        'Content-Length': String(fileSize),
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
      })
      return sendStream(event, fs.createReadStream(filePath))
    }
  }

  // Serve static image back with caching
  const stat = fs.statSync(filePath)
  setResponseHeaders(event, {
    'Content-Type': contentType,
    'Content-Length': String(stat.size),
    'Cache-Control': 'public, max-age=86400', // Cache images for 24h
  })

  return sendStream(event, fs.createReadStream(filePath))
})
