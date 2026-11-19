/* K3ypissr NukeBar - local codec toolkit. */
"use strict";

const input = document.getElementById("input");
const output = document.getElementById("output");
const hint = document.getElementById("hint");

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(text) {
  const binary = atob(text.replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function htmlDecode(text) {
  const area = document.createElement("textarea");
  area.innerHTML = text;
  return area.value;
}

function htmlEncode(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

async function hash(algo, text) {
  const buffer = await crypto.subtle.digest(algo, new TextEncoder().encode(text));
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const operations = {
  "url-encode": (text) => encodeURIComponent(text),
  "url-decode": (text) => {
    try {
      return decodeURIComponent(text.replace(/\+/g, " "));
    } catch (_) {
      return unescape(text);
    }
  },
  "b64-encode": (text) => bytesToBase64(new TextEncoder().encode(text)),
  "b64-decode": (text) => new TextDecoder().decode(base64ToBytes(text)),
  "hex-encode": (text) =>
    [...new TextEncoder().encode(text)].map((b) => b.toString(16).padStart(2, "0")).join(""),
  "hex-decode": (text) => {
    const clean = text.replace(/0x/gi, "").replace(/[^0-9a-f]/gi, "");
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
    return new TextDecoder().decode(bytes);
  },
  "bin-encode": (text) =>
    [...new TextEncoder().encode(text)].map((b) => b.toString(2).padStart(8, "0")).join(" "),
  "bin-decode": (text) => {
    const clean = text.replace(/0b/gi, "").replace(/[^01]/g, "");
    const bytes = new Uint8Array(Math.floor(clean.length / 8));
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.substr(i * 8, 8), 2);
    return new TextDecoder().decode(bytes);
  },
  "html-encode": htmlEncode,
  "html-decode": htmlDecode,
  "uni-encode": (text) =>
    [...text].map((ch) => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0")).join(""),
  "uni-decode": (text) => text.replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))),
  rot13: (text) =>
    text.replace(/[a-z]/gi, (ch) => {
      const base = ch <= "Z" ? 65 : 97;
      return String.fromCharCode(((ch.charCodeAt(0) - base + 13) % 26) + base);
    }),
  reverse: (text) => [...text].reverse().join(""),
  lower: (text) => text.toLowerCase(),
  upper: (text) => text.toUpperCase(),
  md5: (text) => hash("MD5", text).catch(() => "MD5 unavailable in this browser"),
  sha1: (text) => hash("SHA-1", text),
  sha256: (text) => hash("SHA-256", text),
  sqlchar: (text) => "CHAR(" + [...text].map((ch) => ch.charCodeAt(0)).join(",") + ")",
  zerohex: (text) => "0x" + [...new TextEncoder().encode(text)].map((b) => b.toString(16).padStart(2, "0")).join(""),
  jshex: (text) => [...text].map((ch) => "\\x" + ch.charCodeAt(0).toString(16).padStart(2, "0")).join(""),
};

async function run(op) {
  const text = input.value;
  if (!text) {
    hint.textContent = "Input is empty.";
    return;
  }
  try {
    const result = await operations[op](text);
    output.value = result;
    hint.textContent = op + " done";
  } catch (error) {
    output.value = "";
    hint.textContent = "Failed: " + (error && error.message ? error.message : String(error));
  }
}

for (const button of document.querySelectorAll("#buttons button")) {
  button.addEventListener("click", () => run(button.dataset.op));
}

document.getElementById("swap").addEventListener("click", () => {
  if (!output.value) return;
  input.value = output.value;
  output.value = "";
});

document.getElementById("clear").addEventListener("click", () => {
  input.value = "";
  output.value = "";
  hint.textContent = "";
});

document.getElementById("copy").addEventListener("click", async () => {
  if (output.value) {
    await navigator.clipboard.writeText(output.value);
    hint.textContent = "copied";
  }
});
