import { defineTask } from 'nitropack/runtime'
import { runPostDownloadPipeline } from '../../utils/javinizer-batch'
import { callJavinizerScrapeAPI } from '../../utils/javinizer-scrape'

/**
 * Nitro Task: javinizer:pipeline
 *
 * Chạy luồng xử lý tự động sau khi torrent hoàn tất:
 *   - Nếu có `movieCode` trong payload: Chỉ gọi API cào và đồng bộ metadata gọn nhẹ (không rename/di chuyển file).
 *   - Nếu không có: Chạy full pipeline quét đệ quy toàn bộ thư mục (dự phòng hoặc kích hoạt thủ công).
 */
export default defineTask({
  meta: {
    name: 'javinizer:pipeline',
    description: 'Post-download pipeline: sync targeted metadata or run full batch scrape & organize',
  },

  async run({ payload }) {
    const movieCode = payload?.movieCode as string | undefined

    // Chế độ 1: Đồng bộ metadata gọn nhẹ cho riêng mã phim vừa tải xong
    if (movieCode) {
      console.log(`[task:javinizer:pipeline] Targeted metadata sync requested for code: ${movieCode}`)
      
      try {
        const scrapedMovie = await callJavinizerScrapeAPI(movieCode)
        if (scrapedMovie) {
          console.log(`[task:javinizer:pipeline] Targeted sync success for ${movieCode}: ${scrapedMovie.display_title || scrapedMovie.title}`)
          return {
            result: {
              mode: 'targeted-sync',
              movieCode,
              status: 'completed',
              title: scrapedMovie.display_title || scrapedMovie.title,
              maker: scrapedMovie.maker,
            }
          }
        } else {
          console.warn(`[task:javinizer:pipeline] Targeted sync failed or movie not found for code: ${movieCode}`)
          return {
            result: {
              mode: 'targeted-sync',
              movieCode,
              status: 'failed',
              message: 'Scrape API returned no movie metadata',
            }
          }
        }
      } catch (err: any) {
        console.error(`[task:javinizer:pipeline] Targeted sync error for ${movieCode}:`, err.message)
        return {
          result: {
            mode: 'targeted-sync',
            movieCode,
            status: 'failed',
            error: err.message,
          }
        }
      }
    }

    // Chế độ 2: Full batch pipeline quét hàng loạt toàn bộ thư mục
    const moviesDir = (payload?.moviesDir as string | undefined)
      ?? process.env.MOVIE_DIRECTORY
      ?? '/movies'

    const javinizerDir = (payload?.javinizerDir as string | undefined)
      ?? process.env.JAVINIZER_MOVIE_DIR
      ?? '/media/uncen'

    console.log(`[task:javinizer:pipeline] No specific movie code in payload. Running full batch pipeline for moviesDir=${moviesDir} javinizerDir=${javinizerDir}`)

    const result = await runPostDownloadPipeline(moviesDir, javinizerDir)

    console.log(
      `[task:javinizer:pipeline] Batch pipeline completed. ` +
      `Renamed ${result.renameResult.renamed.length} file(s). ` +
      `Scrape job ${result.scrapeJobId}: ${result.scrapeJobStatus.status}`,
    )

    return {
      result: {
        mode: 'batch-pipeline',
        renamed: result.renameResult.renamed,
        renameErrors: result.renameResult.errors,
        scrapeJobId: result.scrapeJobId,
        scrapeStatus: result.scrapeJobStatus.status,
        organizeResult: result.organizeResult,
      },
    }
  },
})
