<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import CustomPlayer from '~/components/VideoPlayer/PlayerWrapper.vue'

definePageMeta({
  layout: 'player'
})

interface ActressDetail {
  id: string
  name: string
  japaneseName: string | null
  thumbUrl: string | null
  aliases: string | null
  dmmId: string | null
}

interface JavMetadata {
  contentId: string
  code: string
  title: string
  originalTitle: string | null
  description: string | null
  releaseDate: string | null
  releaseYear: number | null
  runtime: number | null
  director: string | null
  studio: string | null
  label: string | null
  series: string | null
  ratingScore: number | null
  ratingVotes: number | null
  posterUrl: string | null
  coverUrl: string | null
  screenshots: string[]
  trailerUrl: string | null
  genres: string[]
  actresses: string[]
  actressDetails: ActressDetail[]
  hasLocalVideo: boolean
  hasSubtitle: boolean
}

interface SubtitleCue {
  start: number
  end: number
  text: string
}

interface ProgressData {
  currentTime: number
  duration: number
  percentage: number
  updatedAt: number
}

const route = useRoute()
const router = useRouter()
const code = computed(() => (route.params.code as string).toUpperCase())

// Page State
const metadata = ref<JavMetadata | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const activeScreenshot = ref<string | null>(null)

// Subtitles State
const subtitleCues = ref<SubtitleCue[]>([])
const parsedSubtitlesLoaded = ref(false)
const currentSubtitleLines = ref<string[]>([])
const isSubtitlesVisible = ref(true)
const subtitleSettings = ref({
  size: 24,
  color: '#ffffff',
  offset: 0, // ms
  borderStyle: 'thick-black', // 'none' | 'thin-black' | 'thick-black' | 'drop-shadow'
  backgroundStyle: 'transparent-dark' // 'none' | 'transparent-dark' | 'capsule'
})

// Player State
const showVideoPlayer = ref(false)
const isMetadataLoaded = ref(false)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const bufferedPercentage = ref(0)
const volume = ref(1)
const isMuted = ref(false)
const currentSpeed = ref(1.0)
const isPlayerFullscreen = ref(false)
// True only when iOS native fullscreen is active (webkitEnterFullscreen)
// Used to hide custom HTML overlay (which iOS hides anyway) and show <track> subtitle instead
const isIOSNativeFullscreen = ref(false)
const isMiniPlayer = ref(false)
const pipActive = ref(false)
const showResumePrompt = ref(false)
const savedProgress = ref<ProgressData | null>(null)
const showSkipIntroButton = ref(false)
const isAutoSkipIntro = ref(false)
const skipIntroDuration = ref(0)
const isControlsVisible = ref(true)
const showSpeedMenu = ref(false)
const showSubtitleMenu = ref(false)

const startSeekTime = ref(0)
const playerSubtitles = computed(() => {
  if (!metadata.value?.hasSubtitle) return []
  return [
    {
      id: 'ja',
      label: 'Japanese',
      src: `/api/play/subtitle?code=${encodeURIComponent(code.value)}`,
      srclang: 'ja',
      default: true
    }
  ]
})

const videoPlayerRef = ref<HTMLVideoElement | null>(null)
const playerContainerRef = ref<HTMLElement | null>(null)

let lastProgressSaveTime = 0
let controlsTimeoutId: NodeJS.Timeout | null = null
let resumePromptTimeoutId: NodeJS.Timeout | null = null

// Progress percentage computed
const progressPercentage = computed(() => {
  if (duration.value === 0) return 0
  return (currentTime.value / duration.value) * 100
})

// PiP Supported check
const isPiPSupported = computed(() => {
  if (typeof document === 'undefined' || typeof navigator === 'undefined') return false
  return !!(
    document.pictureInPictureEnabled ||
    /iphone|ipad|ipod|macintosh/i.test(navigator.userAgent) ||
    /safari/i.test(navigator.userAgent)
  )
})

// Movie poster computed to prioritize vertical poster/profile image over cover
const displayPoster = computed(() => {
  if (!metadata.value) return '/icon.png'
  
  const poster = metadata.value.posterUrl || ''
  const cover = metadata.value.coverUrl || ''
  const cropped = (metadata.value as any).croppedPosterUrl || ''
  
  // If poster is same as cover (meaning it's horizontal landscape), prefer cropped vertical poster
  if (poster === cover && cropped) {
    return cropped
  }
  
  return poster || cropped || cover || '/icon.png'
})

// ── Settings Handlers ───────────────────────────────────────────────────────
const loadSubtitleSettings = () => {
  try {
    const data = localStorage.getItem('avsub_sub_settings')
    if (data) {
      const parsed = JSON.parse(data)
      subtitleSettings.value = { ...subtitleSettings.value, ...parsed }
    }
  } catch (e) {
    console.warn('Failed to parse subtitle settings:', e)
  }

  try {
    const autoSkipData = localStorage.getItem('avsub_auto_skip_intro')
    if (autoSkipData !== null) {
      isAutoSkipIntro.value = JSON.parse(autoSkipData)
    }
    const durData = localStorage.getItem('avsub_skip_intro_duration')
    if (durData !== null) {
      skipIntroDuration.value = JSON.parse(durData)
    }
  } catch (e) {}
}

const saveSubtitleSettings = () => {
  try {
    localStorage.setItem('avsub_sub_settings', JSON.stringify(subtitleSettings.value))
  } catch (e) {}
}

const changeSubtitleOffset = (changeMs: number) => {
  subtitleSettings.value.offset += changeMs
  saveSubtitleSettings()
}

const resetSubtitleOffset = () => {
  subtitleSettings.value.offset = 0
  saveSubtitleSettings()
}

// ── Subtitle Parser ──────────────────────────────────────────────────────────
const parseTime = (timeStr: string): number => {
  const parts = timeStr.trim().split(':')
  let hrs = 0
  let mins = 0
  let secs = 0
  
  if (parts.length === 3) {
    hrs = parseFloat(parts[0])
    mins = parseFloat(parts[1])
    secs = parseFloat(parts[2])
  } else if (parts.length === 2) {
    mins = parseFloat(parts[0])
    secs = parseFloat(parts[1])
  } else if (parts.length === 1) {
    secs = parseFloat(parts[0])
  }
  return hrs * 3600 + mins * 60 + secs
}

const parseVTT = (vttText: string): SubtitleCue[] => {
  const cues: SubtitleCue[] = []
  const blocks = vttText.split(/\r?\n\r?\n/)
  
  for (const block of blocks) {
    const lines = block.trim().split(/\r?\n/)
    if (lines.length === 0 || lines[0] === 'WEBVTT' || lines[0].startsWith('NOTE')) {
      continue
    }
    
    let timeLineIdx = 0
    if (!lines[0].includes('-->') && lines.length > 1 && lines[1].includes('-->')) {
      timeLineIdx = 1
    }
    
    if (lines[timeLineIdx] && lines[timeLineIdx].includes('-->')) {
      const timeParts = lines[timeLineIdx].split('-->')
      if (timeParts.length === 2) {
        const start = parseTime(timeParts[0])
        const end = parseTime(timeParts[1])
        const textLines = lines.slice(timeLineIdx + 1)
        const text = textLines.join('\n').trim()
        if (!isNaN(start) && !isNaN(end)) {
          cues.push({ start, end, text })
        }
      }
    }
  }
  return cues
}

const loadSubtitles = async (movieCode: string) => {
  subtitleCues.value = []
  parsedSubtitlesLoaded.value = false
  currentSubtitleLines.value = []
  
  try {
    const res = await fetch(`/api/play/subtitle?code=${encodeURIComponent(movieCode)}`)
    if (res.ok) {
      const text = await res.text()
      subtitleCues.value = parseVTT(text)
      parsedSubtitlesLoaded.value = true
    }
  } catch (err) {
    console.error('Failed to load or parse subtitles:', err)
  }
}

const updateSubtitleDisplay = (time: number) => {
  if (!parsedSubtitlesLoaded.value || subtitleCues.value.length === 0) {
    currentSubtitleLines.value = []
    return
  }
  
  const offsetSeconds = subtitleSettings.value.offset / 1000
  const adjustedTime = time - offsetSeconds
  
  const activeCue = subtitleCues.value.find(
    (c) => adjustedTime >= c.start && adjustedTime <= c.end
  )
  
  if (activeCue) {
    currentSubtitleLines.value = activeCue.text.split('\n')
  } else {
    currentSubtitleLines.value = []
  }
}

// ── Player Controls ──────────────────────────────────────────────────────────
const togglePlay = () => {
  const video = videoPlayerRef.value
  if (!video) return
  if (isPlaying.value) {
    video.pause()
  } else {
    video.play().catch(() => {})
  }
}

const skipBack = () => {
  if (videoPlayerRef.value) {
    videoPlayerRef.value.currentTime = Math.max(0, videoPlayerRef.value.currentTime - 10)
    triggerControlsActivity()
  }
}

const skipForward = () => {
  if (videoPlayerRef.value) {
    videoPlayerRef.value.currentTime = Math.min(duration.value, videoPlayerRef.value.currentTime + 10)
    triggerControlsActivity()
  }
}

const toggleMute = () => {
  if (videoPlayerRef.value) {
    videoPlayerRef.value.muted = !videoPlayerRef.value.muted
    isMuted.value = videoPlayerRef.value.muted
    triggerControlsActivity()
  }
}

const onVolumeInput = (e: Event) => {
  const val = parseFloat((e.target as HTMLInputElement).value)
  volume.value = val
  if (videoPlayerRef.value) {
    videoPlayerRef.value.volume = val
    videoPlayerRef.value.muted = val === 0
    isMuted.value = val === 0
  }
}

const toggleFullscreen = () => {
  const container = playerContainerRef.value
  const video = videoPlayerRef.value
  if (!container) return

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  if (isIOS) {
    // iOS: use webkitEnterFullscreen() on the <video> element for auto-rotate.
    // Subtitles are served via <track> WebVTT so they appear in the native player UI.
    if (!isIOSNativeFullscreen.value) {
      if (video && typeof (video as any).webkitEnterFullscreen === 'function') {
        // Ensure <track> subtitle is enabled before entering fullscreen
        syncNativeTrack(true)
        ;(video as any).webkitEnterFullscreen()
      }
    } else {
      if (video && typeof (video as any).webkitExitFullscreen === 'function') {
        ;(video as any).webkitExitFullscreen()
      }
    }
    return
  }

  // Desktop: standard Fullscreen API
  const isCurrentlyFullscreen =
    !!document.fullscreenElement ||
    !!(document as any).webkitFullscreenElement

  if (!isCurrentlyFullscreen) {
    if (container.requestFullscreen) {
      container.requestFullscreen().catch(() => {})
      isPlayerFullscreen.value = true
    } else if ((container as any).webkitRequestFullscreen) {
      ;(container as any).webkitRequestFullscreen()
      isPlayerFullscreen.value = true
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {})
      isPlayerFullscreen.value = false
    } else if ((document as any).webkitExitFullscreen) {
      ;(document as any).webkitExitFullscreen()
      isPlayerFullscreen.value = false
    }
  }
}

// Sync the native <track> element mode with subtitle visibility
const syncNativeTrack = (forceShow?: boolean) => {
  const video = videoPlayerRef.value
  if (!video) return
  const tracks = video.textTracks
  if (!tracks || tracks.length === 0) return
  const track = tracks[0]
  const shouldShow = forceShow !== undefined ? forceShow : isSubtitlesVisible.value
  track.mode = shouldShow ? 'showing' : 'hidden'
}

const togglePiP = () => {
  const video = videoPlayerRef.value
  if (!video) return

  try {
    // Already in standard PiP → exit
    if (document.pictureInPictureElement === video) {
      document.exitPictureInPicture().catch(() => {})
      pipActive.value = false
      return
    }
    // Already in Safari WebKit PiP → exit to inline
    if (
      video.webkitPresentationMode === 'picture-in-picture' &&
      typeof video.webkitSetPresentationMode === 'function'
    ) {
      video.webkitSetPresentationMode('inline')
      pipActive.value = false
      return
    }

    // Exit custom fullscreen if active before requesting PiP to prevent layout bugs
    if (isPlayerFullscreen.value && !isIOSNativeFullscreen.value) {
      toggleFullscreen()
    }

    // iOS/Safari: prefer webkitSetPresentationMode
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

    if (
      isIOS &&
      typeof video.webkitSupportsPresentationMode === 'function' &&
      video.webkitSupportsPresentationMode('picture-in-picture') &&
      typeof video.webkitSetPresentationMode === 'function'
    ) {
      video.webkitSetPresentationMode('picture-in-picture')
      pipActive.value = true
    } else if (video.requestPictureInPicture) {
      video.requestPictureInPicture()
        .then(() => { pipActive.value = true })
        .catch(() => {
          // fallback to webkit
          if (
            typeof video.webkitSupportsPresentationMode === 'function' &&
            video.webkitSupportsPresentationMode('picture-in-picture') &&
            typeof video.webkitSetPresentationMode === 'function'
          ) {
            video.webkitSetPresentationMode('picture-in-picture')
            pipActive.value = true
          }
        })
    }
  } catch (err) {
    console.error('Lỗi khi kích hoạt Picture-in-Picture:', err)
  }
}

const syncPiPState = () => {
  const video = videoPlayerRef.value
  if (video) {
    pipActive.value = 
      document.pictureInPictureElement === video ||
      (video.webkitPresentationMode === 'picture-in-picture')
  }
}

const setSpeed = (speed: number) => {
  currentSpeed.value = speed
  if (videoPlayerRef.value) {
    videoPlayerRef.value.playbackRate = speed
  }
  showSpeedMenu.value = false
}

// Controls visibility trigger
const triggerControlsActivity = () => {
  isControlsVisible.value = true
  if (controlsTimeoutId) clearTimeout(controlsTimeoutId)
  if (isPlaying.value) {
    controlsTimeoutId = setTimeout(() => {
      isControlsVisible.value = false
      showSpeedMenu.value = false
      showSubtitleMenu.value = false
    }, 3500)
  }
}

const hideControlsOnLeave = () => {
  if (isPlaying.value) {
    isControlsVisible.value = false
    showSpeedMenu.value = false
    showSubtitleMenu.value = false
  }
}

const onSeekInput = (e: Event) => {
  triggerControlsActivity()
}

const onSeekChange = (e: Event) => {
  const val = parseFloat((e.target as HTMLInputElement).value)
  if (videoPlayerRef.value) {
    videoPlayerRef.value.currentTime = val
    currentTime.value = val
  }
}

const handleVideoClick = (e: Event) => {
  e.stopPropagation()
  if (isMiniPlayer.value) {
    isMiniPlayer.value = false
  } else {
    togglePlay()
  }
}

// Progress Resume Handlers
const handleResumeProgress = (resume: boolean) => {
  if (savedProgress.value) {
    if (resume) {
      startSeekTime.value = savedProgress.value.currentTime
    } else {
      startSeekTime.value = 0
    }
  }
  showResumePrompt.value = false
}

const skipIntro = () => {
  if (videoPlayerRef.value && skipIntroDuration.value > 0) {
    videoPlayerRef.value.currentTime = skipIntroDuration.value
    showSkipIntroButton.value = false
  }
}

// ── Media Event Handlers ─────────────────────────────────────────────────────
const onMetadataLoaded = () => {
  isMetadataLoaded.value = true
  if (videoPlayerRef.value) {
    duration.value = videoPlayerRef.value.duration || 0
    volume.value = videoPlayerRef.value.volume
    isMuted.value = videoPlayerRef.value.muted
    videoPlayerRef.value.playbackRate = currentSpeed.value
    
    if (showResumePrompt.value) {
      videoPlayerRef.value.pause()
    }
  }
}

const onTimeUpdate = () => {
  if (videoPlayerRef.value) {
    const curr = videoPlayerRef.value.currentTime
    currentTime.value = curr
    
    const buffered = videoPlayerRef.value.buffered
    if (buffered && buffered.length > 0 && duration.value > 0) {
      const lastBufferedEnd = buffered.end(buffered.length - 1)
      bufferedPercentage.value = (lastBufferedEnd / duration.value) * 100
    }

    updateSubtitleDisplay(curr)

    if (isAutoSkipIntro.value && skipIntroDuration.value > 0 && curr < skipIntroDuration.value) {
      videoPlayerRef.value.currentTime = skipIntroDuration.value
      return
    }

    showSkipIntroButton.value = 
      skipIntroDuration.value > 0 && 
      curr < skipIntroDuration.value && 
      !isAutoSkipIntro.value

    // Auto save progress every 2 seconds
    const now = Date.now()
    if (now - lastProgressSaveTime >= 2000 && duration.value > 10) {
      if (curr >= 5 && curr <= duration.value - 10) {
        try {
          localStorage.setItem(`avsub_progress_${code.value}`, JSON.stringify({
            currentTime: curr,
            duration: duration.value,
            percentage: (curr / duration.value) * 100,
            updatedAt: now
          }))
        } catch (e) {}
      } else if (curr > duration.value - 10) {
        try { localStorage.removeItem(`avsub_progress_${code.value}`) } catch (e) {}
      }
      lastProgressSaveTime = now
    }
  }
}

const onDurationChange = () => {
  if (videoPlayerRef.value) {
    duration.value = videoPlayerRef.value.duration || 0
  }
}

const onVolumeChange = () => {
  if (videoPlayerRef.value) {
    volume.value = videoPlayerRef.value.volume
    isMuted.value = videoPlayerRef.value.muted
  }
}

const onVideoEnded = () => {
  try {
    localStorage.removeItem(`avsub_progress_${code.value}`)
  } catch (e) {}
  isPlaying.value = false
}

// ── Startup & Lifecycle ─────────────────────────────────────────────────────
const loadMovieData = async () => {
  loading.value = true
  error.value = null
  try {
    const res = await $fetch<{ success: boolean; source: string; data: JavMetadata | null }>(
      '/api/metadata',
      { query: { code: code.value } }
    )
    if (res?.success && res?.data) {
      metadata.value = res.data
      
      // Auto-start video player if specified
      if (route.query.play === 'true' && res.data.hasLocalVideo) {
        startVideoPlayer()
      }
    } else {
      error.value = `Không tìm thấy thông tin phim với mã: ${code.value}`
    }
  } catch (e: any) {
    error.value = e.message || 'Lỗi khi tải thông tin phim.'
  } finally {
    loading.value = false
  }
}

const startVideoPlayer = () => {
  if (!metadata.value?.hasLocalVideo) return
  
  isMetadataLoaded.value = false
  isPlaying.value = false
  currentTime.value = 0
  duration.value = 0
  bufferedPercentage.value = 0
  
  isMiniPlayer.value = false
  showVideoPlayer.value = true
  
  loadSubtitles(code.value)
  
  // Check progress resume
  showResumePrompt.value = false
  savedProgress.value = null
  try {
    const localData = localStorage.getItem(`avsub_progress_${code.value}`)
    if (localData) {
      const parsed = JSON.parse(localData) as ProgressData
      if (parsed.currentTime >= 5 && parsed.currentTime <= parsed.duration - 10) {
        savedProgress.value = parsed
        showResumePrompt.value = true
        
        if (resumePromptTimeoutId) clearTimeout(resumePromptTimeoutId)
        resumePromptTimeoutId = setTimeout(() => {
          showResumePrompt.value = false
        }, 10000)
      }
    }
  } catch (e) {}
}

const closeVideoPlayer = () => {
  if (duration.value > 10) {
    const current = currentTime.value
    if (current >= 5 && current <= duration.value - 10) {
      try {
        localStorage.setItem(`avsub_progress_${code.value}`, JSON.stringify({
          currentTime: current,
          duration: duration.value,
          percentage: (current / duration.value) * 100,
          updatedAt: Date.now()
        }))
      } catch (e) {}
    } else if (current > duration.value - 10) {
      try { localStorage.removeItem(`avsub_progress_${code.value}`) } catch (e) {}
    }
  }
  showVideoPlayer.value = false
}

// Hotkey handlers
const handlePlayerKeydown = (e: KeyboardEvent) => {
  if (!showVideoPlayer.value) return
  
  const activeEl = document.activeElement
  if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.hasAttribute('contenteditable'))) {
    return
  }

  const key = e.key.toLowerCase()
  if (key === 'escape') {
    e.preventDefault()
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else {
      closeVideoPlayer()
    }
  } else if (e.key === ' ' || key === 'spacebar') {
    e.preventDefault()
    togglePlay()
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    skipBack()
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    skipForward()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (videoPlayerRef.value) {
      videoPlayerRef.value.volume = Math.min(1, videoPlayerRef.value.volume + 0.1)
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (videoPlayerRef.value) {
      videoPlayerRef.value.volume = Math.max(0, videoPlayerRef.value.volume - 0.1)
    }
  } else if (key === 'f') {
    e.preventDefault()
    toggleFullscreen()
  } else if (key === 'p') {
    e.preventDefault()
    togglePiP()
  } else if (key === 'i') {
    e.preventDefault()
    isMiniPlayer.value = !isMiniPlayer.value
  } else if (key === 'm') {
    e.preventDefault()
    toggleMute()
  } else if (key === 'c') {
    e.preventDefault()
    isSubtitlesVisible.value = !isSubtitlesVisible.value
  }
}

// ── Torrent search redirect helper ──────────────────────────────────────────
const searchTorrentOnHome = () => {
  router.push(`/?search=${encodeURIComponent(code.value)}`)
}

// Subtitles Download helper (similar toResultCard apply)
const downloadingSub = ref(false)
const subAppliedMessage = ref<string | null>(null)
const downloadSub = async () => {
  downloadingSub.value = true
  subAppliedMessage.value = null
  try {
    const res = await $fetch<{ success: boolean; movedFiles?: string[]; error?: string }>('/api/download', {
      method: 'POST',
      body: {
        detail_link: `https://www.avsubtitles.com/subtitles.php?search=${encodeURIComponent(code.value)}`,
        keyword: code.value,
        code: code.value
      }
    })
    if (res.success) {
      subAppliedMessage.value = 'Tải phụ đề thành công! Hãy tải lại trang.'
      if (metadata.value) metadata.value.hasSubtitle = true
    } else {
      subAppliedMessage.value = res.error || 'Lỗi không xác định.'
    }
  } catch (err: any) {
    subAppliedMessage.value = err.data?.statusMessage || 'Không tìm thấy phụ đề nào.'
  } finally {
    downloadingSub.value = false
  }
}

onMounted(() => {
  loadSubtitleSettings()
  loadMovieData()
})

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handlePlayerKeydown)
  }
  if (controlsTimeoutId) clearTimeout(controlsTimeoutId)
  if (resumePromptTimeoutId) clearTimeout(resumePromptTimeoutId)
})

watch(showVideoPlayer, (newVal) => {
  if (newVal) {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handlePlayerKeydown)
    }
    triggerControlsActivity()
  } else {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', handlePlayerKeydown)
    }
    isPlayerFullscreen.value = false
    pipActive.value = false
  }
})

// Gallery Lightbox Handlers
const openLightbox = (url: string) => { activeScreenshot.value = url }
const closeLightbox = () => { activeScreenshot.value = null }

const formatVideoTime = (secs: number) => {
  if (isNaN(secs) || secs < 0) return '00:00'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.floor(secs % 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`
  return `${pad(m)}:${pad(s)}`
}
</script>

<template>
  <div class="movie-detail-container min-h-vh w-full pb-12 flex flex-col font-sans select-none bg-[#08070b] text-[#f1f5f9] relative">
    
    <!-- Header Navigation bar -->
    <header class="fixed top-0 inset-x-0 h-16 bg-[#08070b]/60 backdrop-blur-xl border-b border-white/[0.06] z-40 flex items-center justify-between px-6">
      <button 
        class="h-10 px-4 rounded-xl bg-white/5 border border-white/10 text-slate-300 flex items-center gap-2 hover:bg-white/10 hover:text-white transition-all active:scale-95" 
        title="Quay lại trang chính"
        @click="router.push('/')"
      >
        <i class="fa-solid fa-arrow-left text-sm"></i>
        <span class="text-xs font-bold font-sans">Trang Chủ</span>
      </button>

      <span class="text-xs font-mono font-black text-violet-400 uppercase tracking-widest">{{ code }}</span>
    </header>

    <!-- Main Content Area -->
    <main class="flex-1 mt-16 px-4 md:px-8 max-w-6xl mx-auto w-full">
      <!-- Loading State -->
      <div v-if="loading" class="w-full py-32 flex flex-col items-center justify-center gap-4">
        <span class="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"/>
        <span class="text-sm text-slate-400 font-semibold tracking-wide">Đang tải thông tin phim...</span>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="w-full py-24 flex flex-col items-center justify-center text-center max-w-md mx-auto gap-4">
        <div class="w-14 h-14 rounded-full bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-400">
          <i class="fa-solid fa-triangle-exclamation text-2xl"></i>
        </div>
        <h2 class="text-lg font-black text-white">Lỗi kết nối hoặc không tìm thấy dữ liệu</h2>
        <p class="text-xs text-slate-400 leading-normal">{{ error }}</p>
        <button 
          class="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all active:scale-95 shadow-lg shadow-violet-600/25"
          @click="loadMovieData"
        >
          Tải lại dữ liệu
        </button>
      </div>

      <!-- Unified Detail Content -->
      <div v-else-if="metadata" class="relative w-full mt-6">
        
        <!-- Jellyfin Widescreen Featured banner spotlight -->
        <div class="relative w-full h-[280px] sm:h-[380px] rounded-3xl overflow-hidden mb-8 border border-white/[0.06] shadow-2xl flex items-end overflow-hidden">
          <div class="absolute inset-0 z-0 bg-slate-950">
            <!-- 1. Blurred background image to fill space -->
            <img 
              v-if="metadata.coverUrl" 
              :src="metadata.coverUrl" 
              :alt="metadata.title" 
              class="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-30 select-none pointer-events-none"
            >
            <!-- 2. Clean uncropped right-aligned cover -->
            <img 
              v-if="metadata.coverUrl" 
              :src="metadata.coverUrl" 
              :alt="metadata.title" 
              class="absolute right-0 top-0 bottom-0 h-full w-auto max-w-[65%] object-contain z-10 select-none pointer-events-none transition-transform duration-700 hover:scale-102"
            >
            <div class="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/75 to-transparent z-20"/>
            <div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent z-20"/>
          </div>

          <!-- Banner Spotlight details overlay -->
          <div class="relative z-20 p-6 sm:p-10 max-w-3xl flex flex-col items-start gap-3">
            <div class="flex items-center gap-2.5 flex-wrap">
              <span class="px-2.5 py-0.5 rounded-full bg-violet-600/30 border border-violet-500/40 text-violet-300 text-[10px] font-extrabold uppercase tracking-widest">
                {{ metadata.code }}
              </span>
              <span v-if="metadata.hasLocalVideo && metadata.hasSubtitle" class="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[9px] font-extrabold uppercase tracking-widest">
                Sẵn sàng phát
              </span>
              <span v-else-if="metadata.hasLocalVideo" class="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[9px] font-extrabold uppercase tracking-widest">
                Có Video, Chưa Sub
              </span>
            </div>

            <h1 class="text-xl sm:text-3xl font-black text-white leading-tight drop-shadow-md text-left line-clamp-2" :title="metadata.title">
              {{ metadata.title }}
            </h1>

            <p v-if="metadata.originalTitle && metadata.originalTitle !== metadata.title" class="text-xs text-slate-400 italic line-clamp-1 text-left drop-shadow">
              {{ metadata.originalTitle }}
            </p>

            <!-- Spotlight quick action controls -->
            <div class="flex flex-wrap gap-3 mt-3">
              <!-- Play button (If local video is available) -->
              <button 
                v-if="metadata.hasLocalVideo" 
                class="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-2xl font-black text-xs uppercase tracking-wider transition-all active:scale-95 shadow-lg shadow-emerald-500/25 flex items-center gap-1.5"
                @click="startVideoPlayer"
              >
                <i class="fa-solid fa-play text-sm"></i>
                <span>Xem Phim</span>
              </button>

              <!-- Find Torrents (If no local video) -->
              <button 
                v-else
                class="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-all active:scale-95 shadow-lg shadow-sky-600/25 flex items-center gap-1.5"
                @click="searchTorrentOnHome"
              >
                <i class="fa-solid fa-magnifying-glass text-xs"></i>
                <span>Tìm Torrent</span>
              </button>

              <!-- Download sub if local video lacks sub -->
              <button 
                v-if="metadata.hasLocalVideo && !metadata.hasSubtitle"
                class="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-2xl font-black text-xs uppercase tracking-wider transition-all active:scale-95 shadow-lg shadow-amber-500/25 flex items-center gap-1.5 disabled:opacity-50"
                :disabled="downloadingSub"
                @click="downloadSub"
              >
                <span v-if="downloadingSub" class="spinner-mini border-slate-950"/>
                <i v-else class="fa-solid fa-download text-xs"></i>
                <span>Tải Phụ Đề</span>
              </button>
            </div>

            <!-- Subtitle status feedback inside banner -->
            <p v-if="subAppliedMessage" class="text-[10px] font-bold text-amber-400 mt-1 select-text">
              {{ subAppliedMessage }}
            </p>
          </div>
        </div>

        <!-- Details grid system split layout -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          
          <!-- LEFT SIDE: Movie Poster Cover and Basic Quick Stats -->
          <div class="flex flex-col gap-5">
            <div 
              class="w-full rounded-2xl overflow-hidden bg-slate-900 border border-white/10 shadow-2xl relative transition-all duration-300"
              :class="displayPoster === metadata.coverUrl ? 'aspect-[3/2]' : 'aspect-[2/3]'"
            >
              <!-- Blurred background behind landscape cover -->
              <img 
                v-if="displayPoster === metadata.coverUrl"
                :src="displayPoster" 
                class="absolute inset-0 w-full h-full object-cover blur-xl opacity-35 z-0 pointer-events-none select-none"
              >
              <img 
                :src="displayPoster" 
                :alt="metadata.title" 
                class="w-full h-full z-10 relative transition-transform duration-500 hover:scale-102"
                :class="displayPoster === metadata.coverUrl ? 'object-contain' : 'object-cover'"
              >
            </div>

            <div class="bg-slate-900/40 border border-white/[0.08] rounded-2xl p-5 flex flex-col gap-3 text-xs">
              <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2 mb-1">📋 Chi tiết phim</h3>
              
              <div class="flex justify-between items-center py-0.5" v-if="metadata.studio">
                <span class="text-slate-400 font-semibold">Nhà sản xuất:</span>
                <span class="text-slate-200 text-right max-w-[170px] truncate font-medium" :title="metadata.studio">{{ metadata.studio }}</span>
              </div>
              <div class="flex justify-between items-center py-0.5" v-if="metadata.releaseDate">
                <span class="text-slate-400 font-semibold">Ngày phát hành:</span>
                <span class="text-slate-200 font-mono">{{ metadata.releaseDate }}</span>
              </div>
              <div class="flex justify-between items-center py-0.5" v-if="metadata.runtime">
                <span class="text-slate-400 font-semibold">Thời lượng:</span>
                <span class="text-slate-200 font-semibold">{{ metadata.runtime }} phút</span>
              </div>
              <div class="flex justify-between items-center py-0.5" v-if="metadata.series">
                <span class="text-slate-400 font-semibold">Loạt phim (Series):</span>
                <span class="text-slate-200 text-right max-w-[170px] truncate" :title="metadata.series">{{ metadata.series }}</span>
              </div>
              <div class="flex justify-between items-center py-0.5" v-if="metadata.director">
                <span class="text-slate-400 font-semibold">Đạo diễn:</span>
                <span class="text-slate-200">{{ metadata.director }}</span>
              </div>
              <div class="flex justify-between items-center py-0.5" v-if="metadata.ratingScore">
                <span class="text-slate-400 font-semibold">Điểm đánh giá:</span>
                <span class="text-amber-400 font-bold flex items-center gap-1">⭐ {{ metadata.ratingScore.toFixed(1) }} <span class="text-[9px] text-slate-500 font-medium font-sans">({{ metadata.ratingVotes ?? 0 }} vote)</span></span>
              </div>
            </div>
          </div>

          <!-- RIGHT SIDE (Takes 2 cols): Plot Description, Actresses, Genres & Gallery -->
          <div class="md:col-span-2 flex flex-col gap-6">
            
            <!-- Description -->
            <div v-if="metadata.description" class="bg-slate-900/20 border border-white/[0.06] rounded-2xl p-6 flex flex-col gap-3">
              <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2">📖 Tóm tắt cốt truyện</h3>
              <p class="text-sm text-slate-300 leading-relaxed text-left select-text whitespace-pre-line antialiased">{{ metadata.description }}</p>
            </div>

            <!-- Actresses Tag list -->
            <div v-if="metadata.actresses && metadata.actresses.length > 0" class="bg-slate-900/20 border border-white/[0.06] rounded-2xl p-6 flex flex-col gap-3.5">
              <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2">👤 Diễn viên tham gia</h3>
              <div class="flex flex-wrap gap-2.5">
                <span 
                  v-for="actress in metadata.actresses" 
                  :key="actress" 
                  class="px-3.5 py-1.5 rounded-full bg-amber-500/5 hover:bg-amber-500/10 text-amber-300 border border-amber-500/15 hover:border-amber-500/30 text-xs font-extrabold cursor-pointer transition-all active:scale-95 shadow-md flex items-center gap-1.5"
                  @click="router.push(`/?search=${encodeURIComponent(actress)}`)"
                >
                  <i class="fa-regular fa-user text-amber-300"></i>
                  <span>{{ actress }}</span>
                </span>
              </div>
            </div>

            <!-- Genre list -->
            <div v-if="metadata.genres && metadata.genres.length > 0" class="bg-slate-900/20 border border-white/[0.06] rounded-2xl p-6 flex flex-col gap-3.5">
              <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2">🏷️ Thể loại (Genres)</h3>
              <div class="flex flex-wrap gap-1.5">
                <span 
                  v-for="genre in metadata.genres" 
                  :key="genre" 
                  class="px-2.5 py-0.5 rounded-full bg-slate-800/60 hover:bg-slate-800 border border-slate-700/40 text-slate-400 hover:text-slate-300 text-[10.5px] font-bold cursor-pointer transition-all active:scale-95"
                  @click="router.push(`/?genre=${encodeURIComponent(genre)}`)"
                >
                  #{{ genre }}
                </span>
              </div>
            </div>

            <!-- Screenshots Media snaps Gallery (Widescreen Snapping Carousel) -->
            <div v-if="metadata.screenshots && metadata.screenshots.length > 0" class="bg-slate-900/20 border border-white/[0.06] rounded-2xl p-6 flex flex-col gap-4">
              <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2 flex items-center justify-between">
                <span>📷 Album Hình Ảnh ({{ metadata.screenshots.length }} Screens)</span>
                <span class="w-2.5 h-2.5 rounded-full bg-violet-600 animate-pulse shadow-[0_0_8px_#8b5cf6]"/>
              </h3>
              
              <div class="scrollbar-hide flex overflow-x-auto gap-3.5 snap-x snap-mandatory rounded-2xl py-1.5 scroll-smooth">
                <div 
                  v-for="img in metadata.screenshots" 
                  :key="img" 
                  class="relative flex-none w-[180px] sm:w-[220px] aspect-[16/10] rounded-2xl overflow-hidden bg-slate-950 snap-start cursor-pointer border border-white/[0.06] hover:border-violet-500/40 hover:scale-[1.02] transition-all duration-300 shadow-lg group/gallery-item"
                  @click="openLightbox(img)"
                >
                  <img 
                    :src="img" 
                    class="w-full h-full object-cover transition-all duration-500 group-hover/gallery-item:brightness-110 select-none" 
                    style="-webkit-user-drag: none;"
                    loading="lazy" 
                    alt="Movie Screenshot"
                  >
                  <div class="absolute inset-0 bg-black/25 opacity-0 group-hover/gallery-item:opacity-100 transition-opacity flex items-center justify-center">
                    <i class="fa-solid fa-magnifying-glass-plus text-xl text-white drop-shadow"></i>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </main>

    <!-- ── Fullscreen Widescreen Screenshot Lightbox ────────────────────────── -->
    <Teleport to="body">
      <Transition name="lightbox-fade">
        <div 
          v-if="activeScreenshot" 
          class="fixed inset-0 z-[10000] flex flex-col justify-between bg-black/95 backdrop-blur-2xl px-4 py-6 select-none"
          @click="closeLightbox"
        >
          <!-- Top bar layout -->
          <div class="w-full max-w-5xl mx-auto flex justify-between items-center z-10">
            <div class="flex flex-col min-w-0">
              <h3 class="text-xs font-mono font-extrabold text-violet-400 tracking-widest uppercase">
                {{ code }}
              </h3>
              <span class="text-[10px] text-slate-400 truncate max-w-[280px] sm:max-w-md">
                {{ metadata?.title }}
              </span>
            </div>
            
            <!-- Close button -->
            <button 
              class="w-10 h-10 rounded-full bg-white/5 border border-white/10 text-slate-300 flex items-center justify-center hover:bg-white/10 hover:text-white transition-all active:scale-90" 
              @click="closeLightbox"
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
              class="max-h-[80vh] max-w-full object-contain rounded-2xl shadow-3xl border border-white/5 animate-lightbox-zoom antialiased"
              style="-webkit-user-drag: none;"
              @click.stop
            >
          </div>
  
          <!-- Lightbox footer prompt -->
          <div class="text-center text-[10px] text-slate-500 font-semibold tracking-wider z-10">
            CHẠM BẤT KỲ ĐÂU ĐỂ ĐÓNG PREVIEW
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ── Dedicated Premium Plex-Style Custom Video Player Modal ────────────── -->
    <Teleport to="body">
      <Transition name="lightbox-fade">
        <div 
          v-if="showVideoPlayer" 
          class="fixed inset-0 z-[10000] flex flex-col bg-black/95 items-center justify-center p-4 sm:p-8 pointer-events-auto"
        >
          <!-- Close button -->
          <button 
            class="absolute top-4 right-4 z-50 w-10 h-10 rounded-full bg-slate-950/80 border border-white/10 text-slate-300 flex items-center justify-center hover:bg-rose-500/20 hover:text-rose-400 hover:border-rose-500/30 transition-all active:scale-90 shadow-lg" 
            title="Đóng trình phát (Esc)"
            @click.stop="closeVideoPlayer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <!-- Glassmorphic iOS 26 PWA Custom Player Component -->
          <div class="w-full max-w-5xl rounded-2xl overflow-hidden shadow-2xl border border-white/5 bg-slate-950 relative">
            <CustomPlayer 
              :src="`/api/play/video?code=${encodeURIComponent(code)}`"
              :title="metadata?.title || code"
              :subtitle-tracks="playerSubtitles"
              :start-time="startSeekTime"
              @timeupdate="(time) => currentTime = time"
              @loadedmetadata="(d) => duration = d"
            />
            
            <!-- Watch Progress Resume Prompt overlay -->
            <Transition name="fade">
              <div 
                v-if="showResumePrompt && savedProgress" 
                class="absolute bottom-20 left-4 z-40 bg-slate-950/95 border border-violet-500/30 rounded-xl p-4 flex flex-col gap-2.5 backdrop-blur-md shadow-2xl max-w-xs sm:max-w-sm pointer-events-auto"
                @click.stop
              >
                <div class="flex items-start gap-2.5">
                  <span class="w-8 h-8 rounded-full bg-violet-600/20 text-violet-400 flex items-center justify-center shrink-0">⏳</span>
                  <div class="flex flex-col">
                    <span class="text-xs font-bold text-slate-100">Tiếp tục xem phim?</span>
                    <span class="text-[10px] text-slate-400 mt-0.5">Bạn đang xem dở tại {{ formatVideoTime(savedProgress.currentTime) }} (khoảng {{ Math.round(savedProgress.percentage) }}%).</span>
                  </div>
                </div>
                <div class="flex gap-2">
                  <button 
                    class="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[10px] font-bold shadow-lg shadow-violet-600/25 transition-all active:scale-95"
                    @click="handleResumeProgress(true)"
                  >
                    Phát tiếp
                  </button>
                  <button 
                    class="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 text-[10px] font-bold transition-all active:scale-95"
                    @click="handleResumeProgress(false)"
                  >
                    Xem từ đầu
                  </button>
                </div>
              </div>
            </Transition>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* Snapping carousel hidden scrollbar styling */
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
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

.lightbox-fade-enter-active,
.lightbox-fade-leave-active {
  transition: opacity 0.25s ease;
}
.lightbox-fade-enter-from,
.lightbox-fade-leave-to {
  opacity: 0;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

/* Shimmer Loader animation */
@keyframes shimmer {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}

.animate-shimmer {
  animation: shimmer 2s linear infinite;
}
</style>