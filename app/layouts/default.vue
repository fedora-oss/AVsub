<script setup lang="ts">
import { ref } from 'vue'
import { useDashboardState } from '~/composables/useDashboardState'

const route = useRoute()
const isOnline = ref(true)
const state = useDashboardState()

const {
  activeTab,
  startPolling,
  stopPolling,
  fetchFiltersData,
  fetchLibraryMovies,
} = state

if (import.meta.client) {
  isOnline.value = navigator.onLine
  window.addEventListener('online', () => isOnline.value = true)
  window.addEventListener('offline', () => isOnline.value = false)
}

const handleTabClick = (tab: 'search' | 'watcher' | 'library' | 'pretext') => {
  activeTab.value = tab
  
  if (tab === 'watcher') {
    startPolling()
  } else {
    stopPolling()
  }

  if (tab === 'library') {
    fetchFiltersData()
    fetchLibraryMovies(1)
  }

  // If currently not on Home page, navigate to Home page
  if (route.path !== '/') {
    navigateTo('/')
  }
}
</script>

<template>
  <div class="layout-container">
    <!-- Premium iOS 26 Glassmorphic Header (App Bar) -->
    <header class="layout-header-bar">
      <NuxtLink to="/" class="header-brand">
        <div class="brand-logo">AV</div>
        <span class="brand-title">AVsub<span class="brand-highlight">PRO</span></span>
      </NuxtLink>
      
      <div class="header-actions">
        <!-- Connection and Status indicators -->
        <span v-if="isOnline" class="status-badge">ONLINE PWA</span>
        <span v-else class="status-badge" style="color: #ff3b30; background: rgba(255,59,48,0.1); border-color: rgba(255,59,48,0.2)">OFFLINE</span>
      </div>
    </header>

    <!-- Main Content Area -->
    <main class="layout-main-content">
      <slot />
    </main>

    <!-- Unified Floating Glassmorphic Pill Dock Navigation (Bottom Nav) -->
    <nav class="layout-bottom-dock select-none">
      <!-- 🎬 JAV Media Library -->
      <button 
        class="dock-nav-item" 
        :class="{ 'is-active': activeTab === 'library' && route.path === '/' }"
        @click="handleTabClick('library')"
      >
        <i class="fa-solid fa-film"></i>
        <span class="nav-label">Thư Viện</span>
      </button>

      <!-- 🔍 Search Portal -->
      <button 
        class="dock-nav-item" 
        :class="{ 'is-active': activeTab === 'search' && route.path === '/' }"
        @click="handleTabClick('search')"
      >
        <i class="fa-solid fa-magnifying-glass"></i>
        <span class="nav-label">Tìm Kiếm</span>
      </button>

      <!-- 🤖 Watcher & Tasks -->
      <button 
        class="dock-nav-item" 
        :class="{ 'is-active': activeTab === 'watcher' && route.path === '/' }"
        @click="handleTabClick('watcher')"
      >
        <i class="fa-solid fa-robot"></i>
        <span class="nav-label">Giám Sát</span>
      </button>

      <!-- ⚡ Pretext Sandbox -->
      <button 
        class="dock-nav-item" 
        :class="{ 'is-active': activeTab === 'pretext' && route.path === '/' }"
        @click="handleTabClick('pretext')"
      >
        <i class="fa-solid fa-bolt"></i>
        <span class="nav-label">Hộp Cát</span>
      </button>
    </nav>
  </div>
</template>

<style lang="scss">
@use "~/assets/scss/layouts.scss" as *;
</style>
