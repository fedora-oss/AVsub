import { defineEventHandler, createError, sendStream } from 'h3'
import fs from 'node:fs'
import path from 'node:path'

const DOWNLOAD_BASE_PATH = process.env.DOWNLOAD_PATH || '/data/downloads'

export default defineEventHandler((event) => {
  // Catch the wildcards parameter (e.g. ['MIDA-533', 'cover.jpg'])
  const relativePathArray = event.context.params?.path
  
  if (!relativePathArray) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Path parameter is required',
    })
  }

  // Decode the path components and join them
  const decodedPath = decodeURIComponent(relativePathArray)

  // Prevent directory traversal attacks by normalizing and verifying path boundaries
  const absolutePath = path.resolve(DOWNLOAD_BASE_PATH, decodedPath)
  
  if (!absolutePath.startsWith(path.resolve(DOWNLOAD_BASE_PATH))) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Access denied: Directory traversal detected',
    })
  }

  // Verify file exists
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Image not found',
    })
  }

  // Set the correct Content-Type header based on the extension
  const ext = path.extname(absolutePath).toLowerCase()
  let contentType = 'image/jpeg'
  
  if (ext === '.png') contentType = 'image/png'
  if (ext === '.gif') contentType = 'image/gif'
  if (ext === '.webp') contentType = 'image/webp'

  event.node.res.setHeader('Content-Type', contentType)
  
  // Cache headers to prevent unnecessary NAS hits
  event.node.res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')

  // Stream the file back
  return sendStream(event, fs.createReadStream(absolutePath))
})
