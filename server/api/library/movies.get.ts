import { defineEventHandler, getQuery, createError } from 'h3'
import { javinizer } from '../../utils/javinizer-db'
import { extractJavCode } from '../../plugins/watcher'
import { getMovieFolders } from '../../utils/movies'
import fs from 'node:fs'
import path from 'node:path'

export default defineEventHandler(async (event) => {
  const query = getQuery(event) as {
    page?: string
    limit?: string
    search?: string
    genre?: string
    actressId?: string
    subtitleStatus?: 'all' | 'hasSub' | 'noSub'
  }

  const page = query.page || '1'
  const limit = query.limit || '24'
  const search = query.search || ''
  const genre = query.genre || ''
  const actressId = query.actressId || ''
  const subtitleStatus = query.subtitleStatus || 'all'

  const pageNum = parseInt(page, 10)
  const limitNum = parseInt(limit, 10)
  const skip = (pageNum - 1) * limitNum

  console.log(`[API Movies] Fetching library: page=${page}, search="${search}", genre="${genre}", actressId="${actressId}", subStatus=${subtitleStatus}`)

  // 1. Scan filesystem for folder video & subtitles in real-time
  const localMoviesState = new Map<string, { hasSrt: boolean; hasVideo: boolean }>()
  try {
    const movieDir = process.env.MOVIE_DIRECTORY || '/movies'
    if (fs.existsSync(movieDir)) {
      const folders = getMovieFolders(movieDir)
      for (const folder of folders) {
        try {
          const files = fs.readdirSync(folder.fullPath)
          const hasSrt = files.some(f => f.toLowerCase().endsWith('.srt'))
          const hasVideo = files.some(f => /\.(mp4|mkv|avi|wmv|mov)$/i.test(f))
          
          const code = extractJavCode(folder.name)
          if (code) {
            localMoviesState.set(code.toLowerCase(), { hasSrt, hasVideo })
          }
        } catch (folderErr: any) {
          console.warn(`[API Movies] Skip broken folder ${folder.fullPath} due to error:`, folderErr.message)
        }
      }
    }
  } catch (err: any) {
    console.error('[API Movies] Error scanning filesystem movie and subtitle directories:', err.message)
  }

  // 2. Build Prisma Filter Condition
  const where: any = {}

  if (search) {
    const searchUpper = search.trim().toUpperCase()
    const searchLower = search.trim().toLowerCase()
    const searchDashed = searchUpper.replace(/^([A-Z]+)(\d+)$/, '$1-$2')

    where.OR = [
      { id: { contains: searchUpper } },
      { id: { contains: searchDashed } },
      { content_id: { contains: searchLower } },
      { display_title: { contains: search } },
      { title: { contains: search } },
      { original_title: { contains: search } }
    ]
  }

  if (genre) {
    where.genres = {
      some: {
        genre: {
          name: genre
        }
      }
    }
  }

  if (actressId) {
    const parsedActressId = parseInt(actressId, 10)
    if (!isNaN(parsedActressId)) {
      where.actresses = {
        some: {
          actress_id: parsedActressId
        }
      }
    }
  }

  try {
    // 3. Fetch all matches from SQLite (we retrieve all matching to paginate in-memory alongside dynamic subtitle filter status)
    const allMovies = await javinizer.movie.findMany({
      where,
      include: {
        actresses: {
          include: {
            actress: true
          }
        },
        genres: {
          include: {
            genre: true
          }
        }
      },
      orderBy: {
        release_date: 'desc'
      }
    })

    // 4. Enrich database movies with dynamic subtitle status
    const enrichedMovies = allMovies.map(movie => {
      const code = movie.id || ''
      const cleanCodeKey = code.toLowerCase().replace(/[^a-z0-9]/g, '')
      
      // Attempt to resolve file movie & subtitle status on disk
      let hasSubtitle = false
      let hasLocalVideo = false
      for (const [key, val] of localMoviesState.entries()) {
        const cleanKey = key.replace(/[^a-z0-9]/g, '')
        if (cleanKey === cleanCodeKey) {
          hasSubtitle = val.hasSrt
          hasLocalVideo = val.hasVideo
          break
        }
      }

      const genresList = (movie.genres ?? [])
        .map((mg: any) => mg.genre?.name)
        .filter((n): n is string => typeof n === 'string')

      const actressesList = (movie.actresses ?? [])
        .map((ma: any) => {
          const a = ma.actress
          if (!a) return null
          return {
            id: a.id,
            name: [a.first_name, a.last_name].filter(Boolean).join(' ') || a.japanese_name || '',
            japaneseName: a.japanese_name,
            thumbUrl: a.thumb_url
          }
        })
        .filter((a): a is any => a !== null)


      return {
        contentId: movie.content_id,
        code: movie.id,
        title: movie.display_title || movie.title || movie.original_title || '',
        releaseDate: movie.release_date,
        posterUrl: movie.poster_url || movie.cropped_poster_url || null,
        coverUrl: movie.cover_url,
        genres: genresList,
        actresses: actressesList,
        hasSubtitle,
        hasLocalVideo
      }
    })

    // 5. In-Memory Filter by Subtitle Status
    let filteredMovies = enrichedMovies
    if (subtitleStatus === 'hasSub') {
      filteredMovies = enrichedMovies.filter(m => m.hasSubtitle)
    } else if (subtitleStatus === 'noSub') {
      filteredMovies = enrichedMovies.filter(m => !m.hasSubtitle)
    }

    // 6. Pagination slice
    const total = filteredMovies.length
    const totalPages = Math.ceil(total / limitNum)
    const paginatedMovies = filteredMovies.slice(skip, skip + limitNum)

    return {
      success: true,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages
      },
      movies: paginatedMovies
    }

  } catch (error: any) {
    console.error('[API Movies] Query failed:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Database fetch failed: ${error.message}`
    })
  }
})
