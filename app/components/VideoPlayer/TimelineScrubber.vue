<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'

interface Props {
  currentTime: number
  duration: number
  bufferedEnd: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  seek: [time: number]
  'drag:start': []
  'drag:end': []
}>()

const timelineContainer = ref<HTMLDivElement | null>(null)
const isDragging = ref(false)
const isHovering = ref(false)
const hoverTime = ref(0)
const hoverX = ref(0)

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

// Progress metrics computed
const timelineProgressPct = computed(() => {
  if (props.duration === 0) return 0
  return (props.currentTime / props.duration) * 100
})

const timelineBufferedPct = computed(() => {
  if (props.duration === 0) return 0
  return (props.bufferedEnd / props.duration) * 100
})

// Mouse timeline clicks & drags
const onMouseDown = (e: MouseEvent) => {
  isDragging.value = true
  emit('drag:start')
  handleDrag(e)
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

const onMouseMove = (e: MouseEvent) => {
  if (isDragging.value) {
    handleDrag(e)
  }
}

const onMouseUp = () => {
  if (isDragging.value) {
    isDragging.value = false
    emit('drag:end')
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }
}

const handleDrag = (e: MouseEvent) => {
  if (!timelineContainer.value || props.duration === 0) return
  const rect = timelineContainer.value.getBoundingClientRect()
  let clickX = e.clientX - rect.left
  if (clickX < 0) clickX = 0
  if (clickX > rect.width) clickX = rect.width
  const pct = clickX / rect.width
  const targetTime = pct * props.duration
  emit('seek', targetTime)
}

// Timeline mobile touch drag support
const onTouchStart = (e: TouchEvent) => {
  isDragging.value = true
  emit('drag:start')
  handleTouchDrag(e)
  window.addEventListener('touchmove', onTouchMove)
  window.addEventListener('touchend', onTouchEnd)
}

const onTouchMove = (e: TouchEvent) => {
  if (isDragging.value) {
    handleTouchDrag(e)
  }
}

const onTouchEnd = () => {
  if (isDragging.value) {
    isDragging.value = false
    emit('drag:end')
    window.removeEventListener('touchmove', onTouchMove)
    window.removeEventListener('touchend', onTouchEnd)
  }
}

const handleTouchDrag = (e: TouchEvent) => {
  if (!timelineContainer.value || props.duration === 0) return
  const rect = timelineContainer.value.getBoundingClientRect()
  const touch = e.touches[0]
  let clickX = touch.clientX - rect.left
  if (clickX < 0) clickX = 0
  if (clickX > rect.width) clickX = rect.width
  const pct = clickX / rect.width
  const targetTime = pct * props.duration
  emit('seek', targetTime)
}

// Hover timeline display helper
const onHoverMove = (e: MouseEvent) => {
  if (!timelineContainer.value || props.duration === 0) return
  const rect = timelineContainer.value.getBoundingClientRect()
  let x = e.clientX - rect.left
  if (x < 0) x = 0
  if (x > rect.width) x = rect.width
  hoverX.value = x
  hoverTime.value = (x / rect.width) * props.duration
}

onUnmounted(() => {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
  window.removeEventListener('touchmove', onTouchMove)
  window.removeEventListener('touchend', onTouchEnd)
})
</script>

<template>
  <div 
    ref="timelineContainer"
    class="timeline-scrub-bar"
    @mousedown="onMouseDown"
    @touchstart.passive="onTouchStart"
    @mousemove="onHoverMove"
    @mouseenter="isHovering = true"
    @mouseleave="isHovering = false"
  >
    <!-- Hover Timeline Preview -->
    <div 
      v-if="isHovering && duration > 0"
      class="timeline-hover-preview"
      :style="{ left: `${hoverX}px` }"
    >
      {{ formatTime(hoverTime) }}
    </div>

    <!-- Buffered track line -->
    <div 
      class="timeline-track-buffered"
      :style="{ width: `${timelineBufferedPct}%` }"
    />

    <!-- Completed progress line (glow accent red) -->
    <div 
      class="timeline-track-completed"
      :style="{ width: `${timelineProgressPct}%` }"
    />

    <!-- Handle indicator knob -->
    <div 
      class="scrub-knob"
      :style="{ left: `calc(${timelineProgressPct}% - 8px)` }"
    />
  </div>
</template>
