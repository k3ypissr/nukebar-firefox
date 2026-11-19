/* K3ypissr NukeBar - reverse IP / host lookup. */
"use strict";

const targetEl = document.getElementById("target");
const outputEl = document.getElementById("output");
const statusEl = document.getElementById("status");

async function run(mode) {
  const target = targetEl.value.trim();
  if (!target) {
    statusEl.textContent = "Enter a target first.";
    return;
  }
  statusEl.textContent = "Querying " + mode + "...";
  outputEl.textContent = "";
  const endpoint = mode === "nmap" ? "nmap" : mode;
  const url = "https://api.hackertarget.com/" + endpoint + "/?q=" + encodeURIComponent(target);
  try {
    const response = await fetch(url, { headers: { Accept: "text/plain" } });
    const text = await response.text();
    statusEl.textContent = "HTTP " + response.status;
    if (/error|api count exceeded|invalid/i.test(text) && text.length < 200) {
      statusEl.textContent = text;
    }
    outputEl.textContent = text || "(empty response)";
  } catch (error) {
    statusEl.textContent = "Request failed.";
    outputEl.textContent = String(error);
  }
}

for (const button of document.querySelectorAll("button[data-mode]")) {
  button.addEventListener("click", () => run(button.dataset.mode));
}
