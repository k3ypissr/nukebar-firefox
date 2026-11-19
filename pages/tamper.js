/* K3ypissr NukeBar - Tamper Data / request editor. */
"use strict";

const api = globalThis.browser || globalThis.chrome;
const capturedEl = document.getElementById("captured");
const urlEl = document.getElementById("url");
const methodEl = document.getElementById("method");
const headersEl = document.getElementById("headers");
const bodyEl = document.getElementById("body");
const hintEl = document.getElementById("hint");
const statusEl = document.getElementById("status");
const responseHeadersEl = document.getElementById("responseHeaders");
const responseBodyEl = document.getElementById("responseBody");

let entries = [];

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

function formatHeaders(headers) {
  return (headers || [])
    .filter((header) => header && header.name)
    .map((header) => header.name + ": " + header.value)
    .join("\n");
}

function parseHeaders(text) {
  const headers = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) continue;
    const colon = trimmed.indexOf(":");
    if (colon < 1) continue;
    headers.push({ name: trimmed.slice(0, colon).trim(), value: trimmed.slice(colon + 1).trim() });
  }
  return headers;
}

function currentSpec() {
  return {
    url: urlEl.value.trim(),
    method: methodEl.value,
    headers: parseHeaders(headersEl.value),
    body: bodyEl.value,
  };
}

function hint(text) {
  hintEl.textContent = text;
}

function refresh() {
  sendMessage({ type: "networkLog" }).then((reply) => {
    entries = reply && reply.ok ? reply.entries : [];
    const selected = capturedEl.value;
    capturedEl.textContent = "";
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = entries.length
      ? "Select one of " + entries.length + " captured requests"
      : "No captured requests yet - browse a page first";
    capturedEl.appendChild(blank);
    entries
      .slice()
      .reverse()
      .forEach((entry) => {
        const index = entries.indexOf(entry);
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent =
          "#" + (index + 1) + " " + entry.method + " " + (entry.status || "-") + " " + entry.url;
        capturedEl.appendChild(option);
      });
    if (selected && entries[Number(selected)]) capturedEl.value = selected;
    hint(entries.length + " request(s) captured. The list is kept across service-worker restarts.");
  });
}

function loadEntry() {
  if (capturedEl.value === "") return hint("Choose a captured request first.");
  const entry = entries[Number(capturedEl.value)];
  if (!entry) return hint("That request is no longer available.");
  urlEl.value = entry.url || "";
  methodEl.value = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(entry.method)
    ? entry.method
    : "GET";
  headersEl.value = formatHeaders(entry.requestHeaders);
  bodyEl.value = entry.post || "";
  hint("Loaded request #" + (Number(capturedEl.value) + 1) + ".");
}

function showResponse(result) {
  if (!result || !result.ok) {
    statusEl.textContent = "Request failed: " + ((result && result.error) || "unknown error");
    responseHeadersEl.textContent = "-";
    responseBodyEl.textContent = "-";
    return;
  }
  statusEl.textContent =
    "HTTP " + result.status + " " + (result.statusText || "") +
    (result.redirected ? " (redirected to " + result.finalUrl + ")" : "") +
    (result.truncated ? " - body truncated at 2 MB" : "");
  responseHeadersEl.textContent = (result.headers || [])
    .map(([name, value]) => name + ": " + value)
    .join("\n") || "(none)";
  responseBodyEl.textContent = result.body || "(empty body)";
}

document.getElementById("refresh").addEventListener("click", refresh);
document.getElementById("load").addEventListener("click", loadEntry);

document.getElementById("navigate").addEventListener("click", () => {
  const spec = currentSpec();
  if (!spec.url) return hint("Enter a URL first.");
  sendMessage({ type: "tamperNavigate", spec: Object.assign({}, spec, { newTab: true }) }).then((reply) => {
    hint(reply && reply.ok ? "Opened in a new tab with the edited headers." : "Navigation failed: " + ((reply && reply.error) || "unknown"));
  });
});

document.getElementById("send").addEventListener("click", () => {
  const spec = currentSpec();
  if (!spec.url) return hint("Enter a URL first.");
  statusEl.textContent = "Sending " + spec.method + " " + spec.url + "...";
  sendMessage({ type: "tamperSend", spec }).then((reply) => {
    showResponse(reply);
    hint("Sent as a background fetch.");
  });
});

document.getElementById("openurl").addEventListener("click", () => {
  const spec = currentSpec();
  if (!spec.url) return hint("Enter a URL first.");
  api.tabs.create({ url: spec.url });
});

refresh();
window.addEventListener("focus", refresh);
