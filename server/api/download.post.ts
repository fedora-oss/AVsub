import { defineEventHandler, readBody, createError } from 'h3'
import { chromium } from 'playwright'
import { PlaywrightBlocker } from '@ghostery/adblocker-playwright'
import AdmZip from 'adm-zip'
import { getMovieFolders, resolveTargetMoviePath } from '../utils/movies'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { DownloadResponse } from '~/types'

/** Extract normalized JAV code (e.g. "IPX-535") from any string */
function extractJavCode(str: string): string | null {
  const cleaned = str.replace(/hhd-?800/gi, '')
  const match = cleaned.match(/\b([A-Za-z]{2,8})-?(\d{2,6})\b/)
  if (!match?.[1] || !match?.[2]) return null
  return `${match[1].toUpperCase()}-${match[2]}`
}


// Cache the blocker to avoid re-fetching lists on every request
let blocker: PlaywrightBlocker | null = null

async function getBlocker() {
  if (!blocker) {
    blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch)
  }
  return blocker
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { detail_link, keyword, code: bodyCode } = body

  if (!detail_link || !keyword) {
    throw createError({
      statusCode: 400,
      statusMessage: 'detail_link and keyword are required',
    })
  }

  const movieDir = process.env.MOVIE_DIRECTORY
  if (!movieDir || !fs.existsSync(movieDir)) {
    throw createError({
      statusCode: 500,
      statusMessage: `MOVIE_DIRECTORY not configured or does not exist: ${movieDir}`,
    })
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avsub-'))
  let browser

  // List of modern User-Agents for rotation
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:123.0) Gecko/20100101 Firefox/123.0'
  ]
  const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)]

  try {
    browser = await chromium.launch({ headless: true })
    // Each request gets a completely fresh context (no persistent cache/cookies)
    const context = await browser.newContext({
      userAgent: randomUA,
      viewport: { width: 1920, height: 1080 }
    })

    const page = await context.newPage()

    // Integrate Ad-blocker
    const adBlocker = await getBlocker()
    await adBlocker.enableBlockingInPage(page)

    // Apply to any future pages/popups
    context.on('page', async (p) => {
      await adBlocker.enableBlockingInPage(p)
    })

    // Additional optimization: block images, fonts, and media
    await context.route('**/*', (route) => {
      const type = route.request().resourceType()
      if (['image', 'font', 'media'].includes(type)) {
        return route.abort()
      }
      return route.continue()
    })

    context.on('download', (d) => console.log(`Download event received: ${d.suggestedFilename()}`));

    console.log(`Navigating to detail page: ${detail_link}`)
    await page.goto(detail_link, { waitUntil: 'networkidle' })

    // Wait for the table to be rendered by script
    try {
      await page.waitForSelector('#subtitles_list tbody tr', { timeout: 10000 })
    } catch (e) {
      throw new Error('Subtitle table #subtitles_list not found or timed out')
    }

    // Find the best subtitle row. Priority: Japanese flag, then highest downloads.
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
      throw new Error('No subtitle links found in the table')
    }

    // Sort by Japanese priority, then by downloads
    subtitleLinks.sort((a, b) => {
      if (a.hasJapanese && !b.hasJapanese) return -1
      if (!a.hasJapanese && b.hasJapanese) return 1
      return b.downloads - a.downloads
    })

    const subPageLink = subtitleLinks[0].downloadLink
    if (!subPageLink) {
      throw new Error('Could not find a valid subtitle page link')
    }

    console.log(`Navigating to subtitle specific page: ${subPageLink}`)
    await page.goto(subPageLink, { waitUntil: 'networkidle' })

    // Log the current page content for debugging
    const pageTitle = await page.title()
    console.log(`Current page title: ${pageTitle}`)

    // Extract subid and revid from the form to construct direct download URL
    const downloadParams = await page.evaluate(() => {
      const form = document.querySelector('form[action*="download_page.php"]') as HTMLFormElement;
      if (!form) return null;

      const subid = (form.querySelector('input[name="subid"]') as any)?.value;
      const revid = (form.querySelector('input[name="revid"]') as any)?.value;

      return { subid, revid };
    });

    // Construct the download page URL
    const finalDownloadUrl = `https://www.avsubtitles.com/download_page.php?subid=${downloadParams.subid}&revid=${downloadParams.revid || ''}`;
    console.log(`Navigating to download page: ${finalDownloadUrl}`);

    await page.goto(finalDownloadUrl, { waitUntil: 'networkidle' });

    // Wait for the download button to appear and be enabled by the script
    console.log('Waiting for download button to be enabled (pointer-events: auto)...');

    await page.waitForSelector('#bigbutton', { timeout: 30000 });

    await page.waitForFunction(() => {
      const btn = document.querySelector('#bigbutton') as HTMLElement;
      const style = window.getComputedStyle(btn);
      return btn &&
        btn.textContent?.includes('Download now!') &&
        style.pointerEvents === 'auto' &&
        style.opacity === '1';
    }, { timeout: 30000 });

    console.log('Button is fully enabled. Extracting download URL...');

    const downloadUrl = await page.evaluate(() => {
      const btn = document.querySelector('#bigbutton') as any;
      return btn ? btn.href : null;
    });

    if (!downloadUrl) {
      throw new Error('Could not find href on the download button');
    }

    console.log(`Directly fetching file from: ${downloadUrl}`);

    // Use the browser context's API request to fetch the file directly.
    // This uses the same cookies and session, but bypasses all UI ad-interceptors.
    const response = await context.request.get(downloadUrl, {
      headers: {
        'Referer': page.url()
      },
      timeout: 120000
    });

    if (!response.ok()) {
      throw new Error(`Failed to download file. Status: ${response.status()} ${response.statusText()}`);
    }

    const zipBuffer = await response.body();

    // We don't have a suggested filename from the event, so we use a generic one
    const zipPath = path.join(tempDir, 'subtitles.zip');
    fs.writeFileSync(zipPath, zipBuffer);
    console.log(`Downloaded ZIP to ${zipPath} (${zipBuffer.length} bytes)`);

    // Extract ZIP
    const zip = new AdmZip(zipPath)
    const extractDir = path.join(tempDir, 'extracted')
    fs.mkdirSync(extractDir)
    zip.extractAllTo(extractDir, true)

    // Determine the clean JAV code to use for folder naming and searching
    // bodyCode comes from client (already extracted from metadata), otherwise extract from keyword
    const folderCode = bodyCode ?? extractJavCode(keyword)
    const folderName = folderCode ?? keyword.toUpperCase()

    // Find matching folder in MOVIE_DIRECTORY
    // Search by JAV code first (e.g. "IPX-535", "IPX535"), then fall back to full keyword
    const folders = getMovieFolders(movieDir)

    // Build search regexes: try JAV code first, then keyword
    const codePattern = folderCode ? folderCode.replace(/-/g, '[-\\s]?') : null
    const codeRegex = codePattern ? new RegExp(`\\b${codePattern}\\b`, 'i') : null
    const keywordPattern = keyword.replace(/-/g, '[-\\s]?')
    const keywordRegex = new RegExp(keywordPattern, 'i')

    // Priority: exact code match → partial code match → keyword match
    const matchedFolder = (codeRegex ? folders.find((f) => codeRegex.test(f.name)) : undefined)
      ?? folders.find((f) => keywordRegex.test(f.name))

    let targetPath = ''
    let targetFolder = ''

    if (matchedFolder) {
      targetPath = matchedFolder.fullPath
      targetFolder = matchedFolder.name
    } else {
      targetFolder = folderName
      targetPath = resolveTargetMoviePath(movieDir, targetFolder)
      fs.mkdirSync(targetPath, { recursive: true })
      console.log(`[download] Created new folder: ${targetPath}`)
    }

    // Find a video file in the folder that matches the code or keyword
    const filesInFolder = fs.readdirSync(targetPath)
    const searchRegex = codeRegex ?? keywordRegex

    let matchedFile = filesInFolder.find((f: string) => {
      const isVideo = /\.(mp4|mkv|avi|wmv|iso)$/i.test(f)
      return isVideo && searchRegex.test(f)
    })

    if (!matchedFile) {
      matchedFile = filesInFolder.find((f: string) => searchRegex.test(f))
    }

    // Determine the base name for the subtitle
    // Priority: 1) code passed from client (JAV code from metadata)  2) JAV code from keyword  3) JAV code from video filename  4) folder name
    let fileNameBase = targetFolder
    if (matchedFile) {
      // Remove common extensions and partial download suffixes
      fileNameBase = matchedFile.replace(/\.(mp4|mkv|avi|wmv|iso|srt|ass|ssa|!qB|part|mhtml).*$/i, '')
    }

    // Use code from client body first, then try extracting from keyword/filename
    const javCode = bodyCode
      ?? extractJavCode(keyword)
      ?? extractJavCode(fileNameBase)
    const subtitleBase = javCode ?? fileNameBase
    console.log(`[download] subtitle base: "${subtitleBase}" (bodyCode=${bodyCode}, javCode=${javCode})`)

    const extractedFiles = fs.readdirSync(extractDir, { recursive: true }) as string[]
    const srtFiles = extractedFiles.filter((f: string) => f.toLowerCase().endsWith('.srt'))

    if (srtFiles.length === 0) {
      throw new Error('No .srt files found in the ZIP')
    }

    const movedFiles: string[] = []

    for (let i = 0; i < srtFiles.length; i++) {
      const srtFile = srtFiles[i]
      const originalPath = path.join(extractDir, srtFile)

      // Determine language code
      let langCode = 'ja' // Default for JAV
      if (srtFile.toLowerCase().includes('english') || srtFile.toLowerCase().includes('.en.')) langCode = 'en'
      if (srtFile.toLowerCase().includes('chinese') || srtFile.toLowerCase().includes('.zh.')) langCode = 'zh'

      const suffix = srtFiles.length > 1 ? `.${i + 1}` : ''
      const newFileName = `${subtitleBase}.${langCode}${suffix}.srt`
      const destinationPath = path.join(targetPath, newFileName)

      fs.copyFileSync(originalPath, destinationPath)
      movedFiles.push(newFileName)
    }

    return {
      success: true,
      movedFiles,
      targetFolder,
    } as DownloadResponse

  } catch (error: any) {
    console.error('Download error:', error)
    return {
      success: false,
      error: error.message,
      movedFiles: [],
      targetFolder: '',
    } as DownloadResponse
  } finally {
    if (browser) await browser.close()
    // Cleanup temp dir
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch (e) {
      console.error('Failed to cleanup temp dir:', e)
    }
  }
})
