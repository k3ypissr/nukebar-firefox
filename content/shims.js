/* K3ypissr NukeBar - content-script shims.
 * The legacy payload engines expect XUL/XPCOM globals. These shims map them
 * onto the modern panel so the original switch tables run unmodified.
 */
(function () {
  "use strict";

  const realDocument = document;
  const nativePrompt = window.prompt ? window.prompt.bind(window) : () => null;
  const nativeAlert = window.alert ? window.alert.bind(window) : () => {};
  const nativeConfirm = window.confirm ? window.confirm.bind(window) : () => false;

  const elements = new Map();
  const prefs = new Map();

  // The legacy v2.9 options ship these as ordinary strings; without them the
  // DIOS/QUERY/XSS switch tables would throw on first use.
  const prefDefaults = {};
  for (let i = 1; i <= 10; i++) {
    prefDefaults["extensions.hackbar.Dios.Dios " + i] = "Dios " + i;
    prefDefaults["extensions.hackbar.query.query " + i] = "query " + i;
    prefDefaults["extensions.hackbar.XSS.XSS " + i] = "XSS " + i;
  }

  const prefBranch = {
    getCharPref(name) {
      if (prefs.has(name)) return prefs.get(name);
      if (Object.prototype.hasOwnProperty.call(prefDefaults, name)) return prefDefaults[name];
      // Unknown string prefs resolve to an empty string, matching the way the
      // original options UI initialised most values.
      return "";
    },
    setCharPref(name, value) {
      prefs.set(name, String(value));
    },
    getBoolPref(name) {
      if (prefs.has(name)) return prefs.get(name) === true;
      throw new Error("NS_ERROR_UNEXPECTED: no such pref " + name);
    },
    setBoolPref(name, value) {
      prefs.set(name, !!value);
    },
    getIntPref(name) {
      if (prefs.has(name)) return Number(prefs.get(name));
      throw new Error("NS_ERROR_UNEXPECTED: no such pref " + name);
    },
    setIntPref(name, value) {
      prefs.set(name, Number(value));
    },
    clearUserPref(name) {
      prefs.delete(name);
    },
    prefHasUserValue(name) {
      return prefs.has(name);
    },
    addObserver() {},
    removeObserver() {},
    getBranch() {
      return prefBranch;
    },
  };

  const serviceFactory = {
    getService() {
      return prefBranch;
    },
    createInstance() {
      return {
        addHeader() {},
        setData() {},
        data: "",
        init() {},
        read() {
          return "";
        },
      };
    },
  };

  globalThis.Components = {
    classes: new Proxy(
      {},
      {
        get() {
          return serviceFactory;
        },
      }
    ),
    interfaces: new Proxy(
      {},
      {
        get(_target, key) {
          return String(key);
        },
      }
    ),
    Constructor() {
      return function LegacyStub() {};
    },
    utils: {
      import() {
        return {};
      },
      reportError(error) {
        if (globalThis.console) console.warn("[NukeBar]", error);
      },
    },
  };

  globalThis.__HB_PREFS__ = prefs;
  globalThis.__HB_PREF_BRANCH__ = prefBranch;

  globalThis.__HB_PROMPT__ = function (message, defaultValue) {
    const answer = nativePrompt(String(message || ""), defaultValue === undefined ? "" : String(defaultValue));
    return answer === null ? "" : answer;
  };
  globalThis.__HB_ALERT__ = function (message) {
    if (globalThis.HB && globalThis.HB.ui && globalThis.HB.ui.notice) {
      globalThis.HB.ui.notice(String(message || ""));
    } else {
      nativeAlert(String(message || ""));
    }
  };
  globalThis.__HB_CONFIRM__ = function (message) {
    return nativeConfirm(String(message || ""));
  };

  // Legacy code calls document.getElementById('hackBarTargetUrl') etc. Those
  // live in the panel's shadow root, so route lookups through a registry
  // first and fall back to the page document.
  globalThis.__HB_DOC__ = {
    getElementById(id) {
      if (elements.has(id)) {
        const value = elements.get(id);
        return typeof value === "function" ? value() : value;
      }
      return realDocument.getElementById(id);
    },
    createElement(tag, options) {
      return realDocument.createElement(tag, options);
    },
    createTextNode(text) {
      return realDocument.createTextNode(text);
    },
    querySelector(selector) {
      return realDocument.querySelector(selector);
    },
    querySelectorAll(selector) {
      return realDocument.querySelectorAll(selector);
    },
    addEventListener(...args) {
      return realDocument.addEventListener(...args);
    },
    removeEventListener(...args) {
      return realDocument.removeEventListener(...args);
    },
    get body() {
      return realDocument.body;
    },
    get documentElement() {
      return realDocument.documentElement;
    },
    get defaultView() {
      return window;
    },
    get location() {
      return realDocument.location;
    },
  };

  globalThis.__HB_REGISTER__ = function (id, valueOrGetter) {
    elements.set(id, valueOrGetter);
  };

  globalThis.__HB_LOAD_URI__ = function () {
    return false;
  };

  // Minimal jQuery-compatible helper for the two legacy HTML entity helpers
  // that used jQuery. Only .text()/.html() are needed.
  globalThis.__HB_JQUERY__ = function (arg) {
    return {
      text(value) {
        if (value === undefined) return this._text || "";
        this._text = String(value);
        const div = realDocument.createElement("div");
        div.textContent = this._text;
        this._html = div.innerHTML;
        return this;
      },
      html(value) {
        if (value === undefined) return this._html || "";
        const div = realDocument.createElement("div");
        div.innerHTML = String(value);
        this._text = div.textContent;
        this._html = String(value);
        return this;
      },
    };
  };
})();
