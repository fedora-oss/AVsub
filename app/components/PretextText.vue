<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { calculateTextGeometry } from '~/utils/pretext'

const props = withDefaults(
  defineProps<{
    text: string
    font?: string
    lineHeight?: number
    maxLines?: number
  }>(),
  {
    font: '500 15px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    lineHeight: 22,
  }
)

const containerRef = ref<HTMLElement | null>(null)
const width = ref(0)
const calculatedHeight = ref<number | null>(null)
const calculatedLines = ref<number>(0)

// Calculate layout geometry reactively
const geometry = computed(() => {
  if (!props.text || width.value <= 0) {
    return { height: props.lineHeight, lineCount: 1 }
  }
  
  const geo = calculateTextGeometry(props.text, props.font, width.value, props.lineHeight)
  
  // If maxLines is specified, clamp the height
  if (props.maxLines && geo.lineCount > props.maxLines) {
    return {
      height: props.maxLines * props.lineHeight,
      lineCount: props.maxLines
    }
  }
  
  return geo
})

watch(
  geometry,
  (newGeo) => {
    calculatedHeight.value = newGeo.height
    calculatedLines.value = newGeo.lineCount
  },
  { immediate: true }
)

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (!process.client || !containerRef.value) return

  // Initial width read
  width.value = containerRef.value.clientWidth

  // Set up ResizeObserver to track container width changes performantly
  try {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Use clientWidth or contentRect width
        const newWidth = entry.contentRect.width || (entry.target as HTMLElement).clientWidth
        if (newWidth > 0 && Math.abs(newWidth - width.value) > 1) {
          width.value = newWidth
        }
      }
    })
    resizeObserver.observe(containerRef.value)
  } catch (err) {
    console.warn('[PretextText] ResizeObserver failed:', err)
  }
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
})
</script>

<template>
  <div 
    ref="containerRef" 
    class="pretext-text-container transition-[height] duration-200 ease-out overflow-hidden"
    :style="{
      font: props.font,
      lineHeight: `${props.lineHeight}px`,
      height: calculatedHeight !== null ? `${calculatedHeight}px` : 'auto',
      maxHeight: props.maxLines ? `${props.maxLines * props.lineHeight}px` : 'none'
    }"
  >
    <div 
      class="pretext-content w-full"
      :class="{ 'line-clamp': props.maxLines }"
      :style="props.maxLines ? {
        display: '-webkit-box',
        '-webkit-box-orient': 'vertical',
        '-webkit-line-clamp': props.maxLines,
        overflow: 'hidden'
      } : {}"
    >
      {{ props.text }}
    </div>
  </div>
</template>
