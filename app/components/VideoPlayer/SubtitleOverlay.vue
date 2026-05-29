<script setup lang="ts">
import { useDashboardState } from '~/composables/useDashboardState'
import { computed } from 'vue'

interface Props {
  subtitleText: string
  activeTrackId: string | null
}

defineProps<Props>()

const {
  subtitleSize,
  subtitleColor,
  subtitleItalic,
  subtitleBgMode
} = useDashboardState()

const overlayStyle = computed(() => {
  const styles: Record<string, string> = {
    fontSize: `${subtitleSize.value}px`,
    color: subtitleColor.value,
    fontStyle: subtitleItalic.value ? 'italic' : 'normal',
  }

  // Handle Background Mode
  if (subtitleBgMode.value === 'solid') {
    styles.background = 'rgba(0, 0, 0, 0.95)'
    styles.backdropFilter = 'none'
    styles.border = '1px solid rgba(255, 255, 255, 0.15)'
  } else if (subtitleBgMode.value === 'transparent') {
    styles.background = 'transparent'
    styles.backdropFilter = 'none'
    styles.border = 'none'
    styles.boxShadow = 'none'
    styles.textShadow = '0px 2px 4px rgba(0, 0, 0, 0.95), 0px 0px 6px rgba(0, 0, 0, 0.95), 0px 0px 2px rgba(0, 0, 0, 0.95)'
  } else {
    // Glass mode (default iOS translucent style)
    styles.background = 'rgba(10, 9, 13, 0.85)'
    styles.backdropFilter = 'blur(8px)'
    styles.border = '1px solid rgba(255, 255, 255, 0.12)'
  }

  return styles
})
</script>

<template>
  <div 
    v-if="subtitleText && activeTrackId !== 'off' && activeTrackId !== null" 
    class="subtitle-display-box"
    :style="overlayStyle"
  >
    {{ subtitleText }}
  </div>
</template>
