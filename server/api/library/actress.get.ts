import { defineEventHandler, getQuery, createError } from 'h3'
import { javinizer } from '../../utils/javinizer-db'
import { extractJavCode } from '../../plugins/watcher'
import { getMovieFolders } from '../../utils/movies'
import fs from 'node:fs'
import path from 'node:path'

export default defineEventHandler(async (event) => {
  const query = getQuery(event) as { id?: string; search?: string }
  const id = query.id
  const search = query.search || ''

  // 1. DETAIL VIEW MODE: If actress ID is specified
  if (id) {
    const parsedId = parseInt(id, 10)
    if (isNaN(parsedId)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid actress ID specified'
      })
    }

    try {
      const actress = await javinizer.actress.findUnique({
        where: { id: parsedId }
      })

      if (!actress) {
        throw createError({
          statusCode: 404,
          statusMessage: 'Actress not found'
        })
      }

      // Fetch all movie directories to map subtitle status dynamically
      const foldersWithSrt = new Map<string, boolean>()
      try {
        const movieDir = process.env.MOVIE_DIRECTORY || '/movies'
        if (fs.existsSync(movieDir)) {
          const folders = getMovieFolders(movieDir)
          for (const folder of folders) {
            const files = fs.readdirSync(folder.fullPath)
            const hasSrt = files.some(f => f.toLowerCase().endsWith('.srt'))
            
            const code = extractJavCode(folder.name)
            if (code) {
              foldersWithSrt.set(code.toLowerCase(), hasSrt)
            }
          }
        }
      } catch (err: any) {
        console.error('[API Actress ID] FS scan failed:', err.message)
      }

      // Query all movies featuring this actress
      const dbMovies = await javinizer.movie.findMany({
        where: {
          actresses: {
            some: {
              actress_id: parsedId
            }
          }
        },
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

      // Map subtitle status dynamically
      const movies = dbMovies.map(movie => {
        const code = movie.id || ''
        const cleanCodeKey = code.toLowerCase().replace(/[^a-z0-9]/g, '')
        
        let hasSubtitle = false
        for (const [key, val] of foldersWithSrt.entries()) {
          const cleanKey = key.replace(/[^a-z0-9]/g, '')
          if (cleanKey === cleanCodeKey) {
            hasSubtitle = val
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
          hasSubtitle
        }
      })

      return {
        success: true,
        actress: {
          id: actress.id,
          name: [actress.first_name, actress.last_name].filter(Boolean).join(' ') || actress.japanese_name || '',
          japaneseName: actress.japanese_name,
          thumbUrl: actress.thumb_url,
          aliases: actress.aliases,
          dmmId: actress.dmm_id
        },
        movies
      }

    } catch (err: any) {
      console.error(`[API Actress detail] ID ${id} query failed:`, err.message)
      throw createError({
        statusCode: 500,
        statusMessage: `Database query failed: ${err.message}`
      })
    }
  }

  // 2. SEARCH LIST MODE: Return a list of all actresses (or matches based on search term)
  try {
    const where: any = {}
    
    if (search) {
      where.OR = [
        { first_name: { contains: search } },
        { last_name: { contains: search } },
        { japanese_name: { contains: search } },
        { aliases: { contains: search } }
      ]
    }

    const actresses = await javinizer.actress.findMany({
      where,
      orderBy: {
        japanese_name: 'asc'
      },
      take: 100 // Cap search list to prevent overload
    })

    const formattedActresses = actresses.map(a => ({
      id: a.id,
      name: [a.first_name, a.last_name].filter(Boolean).join(' ') || a.japanese_name || '',
      japaneseName: a.japanese_name,
      thumbUrl: a.thumb_url,
      aliases: a.aliases
    }))

    return {
      success: true,
      actresses: formattedActresses
    }

  } catch (error: any) {
    console.error('[API Actresses search] Query failed:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to search actresses: ${error.message}`
    })
  }
})
