<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useDashboardState } from '~/composables/useDashboardState'
import type { SearchResult, TorrentResult } from '~/types'

const route = useRoute()
const state = useDashboardState()

// Extract required fields from state for direct binding in template
const {
  activeTab,
  currentKeyword,
  results,
  nyaaResults,
  loadingSubs,
  loadingTorrents,
  subsError,
  torrentsError,
  isAllCopied,
  copyAllMagnets,
  startPolling,
  stopPolling,
  fetchLibraryMovies,
  fetchFiltersData
} = state

// PWA & Mobile state
const isMobile = ref(false)
const isIOS = ref(false)
const isStandalone = ref(false)
const showInstallGuide = ref(false)
const deferredPrompt = ref<any>(null)

const detectPWAState = () => {
  if (!import.meta.client) return

  const userAgent = window.navigator.userAgent.toLowerCase()
  isIOS.value = /iphone|ipad|ipod/.test(userAgent)
  isMobile.value = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent)

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
    showInstallGuide.value = true
  }
}

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

const handleTabChange = (tab: 'search' | 'watcher' | 'library' | 'settings') => {
  activeTab.value = tab
  if (tab === 'watcher') {
    startPolling()
  } else {
    stopPolling()
  }

  if (tab === 'library') {
    fetchFiltersData()
    fetchLibraryMovies(1)
  }
}

onMounted(() => {
  detectPWAState()
  
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt.value = e
  })

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

  // Start polling initially if tab is watcher
  if (activeTab.value === 'watcher') {
    startPolling()
  }
})

onUnmounted(() => {
  stopPolling()
})
</script>

<template>
  <div class="page-container">
    <header class="header">
      <h1>AVsub <span class="badge">PRO</span></h1>
      <p class="tagline">Unified Anime/JAV Torrents & Movie Subtitles Search Portal</p>
    </header>



    <!-- TAB 1: SEARCH PORTAL -->
    <div v-if="activeTab === 'search'">
      <SearchForm :loading="loadingSubs || loadingTorrents" @search="handleSearch" />

      <main class="results-area">
        <div v-if="currentKeyword" class="unified-results">
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
    <div v-else-if="activeTab === 'watcher'">
      <DashboardWatcherDashboard />
      <DashboardActiveDownloads />
      <DashboardJunkCleaner />
    </div>

    <!-- TAB 3: PLEX-STYLE JAV MEDIA LIBRARY -->
    <div v-else-if="activeTab === 'library'">
      <DashboardLibraryGrid />
    </div>

    <!-- TAB 4: SUBTITLE & SYSTEM SETTINGS -->
    <div v-else-if="activeTab === 'settings'">
      <DashboardSettings />
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


  </div>
</template>

<style scoped lang="scss" src="~/assets/scss/dashboard.scss" />
