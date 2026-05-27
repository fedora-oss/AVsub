---
name: avsub-dev-standards
description: Development standards, architectural patterns, and premium UI/UX/Aesthetic guidelines for the AVsub Nuxt 3 project.
---

# AVsub Development Standards & Premium UI/UX Guidelines

Use this skill when developing frontend components, modifying layouts, or updating themes in the AVsub repository. It ensures absolute UI/UX consistency, premium styling aesthetics, and strict adherence to project architectural guidelines.

## 🎨 Theme & Styling System (CSS)
- **Vanilla CSS & Theme-specific Tokens**: All page styling must be done using cohesive CSS variables (typically HSL colors) defined in the main stylesheet (`app/pages/index.vue` or custom stylesheet).
- **Dual Theme Support (Light/Dark)**:
  - Do not use arbitrary colors that look good in only one mode.
  - Standard light mode text must have robust contrast against light backgrounds (do NOT use white text on light backgrounds).
  - All interactive elements must maintain proper focus, active, and hover states across both dark and light modes.
- **Modern Typography**: Standardize on high-contrast, premium Sans-Serif typefaces (e.g., System UI fallback with Inter or Outfit).

## ✨ FontAwesome 6 Vector Icons
- **Strict Emoji Deprecation**: Unicode emojis (e.g., `🔍`, `🤖`, `🎭`) are fully deprecated. All icons must use FontAwesome 6 Free SVG or class-based icons (e.g., `fa-solid fa-magnifying-glass`).
- **Standardized Mapping for Task Types**:
  - `watch_detect` -> `fa-solid fa-folder-open`
  - `subtitle_search` -> `fa-solid fa-magnifying-glass`
  - `subtitle_download` -> `fa-solid fa-download`
  - `manual_scan` -> `fa-solid fa-wand-magic-sparkles`
  - Running task -> `fa-solid fa-circle-notch fa-spin text-amber-500`

## 🎛️ Premium Minimalist Action Buttons (Textless Patterns)
- **Action Control buttons** (such as play, pause, delete, and refresh controls):
  - Do NOT display Vietnamese or English action text next to the icons when the action is self-explanatory (e.g., avoid writing `TIẾP TỤC` next to the play icon).
  - Use compact, rounded action buttons containing only the FontAwesome vector icon.
  - **Crucial**: You MUST provide an explanatory `title="..."` attribute to ensure native tooltip guidance on hover (e.g., `title="Tiếp tục"`, `title="Tạm dừng"`, `title="Xóa bỏ"`).

## 🧩 Component Architecture
- **Nuxt 3 Best Practices**:
  - Use `<script setup lang="ts">` for all Vue components.
  - Auto-imported composables (like `useFetch`, `ref`, `computed`) should not have manual import statements.
  - Maintain clean, self-contained components under `app/components/` (e.g., `ResultCard.vue`, `NyaaResultCard.vue`).
