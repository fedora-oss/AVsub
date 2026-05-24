import { defineEventHandler, getQuery, createError, setResponseHeaders } from 'h3'
import { findMovieFolder } from '../../utils/movies'
import fs from 'node:fs'
import path from 'node:path'

export default defineEventHandler((event) => {
  const query = getQuery(event) as { code?: string; lang?: string }
  const code = query.code
  const lang = query.lang || 'ja' // Default to japanese sub

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

  // 1. Find target movie folder
  const targetPath = findMovieFolder(movieDir, code)
  if (!targetPath) {
    throw createError({
      statusCode: 404,
      statusMessage: `Movie folder not found for code: ${code}`,
    })
  }

  // 2. Find subtitle file (.srt) matching lang
  const files = fs.readdirSync(targetPath)
  let srtFile = files.find((f) => f.toLowerCase().endsWith(`.srt`) && f.toLowerCase().includes(`.${lang.toLowerCase()}`))

  // Fallback to any srt file in the folder if specific language is not found
  if (!srtFile) {
    srtFile = files.find((f) => f.toLowerCase().endsWith('.srt'))
  }

  if (!srtFile) {
    throw createError({
      statusCode: 404,
      statusMessage: `No subtitle file found in folder: ${targetFolder}`,
    })
  }

  const srtPath = path.join(targetPath, srtFile)
  const srtContent = fs.readFileSync(srtPath, 'utf-8')

  // 3. Convert SRT to WebVTT format on-the-fly
  // SRT uses commas for milliseconds: "00:01:20,340 --> 00:01:23,450"
  // VTT uses dots for milliseconds: "00:01:20.340 --> 00:01:23.450" and starts with "WEBVTT"
  const vttContent = 'WEBVTT\n\n' + srtContent.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')

  setResponseHeaders(event, {
    'Content-Type': 'text/vtt; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
  })

  return vttContent
})
