/* K3ypissr NukeBar - network viewer. */
"use strict";

const api = globalThis.browser || globalThis.chrome;
const rowsEl = document.getElementById("rows");
const countEl = document.getElementById("count");
const filterEl = document.getElementById("filter");
const reqEl = document.getElementById("reqHeaders");
const resEl = document.getElementById("resHeaders");
let entries = [];

function matches(entry, needle) {
  if (!needle) return true;
  return (entry.url + " " + entry.method + " " + entry.status + " " + entry.type).toLowerCase().includes(needle);
}

function formatHeaders(headers) {
  if (!headers || !headers.length) return "(none captured)";
  return headers.map((header) => header.name + ": " + header.value).join("\n");
}

function render() {
  const needle = filterEl.value.trim().toLowerCase();
  const shown = entries.filter((entry) => matches(entry, needle)).slice().reverse();
  rowsEl.textContent = "";
  shown.forEach((entry, index) => {
    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";
    const cells = [
      String(entries.indexOf(entry) + 1),
      entry.method,
      entry.status ? String(entry.status) : "-",
      entry.type,
      entry.url,
    ];
    cells.forEach((value, cellIndex) => {
      const td = document.createElement("td");
      td.textContent = value;
      if (cellIndex === 4) td.className = "url";
      if (cellIndex === 2) td.className = entry.status >= 400 ? "status-err" : entry.status ? "status-ok" : "";
      tr.appendChild(td);
    });
    tr.addEventListener("click", () => {
      for (const other of rowsEl.children) other.classList.remove("selected");
      tr.classList.add("selected");
      reqEl.textContent = formatHeaders(entry.requestHeaders);
      resEl.textContent = formatHeaders(entry.responseHeaders);
    });
    rowsEl.appendChild(tr);
  });
  countEl.textContent = shown.length + " of " + entries.length + " requests";
}

function refresh() {
  api.runtime.sendMessage({ type: "networkLog" }, (reply) => {
    entries = reply && reply.ok ? reply.entries : [];
    render();
  });
}

document.getElementById("refresh").addEventListener("click", refresh);
document.getElementById("clear").addEventListener("click", () => {
  api.runtime.sendMessage({ type: "clearNetwork" }, refresh);
});
filterEl.addEventListener("input", render);

refresh();
setInterval(refresh, 4000);
