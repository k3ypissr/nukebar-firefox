/* K3ypissr NukeBar - options page. */
"use strict";

const api = globalThis.browser || globalThis.chrome;

const DEFAULT_SETTINGS = {
  openInNewTab: false,
  fontSize: 12,
  theme: "grey",
  reopenPanel: false,
  packs: { mod: true, pro: true },
  customPayloads: [],
  prefs: {},
  proxy: { enabled: false, scheme: "http", host: "", port: 8080, bypass: "<local>" },
};

function defaultPrefs() {
  const prefs = {};
  for (let i = 1; i <= 10; i++) {
    prefs["extensions.hackbar.Dios.Dios " + i] = "Dios " + i;
    prefs["extensions.hackbar.query.query " + i] = "query " + i;
    prefs["extensions.hackbar.XSS.XSS " + i] = "XSS " + i;
  }
  return prefs;
}

function send(message) {
  return new Promise((resolve) => {
    try {
      const maybe = api.runtime.sendMessage(message, (reply) => resolve(reply || {}));
      if (maybe && typeof maybe.then === "function") maybe.then((reply) => resolve(reply || {}), () => resolve({}));
    } catch (_) {
      resolve({});
    }
  });
}

const $ = (id) => document.getElementById(id);
const statusEl = $("status");
let settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
settings.prefs = defaultPrefs();
let prefs = defaultPrefs();

function setStatus(text, error) {
  statusEl.textContent = text;
  statusEl.style.color = error ? "#9c1b1b" : "#316b31";
}

/* ------------------------------ tabs ------------------------------ */

function activateTab(name) {
  for (const button of document.querySelectorAll("#tabs button")) {
    button.classList.toggle("active", button.dataset.tab === name);
  }
  for (const section of document.querySelectorAll("section[id^='tab-']")) {
    section.classList.toggle("hidden", section.id !== "tab-" + name);
  }
}

for (const button of document.querySelectorAll("#tabs button")) {
  button.addEventListener("click", () => activateTab(button.dataset.tab));
}

/* --------------------------- pref inputs --------------------------- */

function buildPrefGrid(hostId, prefix, keys) {
  const host = $(hostId);
  host.textContent = "";
  keys.forEach((key, index) => {
    const label = document.createElement("label");
    label.textContent = prefix + " " + (index + 1);
    label.htmlFor = "pref-" + key.replace(/[^a-z0-9]+/gi, "-");
    const input = document.createElement("input");
    input.type = "text";
    input.id = label.htmlFor;
    input.dataset.prefKey = key;
    input.spellcheck = false;
    host.append(label, input);
  });
}

function prefKeys() {
  const dios = [];
  const query = [];
  const xss = [];
  for (let i = 1; i <= 10; i++) {
    dios.push("extensions.hackbar.Dios.Dios " + i);
    query.push("extensions.hackbar.query.query " + i);
    xss.push("extensions.hackbar.XSS.XSS " + i);
  }
  return { dios, query, xss };
}

const keys = prefKeys();
buildPrefGrid("grid-dios", "Dios", keys.dios);
buildPrefGrid("grid-query", "Query", keys.query);
buildPrefGrid("grid-xss", "XSS", keys.xss);

/* --------------------------- custom payloads --------------------------- */

function customToText(list) {
  return (list || []).map((entry) => entry.label + " | " + (entry.text || "")).join("\n");
}

function textToCustom(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const index = line.indexOf("|");
      if (index === -1) return { label: line, text: line };
      return { label: line.slice(0, index).trim(), text: line.slice(index + 1).trim() };
    });
}

$("customExample").addEventListener("click", () => {
  const area = $("custom");
  const example = "My UNION probe | ' UNION SELECT 1,2,3-- -\nTime based | ' AND SLEEP(5)-- -";
  area.value = area.value ? area.value.replace(/\s*$/, "\n") + example : example;
  updateCustomCount();
});

function updateCustomCount() {
  const count = textToCustom($("custom").value).length;
  $("customCount").textContent = count + " custom item(s)";
}

$("custom").addEventListener("input", updateCustomCount);

/* ------------------------------ loading ------------------------------ */

function applyToForm() {
  $("theme").value = settings.theme === "dark" ? "dark" : "grey";
  $("fontSize").value = settings.fontSize || 12;
  $("openInNewTab").checked = !!settings.openInNewTab;
  $("panelOpen").checked = !!settings.reopenPanel;
  $("packPro").checked = !settings.packs || settings.packs.pro !== false;
  $("packMod").checked = !settings.packs || settings.packs.mod !== false;

  prefs = Object.assign(defaultPrefs(), settings.prefs || {});
  for (const input of document.querySelectorAll("input[data-pref-key]")) {
    input.value = prefs[input.dataset.prefKey] || "";
  }

  $("custom").value = customToText(settings.customPayloads);
  updateCustomCount();

  const proxy = settings.proxy || DEFAULT_SETTINGS.proxy;
  $("proxyEnabled").checked = !!proxy.enabled;
  $("proxyScheme").value = proxy.scheme || "http";
  $("proxyHost").value = proxy.host || "";
  $("proxyPort").value = proxy.port || 8080;
  $("proxyBypass").value = proxy.bypass || "<local>";

  if (!api.proxy || !api.proxy.settings) {
    const note = $("proxyUnavailable");
    note.style.display = "block";
    note.textContent = "Proxy control is not available in this browser or build.";
    $("proxyApply").disabled = true;
  }
}

async function load() {
  const reply = await send({ type: "getSettings" });
  if (reply && reply.ok && reply.settings) {
    settings = Object.assign({}, DEFAULT_SETTINGS, reply.settings);
    settings.packs = Object.assign({ mod: true, pro: true }, settings.packs || {});
  }
  applyToForm();
  const params = new URLSearchParams(location.search);
  const tab = params.get("tab");
  if (tab) activateTab(tab);
}

/* ------------------------------ saving ------------------------------ */

function collect() {
  const nextPrefs = {};
  for (const input of document.querySelectorAll("input[data-pref-key]")) {
    nextPrefs[input.dataset.prefKey] = input.value;
  }
  const proxy = {
    enabled: $("proxyEnabled").checked,
    scheme: $("proxyScheme").value,
    host: $("proxyHost").value.trim(),
    port: Number($("proxyPort").value) || 8080,
    bypass: $("proxyBypass").value,
  };
  return {
    theme: $("theme").value,
    fontSize: Number($("fontSize").value) || 12,
    openInNewTab: $("openInNewTab").checked,
    reopenPanel: $("panelOpen").checked,
    packs: { pro: $("packPro").checked, mod: $("packMod").checked },
    customPayloads: textToCustom($("custom").value),
    prefs: nextPrefs,
    proxy,
  };
}

async function save() {
  settings = Object.assign({}, settings, collect());
  const reply = await send({ type: "saveSettings", settings });
  if (reply && reply.ok) {
    setStatus("Saved.");
    setTimeout(() => setStatus(""), 2500);
  } else {
    setStatus("Could not save: " + ((reply && reply.error) || "unknown error"), true);
  }
}

$("save").addEventListener("click", save);

$("reset").addEventListener("click", async () => {
  settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  settings.prefs = defaultPrefs();
  applyToForm();
  await send({ type: "saveSettings", settings });
  setStatus("Reset to defaults.");
  setTimeout(() => setStatus(""), 2500);
});

$("proxyApply").addEventListener("click", async () => {
  const proxy = collect().proxy;
  $("proxyStatus").textContent = "Applying...";
  const reply = await send({ type: "applyProxy", proxy });
  if (reply && reply.ok) {
    $("proxyStatus").textContent = proxy.enabled ? "Proxy enabled." : "Proxy cleared.";
    settings.proxy = proxy;
    await send({ type: "saveSettings", settings });
  } else {
    $("proxyStatus").textContent = "Failed: " + ((reply && reply.error) || "unknown error");
  }
});

/* --------------------------- pack statistics --------------------------- */

(async () => {
  try {
    const response = await fetch(api.runtime.getURL("content/generated/payloads.json"));
    if (!response.ok) return;
    const data = await response.json();
    const counts = data.counts || {};
    const rows = [];
    for (const [label, key] of [["HackBar v2.9 (Pro)", "pro"], ["k3ypissr (Mod)", "mod"]]) {
      const value = counts[key] || {};
      rows.push(
        "<tr><td>" + label + "</td><td>" + (value.menus || 0) + "</td><td>" + (value.items || 0) +
          "</td><td>" + (value.withHandler || 0) + "</td></tr>"
      );
      const target = key === "pro" ? $("countPro") : $("countMod");
      if (target) target.textContent = (value.items || 0).toLocaleString() + " menu items, " + (value.menus || 0) + " menus";
    }
    document.querySelector("#packStats tbody").innerHTML = rows.join("");
  } catch (_) {
    /* statistics are optional */
  }
})();

load();
