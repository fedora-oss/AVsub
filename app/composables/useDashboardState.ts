import { ref, computed } from 'vue'

export const useDashboardState = () => {
  // Navigation
  const activeTab = useState<'search' | 'watcher' | 'library' | 'settings'>('dash_active_tab', () => 'library')
  const previousTab = useState<'search' | 'watcher' | 'library' | 'settings'>('dash_prev_tab', () => 'library')

  // Subtitle Settings State
  const subtitleSize = useState<number>('sub_settings_size', () => 18)
  const subtitleColor = useState<string>('sub_settings_color', () => '#ffffff')
  const subtitleItalic = useState<boolean>('sub_settings_italic', () => false)
  const subtitleBgMode = useState<'glass' | 'solid' | 'transparent'>('sub_settings_bg_mode', () => 'glass')

  if (import.meta.client) {
    const size = localStorage.getItem('sub_settings_size')
    if (size) subtitleSize.value = parseInt(size)
    const color = localStorage.getItem('sub_settings_color')
    if (color) subtitleColor.value = color
    const italic = localStorage.getItem('sub_settings_italic')
    if (italic) subtitleItalic.value = italic === 'true'
    const bgMode = localStorage.getItem('sub_settings_bg_mode')
    if (bgMode) subtitleBgMode.value = bgMode as any

    watch(subtitleSize, (val) => localStorage.setItem('sub_settings_size', val.toString()))
    watch(subtitleColor, (val) => localStorage.setItem('sub_settings_color', val))
    watch(subtitleItalic, (val) => localStorage.setItem('sub_settings_italic', val.toString()))
    watch(subtitleBgMode, (val) => localStorage.setItem('sub_settings_bg_mode', val))
  }

  // Search Tab State
  const currentKeyword = useState<string>('dash_search_keyword', () => '')
  const results = useState<any[]>('dash_search_results', () => [])
  const nyaaResults = useState<any[]>('dash_torrent_results', () => [])
  const loadingSubs = useState<boolean>('dash_loading_subs', () => false)
  const loadingTorrents = useState<boolean>('dash_loading_torrents', () => false)
  const subsError = useState<string>('dash_subs_error', () => '')
  const torrentsError = useState<string>('dash_torrents_error', () => '')
  const isAllCopied = useState<boolean>('dash_all_copied', () => false)

  // Watcher Tab State
  const watcherState = useState<any>('dash_watcher_state', () => ({
    active: false,
    watchedPath: '',
    polling: true,
    interval: 5000,
    stabilityThreshold: 10000,
    totalFilesWatched: 0,
    lastScannedAt: 0,
  }))
  const watcherTasks = useState<any[]>('dash_watcher_tasks', () => [])
  const triggeringScan = useState<boolean>('dash_trigger_scan', () => false)
  const scanMessage = useState<string>('dash_scan_message', () => '')
  
  // Pipeline Queue State
  const pipelineJobs = useState<any[]>('dash_pipeline_jobs', () => [])
  const loadingJobs = useState<boolean>('dash_loading_jobs', () => false)

  // qBittorrent Downloads State
  const activeDownloads = useState<any[]>('dash_active_downloads', () => [])
  const loadingDownloads = useState<boolean>('dash_loading_downloads', () => false)

  // Junk Filters State
  const junkPatterns = useState<string[]>('dash_junk_patterns', () => [])
  const junkPatternsInput = useState<string>('dash_junk_input', () => '')
  const hasDeletePermission = useState<boolean>('dash_delete_perm', () => false)
  const permErrorMessage = useState<string>('dash_perm_err', () => '')
  const movieDir = useState<string>('dash_movie_dir', () => '')
  const loadingFilters = useState<boolean>('dash_loading_filters', () => false)
  const savingFilters = useState<boolean>('dash_saving_filters', () => false)
  const cleaningJunk = useState<boolean>('dash_cleaning_junk', () => false)
  const cleanupReport = useState<any>('dash_cleanup_report', () => null)

  // Library Tab State
  const libraryMovies = useState<any[]>('dash_library_movies', () => [])
  const libraryGenres = useState<string[]>('dash_library_genres', () => [])
  const libraryActresses = useState<any[]>('dash_library_actresses', () => [])
  const pagination = useState<any>('dash_library_pagination', () => ({ page: 1, limit: 24, total: 0, totalPages: 1 }))
  const loadingLibrary = useState<boolean>('dash_loading_library', () => false)
  
  // Library Filters
  const filterSearch = useState<string>('dash_filter_search', () => '')
  const filterGenre = useState<string>('dash_filter_genre', () => '')
  const filterActressId = useState<string>('dash_filter_actress', () => '')
  const filterSubStatus = useState<'all' | 'hasSub' | 'noSub'>('dash_filter_sub', () => 'all')

  // API Error Tracking (Option A - Network status flags & retry)
  const watcherError = useState<string | null>('dash_watcher_err_msg', () => null)
  const downloadsError = useState<string | null>('dash_downloads_err_msg', () => null)
  const pipelineError = useState<string | null>('dash_pipeline_err_msg', () => null)
  const junkError = useState<string | null>('dash_junk_err_msg', () => null)
  const libraryError = useState<string | null>('dash_library_err_msg', () => null)

  // Polling State
  let pollIntervalId: any = null

  // Spotlight Featured Movie Computed Property (Jellyfin Style)
  const featuredMovie = computed(() => {
    if (!libraryMovies.value || libraryMovies.value.length === 0) return null
    const playableWithCover = libraryMovies.value.find(m => m.hasLocalVideo && m.coverUrl)
    if (playableWithCover) return playableWithCover
    const playable = libraryMovies.value.find(m => m.hasLocalVideo)
    if (playable) return playable
    const withCover = libraryMovies.value.find(m => m.coverUrl)
    if (withCover) return withCover
    return libraryMovies.value[0]
  })

  // Exponential Backoff Fetch Helper
  const fetchWithRetry = async (url: string, options: any = {}, retries = 3, delay = 1500): Promise<any> => {
    try {
      const res = await $fetch<any>(url, options)
      return res
    } catch (err: any) {
      if (retries <= 0) {
        throw err
      }
      // Wait for backoff delay (double the delay each time)
      await new Promise(resolve => setTimeout(resolve, delay))
      return fetchWithRetry(url, options, retries - 1, delay * 2)
    }
  }

  // --- Watcher API Methods ---
  const fetchWatcherState = async () => {
    try {
      const res = await fetchWithRetry('/api/watcher/status', {}, 2, 1000)
      if (res.success) {
        watcherState.value = res.state
        watcherError.value = null
      }
    } catch (err: any) {
      console.error('Failed to fetch watcher status:', err)
      watcherError.value = 'Không thể đồng bộ với Daemon giám sát. Đang tự động kết nối lại...'
    }
  }

  const fetchWatcherTasks = async () => {
    try {
      const res = await fetchWithRetry('/api/watcher/tasks', {}, 2, 1000)
      if (res.success) {
        watcherTasks.value = res.tasks
        watcherError.value = null
      }
    } catch (err: any) {
      console.error('Failed to fetch watcher tasks:', err)
      watcherError.value = 'Mất kết nối nhật ký hệ thống.'
    }
  }

  const triggerManualScan = async () => {
    if (triggeringScan.value) return
    triggeringScan.value = true
    scanMessage.value = ''
    try {
      const res = await $fetch<any>('/api/watcher/scan', { method: 'POST' })
      if (res.success) {
        scanMessage.value = res.message
        await fetchWatcherTasks()
      } else {
        scanMessage.value = 'Không thể khởi động quét: ' + res.message
      }
    } catch (err: any) {
      scanMessage.value = 'Lỗi hệ thống: ' + (err.data?.statusMessage || err.message)
    } finally {
      triggeringScan.value = false
      setTimeout(() => { scanMessage.value = '' }, 6000)
    }
  }

  const clearWatcherLogs = async () => {
    try {
      const res = await $fetch<any>('/api/watcher/clear', { method: 'POST' })
      if (res.success) {
        watcherTasks.value = []
      }
    } catch (err) {
      console.error('Failed to clear logs:', err)
    }
  }

  // --- Pipeline API Methods ---
  const fetchPipelineJobs = async () => {
    try {
      loadingJobs.value = true
      const res = await fetchWithRetry('/api/pipeline/jobs', {}, 2, 1000)
      if (res.success) {
        pipelineJobs.value = res.jobs
        pipelineError.value = null
      }
    } catch (err: any) {
      console.error('Failed to fetch pipeline jobs:', err)
      pipelineError.value = 'Lỗi tải hàng đợi Pipeline.'
    } finally {
      loadingJobs.value = false
    }
  }

  const triggerJobNow = async (id: string) => {
    try {
      loadingJobs.value = true
      const res = await $fetch<any>('/api/pipeline/jobs', {
        method: 'POST',
        body: { id }
      })
      if (res.success) {
        await fetchPipelineJobs()
      }
    } catch (err: any) {
      alert('Thực thi thất bại: ' + (err.data?.statusMessage || err.message))
    } finally {
      loadingJobs.value = false
    }
  }

  const cancelJob = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn hủy bỏ job này khỏi hàng đợi?')) return
    try {
      const res = await $fetch<any>('/api/pipeline/jobs', {
        method: 'DELETE',
        body: { id }
      })
      if (res.success) {
        await fetchPipelineJobs()
      }
    } catch (err: any) {
      alert('Hủy bỏ thất bại: ' + (err.data?.statusMessage || err.message))
    }
  }

  // --- qBittorrent API Methods ---
  const fetchActiveDownloads = async () => {
    try {
      loadingDownloads.value = true
      const res = await fetchWithRetry('/api/qbittorrent/active', {}, 2, 1000)
      if (res.success) {
        activeDownloads.value = res.torrents || []
        downloadsError.value = null
      }
    } catch (err: any) {
      console.error('Failed to fetch active torrents:', err)
      downloadsError.value = 'Mất kết nối dịch vụ tải qBittorrent.'
    } finally {
      loadingDownloads.value = false
    }
  }

  const controlTorrent = async (hash: string, action: 'pause' | 'resume' | 'delete') => {
    let deleteFiles = false
    if (action === 'delete') {
      if (!confirm('Bạn có chắc chắn muốn xóa torrent này khỏi qBittorrent?')) return
      deleteFiles = confirm('Bạn có muốn xóa toàn bộ tệp tin đã tải về trên đĩa cứng không?')
    }
    try {
      const res = await $fetch<any>('/api/qbittorrent/control', {
        method: 'POST',
        body: { hash, action, deleteFiles }
      })
      if (res.success) {
        await fetchActiveDownloads()
      }
    } catch (err: any) {
      alert('Thao tác thất bại: ' + (err.data?.statusMessage || err.message))
    }
  }

  // --- Junk Video Cleaner API Methods ---
  const fetchJunkFilters = async () => {
    try {
      loadingFilters.value = true
      const res = await fetchWithRetry('/api/pipeline/junk-filters', {}, 2, 1000)
      if (res.success) {
        junkPatterns.value = res.patterns || []
        junkPatternsInput.value = (res.patterns || []).join('\n')
        hasDeletePermission.value = res.hasDeletePermission
        permErrorMessage.value = res.permErrorMessage || ''
        movieDir.value = res.movieDir || '/movies'
        junkError.value = null
      }
    } catch (err: any) {
      console.error('Failed to fetch junk filters:', err)
      junkError.value = 'Lỗi tải bộ lọc rác.'
    } finally {
      loadingFilters.value = false
    }
  }

  const saveJunkFilters = async () => {
    try {
      savingFilters.value = true
      const parsedPatterns = junkPatternsInput.value
        .split('\n')
        .map(p => p.trim())
        .filter(Boolean)

      const res = await $fetch<any>('/api/pipeline/junk-filters', {
        method: 'POST',
        body: { patterns: parsedPatterns }
      })
      if (res.success) {
        alert('Lưu cấu hình lọc video rác thành công!')
        await fetchJunkFilters()
      }
    } catch (err: any) {
      alert('Lưu thất bại: ' + (err.data?.statusMessage || err.message))
    } finally {
      savingFilters.value = false
    }
  }

  const triggerManualCleanup = async () => {
    if (!confirm('Bạn có chắc chắn muốn chạy bộ lọc video rác ngay bây giờ? Tất cả các tệp video trùng mẫu cấu hình trong thư mục phim sẽ bị xóa vĩnh viễn.')) return
    try {
      cleaningJunk.value = true
      cleanupReport.value = null
      const res = await $fetch<any>('/api/pipeline/junk-filters?action=cleanup', {
        method: 'POST'
      })
      if (res.success) {
        cleanupReport.value = {
          deletedCount: res.deleted?.length || 0,
          errorsCount: res.errors?.length || 0,
          deleted: res.deleted || []
        }
        alert(`Đã hoàn thành dọn dẹp! Đã xóa: ${res.deleted?.length || 0} tệp.`)
      }
    } catch (err: any) {
      alert('Dọn dẹp thất bại: ' + (err.data?.statusMessage || err.message))
    } finally {
      cleaningJunk.value = false
    }
  }

  // --- Library JAV API Methods ---
  const fetchLibraryMovies = async (pageNum = 1) => {
    loadingLibrary.value = true
    try {
      const res = await fetchWithRetry('/api/library/movies', {
        query: {
          page: pageNum.toString(),
          limit: '24',
          search: filterSearch.value,
          genre: filterGenre.value,
          actressId: filterActressId.value,
          subtitleStatus: filterSubStatus.value
        }
      }, 2, 1000)
      if (res.success) {
        libraryMovies.value = res.movies
        pagination.value = res.pagination
        libraryError.value = null
      }
    } catch (err: any) {
      console.error('Failed to fetch library movies:', err)
      libraryError.value = 'Mất kết nối với Thư Viện Media. Vui lòng tải lại trang.'
    } finally {
      loadingLibrary.value = false
    }
  }

  const fetchFiltersData = async () => {
    try {
      const [genresRes, actressesRes] = await Promise.all([
        fetchWithRetry('/api/library/genres', {}, 1, 1000),
        fetchWithRetry('/api/library/actress', {}, 1, 1000)
      ])
      if (genresRes.success) libraryGenres.value = genresRes.genres
      if (actressesRes.success) libraryActresses.value = actressesRes.actresses
    } catch (err) {
      console.error('Failed to fetch filter options:', err)
    }
  }

  const resetLibraryFilters = () => {
    filterSearch.value = ''
    filterGenre.value = ''
    filterActressId.value = ''
    filterSubStatus.value = 'all'
    fetchLibraryMovies(1)
  }

  const downloadingCardSubs = ref<Record<string, boolean>>({})
  const quickDownloadSub = async (movieCode: string) => {
    if (downloadingCardSubs.value[movieCode]) return
    downloadingCardSubs.value[movieCode] = true
    
    try {
      const searchResults = await $fetch<any[]>('/api/search', {
        query: { keyword: movieCode }
      })

      if (!searchResults || searchResults.length === 0) {
        alert(`Không tìm thấy phụ đề nào cho mã ${movieCode} trên AVSubtitles.`)
        return
      }

      const bestSub = searchResults[0]
      
      const downloadResponse = await $fetch<any>('/api/download', {
        method: 'POST',
        body: {
          detail_link: bestSub.detail_link,
          keyword: movieCode,
          code: movieCode
        }
      })

      if (downloadResponse.success) {
        const movie = libraryMovies.value.find(m => m.code === movieCode)
        if (movie) movie.hasSubtitle = true
      } else {
        alert(`Tải phụ đề thất bại: ${downloadResponse.error}`)
      }
    } catch (err: any) {
      alert(`Gặp lỗi khi tải phụ đề: ${err.message}`)
    } finally {
      downloadingCardSubs.value[movieCode] = false
    }
  }

  // Polling management
  const startPolling = () => {
    stopPolling()
    
    // Initial fetches
    fetchWatcherState()
    fetchWatcherTasks()
    fetchPipelineJobs()
    fetchJunkFilters()
    fetchActiveDownloads()

    pollIntervalId = setInterval(() => {
      if (activeTab.value === 'watcher') {
        fetchWatcherState()
        fetchWatcherTasks()
        fetchPipelineJobs()
        fetchActiveDownloads()
      }
    }, 5000)
  }

  const stopPolling = () => {
    if (pollIntervalId) {
      clearInterval(pollIntervalId)
      pollIntervalId = null
    }
  }

  return {
    activeTab,
    previousTab,
    currentKeyword,
    results,
    nyaaResults,
    loadingSubs,
    loadingTorrents,
    subsError,
    torrentsError,
    isAllCopied,

    watcherState,
    watcherTasks,
    triggeringScan,
    scanMessage,

    pipelineJobs,
    loadingJobs,

    activeDownloads,
    loadingDownloads,

    junkPatterns,
    junkPatternsInput,
    hasDeletePermission,
    permErrorMessage,
    movieDir,
    loadingFilters,
    savingFilters,
    cleaningJunk,
    cleanupReport,

    libraryMovies,
    libraryGenres,
    libraryActresses,
    pagination,
    loadingLibrary,
    filterSearch,
    filterGenre,
    filterActressId,
    filterSubStatus,

    featuredMovie,
    downloadingCardSubs,

    watcherError,
    downloadsError,
    pipelineError,
    junkError,
    libraryError,

    fetchWatcherState,
    fetchWatcherTasks,
    triggerManualScan,
    clearWatcherLogs,
    fetchPipelineJobs,
    triggerJobNow,
    cancelJob,
    fetchActiveDownloads,
    controlTorrent,
    fetchJunkFilters,
    saveJunkFilters,
    triggerManualCleanup,
    fetchLibraryMovies,
    fetchFiltersData,
    resetLibraryFilters,
    quickDownloadSub,
    startPolling,
    stopPolling,

    subtitleSize,
    subtitleColor,
    subtitleItalic,
    subtitleBgMode,
  }
}
