<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import type { SubtitleTrack } from '../../components/CustomPlayer/types'
import VideoCanvas from './VideoCanvas.vue'
import TimelineScrubber from './TimelineScrubber.vue'
import SubtitleOverlay from './SubtitleOverlay.vue'
import ControlsDeck from './ControlsDeck.vue'

interface Props {
  src: string
  title?: string
  subtitleTracks?: SubtitleTrack[]
  startTime?: number
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Custom Media Stream',
  subtitleTracks: () => [],
  startTime: 0
})

const emit = defineEmits<{
  play: []
  pause: []
  fullscreen: [isFs: boolean]
  timeupdate: [time: number]
  loadedmetadata: [duration: number]
}>()

// DOM References
const playerContainer = ref<HTMLDivElement | null>(null)
const videoCanvas = ref<InstanceType<typeof VideoCanvas> | null>(null)
const controlsDeck = ref<InstanceType<typeof ControlsDeck> | null>(null)

// Core Player States
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(1.0)
const isMuted = ref(false)
const playbackRate = ref(1.0)
const isFullscreen = ref(false)
const bufferedEnd = ref(0)
const currentSubtitleText = ref('')
const activeSubtitleTrackId = ref<string | null>('off')

// UI Visibility States
const isControlsVisible = ref(true)
const isDraggingTimeline = ref(false)
let idleTimer: NodeJS.Timeout | null = null

// Helper to check for Apple iOS / Safari
const checkIOS = () => {
  if (!import.meta.client) return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

// Media Play / Pause Controls
const play = () => {
  const video = videoCanvas.value?.video
  if (video) {
    video.play().then(() => {
      isPlaying.value = true
      emit('play')
    }).catch(err => {
      console.warn('Autoplay or manual play blocked by browser policies:', err)
    })
  }
}

const pause = () => {
  const video = videoCanvas.value?.video
  if (video) {
    video.pause()
    isPlaying.value = false
    emit('pause')
  }
}

const togglePlay = () => {
  if (isPlaying.value) {
    pause()
  } else {
    play()
  }
}

// Volume Controls
const toggleMute = () => {
  isMuted.value = !isMuted.value
  resetIdleTimer()
}

const setVolume = (val: number) => {
  volume.value = val
  isMuted.value = val === 0
  resetIdleTimer()
}

// Fullscreen API & Custom iOS Pseudo-Fullscreen Bypass
const toggleFullscreen = async () => {
  if (!playerContainer.value) return
  
  if (checkIOS()) {
    // Custom iOS Bypass: Simply toggle pseudo-fullscreen layout classes
    isFullscreen.value = !isFullscreen.value
    emit('fullscreen', isFullscreen.value)
    resetIdleTimer()
    return
  }
  
  // Desktop/Android: Request standard HTML5 full-window wrapper
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
    console.warn('Standard HTML5 Fullscreen failed, falling back to Pseudo-Fullscreen layout:', err)
    isFullscreen.value = !isFullscreen.value
    emit('fullscreen', isFullscreen.value)
  }
  resetIdleTimer()
}

// Orientation change automatic Pseudo-Fullscreen trigger (Mobile request)
const handleOrientationChange = () => {
  if (!import.meta.client || !checkIOS()) return
  
  // Check if rotated to landscape
  const isLandscape = window.innerWidth > window.innerHeight
  if (isLandscape && !isFullscreen.value) {
    isFullscreen.value = true
    emit('fullscreen', true)
  } else if (!isLandscape && isFullscreen.value) {
    isFullscreen.value = false
    emit('fullscreen', false)
  }
}

// Lock body scrolling when pseudo-fullscreen is activated
watch(isFullscreen, (val) => {
  if (val) {
    document.body.style.overflow = 'hidden'
  } else {
    document.body.style.overflow = ''
  }
})

// Listen to Escape / Native exits on standard desktop browsers
const handleFullscreenChange = () => {
  isFullscreen.value = !!document.fullscreenElement
}

// Keyboard controls handler
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
  setVolume(newVol)
}

const seekRelative = (seconds: number) => {
  const video = videoCanvas.value?.video
  if (video) {
    let target = video.currentTime + seconds
    if (target < 0) target = 0
    if (target > duration.value) target = duration.value
    video.currentTime = target
    currentTime.value = target
  }
  resetIdleTimer()
}

const handleSeek = (time: number) => {
  const video = videoCanvas.value?.video
  if (video) {
    video.currentTime = time
    currentTime.value = time
  }
}

const handleMetadata = (d: number) => {
  duration.value = d
  if (props.startTime && props.startTime > 0) {
    handleSeek(props.startTime)
  }
  emit('loadedmetadata', d)
}

// Inactivity & Hiding Controllers
const resetIdleTimer = () => {
  isControlsVisible.value = true
  if (idleTimer) clearTimeout(idleTimer)
  
  if (isPlaying.value && !isDraggingTimeline.value) {
    idleTimer = setTimeout(() => {
      isControlsVisible.value = false
      controlsDeck.value?.closeAllMenus()
    }, 3000)
  }
}

const handleMouseMove = () => {
  resetIdleTimer()
}

const handleMouseLeave = () => {
  if (isPlaying.value) {
    isControlsVisible.value = false
    controlsDeck.value?.closeAllMenus()
  }
}

// Blocking default iOS zoom / swipe-to-navigate gestures in Fullscreen mode
const blockIOSGestures = (e: TouchEvent) => {
  if (!isFullscreen.value || !checkIOS()) return

  // 1. Block double-tap to zoom (Safari default)
  if (e.touches.length > 1) {
    e.preventDefault()
  }
}

// Block swipe-to-navigate (Safari swipe edge to go back)
const blockSwipeNavigate = (e: TouchEvent) => {
  if (!isFullscreen.value || !checkIOS()) return

  const touch = e.touches[0]
  // If touch is near viewport boundaries, block default behavior
  if (touch.clientX < 40 || touch.clientX > window.innerWidth - 40) {
    e.preventDefault()
  }
}

onMounted(() => {
  document.addEventListener('fullscreenchange', handleFullscreenChange)
  window.addEventListener('keydown', handleKeyDown)
  
  // Listen to orientation change for PWA responsive fullscreen
  window.addEventListener('resize', handleOrientationChange)
  
  // Custom iOS swipe/zoom gesture locks
  document.addEventListener('touchstart', blockIOSGestures, { passive: false })
  document.addEventListener('touchmove', blockSwipeNavigate, { passive: false })
  
  resetIdleTimer()
})

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('resize', handleOrientationChange)
  
  document.removeEventListener('touchstart', blockIOSGestures)
  document.removeEventListener('touchmove', blockSwipeNavigate)
  
  if (idleTimer) clearTimeout(idleTimer)
  document.body.style.overflow = ''
})
</script>

<template>
  <div 
    ref="playerContainer"
    class="video-player-container"
    :class="[
      isFullscreen ? 'is-pseudo-fullscreen' : '',
      isControlsVisible ? 'is-controls-visible' : 'is-controls-hidden'
    ]"
    @mousemove="handleMouseMove"
    @mouseleave="handleMouseLeave"
    @touchstart="handleMouseMove"
  >
    <!-- Core Video Canvas Deck -->
    <VideoCanvas
      ref="videoCanvas"
      :src="src"
      :subtitle-tracks="subtitleTracks"
      :active-subtitle-track-id="activeSubtitleTrackId"
      :playback-rate="playbackRate"
      :volume="volume"
      :is-muted="isMuted"
      @play="isPlaying = true; resetIdleTimer(); emit('play')"
      @pause="isPlaying = false; resetIdleTimer(); emit('pause')"
      @timeupdate="(t) => { currentTime = t; emit('timeupdate', t) }"
      @loadedmetadata="handleMetadata"
      @progress="(b) => bufferedEnd = b"
      @cuechange="(txt) => currentSubtitleText = txt"
      @seek:relative="seekRelative"
      @click:video="togglePlay"
    />

    <!-- Title Bar Frame (Top Overlay) -->
    <transition name="slide-down">
      <div 
        v-if="isControlsVisible" 
        class="top-bar-overlay"
      >
        <div class="title-content">
          <!-- Exit Pseudo Fullscreen Back Button -->
          <button 
            v-if="isFullscreen"
            class="back-btn" 
            title="Exit Fullscreen"
            @click="toggleFullscreen"
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          
          <div class="title-details">
            <span class="title-text">{{ title }}</span>
            <span v-if="isPlaying" class="playing-indicator">NOW PLAYING</span>
          </div>
        </div>

        <div class="badge-container">
          AVSUB PRO
        </div>
      </div>
    </transition>

    <!-- Custom Subtitles Overlay Frame -->
    <SubtitleOverlay
      :subtitle-text="currentSubtitleText"
      :active-track-id="activeSubtitleTrackId"
    />

    <!-- Bottom Controls Frame Deck -->
    <transition name="slide-up">
      <div 
        v-if="isControlsVisible" 
        class="bottom-bar-overlay"
      >
        <!-- Timeline Slider Seek Deck -->
        <TimelineScrubber
          :current-time="currentTime"
          :duration="duration"
          :buffered-end="bufferedEnd"
          @seek="handleSeek"
          @drag:start="isDraggingTimeline = true; resetIdleTimer()"
          @drag:end="isDraggingTimeline = false; resetIdleTimer()"
        />

        <!-- Lower controls buttons, speeds, subs, volume -->
        <ControlsDeck
          ref="controlsDeck"
          :is-playing="isPlaying"
          :current-time="currentTime"
          :duration="duration"
          :volume="volume"
          :is-muted="isMuted"
          :playback-rate="playbackRate"
          :is-fullscreen="isFullscreen"
          :active-subtitle-track-id="activeSubtitleTrackId"
          :subtitle-tracks="subtitleTracks"
          @play="play"
          @pause="pause"
          @mute="toggleMute"
          @volume="setVolume"
          @rate="(r) => playbackRate = r"
          @subtitle="(id) => activeSubtitleTrackId = id"
          @fullscreen="toggleFullscreen"
        />
      </div>
    </transition>
  </div>
</template>

<style lang="scss">
@use "~/assets/scss/video-player.scss" as *;
</style>
