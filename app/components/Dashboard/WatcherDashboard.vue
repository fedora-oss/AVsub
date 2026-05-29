<script setup lang="ts">
import { useDashboardState } from '~/composables/useDashboardState'

const {
  watcherState,
  watcherTasks,
  triggeringScan,
  scanMessage,
  pipelineJobs,
  loadingJobs,
  watcherError,
  pipelineError,
  fetchWatcherState,
  fetchWatcherTasks,
  triggerManualScan,
  clearWatcherLogs,
  fetchPipelineJobs,
  triggerJobNow,
  cancelJob,
} = useDashboardState()

const formatTime = (ts: number) => {
  const d = new Date(ts)
  return d.toLocaleTimeString('vi-VN') + ' ' + d.toLocaleDateString('vi-VN')
}

const formatTaskType = (type: string) => {
  switch (type) {
    case 'watch_detect': return 'GIÁM SÁT'
    case 'subtitle_search': return 'TÌM SUB'
    case 'subtitle_download': return 'TẢI SUB'
    case 'manual_scan': return 'QUÉT THỦ CÔNG'
    default: return 'TÁC VỤ'
  }
}

const getTaskIconClass = (type: string) => {
  switch (type) {
    case 'watch_detect': return 'fa-solid fa-eye text-sky-400'
    case 'subtitle_search': return 'fa-solid fa-magnifying-glass text-indigo-400'
    case 'subtitle_download': return 'fa-solid fa-download text-emerald-400'
    case 'manual_scan': return 'fa-solid fa-bolt text-amber-400'
    default: return 'fa-solid fa-gear text-slate-400'
  }
}

// Initial fetch on mount
onMounted(() => {
  fetchWatcherState()
  fetchWatcherTasks()
  fetchPipelineJobs()
})
</script>

<template>
  <div class="watcher-tab-container relative">
    <!-- Network Error overlay (Option A) -->
    <div v-if="watcherError" class="absolute inset-0 bg-slate-950/80 backdrop-blur-lg z-30 flex flex-col items-center justify-center text-center p-6 rounded-3xl transition-all duration-300">
      <div class="h-12 w-12 rounded-full bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-450 mb-4 animate-bounce">
        <i class="fa-solid fa-triangle-exclamation text-xl"></i>
      </div>
      <h3 class="text-sm font-bold text-slate-200 mb-2">{{ watcherError }}</h3>
      <p class="text-xs text-slate-400 max-w-sm mb-4">Watcher Daemon đang offline hoặc không kết nối được. Đang thử kết nối lại tự động...</p>
      <button 
        class="h-9 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 shadow-lg shadow-violet-600/35"
        @click="fetchWatcherState(); fetchWatcherTasks(); fetchPipelineJobs()"
      >
        <i class="fa-solid fa-arrows-rotate"></i> Thử Kết Nối Lại
      </button>
    </div>

    <!-- 📊 Stats / Configuration Grid -->
    <div class="stats-grid grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div class="stat-card p-4 border border-white/[0.08] rounded-2xl bg-slate-900/20 backdrop-blur-md flex items-center gap-4">
        <div class="stat-icon h-10 w-10 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-400"><i class="fa-solid fa-robot text-lg"></i></div>
        <div class="stat-content flex-1 text-left">
          <span class="stat-label text-[10px] text-slate-500 block">Trạng thái Daemon</span>
          <div class="stat-value-flex mt-1">
            <span v-if="watcherState.active" class="status-indicator active text-xs font-extrabold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-450 animate-pulse"/> Giám sát 24/7
            </span>
            <span v-else class="status-indicator inactive text-xs font-extrabold text-slate-400 bg-white/5 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-slate-500"/> Tạm dừng
            </span>
          </div>
        </div>
      </div>

      <div class="stat-card p-4 border border-white/[0.08] rounded-2xl bg-slate-900/20 backdrop-blur-md flex items-center gap-4">
        <div class="stat-icon h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-400"><i class="fa-regular fa-folder-open text-lg"></i></div>
        <div class="stat-content flex-1 min-w-0 text-left">
          <span class="stat-label text-[10px] text-slate-500 block">Thư mục Giám sát</span>
          <span class="stat-value path-text text-xs font-bold text-slate-200 truncate block mt-1" :title="watcherState.watchedPath">
            {{ watcherState.watchedPath || 'Chưa cấu hình' }}
          </span>
        </div>
      </div>

      <div class="stat-card p-4 border border-white/[0.08] rounded-2xl bg-slate-900/20 backdrop-blur-md flex items-center gap-4">
        <div class="stat-icon h-10 w-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400"><i class="fa-solid fa-gears text-lg"></i></div>
        <div class="stat-content flex-1 text-left">
          <span class="stat-label text-[10px] text-slate-500 block">Cơ chế Quét</span>
          <span class="stat-value stats-sub-text text-xs font-bold text-slate-200 block mt-1">
            {{ watcherState.polling ? 'Polling (NAS)' : 'Native' }} / {{ watcherState.interval / 1000 }}s
          </span>
        </div>
      </div>

      <div class="stat-card p-4 border border-white/[0.08] rounded-2xl bg-slate-900/20 backdrop-blur-md flex items-center gap-4">
        <div class="stat-icon h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400"><i class="fa-solid fa-clapperboard text-lg"></i></div>
        <div class="stat-content flex-1 text-left">
          <span class="stat-label text-[10px] text-slate-500 block">Tổng phim đã quét</span>
          <span class="stat-value font-bold text-xs text-slate-200 block mt-1">{{ watcherState.totalFilesWatched }} tệp video</span>
        </div>
      </div>
    </div>

    <!-- ⚡ Actions Bar -->
    <div class="watcher-actions-bar flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
      <div class="watcher-action-buttons flex gap-3">
        <button 
          class="watcher-action-btn scan-btn h-9 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 active:scale-95 text-slate-950 font-extrabold text-xs uppercase transition-all flex items-center gap-1.5" 
          :disabled="triggeringScan" 
          @click="triggerManualScan"
        >
          <span v-if="triggeringScan" class="spinner-mini !border-slate-950"/>
          <i v-else class="fa-solid fa-bolt"></i> 
          <span>Quét Toàn Bộ Thư Mục</span>
        </button>
        
        <button 
          class="watcher-action-btn clear-btn h-9 px-4 rounded-xl border border-white/10 hover:bg-white/5 active:scale-95 text-xs text-slate-350 font-bold transition-all flex items-center gap-1.5" 
          @click="clearWatcherLogs"
        >
          <i class="fa-solid fa-trash-can"></i>
          <span>Xóa Nhật Ký</span>
        </button>
      </div>

      <!-- Scan Alert Notifications -->
      <Transition name="fade">
        <div v-if="scanMessage" class="scan-alert bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs px-4 py-2 rounded-xl flex items-center gap-2">
          <span class="alert-icon"><i class="fa-solid fa-bell animate-bounce"></i></span>
          <span class="alert-text">{{ scanMessage }}</span>
        </div>
      </Transition>
    </div>

    <!-- ⏳ Pipeline Queue Manager Section -->
    <div class="pipeline-queue-section mt-8 mb-8 border border-white/[0.08] rounded-2xl p-6 bg-slate-950/40 backdrop-blur-md relative overflow-hidden">
      <!-- Local Pipeline Error overlay -->
      <div v-if="pipelineError" class="absolute inset-0 bg-slate-950/80 backdrop-blur-md z-20 flex flex-col items-center justify-center text-center p-4">
        <p class="text-xs font-bold text-rose-450 mb-2">{{ pipelineError }}</p>
        <button class="text-[10px] text-slate-300 underline" @click="fetchPipelineJobs">Thử lại</button>
      </div>

      <div class="flex justify-between items-center mb-6">
        <h2 class="text-sm font-extrabold text-sky-400 tracking-wider uppercase flex items-center gap-2">
          <i class="fa-solid fa-hourglass-half text-sky-400"></i>
          <span>Hàng đợi xử lý Post-Download (Javinizer Pipeline Queue)</span>
        </h2>
        <button 
          class="h-8 w-8 rounded-xl border border-white/10 hover:bg-white/5 active:scale-95 text-slate-300 transition-all flex items-center justify-center"
          title="Làm mới"
          @click="fetchPipelineJobs"
        >
          <i class="fa-solid fa-arrows-rotate"></i>
        </button>
      </div>

      <!-- Skeleton loader when loading jobs -->
      <div v-if="loadingJobs && !pipelineJobs.length" class="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse">
        <div v-for="i in 2" :key="i" class="h-28 border border-white/[0.08] rounded-xl bg-white/5"></div>
      </div>

      <div v-else-if="pipelineJobs.length === 0" class="no-logs-box py-8 text-center border border-dashed border-white/[0.06] rounded-xl">
        <p class="text-xs text-slate-400">Không có job nào trong hàng đợi. Tải thêm phim bằng qBit để kích hoạt hàng đợi!</p>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div 
          v-for="job in pipelineJobs" 
          :key="job.id" 
          class="border border-white/[0.08] rounded-xl p-4 bg-slate-900/60 flex flex-col justify-between transition-all hover:border-sky-500/30 text-left"
        >
          <div>
            <div class="flex justify-between items-center mb-2">
              <span class="text-[10px] font-mono text-slate-500">JOB-ID: {{ job.id.substring(0, 8) }}...</span>
              <span class="text-xs font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full">Chuẩn bị chạy</span>
            </div>
            <p class="text-xs text-slate-300 mb-1 flex items-center gap-1.5">
              <i class="fa-regular fa-folder text-slate-400"></i>
              <span>Đường dẫn: <code class="bg-white/5 px-1 py-0.5 rounded text-sky-300 font-mono">{{ job.moviesDir }}</code></span>
            </p>
            <p class="text-[11px] text-slate-400 flex items-center gap-1.5">
              <i class="fa-regular fa-clock text-slate-500"></i>
              <span>Lập lịch lúc: {{ new Date(job.scheduledAt).toLocaleTimeString() }}</span>
            </p>
            <p class="text-[11px] text-slate-400 font-semibold text-emerald-400 mt-1 uppercase flex items-center gap-1.5">
              <i class="fa-solid fa-rocket text-emerald-400"></i>
              <span>ĐẾM NGƯỢC: SẼ CHẠY SAU {{ job.remainingSeconds >= 60 ? Math.floor(job.remainingSeconds / 60) + ' PHÚT ' + (job.remainingSeconds % 60) + ' GIÂY' : job.remainingSeconds + ' GIÂY' }}</span>
            </p>
          </div>

          <div class="mt-4 flex gap-2 justify-end">
            <button 
              class="h-7 w-7 rounded-lg bg-sky-500 hover:bg-sky-400 active:scale-90 text-slate-950 transition-all flex items-center justify-center"
              title="Chạy ngay"
              @click="triggerJobNow(job.id)"
            >
              <i class="fa-solid fa-bolt"></i>
            </button>
            <button 
              class="h-7 w-7 rounded-lg border border-rose-500/30 hover:bg-rose-500/10 text-rose-400 active:scale-90 transition-all flex items-center justify-center"
              title="Hủy bỏ"
              @click="cancelJob(job.id)"
            >
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 📝 Task Log Terminal -->
    <div class="task-log-section border border-white/[0.08] rounded-2xl p-6 bg-slate-950/40 backdrop-blur-md">
      <div class="flex justify-between items-center mb-6 border-b border-white/[0.05] pb-3">
        <h2 class="text-sm font-extrabold text-violet-400 tracking-wider uppercase flex items-center gap-2">
          <i class="fa-solid fa-terminal text-violet-400"></i>
          <span>Nhật ký Tác vụ Ngầm (Background Logs)</span>
        </h2>
      </div>

      <div class="log-terminal-container max-h-[300px] overflow-y-auto scrollbar-hide">
        <div v-if="watcherTasks.length === 0" class="no-logs-box py-8 text-center border border-dashed border-white/[0.06] rounded-xl">
          <p class="text-xs text-slate-400">Chưa ghi nhận sự kiện nào. Daemon sẽ ghi nhật ký khi có video mới được tải xong hoặc khi quét thư mục.</p>
        </div>

        <div v-else class="log-list space-y-3">
          <div 
            v-for="task in watcherTasks" 
            :key="task.id" 
            class="log-item-card border border-white/[0.06] rounded-xl p-4 bg-slate-900/40 text-left"
            :class="task.status"
          >
            <div class="log-meta-bar flex flex-wrap items-center gap-3 text-[10px] text-slate-400 border-b border-white/[0.04] pb-2 mb-2 font-mono">
              <span class="log-status-badge px-2 py-0.5 rounded-full flex items-center gap-1 font-bold" 
                :class="{
                  'bg-emerald-500/10 text-emerald-400': task.status === 'completed',
                  'bg-rose-500/10 text-rose-450': task.status === 'failed',
                  'bg-amber-500/10 text-amber-400': task.status !== 'completed' && task.status !== 'failed'
                }"
              >
                <i v-if="task.status === 'completed'" class="fa-solid fa-circle-check"></i>
                <i v-else-if="task.status === 'failed'" class="fa-solid fa-circle-xmark"></i>
                <i v-else class="fa-solid fa-circle-notch fa-spin"></i>
                {{ task.status === 'completed' ? 'THÀNH CÔNG' : task.status === 'failed' ? 'THẤT BẠI' : 'ĐANG CHẠY' }}
              </span>
              <span class="log-type-badge flex items-center gap-1.5">
                <i :class="getTaskIconClass(task.type)"></i>
                {{ formatTaskType(task.type) }}
              </span>
              <span class="log-timestamp flex items-center gap-1.5 ml-auto">
                <i class="fa-regular fa-clock"></i>
                {{ formatTime(task.timestamp) }}
              </span>
            </div>

            <div class="log-body-content space-y-1">
              <div class="log-movie-title text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <i class="fa-solid fa-clapperboard text-violet-400"></i>
                <span>Mã phim JAV: <strong class="text-violet-400 glow-code">{{ task.movieCode }}</strong></span>
              </div>
              <div class="log-status-message text-xs text-slate-350 leading-relaxed">{{ task.message }}</div>
              <div class="log-file-path text-[10px] text-slate-500 font-mono flex items-center gap-1.5 truncate" :title="task.filePath">
                <i class="fa-regular fa-folder-open"></i>
                <span>Đường dẫn: <code>{{ task.filePath }}</code></span>
              </div>
              <div v-if="task.error" class="log-error-detail text-[10px] text-rose-400 bg-rose-500/5 p-2 rounded border border-rose-500/10 flex items-center gap-1.5 mt-2 font-mono">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <span>Chi tiết lỗi: <code>{{ task.error }}</code></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
