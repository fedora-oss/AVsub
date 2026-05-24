import { defineEventHandler, createError } from 'h3'
import { javinizer } from '../../utils/javinizer-db'

export default defineEventHandler(async (event) => {
  try {
    const genres = await javinizer.genre.findMany({
      orderBy: {
        name: 'asc'
      }
    })

    const genresList = genres
      .map(g => g.name)
      .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)

    // Deduplicate just in case
    const uniqueGenres = Array.from(new Set(genresList))

    return {
      success: true,
      genres: uniqueGenres
    }
  } catch (error: any) {
    console.error('[API Genres] Query failed:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch genres: ${error.message}`
    })
  }
})
