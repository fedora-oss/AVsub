import { defineEventHandler, readBody, createError } from 'h3'
import { processMovieFile } from '../../plugins/watcher'
import fs from 'node:fs'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid webhook payload: Empty body'
    })
  }

  const eventType = body.eventType || ''
  console.log(`[Arr Webhook] Received event: "${eventType}"`)

  // 1. Connection Test Event (Radarr "Test" button)
  if (eventType === 'Test') {
    return {
      success: true,
      message: 'AVsub integration connection test successful!'
    }
  }

  // 2. Download / Import Event
  if (eventType === 'Download' || eventType === 'Grab') {
    const movieFilePath = body.movieFile?.path
    const folderPath = body.movie?.folderPath

    // We prioritize the exact imported movie file path
    let targetPath = movieFilePath

    // Fallback to checking the folder path for any video file if movieFile path is not present
    if (!targetPath && folderPath && fs.existsSync(folderPath)) {
      try {
        const files = fs.readdirSync(folderPath)
        const videoExtensions = ['.mp4', '.mkv', '.avi', '.wmv', '.iso']
        const videoFile = files.find(f => videoExtensions.includes(fs.statSync(`${folderPath}/${f}`).isFile() ? f.slice(f.lastIndexOf('.')) : ''))
        if (videoFile) {
          targetPath = `${folderPath}/${videoFile}`
        }
      } catch (err: any) {
        console.error('[Arr Webhook] Error scanning folder path:', err.message)
      }
    }

    if (!targetPath) {
      console.warn('[Arr Webhook] Could not resolve a valid file path from the payload.')
      return {
        success: false,
        message: 'Could not resolve file path from payload'
      }
    }

    if (!fs.existsSync(targetPath)) {
      console.warn(`[Arr Webhook] File path resolved but does not exist on disk: ${targetPath}`)
      return {
        success: false,
        message: `File path does not exist on disk: ${targetPath}`
      }
    }

    console.log(`[Arr Webhook] Triggering subtitle search & download for: ${targetPath}`)
    
    // Run the subtitle downloading in the background asynchronously so we don't block Radarr's import process
    // (Radarr expects a fast response from the webhook, otherwise it throws a timeout error)
    processMovieFile(targetPath, 'manual')
      .then(() => {
        console.log(`[Arr Webhook] Completed background processing for: ${targetPath}`)
      })
      .catch((err) => {
        console.error(`[Arr Webhook] Background processing encountered an error:`, err.message)
      })

    return {
      success: true,
      message: `Triggered background subtitle search for: ${targetPath}`
    }
  }

  return {
    success: true,
    message: `Event type "${eventType}" ignored.`
  }
})
