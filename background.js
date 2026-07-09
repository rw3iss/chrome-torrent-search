/*
 * Service worker: keeps a cache of working proxy mirrors.
 *
 * On browser startup / install it fetches the proxy directory, keeps every
 * mirror flagged "up", and stores the first few (a primary + backups) in
 * chrome.storage.local. The popup reads that cache; if it's empty or stale it
 * can ask us to refresh via a message.
 */
importScripts("parser.js");

const PROXY_LIST_URL = "https://piratebayproxy.info/";
const STORAGE_KEY = "proxyCache";
const MAX_MIRRORS = 3; // primary + 2 backups
const STALE_MS = 6 * 60 * 60 * 1000; // 6 hours

async function fetchText(url, timeoutMs = 12000) {
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

async function refreshProxies() {
  const html = await fetchText(PROXY_LIST_URL);
  const all = parseProxyList(html);
  const mirrors = all.slice(0, MAX_MIRRORS);
  const cache = { mirrors, updatedAt: Date.now() };
  await chrome.storage.local.set({ [STORAGE_KEY]: cache });
  return cache;
}

async function getCache() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || null;
}

// Ensure we have a reasonably fresh set of mirrors, refreshing if needed.
async function ensureProxies(force = false) {
  let cache = await getCache();
  const stale = !cache || !cache.mirrors || cache.mirrors.length === 0 ||
    Date.now() - (cache.updatedAt || 0) > STALE_MS;
  if (force || stale) {
    try {
      cache = await refreshProxies();
    } catch (e) {
      // Keep whatever we had if the refresh fails.
      if (!cache) cache = { mirrors: [], updatedAt: 0, error: String(e) };
      else cache.error = String(e);
    }
  }
  return cache;
}

chrome.runtime.onStartup.addListener(() => { ensureProxies(true); });
chrome.runtime.onInstalled.addListener(() => { ensureProxies(true); });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "getProxies") {
    ensureProxies(!!msg.force).then(sendResponse);
    return true; // async response
  }
});
