import { prepare, layout } from '@chenglou/pretext'

// Simple in-memory cache for prepared handles to avoid rebuilding them
const prepareCache = new Map<string, any>()

/**
 * Gets a cached prepared handle from Pretext
 * Only runs in client-side environment.
 */
export function getPreparedText(text: string, font: string): any {
  if (!process.client) return null
  
  const key = `${font}::${text}`
  if (prepareCache.has(key)) {
    return prepareCache.get(key)
  }
  
  try {
    const prepared = prepare(text, font)
    prepareCache.set(key, prepared)
    return prepared
  } catch (err) {
    console.warn('[Pretext] Failed to prepare text layout:', err)
    return null
  }
}

/**
 * Calculates multiline text height and line count DOM-free
 */
export function calculateTextGeometry(
  text: string,
  font: string,
  width: number,
  lineHeight: number
): { height: number; lineCount: number } {
  // Simple server-side / SSR fallback estimate
  const charWidthEstimate = 7.5 // approximate width per char in pixels
  const charsPerLine = Math.max(10, Math.floor(width / charWidthEstimate))
  const estimatedLines = Math.max(1, Math.ceil(text.length / charsPerLine))
  const fallback = {
    height: estimatedLines * lineHeight,
    lineCount: estimatedLines
  }
  
  if (!process.client) {
    return fallback
  }
  
  const prepared = getPreparedText(text, font)
  if (!prepared) return fallback
  
  try {
    const result = layout(prepared, width, lineHeight)
    return {
      height: result.height,
      lineCount: result.lineCount
    }
  } catch (err) {
    console.warn('[Pretext] Layout calculation failed:', err)
    return fallback
  }
}
