/* K3ypissr NukeBar - modern Firefox-inspired dock panel. */
(function () {
  "use strict";

  if (window.top !== window) return;
  const api = globalThis.browser || globalThis.chrome;
  const HB = (globalThis.HB = globalThis.HB || {});
  if (HB.ui) return;
  HB.api = api;

  const data = globalThis.HB_PAYLOADS || { tree: [], counts: {} };
  let shadow = null;
  let host = null;
  let panel = null;
  let popup = null;
  let popupStack = [];
  let popupAnchor = null;
  let popupFilter = "";
  let popupLimit = 250;
  let noticeTimer = 0;
  let closeToken = 0;

  const AVAILABLE_ICONS = new Set([
    "addslashes.png", "basic.png", "columns.png", "convert.png", "data.png", "database.png",
    "database_convert.png", "db.png", "encryption.png", "encryption_weak.png", "hackbar_icon.png",
    "icon.png", "jsswitch.png", "load.png", "minus.gif", "mssql.png", "mysql.png", "off-16.png",
    "on-16.png", "orsql.png", "plus.gif", "quick1.png", "quick2.png", "quick3.png", "s.png",
    "split.gif", "string.png", "string1.png", "toolbar_button.png", "urld.png", "urle.png",
    "uud.png", "uue.png", "waf_set.png", "web.png", "xss.png", "xss_alert.png",
  ]);
  const ICON_ALIASES = {
    "web1.png": "web.png", "web2.png": "web.png", "waf.png": "waf_set.png", "waf2.png": "waf_set.png",
    "inject.png": "xss.png", "inject1.png": "xss.png", "inject2.png": "xss.png",
    "hexgreenL.png": "convert.png", "hexgreenR.png": "convert.png", "hexblackL.png": "convert.png",
    "hexblackR.png": "convert.png", "linkred.png": "data.png", "linkblue.png": "data.png",
    "linkgreen.png": "data.png", "html.png": "s.png", "passhint.png": "basic.png",
    "encryption2.png": "encryption.png", "encryption_strong.png": "encryption.png",
    "waf_set2.png": "waf_set.png", "urle2.png": "urle.png", "urld2.png": "urld.png",
    "uue2.png": "uue.png", "uud2.png": "uud.png",
  };

  function iconUrl(path) {
    if (!path) return "";
    const base = String(path).split("/").pop();
    const name = AVAILABLE_ICONS.has(base) ? base : ICON_ALIASES[base];
    if (!name) return "";
    try {
      return api.runtime.getURL("icons/" + name);
    } catch (_) {
      return "";
    }
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = value;
        else if (value !== null && value !== undefined) node.setAttribute(key, value);
      }
    }
    if (children) for (const child of children) if (child) node.appendChild(child);
    return node;
  }

  const TEMPLATE = `
    <div class="hb-notice" id="hb-notice"></div>
    <div class="hb-menubar">
      <select class="hb-select" id="hb-inc" title="Increment / decrement base">
        <option value="INT">INT</option>
        <option value="HEX">HEX</option>
        <option value="OCT">OCT</option>
        <option value="Alphabet">Alphabet</option>
        <option value="AlNum">AlNum</option>
      </select>
      <button class="hb-btn hb-icon-btn" id="hb-dec" title="Subtract 1 from current selection"><img alt="-" src="" data-icon="minus.gif"></button>
      <button class="hb-btn hb-icon-btn" id="hb-incbtn" title="Add 1 to current selection"><img alt="+" src="" data-icon="plus.gif"></button>
      <span class="hb-sep"></span>
      <div class="hb-menus" id="hb-menus"></div>
      <span class="hb-sep"></span>
      <span class="hb-spacer"></span>
      <span class="hb-brand" title="K3ypissr NukeBar 3.0">K3ypissr NukeBar</span>
      <button class="hb-btn" id="hb-tools" title="Tools: Admin Finder, Decoder, Reverse IP, Network, Options">Tools</button>
      <button class="hb-btn" id="hb-options" title="Options">Options</button>
      <button class="hb-btn hb-icon-btn" id="hb-close" title="Close (F9)">&times;</button>
    </div>
    <div class="hb-main">
      <div class="hb-actions">
        <button class="hb-btn hb-action" id="hb-load" title="Load current page URL, referrer, POST data and cookies (Alt+A)"><img alt="" src="" data-icon="load.png"><span>Load URL</span></button>
        <button class="hb-btn hb-action" id="hb-split" title="Split URL at every &amp; and ? (Alt+S)"><img alt="" src="" data-icon="split.gif"><span>Split URL</span></button>
        <button class="hb-btn hb-action" id="hb-execute" title="Execute request (Alt+X)"><img alt="" src="" data-icon="web.png"><span>Execute</span></button>
      </div>
      <div class="hb-fields">
        <textarea class="hb-field" id="hackBarTargetUrl" rows="3" spellcheck="false" autocomplete="off" placeholder="http://target/?id=1"></textarea>
        <div class="hb-row">
          <label class="hb-toggle" title="Send data as POST body"><input type="checkbox" id="hb-post-toggle"><span>Post</span></label>
          <label class="hb-toggle" title="Send a custom Referer header"><input type="checkbox" id="hb-referrer-toggle"><span>Referrer</span></label>
          <label class="hb-toggle" title="Send a custom Cookie header"><input type="checkbox" id="hb-cookie-toggle"><span>Cookie</span></label>
          <span class="hb-spacer"></span>
          <button class="hb-btn" id="hb-fetch" title="Fetch through the extension and open the response viewer">Fetch</button>
        </div>
        <div class="hb-row hb-conversions" title="Encode/decode the selected text (or the whole URL field when nothing is selected)">
          <span class="hb-conv">
            <button class="hb-btn hb-icon-btn" id="hb-hex-dec" title="Decode 0xHEX back to string"><img alt="" src="" data-icon="quick2.png"></button>
            <span class="hb-small">0xHEX</span>
            <button class="hb-btn hb-icon-btn" id="hb-hex-enc" title="Convert selection to 0xHEX"><img alt="" src="" data-icon="quick1.png"></button>
          </span>
          <span class="hb-conv">
            <button class="hb-btn hb-icon-btn" id="hb-url-dec" title="Decode %URL back to string"><img alt="" src="" data-icon="quick2.png"></button>
            <span class="hb-small">%URL</span>
            <button class="hb-btn hb-icon-btn" id="hb-url-enc" title="Convert selection to %URL"><img alt="" src="" data-icon="quick1.png"></button>
          </span>
          <span class="hb-conv">
            <button class="hb-btn hb-icon-btn" id="hb-b64-dec" title="Base64 decode selection"><img alt="" src="" data-icon="quick2.png"></button>
            <span class="hb-small">BASE64</span>
            <button class="hb-btn hb-icon-btn" id="hb-b64-enc" title="Base64 encode selection"><img alt="" src="" data-icon="quick1.png"></button>
          </span>
          <span class="hb-conv">
            <button class="hb-btn hb-icon-btn" id="hb-bin-dec" title="Decode 0bBINARY back to string"><img alt="" src="" data-icon="quick2.png"></button>
            <span class="hb-small">0bBINARY</span>
            <button class="hb-btn hb-icon-btn" id="hb-bin-enc" title="Convert selection to 0bBINARY"><img alt="" src="" data-icon="quick1.png"></button>
          </span>
          <span class="hb-conv">
            <button class="hb-btn hb-icon-btn" id="hb-uni-dec" title="Decode \\uUNICODE escapes"><img alt="" src="" data-icon="quick2.png"></button>
            <span class="hb-small">\\uUNICODE</span>
            <button class="hb-btn hb-icon-btn" id="hb-uni-enc" title="Convert selection to \\uUNICODE escapes"><img alt="" src="" data-icon="quick1.png"></button>
          </span>
          <span class="hb-conv">
            <button class="hb-btn hb-icon-btn" id="hb-xhex-dec" title="Decode \\xHEX escapes"><img alt="" src="" data-icon="quick2.png"></button>
            <span class="hb-small">\\xHEX</span>
            <button class="hb-btn hb-icon-btn" id="hb-xhex-enc" title="Convert selection to \\xHEX escapes"><img alt="" src="" data-icon="quick1.png"></button>
          </span>
          <span class="hb-conv">
            <button class="hb-btn hb-icon-btn" id="hb-entx-dec" title="Decode &#xHEX; HTML entities"><img alt="" src="" data-icon="quick2.png"></button>
            <span class="hb-small">&#xHEX;</span>
            <button class="hb-btn hb-icon-btn" id="hb-entx-enc" title="Convert selection to &#xHEX; HTML entities"><img alt="" src="" data-icon="quick1.png"></button>
          </span>
        </div>
        <div class="hb-row">
          <input class="hb-replace" id="rstring1" placeholder="Insert to replace" spellcheck="false">
          <input class="hb-replace" id="rstring2" placeholder="Insert replacing" spellcheck="false">
          <label class="hb-toggle" title="Checked = whole field, unchecked = selected text"><input type="checkbox" id="replace_check" checked><span>Replace</span></label>
          <button class="hb-btn hb-icon-btn" id="hb-replace-run" title="Run replace"><img alt="" src="" data-icon="quick1.png"></button>
          <button class="hb-btn" id="hb-b64-spacer" title="Insert Base64 spacer">[BASE64]</button>
        </div>
        <div class="hb-subfield" id="hb-post-wrap">
          <div class="hb-subfield-label">POST data</div>
          <textarea class="hb-field" id="hackBarTargetUrlPostField" rows="2" spellcheck="false" placeholder="user=admin&amp;pass=test"></textarea>
        </div>
        <div class="hb-subfield" id="hb-referrer-wrap">
          <div class="hb-subfield-label">Referrer</div>
          <textarea class="hb-field" id="hackBarTargetUrlReferrerField" rows="2" spellcheck="false" placeholder="https://example.com/"></textarea>
        </div>
        <div class="hb-subfield" id="hb-cookie-wrap">
          <div class="hb-subfield-label">Cookie</div>
          <textarea class="hb-field" id="hackBarTargetUrlCookieField" rows="2" spellcheck="false" placeholder="session=abc; role=admin"></textarea>
        </div>
      </div>
      <div class="hb-resize">
        <button class="hb-btn hb-icon-btn" id="hb-grow" title="Add two rows to the URL field"><img alt="+" src="" data-icon="plus.gif"></button>
        <button class="hb-btn hb-icon-btn" id="hb-shrink" title="Remove two rows from the URL field"><img alt="-" src="" data-icon="minus.gif"></button>
      </div>
    </div>
    <input type="checkbox" id="main_toogle" checked hidden>
    <input type="checkbox" id="ref_toogle" hidden>
    <input type="checkbox" id="post_toogle" hidden>
    <input type="checkbox" id="base_toogle" hidden>
  `;

  function buildPanel() {
    host = document.createElement("div");
    host.id = "hackbar-mod-combined-host";
    host.style.cssText = "all:initial;position:fixed;inset:auto 0 0 0;z-index:2147483647;";
    shadow = host.attachShadow({ mode: "open" });
    const link = el("link", { rel: "stylesheet" });
    link.href = api.runtime.getURL("content/panel.css");
    shadow.appendChild(link);
    const wrap = el("div", { class: "hb-wrap" });
    wrap.innerHTML = TEMPLATE;
    panel = el("div", { class: "hb-panel hb-hidden", id: "hb-panel" });
    while (wrap.firstChild) panel.appendChild(wrap.firstChild);
    shadow.appendChild(panel);

    const dock = el("button", { class: "hb-dock-toggle", id: "hb-dock", title: "Open K3ypissr NukeBar (F9)" });
    dock.appendChild(el("img", { alt: "", src: iconUrl("icon.png"), width: "14", height: "14" }));
    dock.appendChild(el("span", { text: "K3ypissr NukeBar" }));
    shadow.appendChild(dock);

    for (const img of panel.querySelectorAll("img[data-icon]")) {
      img.src = iconUrl(img.getAttribute("data-icon"));
      img.onerror = () => {
        img.style.display = "none";
      };
    }
    document.documentElement.appendChild(host);
    registerElements();
    applySettings();
    wireEvents();
    buildTopMenus();
  }

  function registerElements() {
    const get = (id) => panel.querySelector("#" + id);
    const raw = globalThis.__HB_REGISTER__;

    const urlField = get("hackBarTargetUrl");
    const postField = get("hackBarTargetUrlPostField");
    const referrerField = get("hackBarTargetUrlReferrerField");
    const cookieField = get("hackBarTargetUrlCookieField");

    r(raw, "hackBarTargetUrl", urlField);
    r(raw, "hackBarTargetUrlPostField", postField);
    r(raw, "hackBarTargetUrlReferrerField", referrerField);
    r(raw, "hackBarTargetUrlCookieField", cookieField);
    r(raw, "hackBarTargetUrlBase64Field", get("hb-b64-spacer"));

    const inc = get("hb-inc");
    r(raw, "hackBarPlusMinusSelection", {
      get selectedItem() {
        return { label: inc.value, getAttribute: () => inc.value };
      },
      get value() {
        return inc.value;
      },
    });

    r(raw, "main_toogle", get("main_toogle"));
    r(raw, "ref_toogle", get("ref_toogle"));
    r(raw, "post_toogle", get("post_toogle"));
    r(raw, "base_toogle", get("base_toogle"));

    const postToggle = get("hb-post-toggle");
    const referrerToggle = get("hb-referrer-toggle");
    const cookieToggle = get("hb-cookie-toggle");
    r(raw, "hackBar_postDataCheckBox", postToggle);
    r(raw, "hackBar_referrerCheckBox", referrerToggle);
    r(raw, "hackBar_cookieCheckBox", cookieToggle);

    r(raw, "replace_check", get("replace_check"));
    r(raw, "rstring1", get("rstring1"));
    r(raw, "rstring2", get("rstring2"));

    // XUL's setAttribute("checked", ...) needs to map onto the HTML property.
    for (const box of panel.querySelectorAll('input[type="checkbox"]')) {
      const original = box.setAttribute.bind(box);
      box.setAttribute = function (name, value) {
        if (name === "checked") {
          box.checked = value === true || value === "true" || value === "checked";
          return;
        }
        return original(name, value);
      };
    }

    const focusField = (field, key) => {
      HB.app.currentFocusField = field;
      HB.activeFieldKey = key;
      const mapping = { url: "main_toogle", post: "post_toogle", referrer: "ref_toogle", cookie: "base_toogle" };
      for (const box of panel.querySelectorAll("#main_toogle,#ref_toogle,#post_toogle,#base_toogle")) box.checked = false;
      const target = panel.querySelector("#" + (mapping[key] || "main_toogle"));
      if (target) target.checked = true;
    };
    urlField.addEventListener("focus", () => focusField(urlField, "url"));
    urlField.addEventListener("click", () => focusField(urlField, "url"));
    postField.addEventListener("focus", () => focusField(postField, "post"));
    postField.addEventListener("click", () => focusField(postField, "post"));
    referrerField.addEventListener("focus", () => focusField(referrerField, "referrer"));
    referrerField.addEventListener("click", () => focusField(referrerField, "referrer"));
    cookieField.addEventListener("focus", () => focusField(cookieField, "cookie"));
    cookieField.addEventListener("click", () => focusField(cookieField, "cookie"));

    // Chrome clears the caret when focus leaves a textarea, so remember the
    // last range ourselves; setSelectedText falls back to it when needed.
    for (const field of [urlField, postField, referrerField, cookieField]) {
      for (const type of ["focus", "click", "keyup", "mouseup", "input", "select"]) {
        field.addEventListener(type, () => HB.app.rememberSelection(field));
      }
    }

    HB.app.field = urlField;
    HB.app.postDataField = postField;
    HB.app.referrerField = referrerField;
    HB.app.cookieField = cookieField;
    HB.app.currentFocusField = urlField;
    HB.fields = { url: urlField, post: postField, referrer: referrerField, cookie: cookieField };
    HB.toggles = { post: postToggle, referrer: referrerToggle, cookie: cookieToggle };
  }

  function r(raw, id, value) {
    if (typeof raw === "function") raw(id, value);
  }

  /* ------------------------------------------------------------------ */
  /* Converters                                                          */
  /* ------------------------------------------------------------------ */

  // Safe, round-trippable versions of the legacy toolbar converters. They
  // intentionally do not eval user input, and they cover the 0bBINARY,
  // \uUNICODE, \xHEX and &#xHEX; pairs the original strip had.
  const CONVERTERS = {
    hexEncode(text) {
      return (
        "0x" +
        [...new TextEncoder().encode(text)]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("")
      );
    },
    hexDecode(text) {
      const clean = String(text).replace(/0x/gi, "").replace(/[^0-9a-f]/gi, "");
      const bytes = new Uint8Array(Math.floor(clean.length / 2));
      for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    },
    urlEncode(text) {
      return encodeURIComponent(text);
    },
    urlDecode(text) {
      try {
        return decodeURIComponent(String(text).replace(/\+/g, " "));
      } catch (_) {
        return unescape(String(text));
      }
    },
    base64Encode(text) {
      const bytes = new TextEncoder().encode(text);
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    },
    base64Decode(text) {
      const binary = atob(String(text).replace(/\s+/g, ""));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    },
    binaryEncode(text) {
      return "0b" + [...new TextEncoder().encode(text)].map((byte) => byte.toString(2).padStart(8, "0")).join("");
    },
    binaryDecode(text) {
      const clean = String(text).replace(/0b/gi, "").replace(/[^01]/g, "");
      const bytes = new Uint8Array(Math.floor(clean.length / 8));
      for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.substr(i * 8, 8), 2);
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    },
    unicodeEncode(text) {
      let output = "";
      for (let i = 0; i < text.length; i++) {
        output += "\\u" + text.charCodeAt(i).toString(16).padStart(4, "0");
      }
      return output;
    },
    unicodeDecode(text) {
      return String(text).replace(/\\u([0-9a-f]{1,4})/gi, (_match, hex) =>
        String.fromCharCode(parseInt(hex, 16))
      );
    },
    xHexEncode(text) {
      let output = "";
      for (let i = 0; i < text.length; i++) {
        output += "\\x" + text.charCodeAt(i).toString(16).padStart(2, "0");
      }
      return output;
    },
    xHexDecode(text) {
      return String(text).replace(/\\x([0-9a-f]{1,2})/gi, (_match, hex) =>
        String.fromCharCode(parseInt(hex, 16))
      );
    },
    entityEncode(text) {
      let output = "";
      for (let i = 0; i < text.length; i++) {
        output += "&#x" + text.charCodeAt(i).toString(16) + ";";
      }
      return output;
    },
    entityDecode(text) {
      return String(text).replace(/&#x([0-9a-f]+);?/gi, (_match, hex) =>
        String.fromCharCode(parseInt(hex, 16))
      );
    },
  };

  function applyConversion(name) {
    const convert = CONVERTERS[name];
    if (!convert) return;
    const selected = HB.app.getSelectedText();
    if (selected === "" || selected === null || selected === undefined) {
      notice("Select the text to convert first.");
      return;
    }
    try {
      HB.app.setSelectedText(String(convert(String(selected))));
    } catch (error) {
      notice("Conversion failed: " + (error && error.message ? error.message : String(error)));
    }
  }

  /* ------------------------------------------------------------------ */
  /* Wiring                                                              */
  /* ------------------------------------------------------------------ */

  function wireEvents() {
    // Keep the caret inside the target field. Chrome moves focus to a button
    // on mousedown, which loses the selection and made payload clicks replace
    // the whole URL; Firefox keeps the textarea focused. Never block real text
    // controls (filter box, checkboxes, selects, links).
    shadow.addEventListener(
      "mousedown",
      (event) => {
        const target = event.target;
        if (!target || !target.closest) return;
        if (target.closest("input, textarea, select, option, a[href], [contenteditable='true']")) return;
        if (!target.closest("button, .hb-item, .hb-menu-btn, .hb-more")) return;
        event.preventDefault();
      },
      true
    );

    panel.addEventListener("click", (event) => {
      const target = event.target.closest ? event.target.closest("button") : null;
      if (target && target.dataset && target.dataset.menuIndex !== undefined) {
        const index = Number(target.dataset.menuIndex);
        openRootMenu(data.tree[index], target);
      }
    });

    panel.querySelector("#hb-close").addEventListener("click", hide);
    panel.querySelector("#hb-tools").addEventListener("click", (e) => openTools(e.currentTarget));
    panel.querySelector("#hb-options").addEventListener("click", () => HB.openPage("options"));
    panel.querySelector("#hb-load").addEventListener("click", () => loadCurrentUrl());
    panel.querySelector("#hb-split").addEventListener("click", () => HB.app.splitUrl());
    panel.querySelector("#hb-execute").addEventListener("click", (e) => execute({ newTab: e.altKey || HB.settings.openInNewTab }));
    panel.querySelector("#hb-fetch").addEventListener("click", () => fetchToViewer());
    panel.querySelector("#hb-dec").addEventListener("click", () => HB.app.selectionNumberChange(-1));
    panel.querySelector("#hb-incbtn").addEventListener("click", () => HB.app.selectionNumberChange(1));
    panel.querySelector("#hb-grow").addEventListener("click", () => resizeRows(2, "hackBarTargetUrl"));
    panel.querySelector("#hb-shrink").addEventListener("click", () => resizeRows(-2, "hackBarTargetUrl"));

    const CONVERSION_BUTTONS = {
      "hb-hex-dec": "hexDecode",
      "hb-hex-enc": "hexEncode",
      "hb-url-dec": "urlDecode",
      "hb-url-enc": "urlEncode",
      "hb-b64-dec": "base64Decode",
      "hb-b64-enc": "base64Encode",
      "hb-bin-dec": "binaryDecode",
      "hb-bin-enc": "binaryEncode",
      "hb-uni-dec": "unicodeDecode",
      "hb-uni-enc": "unicodeEncode",
      "hb-xhex-dec": "xHexDecode",
      "hb-xhex-enc": "xHexEncode",
      "hb-entx-dec": "entityDecode",
      "hb-entx-enc": "entityEncode",
    };
    for (const [id, name] of Object.entries(CONVERSION_BUTTONS)) {
      const button = panel.querySelector("#" + id);
      if (button) button.addEventListener("click", () => applyConversion(name));
    }
    panel.querySelector("#hb-b64-spacer").addEventListener("click", () => {
      HB.runNode({ source: "pro", handler: { method: "SQL.statementsTpro", args: ["13"] } });
    });
    panel.querySelector("#hb-replace-run").addEventListener("click", () => {
      HB.runNode({ source: "pro", handler: { method: "SQL.ExecuteReplaceTest", args: [] } });
    });

    for (const [key, box] of Object.entries(HB.toggles)) {
      box.addEventListener("change", () => setFieldEnabled(key, box.checked));
    }

    const dock = shadow.querySelector("#hb-dock");
    if (dock) dock.addEventListener("click", show);

    document.addEventListener(
      "keydown",
      (event) => {
        if (event.defaultPrevented) return;
        const key = event.key;
        if (key === "F9") {
          event.preventDefault();
          toggle();
          return;
        }
        if (!isOpen()) return;
        if (event.altKey && !event.ctrlKey && !event.metaKey) {
          const lower = (key || "").toLowerCase();
          if (lower === "x") {
            event.preventDefault();
            execute({ newTab: event.shiftKey });
          } else if (lower === "a") {
            event.preventDefault();
            loadCurrentUrl();
          } else if (lower === "s") {
            event.preventDefault();
            HB.app.splitUrl();
          } else if (key === "ArrowUp" || key === "+" || key === "=") {
            event.preventDefault();
            HB.app.selectionNumberChange(1);
          } else if (key === "ArrowDown" || key === "-") {
            event.preventDefault();
            HB.app.selectionNumberChange(-1);
          }
        }
        if (key === "Escape" && popup) {
          closePopup();
        }
      },
      true
    );

    document.addEventListener(
      "mousedown",
      (event) => {
        if (!popup) return;
        const path = event.composedPath ? event.composedPath() : [];
        if (path.includes(popup) || (popupAnchor && path.includes(popupAnchor))) return;
        closePopup();
      },
      true
    );

    window.addEventListener("resize", () => {
      if (popup) positionPopup();
    });

    try {
      api.runtime.onMessage.addListener((message) => {
        if (!message || !message.type) return;
        if (message.type === "hb:setField") {
          show();
          const field = HB.fields[message.field] || HB.fields.url;
          putValue(field, message.text || "");
          const key = message.field || "url";
          if (HB.toggles[key]) {
            HB.toggles[key].checked = true;
            setFieldEnabled(key, true);
          }
          field.focus();
        } else if (message.type === "hb:insert") {
          show();
          HB.app.currentFocusField = HB.fields.url;
          HB.app.setSelectedText(message.text || "");
        } else if (message.type === "hb:toggle") {
          toggle();
        } else if (message.type === "hb:load") {
          show();
          loadCurrentUrl();
        } else if (message.type === "hb:execute") {
          show();
          execute({ newTab: HB.settings.openInNewTab });
        } else if (message.type === "hb:split") {
          show();
          HB.app.splitUrl();
        }
      });
    } catch (_) {
      /* runtime messaging unavailable */
    }
  }

  /* ------------------------------------------------------------------ */
  /* Panel state                                                         */
  /* ------------------------------------------------------------------ */

  function isOpen() {
    return panel && !panel.classList.contains("hb-hidden") && !panel.classList.contains("hb-closing");
  }

  function show() {
    if (!panel) return;
    closeToken++;
    panel.classList.remove("hb-closing");
    panel.classList.remove("hb-hidden");
    const dock = shadow.querySelector("#hb-dock");
    if (dock) dock.classList.remove("hb-visible");
    const url = HB.fields.url;
    if (url && !url.value) loadCurrentUrl(true);
    HB.storageSet({ panelOpen: true });
  }

  function hide() {
    if (!panel || panel.classList.contains("hb-hidden") || panel.classList.contains("hb-closing")) return;
    const token = ++closeToken;
    closePopup();
    const dock = shadow.querySelector("#hb-dock");
    if (dock) dock.classList.add("hb-visible");
    HB.storageSet({ panelOpen: false });

    const finish = () => {
      if (token !== closeToken) return;
      panel.classList.remove("hb-closing");
      panel.classList.add("hb-hidden");
    };
    const reduce =
      globalThis.matchMedia && globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      finish();
      return;
    }
    const onEnd = (event) => {
      if (event.target !== panel) return;
      panel.removeEventListener("animationend", onEnd);
      finish();
    };
    panel.addEventListener("animationend", onEnd);
    panel.classList.add("hb-closing");
    // Fallback for reduced motion, where the keyframes are disabled.
    setTimeout(finish, 220);
  }

  function toggle() {
    if (isOpen()) hide();
    else show();
  }

  function applySettings() {
    if (!panel) return;
    const font = HB.settings.fontSize || 13;
    if (HB.fields) {
      for (const field of Object.values(HB.fields)) {
        if (field) field.style.fontSize = font + "px";
      }
    }
    const theme = HB.settings.theme || "grey";
    panel.classList.toggle("hb-theme-dark", theme === "dark");
    if (popup) popup.classList.toggle("hb-theme-dark", theme === "dark");
    if (HB.settings.prefs && globalThis.__HB_PREFS__) {
      for (const [key, value] of Object.entries(HB.settings.prefs)) {
        globalThis.__HB_PREFS__.set(key, value);
      }
    }
  }

  HB.reloadSettings = applySettings;

  function notice(text) {
    if (!panel) return;
    const box = panel.querySelector("#hb-notice");
    box.textContent = text;
    box.classList.add("hb-visible");
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => box.classList.remove("hb-visible"), 6000);
  }

  function setFieldEnabled(key, enabled) {
    const wraps = {
      post: panel.querySelector("#hb-post-wrap"),
      referrer: panel.querySelector("#hb-referrer-wrap"),
      cookie: panel.querySelector("#hb-cookie-wrap"),
    };
    const toggle = HB.toggles[key];
    if (!toggle) return;
    const state = enabled === undefined ? !toggle.checked : !!enabled;
    toggle.checked = state;
    const wrap = wraps[key];
    if (wrap) wrap.classList.toggle("hb-open", state);
    if (state) {
      const field = HB.fields[key];
      if (field) {
        field.focus();
        HB.app.currentFocusField = field;
      }
    }
  }

  function resizeRows(add, fieldId) {
    const field = shadow.getElementById(fieldId) || (fieldId === "hackBarTargetUrl" ? HB.fields.url : null);
    if (!field) return;
    const rows = Math.max(1, Math.min(24, (parseInt(field.getAttribute("rows"), 10) || 3) + add));
    field.setAttribute("rows", String(rows));
    field.style.height = "";
  }

  function resizeFont(delta) {
    const field = HB.fields.url;
    if (!field) return;
    const current = parseFloat(field.style.fontSize) || HB.settings.fontSize || 13;
    field.style.fontSize = Math.max(9, Math.min(30, current + delta)) + "px";
  }

  function getIncrementMode() {
    return panel.querySelector("#hb-inc").value;
  }

  function getReferrer() {
    return HB.toggles.referrer.checked ? HB.fields.referrer.value.replace(/[\r\n]+/g, "") : null;
  }
  function getPostData() {
    return HB.toggles.post.checked ? HB.fields.post.value : null;
  }
  function getCookie() {
    return HB.toggles.cookie.checked ? HB.fields.cookie.value.replace(/[\r\n]+/g, "") : null;
  }

  function onValueChanged() {
    /* Hook for future per-tab persistence. */
  }

  /* ------------------------------------------------------------------ */
  /* Request execution                                                   */
  /* ------------------------------------------------------------------ */

  function execute(options) {
    let url = HB.fields.url.value.replace(/[\r\n]+/g, "").trim();
    if (!url) {
      notice("Enter a URL first.");
      return;
    }
    if (url.includes("[BASE64]") && url.includes("]")) {
      const start = url.lastIndexOf("[BASE64]=");
      const end = url.lastIndexOf("]");
      if (start !== -1 && end > start) {
        const raw = url.slice(start + 10, end);
        try {
          const encoded = globalThis.HackBar.Encrypt.base64Encode(raw);
          url = url.slice(0, start) + encoded + url.slice(end + 1);
        } catch (error) {
          notice("Base64 spacer failed: " + error.message);
          return;
        }
      }
    }
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url) && !/^(about|data|file|view-source|javascript):/i.test(url)) {
      url = "http://" + url;
    }
    const spec = {
      url,
      post: getPostData(),
      referrer: getReferrer(),
      cookie: getCookie(),
      newTab: options && options.newTab,
      viewer: false,
    };
    HB.send({ type: "execute", spec });
  }

  function fetchToViewer() {
    const url = HB.fields.url.value.replace(/[\r\n]+/g, "").trim();
    if (!url) return notice("Enter a URL first.");
    HB.send({
      type: "execute",
      spec: {
        url,
        post: getPostData(),
        referrer: getReferrer(),
        cookie: getCookie(),
        viewer: true,
        newTab: true,
      },
    });
  }

  function putValue(field, text) {
    if (!field) return;
    field.value = text === undefined || text === null ? "" : String(text);
    const end = field.value.length;
    try {
      field.selectionStart = end;
      field.selectionEnd = end;
    } catch (_) {
      /* not a text control */
    }
    HB.app._selectionMemo = { field, start: end, end };
  }

  function loadCurrentUrl(silent) {
    HB.send({ type: "tabInfo" }, (info) => {
      if (!info || !info.ok) {
        if (!silent) notice("Could not read the current tab.");
        return;
      }
      putValue(HB.fields.url, info.url || "");
      if (info.post) {
        putValue(HB.fields.post, info.post);
        HB.toggles.post.checked = true;
        setFieldEnabled("post", true);
      }
      if (info.referrer) {
        putValue(HB.fields.referrer, info.referrer);
        HB.toggles.referrer.checked = true;
        setFieldEnabled("referrer", true);
      }
      if (info.cookie) {
        putValue(HB.fields.cookie, info.cookie);
        HB.toggles.cookie.checked = true;
        setFieldEnabled("cookie", true);
      }
      HB.fields.url.focus();
      if (!silent) notice("Loaded current URL" + (info.post ? " with POST data" : "") + (info.cookie ? " and cookies" : "") + ".");
    });
  }

  /* ------------------------------------------------------------------ */
  /* Menus                                                               */
  /* ------------------------------------------------------------------ */

  function buildTopMenus() {
    const holder = panel.querySelector("#hb-menus");
    holder.textContent = "";
    const tree = Array.isArray(data.tree) ? data.tree : [];
    tree.forEach((node, index) => {
      if (!node || node.type !== "menu") return;
      const button = el("button", {
        class: "hb-btn hb-menu-btn",
        "data-menu-index": String(index),
        title: node.tooltip || node.label || "",
      });
      button.textContent = node.label || "(unnamed)";
      holder.appendChild(button);
    });

    const custom = HB.settings.customPayloads || [];
    if (custom.length) {
      const button = el("button", { class: "hb-btn hb-menu-btn", title: "Custom payloads" });
      button.textContent = "CUSTOM";
      button.addEventListener("click", () => {
        openNode(
          {
            type: "menu",
            label: "Custom payloads",
            children: custom.map((entry) => ({
              type: "item",
              label: entry.label,
              source: "pro",
              run: () => {
                show();
                HB.app.currentFocusField = HB.fields.url;
                HB.app.setSelectedText(entry.text || "");
              },
            })),
          },
          button
        );
      });
      holder.appendChild(button);
    }
  }

  HB.rebuildMenus = buildTopMenus;
  HB.applySettings = applySettings;

  function passFilter(node) {
    const packs = HB.settings.packs || { mod: true, pro: true };
    if (node.type === "item") {
      if (node.source === "mod" && packs.mod === false) return false;
      if (node.source === "pro" && packs.pro === false) return false;
    }
    return true;
  }

  function openRootMenu(node, anchor) {
    if (!node) return;
    popupStack = [node];
    popupFilter = "";
    popupLimit = 250;
    popupAnchor = anchor;
    renderPopup();
  }

  function openNode(node, anchor) {
    popupStack = [node];
    popupFilter = "";
    popupLimit = 250;
    popupAnchor = anchor;
    renderPopup();
  }

  function openTools(anchor) {
    openNode(
      {
        type: "menu",
        label: "Tools",
        children: [
          { type: "item", label: "Admin Finder", run: () => HB.openPage("admin-finder") },
          { type: "item", label: "Decoder / Encoder", run: () => HB.openPage("decoder") },
          { type: "item", label: "Reverse IP / Host lookup", run: () => HB.openPage("reverse-ip") },
          { type: "item", label: "Network / header viewer", run: () => HB.openPage("network") },
          { type: "item", label: "Tamper Data / request editor", run: () => HB.openPage("tamper") },
          { type: "item", label: "Open response viewer", run: () => HB.send({ type: "openViewer" }) },
          { type: "sep" },
          { type: "item", label: "View page source", run: () => HB.send({ type: "viewSource" }) },
          { type: "item", label: "Toggle JavaScript for this site", run: () => HB.send({ type: "toggleJs" }) },
          { type: "item", label: "NoRedirect: inspect redirect chain", run: () => HB.send({ type: "toggleNoRedirect" }) },
          { type: "item", label: "Proxy settings", run: () => HB.openPage("options", "tab=proxy") },
          { type: "sep" },
          { type: "item", label: "Options", run: () => HB.openPage("options") },
          { type: "item", label: "About / credits", run: () => HB.openPage("about") },
        ],
      },
      anchor
    );
  }

  function renderPopup() {
    const current = popupStack[popupStack.length - 1];
    if (!current) return closePopup();
    if (!popup) {
      popup = el("div", { class: "hb-popup", role: "dialog" });
      if ((HB.settings.theme || "grey") === "dark") popup.classList.add("hb-theme-dark");
      shadow.appendChild(popup);
    }
    popup.textContent = "";

    const head = el("div", { class: "hb-popup-head" });
    if (popupStack.length > 1) {
      const back = el("button", { class: "hb-btn hb-icon-btn", title: "Back" });
      back.textContent = "\u25C0";
      back.addEventListener("click", () => {
        popupStack.pop();
        popupFilter = "";
        popupLimit = 250;
        renderPopup();
      });
      head.appendChild(back);
      const up = el("button", { class: "hb-btn hb-icon-btn", title: "Back to top" });
      up.textContent = "\u2302";
      up.addEventListener("click", () => {
        popupStack = [popupStack[0]];
        popupFilter = "";
        popupLimit = 250;
        renderPopup();
      });
      head.appendChild(up);
    }
    head.appendChild(el("div", { class: "hb-popup-title", text: current.label || "" }));
    const close = el("button", { class: "hb-btn hb-icon-btn", title: "Close" });
    close.textContent = "\u00D7";
    close.addEventListener("click", closePopup);
    head.appendChild(close);
    popup.appendChild(head);

    const children = Array.isArray(current.children) ? current.children : [];
    if (children.length > 12) {
      const input = el("input", { class: "hb-popup-filter", placeholder: "Filter " + children.length + " items...", spellcheck: "false" });
      input.value = popupFilter;
      input.addEventListener("input", () => {
        popupFilter = input.value;
        popupLimit = 250;
        renderList(current, listHost, input.value);
      });
      popup.appendChild(input);
      setTimeout(() => {
        try {
          input.focus();
        } catch (_) {}
      }, 0);
    }

    const listHost = el("div", { class: "hb-popup-list" });
    popup.appendChild(listHost);
    renderList(current, listHost, popupFilter);
    positionPopup();
  }

  function renderList(current, hostEl, filterText) {
    hostEl.textContent = "";
    const needle = String(filterText || "").trim().toLowerCase();
    let children = (current.children || []).filter(passFilter);
    if (needle) {
      children = children.filter((child) => (child.label || "").toLowerCase().includes(needle));
    }
    if (!children.length) {
      hostEl.appendChild(el("div", { class: "hb-empty", text: "No matching items." }));
      return;
    }
    if (children.length > 300 && !needle) {
      hostEl.appendChild(
        el("div", {
          class: "hb-small",
          text:
            children.length +
            " items. This is the complete list from both extensions; use the filter box above or scroll to load more.",
        })
      );
    }
    const slice = children.slice(0, popupLimit);
    for (const child of slice) {
      if (child.type === "sep") {
        hostEl.appendChild(el("div", { class: "hb-divider" }));
        continue;
      }
      const row = el("div", { class: "hb-item", title: child.tooltip || child.label || "" });
      const url = iconUrl(child.icon);
      if (url) {
        const img = el("img", { alt: "", src: url });
        img.onerror = () => img.remove();
        row.appendChild(img);
      }
      row.appendChild(el("span", { class: "hb-item-label", text: child.label || "(unnamed)" }));
      if (child.source) row.appendChild(el("span", { class: "hb-src", text: child.source === "mod" ? "M" : "P" }));
      if (child.children && child.children.length) row.appendChild(el("span", { class: "hb-arrow" }));
      row.addEventListener("click", () => {
        if (child.children && child.children.length) {
          popupStack.push(child);
          popupFilter = "";
          popupLimit = 250;
          renderPopup();
          return;
        }
        closePopup();
        if (typeof child.run === "function") {
          child.run();
        } else {
          HB.runNode(child);
        }
      });
      hostEl.appendChild(row);
    }
    if (children.length > slice.length) {
      const more = el("button", { class: "hb-btn hb-more", text: "Show next 250 (" + (children.length - slice.length) + " remaining)" });
      more.addEventListener("click", () => {
        popupLimit += 250;
        renderList(current, hostEl, filterText);
      });
      hostEl.appendChild(more);
    }
  }

  function positionPopup() {
    if (!popup || !popupAnchor) return;
    const rect = popupAnchor.getBoundingClientRect();
    popup.style.width = Math.min(Math.max(rect.width + 160, 320), Math.min(620, window.innerWidth - 8)) + "px";
    popup.style.left = Math.max(4, Math.min(rect.left, window.innerWidth - popup.offsetWidth - 4)) + "px";
    popup.style.bottom = Math.max(4, window.innerHeight - rect.top + 4) + "px";
    popup.style.maxHeight = Math.max(160, Math.min(window.innerHeight * 0.66, rect.top - 12)) + "px";
  }

  function closePopup() {
    if (popup && popup.parentNode) popup.parentNode.removeChild(popup);
    popup = null;
    popupStack = [];
    popupAnchor = null;
    popupFilter = "";
  }

  /* ------------------------------------------------------------------ */
  /* Boot                                                                */
  /* ------------------------------------------------------------------ */

  HB.ui = {
    init: buildPanel,
    show,
    hide,
    toggle,
    execute,
    notice,
    setFieldEnabled,
    resizeRows,
    resizeFont,
    getIncrementMode,
    getReferrer,
    getPostData,
    getCookie,
    loadCurrentUrl,
    openTools,
    onValueChanged,
    isOpen,
  };

  function boot() {
    if (!data || !Array.isArray(data.tree)) {
      // payloads.js should be a declared content script; fall back to fetch.
      fetch(api.runtime.getURL("content/generated/payloads.json"))
        .then((response) => response.json())
        .then((json) => {
          globalThis.HB_PAYLOADS = json;
          Object.assign(data, json);
          start();
        })
        .catch((error) => console.warn("[NukeBar] payload data unavailable", error));
      return;
    }
    start();
  }

  function start() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot2, { once: true });
    } else {
      boot2();
    }
  }
  function boot2() {
    HB.storageGet({ panelOpen: false, settings: null }).then((values) => {
      if (values && values.settings) {
        Object.assign(HB.settings, values.settings);
        HB.settings.prefs = Object.assign({}, HB.settings.prefs, values.settings.prefs || {});
        HB.settings.packs = Object.assign({ mod: true, pro: true }, HB.settings.packs, values.settings.packs || {});
      }
      if (!panel) buildPanel();
      if ((values && values.panelOpen) || (values && values.settings && values.settings.reopenPanel)) {
        show();
      } else {
        const dock = shadow.querySelector("#hb-dock");
        if (dock) dock.classList.add("hb-visible");
      }
      watchSettings();
    });
  }

  // Options unticked in another tab should apply here immediately.
  function watchSettings() {
    try {
      if (!api.storage || !api.storage.onChanged) return;
      api.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local" || !changes || !changes.settings || !changes.settings.newValue) return;
        const next = changes.settings.newValue;
        Object.assign(HB.settings, next);
        HB.settings.prefs = Object.assign({}, HB.settings.prefs, next.prefs || {});
        HB.settings.packs = Object.assign({ mod: true, pro: true }, next.packs || {});
        applySettings();
        buildTopMenus();
      });
    } catch (_) {
      /* storage events unavailable */
    }
  }

  boot();
})();
