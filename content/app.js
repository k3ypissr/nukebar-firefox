/* K3ypissr NukeBar - application layer.
 * Binds the legacy HackBar.Main helpers to the modern panel and dispatches
 * merged menu items to the correct source engine (pro = v2.9, mod = 3xp10reX).
 */
(function () {
  "use strict";

  const HB = (globalThis.HB = globalThis.HB || {});
  HB.engines = globalThis.__HB_ENGINES__ || {};

  HB.settings = Object.assign(
    {
      openInNewTab: false,
      fontSize: 12,
      theme: "grey",
      panelHeight: 0,
      packs: { mod: true, pro: true },
      customPayloads: [],
      prefs: {},
    },
    HB.settings || {}
  );

  const MainProto = globalThis.HackBar && globalThis.HackBar.Main ? globalThis.HackBar.Main.prototype : {};
  const app = Object.create(MainProto);
  HB.app = app;
  globalThis.hackBar = app;

  // Copy helpers that only exist in the 3xp10reX Main.js (phpbackdoor,
  // lowercaseString, randomcaseString, stripcustom, ...) onto this instance.
  const modMain = HB.engines.mod && HB.engines.mod.Main;
  if (modMain && modMain.prototype) {
    for (const key of Object.getOwnPropertyNames(modMain.prototype)) {
      if (key === "constructor") continue;
      if (!(key in app)) app[key] = modMain.prototype[key];
    }
  }

  app.field = null;
  app.postDataField = null;
  app.referrerField = null;
  app.cookieField = null;
  app.base64Field = null;
  app.toolbar = null;
  app.currentFocusField = null;

  // Chrome drops the visible caret as soon as focus moves into the panel's
  // shadow DOM, so keep our own copy of the last caret/selection per field and
  // fall back to it when the live range looks collapsed at position 0.
  app._selectionMemo = null;

  app.rememberSelection = function (field) {
    const target = field || this.currentFocusField || this.field;
    if (!target) return;
    const start = typeof target.selectionStart === "number" ? target.selectionStart : 0;
    const end = typeof target.selectionEnd === "number" ? target.selectionEnd : start;
    this._selectionMemo = { field: target, start, end };
  };

  app.selectionRange = function (field) {
    const max = field.value == null ? 0 : String(field.value).length;
    let start = typeof field.selectionStart === "number" ? field.selectionStart : max;
    let end = typeof field.selectionEnd === "number" ? field.selectionEnd : start;
    const memo = this._selectionMemo;
    if (memo && memo.field === field) {
      if (start === 0 && end === 0 && (memo.start !== 0 || memo.end !== 0)) {
        start = memo.start;
        end = memo.end;
      }
    } else if (start === 0 && end === 0 && max > 0) {
      // The caret was never observed in this field: append instead of
      // inserting at the very beginning.
      start = max;
      end = max;
    }
    if (start > max) start = max;
    if (end > max) end = max;
    if (end < start) end = start;
    return { start, end };
  };

  app.getSelectedText = function () {
    const field = this.currentFocusField || this.field;
    if (!field) return "";
    const range = this.selectionRange(field);
    if (range.end > range.start) return String(field.value).slice(range.start, range.end);
    if (field.value) return field.value;
    return String(globalThis.__HB_PROMPT__("No text was selected for the requested action", "String to use") || "");
  };

  app.setSelectedText = function (text) {
    const value = text === undefined || text === null ? "" : String(text);
    const field = this.currentFocusField || this.field;
    if (!field) return;
    // Insert at the caret or replace the selection, exactly like the original
    // HackBar engine: value.slice(0, start) + text + value.slice(end).
    const range = this.selectionRange(field);
    const original = field.value == null ? "" : String(field.value);
    field.value = original.slice(0, range.start) + value + original.slice(range.end);
    try {
      if (typeof field.focus === "function" && field.isConnected !== false) field.focus({ preventScroll: true });
    } catch (_) {
      /* field may be plain object */
    }
    const caret = range.start + value.length;
    try {
      field.selectionStart = caret;
      field.selectionEnd = caret;
      field.scrollTop = field.scrollHeight;
    } catch (_) {
      /* field may be plain object */
    }
    this._selectionMemo = { field, start: caret, end: caret };
    field.dispatchEvent(new Event("input", { bubbles: true }));
    if (HB.ui && HB.ui.onValueChanged) HB.ui.onValueChanged(field);
  };

  app.loadUrl = function () {
    if (HB.ui) HB.ui.execute({});
  };
  app.LoadUrl = app.loadUrl;
  app.Execute = app.loadUrl;

  app.toggleBar = function () {
    if (HB.ui) HB.ui.toggle();
  };

  app.togglePostField = function () {
    if (HB.ui) HB.ui.setFieldEnabled("post", this.postDataField && this.postDataField.value !== "" ? true : undefined);
  };
  app.toggleReferrerField = function () {
    if (HB.ui) HB.ui.setFieldEnabled("referrer");
  };
  app.toggleCookieField = function () {
    if (HB.ui) HB.ui.setFieldEnabled("cookie");
  };
  app.toggleTools = function () {
    if (HB.ui) HB.ui.openTools();
  };

  app.useCurrentUrl = function () {
    if (HB.ui) HB.ui.loadCurrentUrl();
  };

  app.splitUrl = function () {
    const field = this.currentFocusField || this.field;
    if (!field) return;
    let uri = String(field.value || "");
    uri = uri.replace(/&/g, "\n&").replace(/\?/g, "\n?");
    field.value = uri;
    try {
      const end = uri.length;
      field.selectionStart = end;
      field.selectionEnd = end;
      this._selectionMemo = { field, start: end, end };
    } catch (_) {
      /* field may be plain object */
    }
    field.dispatchEvent(new Event("input", { bubbles: true }));
    if (HB.ui && HB.ui.onValueChanged) HB.ui.onValueChanged(field);
  };

  app.adjustFieldSize = function (add, fieldId) {
    if (HB.ui) HB.ui.resizeRows(add, fieldId);
  };

  app.ResizeText = function (multiplier) {
    if (HB.ui) HB.ui.resizeFont(multiplier);
  };

  app.selectionNumberChange = function (add) {
    const field = this.currentFocusField || this.field;
    if (!field) return;
    const mode = HB.ui && HB.ui.getIncrementMode ? HB.ui.getIncrementMode() : "INT";
    const text = this.getSelectedText();
    const originalLength = text.length;
    const Toolbox = globalThis.HackBar && globalThis.HackBar.Toolbox;
    let result;
    switch (mode) {
      case "HEX":
        result = Toolbox.dec2hex(Toolbox.hex2dec(text) + add);
        break;
      case "OCT":
        result = Toolbox.dec2oct(Toolbox.oct2dec(text) + add);
        break;
      case "Alphabet":
        result = Toolbox.dec2alphabet((Toolbox.alphabet2dec(text) + add + 26) % 26);
        break;
      case "AlNum":
        result = Toolbox.dec2alphanum((Toolbox.alphanum2dec(text) + add + 36) % 36);
        break;
      default:
        result = parseInt(text, 10) + add;
        break;
    }
    if (result === undefined || String(result) === "NaN") return;
    result = String(result);
    while (result.length < originalLength) result = "0" + result;
    this.setSelectedText(result);
  };

  app.getReferrerFromField = function () {
    return HB.ui ? HB.ui.getReferrer() : null;
  };
  app.getPostDataFromField = function () {
    return HB.ui ? HB.ui.getPostData() : null;
  };
  app.setCookiesFromField = function () {
    return HB.ui ? HB.ui.getCookie() : null;
  };

  /* ------------------------------------------------------------------ */
  /* Menu dispatch                                                       */
  /* ------------------------------------------------------------------ */

  function safeCall(fn, thisArg, args, label) {
    try {
      return fn.apply(thisArg, args);
    } catch (error) {
      console.error("[NukeBar] handler failed", label, error);
      if (HB.ui && HB.ui.notice) {
        HB.ui.notice("K3ypissr NukeBar: " + label + " failed - " + (error && error.message ? error.message : String(error)));
      }
      return undefined;
    }
  }

  const STRING_ALIASES = {
    phpbackdoor: "phpbackdoor",
    phprevshell: "phprevshell",
    phprfi: "phprfi",
    nodejsrevshell: "nodejsrevshell",
    lowercaseString: "lowercaseString",
    uppercaseString: "uppercaseString",
    randomcaseString: "randomcaseString",
    stripcustom: "stripcustom",
    addslashes: "addslashes",
    stripslashes: "stripslashes",
    stripspaces: "stripspaces",
    reverseString: "reverseString",
    getUsefullString: "getUsefullString",
    generateOverflowString: "generateOverflowString",
  };

  const GLOBAL_COMMANDS = {
    "livehttpheaders.task.openLiveHTTPHeaders": () => HB.openPage("network"),
    openTamper: () => HB.openPage("tamper"),
    openDialog: (args) => {
      const target = String((args && args[0]) || "").toLowerCase();
      if (target.includes("adminfinder")) return HB.openPage("admin-finder");
      if (target.includes("decoder")) return HB.openPage("decoder");
      if (target.includes("reverse")) return HB.openPage("reverse-ip");
      if (target.includes("connection")) return HB.openPage("options", "tab=proxy");
      if (target.includes("noredirect")) return HB.send({ type: "toggleNoRedirect" });
      if (target.includes("about")) return HB.openPage("about");
      if (target.includes("options")) return HB.openPage("options");
      return HB.openPage("network");
    },
  };

  HB.runNode = function runNode(node) {
    if (!node || !node.handler) return;
    const method = node.handler.method;
    const args = (node.handler.args || []).slice();
    const source = node.source === "mod" ? "mod" : "pro";
    if (!method) return;

    if (method.indexOf("app.") === 0) {
      const name = method.slice(4);
      const fn = app[name];
      return typeof fn === "function" ? safeCall(fn, app, args, method) : missing(method);
    }

    if (method.indexOf("global.") === 0) {
      const name = method.slice(7);
      const fn = GLOBAL_COMMANDS[name];
      if (fn) return fn(args);
      return missing(method);
    }

    const engine = HB.engines[source] || {};
    const dot = method.indexOf(".");
    const head = dot === -1 ? method : method.slice(0, dot);
    const tail = dot === -1 ? "" : method.slice(dot + 1);

    // v2.9 menu items call HackBar.Strings.* although that file never shipped.
    if (head === "Strings" && (!engine.Strings || typeof engine.Strings[tail] !== "function")) {
      const alias = STRING_ALIASES[tail];
      if (alias && typeof app[alias] === "function") return safeCall(app[alias], app, args, method);
    }

    if (head === "Crypto") {
      return cryptoCommand(tail, args);
    }

    const target = engine[head];
    if (target && typeof target[tail] === "function") {
      return safeCall(target[tail], target, args, method);
    }

    // Some v2.9 items point at helpers that only exist on the other engine.
    for (const other of Object.values(HB.engines)) {
      if (other === engine) continue;
      if (other[head] && typeof other[head][tail] === "function") {
        return safeCall(other[head][tail], other[head], args, method);
      }
    }

    return missing(method);
  };

  function missing(method) {
    console.warn("[NukeBar] unmapped handler:", method);
    if (HB.ui && HB.ui.notice) HB.ui.notice("K3ypissr NukeBar: unmapped handler " + method);
  }

  function cryptoCommand(tail, args) {
    const value = app.getSelectedText();
    const kind = String(args[0] || (tail.includes("SHA") ? "sha1" : "md5")).toLowerCase();
    const base =
      kind.indexOf("sha") === 0
        ? "https://hashtoolkit.com/decrypt-sha1-hash/"
        : "https://hashtoolkit.com/decrypt-md5-hash/";
    HB.openUrl(base + encodeURIComponent(value), true);
  }

  HB.runHandlerString = function (command) {
    // Used by the legacy-compatible "custom payload" feature.
    const match = /^HackBar\.([\w.$]+)\((.*)\)$/s.exec(String(command || "").trim());
    if (!match) return;
    const args = match[2]
      ? match[2].split(",").map((a) => a.trim().replace(/^['"]|['"]$/g, ""))
      : [];
    HB.runNode({ source: "pro", handler: { method: match[1], args } });
  };

  /* ------------------------------------------------------------------ */
  /* Small shared services                                               */
  /* ------------------------------------------------------------------ */

  const api = globalThis.browser || globalThis.chrome;
  HB.api = api;

  HB.send = function (message, callback) {
    try {
      const maybe = api.runtime.sendMessage(message, (response) => {
        if (callback) callback(response);
      });
      if (maybe && typeof maybe.then === "function" && !callback) return maybe;
    } catch (error) {
      console.warn("[NukeBar] message failed", error);
    }
    return undefined;
  };

  HB.openPage = function (page, query) {
    const url = api.runtime.getURL("pages/" + page + ".html") + (query ? "?" + query : "");
    HB.openUrl(url, true);
  };

  HB.openUrl = function (url, newTab) {
    if (newTab) {
      HB.send({ type: "openTab", url });
    } else {
      HB.send({ type: "navigate", url, newTab: false });
    }
  };

  HB.storageGet = function (defaults) {
    return new Promise((resolve) => {
      try {
        const result = api.storage.local.get(defaults, (value) => resolve(value || defaults));
        if (result && typeof result.then === "function") result.then((value) => resolve(value || defaults));
      } catch (_) {
        resolve(defaults);
      }
    });
  };

  HB.storageSet = function (values) {
    try {
      api.storage.local.set(values);
    } catch (_) {
      /* ignore */
    }
  };
})();
