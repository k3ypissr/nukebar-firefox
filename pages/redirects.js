/* K3ypissr NukeBar - redirect chain viewer (NoRedirect). */
"use strict";

const api = globalThis.browser || globalThis.chrome;
const id = (location.hash || "").replace(/^#/, "");
const summaryEl = document.getElementById("summary");
const hopsEl = document.getElementById("hops");
const emptyEl = document.getElementById("empty");
const testUrlEl = document.getElementById("testUrl");
const testResultEl = document.getElementById("testResult");

let info = null;

function sendMessage(message) {
  return new Promise((resolve) => {
    try {
      const maybe = api.runtime.sendMessage(message, (reply) => {
        const error = api.runtime.lastError;
        resolve(error ? { ok: false, error: error.message } : reply || { ok: false });
      });
      if (maybe && typeof maybe.then === "function") {
        maybe.then((reply) => resolve(reply || { ok: false }), (error) => resolve({ ok: false, error: String(error) }));
      }
    } catch (error) {
      resolve({ ok: false, error: String(error) });
    }
  });
}

function render() {
  hopsEl.textContent = "";
  if (!info) {
    summaryEl.textContent = "This redirect record expired. Run NoRedirect from the panel again.";
    emptyEl.classList.remove("hidden");
    return;
  }
  if (info.url) testUrlEl.value = info.url;
  const hops = Array.isArray(info.hops) ? info.hops : [];
  summaryEl.textContent = hops.length
    ? hops.length + " redirect hop(s) observed for " + info.url
    : "No redirects observed for " + (info.url || "this tab");
  emptyEl.classList.toggle("hidden", hops.length > 0);
  hops.forEach((hop, index) => {
    const tr = document.createElement("tr");
    const cells = [
      String(index + 1),
      String(hop.status || "-"),
      hop.from || "",
      hop.to || "",
    ];
    cells.forEach((value, cellIndex) => {
      const td = document.createElement("td");
      td.textContent = value;
      if (cellIndex >= 2) td.style.wordBreak = "break-all";
      if (cellIndex === 1) td.className = "status-warn";
      tr.appendChild(td);
    });
    hopsEl.appendChild(tr);
  });
}

function load() {
  sendMessage({ type: "redirectInfo", id }).then((reply) => {
    info = reply && reply.ok ? reply.info : null;
    render();
  });
}

document.getElementById("refresh").addEventListener("click", load);
document.getElementById("openStart").addEventListener("click", () => {
  if (info && info.url) api.tabs.create({ url: info.url });
});
document.getElementById("openFinal").addEventListener("click", () => {
  const hops = (info && info.hops) || [];
  const finalUrl = hops.length ? hops[hops.length - 1].to : info && info.url;
  if (finalUrl) api.tabs.create({ url: finalUrl });
});

document.getElementById("test").addEventListener("click", () => {
  const url = testUrlEl.value.trim();
  if (!url) {
    testResultEl.textContent = "Enter a URL first.";
    return;
  }
  testResultEl.textContent = "Following redirects...";
  sendMessage({ type: "redirectTest", url }).then((reply) => {
    if (!reply || !reply.ok) {
      testResultEl.textContent = "Request failed: " + ((reply && reply.error) || "unknown");
      return;
    }
    testResultEl.textContent =
      "HTTP " + reply.status + " " + (reply.statusText || "") +
      (reply.redirected ? " - redirected to " + reply.finalUrl : " - no redirect") +
      " (final: " + reply.finalUrl + ")";
  });
});

load();
