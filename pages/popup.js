/* K3ypissr NukeBar - toolbar popup. */
"use strict";

const api = globalThis.browser || globalThis.chrome;
const noteEl = document.getElementById("note");

function note(text) {
  noteEl.textContent = text;
}

function activeTab() {
  return new Promise((resolve) => {
    try {
      const maybe = api.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs && tabs[0]));
      if (maybe && typeof maybe.then === "function") maybe.then((tabs) => resolve(tabs && tabs[0]), () => resolve(null));
    } catch (_) {
      resolve(null);
    }
  });
}

function sendToTab(tabId, message) {
  return new Promise((resolve) => {
    try {
      const maybe = api.tabs.sendMessage(tabId, message, (reply) => {
        const error = api.runtime.lastError;
        resolve(error ? { ok: false, error: error.message } : reply || { ok: true });
      });
      if (maybe && typeof maybe.then === "function") {
        maybe.then((reply) => resolve(reply || { ok: true }), (error) => resolve({ ok: false, error: String(error) }));
      }
    } catch (error) {
      resolve({ ok: false, error: String(error) });
    }
  });
}

async function command(message, successText) {
  const tab = await activeTab();
  if (!tab) return note("No active tab.");
  const reply = await sendToTab(tab.id, message);
  if (reply && reply.ok) {
    note(successText || "");
    if (message.type !== "hb:toggle") window.close();
  } else {
    note("The panel is not available on this page. Open a normal http(s) page first.");
  }
}

document.getElementById("toggle").addEventListener("click", () => command({ type: "hb:toggle" }, "Panel toggled."));
document.getElementById("load").addEventListener("click", () => command({ type: "hb:load" }, "Current request loaded."));
document.getElementById("execute").addEventListener("click", () => command({ type: "hb:execute" }, "Request sent."));
document.getElementById("split").addEventListener("click", () => command({ type: "hb:split" }, "URL split."));

for (const button of document.querySelectorAll("button[data-page]")) {
  button.addEventListener("click", () => {
    const page = button.dataset.page;
    api.tabs.create({ url: api.runtime.getURL("pages/" + page + ".html") });
    window.close();
  });
}
