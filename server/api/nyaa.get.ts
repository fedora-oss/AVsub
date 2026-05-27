import { defineEventHandler, getQuery, createError } from 'h3'
import * as cheerio from 'cheerio'
import type { TorrentResult } from '~/types'
import { fetchWithCustomDns } from '../utils/dns-fetch'

const BASE_URL = (process.env.NYAA_URL || 'https://nyaa.si').replace(/\/$/, '')

function getLevenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  let prevRow = Array.from({ length: b.length + 1 }, (_, i) => i)
  const currRow = new Array<number>(b.length + 1)

  for (let i = 1; i <= a.length; i++) {
    currRow[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      currRow[j] = Math.min(
        prevRow[j]! + 1,
        currRow[j - 1]! + 1,
        prevRow[j - 1]! + cost
      )
    }
    prevRow = [...currRow]
  }

  return prevRow[b.length]!
}

function getSimilarity(a: string, b: string): number {
  const normA = a.toLowerCase().trim().replace(/\s+/g, ' ')
  const normB = b.toLowerCase().trim().replace(/\s+/g, ' ')
  if (normA === normB) return 1.0

  const distance = getLevenshteinDistance(normA, normB)
  const maxLength = Math.max(normA.length, normB.length)
  if (maxLength === 0) return 1.0
  return 1.0 - distance / maxLength
}

function parseNyaaHtml(html: string, baseUrl: string, prefix: string): TorrentResult[] {
  const $ = cheerio.load(html)
  const results: TorrentResult[] = []

  $('table.torrent-list tbody tr').each((_, row) => {
    const $row = $(row)
    const $tds = $row.find('td')

    if ($tds.length < 4) return

    const titleAnchor = $tds.eq(1).find('a').last()
    const title = titleAnchor.attr('title') || titleAnchor.text().trim() || $tds.eq(1).text().trim()
    const pageUrl = titleAnchor.attr('href') ? new URL(titleAnchor.attr('href')!, baseUrl).href : null

    const magnetAnchor = $row.find('a[href^="magnet:"]')
    const magnet = magnetAnchor.attr('href') || null

    const torrentAnchor = $row.find('a[href$=".torrent"]')
    const torrentUrl = torrentAnchor.attr('href') ? new URL(torrentAnchor.attr('href')!, baseUrl).href : null

    const size = $tds.eq(3).text().trim()
    const date = $tds.eq(4).text().trim()
    const seeders = parseInt($tds.eq(5).text().trim()) || 0
    const leechers = parseInt($tds.eq(6).text().trim()) || 0
    const downloads = parseInt($tds.eq(7).text().trim()) || 0
    const categoryAttr = $tds.eq(0).find('a').attr('title') || 'Unknown'
    const category = `${prefix} ${categoryAttr}`

    // Extract JAV code using regex (2-8 letters, optional dash, 2-6 digits)
    const codeMatch = title.match(/\b([A-Za-z]{2,8})-?(\d{2,6})\b/)
    const code = (codeMatch?.[1] && codeMatch?.[2])
      ? `${codeMatch[1].toUpperCase()}-${codeMatch[2]}`
      : undefined



    results.push({
      title,
      magnet,
      torrentUrl,
      size,
      date,
      seeders,
      leechers,
      downloads,
      pageUrl,
      category,
      code,
    })
  })

  return results
}

export default defineEventHandler(async (event) => {
  const { keyword } = getQuery(event) as { keyword: string }

  if (!keyword) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Keyword is required',
    })
  }

  const sukebeiBase = (process.env.SUKEBEI_URL || 'https://sukebei.nyaa.si').replace(/\/$/, '')
  const nyaaBase = (process.env.NYAA_URL || 'https://nyaa.si').replace(/\/$/, '')

  const sukebeiQuery = `${sukebeiBase}/?f=0&c=2_2&q=${encodeURIComponent(keyword)}&s=seeders&o=desc`
  const nyaaQuery = `${nyaaBase}/?f=0&c=4_0&q=${encodeURIComponent(keyword)}&s=seeders&o=desc`

  console.log(`[Nyaa API] Crawling both Sukebei and Nyaa in parallel for keyword: ${keyword}`)
  
  const results: TorrentResult[] = []

  const [sukebeiRes, nyaaRes] = await Promise.allSettled([
    fetchWithCustomDns(sukebeiQuery),
    fetchWithCustomDns(nyaaQuery)
  ])

  if (sukebeiRes.status === 'fulfilled') {
    try {
      const sukebeiTorrents = parseNyaaHtml(sukebeiRes.value, sukebeiBase, '[Sukebei]')
      results.push(...sukebeiTorrents)
    } catch (err: any) {
      console.error('Error parsing Sukebei HTML:', err.message)
    }
  } else {
    console.error('Error fetching Sukebei:', sukebeiRes.reason?.message || sukebeiRes.reason)
  }

  if (nyaaRes.status === 'fulfilled') {
    try {
      const nyaaTorrents = parseNyaaHtml(nyaaRes.value, nyaaBase, '[Nyaa]')
      results.push(...nyaaTorrents)
    } catch (err: any) {
      console.error('Error parsing Nyaa HTML:', err.message)
    }
  } else {
    console.error('Error fetching Nyaa:', nyaaRes.reason?.message || nyaaRes.reason)
  }

  // Sort results by seeders descending
  results.sort((a, b) => b.seeders - a.seeders)

  // Deduplicate using Levenshtein Distance & JAV Code (limit to 20 results)
  const filteredResults: TorrentResult[] = []

  for (const item of results) {
    if (filteredResults.length >= 20) {
      break
    }

    let isDuplicate = false
    for (const accepted of filteredResults) {
      // 1. Deduplicate by exact JAV code match if both are present
      if (item.code && accepted.code && item.code === accepted.code) {
        isDuplicate = true
        break
      }

      // 2. Deduplicate by Levenshtein title similarity > 80%
      if (getSimilarity(item.title, accepted.title) > 0.8) {
        isDuplicate = true
        break
      }
    }

    if (!isDuplicate) {
      filteredResults.push(item)
    }
  }

  return filteredResults
})

