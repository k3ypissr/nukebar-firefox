/* K3ypissr NukeBar - about page helpers.
 * Kept in a file because Manifest V3 CSP blocks inline scripts.
 */
"use strict";

(function () {
  const api = globalThis.browser || globalThis.chrome;
  if (!api || !api.runtime || !api.runtime.getURL) return;

  const pages = [
    ["Decoder", "decoder"],
    ["Admin Finder", "admin-finder"],
    ["Reverse IP", "reverse-ip"],
    ["Network", "network"],
    ["Options", "options"],
  ];

  const host = document.createElement("p");
  host.className = "note";
  host.id = "tool-links";

  for (const [label, page] of pages) {
    const link = document.createElement("a");
    link.href = api.runtime.getURL("pages/" + page + ".html");
    link.textContent = label;
    link.style.marginRight = "12px";
    host.append(link);
  }

  const anchor = document.getElementById("tool-links-anchor");
  if (anchor) anchor.after(host);
  else document.body.append(host);
})();
