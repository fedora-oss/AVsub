<script setup lang="ts">
interface Props {
  subtitleText: string
  activeTrackId: string | null
}

defineProps<Props>()
</script>

<template>
  <div 
    v-if="subtitleText && activeTrackId !== 'off'" 
    class="subtitle-display-box"
  >
    {{ subtitleText }}
  </div>
</template>
