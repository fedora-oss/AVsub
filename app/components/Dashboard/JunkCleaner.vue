<script setup lang="ts">
import { useDashboardState } from '~/composables/useDashboardState'

const {
  junkPatterns,
  junkPatternsInput,
  hasDeletePermission,
  permErrorMessage,
  movieDir,
  loadingFilters,
  savingFilters,
  cleaningJunk,
  cleanupReport,
  junkError,
  fetchJunkFilters,
  saveJunkFilters,
  triggerManualCleanup,
} = useDashboardState()

// Load filters on mounted
onMounted(() => {
  fetchJunkFilters()
})
</script>

<template>
  <div class="junk-filters-section mt-8 mb-8 border border-white/[0.08] rounded-2xl p-6 bg-slate-950/40 backdrop-blur-md relative overflow-hidden">
    <!-- Network Error overlay (Option A) -->
    <div v-if="junkError" class="absolute inset-0 bg-slate-950/80 backdrop-blur-lg z-30 flex flex-col items-center justify-center text-center p-6 transition-all duration-300">
      <div class="h-12 w-12 rounded-full bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-450 mb-4 animate-bounce">
        <i class="fa-solid fa-triangle-exclamation text-xl"></i>
      </div>
      <h3 class="text-sm font-bold text-slate-200 mb-2">{{ junkError }}</h3>
      <p class="text-xs text-slate-400 max-w-sm mb-4">Kết nối tới máy chủ bị gián đoạn. Vui lòng kiểm tra đường truyền hoặc thử kết nối lại.</p>
      <button 
        class="h-9 px-4 rounded-xl bg-rose-500/20 hover:bg-rose-500/35 border border-rose-500/30 text-rose-350 text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5"
        @click="fetchJunkFilters"
      >
        <i class="fa-solid fa-arrows-rotate"></i> Thử Kết Nối Lại
      </button>
    </div>

    <div class="flex justify-between items-center mb-6">
      <h2 class="text-sm font-extrabold text-sky-400 tracking-wider uppercase flex items-center gap-2">
        <i class="fa-solid fa-ban text-sky-400"></i>
        <span>Bộ Lọc Video Ngoại Lai (Junk Video Regex Filters)</span>
      </h2>
      <div class="flex gap-2">
        <button 
          class="h-8 px-4 rounded-xl border border-white/10 hover:bg-white/5 active:scale-95 text-xs text-slate-300 transition-all flex items-center gap-1"
          :disabled="loadingFilters"
          @click="fetchJunkFilters"
        >
          <i class="fa-solid fa-arrows-rotate mr-1"></i> Tải lại
        </button>
      </div>
    </div>

    <!-- Skeleton Loader when loading (Option A) -->
    <div v-if="loadingFilters && !junkPatterns.length" class="space-y-4 animate-pulse">
      <div class="h-32 bg-white/5 border border-white/[0.05] rounded-xl"></div>
      <div class="flex gap-3">
        <div class="h-9 w-32 bg-white/5 rounded-xl"></div>
        <div class="h-9 w-32 bg-white/5 rounded-xl"></div>
      </div>
    </div>

    <div v-else>
      <p class="text-xs text-slate-400 mb-4 leading-relaxed">
        Quét đệ quy thư mục <code class="bg-white/5 px-1 py-0.5 rounded text-sky-300 font-mono">{{ movieDir || '/movies' }}</code> và tự động xóa toàn bộ các tệp video trùng khớp với bất kỳ mẫu Regex nào dưới đây để dọn dẹp các tệp quảng cáo/rác tải kèm torrent. Bộ lọc chạy tự động ở Bước 0 của Pipeline.
      </p>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Textarea Input Area -->
        <div class="lg:col-span-2 flex flex-col gap-3">
          <textarea
            v-model="junkPatternsInput"
            class="w-full h-32 p-3 bg-slate-900/60 border border-white/[0.08] rounded-xl text-xs text-slate-200 font-mono focus:border-sky-500/50 focus:outline-none placeholder-slate-600 leading-normal"
            placeholder="996gg\.cc&#10;18+游戏大全&#10;游戏大全"
            :disabled="savingFilters"
          />
          <div class="flex gap-3 items-center">
            <button 
              class="h-9 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:bg-sky-850 disabled:opacity-50 active:scale-95 text-slate-950 font-extrabold text-xs uppercase transition-all flex items-center gap-2"
              :disabled="savingFilters"
              @click="saveJunkFilters"
            >
              <span v-if="savingFilters" class="spinner-mini !border-slate-950"/>
              <i class="fa-regular fa-floppy-disk mr-1.5"></i> Lưu cấu hình
            </button>
            
            <button 
              class="h-9 px-4 rounded-xl border border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-400 active:scale-95 text-xs text-slate-300 font-bold uppercase transition-all flex items-center gap-2"
              :disabled="cleaningJunk || !hasDeletePermission"
              @click="triggerManualCleanup"
            >
              <span v-if="cleaningJunk" class="spinner-mini mr-1.5"/>
              <i class="fa-solid fa-broom mr-1.5"></i> Quét & Dọn Dẹp Ngay
            </button>
          </div>

          <p v-if="!hasDeletePermission && !loadingFilters" class="text-xs text-rose-400 bg-rose-500/10 p-3 rounded-xl border border-rose-500/20 mt-2 flex items-center gap-2">
            <i class="fa-solid fa-circle-exclamation text-rose-450"></i>
            <span>Thiếu quyền ghi/xóa thư mục phim: {{ permErrorMessage || 'Vui lòng kiểm tra quyền hệ thống.' }}</span>
          </p>
        </div>

        <!-- Regex Examples & Info Card -->
        <div class="border border-white/[0.08] rounded-xl p-4 bg-slate-900/40 flex flex-col justify-between">
          <div>
            <h3 class="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
              <i class="fa-regular fa-lightbulb text-amber-500"></i>
              <span>Hướng dẫn & Ví dụ Regex:</span>
            </h3>
            <ul class="text-[11px] text-slate-400 space-y-2 list-disc list-inside">
              <li><code class="bg-white/5 px-1 py-0.5 rounded font-mono text-sky-300 font-mono">996gg\.cc</code>: Khớp tên miền quảng cáo.</li>
              <li><code class="bg-white/5 px-1 py-0.5 rounded font-mono text-sky-300 font-mono">18\+游戏大全</code>: Khớp game 18+.</li>
              <li>Biên dịch không phân biệt chữ hoa/thường (Flag <code class="bg-white/5 px-1 py-0.5 rounded font-mono text-slate-300 font-mono">i</code>).</li>
              <li>Chỉ các tệp video (<code class="bg-white/5 px-1 py-0.5 rounded font-mono text-slate-300 font-mono">.mp4, .mkv, .avi</code>) mới bị xóa.</li>
            </ul>
          </div>
          <div class="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between">
            <span class="text-[11px] text-slate-500">Mẫu đang hoạt động:</span>
            <span class="text-xs font-mono font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full">
              {{ junkPatterns.length }} patterns
            </span>
          </div>
        </div>
      </div>

      <!-- Cleanup Report Section -->
      <Transition name="fade">
        <div v-if="cleanupReport" class="mt-4 p-4 border border-emerald-500/20 rounded-xl bg-emerald-950/20">
          <h4 class="text-xs font-bold text-emerald-400 mb-2 flex items-center gap-1.5">
            <i class="fa-solid fa-circle-check text-emerald-400"></i>
            <span>Đã hoàn tất dọn dẹp video ngoại lai!</span>
          </h4>
          <div class="text-[11px] text-slate-300 space-y-1">
            <p class="flex items-center gap-1"><i class="fa-solid fa-circle-check text-emerald-500 text-[10px]"></i> Đã xóa thành công: <strong class="text-emerald-400 font-bold">{{ cleanupReport.deletedCount }}</strong> tệp video.</p>
            <p v-if="cleanupReport.errorsCount > 0" class="flex items-center gap-1 text-rose-450"><i class="fa-solid fa-circle-xmark text-rose-500 text-[10px]"></i> Lỗi khi xóa: {{ cleanupReport.errorsCount }} tệp.</p>
            <div v-if="cleanupReport.deleted.length > 0" class="mt-2 max-h-24 overflow-y-auto font-mono text-[10px] text-slate-400 bg-slate-950/50 p-2 rounded border border-white/[0.05]">
              <div v-for="file in cleanupReport.deleted" :key="file" class="truncate flex items-center gap-1.5">
                <i class="fa-solid fa-trash-can text-slate-500 text-[9px]"></i>
                <span>{{ file }}</span>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>
