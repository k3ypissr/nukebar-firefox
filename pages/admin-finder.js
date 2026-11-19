/* K3ypissr NukeBar - Admin Finder.
 *
 * A plain status check is not enough: sites that answer unknown paths with a
 * themed catch-all page (SPA fallback, CMS front controller, Cloudflare
 * interstitial) return 200 for every word, and sites that redirect misses to
 * the homepage also end on 200 because fetch() follows redirects.
 *
 * So we calibrate against a random path first, then reject results that match
 * that fallback page or that land on a different path. Only confirmed hits
 * are counted and copied.
 */
"use strict";

const PRESET = [
  "admin/", "admin", "administrator/", "admin.php", "admin.html", "admin/login", "admin/login.php",
  "admin/login.html", "admin/index.php", "admin/index.html", "admin/admin.php", "admin/admin.html",
  "admin/account.php", "admin/account.html", "admin/home.php", "admin/home.html", "admin/panel",
  "admin/panel.php", "admin/dashboard", "admin/dashboard.php", "admin/dashboard.html", "admin/settings",
  "admin/settings.php", "admin/users", "admin/users.php", "admin/user", "admin/user.php",
  "admin/upload", "admin/upload.php", "admin/uploads/", "admin/backup/", "admin/db/", "admin/sql/",
  "admin/config.php", "admin/setup/", "admin/install/", "admin/maintenance/", "admin/pages/",
  "admin/modules/", "admin/plugins/", "admin/includes/", "admin/content/", "admin/media/",
  "administrator/", "administrator/index.php", "administrator/login/", "adminpanel/", "adminpanel.php",
  "admin_area/", "admin_area/admin.php", "admin_area/login.php", "admin_area/index.php",
  "adminarea/", "adminarea/index.php", "admincp/", "admincp/index.php", "adminpanel.php",
  "webadmin/", "webadmin.php", "webadmin/index.php", "siteadmin/", "siteadmin.php", "siteadmin/index.php",
  "panel/", "panel.php", "panel/index.php", "panel/login.php", "controlpanel/", "controlpanel.php",
  "cpanel/", "cpanel.php", "cp/", "cp.php", "login/", "login.php", "login.html", "signin/", "signin.php",
  "logon/", "logon.php", "user/", "user/login", "user/login.php", "users/login", "account/login",
  "members/", "members/login", "members/login.php", "member/", "member/login.php",
  "manage/", "manage.php", "manager/", "manager.php", "management/", "management.php",
  "backend/", "backend.php", "backoffice/", "backoffice.php", "dashboard/", "dashboard.php",
  "wp-admin/", "wp-admin/admin.php", "wp-admin/index.php", "wp-login.php", "wp-admin/setup-config.php",
  "phpmyadmin/", "phpmyadmin/index.php", "pma/", "myadmin/", "mysql/", "mysqladmin/", "dbadmin/",
  "webmail/", "webmail.php", "mail/", "mailadmin/", "roundcube/", "squirrelmail/",
  "administrator/components/", "administrator/manifests/", "joomla/administrator/",
  "typo3/", "typo3/index.php", "drupal/", "user/login?destination=/admin",
  "server-status", "server-info", "status", "phpinfo.php", "info.php", "test.php", "debug/",
  "console/", "shell/", "system/", "sysadmin/", "root/", "secure/", "private/", "secret/",
  "api/admin", "api/v1/admin", "api/v2/admin", "graphql", "swagger/", "swagger-ui/", "api/docs",
];

const urlEl = document.getElementById("url");
const wordlistEl = document.getElementById("wordlist");
const rowsEl = document.getElementById("rows");
const progressEl = document.getElementById("progress");
const baselineEl = document.getElementById("baseline");
const onlyInterestingEl = document.getElementById("onlyInteresting");
const hideSoftEl = document.getElementById("hideSoft");
const concurrencyEl = document.getElementById("concurrency");

let running = false;
let controller = null;
let calibration = null;
let results = [];
const found = [];

function resetWordlist() {
  wordlistEl.value = PRESET.join("\n");
}
resetWordlist();

document.getElementById("reset").addEventListener("click", resetWordlist);
document.getElementById("clear").addEventListener("click", () => {
  wordlistEl.value = "";
});
document.getElementById("file").addEventListener("change", async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  wordlistEl.value = await file.text();
});

function baseUrl() {
  let value = urlEl.value.trim();
  if (!value) return "";
  if (!/^https?:\/\//i.test(value)) value = "https://" + value;
  try {
    const parsed = new URL(value);
    // Treat the supplied URL as a directory: /shop?x=1 becomes /shop/.
    if (!parsed.pathname.endsWith("/")) parsed.pathname += "/";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch (_) {
    return "";
  }
}

/* ------------------------------------------------------------------ */
/* Response fingerprinting                                             */
/* ------------------------------------------------------------------ */

function stripTrailingSlash(value) {
  return String(value).replace(/\/+$/, "");
}

// FNV-1a: tiny, fast, and stable across runs (no crypto needed for a
// same-page comparison).
function hashText(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function pageTitle(text) {
  const match = text.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i);
  return match ? match[1].replace(/\s+/g, " ").trim().toLowerCase() : "";
}

// Strip per-request noise (nonces, CSRF tokens, hashes, timestamps) so the same
// fallback page fingerprints identically on every request.
function normalizeBody(text) {
  return text
    .replace(/[0-9a-f]{16,}/gi, "")
    .replace(/\b\d{10,}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function probe(base, word, signal) {
  const url = base + word.replace(/^\/+/, "");
  const started = performance.now();
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    redirect: "follow",
    cache: "no-store",
    signal,
    headers: { Accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
  });
  const text = await response.text();
  return {
    requestedUrl: url,
    finalUrl: response.url || url,
    redirected: !!response.redirected,
    status: response.status,
    length: text.length,
    hash: hashText(normalizeBody(text)),
    title: pageTitle(text),
    time: Math.round(performance.now() - started),
  };
}

function looksLikeFallback(result) {
  if (!calibration) return false;
  if (result.hash === calibration.hash && result.status === calibration.status) return true;
  // Same <title> and near-identical size: fallback page with volatile markup.
  return Boolean(
    result.title &&
      calibration.title &&
      result.title === calibration.title &&
      Math.abs(result.length - calibration.length) <= Math.max(64, Math.round(calibration.length * 0.02))
  );
}

function classify(result) {
  if (!result) return { kind: "error", note: "network error" };

  let target = null;
  let requested = null;
  try {
    target = new URL(result.finalUrl);
    requested = new URL(result.requestedUrl);
  } catch (_) {
    target = null;
  }

  if (target && requested) {
    const targetPath = stripTrailingSlash(target.pathname);
    const requestedPath = stripTrailingSlash(requested.pathname);
    if (targetPath !== requestedPath || target.search !== requested.search) {
      // Everything bounced to the homepage is a catch-all, not a hit.
      if ((targetPath === "" || targetPath === "/") && requestedPath !== "" && requestedPath !== "/") {
        return { kind: "soft", note: "redirects to site root (fallback)" };
      }
      return { kind: "redirect", note: "redirects to " + result.finalUrl };
    }
  }

  if (looksLikeFallback(result)) return { kind: "soft", note: "fallback page (soft 404)" };
  if (result.status === 200) return { kind: "hit", note: "" };
  if (result.status === 401 || result.status === 403) return { kind: "warn", note: "needs auth" };
  return { kind: "miss", note: "" };
}

function appendRow(result, verdict) {
  const tr = document.createElement("tr");

  const tdStatus = document.createElement("td");
  tdStatus.textContent = result ? String(result.status || "ERR") : "ERR";
  tdStatus.className =
    verdict.kind === "hit"
      ? "status-ok"
      : verdict.kind === "warn" || verdict.kind === "redirect"
        ? "status-warn"
        : verdict.kind === "soft"
          ? "status-soft"
          : "status-err";

  const tdLength = document.createElement("td");
  tdLength.textContent = result && result.length ? String(result.length) : "-";

  const tdUrl = document.createElement("td");
  tdUrl.className = "url";
  const link = document.createElement("a");
  link.href = result ? result.requestedUrl : "#";
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = result ? result.requestedUrl : "(request failed)";
  tdUrl.appendChild(link);

  const tdNote = document.createElement("td");
  tdNote.className = "note";
  tdNote.textContent = verdict.note;

  const tdTime = document.createElement("td");
  tdTime.textContent = result && result.time ? result.time + " ms" : "";

  tr.append(tdStatus, tdLength, tdUrl, tdNote, tdTime);
  rowsEl.appendChild(tr);
}

function render() {
  rowsEl.textContent = "";
  found.length = 0;
  let shown = 0;
  let soft = 0;
  for (const item of results) {
    const verdict = item.verdict;
    const interesting = verdict.kind === "hit" || verdict.kind === "warn" || verdict.kind === "redirect";
    if (verdict.kind === "soft") soft++;
    if (verdict.kind === "soft" && hideSoftEl.checked) continue;
    if (onlyInterestingEl.checked && !interesting) continue;
    appendRow(item.result, verdict);
    if (verdict.kind === "hit" && item.result) found.push(item.result.requestedUrl);
    shown++;
  }
  return { shown, soft };
}

/* ------------------------------------------------------------------ */
/* Calibration                                                         */
/* ------------------------------------------------------------------ */

async function calibrate(base, signal) {
  const random = Math.random().toString(36).slice(2, 10);
  const probes = ["__nukebar_" + random + "__", "nukebar-" + random + ".html"];
  let best = null;
  for (const word of probes) {
    let result = null;
    try {
      result = await probe(base, word, signal);
    } catch (error) {
      if (error && error.name === "AbortError") throw error;
      continue;
    }
    if (!best) best = result;
    if (result.status === 200 && result.length > 0) {
      best = result;
      break;
    }
  }
  if (!best) return null;
  return {
    url: best.requestedUrl,
    status: best.status,
    length: best.length,
    hash: best.hash,
    title: best.title,
  };
}

function describeBaseline() {
  if (!calibration) {
    baselineEl.textContent = "Baseline unavailable - fallback detection is off, results are raw status codes.";
    return;
  }
  baselineEl.textContent =
    "Baseline: HTTP " +
    calibration.status +
    ", " +
    calibration.length.toLocaleString() +
    " bytes" +
    (calibration.title ? ' ("' + calibration.title + '")' : "") +
    " - paths serving this page are marked as fallback instead of found.";
}

/* ------------------------------------------------------------------ */
/* Scan                                                                */
/* ------------------------------------------------------------------ */

function start() {
  if (running) return;
  const base = baseUrl();
  if (!base) {
    progressEl.textContent = "Enter a target URL first.";
    return;
  }
  const words = wordlistEl.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  if (!words.length) {
    progressEl.textContent = "Wordlist is empty.";
    return;
  }
  running = true;
  controller = new AbortController();
  results = [];
  found.length = 0;
  calibration = null;
  rowsEl.textContent = "";
  baselineEl.textContent = "Baseline: measuring...";
  document.getElementById("start").disabled = true;
  document.getElementById("stop").disabled = false;

  let index = 0;
  let completed = 0;
  let lastRender = 0;
  const width = Math.max(1, Math.min(24, Number(concurrencyEl.value) || 10));

  const counts = () => {
    const total = results.length || 1;
    let hits = 0;
    let soft = 0;
    let redirects = 0;
    for (const item of results) {
      if (item.verdict.kind === "hit") hits++;
      else if (item.verdict.kind === "soft") soft++;
      else if (item.verdict.kind === "redirect") redirects++;
    }
    return { hits, soft, redirects, ratio: soft / total };
  };

  const updateProgress = () => {
    const { hits, soft } = counts();
    progressEl.textContent =
      completed +
      " / " +
      words.length +
      " checked, " +
      hits +
      " found" +
      (soft ? ", " + soft + " fallback" : "");
  };

  const worker = async () => {
    while (running) {
      const current = index++;
      if (current >= words.length) return;
      let result = null;
      try {
        result = await probe(base, words[current], controller.signal);
      } catch (error) {
        if (error && error.name === "AbortError") return;
        result = null;
      }
      results.push({ result, verdict: classify(result) });
      completed++;
      if (performance.now() - lastRender > 120) {
        lastRender = performance.now();
        render();
        updateProgress();
      }
    }
  };

  (async () => {
    try {
      calibration = await calibrate(base, controller.signal);
    } catch (error) {
      calibration = null;
    }
    describeBaseline();

    await Promise.all(Array.from({ length: width }, worker));

    /* A miss page that is byte-identical across many paths is a catch-all even
       if the calibration probe was blocked (403/406/redirect). */
    const signatures = new Map();
    for (const item of results) {
      if (!item.result) continue;
      const key = item.result.hash + ":" + item.result.status;
      signatures.set(key, (signatures.get(key) || 0) + 1);
    }
    const duplicateThreshold = Math.max(4, Math.round(results.length * 0.25));
    for (const item of results) {
      if (!item.result || item.verdict.kind !== "hit") continue;
      const key = item.result.hash + ":" + item.result.status;
      const count = signatures.get(key) || 0;
      if (count >= duplicateThreshold) {
        item.verdict = { kind: "soft", note: "same page on " + count + " paths (fallback)" };
      }
    }

    const { soft } = render();
    const { hits, redirects, ratio } = counts();

    running = false;
    document.getElementById("start").disabled = false;
    document.getElementById("stop").disabled = true;

    let summary = "Done: " + completed + " checked, " + hits + " found";
    if (redirects) summary += ", " + redirects + " redirected";
    if (soft) summary += ", " + soft + " fallback pages hidden";
    summary += ".";
    if (results.length >= 20 && ratio >= 0.8) {
      summary += " This target returns the same page for unknown paths, so a bare 200 means nothing here.";
    }
    progressEl.textContent = summary;
  })();
}

document.getElementById("start").addEventListener("click", start);
document.getElementById("stop").addEventListener("click", () => {
  running = false;
  if (controller) controller.abort();
  document.getElementById("start").disabled = false;
  document.getElementById("stop").disabled = true;
});
document.getElementById("copy").addEventListener("click", async () => {
  await navigator.clipboard.writeText(found.join("\n"));
  progressEl.textContent = found.length + " URLs copied.";
});
