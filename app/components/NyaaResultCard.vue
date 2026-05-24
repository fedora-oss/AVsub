<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import type { TorrentResult } from '~/types'

const props = defineProps<{
  result: TorrentResult
}>()

const copied = ref(false)
const qbitStatus = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
const qbitError = ref('')

const coverImage = ref<string | null>(null)
const loadingCover = ref(true)

const dropdownRef = ref<HTMLElement | null>(null)
const showDropdown = ref(false)

const isWatching = ref(false)
const videoPlayerRef = ref<HTMLVideoElement | null>(null)

const isPiPSupported = computed(() => {
  if (typeof document === 'undefined' || typeof navigator === 'undefined') return false
  return !!(
    document.pictureInPictureEnabled ||
    /iphone|ipad|ipod|safari/i.test(navigator.userAgent)
  )
})

const togglePiP = () => {
  const video = videoPlayerRef.value
  if (!video) return

  try {
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture()
    } else if (video.requestPictureInPicture) {
      video.requestPictureInPicture()
    } else if (
      video.webkitSupportsPresentationMode &&
      typeof video.webkitSetPresentationMode === 'function'
    ) {
      const currentMode = video.webkitPresentationMode
      const targetMode = currentMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture'
      video.webkitSetPresentationMode(targetMode)
    } else {
      if (typeof (video as any).webkitEnterFullscreen === 'function') {
        (video as any).webkitEnterFullscreen()
      } else {
        alert('Trình duyệt của bạn không hỗ trợ Picture-in-Picture trên thiết bị này.')
      }
    }
  } catch (err) {
    console.error('Lỗi khi kích hoạt Picture-in-Picture:', err)
    try {
      if (video.webkitSetPresentationMode) {
        video.webkitSetPresentationMode('picture-in-picture')
      }
    } catch (e2) {
      console.error('Cố gắng kích hoạt WebKit PiP thất bại:', e2)
    }
  }
}

const watchMovie = () => {
  if (!props.result.magnet && !props.result.torrentUrl) return
  isWatching.value = true
}

const stopWatching = async () => {
  isWatching.value = false
  if (props.result.magnet) {
    try {
      await $fetch('/api/stream-stop', {
        method: 'POST',
        body: { magnet: props.result.magnet }
      })
    } catch (err) {
      console.warn('Failed to stop stream cleanly:', err)
    }
  }
}

// JAV Rich Metadata State
const metadata = ref<any>(null)

const copyMagnet = async () => {
  if (!props.result.magnet) return
  try {
    await navigator.clipboard.writeText(props.result.magnet)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (err) {
    console.error('Failed to copy magnet link:', err)
  }
}

const downloadViaQbit = async () => {
  if (!props.result.magnet) return
  qbitStatus.value = 'loading'
  qbitError.value = ''
  try {
    const response = await $fetch<{ success: boolean }>('/api/qbittorrent/download', {
      method: 'POST',
      body: { 
        magnet: props.result.magnet,
        code: props.result.code || metadata.value?.code || undefined
      }
    })
    if (response && response.success) {
      qbitStatus.value = 'success'
      setTimeout(() => {
        qbitStatus.value = 'idle'
      }, 3000)
    } else {
      qbitStatus.value = 'error'
      qbitError.value = 'Failed to add'
    }
  } catch (err: any) {
    qbitStatus.value = 'error'
    qbitError.value = err.data?.statusMessage || 'Failed to download'
    setTimeout(() => {
      qbitStatus.value = 'idle'
    }, 5000)
  }
}

const toggleDropdown = (e: Event) => {
  e.stopPropagation()
  showDropdown.value = !showDropdown.value
}

const closeDropdown = () => {
  showDropdown.value = false
}

onMounted(async () => {
  // Determine JAV code: use result.code if set, otherwise extract from title
  const code = props.result.code || (() => {
    const match = props.result.title.match(/\b([A-Za-z]{2,8})-?(\d{2,6})\b/)
    if (!match || !match[1] || !match[2]) return null
    return `${match[1].toUpperCase()}-${match[2]}`
  })()

  // 1. Fetch metadata from javinizer DB / scrape API
  if (code) {
    try {
      const response = await $fetch<any>('/api/metadata', {
        query: { code }
      })
      if (response && response.success && response.data) {
        const d = response.data
        metadata.value = {
          ...d,
          thumbnails: d.screenshots ?? [],
          coverPath: d.coverUrl ?? d.posterUrl ?? null,
        }
        coverImage.value = d.coverUrl || d.posterUrl || null
      }
    } catch (err) {
      console.warn('[NyaaResultCard] Failed to load JAV metadata:', err)
    } finally {
      loadingCover.value = false
    }
  } else {
    loadingCover.value = false
  }

  // 2. Fallback: scrape cover from Nyaa page if still no image
  if (!coverImage.value && props.result.pageUrl) {
    try {
      const data = await $fetch<{ cover: string | null }>('/api/nyaa-cover', {
        query: { url: props.result.pageUrl }
      })
      coverImage.value = data?.cover || null
    } catch (err) {
      console.warn('[NyaaResultCard] Failed to load nyaa cover:', err)
    } finally {
      loadingCover.value = false
    }
  } else {
    loadingCover.value = false
  }

  // 3. Global click listener to close dropdown
  if (process.client) {
    window.addEventListener('click', closeDropdown)
  }
})

onUnmounted(() => {
  if (process.client) {
    window.removeEventListener('click', closeDropdown)
  }
})

// ── Lightbox Logic ────────────────────────────────────────────────────────
const activeScreenshot = ref<string | null>(null)
const openLightbox = (url: string) => {
  activeScreenshot.value = url
}
const closeLightbox = () => {
  activeScreenshot.value = null
}
</script>

<template>
  <div class="nyaa-card group relative bg-slate-900/40 backdrop-blur-xl border border-white/[0.08] hover:border-violet-500/40 hover:bg-slate-900/60 rounded-3xl transition-all duration-300 flex flex-col overflow-hidden shadow-2xl">
    
    <!-- Card Cover Container -->
    <div class="relative aspect-[16/9] overflow-hidden bg-black/40 border-b border-white/[0.04]">
      <div v-if="loadingCover" class="absolute inset-0 flex items-center justify-center bg-slate-950/80">
        <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.05] to-transparent animate-shimmer" style="background-size: 200% 100%;"></div>
        <div class="relative z-10 flex items-center gap-2 text-violet-400 text-xs font-semibold tracking-wider">
          <span class="w-2.5 h-2.5 rounded-full bg-violet-400 animate-pulse shadow-[0_0_8px_#a78bfa]"></span>
          Scraping Cover...
        </div>
      </div>
      <img 
        v-else-if="coverImage" 
        :src="coverImage" 
        :alt="result.title" 
        class="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105 select-none"
        loading="lazy"
        style="-webkit-user-drag: none;"
      />
      <div v-else class="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/50">
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(139,92,246,0.12),transparent_70%)]"></div>
        <span class="text-3xl filter drop-shadow-[0_0_10px_rgba(139,92,246,0.4)] animate-bounce duration-1000">🧲</span>
        <span class="text-[9px] font-bold text-slate-400 tracking-widest mt-2 uppercase">{{ result.category }}</span>
      </div>

      <!-- Float Badge Overlay -->
      <div class="absolute inset-x-0 top-0 flex justify-between p-3 pointer-events-none">
        <span class="px-2.5 py-0.5 rounded-lg bg-black/60 backdrop-blur-md text-[9px] font-extrabold text-violet-400 tracking-wider border border-violet-500/20 uppercase shadow-lg">
          {{ result.category }}
        </span>
        <span class="px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-md text-[9px] font-semibold text-slate-400 border border-white/5 shadow-lg flex items-center gap-1">
          📅 {{ result.date }}
        </span>
      </div>
    </div>

    <!-- Card Contents -->
    <div class="p-5 flex-1 flex flex-col">
      <!-- Title -->
      <h3 class="text-[14.5px] font-bold text-slate-100 leading-snug tracking-tight line-clamp-2 h-[2.8em] overflow-hidden antialiased mb-3.5 group-hover:text-violet-400 transition-colors duration-300" :title="result.title">
        {{ result.title }}
      </h3>

      <!-- Rich JAV Metadata display -->
      <div v-if="metadata" class="flex flex-col gap-2 mb-3.5">
        <div class="flex flex-wrap gap-2">
          <span v-if="metadata.studio" class="px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-300 border border-violet-500/20 text-[10px] font-medium max-w-[130px] truncate" :title="metadata.studio">
            🏢 {{ metadata.studio }}
          </span>
          <span v-if="metadata.runtime" class="px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-300 border border-sky-500/20 text-[10px] font-semibold">
            ⏱ {{ metadata.runtime }}m
          </span>
        </div>
        
        <span v-if="metadata.series" class="px-2 py-0.5 rounded-md bg-white/[0.03] text-slate-300 border border-white/[0.06] text-[10px] truncate block max-w-full" :title="'Series: ' + metadata.series">
          🏷 <span class="font-medium">Series:</span> {{ metadata.series }}
        </span>

        <!-- Actresses list -->
        <div v-if="metadata.actresses && metadata.actresses.length > 0" class="flex flex-wrap gap-1">
          <span v-for="actress in metadata.actresses.slice(0, 3)" :key="actress" class="px-2 py-0.5 rounded-full bg-amber-500/5 text-amber-300 border border-amber-500/10 text-[9px] font-bold tracking-wide">
            👤 {{ actress }}
          </span>
          <span v-if="metadata.actresses.length > 3" class="px-1.5 py-0.5 rounded-full bg-white/5 text-slate-400 border border-white/5 text-[9px] font-medium">
            +{{ metadata.actresses.length - 3 }}
          </span>
        </div>

        <!-- Genre list -->
        <div v-if="metadata.genres && metadata.genres.length > 0" class="flex flex-wrap gap-1">
          <span v-for="genre in metadata.genres.slice(0, 3)" :key="genre" class="px-1.5 py-0.5 rounded-full bg-slate-800/40 text-slate-400 border border-slate-700/30 text-[8.5px] font-medium">
            #{{ genre }}
          </span>
        </div>
      </div>

      <!-- Stats Grid -->
      <div class="grid grid-columns-2 grid-flow-row grid-cols-2 gap-2 mb-4 mt-auto">
        <div class="bg-white/[0.02] border border-white/[0.04] rounded-lg px-2 py-1.5 flex items-center gap-1.5 text-[10.5px] text-slate-300 min-w-0" title="File Size">
          <span>📦</span> <span class="truncate font-semibold">{{ result.size }}</span>
        </div>
        <div class="bg-emerald-500/5 border border-emerald-500/10 rounded-lg px-2 py-1.5 flex items-center gap-1.5 text-[10.5px] text-emerald-400" title="Seeders">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#34d399]"></span>
          <span class="font-bold">{{ result.seeders }}</span> <span class="text-[9px] opacity-60">seeds</span>
        </div>
        <div class="bg-rose-500/5 border border-rose-500/10 rounded-lg px-2 py-1.5 flex items-center gap-1.5 text-[10.5px] text-rose-400" title="Leechers">
          <span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
          <span class="font-bold">{{ result.leechers }}</span> <span class="text-[9px] opacity-60">leechs</span>
        </div>
        <div class="bg-violet-500/5 border border-violet-500/10 rounded-lg px-2 py-1.5 flex items-center gap-1.5 text-[10.5px] text-violet-400" title="Total Downloads">
          <span>📥</span> <span class="font-bold">{{ result.downloads }}</span>
        </div>
      </div>

      <!-- Horizontal scrollable screenshot carousel with native snapping (NEW!) -->
      <div v-if="metadata?.thumbnails?.length" class="mb-4">
        <h4 class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
          <span>📷 Gallery ({{ metadata.thumbnails.length }} Screens)</span>
          <span class="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse"></span>
        </h4>
        
        <div class="scrollbar-hide flex overflow-x-auto gap-2 snap-x snap-mandatory rounded-2xl py-1 scroll-smooth">
          <div 
            v-for="(img, idx) in metadata.thumbnails" 
            :key="img" 
            class="relative flex-none w-[110px] aspect-[16/10] rounded-xl overflow-hidden bg-slate-950/60 snap-start cursor-pointer border border-white/[0.06] hover:border-violet-500/40 hover:scale-[1.02] transition-all duration-300 shadow-md group/img"
            @click="openLightbox(img)"
          >
            <img 
              :src="img" 
              class="w-full h-full object-cover antialiased transition-all duration-500 group-hover/img:brightness-110" 
              loading="lazy" 
              alt="Screenshot Thumbnail"
            />
            <div class="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-white/90 drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m4-3H6" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <!-- Actions section -->
      <div class="actions flex gap-2 pt-1 relative w-full">
        <!-- TRẠNG THÁI 1: ĐÃ CÓ CẢ VIDEO & SUB CỤC BỘ (CHỈ HIỂN THỊ NÚT XEM PHIM) -->
        <template v-if="metadata?.hasLocalVideo && metadata?.hasSubtitle">
          <button 
            @click="watchMovie" 
            class="relative flex-1 h-[40px] rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 overflow-hidden transition-all duration-300 select-none active:scale-95 border bg-emerald-500 text-slate-950 border-emerald-400 hover:bg-emerald-400 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] shadow-lg"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" />
            </svg>
            <span>XEM PHIM NGAY (LOCAL)</span>
          </button>
        </template>

        <!-- TRẠNG THÁI 2: ĐÃ CÓ VIDEO CỤC BỘ NHƯNG CHƯA CÓ SUB (HIỂN THỊ PLAY KHÔNG SUB & PHỤ ĐỀ) -->
        <template v-else-if="metadata?.hasLocalVideo">
          <button 
            @click="watchMovie" 
            class="relative flex-1 h-[40px] rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 overflow-hidden transition-all duration-300 select-none active:scale-95 border bg-violet-600/20 text-violet-300 border-violet-500/35 hover:bg-violet-600/35"
          >
            <span>Play (No Sub)</span>
          </button>
          <!-- Tải Sub: Ở NyaaResultCard không có sẵn detailLink trực tiếp từ avsubtitles.com nên khi click sẽ gọi luồng tải qBit (luồng này tự động tải sub!) -->
          <button 
            @click="downloadViaQbit" 
            class="relative flex-1 h-[40px] rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 overflow-hidden transition-all duration-300 select-none active:scale-95 border bg-amber-500/10 text-amber-400 border-amber-500/25 hover:bg-amber-500/20"
            :disabled="qbitStatus === 'loading'"
          >
            <span v-if="qbitStatus === 'loading'" class="spinner-mini"></span>
            <span v-else>⚡ Tải Phụ Đề</span>
          </button>
        </template>

        <!-- TRẠNG THÁI 3: CHƯA CÓ PHIM CỤC BỘ (HIỂN THỊ NÚT TẢI VỀ QBIT) -->
        <template v-else>
          <button 
            v-if="result.magnet" 
            @click="downloadViaQbit" 
            class="relative flex-1 h-[40px] rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 overflow-hidden transition-all duration-300 select-none active:scale-95 border"
            :class="{
              'bg-sky-500/10 text-sky-400 border-sky-500/25 hover:bg-sky-500/20 active:bg-sky-500/30': qbitStatus === 'idle',
              'bg-slate-900/60 text-sky-400 border-sky-500/10 cursor-wait': qbitStatus === 'loading',
              'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)]': qbitStatus === 'success',
              'bg-rose-500/20 text-rose-400 border-rose-500/30': qbitStatus === 'error'
            }"
            :disabled="qbitStatus === 'loading'"
          >
            <span v-if="qbitStatus === 'loading'" class="absolute inset-0 bg-sky-500/5 animate-pulse"></span>

            <template v-if="qbitStatus === 'idle'">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>qBit Download</span>
            </template>
            
            <template v-else-if="qbitStatus === 'loading'">
              <span class="relative flex h-4 w-4">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-4 w-4 border-2 border-sky-400 border-t-transparent animate-spin"></span>
              </span>
              <span>Adding Torrent...</span>
            </template>

            <template v-else-if="qbitStatus === 'success'">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Added to qBit! ✓</span>
            </template>

            <template v-else-if="qbitStatus === 'error'">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span class="truncate">{{ qbitError }}</span>
            </template>
          </button>
        </template>

        <!-- Dropdown Options Menu -->
        <div class="dropdown-wrapper relative" ref="dropdownRef">
          <button 
            @click="toggleDropdown" 
            class="w-10 h-[40px] rounded-xl border border-white/[0.08] text-slate-400 flex items-center justify-center hover:bg-white/5 hover:text-white transition-all active:scale-90"
            :class="{ 'bg-white/5 text-white': showDropdown }"
            title="More Options"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
            </svg>
          </button>

          <Transition name="slide-fade">
            <!-- Dropdown Options Menu floated above -->
            <div v-if="showDropdown" class="absolute right-0 bottom-full mb-2.5 w-48 bg-slate-950/90 backdrop-blur-2xl border border-white/10 rounded-2xl p-1.5 shadow-2xl z-50 flex flex-col gap-0.5" @click.stop>
              <!-- Copy Magnet -->
              <button 
                v-if="result.magnet" 
                @click="() => { copyMagnet(); closeDropdown(); }" 
                class="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold flex items-center gap-2 transition-all"
                :class="copied ? 'bg-emerald-500/15 text-emerald-400' : 'text-slate-300 hover:bg-white/5 hover:text-white'"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
                <span>{{ copied ? 'Copied! ✓' : 'Copy Magnet' }}</span>
              </button>

              <!-- Open Magnet Protocol -->
              <a 
                v-if="result.magnet" 
                :href="result.magnet" 
                @click="closeDropdown"
                class="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-slate-300 hover:bg-white/5 hover:text-white flex items-center gap-2 transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                <span>Open Magnet</span>
              </a>

              <!-- Download .torrent File -->
              <a 
                v-if="result.torrentUrl" 
                :href="result.torrentUrl" 
                @click="closeDropdown"
                class="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-slate-300 hover:bg-white/5 hover:text-white flex items-center gap-2 transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Download Torrent</span>
              </a>

              <!-- View details page -->
              <a 
                v-if="result.pageUrl" 
                :href="result.pageUrl" 
                target="_blank" 
                rel="noopener noreferrer" 
                @click="closeDropdown"
                class="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-slate-300 hover:bg-white/5 hover:text-white flex items-center gap-2 transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <span>View on Nyaa</span>
              </a>
            </div>
          </Transition>
        </div>
      </div>
    </div>

    <!-- ── Fullscreen Lightbox Modal ─────────────────────────────────────── -->
    <Transition name="lightbox-fade">
      <div 
        v-if="activeScreenshot" 
        class="fixed inset-0 z-[10000] flex flex-col justify-between bg-black/90 backdrop-blur-2xl px-4 py-6"
        @click="closeLightbox"
      >
        <!-- Top bar layout -->
        <div class="w-full max-w-5xl mx-auto flex justify-between items-center z-10">
          <div class="flex flex-col min-w-0">
            <h3 class="text-xs font-mono font-extrabold text-violet-400 tracking-widest uppercase">
              {{ metadata?.code || 'NYAA' }}
            </h3>
            <span class="text-[10px] text-slate-400 truncate max-w-[280px] sm:max-w-md">
              {{ metadata?.title || result.title }}
            </span>
          </div>
          
          <!-- Close button -->
          <button 
            @click="closeLightbox" 
            class="w-10 h-10 rounded-full bg-white/5 border border-white/10 text-slate-300 flex items-center justify-center hover:bg-white/10 hover:text-white transition-all active:scale-90"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Center Image content -->
            <div class="flex-1 flex items-center justify-center max-w-5xl mx-auto w-full my-4 relative">
          <img 
            :src="activeScreenshot" 
            class="max-h-[75vh] max-w-full object-contain rounded-2xl shadow-3xl border border-white/5 animate-lightbox-zoom antialiased select-none"
            @click.stop
            style="-webkit-user-drag: none;"
          />
        </div>

        <!-- Lightbox footer prompt -->
        <div class="text-center text-[10px] text-slate-500 font-medium tracking-wide z-10">
          Tap anywhere on screen to close preview
        </div>
      </div>
    </Transition>

    <!-- ── Fullscreen Video Player Modal ─────────────────────────────────────── -->
    <Transition name="lightbox-fade">
      <div 
        v-if="isWatching" 
        class="fixed inset-0 z-[10000] flex flex-col bg-black/95 backdrop-blur-2xl"
      >
        <!-- Top bar with Notch Safe Area Protection -->
        <div class="w-full flex justify-between items-center pt-[calc(1rem+env(safe-area-inset-top,0px))] px-4 pb-4 z-10 absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent">
          <div class="flex flex-col min-w-0">
            <h3 class="text-xs font-mono font-extrabold text-violet-400 tracking-widest uppercase">
              {{ metadata?.code || 'STREAMING' }}
            </h3>
            <span class="text-[10px] text-slate-400 truncate max-w-[200px] sm:max-w-md">
              {{ metadata?.title || result.title }}
            </span>
          </div>
          
          <div class="flex gap-2">
            <!-- Programmatic Picture-in-Picture Button -->
            <button 
              v-if="isPiPSupported"
              @click="togglePiP" 
              class="w-10 h-10 rounded-full bg-white/5 border border-white/10 text-slate-300 flex items-center justify-center hover:bg-violet-500/20 hover:text-violet-400 hover:border-violet-500/30 transition-all active:scale-90"
              title="Xem Picture in Picture"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v7a1 1 0 01-1 1h-5l-4 4v-4H5a1 1 0 01-1-1V5z" />
                <rect x="13" y="11" width="7" height="5" rx="1" fill="currentColor" class="text-violet-400" />
              </svg>
            </button>

            <!-- Close Button -->
            <button 
              @click="stopWatching" 
              class="w-10 h-10 rounded-full bg-white/5 border border-white/10 text-slate-300 flex items-center justify-center hover:bg-rose-500/20 hover:text-rose-400 hover:border-rose-500/30 transition-all active:scale-90"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Video Player with Responsive Pad -->
        <div class="flex-1 flex items-center justify-center w-full h-full relative p-4 sm:p-8">
          <div class="relative w-full max-w-5xl aspect-video rounded-2xl overflow-hidden shadow-[0_0_80px_rgba(139,92,246,0.35)] border border-violet-500/20 bg-slate-950 flex items-center justify-center">
            <video 
              v-if="isWatching"
              ref="videoPlayerRef"
              :src="`/api/play/video?code=${encodeURIComponent(props.result.code || metadata?.code || '')}`" 
              controls 
              autoplay 
              :playsinline="true"
              :webkit-playsinline="true"
              class="w-full h-full object-contain z-10"
            >
              <track 
                kind="subtitles" 
                :src="`/api/play/subtitle?code=${encodeURIComponent(props.result.code || metadata?.code || '')}`" 
                srclang="ja" 
                label="Tiếng Nhật" 
                default
              />
            </video>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Custom animations & transitions matching ResultCard */
@keyframes shimmer {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}

.animate-shimmer {
  animation: shimmer 2s linear infinite;
}

@keyframes lightboxZoom {
  from {
    transform: scale(0.95);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.animate-lightbox-zoom {
  animation: lightboxZoom 0.3s cubic-bezier(0.25, 0.8, 0.25, 1) forwards;
}

.lightbox-fade-enter-active,
.lightbox-fade-leave-active {
  transition: opacity 0.25s ease;
}
.lightbox-fade-enter-from,
.lightbox-fade-leave-to {
  opacity: 0;
}

/* Dropdown transition */
.slide-fade-enter-active {
  transition: all 0.2s ease-out;
}
.slide-fade-leave-active {
  transition: all 0.15s ease-in;
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(5px);
  opacity: 0;
}
</style>
