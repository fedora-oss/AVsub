export interface JavMetadata {
  contentId: string | null
  code: string | null
  title: string | null
  originalTitle: string | null
  description: string | null
  releaseDate: string | null
  releaseYear: number | null
  runtime: number | null
  director: string | null
  studio: string | null
  label: string | null
  series: string | null
  ratingScore: number | null
  ratingVotes: number | null
  posterUrl: string | null
  coverUrl: string | null
  screenshots: string[]
  trailerUrl: string | null
  genres: string[]
  actresses: string[]
  actressDetails: {
    id: number
    name: string
    japaneseName: string | null
    thumbUrl: string | null
    aliases: string | null
    dmmId: number | null
  }[]
  // English translations (only present when data came from API scrape)
  titleEn?: string | null
  studioEn?: string | null
  seriesEn?: string | null
}

export interface SearchResult {
  title: string
  detail_link: string
  cover_image: string
  subtitles_info: string
  magnet?: string
  torrentUrl?: string
  jav_metadata?: JavMetadata
}

export interface DownloadRequest {
  detail_link: string
  keyword: string
}

export interface DownloadResponse {
  success: boolean
  movedFiles: string[]
  targetFolder: string
  error?: string
}

export interface TorrentResult {
  title: string
  magnet: string | null
  torrentUrl: string | null
  size: string | null
  date: string | null
  seeders: number
  leechers: number
  downloads: number
  pageUrl: string | null
  category: string
  code?: string
}

