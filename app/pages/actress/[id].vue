<script setup lang="ts">
import { ref, onMounted } from 'vue'

const route = useRoute()
const actressId = route.params.id as string

const loadingActressDetail = ref(true)
const selectedActress = ref<any>(null)
const actressMovies = ref<any[]>([])

// Fetch actress details & works
const fetchActressData = async () => {
  loadingActressDetail.value = true
  try {
    const res = await $fetch<any>('/api/library/actress', {
      query: { id: actressId }
    })
    if (res.success) {
      selectedActress.value = res.actress
      actressMovies.value = res.movies
    }
  } catch (err) {
    console.error('Failed to fetch actress detail:', err)
  } finally {
    loadingActressDetail.value = false
  }
}

// 1-Click quick download subtitle from grid card
const downloadingCardSubs = ref<Record<string, boolean>>({})
const quickDownloadSub = async (movieCode: string) => {
  if (downloadingCardSubs.value[movieCode]) return
  downloadingCardSubs.value[movieCode] = true
  
  try {
    // 1. Search subtitles
    const searchResults = await $fetch<any[]>('/api/search', {
      query: { keyword: movieCode }
    })

    if (!searchResults || searchResults.length === 0) {
      alert(`Không tìm thấy phụ đề nào cho mã ${movieCode} trên AVSubtitles.`)
      return
    }

    const bestSub = searchResults[0]
    
    // 2. Download subtitle
    const downloadResponse = await $fetch<any>('/api/download', {
      method: 'POST',
      body: {
        detail_link: bestSub.detail_link,
        keyword: movieCode,
        code: movieCode
      }
    })

    if (downloadResponse.success) {
      // Update hasSubtitle dynamically on movie items
      const actressMovie = actressMovies.value.find(m => m.code === movieCode)
      if (actressMovie) actressMovie.hasSubtitle = true
    } else {
      alert(`Tải phụ đề thất bại: ${downloadResponse.error}`)
    }
  } catch (err: any) {
    alert('Lỗi tải phụ đề: ' + err.message)
  } finally {
    downloadingCardSubs.value[movieCode] = false
  }
}

// Prioritize name: Japanese -> Kana -> Romaji
const getActressSearchName = (actress: any) => {
  if (!actress) return ''
  // 1. Prioritize Japanese Name (Kanji/Kana)
  if (actress.japaneseName && actress.japaneseName.trim()) {
    return actress.japaneseName.trim()
  }
  // 2. Prioritize Kana from aliases
  if (actress.aliases) {
    const list = actress.aliases.split(',').map((s: string) => s.trim())
    const kanaAlias = list.find((s: string) => /[\u3040-\u309f\u30a0-\u30ff]/.test(s))
    if (kanaAlias) return kanaAlias
  }
  // 3. Fallback to Romaji name
  return actress.name || ''
}

const searchActressTorrent = (actress: any) => {
  const searchName = getActressSearchName(actress)
  if (!searchName) return
  // Redirect to homepage search tab and auto-trigger search via query parameter
  navigateTo(`/?search=${encodeURIComponent(searchName)}`)
}

onMounted(() => {
  fetchActressData()
})
</script>

<template>
  <div class="min-h-screen bg-[#08070b] text-slate-100 px-4 py-8 sm:px-8 max-w-7xl mx-auto">
    <!-- 🔙 Glassmorphism Back Button -->
    <div class="actress-detail-nav mb-6">
      <button class="actress-back-btn flex items-center gap-1.5" @click="navigateTo('/')">
        <i class="fa-solid fa-chevron-left"></i>
        <span>Quay lại Trang Chủ</span>
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="loadingActressDetail" class="status-message flex flex-col items-center justify-center gap-4 py-20">
      <div class="spinner border-4 border-violet-500 border-t-transparent rounded-full w-10 h-10 animate-spin"/>
      <p class="text-slate-400 font-medium">Đang tải thông tin diễn viên JAV...</p>
    </div>

    <div v-else-if="selectedActress" class="actress-detail-view-body animate-fade-in">
      <!-- 👤 Premium Actress Info Card -->
      <div class="actress-detail-header-card relative overflow-hidden rounded-[28px] p-8 bg-slate-900/40 border border-violet-500/10">
        <div class="actress-detail-banner-bg absolute inset-0 z-0 bg-cover bg-center filter blur-[40px] brightness-[0.22] saturate-[1.3] opacity-80" :style="{ backgroundImage: selectedActress.thumbUrl ? `url(${selectedActress.thumbUrl})` : 'none' }"/>
        
        <div class="actress-detail-header-content relative z-10 flex flex-col sm:flex-row gap-8 items-center">
          <div class="actress-detail-avatar-wrapper w-[140px] h-[140px] rounded-3xl overflow-hidden border-4 border-violet-500/35 shadow-2xl flex-shrink-0 transition-all duration-300 hover:scale-[1.04] hover:border-violet-500/65">
            <img 
              v-if="selectedActress.thumbUrl"
              :src="selectedActress.thumbUrl"
              :alt="selectedActress.name"
              class="actress-detail-avatar w-full h-full object-cover"
              @error="(e: any) => e.target.src = '/icon.png'"
            >
            <div v-else class="actress-detail-avatar-fallback w-full h-full flex items-center justify-center bg-slate-900 text-5xl text-violet-400/50">
              <i class="fa-solid fa-star"></i>
            </div>
          </div>
          
          <div class="actress-detail-info flex flex-col gap-3 items-center sm:items-start flex-1 text-center sm:text-left">
            <h1 class="actress-detail-name text-4xl sm:text-5xl font-black tracking-tight bg-gradient-to-r from-violet-400 via-pink-400 to-indigo-400 bg-clip-text text-transparent font-sans">
              {{ selectedActress.name }}
            </h1>
            
            <div class="actress-detail-badges flex flex-wrap gap-2.5 justify-center sm:justify-start">
              <span v-if="selectedActress.japaneseName" class="actress-detail-badge jp flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
                <i class="fa-solid fa-location-dot text-rose-500"></i>
                <span>{{ selectedActress.japaneseName }}</span>
              </span>
              <span v-if="selectedActress.aliases" class="actress-detail-badge aliases flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-violet-500/10 border border-violet-500/25 text-violet-400">
                <i class="fa-solid fa-tags"></i>
                <span>Bí danh: {{ selectedActress.aliases }}</span>
              </span>
            </div>

            <div class="actress-detail-actions mt-4">
              <button 
                class="actress-detail-torrent-btn bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white font-extrabold px-6 py-3 rounded-2xl flex items-center gap-2 shadow-lg shadow-purple-500/20 transition-all hover:-translate-y-0.5 active:translate-y-0 text-sm"
                @click="searchActressTorrent(selectedActress)"
              >
                <i class="fa-solid fa-magnifying-glass"></i>
                <span>Tìm Torrent diễn viên này</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 🎬 Actress Works Section -->
      <div class="actress-works-section mt-10">
        <h2 class="actress-works-section-title text-xl font-bold flex items-center gap-2 mb-6">
          <i class="fa-solid fa-clapperboard text-violet-400"></i>
          <span>Danh sách tác phẩm trong thư viện ({{ actressMovies.length }} phim)</span>
        </h2>
        
        <div v-if="actressMovies.length === 0" class="no-results-box flex flex-col items-center justify-center p-12 bg-slate-900/20 border border-white/5 rounded-2xl text-slate-500 gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="empty-icon"><circle cx="12" cy="12" r="10"/><line x1="8" x2="16" y1="12" y2="12"/></svg>
          <p class="font-medium">Không tìm thấy bộ phim nào của cô ấy trong thư viện.</p>
        </div>

        <div v-else class="library-content-area">
          <div class="library-grid grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            <div 
              v-for="movie in actressMovies" 
              :key="movie.contentId" 
              class="movie-plex-card bg-slate-900/40 border border-violet-500/5 hover:border-violet-500/20 rounded-2xl overflow-hidden shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl cursor-pointer group"
              :class="{ 'border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.08)]': movie.hasLocalVideo }"
              @click="navigateTo(`/movie/${movie.code}`)"
            >
              <!-- Card Poster Image -->
              <div class="movie-poster-container aspect-[2/3] relative overflow-hidden bg-slate-950">
                <img 
                  v-if="movie.posterUrl" 
                  :src="movie.posterUrl" 
                  :alt="movie.title" 
                  class="movie-poster-img w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                  @error="(e: any) => e.target.src = '/icon.png'"
                >
                <div v-else class="movie-poster-fallback w-full h-full flex items-center justify-center text-slate-600 font-mono font-bold text-sm bg-slate-950">
                  <span>{{ movie.code }}</span>
                </div>

                <!-- Floating Subtitle & Video Status Indicator Badge -->
                <div class="floating-sub-badge absolute top-3 right-3 px-2.5 py-1 rounded-lg text-[9px] font-extrabold uppercase tracking-wide flex items-center gap-1.5 z-20 shadow-md transition-all bg-slate-950/80 border border-white/10 text-slate-300" :class="{ 'bg-emerald-950/90 border-emerald-500/30 text-emerald-400': movie.hasLocalVideo }">
                  <span class="sub-badge-dot w-1.5 h-1.5 rounded-full bg-slate-400" :class="{ 'bg-emerald-400': movie.hasLocalVideo }"/>
                  <span>{{ movie.hasLocalVideo ? 'PLAYABLE' : movie.hasSubtitle ? 'CÓ SUB' : 'CHƯA SUB' }}</span>
                </div>

                <!-- Hover overlay actions -->
                <div class="poster-hover-overlay absolute inset-0 flex flex-col gap-2 items-center justify-center bg-black/70 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all duration-300 z-10">
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
                    <span v-if="downloadingCardSubs[movie.code]" class="spinner-mini animate-spin border-2 border-slate-950 border-t-transparent rounded-full w-3.5 h-3.5"/>
                    <template v-else>
                      <i class="fa-solid fa-download"></i>
                      <span>Tải Sub</span>
                    </template>
                  </button>

                  <!-- NÚT TÌM TORRENT NẾU CHƯA CÓ PHIM CỤC BỘ -->
                  <button 
                    v-if="!movie.hasLocalVideo"
                    class="bg-sky-500/20 hover:bg-sky-500/40 text-sky-300 border border-sky-500/35 px-4 py-2 rounded-xl font-extrabold text-[11px] uppercase tracking-wider transition-all duration-200 active:scale-95 flex items-center gap-1.5"
                    @click.stop="navigateTo(`/?search=${encodeURIComponent(movie.code)}`)"
                  >
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <span>Tìm Torrent</span>
                  </button>
                </div>
              </div>

              <!-- Card Metadata Details -->
              <div class="movie-card-info p-4 flex flex-col gap-1.5">
                <div class="movie-card-header flex justify-between items-center gap-2">
                  <span class="movie-card-code text-xs font-bold font-mono text-violet-400 tracking-wider uppercase">{{ movie.code }}</span>
                  <span v-if="movie.releaseDate" class="movie-card-year text-[10px] font-bold text-slate-500">
                    {{ new Date(movie.releaseDate).getFullYear() }}
                  </span>
                </div>
                <h3 class="movie-card-title text-xs font-semibold text-slate-200 truncate" :title="movie.title">{{ movie.title }}</h3>
                
                <!-- Actresses list -->
                <div class="movie-card-actresses flex flex-wrap gap-1 mt-1">
                  <span 
                    v-for="actress in movie.actresses" 
                    :key="actress.id"
                    class="actress-link-tag text-[10px] font-bold text-slate-400 hover:text-violet-400 transition-colors"
                    @click.stop="navigateTo(`/actress/${actress.id}`)"
                  >
                    {{ actress.name }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.actress-detail-tab-container {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  animation: fadeIn 0.4s ease-out;
}

.actress-detail-nav {
  margin-bottom: 0.5rem;
}

.actress-back-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 0.7rem 1.4rem;
  border-radius: 14px;
  color: rgba(255, 255, 255, 0.9);
  font-weight: 800;
  font-size: 0.9rem;
  cursor: pointer;
  backdrop-filter: blur(12px);
  transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
  font-family: 'Outfit', sans-serif;
}

.actress-back-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.25);
  color: white;
  transform: translateX(-4px);
  box-shadow: 0 6px 24px rgba(139, 92, 246, 0.2);
}

.actress-detail-header-card {
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5), 0 0 30px rgba(167, 139, 250, 0.05);
}

.actress-detail-banner-bg {
  z-index: 0;
}

.actress-detail-header-content {
  z-index: 1;
}

.actress-detail-avatar-fallback {
  background: #171526;
}

.actress-detail-name {
  background: linear-gradient(135deg, #c084fc 0%, #ff80b9 50%, #6366f1 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  font-family: 'Outfit', sans-serif;
}

.actress-detail-badge {
  font-family: 'Outfit', sans-serif;
  backdrop-filter: blur(8px);
}

.actress-detail-badge.jp {
  box-shadow: 0 2px 10px rgba(0, 220, 130, 0.05);
}

.actress-detail-badge.aliases {
  box-shadow: 0 2px 10px rgba(167, 139, 250, 0.05);
}

.actress-detail-torrent-btn {
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.35);
  font-family: 'Outfit', sans-serif;
}

.actress-detail-torrent-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 30px rgba(168, 85, 247, 0.55);
  opacity: 0.98;
}

.actress-detail-torrent-btn:active {
  transform: translateY(0);
}

.actress-works-section-title {
  letter-spacing: -0.02em;
}

.actress-link-tag {
  cursor: pointer;
}

.actress-link-tag:hover {
  text-decoration: underline;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-fade-in {
  animation: fadeIn 0.4s ease-out forwards;
}
</style>
