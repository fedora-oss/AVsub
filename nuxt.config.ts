// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  modules: [
    '@nuxtjs/tailwindcss',
    '@nuxt/eslint',
    '@vite-pwa/nuxt'
  ],
  css: [
    '~/assets/scss/global.scss'
  ],
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      id: '/?source=pwa',
      name: 'AVsub PRO',
      short_name: 'AVsub PRO',
      description: 'Unified Anime/JAV Torrents & Movie Subtitles Search Portal & Plex Library companion client',
      lang: 'vi',
      dir: 'ltr',
      theme_color: '#08070b',
      background_color: '#050406',
      display: 'standalone',
      orientation: 'any', // flexible orientation for video playback
      scope: '/',
      start_url: '/?source=pwa',
      categories: ['entertainment', 'utilities', 'video'],
      icons: [
        {
          src: '/icon-192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any'
        },
        {
          src: '/icon-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any'
        },
        {
          src: '/icon-512-maskable.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable'
        }
      ],
      shortcuts: [
        {
          name: 'Thư Viện Phim',
          short_name: 'Thư Viện',
          description: 'Xem thư viện phim JAV cá nhân của bạn',
          url: '/?tab=library&source=shortcut',
          icons: [{ src: '/icon-192.png', sizes: '192x192' }]
        },
        {
          name: 'Portal Tìm Kiếm',
          short_name: 'Tìm Kiếm',
          description: 'Tìm kiếm magnet torrent và phụ đề JAV',
          url: '/?tab=search&source=shortcut',
          icons: [{ src: '/icon-192.png', sizes: '192x192' }]
        }
      ],
      screenshots: [
        {
          src: '/screenshot-desktop.png',
          sizes: '1280x800',
          type: 'image/png',
          form_factor: 'wide',
          label: 'AVsub PRO Desktop View'
        },
        {
          src: '/screenshot-mobile.png',
          sizes: '750x1334',
          type: 'image/png',
          form_factor: 'narrow',
          label: 'AVsub PRO Mobile View'
        }
      ]
    },
    workbox: {
      navigateFallback: '/offline.html',
      globPatterns: ['**/*.{js,css,html,png,svg,ico,json}']
    },
    devOptions: {
      enabled: false
    }
  },
  eslint: {
    config: {
      typescript: true
    }
  },
  devtools: { enabled: true },
  typescript: {
    strict: true
  },
  app: {
    head: {
      title: 'AVsub PRO - JAV Subtitle Tool',
      meta: [
        { name: 'description', content: 'Search and apply subtitles to your JAV movie collection' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'apple-mobile-web-app-title', content: 'AVsub PRO' },
        { name: 'theme-color', content: '#08070b' }
      ],
      link: [
        { rel: 'manifest', href: '/manifest.json' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'icon', type: 'image/png', href: '/icon.png' },
        { rel: 'stylesheet', href: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css' }
      ]
    }
  },
  nitro: {
    experimental: {
      openAPI: true,
      tasks: true,
    },
    // Cron: chạy scheduler mỗi 5 phút để check pending pipeline jobs
    scheduledTasks: {
      '*/5 * * * *': ['javinizer:scheduler'],
    },
    // Storage 'data' → /data (volume trong docker-compose: /data/avsub.db, v.v.)
    storage: {
      data: {
        driver: 'fs',
        base: process.env.STORAGE_PATH || '/data',
      },
    },
  },
})
