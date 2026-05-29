<script setup lang="ts">
import { ref, computed } from 'vue'
import type { SubtitleTrack, PlaybackSpeed } from '../../components/CustomPlayer/types'
import OptionMenu from './OptionMenu.vue'

interface Props {
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  isMuted: boolean
  playbackRate: number
  isFullscreen: boolean
  activeSubtitleTrackId: string | null
  subtitleTracks?: SubtitleTrack[]
  isMobile?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  subtitleTracks: () => [],
  isMobile: false
})

const emit = defineEmits<{
  play: []
  pause: []
  mute: []
  volume: [val: number]
  rate: [rate: number]
  subtitle: [trackId: string | null]
  fullscreen: []
  pip: []
  nativePlayer: []
}>()

// UI Menus Toggles
const showSpeedMenu = ref(false)
const showSubtitlesMenu = ref(false)

// Speeds list definition
const speeds: PlaybackSpeed[] = [
  { label: '0.5x', value: 0.5 },
  { label: '1.0x', value: 1.0 },
  { label: '1.25x', value: 1.25 },
  { label: '1.5x', value: 1.5 },
  { label: '2.0x', value: 2.0 }
]

// Speed Options mapping
const speedOptions = computed(() => 
  speeds.map(s => ({ label: s.label, value: s.value }))
)

// Subtitle Options mapping
const subtitleOptions = computed(() => {
  const list = [{ label: 'SUBTITLES OFF', value: 'off' }]
  props.subtitleTracks.forEach(t => {
    list.push({ label: t.label.toUpperCase(), value: t.id, subLabel: t.srclang })
  })
  return list
})

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

const handlePlayToggle = () => {
  if (props.isPlaying) {
    emit('pause')
  } else {
    emit('play')
  }
}

const handleVolumeInput = (e: Event) => {
  const target = e.target as HTMLInputElement
  emit('volume', parseFloat(target.value))
}

const handleSpeedSelect = (rate: number) => {
  emit('rate', rate)
  showSpeedMenu.value = false
}

const handleSubtitleSelect = (trackId: string) => {
  emit('subtitle', trackId === 'off' ? null : trackId)
  showSubtitlesMenu.value = false
}

const closeAllMenus = () => {
  showSpeedMenu.value = false
  showSubtitlesMenu.value = false
}

defineExpose({
  closeAllMenus
})
</script>

<template>
  <div class="controls-row">
    <!-- Left side controls (Play/Pause, Volume, Timer) -->
    <div class="controls-left">
      <!-- Play/Pause Toggle Button -->
      <button 
        class="control-button" 
        :class="{ 'is-accented': isPlaying }"
        :title="isPlaying ? 'Pause (Space)' : 'Play (Space)'"
        @click="handlePlayToggle"
      >
        <svg v-if="isPlaying" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
        </svg>
        <svg v-else fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z"/>
        </svg>
      </button>

      <!-- Volume speaker + slider layout -->
      <div class="volume-controller">
        <button 
          class="control-button" 
          title="Mute / Unmute"
          @click="emit('mute')"
        >
          <!-- Dynamic mute/low/high speaker SVGs -->
          <svg v-if="isMuted || volume === 0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
          </svg>
          <svg v-else-if="volume < 0.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.536 8.464a5 5 0 010 7.072M12 18.75V5.25L7.75 9.5H4.5V14.5H7.75L12 18.75Z" />
          </svg>
          <svg v-else fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 8a8.001 8.001 0 010 8M15.536 8.464a5 5 0 010 7.072M12 18.75V5.25L7.75 9.5H4.5V14.5H7.75L12 18.75Z" />
          </svg>
        </button>
        
        <!-- Smooth volume range slider -->
        <input 
          type="range" 
          min="0" 
          max="1" 
          step="0.05" 
          :value="isMuted ? 0 : volume" 
          aria-label="Volume"
          class="volume-slider-input"
          @input="handleVolumeInput"
        >
      </div>

      <!-- Playback Timer labels -->
      <div class="timer-display">
        <span>{{ formatTime(currentTime) }}</span>
        <span class="timer-sep">/</span>
        <span class="timer-total">{{ formatTime(duration) }}</span>
      </div>
    </div>

    <!-- Right side controls (Menus + Fullscreen) -->
    <div class="controls-right">
      
      <!-- Playback Speed Menu Trigger -->
      <div class="relative">
        <button 
          class="control-button menu-trigger-btn"
          :class="{ 'is-active': playbackRate !== 1.0 }"
          title="Playback Speed"
          @click.stop="showSpeedMenu = !showSpeedMenu; showSubtitlesMenu = false"
        >
          <svg class="speed-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3.34 19a10 10 0 1 1 17.32 0" />
            <path d="m12 14 4-6" />
            <path d="M12 18h.01" />
          </svg>
          <span v-if="playbackRate !== 1.0" class="speed-badge">{{ playbackRate }}x</span>
        </button>
        
        <transition name="fade">
          <OptionMenu
            v-if="showSpeedMenu"
            heading="PLAYBACK SPEED"
            :options="speedOptions"
            :selected="playbackRate"
            @select="handleSpeedSelect"
            @close="showSpeedMenu = false"
          />
        </transition>
      </div>

      <!-- Subtitle CC Toggler Menu Trigger -->
      <div class="relative">
        <button 
          class="control-button"
          :class="{ 'is-accented': activeSubtitleTrackId !== null }"
          title="Subtitles/CC Selection"
          @click.stop="showSubtitlesMenu = !showSubtitlesMenu; showSpeedMenu = false"
        >
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
        </button>

        <transition name="fade">
          <OptionMenu
            v-if="showSubtitlesMenu"
            heading="SUBTITLE TRACKS"
            is-wide
            :options="subtitleOptions"
            :selected="activeSubtitleTrackId || 'off'"
            @select="handleSubtitleSelect"
            @close="showSubtitlesMenu = false"
          />
        </transition>
      </div>

      <!-- Picture-in-Picture Trigger -->
      <button 
        class="control-button" 
        title="Picture-in-Picture (P)"
        @click="emit('pip')"
      >
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 19V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" stroke-opacity="0.4"/>
          <rect x="13" y="12" width="7" height="5" rx="1" fill="currentColor"/>
          <path d="m9 14 3-3m0 0h-3.5m3.5 0v3.5"/>
        </svg>
      </button>

      <!-- Launch Native System Player (Jellyfin Style) -->
      <button 
        v-if="isMobile"
        class="control-button" 
        title="Xem bằng trình phát hệ thống (Native Player)"
        @click="emit('nativePlayer')"
      >
        <svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" stroke-opacity="0.5"/>
          <path d="M8 21h8"/>
          <path d="M12 17v4"/>
          <path d="m10 7 5 3-5 3V7z" fill="currentColor"/>
        </svg>
      </button>

      <!-- Fullscreen Toggler (Bypasses iOS natively) -->
      <button 
        class="control-button" 
        :class="{ 'is-accented': isFullscreen }"
        :title="isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'"
        @click="emit('fullscreen')"
      >
        <svg v-if="isFullscreen" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 10h6V4M20 10h-6V4M4 14h6v6M20 14h-6v6" />
        </svg>
        <svg v-else fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 3h6v6M9 21H3v-6M21 15v6h-6M3 9V3h6" />
        </svg>
      </button>

    </div>
  </div>
</template>
