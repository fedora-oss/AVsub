import fs from 'node:fs'
import path from 'node:path'
import { extractJavCode } from '../plugins/watcher'

export interface MovieFolder {
  name: string
  fullPath: string
  parentDir: string
}

/**
 * Helper to check for video files directly in a folder.
 */
function hasDirectVideoFile(dirPath: string): boolean {
  try {
    const files = fs.readdirSync(dirPath, { withFileTypes: true })
    return files.some(f => f.isFile() && /\.(mp4|mkv|avi|wmv|mov)$/i.test(f.name))
  } catch {
    return false
  }
}

/**
 * Helper to check for ignored folders.
 */
function isIgnoredFolder(name: string): boolean {
  const lower = name.toLowerCase()
  return (
    name.startsWith('.') ||
    lower === 'extracted' ||
    lower === 'node_modules' ||
    lower === 'extrafanart' ||
    lower === 'metadata' ||
    lower === '.git' ||
    lower === '.github'
  )
}

/**
 * Lists all JAV movie folders inside the movie directory,
 * transparently supporting deeply nested sub-mounts (e.g. category folders under uncen or sync).
 * Optimized with short-circuiting to avoid redundant reads and prevent hangs on slow network drives.
 */
export function getMovieFolders(movieDir: string): MovieFolder[] {
  const folders: MovieFolder[] = []
  if (!fs.existsSync(movieDir)) return folders

  const resolvedBase = path.resolve(movieDir)

  function scanDir(currentDir: string, depth: number) {
    if (depth > 5) return

    // Strict path boundary validation for security
    const resolvedCurrent = path.resolve(currentDir)
    if (resolvedCurrent !== resolvedBase && !resolvedCurrent.startsWith(resolvedBase + path.sep)) {
      return
    }

    try {
      const entries = fs.readdirSync(resolvedCurrent, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        if (isIgnoredFolder(entry.name)) continue

        const subPath = path.join(resolvedCurrent, entry.name)

        // CRITICAL: Short-circuit to avoid reading the directory if it already matches by name!
        // This prevents reading files inside JAV movie folders, which speeds up scanning
        // and completely avoids I/O errors or hangs on slow/broken network drives.
        const hasJavCode = !!extractJavCode(entry.name)

        if (hasJavCode || (depth > 0 && hasDirectVideoFile(subPath))) {
          folders.push({
            name: entry.name,
            fullPath: subPath,
            parentDir: resolvedCurrent
          })
        } else {
          // Recurse into non-movie directories
          scanDir(subPath, depth + 1)
        }
      }
    } catch (err: any) {
      console.error(`[movies-util] scanDir error in ${currentDir}:`, err.message)
    }
  }

  scanDir(resolvedBase, 0)
  return folders
}

/**
 * Finds an existing movie folder matching the JAV code.
 * Searches both base directory and sub-mounts (uncen/sync).
 */
export function findMovieFolder(movieDir: string, code: string): string | null {
  const folders = getMovieFolders(movieDir)
  const cleanCode = code.replace(/-/g, '[-\\s]?')
  const codeRegex = new RegExp(`\\b${cleanCode}\\b`, 'i')

  const matched = folders.find(f => codeRegex.test(f.name))
  return matched ? matched.fullPath : null
}

/**
 * Resolves the destination path for writing/creating a movie folder.
 * If the folder already exists, returns its path.
 * If not, defaults to `/movies/uncen` if it exists, otherwise `/movies`.
 */
export function resolveTargetMoviePath(movieDir: string, folderName: string): string {
  // 1. If folder already exists, return it
  const existingPath = findMovieFolder(movieDir, folderName)
  if (existingPath) return existingPath

  // 2. Otherwise determine where to create a new folder
  const uncenPath = path.join(movieDir, 'uncen')
  if (fs.existsSync(uncenPath) && fs.statSync(uncenPath).isDirectory()) {
    return path.join(uncenPath, folderName)
  }

  return path.join(movieDir, folderName)
}
