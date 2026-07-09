/* Popup: reads cached mirrors, runs a search against the first working one,
 * scrapes the results table, and renders it cleanly. */

const queryInput = document.getElementById("query");
const searchBtn = document.getElementById("search");
const closeBtn = document.getElementById("close");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

const SESSION_KEY = "lastSearch";

function saveSession(query, items) {
  chrome.storage.local.set({ [SESSION_KEY]: { query, items } });
}

function clearSession() {
  chrome.storage.local.remove(SESSION_KEY);
}

async function restoreSession() {
  const data = await chrome.storage.local.get(SESSION_KEY);
  const last = data[SESSION_KEY];
  if (!last) return false;
  queryInput.value = last.query || "";
  if (Array.isArray(last.items)) render(last.items);
  return true;
}

function setStatus(msg, isError = false) {
  statusEl.textContent = msg || "";
  statusEl.classList.toggle("error", !!isError);
}

async function getMirrors(force = false) {
  const cache = await chrome.runtime.sendMessage({ type: "getProxies", force });
  return (cache && cache.mirrors) || [];
}

function buildSearchUrl(base, query) {
  return `${base}/search/${encodeURIComponent(query)}/1/99/0`;
}

async function fetchText(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// Scrape the results table. The popup has a real DOM, so use DOMParser here.
//
// Tolerant of two known TPB templates:
//   - "double" view: name in .detName, meta in a .detDesc <font>, 2 right cells.
//   - "single" view: plain /torrent/ link, meta split across separate columns,
//     and attributes carry stray trailing spaces (id="searchResult ",
//     align="right ") which break exact-match selectors.
function findResultTable(doc) {
  // id may be "searchResult" or "searchResult " — match by prefix.
  let table = doc.querySelector('table[id^="searchResult"]');
  if (table) return table;
  // Fallback: the table holding the most magnet links.
  let best = null, bestCount = 0;
  doc.querySelectorAll("table").forEach((t) => {
    const c = t.querySelectorAll('a[href^="magnet:"]').length;
    if (c > bestCount) { best = t; bestCount = c; }
  });
  return best;
}

function parseResults(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const table = findResultTable(doc);
  console.log("[proxy-search] result table found:", !!table);
  if (!table) return [];

  const out = [];
  const rows = table.querySelectorAll("tr");
  console.log("[proxy-search] scanning", rows.length, "rows");

  rows.forEach((tr) => {
    // The name link is the row's /torrent/ anchor — present in both templates.
    const nameLink = tr.querySelector('a[href*="/torrent/"]');
    if (!nameLink) return; // header / pagination / ad rows

    const magnetEl = tr.querySelector('a[href^="magnet:"]');

    // Seeders/leechers = the last two whole-number cells. Works whether the row
    // has [SE, LE] (double) or [Size, SE, LE] (single) right-aligned columns.
    const intCells = [];
    tr.querySelectorAll("td").forEach((td) => {
      const t = td.textContent.trim();
      if (/^\d+$/.test(t)) intCells.push(t);
    });
    const seeders = intCells.length ? intCells[Math.max(0, intCells.length - 2)] : "0";
    const leechers = intCells.length >= 2 ? intCells[intCells.length - 1] : "0";

    // Info line: use .detDesc when present, else rebuild from the row text.
    let info = "";
    const descEl = tr.querySelector(".detDesc");
    if (descEl) {
      info = descEl.textContent.replace(/\s+/g, " ").trim();
    } else {
      const rowText = tr.textContent.replace(/ /g, " ").replace(/\s+/g, " ");
      const size = rowText.match(/(\d+(?:\.\d+)?)\s*(GiB|MiB|KiB|TiB)\b/i);
      const date = rowText.match(/(\d{2}-\d{2})\s*(\d{4}|\d{2}:\d{2})/);
      const parts = [];
      if (date) parts.push("Uploaded " + date[1] + " " + date[2]);
      if (size) parts.push("Size " + size[1] + " " + size[2]);
      info = parts.join(", ");
    }

    out.push({
      name: nameLink.textContent.trim(),
      fileLink: (nameLink.getAttribute("href") || "").trim(),
      info,
      magnet: magnetEl ? (magnetEl.getAttribute("href") || "").trim() : "",
      seeders,
      leechers,
    });
  });

  console.log("[proxy-search] parsed", out.length, "results");
  return out;
}

function render(items) {
  resultsEl.innerHTML = "";
  if (!items.length) {
    setStatus("No results found.");
    return;
  }
  const table = document.createElement("table");
  table.innerHTML = `
    <thead><tr>
      <th>File</th>
      <th class="copy">Copy</th>
      <th class="num">SE</th>
      <th class="num">LE</th>
    </tr></thead>`;
  const tbody = document.createElement("tbody");

  for (const it of items) {
    const tr = document.createElement("tr");

    const fileTd = document.createElement("td");
    const a = document.createElement("a");
    a.className = "fname";
    a.href = it.fileLink;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = it.name;
    fileTd.appendChild(a);
    if (it.info) {
      const info = document.createElement("div");
      info.className = "finfo";
      info.textContent = it.info;
      fileTd.appendChild(info);
    }

    const copyTd = document.createElement("td");
    copyTd.className = "copy";
    if (it.magnet) {
      const copy = document.createElement("a");
      copy.className = "copy-link";
      copy.textContent = "Copy";
      copy.addEventListener("click", () => copyMagnet(copy, it.magnet));
      copyTd.appendChild(copy);
    } else {
      copyTd.textContent = "—";
    }

    const seTd = document.createElement("td");
    seTd.className = "num";
    seTd.textContent = it.seeders;

    const leTd = document.createElement("td");
    leTd.className = "num";
    leTd.textContent = it.leechers;

    tr.append(fileTd, copyTd, seTd, leTd);
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  resultsEl.appendChild(table);
  setStatus(`${items.length} result${items.length === 1 ? "" : "s"}.`);
}

async function copyMagnet(el, magnet) {
  try {
    await navigator.clipboard.writeText(magnet);
    const prev = el.textContent;
    el.textContent = "Copied";
    el.classList.add("copied");
    setTimeout(() => {
      el.textContent = prev;
      el.classList.remove("copied");
    }, 1200);
  } catch (e) {
    setStatus("Could not copy to clipboard.", true);
  }
}

async function doSearch() {
  const query = queryInput.value.trim();
  if (!query) return;

  searchBtn.disabled = true;
  resultsEl.innerHTML = "";
  setStatus("Locating an active proxy…");

  try {
    let mirrors = await getMirrors(false);
    if (!mirrors.length) mirrors = await getMirrors(true);
    if (!mirrors.length) {
      setStatus("No active proxy mirrors available.", true);
      return;
    }

    let lastErr = null;
    for (let i = 0; i < mirrors.length; i++) {
      const base = mirrors[i];
      setStatus(`Searching ${base.replace(/^https?:\/\//, "")}…`);
      const url = buildSearchUrl(base, query);
      console.log("[proxy-search] GET", url);
      try {
        const html = await fetchText(url);
        console.log("[proxy-search] response length:", html.length);
        const items = parseResults(html);
        render(items);
        saveSession(query, items);
        return;
      } catch (e) {
        console.warn("[proxy-search] mirror failed:", base, e);
        lastErr = e;
      }
    }
    setStatus("All proxy mirrors failed to respond. " + (lastErr ? String(lastErr) : ""), true);
  } catch (e) {
    setStatus("Search failed: " + String(e), true);
  } finally {
    searchBtn.disabled = false;
  }
}

searchBtn.addEventListener("click", doSearch);
queryInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") doSearch();
});

// The X clears the input, results, and cache — but leaves the window open.
closeBtn.addEventListener("click", () => {
  clearSession();
  queryInput.value = "";
  resultsEl.innerHTML = "";
  setStatus("");
  queryInput.focus();
});

// Note: closing when the window loses focus is handled by the OS/window
// manager for this detached popup. We intentionally do NOT close on `blur`
// here — a focus bounce at creation time would otherwise close it instantly.
// The cache is left intact on close, so reopening restores the last search.

// Restore the previous search (input + results) if one was cached, and warm
// the mirror cache as soon as the popup opens.
restoreSession().catch(() => {});
getMirrors(false).catch(() => {});
queryInput.focus();
