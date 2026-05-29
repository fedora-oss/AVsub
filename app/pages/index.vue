<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import type { SearchResult, TorrentResult } from '~/types'
import { prepare as ptPrepare, layout as ptLayout } from '@chenglou/pretext'

const route = useRoute()

const results = ref<SearchResult[]>([])
const nyaaResults = ref<TorrentResult[]>([])
const loadingSubs = ref(false)
const loadingTorrents = ref(false)
const subsError = ref('')
const torrentsError = ref('')
const currentKeyword = ref('')
const isAllCopied = ref(false)

// Watcher & Task Dashboard State
const activeTab = ref<'search' | 'watcher' | 'library' | 'pretext'>('search')
const previousTab = ref<'search' | 'watcher' | 'library' | 'pretext'>('library')
const watcherState = ref<any>({
  active: false,
  watchedPath: '',
  polling: true,
  interval: 5000,
  stabilityThreshold: 10000,
  totalFilesWatched: 0,
  lastScannedAt: 0,
})
const watcherTasks = ref<any[]>([])
const triggeringScan = ref(false)
const scanMessage = ref('')
let pollIntervalId: any = null

// Pipeline Jobs Queue State
const pipelineJobs = ref<any[]>([])
const loadingJobs = ref(false)

// qBittorrent Active Downloads State
const activeDownloads = ref<any[]>([])
const loadingDownloads = ref(false)

// Junk Regex & Deletion State
const junkPatterns = ref<string[]>([])
const junkPatternsInput = ref('')
const hasDeletePermission = ref(false)
const permErrorMessage = ref('')
const movieDir = ref('')
const loadingFilters = ref(false)
const savingFilters = ref(false)
const cleaningJunk = ref(false)
const cleanupReport = ref<{ deletedCount: number; errorsCount: number; deleted: string[] } | null>(null)

// Plex-style JAV Media Library States
const libraryMovies = ref<any[]>([])

// Spotlight Featured Movie Computed Property (Jellyfin Style)
const featuredMovie = computed(() => {
  if (!libraryMovies.value || libraryMovies.value.length === 0) return null
  // Try to find a playable movie with a cover first
  const playableWithCover = libraryMovies.value.find(m => m.hasLocalVideo && m.coverUrl)
  if (playableWithCover) return playableWithCover
  // Fallback to any playable movie
  const playable = libraryMovies.value.find(m => m.hasLocalVideo)
  if (playable) return playable
  // Fallback to any movie with a cover
  const withCover = libraryMovies.value.find(m => m.coverUrl)
  if (withCover) return withCover
  // Fallback to the first movie
  return libraryMovies.value[0]
})

const libraryGenres = ref<string[]>([])
const libraryActresses = ref<any[]>([])
const pagination = ref<any>({ page: 1, limit: 24, total: 0, totalPages: 1 })
const loadingLibrary = ref(false)

// Library Filters
const filterSearch = ref('')
const filterGenre = ref('')
const filterActressId = ref('')
const filterSubStatus = ref<'all' | 'hasSub' | 'noSub'>('all')

// Actress Profile Drawer/Modal
const showActressModal = ref(false)

const fetchWatcherState = async () => {
  try {
    const res = await $fetch<any>('/api/watcher/status')
    if (res.success) {
      watcherState.value = res.state
    }
  } catch (err) {
    console.error('Failed to fetch watcher status:', err)
  }
}

const fetchWatcherTasks = async () => {
  try {
    const res = await $fetch<any>('/api/watcher/tasks')
    if (res.success) {
      watcherTasks.value = res.tasks
    }
  } catch (err) {
    console.error('Failed to fetch watcher tasks:', err)
  }
}

const fetchPipelineJobs = async () => {
  try {
    const res = await $fetch<any>('/api/pipeline/jobs')
    if (res.success) {
      pipelineJobs.value = res.jobs
    }
  } catch (err) {
    console.error('Failed to fetch pipeline jobs:', err)
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
      alert('Kích hoạt chạy Pipeline thành công!')
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

const fetchActiveDownloads = async () => {
  try {
    const res = await $fetch<any>('/api/qbittorrent/active')
    if (res.success) {
      activeDownloads.value = res.torrents || []
    }
  } catch (err) {
    console.error('Failed to fetch active torrents:', err)
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

const isPausedState = (state: string) => {
  if (!state) return false
  const s = state.toLowerCase()
  return s.includes('paused') || s.includes('stopped') || s.includes('pause') || s.includes('stop')
}

const formatTorrentState = (state: string) => {
  if (!state) return ''
  const s = state.toLowerCase()
  if (s.includes('pauseddl') || s.includes('stoppeddl')) return 'TẠM DỪNG TẢI'
  if (s.includes('pausedup') || s.includes('stoppedup')) return 'DỪNG SEED (HOÀN THÀNH)'
  if (s.includes('downloading')) return 'ĐANG TẢI VỀ'
  if (s.includes('seeding')) return 'ĐANG SEED'
  if (s.includes('stalleddl')) return 'ĐANG CHỜ SEEDER'
  if (s.includes('stalledup')) return 'STALLED UPLOAD'
  if (s.includes('checking')) return 'ĐANG KIỂM TRA TỆP'
  if (s.includes('paused') || s.includes('stopped')) return 'TẠM DỪNG'
  return state.toUpperCase()
}

const fetchJunkFilters = async () => {
  try {
    loadingFilters.value = true
    const res = await $fetch<any>('/api/pipeline/junk-filters')
    if (res.success) {
      junkPatterns.value = res.patterns || []
      junkPatternsInput.value = (res.patterns || []).join('\n')
      hasDeletePermission.value = res.hasDeletePermission
      permErrorMessage.value = res.permErrorMessage || ''
      movieDir.value = res.movieDir || '/movies'
    }
  } catch (err) {
    console.error('Failed to fetch junk filters:', err)
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

// Fetch library movies
const fetchLibraryMovies = async (pageNum = 1) => {
  loadingLibrary.value = true
  try {
    const res = await $fetch<any>('/api/library/movies', {
      query: {
        page: pageNum.toString(),
        limit: '24',
        search: filterSearch.value,
        genre: filterGenre.value,
        actressId: filterActressId.value,
        subtitleStatus: filterSubStatus.value
      }
    })
    if (res.success) {
      libraryMovies.value = res.movies
      pagination.value = res.pagination
    }
  } catch (err) {
    console.error('Failed to fetch library movies:', err)
  } finally {
    loadingLibrary.value = false
  }
}

// Fetch dropdown filters
const fetchFiltersData = async () => {
  try {
    const [genresRes, actressesRes] = await Promise.all([
      $fetch<any>('/api/library/genres'),
      $fetch<any>('/api/library/actress')
    ])
    if (genresRes.success) libraryGenres.value = genresRes.genres
    if (actressesRes.success) libraryActresses.value = actressesRes.actresses
  } catch (err) {
    console.error('Failed to fetch filter options:', err)
  }
}

// Reset filters
const resetLibraryFilters = () => {
  filterSearch.value = ''
  filterGenre.value = ''
  filterActressId.value = ''
  filterSubStatus.value = 'all'
  fetchLibraryMovies(1)
}

// 1-Click quick download subtitle from grid card
const downloadingCardSubs = ref<Record<string, boolean>>({})
const quickDownloadSub = async (movieCode: string) => {
  if (downloadingCardSubs.value[movieCode]) return
  downloadingCardSubs.value[movieCode] = true
  
  try {
    // 1. Search subtitles
    const searchResults = await $fetch<any[]>('/api/search', {
      query: { keyword: movieCode }
    })

    if (!searchResults || searchResults.length === 0) {
      alert(`Không tìm thấy phụ đề nào cho mã ${movieCode} trên AVSubtitles.`)
      return
    }

    const bestSub = searchResults[0]
    
    // 2. Download subtitle
    const downloadResponse = await $fetch<any>('/api/download', {
      method: 'POST',
      body: {
        detail_link: bestSub.detail_link,
        keyword: movieCode,
        code: movieCode
      }
    })

    if (downloadResponse.success) {
      // Update hasSubtitle dynamically on movie items
      const movie = libraryMovies.value.find(m => m.code === movieCode)
      if (movie) movie.hasSubtitle = true
      
      const actressMovie = actressMovies.value.find(m => m.code === movieCode)
      if (actressMovie) actressMovie.hasSubtitle = true
    } else {
      alert(`Tải phụ đề thất bại: ${downloadResponse.error}`)
    }
  } catch (err: any) {
    alert(`Gặp lỗi khi tải phụ đề: ${err.message}`)
  } finally {
    downloadingCardSubs.value[movieCode] = false
  }
}

// Fetch specific actress details
const openActressProfile = (actressId: number) => {
  navigateTo(`/actress/${actressId}`)
}

// Shortcut to find actress torrent and switch tabs
const searchActressTorrent = (actressName: string) => {
  activeTab.value = 'search'
  currentKeyword.value = actressName
  handleSearch(actressName)
}

const handleTabChange = (tab: 'search' | 'watcher' | 'library' | 'pretext') => {
  activeTab.value = tab
  if (tab === 'watcher') {
    fetchWatcherState()
    fetchWatcherTasks()
    fetchPipelineJobs()
    fetchJunkFilters()
    fetchActiveDownloads()
    if (!pollIntervalId) {
      pollIntervalId = setInterval(() => {
        fetchWatcherState()
        fetchWatcherTasks()
        fetchPipelineJobs()
        fetchActiveDownloads()
      }, 4000)
    }
  } else {
    if (pollIntervalId) {
      clearInterval(pollIntervalId)
      pollIntervalId = null
    }
  }

  if (tab === 'library') {
    fetchFiltersData()
    fetchLibraryMovies(1)
  }
}

// Format timestamp
const formatTime = (ts: number) => {
  const d = new Date(ts)
  return d.toLocaleTimeString('vi-VN') + ' ' + d.toLocaleDateString('vi-VN')
}

// Format task type badge
const formatTaskType = (type: string) => {
  switch (type) {
    case 'watch_detect': return 'GIÁM SÁT'
    case 'subtitle_search': return 'TÌM SUB'
    case 'subtitle_download': return 'TẢI SUB'
    case 'manual_scan': return 'QUÉT THỦ CÔNG'
    default: return 'TÁC VỤ'
  }
}

// Task type FontAwesome icon classes
const getTaskIconClass = (type: string) => {
  switch (type) {
    case 'watch_detect': return 'fa-solid fa-eye text-sky-400'
    case 'subtitle_search': return 'fa-solid fa-magnifying-glass text-indigo-400'
    case 'subtitle_download': return 'fa-solid fa-download text-emerald-400'
    case 'manual_scan': return 'fa-solid fa-bolt text-amber-400'
    default: return 'fa-solid fa-gear text-slate-400'
  }
}

onUnmounted(() => {
  if (pollIntervalId) {
    clearInterval(pollIntervalId)
  }
})



// PWA & Mobile state
const isMobile = ref(false)
const isIOS = ref(false)
const isStandalone = ref(false)
const showInstallGuide = ref(false)
const deferredPrompt = ref<any>(null)

const detectPWAState = () => {
  if (!import.meta.client) return

  const userAgent = window.navigator.userAgent.toLowerCase()
  // Specific iOS check
  isIOS.value = /iphone|ipad|ipod/.test(userAgent)
  
  // General mobile check
  isMobile.value = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent)

  // Standalone mode check (PWA already running/installed)
  const isIOSStandalone = (window.navigator as any).standalone === true
  const isGenericStandalone = window.matchMedia('(display-mode: standalone)').matches
  isStandalone.value = isIOSStandalone || isGenericStandalone
}

const handleInstallClick = () => {
  if (isIOS.value) {
    showInstallGuide.value = true
  } else if (deferredPrompt.value) {
    deferredPrompt.value.prompt()
    deferredPrompt.value.userChoice.then((choiceResult: any) => {
      if (choiceResult.outcome === 'accepted') {
        isStandalone.value = true
      }
      deferredPrompt.value = null
    })
  } else {
    // Show manual guide as fallback for other unsupported browsers
    showInstallGuide.value = true
  }
}

onMounted(() => {
  detectPWAState()
  
  // Catch Chrome's native beforeinstallprompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt.value = e
  })

  // Watch for orientation/installed status transitions
  window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
    isStandalone.value = e.matches
  })

  // Auto-trigger search if query parameter exists
  if (route.query.search) {
    const searchVal = route.query.search as string
    activeTab.value = 'search'
    currentKeyword.value = searchVal
    handleSearch(searchVal)
  }
})

const handleSearch = (keyword: string) => {
  currentKeyword.value = keyword
  results.value = []
  nyaaResults.value = []
  subsError.value = ''
  torrentsError.value = ''
  
  loadingSubs.value = true
  loadingTorrents.value = true

  // Fetch Torrents independently
  $fetch<TorrentResult[]>('/api/nyaa', { query: { keyword } })
    .then(res => {
      nyaaResults.value = res
      // Inject magnet to subs if subs finished loading first
      if (results.value.length > 0 && res.length > 0) {
        results.value.forEach(r => {
          if (!r.magnet) r.magnet = res[0].magnet || undefined
          if (!r.torrentUrl) r.torrentUrl = res[0].torrentUrl || undefined
        })
      }
    })
    .catch((err: any) => {
      torrentsError.value = err.data?.statusMessage || 'Failed to fetch torrents.'
    })
    .finally(() => {
      loadingTorrents.value = false
    })

  // Fetch Subs independently
  $fetch<SearchResult[]>('/api/search', { query: { keyword } })
    .then(res => {
      // Inject magnet from torrents if torrents finished loading first
      if (nyaaResults.value.length > 0) {
        res.forEach(r => {
          r.magnet = nyaaResults.value[0].magnet || undefined
          r.torrentUrl = nyaaResults.value[0].torrentUrl || undefined
        })
      }
      results.value = res
    })
    .catch((err: any) => {
      subsError.value = err.data?.statusMessage || 'Failed to fetch subtitles.'
    })
    .finally(() => {
      loadingSubs.value = false
    })
}

const copyAllMagnets = async () => {
  const magnets = nyaaResults.value
    .map(r => r.magnet)
    .filter((m): m is string => !!m)
    .join('\n')
  
  if (magnets) {
    try {
      await navigator.clipboard.writeText(magnets)
      isAllCopied.value = true
      setTimeout(() => {
        isAllCopied.value = false
      }, 2000)
    } catch (err) {
      console.error('Failed to copy all magnets:', err)
    }
  }
}

// ── Pretext Sandbox & Benchmark State ─────────────────────────────────────
const pretextInputText = ref('[MIDA-533] 💖 JAV Super Special Release - featuring multiple guest appearances, special 4K footage and exclusive behind-the-scenes interviews! 🎬✨')
const pretextFont = ref('500 15px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif')
const pretextWidth = ref(320)
const pretextLineHeight = ref(22)
const pretextMaxLines = ref(2)

const benchmarkRunning = ref(false)
const benchmarkIterations = ref(2000)
const benchmarkResults = ref<{
  domTime: number
  ptTime: number
  ptFullTime: number
  speedup: number
  fullSpeedup: number
  iterations: number
} | null>(null)

const sampleJavTitles = [
  '[MIDA-533] JAV Actress Title - An extremely long descriptive JAV title explaining genres, outfits, and actresses in deep detail.',
  '[IPX-893] 完璧な体を持つ彼女との極上の癒やしタイム 温泉旅行でイチャラブお泊り 24時間密着 SPECIAL EDITION (Exclusive Director\'s Cut)',
  '[PRED-456] 💖 JAV Super Idol Actress Special Release - featuring multiple guest appearances, special 4K footage and exclusive behind-the-scenes interviews! 🎬✨',
  '[JUL-982] JAV Title with emojis 🌸🍃 - This is a short title but has complex emoji characters that usually slow down font engines.',
  '[SSNI-009] JAV Title - An ultra descriptive name with parentheses (Exclusive Edition) [Special Cut Version] featuring detailed genre tags like schoolgirl, cosplay, high-heels.',
  '[MUTE-012] Deep Relaxation and Healing Session with your favorite JAV Idol - 120 Minutes of pure blissful triggers.',
  '[FSDSS-288] Extreme Closeup Beauty Shots and Exclusive Actress Interview - Special 4K Ultra HD Remastered version.',
  '[stars-999] The Ultimate JAV Star Collection - 4 Hours of continuous non-stop highlights of top-tier JAV actresses.',
  '[TEK-078] Cyberpunk JAV Concept Movie - futuristic elements mixed with classic JAV elements in a high budget production.',
  '[DANDY-523] Retro Style JAV Comedy Romance - A beautiful story set in Tokyo in the late 1980s with vintage styling.'
]

const runPretextBenchmark = () => {
  if (benchmarkRunning.value) return
  benchmarkRunning.value = true
  benchmarkResults.value = null
  
  setTimeout(() => {
    try {
      const iterations = benchmarkIterations.value
      const font = pretextFont.value
      const width = pretextWidth.value
      const lineHeight = pretextLineHeight.value
      
      // 1. DOM Benchmark
      const domStart = performance.now()
      const div = document.createElement('div')
      div.style.position = 'absolute'
      div.style.visibility = 'hidden'
      div.style.left = '-9999px'
      div.style.top = '-9999px'
      div.style.width = `${width}px`
      div.style.font = font
      div.style.lineHeight = `${lineHeight}px`
      div.style.wordBreak = 'break-word'
      document.body.appendChild(div)
      
      for (let i = 0; i < iterations; i++) {
        const text = sampleJavTitles[i % sampleJavTitles.length]
        div.textContent = text
        const height = div.offsetHeight // triggers layout reflow
      }
      document.body.removeChild(div)
      const domTime = performance.now() - domStart
      
      // 2. Pretext Benchmark (Hot Path - Layout only)
      const preparedList = sampleJavTitles.map(text => ptPrepare(text, font))
      const ptStart = performance.now()
      for (let i = 0; i < iterations; i++) {
        const prepared = preparedList[i % preparedList.length]
        const res = ptLayout(prepared, width, lineHeight)
      }
      const ptTime = performance.now() - ptStart
      
      // 3. Pretext Benchmark (Full Flow - Prepare + Layout)
      const ptFullStart = performance.now()
      for (let i = 0; i < iterations; i++) {
        const text = sampleJavTitles[i % sampleJavTitles.length]
        const prepared = ptPrepare(text, font)
        const res = ptLayout(prepared, width, lineHeight)
      }
      const ptFullTime = performance.now() - ptFullStart
      
      benchmarkResults.value = {
        domTime,
        ptTime,
        ptFullTime,
        speedup: ptTime > 0 ? Number((domTime / ptTime).toFixed(1)) : 500,
        fullSpeedup: ptFullTime > 0 ? Number((domTime / ptFullTime).toFixed(1)) : 10,
        iterations
      }
    } catch (err) {
      console.error('Benchmark failed:', err)
      alert('Đã xảy ra lỗi khi chạy Benchmark. Vui lòng kiểm tra console.')
    } finally {
      benchmarkRunning.value = false
    }
  }, 100)
}
</script>

<template>
  <div class="page-container">
    <header class="header">
      <h1>AVsub <span class="badge">PRO</span></h1>
      <p class="tagline">Unified Anime/JAV Torrents & Movie Subtitles Search Portal</p>
    </header>

    <!-- Cyberpunk Tab Navigation -->
    <div class="tab-navigation">
      <button 
        class="tab-btn" 
        :class="{ active: activeTab === 'search' }"
        @click="handleTabChange('search')"
      >
        <span class="tab-icon"><i class="fa-solid fa-magnifying-glass"></i></span>
        <span class="hidden sm:inline">Portal Tìm Kiếm</span>
        <span class="inline sm:hidden">Tìm Kiếm</span>
      </button>
      <button 
        class="tab-btn" 
        :class="{ active: activeTab === 'watcher' }"
        @click="handleTabChange('watcher')"
      >
        <span class="tab-icon"><i class="fa-solid fa-robot"></i></span>
        <span class="hidden sm:inline">Trình Giám Sát & Tasks</span>
        <span class="inline sm:hidden">Giám Sát</span>
      </button>
      <button 
        class="tab-btn" 
        :class="{ active: activeTab === 'library' }"
        @click="handleTabChange('library')"
      >
        <span class="tab-icon"><i class="fa-solid fa-film"></i></span>
        <span class="hidden sm:inline">Thư Viện Plex-style</span>
        <span class="inline sm:hidden">Thư Viện</span>
      </button>
    </div>


    <!-- TAB 1: SEARCH PORTAL -->
    <div v-if="activeTab === 'search'">
      <!-- Search Form Component -->
      <SearchForm :loading="loadingSubs || loadingTorrents" @search="handleSearch" />

      <!-- Results Area -->
      <main class="results-area">
        <!-- Unified Results Display -->
        <div v-if="currentKeyword" class="unified-results">
          
          <!-- SECTION 1: Magnet Links / Torrents -->
          <div class="results-section torrents-section">
            <div class="bulk-action-bar">
              <h2 class="results-title">
                🧲 Torrents & Magnet Links <span v-if="!loadingTorrents">({{ nyaaResults.length }})</span>
              </h2>
              <button 
                v-if="nyaaResults.length > 0 && !loadingTorrents"
                class="copy-all-btn" 
                :class="{ success: isAllCopied }" 
                @click="copyAllMagnets"
              >
                <span v-if="isAllCopied" class="btn-flex">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Copied All Magnets
                </span>
                <span v-else class="btn-flex">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                  Copy All Magnets
                </span>
              </button>
            </div>

            <!-- Loading State for Torrents -->
            <div v-if="loadingTorrents" class="status-message">
              <div class="spinner"/>
              <p>Crawling Sukebei & Nyaa...</p>
            </div>

            <!-- Error State -->
            <div v-else-if="torrentsError" class="status-message error">
              <p>{{ torrentsError }}</p>
            </div>

            <div v-else-if="nyaaResults.length > 0" class="results-grid nyaa">
              <NyaaResultCard
                v-for="(result, index) in nyaaResults"
                :key="`${result.title}-${index}`"
                :result="result"
              />
            </div>
            <div v-else class="no-results-box">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="empty-icon"><circle cx="12" cy="12" r="10"/><line x1="8" x2="16" y1="12" y2="12"/></svg>
              <p>No torrents found for "{{ currentKeyword }}".</p>
            </div>
          </div>

        </div>
      </main>
    </div>

    <!-- TAB 2: WATCHER DAEMON & BACKGROUND TASKS -->
    <div v-else-if="activeTab === 'watcher'" class="watcher-tab-container">
      
      <!-- 📊 Stats / Configuration Grid -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon"><i class="fa-solid fa-robot text-sky-400"></i></div>
          <div class="stat-content">
            <span class="stat-label">Trạng thái Daemon</span>
            <div class="stat-value-flex">
              <span v-if="watcherState.active" class="status-indicator active">
                <span class="pulse-dot"/> Giám sát 24/7
              </span>
              <span v-else class="status-indicator inactive">
                <span class="static-dot"/> Tạm dừng
              </span>
            </div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon"><i class="fa-regular fa-folder-open text-violet-400"></i></div>
          <div class="stat-content">
            <span class="stat-label">Thư mục Giám sát</span>
            <span class="stat-value path-text" :title="watcherState.watchedPath">
              {{ watcherState.watchedPath || 'Chưa cấu hình' }}
            </span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon"><i class="fa-solid fa-gears text-indigo-400"></i></div>
          <div class="stat-content">
            <span class="stat-label">Cơ chế Quét & Delay</span>
            <span class="stat-value stats-sub-text">
              {{ watcherState.polling ? 'Polling (NAS Mount)' : 'Native (inotify)' }} / {{ watcherState.interval / 1000 }}s (ổn định: {{ watcherState.stabilityThreshold / 1000 }}s)
            </span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon"><i class="fa-solid fa-clapperboard text-emerald-400"></i></div>
          <div class="stat-content">
            <span class="stat-label">Tổng phim đã quét</span>
            <span class="stat-value font-bold">{{ watcherState.totalFilesWatched }} tệp video</span>
          </div>
        </div>

        <div class="stat-card border border-white/[0.08] hover:border-sky-500/20 transition-all">
          <div class="stat-icon"><i class="fa-solid fa-key text-amber-500"></i></div>
          <div class="stat-content">
            <span class="stat-label">Quyền xóa/ghi /movies</span>
            <div class="stat-value-flex">
              <span v-if="loadingFilters" class="text-xs text-slate-400">Đang kiểm tra...</span>
              <span v-else-if="hasDeletePermission" class="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                <i class="fa-solid fa-circle-check text-emerald-400"></i> Đủ Quyền Xóa
              </span>
              <span v-else class="text-[11px] font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full inline-flex items-center gap-1" :title="permErrorMessage">
                <i class="fa-solid fa-circle-xmark text-rose-450"></i> Thiếu Quyền
              </span>
            </div>
            <p v-if="permErrorMessage && !loadingFilters" class="text-[9px] text-rose-400 mt-1 max-w-[200px] truncate" :title="permErrorMessage">
              {{ permErrorMessage }}
            </p>
          </div>
        </div>
      </div>

      <!-- ⚡ Actions Bar -->
      <div class="watcher-actions-bar">
        <div class="watcher-action-buttons">
          <button 
            class="watcher-action-btn scan-btn" 
            :disabled="triggeringScan" 
            @click="triggerManualScan"
          >
            <span v-if="triggeringScan" class="spinner-mini"/>
            <span v-else class="btn-flex-center"><i class="fa-solid fa-bolt mr-1.5"></i> Quét Toàn Bộ Thư Mục</span>
          </button>
          
          <button 
            class="watcher-action-btn clear-btn" 
            @click="clearWatcherLogs"
          >
            <span class="btn-flex-center"><i class="fa-solid fa-trash-can mr-1.5"></i> Xóa Nhật Ký</span>
          </button>
        </div>

        <!-- Scan Alert Notifications -->
        <Transition name="fade">
          <div v-if="scanMessage" class="scan-alert">
            <span class="alert-icon"><i class="fa-solid fa-bell text-sky-450 mr-1.5 animate-bounce"></i></span>
            <span class="alert-text">{{ scanMessage }}</span>
          </div>
        </Transition>
      </div>

      <!-- 📥 Active qBittorrent Downloads Section -->
      <div class="qbit-downloads-section mt-8 mb-8 border border-white/[0.08] rounded-2xl p-6 bg-slate-950/40 backdrop-blur-md">
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-sm font-extrabold text-violet-400 tracking-wider uppercase flex items-center gap-2">
            <i class="fa-solid fa-download text-violet-400"></i>
            <span>Tiến Trình Tải Torrent qBittorrent (Real-time Downloads)</span>
          </h2>
          <button 
            class="h-8 w-8 rounded-xl border border-white/10 hover:bg-white/5 active:scale-95 text-slate-300 transition-all flex items-center justify-center"
            title="Làm mới"
            @click="fetchActiveDownloads"
          >
            <i class="fa-solid fa-arrows-rotate"></i>
          </button>
        </div>

        <div v-if="activeDownloads.length === 0" class="no-logs-box py-8 text-center border border-dashed border-white/[0.06] rounded-xl">
          <p class="text-xs text-slate-400">Không có tệp tải xuống nào hoạt động. Tải phim bằng qBit để theo dõi tiến trình!</p>
        </div>

        <div v-else class="space-y-4">
          <div 
            v-for="torrent in activeDownloads" 
            :key="torrent.hash" 
            class="border border-white/[0.06] rounded-xl p-4 bg-slate-900/40 hover:border-violet-500/20 transition-all"
          >
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
              <div class="min-w-0 flex-1">
                <h3 class="text-xs font-bold text-slate-200 truncate flex items-center gap-1.5" :title="torrent.name">
                  <i class="fa-solid fa-clapperboard text-violet-400"></i>
                  <span>{{ torrent.name }}</span>
                </h3>
                <div class="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-[10px] text-slate-400 font-mono">
                  <span class="flex items-center gap-1"><i class="fa-solid fa-box text-slate-500"></i> DUNG LƯỢNG: {{ (torrent.size / (1024 * 1024 * 1024)).toFixed(2) }} GB</span>
                  <span class="text-violet-400 font-extrabold flex items-center gap-1"><i class="fa-solid fa-tag text-violet-450"></i> TRẠNG THÁI: {{ formatTorrentState(torrent.state) }}</span>
                  <span v-if="torrent.category" class="text-sky-400 flex items-center gap-1"><i class="fa-regular fa-folder text-sky-400"></i> THƯ MỤC: {{ torrent.category }}</span>
                </div>
              </div>

              <!-- Speed and Seeds Info -->
              <div class="flex items-center gap-3 text-[11px] text-slate-300 font-mono bg-white/5 px-3 py-1.5 rounded-lg border border-white/[0.05]">
                <span class="text-emerald-400 font-bold flex items-center gap-1"><i class="fa-solid fa-arrow-down text-emerald-450 animate-pulse"></i> {{ (torrent.dlspeed / (1024 * 1024)).toFixed(2) }} MB/S</span>
                <span class="text-indigo-400 font-bold flex items-center gap-1"><i class="fa-solid fa-arrow-up text-indigo-440"></i> {{ (torrent.upspeed / (1024 * 1024)).toFixed(2) }} MB/S</span>
                <span class="text-slate-400">SEEDS: {{ torrent.num_seeds }}</span>
              </div>
            </div>

            <!-- Progress Bar -->
            <div class="flex items-center gap-4">
              <div class="flex-1 bg-white/5 rounded-full h-2.5 overflow-hidden border border-white/[0.05] relative">
                <div 
                  class="bg-gradient-to-r from-violet-600 to-indigo-500 h-full rounded-full transition-all duration-500" 
                  :style="{ width: (torrent.progress * 100) + '%' }"
                />
              </div>
              <span class="text-xs font-mono font-bold text-violet-300 w-12 text-right">
                {{ (torrent.progress * 100).toFixed(1) }}%
              </span>
            </div>

            <!-- Meta details & Actions -->
            <div class="flex justify-between items-center mt-3 pt-3 border-t border-white/[0.04]">
              <span class="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                <i class="fa-regular fa-clock text-slate-500"></i>
                <span>CÒN LẠI: {{ torrent.eta >= 8640000 ? 'VÔ HẠN' : torrent.eta === 0 ? 'XONG' : Math.floor(torrent.eta / 60) + ' PHÚT ' + (torrent.eta % 60) + ' GIÂY' }}</span>
              </span>

              <div class="flex gap-2">
                <button 
                  v-if="isPausedState(torrent.state)"
                  class="h-7 w-7 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 active:scale-90 transition-all flex items-center justify-center"
                  title="Tiếp tục"
                  @click="controlTorrent(torrent.hash, 'resume')"
                >
                  <i class="fa-solid fa-play"></i>
                </button>
                <button 
                  v-else
                  class="h-7 w-7 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 active:scale-90 transition-all flex items-center justify-center"
                  title="Tạm dừng"
                  @click="controlTorrent(torrent.hash, 'pause')"
                >
                  <i class="fa-solid fa-pause"></i>
                </button>
                <button 
                  class="h-7 w-7 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/20 text-rose-400 active:scale-90 transition-all flex items-center justify-center"
                  title="Xóa bỏ"
                  @click="controlTorrent(torrent.hash, 'delete')"
                >
                  <i class="fa-solid fa-trash-can"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ⏳ Pipeline Queue Manager Section -->
      <div class="pipeline-queue-section mt-8 mb-8 border border-white/[0.08] rounded-2xl p-6 bg-slate-950/40 backdrop-blur-md">
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-sm font-extrabold text-sky-400 tracking-wider uppercase flex items-center gap-2">
            <i class="fa-solid fa-hourglass-half text-sky-400"></i>
            <span>Hàng đợi xử lý Post-Download (Javinizer Pipeline Queue)</span>
          </h2>
          <button 
            class="h-8 w-8 rounded-xl border border-white/10 hover:bg-white/5 active:scale-95 text-slate-300 transition-all flex items-center justify-center"
            title="Làm mới"
            @click="fetchPipelineJobs"
          >
            <i class="fa-solid fa-arrows-rotate"></i>
          </button>
        </div>

        <div v-if="loadingJobs" class="flex flex-col items-center justify-center py-8">
          <div class="spinner-mini"/>
          <p class="text-xs text-slate-400 mt-2">Đang tải danh sách hàng đợi...</p>
        </div>

        <div v-else-if="pipelineJobs.length === 0" class="no-logs-box py-8 text-center border border-dashed border-white/[0.06] rounded-xl">
          <p class="text-xs text-slate-400">Không có job nào trong hàng đợi. Tải thêm phim bằng qBit để kích hoạt hàng đợi!</p>
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div 
            v-for="job in pipelineJobs" 
            :key="job.id" 
            class="border border-white/[0.08] rounded-xl p-4 bg-slate-900/60 flex flex-col justify-between transition-all hover:border-sky-500/30"
          >
            <div>
              <div class="flex justify-between items-center mb-2">
                <span class="text-[10px] font-mono text-slate-500">JOB-ID: {{ job.id.substring(0, 8) }}...</span>
                <span class="text-xs font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full">Chuẩn bị chạy</span>
              </div>
              <p class="text-xs text-slate-300 mb-1 flex items-center gap-1.5">
                <i class="fa-regular fa-folder text-slate-400"></i>
                <span>Đường dẫn: <code class="bg-white/5 px-1 py-0.5 rounded text-sky-300">{{ job.moviesDir }}</code></span>
              </p>
              <p class="text-[11px] text-slate-400 flex items-center gap-1.5">
                <i class="fa-regular fa-clock text-slate-500"></i>
                <span>Lập lịch lúc: {{ new Date(job.scheduledAt).toLocaleTimeString() }}</span>
              </p>
              <p class="text-[11px] text-slate-400 font-semibold text-emerald-400 mt-1 uppercase flex items-center gap-1.5">
                <i class="fa-solid fa-rocket text-emerald-400"></i>
                <span>ĐẾM NGƯỢC: SẼ CHẠY SAU {{ job.remainingSeconds >= 60 ? Math.floor(job.remainingSeconds / 60) + ' PHÚT ' + (job.remainingSeconds % 60) + ' GIÂY' : job.remainingSeconds + ' GIÂY' }}</span>
              </p>
            </div>

            <div class="mt-4 flex gap-2 justify-end">
              <button 
                class="h-7 w-7 rounded-lg bg-sky-500 hover:bg-sky-400 active:scale-90 text-slate-950 transition-all flex items-center justify-center"
                title="Chạy ngay"
                @click="triggerJobNow(job.id)"
              >
                <i class="fa-solid fa-bolt"></i>
              </button>
              <button 
                class="h-7 w-7 rounded-lg border border-rose-500/30 hover:bg-rose-500/10 text-rose-400 active:scale-90 transition-all flex items-center justify-center"
                title="Hủy bỏ"
                @click="cancelJob(job.id)"
              >
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 🚫 Junk Video Regex Filters Section -->
      <div class="junk-filters-section mt-8 mb-8 border border-white/[0.08] rounded-2xl p-6 bg-slate-950/40 backdrop-blur-md">
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-sm font-extrabold text-sky-400 tracking-wider uppercase flex items-center gap-2">
            <i class="fa-solid fa-ban text-sky-400"></i>
            <span>Bộ Lọc Video Ngoại Lai (Junk Video Regex Filters)</span>
          </h2>
          <div class="flex gap-2">
            <button 
              class="h-8 px-4 rounded-xl border border-white/10 hover:bg-white/5 active:scale-95 text-xs text-slate-300 transition-all flex items-center gap-1"
              :disabled="loadingFilters"
              @click="fetchJunkFilters"
            >
              <i class="fa-solid fa-arrows-rotate mr-1"></i> Tải lại
            </button>
          </div>
        </div>

        <p class="text-xs text-slate-400 mb-4 leading-relaxed">
          Quét đệ quy thư mục <code class="bg-white/5 px-1 py-0.5 rounded text-sky-300 font-mono">{{ movieDir || '/movies' }}</code> và tự động xóa toàn bộ các tệp video trùng khớp với bất kỳ mẫu Regex nào dưới đây để dọn dẹp các tệp quảng cáo/rác tải kèm torrent. Bộ lọc chạy tự động ở Bước 0 của Pipeline.
        </p>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Textarea Input Area -->
          <div class="lg:col-span-2 flex flex-col gap-3">
            <textarea
              v-model="junkPatternsInput"
              class="w-full h-32 p-3 bg-slate-900/60 border border-white/[0.08] rounded-xl text-xs text-slate-200 font-mono focus:border-sky-500/50 focus:outline-none placeholder-slate-600 leading-normal"
              placeholder="996gg\.cc&#10;18\+游戏大全&#10;游戏大全"
              :disabled="savingFilters"
            />
            <div class="flex gap-3 items-center">
              <button 
                class="h-9 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:bg-sky-850 disabled:opacity-50 active:scale-95 text-slate-950 font-extrabold text-xs uppercase transition-all flex items-center gap-2"
                :disabled="savingFilters"
                @click="saveJunkFilters"
              >
                <span v-if="savingFilters" class="spinner-mini !border-slate-950"/>
                <i class="fa-regular fa-floppy-disk mr-1.5"></i> Lưu cấu hình
              </button>
              
              <button 
                class="h-9 px-4 rounded-xl border border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-400 active:scale-95 text-xs text-slate-300 font-bold uppercase transition-all flex items-center gap-2"
                :disabled="cleaningJunk"
                @click="triggerManualCleanup"
              >
                <span v-if="cleaningJunk" class="spinner-mini"/>
                <i class="fa-solid fa-broom mr-1.5"></i> Quét & Dọn Dẹp Ngay
              </button>
            </div>
          </div>

          <!-- Regex Examples & Info Card -->
          <div class="border border-white/[0.08] rounded-xl p-4 bg-slate-900/40 flex flex-col justify-between">
            <div>
              <h3 class="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
                <i class="fa-regular fa-lightbulb text-amber-500"></i>
                <span>Hướng dẫn & Ví dụ Regex:</span>
              </h3>
              <ul class="text-[11px] text-slate-400 space-y-2 list-disc list-inside">
                <li><code class="bg-white/5 px-1 py-0.5 rounded font-mono text-sky-300 font-mono">996gg\.cc</code>: Khớp các tệp có chứa tên miền quảng cáo.</li>
                <li><code class="bg-white/5 px-1 py-0.5 rounded font-mono text-sky-300 font-mono">18\+游戏大全</code>: Khớp tệp chứa chuỗi quảng cáo game 18+.</li>
                <li>Hệ thống biên dịch không phân biệt chữ hoa/thường (Regex Flag <code class="bg-white/5 px-1 py-0.5 rounded font-mono text-slate-300 font-mono">i</code>).</li>
                <li>Chỉ các tệp video (<code class="bg-white/5 px-1 py-0.5 rounded font-mono text-slate-300 font-mono">.mp4, .mkv, .avi, .wmv, .mov</code>) mới bị quét và xóa.</li>
              </ul>
            </div>
            <div class="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between">
              <span class="text-[11px] text-slate-500">Mẫu đang hoạt động:</span>
              <span class="text-xs font-mono font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full">
                {{ junkPatterns.length }} patterns
              </span>
            </div>
          </div>
        </div>

        <!-- Cleanup Report Section -->
        <Transition name="fade">
          <div v-if="cleanupReport" class="mt-4 p-4 border border-emerald-500/20 rounded-xl bg-emerald-950/20">
            <h4 class="text-xs font-bold text-emerald-400 mb-2 flex items-center gap-1.5">
              <i class="fa-solid fa-circle-check text-emerald-400"></i>
              <span>Đã hoàn tất dọn dẹp video ngoại lai!</span>
            </h4>
            <div class="text-[11px] text-slate-300 space-y-1">
              <p class="flex items-center gap-1"><i class="fa-solid fa-circle-check text-emerald-500 text-[10px]"></i> Đã xóa thành công: <strong class="text-emerald-400 font-bold">{{ cleanupReport.deletedCount }}</strong> tệp video.</p>
              <p v-if="cleanupReport.errorsCount > 0" class="flex items-center gap-1 text-rose-450"><i class="fa-solid fa-circle-xmark text-rose-500 text-[10px]"></i> Lỗi khi xóa: {{ cleanupReport.errorsCount }} tệp.</p>
              <div v-if="cleanupReport.deleted.length > 0" class="mt-2 max-h-24 overflow-y-auto font-mono text-[10px] text-slate-400 bg-slate-950/50 p-2 rounded border border-white/[0.05]">
                <div v-for="file in cleanupReport.deleted" :key="file" class="truncate flex items-center gap-1.5">
                  <i class="fa-solid fa-trash-can text-slate-500 text-[9px]"></i>
                  <span>{{ file }}</span>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </div>

      <!-- 📝 Task Log Terminal -->
      <div class="task-log-section">
        <div class="bulk-action-bar">
          <h2 class="results-title subtitles flex items-center gap-2">
            <i class="fa-solid fa-terminal text-violet-400"></i>
            <span>Nhật ký Tác vụ Ngầm (Background Logs)</span>
          </h2>
        </div>

        <div class="log-terminal-container">
          <div v-if="watcherTasks.length === 0" class="no-logs-box">
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="empty-icon"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><line x1="9" x2="15" y1="9" y2="15"/><line x1="15" x2="9" y1="9" y2="15"/></svg>
            <p class="empty-text">Chưa ghi nhận sự kiện nào. Daemon sẽ ghi nhật ký khi có video mới được tải xong hoặc khi quét thư mục.</p>
          </div>

          <div v-else class="log-list">
            <div 
              v-for="task in watcherTasks" 
              :key="task.id" 
              class="log-item-card"
              :class="task.status"
            >
              <div class="log-meta-bar">
                <span class="log-status-badge flex items-center gap-1.5" :class="task.status">
                  <i v-if="task.status === 'completed'" class="fa-solid fa-circle-check text-emerald-400"></i>
                  <i v-else-if="task.status === 'failed'" class="fa-solid fa-circle-xmark text-rose-500"></i>
                  <i v-else class="fa-solid fa-circle-notch fa-spin text-amber-400"></i>
                  {{ task.status === 'completed' ? 'THÀNH CÔNG' : task.status === 'failed' ? 'THẤT BẠI' : 'ĐANG CHẠY' }}
                </span>
                <span class="log-type-badge flex items-center gap-1.5">
                  <i :class="getTaskIconClass(task.type)"></i>
                  {{ formatTaskType(task.type) }}
                </span>
                <span class="log-timestamp flex items-center gap-1.5">
                  <i class="fa-regular fa-clock text-slate-500"></i>
                  {{ formatTime(task.timestamp) }}
                </span>
              </div>

              <div class="log-body-content">
                <div class="log-movie-title flex items-center gap-1.5">
                  <i class="fa-solid fa-clapperboard text-violet-400"></i>
                  <span>Mã phim JAV: <strong class="glow-code">{{ task.movieCode }}</strong></span>
                </div>
                <div class="log-status-message">{{ task.message }}</div>
                <div class="log-file-path flex items-center gap-1.5" :title="task.filePath">
                  <i class="fa-regular fa-folder-open text-amber-500"></i>
                  <span>Đường dẫn tệp: <code>{{ task.filePath }}</code></span>
                </div>
                <div v-if="task.error" class="log-error-detail flex items-center gap-1.5">
                  <i class="fa-solid fa-triangle-exclamation text-rose-500"></i>
                  <span>Chi tiết lỗi: <code>{{ task.error }}</code></span>
                </div>
              </div>
            </div>
          </div>
      </div>
    </div>

  </div>


    <!-- TAB 3: PLEX-STYLE JAV MEDIA LIBRARY (COMPANION PORTAL) -->
    <div v-else-if="activeTab === 'library'" class="library-tab-container">
      
      <!-- 🎬 Jellyfin Spotlight Featured Movie Banner -->
      <div 
        v-if="featuredMovie" 
        class="relative w-full h-[320px] sm:h-[400px] rounded-3xl overflow-hidden mb-8 border border-white/[0.06] shadow-2xl flex items-end group/spotlight cursor-pointer"
        @click="navigateTo(`/movie/${featuredMovie.code}`)"
      >
        <!-- Widescreen Cover Image Background with Rich Blur and Gradients -->
        <div class="absolute inset-0 z-0 bg-slate-950">
          <img 
            v-if="featuredMovie.coverUrl"
            :src="featuredMovie.coverUrl" 
            :alt="featuredMovie.title" 
            class="w-full h-full object-cover transition-transform duration-700 scale-100 group-hover/spotlight:scale-105"
            @error="(e: any) => e.target.src = featuredMovie.posterUrl || '/icon.png'"
          >
          <img 
            v-else-if="featuredMovie.posterUrl"
            :src="featuredMovie.posterUrl" 
            :alt="featuredMovie.title" 
            class="w-full h-full object-cover blur-md scale-110 opacity-40"
          >
          <div class="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/70 to-transparent z-10"/>
          <div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent z-10"/>
        </div>

        <!-- Spotlight Content Overlay -->
        <div class="relative z-20 p-6 sm:p-10 max-w-2xl flex flex-col items-start gap-3 sm:gap-4 select-none">
          <!-- Spotlight Badge -->
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-0.5 rounded-full bg-violet-600/30 border border-violet-500/40 text-violet-300 text-[10px] font-extrabold uppercase tracking-widest flex items-center gap-1.5 animate-pulse">
              <span class="w-1.5 h-1.5 rounded-full bg-violet-400"/>
              Nổi bật hôm nay
            </span>
            <span v-if="featuredMovie.hasLocalVideo" class="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[9px] font-extrabold uppercase tracking-widest">
              Sẵn sàng xem
            </span>
          </div>

          <!-- Movie JAV Code -->
          <h2 class="text-xs font-mono font-black text-violet-400 tracking-wider uppercase">
            {{ featuredMovie.code }}
          </h2>

          <!-- Movie Title -->
          <h1 class="text-xl sm:text-3xl font-black text-white leading-tight font-sans text-left line-clamp-2 drop-shadow-md">
            {{ featuredMovie.title }}
          </h1>

          <!-- Metadata Row -->
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-300 text-xs font-semibold font-sans">
            <span v-if="featuredMovie.releaseDate" class="text-violet-400 font-bold">
              {{ new Date(featuredMovie.releaseDate).getFullYear() }}
            </span>
            <span v-if="featuredMovie.releaseDate" class="text-slate-600">•</span>
            <div class="flex items-center gap-1">
              <span 
                v-for="actress in featuredMovie.actresses.slice(0, 3)" 
                :key="actress.id"
                class="hover:text-violet-300 transition-colors cursor-pointer underline decoration-violet-500/30"
                @click.stop="openActressProfile(actress.id)"
              >
                {{ actress.name }}
              </span>
              <span v-if="featuredMovie.actresses.length > 3" class="text-slate-400">...</span>
            </div>
            <span v-if="featuredMovie.genres && featuredMovie.genres.length > 0" class="text-slate-600">•</span>
            <div class="flex flex-wrap gap-1">
              <span 
                v-for="g in featuredMovie.genres.slice(0, 3)" 
                :key="g"
                class="px-1.5 py-0.5 rounded bg-white/5 border border-white/5 text-[9px] text-slate-400 tracking-wide uppercase font-bold"
              >
                {{ g }}
              </span>
            </div>
          </div>

          <!-- Buttons Group -->
          <div class="flex flex-wrap gap-3 mt-2 sm:mt-4">
            <!-- Xem Phim button -->
            <button 
              v-if="featuredMovie.hasLocalVideo"
              class="px-6 py-2.5 sm:px-8 sm:py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-all duration-200 active:scale-95 shadow-lg shadow-violet-600/35 hover:shadow-violet-600/50 flex items-center gap-2"
              @click.stop="navigateTo(`/movie/${featuredMovie.code}?play=true`)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              Xem Phim
            </button>
            
            <!-- Tìm torrent button -->
            <button 
              v-else
              class="px-6 py-2.5 sm:px-8 sm:py-3 bg-sky-600/20 hover:bg-sky-600/40 text-sky-300 border border-sky-500/35 rounded-2xl font-black text-xs uppercase tracking-wider transition-all duration-200 active:scale-95 shadow-lg shadow-sky-600/10 flex items-center gap-2"
              @click.stop="searchActressTorrent(featuredMovie.code)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 fill-none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>
              Tìm Torrent
            </button>

            <!-- Tải sub button -->
            <button 
              v-if="featuredMovie.hasLocalVideo && !featuredMovie.hasSubtitle"
              class="px-5 py-2.5 sm:px-6 sm:py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-2xl font-black text-xs uppercase tracking-wider transition-all duration-200 active:scale-95 shadow-lg shadow-amber-500/25 flex items-center gap-1.5"
              :disabled="downloadingCardSubs[featuredMovie.code]"
              @click.stop="quickDownloadSub(featuredMovie.code)"
            >
              <span v-if="downloadingCardSubs[featuredMovie.code]" class="spinner-mini border-slate-950"/>
              <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
              Tải Phụ Đề
            </button>
          </div>
        </div>
      </div>

      <!-- 🔍 Cyberpunk Filter Panel -->
      <div class="library-filter-panel">
        <div class="filter-row">
          <!-- Text Search -->
          <div class="filter-group flex-1">
            <input 
              v-model="filterSearch"
              type="text"
              placeholder="Tìm phim theo Mã JAV hoặc Tiêu đề..."
              class="filter-input search"
              @input="fetchLibraryMovies(1)"
            >
          </div>

          <!-- Genre filter -->
          <div class="filter-group">
            <select v-model="filterGenre" class="filter-select" @change="fetchLibraryMovies(1)">
              <option value="">🎭 Tất cả thể loại</option>
              <option v-for="g in libraryGenres" :key="g" :value="g">{{ g }}</option>
            </select>
          </div>

          <!-- Actress filter -->
          <div class="filter-group">
            <select v-model="filterActressId" class="filter-select" @change="fetchLibraryMovies(1)">
              <option value="">⭐ Tất cả diễn viên</option>
              <option v-for="a in libraryActresses" :key="a.id" :value="a.id">{{ a.name }}</option>
            </select>
          </div>

          <!-- Subtitle filter -->
          <div class="filter-group">
            <select v-model="filterSubStatus" class="filter-select" @change="fetchLibraryMovies(1)">
              <option value="all">📝 Phụ đề: Tất cả</option>
              <option value="hasSub">🟢 Đã có phụ đề</option>
              <option value="noSub">🔴 Chưa có phụ đề</option>
            </select>
          </div>

          <!-- Reset button -->
          <button class="reset-filter-btn flex items-center gap-1.5" @click="resetLibraryFilters">
            <i class="fa-solid fa-rotate-left"></i>
            <span>Reset</span>
          </button>
        </div>
      </div>

      <!-- 🎬 Movies Grid -->
      <div v-if="loadingLibrary" class="status-message">
        <div class="spinner"/>
        <p>Đang tải danh mục phim JAV từ Javinizer.db...</p>
      </div>

      <div v-else-if="libraryMovies.length === 0" class="no-results-box library">
        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="empty-icon"><circle cx="12" cy="12" r="10"/><line x1="8" x2="16" y1="12" y2="12"/></svg>
        <p>Không tìm thấy bộ phim nào trong thư viện khớp với bộ lọc hiện tại.</p>
        <button class="reset-filter-btn text-sm mt-2" @click="resetLibraryFilters">Xóa bộ lọc</button>
      </div>

      <div v-else class="library-content-area">
        <div class="library-grid">
          <div 
            v-for="movie in libraryMovies" 
            :key="movie.contentId" 
            class="movie-plex-card cursor-pointer group"
            :class="{ 'border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.08)]': movie.hasLocalVideo }"
            @click="navigateTo(`/movie/${movie.code}`)"
          >
            <!-- Card Poster Image -->
            <div class="movie-poster-container relative overflow-hidden">
              <img 
                v-if="movie.posterUrl" 
                :src="movie.posterUrl" 
                :alt="movie.title" 
                class="movie-poster-img transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
                @error="(e: any) => e.target.src = '/icon.png'"
              >
              <div v-else class="movie-poster-fallback">
                <span>{{ movie.code }}</span>
              </div>

              <!-- Floating Subtitle & Video Status Indicator Badge -->
              <div class="floating-sub-badge" :class="{ 'has-sub': movie.hasSubtitle, 'has-video': movie.hasLocalVideo }">
                <span class="sub-badge-dot" :class="{ 'bg-emerald-400': movie.hasLocalVideo }"/>
                <span>{{ movie.hasLocalVideo ? 'PLAYABLE' : movie.hasSubtitle ? 'CÓ SUB' : 'CHƯA SUB' }}</span>
              </div>

              <!-- Hover overlay actions -->
              <div class="poster-hover-overlay flex flex-col gap-2 items-center justify-center bg-black/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <!-- NÚT XEM PHIM NẾU SẴN SÀNG -->
                <button 
                  v-if="movie.hasLocalVideo"
                  class="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-2 rounded-xl font-extrabold text-[11px] uppercase tracking-wider transition-all duration-200 active:scale-95 shadow-lg shadow-emerald-500/20 flex items-center gap-1.5"
                  @click.stop="navigateTo(`/movie/${movie.code}?play=true`)"
                >
                  <i class="fa-solid fa-play"></i>
                  <span>Xem Phim</span>
                </button>

                <!-- NÚT TẢI PHỤ ĐỀ NẾU CÓ PHIM NHƯNG CHƯA CÓ SUB -->
                <button 
                  v-if="movie.hasLocalVideo && !movie.hasSubtitle" 
                  class="bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 py-1.5 rounded-xl font-extrabold text-[10px] uppercase tracking-wider transition-all duration-200 active:scale-95 shadow-lg shadow-amber-500/20 flex items-center gap-1.5"
                  :disabled="downloadingCardSubs[movie.code]"
                  @click.stop="quickDownloadSub(movie.code)"
                >
                  <span v-if="downloadingCardSubs[movie.code]" class="spinner-mini"/>
                  <template v-else>
                    <i class="fa-solid fa-download"></i>
                    <span>Tải Sub</span>
                  </template>
                </button>

                <!-- NÚT TÌM TORRENT NẾU CHƯA CÓ PHIM CỤC BỘ -->
                <button 
                  v-if="!movie.hasLocalVideo"
                  class="bg-sky-500/20 hover:bg-sky-500/40 text-sky-300 border border-sky-500/35 px-4 py-2 rounded-xl font-extrabold text-[11px] uppercase tracking-wider transition-all duration-200 active:scale-95 flex items-center gap-1.5"
                  @click.stop="searchActressTorrent(movie.code)"
                >
                  <i class="fa-solid fa-magnifying-glass"></i>
                  <span>Tìm Torrent</span>
                </button>
              </div>
            </div>

            <!-- Card Metadata Details -->
            <div class="movie-card-info">
              <div class="movie-card-header">
                <span class="movie-card-code">{{ movie.code }}</span>
                <span v-if="movie.releaseDate" class="movie-card-year">
                  {{ new Date(movie.releaseDate).getFullYear() }}
                </span>
              </div>
              <h3 class="movie-card-title" :title="movie.title">{{ movie.title }}</h3>
              
              <!-- Actresses list -->
              <div class="movie-card-actresses">
                <span 
                  v-for="actress in movie.actresses" 
                  :key="actress.id"
                  class="actress-link-tag"
                  @click.stop="openActressProfile(actress.id)"
                >
                  {{ actress.name }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 📃 Cyberpunk Pagination Footer -->
        <div v-if="pagination.totalPages > 1" class="library-pagination">
          <button 
            class="pagination-btn flex items-center gap-1.5" 
            :disabled="pagination.page === 1" 
            @click="fetchLibraryMovies(pagination.page - 1)"
          >
            <i class="fa-solid fa-chevron-left"></i>
            <span>Trang trước</span>
          </button>
          <span class="pagination-indicator">
            Trang <strong>{{ pagination.page }}</strong> / {{ pagination.totalPages }} (Tổng: {{ pagination.total }} phim)
          </span>
          <button 
            class="pagination-btn flex items-center gap-1.5" 
            :disabled="pagination.page === pagination.totalPages" 
            @click="fetchLibraryMovies(pagination.page + 1)"
          >
            <span>Trang sau</span>
            <i class="fa-solid fa-chevron-right"></i>
          </button>
        </div>
      </div>

    </div>

    <!-- TAB 4: PRETEXT SANDBOX & BENCHMARK -->
    <div v-else-if="activeTab === 'pretext'" class="pretext-tab-container p-6 bg-slate-900/20 backdrop-blur-xl border border-white/[0.08] rounded-3xl mt-4">
      <div class="pretext-header flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 class="text-2xl font-extrabold text-slate-100 flex items-center gap-2">
            <i class="fa-solid fa-bolt text-violet-400 animate-pulse"></i>
            <span>Pretext Text Layout Engine</span>
          </h2>
          <p class="text-xs text-slate-400 mt-1">
            Nghiên cứu và kiểm nghiệm công nghệ đo lường văn bản đa dòng không qua DOM (DOM-free), nhanh hơn tới 500x.
          </p>
        </div>
        <div class="flex items-center gap-3">
          <button 
            :disabled="benchmarkRunning" 
            class="px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-500/20 active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition-all"
            @click="runPretextBenchmark"
          >
            <span v-if="benchmarkRunning" class="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
            <span><i class="fa-solid fa-bolt mr-1.5"></i> CHẠY BENCHMARK SO SÁNH ({{ benchmarkIterations }} LƯỢT)</span>
          </button>
        </div>
      </div>

      <!-- Live Performance Cards -->
      <div v-if="benchmarkResults" class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div class="bg-gradient-to-br from-violet-950/40 to-indigo-950/30 backdrop-blur-md border border-violet-500/30 rounded-2xl p-5 shadow-xl flex flex-col justify-between relative overflow-hidden">
          <div class="absolute -right-6 -bottom-6 w-24 h-24 bg-violet-500/10 rounded-full blur-2xl"/>
          <div>
            <span class="text-[10px] font-extrabold text-violet-400 tracking-widest uppercase block mb-1">Hot Path Speedup</span>
            <h3 class="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-emerald-400">
              {{ benchmarkResults.speedup }}x Nhanh hơn
            </h3>
            <p class="text-slate-400 text-[11px] leading-relaxed mt-2">
              Khi thực hiện layout nhiều lần (ví dụ: khi cuộn danh sách ảo hoặc kéo dãn cửa sổ), Pretext sử dụng số học thuần túy bỏ qua DOM đắt đỏ.
            </p>
          </div>
          <div class="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px]">
            <span class="text-slate-500">Pretext Hot Path:</span>
            <span class="font-mono text-emerald-400 font-bold">{{ benchmarkResults.ptTime.toFixed(2) }} ms</span>
          </div>
        </div>

        <div class="bg-slate-900/40 backdrop-blur-md border border-white/[0.08] rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <span class="text-[10px] font-extrabold text-slate-400 tracking-widest uppercase block mb-1">Full Flow Speedup</span>
            <h3 class="text-3xl font-bold text-slate-200">
              {{ benchmarkResults.fullSpeedup }}x Nhanh hơn
            </h3>
            <p class="text-slate-400 text-[11px] leading-relaxed mt-2">
              Ngay cả khi bao gồm cả công đoạn phân tách và đo ký tự bằng Canvas (Prepare + Layout), Pretext vẫn vượt trội hoàn toàn so với việc ghi/đọc DOM.
            </p>
          </div>
          <div class="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px]">
            <span class="text-slate-500">Pretext Full Flow:</span>
            <span class="font-mono text-violet-400 font-bold">{{ benchmarkResults.ptFullTime.toFixed(2) }} ms</span>
          </div>
        </div>

        <div class="bg-slate-900/40 backdrop-blur-md border border-white/[0.08] rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <span class="text-[10px] font-extrabold text-rose-400 tracking-widest uppercase block mb-1">DOM Reflow Bottleneck</span>
            <h3 class="text-3xl font-bold text-rose-400">
              {{ benchmarkResults.domTime.toFixed(2) }} ms
            </h3>
            <p class="text-slate-400 text-[11px] leading-relaxed mt-2">
              Thời gian thực thi của DOM-based. Mỗi lượt đo bắt buộc phải đưa thẻ div ẩn vào body, đọc `.offsetHeight` để trình duyệt tính lại bố cục (Reflow/Layout Thrashing).
            </p>
          </div>
          <div class="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px]">
            <span class="text-slate-500">Tổng số lượt đo:</span>
            <span class="font-mono text-slate-300 font-bold">{{ benchmarkResults.iterations.toLocaleString() }} lượt</span>
          </div>
        </div>
      </div>

      <!-- Playground and Realtime Sandbox -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <!-- Panel 1: Playground Control -->
        <div class="flex flex-col gap-6 bg-slate-900/40 backdrop-blur-md border border-white/[0.08] p-6 rounded-2xl">
          <h3 class="text-sm font-bold text-slate-200 uppercase tracking-wider border-b border-white/5 pb-2">
            🛠️ Hộp cát tùy chỉnh (Real-time Playground)
          </h3>
          
          <div class="flex flex-col gap-1.5">
            <label class="text-[11px] font-bold text-slate-400 uppercase">Văn bản kiểm nghiệm (JAV Title)</label>
            <textarea 
              v-model="pretextInputText" 
              rows="4" 
              class="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-slate-200 focus:border-violet-500 focus:outline-none leading-relaxed transition-all"
            />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-1.5">
              <label class="text-[11px] font-bold text-slate-400 uppercase">Chiều rộng khung (Width: {{ pretextWidth }}px)</label>
              <input 
                v-model.number="pretextWidth" 
                type="range" 
                min="150" 
                max="600" 
                step="10" 
                class="accent-violet-500"
              >
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-[11px] font-bold text-slate-400 uppercase">Chiều cao dòng (Line Height: {{ pretextLineHeight }}px)</label>
              <input 
                v-model.number="pretextLineHeight" 
                type="range" 
                min="16" 
                max="32" 
                step="1" 
                class="accent-violet-500"
              >
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-1.5">
              <label class="text-[11px] font-bold text-slate-400 uppercase">Font chữ định dạng</label>
              <select 
                v-model="pretextFont" 
                class="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-violet-500 focus:outline-none"
              >
                <option value="500 15px ui-sans-serif, system-ui, sans-serif">System Sans-Serif (Default)</option>
                <option value="bold 16px Outfit, sans-serif">Outfit Bold (16px)</option>
                <option value="800 14px monospace">Monospace Heavy (14px)</option>
              </select>
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-[11px] font-bold text-slate-400 uppercase">Giới hạn dòng (max-lines: {{ pretextMaxLines || 'Không' }})</label>
              <select 
                v-model.number="pretextMaxLines" 
                class="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-violet-500 focus:outline-none"
              >
                <option :value="0">Không giới hạn</option>
                <option :value="1">1 dòng</option>
                <option :value="2">2 dòng</option>
                <option :value="3">3 dòng</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Panel 2: Live Preview and CLS Demonstration -->
        <div class="flex flex-col gap-6 bg-slate-900/40 backdrop-blur-md border border-white/[0.08] p-6 rounded-2xl justify-between">
          <div>
            <h3 class="text-sm font-bold text-slate-200 uppercase tracking-wider border-b border-white/5 pb-2 mb-4">
              👀 Kết quả đo đạc & Vẽ giao diện thời gian thực
            </h3>
            
            <div class="p-4 bg-black/30 rounded-xl border border-white/5 flex flex-col gap-4">
              <div>
                <span class="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Canvas / Pretext Calculated Height:</span>
                <span class="text-2xl font-black text-violet-400 font-mono">
                  {{ calculateTextGeometry(pretextInputText, pretextFont, pretextWidth, pretextLineHeight).height }} px
                </span>
                <span class="text-xs text-slate-400 ml-2">
                  (Dòng: {{ calculateTextGeometry(pretextInputText, pretextFont, pretextWidth, pretextLineHeight).lineCount }})
                </span>
              </div>

              <div>
                <span class="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-2">Live Element Rendered via &lt;PretextText&gt;:</span>
                
                <div class="p-3 bg-slate-950/60 rounded-lg border border-violet-500/20 relative" :style="{ width: `${pretextWidth}px` }">
                  <!-- Width Indicator -->
                  <div class="absolute -top-2 left-0 right-0 border-t border-dashed border-violet-500/40 flex justify-center">
                    <span class="bg-slate-950 px-1 text-[9px] text-violet-400 font-mono leading-none">{{ pretextWidth }}px</span>
                  </div>
                  
                  <!-- Custom Pretext Component -->
                  <PretextText 
                    :text="pretextInputText" 
                    :font="pretextFont" 
                    :line-height="pretextLineHeight"
                    :max-lines="pretextMaxLines || undefined"
                  />
                </div>
              </div>
            </div>
          </div>

          <div class="p-4 bg-violet-950/20 border border-violet-500/20 rounded-xl">
            <h4 class="text-xs font-bold text-violet-300 flex items-center gap-1.5 mb-1.5">
              <span>💡 Cách hoạt động của giải pháp</span>
            </h4>
            <p class="text-[11px] text-slate-400 leading-relaxed">
              Component <code>&lt;PretextText&gt;</code> sử dụng <code>ResizeObserver</code> để theo dõi chiều rộng của khung hiển thị trên màn hình. Mỗi khi chiều rộng thay đổi, nó sẽ thực hiện tính toán chiều cao dòng cần thiết thông qua phép toán thuần số học dựa trên tập ký tự đã lưu trong Canvas. Kết quả chiều cao chính xác được gán trực tiếp vào CSS <code>height</code> giúp chống giật giao diện (Zero CLS) và loại bỏ hoàn toàn việc vẽ nháp lên DOM.
            </p>
          </div>
        </div>
      </div>

      <!-- Real JAV Cards Demonstration -->
      <div class="mt-8">
        <h3 class="text-sm font-bold text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-2">
          <i class="fa-solid fa-clapperboard text-violet-400"></i>
          <span>Demo Thẻ phim JAV thực tế áp dụng Pretext</span>
        </h3>
        <p class="text-xs text-slate-400 mb-4">
          Dưới đây là một số ví dụ thẻ phim hiển thị tiêu đề JAV cực dài. Chiều cao của các tiêu đề này được tính toán trước DOM-free bởi Pretext, đảm bảo các thẻ phim có cùng chiều cao hộp chứa tiêu đề và luôn đồng đều, hoàn hảo về mặt bố cục.
        </p>

        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div v-for="(title, idx) in sampleJavTitles.slice(0, 5)" :key="idx" class="bg-slate-900/50 border border-white/[0.06] rounded-2xl p-4 flex flex-col overflow-hidden shadow-lg hover:border-violet-500/20 transition-all duration-300">
            <!-- Mock Thumbnail -->
            <div class="aspect-video w-full rounded-xl bg-slate-950/80 mb-3 flex items-center justify-center border border-white/5 relative overflow-hidden">
              <div class="absolute inset-0 bg-gradient-to-t from-violet-500/10 to-transparent"/>
              <i class="fa-solid fa-clapperboard text-violet-400 text-lg"></i>
              <span class="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/60 font-mono text-[9px] text-violet-400 font-extrabold uppercase border border-violet-500/20">
                {{ title.match(/\[(.*?)\]/)?.[1] || 'JAV' }}
              </span>
            </div>
            
            <!-- Pretext JAV Title Card (2 lines clamp) -->
            <div class="mb-2">
              <span class="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-1">JAV Movie Title</span>
              <PretextText 
                :text="title" 
                font="bold 12px ui-sans-serif, system-ui, sans-serif"
                :line-height="16"
                :max-lines="2"
                class="text-slate-200 text-xs font-bold leading-tight"
              />
            </div>

            <!-- Footer Details -->
            <div class="mt-auto pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500">
              <span class="flex items-center gap-1"><i class="fa-regular fa-clock text-slate-500"></i> 120m</span>
              <span class="flex items-center gap-1"><i class="fa-solid fa-star text-amber-400"></i> 5.0</span>
            </div>
          </div>
        </div>
      </div>

    </div>



    

    <!-- Floating Cyberpunk PWA Button -->
    <button 
      v-if="isMobile && !isStandalone" 
      class="pwa-floating-btn" 
      title="Tải ứng dụng AVsub PRO"
      @click="handleInstallClick"
    >
      <span class="pulse-ring"/>
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="dl-icon"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
      <span>Tải App</span>
    </button>

    <!-- Beautiful iOS PWA Guide Modal -->
    <Transition name="fade">
      <div v-if="showInstallGuide" class="pwa-modal-overlay" @click.self="showInstallGuide = false">
        <div class="pwa-modal-content">
          <button class="pwa-close-btn" @click="showInstallGuide = false">&times;</button>
          
          <div class="pwa-modal-header">
            <img src="/icon.png" alt="AVsub PRO Icon" class="pwa-modal-app-icon" >
            <h2>Cài đặt AVsub PRO</h2>
            <p>Thêm ứng dụng vào màn hình chính của iPhone để truy cập nhanh chóng và tiện lợi hơn.</p>
          </div>
          
          <div class="pwa-steps-list">
            <!-- Step 1 -->
            <div class="pwa-step-item">
              <div class="step-number">1</div>
              <div class="step-detail">
                <p>Nhấp vào biểu tượng <strong>Chia sẻ (Share)</strong> ở thanh công cụ phía dưới của Safari.</p>
                <div class="step-icon-visual">
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#007aff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ios-icon"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                  <span class="ios-action-label">Nút chia sẻ ở dưới màn hình</span>
                </div>
              </div>
            </div>
            
            <!-- Step 2 -->
            <div class="pwa-step-item">
              <div class="step-number">2</div>
              <div class="step-detail">
                <p>Cuộn xuống dưới danh mục và chọn <strong>Thêm vào MH chính (Add to Home Screen)</strong>.</p>
                <div class="step-icon-visual">
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ios-icon"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                  <span class="ios-action-label">Thêm vào MH chính</span>
                </div>
              </div>
            </div>
            
            <!-- Step 3 -->
            <div class="pwa-step-item">
              <div class="step-number">3</div>
              <div class="step-detail">
                <p>Bấm chọn nút <strong>Thêm (Add)</strong> ở góc trên bên phải màn hình để xác nhận cài đặt.</p>
                <div class="step-icon-visual font-bold">
                  <span class="ios-add-btn-mock">Thêm</span>
                </div>
              </div>
            </div>
          </div>
          
          <button class="pwa-understand-btn" @click="showInstallGuide = false">Đã hiểu</button>
        </div>
      </div>
    </Transition>

    <!-- Gorgeous Cyberpunk Bottom Tab Bar (Footbar) for Mobile/PWA -->
    <div v-if="isMobile && !showVideoPlayer" class="mobile-footbar">
      <button 
        class="footbar-item" 
        :class="{ active: activeTab === 'search' && !showVideoPlayer && !showActressModal }"
        @click="handleTabChange('search')"
      >
        <span class="footbar-icon"><i class="fa-solid fa-magnifying-glass"></i></span>
        <span class="footbar-label">Tìm Kiếm</span>
      </button>
      <button 
        class="footbar-item" 
        :class="{ active: activeTab === 'watcher' }"
        @click="handleTabChange('watcher')"
      >
        <span class="footbar-icon"><i class="fa-solid fa-robot"></i></span>
        <span class="footbar-label">Giám Sát</span>
      </button>
      <button 
        class="footbar-item" 
        :class="{ active: activeTab === 'library' || activeTab === 'actress-detail' }"
        @click="handleTabChange('library')"
      >
        <span class="footbar-icon"><i class="fa-solid fa-film"></i></span>
        <span class="footbar-label">Thư Viện</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.page-container {
  min-height: 100vh;
  padding: 2rem 1.5rem;
  max-width: 1400px;
  margin: 0 auto;
}

.header {
  text-align: center;
  margin-bottom: 2rem;
}

.header h1 {
  font-size: 3.2rem;
  font-weight: 850;
  margin: 0;
  background: linear-gradient(135deg, #00dc82 0%, #a78bfa 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  letter-spacing: -0.02em;
}

.badge {
  font-size: 0.8rem;
  padding: 0.2rem 0.6rem;
  border-radius: 6px;
  vertical-align: middle;
  transition: all 0.3s ease;
  font-weight: 800;
  letter-spacing: 0.05em;
  background: #00dc82;
  color: #001e26;
  -webkit-text-fill-color: #001e26;
  box-shadow: 0 0 15px rgba(0, 220, 130, 0.4);
}

.tagline {
  color: var(--text-muted);
  margin-top: 0.5rem;
  font-size: 1.05rem;
}



/* Results Structure */
.unified-results {
  display: flex;
  flex-direction: column;
  gap: 3rem;
  margin-top: 2rem;
}

.results-section {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.section-divider {
  height: 1px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.08) 50%, rgba(255, 255, 255, 0) 100%);
  margin: 1rem 0;
}

/* Results Grid */
.results-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(295px, 1fr));
  gap: 2rem;
}

.results-grid.nyaa {
  grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
}

/* Bulk Header */
.bulk-action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  flex-wrap: wrap;
  gap: 1rem;
}

.results-title {
  font-size: 1.35rem;
  font-weight: 700;
  color: #f1f5f9;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.results-title::before {
  content: '';
  display: inline-block;
  width: 4px;
  height: 18px;
  background: #00dc82;
  border-radius: 2px;
}

.results-title.subtitles::before {
  background: #a78bfa;
}

.copy-all-btn {
  background: rgba(139, 92, 246, 0.1);
  border: 1px solid rgba(139, 92, 246, 0.25);
  color: #c084fc;
  padding: 0.5rem 1.25rem;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s ease;
}

.copy-all-btn:hover {
  background: #8b5cf6;
  color: white;
  box-shadow: 0 0 12px rgba(139, 92, 246, 0.35);
  border-color: #8b5cf6;
}

.copy-all-btn.success {
  background: #10b981;
  border-color: #10b981;
  color: white;
  box-shadow: 0 0 12px rgba(16, 185, 129, 0.35);
}

.btn-flex {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

/* Empty State / Box */
.no-results-box {
  background: rgba(255, 255, 255, 0.02);
  border: 1px dashed rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 3rem 2rem;
  text-align: center;
  color: rgba(255, 255, 255, 0.4);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
}

.empty-icon {
  opacity: 0.5;
  color: #8b5cf6;
}

.no-results-box.JAV-subs .empty-icon {
  color: #a78bfa;
}

/* Spinner and Status Messages */
.status-message {
  text-align: center;
  padding: 5rem 2rem;
  color: rgba(255, 255, 255, 0.5);
}

.status-message.error {
  color: #ff7675;
  background: rgba(239, 68, 68, 0.04);
  border: 1px dashed rgba(239, 68, 68, 0.15);
  border-radius: 12px;
  max-width: 600px;
  margin: 3rem auto;
  padding: 2rem;
}

.spinner {
  width: 42px;
  height: 42px;
  border: 4px solid rgba(255, 255, 255, 0.05);
  border-radius: 50%;
  margin: 0 auto 1.25rem;
  animation: spin 1s linear infinite;
  border-left-color: #00dc82;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 600px) {
  .page-container {
    padding: 1.5rem 1rem calc(80px + env(safe-area-inset-bottom, 0px));
  }
  .header h1 {
    font-size: 2.2rem;
  }
  .tagline {
    font-size: 0.9rem;
    margin-top: 0.35rem;
    padding: 0 0.5rem;
  }
  .bulk-action-bar {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
  }
  .copy-all-btn {
    width: 100%;
    justify-content: center;
  }
  .results-grid {
    gap: 1.25rem;
  }
  .unified-results {
    gap: 2rem;
  }
}

/* Floating Cyberpunk PWA Button styling */
.pwa-floating-btn {
  position: fixed;
  bottom: calc(20px + env(safe-area-inset-bottom, 0px));
  right: 20px;
  z-index: 999;
  background: linear-gradient(135deg, #00dc82 0%, #8b5cf6 100%);
  border: none;
  border-radius: 50px;
  color: #08070b;
  font-weight: 750;
  font-size: 0.85rem;
  padding: 0.65rem 1.1rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(0, 220, 130, 0.4), 0 0 10px rgba(139, 92, 246, 0.2);
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  outline: none;
  letter-spacing: 0.02em;
}

.pwa-floating-btn:hover {
  transform: translateY(-3px) scale(1.05);
  box-shadow: 0 8px 25px rgba(139, 92, 246, 0.5);
}

.pwa-floating-btn:active {
  transform: translateY(-1px) scale(0.98);
}

.dl-icon {
  animation: bounce 2s infinite;
}

@keyframes bounce {
  0%, 20%, 50%, 80%, 100% {
    transform: translateY(0);
  }
  40% {
    transform: translateY(-4px);
  }
  60% {
    transform: translateY(-2px);
  }
}

/* Pulsing Outer Ring */
.pulse-ring {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 50px;
  border: 2px solid #00dc82;
  box-sizing: border-box;
  animation: pulse-animation 2s infinite;
  pointer-events: none;
}

@keyframes pulse-animation {
  0% {
    transform: scale(0.95);
    opacity: 0.8;
  }
  50% {
    opacity: 0.5;
  }
  100% {
    transform: scale(1.22);
    opacity: 0;
  }
}

/* iOS PWA Installation Guide Modal */
.pwa-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(8, 7, 11, 0.85);
  backdrop-filter: blur(10px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10000;
  padding: 1rem;
}

.pwa-modal-content {
  background: #0f0d1a;
  border: 1px solid rgba(139, 92, 246, 0.25);
  border-radius: 20px;
  width: 100%;
  max-width: 420px;
  padding: 2rem 1.25rem;
  position: relative;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.6);
  animation: slideUp 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.pwa-close-btn {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  font-size: 1.8rem;
  cursor: pointer;
  transition: color 0.2s;
  padding: 0;
  line-height: 1;
}

.pwa-close-btn:hover {
  color: #ff7675;
}

.pwa-modal-header {
  text-align: center;
  margin-bottom: 1.5rem;
}

.pwa-modal-app-icon {
  width: 68px;
  height: 68px;
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), 0 0 15px rgba(0, 220, 130, 0.25);
  margin-bottom: 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.pwa-modal-header h2 {
  font-size: 1.4rem;
  font-weight: 800;
  margin: 0 0 0.5rem 0;
  background: linear-gradient(135deg, #00dc82 0%, #a78bfa 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.pwa-modal-header p {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.6);
  margin: 0;
  line-height: 1.45;
}

.pwa-steps-list {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  width: 100%;
  margin-bottom: 1.5rem;
}

.pwa-step-item {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
}

.step-number {
  background: linear-gradient(135deg, #00dc82 0%, #8b5cf6 100%);
  color: #08070b;
  font-weight: 800;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  flex-shrink: 0;
  margin-top: 2px;
}

.step-detail {
  flex: 1;
}

.step-detail p {
  margin: 0 0 0.4rem 0;
  font-size: 0.88rem;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.4;
}

.step-icon-visual {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 0.5rem 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.ios-icon {
  flex-shrink: 0;
}

.ios-icon.stroke-white {
  stroke: #ffffff;
}

.ios-action-label {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
}

.ios-add-btn-mock {
  color: #007aff;
  font-size: 0.8rem;
  font-weight: 700;
  background: rgba(0, 122, 255, 0.1);
  padding: 0.25rem 0.75rem;
  border-radius: 6px;
}

.pwa-understand-btn {
  background: #00dc82;
  color: #001e26;
  border: none;
  padding: 0.7rem 2rem;
  border-radius: 50px;
  font-weight: 750;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 15px rgba(0, 220, 130, 0.3);
  width: 100%;
  text-align: center;
}

.pwa-understand-btn:hover {
  opacity: 0.95;
  box-shadow: 0 6px 20px rgba(0, 220, 130, 0.4);
}

/* ========================================== */
/* 🤖 CYBERPUNK DAEMON & TASK STYLES          */
/* ========================================== */

.tab-navigation {
  display: flex;
  justify-content: center;
  gap: 1.5rem;
  margin-bottom: 2.5rem;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 1rem;
}

.tab-btn {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  padding: 0.65rem 1.75rem;
  border-radius: 50px;
  font-size: 0.95rem;
  font-weight: 650;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  font-family: 'Outfit', sans-serif;
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
}

.tab-btn:hover {
  border-color: var(--card-hover-border);
  color: var(--text-color);
  background: var(--card-hover-bg);
}

.tab-btn.active {
  background: linear-gradient(135deg, rgba(0, 220, 130, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%);
  border: 1.5px solid #00dc82;
  color: #00dc82;
  box-shadow: 0 0 15px rgba(0, 220, 130, 0.2), inset 0 0 10px rgba(0, 220, 130, 0.05);
  text-shadow: 0 0 8px rgba(0, 220, 130, 0.3);
}



.tab-btn.active .tab-icon {
  animation: pulse-glow 2s infinite;
}

@keyframes pulse-glow {
  0%, 100% { transform: scale(1); filter: drop-shadow(0 0 2px rgba(0, 220, 130, 0.5)); }
  50% { transform: scale(1.1); filter: drop-shadow(0 0 6px rgba(0, 220, 130, 0.9)); }
}

.watcher-tab-container {
  display: flex;
  flex-direction: column;
  gap: 2.5rem;
  animation: fadeIn 0.35s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Stats Cards Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.5rem;
}

.stat-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  padding: 1.5rem;
  display: flex;
  align-items: center;
  gap: 1.25rem;
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.2);
  transition: all 0.25s;
}

.stat-card:hover {
  transform: translateY(-2px);
  border-color: rgba(0, 220, 130, 0.2);
  background: rgba(255, 255, 255, 0.04);
}

.stat-icon {
  font-size: 2.2rem;
  background: rgba(255, 255, 255, 0.04);
  width: 55px;
  height: 55px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.stat-content {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  overflow: hidden;
}

.stat-label {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.stat-value {
  font-size: 1.15rem;
  font-weight: 700;
  color: white;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.path-text {
  font-family: monospace;
  font-size: 0.9rem;
}

.stats-sub-text {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.75);
}

.stat-value-flex {
  display: flex;
  align-items: center;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 750;
  font-size: 1.05rem;
  font-family: 'Outfit', sans-serif;
}

.status-indicator.active {
  color: #00dc82;
}

.status-indicator.inactive {
  color: rgba(255, 255, 255, 0.4);
}

.pulse-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #00dc82;
  box-shadow: 0 0 10px #00dc82;
  animation: breathing 1.8s infinite;
}

.static-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
}

@keyframes breathing {
  0%, 100% { opacity: 0.4; box-shadow: 0 0 2px #00dc82; }
  50% { opacity: 1; box-shadow: 0 0 12px #00dc82; }
}

/* Actions Bar styling */
.watcher-actions-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 14px;
  padding: 1rem 1.5rem;
  flex-wrap: wrap;
  gap: 1.5rem;
}

.watcher-action-buttons {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.watcher-action-btn {
  padding: 0.65rem 1.5rem;
  border-radius: 8px;
  font-weight: 650;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.watcher-action-btn.scan-btn {
  background: #00dc82;
  color: #001e26;
  border: none;
  box-shadow: 0 0 15px rgba(0, 220, 130, 0.15);
}

.watcher-action-btn.scan-btn:hover:not(:disabled) {
  opacity: 0.92;
  box-shadow: 0 0 20px rgba(0, 220, 130, 0.35);
  transform: translateY(-1px);
}

.watcher-action-btn.scan-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.watcher-action-btn.clear-btn {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ff7675;
}

.watcher-action-btn.clear-btn:hover {
  background: #ef4444;
  color: white;
  border-color: #ef4444;
  box-shadow: 0 0 12px rgba(239, 68, 68, 0.3);
}

.btn-flex-center {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.scan-alert {
  background: rgba(139, 92, 246, 0.1);
  border: 1px solid rgba(139, 92, 246, 0.25);
  color: #c084fc;
  border-radius: 8px;
  padding: 0.5rem 1.25rem;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  animation: glow-alert 3s infinite alternate;
}

@keyframes glow-alert {
  from { box-shadow: 0 0 2px rgba(139, 92, 246, 0.1); }
  to { box-shadow: 0 0 10px rgba(139, 92, 246, 0.3); }
}

.spinner-mini {
  width: 14px;
  height: 14px;
  border: 2.5px solid rgba(255, 255, 255, 0.15);
  border-radius: 50%;
  animation: spin-watcher 1s linear infinite;
  border-left-color: #001e26;
  margin-right: 0.4rem;
}

@keyframes spin-watcher {
  to { transform: rotate(360deg); }
}

/* Log Terminal Bảng */
.task-log-section {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.log-terminal-container {
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  padding: 1.5rem;
  min-height: 250px;
  max-height: 600px;
  overflow-y: auto;
  box-shadow: inset 0 4px 30px rgba(0, 0, 0, 0.5);
}

.no-logs-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  text-align: center;
  color: rgba(255, 255, 255, 0.3);
  gap: 1rem;
}

.empty-text {
  font-size: 0.88rem;
  max-width: 500px;
  line-height: 1.45;
}

.log-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.log-item-card {
  background: rgba(255, 255, 255, 0.02);
  border-left: 4px solid rgba(255, 255, 255, 0.15);
  border-radius: 0 12px 12px 0;
  padding: 1rem;
  transition: all 0.2s;
  border-top: 1px solid rgba(255, 255, 255, 0.02);
  border-right: 1px solid rgba(255, 255, 255, 0.02);
  border-bottom: 1px solid rgba(255, 255, 255, 0.02);
  text-align: left;
}

.log-item-card:hover {
  background: rgba(255, 255, 255, 0.035);
}

.log-item-card.completed {
  border-left-color: #00dc82;
  box-shadow: inset 5px 0 20px rgba(0, 220, 130, 0.02);
}

.log-item-card.failed {
  border-left-color: #ff7675;
  box-shadow: inset 5px 0 20px rgba(255, 118, 117, 0.02);
}

.log-item-card.running {
  border-left-color: #f1c40f;
  animation: border-breathing 1.5s infinite alternate;
  box-shadow: inset 5px 0 20px rgba(241, 196, 15, 0.03);
}

@keyframes border-breathing {
  from { border-left-color: #f1c40f; }
  to { border-left-color: rgba(241, 196, 15, 0.4); }
}

.log-meta-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.65rem;
  flex-wrap: wrap;
}

.log-status-badge {
  font-size: 0.72rem;
  font-weight: 850;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  letter-spacing: 0.05em;
}

.log-status-badge.completed {
  background: rgba(0, 220, 130, 0.15);
  color: #00dc82;
}

.log-status-badge.failed {
  background: rgba(239, 68, 68, 0.15);
  color: #ff7675;
}

.log-status-badge.running {
  background: rgba(241, 196, 15, 0.15);
  color: #f1c40f;
}

.log-type-badge {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.72rem;
  font-weight: 750;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  letter-spacing: 0.03em;
}

.log-timestamp {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.35);
  margin-left: auto;
}

.log-body-content {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.log-movie-title {
  font-size: 0.88rem;
  color: rgba(255, 255, 255, 0.7);
}

.glow-code {
  color: #a78bfa;
  text-shadow: 0 0 5px rgba(167, 139, 250, 0.3);
}

.log-status-message {
  font-size: 0.95rem;
  color: white;
  font-weight: 500;
  line-height: 1.4;
}

.log-file-path {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.4);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.log-file-path code {
  font-family: monospace;
  background: rgba(0, 0, 0, 0.3);
  padding: 0.1rem 0.3rem;
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.6);
}

.log-error-detail {
  font-size: 0.8rem;
  color: #ff7675;
  background: rgba(239, 68, 68, 0.03);
  border: 1px dashed rgba(239, 68, 68, 0.15);
  border-radius: 6px;
  padding: 0.5rem;
  margin-top: 0.25rem;
}

.log-error-detail code {
  font-family: monospace;
}

@media (max-width: 768px) {
  .tab-navigation {
    display: none !important;
  }
  .tab-btn {
    padding: 0.5rem 1.1rem;
    font-size: 0.85rem;
  }
  .stats-grid {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
  .watcher-actions-bar {
    flex-direction: column;
    align-items: stretch;
    padding: 1rem;
  }
  .watcher-action-buttons {
    flex-direction: column;
    gap: 0.75rem;
  }
  .watcher-action-btn {
    width: 100%;
  }
  .log-timestamp {
    width: 100%;
    margin-left: 0;
    margin-top: 0.25rem;
  }
}

/* ========================================== */
/* 🎭 CYBERPUNK LIBRARY PORTAL STYLES         */
/* ========================================== */

.library-tab-container {
  display: flex;
  flex-direction: column;
  gap: 2.5rem;
  animation: fadeIn 0.35s ease-out;
}

.library-filter-panel {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  padding: 1.25rem;
  backdrop-filter: blur(10px);
}

.filter-row {
  display: flex;
  gap: 1rem;
  align-items: center;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  flex-direction: column;
}

.filter-group.flex-1 {
  flex: 1;
  min-width: 250px;
}

.filter-input, .filter-select {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 0.6rem 1rem;
  color: white;
  font-size: 0.88rem;
  outline: none;
  transition: all 0.2s;
  font-family: 'Inter', sans-serif;
  height: 40px;
}

.filter-select {
  min-width: 170px;
  cursor: pointer;
}

.filter-input:focus, .filter-select:focus {
  border-color: #00dc82;
  box-shadow: 0 0 10px rgba(0, 220, 130, 0.15);
}

.reset-filter-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
  padding: 0.6rem 1.25rem;
  border-radius: 8px;
  font-weight: 650;
  font-size: 0.88rem;
  cursor: pointer;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.reset-filter-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border-color: rgba(255, 255, 255, 0.25);
}

/* Movies Grid Layout */
.library-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 2rem;
}

.movie-plex-card {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  display: flex;
  flex-direction: column;
  position: relative;
}

.movie-plex-card:hover {
  transform: translateY(-5px);
  border-color: rgba(139, 92, 246, 0.25);
  box-shadow: 0 15px 35px rgba(139, 92, 246, 0.2), 0 0 15px rgba(0, 220, 130, 0.05);
}

.movie-poster-container {
  aspect-ratio: 3/2; /* Landscape ratio matches standard JAV cover perfectly to avoid cropping */
  width: 100%;
  position: relative;
  background: #0d0c15;
  overflow: hidden;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.movie-poster-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s;
}

.movie-plex-card:hover .movie-poster-img {
  transform: scale(1.05);
}

.movie-poster-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #100e1f 0%, #1c1836 100%);
  color: rgba(255, 255, 255, 0.25);
  font-family: 'Outfit', sans-serif;
  font-weight: 800;
  font-size: 1.5rem;
  letter-spacing: 0.05em;
  text-align: center;
  padding: 1rem;
}

/* Floating Sub Badge */
.floating-sub-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 10;
  background: rgba(239, 68, 68, 0.85);
  border: 1px solid rgba(239, 68, 68, 0.2);
  color: white;
  border-radius: 4px;
  padding: 0.25rem 0.5rem;
  font-size: 0.68rem;
  font-weight: 850;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(5px);
  letter-spacing: 0.05em;
}

.floating-sub-badge.has-sub {
  background: rgba(16, 185, 129, 0.85);
  border-color: rgba(16, 185, 129, 0.2);
}

.floating-sub-badge.has-video {
  background: rgba(139, 92, 246, 0.85) !important;
  border-color: rgba(139, 92, 246, 0.2) !important;
}

.sub-badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ff7675;
  box-shadow: 0 0 6px #ff7675;
}

.floating-sub-badge.has-sub .sub-badge-dot {
  background: #00dc82;
  box-shadow: 0 0 6px #00dc82;
  animation: breathing 1.8s infinite;
}

.floating-sub-badge.has-video .sub-badge-dot {
  background: #a78bfa !important;
  box-shadow: 0 0 6px #a78bfa !important;
  animation: breathing 1.8s infinite;
}

/* Poster Hover actions overlay */
.poster-hover-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(8, 7, 11, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.25s ease;
  z-index: 5;
  padding: 1rem;
}

.movie-plex-card:hover .poster-hover-overlay {
  opacity: 1;
}

.quick-dl-sub-btn {
  background: #00dc82;
  color: #001e26;
  border: none;
  padding: 0.55rem 1rem;
  border-radius: 6px;
  font-weight: 750;
  font-size: 0.8rem;
  cursor: pointer;
  box-shadow: 0 4px 15px rgba(0, 220, 130, 0.4);
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.quick-dl-sub-btn:hover {
  transform: translateY(-1px);
  opacity: 0.95;
  box-shadow: 0 6px 20px rgba(0, 220, 130, 0.6);
}

.sub-downloaded-check {
  color: #00dc82;
  font-weight: 700;
  font-size: 0.82rem;
  text-shadow: 0 0 10px rgba(0, 220, 130, 0.4);
}

/* Card details styling */
.movie-card-info {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1;
  text-align: left;
}

.movie-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: 'Outfit', sans-serif;
}

.movie-card-code {
  font-weight: 800;
  color: #a78bfa;
  font-size: 0.95rem;
  letter-spacing: 0.02em;
}

.movie-card-year {
  color: rgba(255, 255, 255, 0.35);
  font-size: 0.8rem;
}

.movie-card-title {
  color: white;
  font-size: 0.88rem;
  font-weight: 600;
  margin: 0;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  height: 2.9rem;
}

.movie-card-actresses {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: auto;
}

.actress-link-tag {
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 0.7rem;
  font-weight: 650;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.actress-link-tag:hover {
  background: rgba(0, 220, 130, 0.1);
  color: #00dc82;
  border-color: rgba(0, 220, 130, 0.2);
}

/* Pagination bar */
.library-pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 2rem;
  margin-top: 3rem;
  padding-top: 1.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  flex-wrap: wrap;
}

.pagination-btn {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: white;
  padding: 0.5rem 1.25rem;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}

.pagination-btn:hover:not(:disabled) {
  background: rgba(0, 220, 130, 0.15);
  border-color: #00dc82;
  color: #00dc82;
}

.pagination-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pagination-indicator {
  font-size: 0.88rem;
  color: rgba(255, 255, 255, 0.55);
}

.pagination-indicator strong {
  color: #00dc82;
}



/* ========================================== */
/* 📱 MEDIA QUERIES & RESPONSIVENESS          */
/* ========================================== */

@media (max-width: 1024px) {
  .page-container {
    padding-bottom: calc(95px + env(safe-area-inset-bottom, 0px)) !important;
  }
  .pwa-floating-btn {
    bottom: calc(95px + env(safe-area-inset-bottom, 0px)) !important;
  }
}

@media (max-width: 768px) {
  .tab-navigation {
    display: none !important;
  }
  .tab-btn {
    padding: 0.5rem 1.1rem;
    font-size: 0.85rem;
  }
  .stats-grid {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
  .watcher-actions-bar {
    flex-direction: column;
    align-items: stretch;
    padding: 1rem;
  }
  .watcher-action-buttons {
    flex-direction: column;
    gap: 0.75rem;
  }
  .watcher-action-btn {
    width: 100%;
  }
  .log-timestamp {
    width: 100%;
    margin-left: 0;
    margin-top: 0.25rem;
  }
  
  /* Library adaptive */
  .library-filter-panel {
    padding: 0.75rem;
  }
  .filter-row {
    flex-direction: column;
    align-items: stretch;
    gap: 0.75rem;
  }
  .filter-group.flex-1 {
    min-width: 100%;
  }
  .filter-select, .reset-filter-btn {
    width: 100%;
  }
  .library-grid {
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 1.5rem;
  }
  .movie-card-info {
    padding: 0.75rem 1rem;
    gap: 0.5rem;
  }
  .movie-card-code {
    font-size: 1rem;
    font-weight: 800;
  }
  .movie-card-title {
    font-size: 0.82rem;
    line-height: 1.4;
    height: auto;
    max-height: 2.4rem;
    -webkit-line-clamp: 2;
  }
  .actress-link-tag {
    font-size: 0.7rem;
    padding: 0.2rem 0.5rem;
    border-radius: 6px;
    font-weight: 700;
  }
  .movie-plex-card {
    border-radius: 20px;
    box-shadow: 0 12px 35px rgba(0, 0, 0, 0.4);
  }
  .movie-poster-container {
    aspect-ratio: 3/2;
    border-radius: 20px 20px 0 0;
  }
  .floating-sub-badge {
    padding: 0.3rem 0.6rem;
    font-size: 0.7rem;
    font-weight: 800;
    border-radius: 8px;
  }

  /* 📱 Dedicated mobile styling override */
  @media (max-width: 599px) {
    .library-grid {
      grid-template-columns: repeat(2, 1fr) !important;
      gap: 1rem !important;
    }
    .movie-card-info {
      padding: 0.5rem 0.75rem !important;
      gap: 0.35rem !important;
    }
    .movie-card-code {
      font-size: 0.8rem !important;
    }
    .movie-card-title {
      font-size: 0.72rem !important;
      max-height: 2rem !important;
    }
    .movie-card-year {
      font-size: 0.7rem !important;
    }
    .actress-link-tag {
      font-size: 0.62rem !important;
      padding: 0.15rem 0.35rem !important;
      border-radius: 4px !important;
    }
  }


  .library-pagination {
    gap: 1rem;
    margin-top: 2rem;
  }
  .pagination-btn {
    width: 100%;
    order: 2;
  }
  .pagination-indicator {
    width: 100%;
    text-align: center;
    order: 1;
  }
  

}

/* Gorgeous Mobile/PWA Sticky Bottom Tab Bar (Footbar) */
.mobile-footbar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 9999;
  background: var(--card-bg);
  backdrop-filter: blur(25px);
  -webkit-backdrop-filter: blur(25px);
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding-top: 0.75rem;
  padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
  box-shadow: 0 -8px 30px var(--shadow-color), 0 -2px 10px var(--glow-color);
  transition: all 0.3s ease;
}

.footbar-item {
  background: none;
  border: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  color: var(--text-color);
  opacity: 0.5;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1);
  outline: none;
  flex: 1;
}

.footbar-icon {
  font-size: 1.35rem;
  transition: transform 0.2s ease;
}

.footbar-label {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.footbar-item:active .footbar-icon {
  transform: scale(0.85);
}

.footbar-item.active {
  color: #00dc82;
  opacity: 1;
  text-shadow: 0 0 10px rgba(0, 220, 130, 0.2);
}

.footbar-item.active .footbar-icon {
  transform: scale(1.05);
}

/* Custom Native Subtitle VTT Cue Styling */
::cue {
  background: rgba(8, 7, 11, 0.85) !important;
  color: #ffffff !important;
  font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
  font-weight: 700 !important;
  text-shadow: 0 0 5px rgba(0, 0, 0, 0.95), 0 0 10px rgba(0, 0, 0, 0.8) !important;
  border-radius: 6px !important;
  padding: 2px 8px !important;
}

.subtitle-small::cue {
  font-size: 14px !important;
}

.subtitle-medium::cue {
  font-size: 19px !important;
}

.subtitle-large::cue {
  font-size: 25px !important;
}

/* Custom transitions and styling for our premium player controls */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Seek Bar Range Input Styling Override */
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #7c3aed;
  cursor: pointer;
  box-shadow: 0 0 10px rgba(124, 58, 237, 0.8);
  transition: transform 0.15s ease;
}

input[type="range"]::-webkit-slider-thumb:hover {
  transform: scale(1.3);
  background: #a78bfa;
}

/* Premium Glassmorphic Filters & Layout upgrades */
.library-filter-panel {
  background: rgba(15, 13, 26, 0.45) !important;
  backdrop-filter: blur(20px) !important;
  -webkit-backdrop-filter: blur(20px) !important;
  border: 1px solid rgba(255, 255, 255, 0.06) !important;
  border-radius: 20px !important;
  padding: 1.25rem !important;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.35) !important;
  margin-bottom: 2rem !important;
}

.filter-input.search {
  background: rgba(255, 255, 255, 0.04) !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  border-radius: 12px !important;
  padding: 0.65rem 1.25rem !important;
  color: #fff !important;
  font-weight: 500 !important;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1) !important;
}

.filter-input.search:focus {
  background: rgba(124, 58, 237, 0.05) !important;
  border-color: rgba(124, 58, 237, 0.4) !important;
  box-shadow: 0 0 20px rgba(124, 58, 237, 0.15) !important;
  outline: none !important;
}

.filter-select {
  background: rgba(255, 255, 255, 0.04) !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  color: #e2e8f0 !important;
  font-weight: 600 !important;
  border-radius: 12px !important;
  padding: 0.65rem 1rem !important;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1) !important;
  cursor: pointer !important;
}

.filter-select:focus {
  border-color: rgba(124, 58, 237, 0.4) !important;
  background: rgba(15, 13, 26, 0.9) !important;
  box-shadow: 0 0 20px rgba(124, 58, 237, 0.15) !important;
  outline: none !important;
}

/* Premium Movie Plex Card hover upgrades */
.movie-plex-card {
  border: 1px solid var(--border-color) !important;
  background: var(--card-bg) !important;
  border-radius: 18px !important;
  overflow: hidden !important;
  transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1) !important;
  box-shadow: 0 4px 20px var(--shadow-color) !important;
}

.movie-plex-card:hover {
  transform: translateY(-8px) scale(1.02) !important;
  border-color: var(--card-hover-border) !important;
  background: var(--card-hover-bg) !important;
  box-shadow: 0 20px 40px var(--shadow-color), 0 0 30px var(--glow-color) !important;
}

.movie-poster-container {
  border-radius: 14px !important;
  margin: 6px !important;
  overflow: hidden !important;
}

.movie-card-info {
  padding: 0.75rem 1rem !important;
}

.movie-card-title {
  font-size: 0.8rem !important;
  font-weight: 700 !important;
  line-height: 1.4 !important;
  color: var(--text-color) !important;
  transition: color 0.2s ease !important;
  line-clamp: 2 !important;
}

.movie-plex-card:hover .movie-card-title {
  color: #a78bfa !important;
}

.actress-link-tag {
  color: var(--actress-text) !important;
  background: var(--actress-bg) !important;
  border: 1px solid var(--actress-border) !important;
  border-radius: 6px !important;
  padding: 0.15rem 0.45rem !important;
  font-size: 0.65rem !important;
  font-weight: 700 !important;
  transition: all 0.2s ease !important;
}

.actress-link-tag:hover {
  color: #fff !important;
  background: rgba(124, 58, 237, 0.2) !important;
  border-color: rgba(124, 58, 237, 0.4) !important;
  box-shadow: 0 0 10px rgba(124, 58, 237, 0.2) !important;
}

</style>

