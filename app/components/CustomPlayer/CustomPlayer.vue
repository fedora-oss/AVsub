<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import type { SubtitleTrack, PlaybackSpeed } from './types'

// Props
interface Props {
  src: string
  title?: string
  subtitleTracks?: SubtitleTrack[]
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Custom Media Stream',
  subtitleTracks: () => []
})

// Emits
const emit = defineEmits<{
  play: []
  pause: []
  fullscreen: [isFs: boolean]
  timeupdate: [time: number]
}>()

// DOM Refs
const playerContainer = ref<HTMLDivElement | null>(null)
const videoElement = ref<HTMLVideoElement | null>(null)
const timelineContainer = ref<HTMLDivElement | null>(null)

// Player States
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(1.0)
const isMuted = ref(false)
const playbackRate = ref(1.0)
const isFullscreen = ref(false)
const isBuffering = ref(false)
const currentSubtitleText = ref('')
const activeSubtitleTrackId = ref<string | null>('off')

// UI States
const isControlsVisible = ref(true)
const showSpeedMenu = ref(false)
const showSubtitlesMenu = ref(false)
const hoverTime = ref(0)
const hoverX = ref(0)
const isHoveringTimeline = ref(false)
const isDraggingTimeline = ref(false)

// Gesture Seeking visual feedback
const leftRippleActive = ref(false)
const rightRippleActive = ref(false)
let leftRippleTimeout: NodeJS.Timeout | null = null
let rightRippleTimeout: NodeJS.Timeout | null = null

// Playback Speeds Definition (Strictly adhering to clean specifications)
const speeds: PlaybackSpeed[] = [
  { label: '0.5x', value: 0.5 },
  { label: '1.0x', value: 1.0 },
  { label: '1.25x', value: 1.25 },
  { label: '1.5x', value: 1.5 },
  { label: '2.0x', value: 2.0 }
]

// Idle hiding timer
let idleTimer: NodeJS.Timeout | null = null

// Click handling for single click vs double tap seek
let clickTimeout: NodeJS.Timeout | null = null

// Helper: Format Time into HH:MM:SS or MM:SS
const formatTime = (seconds: number) => {
  if (isNaN(seconds) || seconds === Infinity) return '00:00'
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  
  const pad = (n: number) => n.toString().padStart(2, '0')
  
  if (hrs > 0) {
    return `${hrs}:${pad(mins)}:${pad(secs)}`
  }
  return `${pad(mins)}:${pad(secs)}`
}

// Media Play / Pause control
const togglePlay = () => {
  if (!videoElement.value) return
  if (videoElement.value.paused) {
    videoElement.value.play().then(() => {
      isPlaying.value = true
      emit('play')
    }).catch(err => {
      console.warn('Autoplay or manual play blocked:', err)
    })
  } else {
    videoElement.value.pause()
    isPlaying.value = false
    emit('pause')
  }
}

const onPlayStateChange = (playing: boolean) => {
  isPlaying.value = playing
  resetIdleTimer()
}

// Volume Controls
const toggleMute = () => {
  if (!videoElement.value) return
  isMuted.value = !isMuted.value
  videoElement.value.muted = isMuted.value
  resetIdleTimer()
}

const onVolumeInput = (e: Event) => {
  const target = e.target as HTMLInputElement
  const val = parseFloat(target.value)
  volume.value = val
  if (videoElement.value) {
    videoElement.value.volume = val
    videoElement.value.muted = val === 0
    isMuted.value = val === 0
  }
  resetIdleTimer()
}

// Speed Adjustment
const setPlaybackRate = (rate: number) => {
  playbackRate.value = rate
  if (videoElement.value) {
    videoElement.value.playbackRate = rate
  }
  showSpeedMenu.value = false
  resetIdleTimer()
}

// Absolute Fullscreen Logic with strict iOS Custom Bypass
const toggleFullscreen = async () => {
  if (!playerContainer.value) return
  
  const checkIOS = () => {
    if (!import.meta.client) return false
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  }
  
  if (checkIOS()) {
    // Bypassing native AVPlayer trigger: Toggle local pseudo-fullscreen layout styles
    isFullscreen.value = !isFullscreen.value
    emit('fullscreen', isFullscreen.value)
    resetIdleTimer()
    return
  }
  
  // Desktop/Android: Use Fullscreen API on player container wrapper
  try {
    if (!document.fullscreenElement) {
      await playerContainer.value.requestFullscreen()
      isFullscreen.value = true
    } else {
      await document.exitFullscreen()
      isFullscreen.value = false
    }
    emit('fullscreen', isFullscreen.value)
  } catch (err) {
    console.warn('Standard HTML5 Fullscreen failed, falling back to Pseudo-Fullscreen:', err)
    isFullscreen.value = !isFullscreen.value
    emit('fullscreen', isFullscreen.value)
  }
  resetIdleTimer()
}

// Synchronize body scroll locks with pseudo-fullscreen state
watch(isFullscreen, (val) => {
  if (val) {
    document.body.style.overflow = 'hidden'
  } else {
    document.body.style.overflow = ''
  }
})

// Listen to Escape/Native exits in standard browsers
const handleFullscreenChange = () => {
  isFullscreen.value = !!document.fullscreenElement
}

// Keyboard controls
const handleKeyDown = (e: KeyboardEvent) => {
  const activeEl = document.activeElement
  if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
    return
  }
  
  switch (e.key.toLowerCase()) {
    case ' ':
    case 'k':
      e.preventDefault()
      togglePlay()
      break
    case 'arrowleft':
      e.preventDefault()
      seekRelative(-10)
      break
    case 'arrowright':
      e.preventDefault()
      seekRelative(10)
      break
    case 'arrowup':
      e.preventDefault()
      adjustVolume(0.1)
      break
    case 'arrowdown':
      e.preventDefault()
      adjustVolume(-0.1)
      break
    case 'm':
      e.preventDefault()
      toggleMute()
      break
    case 'f':
      e.preventDefault()
      toggleFullscreen()
      break
  }
}

const adjustVolume = (delta: number) => {
  let newVol = volume.value + delta
  if (newVol < 0) newVol = 0
  if (newVol > 1) newVol = 1
  volume.value = newVol
  if (videoElement.value) {
    videoElement.value.volume = newVol
  }
  isMuted.value = newVol === 0
  resetIdleTimer()
}

// Seek handlers
const seekRelative = (seconds: number) => {
  if (!videoElement.value) return
  let target = videoElement.value.currentTime + seconds
  if (target < 0) target = 0
  if (target > duration.value) target = duration.value
  videoElement.value.currentTime = target
  currentTime.value = target
  resetIdleTimer()
}

// Double tap/click left and right seek overlays
const handleLeftClick = () => {
  if (clickTimeout) {
    clearTimeout(clickTimeout)
    clickTimeout = null
    // Double tap seeking triggered
    seekRelative(-10)
    triggerLeftFeedback()
  } else {
    clickTimeout = setTimeout(() => {
      clickTimeout = null
      togglePlay()
    }, 250)
  }
}

const handleRightClick = () => {
  if (clickTimeout) {
    clearTimeout(clickTimeout)
    clickTimeout = null
    // Double tap seeking triggered
    seekRelative(10)
    triggerRightFeedback()
  } else {
    clickTimeout = setTimeout(() => {
      clickTimeout = null
      togglePlay()
    }, 250)
  }
}

const triggerLeftFeedback = () => {
  leftRippleActive.value = true
  if (leftRippleTimeout) clearTimeout(leftRippleTimeout)
  leftRippleTimeout = setTimeout(() => {
    leftRippleActive.value = false
  }, 600)
}

const triggerRightFeedback = () => {
  rightRippleActive.value = true
  if (rightRippleTimeout) clearTimeout(rightRippleTimeout)
  rightRippleTimeout = setTimeout(() => {
    rightRippleActive.value = false
  }, 600)
}

// Timeline scrubbers
const onTimeUpdate = () => {
  if (!videoElement.value) return
  currentTime.value = videoElement.value.currentTime
  emit('timeupdate', currentTime.value)
}

const onLoadedMetadata = () => {
  if (!videoElement.value) return
  duration.value = videoElement.value.duration
  setupSubtitles()
}

const bufferedEnd = ref(0)
const onProgress = () => {
  if (!videoElement.value || videoElement.value.buffered.length === 0) return
  const end = videoElement.value.buffered.end(videoElement.value.buffered.length - 1)
  bufferedEnd.value = end
}

// Range scrubber clicks & drags
const onTimelineMouseDown = (e: MouseEvent) => {
  isDraggingTimeline.value = true
  handleTimelineDrag(e)
  window.addEventListener('mousemove', onTimelineMouseMove)
  window.addEventListener('mouseup', onTimelineMouseUp)
}

const onTimelineMouseMove = (e: MouseEvent) => {
  if (isDraggingTimeline.value) {
    handleTimelineDrag(e)
  }
}

const onTimelineMouseUp = () => {
  if (isDraggingTimeline.value) {
    isDraggingTimeline.value = false
    window.removeEventListener('mousemove', onTimelineMouseMove)
    window.removeEventListener('mouseup', onTimelineMouseUp)
  }
  resetIdleTimer()
}

const handleTimelineDrag = (e: MouseEvent) => {
  if (!timelineContainer.value || !videoElement.value || duration.value === 0) return
  const rect = timelineContainer.value.getBoundingClientRect()
  let clickX = e.clientX - rect.left
  if (clickX < 0) clickX = 0
  if (clickX > rect.width) clickX = rect.width
  const pct = clickX / rect.width
  const targetTime = pct * duration.value
  videoElement.value.currentTime = targetTime
  currentTime.value = targetTime
}

// Timeline mobile touch drag support
const onTimelineTouchStart = (e: TouchEvent) => {
  isDraggingTimeline.value = true
  handleTimelineTouchDrag(e)
  window.addEventListener('touchmove', onTimelineTouchMove)
  window.addEventListener('touchend', onTimelineTouchEnd)
}

const onTimelineTouchMove = (e: TouchEvent) => {
  if (isDraggingTimeline.value) {
    handleTimelineTouchDrag(e)
  }
}

const onTimelineTouchEnd = () => {
  if (isDraggingTimeline.value) {
    isDraggingTimeline.value = false
    window.removeEventListener('touchmove', onTimelineTouchMove)
    window.removeEventListener('touchend', onTimelineTouchEnd)
  }
  resetIdleTimer()
}

const handleTimelineTouchDrag = (e: TouchEvent) => {
  if (!timelineContainer.value || !videoElement.value || duration.value === 0) return
  const rect = timelineContainer.value.getBoundingClientRect()
  const touch = e.touches[0]
  let clickX = touch.clientX - rect.left
  if (clickX < 0) clickX = 0
  if (clickX > rect.width) clickX = rect.width
  const pct = clickX / rect.width
  const targetTime = pct * duration.value
  videoElement.value.currentTime = targetTime
  currentTime.value = targetTime
}

// Hover timeline display helper
const updateTimelineHover = (e: MouseEvent) => {
  if (!timelineContainer.value || duration.value === 0) return
  const rect = timelineContainer.value.getBoundingClientRect()
  let x = e.clientX - rect.left
  if (x < 0) x = 0
  if (x > rect.width) x = rect.width
  hoverX.value = x
  hoverTime.value = (x / rect.width) * duration.value
}

// Subtitles parsing & listening on text track cuechanges
const setupSubtitles = () => {
  if (!videoElement.value) return
  const tracks = videoElement.value.textTracks
  
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i]
    
    // De-activate native UI rendering (Safari will draw it if standard CC is selected)
    // Mode 'hidden' means cue events fire but native overlay boxes do NOT render!
    const matchingProp = props.subtitleTracks.find(t => t.label === track.label)
    if (matchingProp && activeSubtitleTrackId.value === matchingProp.id) {
      track.mode = 'hidden'
    } else {
      track.mode = 'disabled'
    }
    
    track.oncuechange = () => {
      if (track.mode === 'hidden') {
        const activeCues = track.activeCues
        if (activeCues && activeCues.length > 0) {
          // XSS Protection: Dynamic string parsed via Vue double-mustaches is auto-escaped!
          currentSubtitleText.value = (activeCues[0] as VTTCue).text
        } else {
          currentSubtitleText.value = ''
        }
      }
    }
  }
}

const setSubtitleTrack = (trackId: string | null) => {
  activeSubtitleTrackId.value = trackId
  showSubtitlesMenu.value = false
  
  if (!videoElement.value) return
  const tracks = videoElement.value.textTracks
  
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i]
    const matchingProp = props.subtitleTracks.find(t => t.id === trackId)
    
    if (matchingProp && matchingProp.label === track.label) {
      track.mode = 'hidden'
    } else {
      track.mode = 'disabled'
      if (track.oncuechange) {
        currentSubtitleText.value = ''
      }
    }
  }
  
  if (trackId === 'off' || !trackId) {
    currentSubtitleText.value = ''
  }
  resetIdleTimer()
}

// Inactivity and hiding controller elements
const resetIdleTimer = () => {
  isControlsVisible.value = true
  if (idleTimer) clearTimeout(idleTimer)
  
  // Hide only if playing
  if (isPlaying.value) {
    idleTimer = setTimeout(() => {
      isControlsVisible.value = false
      showSpeedMenu.value = false
      showSubtitlesMenu.value = false
    }, 3000)
  }
}

const handleMouseMove = () => {
  resetIdleTimer()
}

const handleMouseLeave = () => {
  if (isPlaying.value) {
    isControlsVisible.value = false
    showSpeedMenu.value = false
    showSubtitlesMenu.value = false
  }
}

// Progress metrics computed
const timelineProgressPct = computed(() => {
  if (duration.value === 0) return 0
  return (currentTime.value / duration.value) * 100
})

const timelineBufferedPct = computed(() => {
  if (duration.value === 0) return 0
  return (bufferedEnd.value / duration.value) * 100
})

onMounted(() => {
  document.addEventListener('fullscreenchange', handleFullscreenChange)
  window.addEventListener('keydown', handleKeyDown)
  setupSubtitles()
  resetIdleTimer()
})

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
  window.removeEventListener('keydown', handleKeyDown)
  if (idleTimer) clearTimeout(idleTimer)
  if (clickTimeout) clearTimeout(clickTimeout)
  if (leftRippleTimeout) clearTimeout(leftRippleTimeout)
  if (rightRippleTimeout) clearTimeout(rightRippleTimeout)
  document.body.style.overflow = ''
})
</script>

<template>
  <div 
    ref="playerContainer"
    class="custom-player relative bg-black select-none overflow-hidden transition-all duration-300 border border-zinc-900"
    :class="[
      isFullscreen ? 'fixed inset-0 w-screen h-screen z-[9999]' : 'relative w-full aspect-video shadow-2xl',
      isControlsVisible ? 'cursor-default' : 'cursor-none'
    ]"
    @mousemove="handleMouseMove"
    @mouseleave="handleMouseLeave"
  >
    <!-- HTML5 Video Component -->
    <!-- Playsinline + webkit-playsinline to bypass default Apple media overlays -->
    <video
      ref="videoElement"
      class="w-full h-full object-contain cursor-pointer"
      :src="src"
      playsinline
      webkit-playsinline
      :muted="isMuted"
      @play="onPlayStateChange(true)"
      @pause="onPlayStateChange(false)"
      @timeupdate="onTimeUpdate"
      @loadedmetadata="onLoadedMetadata"
      @progress="onProgress"
      @waiting="isBuffering = true"
      @playing="isBuffering = false"
      @click="togglePlay"
    >
      <track 
        v-for="track in subtitleTracks" 
        :key="track.id" 
        :src="track.src" 
        :label="track.label" 
        :srclang="track.srclang" 
        kind="subtitles"
        :default="track.default"
      >
    </video>

    <!-- Buffer Spinner Indicator -->
    <div v-if="isBuffering" class="absolute inset-0 flex items-center justify-center bg-black/40 z-20 pointer-events-none">
      <svg class="animate-spin h-12 w-12 text-[#e50914]" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
      </svg>
    </div>

    <!-- Double Tap Seek Gesture Overlays -->
    <div class="absolute inset-x-0 top-16 bottom-20 flex z-10 pointer-events-auto">
      <div 
        class="w-1/2 h-full relative" 
        @click.stop="handleLeftClick"
      >
        <!-- Double Click ripple indicator -->
        <transition name="fade">
          <div v-if="leftRippleActive" class="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-red-600/15 to-transparent flex items-center justify-center text-white font-medium select-none pointer-events-none">
            <div class="flex flex-col items-center gap-2 transform translate-x-2">
              <svg class="w-10 h-10 animate-pulse text-[#e50914]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/>
              </svg>
              <span class="text-sm font-bold tracking-widest text-[#e50914]">-10 SEC</span>
            </div>
          </div>
        </transition>
      </div>
      
      <div 
        class="w-1/2 h-full relative" 
        @click.stop="handleRightClick"
      >
        <!-- Double Click ripple indicator -->
        <transition name="fade">
          <div v-if="rightRippleActive" class="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-red-600/15 to-transparent flex items-center justify-center text-white font-medium select-none pointer-events-none">
            <div class="flex flex-col items-center gap-2 transform -translate-x-2">
              <svg class="w-10 h-10 animate-pulse text-[#e50914]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/>
              </svg>
              <span class="text-sm font-bold tracking-widest text-[#e50914]">+10 SEC</span>
            </div>
          </div>
        </transition>
      </div>
    </div>

    <!-- Customized Subtitle Text Frame -->
    <!-- XSS-Safe: Vue standard double-braces escape dangerous tags completely -->
    <div 
      v-if="currentSubtitleText && activeSubtitleTrackId !== 'off'" 
      class="absolute bottom-28 left-1/2 -translate-x-1/2 px-5 py-2.5 bg-black/85 text-white text-base md:text-lg font-normal text-center rounded-none border border-zinc-900 max-w-[85%] z-20 pointer-events-none select-none tracking-wide shadow-2xl leading-relaxed"
    >
      {{ currentSubtitleText }}
    </div>

    <!-- Dynamic Custom Title Bar (Top Overlay) -->
    <transition name="slide-down">
      <div 
        v-if="isControlsVisible" 
        class="absolute top-0 inset-x-0 h-20 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between px-6 z-30 pointer-events-auto"
      >
        <div class="flex items-center gap-4">
          <!-- Back button if in Pseudo Fullscreen -->
          <button 
            v-if="isFullscreen"
            class="text-white hover:text-[#e50914] transition-colors p-1" 
            title="Exit Fullscreen"
            @click="toggleFullscreen"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          
          <div class="flex flex-col">
            <span class="text-white font-semibold text-base md:text-lg tracking-wide uppercase">{{ title }}</span>
            <span v-if="isPlaying" class="text-[10px] text-[#e50914] font-bold tracking-widest uppercase animate-pulse">NOW PLAYING</span>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-xs text-zinc-500 font-medium bg-zinc-900 border border-zinc-800 px-2 py-1 tracking-wider uppercase">CUSTOM PLAYER</span>
        </div>
      </div>
    </transition>

    <!-- Custom Controls Deck Overlay (Bottom) -->
    <transition name="slide-up">
      <div 
        v-if="isControlsVisible" 
        class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black via-black/75 to-transparent pt-12 pb-6 px-6 z-30 pointer-events-auto flex flex-col gap-4"
      >
        <!-- Timeline Slider Seek Deck -->
        <div 
          ref="timelineContainer"
          class="timeline-container relative h-1.5 w-full bg-zinc-800 cursor-pointer transition-all duration-200 group hover:h-2.5"
          @mousedown="onTimelineMouseDown"
          @touchstart="onTimelineTouchStart"
          @mousemove="updateTimelineHover"
        >
          <!-- Hover Timeline Preview -->
          <div 
            v-if="isHoveringTimeline && duration > 0"
            class="absolute bottom-6 bg-zinc-950 border border-zinc-800 text-white text-[11px] font-mono px-2 py-1 -translate-x-1/2 pointer-events-none select-none tracking-widest"
            :style="{ left: `${hoverX}px` }"
          >
            {{ formatTime(hoverTime) }}
          </div>

          <!-- Buffered line -->
          <div 
            class="absolute top-0 bottom-0 left-0 bg-zinc-700 pointer-events-none transition-all duration-100"
            :style="{ width: `${timelineBufferedPct}%` }"
          />

          <!-- Completed progress line (Netflix Accent Crimson) -->
          <div 
            class="absolute top-0 bottom-0 left-0 bg-[#e50914] pointer-events-none"
            :style="{ width: `${timelineProgressPct}%` }"
          />

          <!-- Handle indicator knob -->
          <div 
            class="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white border border-[#e50914] rounded-none scale-0 group-hover:scale-100 transition-transform duration-100"
            :style="{ left: `calc(${timelineProgressPct}% - 7px)` }"
          />
        </div>

        <!-- Lower controls dashboard -->
        <div class="flex items-center justify-between">
          <!-- Left side controls (Playback + Volume) -->
          <div class="flex items-center gap-6">
            <!-- Play/Pause Toggle -->
            <button 
              class="text-white hover:text-[#e50914] transition-all transform active:scale-95 duration-100" 
              :title="isPlaying ? 'Pause (Space)' : 'Play (Space)'"
              @click="togglePlay"
            >
              <svg v-if="isPlaying" class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
              </svg>
              <svg v-else class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </button>

            <!-- Volume speaker + slider layout -->
            <div class="flex items-center gap-2 group/volume relative">
              <button 
                class="text-white hover:text-[#e50914] transition-colors" 
                title="Mute / Unmute"
                @click="toggleMute"
              >
                <!-- Dynamic mute/low/high speaker SVGs -->
                <svg v-if="isMuted || volume === 0" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
                <svg v-else-if="volume < 0.5" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072M12 18.75V5.25L7.75 9.5H4.5V14.5H7.75L12 18.75Z" />
                </svg>
                <svg v-else class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 8a8.001 8.001 0 010 8M15.536 8.464a5 5 0 010 7.072M12 18.75V5.25L7.75 9.5H4.5V14.5H7.75L12 18.75Z" />
                </svg>
              </button>
              
              <!-- Smooth volume input scrub -->
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.05" 
                :value="isMuted ? 0 : volume" 
                aria-label="Volume"
                class="w-0 overflow-hidden group-hover/volume:w-20 transition-all duration-300 accent-[#e50914] bg-zinc-800 h-1 cursor-pointer"
                @input="onVolumeInput"
              >
            </div>

            <!-- Playback Timer labels -->
            <div class="text-xs text-zinc-300 font-mono tracking-widest select-none">
              <span>{{ formatTime(currentTime) }}</span>
              <span class="mx-2 text-zinc-600">/</span>
              <span class="text-zinc-500">{{ formatTime(duration) }}</span>
            </div>
          </div>

          <!-- Right side controls (Menus + Fullscreen) -->
          <div class="flex items-center gap-6">
            
            <!-- Playback Speed Option Menu -->
            <div class="relative">
              <button 
                class="text-zinc-300 hover:text-white text-xs font-bold tracking-widest uppercase py-1 border-b border-transparent hover:border-[#e50914] transition-all"
                title="Playback Speed"
                @click.stop="showSpeedMenu = !showSpeedMenu; showSubtitlesMenu = false"
              >
                {{ playbackRate === 1.0 ? 'SPEED' : `${playbackRate}x` }}
              </button>
              
              <transition name="fade">
                <div 
                  v-if="showSpeedMenu"
                  class="absolute bottom-10 right-0 w-32 bg-zinc-950 border border-zinc-900 py-1.5 z-40 shadow-2xl"
                >
                  <button 
                    v-for="s in speeds" 
                    :key="s.value"
                    class="w-full text-left px-4 py-2 text-xs font-mono tracking-wider hover:bg-zinc-900 transition-colors"
                    :class="playbackRate === s.value ? 'text-[#e50914] font-bold border-l-2 border-[#e50914]' : 'text-zinc-300'"
                    @click="setPlaybackRate(s.value)"
                  >
                    {{ s.label }}
                  </button>
                </div>
              </transition>
            </div>

            <!-- Subtitle/CC Toggler Menu -->
            <div class="relative">
              <button 
                class="transition-colors hover:text-[#e50914]"
                :class="activeSubtitleTrackId !== 'off' ? 'text-[#e50914]' : 'text-zinc-300'"
                title="Subtitles/CC Selection"
                @click.stop="showSubtitlesMenu = !showSubtitlesMenu; showSpeedMenu = false"
              >
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
              </button>

              <transition name="fade">
                <div 
                  v-if="showSubtitlesMenu"
                  class="absolute bottom-10 right-0 w-44 bg-zinc-950 border border-zinc-900 py-1.5 z-40 shadow-2xl"
                >
                  <!-- OFF selection -->
                  <button 
                    class="w-full text-left px-4 py-2 text-xs tracking-widest font-semibold hover:bg-zinc-900 transition-colors"
                    :class="activeSubtitleTrackId === 'off' ? 'text-[#e50914] border-l-2 border-[#e50914]' : 'text-zinc-300'"
                    @click="setSubtitleTrack('off')"
                  >
                    SUBTITLES OFF
                  </button>

                  <!-- Dynamic VTT subtitle list -->
                  <button 
                    v-for="track in subtitleTracks" 
                    :key="track.id"
                    class="w-full text-left px-4 py-2 text-xs uppercase tracking-wider hover:bg-zinc-900 transition-colors"
                    :class="activeSubtitleTrackId === track.id ? 'text-[#e50914] font-bold border-l-2 border-[#e50914]' : 'text-zinc-300'"
                    @click="setSubtitleTrack(track.id)"
                  >
                    {{ track.label }} ({{ track.srclang }})
                  </button>
                </div>
              </transition>
            </div>

            <!-- Fullscreen Toggler (Bypasses iOS natively) -->
            <button 
              class="text-zinc-300 hover:text-white transition-colors" 
              :title="isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'"
              @click="toggleFullscreen"
            >
              <svg v-if="isFullscreen" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 14h6v6m10-6h-6v6M4 10h6V4m10 6h-6V4" />
              </svg>
              <svg v-else class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4h4m12 0h-4v4m0 12h4v-4M4 16v4h4" />
              </svg>
            </button>

          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
/* Cinema Nocturne Transitions & Animations */

/* Slide animations for overlays */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
}
.slide-down-enter-from,
.slide-down-leave-to {
  transform: translateY(-20px);
  opacity: 0;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(20px);
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Timeline Knobs and animations */
.timeline-container:hover .timeline-knob {
  transform: scale(1);
}

/* Custom styled ranges */
input[type="range"]::-webkit-slider-runnable-track {
  background: transparent;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 10px;
  height: 10px;
  border-radius: 0px;
  background: #e50914;
  cursor: pointer;
  margin-top: -3px;
}
</style>
