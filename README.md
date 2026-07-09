# Proxy Torrent Search

A Chrome extension (Manifest V3) that searches active proxy mirror sites and
returns their magnet links.

## Install

Chrome extensions distributed outside the Web Store are installed as an unpacked
folder. Pick either option:

### Option A — from a release (recommended)

1. Download `chrome-torrent-search.zip` from the
   [latest release](https://github.com/rw3iss/chrome-torrent-search/releases/latest).
2. Unzip it to a folder you'll keep (deleting the folder uninstalls the
   extension).
3. Open `chrome://extensions` and enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the unzipped folder.
5. The **Proxy Torrent Search** icon appears in the toolbar — click it to search.
   (Pin it via the puzzle-piece menu if you don't see it.)

### Option B — from source

```sh
git clone https://github.com/rw3iss/chrome-torrent-search.git
```

Then follow steps 3–5 above, selecting the cloned folder.

> Note: `.crx` sideloading is blocked by modern Chrome outside the Web Store, so
> the unpacked-folder method above is the supported way to install.

## How it works

1. On browser startup / install, the service worker fetches the proxy directory
   at `https://piratebayproxy.info/`, keeps every mirror whose status is **up**,
   and caches the primary + 2 backups in `chrome.storage.local`.
2. The popup reads that cache. Typing a query and pressing **Enter** (or the
   search button) requests `<mirror>/search/<url-encoded-query>/1/99/0` from the
   first working mirror, falling back to backups if one is unreachable.
3. The results table is scraped and rendered below the search box:
   - **File** — file name (links to the torrent detail page) with the size /
     date info line beneath it.
   - **Copy** — copies that entry's magnet link to the clipboard.
   - **SE** / **LE** — seeders / leechers.

## Usage

Click the extension's toolbar icon to open the search popup (a dropdown anchored
to the icon), type a query, and press **Enter** or the search button.

- **Clicking outside** the popup closes it (native popup behaviour), but the
  last search is cached — reopening restores the query and results immediately.
- The **X** in the search bar clears the input, results, and cache (the popup
  stays open) so you can start a fresh search.

## Files

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest (storage + broad host permissions for fetching mirrors). |
| `background.js` | Service worker: refreshes and caches the "up" mirror list. |
| `parser.js` | DOM-free parser for the proxy directory (shared by worker + popup). |
| `popup.html/.css/.js` | Search UI, results scraping (via `DOMParser`), and rendering. |

## Notes

- Broad `host_permissions` (`<all_urls>`) are required because the mirror URLs
  are discovered at runtime and are not known ahead of time.
- If searches fail, open the popup, and the cache auto-refreshes when stale
  (older than 6 hours) or empty.
