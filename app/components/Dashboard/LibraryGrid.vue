<script setup lang="ts">
import { useDashboardState } from '~/composables/useDashboardState'

const {
  libraryMovies,
  libraryGenres,
  libraryActresses,
  pagination,
  loadingLibrary,
  filterSearch,
  filterGenre,
  filterActressId,
  filterSubStatus,
  featuredMovie,
  downloadingCardSubs,
  libraryError,
  fetchLibraryMovies,
  fetchFiltersData,
  resetLibraryFilters,
  quickDownloadSub,
  activeTab,
  currentKeyword,
} = useDashboardState()

// Custom function to open actress detail route
const openActressProfile = (actressId: number) => {
  navigateTo(`/actress/${actressId}`)
}

// Custom function to trigger torrent search tab
const searchActressTorrent = (keyword: string) => {
  activeTab.value = 'search'
  currentKeyword.value = keyword
  // Trigger search using a global event or letting the parent handle it
  // Since we use the same state, updating activeTab and currentKeyword will auto-fill the search
}

// Fetch library data on mounted
onMounted(() => {
  fetchFiltersData()
  fetchLibraryMovies(1)
})
</script>

<template>
  <div class="library-tab-wrapper relative min-h-[400px]">
    <!-- Network Error overlay (Option A) -->
    <div v-if="libraryError" class="absolute inset-0 bg-slate-950/80 backdrop-blur-lg z-30 flex flex-col items-center justify-center text-center p-6 rounded-3xl transition-all duration-300">
      <div class="h-12 w-12 rounded-full bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-450 mb-4 animate-bounce">
        <i class="fa-solid fa-triangle-exclamation text-xl"></i>
      </div>
      <h3 class="text-sm font-bold text-slate-200 mb-2">{{ libraryError }}</h3>
      <p class="text-xs text-slate-400 max-w-sm mb-4">Mất kết nối với cơ sở dữ liệu phim JAV. Đang thử kết nối lại tự động...</p>
      <button 
        class="h-9 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 shadow-lg shadow-violet-600/35"
        @click="fetchLibraryMovies(1)"
      >
        <i class="fa-solid fa-arrows-rotate"></i> Kết Nối Lại Ngay
      </button>
    </div>

    <!-- 🎬 Jellyfin Spotlight Featured Movie Banner -->
    <div 
      v-if="featuredMovie" 
      class="relative w-full h-[320px] sm:h-[400px] rounded-3xl overflow-hidden mb-8 border border-white/[0.06] shadow-2xl flex items-end group/spotlight cursor-pointer select-none"
      @click="navigateTo(`/movie/${featuredMovie.code}`)"
    >
      <!-- Widescreen Cover Image Background with Rich Blur and Gradients -->
      <div class="absolute inset-0 z-0 bg-slate-950">
        <img 
          v-if="featuredMovie.coverUrl"
          :src="featuredMovie.coverUrl" 
          :alt="featuredMovie.title" 
          class="w-full h-full object-cover transition-transform duration-700 scale-100 group-hover/spotlight:scale-105"
          @error="(e: any) => e.target.src = featuredMovie.posterUrl || '/icon.png'"
        >
        <img 
          v-else-if="featuredMovie.posterUrl"
          :src="featuredMovie.posterUrl" 
          :alt="featuredMovie.title" 
          class="w-full h-full object-cover blur-md scale-110 opacity-40"
        >
        <div class="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/70 to-transparent z-10"/>
        <div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent z-10"/>
      </div>

      <!-- Spotlight Content Overlay -->
      <div class="relative z-20 p-6 sm:p-10 max-w-2xl flex flex-col items-start gap-3 sm:gap-4 select-none">
        <!-- Spotlight Badge -->
        <div class="flex items-center gap-2">
          <span class="px-2.5 py-0.5 rounded-full bg-violet-600/30 border border-violet-500/40 text-violet-300 text-[10px] font-extrabold uppercase tracking-widest flex items-center gap-1.5 animate-pulse">
            <span class="w-1.5 h-1.5 rounded-full bg-violet-400"/>
            Nổi bật hôm nay
          </span>
          <span v-if="featuredMovie.hasLocalVideo" class="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[9px] font-extrabold uppercase tracking-widest">
            Sẵn sàng xem
          </span>
        </div>

        <!-- Movie JAV Code -->
        <h2 class="text-xs font-mono font-black text-violet-400 tracking-wider uppercase">
          {{ featuredMovie.code }}
        </h2>

        <!-- Movie Title -->
        <h1 class="text-xl sm:text-3xl font-black text-white leading-tight font-sans text-left line-clamp-2 drop-shadow-md">
          {{ featuredMovie.title }}
        </h1>

        <!-- Metadata Row -->
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-300 text-xs font-semibold font-sans">
          <span v-if="featuredMovie.releaseDate" class="text-violet-400 font-bold">
            {{ new Date(featuredMovie.releaseDate).getFullYear() }}
          </span>
          <span v-if="featuredMovie.releaseDate" class="text-slate-600">•</span>
          <div class="flex items-center gap-1">
            <span 
              v-for="actress in featuredMovie.actresses.slice(0, 3)" 
              :key="actress.id"
              class="hover:text-violet-300 transition-colors cursor-pointer underline decoration-violet-500/30"
              @click.stop="openActressProfile(actress.id)"
            >
              {{ actress.name }}
            </span>
            <span v-if="featuredMovie.actresses.length > 3" class="text-slate-400">...</span>
          </div>
          <span v-if="featuredMovie.genres && featuredMovie.genres.length > 0" class="text-slate-600">•</span>
          <div class="flex flex-wrap gap-1">
            <span 
              v-for="g in featuredMovie.genres.slice(0, 3)" 
              :key="g"
              class="px-1.5 py-0.5 rounded bg-white/5 border border-white/5 text-[9px] text-slate-400 tracking-wide uppercase font-bold"
            >
              {{ g }}
            </span>
          </div>
        </div>

        <!-- Buttons Group -->
        <div class="flex flex-wrap gap-3 mt-2 sm:mt-4">
          <!-- Xem Phim button -->
          <button 
            v-if="featuredMovie.hasLocalVideo"
            class="px-6 py-2.5 sm:px-8 sm:py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-all duration-200 active:scale-95 shadow-lg shadow-violet-600/35 hover:shadow-violet-600/50 flex items-center gap-2"
            @click.stop="navigateTo(`/movie/${featuredMovie.code}?play=true`)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            Xem Phim
          </button>
          
          <!-- Tìm torrent button -->
          <button 
            v-else
            class="px-6 py-2.5 sm:px-8 sm:py-3 bg-sky-600/20 hover:bg-sky-600/40 text-sky-300 border border-sky-500/35 rounded-2xl font-black text-xs uppercase tracking-wider transition-all duration-200 active:scale-95 shadow-lg shadow-sky-600/10 flex items-center gap-2"
            @click.stop="searchActressTorrent(featuredMovie.code)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 fill-none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>
            Tìm Torrent
          </button>

          <!-- Tải sub button -->
          <button 
            v-if="featuredMovie.hasLocalVideo && !featuredMovie.hasSubtitle"
            class="px-5 py-2.5 sm:px-6 sm:py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-2xl font-black text-xs uppercase tracking-wider transition-all duration-200 active:scale-95 shadow-lg shadow-amber-500/25 flex items-center gap-1.5"
            :disabled="downloadingCardSubs[featuredMovie.code]"
            @click.stop="quickDownloadSub(featuredMovie.code)"
          >
            <span v-if="downloadingCardSubs[featuredMovie.code]" class="spinner-mini border-slate-950"/>
            <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
            Tải Phụ Đề
          </button>
        </div>
      </div>
    </div>

    <!-- 🔍 Cyberpunk Filter Panel -->
    <div class="library-filter-panel mb-6">
      <div class="filter-row flex flex-wrap gap-4 items-center">
        <!-- Text Search -->
        <div class="filter-group flex-1 min-w-[200px]">
          <input 
            v-model="filterSearch"
            type="text"
            placeholder="Tìm phim theo Mã JAV hoặc Tiêu đề..."
            class="filter-input search w-full p-2.5 bg-slate-900/60 border border-white/[0.08] rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500/50"
            @input="fetchLibraryMovies(1)"
          >
        </div>

        <!-- Genre filter -->
        <div class="filter-group">
          <select 
            v-model="filterGenre" 
            class="filter-select p-2.5 bg-slate-900/60 border border-white/[0.08] rounded-xl text-xs text-slate-200 focus:outline-none focus:border-violet-500/50" 
            @change="fetchLibraryMovies(1)"
          >
            <option value="">🎭 Tất cả thể loại</option>
            <option v-for="g in libraryGenres" :key="g" :value="g">{{ g }}</option>
          </select>
        </div>

        <!-- Actress filter -->
        <div class="filter-group">
          <select 
            v-model="filterActressId" 
            class="filter-select p-2.5 bg-slate-900/60 border border-white/[0.08] rounded-xl text-xs text-slate-200 focus:outline-none focus:border-violet-500/50" 
            @change="fetchLibraryMovies(1)"
          >
            <option value="">⭐ Tất cả diễn viên</option>
            <option v-for="a in libraryActresses" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </div>

        <!-- Subtitle filter -->
        <div class="filter-group">
          <select 
            v-model="filterSubStatus" 
            class="filter-select p-2.5 bg-slate-900/60 border border-white/[0.08] rounded-xl text-xs text-slate-200 focus:outline-none focus:border-violet-500/50" 
            @change="fetchLibraryMovies(1)"
          >
            <option value="all">📝 Phụ đề: Tất cả</option>
            <option value="hasSub">🟢 Đã có phụ đề</option>
            <option value="noSub">🔴 Chưa có phụ đề</option>
          </select>
        </div>

        <!-- Reset button -->
        <button 
          class="reset-filter-btn h-9 px-4 rounded-xl border border-white/10 hover:bg-white/5 text-xs text-slate-300 font-bold active:scale-95 transition-all flex items-center gap-1.5" 
          @click="resetLibraryFilters"
        >
          <i class="fa-solid fa-rotate-left"></i>
          <span>Reset</span>
        </button>
      </div>
    </div>

    <!-- Loading State / Skeleton Screen -->
    <div v-if="loadingLibrary" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6 animate-pulse">
      <div v-for="n in 12" :key="n" class="border border-white/[0.06] rounded-2xl bg-slate-950/20 overflow-hidden">
        <div class="aspect-[2/3] bg-white/5"></div>
        <div class="p-3 space-y-2">
          <div class="h-3 w-16 bg-white/5 rounded"></div>
          <div class="h-4 w-full bg-white/5 rounded"></div>
          <div class="h-3 w-20 bg-white/5 rounded"></div>
        </div>
      </div>
    </div>

    <div v-else-if="libraryMovies.length === 0" class="no-results-box library py-12 text-center border border-dashed border-white/[0.06] rounded-3xl">
      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="empty-icon text-slate-500 mx-auto mb-3"><circle cx="12" cy="12" r="10"/><line x1="8" x2="16" y1="12" y2="12"/></svg>
      <p class="text-xs text-slate-400">Không tìm thấy bộ phim nào trong thư viện khớp với bộ lọc hiện tại.</p>
      <button class="reset-filter-btn text-xs mt-3 bg-white/5 px-3 py-1.5 rounded-lg border border-white/10 text-slate-350 hover:bg-white/10" @click="resetLibraryFilters">Xóa bộ lọc</button>
    </div>

    <div v-else class="library-content-area">
      <div class="library-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
        <div 
          v-for="movie in libraryMovies" 
          :key="movie.contentId" 
          class="movie-plex-card cursor-pointer group border border-white/[0.06] rounded-2xl overflow-hidden bg-slate-950/25 backdrop-blur-md flex flex-col justify-between hover:border-violet-500/20 transition-all duration-300 shadow-xl"
          :class="{ 'border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.08)]': movie.hasLocalVideo }"
          @click="navigateTo(`/movie/${movie.code}`)"
        >
          <!-- Card Poster Image -->
          <div class="movie-poster-container relative aspect-[2/3] overflow-hidden bg-slate-950">
            <img 
              v-if="movie.posterUrl" 
              :src="movie.posterUrl" 
              :alt="movie.title" 
              class="movie-poster-img w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
              @error="(e: any) => e.target.src = '/icon.png'"
            >
            <div v-else class="movie-poster-fallback w-full h-full flex items-center justify-center bg-slate-900 text-xs font-mono font-bold text-slate-400">
              <span>{{ movie.code }}</span>
            </div>

            <!-- Floating Subtitle & Video Status Indicator Badge -->
            <div 
              class="absolute top-2 left-2 px-2 py-0.5 rounded-lg text-[9px] font-extrabold uppercase tracking-widest flex items-center gap-1 z-10 shadow-md backdrop-blur-md border"
              :class="{ 
                'bg-emerald-500/25 border-emerald-500/35 text-emerald-300': movie.hasLocalVideo,
                'bg-amber-500/25 border-amber-500/35 text-amber-300': !movie.hasLocalVideo && movie.hasSubtitle,
                'bg-slate-500/25 border-white/10 text-slate-400': !movie.hasLocalVideo && !movie.hasSubtitle 
              }"
            >
              <span class="w-1.5 h-1.5 rounded-full" :class="movie.hasLocalVideo ? 'bg-emerald-450' : movie.hasSubtitle ? 'bg-amber-450' : 'bg-slate-500'"/>
              <span>{{ movie.hasLocalVideo ? 'PLAYABLE' : movie.hasSubtitle ? 'CÓ SUB' : 'CHƯA SUB' }}</span>
            </div>

            <!-- Hover overlay actions -->
            <div class="absolute inset-0 flex flex-col gap-2.5 items-center justify-center bg-black/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10">
              <!-- NÚT XEM PHIM NẾU SẴN SÀNG -->
              <button 
                v-if="movie.hasLocalVideo"
                class="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-2 rounded-xl font-extrabold text-[11px] uppercase tracking-wider transition-all duration-200 active:scale-95 shadow-lg shadow-emerald-500/20 flex items-center gap-1.5"
                @click.stop="navigateTo(`/movie/${movie.code}?play=true`)"
              >
                <i class="fa-solid fa-play"></i>
                <span>Xem Phim</span>
              </button>

              <!-- NÚT TẢI PHỤ ĐỀ NẾU CÓ PHIM NHƯNG CHƯA CÓ SUB -->
              <button 
                v-if="movie.hasLocalVideo && !movie.hasSubtitle" 
                class="bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 py-1.5 rounded-xl font-extrabold text-[10px] uppercase tracking-wider transition-all duration-200 active:scale-95 shadow-lg shadow-amber-500/20 flex items-center gap-1.5"
                :disabled="downloadingCardSubs[movie.code]"
                @click.stop="quickDownloadSub(movie.code)"
              >
                <span v-if="downloadingCardSubs[movie.code]" class="spinner-mini"/>
                <template v-else>
                  <i class="fa-solid fa-download"></i>
                  <span>Tải Sub</span>
                </template>
              </button>

              <!-- NÚT TÌM TORRENT NẾU CHƯA CÓ PHIM CỤC BỘ -->
              <button 
                v-if="!movie.hasLocalVideo"
                class="bg-sky-500/20 hover:bg-sky-500/40 text-sky-300 border border-sky-500/35 px-4 py-2 rounded-xl font-extrabold text-[11px] uppercase tracking-wider transition-all duration-200 active:scale-95 flex items-center gap-1.5"
                @click.stop="searchActressTorrent(movie.code)"
              >
                <i class="fa-solid fa-magnifying-glass"></i>
                <span>Tìm Torrent</span>
              </button>
            </div>
          </div>

          <!-- Card Metadata Details -->
          <div class="p-3 flex-1 flex flex-col justify-between gap-1.5 select-none">
            <div>
              <div class="flex justify-between items-center gap-1 text-[10px] font-mono text-slate-400">
                <span class="font-extrabold text-violet-400 uppercase">{{ movie.code }}</span>
                <span v-if="movie.releaseDate">{{ new Date(movie.releaseDate).getFullYear() }}</span>
              </div>
              <h3 class="text-left mt-1" :title="movie.title">
                <PretextText 
                  :text="movie.title" 
                  font="bold 12px ui-sans-serif, system-ui, sans-serif"
                  :line-height="16"
                  :max-lines="2"
                  class="text-slate-200 text-xs font-bold leading-tight"
                />
              </h3>
            </div>
            
            <!-- Actresses list -->
            <div class="flex flex-wrap gap-1 mt-1 border-t border-white/[0.04] pt-2">
              <span 
                v-for="actress in movie.actresses" 
                :key="actress.id"
                class="text-[9px] font-bold text-slate-400 hover:text-violet-300 transition-colors underline decoration-slate-650 decoration-dotted cursor-pointer"
                @click.stop="openActressProfile(actress.id)"
              >
                {{ actress.name }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 📃 Cyberpunk Pagination Footer -->
      <div v-if="pagination.totalPages > 1" class="library-pagination mt-10 flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border border-white/[0.05] rounded-2xl bg-slate-900/20 backdrop-blur-md">
        <button 
          class="pagination-btn h-9 px-4 rounded-xl border border-white/10 hover:bg-white/5 active:scale-95 transition-all text-xs font-bold text-slate-300 disabled:opacity-30 disabled:pointer-events-none flex items-center gap-1.5" 
          :disabled="pagination.page === 1" 
          @click="fetchLibraryMovies(pagination.page - 1)"
        >
          <i class="fa-solid fa-chevron-left"></i>
          <span>Trang trước</span>
        </button>
        <span class="pagination-indicator text-[11px] text-slate-400 font-medium">
          Trang <strong class="text-violet-400 font-extrabold">{{ pagination.page }}</strong> / {{ pagination.totalPages }} (Tổng: {{ pagination.total }} phim)
        </span>
        <button 
          class="pagination-btn h-9 px-4 rounded-xl border border-white/10 hover:bg-white/5 active:scale-95 transition-all text-xs font-bold text-slate-300 disabled:opacity-30 disabled:pointer-events-none flex items-center gap-1.5" 
          :disabled="pagination.page === pagination.totalPages" 
          @click="fetchLibraryMovies(pagination.page + 1)"
        >
          <span>Trang sau</span>
          <i class="fa-solid fa-chevron-right"></i>
        </button>
      </div>
    </div>
  </div>
</template>
