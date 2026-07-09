# Proxy Torrent Search

A Chrome extension (Manifest V3) that searches active proxy mirror sites and
returns their magnet links.

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

## Load it

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.
4. Click the extension's toolbar icon to open the search popup (a dropdown
   anchored to the icon).

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
