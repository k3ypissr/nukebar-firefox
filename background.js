/* K3ypissr NukeBar - background service worker / event page. */
"use strict";

const api = globalThis.browser || globalThis.chrome;
const isFirefox = !!(api.runtime && api.runtime.getBrowserInfo);

const DEFAULT_SETTINGS = {
  openInNewTab: false,
  fontSize: 13,
  theme: "grey",
  packs: { mod: true, pro: true },
  customPayloads: [],
  prefs: {},
  proxy: { enabled: false, scheme: "http", host: "", port: 8080, bypass: "<local>" },
};

const tabState = new Map();
const networkLog = [];
const posterSpecs = new Map();
const responses = new Map();
const redirectSpecs = new Map();
const pendingOverrides = [];
const redirectChains = new Map();
let nextRuleId = 1000;

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function safe(promise) {
  return promise && typeof promise.then === "function" ? promise.catch(() => undefined) : Promise.resolve(promise);
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function decodeRequestBody(body) {
  if (!body) return "";
  try {
    if (body.formData) {
      const params = [];
      for (const [key, values] of Object.entries(body.formData)) {
        for (const value of values) params.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
      }
      return params.join("&");
    }
    if (body.raw && body.raw.length) {
      const chunks = body.raw.map((part) => {
        if (!part.bytes) return new Uint8Array();
        return new Uint8Array(part.bytes);
      });
      const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      return new TextDecoder("utf-8", { fatal: false }).decode(merged);
    }
  } catch (_) {
    /* ignore */
  }
  return "";
}

function headerValue(headers, name) {
  if (!Array.isArray(headers)) return "";
  const lower = name.toLowerCase();
  const found = headers.find((h) => String(h.name || "").toLowerCase() === lower);
  return found ? String(found.value || "") : "";
}

function setHeader(headers, name, value) {
  const lower = name.toLowerCase();
  let replaced = false;
  for (const header of headers) {
    if (String(header.name || "").toLowerCase() === lower) {
      header.value = value;
      replaced = true;
    }
  }
  if (!replaced) headers.push({ name, value });
  return headers;
}

async function getActiveTab(sender) {
  if (sender && sender.tab && sender.tab.id !== undefined) return sender.tab;
  const tabs = await safe(api.tabs.query({ active: true, currentWindow: true }));
  return tabs && tabs[0];
}

async function navigate(url, tabId, newTab) {
  if (newTab) {
    return safe(api.tabs.create({ url, active: true }));
  }
  if (tabId !== undefined && tabId !== null) {
    return safe(api.tabs.update(tabId, { url, active: true }));
  }
  const tab = await getActiveTab();
  if (tab) return safe(api.tabs.update(tab.id, { url, active: true }));
  return safe(api.tabs.create({ url, active: true }));
}

/* ------------------------------------------------------------------ */
/* Header overrides                                                    */
/* ------------------------------------------------------------------ */

// Every header the caller wants to change, in one normalized list. Referer
// and Cookie arrive as dedicated spec fields from the panel; the Tamper Data
// editor sends a generic headers array.
function headerList(spec) {
  const headers = [];
  const seen = new Set();
  const add = (name, value) => {
    const key = String(name || "").trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    headers.push({ name: String(name).trim(), value: String(value == null ? "" : value) });
  };
  if (spec && spec.referrer) add("Referer", spec.referrer);
  if (spec && spec.cookie) add("Cookie", spec.cookie);
  for (const header of (spec && spec.headers) || []) {
    if (!header) continue;
    add(header.name, header.value);
  }
  return headers;
}

// Chromium refuses to modify these through declarativeNetRequest; attempting
// to set one makes the whole rule fail, so drop them before building the rule.
const DNR_BLOCKED_HEADERS = /^(host|connection|content-length|content-encoding|transfer-encoding|upgrade|te|trailer|keep-alive|proxy-|sec-|accept-encoding)$/i;

if (isFirefox) {
  // Real header control for Firefox MV3 (webRequestBlocking is still
  // supported there). Used for POST/Referer/Cookie replay and viewer fetches.
  api.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
      const now = Date.now();
      for (let i = pendingOverrides.length - 1; i >= 0; i--) {
        if (pendingOverrides[i].expires < now) pendingOverrides.splice(i, 1);
      }
      const override = pendingOverrides.find(
        (entry) =>
          entry.url === details.url &&
          (entry.tabId === undefined || entry.tabId === details.tabId) &&
          entry.expires > now
      );
      if (!override) return undefined;
      const headers = details.requestHeaders || [];
      for (const header of override.headers || []) setHeader(headers, header.name, header.value);
      return { requestHeaders: headers };
    },
    { urls: ["<all_urls>"] },
    ["blocking", "requestHeaders"]
  );
}

function firefoxOverride(tabId, url, spec) {
  if (!isFirefox) return;
  pendingOverrides.push({
    tabId,
    url: requestUrl(url),
    headers: headerList(spec),
    expires: Date.now() + 30000,
  });
}

// A network request never carries the URL fragment, so a rule anchored on the
// full URL would fail to match "https://x/page#frag". Match the request form.
function requestUrl(url) {
  const text = String(url || "");
  const hash = text.indexOf("#");
  return hash === -1 ? text : text.slice(0, hash);
}

async function chromeHeaderRule(tabId, url, spec, resourceTypes) {
  if (isFirefox || !api.declarativeNetRequest) return false;
  const requestHeaders = [];
  for (const header of headerList(spec)) {
    const name = header.name.toLowerCase();
    if (DNR_BLOCKED_HEADERS.test(name)) continue;
    requestHeaders.push({ header: name, operation: "set", value: header.value });
  }
  if (!requestHeaders.length) return true;
  const id = nextRuleId++;
  const condition = {
    resourceTypes: resourceTypes || ["main_frame"],
    regexFilter: "^" + requestUrl(url).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$",
  };
  if (tabId !== undefined && tabId !== null && tabId >= 0) condition.tabIds = [tabId];
  try {
    await api.declarativeNetRequest.updateSessionRules({
      addRules: [
        {
          id,
          priority: 1,
          action: { type: "modifyHeaders", requestHeaders },
          condition,
        },
      ],
    });
    setTimeout(() => {
      safe(api.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id] }));
    }, 30000);
    return true;
  } catch (error) {
    console.warn("[NukeBar] DNR rule failed", error);
    return false;
  }
}

// Returns a promise that settles once the header override is actually in
// place. Navigation waits for it, so a GET with custom headers goes straight
// to the target instead of detouring through an extension page.
function prepareOverride(tabId, url, spec, resourceTypes) {
  if (isFirefox) {
    firefoxOverride(tabId, url, spec);
    return Promise.resolve(true);
  }
  return chromeHeaderRule(tabId, url, spec, resourceTypes);
}

/* ------------------------------------------------------------------ */
/* Network observation                                                 */
/* ------------------------------------------------------------------ */

function remember(tabId, patch) {
  const current = tabState.get(tabId) || {};
  tabState.set(tabId, Object.assign({}, current, patch, { updated: Date.now() }));
}

// MV3 service workers are shut down after ~30 seconds of inactivity, which
// used to wipe the captured request list while the network viewer was open.
// Mirror it into storage.session and restore it on the next wake-up.
function persistNetworkLog() {
  try {
    const result = api.storage.session.set({ hb_network_log: networkLog.slice(-400) });
    if (result && typeof result.catch === "function") result.catch(() => undefined);
  } catch (_) {
    /* session storage unavailable */
  }
}

function restoreNetworkLog() {
  try {
    const result = api.storage.session.get("hb_network_log");
    if (!result || typeof result.then !== "function") return Promise.resolve();
    return result
      .then((stored) => {
        const saved = stored && stored.hb_network_log;
        if (!Array.isArray(saved) || !saved.length) return;
        const known = new Set(networkLog.map((entry) => entry.time + "|" + entry.url));
        const missing = saved.filter((entry) => entry && !known.has(entry.time + "|" + entry.url));
        if (!missing.length) return;
        networkLog.unshift(...missing);
        networkLog.sort((a, b) => (a.time || 0) - (b.time || 0));
        while (networkLog.length > 400) networkLog.shift();
      })
      .catch(() => undefined);
  } catch (_) {
    /* session storage unavailable */
    return Promise.resolve();
  }
}
const networkReady = restoreNetworkLog();

try {
  api.webRequest.onBeforeRequest.addListener(
    (details) => {
      if (details.tabId < 0) return;
      const post = decodeRequestBody(details.requestBody);
      if (details.type === "main_frame") {
        remember(details.tabId, { url: details.url, post: post || "", referrer: "", cookie: "", requestId: details.requestId });
        if (networkLog.length > 400) networkLog.shift();
        networkLog.push({
          time: Date.now(),
          tabId: details.tabId,
          method: details.method,
          url: details.url,
          type: details.type,
          post: post || "",
          status: 0,
        });
        persistNetworkLog();
      }
    },
    { urls: ["<all_urls>"] },
    ["requestBody"]
  );
} catch (error) {
  console.warn("[NukeBar] onBeforeRequest unavailable", error);
}

try {
  api.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
      if (details.tabId < 0) return;
      if (details.type === "main_frame") {
        remember(details.tabId, {
          referrer: headerValue(details.requestHeaders, "referer"),
          cookie: headerValue(details.requestHeaders, "cookie"),
          url: details.url,
        });
      }
      const entry = networkLog.find((item) => item.url === details.url && item.tabId === details.tabId && !item.requestHeaders);
      if (entry) {
        entry.requestHeaders = (details.requestHeaders || []).map((h) => ({ name: h.name, value: h.value }));
        persistNetworkLog();
      }
    },
    { urls: ["<all_urls>"] },
    ["requestHeaders"]
  );
} catch (error) {
  console.warn("[NukeBar] onBeforeSendHeaders unavailable", error);
}

try {
  api.webRequest.onHeadersReceived.addListener(
    (details) => {
      if (details.tabId < 0) return;
      const entry = [...networkLog].reverse().find((item) => item.url === details.url && item.tabId === details.tabId);
      if (entry) {
        entry.status = details.statusCode || 0;
        entry.responseHeaders = (details.responseHeaders || []).map((h) => ({ name: h.name, value: h.value }));
        persistNetworkLog();
      }
    },
    { urls: ["<all_urls>"] },
    ["responseHeaders"]
  );
} catch (error) {
  console.warn("[NukeBar] onHeadersReceived unavailable", error);
}

// Record every redirect hop per tab. Chromium hides redirect targets from
// fetch() (opaqueredirect), so this observation is what the NoRedirect viewer
// displays.
try {
  api.webRequest.onBeforeRedirect.addListener(
    (details) => {
      if (details.tabId < 0) return;
      const chain = redirectChains.get(details.tabId) || { hops: [] };
      chain.hops.push({
        status: details.statusCode || 0,
        from: details.url,
        to: details.redirectUrl || "",
        at: Date.now(),
      });
      if (chain.hops.length > 30) chain.hops.shift();
      chain.updated = Date.now();
      redirectChains.set(details.tabId, chain);
      remember(details.tabId, { redirects: chain.hops.slice() });
    },
    { urls: ["<all_urls>"] }
  );
} catch (error) {
  console.warn("[NukeBar] onBeforeRedirect unavailable", error);
}

/* ------------------------------------------------------------------ */
/* Execute / poster                                                    */
/* ------------------------------------------------------------------ */

function normalizeUrl(raw) {
  let url = String(raw || "").replace(/[\r\n]+/g, "").trim();
  if (!url) return "";
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url) && !/^(about|data|file|view-source|javascript):/i.test(url)) {
    url = "http://" + url;
  }
  return url;
}

// Navigates without a detour through an extension page. The header override
// is installed first and awaited, so Chromium already has the DNR rule when
// the navigation starts.
async function navigateWithHeaders(url, tabId, spec) {
  const headers = headerList(spec);
  const newTab = !!(spec && spec.newTab);
  if (!headers.length) return navigate(url, tabId, newTab);

  let targetId = tabId;
  if (newTab || targetId === undefined || targetId === null) {
    const created = await safe(api.tabs.create({ url: "about:blank", active: true }));
    targetId = created && created.id;
  }
  if (targetId !== undefined && targetId !== null) {
    await prepareOverride(targetId, url, spec, ["main_frame"]);
    return safe(api.tabs.update(targetId, { url, active: true }));
  }
  return safe(api.tabs.create({ url, active: true }));
}

async function execute(spec, sender) {
  const url = normalizeUrl(spec.url);
  if (!url) return { ok: false, error: "empty url" };
  const tab = await getActiveTab(sender);

  if (spec.viewer) {
    return fetchToViewer({
      url,
      post: spec.post,
      referrer: spec.referrer,
      cookie: spec.cookie,
      headers: spec.headers,
      method: spec.post ? "POST" : "GET",
    });
  }

  // A GET (with or without Referer/Cookie/extra headers) can navigate
  // directly; only POST needs the form-posting bridge page.
  if (!spec.post) {
    await navigateWithHeaders(url, tab && tab.id, spec);
    return { ok: true, mode: "navigate" };
  }

  const id = uid();
  const payload = {
    url,
    post: spec.post || "",
    referrer: spec.referrer || "",
    cookie: spec.cookie || "",
    headers: Array.isArray(spec.headers) ? spec.headers : [],
    newTab: !!spec.newTab,
  };
  posterSpecs.set(id, payload);
  try {
    await api.storage.session.set({ ["hb_poster_" + id]: payload });
  } catch (_) {
    /* session storage optional */
  }
  const posterUrl = api.runtime.getURL("pages/poster.html") + "#" + id;
  await navigate(posterUrl, tab && tab.id, spec.newTab);
  return { ok: true, mode: "poster" };
}

async function fetchToViewer(spec) {
  const url = normalizeUrl(spec.url);
  const method = spec.method || (spec.post ? "POST" : "GET");
  const headers = {};
  let body;
  if (spec.post) {
    body = spec.post;
    headers["Content-Type"] = spec.contentType || "application/x-www-form-urlencoded";
  }
  for (const header of headerList(spec)) {
    const name = header.name.toLowerCase();
    // fetch() forbids these; they are installed through the override instead.
    if (/^(cookie|host|content-length|referer|connection|accept-encoding)$/i.test(name)) continue;
    headers[header.name] = header.value;
  }
  await prepareOverride(
    -1,
    url,
    { referrer: spec.referrer, cookie: spec.cookie, headers: spec.headers },
    ["xmlhttprequest"]
  );
  let response;
  let text = "";
  let error = "";
  try {
    response = await fetch(url, {
      method,
      headers,
      body,
      credentials: "include",
      redirect: spec.redirect || "follow",
      referrer: spec.referrer || undefined,
    });
    const buffer = await response.arrayBuffer();
    const max = 6 * 1024 * 1024;
    const slice = buffer.byteLength > max ? buffer.slice(0, max) : buffer;
    text = new TextDecoder("utf-8", { fatal: false }).decode(slice);
    if (buffer.byteLength > max) text += "\n\n/* [NukeBar] response truncated at 6 MB */";
  } catch (fetchError) {
    error = fetchError && fetchError.message ? fetchError.message : String(fetchError);
  }

  const id = uid();
  const result = {
    id,
    url,
    finalUrl: response ? response.url : url,
    status: response ? response.status : 0,
    statusText: response ? response.statusText : "",
    ok: response ? response.ok : false,
    redirected: response ? response.redirected : false,
    headers: response ? [...response.headers.entries()] : [],
    body: text,
    error,
    method,
    at: Date.now(),
  };
  responses.set(id, result);
  try {
    await api.storage.session.set({ ["hb_response_" + id]: result });
  } catch (_) {
    /* optional */
  }
  await safe(api.tabs.create({ url: api.runtime.getURL("pages/viewer.html") + "#" + id, active: true }));
  return { ok: !error, id };
}

async function sessionSet(key, value) {
  try {
    await api.storage.session.set({ [key]: value });
  } catch (_) {
    /* session storage optional */
  }
}

/* ------------------------------------------------------------------ */
/* Tools helpers                                                       */
/* ------------------------------------------------------------------ */

async function openRedirectViewer(tab) {
  if (!tab) return { ok: false, error: "no active tab" };
  const chain = redirectChains.get(tab.id) || (tabState.get(tab.id) || {}).redirects || [];
  const hops = Array.isArray(chain) ? chain.slice() : chain.hops || [];
  const id = uid();
  const info = { id, url: tab.url || "", hops, at: Date.now() };
  redirectSpecs.set(id, info);
  await sessionSet("hb_redirect_" + id, info);
  await safe(api.tabs.create({ url: api.runtime.getURL("pages/redirects.html") + "#" + id, active: true }));
  return { ok: true, id };
}

async function latestResponse() {
  let best = null;
  for (const [id, value] of responses) {
    const at = (value && value.at) || 0;
    if (!best || at >= best.at) best = { id, at, value };
  }
  try {
    const all = await api.storage.session.get(null);
    for (const [key, value] of Object.entries(all || {})) {
      if (!key.startsWith("hb_response_")) continue;
      const at = (value && value.at) || 0;
      if (!best || at >= best.at) best = { id: key.slice("hb_response_".length), at, value };
    }
  } catch (_) {
    /* session storage unavailable */
  }
  return best ? best.value : null;
}

const FETCH_FORBIDDEN = /^(cookie|host|content-length|connection|referer|origin|accept-encoding)$/i;

async function tamperFetch(spec) {
  const url = normalizeUrl(spec.url);
  if (!url) return { ok: false, error: "empty url" };
  const method = String(spec.method || "GET").toUpperCase();
  const headers = {};
  let referrer;
  for (const header of spec.headers || []) {
    const name = String((header && header.name) || "").trim();
    if (!name) continue;
    if (/^referer$/i.test(name)) referrer = String(header.value || "");
    else if (!FETCH_FORBIDDEN.test(name)) headers[name] = String(header.value == null ? "" : header.value);
  }
  let body;
  if (method !== "GET" && method !== "HEAD" && spec.body) {
    body = String(spec.body);
    if (!Object.keys(headers).some((name) => name.toLowerCase() === "content-type")) {
      headers["Content-Type"] = /^[\[{<]/.test(body) ? "application/json" : "application/x-www-form-urlencoded";
    }
  }
  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      credentials: "include",
      redirect: spec.follow === false ? "manual" : "follow",
      referrer: referrer || undefined,
    });
    const max = 2 * 1024 * 1024;
    const buffer = await response.arrayBuffer();
    const slice = buffer.byteLength > max ? buffer.slice(0, max) : buffer;
    return {
      ok: true,
      status: response.status,
      statusText: response.statusText,
      finalUrl: response.url,
      redirected: response.redirected,
      headers: [...response.headers.entries()],
      body: new TextDecoder("utf-8", { fatal: false }).decode(slice),
      truncated: buffer.byteLength > max,
    };
  } catch (error) {
    return { ok: false, error: error && error.message ? error.message : String(error) };
  }
}

function contentSettingPattern(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.protocol + "//" + parsed.host + "/*";
    }
    if (parsed.protocol === "file:") return "file:///*";
  } catch (_) {
    /* invalid URL */
  }
  return "";
}

/* ------------------------------------------------------------------ */
/* Messaging                                                           */
/* ------------------------------------------------------------------ */

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;
  const reply = (value) => {
    try {
      sendResponse(value);
    } catch (_) {
      /* channel closed */
    }
  };

  (async () => {
    switch (message.type) {
      case "execute": {
        reply(await execute(message.spec || {}, sender));
        return;
      }
      case "navigate": {
        const tab = await getActiveTab(sender);
        await navigate(normalizeUrl(message.url), tab && tab.id, message.newTab);
        reply({ ok: true });
        return;
      }
      case "openTab": {
        await safe(api.tabs.create({ url: message.url, active: true }));
        reply({ ok: true });
        return;
      }
      case "tabInfo": {
        const tab = await getActiveTab(sender);
        if (!tab) return reply({ ok: false });
        const state = tabState.get(tab.id) || {};
        let cookie = state.cookie || "";
        if (!cookie) {
          try {
            const jar = await safe(api.cookies.getAll({ url: tab.url }));
            if (Array.isArray(jar)) cookie = jar.map((c) => c.name + "=" + c.value).join("; ");
          } catch (_) {
            /* cookies permission missing */
          }
        }
        reply({ ok: true, url: tab.url || state.url || "", referrer: state.referrer || "", post: state.post || "", cookie });
        return;
      }
      case "posterReady": {
        let spec = posterSpecs.get(message.id);
        if (!spec) {
          try {
            const stored = await api.storage.session.get("hb_poster_" + message.id);
            spec = stored && stored["hb_poster_" + message.id];
          } catch (_) {
            /* ignore */
          }
        }
        if (!spec) return reply({ ok: false });
        if (sender.tab && sender.tab.id !== undefined) {
          await prepareOverride(sender.tab.id, spec.url, spec, ["main_frame"]);
        }
        reply({ ok: true, spec });
        return;
      }
      case "fetchRaw": {
        const tab = sender.tab;
        if (tab) {
          await prepareOverride(
            tab.id,
            message.url,
            { referrer: message.referrer, cookie: message.cookie, headers: message.extraHeaders },
            ["xmlhttprequest"]
          );
        }
        try {
          const response = await fetch(message.url, {
            method: message.method || "POST",
            headers: message.headers || {},
            body: message.body,
            credentials: "include",
            referrer: message.referrer || undefined,
          });
          const text = await response.text();
          reply({ ok: true, status: response.status, text });
        } catch (error) {
          reply({ ok: false, error: String(error) });
        }
        return;
      }
      case "getResponse": {
        let value = responses.get(message.id);
        if (!value) {
          try {
            const stored = await api.storage.session.get("hb_response_" + message.id);
            value = stored && stored["hb_response_" + message.id];
          } catch (_) {
            /* ignore */
          }
        }
        reply({ ok: !!value, response: value });
        return;
      }
      case "networkLog": {
        await networkReady;
        reply({
          ok: true,
          entries: networkLog.slice(-400).map((entry) => ({
            time: entry.time,
            tabId: entry.tabId,
            method: entry.method,
            url: entry.url,
            type: entry.type,
            status: entry.status,
            post: entry.post || "",
            requestHeaders: entry.requestHeaders || [],
            responseHeaders: entry.responseHeaders || [],
          })),
        });
        return;
      }
      case "clearNetwork": {
        networkLog.length = 0;
        persistNetworkLog();
        reply({ ok: true });
        return;
      }
      case "viewSource": {
        const tab = await getActiveTab(sender);
        if (!tab) return reply({ ok: false });
        reply(await fetchToViewer({ url: tab.url, method: "GET" }));
        return;
      }
      case "openViewer": {
        let id = message.id;
        if (!id) {
          const latest = await latestResponse();
          id = latest && latest.id;
        }
        await safe(api.tabs.create({ url: api.runtime.getURL("pages/viewer.html") + (id ? "#" + id : ""), active: true }));
        reply({ ok: true, id: id || "" });
        return;
      }
      case "latestResponse": {
        const value = await latestResponse();
        reply({ ok: !!value, response: value });
        return;
      }
      case "noRedirect":
      case "toggleNoRedirect": {
        const tab = await getActiveTab(sender);
        if (!tab) return reply({ ok: false });
        // Chromium does not expose a redirect's target to fetch(); display the
        // hop chain observed by webRequest instead.
        reply(await openRedirectViewer(tab));
        return;
      }
      case "redirectInfo": {
        let info = redirectSpecs.get(message.id);
        if (!info) {
          try {
            const stored = await api.storage.session.get("hb_redirect_" + message.id);
            info = stored && stored["hb_redirect_" + message.id];
          } catch (_) {
            /* ignore */
          }
        }
        reply({ ok: !!info, info });
        return;
      }
      case "redirectTest": {
        const url = normalizeUrl(message.url);
        if (!url) return reply({ ok: false, error: "empty url" });
        try {
          const response = await fetch(url, { method: "GET", credentials: "include", redirect: "follow" });
          reply({
            ok: true,
            status: response.status,
            statusText: response.statusText,
            finalUrl: response.url,
            redirected: response.redirected,
          });
        } catch (error) {
          reply({ ok: false, error: error && error.message ? error.message : String(error) });
        }
        return;
      }
      case "tamperSend": {
        reply(await tamperFetch(message.spec || {}));
        return;
      }
      case "tamperNavigate": {
        const spec = message.spec || {};
        const url = normalizeUrl(spec.url);
        if (!url) return reply({ ok: false, error: "empty url" });
        const tab = await getActiveTab(sender);
        await navigateWithHeaders(url, tab && tab.id, {
          headers: spec.headers || [],
          referrer: spec.referrer || "",
          cookie: spec.cookie || "",
          newTab: spec.newTab !== false,
        });
        reply({ ok: true });
        return;
      }
      case "toggleJs": {
        const tab = await getActiveTab(sender);
        if (!tab) return reply({ ok: false });
        if (!api.contentSettings || !api.contentSettings.javascript) {
          return reply({ ok: false, error: "JavaScript toggling is only available in Chromium-based browsers." });
        }
        // contentSettings needs a match pattern; passing a full URL fails.
        const pattern = contentSettingPattern(tab.url);
        if (!pattern) return reply({ ok: false, error: "This page has no toggleable JavaScript setting." });
        try {
          const current = await new Promise((resolve) => {
            api.contentSettings.javascript.get({ primaryUrl: tab.url }, (details) => resolve(details));
          });
          const next = current && current.setting === "allow" ? "block" : "allow";
          await new Promise((resolve, reject) => {
            api.contentSettings.javascript.set({ primaryPattern: pattern, setting: next }, () => {
              const error = api.runtime.lastError;
              if (error) reject(new Error(error.message));
              else resolve();
            });
          });
          await safe(api.tabs.reload(tab.id));
          reply({ ok: true, setting: next, pattern });
        } catch (error) {
          reply({ ok: false, error: String(error) });
        }
        return;
      }
      case "getSettings": {
        const stored = await api.storage.local.get("settings");
        reply({ ok: true, settings: Object.assign({}, DEFAULT_SETTINGS, (stored && stored.settings) || {}) });
        return;
      }
      case "saveSettings": {
        const stored = await api.storage.local.get("settings");
        const merged = Object.assign({}, DEFAULT_SETTINGS, (stored && stored.settings) || {}, message.settings || {});
        await api.storage.local.set({ settings: merged });
        reply({ ok: true, settings: merged });
        return;
      }
      case "applyProxy": {
        if (!api.proxy || !api.proxy.settings) {
          return reply({ ok: false, error: "Proxy API unavailable (Firefox requires about:preferences)." });
        }
        const proxy = message.proxy || {};
        try {
          if (proxy.enabled) {
            await new Promise((resolve) =>
              api.proxy.settings.set(
                {
                  value: {
                    mode: "fixed_servers",
                    rules: {
                      singleProxy: {
                        scheme: proxy.scheme || "http",
                        host: proxy.host,
                        port: Number(proxy.port) || 8080,
                      },
                      bypassList: String(proxy.bypass || "").split(/[,\s]+/).filter(Boolean),
                    },
                  },
                  scope: "regular",
                },
                resolve
              )
            );
          } else {
            await new Promise((resolve) => api.proxy.settings.clear({ scope: "regular" }, resolve));
          }
          reply({ ok: true });
        } catch (error) {
          reply({ ok: false, error: String(error) });
        }
        return;
      }
      default:
        reply({ ok: false, error: "unknown message " + message.type });
    }
  })().catch((error) => reply({ ok: false, error: String(error) }));

  return true;
});

/* ------------------------------------------------------------------ */
/* Context menus, install defaults                                      */
/* ------------------------------------------------------------------ */

async function ensureMenus() {
  if (!api.contextMenus) return;
  try {
    await safe(api.contextMenus.removeAll());
    api.contextMenus.create({ id: "hb-send-selection", title: "Send selection to K3ypissr NukeBar", contexts: ["selection"] });
    api.contextMenus.create({ id: "hb-send-link", title: "Send link to K3ypissr NukeBar", contexts: ["link"] });
    api.contextMenus.create({ id: "hb-toggle", title: "Show/hide K3ypissr NukeBar", contexts: ["page", "frame"] });
    api.contextMenus.create({ id: "hb-view-source", title: "K3ypissr NukeBar: view source", contexts: ["page"] });
  } catch (error) {
    console.warn("[NukeBar] context menus", error);
  }
}

if (api.contextMenus && api.contextMenus.onClicked) {
  api.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab || tab.id === undefined) return;
    if (info.menuItemId === "hb-send-link") {
      await safe(api.tabs.sendMessage(tab.id, { type: "hb:setField", field: "url", text: info.linkUrl || "" }));
    } else if (info.menuItemId === "hb-send-selection") {
      await safe(api.tabs.sendMessage(tab.id, { type: "hb:insert", text: info.selectionText || "" }));
    } else if (info.menuItemId === "hb-toggle") {
      await safe(api.tabs.sendMessage(tab.id, { type: "hb:toggle" }));
    } else if (info.menuItemId === "hb-view-source") {
      await safe(api.tabs.sendMessage(tab.id, { type: "hb:toggle" }));
    }
  });
}

api.runtime.onInstalled.addListener(async () => {
  const stored = await api.storage.local.get("settings");
  if (!stored || !stored.settings) await api.storage.local.set({ settings: DEFAULT_SETTINGS });
  ensureMenus();
});

api.runtime.onStartup && api.runtime.onStartup.addListener(ensureMenus);
