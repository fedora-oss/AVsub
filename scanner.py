import os
import re
import json
import requests
from pathlib import Path

# Get the directory where the script is located
SCRIPT_DIR = Path(__file__).parent.absolute()
API_BASE_URL = "http://localhost:9998"
STATE_FILE = SCRIPT_DIR / "list_movies.json"
VIDEO_EXTENSIONS = {".mp4", ".mkv", ".avi", ".wmv", ".iso"}
# Regex for JAV code (e.g., MIDA-533, EBOD-123)
JAV_CODE_REGEX = r'([a-zA-Z]{2,10}-[0-9]{3,10})'

def load_env(file_path=None):
    if file_path is None:
        file_path = SCRIPT_DIR / ".env"
    
    file_path = os.path.expanduser(str(file_path))
    env_vars = {}
    if os.path.exists(file_path):
        with open(file_path, "r") as f:
            for line in f:
                line = line.strip()
                if line and "=" in line and not line.startswith("#"):
                    key, value = line.split("=", 1)
                    env_vars[key.strip()] = value.strip().strip('"').strip("'")
    return env_vars

def load_state():
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading {STATE_FILE}: {e}")
            return {}
    return {}

def save_state(state):
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)

def scan_movies(movie_dir):
    movies = {}
    path = Path(movie_dir)
    if not path.exists():
        print(f"Directory not found: {movie_dir}")
        return movies

    for file in path.rglob("*"):
        if file.suffix.lower() in VIDEO_EXTENSIONS:
            # Try to extract JAV code from filename
            match = re.search(JAV_CODE_REGEX, file.name, re.IGNORECASE)
            if match:
                code = match.group(1).upper()
                if code not in movies:
                    # Check if an SRT file already exists in the same directory
                    parent_dir = file.parent
                    has_srt = any(f.suffix.lower() == ".srt" for f in parent_dir.glob("*.srt"))
                    
                    movies[code] = {
                        "filename": file.name,
                        "path": str(file.absolute()),
                        "code": code,
                        "has_subtitle": has_srt
                    }
    return movies

def process_movie(code, movie_data, state):
    print(f"\n>>> Processing: {code}")
    
    # 1. Search for subtitles
    try:
        search_resp = requests.get(f"{API_BASE_URL}/api/search", params={"keyword": code}, timeout=30)
        search_resp.raise_for_status()
        results = search_resp.json()
        
        if not results:
            print(f"No subtitles found for {code}. Marking as skipped for future runs.")
            state[code]["has_subtitle"] = False
            state[code]["no_subtitle"] = True
            return False

        # Pick the first result
        detail_link = results[0].get("detail_link")
        if not detail_link:
            print(f"No detail link for {code}")
            return False

        # 2. Download subtitles
        print(f"Downloading subtitle for {code} from {detail_link}...")
        download_resp = requests.post(
            f"{API_BASE_URL}/api/download",
            json={"detail_link": detail_link, "keyword": code},
            timeout=120 # Downloading can take time due to Playwright
        )
        download_resp.raise_for_status()
        download_result = download_resp.json()

        if download_result.get("success"):
            print(f"Successfully downloaded subtitles for {code}")
            print(f"Moved files: {download_result.get('movedFiles')}")
            state[code]["has_subtitle"] = True
            state[code]["no_subtitle"] = False
            state[code]["target_folder"] = download_result.get("targetFolder")
            return True
        else:
            print(f"Download failed for {code}: {download_result.get('error')}")
            return False

    except Exception as e:
        print(f"Error processing {code}: {e}")
        return False

def main():
    env = load_env()
    movie_dir = env.get("MOVIE_DIRECTORY")
    if not movie_dir:
        print("MOVIE_DIRECTORY not found in .env")
        return

    print(f"Scanning directory: {movie_dir}")
    found_movies = scan_movies(movie_dir)
    state = load_state()

    # Merge found movies into state and sync subtitle status
    for code, data in found_movies.items():
        if code not in state:
            state[code] = data
            print(f"New movie found: {code}")
        else:
            # Sync subtitle status if found on disk
            if data.get("has_subtitle") and not state[code].get("has_subtitle"):
                print(f"Subtitle found on disk for existing movie: {code}")
                state[code]["has_subtitle"] = True
                state[code]["no_subtitle"] = False

    # Identify movies that need subtitles
    # Skip if has_subtitle is True OR if no_subtitle is True
    to_process = [code for code, data in state.items() if not data.get("has_subtitle") and not data.get("no_subtitle")]

    if not to_process:
        print("No new movies or movies without subtitles found.")
    else:
        print(f"Found {len(to_process)} movies to process. Processing only the first one as requested.")
        
        code = to_process[0]
        if process_movie(code, state[code], state):
            print(f"\nDone! Successfully processed {code}.")
        else:
            print(f"\nDone! Processed {code} but it failed or no subtitle was found.")
        
        # Save state to reflect any changes (like has_subtitle=True)
        save_state(state)

if __name__ == "__main__":
    main()
