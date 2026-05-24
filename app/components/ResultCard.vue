<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import type { SearchResult, JavMetadata } from '~/types'

const props = defineProps<{
  result: SearchResult
  keyword: string
}>()

// ── Lazy metadata fetch ───────────────────────────────────────────────────
// Extract JAV code from the subtitle card title (e.g. "[IPX-535] Some Title" → "IPX-535")
const javCode = computed(() => {
  const match = props.result.title.match(/\b([A-Za-z]{2,8})-?(\d{2,6})\b/)
  if (!match || !match[1] || !match[2]) return null
  return `${match[1].toUpperCase()}-${match[2]}`
})

// Reactive metadata — starts from pre-fetched prop (if any), then updated on mount
const jav = ref<JavMetadata | null>(props.result.jav_metadata ?? null)
const metaLoading = ref(false)
const metaSource = ref<string | null>(null)

onMounted(async () => {
  // Already have metadata (DB cache hit from a previous fetch), skip
  if (jav.value) return
  if (!javCode.value) return

  metaLoading.value = true
  try {
    const res = await $fetch<{ success: boolean; source: string; data: JavMetadata | null }>(
      '/api/metadata',
      { query: { code: javCode.value } }
    )
    if (res?.success && res?.data) {
      jav.value = res.data
      metaSource.value = res.source
      // Reset imageError so new cover image can load
      imageError.value = false
    }
  } catch (e: any) {
    // Silently fail — card still works without metadata
    console.warn(`[ResultCard] Metadata fetch failed for ${javCode.value}:`, e.message)
  } finally {
    metaLoading.value = false
  }
})

// Best available cover image: prefer javinizer cover_url (DMM CDN), fallback to AVSub cover
const displayImage = computed(() => {
  return jav.value?.coverUrl || jav.value?.posterUrl || props.result.cover_image || ''
})

// Display title: prefer javinizer title over AVSub title
const displayTitle = computed(() => {
  return jav.value?.title || props.result.title
})

// ── Download / modal logic ────────────────────────────────────────────────
const status = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
const errorMessage = ref('')
const movedFiles = ref<string[]>([])
const showModal = ref(false)
const isWatching = ref(false)
const videoPlayerRef = ref<HTMLVideoElement | null>(null)
const isMetadataLoaded = ref(false)

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
  isMetadataLoaded.value = false
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

watch(isWatching, async (newVal, oldVal, onCleanup) => {
  if (newVal) {
    await nextTick()
    const video = videoPlayerRef.value
    if (video) {
      const handleFullscreenChange = () => {
        if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
          stopWatching()
        }
      }
      const handleWebkitEndFullscreen = () => {
        stopWatching()
      }
      
      video.addEventListener('fullscreenchange', handleFullscreenChange)
      video.addEventListener('webkitendfullscreen', handleWebkitEndFullscreen)
      
      onCleanup(() => {
        video.removeEventListener('fullscreenchange', handleFullscreenChange)
        video.removeEventListener('webkitendfullscreen', handleWebkitEndFullscreen)
      })

      // Attempt to play and request fullscreen
      try {
        await video.play()
      } catch (playErr) {
        console.warn('Auto-play failed, user interaction might be required:', playErr)
      }
      
      try {
        if (video.requestFullscreen) {
          await video.requestFullscreen()
        } else if ((video as any).webkitEnterFullscreen) {
          ;(video as any).webkitEnterFullscreen()
        }
        if (screen.orientation && typeof screen.orientation.lock === 'function') {
          await screen.orientation.lock('landscape').catch((oErr) => {
            console.log('Orientation lock ignored:', oErr)
          })
        }
      } catch (err) {
        console.warn('Fullscreen or orientation lock failed:', err)
      }
    }
  } else {
    isMetadataLoaded.value = false
  }
})

const copyMagnetText = ref('Copy Link')
const copySubText = ref('Copy Source URL')

const targetFolderName = computed(() => {
  return props.result.title.split(']')[0].replace('[', '')
})

const handleApply = async () => {
  status.value = 'loading'
  errorMessage.value = ''
  
  try {
    const response = await $fetch('/api/download', {
      method: 'POST',
      body: {
        detail_link: props.result.detail_link,
        keyword: props.keyword,
        // Pass JAV code so subtitle is named "IPX-535.ja.srt" not keyword
        code: jav.value?.code ?? javCode.value ?? undefined,
      }
    })

    if (response.success) {
      status.value = 'success'
      movedFiles.value = response.movedFiles
      showModal.value = true
    } else {
      status.value = 'error'
      errorMessage.value = response.error || 'Unknown error'
    }
  } catch (error: any) {
    status.value = 'error'
    errorMessage.value = error.data?.statusMessage || error.message
  }
}

const copyText = async (text?: string) => {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    if (text === props.result.magnet) {
      copyMagnetText.value = 'Copied! ✓'
      setTimeout(() => { copyMagnetText.value = 'Copy Link' }, 2000)
    } else {
      copySubText.value = 'Copied! ✓'
      setTimeout(() => { copySubText.value = 'Copy Source URL' }, 2000)
    }
  } catch (err) {
    console.error('Failed to copy text', err)
  }
}

const qbitStatus = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
const qbitError = ref('')

const downloadViaQbit = async () => {
  if (!props.result.magnet) return
  qbitStatus.value = 'loading'
  qbitError.value = ''
  try {
    const response = await $fetch<{ success: boolean }>('/api/qbittorrent/download', {
      method: 'POST',
      body: { 
        magnet: props.result.magnet,
        code: jav.value?.code || javCode.value || undefined
      }
    })
    if (response && response.success) {
      qbitStatus.value = 'success'
      setTimeout(() => { qbitStatus.value = 'idle' }, 3000)
    } else {
      qbitStatus.value = 'error'
      qbitError.value = 'Failed to add'
    }
  } catch (err: any) {
    qbitStatus.value = 'error'
    qbitError.value = err.data?.statusMessage || 'Failed to download'
    setTimeout(() => { qbitStatus.value = 'idle' }, 5000)
  }
}

const imageError = ref(false)
const handleImageError = () => { imageError.value = true }

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
  <div class="result-card group relative bg-slate-900/40 backdrop-blur-xl border border-white/[0.08] hover:border-violet-500/40 hover:bg-slate-900/60 rounded-3xl transition-all duration-300 flex flex-col overflow-hidden shadow-2xl">
    
    <!-- Widescreen Cover Container -->
    <div class="relative aspect-[16/9] overflow-hidden bg-black/40 border-b border-white/[0.04]">
      <!-- Shimmer Skeleton while loading metadata -->
      <div v-if="metaLoading" class="absolute inset-0 flex items-center justify-center bg-slate-950/80">
        <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.05] to-transparent animate-shimmer" style="background-size: 200% 100%;"></div>
        <div class="relative z-10 flex items-center gap-2 text-violet-400 text-xs font-semibold tracking-wider">
          <span class="w-2.5 h-2.5 rounded-full bg-violet-400 animate-pulse shadow-[0_0_8px_#a78bfa]"></span>
          Scraping Metadata...
        </div>
      </div>

      <!-- Cover Image -->
      <img 
        v-else-if="displayImage && !imageError" 
        :src="displayImage" 
        :alt="displayTitle" 
        class="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105 select-none" 
        @error="handleImageError"
        style="-webkit-user-drag: none;"
      />

      <!-- Cover Fallback placeholder -->
      <div v-else class="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/50">
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(167,139,250,0.12),transparent_70%)]"></div>
        <span class="text-3xl filter drop-shadow-[0_0_10px_rgba(167,139,250,0.4)] animate-bounce duration-1000">📝</span>
        <span class="text-[10px] font-bold text-slate-400 tracking-widest mt-2 uppercase">AV SUBTITLE</span>
      </div>

      <!-- Float Glass Overlays -->
      <div v-if="jav && !metaLoading" class="absolute inset-x-0 top-0 flex justify-between p-3 pointer-events-none">
        <span v-if="jav.code" class="px-2.5 py-0.5 rounded-lg bg-black/60 backdrop-blur-md text-[11px] font-extrabold font-mono text-emerald-400 tracking-wider border border-emerald-500/30 shadow-lg">
          {{ jav.code }}
        </span>
        <span v-if="jav.ratingScore" class="px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-md text-[11px] font-bold text-amber-400 flex items-center gap-1 border border-amber-500/20 shadow-lg">
          ⭐ {{ jav.ratingScore.toFixed(1) }}
        </span>
      </div>
    </div>

    <!-- Card Core Details -->
    <div class="p-5 flex-1 flex flex-col">
      <!-- Title with high clarity anti-aliasing -->
      <h3 class="text-[15px] font-bold text-slate-100 leading-snug tracking-tight line-clamp-2 h-[2.8em] overflow-hidden antialiased mb-3 group-hover:text-violet-400 transition-colors duration-300" :title="displayTitle">
        {{ displayTitle }}
      </h3>

      <!-- Metadata pill strip -->
      <div v-if="metaLoading" class="flex gap-2 mb-3">
        <div class="h-5 w-20 bg-slate-800 animate-pulse rounded-md"></div>
        <div class="h-5 w-14 bg-slate-800 animate-pulse rounded-md"></div>
      </div>
      <div v-else-if="jav" class="flex flex-wrap gap-2 mb-3">
        <span v-if="jav.studio" class="px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-300 border border-violet-500/20 text-[10.5px] font-medium max-w-[140px] truncate" :title="jav.studio">
          🏢 {{ jav.studio }}
        </span>
        <span v-if="jav.releaseYear" class="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[10.5px] font-semibold">
          {{ jav.releaseYear }}
        </span>
        <span v-if="jav.runtime" class="px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-300 border border-sky-500/20 text-[10.5px] font-semibold">
          ⏱ {{ jav.runtime }}m
        </span>
      </div>

      <!-- Actress tags -->
      <div v-if="jav?.actresses?.length" class="flex flex-wrap gap-1.5 mb-4">
        <span v-for="actress in jav.actresses.slice(0, 3)" :key="actress" class="px-2.5 py-0.5 rounded-full bg-amber-500/5 text-amber-300 border border-amber-500/10 text-[9.5px] font-bold tracking-wide">
          👤 {{ actress }}
        </span>
        <span v-if="jav.actresses.length > 3" class="px-1.5 py-0.5 rounded-full bg-white/5 text-slate-400 border border-white/5 text-[9.5px] font-medium">
          +{{ jav.actresses.length - 3 }}
        </span>
      </div>

      <!-- Subtitle Info -->
      <div class="mb-4 text-xs text-slate-400 bg-white/[0.02] border border-white/[0.04] p-3 rounded-xl">
        <p class="leading-relaxed">{{ result.subtitles_info }}</p>
      </div>

      <!-- Horizontal scrollable screenshot carousel with native snapping -->
      <div v-if="jav?.screenshots?.length" class="mb-4">
        <h4 class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
          <span>📷 Widescreen Media Gallery</span>
          <span class="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse"></span>
        </h4>
        
        <div class="scrollbar-hide flex overflow-x-auto gap-2.5 snap-x snap-mandatory rounded-2xl py-1 scroll-smooth">
          <div 
            v-for="(img, idx) in jav.screenshots" 
            :key="img" 
            class="relative flex-none w-[130px] aspect-[16/10] rounded-xl overflow-hidden bg-slate-950/60 snap-start cursor-pointer border border-white/[0.06] hover:border-violet-500/40 hover:scale-[1.02] transition-all duration-300 shadow-md group/img"
            @click="openLightbox(img)"
          >
            <img 
              :src="img" 
              class="w-full h-full object-cover antialiased transition-all duration-500 group-hover/img:brightness-110" 
              loading="lazy" 
              alt="Screenshot Thumbnail"
            />
            <div class="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-white/90 drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m4-3H6" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <!-- Card bottom action buttons -->
      <div class="mt-auto flex flex-col gap-2.5 pt-2 w-full">
        <!-- TRẠNG THÁI 1: ĐÃ CÓ CẢ VIDEO & SUB CỤC BỘ (CHỈ HIỂN THỊ NÚT XEM PHIM) -->
        <template v-if="jav?.hasLocalVideo && jav?.hasSubtitle">
          <button 
            @click="watchMovie" 
            class="relative w-full h-[44px] rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 overflow-hidden transition-all duration-300 select-none active:scale-95 border bg-emerald-500 text-slate-950 border-emerald-400 hover:bg-emerald-400 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] shadow-lg"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4.5 h-4.5" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" />
            </svg>
            <span>Play</span>
          </button>
        </template>

        <!-- TRẠNG THÁI 2: ĐÃ CÓ VIDEO CỤC BỘ NHƯNG CHƯA CÓ SUB (HIỂN THỊ PLAY KHÔNG SUB & PHỤ ĐỀ) -->
        <template v-else-if="jav?.hasLocalVideo">
          <div class="flex gap-2 w-full">
            <button 
              @click="watchMovie" 
              class="relative flex-1 h-[40px] rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 overflow-hidden transition-all duration-300 select-none active:scale-95 border bg-violet-600/20 text-violet-300 border-violet-500/35 hover:bg-violet-600/35"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" />
              </svg>
              <span>Play</span>
            </button>
            <button 
              @click="handleApply" 
              class="relative flex-1 h-[40px] rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 overflow-hidden transition-all duration-300 select-none active:scale-95 border bg-amber-500/10 text-amber-400 border-amber-500/25 hover:bg-amber-500/20"
              :disabled="status === 'loading'"
            >
              <span v-if="status === 'loading'" class="spinner-mini"></span>
              <span v-else>⚡ Tải Phụ Đề</span>
            </button>
          </div>
        </template>

        <!-- TRẠNG THÁI 3: CHƯA CÓ PHIM CỤC BỘ (HIỂN THỊ NÚT TẢI VỀ QBIT) -->
        <template v-else>
          <div class="flex gap-2 w-full" v-if="result.magnet">
            <button 
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
                <span class="tracking-wide animate-pulse">Adding...</span>
              </template>

              <template v-else-if="qbitStatus === 'success'">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Added! ✓</span>
              </template>

              <template v-else-if="qbitStatus === 'error'">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span class="truncate">{{ qbitError }}</span>
              </template>
            </button>
          </div>
        </template>
      </div>

      <!-- Completion Alert banner inside card body -->
      <div 
        v-if="status === 'success'" 
        @click="showModal = true" 
        class="mt-3 cursor-pointer p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col gap-0.5 hover:bg-emerald-500/15 active:bg-emerald-500/20 transition-all duration-300"
      >
        <div class="flex items-center gap-1.5 text-[11px] font-bold text-emerald-400">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Subtitle Injection Verified!</span>
        </div>
        <span class="text-[10px] text-slate-400 leading-normal truncate">
          Target folder: <strong>{{ targetFolderName }}</strong>
        </span>
        <span class="text-[9.5px] text-violet-400 underline mt-0.5 font-semibold">View details and magnet link</span>
      </div>
    </div>
  </div>

  <!-- ── Fullscreen Lightbox Modal ─────────────────────────────────────── -->
  <Teleport to="body">
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
              {{ jav?.code || 'AVSUB' }}
            </h3>
            <span class="text-[10px] text-slate-400 truncate max-w-[280px] sm:max-w-md">
              {{ jav?.title || result.title }}
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
  </Teleport>

  <!-- ── Completed Download Detail Modal ─────────────────────────────── -->
  <Transition name="modal-fade">
    <div v-if="showModal" class="fixed inset-0 z-[999] flex items-center justify-center p-4" @click.self="showModal = false">
      <!-- Backing glass tint blur -->
      <div class="absolute inset-0 bg-black/60 backdrop-blur-xl transition-all duration-300"></div>

      <!-- Modal container -->
      <div class="relative w-full max-w-lg bg-slate-900/80 border border-white/10 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-2xl p-6 md:p-8 animate-modal-slide">
        
        <!-- Close button -->
        <button @click="showModal = false" class="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 text-slate-400 flex items-center justify-center hover:bg-white/10 hover:text-white transition-all">
          &times;
        </button>

        <!-- Header -->
        <div class="text-center mb-6">
          <div class="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 class="text-lg font-bold text-white leading-normal">Subtitle Applied Successfully!</h2>
          <p class="text-xs text-slate-400 mt-1">
            Moved to directory: <strong class="text-slate-200">{{ targetFolderName }}</strong>
          </p>
        </div>

        <!-- JAV Modal Detail Panel -->
        <div v-if="jav" class="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3.5 mb-6 flex gap-3.5 items-start">
          <img 
            v-if="displayImage" 
            :src="displayImage" 
            class="w-20 aspect-[16/10] object-cover rounded-lg border border-white/10 flex-shrink-0"
            alt="Cover Image"
          />
          <div class="flex-1 flex flex-col gap-1 min-w-0">
            <h3 class="text-xs font-bold text-white leading-snug truncate">{{ jav.title }}</h3>
            <p v-if="jav.studio" class="text-[10px] text-slate-400 flex items-center gap-1">
              🏢 <span class="truncate">{{ jav.studio }}</span>
            </p>
            <p v-if="jav.actresses?.length" class="text-[10px] text-slate-400 flex items-center gap-1">
              👤 <span class="truncate">{{ jav.actresses.slice(0, 3).join(', ') }}</span>
            </p>
          </div>
        </div>

        <div class="flex flex-col gap-4">
          <!-- Movie Magnet Panel -->
          <div v-if="result.magnet" class="bg-white/[0.02] border border-white/[0.04] p-4 rounded-2xl flex flex-col gap-2">
            <div class="flex justify-between items-center">
              <span class="text-xs font-bold text-slate-300">🧲 Magnet URI</span>
              <div class="flex gap-2">
                <button 
                  @click="downloadViaQbit" 
                  class="h-7 px-3 rounded-lg text-[10px] font-bold border transition-all duration-300"
                  :class="{
                    'bg-sky-500/10 text-sky-400 border-sky-500/20 hover:bg-sky-500/20': qbitStatus === 'idle',
                    'bg-slate-950/40 text-sky-300 border-white/5 cursor-wait': qbitStatus === 'loading',
                    'bg-emerald-500/20 text-emerald-400 border-emerald-500/30': qbitStatus === 'success',
                    'bg-rose-500/20 text-rose-400 border-rose-500/30': qbitStatus === 'error'
                  }"
                  :disabled="qbitStatus === 'loading'"
                >
                  {{ qbitStatus === 'idle' ? 'qBit Add' : qbitStatus === 'loading' ? 'Adding...' : qbitStatus === 'success' ? 'Added ✓' : 'Error' }}
                </button>
                <button 
                  @click="copyText(result.magnet)" 
                  class="h-7 px-3 rounded-lg text-[10px] font-bold bg-violet-600/20 text-violet-300 border border-violet-500/30 hover:bg-violet-600 hover:text-white transition-all"
                >
                  {{ copyMagnetText }}
                </button>
              </div>
            </div>
            <textarea readonly :value="result.magnet" class="w-full h-14 bg-black/40 border border-white/5 rounded-xl p-2.5 text-[10px] font-mono text-slate-400 resize-none outline-none select-all" />
          </div>

          <!-- Subtitle Files list -->
          <div class="bg-white/[0.02] border border-white/[0.04] p-4 rounded-2xl flex flex-col gap-2">
            <div class="flex justify-between items-center">
              <span class="text-xs font-bold text-slate-300">📝 Applied Subtitle Files</span>
              <button 
                @click="copyText(result.detail_link)" 
                class="h-7 px-3 rounded-lg text-[10px] font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 transition-all"
              >
                {{ copySubText }}
              </button>
            </div>
            <div class="text-[10px] text-slate-400 flex flex-col gap-1 mt-1">
              <div v-for="file in movedFiles" :key="file" class="flex items-center gap-1 text-slate-300 truncate">
                <span>💾</span> <span class="truncate">{{ file }}</span>
              </div>
              <div class="pt-2 border-t border-white/5 text-[9.5px] mt-1 text-slate-500">
                <strong>Source:</strong> 
                <a :href="result.detail_link" target="_blank" class="text-sky-400 underline hover:text-sky-300 break-all">{{ result.detail_link }}</a>
              </div>
            </div>
          </div>
        </div>

        <!-- Done button -->
        <div class="mt-6 flex justify-end">
          <button @click="showModal = false" class="h-9 px-6 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs hover:bg-emerald-400 active:scale-98 transition-all duration-200">
            Dismiss
          </button>
        </div>
      </div>
    </div>
  </Transition>

  <!-- ── Fullscreen Video Player Modal ─────────────────────────────────────── -->
  <Teleport to="body">
    <Transition name="lightbox-fade">
      <div 
        v-if="isWatching" 
        class="fixed inset-0 z-[10000] flex flex-col bg-black/95 backdrop-blur-2xl"
      >
        <!-- Top bar with Notch Safe Area Protection -->
        <div class="w-full flex justify-between items-center pt-[calc(1rem+env(safe-area-inset-top,0px))] px-4 pb-4 z-10 absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent">
          <div class="flex flex-col min-w-0">
            <h3 class="text-xs font-mono font-extrabold text-violet-400 tracking-widest uppercase">
              {{ jav?.code || 'STREAMING' }}
            </h3>
            <span class="text-[10px] text-slate-400 truncate max-w-[200px] sm:max-w-md">
              {{ jav?.title || result.title }}
            </span>
          </div>
          
          <div class="flex gap-2">
            <!-- Programmatic Picture-in-Picture Button -->
            <button 
              v-if="isPiPSupported"
              @click="togglePiP" 
              :disabled="!isMetadataLoaded"
              class="w-10 h-10 rounded-full bg-white/5 border border-white/10 text-slate-300 flex items-center justify-center hover:bg-violet-500/20 hover:text-violet-400 hover:border-violet-500/30 transition-all active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed"
              :title="isMetadataLoaded ? 'Xem Picture in Picture' : 'Đang tải video...'"
            >
              <span v-if="!isMetadataLoaded" class="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin"></span>
              <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
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
              :src="`/api/play/video?code=${encodeURIComponent(jav?.code || javCode || '')}`" 
              controls 
              autoplay 
              :playsinline="true"
              :webkit-playsinline="true"
              @loadedmetadata="isMetadataLoaded = true"
              class="w-full h-full object-contain z-10"
            >
              <track 
                kind="subtitles" 
                :src="`/api/play/subtitle?code=${encodeURIComponent(jav?.code || javCode || '')}`" 
                srclang="ja" 
                label="Tiếng Nhật" 
                default
              />
            </video>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Custom keyframes & classes not expressible cleanly in default Tailwind */
@keyframes shimmer {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}

.animate-shimmer {
  animation: shimmer 2s linear infinite;
}

/* Lightbox zoom animation */
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

/* Transitions */
.lightbox-fade-enter-active,
.lightbox-fade-leave-active {
  transition: opacity 0.25s ease;
}
.lightbox-fade-enter-from,
.lightbox-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-active .animate-modal-slide {
  animation: modalSlideUp 0.3s cubic-bezier(0.25, 0.8, 0.25, 1) forwards;
}

@keyframes modalSlideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
</style>
