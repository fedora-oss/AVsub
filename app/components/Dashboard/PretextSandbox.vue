<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { calculateTextGeometry } from '~/utils/pretext'
import { prepare as ptPrepare, layout as ptLayout } from '@chenglou/pretext'

const pretextInputText = ref('[MIDA-533] 💖 JAV Super Special Release - featuring multiple guest appearances, special 4K footage and exclusive behind-the-scenes interviews! 🎬✨')
const pretextFont = ref('500 15px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif')
const pretextWidth = ref(320)
const pretextLineHeight = ref(22)
const pretextMaxLines = ref(2)

const benchmarkRunning = ref(false)
const benchmarkIterations = ref(2000)
const benchmarkResults = ref<{
  domTime: number
  ptTime: number
  ptFullTime: number
  speedup: number
  fullSpeedup: number
  iterations: number
} | null>(null)

const sampleJavTitles = [
  '[MIDA-533] JAV Actress Title - An extremely long descriptive JAV title explaining genres, outfits, and actresses in deep detail.',
  '[IPX-893] 完璧な体を持つ彼女との極上の癒やしタイム 温泉旅行でイチャラブお泊り 24時間密着 SPECIAL EDITION (Exclusive Director\'s Cut)',
  '[PRED-456] 💖 JAV Super Idol Actress Special Release - featuring multiple guest appearances, special 4K footage and exclusive behind-the-scenes interviews! 🎬✨',
  '[JUL-982] JAV Title with emojis 🌸🍃 - This is a short title but has complex emoji characters that usually slow down font engines.',
  '[SSNI-009] JAV Title - An ultra descriptive name with parentheses (Exclusive Edition) [Special Cut Version] featuring detailed genre tags like schoolgirl, cosplay, high-heels.',
  '[MUTE-012] Deep Relaxation and Healing Session with your favorite JAV Idol - 120 Minutes of pure blissful triggers.',
  '[FSDSS-288] Extreme Closeup Beauty Shots and Exclusive Actress Interview - Special 4K Ultra HD Remastered version.',
  '[stars-999] The Ultimate JAV Star Collection - 4 Hours of continuous non-stop highlights of top-tier JAV actresses.',
  '[TEK-078] Cyberpunk JAV Concept Movie - futuristic elements mixed with classic JAV elements in a high budget production.',
  '[DANDY-523] Retro Style JAV Comedy Romance - A beautiful story set in Tokyo in the late 1980s with vintage styling.'
]

const runPretextBenchmark = () => {
  if (benchmarkRunning.value) return
  benchmarkRunning.value = true
  benchmarkResults.value = null
  
  setTimeout(() => {
    try {
      const iterations = benchmarkIterations.value
      const font = pretextFont.value
      const width = pretextWidth.value
      const lineHeight = pretextLineHeight.value
      
      // 1. DOM Benchmark
      const domStart = performance.now()
      const div = document.createElement('div')
      div.style.position = 'absolute'
      div.style.visibility = 'hidden'
      div.style.left = '-9999px'
      div.style.top = '-9999px'
      div.style.width = `${width}px`
      div.style.font = font
      div.style.lineHeight = `${lineHeight}px`
      div.style.wordBreak = 'break-word'
      document.body.appendChild(div)
      
      for (let i = 0; i < iterations; i++) {
        const text = sampleJavTitles[i % sampleJavTitles.length]
        div.textContent = text
        const height = div.offsetHeight // triggers layout reflow
      }
      document.body.removeChild(div)
      const domTime = performance.now() - domStart
      
      // 2. Pretext Benchmark (Hot Path - Layout only)
      const preparedList = sampleJavTitles.map(text => ptPrepare(text, font))
      const ptStart = performance.now()
      for (let i = 0; i < iterations; i++) {
        const prepared = preparedList[i % preparedList.length]
        const res = ptLayout(prepared, width, lineHeight)
      }
      const ptTime = performance.now() - ptStart
      
      // 3. Pretext Benchmark (Full Flow - Prepare + Layout)
      const ptFullStart = performance.now()
      for (let i = 0; i < iterations; i++) {
        const text = sampleJavTitles[i % sampleJavTitles.length]
        const prepared = ptPrepare(text, font)
        const res = ptLayout(prepared, width, lineHeight)
      }
      const ptFullTime = performance.now() - ptFullStart
      
      benchmarkResults.value = {
        domTime,
        ptTime,
        ptFullTime,
        speedup: ptTime > 0 ? Number((domTime / ptTime).toFixed(1)) : 500,
        fullSpeedup: ptFullTime > 0 ? Number((domTime / ptFullTime).toFixed(1)) : 10,
        iterations
      }
    } catch (err) {
      console.error('Benchmark failed:', err)
      alert('Đã xảy ra lỗi khi chạy Benchmark. Vui lòng kiểm tra console.')
    } finally {
      benchmarkRunning.value = false
    }
  }, 100)
}
</script>

<template>
  <div class="pretext-tab-container p-6 bg-slate-900/20 backdrop-blur-xl border border-white/[0.08] rounded-3xl mt-4">
    <div class="pretext-header flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
      <div>
        <h2 class="text-2xl font-extrabold text-slate-100 flex items-center gap-2">
          <i class="fa-solid fa-bolt text-violet-400 animate-pulse"></i>
          <span>Pretext Text Layout Engine</span>
        </h2>
        <p class="text-xs text-slate-400 mt-1">
          Nghiên cứu và kiểm nghiệm công nghệ đo lường văn bản đa dòng không qua DOM (DOM-free), nhanh hơn tới 500x.
        </p>
      </div>
      <div class="flex items-center gap-3">
        <button 
          :disabled="benchmarkRunning" 
          class="px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-500/20 active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition-all"
          @click="runPretextBenchmark"
        >
          <span v-if="benchmarkRunning" class="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
          <span><i class="fa-solid fa-bolt mr-1.5"></i> CHẠY BENCHMARK SO SÁNH ({{ benchmarkIterations }} LƯỢT)</span>
        </button>
      </div>
    </div>

    <!-- Live Performance Cards -->
    <div v-if="benchmarkResults" class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <div class="bg-gradient-to-br from-violet-950/40 to-indigo-950/30 backdrop-blur-md border border-violet-500/30 rounded-2xl p-5 shadow-xl flex flex-col justify-between relative overflow-hidden">
        <div class="absolute -right-6 -bottom-6 w-24 h-24 bg-violet-500/10 rounded-full blur-2xl"/>
        <div>
          <span class="text-[10px] font-extrabold text-violet-400 tracking-widest uppercase block mb-1">Hot Path Speedup</span>
          <h3 class="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-emerald-400">
            {{ benchmarkResults.speedup }}x Nhanh hơn
          </h3>
          <p class="text-slate-400 text-[11px] leading-relaxed mt-2">
            Khi thực hiện layout nhiều lần (ví dụ: khi cuộn danh sách ảo hoặc kéo dãn cửa sổ), Pretext sử dụng số học thuần túy bỏ qua DOM đắt đỏ.
          </p>
        </div>
        <div class="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px]">
          <span class="text-slate-500">Pretext Hot Path:</span>
          <span class="font-mono text-emerald-400 font-bold">{{ benchmarkResults.ptTime.toFixed(2) }} ms</span>
        </div>
      </div>

      <div class="bg-slate-900/40 backdrop-blur-md border border-white/[0.08] rounded-2xl p-5 shadow-xl flex flex-col justify-between">
        <div>
          <span class="text-[10px] font-extrabold text-slate-400 tracking-widest uppercase block mb-1">Full Flow Speedup</span>
          <h3 class="text-3xl font-bold text-slate-200">
            {{ benchmarkResults.fullSpeedup }}x Nhanh hơn
          </h3>
          <p class="text-slate-400 text-[11px] leading-relaxed mt-2">
            Ngay cả khi bao gồm cả công đoạn phân tách và đo ký tự bằng Canvas (Prepare + Layout), Pretext vẫn vượt trội hoàn toàn so với việc ghi/đọc DOM.
          </p>
        </div>
        <div class="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px]">
          <span class="text-slate-500">Pretext Full Flow:</span>
          <span class="font-mono text-violet-400 font-bold">{{ benchmarkResults.ptFullTime.toFixed(2) }} ms</span>
        </div>
      </div>

      <div class="bg-slate-900/40 backdrop-blur-md border border-white/[0.08] rounded-2xl p-5 shadow-xl flex flex-col justify-between">
        <div>
          <span class="text-[10px] font-extrabold text-rose-400 tracking-widest uppercase block mb-1">DOM Reflow Bottleneck</span>
          <h3 class="text-3xl font-bold text-rose-400">
            {{ benchmarkResults.domTime.toFixed(2) }} ms
          </h3>
          <p class="text-slate-400 text-[11px] leading-relaxed mt-2">
            Thời gian thực thi của DOM-based. Mỗi lượt đo bắt buộc phải đưa thẻ div ẩn vào body, đọc `.offsetHeight` để trình duyệt tính lại bố cục (Reflow/Layout Thrashing).
          </p>
        </div>
        <div class="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px]">
          <span class="text-slate-500">Tổng số lượt đo:</span>
          <span class="font-mono text-slate-300 font-bold">{{ benchmarkResults.iterations.toLocaleString() }} lượt</span>
        </div>
      </div>
    </div>

    <!-- Playground and Realtime Sandbox -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <!-- Panel 1: Playground Control -->
      <div class="flex flex-col gap-6 bg-slate-900/40 backdrop-blur-md border border-white/[0.08] p-6 rounded-2xl">
        <h3 class="text-sm font-bold text-slate-200 uppercase tracking-wider border-b border-white/5 pb-2">
          🛠️ Hộp cát tùy chỉnh (Real-time Playground)
        </h3>
        
        <div class="flex flex-col gap-1.5">
          <label class="text-[11px] font-bold text-slate-400 uppercase">Văn bản kiểm nghiệm (JAV Title)</label>
          <textarea 
            v-model="pretextInputText" 
            rows="4" 
            class="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-slate-200 focus:border-violet-500 focus:outline-none leading-relaxed transition-all"
          />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1.5">
            <label class="text-[11px] font-bold text-slate-400 uppercase">Chiều rộng khung (Width: {{ pretextWidth }}px)</label>
            <input 
              v-model.number="pretextWidth" 
              type="range" 
              min="150" 
              max="600" 
              step="10" 
              class="accent-violet-500"
            >
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-[11px] font-bold text-slate-400 uppercase">Chiều cao dòng (Line Height: {{ pretextLineHeight }}px)</label>
            <input 
              v-model.number="pretextLineHeight" 
              type="range" 
              min="16" 
              max="32" 
              step="1" 
              class="accent-violet-500"
            >
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1.5">
            <label class="text-[11px] font-bold text-slate-400 uppercase">Font chữ định dạng</label>
            <select 
              v-model="pretextFont" 
              class="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-violet-500 focus:outline-none"
            >
              <option value="500 15px ui-sans-serif, system-ui, sans-serif">System Sans-Serif (Default)</option>
              <option value="bold 16px Outfit, sans-serif">Outfit Bold (16px)</option>
              <option value="800 14px monospace">Monospace Heavy (14px)</option>
            </select>
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-[11px] font-bold text-slate-400 uppercase">Giới hạn dòng (max-lines: {{ pretextMaxLines || 'Không' }})</label>
            <select 
              v-model.number="pretextMaxLines" 
              class="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-violet-500 focus:outline-none"
            >
              <option :value="0">Không giới hạn</option>
              <option :value="1">1 dòng</option>
              <option :value="2">2 dòng</option>
              <option :value="3">3 dòng</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Panel 2: Live Preview and CLS Demonstration -->
      <div class="flex flex-col gap-6 bg-slate-900/40 backdrop-blur-md border border-white/[0.08] p-6 rounded-2xl justify-between">
        <div>
          <h3 class="text-sm font-bold text-slate-200 uppercase tracking-wider border-b border-white/5 pb-2 mb-4">
            👀 Kết quả đo đạc & Vẽ giao diện thời gian thực
          </h3>
          
          <div class="p-4 bg-black/30 rounded-xl border border-white/5 flex flex-col gap-4">
            <div>
              <span class="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Canvas / Pretext Calculated Height:</span>
              <span class="text-2xl font-black text-violet-400 font-mono">
                {{ calculateTextGeometry(pretextInputText, pretextFont, pretextWidth, pretextLineHeight).height }} px
              </span>
              <span class="text-xs text-slate-400 ml-2">
                (Dòng: {{ calculateTextGeometry(pretextInputText, pretextFont, pretextWidth, pretextLineHeight).lineCount }})
              </span>
            </div>

            <div>
              <span class="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-2">Live Element Rendered via &lt;PretextText&gt;:</span>
              
              <div class="p-3 bg-slate-950/60 rounded-lg border border-violet-500/20 relative" :style="{ width: `${pretextWidth}px` }">
                <!-- Width Indicator -->
                <div class="absolute -top-2 left-0 right-0 border-t border-dashed border-violet-500/40 flex justify-center">
                  <span class="bg-slate-950 px-1 text-[9px] text-violet-400 font-mono leading-none">{{ pretextWidth }}px</span>
                </div>
                
                <!-- Custom Pretext Component -->
                <PretextText 
                  :text="pretextInputText" 
                  :font="pretextFont" 
                  :line-height="pretextLineHeight"
                  :max-lines="pretextMaxLines || undefined"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="p-4 bg-violet-950/20 border border-violet-500/20 rounded-xl">
          <h4 class="text-xs font-bold text-violet-300 flex items-center gap-1.5 mb-1.5">
            <span>💡 Cách hoạt động của giải pháp</span>
          </h4>
          <p class="text-[11px] text-slate-400 leading-relaxed">
            Component <code>&lt;PretextText&gt;</code> sử dụng <code>ResizeObserver</code> để theo dõi chiều rộng của khung hiển thị trên màn hình. Mỗi khi chiều rộng thay đổi, nó sẽ thực hiện tính toán chiều cao dòng cần thiết thông qua phép toán thuần số học dựa trên tập ký tự đã lưu trong Canvas. Kết quả chiều cao chính xác được gán trực tiếp vào CSS <code>height</code> giúp chống giật giao diện (Zero CLS) và loại bỏ hoàn toàn việc vẽ nháp lên DOM.
          </p>
        </div>
      </div>
    </div>

    <!-- Real JAV Cards Demonstration -->
    <div class="mt-8 border-t border-white/5 pt-6">
      <h3 class="text-sm font-bold text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-2">
        <i class="fa-solid fa-clapperboard text-violet-400"></i>
        <span>Demo Thẻ phim JAV thực tế áp dụng Pretext</span>
      </h3>
      <p class="text-xs text-slate-400 mb-4">
        Dưới đây là một số ví dụ thẻ phim hiển thị tiêu đề JAV cực dài. Chiều cao của các tiêu đề này được tính toán trước DOM-free bởi Pretext, đảm bảo các thẻ phim có cùng chiều cao hộp chứa tiêu đề và luôn đồng đều, hoàn hảo về mặt bố cục.
      </p>

      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div v-for="(title, idx) in sampleJavTitles.slice(0, 5)" :key="idx" class="bg-slate-900/50 border border-white/[0.06] rounded-2xl p-4 flex flex-col overflow-hidden shadow-lg hover:border-violet-500/20 transition-all duration-300">
          <!-- Mock Thumbnail -->
          <div class="aspect-video w-full rounded-xl bg-slate-950/80 mb-3 flex items-center justify-center border border-white/5 relative overflow-hidden">
            <div class="absolute inset-0 bg-gradient-to-t from-violet-500/10 to-transparent"/>
            <i class="fa-solid fa-clapperboard text-violet-400 text-lg"></i>
            <span class="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/60 font-mono text-[9px] text-violet-400 font-extrabold uppercase border border-violet-500/20">
              {{ title.match(/\[(.*?)\]/)?.[1] || 'JAV' }}
            </span>
          </div>
          
          <!-- Pretext JAV Title Card (2 lines clamp) -->
          <div class="mb-2 text-left">
            <span class="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-1">JAV Movie Title</span>
            <PretextText 
              :text="title" 
              font="bold 12px ui-sans-serif, system-ui, sans-serif"
              :line-height="16"
              :max-lines="2"
              class="text-slate-200 text-xs font-bold leading-tight"
            />
          </div>

          <!-- Footer Details -->
          <div class="mt-auto pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500">
            <span class="flex items-center gap-1"><i class="fa-regular fa-clock text-slate-500"></i> 120m</span>
            <span class="flex items-center gap-1"><i class="fa-solid fa-star text-amber-400"></i> 5.0</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
