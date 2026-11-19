/* K3ypissr NukeBar - POST/header replay bridge.
 * A real form submission keeps the request a main-frame navigation, so the
 * browser keeps cookies, redirects and history behavior intact. Headers are
 * injected by the background (Firefox webRequest / Chromium DNR).
 */
"use strict";

const api = globalThis.browser || globalThis.chrome;
const id = (location.hash || "").replace(/^#/, "");
const statusEl = document.getElementById("status");
const detailEl = document.getElementById("detail");
const fallback = document.getElementById("fallback");

function fail(message) {
  statusEl.textContent = "Could not replay the request.";
  detailEl.textContent = message || "";
}

function looksFormEncoded(body) {
  if (!body || /[\r\n]/.test(body)) return false;
  return body
    .split("&")
    .filter(Boolean)
    .every((pair) => pair.includes("="));
}

function submitForm(spec) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = spec.url;
  form.enctype = "application/x-www-form-urlencoded";
  form.style.display = "none";
  const params = new URLSearchParams(spec.post);
  for (const [name, value] of params.entries()) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  statusEl.textContent = "Sending POST request...";
  detailEl.textContent = spec.url;
  requestAnimationFrame(() => form.submit());
}

async function rawFallback(spec) {
  statusEl.textContent = "Sending raw body...";
  const response = await new Promise((resolve) => {
    api.runtime.sendMessage(
      {
        type: "fetchRaw",
        url: spec.url,
        method: "POST",
        body: spec.post,
        referrer: spec.referrer,
        cookie: spec.cookie,
        headers: { "Content-Type": /^[\[{<]/.test(spec.post) ? "application/json" : "text/plain;charset=UTF-8" },
      },
      resolve
    );
  });
  if (!response || !response.ok) {
    fail(response && response.error);
    return;
  }
  statusEl.textContent = "Response (raw body mode, not a navigation): HTTP " + response.status;
  const pre = document.createElement("pre");
  pre.textContent = response.text;
  document.querySelector(".box").appendChild(pre);
  fallback.classList.remove("hidden");
  document.getElementById("viewer").addEventListener("click", () => {
    api.tabs.create({ url: api.runtime.getURL("pages/viewer.html") + "#" + (response.id || "") });
  });
}

api.runtime.sendMessage({ type: "posterReady", id }, (reply) => {
  if (!reply || !reply.ok || !reply.spec) {
    fail("The request specification expired. Re-run Execute from the NukeBar panel.");
    return;
  }
  const spec = reply.spec;
  if (!spec.post) {
    // GET with custom Referer/Cookie: a same-tab navigation triggers the
    // header override registered by posterReady.
    statusEl.textContent = "Navigating...";
    detailEl.textContent = spec.url;
    location.replace(spec.url);
    return;
  }
  if (looksFormEncoded(spec.post)) submitForm(spec);
  else rawFallback(spec);
});
