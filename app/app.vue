<script setup lang="ts">
import { onMounted, ref } from 'vue'

const themeMode = ref<'system' | 'light' | 'dark'>('system')

function applyTheme(mode: 'system' | 'light' | 'dark') {
  themeMode.value = mode
  if (!import.meta.client) return
  
  localStorage.setItem('avsub-theme', mode)
  
  const root = document.documentElement
  root.classList.remove('theme-light', 'theme-dark')
  
  if (mode === 'light') {
    root.classList.add('theme-light')
  } else if (mode === 'dark') {
    root.classList.add('theme-dark')
  }
}

onMounted(() => {
  if (import.meta.client && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          console.log('PWA Service Worker registered successfully:', reg.scope)
        })
        .catch((err) => {
          console.warn('PWA Service Worker registration failed:', err)
        })
    })
  }

  // Load saved theme
  const savedTheme = localStorage.getItem('avsub-theme') as 'system' | 'light' | 'dark' | null
  if (savedTheme) {
    applyTheme(savedTheme)
  } else {
    applyTheme('system')
  }
})
</script>

<template>
  <div class="app-wrapper">
    <!-- Floating Cyberpunk Theme Toggle -->
    <div class="theme-toggle-container">
      <div 
        class="theme-toggle-slider" 
        :class="themeMode" 
      />
      <button 
        v-for="mode in (['system', 'light', 'dark'] as const)" 
        :key="mode"
        class="theme-toggle-btn"
        :class="{ active: themeMode === mode }"
        :title="`Chế độ: ${mode === 'system' ? 'Tự động' : mode === 'light' ? 'Sáng' : 'Tối'}`"
        @click="applyTheme(mode)"
      >
        <span class="theme-toggle-icon">
          <i v-if="mode === 'system'" class="fa-solid fa-circle-half-stroke"></i>
          <i v-else-if="mode === 'light'" class="fa-solid fa-sun"></i>
          <i v-else class="fa-solid fa-moon"></i>
        </span>
        <span class="theme-toggle-text">{{ mode === 'system' ? 'Tự động' : mode === 'light' ? 'Sáng' : 'Tối' }}</span>
      </button>
    </div>

    <NuxtPage />
  </div>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Outfit:wght@400;500;600;700;800;900&display=swap');

:root,
.theme-dark {
  --bg-color: #08070b;
  --text-color: #f1f5f9;
  --text-muted: rgba(255, 255, 255, 0.5);
  --card-bg: rgba(15, 13, 26, 0.35);
  --border-color: rgba(255, 255, 255, 0.06);
  --glow-color: rgba(124, 58, 237, 0.15);
  --input-bg: rgba(0, 0, 0, 0.4);
  --input-focus-bg: rgba(15, 13, 26, 0.9);
  --app-gradient: radial-gradient(circle at 15% 0%, rgba(0, 220, 130, 0.08) 0%, transparent 45%),
                  radial-gradient(circle at 85% 0%, rgba(139, 92, 246, 0.09) 0%, transparent 45%),
                  radial-gradient(circle at 50% 50%, rgba(25, 20, 35, 0.3) 0%, transparent 100%);
  --scrollbar-bg: #08070b;
  --scrollbar-thumb: rgba(255, 255, 255, 0.08);
  --actress-bg: rgba(255, 255, 255, 0.05);
  --actress-text: rgba(255, 255, 255, 0.65);
  --actress-border: rgba(255, 255, 255, 0.08);
  --shadow-color: rgba(0, 0, 0, 0.5);
  --card-hover-border: rgba(124, 58, 237, 0.35);
  --card-hover-bg: rgba(20, 18, 32, 0.5);
}

.theme-light {
  --bg-color: #f6f5f2; /* Gentle warm book-paper white */
  --text-color: #1a1715; /* Elegant charcoal-brown instead of harsh black */
  --text-muted: rgba(26, 23, 21, 0.6);
  --card-bg: rgba(255, 255, 255, 0.72); /* Delicate translucent warm card */
  --border-color: rgba(26, 23, 21, 0.07);
  --glow-color: rgba(139, 92, 246, 0.05);
  --input-bg: rgba(255, 255, 255, 0.9);
  --input-focus-bg: #ffffff;
  --app-gradient: radial-gradient(circle at 15% 0%, rgba(245, 158, 11, 0.04) 0%, transparent 45%),
                  radial-gradient(circle at 85% 0%, rgba(139, 92, 246, 0.05) 0%, transparent 45%),
                  radial-gradient(circle at 50% 50%, rgba(246, 245, 242, 0.95) 0%, transparent 100%);
  --scrollbar-bg: #f6f5f2;
  --scrollbar-thumb: rgba(26, 23, 21, 0.12);
  --actress-bg: rgba(26, 23, 21, 0.04);
  --actress-text: rgba(26, 23, 21, 0.75);
  --actress-border: rgba(26, 23, 21, 0.06);
  --shadow-color: rgba(26, 23, 21, 0.06);
  --card-hover-border: rgba(139, 92, 246, 0.35);
  --card-hover-bg: #ffffff;
}

@media (prefers-color-scheme: light) {
  :root:not(.theme-dark) {
    --bg-color: #f6f5f2;
    --text-color: #1a1715;
    --text-muted: rgba(26, 23, 21, 0.6);
    --card-bg: rgba(255, 255, 255, 0.72);
    --border-color: rgba(26, 23, 21, 0.07);
    --glow-color: rgba(139, 92, 246, 0.05);
    --input-bg: rgba(255, 255, 255, 0.9);
    --input-focus-bg: #ffffff;
    --app-gradient: radial-gradient(circle at 15% 0%, rgba(245, 158, 11, 0.04) 0%, transparent 45%),
                    radial-gradient(circle at 85% 0%, rgba(139, 92, 246, 0.05) 0%, transparent 45%),
                    radial-gradient(circle at 50% 50%, rgba(246, 245, 242, 0.95) 0%, transparent 100%);
    --scrollbar-bg: #f6f5f2;
    --scrollbar-thumb: rgba(26, 23, 21, 0.12);
    --actress-bg: rgba(26, 23, 21, 0.04);
    --actress-text: rgba(26, 23, 21, 0.75);
    --actress-border: rgba(26, 23, 21, 0.06);
    --shadow-color: rgba(26, 23, 21, 0.06);
    --card-hover-border: rgba(139, 92, 246, 0.35);
    --card-hover-bg: #ffffff;
  }
}

body {
  margin: 0;
  padding: 0;
  background-color: var(--bg-color);
  color: var(--text-color);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
  transition: background-color 0.4s ease, color 0.4s ease;
}

h1, h2, h3, .badge {
  font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.app-wrapper {
  background: var(--app-gradient);
  min-height: 100vh;
  padding-top: env(safe-area-inset-top, 0px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  padding-left: env(safe-area-inset-left, 0px);
  padding-right: env(safe-area-inset-right, 0px);
  transition: background 0.4s ease;
}

* {
  box-sizing: border-box;
}

/* Beautiful custom scrollbar */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: var(--scrollbar-bg);
  transition: background 0.3s ease;
}

::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 4px;
  transition: background 0.3s ease;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(139, 92, 246, 0.35);
}

/* Hide scrollbars but keep functionality */
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
.scrollbar-hide {
  -ms-overflow-style: none;  /* IE and Edge */
  scrollbar-width: none;  /* Firefox */
}

/* Redesigned Glassmorphic sliding theme toggle */
.theme-toggle-container {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 1000;
  display: flex;
  background: var(--card-bg);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid var(--border-color);
  border-radius: 99px;
  padding: 3px;
  box-shadow: 0 10px 30px var(--shadow-color);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

/* Cyberpunk/Premium Sliding Indicator capsule */
.theme-toggle-slider {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 3px;
  width: calc(33.33% - 2px);
  border-radius: 99px;
  transition: transform 0.38s cubic-bezier(0.25, 1, 0.4, 1), background 0.3s ease, box-shadow 0.3s ease;
  z-index: 0;
}

/* System selection style */
.theme-toggle-slider.system {
  transform: translateX(0);
  background: linear-gradient(135deg, #a78bfa 0%, #00dc82 100%);
  box-shadow: 0 4px 12px rgba(0, 220, 130, 0.25);
}

/* Light selection style - warm sunny gradient */
.theme-toggle-slider.light {
  transform: translateX(100%);
  background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%);
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
}

/* Dark selection style - deep violet glow */
.theme-toggle-slider.dark {
  transform: translateX(200%);
  background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
  box-shadow: 0 4px 14px rgba(139, 92, 246, 0.4);
}

.theme-toggle-btn {
  position: relative;
  z-index: 1;
  background: transparent;
  border: none;
  color: var(--text-color);
  opacity: 0.65;
  font-size: 0.72rem;
  font-weight: 800;
  padding: 7px 14px;
  border-radius: 99px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  outline: none;
  font-family: 'Outfit', sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.theme-toggle-btn:hover {
  opacity: 1;
}

/* When the indicator sits behind, text color adjusts for maximum contrast */
.theme-toggle-btn.active {
  color: #ffffff;
  opacity: 1;
}

/* In light theme, active text inside the warm orange/green pill must be dark charcoal for readability */
.theme-light .theme-toggle-btn.active {
  color: #1a1715;
}

/* Handle system light preference */
@media (prefers-color-scheme: light) {
  :root:not(.theme-dark) .theme-toggle-btn.active {
    color: #1a1715;
  }
}

/* Icon micro-animations */
.theme-toggle-icon {
  font-size: 0.85rem;
  transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.theme-toggle-btn:hover .theme-toggle-icon {
  transform: scale(1.22) rotate(15deg);
}

/* Hide text label on mobile screens to keep it compact */
@media (max-width: 640px) {
  .theme-toggle-container {
    top: auto;
    bottom: calc(95px + env(safe-area-inset-bottom, 0px));
    right: 16px;
  }
  .theme-toggle-text {
    display: none;
  }
  .theme-toggle-btn {
    padding: 8px 10px;
  }
  .theme-toggle-icon {
    font-size: 1rem;
  }
}
</style>

