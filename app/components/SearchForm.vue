<script setup lang="ts">
defineProps<{
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'search', keyword: string): void
}>()

const keyword = ref('')

const handleSubmit = () => {
  if (keyword.value.trim()) {
    emit('search', keyword.value.trim())
  }
}
</script>

<template>
  <div class="search-container">
    <form class="search-form" @submit.prevent="handleSubmit">
      <div class="input-group">
        <input
          v-model="keyword"
          type="text"
          placeholder="Search JAV/Anime magnet links & JAV subtitles (e.g. MIDA-533, Demon Slayer)..."
          class="search-input"
          :disabled="loading"
        >
        <button type="submit" class="search-button" :disabled="loading || !keyword.trim()">
          <span v-if="loading">Searching...</span>
          <span v-else>Search</span>
        </button>
      </div>
      
      <div class="search-meta">
        <span>Sources: <strong>Sukebei Nyaa, Nyaa.si & AVSubtitles</strong></span>
        <span>Categories: <strong>JAV & Anime (All)</strong></span>
      </div>
    </form>
  </div>
</template>

<style scoped>
.search-container {
  max-width: 700px;
  margin: 2rem auto;
}

.search-form {
  background: rgba(255, 255, 255, 0.04);
  padding: 1.5rem;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(10px);
  transition: all 0.3s ease;
}

.search-form:focus-within {
  border-color: rgba(0, 220, 130, 0.3);
  box-shadow: 0 0 15px rgba(0, 220, 130, 0.08);
}

.input-group {
  display: flex;
  gap: 0.5rem;
}

.search-input {
  flex: 1;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(0, 0, 0, 0.25);
  color: white;
  font-size: 1rem;
  outline: none;
  transition: all 0.2s;
}

.search-input:focus {
  border-color: #00dc82;
}

.search-button {
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  border: none;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.1s;
  background: #00dc82;
  color: #001e26;
}

.search-button:hover:not(:disabled) {
  opacity: 0.9;
}

.search-button:active:not(:disabled) {
  transform: scale(0.98);
}

.search-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.search-meta {
  margin-top: 1rem;
  display: flex;
  justify-content: space-between;
  gap: 1.5rem;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.5);
  flex-wrap: wrap;
}

.search-meta strong {
  color: #00dc82;
}

@media (max-width: 600px) {
  .search-container {
    margin: 1rem auto;
    padding: 0 0.5rem;
  }
  
  .search-form {
    padding: 1rem;
    border-radius: 10px;
  }
  
  .input-group {
    flex-direction: column;
    gap: 0.75rem;
  }
  
  .search-input {
    width: 100%;
    padding: 0.75rem 0.9rem;
    font-size: 0.95rem;
  }
  
  .search-button {
    width: 100%;
    padding: 0.75rem;
    font-size: 0.95rem;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .search-meta {
    margin-top: 0.75rem;
    flex-direction: column;
    gap: 0.4rem;
    text-align: center;
    font-size: 0.8rem;
  }
}
</style>
