<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

interface Option {
  label: string
  value: any
  subLabel?: string
}

interface Props {
  options: Option[]
  selected: any
  heading: string
  isWide?: boolean
}

defineProps<Props>()

const emit = defineEmits<{
  select: [value: any]
  close: []
}>()

const menuRef = ref<HTMLDivElement | null>(null)

const handleOutsideClick = (e: MouseEvent) => {
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) {
    emit('close')
  }
}

onMounted(() => {
  // Use a slight timeout to avoid immediate closure on trigger click
  setTimeout(() => {
    document.addEventListener('click', handleOutsideClick)
  }, 50)
})

onUnmounted(() => {
  document.removeEventListener('click', handleOutsideClick)
})
</script>

<template>
  <div 
    ref="menuRef"
    class="option-menu-wrapper"
    :class="{ 'is-wide': isWide }"
  >
    <div class="menu-heading">{{ heading }}</div>
    
    <button 
      v-for="opt in options" 
      :key="opt.value"
      class="option-menu-item"
      :class="{ 'is-selected': selected === opt.value }"
      @click="emit('select', opt.value)"
    >
      {{ opt.label }} <span v-if="opt.subLabel" class="opacity-60">({{ opt.subLabel }})</span>
    </button>
  </div>
</template>
