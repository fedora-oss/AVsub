/**
 * javinizer-batch.ts
 *
 * Post-download pipeline utility:
 * 1. renameMovieFiles  — port of the bash rename script, cleans filenames inside /movies
 * 2. batchScrape       — POST /api/v1/batch/scrape and waits for the job to complete
 * 3. batchOrganize     — POST /api/v1/batch/{id}/organize
 * 4. runPostDownloadPipeline — runs all three steps in sequence
 */

import fs from 'node:fs'
import path from 'node:path'
import { useStorage } from '#imports'

const JAVINIZER_URL = (process.env.JAVINIZER_URL ?? 'http://localhost:9999').replace(/\/$/, '')
const JAVINIZER_TOKEN = process.env.JAVINIZER_TOKEN ?? ''
/** Path mà AVsub container thấy — dùng cho thao tác file (rename, list) */
const MOVIES_DIR = process.env.MOVIE_DIRECTORY ?? '/movies'
/** Path mà Javinizer container thấy — dùng làm `destination` khi gọi Javinizer API */
const JAVINIZER_MOVIE_DIR = process.env.JAVINIZER_MOVIE_DIR ?? '/media/uncen'

const DEFAULT_SCRAPERS = [
  'r18dev',
  'dmm',
  'jav321',
  'libredmm',
  'javlibrary',
  'javdb',
  'javbus',
]

// ── Auth header helper ────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (JAVINIZER_TOKEN) headers['Authorization'] = `Bearer ${JAVINIZER_TOKEN}`
  return headers
}

// ── 1. Rename movie files ─────────────────────────────────────────────────────

/**
 * Port of the bash rename script.
 *
 * Walks `baseDir` recursively looking for *.mp4, *ja.srt, *en.srt files.
 * For each file whose name contains the parent folder name, strips everything
 * before the parent folder name and cleans any leading separator chars.
 *
 * Example:
 *   folder: MIMK-267
 *   file:   [MIMK-267].something.mp4  →  MIMK-267.something.mp4
 *   file:   xxxxxMIMK-267-C.mp4       →  MIMK-267-C.mp4
 */
export function renameMovieFiles(baseDir: string = MOVIES_DIR): { renamed: string[]; errors: string[] } {
  const renamed: string[] = []
  const errors: string[] = []

  console.log(`[rename] Scanning ${baseDir} for files to rename…`)

  // Collect matching files recursively
  const matchingFiles = walkDir(baseDir, (f) =>
    /\.(mp4|srt)$/i.test(f) && (f.endsWith('.mp4') || f.endsWith('ja.srt') || f.endsWith('en.srt'))
  )

  for (const filePath of matchingFiles) {
    try {
      const dir = path.dirname(filePath)
      const base = path.basename(filePath)
      const parent = path.basename(dir)

      // Skip root-level files and hidden/system files
      if (parent === '.' || parent === path.basename(baseDir)) continue
      if (base.startsWith('._')) continue

      // Skip if file doesn't contain the parent folder name
      if (!base.includes(parent)) continue

      // Strip everything before the parent folder name
      const suffix = base.slice(base.indexOf(parent) + parent.length)

      // Clean leading separators: ], space, _, -
      const cleanSuffix = suffix.replace(/^[\] _-]+/, '')

      const newBase = `${parent}${cleanSuffix}`

      if (base === newBase) continue // nothing to do

      const oldPath = filePath
      const newPath = path.join(dir, newBase)

      fs.renameSync(oldPath, newPath)
      renamed.push(`'${base}' → '${newBase}'`)
      console.log(`[rename] ${base} → ${newBase}`)
    } catch (err: any) {
      const msg = `Failed to rename '${filePath}': ${err.message}`
      errors.push(msg)
      console.error(`[rename] ${msg}`)
    }
  }

  console.log(`[rename] Done. ${renamed.length} renamed, ${errors.length} errors.`)
  return { renamed, errors }
}

/**
 * Scans directories recursively and deletes any junk files matching Regex patterns,
 * while safely protecting legitimate movie files and assets that contain the JAV code.
 */
export function cleanupJunkVideos(baseDir: string = MOVIES_DIR, patterns: string[] = []): { deleted: string[]; errors: string[] } {
  const deleted: string[] = []
  const errors: string[] = []

  if (patterns.length === 0) return { deleted, errors }

  console.log(`[cleanup-junk] Scanning ${baseDir} for junk files matching Regex patterns:`, patterns)
  
  const regexes = patterns.map(p => {
    try {
      return new RegExp(p, 'i')
    } catch (err: any) {
      console.warn(`[cleanup-junk] Invalid regex pattern "${p}":`, err.message)
      return null
    }
  }).filter((r): r is RegExp => r !== null)

  if (regexes.length === 0) return { deleted, errors }

  // Recursively find ALL files under baseDir
  const allFiles = walkDir(baseDir, () => true)

  for (const filePath of allFiles) {
    try {
      const dir = path.dirname(filePath)
      const base = path.basename(filePath)
      const parent = path.basename(dir)

      // Skip checking if it doesn't exist
      if (!fs.existsSync(filePath)) continue

      // Protect movie files and their subtitles/assets if they contain the JAV code (parent folder name)
      const parentLower = parent.toLowerCase()
      const baseLower = base.toLowerCase()
      const baseDirNameLower = path.basename(baseDir).toLowerCase()

      if (parentLower !== '.' && parentLower !== baseDirNameLower && baseLower.includes(parentLower)) {
        // Safe: This is the actual movie file or its subtitle (e.g. MIDA-533.mp4 or [x18.tv]MIDA-533.mp4 inside folder MIDA-533)
        continue
      }

      const isJunk = regexes.some(r => r.test(base))

      if (isJunk) {
        // Verify delete permissions actively
        fs.accessSync(filePath, fs.constants.W_OK)
        fs.unlinkSync(filePath)
        deleted.push(filePath)
        console.log(`[cleanup-junk] Successfully deleted junk file: ${filePath}`)
      }
    } catch (err: any) {
      const msg = `Failed to delete junk file '${filePath}': ${err.message}`
      errors.push(msg)
      console.error(`[cleanup-junk] ${msg}`)
    }
  }

  console.log(`[cleanup-junk] Done. Deleted ${deleted.length} junk file(s), ${errors.length} error(s).`)
  return { deleted, errors }
}

/** Recursively collect files matching predicate */
function walkDir(dir: string, predicate: (filename: string) => boolean): string[] {
  const results: string[] = []
  if (!fs.existsSync(dir)) return results

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath, predicate))
    } else if (entry.isFile() && predicate(entry.name)) {
      results.push(fullPath)
    }
  }
  return results
}

// ── 2. Batch Scrape ───────────────────────────────────────────────────────────

export interface BatchScrapeOptions {
  /** Path gửi lên Javinizer API (Javinizer mount point, vd: /media/uncen) */
  destination?: string
  /** Path local trong AVsub container dùng để list file (vd: /movies) */
  localDir?: string
  files?: string[]
  force?: boolean
  preset?: string
  scalarStrategy?: string
  arrayStrategy?: string
  strict?: boolean
  update?: boolean
  scrapers?: string[]
}

export interface BatchJobStatus {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | string
  progress?: number
  total?: number
  errors?: string[]
}

/**
 * Lists all media/subtitle files in `dir` recursively to build the `files` array for the batch API.
 */
function listMovieFiles(dir: string = MOVIES_DIR): string[] {
  return walkDir(dir, (f) => /\.(mp4|mkv|avi|wmv|mov|srt|vtt)$/i.test(f))
}

/**
 * POST /api/v1/batch/scrape
 * Returns the job ID on success.
 */
export async function batchScrape(opts: BatchScrapeOptions = {}): Promise<string> {
  const url = `${JAVINIZER_URL}/api/v1/batch/scrape`
  // destination = path mà Javinizer thấy (mount point của Javinizer container)
  const destination = opts.destination ?? JAVINIZER_MOVIE_DIR
  // localDir = path trong AVsub container để list file thực tế
  const localDir = opts.localDir ?? MOVIES_DIR
  const scannedFiles = opts.files ?? listMovieFiles(localDir)

  // Map absolute local paths to Javinizer's container mounts
  const files = scannedFiles.map((file) => {
    if (file.startsWith(localDir)) {
      return path.join(destination, path.relative(localDir, file))
    }
    return file
  })

  const payload = {
    array_strategy: opts.arrayStrategy ?? 'merge',
    destination,
    files,
    force: opts.force ?? false,
    operation_mode: 'organize',
    preset: opts.preset ?? 'conservative',
    scalar_strategy: opts.scalarStrategy ?? 'prefer-nfo',
    selected_scrapers: opts.scrapers ?? DEFAULT_SCRAPERS,
    strict: opts.strict ?? false,
    update: opts.update ?? false,
  }

  console.log(`[batch-scrape] POST ${url} with ${files.length} file(s)`)

  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`[batch-scrape] API error ${res.status}: ${text}`)
  }

  const json = await res.json() as { id?: string; job_id?: string }
  const jobId = json.id ?? json.job_id
  if (!jobId) throw new Error(`[batch-scrape] No job id in response: ${JSON.stringify(json)}`)

  console.log(`[batch-scrape] Job started: ${jobId}`)
  return jobId
}

// ── 3. Poll job until complete ────────────────────────────────────────────────

/**
 * Polls GET /api/v1/batch/{id} every `intervalMs` until the job is
 * 'completed' or 'failed', or until `timeoutMs` is exceeded.
 */
export async function waitForBatchJob(
  jobId: string,
  intervalMs = 10_000,
  timeoutMs = 60 * 60 * 1000, // 1 hour max
): Promise<BatchJobStatus> {
  const url = `${JAVINIZER_URL}/api/v1/batch/${jobId}`
  const deadline = Date.now() + timeoutMs

  console.log(`[batch-poll] Polling job ${jobId} every ${intervalMs / 1000}s…`)

  while (Date.now() < deadline) {
    await sleep(intervalMs)

    const res = await fetch(url, { headers: authHeaders() })
    if (!res.ok) {
      console.warn(`[batch-poll] Status check failed (${res.status}), retrying…`)
      continue
    }

    const status = await res.json() as BatchJobStatus
    const pct = status.total ? ` (${status.progress ?? 0}/${status.total})` : ''
    console.log(`[batch-poll] Job ${jobId} status: ${status.status}${pct}`)

    if (status.status === 'completed' || status.status === 'failed') {
      return status
    }
  }

  throw new Error(`[batch-poll] Job ${jobId} timed out after ${timeoutMs / 60000} minutes`)
}

// ── 4. Batch Organize ─────────────────────────────────────────────────────────

export interface BatchOrganizeOptions {
  /** Path gửi lên Javinizer API (Javinizer mount point, vd: /media/uncen) */
  destination?: string
  copyOnly?: boolean
  linkMode?: 'hard' | 'soft' | 'none'
  skipDownload?: boolean
  skipNfo?: boolean
}

/**
 * POST /api/v1/batch/{id}/organize
 */
export async function batchOrganize(jobId: string, opts: BatchOrganizeOptions = {}): Promise<unknown> {
  const url = `${JAVINIZER_URL}/api/v1/batch/${jobId}/organize`

  const payload = {
    copy_only: opts.copyOnly ?? false,
    destination: opts.destination ?? JAVINIZER_MOVIE_DIR,
    link_mode: opts.linkMode ?? 'hard',
    operation_mode: 'organize',
    skip_download: opts.skipDownload ?? false, // Mở khoá tự động tải poster/cover/screens/trailer
    skip_nfo: opts.skipNfo ?? false,          // Mở khoá viết tệp NFO
  }

  console.log(`[batch-organize] POST ${url}`)

  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`[batch-organize] API error ${res.status}: ${text}`)
  }

  const json = await res.json()
  console.log(`[batch-organize] Done:`, json)
  return json
}

// ── 5. Full pipeline ──────────────────────────────────────────────────────────

export interface PipelineResult {
  cleanupResult: { deleted: string[]; errors: string[] }
  renameResult: { renamed: string[]; errors: string[] }
  scrapeJobId: string
  scrapeJobStatus: BatchJobStatus
  organizeResult: unknown
}

/**
 * Runs the full post-download pipeline:
 *   0. Cleanup junk advertisement videos based on configured Regexes
 *   1. Rename files in /movies      (dùng moviesDir — path trong AVsub container)
 *   2. Batch scrape via Javinizer API  (dùng javinizerDir — path Javinizer thấy)
 *   3. Batch organize via Javinizer API
 *
 * @param moviesDir    Path local trong AVsub container (default: MOVIES_DIR = /movies)
 * @param javinizerDir Path mà Javinizer container thấy (default: JAVINIZER_MOVIE_DIR = /media/uncen)
 */
export async function runPostDownloadPipeline(
  moviesDir: string = MOVIES_DIR,
  javinizerDir: string = JAVINIZER_MOVIE_DIR,
): Promise<PipelineResult> {
  // Load Regex patterns from Nitro Storage
  const storage = useStorage('data')
  const junkPatterns = (await storage.getItem<string[]>('pipeline:junk_patterns')) ?? ['996gg\\.cc', '18\\+游戏大全', '游戏大全']

  console.log('[pipeline] ── Step 0: Cleaning up junk video files ────────────')
  const cleanupResult = cleanupJunkVideos(moviesDir, junkPatterns)

  console.log('[pipeline] ── Step 1: Renaming files ──────────────────────────')
  const renameResult = renameMovieFiles(moviesDir)

  console.log('[pipeline] ── Step 2: Batch scrape ───────────────────────────')
  console.log(`[pipeline]    localDir=${moviesDir}  javinizerDir=${javinizerDir}`)
  const scrapeJobId = await batchScrape({ destination: javinizerDir, localDir: moviesDir })

  console.log('[pipeline] ── Step 2b: Waiting for scrape job to complete ───')
  const scrapeJobStatus = await waitForBatchJob(scrapeJobId)

  if (scrapeJobStatus.status === 'failed') {
    console.error(`[pipeline] Scrape job ${scrapeJobId} failed:`, scrapeJobStatus.errors)
    // Still attempt organize — some files may have succeeded
  }

  console.log('[pipeline] ── Step 3: Batch organize ─────────────────────────')
  const organizeResult = await batchOrganize(scrapeJobId, { destination: javinizerDir })

  console.log('[pipeline] ── Pipeline complete ──────────────────────────────')
  return { cleanupResult, renameResult, scrapeJobId, scrapeJobStatus, organizeResult }
}

// ── Helper ────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
