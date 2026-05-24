import { defineEventHandler, getQuery, setResponseHeaders, createError, sendStream } from 'h3'
import { findMovieFolder } from '../../utils/movies'
import fs from 'node:fs'
import path from 'node:path'

export default defineEventHandler((event) => {
  const query = getQuery(event) as { code?: string }
  const code = query.code

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

  // 1. Find the target folder matching the code (case-insensitive)
  const targetPath = findMovieFolder(movieDir, code)
  if (!targetPath) {
    throw createError({
      statusCode: 404,
      statusMessage: `Movie folder not found for code: ${code}`,
    })
  }

  // 2. Find the video file in the folder
  const files = fs.readdirSync(targetPath)
  const videoFile = files.find((f) => /\.(mp4|mkv|avi|wmv|mov)$/i.test(f))

  if (!videoFile) {
    throw createError({
      statusCode: 404,
      statusMessage: `No playable video file found in folder: ${targetPath}`,
    })
  }

  const filePath = path.join(targetPath, videoFile)
  const stat = fs.statSync(filePath)
  const fileSize = stat.size

  // Determine mime type
  const ext = path.extname(videoFile).toLowerCase()
  let contentType = 'video/mp4'
  if (ext === '.mkv') contentType = 'video/x-matroska'
  if (ext === '.avi') contentType = 'video/x-msvideo'
  if (ext === '.wmv') contentType = 'video/x-ms-wmv'
  if (ext === '.mov') contentType = 'video/quicktime'

  // 3. Handle Range Requests (206) for smooth seeking in browsers
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
    const stream = fs.createReadStream(filePath, { start, end })

    setResponseHeaders(event, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': String(chunkSize),
      'Content-Type': contentType,
    })

    event.node.res.statusCode = 206
    return sendStream(event, stream)
  } else {
    // Return full stream
    setResponseHeaders(event, {
      'Content-Length': String(fileSize),
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
    })

    return sendStream(event, fs.createReadStream(filePath))
  }
})
