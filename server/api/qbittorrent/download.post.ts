import { defineEventHandler, readBody, createError } from 'h3'
import { useStorage } from '#imports'
import { randomUUID } from 'node:crypto'
import type { ScheduledPipelineJob } from '../../tasks/javinizer/scheduler'
import { callJavinizerScrapeAPI } from '../../utils/javinizer-scrape'
import { chromium } from 'playwright'
import { PlaywrightBlocker } from '@ghostery/adblocker-playwright'
import AdmZip from 'adm-zip'
import fs from 'node:fs'
import path from 'node:path'
import { resolveTargetMoviePath } from '../../utils/movies'
import os from 'node:os'
import * as cheerio from 'cheerio'

/** Delay before running the post-download pipeline (1 hour in ms) */
const PIPELINE_DELAY_MS = 60 * 60 * 1000
const STORAGE_KEY = 'pipeline:pending'

// Cache the Ghostery ad-blocker
let blocker: PlaywrightBlocker | null = null
async function getBlocker() {
  if (!blocker) {
    blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch)
  }
  return blocker
}

/** Extract JAV code (e.g. "IPX-535") from magnet or string */
function extractJavCode(str: string): string | null {
  const cleaned = str.replace(/hhd-?800/gi, '')
  const match = cleaned.match(/\b([A-Za-z]{2,8})-?(\d{2,6})(?!\d)/)
  if (!match?.[1] || !match?.[2]) return null
  return `${match[1].toUpperCase()}-${match[2]}`
}


/**
 * Searches and downloads subtitle for a given JAV code from avsubtitles.com
 */
async function searchAndDownloadSubtitle(code: string, movieDir: string): Promise<boolean> {
  const cleanCode = code.toUpperCase().trim()
  const targetFolder = cleanCode
  const targetPath = resolveTargetMoviePath(movieDir, targetFolder)

  // 1. Check if srt already exists in target folder
  if (fs.existsSync(targetPath)) {
    const files = fs.readdirSync(targetPath)
    const hasSrt = files.some((f) => f.toLowerCase().endsWith('.srt'))
    if (hasSrt) {
      console.log(`[Unified-Sub] Subtitle already exists in ${targetPath} → skipping subtitle search.`)
      return true
    }
  } else {
    fs.mkdirSync(targetPath, { recursive: true })
  }

  console.log(`[Unified-Sub] Searching subtitle for code: ${cleanCode}…`)
  const baseUrl = 'https://www.avsubtitles.com'
  const searchUrl = `${baseUrl}/search_results.php?search=${encodeURIComponent(cleanCode)}&category=jav`

  let detailLink = ''
  try {
    const html = await $fetch<string>(searchUrl)
    const $ = cheerio.load(html)
    const cards = $('.card')

    if (cards.length > 0) {
      const relativeLink = cards.first().find('.card-content h5 a').attr('href')
      if (relativeLink) {
        detailLink = relativeLink.startsWith('http') ? relativeLink : `${baseUrl}${relativeLink}`
      }
    }
  } catch (err: any) {
    console.error(`[Unified-Sub] Failed to search subtitles on avsubtitles.com:`, err.message)
    return false
  }

  if (!detailLink) {
    console.log(`[Unified-Sub] No subtitle found for code ${cleanCode} on avsubtitles.com.`)
    return false
  }

  console.log(`[Unified-Sub] Found subtitle page: ${detailLink}. Starting Playwright download…`)

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avsub-qbit-'))
  let browser

  try {
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    })

    const page = await context.newPage()
    const adBlocker = await getBlocker()
    await adBlocker.enableBlockingInPage(page)

    context.on('page', async (p) => {
      await adBlocker.enableBlockingInPage(p)
    })

    // Abort heavy resources to speed up page load
    await context.route('**/*', (route) => {
      const type = route.request().resourceType()
      if (['image', 'font', 'media'].includes(type)) {
        return route.abort()
      }
      return route.continue()
    })

    await page.goto(detailLink, { waitUntil: 'networkidle' })
    await page.waitForSelector('#subtitles_list tbody tr', { timeout: 10000 })

    const subtitleLinks = await page.$$eval('#subtitles_list tbody tr', (rows) => {
      return rows.map(row => {
        const langText = row.querySelector('td:first-child')?.textContent?.trim() || ''
        const hasJapanese = row.querySelector('img[src*="language_ja.svg"]') || langText.toLowerCase().includes('japanese')
        const downloadLink = (row.querySelector('a.link_button') as any)?.href
        const downloads = parseInt(row.querySelector('td:nth-child(6)')?.textContent?.trim() || '0')
        return { hasJapanese, downloadLink, downloads }
      })
    })

    if (subtitleLinks.length === 0) {
      throw new Error('No subtitle links found in table')
    }

    // Sort by Japanese language priority, then downloads count
    subtitleLinks.sort((a, b) => {
      if (a.hasJapanese && !b.hasJapanese) return -1
      if (!a.hasJapanese && b.hasJapanese) return 1
      return b.downloads - a.downloads
    })

    const subPageLink = subtitleLinks[0].downloadLink
    if (!subPageLink) {
      throw new Error('Could not find a valid subtitle page link')
    }

    console.log(`[Unified-Sub] Navigating to sub-download page: ${subPageLink}`)
    await page.goto(subPageLink, { waitUntil: 'networkidle' })

    const downloadParams = await page.evaluate(() => {
      const form = document.querySelector('form[action*="download_page.php"]') as HTMLFormElement;
      if (!form) return null;
      const subid = (form.querySelector('input[name="subid"]') as any)?.value;
      const revid = (form.querySelector('input[name="revid"]') as any)?.value;
      return { subid, revid };
    });

    if (!downloadParams) {
      throw new Error('Could not retrieve download subid/revid params from form')
    }

    const finalDownloadUrl = `${baseUrl}/download_page.php?subid=${downloadParams.subid}&revid=${downloadParams.revid || ''}`
    await page.goto(finalDownloadUrl, { waitUntil: 'networkidle' })

    await page.waitForSelector('#bigbutton', { timeout: 15000 })
    await page.waitForFunction(() => {
      const btn = document.querySelector('#bigbutton') as HTMLElement
      const style = window.getComputedStyle(btn)
      return btn && btn.textContent?.includes('Download now!') && style.pointerEvents === 'auto' && style.opacity === '1'
    }, { timeout: 15000 })

    const downloadUrl = await page.evaluate(() => {
      const btn = document.querySelector('#bigbutton') as any
      return btn ? btn.href : null
    })

    if (!downloadUrl) {
      throw new Error('Could not find direct download href on bigbutton')
    }

    const response = await context.request.get(downloadUrl, {
      headers: { 'Referer': page.url() },
      timeout: 60000
    })

    if (!response.ok()) {
      throw new Error(`Failed to download sub file: ${response.status()} ${response.statusText()}`)
    }

    const zipBuffer = await response.body()
    const zipPath = path.join(tempDir, 'subtitles.zip')
    fs.writeFileSync(zipPath, zipBuffer)

    const zip = new AdmZip(zipPath)
    const extractDir = path.join(tempDir, 'extracted')
    fs.mkdirSync(extractDir)
    zip.extractAllTo(extractDir, true)

    const extractedFiles = fs.readdirSync(extractDir, { recursive: true }) as string[]
    const srtFiles = extractedFiles.filter((f) => f.toLowerCase().endsWith('.srt'))

    if (srtFiles.length === 0) {
      throw new Error('No .srt files found in the subtitle zip')
    }

    for (let i = 0; i < srtFiles.length; i++) {
      const srtFile = srtFiles[i]
      const originalPath = path.join(extractDir, srtFile)

      let langCode = 'ja'
      if (srtFile.toLowerCase().includes('english') || srtFile.toLowerCase().includes('.en.')) langCode = 'en'
      if (srtFile.toLowerCase().includes('chinese') || srtFile.toLowerCase().includes('.zh.')) langCode = 'zh'

      const suffix = srtFiles.length > 1 ? `.${i + 1}` : ''
      const newFileName = `${cleanCode}.${langCode}${suffix}.srt`
      const destinationPath = path.join(targetPath, newFileName)

      fs.copyFileSync(originalPath, destinationPath)
      console.log(`[Unified-Sub] Extracted and saved subtitle: ${newFileName}`)
    }

    return true
  } catch (err: any) {
    console.error(`[Unified-Sub] Error downloading subtitle:`, err.message || err)
    return false
  } finally {
    if (browser) await browser.close()
    try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch {}
  }
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { magnet, category = 'Uncen', code: bodyCode } = body

  if (!magnet) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Magnet link is required',
    })
  }

  // 1. Resolve Movie JAV Code
  const resolvedCode = bodyCode ?? extractJavCode(magnet) ?? extractJavCode(decodeURIComponent(magnet))
  console.log(`[qBittorrent API] Attempting to add torrent. JAV Code detected: ${resolvedCode ?? 'None'}`)

  const movieDir = process.env.MOVIE_DIRECTORY || '/movies'

  // 2. Perform Subtitle Search & Javinizer Scrape in sequence (Unified Flow)
  if (resolvedCode) {
    try {
      // Step 2a: Subtitle search & download
      await searchAndDownloadSubtitle(resolvedCode, movieDir)
    } catch (err: any) {
      console.error(`[qBittorrent API] Subtitle pre-download encountered error:`, err.message)
    }

    try {
      // Step 2b: Javinizer scrape API call (to immediately populate metadata in DB)
      console.log(`[qBittorrent API] Calling Javinizer Scrape API immediately for metadata…`)
      await callJavinizerScrapeAPI(resolvedCode)
    } catch (err: any) {
      console.error(`[qBittorrent API] Javinizer metadata pre-scrape encountered error:`, err.message)
    }
  }

  // 3. Login and add torrent to qBittorrent
  const qbUrl = (process.env.QBITTORRENT_URL || 'http://qbittorrent').replace(/\/$/, '')
  const username = process.env.QBITTORRENT_USERNAME
  const password = process.env.QBITTORRENT_PASSWORD

  try {
    const loginUrl = `${qbUrl}/api/v2/auth/login`
    const loginResponse = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': qbUrl,
      },
      body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
    })

    if (!loginResponse.ok) {
      throw new Error(`Login failed with HTTP status ${loginResponse.status}`)
    }

    const responseText = await loginResponse.text()
    if (responseText.trim().toLowerCase() === 'fails') {
      throw new Error('Invalid credentials provided for qBittorrent WebUI')
    }

    const setCookie = loginResponse.headers.get('set-cookie')
    if (!setCookie) {
      throw new Error('Did not receive a Set-Cookie header from qBittorrent login')
    }

    const sidMatch = setCookie.match(/SID=([^;]+)/)
    if (!sidMatch) {
      throw new Error('Could not find SID session cookie in qBittorrent login response')
    }

    const sid = sidMatch[1]

    // Add torrent
    const addUrl = `${qbUrl}/api/v2/torrents/add`
    const addResponse = await fetch(addUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': `SID=${sid}`,
        'Referer': qbUrl,
      },
      body: `urls=${encodeURIComponent(magnet)}&category=${encodeURIComponent(category)}`,
    })

    if (!addResponse.ok) {
      throw new Error(`Torrent addition failed with HTTP status ${addResponse.status}`)
    }

    console.log(`[qBittorrent API] Torrent successfully added to qBittorrent WebUI.`)

    // 4. Schedule post-download pipeline (Nitro Storage)
    const storage = useStorage('data')
    const now = Date.now()
    const pending = (await storage.getItem<ScheduledPipelineJob[]>(STORAGE_KEY)) ?? []

    // Dedup: skip if job already exists
    if (pending.length > 0) {
      const existing = pending[0]!
      const fireAt = new Date(existing.fireAt).toISOString()
      console.log(`[qBittorrent API] Pipeline job ${existing.id} already queued → skipping scheduling.`)

      return {
        success: true,
        message: 'Torrent added and pipeline already queued',
        pipeline: {
          scheduled: false,
          skipped: true,
          jobId: existing.id,
          fireAt,
        },
      }
    }

    const job: ScheduledPipelineJob = {
      id: randomUUID(),
      scheduledAt: now,
      fireAt: now + PIPELINE_DELAY_MS,
      moviesDir: movieDir,
    }

    pending.push(job)
    await storage.setItem(STORAGE_KEY, pending)

    const fireAt = new Date(job.fireAt).toISOString()
    console.log(`[qBittorrent API] Pipeline job ${job.id} queued → fires at ${fireAt}`)

    return {
      success: true,
      message: 'Torrent successfully added. Subtitle, metadata and pipeline queued.',
      pipeline: {
        scheduled: true,
        skipped: false,
        jobId: job.id,
        fireAt,
        delayMinutes: PIPELINE_DELAY_MS / 60_000,
      },
    }

  } catch (err: any) {
    console.error('[qBittorrent API] Error during Unified download flow:', err.message || err)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to add torrent to qBittorrent: ${err.message || err}`,
    })
  }
})
