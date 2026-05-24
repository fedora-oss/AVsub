import fs from 'node:fs'
import path from 'node:path'
import { extractJavCode } from '../plugins/watcher'

export interface MovieFolder {
  name: string
  fullPath: string
  parentDir: string
}

/**
 * Lists all JAV movie folders inside the movie directory,
 * transparently supporting sub-mounts like uncen and sync.
 */
export function getMovieFolders(movieDir: string): MovieFolder[] {
  const folders: MovieFolder[] = []
  if (!fs.existsSync(movieDir)) return folders

  try {
    const items = fs.readdirSync(movieDir)
    for (const item of items) {
      const fullPath = path.join(movieDir, item)
      if (!fs.statSync(fullPath).isDirectory()) continue

      const lowerName = item.toLowerCase()
      if (lowerName === 'uncen' || lowerName === 'sync') {
        try {
          const subItems = fs.readdirSync(fullPath)
          for (const subItem of subItems) {
            const subFullPath = path.join(fullPath, subItem)
            if (fs.statSync(subFullPath).isDirectory()) {
              folders.push({
                name: subItem,
                fullPath: subFullPath,
                parentDir: fullPath
              })
            }
          }
        } catch (e) {
          // ignore reading errors for specific subdirs
        }
      } else {
        folders.push({
          name: item,
          fullPath,
          parentDir: movieDir
        })
      }
    }
  } catch (err) {
    console.error('[movies-util] getMovieFolders error:', err)
  }

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
