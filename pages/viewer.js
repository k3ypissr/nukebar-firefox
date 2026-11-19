/* K3ypissr NukeBar - response viewer. */
"use strict";

const api = globalThis.browser || globalThis.chrome;
const id = (location.hash || "").replace(/^#/, "");
let current = null;

const bodyEl = document.getElementById("body");
const metaEl = document.getElementById("meta");
const modeEl = document.getElementById("mode");
const headersBody = document.querySelector("#headers tbody");
const preview = document.getElementById("preview");

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function render(response) {
  if (!response) {
    metaEl.textContent = "No stored response. Run Fetch from the NukeBar panel.";
    bodyEl.textContent = "";
    return;
  }
  current = response;
  const statusClass = response.error ? "status-err" : response.ok ? "status-ok" : "status-warn";
  metaEl.innerHTML =
    '<span class="' +
    statusClass +
    '">' +
    escapeHtml(response.error ? "ERROR " + response.error : "HTTP " + response.status + " " + (response.statusText || "")) +
    "</span><br>" +
    escapeHtml(response.finalUrl || response.url || "") +
    (response.redirected ? ' <span class="badge">redirected</span>' : "");
  bodyEl.textContent = response.body || "(empty body)";
  modeEl.textContent = response.method + (response.redirected ? " / followed redirect" : "");
  for (const row of [...headersBody.children]) row.remove();
  for (const [name, value] of response.headers || []) {
    const tr = document.createElement("tr");
    const th = document.createElement("td");
    th.textContent = name;
    const td = document.createElement("td");
    td.textContent = value;
    tr.append(th, td);
    headersBody.appendChild(tr);
  }
  // A sandboxed iframe has no base URL of its own; inject one so relative
  // assets in the captured response resolve against the original URL.
  const baseHref = response.finalUrl || response.url || "";
  const baseTag = baseHref ? '<base href="' + escapeHtml(baseHref) + '">' : "";
  preview.srcdoc = (response.body || "").replace(/<head([^>]*)>/i, "<head$1>" + baseTag);
}

function receive(reply) {
  if (!reply || !reply.ok) {
    render(null);
    return;
  }
  render(reply.response);
}

if (id) {
  api.runtime.sendMessage({ type: "getResponse", id }, receive);
} else {
  // "Open response viewer" from the Tools menu has no id; show the newest
  // captured response instead of an empty page.
  api.runtime.sendMessage({ type: "latestResponse" }, receive);
}

document.getElementById("copy").addEventListener("click", async () => {
  if (!current) return;
  await navigator.clipboard.writeText(current.body || "");
});

document.getElementById("open").addEventListener("click", () => {
  if (!current) return;
  api.tabs.create({ url: current.finalUrl || current.url });
});

document.getElementById("reload").addEventListener("click", () => {
  if (!current) return;
  api.runtime.sendMessage(
    { type: "execute", spec: { url: current.url, viewer: true, newTab: true } },
    () => window.location.reload()
  );
});

for (const button of document.querySelectorAll(".tabs button")) {
  button.addEventListener("click", () => {
    for (const other of document.querySelectorAll(".tabs button")) other.classList.toggle("active", other === button);
    const tab = button.dataset.tab;
    document.getElementById("pane-body").classList.toggle("hidden", tab !== "body");
    document.getElementById("pane-preview").classList.toggle("hidden", tab !== "preview");
    document.getElementById("pane-headers").classList.toggle("hidden", tab !== "headers");
  });
}
