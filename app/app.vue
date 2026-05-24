<script setup lang="ts">
import { onMounted } from 'vue'

onMounted(() => {
  if (process.client && 'serviceWorker' in navigator) {
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
})
</script>

<template>
  <div class="app-wrapper">
    <NuxtPage />
  </div>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Outfit:wght@400;500;600;700;800;900&display=swap');

body {
  margin: 0;
  padding: 0;
  background-color: #08070b;
  color: #f1f5f9;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3, .badge {
  font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.app-wrapper {
  background: 
    radial-gradient(circle at 15% 0%, rgba(0, 220, 130, 0.08) 0%, transparent 45%),
    radial-gradient(circle at 85% 0%, rgba(139, 92, 246, 0.09) 0%, transparent 45%),
    radial-gradient(circle at 50% 50%, rgba(25, 20, 35, 0.3) 0%, transparent 100%);
  min-height: 100vh;
  padding-top: env(safe-area-inset-top, 0px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  padding-left: env(safe-area-inset-left, 0px);
  padding-right: env(safe-area-inset-right, 0px);
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
  background: #08070b;
}

::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(139, 92, 246, 0.3);
}

/* Hide scrollbars but keep functionality */
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
.scrollbar-hide {
  -ms-overflow-style: none;  /* IE and Edge */
  scrollbar-width: none;  /* Firefox */
}
</style>

