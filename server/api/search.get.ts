import { defineEventHandler, getQuery, createError } from 'h3'
import * as cheerio from 'cheerio'
import type { SearchResult } from '~/types'
import { extractJavCode } from '../utils/javinizer-scrape'

export default defineEventHandler(async (event) => {
  const { keyword } = getQuery(event) as { keyword: string }

  if (!keyword) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Keyword is required',
    })
  }

  // Extract JAV code and log it (used by client-side ResultCard for lazy metadata fetch)
  const javCode = extractJavCode(keyword)
  console.log(`[Search] keyword="${keyword}" → extracted JAV code: ${javCode ?? 'none'}`)

  const baseUrl = 'https://www.avsubtitles.com'
  const searchUrl = `${baseUrl}/search_results.php?search=${encodeURIComponent(keyword)}&category=jav&language=&not_before=2020&not_after=&screenshots=&rating=&scope=&orderby=title_asc`

  try {
    const html = await $fetch<string>(searchUrl)
    const $ = cheerio.load(html)
    const results: SearchResult[] = []

    $('.card').each((_, element) => {
      const $card = $(element)
      const title = $card.find('.card-content h5 a').text().trim()
      const detailLink = $card.find('.card-content h5 a').attr('href') || ''
      const coverImage = $card.find('.cover-image img').attr('src') || ''
      const subtitlesInfo = $card.find('.card-content p:has(.text-white)').text().trim()

      if (title && detailLink) {
        results.push({
          title,
          detail_link: detailLink.startsWith('http') ? detailLink : `${baseUrl}${detailLink}`,
          cover_image: coverImage.startsWith('http') ? coverImage : `${baseUrl}${coverImage}`,
          subtitles_info: subtitlesInfo,
          // magnet link is now handled by the frontend by combining with Nyaa results
        })
      }
    })

    return results
  } catch (error: any) {
    console.error('Search error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch search results: ${error.message}`,
    })
  }
})
