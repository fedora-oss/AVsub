import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  rules: {
    'vue/multi-word-component-names': 'off', // Allow single-word components like index.vue or app.vue in Nuxt
    '@typescript-eslint/no-explicit-any': 'off', // Allow 'any' for convenient torrent/metadata API parsing
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }], // Warn instead of error on unused vars, ignore args starting with _
    'no-unused-vars': 'off', // Handled by typescript-eslint rule above
    'vue/no-unused-vars': 'warn', // Warn instead of error on unused variables in Vue templates (e.g. idx)
    'no-empty': 'warn', // Warn on empty catch blocks instead of hard erroring
    'no-useless-escape': 'off', // Turn off warnings for unnecessary escapes in complex JAV regex patterns
    'no-console': 'off', // Allow logs for backend/torrent diagnostic printouts
    'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
  }
})
