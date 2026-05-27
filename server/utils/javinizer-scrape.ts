/**
 * Utility for javinizer integration.
 * - extractJavCode: regex extract JAV code from search keyword
 * - callJavinizerScrapeAPI: POST to javinizer HTTP API to scrape & get metadata immediately
 */

const JAVINIZER_URL = (process.env.JAVINIZER_URL ?? 'http://localhost:9999').replace(/\/$/, '')
const JAVINIZER_TOKEN = process.env.JAVINIZER_TOKEN ?? ''

// ── Scrape request queue (concurrency = 1) ───────────────────────────────────
// Javinizer server is a single-threaded scraper. Flooding it with parallel
// requests causes timeouts. This queue serialises all scrape calls so only
// ONE is in-flight at a time.

type QueueTask = () => Promise<void>
const scrapeQueue: QueueTask[] = []
let scrapeRunning = false

function enqueueTask<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    scrapeQueue.push(async () => {
      try { resolve(await fn()) } catch (e) { reject(e) }
    })
    drainQueue()
  })
}

async function drainQueue() {
  if (scrapeRunning) return
  scrapeRunning = true
  while (scrapeQueue.length > 0) {
    const task = scrapeQueue.shift()!
    await task()
  }
  scrapeRunning = false
}

const DEFAULT_SCRAPERS = [
  'r18dev',
  'dmm',
  'jav321',
  'libredmm',
  'javlibrary',
  'javdb',
  'javbus',
]

/**
 * Extract the most likely JAV code from a search keyword using regex.
 * Handles: ABP-420, ABP420, abp420, ssni420, BLK-698, IPX535, etc.
 * Returns normalized code like "ABP-420".
 */
export function extractJavCode(keyword: string): string | null {
  const cleaned = keyword.replace(/hhd-?800/gi, '')
  const match = cleaned.trim().match(/\b([A-Za-z]{2,8})-?(\d{2,6})\b/)
  if (!match) return null
  const label = (match[1] ?? '').toUpperCase()
  const num = match[2] ?? ''
  if (!label || !num) return null
  return `${label}-${num}`
}


/**
 * Call javinizer HTTP API to scrape metadata for a JAV code.
 * Returns the raw movie object from the API response on success, null on failure.
 *
 * Calls are serialised through a queue (concurrency=1) to avoid overwhelming
 * the javinizer server with parallel requests.
 */
export async function callJavinizerScrapeAPI(code: string): Promise<JavinizerAPIMovie | null> {
  return enqueueTask(() => _doScrape(code))
}

async function _doScrape(code: string): Promise<JavinizerAPIMovie | null> {
  const url = `${JAVINIZER_URL}/api/v1/scrape`
  const normalizedCode = code.trim().toUpperCase()

  console.log(`[javinizer-api] POST ${url} id=${normalizedCode}`)

  try {
    const response = await $fetch<JavinizerScrapeResponse>(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JAVINIZER_TOKEN}`,
      },
      body: {
        force: false,
        id: normalizedCode,
        selected_scrapers: DEFAULT_SCRAPERS,
      },
      timeout: 90_000, // 90s — scraping can be slow
    })

    if (response?.movie) {
      console.log(`[javinizer-api] Scraped successfully: ${response.movie.id} (cached=${response.cached})`)
      if (response.errors?.length) {
        console.warn(`[javinizer-api] Partial errors for ${normalizedCode}:`, response.errors.join('; '))
      }
      return response.movie
    }

    console.warn(`[javinizer-api] No movie in response for ${normalizedCode}`)
    return null
  } catch (err: any) {
    console.error(`[javinizer-api] Scrape API failed for ${normalizedCode}:`, err.message || err)
    return null
  }
}

// ── TypeScript types for javinizer API response ───────────────────────────

export interface JavinizerAPIActress {
  id: number
  dmm_id?: number
  first_name?: string
  last_name?: string
  japanese_name?: string
  thumb_url?: string
  aliases?: string
  created_at?: string
  updated_at?: string
}

export interface JavinizerAPIGenre {
  id: number
  name: string
}

export interface JavinizerAPITranslation {
  id: number
  movie_id: string
  language: string
  title?: string
  original_title?: string
  description?: string
  director?: string
  maker?: string
  label?: string
  series?: string
  source_name?: string
  created_at?: string
  updated_at?: string
}

export interface JavinizerAPIMovie {
  content_id: string
  id: string
  display_title?: string
  title?: string
  original_title?: string
  description?: string
  release_date?: string
  release_year?: number
  runtime?: number
  director?: string
  maker?: string
  label?: string
  series?: string
  rating_score?: number
  rating_votes?: number
  poster_url?: string
  cover_url?: string
  trailer_url?: string
  original_filename?: string
  screenshot_urls?: string[]
  actresses?: JavinizerAPIActress[]
  genres?: JavinizerAPIGenre[]
  translations?: JavinizerAPITranslation[]
  source_name?: string
  source_url?: string
  created_at?: string
  updated_at?: string
}

export interface JavinizerScrapeResponse {
  cached: boolean
  movie?: JavinizerAPIMovie
  sources_used?: number
  errors?: string[]
}
