# K3ypissr NukeBar — Firefox

K3ypissr NukeBar 3.0.0 — the classic HackBar rebuilt for current Firefox, merging HackBar v2.9 + Mod payloads with header replay, decoder, Admin Finder, Reverse IP and network viewer.

> Offensive security material. Use only against systems you own or have explicit permission to test.

## Screenshots

![K3ypissr NukeBar panel — Firefox](screenshots/panel.png)

## Install — modern build (Firefox 115+)

1. Download this repo (or the `k3ypissr-nukebar-3.0-firefox.xpi` release asset).
2. Open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on**, and pick `manifest.json` — or install the signed `.xpi` from Releases.
3. Press **F9** on any page to toggle the panel.

Firefox uses real header replacement through `webRequest` (Chromium uses `declarativeNetRequest` session rules — same panel, different engine path).

## What is included

- Merged SQL, WAF, UNION, LFI, XSS, encoding and tool menus — 3,652 payload entries across 177 menus (Pro: 3,440 items, Mod: 420 items, source-tagged P / M)
- Load URL, split URL, POST body, custom Referer and Cookie headers
- Response viewer with sandboxed preview and header table
- Local decoder / encoder toolkit and hash helpers
- Admin Finder wordlist scanner, Reverse IP lookup, network viewer
- DIOS / QUERY / XSS payload preferences and custom payloads
- Light and dark themes

Keyboard: `F9` toggle panel · `Alt+A` load current request · `Alt+X` execute · `Alt+S` split URL · `Alt+↑` / `Alt+↓` increment / decrement

## Layout

```
manifest.json          Manifest V3, gecko id hackbar-mod-combined@3xp10rex.local, Firefox 115+
background.js          Background scripts: header replay, POST replay, viewer, network log
content/               Panel UI + payload engines (pro / mod / shared) + generated payloads
pages/                 Popup, options, about, poster, viewer, decoder, Admin Finder, Reverse IP, network, tamper, redirects
icons/                 Icon set
legacy/                Legacy XUL build — see below
CREDITS.md             Full upstream credits — most payload text, menu labels, icons and handler logic were written by other people
LICENSE                GPL-2.0-or-later
```

## Legacy build (`legacy/`)

`legacy/` is the rebuilt XUL add-on (`k3ypissr-nukebar-3.0-legacy.xpi`, 4.7 MB) for **Firefox 1.5–6.0 only**. It does **not** install on modern Firefox — it is kept here for history / old setups.

It includes the full Pro menus plus the Mod SQL, admin, VM and string modules, the `how-to-use` guide (including its video), and the LiveHTTPHeaders / Tamper Data / NoRedirect jars that shipped in the v2.9 archive.

## Credits / licence

Built from HackBar Pro v2.9 (Ph.Hitachi) and the k3ypissr / 3xp10reX Mod, originating with Pedro Laguna and Johan Adriaans. See `CREDITS.md` for the full breakdown.

Released under the GNU General Public License, version 2 or later. This is an unofficial community rebuild — not affiliated with, endorsed by or supported by Mozilla, Google, Pedro Laguna, Ph.Hitachi, 3xp10reX or any other original author.

See also: **K3ypissr NukeBar — Chrome** — https://github.com/k3ypissr/nukebar-chrome (same 3.0.0 build for Chromium).
