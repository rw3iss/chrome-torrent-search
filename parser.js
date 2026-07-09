/*
 * Shared, DOM-free parser for the proxy list page (piratebayproxy.info).
 *
 * Loaded both by the MV3 service worker (via importScripts, where DOMParser is
 * NOT available) and by the popup (via <script>). Because it can't rely on the
 * DOM, it uses tolerant string/regex extraction rather than querySelector.
 *
 * The proxy table lists one mirror per <tr>. The 3rd column holds a status
 * <img> whose alt is "up" / "down". We keep only rows flagged "up" and pull the
 * mirror's base URL out of the first cell.
 */
(function (root) {
  function parseProxyList(html) {
    const urls = [];
    const seen = new Set();

    // Narrow to the <tbody> when present so we skip header/toolbar markup.
    const tbody = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
    const scope = tbody ? tbody[1] : html;

    const rows = scope.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    for (const row of rows) {
      // Status column: an <img alt="up"> means the mirror is reachable.
      if (!/alt\s*=\s*["']?\s*up\s*["']?/i.test(row)) continue;

      const cells = row.match(/<td[\s\S]*?<\/td>/gi) || [];
      const firstCell = cells[0] || row;

      // Prefer an explicit http(s) URL in the first cell...
      let url = null;
      const direct = firstCell.match(/https?:\/\/[^\s"'<>]+/i);
      if (direct) {
        url = direct[0];
      } else {
        // ...otherwise fall back to a bare domain in the cell's text.
        const text = firstCell.replace(/<[^>]+>/g, " ");
        const dom = text.match(/[a-z0-9][a-z0-9.-]*\.[a-z]{2,}/i);
        if (dom) url = "https://" + dom[0];
      }
      if (!url) continue;

      // Normalise to the bare origin (scheme + host) so we can append /search/.
      try {
        url = new URL(url).origin;
      } catch (e) {
        url = url.replace(/\/+$/, "");
      }

      if (!seen.has(url)) {
        seen.add(url);
        urls.push(url);
      }
    }
    return urls;
  }

  root.parseProxyList = parseProxyList;
})(typeof self !== "undefined" ? self : this);
