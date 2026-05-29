<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import type { SubtitleTrack } from '../../components/CustomPlayer/types'

interface Props {
  src: string
  subtitleTracks?: SubtitleTrack[]
  activeSubtitleTrackId: string | null
  playbackRate: number
  volume: number
  isMuted: boolean
}

const props = withDefaults(defineProps<Props>(), {
  subtitleTracks: () => []
})

const emit = defineEmits<{
  play: []
  pause: []
  timeupdate: [time: number]
  loadedmetadata: [duration: number]
  progress: [bufferedEnd: number]
  cuechange: [text: string]
  'seek:relative': [seconds: number]
  'click:video': []
  pipchange: [isActive: boolean]
}>()

const videoElement = ref<HTMLVideoElement | null>(null)
const isBuffering = ref(false)
const isPiPActive = ref(false)

// Gesture Seeking visual feedback
const leftRippleActive = ref(false)
const rightRippleActive = ref(false)
let leftRippleTimeout: NodeJS.Timeout | null = null
let rightRippleTimeout: NodeJS.Timeout | null = null
let clickTimeout: NodeJS.Timeout | null = null

// Double click vs single click logic
const handleLeftClick = () => {
  if (clickTimeout) {
    clearTimeout(clickTimeout)
    clickTimeout = null
    // Double tap seek backward 10s
    emit('seek:relative', -10)
    triggerLeftFeedback()
  } else {
    clickTimeout = setTimeout(() => {
      clickTimeout = null
      emit('click:video')
    }, 250)
  }
}

const handleRightClick = () => {
  if (clickTimeout) {
    clearTimeout(clickTimeout)
    clickTimeout = null
    // Double tap seek forward 10s
    emit('seek:relative', 10)
    triggerRightFeedback()
  } else {
    clickTimeout = setTimeout(() => {
      clickTimeout = null
      emit('click:video')
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

// Media Event Handlers
const onPlay = () => {
  emit('play')
}

const onPause = () => {
  emit('pause')
}

const onTimeUpdate = () => {
  if (videoElement.value) {
    emit('timeupdate', videoElement.value.currentTime)
  }
}

const onLoadedMetadata = () => {
  if (videoElement.value) {
    emit('loadedmetadata', videoElement.value.duration)
    setupSubtitles()
  }
}

const onProgress = () => {
  if (!videoElement.value || videoElement.value.buffered.length === 0) return
  const end = videoElement.value.buffered.end(videoElement.value.buffered.length - 1)
  emit('progress', end)
}

const onWaiting = () => {
  isBuffering.value = true
}

const onPlaying = () => {
  isBuffering.value = false
}

// Subtitle cuechange mapping
const setupSubtitles = () => {
  if (!videoElement.value) return
  const tracks = videoElement.value.textTracks
  
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i]
    
    // In PiP mode, we change active track to 'showing' so Safari's native system window displays it.
    // In inline mode, we use 'hidden' so native player hides subtitles but cue events still trigger.
    const matchingProp = props.subtitleTracks.find(t => t.label === track.label)
    if (matchingProp && props.activeSubtitleTrackId === matchingProp.id) {
      track.mode = isPiPActive.value ? 'showing' : 'hidden'
    } else {
      track.mode = 'disabled'
    }
    
    track.oncuechange = () => {
      if (track.mode === 'hidden' || track.mode === 'showing') {
        const activeCues = track.activeCues
        if (activeCues && activeCues.length > 0) {
          emit('cuechange', (activeCues[0] as VTTCue).text)
        } else {
          emit('cuechange', '')
        }
      }
    }
  }
}

// Picture-in-Picture event handlers
const handlePiPEnter = () => {
  console.log('[VideoCanvas] W3C PiP Entered')
  isPiPActive.value = true
  emit('pipchange', true)
  setupSubtitles()
}

const handlePiPLeave = () => {
  console.log('[VideoCanvas] W3C PiP Left')
  isPiPActive.value = false
  emit('pipchange', false)
  setupSubtitles()
}

const handleWebKitPiPChange = () => {
  if (videoElement.value && (videoElement.value as any).webkitPresentationMode) {
    const mode = (videoElement.value as any).webkitPresentationMode
    console.log('[VideoCanvas] WebKit presentation mode changed:', mode)
    const active = mode === 'picture-in-picture'
    isPiPActive.value = active
    emit('pipchange', active)
    setupSubtitles()
  }
}

// Synchronize properties when props change
watch(() => props.activeSubtitleTrackId, (newVal) => {
  setupSubtitles()
  if (newVal === 'off' || !newVal) {
    emit('cuechange', '')
  }
})

watch(() => props.playbackRate, (newVal) => {
  if (videoElement.value) {
    videoElement.value.playbackRate = newVal
  }
})

watch(() => props.volume, (newVal) => {
  if (videoElement.value) {
    videoElement.value.volume = newVal
  }
})

watch(() => props.isMuted, (newVal) => {
  if (videoElement.value) {
    videoElement.value.muted = newVal
  }
})

onMounted(() => {
  if (videoElement.value) {
    // Initial sync
    videoElement.value.playbackRate = props.playbackRate
    videoElement.value.volume = props.volume
    videoElement.value.muted = props.isMuted

    // Bind Picture-in-Picture events
    videoElement.value.addEventListener('enterpictureinpicture', handlePiPEnter)
    videoElement.value.addEventListener('leavepictureinpicture', handlePiPLeave)
    videoElement.value.addEventListener('webkitpresentationmodechanged', handleWebKitPiPChange)
  }
  setupSubtitles()
})

onUnmounted(() => {
  if (leftRippleTimeout) clearTimeout(leftRippleTimeout)
  if (rightRippleTimeout) clearTimeout(rightRippleTimeout)
  if (clickTimeout) clearTimeout(clickTimeout)

  if (videoElement.value) {
    videoElement.value.removeEventListener('enterpictureinpicture', handlePiPEnter)
    videoElement.value.removeEventListener('leavepictureinpicture', handlePiPLeave)
    videoElement.value.removeEventListener('webkitpresentationmodechanged', handleWebKitPiPChange)
  }
})

// Expose native video element so wrapper can trigger play/pause/seek directly
defineExpose({
  video: videoElement
})
</script>

<template>
  <div class="relative w-full h-full">
    <!-- HTML5 Video Component -->
    <!-- playsinline + webkit-playsinline to bypass default Apple AVPlayer launch -->
    <video
      ref="videoElement"
      class="video-canvas-el"
      :src="src"
      playsinline
      webkit-playsinline
      autopictureinpicture
      :muted="isMuted"
      @play="onPlay"
      @pause="onPause"
      @timeupdate="onTimeUpdate"
      @loadedmetadata="onLoadedMetadata"
      @progress="onProgress"
      @waiting="onWaiting"
      @playing="onPlaying"
      @click="handleLeftClick" 
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
    <div v-if="isBuffering" class="buffer-spinner">
      <svg class="spinner-svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
      </svg>
    </div>

    <!-- Double Tap Seek Gesture Overlays -->
    <div class="gesture-overlay-deck">
      <!-- Left half touch gesture region -->
      <div 
        class="gesture-half" 
        @click.stop="handleLeftClick"
      >
        <transition name="fade">
          <div v-if="leftRippleActive" class="gesture-ripple is-left">
            <div class="ripple-content">
              <svg fill="currentColor" viewBox="0 0 24 24">
                <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/>
              </svg>
              <span>-10 SEC</span>
            </div>
          </div>
        </transition>
      </div>
      
      <!-- Right half touch gesture region -->
      <div 
        class="gesture-half" 
        @click.stop="handleRightClick"
      >
        <transition name="fade">
          <div v-if="rightRippleActive" class="gesture-ripple is-right">
            <div class="ripple-content">
              <svg fill="currentColor" viewBox="0 0 24 24">
                <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/>
              </svg>
              <span>+10 SEC</span>
            </div>
          </div>
        </transition>
      </div>
    </div>
  </div>
</template>
