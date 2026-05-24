# AVsub - Subtitle Downloader for AV

AVsub is a powerful, automated subtitle downloader designed specifically for AV movies. It searches for subtitles on `avsubtitles.com`, handles aggressive ads with a built-in ad-blocker, and automatically matches and extracts subtitles to your movie library.

## ✨ Features

- 🔍 **Smart Search**: Find subtitles by keyword/ID (e.g., MIDA-533).
- 🛡️ **Built-in Ad-blocker**: Integrates `@ghostery/adblocker-playwright` to bypass aggressive ads and popups during crawling.
- ⚡ **Optimized Crawling**: Blocks non-essential resources (images, fonts) for lightning-fast performance.
- 📂 **Automatic Extraction**: Downloads ZIP files, extracts `.srt` files, and moves them to the matching movie folder.
- 🏷️ **Language Support**: Prioritizes Japanese subtitles, with fallbacks for English and Chinese.
- 🐳 **Docker Ready**: Easy deployment with a multi-stage Docker build.

## 🚀 Getting Started

### Prerequisites

- Node.js 22+
- pnpm

### Local Installation

1. Clone the repository.
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Configure `.env`:
   ```env
   MOVIE_DIRECTORY=/path/to/your/movies
   ```
4. Start development server:
   ```bash
   pnpm dev
   ```

### 🐳 Docker Setup

#### Using Docker Compose (Recommended)

1. **Start the application**:
   ```bash
   docker compose up -d
   ```
   *Note: By default, it uses the `MOVIE_DIRECTORY` defined in your `.env` file or `/srv/nas_share/Arr/uncen/`.*

#### Using Docker CLI

1. **Build the image**:
   ```bash
   docker build -t avsub .
   ```

2. **Run the container**:
   ```bash
   docker run -d \
     -p 3000:3000 \
     -v /path/to/your/movies:/movies \
     -e MOVIE_DIRECTORY=/movies \
     --name avsub \
     avsub
   ```

## 🔌 API Documentation

### 1. Tìm kiếm phụ đề (Search)
Tìm kiếm danh sách phụ đề từ `avsubtitles.com`.

- **Endpoint**: `GET /api/search`
- **Tham số (Query Params)**:
  - `keyword` (bắt buộc): Từ khóa hoặc mã phim (VD: `MIDA-533`).
- **Phản hồi (Response)**: Trả về một mảng các đối tượng `SearchResult`.
  ```json
  [
    {
      "title": "MIDA-533 ...",
      "detail_link": "https://www.avsubtitles.com/subtitles/...",
      "cover_image": "https://www.avsubtitles.com/images/...",
      "subtitles_info": "Subtitles: Japanese, English..."
    }
  ]
  ```

### 2. Tải phụ đề (Download)
Tự động tải, giải nén và di chuyển phụ đề vào thư mục phim tương ứng.

- **Endpoint**: `POST /api/download`
- **Thân bài (Body - JSON)**:
  - `detail_link` (bắt buộc): Đường dẫn chi tiết phụ đề lấy từ API search.
  - `keyword` (bắt buộc): Từ khóa dùng để khớp tên thư mục trong `MOVIE_DIRECTORY`.
- **Phản hồi (Response)**:
  ```json
  {
    "success": true,
    "movedFiles": ["Tên-Phim.ja.srt"],
    "targetFolder": "MIDA-533",
    "error": null
  }
  ```

## 💡 Cách sử dụng (Usage)

### Sử dụng với `curl`

**Tìm kiếm:**
```bash
curl "http://localhost:3000/api/search?keyword=MIDA-533"
```

**Tải phụ đề:**
```bash
curl -X POST http://localhost:3000/api/download \
     -H "Content-Type: application/json" \
     -d '{"detail_link": "https://www.avsubtitles.com/subtitles/mida-533", "keyword": "MIDA-533"}'
```

## 🛠️ Tech Stack

- **Nuxt 4**: Modern Vue framework for the frontend and API.
- **Playwright**: Headless browser for reliable crawling of dynamic content.
- **Cheerio**: Fast HTML parsing for search results.
- **Adblocker**: `@ghostery/adblocker-playwright` for ad-free crawling.
- **AdmZip**: ZIP file manipulation and extraction.

## 📄 License

MIT
