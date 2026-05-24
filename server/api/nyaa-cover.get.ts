import { defineEventHandler, getQuery, createError } from 'h3'
import * as cheerio from 'cheerio'
import { fetchWithCustomDns } from '../utils/dns-fetch'

const coverCache = new Map<string, string | null>()

export default defineEventHandler(async (event) => {
  const { url } = getQuery(event) as { url: string }

  if (!url) {
    throw createError({
      statusCode: 400,
      statusMessage: 'URL is required',
    })
  }

  // Validate that the URL is from sukebei or nyaa
  const lowerUrl = url.toLowerCase()
  if (!lowerUrl.includes('nyaa.si') && !lowerUrl.includes('sukebei')) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid URL origin',
    })
  }

  // Check cache
  if (coverCache.has(url)) {
    return { cover: coverCache.get(url) }
  }

  try {
    console.log(`[Nyaa Cover] Fetching detail page for cover: ${url}`)
    const html = await fetchWithCustomDns(url)
    const $ = cheerio.load(html)
    
    let coverUrl: string | null = null

    // Try to find #torrent-description or look broadly inside panel-body
    const descriptionEl = $('#torrent-description').length 
      ? $('#torrent-description') 
      : $('.panel-body').first()

    if (descriptionEl.length) {
      // 1. Find all image tags
      descriptionEl.find('img').each((_, img) => {
        const src = $(img).attr('src')
        if (src && src.startsWith('http') && !coverUrl) {
          coverUrl = src
        }
      })

      // 2. If no img tags, look for a tags pointing to images (common on Sukebei)
      if (!coverUrl) {
        descriptionEl.find('a').each((_, a) => {
          const href = $(a).attr('href')
          if (href && href.startsWith('http') && !coverUrl) {
            // Check if the URL looks like an image URL or ends with common extensions or matches hosting signature
            if (/\.(jpg|jpeg|png|gif|webp|bmp)/i.test(href) || href.includes('xxpics.org/upload/') || href.includes('image')) {
              coverUrl = href
            }
          }
        })
      }

      // 3. If still no cover url, try regex to find any URLs in text that look like images
      if (!coverUrl) {
        const text = descriptionEl.text()
        const match = text.match(/https?:\/\/[^\s"']+\.(?:jpg|jpeg|png|gif|webp)/i)
        if (match) {
          coverUrl = match[0]
        }
      }
    }

    coverCache.set(url, coverUrl)
    return { cover: coverUrl }
  } catch (err: any) {
    console.error(`[Nyaa Cover] Failed to fetch cover from ${url}:`, err.message)
    return { cover: null }
  }
})
