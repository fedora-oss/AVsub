<script setup lang="ts">
import { useDashboardState } from '~/composables/useDashboardState'
import { computed } from 'vue'

const state = useDashboardState()
const {
  subtitleSize,
  subtitleColor,
  subtitleItalic,
  subtitleBgMode
} = state

// Predefined premium colors
const colorPresets = [
  { name: 'Trắng tinh khôi', value: '#ffffff' },
  { name: 'Vàng nắng', value: '#ffff00' },
  { name: 'Xanh lục neon', value: '#39ff14' },
  { name: 'Xanh băng giá', value: '#00f0ff' },
  { name: 'Hồng anh đào', value: '#ff69b4' }
]

// Predefined background modes
const bgModes = [
  { name: 'Kính mờ (Glass)', value: 'glass', icon: 'fa-eye' },
  { name: 'Nền tối (Solid)', value: 'solid', icon: 'fa-square' },
  { name: 'Không nền (None)', value: 'transparent', icon: 'fa-border-none' }
]

// Dynamic preview CSS styling
const previewStyles = computed(() => {
  const styles: Record<string, string> = {
    fontSize: `${subtitleSize.value}px`,
    color: subtitleColor.value,
    fontStyle: subtitleItalic.value ? 'italic' : 'normal',
    transition: 'all 0.25s ease'
  }

  if (subtitleBgMode.value === 'solid') {
    styles.background = 'rgba(0, 0, 0, 0.95)'
    styles.backdropFilter = 'none'
    styles.border = '1px solid rgba(255, 255, 255, 0.15)'
    styles.boxShadow = '0 8px 24px rgba(0,0,0,0.6)'
  } else if (subtitleBgMode.value === 'transparent') {
    styles.background = 'transparent'
    styles.backdropFilter = 'none'
    styles.border = 'none'
    styles.boxShadow = 'none'
    styles.textShadow = '0px 2px 4px rgba(0,0,0,0.95), 0px 0px 6px rgba(0,0,0,0.95), 0px 0px 2px rgba(0,0,0,0.95)'
  } else {
    // Glass
    styles.background = 'rgba(10, 9, 13, 0.85)'
    styles.backdropFilter = 'blur(8px)'
    styles.border = '1px solid rgba(255, 255, 255, 0.12)'
    styles.boxShadow = '0 8px 32px rgba(0,0,0,0.5)'
  }

  return styles
})
</script>

<template>
  <div class="settings-container">
    <div class="settings-header">
      <div class="header-icon">
        <i class="fa-solid fa-sliders"></i>
      </div>
      <div class="header-text">
        <h2>CÀI ĐẶT HỆ THỐNG & PHỤ ĐỀ</h2>
        <p>Cá nhân hóa phong cách hiển thị phụ đề và lưu lại để áp dụng tự động cho mọi lần xem phim.</p>
      </div>
    </div>

    <div class="settings-grid">
      <!-- Left Panel: Controls -->
      <div class="controls-panel">
        <div class="settings-section">
          <h3><i class="fa-solid fa-text-height section-icon"></i> Cỡ chữ phụ đề</h3>
          <p class="section-desc">Điều chỉnh kích thước hiển thị của văn bản phụ đề (tính bằng pixel).</p>
          
          <div class="slider-wrapper">
            <input 
              type="range" 
              min="12" 
              max="40" 
              step="1" 
              v-model.number="subtitleSize" 
              class="settings-slider"
            >
            <div class="slider-val-badge">{{ subtitleSize }}px</div>
          </div>
        </div>

        <div class="settings-section">
          <h3><i class="fa-solid fa-palette section-icon"></i> Màu sắc chữ</h3>
          <p class="section-desc">Lựa chọn tông màu giúp chữ phụ đề hiển thị tương phản và dễ đọc nhất.</p>
          
          <div class="color-presets-grid">
            <button 
              v-for="preset in colorPresets" 
              :key="preset.value"
              class="color-preset-btn"
              :class="{ 'is-selected': subtitleColor === preset.value }"
              :style="{ '--preset-color': preset.value }"
              :title="preset.name"
              @click="subtitleColor = preset.value"
            >
              <span class="color-dot" :style="{ backgroundColor: preset.value }"/>
              <span class="preset-name">{{ preset.name }}</span>
            </button>
          </div>
        </div>

        <div class="settings-section">
          <h3><i class="fa-solid fa-window-restore section-icon"></i> Kiểu nền hộp phụ đề</h3>
          <p class="section-desc">Thay đổi kiểu nền viền xung quanh chữ để tránh bị lẫn vào các cảnh phim sáng.</p>
          
          <div class="bg-mode-grid">
            <button 
              v-for="mode in bgModes" 
              :key="mode.value"
              class="bg-mode-btn"
              :class="{ 'is-selected': subtitleBgMode === mode.value }"
              @click="subtitleBgMode = mode.value"
            >
              <i class="fa-solid" :class="mode.icon"/>
              <span>{{ mode.name }}</span>
            </button>
          </div>
        </div>

        <div class="settings-section row-flex">
          <div class="row-text">
            <h3><i class="fa-solid fa-italic section-icon"></i> In nghiêng phụ đề</h3>
            <p class="section-desc">Bật/tắt chế độ viết chữ nghiêng mặc định (Italics).</p>
          </div>
          
          <label class="switch-toggle">
            <input type="checkbox" v-model="subtitleItalic">
            <span class="switch-slider"/>
          </label>
        </div>
      </div>

      <!-- Right Panel: Live Preview Widescreen -->
      <div class="preview-panel">
        <div class="preview-frame-bar">
          <span class="dot red"/>
          <span class="dot yellow"/>
          <span class="dot green"/>
          <span class="frame-title">BẢN XEM TRƯỚC PHỤ ĐỀ (LIVE PREVIEW)</span>
        </div>

        <div class="preview-viewport">
          <!-- Fake Movie Snapshot Background -->
          <div class="preview-movie-snapshot">
            <div class="movie-meta-tag">AVSUB STREAM PREVIEW (1080P)</div>
            
            <!-- Live Styled Subtitle Overlay -->
            <div class="fake-subtitle" :style="previewStyles">
              [Tiếng Việt] Chào mừng bạn đến với hệ thống AVsub Pro! Cài đặt đã được lưu.
            </div>
          </div>
        </div>
        
        <div class="preview-status-log">
          <i class="fa-solid fa-circle-check text-green-500"></i>
          <span>Cấu hình của bạn sẽ tự động đồng bộ hóa trên mọi trình duyệt của thiết bị.</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.settings-container {
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
  padding: 1.5rem;
  border-radius: 16px;
  background: rgba(10, 9, 13, 0.4);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
  margin-bottom: 2rem;
  animation: fadeIn 0.4s ease-out;

  @media (max-width: 640px) {
    padding: 1rem;
    gap: 1.25rem;
  }
}

.settings-header {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);

  .header-icon {
    width: 3.25rem;
    height: 3.25rem;
    border-radius: 12px;
    background: linear-gradient(135deg, rgba(255, 59, 48, 0.15) 0%, rgba(255, 107, 98, 0.05) 100%);
    border: 1px solid rgba(255, 59, 48, 0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ff3b30;
    font-size: 1.5rem;
    box-shadow: 0 0 15px rgba(255, 59, 48, 0.1);
  }

  .header-text {
    h2 {
      font-size: 1.25rem;
      font-weight: 700;
      color: #fff;
      letter-spacing: 0.05em;
      margin: 0 0 0.25rem 0;

      @media (max-width: 640px) {
        font-size: 1.1rem;
      }
    }

    p {
      font-size: 0.85rem;
      color: rgba(255, 255, 255, 0.55);
      margin: 0;
      line-height: 1.4;
    }
  }
}

.settings-grid {
  display: grid;
  grid-template-cols: 1.2fr 1fr;
  gap: 2rem;

  @media (max-width: 1024px) {
    grid-template-cols: 1fr;
    gap: 1.5rem;
  }
}

.controls-panel {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.settings-section {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 12px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  transition: all 0.3s ease;

  &:hover {
    border-color: rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.03);
  }

  h3 {
    font-size: 0.95rem;
    font-weight: 600;
    color: #fff;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;

    .section-icon {
      color: #ff3b30;
      font-size: 0.875rem;
    }
  }

  .section-desc {
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.45);
    margin: 0;
    line-height: 1.4;
  }

  &.row-flex {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;

    .row-text {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
  }
}

// 1. Slider Sizing
.slider-wrapper {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-top: 0.5rem;

  .settings-slider {
    flex: 1;
    height: 6px;
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.15);
    outline: none;
    -webkit-appearance: none;
    appearance: none;
    cursor: pointer;

    &::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #ffffff;
      border: 2px solid #ff3b30;
      box-shadow: 0 0 8px rgba(255, 59, 48, 0.5);
      transition: all 0.2s ease;

      &:hover {
        transform: scale(1.15);
      }
    }
  }

  .slider-val-badge {
    background: rgba(255, 59, 48, 0.15);
    border: 1px solid rgba(255, 59, 48, 0.25);
    color: #ff6b62;
    font-weight: 700;
    font-family: monospace;
    font-size: 0.8rem;
    padding: 0.25rem 0.6rem;
    border-radius: 6px;
  }
}

// 2. Color Selection Badges
.color-presets-grid {
  display: grid;
  grid-template-cols: repeat(auto-fill, minmax(130px, 1fr));
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.color-preset-btn {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.75);
  border-radius: 10px;
  padding: 0.6rem 0.8rem;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  text-align: left;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.15);
    color: #fff;
    transform: translateY(-1px);
  }

  &.is-selected {
    background: linear-gradient(135deg, rgba(255, 59, 48, 0.1) 0%, rgba(255, 255, 255, 0.01) 100%);
    border-color: #ff3b30;
    color: #fff;
    box-shadow: 0 0 10px rgba(255, 59, 48, 0.15);
  }

  .color-dot {
    width: 0.875rem;
    height: 0.875rem;
    border-radius: 50%;
    box-shadow: inset 0 0 2px rgba(0,0,0,0.5), 0 0 6px var(--preset-color);
  }

  .preset-name {
    font-size: 0.75rem;
    font-weight: 500;
  }
}

// 3. Background selection modes
.bg-mode-grid {
  display: grid;
  grid-template-cols: repeat(3, 1fr);
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.bg-mode-btn {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.75);
  border-radius: 10px;
  padding: 0.75rem 0.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.15);
    color: #fff;
    transform: translateY(-1px);
  }

  &.is-selected {
    background: linear-gradient(135deg, rgba(255, 59, 48, 0.1) 0%, rgba(255, 255, 255, 0.01) 100%);
    border-color: #ff3b30;
    color: #fff;
    box-shadow: 0 0 10px rgba(255, 59, 48, 0.15);
  }

  i {
    font-size: 1.1rem;
    color: #ff3b30;
  }

  span {
    font-size: 0.75rem;
    font-weight: 500;
  }
}

// 4. Switch toggle
.switch-toggle {
  position: relative;
  display: inline-block;
  width: 46px;
  height: 24px;
  flex-shrink: 0;

  input {
    opacity: 0;
    width: 0;
    height: 0;

    &:checked + .switch-slider {
      background-color: #ff3b30;
      box-shadow: 0 0 8px rgba(255, 59, 48, 0.4);

      &:before {
        transform: translateX(20px);
      }
    }
  }

  .switch-slider {
    position: absolute;
    cursor: pointer;
    inset: 0;
    background-color: rgba(255, 255, 255, 0.12);
    transition: .3s cubic-bezier(0.16, 1, 0.3, 1);
    border-radius: 9999px;

    &:before {
      position: absolute;
      content: "";
      height: 18px;
      width: 18px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: .3s cubic-bezier(0.16, 1, 0.3, 1);
      border-radius: 50%;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }
  }
}

// 5. Preview panel
.preview-panel {
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  background: rgba(5, 4, 6, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.1);
  overflow: hidden;
  box-shadow: 0 15px 35px rgba(0,0,0,0.7);
  align-self: flex-start;
  width: 100%;

  .preview-frame-bar {
    background: rgba(255, 255, 255, 0.03);
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.6rem 1rem;

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      
      &.red { background-color: #ff5f56; }
      &.yellow { background-color: #ffbd2e; }
      &.green { background-color: #27c93f; }
    }

    .frame-title {
      font-size: 9px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.4);
      letter-spacing: 0.15em;
      margin-left: 0.5rem;
    }
  }

  .preview-viewport {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    background: #000;
    overflow: hidden;
  }

  .preview-movie-snapshot {
    width: 100%;
    height: 100%;
    background-image: linear-gradient(135deg, rgba(30, 20, 45, 0.6) 0%, rgba(10, 10, 15, 0.9) 100%), url('/fake-movie-backdrop.jpg');
    background-size: cover;
    background-position: center;
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    padding: 1.5rem;

    // Standard high-quality grid lines fallback background
    &::before {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at center, transparent 30%, rgba(5,4,6,0.9) 100%),
                  linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
      background-size: cover, 20px 20px, 20px 20px;
      z-index: 1;
      pointer-events: none;
    }
  }

  .movie-meta-tag {
    position: absolute;
    top: 1rem;
    left: 1rem;
    font-size: 8px;
    font-weight: 800;
    color: rgba(255, 255, 255, 0.35);
    background: rgba(0, 0, 0, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.08);
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    letter-spacing: 0.15em;
    z-index: 2;
  }

  .fake-subtitle {
    z-index: 5;
    padding: 0.5rem 1rem;
    border-radius: 8px;
    text-align: center;
    max-width: 85%;
    line-height: 1.4;
    user-select: none;
    
    @media (max-width: 640px) {
      font-size: 13px !important;
      max-width: 90%;
    }
  }

  .preview-status-log {
    padding: 0.75rem 1rem;
    background: rgba(255, 255, 255, 0.01);
    border-top: 1px solid rgba(255, 255, 255, 0.04);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.45);
    line-height: 1.3;

    i {
      font-size: 0.85rem;
      color: #30d158;
    }
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
