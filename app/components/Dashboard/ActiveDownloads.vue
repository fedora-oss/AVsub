<script setup lang="ts">
import { useDashboardState } from '~/composables/useDashboardState'

const {
  activeDownloads,
  loadingDownloads,
  downloadsError,
  fetchActiveDownloads,
  controlTorrent
} = useDashboardState()

const isPausedState = (state: string) => {
  if (!state) return false
  const s = state.toLowerCase()
  return s.includes('paused') || s.includes('stopped') || s.includes('pause') || s.includes('stop')
}

const formatTorrentState = (state: string) => {
  if (!state) return ''
  const s = state.toLowerCase()
  if (s.includes('pauseddl') || s.includes('stoppeddl')) return 'TẠM DỪNG TẢI'
  if (s.includes('pausedup') || s.includes('stoppedup')) return 'DỪNG SEED (HOÀN THÀNH)'
  if (s.includes('downloading')) return 'ĐANG TẢI VỀ'
  if (s.includes('seeding')) return 'ĐANG SEED'
  if (s.includes('stalleddl')) return 'ĐANG CHỜ SEEDER'
  if (s.includes('stalledup')) return 'STALLED UPLOAD'
  if (s.includes('checking')) return 'ĐANG KIỂM TRA TỆP'
  if (s.includes('paused') || s.includes('stopped')) return 'TẠM DỪNG'
  return state.toUpperCase()
}

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const formatSpeed = (bytesPerSec: number) => {
  if (bytesPerSec <= 0) return '0 B/s'
  return formatSize(bytesPerSec) + '/s'
}

onMounted(() => {
  fetchActiveDownloads()
})
</script>

<template>
  <div class="qbit-downloads-section mt-8 mb-8 border border-white/[0.08] rounded-2xl p-6 bg-slate-950/40 backdrop-blur-md relative overflow-hidden">
    <!-- Network Error overlay (Option A) -->
    <div v-if="downloadsError" class="absolute inset-0 bg-slate-950/80 backdrop-blur-lg z-30 flex flex-col items-center justify-center text-center p-6 transition-all duration-300">
      <div class="h-12 w-12 rounded-full bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-450 mb-4 animate-bounce">
        <i class="fa-solid fa-triangle-exclamation text-xl"></i>
      </div>
      <h3 class="text-sm font-bold text-slate-200 mb-2">{{ downloadsError }}</h3>
      <p class="text-xs text-slate-400 max-w-sm mb-4">qBittorrent offline hoặc không thể kết nối. Đang tự động kết nối lại...</p>
      <button 
        class="h-9 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 shadow-lg shadow-violet-600/35"
        @click="fetchActiveDownloads"
      >
        <i class="fa-solid fa-arrows-rotate"></i> Thử Lại Ngay
      </button>
    </div>

    <div class="flex justify-between items-center mb-6">
      <h2 class="text-sm font-extrabold text-violet-400 tracking-wider uppercase flex items-center gap-2">
        <i class="fa-solid fa-download text-violet-400"></i>
        <span>Tiến Trình Tải Torrent qBittorrent (Real-time Downloads)</span>
      </h2>
      <button 
        class="h-8 w-8 rounded-xl border border-white/10 hover:bg-white/5 active:scale-95 text-slate-300 transition-all flex items-center justify-center animate-pulse"
        title="Làm mới"
        @click="fetchActiveDownloads"
      >
        <i class="fa-solid fa-arrows-rotate"></i>
      </button>
    </div>

    <!-- Skeleton Loader when loading (Option A) -->
    <div v-if="loadingDownloads && !activeDownloads.length" class="space-y-4 animate-pulse">
      <div v-for="i in 2" :key="i" class="border border-white/[0.06] rounded-xl p-4 bg-slate-900/40">
        <div class="h-4 w-48 bg-white/5 rounded mb-2"></div>
        <div class="h-2 w-full bg-white/5 rounded"></div>
      </div>
    </div>

    <div v-else-if="activeDownloads.length === 0" class="no-logs-box py-8 text-center border border-dashed border-white/[0.06] rounded-xl">
      <p class="text-xs text-slate-400">Không có tệp tải xuống nào hoạt động. Tải phim bằng qBit để theo dõi tiến trình!</p>
    </div>

    <div v-else class="space-y-4">
      <div 
        v-for="torrent in activeDownloads" 
        :key="torrent.hash" 
        class="border border-white/[0.06] rounded-xl p-4 bg-slate-900/40 hover:border-violet-500/20 transition-all"
      >
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
          <div class="min-w-0 flex-1">
            <h3 class="text-xs font-bold text-slate-200 truncate flex items-center gap-1.5 text-left" :title="torrent.name">
              <i class="fa-solid fa-clapperboard text-violet-400"></i>
              <span>{{ torrent.name }}</span>
            </h3>
            <div class="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-[10px] text-slate-400 font-mono">
              <span class="flex items-center gap-1"><i class="fa-solid fa-box text-slate-500"></i> DUNG LƯỢNG: {{ formatSize(torrent.size) }}</span>
              <span class="text-violet-400 font-extrabold flex items-center gap-1"><i class="fa-solid fa-tag text-violet-450"></i> TRẠNG THÁI: {{ formatTorrentState(torrent.state) }}</span>
              <span v-if="torrent.category" class="text-sky-400 flex items-center gap-1"><i class="fa-regular fa-folder text-sky-400"></i> THƯ MỤC: {{ torrent.category }}</span>
            </div>
          </div>

          <!-- Speed and Seeds Info -->
          <div class="flex items-center gap-3 text-[11px] text-slate-300 font-mono bg-white/5 px-3 py-1.5 rounded-lg border border-white/[0.05]">
            <span class="text-emerald-400 font-bold flex items-center gap-1"><i class="fa-solid fa-arrow-down text-emerald-450 animate-pulse"></i> {{ formatSpeed(torrent.dlspeed) }}</span>
            <span class="text-indigo-400 font-bold flex items-center gap-1"><i class="fa-solid fa-arrow-up text-indigo-440"></i> {{ formatSpeed(torrent.upspeed) }}</span>
            <span class="text-slate-400">SEEDS: {{ torrent.num_seeds }}</span>
          </div>
        </div>

        <!-- Progress Bar -->
        <div class="flex items-center gap-4">
          <div class="flex-1 bg-white/5 rounded-full h-2.5 overflow-hidden border border-white/[0.05] relative">
            <div 
              class="bg-gradient-to-r from-violet-600 to-indigo-500 h-full rounded-full transition-all duration-550" 
              :style="{ width: (torrent.progress * 100) + '%' }"
            />
          </div>
          <span class="text-xs font-mono font-bold text-violet-300 w-12 text-right">
            {{ (torrent.progress * 100).toFixed(1) }}%
          </span>
        </div>

        <!-- Meta details & Actions -->
        <div class="flex justify-between items-center mt-3 pt-3 border-t border-white/[0.04]">
          <span class="text-[10px] text-slate-500 font-mono flex items-center gap-1">
            <i class="fa-regular fa-clock text-slate-500"></i>
            <span>CÒN LẠI: {{ torrent.eta >= 8640000 ? 'VÔ HẠN' : torrent.eta === 0 ? 'XONG' : Math.floor(torrent.eta / 60) + ' PHÚT ' + (torrent.eta % 60) + ' GIÂY' }}</span>
          </span>

          <div class="flex gap-2">
            <button 
              v-if="isPausedState(torrent.state)"
              class="h-7 w-7 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 active:scale-90 transition-all flex items-center justify-center"
              title="Tiếp tục"
              @click="controlTorrent(torrent.hash, 'resume')"
            >
              <i class="fa-solid fa-play"></i>
            </button>
            <button 
              v-else
              class="h-7 w-7 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 active:scale-90 transition-all flex items-center justify-center"
              title="Tạm dừng"
              @click="controlTorrent(torrent.hash, 'pause')"
            >
              <i class="fa-solid fa-pause"></i>
            </button>
            <button 
              class="h-7 w-7 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/20 text-rose-400 active:scale-90 transition-all flex items-center justify-center"
              title="Xóa bỏ"
              @click="controlTorrent(torrent.hash, 'delete')"
            >
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
