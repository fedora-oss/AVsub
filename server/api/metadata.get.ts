import { defineEventHandler, getQuery, createError } from 'h3'
import { javinizer } from '../utils/javinizer-db'
import { callJavinizerScrapeAPI, type JavinizerAPIMovie } from '../utils/javinizer-scrape'
import { findMovieFolder } from '../utils/movies'
import fs from 'node:fs'
import path from 'node:path'

export default defineEventHandler(async (event) => {
  const { code } = getQuery(event) as { code: string }

  if (!code) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Movie code is required (e.g. /api/metadata?code=ABC-123)',
    })
  }

  // Normalize: "ABP-420" / "ABP420" → "abp420" (javinizer content_id format)
  const cleanCode = code.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  const upperCode = code.trim().toUpperCase()
  // Also try with dash: "ABP420" → "ABP-420"
  const dashedCode = upperCode.replace(/^([A-Z]+)(\d+)$/, '$1-$2')

  console.log(`[API /api/metadata] Looking up javinizer.db for code: ${code} (normalized: ${cleanCode})`)

  // ── Helper: Check local folder for video and subtitle ─────────────────────
  function checkFilesystemStatus(codeStr: string) {
    const movieDir = process.env.MOVIE_DIRECTORY || '/movies'
    let hasLocalVideo = false
    let hasSubtitle = false
    
    try {
      if (fs.existsSync(movieDir)) {
        const targetPath = findMovieFolder(movieDir, codeStr)
        if (targetPath) {
          const files = fs.readdirSync(targetPath)
          hasSubtitle = files.some(f => f.toLowerCase().endsWith('.srt'))
          hasLocalVideo = files.some(f => /\.(mp4|mkv|avi|wmv|mov)$/i.test(f))
        }
      }
    } catch (e: any) {
      console.warn(`[API /api/metadata] Filesystem scan error for ${codeStr}:`, e.message)
    }

    return { hasLocalVideo, hasSubtitle }
  }

  // ── Helper: format Prisma DB row into unified API shape ──────────────────
  function formatFromDB(movie: any, source: string) {
    let screenshots: string[] = []
    try { screenshots = JSON.parse(movie.screenshots ?? '[]') } catch { screenshots = [] }

    const actressDetails = (movie.actresses ?? [])
      .map((ma: any) => {
        const a = ma.actress
        if (!a) return null
        return {
          id: a.id,
          name: [a.first_name, a.last_name].filter(Boolean).join(' ') || a.japanese_name || '',
          japaneseName: a.japanese_name ?? null,
          thumbUrl: a.thumb_url ?? null,
          aliases: a.aliases ?? null,
          dmmId: a.dmm_id ?? null,
        }
      })
      .filter((a): a is any => a !== null)

    const genreNames: string[] = (movie.genres ?? [])
      .map((mg: any) => mg.genre?.name)
      .filter((n: unknown): n is string => typeof n === 'string')

    const fsStatus = checkFilesystemStatus(movie.id || code)

    return {
      success: true,
      source,
      data: {
        contentId: movie.content_id,
        code: movie.id,
        title: movie.display_title ?? movie.title,
        originalTitle: movie.original_title ?? null,
        description: movie.description ?? null,
        releaseDate: movie.release_date ?? null,
        releaseYear: movie.release_year ?? null,
        runtime: movie.runtime ?? null,
        director: movie.director ?? null,
        studio: movie.maker ?? null,
        label: movie.label ?? null,
        series: movie.series ?? null,
        ratingScore: movie.rating_score ?? null,
        ratingVotes: movie.rating_votes ?? null,
        posterUrl: movie.poster_url || movie.cropped_poster_url || null,
        coverUrl: movie.cover_url ?? null,
        croppedPosterUrl: movie.cropped_poster_url ?? null,
        screenshots,
        trailerUrl: movie.trailer_url ?? null,
        genres: genreNames,
        actresses: actressDetails.map((a: any) => a.name),
        actressDetails,
        hasLocalVideo: fsStatus.hasLocalVideo,
        hasSubtitle: fsStatus.hasSubtitle,
      },
    }
  }

  // ── Helper: format javinizer API response movie into unified API shape ────
  function formatFromAPIResponse(movie: JavinizerAPIMovie) {
    const enTranslation = movie.translations?.find(t => t.language === 'en')

    const actressDetails = (movie.actresses ?? []).map(a => ({
      id: a.id,
      name: [a.first_name, a.last_name].filter(Boolean).join(' ') || a.japanese_name || '',
      japaneseName: a.japanese_name ?? null,
      thumbUrl: a.thumb_url ?? null,
      aliases: a.aliases ?? null,
      dmmId: a.dmm_id ?? null,
    }))

    const genreNames = (movie.genres ?? [])
      .map(g => g.name)
      .filter((n): n is string => typeof n === 'string')

    const fsStatus = checkFilesystemStatus(movie.id || code)

    return {
      success: true,
      source: 'javinizer_api_scrape',
      data: {
        contentId: movie.content_id,
        code: movie.id,
        title: movie.display_title ?? movie.title ?? null,
        originalTitle: movie.original_title ?? null,
        description: movie.description ?? null,
        releaseDate: movie.release_date ?? null,
        releaseYear: movie.release_year ?? null,
        runtime: movie.runtime ?? null,
        director: movie.director ?? null,
        studio: movie.maker ?? null,
        label: movie.label ?? null,
        series: movie.series ?? null,
        ratingScore: movie.rating_score ?? null,
        ratingVotes: movie.rating_votes ?? null,
        posterUrl: movie.poster_url ?? null,
        coverUrl: movie.cover_url ?? null,
        screenshots: movie.screenshot_urls ?? [],
        trailerUrl: movie.trailer_url ?? null,
        genres: genreNames,
        actresses: actressDetails.map(a => a.name),
        actressDetails,
        titleEn: enTranslation?.title ?? null,
        studioEn: enTranslation?.maker ?? null,
        seriesEn: enTranslation?.series ?? null,
        hasLocalVideo: fsStatus.hasLocalVideo,
        hasSubtitle: fsStatus.hasSubtitle,
      },
    }
  }

  // ── Step 1: Check local javinizer.db first (fast path) ───────────────────
  try {
    const movie = await javinizer.movie.findFirst({
      where: {
        OR: [
          { content_id: cleanCode },
          { id: upperCode },
          { id: dashedCode },
        ],
      },
      include: {
        actresses: { include: { actress: true } },
        genres: { include: { genre: true } },
      },
    })

    if (movie) {
      console.log(`[API /api/metadata] Found in DB: ${movie.id}`)
      return formatFromDB(movie, 'javinizer_db')
    }

    // ── Step 2: Not in DB → call javinizer scrape API (returns data immediately) ──
    console.log(`[API /api/metadata] "${code}" not in DB — calling javinizer scrape API...`)

    const scrapedMovie = await callJavinizerScrapeAPI(dashedCode || upperCode)

    if (!scrapedMovie) {
      return {
        success: false,
        source: 'javinizer_api_not_found',
        message: `No metadata found for code: ${code}. Scrape API returned no result.`,
        data: null,
      }
    }

    return formatFromAPIResponse(scrapedMovie)

  } catch (error: any) {
    console.error(`[API /api/metadata] Error for ${code}:`, error.message || error)
    throw createError({
      statusCode: 500,
      statusMessage: `Metadata lookup failed: ${error.message}`,
    })
  }
})
