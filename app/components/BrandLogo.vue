<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 100 100"
    class="avsub-svg-logo"
  >
    <defs>
      <!-- Neon red-orange gradient -->
      <linearGradient id="logo-red-orange" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#ff3b30" />
        <stop offset="100%" stop-color="#ff6b62" />
      </linearGradient>
      
      <!-- Subtle glow filter for the play button -->
      <filter id="logo-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>

    <!-- Sleek Neon Play Triangle Button -->
    <path
      d="M 22,25 C 22,21 26.5,18.5 30,20.5 L 68,43.5 C 71.5,45.5 71.5,50.5 68,52.5 L 30,75.5 C 26.5,77.5 22,75 22,71 Z"
      fill="url(#logo-red-orange)"
      filter="url(#logo-glow)"
    />

    <!-- Semi-transparent Glassmorphic Subtitle Bubble (Speech Bubble) -->
    <path
      d="M 46,36 H 84 A 6,6 0 0 1 90,42 V 68 A 6,6 0 0 1 84,74 H 57 L 48,82 V 74 A 6,6 0 0 1 42,68 V 42 A 6,6 0 0 1 46,36 Z"
      fill="rgba(10, 9, 13, 0.75)"
      stroke="rgba(255, 255, 255, 0.25)"
      stroke-width="2.5"
    />

    <!-- Styled Subtitle/Speech bubble lines representing text -->
    <rect x="52" y="47" width="26" height="3.5" rx="1.75" fill="rgba(255, 255, 255, 0.9)" />
    <rect x="52" y="55" width="18" height="3.5" rx="1.75" fill="rgba(255, 255, 255, 0.9)" />
    <rect x="52" y="63" width="22" height="3.5" rx="1.75" fill="rgba(255, 255, 255, 0.55)" />
  </svg>
</template>

<style scoped lang="scss">
.avsub-svg-logo {
  width: 100%;
  height: 100%;
  overflow: visible;
}
</style>
