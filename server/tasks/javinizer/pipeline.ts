import { defineTask } from 'nitropack/runtime'
import { runPostDownloadPipeline } from '../../utils/javinizer-batch'

/**
 * Nitro Task: javinizer:pipeline
 *
 * Chạy full pipeline sau khi torrent download xong:
 *   1. Rename files trong /movies
 *   2. Batch scrape (chờ job hoàn thành)
 *   3. Batch organize
 *
 * Payload:
 *   moviesDir?: string  — override MOVIE_DIRECTORY env (optional)
 */
export default defineTask({
  meta: {
    name: 'javinizer:pipeline',
    description: 'Post-download pipeline: rename files → batch scrape → organize',
  },

  async run({ payload }) {
    const moviesDir = (payload?.moviesDir as string | undefined)
      ?? process.env.MOVIE_DIRECTORY
      ?? '/movies'

    // Path mà Javinizer container thấy (mount point riêng của Javinizer)
    const javinizerDir = (payload?.javinizerDir as string | undefined)
      ?? process.env.JAVINIZER_MOVIE_DIR
      ?? '/media/uncen'

    console.log(`[task:javinizer:pipeline] Starting pipeline for moviesDir=${moviesDir} javinizerDir=${javinizerDir}`)

    const result = await runPostDownloadPipeline(moviesDir, javinizerDir)

    console.log(
      `[task:javinizer:pipeline] Done. ` +
      `Renamed ${result.renameResult.renamed.length} file(s). ` +
      `Scrape job ${result.scrapeJobId}: ${result.scrapeJobStatus.status}`,
    )

    return {
      result: {
        renamed: result.renameResult.renamed,
        renameErrors: result.renameResult.errors,
        scrapeJobId: result.scrapeJobId,
        scrapeStatus: result.scrapeJobStatus.status,
        organizeResult: result.organizeResult,
      },
    }
  },
})
