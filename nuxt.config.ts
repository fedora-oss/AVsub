// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  modules: [
    '@nuxtjs/tailwindcss'
  ],
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
        { rel: 'icon', type: 'image/png', href: '/icon.png' }
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
