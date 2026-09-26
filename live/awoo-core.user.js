// ==UserScript==
// @name         AWOO+
// @namespace    awoo-core
// @author       Apoz
// @version      7.0.8
// @description  AWOO+ for Queslar: the menu, the shared plumbing every module plugs into, and every public module in one script. Install this one first; anything shared with you personally comes as AWOO+ Extras, through your own link. AWOO+ sends daily diagnostics (character name, village, install and browser info, versions and errors) to run and improve the app. Diagnostics never include your inventory, currencies or login details. Everything sent is either already public in-game or about AWOO+ itself.
// @match        https://v2.queslar.com/*
// @match        https://test.v2.queslar.com/*
// @grant        none
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/awoo-vibe-sniffa/queslar-releases/main/live/awoo-core.user.js
// @downloadURL  https://raw.githubusercontent.com/awoo-vibe-sniffa/queslar-releases/main/live/awoo-core.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ==== GENERATED — release identity ====
  const AWOO_RELEASE = {
    "channel": "live",
    "version": "7.0.8",
    "manifestUrl": "https://raw.githubusercontent.com/awoo-vibe-sniffa/queslar-releases/main/live/manifest.json",
    "checkinUrl": "https://awoo-key.apoz.workers.dev/p/hello"
  };
  // ==== END GENERATED ====

  // NO-PROVENANCE: Core consumes no data/ facts - see build.mjs buildCore().

  // ---- AWOO+ — the shell every module plugs into ----
  //
  // CHANGED 2026-09-05: this is its OWN userscript now, and it is the only
  // place the Core exists. Modules used to carry a verbatim copy each, which
  // worked for one module and breaks quietly for several — a module arriving
  // with a newer Core copy replaced window.__AwooCore, and every module
  // already registered against the old one silently vanished from the menu.
  // See DISTRIBUTION.md §1.1.
  //
  // Modules now ship ~12 lines instead of ~30KB: they push a factory onto
  // window.__awooModules and call claim(). Load order does not matter in
  // either direction — a module that loads first waits in the queue, and a
  // module that loads later claims itself on arrival.
  //
  // DOM work stays a one-time build plus cheap incremental re-renders; the
  // only self-owned timers are a 3s nav-anchor heartbeat and a 5s title-badge
  // check, both unchanged.

  // The top bar's button cap is the player's now (registry v2 `barMax`, 1-12,
  // set with a slider). The default is the top of the range, so an update
  // hides nobody's buttons: it was Infinity until R69 and five modules exist.
  const AWOO_CORE_MAX_QUICK_BUTTONS = 12;
  const AWOO_CORE_BAR_MAX_RANGE = [1, 12];

  // Bump on API change. What each version ADDED, so a module can tell what it
  // may rely on: 5 = standalone Core, claim(), toast, updates; 6 =
  // createWindow/ui.* shared window framework; 7 = ui.menu, ui.icon-btn/
  // primary-btn classes, windowResizingEnabled setting; 8 = walkFiberAll,
  // resetPosition/resetFull split, real theme presets, generalized
  // [data-tooltip]; 9 = onNavigate; 10 = createScope/ui.write/ui.dom — the
  // framework layer (userscripts/FRAMEWORK.md); 11 = jobs (the local job-host
  // client — see server/README.md); 12 = the Companion delegation
  // pattern (labelled v12 in the code below before this constant was bumped)
  // plus the named themes on the token contract, appearance(), toolHtml(),
  // themes, and Settings > Fonts; 13 = onSlowTick() and diagnostics, for the
  // daily check-in (REGISTER.md R80), and bundles (R81: a module in a bundle is
  // offered no update row of its own); 14 = the module LIFECYCLE (REGISTER.md
  // R69): a module that is off is never started, Core.store() for saving, and
  // registry v2 (loaded / order / shown on bar / shown in menu). A module
  // written against 14 declares `needsCore: 14`; one that does not still runs
  // exactly as it did under 13 (FRAMEWORK.md §3a); 15 = named services between
  // modules, provide() / use() / onProvide() (REGISTER.md R90); 16 = the profile
  // store notifies on change (REGISTER.md R92): profile.subscribe(fn, { sections })
  // calls fn(profile, { changed, stamped, initial }), tabs exchange deltas merged
  // by observedAt, profile.merge, and the `awoo:modules:change` window event;
  // Profile Sync's side of it: profile.catalogue, profile.request(sections),
  // profile.syncStatus(), and profile.watch deprecated (modules declare
  // about.uses and Core fetches).
  //
  // CORRECTED 2026-09-07: this list claimed v5 shipped a "bus". It never did —
  // see the "NOT TAKEN from the AWOO+ Framework" note further down, which
  // is the actual decision. A version history is the first thing a module
  // author reads to decide what exists, so a phantom entry in it is worse than
  // no list at all.
  const AWOO_CORE_VERSION = 16;

  // Exactly one Core per page. Two installed Core scripts is a user
  // misconfiguration, not a state to negotiate — first one wins and the second
  // says so, loudly enough to be findable and quietly enough not to break the
  // page. (Version negotiation lived here when every module carried a copy;
  // with one Core script there is nothing to negotiate.)
  if (window.__AwooCore) {
    console.warn('[AwooCore] A Core (v' + window.__AwooCore.version + ') is already running; this copy is standing down. '
      + 'You have two AWOO+ scripts installed — keep one.');
    if (window.__AwooCore.claim) window.__AwooCore.claim();
    return;
  }

  // Release identity. build.mjs injects AWOO_RELEASE; the fallback keeps this
  // file runnable on its own (tests, and a hand-loaded copy) with updates off.
  const RELEASE = (typeof AWOO_RELEASE !== 'undefined')
    ? AWOO_RELEASE
    : { channel: 'dev', manifestUrl: null, checkinUrl: null, version: '0.0.0' };

  const Core = (function () {
    const REG_KEY = 'awoo:core:registry';
    const BADGE_PREFIX = '🔔 ';
    // Hoisted out of buildUi() (v6): the window framework's own injected
    // stylesheet needs the same font, and duplicating the string was how the
    // two chromes would have quietly drifted apart.
    const CORE_FONT = "Lato, 'Open Sans', Nunito, 'Segoe UI', system-ui, sans-serif";
    // The checkbox tick, as a CSS mask (the colour comes from the theme).
    const AWOO_TICK_MASK = 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 10 10%27%3E'
      + '%3Cpath d=%27M1.5 5.2 4 7.6 8.6 2.4%27 fill=%27none%27 stroke=%27%23000%27 stroke-width=%271.8%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27/%3E%3C/svg%3E")';

    // ---- settings (v6.1) ----
    //
    // One small persisted blob, not one key per setting — a module reading
    // Core.getSetting() never has to know how many keys exist.
    const SETTINGS_KEY = 'awoo:core:settings';
    const SETTINGS_DEFAULTS = {
      // Enabling a module always shows its window immediately (that part is
      // not a setting — see onToggle in registerModule callers). This is
      // specifically about a page RELOAD restoring a window that happened to
      // be open last session: OFF by default per explicit request, so a
      // reload doesn't clutter the screen with everything that was open
      // last time.
      autoShowOnReload: false,
      // The named theme (DESIGN.md §7, ARTIFACT_STYLE_GUIDE.md Part II-b).
      // The default a new install starts with: Slate since 2026-09-25 (the
      // maintainer). A player's stored choice is never replaced by an update.
      // 'matchGame' is what the old `liveAdaptTheme: true` meant — inheriting
      // the game's own variables live — and a stored true is migrated to it
      // below, so nobody's choice is lost.
      theme: 'slate',
      // Settings > Fonts. Two surfaces, set separately, because the overlay
      // and the tools are read in different places at different sizes.
      // Applied only through the Fonts tab's "Save & apply" — see there.
      fonts: { awoo: { text: 'public', num: 'public' }, tools: { text: 'public', num: 'public' } },
      // ON by default. OFF removes the resize handle from every window
      // (Settings is never resizable regardless of this setting — see
      // openSettingsWindow) for anyone who would rather every window just
      // kept its default/reset size than risk dragging one into an odd shape.
      windowResizingEnabled: true,
      // Settings stays non-resizable — its panes are laid out for a known
      // width, and a freely-dragged settings panel is one more thing to get
      // wrong. But "one fixed size" turned out to be genuinely restrictive, so
      // the compromise is four named sizes rather than a drag handle: the
      // window is still always in a shape that was designed, and you pick
      // which. Falls back to 'default' for any unknown value, so a hand-edited
      // or future key cannot produce a 0x0 panel.
      settingsSize: 'default',
      // OFF by default, and the default is the whole point. A good deal of the
      // explanation in this overlay is really addressed to whoever maintains
      // it -- why a control is shaped the way it is, which bug produced it,
      // what the fallback does -- and that content is genuinely useful, just
      // not to someone who only wants to know what the button does. Rather
      // than delete it or leave it padding every hover, it moves to a second
      // tier that is invisible until asked for.
      showDevTooltips: false,
      // ON by default: every module relies on the profile, so it is kept
      // current without anyone having to think about it. OFF stops the
      // automatic captures (the 15 s background refresh, the one on returning
      // to the tab, the one at load) but NOT the "Resync now" button — the
      // profile is still there on demand, it just stops refreshing itself. A
      // module finding no profile must refuse rather than guess (rule 3), so
      // off degrades to "missing", never to wrong.
      profileAutoSync: true,
      // "Background reads" (Settings › Profile Sync; the key keeps the name it
      // had when all it did was keep the party data open, R88, so nobody's
      // choice is lost). ON by default: Profile Sync may ask the game for the
      // sections loaded modules use, from one tab, a few reads an hour, each
      // the one a visit to that page would make, and hold what a shown window
      // needs (REGISTER.md R92, profile-sync.js THE CATALOGUE). OFF: AWOO+
      // asks for nothing of its own, Sync now included, and a section updates
      // only when a page you open shows it. The automatic half also needs
      // profileAutoSync.
      profileWatch: true,
      // ---- the Control Panel (REGISTER.md R69) ----
      // 'tabs': sections in the sidebar, pages as tabs in the page. 'tree': an
      // expandable list. Both were designed; the maintainer asked for both.
      panelNav: 'tabs',
      // Modules page: one table unless asked to group; one line per module
      // unless asked for descriptions.
      cpGroupByCategory: false,
      cpCondensed: true,
      // Clicking a module in the menu. 'load' (the default) loads or unloads
      // it: the menu is where modules you do not always need are switched on.
      // 'window' only opens and closes its window.
      menuClick: 'load',
      // Update checks: 'auto' every 2 hours while the game is open (the
      // default, and how it always worked), 'load' once per page load, or
      // 'manual' only when asked. `updateNotice` is the toast when one is found.
      updateEvery: 'auto',
      updateNotice: true,
      // The menu (a command palette): 'compact' or 'wide', and what a wide
      // menu's second column shows: 'details' of the selected item, or an
      // 'overview' (Profile Sync and what needs attention). The maintainer
      // liked both and asked for the choice.
      menuLayout: 'compact',
      menuWidePanel: 'details',
      // The menu's search bar: off unless asked for (R69 round 7, the
      // maintainer: "disable search bar"). Off, the menu opens without taking
      // the keyboard; the arrow keys and Enter still move and choose.
      menuSearch: false,
      // The Control Panel's sidebar width: a setting, not a drag handle, for
      // the same reason its size is (a panel laid out for known widths).
      cpSideWidth: 'default',
      // The Control Panel stays above module windows, so loading a module
      // from it (which opens that module's window) never buries the panel.
      cpOnTop: true,
      // Tools page: one line per tool unless asked for descriptions.
      cpToolsCondensed: true,
      // Everything AWOO+ draws, scaled: 80-130 %. Type, spacing and the fixed
      // sizes of the menu and this panel follow; the game's page does not.
      uiScale: 100,
      // The top bar on its own scale (2026-09-25): off, it follows the UI
      // scale as it always has (its text scales, its height stays the nav
      // row's); on, everything in it, height included, takes barScale. The
      // bar sits in the game's own nav, where the right size is not the
      // right size for a window.
      barScaleOwn: false,
      barScale: 100,
    };
    // Wider since the Control Panel (R69): the Modules page is a table with a
    // load switch and two "shown in" columns, which did not fit 580.
    const SETTINGS_SIZES = {
      compact: { w: 640, h: 480, label: 'Compact' },
      default: { w: 740, h: 560, label: 'Default' },
      large: { w: 880, h: 660, label: 'Large' },
      tall: { w: 760, h: 820, label: 'Tall' },
      tallLarge: { w: 880, h: 820, label: 'Tall & large' },
      // Asked for 2026-09-25. Taller than a laptop screen: the window keeps
      // itself on-screen, so on a small one this is simply "as big as fits".
      tallXLarge: { w: 1040, h: 900, label: 'Tall & very large' },
    };
    const CP_SIDE_WIDTHS = { narrow: 120, default: 150, wide: 190 };
    const uiScale = () => Math.min(130, Math.max(80, Number(getSetting('uiScale')) || 100)) / 100;
    const barScale = () => Math.min(130, Math.max(80, Number(getSetting('barScale')) || 100)) / 100;
    const settingsSize = () => {
      const base = SETTINGS_SIZES[getSetting('settingsSize')] || SETTINGS_SIZES.default;
      const k = uiScale();
      return { w: Math.round(base.w * k), h: Math.round(base.h * k), label: base.label };
    };
    // One custom property carries the scale; every size token multiplies by it.
    function applyUiScale() {
      try { document.documentElement.style.setProperty('--awoo-ui-scale', String(uiScale())); } catch (e) { /* no document yet */ }
    }
    // The bar's own scale is the same custom property, set on the bar itself:
    // everything inside it that is sized from --awoo-ui-scale reads the
    // nearer value. --awoo-bar-k sizes what the UI scale deliberately leaves
    // alone (the bar's height, its icon), and is 1 unless the bar has its own.
    function applyBarScale(el) {
      try {
        const g = el || (coreUi && coreUi.group) || document.getElementById('awoo-core-group');
        if (!g) return;
        if (getSetting('barScaleOwn') === true) {
          g.style.setProperty('--awoo-ui-scale', String(barScale()));
          g.style.setProperty('--awoo-bar-k', String(barScale()));
        } else {
          g.style.removeProperty('--awoo-ui-scale');
          g.style.removeProperty('--awoo-bar-k');
        }
      } catch (e) { /* no bar yet: applied when it is built */ }
    }
    function applyCpSideWidth() {
      const w = CP_SIDE_WIDTHS[getSetting('cpSideWidth')] || CP_SIDE_WIDTHS.default;
      try { document.documentElement.style.setProperty('--awoo-cp-side', w + 'px'); } catch (e) { /* no document yet */ }
    }
    let settings = Object.assign({}, SETTINGS_DEFAULTS);
    // Applied once settings are read (below) and on every change (setSetting).
    try {
      const rawSettings = localStorage.getItem(SETTINGS_KEY);
      if (rawSettings) {
        const stored = JSON.parse(rawSettings);
        Object.assign(settings, stored);
        // v6.1-v11 stored the theme as a boolean. true meant "follow the game
        // live", which is exactly Match game; false meant the Turquoise
        // snapshot, which is the default anyway.
        if (stored && stored.theme == null && stored.liveAdaptTheme === true) settings.theme = 'matchGame';
        delete settings.liveAdaptTheme;
      }
    } catch (e) { /* ignore, defaults stand */ }
    function getSetting(key) { return settings[key]; }
    function setSetting(key, value) {
      settings[key] = value;
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
      if (key === 'theme') applyThemeMode();
      if (key === 'fonts') applyOverlayFonts();
      if (key === 'showDevTooltips') syncDevIcons();
      if (key === 'uiScale') applyUiScale();
      if (key === 'barScaleOwn' || key === 'barScale') applyBarScale();
      if (key === 'cpSideWidth') applyCpSideWidth();
      // Every already-open window picks up an on/off flip immediately, not
      // only the next time it happens to be opened fresh.
      if (key === 'windowResizingEnabled') {
        for (const id in windowRegistry) windowRegistry[id].applyResizability();
      }
      // Profile Sync lives outside this scope (src/core/profile-sync.js), so it
      // hears about the flip as an event and reads the value via Core.profile.
      if (key === 'profileWatch') {
        try { window.dispatchEvent(new CustomEvent('awoo:profile:watch', { detail: !!value })); } catch (e) { /* ignore */ }
      }
      if (key === 'profileAutoSync') {
        try { window.dispatchEvent(new CustomEvent('awoo:profile:auto-sync', { detail: !!value })); } catch (e) { /* ignore */ }
        renderProfileRow();
      }
    }

    // ---- theming: one token contract, nine choices (DESIGN.md §7) ----
    //
    // The seven named themes are the SAME seven the tools wear, from the same
    // source: src/tools/theme-tokens.css. build.mjs parses that file and
    // generates the array below in place of the empty one, so a palette
    // correction reaches the overlay and every tool on one rebuild and there
    // is no second copy of any hex in this file. (The raw src/ file therefore
    // carries an empty list; only the built script has themes, and
    // applyThemeMode falls back to Turquoise if the list is somehow empty.)
    //
    // Each entry: { id, label, mode: 'light'|'dark', t: { <contract token>: value } }.
    const THEME_CONTRACT = [{"id":"beach","label":"Beach (light)","mode":"light","t":{"ground":"#EFE7D7","surface":"#FAF5EC","surface-2":"#F1E8D8","surface-3":"#E7DCC7","border":"#D8CBB2","border-strong":"#C3B193","border-control":"#8C7D64","ink":"#33291D","ink-soft":"#6B5C48","ink-mute":"#94836C","accent":"#8A4322","accent-fill":"#A8552C","accent-edge":"#D4AB93","bg-accent":"#F3E2D8","on-accent":"#FBF0E6","success":"#3F5C33","success-fill":"#4A6741","bg-success":"#E4EBDC","danger":"#8C2F2A","danger-fill":"#A83A33","bg-danger":"#F5E0DD","info":"#41528A","bg-info":"#E2E5F2","neutral":"#6E5F49","bg-neutral":"#EDE4D3","dev":"#2E6B5C","bg-dev":"#DCEBE6","shadow":"0 1px 2px rgba(60,50,35,.07),0 4px 14px rgba(60,50,35,.06)"}},{"id":"beach-dim","label":"Beach (dimmed)","mode":"dark","t":{"ground":"#17181A","surface":"#1E2022","surface-2":"#25282A","surface-3":"#2E3134","border":"#33373A","border-strong":"#4A4F53","border-control":"#6D7378","ink":"#E6E4E0","ink-soft":"#A8A49D","ink-mute":"#7C7872","accent":"#F2B189","accent-fill":"#CC7A50","accent-edge":"#5C412C","bg-accent":"#31241A","on-accent":"#1B0D05","success":"#7CC49A","success-fill":"#3F8A61","bg-success":"#17301F","danger":"#EB8272","danger-fill":"#C0453A","bg-danger":"#341D1B","info":"#A3AEDD","bg-info":"#1F2130","neutral":"#A09B92","bg-neutral":"#26282A","dev":"#7FC9B8","bg-dev":"#16302A","shadow":"0 1px 2px rgba(0,0,0,.4),0 6px 20px rgba(0,0,0,.34)"}},{"id":"slate","label":"Slate","mode":"dark","t":{"ground":"#14181D","surface":"#1B2027","surface-2":"#20262D","surface-3":"#272F37","border":"#2B323A","border-strong":"#3A434C","border-control":"#6A7684","ink":"#E8EAEB","ink-soft":"#A9B0B6","ink-mute":"#78828B","accent":"#E3B36B","accent-fill":"#C4923F","accent-edge":"#5A4522","bg-accent":"#2E2412","on-accent":"#241300","success":"#84C4AA","success-fill":"#4F8C74","bg-success":"#172E25","danger":"#E28270","danger-fill":"#C1503C","bg-danger":"#351F1A","info":"#B4A4E0","bg-info":"#241F36","neutral":"#9AA6B2","bg-neutral":"#222A32","dev":"#78C8BC","bg-dev":"#14302C","shadow":"0 1px 2px rgba(0,0,0,.4),0 6px 20px rgba(0,0,0,.34)"}},{"id":"claude","label":"Claude (light)","mode":"light","t":{"ground":"#F0EEE6","surface":"#FFFFFF","surface-2":"#F7F6F1","surface-3":"#EBE9E0","border":"#DEDACE","border-strong":"#C5C0B2","border-control":"#8A8474","ink":"#191917","ink-soft":"#57544C","ink-mute":"#84806F","accent":"#A8461F","accent-fill":"#B4552F","accent-edge":"#DEB49F","bg-accent":"#F7E6DD","on-accent":"#FFF4EE","success":"#276048","success-fill":"#317055","bg-success":"#D3E8DC","danger":"#9E2B22","danger-fill":"#BE4034","bg-danger":"#F8E2DF","info":"#474C93","bg-info":"#E5E6F4","neutral":"#6B6759","bg-neutral":"#EDEBE2","dev":"#256657","bg-dev":"#D8EBE5","shadow":"0 1px 2px rgba(60,50,35,.07),0 4px 14px rgba(60,50,35,.06)"}},{"id":"claude-med","label":"Claude (medium)","mode":"dark","t":{"ground":"#26241F","surface":"#2F2D27","surface-2":"#37352E","surface-3":"#403D35","border":"#454239","border-strong":"#5C5849","border-control":"#807A68","ink":"#EDEAE0","ink-soft":"#B3AE9E","ink-mute":"#8A8676","accent":"#EFA189","accent-fill":"#C26A4F","accent-edge":"#66452F","bg-accent":"#3B2A1E","on-accent":"#1C0C03","success":"#84C6A2","success-fill":"#3C8A63","bg-success":"#22342A","danger":"#EE8B79","danger-fill":"#BC4739","bg-danger":"#3B2622","info":"#AFA8E2","bg-info":"#2B2839","neutral":"#A8A292","bg-neutral":"#343128","dev":"#82C9B9","bg-dev":"#1F3330","shadow":"0 1px 2px rgba(0,0,0,.4),0 6px 20px rgba(0,0,0,.34)"}},{"id":"claude-dark","label":"Claude (dark)","mode":"dark","t":{"ground":"#141312","surface":"#1C1B19","surface-2":"#232220","surface-3":"#2C2A27","border":"#31302C","border-strong":"#47443E","border-control":"#6E6A61","ink":"#EFECE3","ink-soft":"#ACA79A","ink-mute":"#7E7A6E","accent":"#F0A791","accent-fill":"#C36E52","accent-edge":"#523A26","bg-accent":"#2B1D14","on-accent":"#1A0A02","success":"#82C9A3","success-fill":"#3E8F66","bg-success":"#14291D","danger":"#F0907E","danger-fill":"#C24A3B","bg-danger":"#2E1B18","info":"#B3ABE6","bg-info":"#211E2E","neutral":"#A5A092","bg-neutral":"#26241F","dev":"#7FCBBA","bg-dev":"#132A26","shadow":"0 1px 2px rgba(0,0,0,.4),0 6px 20px rgba(0,0,0,.34)"}},{"id":"claude-code","label":"Claude Code","mode":"dark","t":{"ground":"#1F1E1D","surface":"#262625","surface-2":"#2E2E2C","surface-3":"#383836","border":"#3A3A38","border-strong":"#54544F","border-control":"#787870","ink":"#F5F4EF","ink-soft":"#B4B2A7","ink-mute":"#88867C","accent":"#E39070","accent-fill":"#C2613F","accent-edge":"#4A3227","bg-accent":"#33221B","on-accent":"#1A0A04","success":"#7FC49E","success-fill":"#3C8961","bg-success":"#1C2E23","danger":"#EE8B78","danger-fill":"#BF4A39","bg-danger":"#33211D","info":"#ADA6E0","bg-info":"#28253A","neutral":"#A3A198","bg-neutral":"#2C2C2A","dev":"#7DC6B6","bg-dev":"#1B2E2A","shadow":"0 1px 2px rgba(0,0,0,.4),0 6px 20px rgba(0,0,0,.34)"}}] /* GENERATED from src/tools/theme-tokens.css */;

    // THE PUBLIC CHANGELOG, generated the same way from
    // src/awoo-core.changelog.md (build.mjs changelog(), which also refuses a
    // line that names anything private). Each entry: { title, date, lines }.
    // Shown on General › Changelog; the raw src/ file carries an empty list.
    const CHANGELOG = [{"title":"7.0.4","date":"2026-09-25","lines":["A new Control Panel: settings grouped into General, Appearance and Modules, each with its own pages","The AWOO+ menu is a quick list you can search, with a right-click menu on every module","Load or switch off each module; a module that is off does not run at all","A calmer look that follows your theme, with a UI scale, a separate top-bar scale and more panel sizes","Profile Sync has its own top-bar icon that shows how fresh your data is","Choose how often AWOO+ checks for updates; a Diagnostics page shows what is running","Every settings page has Defaults and Reset side by side","Dungeon Win Rate: Clear now clears the results completely","Runs on Queslar 2 only"]},{"title":"7.0.3","date":"2026-09-24","lines":["Profile Sync reads more of your profile and shows how old each part is"]},{"title":"7.0.2","date":"2026-09-23","lines":["Dungeon Win Rate and Sculpture Grid Labels are now part of AWOO+: one script to install","Cost Tables opens from the Tools menu","A small diagnostics check-in helps fix problems; it never includes your inventory, currencies or login details","Profile Sync keeps what it read on a page after you move on"]},{"title":"7.0.1","date":"2026-09-22","lines":["Appearance settings: themes, number format and fonts","Export and import your settings","Tools follow your theme and the game's number format"]},{"title":"7.0.0","date":"2026-09-18","lines":["Apoz Core becomes AWOO+"]}] /* GENERATED from src/awoo-core.changelog.md */;

    // GAME-SHAPED presets: eight values in the GAME's own vocabulary (--card,
    // --primary, ...), rather than our contract. "AWOO Turquoise" is the
    // user's own real `.dark{}` theme block (given 2026-09-07) — oklch() and
    // hex mixed exactly as supplied; every browser this runs in renders
    // oklch() natively (the game's own CSS uses it too). Kept exactly,
    // because it is what every installed user is looking at today.
    const THEME_PRESETS = {
      awooTurquoise: {
        card: 'oklch(0.19 0.012 215)', border: '#392e22', primary: '#3e959a',
        'primary-foreground': 'oklch(0.98 0.01 200)', input: '#4e4137',
        foreground: 'oklch(0.92 0.018 55)', popover: 'oklch(0.18 0.012 215)',
        'popover-foreground': 'oklch(0.92 0.015 215)',
      },
    };
    // The eight game variables every existing module and every line of Core's
    // chrome reads as --awoo-<name>. They are published for EVERY theme, so a
    // module written against them follows a named theme without being touched
    // (DESIGN.md's migration rule: adopt the contract when you are already
    // changing a module, not because a system arrived).
    const THEME_TOKENS = Object.keys(THEME_PRESETS.awooTurquoise);

    const THEME_CHOICES = () => [
      { id: 'awooTurquoise', label: 'AWOO Turquoise' },
      ...THEME_CONTRACT.map((t) => ({ id: t.id, label: t.label })),
      { id: 'matchGame', label: 'Match game (experimental)' },
    ];
    const contractTheme = (id) => THEME_CONTRACT.find((t) => t.id === id) || null;
    function themeId() {
      const id = getSetting('theme');
      if (id === 'awooTurquoise') return id;
      // Match game derives its semantic hues from Slate; without the
      // generated list there is no Slate, so it would paint half a theme.
      if (id === 'matchGame') return contractTheme('slate') ? id : SETTINGS_DEFAULTS.theme;
      if (contractTheme(id)) return id;
      return SETTINGS_DEFAULTS.theme;
    }

    // A NAMED theme, contract -> legacy. The contract is published as-is
    // (--awoo-surface, --awoo-ink, --awoo-danger, ...) and the eight legacy
    // names are derived from it by what Core's chrome USES them for:
    //   card <- surface (window ground), popover <- surface-2 (button hover),
    //   input <- surface-3 (control fill and row hover — Core paints controls
    //   WITH --input, it does not outline them), foreground and
    //   popover-foreground <- ink (window text; ink-soft would dim all of it),
    //   primary <- accent-fill, primary-foreground <- on-accent.
    // warn has no contract token: it is the theme's accent text, which in
    // every one of the seven is the amber or terracotta the old #e0a23e meant.
    function namedThemeVars(t) {
      const v = Object.assign({}, t.t);
      Object.assign(v, {
        card: v.surface, popover: v['surface-2'], input: v['surface-3'],
        foreground: v.ink, 'popover-foreground': v.ink,
        primary: v['accent-fill'], 'primary-foreground': v['on-accent'],
        warn: v.accent,
        // 1 on a light ground, 0 on a dark one. For IDENTITY colours a module
        // keeps literal (a stat's own hue): color-mix(in oklab, <hex>
        // calc(100% - var(--awoo-light, 0) * 60%), var(--awoo-ink)) darkens
        // them toward ink on a light theme only, and leaves every dark theme
        // — the default included — exactly as it was.
        light: t.mode === 'light' ? '1' : '0',
      });
      // Every contract colour is opaque, so the solid twin is the same value.
      for (const key of THEME_TOKENS) v[`solid-${key}`] = v[key];
      return v;
    }

    // A GAME-SHAPED theme, legacy -> contract: the mapping in section 08 of
    // the Design System artifact. Eight values are published by the game;
    // the rest are derived from them with color-mix() — live, so Match game
    // follows the game's own theme without a re-snapshot — and the semantic
    // hues, which the game does not publish at all, come from Slate, which is
    // hue-neutral enough to sit on any ground.
    //
    // THE SOLID TWIN IS DELIBERATE AND STAYS. The game's --card/--popover are
    // likely translucent, meant to sit over a backdrop-blur the game provides;
    // a floating tooltip or menu has no such ancestor and shows whatever is
    // behind it (a REPORTED bug). So --awoo-solid-* is always opaque: the
    // literal for Turquoise, and for Match game the game's own colour with its
    // alpha forced to 1 by relative colour syntax — or, where the browser
    // cannot do that, Slate's opaque value rather than a see-through panel.
    function gameShapedVars(legacy, solid) {
      const slate = contractTheme('slate');
      const s = slate ? slate.t : {};
      const v = {};
      for (const key of THEME_TOKENS) { v[key] = legacy[key]; v[`solid-${key}`] = solid[key]; }
      const mix = (a, pct, b) => `color-mix(in oklab, ${a} ${pct}%, ${b})`;
      Object.assign(v, {
        surface: 'var(--awoo-card)', 'surface-2': 'var(--awoo-popover)',
        'border-control': 'var(--awoo-input)', ink: 'var(--awoo-foreground)',
        'ink-soft': 'var(--awoo-popover-foreground)', 'accent-fill': 'var(--awoo-primary)',
        'on-accent': 'var(--awoo-primary-foreground)',
        ground: mix('var(--awoo-card)', 88, 'black'),
        'surface-3': mix('var(--awoo-card)', 92, 'white'),
        'border-strong': mix('var(--awoo-border)', 50, 'var(--awoo-input)'),
        'ink-mute': mix('var(--awoo-foreground)', 55, 'var(--awoo-card)'),
        accent: mix('var(--awoo-primary)', 70, 'var(--awoo-foreground)'),
        'accent-edge': mix('var(--awoo-primary)', 30, 'var(--awoo-card)'),
        'bg-accent': mix('var(--awoo-primary)', 12, 'var(--awoo-card)'),
      });
      for (const key of ['success', 'success-fill', 'bg-success', 'danger', 'danger-fill', 'bg-danger',
        'info', 'bg-info', 'neutral', 'bg-neutral', 'dev', 'bg-dev', 'shadow']) {
        if (s[key] != null) v[key] = s[key];
      }
      if (s.accent != null) v.warn = s.accent;
      // Treated as dark. Turquoise is; Match game takes its semantic hues from
      // Slate, which already assumes a dark ground. A light game palette, if
      // one exists, has not been captured and would need its own check.
      v.light = '0';
      return v;
    }

    function themeVars(id) {
      const named = contractTheme(id);
      if (named) return namedThemeVars(named);
      const slate = contractTheme('slate');
      if (id === 'matchGame' && slate) {
        const fb = namedThemeVars(slate);
        const live = {}, solid = {};
        let relative = false;
        try { relative = !!(window.CSS && CSS.supports('color', 'rgb(from red r g b / 1)')); } catch (e) { /* no */ }
        for (const key of THEME_TOKENS) {
          live[key] = `var(--${key}, ${fb[key]})`;
          solid[key] = relative ? `rgb(from var(--${key}, ${fb[key]}) r g b / 1)` : fb[key];
        }
        return gameShapedVars(live, solid);
      }
      const tq = THEME_PRESETS.awooTurquoise;
      return gameShapedVars(tq, tq);
    }

    let appliedThemeKeys = [];
    function applyThemeMode() {
      const root = document.documentElement;
      if (!root || !root.style || typeof root.style.setProperty !== 'function') return;
      const vars = themeVars(themeId());
      for (const key of appliedThemeKeys) if (!(key in vars)) root.style.removeProperty(`--awoo-${key}`);
      for (const key of Object.keys(vars)) root.style.setProperty(`--awoo-${key}`, vars[key]);
      appliedThemeKeys = Object.keys(vars);
      applyOverlayFonts();
      injectTokenStyleOnce();
    }

    // What a tool needs to dress itself like the overlay. Handed over at
    // open time as window.AWOO_APPEARANCE (see toolHtml below): a tool opens
    // in its own tab and cannot read this page. Plain data, no functions.
    function appearance() {
      // The player's number convention travels too (2026-09-21). A tool opened
      // in its own tab cannot read the game, so Cost Tables' "Match game"
      // number setting fell back to the browser's separators and to letters —
      // the same browser-over-game bug the overlay had. A locale is only
      // handed over when it is the GAME's (or the player's override), never a
      // browser guess; formatting only when the game's own setting was read.
      const c = getConvention();
      let formatting = null;
      try { formatting = probeNumberFormattingFromFiber(); } catch (e) { formatting = null; }
      return {
        theme: themeId(),
        dev: !!getSetting('showDevTooltips'),
        fonts: { tools: fontsFor('tools') },
        number: {
          locale: ['setting', 'remembered', 'override'].includes(c.source) ? c.numberLocale : null,
          formatting,
        },
      };
    }

    // ---- fonts (Settings > Fonts) ----
    //
    // The same two lists the tools read (src/tools/tool-settings.js);
    // userscripts/tests/tool-theme-contract.mjs fails if they drift. Public Sans is the
    // settled face for text AND numbers — tabular figures give the fixed digit
    // width a column needs, and its zero measures clear. Roboto Mono is
    // offered because it was asked for, and labelled: its zero is marked.
    //
    // The overlay's stack keeps the old Lato chain behind the chosen face, so
    // a page that blocks the font request degrades to exactly the old look.
    const FONT_CHOICES = {
      text: [
        { id: 'public', label: 'Public Sans', family: 'Public+Sans:wght@400;500;600;700', stack: "'Public Sans'" },
        { id: 'open', label: 'Open Sans', family: 'Open+Sans:wght@400;500;600;700', stack: "'Open Sans'" },
        { id: 'figtree', label: 'Figtree', family: 'Figtree:wght@400;500;600;700', stack: "'Figtree'" },
      ],
      num: [
        { id: 'public', label: 'Public Sans', family: 'Public+Sans:wght@400;500;600;700', stack: "'Public Sans'" },
        { id: 'roboto', label: 'Roboto Mono (marked 0)', family: 'Roboto+Mono:wght@400;500;600', stack: "'Roboto Mono'" },
      ],
    };
    const fontChoice = (kind, id) => FONT_CHOICES[kind].find((f) => f.id === id) || FONT_CHOICES[kind][0];
    function fontsFor(surface) {
      const all = getSetting('fonts') || {};
      const s = (all && all[surface]) || {};
      return { text: fontChoice('text', s.text).id, num: fontChoice('num', s.num).id };
    }
    // One <link> per family, added only when that face is actually chosen or
    // previewed — nothing is fetched for a face nobody picked.
    function loadFontFamily(family) {
      if (!family || !document.head) return;
      if (document.head.querySelector(`link[data-awoo-font="${family}"]`)) return;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
      link.setAttribute('data-awoo-font', family);
      document.head.appendChild(link);
    }
    function applyOverlayFonts() {
      const root = document.documentElement;
      if (!root || !root.style || typeof root.style.setProperty !== 'function') return;
      const f = fontsFor('awoo');
      const text = fontChoice('text', f.text), num = fontChoice('num', f.num);
      loadFontFamily(text.family);
      loadFontFamily(num.family);
      root.style.setProperty('--awoo-font', `${text.stack}, ${CORE_FONT}`);
      root.style.setProperty('--awoo-font-num', `${num.stack}, ${CORE_FONT}`);
    }

    // A tool payload with the page's handover prepended — AFTER the doctype
    // and charset build.mjs puts first, because a <script> ahead of the
    // doctype drops the page into quirks mode, where <table> stops
    // inheriting colour. `extra` is { NAME: value } for any further
    // window.NAME a tool expects (AWOO_LIVE, AWOO_INITIAL_PROFILE). JSON is
    // escaped so no value can close the script element early.
    function toolHtml(html, extra) {
      const assign = Object.assign({ AWOO_APPEARANCE: appearance() }, extra || {});
      const body = Object.keys(assign)
        .map((k) => `window.${k}=${JSON.stringify(assign[k]).replace(/</g, '\\u003c')};`).join('');
      const script = `<script>${body}</script>\n`;
      const m = /^\s*<!doctype html>\s*(<meta charset="utf-8">\s*)?/i.exec(html);
      if (!m) return script + html;
      return html.slice(0, m[0].length) + script + html.slice(m[0].length);
    }

    // ---- settings backup: export and import everything (2026-09-21) ----
    //
    // Reinstalling a script, or moving to another browser, used to mean
    // setting every module, tool, window and theme up again by hand. A backup
    // is one JSON file holding every AWOO+ key on this origin: Core's settings,
    // every module's state, every window's position and size, and every tool's
    // settings (a tool opens as a blob URL, which shares this page's origin,
    // so its localStorage IS this page's).
    //
    // What stays out, and why each is a deliberate answer:
    //   awoo:profile:*     your character's data, not a setting; it re-syncs.
    //   awoo:core:updates  a cache of the last update check; stale on arrival.
    //   the Companion token  a credential, regenerated every time the host
    //                      starts. The address is kept, the token never leaves.
    // Import MERGES: a key in the file replaces yours, a key it does not name
    // is left alone, and a token you already have is never overwritten.
    const BACKUP_FORMAT = 'awoo-settings';
    const BACKUP_VERSION = 1;
    const BACKUP_HOST_KEY = 'awoo:core:host';
    function backupWanted(key) {
      if (typeof key !== 'string') return false;
      if (key.startsWith('awoo:profile:') || key === 'awoo:core:updates') return false;
      return key.startsWith('awoo') || key.startsWith('petSlotROI.')
        || key.startsWith('explCeiling.') || key === 'AWOO_SCULPTURE_OPT_STATE';
    }
    function collectBackup(storage) {
      storage = storage || localStorage;
      const keys = {};
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!backupWanted(key)) continue;
        let value = storage.getItem(key);
        if (value == null) continue;
        if (key === BACKUP_HOST_KEY) {
          try { const cfg = JSON.parse(value); delete cfg.token; value = JSON.stringify(cfg); } catch (e) { continue; }
        }
        keys[key] = value;
      }
      return {
        format: BACKUP_FORMAT, version: BACKUP_VERSION, core: AWOO_CORE_VERSION,
        exportedAt: new Date().toISOString(), keys,
      };
    }
    // Returns { ok, count } or { ok: false, reason } — a refusal names why
    // (DESIGN.md §5: a refusal is a result, and it is shown).
    function checkBackup(data) {
      if (!data || typeof data !== 'object') return { ok: false, reason: 'not a settings file' };
      if (data.format !== BACKUP_FORMAT) return { ok: false, reason: 'not an AWOO+ settings file' };
      if (typeof data.version !== 'number' || data.version > BACKUP_VERSION) {
        return { ok: false, reason: 'made by a newer AWOO+ — update first' };
      }
      if (!data.keys || typeof data.keys !== 'object') return { ok: false, reason: 'the file holds no settings' };
      const count = Object.keys(data.keys).filter((k) => backupWanted(k) && typeof data.keys[k] === 'string').length;
      if (!count) return { ok: false, reason: 'the file holds no settings' };
      return { ok: true, count };
    }
    function applyBackup(data, storage) {
      storage = storage || localStorage;
      const check = checkBackup(data);
      if (!check.ok) return check;
      let count = 0;
      for (const key of Object.keys(data.keys)) {
        const value = data.keys[key];
        if (!backupWanted(key) || typeof value !== 'string') continue;
        if (key === BACKUP_HOST_KEY) {
          let incoming, mine = {};
          try { incoming = JSON.parse(value); } catch (e) { continue; }
          try { mine = JSON.parse(storage.getItem(key) || '{}') || {}; } catch (e) { mine = {}; }
          delete incoming.token;
          storage.setItem(key, JSON.stringify(Object.assign({}, mine, incoming, mine.token ? { token: mine.token } : {})));
        } else {
          storage.setItem(key, value);
        }
        count++;
      }
      return { ok: true, count };
    }

    // ---- the scale layer (DESIGN.md §2, values picked 2026-09-08) ----
    //
    // Core tokenised COLOR and nothing else, so size, spacing and emphasis were
    // literals at every call site and consistency between two modules depended
    // on the second author remembering what the first one typed. It did not
    // hold — that is the whole of the "these look like different products"
    // report. `userscripts/tests/design-tokens.mjs` measures the remaining
    // drift as a ratchet and prints the count; nothing states one.
    //
    // These are constants, not theme-dependent, so they live in a stylesheet
    // rather than being written onto documentElement per theme flip. Injected
    // from applyThemeMode() because that is the one function BOTH entry points
    // (injectWindowStyleOnce, buildUi) already call before styling anything.
    //
    // Two of the roundings are role decisions rather than nearest-neighbour,
    // and both favour the data: 11.5px split, with table cells and menu items
    // going UP to --awoo-fs-body because they carry what you came to read, and
    // labels going DOWN to --awoo-fs-control.
    const TOKEN_STYLE_ID = 'awoo-token-style';
    function injectTokenStyleOnce() {
      if (!document.head || document.getElementById(TOKEN_STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = TOKEN_STYLE_ID;
      style.textContent = `
        :root {
          /* type */
          --awoo-fs-micro: calc(9px * var(--awoo-ui-scale, 1));    /* section labels, version tags */
          --awoo-fs-caption: calc(10px * var(--awoo-ui-scale, 1)); /* table headers, tooltips */
          --awoo-fs-control: calc(11px * var(--awoo-ui-scale, 1)); /* buttons, field labels */
          --awoo-fs-body: calc(12px * var(--awoo-ui-scale, 1));    /* window base, table cells, menu items */
          --awoo-fs-title: calc(13px * var(--awoo-ui-scale, 1));   /* window and modal titles */
          /* 24px measured as too loud once a countdown sat in it every second.
             Changed here rather than overridden per-module: it is the display
             STEP, and a module that wants a quieter one wants the step quieter. */
          --awoo-fs-display: calc(20px * var(--awoo-ui-scale, 1)); /* the ONE number a window exists to show */
          /* space */
          --awoo-s1: calc(2px * var(--awoo-ui-scale, 1)); --awoo-s2: calc(4px * var(--awoo-ui-scale, 1));
          --awoo-s3: calc(6px * var(--awoo-ui-scale, 1)); --awoo-s4: calc(8px * var(--awoo-ui-scale, 1));
          --awoo-s5: calc(12px * var(--awoo-ui-scale, 1)); --awoo-s6: calc(16px * var(--awoo-ui-scale, 1));
          /* radius: controls / containers / windows */
          --awoo-r-sm: 4px; --awoo-r-md: 6px; --awoo-r-lg: 8px;
          /* emphasis — four levels, because hierarchy carried by fourteen
             opacities is why the overlay read flat: everything was the same
             colour at a different strength, so nothing was ever foreground */
          --awoo-em-strong: 1; --awoo-em-normal: .85;
          --awoo-em-muted: .55; --awoo-em-faint: .4;
          /* HOVER AND SELECTION ARE A TINT OF THE THEME'S OWN ACCENT, never a
             fixed grey step (the maintainer, R69 round 6): the old grey
             --awoo-input fill read as washed out in every theme but Slate,
             because a grey step has no hue of its own to agree with the
             theme. Mixed live, so it follows a theme change and Match game. */
          --awoo-hover: color-mix(in oklab, var(--awoo-accent) 12%, var(--awoo-card));
          --awoo-selected: color-mix(in oklab, var(--awoo-accent) 17%, var(--awoo-card));
          /* semantic — meaning, not appearance. Muted variants are DERIVED
             (color-mix against the token), never hand-picked: two ambers one
             digit apart shipped for months because there was no token to
             point at. */
          /* --awoo-danger / --awoo-warn / --awoo-success are set per THEME by
             applyThemeMode, never here. This line used to define
             each of the three as a var() of ITSELF — a find-and-replace of the old
             #e0483e / #e0a23e / #3ecf6a literals (Core v11, f9b0781) that also
             rewrote their own definitions. A custom property that refers to
             itself is invalid, so every danger, warn and success colour in the
             overlay silently rendered as plain inherited text from then on. */
          /* the label column every label/value grid shares, so sibling groups
             align with each OTHER and not merely within themselves (§4) */
          --awoo-label-col: 92px;
          --awoo-font: ${CORE_FONT};
        }
        /* One template for every label/value list in a window. The value
           column is ALWAYS left-aligned and the trailing unit column is a
           fixed ch width, so a readout that gains a digit cannot resize the
           control beside it — the mechanism behind the reported alarm drift. */
        .awoo-ui-rows { display: grid; align-items: center; gap: var(--awoo-s3) var(--awoo-s4);
          grid-template-columns: var(--awoo-label-col) minmax(0, 1fr) 4.5ch;
          font-size: var(--awoo-fs-control); }
        .awoo-ui-rows > .k { opacity: var(--awoo-em-muted); }
        .awoo-ui-rows > .v { opacity: var(--awoo-em-normal); font-variant-numeric: tabular-nums; }
        .awoo-ui-rows > .t { text-align: right; opacity: var(--awoo-em-muted);
          font-variant-numeric: tabular-nums; }
        .awoo-ui-rows > .wide { grid-column: 1 / -1; }
        .awoo-ui-rows input, .awoo-ui-rows select { font: inherit;
          font-size: var(--awoo-fs-control); background: var(--awoo-input);
          color: var(--awoo-foreground); border: 1px solid var(--awoo-border);
          border-radius: var(--awoo-r-sm); padding: var(--awoo-s1) var(--awoo-s2);
          width: 100%; box-sizing: border-box; font-variant-numeric: tabular-nums; }
        /* Any digits that sit in a column line up. Without this a countdown
           reflows on every tick, because digit glyphs are not equal width. */
        .awoo-num { font-variant-numeric: tabular-nums;
          /* The overlay's number face (Settings > Fonts). Only readouts marked
             .awoo-num take it: a table cell holding a name must not turn into
             Roboto Mono because someone chose it for figures. */
          font-family: var(--awoo-font-num); }
      `;
      document.head.appendChild(style);
    }

    // ---- number format — shared, because every module must parse identically ----
    //
    // How the GAME does it (bundle: NumberDisplay-*.js + utils-*.js, v1.2.3.11):
    // it formats through `Intl.NumberFormat(LOCALE_MAP[numberLocale])`, where
    // `numberLocale` is a per-character server setting with exactly three values.
    // A separate `numberFormatting` setting picks standard | exponential | letters.
    //
    // So separators are DERIVED from Intl exactly as the game derives them —
    // never assumed, and never inferred from a single ambiguous string. This is
    // the whole reason "1.234" is safe: we know the convention before we parse.
    const NUMBER_LOCALE_MAP = {
      'Local': navigator.language || 'en-US',
      '1.000,00': 'de-DE',
      '1,000.00': 'en-US',
    };
    // full suffix ladder from the game's own array — not just k/m/b/t
    const SUFFIX_POW = {
      k: 1, m: 2, b: 3, t: 4, qa: 5, qi: 6, sx: 7, sp: 8, oc: 9, no: 10, dc: 11, ud: 12,
    };
    const OVERRIDE_KEY = 'awoo:core:number-locale';

    function separatorsFor(locale) {
      try {
        const parts = new Intl.NumberFormat(locale).formatToParts(1234567.8);
        const group = (parts.find((p) => p.type === 'group') || {}).value || ',';
        const decimal = (parts.find((p) => p.type === 'decimal') || {}).value || '.';
        return { locale, group, decimal };
      } catch (e) {
        return { locale: 'en-US', group: ',', decimal: '.' };
      }
    }

    // ---- shared UI geometry (v6) ----
    //
    // ROOT CAUSE of a reported bug: nothing anywhere re-checked a window's or
    // the dropdown's position against the CURRENT viewport. A position computed
    // once (at open time, or at the end of a drag) was trusted forever, so a
    // small browser window or an edge-anchored default silently produced a
    // panel that opens partially or wholly off-screen — the dropdown's own
    // bug (opens right-anchored, no width check, overflows the right edge)
    // was one symptom of this, not a dropdown-specific defect. Fixed once,
    // here, and reused by every window, the dropdown, and the browser-resize
    // re-clamp pass below — not patched at each call site.
    //
    // Pure, no DOM: unit-testable directly (userscripts/tests/core-ui-geometry.mjs).
    // A DEGENERATE VIEWPORT IS A REAL STATE, NOT A HYPOTHETICAL. Core runs at
    // document-start, and `window.innerWidth/innerHeight` are 0 before the page
    // has been laid out — and stay 0 in a backgrounded or zero-sized frame.
    // Reading 0 and believing it is how every window ends up 72x72 (see
    // clampRectToViewport), which is the most likely root of the long-standing
    // "windows start very small and always have to be expanded" report.
    //
    // So: fall back through the measurements that can still be right, and
    // report 0 only when everything genuinely is 0 — the clamp then knows to
    // leave the rect alone rather than crush it.
    function viewportRect() {
      const de = document.documentElement;
      return {
        w: window.innerWidth || (de && de.clientWidth) || 0,
        h: window.innerHeight || (de && de.clientHeight) || 0,
      };
    }

    // Keeps at least `minVisible` px of `rect` reachable inside `viewport` on
    // every edge it could be dragged past. The header must never go ABOVE the
    // top edge (there would be nothing left to grab to pull it back), so `y`
    // never goes negative; left/right/bottom may partially overflow down to
    // `minVisible` px remaining on-screen, matching how most window managers
    // behave and giving a drag somewhere to rest short of a hard stop.
    function clampRectToViewport(rect, viewport, opts) {
      opts = opts || {};
      const minVisible = opts.minVisible == null ? 72 : opts.minVisible;
      const margin = opts.margin == null ? 4 : opts.margin;
      // NOTHING TO CLAMP TO. A viewport of 0 (or negative) is not a very small
      // screen, it is a measurement that has not happened yet — before layout,
      // in a hidden frame, in a zero-sized pane. Clamping against it produces a
      // minVisible x minVisible window: measured, a 460x560 Settings panel
      // becomes 72x72, which then gets PERSISTED and looks like a bug in the
      // window framework forever after. Returning the rect untouched leaves a
      // window that may be off-screen for one frame, which the next resize or
      // reanchor corrects — strictly better than one nobody can read.
      if (!(viewport.w > 0) || !(viewport.h > 0)) return { ...rect };
      const w = Math.min(rect.w, Math.max(minVisible, viewport.w - margin * 2));
      const h = Math.min(rect.h, Math.max(minVisible, viewport.h - margin * 2));
      const minX = margin - (w - minVisible);
      const maxX = Math.max(minX, viewport.w - margin - minVisible);
      const minY = margin;
      const maxY = Math.max(minY, viewport.h - margin - minVisible);
      return {
        x: Math.max(minX, Math.min(maxX, rect.x)),
        y: Math.max(minY, Math.min(maxY, rect.y)),
        w, h,
      };
    }

    // The dropdown-off-screen fix, generalised: prefer left-aligned-below the
    // anchor; flip to right-aligned/grow-leftward if the preferred rect would
    // overflow the right edge, and flip upward if it would overflow the
    // bottom. A final clampRectToViewport is a safety net for a viewport
    // smaller than the menu itself, not the primary mechanism.
    // ---- the tooltip singleton (v11) ----
    //
    // ONE element, on <body>, reused by every [data-tooltip] on the page. See
    // the .awoo-ui-tip CSS for why this stopped being a ::after — in short, a
    // pseudo-element inherits its ancestors' opacity and contributes to their
    // scroll area, and both of those were shipping as bugs.
    //
    // Delegated from document rather than one listener per tooltipped element:
    // there are dozens, they are created and destroyed constantly as panels
    // re-render, and per-element listeners are exactly the leak shape
    // INSTRUMENTATION §4.4 exists to stop. Two listeners, page-lifetime, owned
    // by coreScope.
    // Weakly-held is not available here without WeakRef gymnastics for no
    // gain: these are a handful of small spans that live as long as their
    // window, and the alternative is a setting that only takes effect on the
    // next panel build.
    const devIcons = [];
    function syncDevIcons() {
      const on = getSetting('showDevTooltips');
      // Pruned on every sync. A panel that rebuilds its content leaves its old
      // icons in this array holding detached nodes alive, and the list only
      // ever grew. isConnected is the cheapest correct test for "still on the
      // page", and this runs rarely enough that the filter costs nothing.
      for (let i = devIcons.length - 1; i >= 0; i--) {
        if (devIcons[i].isConnected === false) devIcons.splice(i, 1);
        else devIcons[i].hidden = !on;
      }
    }

    let tipEl = null;
    let tipUserEl = null;
    let tipDevEl = null;
    let tipAnchor = null;

    function hideTip() {
      if (tipEl) tipEl.hidden = true;
      tipAnchor = null;
    }

    function showTip(target) {
      const text = target.getAttribute('data-tooltip');
      // The developer tier is not merely hidden when off -- it is not read at
      // all, so an element carrying ONLY dev text is inert rather than showing
      // an empty bubble.
      const dev = getSetting('showDevTooltips') ? target.getAttribute('data-tooltip-dev') : null;
      if (!text && !dev) return;
      if (!tipEl) {
        tipEl = document.createElement('div');
        tipEl.className = 'awoo-ui-tip';
        tipEl.hidden = true;
        // Two parts rather than one string: the tiers are visually distinct,
        // which they cannot be inside a single textContent.
        tipUserEl = document.createElement('span');
        tipDevEl = document.createElement('span');
        tipDevEl.className = 'awoo-ui-tip-dev';
        tipEl.appendChild(tipUserEl);
        tipEl.appendChild(tipDevEl);
        document.body.appendChild(tipEl);
      }
      tipAnchor = target;
      tipUserEl.textContent = text || '';
      tipDevEl.textContent = dev || '';
      tipDevEl.hidden = !dev;
      // The bubble itself is tinted when it is carrying developer content, so
      // the distinction survives a glance rather than needing to be read.
      tipEl.className = 'awoo-ui-tip' + (dev ? ' awoo-ui-tip-hasdev' : '');
      // data-tooltip-wide is the only width control left. data-tooltip-right
      // is now a NO-OP and deliberately still accepted: it used to force the
      // bubble to the element's right edge, which is precisely the guess the
      // positioner makes properly. Callers keep the attribute harmlessly
      // rather than every call site needing an edit.
      tipEl.style.width = target.hasAttribute('data-tooltip-wide') ? '230px' : '200px';
      tipEl.hidden = false;
      // Measured AFTER the text and width are set, because the height depends
      // on both — positioning against a stale size is how a flipped tooltip
      // ends up half off the bottom.
      const rect = positionDropdownNearAnchor(
        target.getBoundingClientRect(),
        { w: tipEl.offsetWidth, h: tipEl.offsetHeight },
        viewportRect(), 8);
      tipEl.style.left = rect.x + 'px';
      tipEl.style.top = rect.y + 'px';
    }

    function installTooltips(scope) {
      // core-ui-geometry.mjs loads this file purely to exercise the pure
      // geometry helpers, with no DOM at all. Anything at module scope that
      // assumes a document breaks that test — and a Core that cannot be
      // loaded without a browser is a Core whose maths cannot be unit-tested.
      if (typeof document === 'undefined' || typeof window === 'undefined') return;
      // pointerover/out rather than mouseenter/leave: those do not bubble, so
      // delegation needs the ones that do. `relatedTarget` tells us whether
      // the pointer actually left the anchor or merely crossed onto a child.
      scope.on(document, 'pointerover', (e) => {
        const t = e.target && e.target.closest && e.target.closest('[data-tooltip],[data-tooltip-dev]');
        if (!t) { if (tipAnchor) hideTip(); return; }
        if (t !== tipAnchor) showTip(t);
      });
      scope.on(document, 'pointerout', (e) => {
        if (!tipAnchor) return;
        const to = e.relatedTarget;
        if (to && tipAnchor.contains && tipAnchor.contains(to)) return;
        hideTip();
      });
      // A tooltip positioned against a rect that has since moved is worse than
      // no tooltip: it points at nothing. Anything that can move the anchor
      // dismisses instead of trying to follow it.
      scope.on(document, 'scroll', hideTip, true);
      scope.on(window, 'resize', hideTip);
      scope.on(window, 'blur', hideTip);
      // Keyboard parity, now that focus is visible at all: a tooltip reachable
      // only by pointer is one a keyboard user cannot read.
      scope.on(document, 'focusin', (e) => {
        const t = e.target && e.target.closest && e.target.closest('[data-tooltip],[data-tooltip-dev]');
        if (t) showTip(t);
      });
      scope.on(document, 'focusout', hideTip);
    }

    function positionDropdownNearAnchor(anchorRect, size, viewport, margin) {
      margin = margin == null ? 8 : margin;
      let x = anchorRect.left;
      if (x + size.w > viewport.w - margin) x = anchorRect.right - size.w;
      let y = anchorRect.bottom + 4;
      if (y + size.h > viewport.h - margin) y = anchorRect.top - size.h - 4;
      return clampRectToViewport({ x, y, w: size.w, h: size.h }, viewport,
        { minVisible: size.w, margin });
    }

    // ================================================================
    // ---- SCOPES — the framework's one stability primitive (v10) ----
    // ================================================================
    //
    // WHAT THIS REPLACES. INSTRUMENTATION.md §4.4 states a browser budget:
    // at most one MutationObserver per module, debounced >= 250ms; no
    // document-level listener outliving the interaction that needed it; no DOM
    // writes while hidden. Until now every clause of that was DISCIPLINE — a
    // thing a reviewer had to notice. A repo-wide audit on 2026-09-07 found
    // four separate violations in shipped code, every one of them the same
    // shape: something created and never released. `ui.menu` orphaned one
    // document listener per open, forever. `createWindow().destroy()` left its
    // ResizeObserver connected. Two modules ran timers nobody could enumerate.
    //
    // None of those were sloppiness. They are what happens when teardown is a
    // separate act of memory from setup, performed at a distance, in a
    // different function, often written weeks later.
    //
    // A SCOPE MAKES TEARDOWN THE SAME ACT AS SETUP. Everything with a lifetime
    // is registered through one, and `dispose()` releases all of it at once, in
    // reverse order, without the caller enumerating anything. A module that
    // owns exactly one scope cannot leak, because there is nowhere for a
    // registration to hide.
    //
    // AND IT ENFORCES THE BUDGET RATHER THAN DOCUMENTING IT. A second
    // MutationObserver in one scope throws. An undebounced one throws. A
    // debounce under 250ms throws. The rule and its check are the same object,
    // so a new module cannot reintroduce a trap merely by not having read §4.4.
    //
    // DESIGNED TO BE SITE-AGNOSTIC. Nothing here knows what game this is, what
    // the page looks like, or that a page has a nav bar. It is the portable
    // half — see userscripts/FRAMEWORK.md for the layer boundary and the
    // adapter contract that carries the site-specific half.
    const SCOPE_MIN_OBSERVER_DEBOUNCE_MS = 250;

    function createScope(name, { maxObservers = 1 } = {}) {
      const teardowns = [];
      let observerCount = 0;
      let disposed = false;
      const children = new Set();

      function guard(what) {
        if (disposed) {
          throw new Error(`[AwooCore] scope "${name}" is disposed; cannot ${what}. `
            + 'Registering against a dead scope is how a "cleaned up" module keeps running — '
            + 'create a new scope instead of reviving this one.');
        }
      }
      function add(fn) { guard('add a teardown'); teardowns.push(fn); return fn; }

      // WHAT THIS SCOPE IS HOLDING, BY KIND (v14). Control Panel > Diagnostics
      // shows it per module, because "is this module costing me anything while
      // I'm not using it" is the question Loaded/Off exists to answer, and a
      // bare teardown count cannot answer it. Each release runs once, so an
      // early `off()` followed by dispose() does not count twice.
      const held = { listeners: 0, intervals: 0, timeouts: 0, observers: 0 };
      function hold(kind, release) {
        held[kind]++;
        let done = false;
        return () => { if (done) return; done = true; held[kind]--; release(); };
      }

      const scope = {
        name,
        get disposed() { return disposed; },
        // Counts, for tests and for __awooDiag. A number nobody can produce is
        // a budget nobody can check.
        get size() { return teardowns.length; },
        get observers() { return observerCount; },
        // Everything still held, this scope and its children together.
        get stats() {
          const out = Object.assign({}, held);
          for (const c of children) {
            const s = c.stats;
            for (const k of Object.keys(out)) out[k] += s[k];
          }
          return out;
        },

        add,

        on(target, type, handler, opts) {
          guard(`listen for "${type}"`);
          target.addEventListener(type, handler, opts);
          return add(hold('listeners', () => target.removeEventListener(type, handler, opts)));
        },

        interval(fn, ms) {
          guard('start an interval');
          const id = setInterval(fn, ms);
          return add(hold('intervals', () => clearInterval(id)));
        },

        // Returns a canceller as well as registering one, because a timeout is
        // the one thing callers routinely want to cancel EARLY — a debounce
        // restarted on every keystroke, say.
        timeout(fn, ms) {
          guard('start a timeout');
          let release = null;
          let id = setTimeout(() => { id = null; release(); fn(); }, ms);
          release = hold('timeouts', () => { if (id !== null) { clearTimeout(id); id = null; } });
          add(release);
          return release;
        },

        raf(fn) {
          guard('request a frame');
          const id = requestAnimationFrame(fn);
          return add(() => cancelAnimationFrame(id));
        },

        // §4.4's observer clause, enforced. `debounceMs` is REQUIRED and has no
        // default on purpose: an unthrottled body-wide observer was measured
        // hanging the tab, and a default would let the next module inherit the
        // measurement without inheriting the lesson.
        mutation(target, options, handler, { debounceMs } = {}) {
          guard('observe mutations');
          if (typeof MutationObserver !== 'function') return () => {};
          if (observerCount >= maxObservers) {
            throw new Error(`[AwooCore] scope "${name}" already owns ${observerCount} MutationObserver(s) `
              + `(limit ${maxObservers}). INSTRUMENTATION.md §4.4 budgets one per module: a second one is almost `
              + 'always the first one wanted for a different reason, and merging them costs one branch in a '
              + 'callback that already runs. If two really are needed, say why and raise maxObservers explicitly.');
          }
          if (!Number.isFinite(debounceMs) || debounceMs < SCOPE_MIN_OBSERVER_DEBOUNCE_MS) {
            throw new Error(`[AwooCore] scope "${name}": a MutationObserver needs debounceMs >= `
              + `${SCOPE_MIN_OBSERVER_DEBOUNCE_MS}, got ${JSON.stringify(debounceMs)}. This is not a style rule — `
              + 'an unthrottled childList+subtree observer on a busy page was MEASURED hanging the tab.');
          }
          if (options && options.attributes) {
            throw new Error(`[AwooCore] scope "${name}": attribute observation is refused (§4.4). `
              + 'childList + subtree only — attributes fire on animations and hover states, orders of magnitude '
              + 'more often, for information a module has never yet actually needed.');
          }
          observerCount++;
          let pending = null;
          const obs = new MutationObserver(() => {
            if (pending) return;             // coalesce a burst into one call
            pending = setTimeout(() => { pending = null; handler(); }, debounceMs);
          });
          obs.observe(target, options);
          return add(hold('observers', () => {
            obs.disconnect();
            if (pending) clearTimeout(pending);
            observerCount--;
          }));
        },

        resize(target, handler) {
          guard('observe resizes');
          if (typeof ResizeObserver !== 'function') return () => {};
          const ro = new ResizeObserver(handler);
          ro.observe(target);
          return add(hold('observers', () => ro.disconnect()));
        },

        // A resource the scope did not create but must release: a Worker, a
        // raw observer a module needs undebounced, a <style> it injected.
        // `kind` only decides which count it shows up in.
        own(kind, release) {
          guard('own a resource');
          if (!Object.prototype.hasOwnProperty.call(held, kind)) kind = 'listeners';
          return add(hold(kind, release));
        },

        // A nested scope disposed by its parent. This is what makes a window,
        // a modal or a menu — anything with a lifetime shorter than its
        // module's — safe: dispose the child when it closes, or let the parent
        // take it when the module goes.
        child(childName, opts) {
          guard('create a child scope');
          const c = createScope(`${name}/${childName}`, opts);
          children.add(c);
          add(() => { children.delete(c); c.dispose(); });
          return c;
        },

        dispose() {
          if (disposed) return;              // idempotent: double-dispose is not an error
          disposed = true;
          // REVERSE order, so a teardown can rely on anything registered before
          // it still existing — the same reason a stack unwinds the way it does.
          for (let i = teardowns.length - 1; i >= 0; i--) {
            // One throwing teardown must not strand the rest. A half-disposed
            // scope is worse than either outcome, because the leak it leaves is
            // invisible and unrepeatable.
            try { teardowns[i](); } catch (err) { console.error(`[AwooCore] teardown failed in scope "${name}":`, err); }
          }
          teardowns.length = 0;
          observerCount = 0;
        },
      };
      return scope;
    }

    // Core's own lifetime. Page-lifetime work still goes through a scope, so
    // `__awooDiag()` can report one honest number for "things this page is
    // holding open" rather than a count that stops at whatever was remembered.
    // maxObservers is 1, the same budget every module gets. Core is the
    // framework, which would be the obvious excuse for granting itself more —
    // and it needs exactly one (the nav anchor watcher), so taking more would
    // be unearned slack in the one place it would be least noticed.
    const coreScope = createScope('core', { maxObservers: 1 });

    // Installed here rather than in buildUi(): tooltips belong to any element
    // carrying the attribute, including ones a module renders before the nav
    // menu has been anchored. The listeners are delegated from document, so
    // attaching them early costs nothing and there is no window to wait for.
    installTooltips(coreScope);

    // ================================================================
    // ---- THE WRITE SCHEDULER — the framework's performance half ----
    // ================================================================
    //
    // THE PROBLEM IT SOLVES, and it gets worse with every module: N modules
    // each writing to the DOM on their own cadence is N independent chances to
    // force a layout, and they interleave. One module's read after another's
    // write is a synchronous reflow neither author can see in their own file.
    // With one module that is invisible; §4.4 already records `renderQuickRow`
    // rebuilding the nav bar per registration being VISIBLE as jitter at three.
    //
    // THREE RULES, all of which only work if writes go through one door:
    //
    //   1. **Coalesce by key, last write wins.** A value that changes five
    //      times before the next frame is written once. Keying by string
    //      rather than by element is deliberate — it lets a module coalesce
    //      "the whole countdown row" as one unit.
    //   2. **One frame, all modules.** Every queued write lands in a single
    //      requestAnimationFrame callback, so the browser lays out once.
    //   3. **Nothing while hidden.** A background tab gets no DOM writes at
    //      all; queued work is HELD, not dropped, and flushed on the way back.
    //      Held, because §5's S2 trap is exactly this: the state must keep
    //      advancing while hidden even though the pixels must not.
    //
    // The compare-before-write helpers below are the other half. §5's S6 found
    // ~15 unguarded textContent writes per second, each one a potential style
    // invalidation for a string that had not changed.
    const scheduler = (() => {
      const queued = new Map();       // key -> fn, insertion-ordered
      let frame = null;
      let flushes = 0;
      let coalesced = 0;

      function flush() {
        frame = null;
        if (!queued.size) return;
        const batch = [...queued.values()];
        queued.clear();
        flushes++;
        for (const fn of batch) {
          // One throwing write must not lose the rest of the frame — the
          // others are unrelated modules.
          try { fn(); } catch (err) { console.error('[AwooCore] a scheduled DOM write threw:', err); }
        }
      }

      function schedule() {
        if (frame !== null) return;
        if (typeof document !== 'undefined' && document.hidden) return; // held; visibilitychange flushes
        frame = requestAnimationFrame(flush);
      }

      return {
        write(key, fn) {
          if (queued.has(key)) coalesced++;
          queued.set(key, fn);
          schedule();
        },
        // Called when the tab becomes visible again, and by tests that need a
        // deterministic frame instead of waiting for a real one.
        flushNow() { if (frame !== null) { cancelAnimationFrame(frame); frame = null; } flush(); },
        wake() { if (queued.size) schedule(); },
        get stats() { return { pending: queued.size, flushes, coalesced }; },
      };
    })();

    // Compare before writing. Every one of these is a no-op when the value is
    // unchanged, which is the common case on a per-second render.
    const domWrite = {
      text(el, value) { const v = String(value); if (el && el.textContent !== v) el.textContent = v; },
      attr(el, name, value) {
        if (!el) return;
        if (value === null || value === false) { if (el.getAttribute(name) !== null) el.removeAttribute(name); return; }
        const v = String(value);
        if (el.getAttribute(name) !== v) el.setAttribute(name, v);
      },
      style(el, prop, value) { const v = String(value); if (el && el.style[prop] !== v) el.style[prop] = v; },
      toggle(el, cls, on) { if (el && el.classList.contains(cls) !== !!on) el.classList.toggle(cls, !!on); },
    };

    // ---- React fiber walk ----
    //
    // ONE bounded traversal, shared by every probe that needs live state the
    // DOM does not render as text. `visit(candidateObject)` returns true to
    // stop. Never call this on a render path - it is a whole-tree walk, and
    // that is exactly why it is capped at 30k nodes and why every caller
    // caches its result.
    //
    // Every probe built on it MUST refuse rather than guess (CONVENTIONS §9.4):
    // if the shape it expects is not found, the answer is null, not a
    // plausible substitute.
    // stopAtFirst=true (default, unchanged from before): visit() returning
    // truthy stops the whole walk — for "find the one thing." Pass false
    // (walkFiberAll below) to keep visiting every candidate to the bound
    // instead — for "sum every match" (e.g. several equipped items each
    // contributing to the same stat), where stopping at the first would
    // silently under-count.
    function walkFiber(visit, stopAtFirst) {
      if (stopAtFirst === undefined) stopAtFirst = true;
      try {
        const host = document.getElementById('root');
        if (!host) return false;
        let rootFiber = null;
        for (const k in host) {
          if (k.startsWith('__reactContainer$') || k.startsWith('__reactFiber$')) {
            rootFiber = host[k];
            break;
          }
        }
        if (!rootFiber) return false;
        const seen = new Set();
        const stack = [rootFiber];
        let steps = 0;
        let matched = false;
        while (stack.length && steps++ < 30000) {
          const f = stack.pop();
          if (!f || typeof f !== 'object' || seen.has(f)) continue;
          seen.add(f);
          for (const bag of [f.memoizedProps, f.memoizedState]) {
            if (!bag || typeof bag !== 'object') continue;
            for (const cand of [bag, bag.value, bag.memoizedState]) {
              if (cand && typeof cand === 'object' && visit(cand)) {
                if (stopAtFirst) return true;
                matched = true;
              }
            }
          }
          if (f.child) stack.push(f.child);
          if (f.sibling) stack.push(f.sibling);
        }
        return matched;
      } catch (e) { /* fiber shape changed - callers fall back */ }
      return false;
    }
    // Same traversal, but never stops early — visit() is called for every
    // candidate found (return true from it just to record "I used this one",
    // the walk continues regardless). Use when several fiber nodes could
    // each hold a piece of the same total.
    function walkFiberAll(visit) { return walkFiber(visit, false); }

    // Authoritative source: the character's own setting, read off the React tree.
    // Bounded and cached - never runs on a render path.
    function probeNumberLocaleFromFiber() {
      let out = null;
      walkFiber((cand) => {
        if (typeof cand.numberLocale === 'string') { out = cand.numberLocale; return true; }
        const s = cand.characterSettingsGeneral;
        if (s && typeof s.numberLocale === 'string') { out = s.numberLocale; return true; }
        return false;
      });
      return out;
    }

    // numberFormatting (standard | exponential | letters), the game's OTHER
    // number setting, read the same way. Refuses (null) rather than guessing.
    function probeNumberFormattingFromFiber() {
      let out = null;
      walkFiber((cand) => {
        const s = cand.characterSettingsGeneral;
        if (s && typeof s.numberFormatting === 'string') { out = s.numberFormatting; return true; }
        return false;
      });
      return ['standard', 'exponential', 'letters'].includes(out) ? out : null;
    }

    // The character's MERGED MULTIPLIERS — the ~80-key object the game itself
    // computes and the REST API exposes as /api/character/merged-multipliers.
    //
    // Worth a probe of its own because it is the single richest live source in
    // the page: monsterGoldFlat and monsterGoldPercentage (the two terms that
    // dominate gold.base), potionEffect, and the stacked income boosts. Reading
    // them beats modelling them from an assumed pet roll.
    //
    // The predicate is two co-occurring, specifically-named numeric keys. That
    // is deliberately narrow: 'gold' or 'level' alone match a dozen unrelated
    // objects in this tree, and a wrong object here would feed plausible
    // rubbish into a calculator that recommends what to spend a week of income
    // on. Fewer than both keys present = no answer.
    //
    // SHAPE SOURCE: data/formulas/economy.json (gold.base, cross-confirmed
    // against the REST endpoint) and data/formulas/party.json
    // (party.mergedMultipliers.pools captured the whole object).
    let mergedProbe;
    function probeMergedMultipliers(force) {
      if (mergedProbe !== undefined && !force) return mergedProbe;
      let out = null;
      walkFiber((cand) => {
        if (typeof cand.monsterGoldFlat !== 'number') return false;
        if (typeof cand.monsterGoldPercentage !== 'number') return false;
        if (!isFinite(cand.monsterGoldFlat) || !isFinite(cand.monsterGoldPercentage)) return false;
        out = cand;
        return true;
      });
      mergedProbe = out;
      return out;
    }

    // The character object, for facts the page shows only inside a hover card
    // or not at all (character level is the one a module needs today).
    //
    // The predicate is deliberately over-specified: `level` alone matches a
    // dozen unrelated objects in this tree (pets, party members, village
    // buildings), so a match also has to look like a CHARACTER. Fewer than two
    // corroborating fields = no answer.
    let characterProbe;
    function probeCharacter(force) {
      if (characterProbe !== undefined && !force) return characterProbe;
      let out = null;
      walkFiber((cand) => {
        if (typeof cand.level !== 'number' || !(cand.level > 0)) return false;
        let score = 0;
        if (typeof cand.experience === 'number') score++;
        if (typeof cand.name === 'string') score++;
        if (typeof cand.gold === 'number' || typeof cand.gold === 'string') score++;
        if (cand.characterSettingsGeneral && typeof cand.characterSettingsGeneral === 'object') score += 2;
        if (score < 2) return false;
        out = {
          level: Math.round(cand.level),
          name: typeof cand.name === 'string' ? cand.name : null,
          confidence: score,
        };
        return true;
      });
      characterProbe = out;
      return out;
    }

    // Live Convex client probe: finds the live ConvexClient / React Provider instance
    // holding optimistic and remote query results. Authoritative source for all
    // active profile states (§9.4 - refuse rather than guess).
    //
    // FIXED 2026-09-25 (REGISTER.md R88): it returned null on the live page.
    // Two causes. The game's ConvexReactClient keeps its sync client in
    // `cachedSync`, which no check below looked at (profile-sync.js found it
    // there all along). And a null was cached forever, so a probe that ran
    // before the game rendered never looked again. Only a found client is
    // cached now.
    let convexClientProbe;
    function probeConvexClient(force) {
      if (convexClientProbe && !force) return convexClientProbe;
      let out = null;
      walkFiber((cand) => {
        if (cand && typeof cand === 'object') {
          if (cand.optimisticQueryResults && cand.remoteQuerySet) { out = cand; return true; }
          const cs = cand.client && cand.client.cachedSync;
          if (cs && cs.optimisticQueryResults && cs.remoteQuerySet) { out = cs; return true; }
          if (cand.client && cand.client.optimisticQueryResults && cand.client.remoteQuerySet) { out = cand.client; return true; }
          if (cand.convex && cand.convex.optimisticQueryResults && cand.convex.remoteQuerySet) { out = cand.convex; return true; }
        }
        return false;
      });
      if (out) convexClientProbe = out;
      return out;
    }

    // Unambiguous only when a rendered number carries BOTH separators:
    // whichever appears last is the decimal separator.
    function probeFromPageSample() {
      const root = document.querySelector('main') || document.body;
      if (!root) return null;
      const text = root.textContent || '';
      const m = text.match(/\d{1,3}([.,])\d{3}([.,])\d{1,2}(?!\d)/);
      if (!m) return null;
      const decimal = m[2];
      const group = m[1];
      if (decimal === group) return null;
      return { locale: null, group, decimal };
    }

    let convention = null;
    let conventionProbedAt = 0;

    // THE GAME'S SETTING OUTRANKS THE BROWSER, and now it actually does
    // (reported 2026-09-21: auto-detect showed the browser's 1,000.00 while the
    // game was set to 1.000,00, until a manual/auto flip re-read it). The order
    // below was always right; the bug was WHEN it ran. The first call happens
    // at document-start, before the game has rendered its settings, so it fell
    // through to the browser — and that answer was cached, with one re-probe
    // at first anchor that could itself come too early. Now:
    //   - the last game setting seen is remembered, so a reload starts from the
    //     player's own convention instead of the browser's;
    //   - while the answer rests on a weaker source (remembered, a page sample,
    //     or the browser), getConvention() re-probes, throttled, until the live
    //     setting is read, and tells every module when that changes the result;
    //   - both detections ride along, so Settings can show them side by side.
    const SEEN_KEY = 'awoo:core:number-locale-seen';
    function resolveConvention() {
      const browser = separatorsFor(navigator.language || 'en-US');
      const detected = { game: null, browser: { decimal: browser.decimal, group: browser.group } };
      let stored = null;
      try { stored = localStorage.getItem(OVERRIDE_KEY); } catch (e) { /* ignore */ }
      const fromFiber = probeNumberLocaleFromFiber();
      let seen = null;
      if (fromFiber && NUMBER_LOCALE_MAP[fromFiber]) {
        try { localStorage.setItem(SEEN_KEY, fromFiber); } catch (e) { /* ignore */ }
        detected.game = fromFiber;
      } else {
        try { seen = localStorage.getItem(SEEN_KEY); } catch (e) { /* ignore */ }
        if (seen && NUMBER_LOCALE_MAP[seen]) detected.game = seen; else seen = null;
      }
      if (stored && NUMBER_LOCALE_MAP[stored]) {
        return Object.assign(separatorsFor(NUMBER_LOCALE_MAP[stored]),
          { source: 'override', numberLocale: stored, detected });
      }
      if (fromFiber && NUMBER_LOCALE_MAP[fromFiber]) {
        return Object.assign(separatorsFor(NUMBER_LOCALE_MAP[fromFiber]),
          { source: 'setting', numberLocale: fromFiber, detected });
      }
      if (seen) {
        return Object.assign(separatorsFor(NUMBER_LOCALE_MAP[seen]),
          { source: 'remembered', numberLocale: seen, detected });
      }
      const fromSample = probeFromPageSample();
      if (fromSample) return Object.assign(fromSample, { source: 'sample', numberLocale: null, detected });
      return Object.assign(browser, { source: 'browser', numberLocale: 'Local', detected });
    }

    function getConvention() {
      const now = Date.now();
      if (!convention) {
        convention = resolveConvention();
        conventionProbedAt = now;
      } else if (convention.source !== 'setting' && convention.source !== 'override'
        && now - conventionProbedAt > 2000) {
        // Throttled re-probe while the answer is not the live game setting.
        conventionProbedAt = now;
        const prev = convention;
        const next = resolveConvention();
        convention = next;
        if (next.decimal !== prev.decimal || next.group !== prev.group || next.source !== prev.source) {
          // Deferred, so a module's own getConvention() call cannot re-enter.
          setTimeout(() => {
            renderNumberFormatRow();
            for (const id of Object.keys(modules)) safely(id, 'onConventionChange');
          }, 0);
        }
      }
      return convention;
    }
    // re-probe: the setting can only be read once React has rendered
    function refreshConvention() {
      const next = resolveConvention();
      const changed = !convention || next.decimal !== convention.decimal
        || next.group !== convention.group || next.source !== convention.source;
      convention = next;
      return changed;
    }
    function setNumberLocaleOverride(key) {
      try {
        if (key) localStorage.setItem(OVERRIDE_KEY, key);
        else localStorage.removeItem(OVERRIDE_KEY);
      } catch (e) { /* ignore */ }
      convention = null;
      renderNumberFormatRow();
      for (const id of Object.keys(modules)) safely(id, 'onConventionChange');
    }

    // Returns null rather than a wrong number. An unparseable string is a
    // refusal, never a guess - a silently mis-scaled value is worse than none.
    function parseNumber(str) {
      if (typeof str !== 'string') return null;
      const c = getConvention();
      let s = str.trim().toLowerCase().replace(/[+\s  ]/g, '');
      if (!s) return null;
      let sign = 1;
      if (s.startsWith('-')) { sign = -1; s = s.slice(1); }
      // exponential formatting (numberFormatting === 'exponential')
      const exp = s.match(/^([\d.,]+)e([+-]?\d+)$/);
      let mult = 1;
      if (exp) {
        s = exp[1];
        mult = Math.pow(10, parseInt(exp[2], 10));
      } else {
        const suf = s.match(/^([\d.,]+)\s*([a-z]{1,2})$/);
        if (suf) {
          const p = SUFFIX_POW[suf[2]];
          if (p === undefined) return null;
          s = suf[1];
          mult = Math.pow(1000, p);
        }
      }
      if (!/^[\d.,]+$/.test(s)) return null;
      // split off the decimal part first, then validate thousands grouping.
      // Malformed grouping ("1.2.3") must refuse, not silently become 123 -
      // a plausible wrong number is worse than none.
      const decParts = s.split(c.decimal);
      if (decParts.length > 2) return null;
      const intPart = decParts[0];
      const fracPart = decParts.length === 2 ? decParts[1] : null;
      if (fracPart !== null && (fracPart === '' || fracPart.indexOf(c.group) !== -1)) return null;
      const groups = intPart.split(c.group);
      if (groups.length > 1) {
        if (groups[0].length < 1 || groups[0].length > 3) return null;
        for (let i = 1; i < groups.length; i++) {
          if (!/^\d{3}$/.test(groups[i])) return null;
        }
      }
      s = groups.join('') + (fracPart !== null ? '.' + fracPart : '');
      if (!/^\d+(\.\d+)?$/.test(s)) return null;
      const v = parseFloat(s);
      if (!Number.isFinite(v)) return null;
      return sign * v * mult;
    }

    // Render in the user's own convention, so our UI matches the game's.
    function formatNumber(value, decimals = 2) {
      if (value === null || value === undefined || !Number.isFinite(value)) return '—';
      const c = getConvention();
      const abs = Math.abs(value);
      let scaled = value;
      let suffix = '';
      if (abs >= 1000) {
        const i = Math.min(Math.floor(Math.log(abs) / Math.log(1000)), 12);
        scaled = value / Math.pow(1000, i);
        suffix = ['k', 'm', 'b', 't', 'qa', 'qi', 'sx', 'sp', 'oc', 'no', 'dc', 'ud'][i - 1] || '';
      }
      const fixed = scaled.toFixed(abs >= 1000 ? decimals : 0);
      return (c.decimal === '.' ? fixed : fixed.split('.').join(c.decimal)) + suffix;
    }

    // Everything a module exports to the core backend must carry this, so a
    // number can be re-derived if the convention was ever detected wrong.
    function numberProvenance() {
      const c = getConvention();
      return {
        numberLocale: c.numberLocale, locale: c.locale,
        group: c.group, decimal: c.decimal, detectedVia: c.source,
      };
    }
    const modules = {};

    // TOOLS ARE NOT MODULES, and the distinction is deliberate rather than
    // cosmetic. A module has state, a panel, storage, and a lifecycle, so
    // "enabled" is a meaningful axis for it. A tool is a standalone page the
    // user opens in another tab — there is nothing running, nothing to
    // persist, and therefore nothing to enable or disable. Modelling one as
    // a permanently-enabled module would put a dead on/off switch in the UI
    // and give it a storage namespace it never writes to.
    //
    // A tool therefore has no onToggle/onQuickClick/onResetPosition, gets no
    // quick-row button, and is not touched by disableAll() or
    // resetPositions().
    const tools = {};
    // Modules that asked for a Core newer than this one. Kept so the dropdown
    // can say "install the update" instead of the module simply not appearing.
    const incompatible = {};
    // Modules installed more than once - see claim().
    const duplicates = {};
    let coreUi = null;

    // ---- the module registry, v2 (REGISTER.md R69) ----
    //
    // THREE SEPARATE QUESTIONS, where v1 had one list that answered all of
    // them badly. `enabledOrder` said which modules were on AND put the most
    // recently enabled first on the bar, so switching one off and on again
    // reshuffled the player's bar. Now:
    //
    //   loaded       which modules START at page load. Off means never started:
    //                no window, no styles, no timers (FRAMEWORK.md §3a).
    //                In code this is still `mod.enabled`; GLOSSARY.md records
    //                that "enabled" in code is "Loaded" in the UI.
    //   order        the player's order, used by the bar and the menu alike.
    //                Every id ever seen, so a module keeps its place while off.
    //   barHidden /  where a loaded module shows. Hiding a module never stops
    //   menuHidden   it, which is the whole reason these are not `loaded`.
    //
    // A module never seen before is NOT loaded, exactly as under v1: an update
    // that adds a module must not start running it for anyone.
    function migrateRegistry(saved) {
      const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
      const out = {
        v: 2, loaded: [], order: [], barHidden: [], menuHidden: [], toolMenuHidden: [],
        barMax: AWOO_CORE_MAX_QUICK_BUTTONS, profileOnBar: true,
      };
      if (!saved || typeof saved !== 'object') return out;
      if (saved.v === 2) {
        for (const k of ['loaded', 'order', 'barHidden', 'menuHidden', 'toolMenuHidden']) out[k] = list(saved[k]);
        if (Number.isFinite(saved.barMax)) out.barMax = saved.barMax;
        if (typeof saved.profileOnBar === 'boolean') out.profileOnBar = saved.profileOnBar;
      } else {
        // v1: enabledOrder was most-recently-enabled first, which IS the bar
        // order the player currently sees, so it becomes their order as-is.
        out.loaded = list(saved.enabledOrder);
        out.order = out.loaded.slice();
      }
      const [lo, hi] = AWOO_CORE_BAR_MAX_RANGE;
      out.barMax = Math.min(hi, Math.max(lo, Math.round(out.barMax)));
      return out;
    }

    let registry = migrateRegistry(null);
    try {
      const raw = localStorage.getItem(REG_KEY);
      registry = migrateRegistry(raw ? JSON.parse(raw) : null);
    } catch (e) { /* unreadable: defaults stand, exactly as a first install */ }

    const isIn = (key, id) => registry[key].includes(id);
    function setIn(key, id, on) {
      const has = registry[key].includes(id);
      if (on && !has) registry[key].push(id);
      if (!on && has) registry[key] = registry[key].filter((x) => x !== id);
    }
    // A new id joins the END of the order: a module installed today must not
    // push the player's existing buttons along.
    function noteOrder(id) { if (!registry.order.includes(id)) registry.order.push(id); }
    function orderedIds(ids) {
      const rank = (id) => { const i = registry.order.indexOf(id); return i < 0 ? Infinity : i; };
      return ids.slice().sort((a, b) => rank(a) - rank(b));
    }

    // WHAT THE DAILY CHECK-IN REPORTS ABOUT MODULES (REGISTER.md R80): how
    // often each module's window was opened, and the errors safely() and
    // claim() already catch. Kept in localStorage so counts survive the reloads
    // between check-ins, and capped so a module throwing in a loop cannot grow
    // it. src/core/checkin.js reads it with take(), which also resets it.
    // Nothing here is sent anywhere by itself.
    const DIAG_KEY = 'awoo:core:diagnostics:v1';
    const diagnostics = (() => {
      const empty = () => ({ opens: {}, errors: [] });
      const load = () => {
        try {
          const d = JSON.parse(localStorage.getItem(DIAG_KEY) || 'null');
          if (d && typeof d === 'object') return { opens: d.opens && typeof d.opens === 'object' ? d.opens : {}, errors: Array.isArray(d.errors) ? d.errors : [] };
        } catch (e) { /* unreadable: start over */ }
        return empty();
      };
      const save = (d) => { try { localStorage.setItem(DIAG_KEY, JSON.stringify(d)); } catch (e) { /* storage blocked */ } };
      return {
        opened(id) {
          const d = load();
          d.opens[id] = Math.min(100000, (d.opens[id] || 0) + 1);
          save(d);
        },
        failed(id, hook, err) {
          const d = load();
          const msg = `${hook}: ${String((err && err.message) || err)}`.slice(0, 200);
          if (d.errors.some((e) => e.m === id && e.msg === msg)) return;
          d.errors.push({ m: id, v: (modules[id] && modules[id].version) || versionFromQueue(id) || null, msg });
          d.errors = d.errors.slice(-10);
          save(d);
        },
        peek: load,
        take() { const d = load(); save(empty()); return d; },
      };
    })();

    // Every module-supplied callback goes through here. One module throwing
    // must never take down the launcher or its neighbours.
    function safely(id, hook, ...args) {
      const mod = modules[id];
      if (!mod || typeof mod[hook] !== 'function') return undefined;
      try {
        return mod[hook](...args);
      } catch (err) {
        mod.errored = true;
        console.error(`[AWOO+] module "${id}" threw in ${hook}()`, err);
        diagnostics.failed(id, hook, err);
        return undefined;
      }
    }

    function saveState() {
      // `enabledOrder` is still WRITTEN, never read: it is the one field an
      // older Core understands, so a player who ends up on one again (a
      // reinstall, a second browser profile) keeps their modules on.
      const enabledOrder = orderedIds(registry.loaded);
      try { localStorage.setItem(REG_KEY, JSON.stringify(Object.assign({}, registry, { enabledOrder }))); } catch (e) { /* ignore */ }
    }

    // WHERE THE BUTTON GOES, in descending order of preference.
    //
    // REPORTED 2026-09-06: "the script still doesn't load". It was loading. It
    // had no anchor: the old code looked for exactly one link, and if that link
    // was not there it inserted the group NOWHERE and returned silently. Core
    // running perfectly while being invisible is indistinguishable, from the
    // outside, from Core not running at all - and it is a worse failure,
    // because everything that reports health says it is fine.
    //
    // The rule now: ALWAYS end up somewhere. A button in a slightly wrong place
    // is a cosmetic problem; a button nowhere is a broken script.
    // STRUCTURAL, not tag-based. The previous version asked for <header>/<nav>
    // and got neither: this game's top bar is divs, so every candidate missed
    // and the menu fell back to floating. Tag names are a guess about how
    // someone built their markup; "the element containing the most in-game nav
    // links" is a fact about the page, and survives a redesign.
    function findAnchor() {
      const log = document.querySelector('a[href="/game/log"]');
      if (log) return { el: log, how: 'after the Game Log link', mode: 'after' };

      // Group every in-game link by its parent and take the busiest group -
      // that is the nav bar, whatever it is built from.
      const links = [...document.querySelectorAll('a[href^="/game/"], a[href*="/game/"]')]
        .filter((a) => a.offsetParent !== null);   // visible only; menus can be duplicated offscreen
      if (links.length) {
        const byParent = new Map();
        for (const a of links) {
          const parent = a.parentElement;
          if (!parent) continue;
          if (!byParent.has(parent)) byParent.set(parent, []);
          byParent.get(parent).push(a);
        }
        let best = null;
        for (const [parent, group] of byParent) {
          // Prefer the group that is both largest and highest on the page: the
          // top bar, not a sidebar or a footer list.
          const top = parent.getBoundingClientRect().top;
          const score = group.length * 1000 - top;
          if (!best || score > best.score) best = { parent, group, score, top };
        }
        if (best && best.group.length >= 2) {
          const last = best.group[best.group.length - 1];
          return { el: last, how: `after the last of ${best.group.length} nav links`, mode: 'after' };
        }
        if (best) return { el: best.group[0], how: 'after the only nav link found', mode: 'after' };
      }

      for (const a of document.querySelectorAll('header a, nav a')) {
        if (a.textContent.trim().toLowerCase() === 'game log') {
          return { el: a, how: 'after a link labelled Game Log', mode: 'after' };
        }
      }
      const bar = document.querySelector('header, nav');
      if (bar) return { el: bar, how: 'appended to the nav bar', mode: 'append' };
      return null;
    }


    let anchorHow = null;
    // REPORTED BUG, fixed here: `document.body.contains(coreUi.group)` is
    // true whether the group is properly anchored in the nav OR merely
    // floating (the fallback is also appended to document.body) — so the
    // old guard made the FIRST float permanent, skipping every later retry
    // even though the whole point of the floating fallback is "the observer
    // will move it into the bar the moment one appears" (see the comment
    // where floating is set, below). A floating group must keep retrying;
    // only a genuinely anchored one is done.
    function anchorGroup() {
      if (!coreUi || !document.body) return;
      const isFloating = coreUi.group.classList.contains('awoo-core-floating');
      if (document.body.contains(coreUi.group) && !isFloating) return;
      const found = findAnchor();
      if (found) {
        if (found.mode === 'append') found.el.appendChild(coreUi.group);
        else found.el.insertAdjacentElement('afterend', coreUi.group);
        coreUi.group.classList.remove('awoo-core-floating');
      } else {
        // LAST RESORT, and the whole point of this function: float it. The nav
        // may not have rendered yet, or may have changed shape entirely. Either
        // way the menu stays reachable, and the observer will move it into the
        // bar the moment one appears.
        document.body.appendChild(coreUi.group);
        coreUi.group.classList.add('awoo-core-floating');
      }
      const how = found ? found.how : 'floating (no nav bar found)';
      if (how !== anchorHow) {
        anchorHow = how;
        console.info(`[AwooCore] menu anchored: ${how}`);
      }
    }

    // ---- window manager (v6) — shared draggable/resizable panel chrome ----
    //
    // Generalised from pet-slot-alarm's hand-rolled panel/drag/style code (the
    // first module), not invented ahead of a second one. Every module's
    // window is built from this, so INSTRUMENTATION.md's S3/S17 drag-listener
    // fix and the viewport-clamping guarantee above get fixed exactly once,
    // for every present and future module, instead of re-derived per module.
    const windowRegistry = {}; // id -> { reclamp() }, so a viewport resize can sweep every open window
    const WINDOW_GEOMETRY_PREFIX = 'awoo:core:window-geometry:';

    // ALL FOUR fields are checked, not just `x`. A blob missing w/h — an older
    // format, a hand-edited key, a half-written value — used to pass the `x`
    // test and then flow into `Math.max(undefined, minW)` => NaN =>
    // `style.width = "NaNpx"`, which CSS silently discards, leaving a window
    // sized by its content with no explanation anywhere. Non-finite is treated
    // as "nothing saved" so the caller falls back to computeDefaultRect().
    function loadWindowGeometry(id) {
      try {
        const raw = localStorage.getItem(WINDOW_GEOMETRY_PREFIX + id);
        const parsed = raw ? JSON.parse(raw) : null;
        if (!parsed) return null;
        const ok = ['x', 'y', 'w', 'h'].every((k) => Number.isFinite(parsed[k]));
        return ok ? { x: parsed.x, y: parsed.y, w: parsed.w, h: parsed.h } : null;
      } catch (e) { return null; }
    }
    function saveWindowGeometry(id, rect) {
      try { localStorage.setItem(WINDOW_GEOMETRY_PREFIX + id, JSON.stringify(rect)); } catch (e) { /* ignore */ }
    }

    let windowStyleInjected = false;
    function injectWindowStyleOnce() {
      applyThemeMode(); // may run before buildUi() — createWindow is often called before registerModule
      applyUiScale();
      applyCpSideWidth();
      if (windowStyleInjected || document.getElementById('awoo-window-style')) { windowStyleInjected = true; return; }
      windowStyleInjected = true;
      const style = document.createElement('style');
      style.id = 'awoo-window-style';
      style.textContent = `
        /* SEPARATION FROM THE HOST PAGE, spent in three small places rather
           than one loud one. The overlay styles itself from the game's own
           palette on purpose — that is what makes it feel native — and the
           cost of that choice is windows that dissolve into the page behind
           them. Reported as "blends in a bit too much".
           The fix is deliberately NOT a different colour scheme, which would
           throw away the reason the theme exists. It is: a 2px accent rule
           along the top edge of the header (an overlay signature, and the one
           place a strong colour costs nothing because no content sits there),
           a slightly stronger outer ring, and a header title one type step up.
           Everything else is untouched. */
        /* border-box (2026-09-25, R89): the saved size is offsetWidth/Height,
           which includes the border, and it is re-applied as style width and
           height. Under content-box each save-and-reapply grew a window by
           2px (after a drag and a reload, or a side panel opened and closed). */
        .awoo-window { position: fixed; z-index: 999000; display: flex; flex-direction: column; box-sizing: border-box;
          background: var(--awoo-card); color: var(--awoo-popover-foreground); border: 1px solid var(--awoo-border);
          border-radius: 8px;
          box-shadow: 0 12px 32px rgba(0,0,0,.45), 0 0 0 1px color-mix(in srgb, var(--awoo-primary) 22%, transparent);
          font: calc(12px * var(--awoo-ui-scale, 1)) var(--awoo-font, ${CORE_FONT}); overflow: hidden; }
        .awoo-window[hidden] { display: none; }
        .awoo-window[data-resizable="true"] { resize: both; min-width: 260px; min-height: 160px; }
        /* R69 round 6 replaced the 2px accent line along the top (the
           maintainer: "no blue header accent") with a lift and a faint accent
           rule: the header is half a step lighter than the body, and the line
           under it carries a trace of the theme's accent. */
        .awoo-window-header { display: flex; align-items: center; gap: 6px; padding: 7px 9px;
          background: color-mix(in oklab, var(--awoo-card) 55%, var(--awoo-surface-2));
          border-bottom: 1px solid color-mix(in oklab, var(--awoo-accent-edge) 55%, var(--awoo-border));
          cursor: move; user-select: none; flex: none; }
        /* CHECKBOXES ARE OUTLINED IN THE THEME (R69 round 6). The browser's
           own box was bright blue: the one colour in a window that did not
           come from the theme. An accent tick in an accent frame, no fill. */
        /* THE TICK IS A DRAWN PATH, masked to the accent (R69 round 7). It
           was a rotated two-sided border, whose corner sat off-centre and whose
           arm ran into the frame: "the check mark doesn't fully show in the
           box". A path in a 10px box is placed exactly, at any zoom, and the
           box is border-box so the game's own box-sizing cannot resize it. */
        :is(.awoo-window, #awoo-core-dropdown, .awoo-ui-menu) input[type="checkbox"] {
          appearance: none; -webkit-appearance: none; width: 13px; height: 13px; margin: 0; flex: none;
          box-sizing: border-box; padding: 0;
          border: 1px solid var(--awoo-border-strong); border-radius: 3px; background: transparent;
          display: inline-grid; place-items: center; cursor: pointer; vertical-align: middle; }
        :is(.awoo-window, #awoo-core-dropdown, .awoo-ui-menu) input[type="checkbox"]:checked { border-color: var(--awoo-accent); }
        :is(.awoo-window, #awoo-core-dropdown, .awoo-ui-menu) input[type="checkbox"]:checked::after {
          content: ""; width: 9px; height: 9px; background: var(--awoo-accent);
          -webkit-mask: ${AWOO_TICK_MASK} center / contain no-repeat; mask: ${AWOO_TICK_MASK} center / contain no-repeat; }
        :is(.awoo-window, #awoo-core-dropdown, .awoo-ui-menu) input[type="checkbox"]:hover { border-color: var(--awoo-accent); }
        :is(.awoo-window, #awoo-core-dropdown, .awoo-ui-menu) input[type="checkbox"]:focus-visible { outline: 1px solid var(--awoo-accent); outline-offset: 1px; }
        :is(.awoo-window, #awoo-core-dropdown, .awoo-ui-menu) input[type="checkbox"]:disabled { opacity: var(--awoo-em-faint); cursor: default; }
        .awoo-window-title { font-weight: 700; font-size: var(--awoo-fs-title); flex: 1;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; letter-spacing: -.01em; }
        .awoo-window-close { background: none; border: none; color: inherit;
          opacity: var(--awoo-em-muted); cursor: pointer; display: inline-grid; place-items: center;
          width: 18px; height: 18px; padding: 0; border-radius: var(--awoo-r-sm); }
        .awoo-window-close svg { width: 9px; height: 9px; display: block; }
        .awoo-window-close:hover { opacity: 1; }
        .awoo-window-gear { background: none; border: none; color: inherit;
          opacity: var(--awoo-em-faint); cursor: pointer; font-size: var(--awoo-fs-body);
          line-height: 1; padding: 0 3px; }
        .awoo-window-gear:hover { opacity: 1; }
        .awoo-window-body { flex: 1; overflow: auto; padding: 10px 11px;
          display: flex; flex-direction: column; gap: 10px; }
        .awoo-ui-input-row { display: grid; grid-template-columns: minmax(88px,1fr) minmax(0,1.5fr);
          align-items: center; gap: 8px; margin: 5px 0; }
        .awoo-ui-input-row label { display: flex; align-items: center; gap: 4px; font-size: 11.5px; opacity: .85; }
        .awoo-ui-input-row input, .awoo-ui-input-row select { font: inherit; font-size: 12px;
          background: var(--awoo-input); color: var(--awoo-foreground); border: 1px solid var(--awoo-border);
          border-radius: 4px; padding: 3px 6px; width: 100%; box-sizing: border-box; }
        .awoo-ui-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
        .awoo-ui-table th { text-align: left; font-weight: 600; font-size: 10px; text-transform: uppercase;
          letter-spacing: .03em; opacity: .55; padding: 4px 6px; border-bottom: 1px solid var(--awoo-border);
          white-space: nowrap; }
        .awoo-ui-table td { padding: 5px 6px; vertical-align: middle;
          border-bottom: 1px solid color-mix(in srgb, var(--awoo-border) 60%, transparent); }
        .awoo-ui-table tr:hover td { background: var(--awoo-hover); }
        /* "The one in use": treatment BC (style guide Part II) — the accent at
           low chroma plus a SOFT edge, never a full-strength ring, and weight on
           the row's identifier only (its first cell), not on every figure. */
        .awoo-ui-table tr.awoo-ui-row-current td { background: var(--awoo-bg-accent, var(--awoo-input));
          box-shadow: inset 0 1px 0 var(--awoo-accent-edge, var(--awoo-border)),
            inset 0 -1px 0 var(--awoo-accent-edge, var(--awoo-border)); }
        .awoo-ui-table tr.awoo-ui-row-current td:first-child { font-weight: 600; }
        .awoo-ui-actions { display: flex; gap: 4px; white-space: nowrap; }
        .awoo-ui-btn { background: var(--awoo-input); border: 1px solid var(--awoo-border); border-radius: 4px;
          color: var(--awoo-foreground); font: inherit; font-size: 11px; padding: 3px 8px; cursor: pointer; }
        .awoo-ui-btn:hover { background: var(--awoo-popover); }
        .awoo-ui-btn-danger { color: var(--awoo-danger); border-color: color-mix(in srgb, var(--awoo-danger) 55%, var(--awoo-border)); }
        .awoo-ui-btn-primary { background: var(--awoo-primary); color: var(--awoo-primary-foreground);
          border: 1px solid var(--awoo-primary); font-weight: 600; }
        .awoo-ui-btn-primary:hover { filter: brightness(1.08); }
        .awoo-ui-btn-primary:disabled { opacity: .5; cursor: not-allowed; filter: none; }
        /* Square icon-only button — a table row's rightmost action (share/
           export), or anywhere a full-width labelled button would be too
           heavy next to compact table text. */
        .awoo-ui-icon-btn { background: var(--awoo-input); border: 1px solid var(--awoo-border);
          border-radius: 4px; color: var(--awoo-foreground); width: 24px; height: 24px; padding: 0;
          display: inline-flex; align-items: center; justify-content: center; cursor: pointer; flex: none; }
        .awoo-ui-icon-btn svg { width: 13px; height: 13px; display: block; }
        .awoo-ui-icon-btn:hover { background: var(--awoo-popover); }
        /* A small anchored menu (share/export options) — position is set
           inline per-open via getBoundingClientRect, same anchoring approach
           as the main dropdown, just for a two-or-three-item list instead of
           the whole Core menu. */
        .awoo-ui-menu { position: fixed; z-index: 1000500; background: var(--awoo-solid-card);
          color: var(--awoo-solid-popover-foreground); border: 1px solid var(--awoo-solid-border);
          border-radius: 6px; box-shadow: 0 8px 24px rgba(0,0,0,.45); padding: 4px; min-width: 170px;
          font: calc(12px * var(--awoo-ui-scale, 1)) var(--awoo-font, ${CORE_FONT}); }
        .awoo-ui-menu-item { display: block; width: 100%; text-align: left; background: none; border: none;
          color: inherit; font: inherit; font-size: 11.5px; padding: 6px 8px; border-radius: 4px; cursor: pointer; }
        .awoo-ui-menu-item:hover { background: var(--awoo-hover); }
        .awoo-ui-modal-overlay { position: fixed; inset: 0; z-index: 1001000; background: rgba(0,0,0,.45);
          display: flex; align-items: center; justify-content: center; font: calc(12px * var(--awoo-ui-scale, 1)) var(--awoo-font, ${CORE_FONT}); }
        .awoo-ui-modal { background: var(--awoo-card); color: var(--awoo-popover-foreground);
          border: 1px solid var(--awoo-border); border-radius: 8px; box-shadow: 0 16px 48px rgba(0,0,0,.5);
          padding: 16px; max-width: 360px; }
        .awoo-ui-modal-title { font-weight: 700; font-size: 13px; margin-bottom: 8px; }
        .awoo-ui-modal-msg { opacity: .85; line-height: 1.4; margin-bottom: 14px; white-space: pre-wrap; }
        .awoo-ui-modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
        /* ---- Settings: fixed sidebar, panes, and the save model ---- */
        .awoo-settings { display: flex; margin: -10px -11px; min-height: 100%; }
        .awoo-settings-side { flex: none; width: calc(var(--awoo-cp-side, 150px) * var(--awoo-ui-scale, 1)); padding: var(--awoo-s3);
          border-right: 1px solid var(--awoo-border); display: flex; flex-direction: column;
          gap: var(--awoo-s1); background: color-mix(in srgb, var(--awoo-card) 94%, #000); }
        /* A CATEGORY LABEL, NOT A TAB. These sat at the same indent and nearly
           the same size as the buttons below them, so "Core" and "Modules"
           read as things to click. Now: wider letter-spacing, a hairline rule
           under the label, no button padding, and real space above the second
           group so the two lists separate. */
        .awoo-settings-side-h { font-size: var(--awoo-fs-micro); text-transform: uppercase;
          letter-spacing: .14em; opacity: var(--awoo-em-faint); font-weight: 700;
          padding: 0 3px var(--awoo-s1); margin: var(--awoo-s5) 4px var(--awoo-s2);
          border-bottom: 1px solid color-mix(in srgb, var(--awoo-border) 55%, transparent);
          cursor: default; user-select: none; }
        .awoo-settings-side-h:first-child { margin-top: var(--awoo-s1); }
        .awoo-settings-side-i { background: none; border: none; color: inherit; font: inherit;
          font-size: var(--awoo-fs-control); text-align: left; padding: var(--awoo-s2) 7px;
          border-radius: var(--awoo-r-sm); opacity: var(--awoo-em-normal); cursor: pointer;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .awoo-settings-side-i:hover { opacity: var(--awoo-em-normal); background: var(--awoo-hover); }
        .awoo-settings-side-i.awoo-m-on { opacity: 1; background: var(--awoo-selected); font-weight: 600; }
        .awoo-settings-panes { flex: 1; min-width: 0; padding: 10px 11px; }
        .awoo-settings-pane { display: flex; flex-direction: column; gap: var(--awoo-s4); }
        .awoo-settings-cat { font-size: var(--awoo-fs-micro); text-transform: uppercase;
          letter-spacing: .05em; opacity: var(--awoo-em-muted);
          border-bottom: 1px solid color-mix(in srgb, var(--awoo-border) 60%, transparent);
          padding-bottom: 3px; margin-top: var(--awoo-s3); }
        .awoo-settings-pane > .awoo-settings-cat:first-child { margin-top: 0; }

        /* SAVE MODEL: the split is whether the change PREVIEWS ITSELF.
           A theme change is its own confirmation — putting a Save button in
           front of it asks you to confirm what you can already see — so
           previewable settings apply live and acknowledge quietly here.
           A job-host address is the opposite: it means nothing until the token
           beside it is right, and it was being persisted on every keystroke,
           so a half-typed URL was your stored configuration. That group gets a
           real Save. The rule follows the setting, not the window. */
        .awoo-settings-savebar { display: flex; align-items: center; gap: var(--awoo-s4);
          margin-top: var(--awoo-s4); padding-top: var(--awoo-s4);
          border-top: 1px solid var(--awoo-border); font-size: var(--awoo-fs-control); }
        .awoo-settings-savebar-label { color: var(--awoo-warn); }
        .awoo-settings-applied { font-size: var(--awoo-fs-caption); color: var(--awoo-success);
          opacity: 0; transition: opacity .15s ease; }
        .awoo-settings-applied.on { opacity: 1; }
        @media (prefers-reduced-motion: reduce) { .awoo-settings-applied { transition: none; } }
        /* The Appearance summary: top-right of General, faint until pointed at. */
        .awoo-settings-summary { align-self: flex-end; background: none; border: none; padding: 0;
          color: inherit; font: inherit; font-size: var(--awoo-fs-caption); opacity: var(--awoo-em-faint);
          cursor: pointer; margin-bottom: calc(var(--awoo-s4) * -1); }
        .awoo-settings-summary:hover, .awoo-settings-summary:focus-visible { opacity: 1; color: var(--awoo-primary); }

        /* ---- the Control Panel (REGISTER.md R69; DESIGN.md §9) ----
           Tight, square-ish, quiet: grouping by a thin rule and a small label,
           never by boxing one section heavier than another. */
        .awoo-settings-side-i { display: flex; align-items: center; gap: var(--awoo-s2); }
        .awoo-settings-side-i > span:first-child { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
        .awoo-settings-side-i.awoo-m-sub { padding-left: var(--awoo-s6); }
        .awoo-settings-side-i.awoo-m-dim > span:first-child { opacity: var(--awoo-em-muted); }
        /* THE DEVELOPMENT RULE IS DASHED: work in progress sits under it, and
           only work in progress (DESIGN.md §9). */
        .awoo-settings-side-h.awoo-m-dev { border-bottom-style: dashed; }
        .awoo-cp-badge { font-size: var(--awoo-fs-micro); font-variant-numeric: tabular-nums;
          opacity: var(--awoo-em-muted); font-weight: 600; }
        .awoo-cp-badge.awoo-m-warn { color: var(--awoo-warn); opacity: 1; }
        .awoo-cp-wip { font-size: var(--awoo-fs-micro); color: var(--awoo-warn); font-weight: 700; letter-spacing: .05em; }
        .awoo-cp-tabs { display: flex; gap: var(--awoo-s1); border-bottom: 1px solid var(--awoo-border);
          margin: 0 0 var(--awoo-s4); }
        .awoo-cp-tab { background: none; border: none; border-bottom: 2px solid transparent; color: inherit;
          font: inherit; font-size: var(--awoo-fs-control); font-weight: 600; padding: var(--awoo-s2) var(--awoo-s4);
          margin-bottom: -1px; cursor: pointer; opacity: var(--awoo-em-normal);
          display: inline-flex; align-items: center; gap: var(--awoo-s2); }
        .awoo-cp-tab:hover { opacity: var(--awoo-em-normal); }
        .awoo-cp-tab.awoo-m-on { opacity: 1; border-bottom-color: var(--awoo-primary); }
        .awoo-cp-sub { font-size: var(--awoo-fs-caption); opacity: var(--awoo-em-muted); line-height: 1.4; }
        .awoo-cp-opts { display: flex; flex-wrap: wrap; align-items: center; gap: var(--awoo-s3) var(--awoo-s5);
          font-size: var(--awoo-fs-control); }
        .awoo-cp-check { display: inline-flex; align-items: center; gap: var(--awoo-s2); cursor: pointer; }
        .awoo-cp-cost { margin-left: auto; font-size: var(--awoo-fs-caption); opacity: var(--awoo-em-muted);
          font-variant-numeric: tabular-nums; }
        .awoo-cp-tablewrap { overflow-x: auto; border: 1px solid var(--awoo-border); border-radius: var(--awoo-r-sm); }
        .awoo-cp-table { width: 100%; border-collapse: collapse; font-size: var(--awoo-fs-control); }
        .awoo-cp-table th { font-size: var(--awoo-fs-micro); text-transform: uppercase; letter-spacing: .06em;
          opacity: var(--awoo-em-muted); font-weight: 700; text-align: left; white-space: nowrap;
          padding: var(--awoo-s1) var(--awoo-s3); border-bottom: 1px solid var(--awoo-border); }
        .awoo-cp-table th.awoo-m-grp { border-bottom: 1px solid color-mix(in srgb, var(--awoo-border) 60%, transparent); }
        .awoo-cp-table td { padding: var(--awoo-s1) var(--awoo-s3); vertical-align: middle;
          border-bottom: 1px solid color-mix(in srgb, var(--awoo-border) 40%, transparent); }
        .awoo-cp-table tr:last-child td { border-bottom: none; }
        .awoo-cp-table .awoo-m-c { text-align: center; width: 1%; white-space: nowrap; padding-inline: var(--awoo-s2); }
        .awoo-cp-table .awoo-m-n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
        /* The Modules page's Start column: as narrow as its widest possible
           value ("1000.0 ms"), so the spare width stays with the module's name
           and "Shown in" sits beside the time instead of across the table. */
        .awoo-cp-table .awoo-cp-startcol { width: 1%; min-width: 9ch; }
        .awoo-cp-table tr.awoo-m-dim .awoo-cp-label { opacity: var(--awoo-em-muted); }
        .awoo-cp-table tr.awoo-m-over td { box-shadow: inset 0 2px 0 var(--awoo-primary); }
        .awoo-cp-table tr.awoo-m-dragging { opacity: var(--awoo-em-faint); }
        .awoo-cp-table .awoo-m-good { color: var(--awoo-success); }
        .awoo-cp-table .awoo-m-warn, .awoo-cp-live.awoo-m-warn, .awoo-cp-desc.awoo-m-warn { color: var(--awoo-warn); }
        .awoo-cp-table .awoo-m-bad, .awoo-cp-live.awoo-m-bad { color: var(--awoo-danger); }
        .awoo-cp-table .awoo-m-dimtext { opacity: var(--awoo-em-muted); }
        .awoo-cp-grouprow td { font-size: var(--awoo-fs-micro); text-transform: uppercase; letter-spacing: .08em;
          opacity: var(--awoo-em-muted); font-weight: 700; padding-top: var(--awoo-s3); }
        .awoo-cp-hcol { width: 1px; }
        .awoo-cp-handle { background: none; border: none; color: inherit; cursor: grab; padding: 0 var(--awoo-s1);
          letter-spacing: -2px; opacity: var(--awoo-em-muted); font: inherit; }
        .awoo-cp-handle:hover, .awoo-cp-handle:focus-visible { opacity: 1; }
        .awoo-cp-name { display: flex; align-items: center; gap: var(--awoo-s2); min-width: 0; }
        .awoo-cp-label { font-weight: 600; }
        .awoo-cp-cat { font-size: var(--awoo-fs-micro); text-transform: uppercase; letter-spacing: .05em;
          opacity: var(--awoo-em-muted); border: 1px solid var(--awoo-border); border-radius: var(--awoo-r-sm);
          padding: 0 var(--awoo-s1); }
        .awoo-cp-live { font-size: var(--awoo-fs-caption); opacity: var(--awoo-em-normal); font-variant-numeric: tabular-nums; }
        .awoo-cp-desc { font-size: var(--awoo-fs-caption); opacity: var(--awoo-em-muted); line-height: 1.35; }
        .awoo-cp-gear { background: none; border: none; color: inherit; cursor: pointer; opacity: var(--awoo-em-muted);
          font: inherit; padding: 0 var(--awoo-s1); }
        .awoo-cp-gear:hover { opacity: 1; }
        /* A LABELLED PAIR, NOT A SWITCH (DESIGN.md §9). Square-ish, never a pill. */
        .awoo-cp-seg { display: inline-flex; border: 1px solid var(--awoo-border); border-radius: var(--awoo-r-sm); overflow: hidden; }
        .awoo-cp-seg > button { background: none; border: none; color: inherit; font: inherit;
          font-size: var(--awoo-fs-caption); font-weight: 600; padding: var(--awoo-s1) var(--awoo-s3);
          cursor: pointer; opacity: var(--awoo-em-muted); }
        .awoo-cp-seg > button + button { border-left: 1px solid var(--awoo-border); }
        .awoo-cp-seg > button.awoo-m-on { background: var(--awoo-input); opacity: 1; }
        .awoo-cp-seg > button.awoo-m-on.awoo-m-go { color: var(--awoo-success); background: color-mix(in srgb, var(--awoo-success) 14%, transparent); }
        .awoo-cp-seg > button:disabled { cursor: default; }
        .awoo-ui-btn.awoo-cp-btn-sm { font-size: var(--awoo-fs-caption); padding: var(--awoo-s1) var(--awoo-s3); }
        .awoo-cp-uses { display: inline-flex; flex-wrap: wrap; gap: var(--awoo-s1); }
        .awoo-cp-chip { font-size: var(--awoo-fs-micro); padding: 0 var(--awoo-s1); border-radius: var(--awoo-r-sm);
          background: color-mix(in srgb, var(--awoo-border) 35%, transparent); opacity: var(--awoo-em-normal); }
        .awoo-cp-chip.awoo-m-ok { color: var(--awoo-success); background: color-mix(in srgb, var(--awoo-success) 14%, transparent); }
        .awoo-cp-chip.awoo-m-stale { color: var(--awoo-warn); background: color-mix(in srgb, var(--awoo-warn) 14%, transparent); }
        .awoo-cp-chip.awoo-m-miss { opacity: var(--awoo-em-muted); }
        .awoo-cp-slider { display: flex; align-items: center; gap: var(--awoo-s4); font-size: var(--awoo-fs-control); }
        .awoo-cp-slider[hidden] { display: none; }
        .awoo-cp-slider input { flex: 1; accent-color: var(--awoo-primary); }
        /* The range and its 100% notch: a short tick UNDER the track, where
           neither the filled track nor the thumb can cover it. It sits on the
           track's own scale: a thumb's centre travels from half a thumb in
           from each end (Chromium's thumb is 16px). */
        .awoo-cp-range { flex: 1; position: relative; display: flex; align-items: center; min-width: 0; padding-bottom: 5px; }
        .awoo-cp-range input { width: 100%; margin: 0; }
        .awoo-cp-notch { position: absolute; bottom: 0; width: 1px; height: 5px; pointer-events: none;
          left: calc(8px + (100% - 16px) * var(--awoo-notch, .5)); background: currentColor; opacity: var(--awoo-em-muted); }
        .awoo-cp-sliderval { min-width: 2ch; text-align: right; font-variant-numeric: tabular-nums; }
        .awoo-cp-card { border: 1px solid var(--awoo-border); border-radius: var(--awoo-r-sm); }
        .awoo-cp-cardhead { display: flex; align-items: center; gap: var(--awoo-s4); padding: var(--awoo-s3) var(--awoo-s4); }
        .awoo-cp-cardhead > div:first-child { flex: 1; min-width: 0; }
        .awoo-cp-cardbody { border-top: 1px solid var(--awoo-border); padding: var(--awoo-s3) var(--awoo-s4);
          display: flex; flex-direction: column; gap: var(--awoo-s3); }
        .awoo-cp-legend { display: grid; grid-template-columns: max-content 1fr; gap: var(--awoo-s2) var(--awoo-s5);
          align-items: baseline; font-size: var(--awoo-fs-control); }
        .awoo-cp-banner { display: flex; align-items: center; gap: var(--awoo-s4); padding: var(--awoo-s3) var(--awoo-s4);
          border: 1px solid var(--awoo-border); border-radius: var(--awoo-r-sm); font-size: var(--awoo-fs-control); }
        .awoo-cp-banner.awoo-m-ok { border-color: color-mix(in srgb, var(--awoo-success) 45%, var(--awoo-border)); }
        .awoo-cp-banner.awoo-m-warn { border-color: color-mix(in srgb, var(--awoo-warn) 50%, var(--awoo-border)); }
        .awoo-cp-banner.awoo-m-bad { border-color: color-mix(in srgb, var(--awoo-danger) 50%, var(--awoo-border)); }
        .awoo-cp-banner.awoo-m-muted { opacity: var(--awoo-em-normal); }
        .awoo-cp-banner > div { flex: 1; min-width: 0; }
        .awoo-cp-bannerright { display: inline-flex; gap: var(--awoo-s2); }
        .awoo-cp-changes { margin: 0 0 var(--awoo-s3); padding-left: var(--awoo-s6); font-size: var(--awoo-fs-control); }
        .awoo-cp-changes li { margin: 0 0 var(--awoo-s1); }
        .awoo-cp-logdate { margin-left: var(--awoo-s3); font-weight: 400; text-transform: none; letter-spacing: 0;
          opacity: var(--awoo-em-muted); font-variant-numeric: tabular-nums; }
        .awoo-cp-notes { font-size: var(--awoo-fs-caption); white-space: pre-wrap; margin-top: var(--awoo-s1);
          opacity: var(--awoo-em-normal); }
        .awoo-cp-log { margin: 0; font-size: var(--awoo-fs-caption); white-space: pre-wrap; max-height: 9em; overflow: auto;
          padding: var(--awoo-s3); border: 1px solid var(--awoo-border); border-radius: var(--awoo-r-sm);
          background: var(--awoo-input); }
        /* Settings > Appearance > Fonts: label, select, and the preview BESIDE the select —
           the only thing on screen that moves before Save & apply. */
        .awoo-fonts-row { display: grid; align-items: center; gap: var(--awoo-s3) var(--awoo-s4);
          grid-template-columns: var(--awoo-label-col) minmax(0, 1fr) minmax(0, 1fr);
          font-size: var(--awoo-fs-control); margin-top: var(--awoo-s3); }
        .awoo-fonts-row > label { opacity: var(--awoo-em-muted); }
        .awoo-fonts-row select { font: inherit; background: var(--awoo-input); color: var(--awoo-foreground);
          border: 1px solid var(--awoo-border); border-radius: var(--awoo-r-sm);
          padding: var(--awoo-s1) var(--awoo-s2); min-width: 0; }
        .awoo-fonts-preview { font-size: var(--awoo-fs-body); padding: var(--awoo-s1) var(--awoo-s3);
          border: 1px dashed var(--awoo-border); border-radius: var(--awoo-r-sm);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
        .awoo-fonts-hint { font-size: var(--awoo-fs-caption); opacity: var(--awoo-em-muted); }
        .awoo-fonts-chip { margin-left: auto; letter-spacing: .05em; color: var(--awoo-success); opacity: 1; }
        .awoo-fonts-chip.dirty { color: var(--awoo-warn); }
        .awoo-ui-group { border: 1px solid var(--awoo-border); border-radius: var(--awoo-r-md);
          padding: var(--awoo-s4) 10px; }
        .awoo-ui-group-label { font-size: var(--awoo-fs-micro); text-transform: uppercase;
          letter-spacing: .05em; opacity: var(--awoo-em-muted); margin-bottom: 7px;
          display: flex; align-items: center; gap: var(--awoo-s2); }
        .awoo-ui-group-label .awoo-ui-group-link { margin-left: auto; color: var(--awoo-primary);
          opacity: 1; text-transform: none; letter-spacing: 0; font-size: var(--awoo-fs-caption);
          background: none; border: none; font-family: inherit; cursor: pointer; padding: 0; }
        .awoo-ui-group-label .awoo-ui-group-link:hover { text-decoration: underline; }

        /* ---- the Answer band: AT MOST one per window (DESIGN.md §3) ----
           At most, not exactly — a window whose subject is a table (the plans
           list) legitimately has none, and forcing one on it invents a
           headline out of whatever number was nearest. */
        /* REBUILT 2026-09-21 (the module rebuild, DESIGN.md §3): one row —
           the value at display size, what it measures beside it, and a state
           chip at the right — then ONE context line under it. The old band was
           centred, 800-weight and stacked, which let a module grow four lines of
           competing headline in it. Weight 600: "strong" is the SIZE here;
           heavy weight on top of display size was the "too bold" report. */
        .awoo-ui-answer { display: flex; align-items: baseline; gap: var(--awoo-s4); min-width: 0; }
        .awoo-ui-answer-value { font-size: var(--awoo-fs-display); font-weight: 600; line-height: 1.1;
          letter-spacing: -.01em; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .awoo-ui-answer-unit, .awoo-ui-answer-sub { font-size: var(--awoo-fs-control); opacity: var(--awoo-em-muted);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
        .awoo-ui-answer-value.awoo-ui-answer-good { color: var(--awoo-success); }
        .awoo-ui-context { font-size: var(--awoo-fs-control); opacity: var(--awoo-em-muted);
          margin-top: calc(var(--awoo-s3) * -1); font-variant-numeric: tabular-nums; }
        .awoo-ui-context b { font-weight: 600; opacity: 1; }
        /* A context line that is a REFUSAL (an input is missing) is not quiet. */
        /* awoo-m-warn is the prefixed name (DESIGN.md §9: a bare "warn" can pick
           up the game's own styles); bare .warn stays for the modules using it. */
        .awoo-ui-context.warn, .awoo-ui-context.awoo-m-warn { color: var(--awoo-warn); opacity: 1; }
        /* The state chip: what the module is doing, as a word. */
        .awoo-ui-chip { margin-left: auto; flex: none; font-size: var(--awoo-fs-caption); font-weight: 600;
          letter-spacing: .04em; padding: 1px 7px; border-radius: var(--awoo-r-lg);
          background: var(--awoo-surface-3, var(--awoo-input)); opacity: var(--awoo-em-normal); }
        .awoo-ui-chip.awoo-ui-chip-run { background: var(--awoo-bg-success, transparent); color: var(--awoo-success); opacity: 1; }
        .awoo-ui-chip.awoo-ui-chip-busy { background: var(--awoo-bg-accent, transparent); color: var(--awoo-warn); opacity: 1; }
        .awoo-ui-chip.awoo-ui-chip-alert { background: var(--awoo-bg-danger, transparent); color: var(--awoo-danger); opacity: 1; }
        /* The Action band: one row, primary first, a rare or destructive verb
           pushed right as a ghost. */
        .awoo-ui-actionrow { display: flex; gap: var(--awoo-s3); align-items: center; }
        .awoo-ui-actionrow .awoo-ui-grow { flex: 1; }
        .awoo-ui-btn.awoo-ui-btn-ghost { background: transparent; border-color: transparent;
          opacity: var(--awoo-em-muted); }
        .awoo-ui-btn.awoo-ui-btn-ghost:hover { opacity: 1; background: var(--awoo-hover); }
        .awoo-ui-btn:disabled { opacity: var(--awoo-em-faint); cursor: default; }
        .awoo-ui-note { font-size: var(--awoo-fs-caption); opacity: var(--awoo-em-muted); line-height: 1.35; }
        /* A module's content root. The window body spaces ITS children, but a
           module hands over one wrapper element, so without this the bands inside
           it touched (measured on the Pet Slot Alarm rebuild). */
        .awoo-ui-stack { display: flex; flex-direction: column; gap: var(--awoo-s5); min-width: 0; }

        /* ---- delegation status: WHERE a feature is running ----
           Every delegated feature carries one of these. It is not decoration:
           the whole risk of delegation is a feature quietly running somewhere
           other than you think, so the line is always present and always says
           which side is doing the work. */
        .awoo-ui-delegation { display: flex; align-items: center; gap: var(--awoo-s3);
          font-size: var(--awoo-fs-control); opacity: var(--awoo-em-normal); }
        .awoo-ui-delegation-dot { width: 6px; height: 6px; border-radius: 50%; flex: none;
          background: currentColor; opacity: var(--awoo-em-faint); }
        .awoo-ui-delegation-dot.on { background: var(--awoo-success); opacity: 1; }
        .awoo-ui-delegation-dot.warn { background: var(--awoo-warn); opacity: 1; }
        .awoo-ui-delegation-dot.off { background: none;
          box-shadow: inset 0 0 0 1px currentColor; opacity: var(--awoo-em-faint); }
        .awoo-ui-delegation-text { flex: 1; min-width: 0; line-height: 1.35; }
        .awoo-ui-delegation-open { flex: none; background: none; border: none;
          color: var(--awoo-primary); font: inherit; font-size: var(--awoo-fs-caption);
          cursor: pointer; padding: 0; }
        .awoo-ui-delegation-open:hover { text-decoration: underline; }
        /* The Companion group: set apart from the module's own controls by a
           dashed edge and the Info hue, dimmed while the Companion is not the
           one doing the work. Built by feature.group(). */
        .awoo-ui-companion { border: 1px dashed var(--awoo-border-strong, var(--awoo-border));
          border-radius: var(--awoo-r-md); padding: var(--awoo-s4) 10px;
          background: color-mix(in srgb, var(--awoo-info, var(--awoo-primary)) 5%, transparent); }
        .awoo-ui-companion-h { display: flex; align-items: center; gap: var(--awoo-s2);
          font-size: var(--awoo-fs-micro); text-transform: uppercase; letter-spacing: .05em;
          color: var(--awoo-info, var(--awoo-primary)); margin-bottom: var(--awoo-s3); cursor: default; }
        .awoo-ui-companion-h .awoo-ui-delegation-dot { margin-left: var(--awoo-s2); }
        .awoo-ui-companion-word { font-size: var(--awoo-fs-caption); text-transform: none;
          letter-spacing: 0; color: var(--awoo-foreground); opacity: var(--awoo-em-muted); }
        .awoo-ui-companion-open { margin-left: auto; text-transform: none; letter-spacing: 0; }
        .awoo-ui-companion-note { font-size: var(--awoo-fs-caption); opacity: var(--awoo-em-muted);
          margin-top: var(--awoo-s2); }
        .awoo-ui-companion-dim .awoo-ui-companion-body { opacity: var(--awoo-em-muted); }

        /* ---- activity strip ---- */
        .awoo-ui-activity { margin: auto -11px -10px; border-top: 1px solid var(--awoo-border);
          background: color-mix(in srgb, var(--awoo-card) 94%, #000); flex: none; }
        .awoo-ui-activity-head { display: flex; align-items: center; gap: 7px; width: 100%;
          padding: var(--awoo-s3) 11px; background: none; border: none; color: inherit;
          font: inherit; font-size: var(--awoo-fs-body); text-align: left; cursor: pointer; }
        .awoo-ui-activity-head:hover { background: var(--awoo-hover); }
        .awoo-ui-activity-g { flex: none; width: 11px; text-align: center; }
        .awoo-ui-activity-t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
          white-space: nowrap; opacity: var(--awoo-em-normal); }
        .awoo-ui-activity-ago { flex: none; opacity: var(--awoo-em-faint); }
        .awoo-ui-activity-chev { flex: none; opacity: var(--awoo-em-faint); font-size: var(--awoo-fs-caption); }
        .awoo-ui-activity-list { border-top: 1px solid var(--awoo-border);
          padding: var(--awoo-s1) 0; max-height: 132px; overflow-y: auto; }
        .awoo-ui-activity-row { display: flex; align-items: center; gap: 7px;
          padding: 3px 11px; font-size: var(--awoo-fs-body); }
        .awoo-ui-lvl-done { color: var(--awoo-success); }
        .awoo-ui-lvl-busy { color: var(--awoo-primary); }
        .awoo-ui-lvl-refused { color: var(--awoo-warn); }
        .awoo-ui-lvl-failed { color: var(--awoo-danger); }
        .awoo-ui-lvl-stopped { opacity: var(--awoo-em-faint); }
        .awoo-ui-lvl-info { opacity: var(--awoo-em-muted); }

        /* Keyboard focus was undefined anywhere in this overlay, which made
           every control effectively mouse-only and left focus invisible
           against the host page's own styling. One rule, at the token layer,
           because per-control focus styling is how it gets forgotten. */
        .awoo-window :focus-visible, .awoo-ui-menu :focus-visible,
        .awoo-ui-modal :focus-visible { outline: 2px solid var(--awoo-primary);
          outline-offset: 1px; border-radius: var(--awoo-r-sm); }
      `;
      document.head.appendChild(style);
    }

    // mousedown on the header -> mousemove/mouseup on document AND blur on
    // window (S17: releasing outside the window never delivers a mouseup to
    // document, but blur always fires) -> live-clamp on every mousemove, not
    // only on drop, which is what actually stops a window from ever becoming
    // unreachable rather than merely correcting it after the fact.
    function attachDrag(headerEl, panelEl, onSettle) {
      let startX, startY, startLeft, startTop;
      function onMove(e) {
        const w = panelEl.offsetWidth, h = panelEl.offsetHeight;
        const rect = clampRectToViewport(
          { x: startLeft + (e.clientX - startX), y: startTop + (e.clientY - startY), w, h },
          viewportRect(), { minVisible: 72, margin: 4 },
        );
        panelEl.style.left = rect.x + 'px';
        panelEl.style.top = rect.y + 'px';
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        window.removeEventListener('blur', onUp);
        if (onSettle) onSettle();
      }
      headerEl.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || e.target.closest('button')) return;
        startX = e.clientX; startY = e.clientY;
        const r = panelEl.getBoundingClientRect();
        startLeft = r.left; startTop = r.top;
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        window.addEventListener('blur', onUp);
        e.preventDefault();
      });
    }

    // Core.createWindow(spec) -> handle. Every module's panel is one of these;
    // there is no module-local panel/drag/style code left to write.
    // Regular windows share one incrementing z-index band so clicking one
    // brings it above its siblings; spec.alwaysOnTop windows (a small
    // import/export-style dialog opened over a module's main window, say)
    // live in a permanently higher band instead of merely a higher CURRENT
    // value, so a later click on a regular window can never climb above one.
    // ---- THE STACKING ORDER, DECLARED ONCE ----
    //
    // These were ad-hoc numbers scattered between the stylesheet and this
    // function, and they were wrong: an `alwaysOnTop` window sat at 1000100
    // while the confirm-dialog overlay sat at 1000001, so the "Delete this
    // profile?" dialog rendered BEHIND the window that raised it — reported
    // 2026-09-08, and unfixable by nudging one number without knowing what the
    // others were.
    //
    // Bottom to top, with a 1000 gap between bands so a band can grow (windows
    // increment on click) without ever colliding with the one above:
    //
    //   999000  regular windows            (click-to-front increments)
    //   999500  the Core group + dropdown
    //  1000000  alwaysOnTop windows        (a dialog-ish window over its owner)
    //  1000500  anchored menus (ui.menu)
    //  1001000  modal overlays             — MUST beat every window, or a
    //                                        confirmation is unreachable
    //  1002000  toasts                     — never obscured; they self-dismiss
    //
    // The rule that fixes the reported bug and stops it recurring: **a modal
    // outranks every window, including an always-on-top one.** A window can be
    // pinned above its siblings; nothing can be pinned above the thing asking
    // whether to destroy something.
    //  1002500  tooltips                   — above everything, because a
    //                                        tooltip sits under the cursor and
    //                                        explains whatever is topmost
    //
    // COMPLETED 2026-09-08. The list above said "declared once" while three
    // z-index literals in shipped CSS were in no band at all: the dropdown's
    // 999501, the tooltip's 1002500, and — in a MODULE, which is worse,
    // because a module inventing a number inside Core's ranges is exactly what
    // the band system exists to prevent — pet-slot-alarm's own tooltip at
    // 1000002, which put it UNDER menus and modals. A declared order with
    // undeclared members is the same "nudge one number and hope" trap the
    // original stacking bug came from, so every literal is now a named band
    // and `userscripts/tests/design-tokens.mjs` fails when a new one appears.
    const Z = Object.freeze({
      window: 999000,
      chrome: 999500,
      // Belongs to the chrome band but must clear the group button that opens
      // it — the one deliberate +1 in this table.
      chromePopover: 999501,
      windowOnTop: 1000000,
      menu: 1000500,
      modal: 1001000,
      toast: 1002000,
      tooltip: 1002500,
    });
    let topZIndex = Z.window;
    let topZIndexOnTop = Z.windowOnTop;
    function bringToFront(el, alwaysOnTop) {
      if (alwaysOnTop) { topZIndexOnTop += 1; el.style.zIndex = String(topZIndexOnTop); }
      else { topZIndex += 1; el.style.zIndex = String(topZIndex); }
    }

    function applyMaxSize(el, opts) {
      const vp = viewportRect();
      const margin = 8;
      const mode = (opts && opts.resizable) || 'none';
      if (mode === 'both' || mode === 'vertical') el.style.maxHeight = Math.max(160, vp.h - margin * 2) + 'px';
      if (mode === 'both' || mode === 'horizontal') el.style.maxWidth = Math.max(260, vp.w - margin * 2) + 'px';
    }

    function createWindow(spec) {
      if (!spec || !spec.id) { console.error('[AwooCore] createWindow needs { id }'); return null; }
      injectWindowStyleOnce();
      const el = document.createElement('div');
      el.className = 'awoo-window';
      el.id = 'awoo-window-' + spec.id;
      el.hidden = true;
      // resizable: false/undefined (none) | true (both) | 'vertical' | 'horizontal'.
      // A table-heavy window wants vertical-only — more rows, not a wider
      // window than its content needs — capped so it can never be dragged
      // taller than the viewport itself (applyMaxSize, kept current by the
      // shared resize listener alongside the position reclamp).
      //
      // This is the window's OWN intended mode, from its spec — separate from
      // whether resizing is currently allowed at all (the windowResizingEnabled
      // setting, applyResizability below), so a global off/on doesn't have to
      // know or guess what each window would otherwise have supported.
      const specResizeMode = spec.resizable === true ? 'both' : (spec.resizable || 'none');
      function effectiveResizeMode() {
        return getSetting('windowResizingEnabled') ? specResizeMode : 'none';
      }
      function applyResizability() {
        const mode = effectiveResizeMode();
        el.dataset.resizable = mode !== 'none' ? 'true' : 'false';
        el.style.resize = mode;
      }
      applyResizability();
      applyMaxSize(el, { resizable: specResizeMode });
      bringToFront(el, spec.alwaysOnTop);

      const header = document.createElement('div');
      header.className = 'awoo-window-header';
      const title = document.createElement('span');
      title.className = 'awoo-window-title';
      title.textContent = spec.title || spec.id;
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'awoo-window-close';
      // A drawn 9px cross, not the text character: "×" at 16px read as the
      // loudest thing in every header (the maintainer, 2026-09-25).
      closeBtn.innerHTML = '<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7"/></svg>';
      closeBtn.title = 'Close';
      header.appendChild(title);
      // spec.settingsTab: this module's own pane id. Rendered only when one is
      // asked for, because a gear that opens an empty tab is worse than no
      // gear — and it sits BEFORE the close button so the destructive control
      // stays in the corner where every window has trained you to expect it.
      if (spec.settingsTab) {
        const gear = document.createElement('button');
        gear.type = 'button';
        gear.className = 'awoo-window-gear';
        gear.textContent = '⚙';
        gear.title = 'Settings for this module';
        gear.addEventListener('click', (e) => {
          e.stopPropagation();
          openSettingsWindow(spec.settingsTab);
        });
        header.appendChild(gear);
      }
      header.appendChild(closeBtn);

      const body = document.createElement('div');
      body.className = 'awoo-window-body';
      el.appendChild(header);
      el.appendChild(body);
      document.body.appendChild(el);

      const persist = spec.persistGeometry !== false;
      // `let`, not `const`: setMinSize() below changes these at runtime. The
      // Settings window is the one caller — its size is a user setting, not a
      // property of the window, and re-creating the window to change it would
      // throw away its content and every listener on it.
      let minW = (spec.minSize && spec.minSize.w) || 360;
      let minH = (spec.minSize && spec.minSize.h) || 240;

      function computeDefaultRect() {
        if (spec.defaultRect && spec.defaultRect !== 'auto') return spec.defaultRect;
        const vp = viewportRect();
        // spec.defaultSize (v12) is the size a window OPENS at, on first open
        // and after "Reset window sizes"; minSize is only the floor a drag may
        // not go under. They used to be one number, which forced a choice
        // between a good first size and letting people make it smaller.
        const want = spec.defaultSize || {};
        const w = Math.min(Math.max(want.w || minW, minW), vp.w - 32);
        const h = Math.min(Math.max(want.h || minH, minH), vp.h - 32);
        return { x: Math.round((vp.w - w) / 2), y: Math.round((vp.h - h) / 3), w, h };
      }
      // Width a side panel has borrowed (handle.widen, REGISTER.md R89). It is added
      // on screen and taken off everything that is measured or saved, so the
      // saved size, Reset and the size floor all mean the window WITHOUT the
      // panel: a window closed with its panel open reopens at its own size.
      let extraW = 0;
      function applyRect(rect) {
        el.style.left = rect.x + 'px';
        el.style.top = rect.y + 'px';
        // Width/height are always set from the default/persisted rect, resizable
        // or not — a non-resizable window still needs a DEFINED size (previously
        // it had none at all and just shrank/grew to fit content, which is how
        // the Settings window ended up with no real control over its own
        // height). The CSS `resize` handle, when present, still lets a
        // resizable window's box grow past this starting point by dragging.
        el.style.height = rect.h + 'px';
        el.style.width = (rect.w + extraW) + 'px';
      }
      function currentRect() {
        return {
          x: parseFloat(el.style.left) || 0, y: parseFloat(el.style.top) || 0,
          w: Math.max(0, el.offsetWidth - extraW), h: el.offsetHeight,
        };
      }
      // The detached check is not defensive noise: a destroyed window's pending
      // resize debounce used to fire 300ms later against an element already out
      // of the document, where offsetWidth/offsetHeight are both 0 — persisting
      // a 0x0 rect over a perfectly good saved one. (The minSize floor on the
      // next open hid the damage; the saved size was still lost.)
      //
      // `el.hidden` gets the SAME treatment (2026-09-10, FOURTH round on
      // this bug — the closest fix yet still wasn't enough). The previous
      // pass made close()/toggle() flush a PENDING resize before hiding —
      // correct as far as it goes, but ResizeObserver notifications are
      // asynchronous relative to the DOM change that causes them: a resize
      // synchronously CAUSED right before close() (pet-slot-alarm's and
      // fighter-allocator's own close paths collapse an internal "activity
      // strip" immediately before calling this) has not been OBSERVED yet
      // by the time that flush runs — el._awooResizeTimer is still
      // whatever it was before, so the flush finds nothing to do. The
      // observer then fires AFTER el.hidden is already true, arms a fresh
      // debounce anyway, and 300ms later persistNow() ran against a
      // hidden, 0-sized box regardless of the flush.
      //
      // Trying to out-time every possible ordering of "what caused a
      // resize right before close" is a losing game — the robust fix is
      // here, at the one place the actual write happens: a hidden window
      // has no real box to measure, so ANY save attempted while hidden is
      // refused outright, not just the ones this file happened to already
      // think to flush. §9.4's "refuse rather than guess" applied to a
      // window's own geometry, not just to a live game-data probe.
      function persistNow() {
        if (!persist || !el.isConnected || el.hidden) return;
        saveWindowGeometry(spec.id, currentRect());
      }

      let widenedFromX = null; // where a widened window stood before it moved left to fit
      let rect = (persist && loadWindowGeometry(spec.id)) || computeDefaultRect();
      // REPORTED BUG: windows "start very small and always have to be
      // expanded." A persisted rect is trusted verbatim once saved — if it
      // predates a later minSize increase, or the user (or a stray drag)
      // shrank it below minSize, nothing ever floors it back up. Every open
      // must honor the CURRENT minSize, not whatever happened to get saved.
      rect = { ...rect, w: Math.max(rect.w, minW), h: Math.max(rect.h, minH) };
      rect = clampRectToViewport(rect, viewportRect(), { minVisible: 72, margin: 4 });
      applyRect(rect);

      attachDrag(header, el, persistNow);
      // Click-to-focus: any interaction with an already-open window brings
      // it above its siblings, not just the moment it first opens.
      el.addEventListener('mousedown', () => bringToFront(el, spec.alwaysOnTop));

      // EVERY window owns a scope (v10). Before this, teardown was a list of
      // things destroy() had to remember, and it had already forgotten two of
      // them — the ResizeObserver and its in-flight debounce, which then fired
      // against a detached element and persisted a 0x0 rect over a good one.
      // Now destroy() disposes a scope and the list maintains itself: anything
      // registered here is released, including by code added later that never
      // reads destroy().
      const winScope = coreScope.child(`window:${spec.id}`);

      if (specResizeMode !== 'none') {
        winScope.resize(el, () => {
          clearTimeout(el._awooResizeTimer);
          // REPORTED BUG (2026-09-10, found while re-verifying the FIRST fix
          // for this): resize, move, CLOSE the window, refresh — position
          // survived, size reset to default. The timer ID left in
          // `el._awooResizeTimer` after it FIRES is still a truthy number
          // (clearTimeout on an already-fired id is a harmless no-op, but
          // the stored id itself never gets cleared) — so
          // flushPendingResize's `if (!el._awooResizeTimer) return` could
          // not tell "already saved, ages ago" from "still pending right
          // now". Closing the window later, then any subsequent pagehide
          // (a refresh) called persistNow() a SECOND time against that
          // stale truthy id — and by then the window is `hidden` (display:
          // none), so currentRect()'s offsetWidth/offsetHeight read 0,
          // silently overwriting the good saved size with a 0x0 rect. Only
          // size was hit because currentRect()'s x/y come from style.left/
          // top (unaffected by hidden), but w/h come from the live box.
          // Fixed by nulling the id out the moment it actually fires, so a
          // later flush has nothing stale left to mistake for "pending".
          el._awooResizeTimer = setTimeout(() => { el._awooResizeTimer = null; persistNow(); }, 300);
        });
        winScope.add(() => clearTimeout(el._awooResizeTimer));
      }

      // Two DIFFERENT reset strengths, deliberately not one — the main
      // dropdown's reset button is meant for "I dragged this off-screen,
      // just get it back" (position only, keep whatever size I set), while
      // Settings' "Reset window sizes" is the deliberate, occasional full
      // reset (position AND size, every window). Before this they were the
      // same operation reachable from two places, which is a real overlap:
      // one of them was surprising the other by quietly resetting size too.
      function resetPositionOnly() {
        applyMaxSize(el, { resizable: specResizeMode });
        const current = currentRect();
        const def = computeDefaultRect();
        const rect = { x: def.x, y: def.y, w: current.w, h: current.h };
        applyRect(clampRectToViewport(rect, viewportRect(), { minVisible: 72, margin: 4 }));
        persistNow();
      }
      function resetFull() {
        applyMaxSize(el, { resizable: specResizeMode });
        applyRect(clampRectToViewport(computeDefaultRect(), viewportRect(), { minVisible: 72, margin: 4 }));
        persistNow();
      }

      // REPORTED BUG (2026-09-10): "window resizing doesn't keep between
      // sessions/refreshes — only saves when the window is open at the
      // moment of refreshing, not when it's idle in the background."
      //
      // Root cause: the ResizeObserver above debounces persistNow() by
      // 300ms (winScope.resize, above) so an active drag does not spam
      // localStorage on every intermediate frame. That debounce is a
      // setTimeout — and CLAUDE.md rule 5 / INSTRUMENTATION.md §4.4 is
      // exactly this trap: "a hidden tab clamps timers to roughly once a
      // minute." Resize the window, then switch away from the tab (or the
      // window goes `hidden` some other way) before 300ms elapses, and the
      // pending save can sit throttled for up to a minute — long enough
      // that a refresh in the meantime loses it outright, with nothing
      // ever having actually written the new size.
      //
      // Called from THREE places now, not just the shared tab-hidden
      // listener it was written for: handle.close() and handle.toggle()
      // below also call it, because a window's own close is a second,
      // narrower version of the exact same race — see close()'s comment.
      function flushPendingResize() {
        if (!el._awooResizeTimer) return;
        clearTimeout(el._awooResizeTimer);
        el._awooResizeTimer = null;
        persistNow();
      }

      windowRegistry[spec.id] = {
        reclamp() {
          if (el.hidden) return; // a hidden window has nothing on-screen to reclamp
          applyMaxSize(el, { resizable: specResizeMode });
          applyRect(clampRectToViewport(currentRect(), viewportRect(), { minVisible: 72, margin: 4 }));
        },
        // Called when the windowResizingEnabled setting flips, so every
        // already-open window picks up the change immediately rather than
        // only on its next fresh open.
        applyResizability,
        // Exposed so Settings' "Reset window sizes" can reach EVERY
        // registered window directly, whether or not its module is
        // currently enabled/open and without depending on that module having
        // wired up onResetPosition correctly.
        resetFull,
        // Exposed so the shared visibilitychange/pagehide listeners
        // (below) can flush every registered window, not just this one.
        flushPendingResize,
      };

      const handle = {
        el,
        open() { el.hidden = false; bringToFront(el, spec.alwaysOnTop); },
        // Plain hide — no side effects, so a module can call this from its
        // OWN close logic (e.g. togglePanel(false)) without ever recursing
        // back into itself through onClose.
        //
        // REPORTED REGRESSION (2026-09-10, THIRD round on this same bug):
        // "resize, close, refresh — size still resets to default", even
        // after the stale-timer-id fix above. Root cause this time: both
        // pet-slot-alarm and fighter-allocator's own close paths collapse an
        // internal "activity strip" immediately before calling this — a
        // real, LEGITIMATE content resize (not a stale id), confirmed by
        // the comment already sitting on that collapse call ("expanding it
        // grows the window... closing while expanded banked the extra
        // height into saved geometry", from an earlier pass). That resize
        // arms a fresh, perfectly valid 300ms debounce — and then THIS
        // function ran synchronously right after, hiding the window before
        // that timer ever got to fire. 300ms later it fired anyway, against
        // a now-hidden (0x0) box, saving zero. flushPendingResize() existed
        // already (for the tab-hidden case above) but nothing called it
        // from the one path that matters here: the window's OWN close.
        close() { flushPendingResize(); el.hidden = true; },
        toggle() {
          if (!el.hidden) flushPendingResize(); // same reasoning as close(), above
          el.hidden = !el.hidden;
          return !el.hidden;
        },
        setContent(node) { body.innerHTML = ''; body.appendChild(node); },
        isOpen() { return !el.hidden; },
        // Two lines, and it stays two lines however much this window grows —
        // that is the whole point of the scope. The registry entry is explicit
        // because it is not a subscription, it is a shared map the resize
        // sweep reads.
        destroy() {
          delete windowRegistry[spec.id];
          winScope.dispose();
          el.remove();
        },
        // Exposed so a module can attach its OWN listeners to this window's
        // lifetime rather than to its own — a panel's controls should die with
        // the panel, not with the module.
        scope: winScope,
        // Recovers a lost window regardless of the CURRENT viewport size —
        // the whole point of a reset button is that it must not depend on the
        // thing that got the window lost in the first place. POSITION only —
        // see resetFull() for the size-included version.
        resetPosition: resetPositionOnly,
        resetFull,
        // Changes the floor a persisted rect is measured against. resetFull()
        // is what actually re-lays the window out; this only moves the bar, so
        // a caller that wants the new size applied now must call both — which
        // is deliberate, because raising the floor on a window somebody has
        // deliberately sized should not yank it out from under them.
        setMinSize(size) {
          if (!size) return;
          if (Number.isFinite(size.w)) minW = size.w;
          if (Number.isFinite(size.h)) minH = size.h;
        },
        // widen(px): add px to the window's width for a side panel, and
        // widen(0) to give it back (REGISTER.md R89: the Party
        // module's Limits panel). The extra width is never persisted: the
        // saved rect, Reset and the size floor all measure the window without
        // it. The window is kept on-screen by moving left when the wider box
        // would pass the right edge, and moves back when the panel closes.
        widen(px) {
          const want = Math.max(0, Math.round(Number(px) || 0));
          if (want === extraW) return;
          // From the style, not the box: a module may widen a window that is
          // still hidden (restoring an open panel at load), and a hidden
          // window's box measures 0x0, which laid it out 0 wide and 0 tall.
          const sw = parseFloat(el.style.width), sh = parseFloat(el.style.height);
          const base = currentRect();
          if (Number.isFinite(sw)) base.w = Math.max(0, sw - extraW);
          if (Number.isFinite(sh)) base.h = sh;
          if (want === 0 && widenedFromX !== null) base.x = widenedFromX;
          widenedFromX = want > 0 ? (extraW > 0 ? widenedFromX : base.x) : null;
          extraW = want;
          const vp = viewportRect();
          const fullW = base.w + extraW;
          if (extraW > 0 && vp.w > 0 && base.x + fullW > vp.w - 4) base.x = Math.max(4, vp.w - 4 - fullW);
          applyRect(base);
          persistNow();
        },
        widened() { return extraW; },
      };
      // A module supplying onClose owns what "close" means (e.g. it may also
      // need to update its own open/closed state or persist something) — the
      // X button defers to it rather than hiding unconditionally, so there is
      // exactly one code path for closing, not two that can drift apart.
      closeBtn.addEventListener('click', () => { if (spec.onClose) spec.onClose(); else handle.close(); });
      if (spec.content) handle.setContent(spec.content);
      return handle;
    }

    // Core.ui.* — small reusable builders, not a component library. Every
    // module reaches for these instead of hand-rolling its own table/modal/
    // tooltip, which is what made three modules' worth of fonts/spacing drift
    // apart before there was a second module to notice it.

    // At most one anchored ui.menu is open at a time, and this is the handle
    // that can actually tear the open one down (see ui.menu below).
    let activeMenu = null;
    const ui = {
      // Generalises the existing dropdown info-icon (buildUi()'s
      // .awoo-core-info-icon) into something any module can use, rather than
      // duplicating the same hover-tooltip markup a second time.
      infoIcon(text) {
        const span = document.createElement('span');
        span.className = 'awoo-core-info-icon';
        span.setAttribute('data-tooltip', text);
        span.setAttribute('data-tooltip-wide', '');
        span.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3">'
          + '<circle cx="8" cy="8" r="6.3"/><line x1="8" y1="7.2" x2="8" y2="11.3" stroke-linecap="round"/>'
          + '<circle cx="8" cy="4.9" r="0.9" fill="currentColor" stroke="none"/></svg>';
        return span;
      },
      // Replaces native confirm()/alert() — a blocking native dialog was an
      // explicit complaint about the tool this module was compared against.
      confirmDialog(opts) {
        opts = opts || {};
        injectWindowStyleOnce();
        return new Promise((resolve) => {
          const overlay = document.createElement('div');
          overlay.className = 'awoo-ui-modal-overlay';
          const modal = document.createElement('div');
          modal.className = 'awoo-ui-modal';
          const title = document.createElement('div');
          title.className = 'awoo-ui-modal-title';
          title.textContent = opts.title || 'Confirm';
          const msg = document.createElement('div');
          msg.className = 'awoo-ui-modal-msg';
          msg.textContent = opts.message || '';
          const actions = document.createElement('div');
          actions.className = 'awoo-ui-modal-actions';
          const cancelBtn = document.createElement('button');
          cancelBtn.type = 'button'; cancelBtn.className = 'awoo-ui-btn'; cancelBtn.textContent = 'Cancel';
          const okBtn = document.createElement('button');
          okBtn.type = 'button';
          okBtn.className = 'awoo-ui-btn' + (opts.danger ? ' awoo-ui-btn-danger' : '');
          okBtn.textContent = opts.confirmLabel || 'Confirm';
          function finish(v) {
            overlay.remove();
            document.removeEventListener('keydown', onKey, true);
            resolve(v);
          }
          function onKey(e) { if (e.key === 'Escape') finish(false); }
          cancelBtn.addEventListener('click', () => finish(false));
          okBtn.addEventListener('click', () => finish(true));
          overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(false); });
          document.addEventListener('keydown', onKey, true);
          actions.appendChild(cancelBtn); actions.appendChild(okBtn);
          modal.appendChild(title); modal.appendChild(msg); modal.appendChild(actions);
          overlay.appendChild(modal);
          document.body.appendChild(overlay);
          okBtn.focus();
        });
      },
      // {columns:[{key,label,info?,render?(row)}], rows:[...], rowActions?:[{label,onClick(row),danger?}]}
      table(spec) {
        injectWindowStyleOnce();
        const table = document.createElement('table');
        table.className = 'awoo-ui-table';
        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        for (const col of spec.columns) {
          const th = document.createElement('th');
          th.textContent = col.label;
          if (col.info) th.appendChild(ui.infoIcon(col.info));
          headRow.appendChild(th);
        }
        if (spec.rowActions) headRow.appendChild(document.createElement('th'));
        thead.appendChild(headRow);
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        for (const row of spec.rows) {
          const tr = document.createElement('tr');
          // spec.rowClass(row) (v12): one class for a row with a state, such as
          // awoo-ui-row-current for "the one in use". Optional and additive.
          const rowCls = typeof spec.rowClass === 'function' ? spec.rowClass(row) : '';
          if (rowCls) tr.className = rowCls;
          for (const col of spec.columns) {
            const td = document.createElement('td');
            const v = typeof col.render === 'function' ? col.render(row) : row[col.key];
            if (v instanceof Node) td.appendChild(v); else td.textContent = v == null ? '' : String(v);
            tr.appendChild(td);
          }
          if (spec.rowActions) {
            const td = document.createElement('td');
            td.className = 'awoo-ui-actions';
            for (const action of spec.rowActions) {
              // An escape hatch for an action that isn't a plain labelled
              // button — an icon button opening its own small menu, say.
              // Keeps that kind of one-off row control out of this shared
              // component instead of growing a second mini-API here for it.
              if (typeof action.render === 'function') { td.appendChild(action.render(row)); continue; }
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'awoo-ui-btn' + (action.danger ? ' awoo-ui-btn-danger' : '') + (action.primary ? ' awoo-ui-btn-primary' : '');
              // label may be a function of the row (e.g. "Archive"/"Unarchive"
              // depending on that row's own state) — a static string is the
              // common case and works unchanged.
              btn.textContent = typeof action.label === 'function' ? action.label(row) : action.label;
              btn.addEventListener('click', () => action.onClick(row));
              td.appendChild(btn);
            }
            tr.appendChild(td);
          }
          tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        return table;
      },
      // A small anchored dropdown — icon-button-opens-a-menu, not the whole
      // Core dropdown. items: [{label, onClick(), danger?}]. Opens BELOW the
      // anchor, flips ABOVE if there's no room, exactly the same two-step
      // clamp logic already proven for the main Core dropdown
      // (positionDropdownNearAnchor) rather than a second one invented here.
      menu(anchorEl, items) {
        injectWindowStyleOnce();
        // CLOSE the previous menu, don't just delete its element. Removing the
        // node left its capture-phase document `mousedown` listener attached
        // forever, holding a closure over a detached element and running
        // el.contains() on every mousedown on the page for the rest of the
        // session — one more each time a menu was opened. INSTRUMENTATION.md
        // §4.4: "no document-level listener outlives the interaction that
        // needed it." A DOM id cannot carry a teardown function, so the live
        // handle is tracked here instead of re-found from the document.
        if (activeMenu) activeMenu.close();
        const el = document.createElement('div');
        el.className = 'awoo-ui-menu';
        el.id = 'awoo-ui-menu-active';
        for (const item of items) {
          // A rule between groups (R69's right-click menus), never two in a row
          // or one at either end.
          if (item.separator) {
            const last = el.lastChild;
            if (last && !(last.className || '').includes('awoo-ui-menu-sep')) {
              const sep = document.createElement('div');
              sep.className = 'awoo-ui-menu-sep';
              el.appendChild(sep);
            }
            continue;
          }
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'awoo-ui-menu-item';
          if (item.danger) btn.style.color = 'var(--awoo-danger)';
          // A choice that is on or off shows a tick, and always keeps the
          // tick's column so the labels line up.
          btn.textContent = (item.checked === undefined ? '' : (item.checked ? '✓ ' : '\u2003 ')) + item.label;
          btn.addEventListener('click', (e) => { e.stopPropagation(); close(); item.onClick(); });
          el.appendChild(btn);
        }
        document.body.appendChild(el);
        const anchor = anchorEl.getBoundingClientRect();
        el.style.visibility = 'hidden';
        const size = { w: el.offsetWidth || 170, h: el.offsetHeight || 80 };
        const rect = positionDropdownNearAnchor(anchor, size, viewportRect(), 6);
        el.style.left = rect.x + 'px';
        el.style.top = rect.y + 'px';
        el.style.visibility = '';
        // A menu's whole lifetime in one object (v10). The pending arm-timeout
        // and the document listener are both registered here, so `close()` is
        // one call and cannot half-tear-down — which is exactly how the
        // original leak happened: the element was removed and the listener was
        // not, because they were released in two different places.
        const menuScope = coreScope.child('ui-menu');
        function close() {
          if (activeMenu === handle) activeMenu = null;
          menuScope.dispose();
          el.remove();
        }
        function onOutside(e) { if (!el.contains(e.target) && e.target !== anchorEl) close(); }
        // Captured, not bubbled — the anchor button's own click handler
        // (which opened this) fires on mouseup/click, after mousedown, so a
        // capture-phase listener here can never close a menu the very click
        // that opened it. Registered from inside the timeout so that a menu
        // closed within the same tick never attaches one at all.
        menuScope.timeout(() => menuScope.on(document, 'mousedown', onOutside, true), 0);
        menuScope.on(document, 'keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }, true);
        if (el.lastChild && (el.lastChild.className || '').includes('awoo-ui-menu-sep')) el.lastChild.remove();
        const handle = { close, scope: menuScope };
        activeMenu = handle;
        return handle;
      },
      // ---- the write path (v10) ----
      //
      // Every module's DOM writes go through `write`, so N modules cost one
      // layout per frame instead of N. `dom.*` compare before writing, so an
      // unchanged value costs nothing at all. See the scheduler's own header
      // for the three rules and why "hidden" holds rather than drops.
      write(key, fn) { scheduler.write(key, fn); },
      flushWrites() { scheduler.flushNow(); },
      get writeStats() { return scheduler.stats; },
      dom: domWrite,
      // A marker that carries developer-tier explanation and DISAPPEARS when
      // the setting is off -- rather than a dimmed or disabled icon, which
      // would leave the clutter it exists to remove. Returns an element the
      // caller appends wherever the explanation belongs.
      devIcon(text) {
        injectWindowStyleOnce();
        const el = document.createElement('span');
        el.className = 'awoo-ui-devicon';
        el.textContent = '\u2699';
        el.setAttribute('data-tooltip-dev', text);
        el.setAttribute('data-tooltip-wide', '');
        el.hidden = !getSetting('showDevTooltips');
        devIcons.push(el);
        return el;
      },
      // ---- the activity strip (DESIGN.md §5) ----
      //
      // One line at the foot of a module window saying what the module last
      // did, expandable to the recent history. This is the UI half of the
      // feedback contract, and it exists because of a specific shipped bug:
      // the World Boss archive detector returns null on no-match, the caller's
      // `if` is false, and NOTHING is written, logged or shown — so a user
      // cannot tell "this page had no boss level" from "this has never once
      // worked", which is exactly why it was still unverified after shipping.
      //
      // Five levels, and the level carries the meaning rather than being
      // decoration: `done` names what it produced AND how much; `refused` says
      // which input was absent (absence IS the message — §9.4's "refuse rather
      // than guess" told the code to return null, this tells the user);
      // `failed` names the mismatch, never just "error"; `stopped` is the user
      // ending it and is deliberately not a failure.
      //
      // THE INVARIANT: a `busy` entry is always resolved. busy() hands back
      // the only handle that can write its closing line, and opening a second
      // busy removes the first rather than leaving it hanging — so "started
      // something and silently stopped existing" is not a reachable state.
      // Disposing with one still open logs it, because that is a module bug.
      //
      // {scope?, max?} -> {el, done, refused, failed, stopped, info, busy, clear, dispose}
      activity(spec) {
        injectWindowStyleOnce();
        spec = spec || {};
        const max = spec.max == null ? 6 : spec.max;
        const entries = [];       // newest first
        let openBusy = null;
        let expanded = false;
        // How much height this strip added to its window when expanded, so
        // collapsing returns exactly that.
        let grownBy = 0;

        const el = document.createElement('div');
        el.className = 'awoo-ui-activity';
        const head = document.createElement('button');
        head.type = 'button';
        head.className = 'awoo-ui-activity-head';
        const glyph = document.createElement('span');
        glyph.className = 'awoo-ui-activity-g';
        const text = document.createElement('span');
        text.className = 'awoo-ui-activity-t';
        const ago = document.createElement('span');
        ago.className = 'awoo-ui-activity-ago awoo-num';
        const chev = document.createElement('span');
        chev.className = 'awoo-ui-activity-chev';
        chev.textContent = '⌃';
        for (const n of [glyph, text, ago, chev]) head.appendChild(n);
        const list = document.createElement('div');
        list.className = 'awoo-ui-activity-list';
        list.hidden = true;
        el.appendChild(head); el.appendChild(list);

        const GLYPH = { done: '✓', busy: '⋯', refused: '!', failed: '✕', stopped: '■', info: '·' };

        // Relative, from a stored timestamp — never a counter incremented per
        // tick. A hidden tab clamps timers to about once a minute, so anything
        // accumulated is wrong by the time you look at it (INSTRUMENTATION §4.4).
        function agoText(atMs) {
          const s = Math.max(0, Math.round((Date.now() - atMs) / 1000));
          if (s < 60) return s + 's';
          if (s < 3600) return Math.round(s / 60) + 'm';
          return Math.round(s / 3600) + 'h';
        }

        function render() {
          const top = entries[0];
          domWrite.text(glyph, top ? GLYPH[top.level] : '');
          domWrite.attr(glyph, 'class', 'awoo-ui-activity-g awoo-ui-lvl-' + (top ? top.level : 'info'));
          domWrite.text(text, top ? top.text : 'Nothing yet.');
          domWrite.text(ago, top ? agoText(top.atMs) : '');
          domWrite.attr(chev, 'style', 'transform:rotate(' + (expanded ? 180 : 0) + 'deg)');
          if (!expanded) { list.hidden = true; return; }
          list.hidden = false;
          // Rebuilt rather than diffed: at most `max` rows, only while open.
          list.innerHTML = '';
          for (const e of entries) {
            const row = document.createElement('div');
            row.className = 'awoo-ui-activity-row';
            const g = document.createElement('span');
            g.className = 'awoo-ui-activity-g awoo-ui-lvl-' + e.level;
            g.textContent = GLYPH[e.level];
            const t = document.createElement('span');
            t.className = 'awoo-ui-activity-t';
            t.textContent = e.text;
            t.title = e.text;
            const a = document.createElement('span');
            a.className = 'awoo-ui-activity-ago awoo-num';
            a.textContent = agoText(e.atMs);
            for (const n of [g, t, a]) row.appendChild(n);
            list.appendChild(row);
          }
        }
        const paint = () => ui.write('awoo-activity-' + (spec.name || entries.length), render);

        function push(level, msg) {
          entries.unshift({ level, text: String(msg), atMs: Date.now() });
          while (entries.length > max) entries.pop();
          paint();
        }
        function closeBusy(level, msg) {
          if (openBusy && entries[0] === openBusy) entries.shift();
          openBusy = null;
          push(level, msg);
        }

        // EXPANDING SHOULD MAKE ROOM, not start a scrollbar. The strip sits at
        // the foot of a window whose height is fixed by its saved geometry, so
        // opening the history just pushed the body into overflow: you clicked
        // to read something and got a scroll container instead.
        //
        // Only when the body was NOT already scrolling. If it was, the window
        // is deliberately smaller than its content and growing it would
        // override a size the user chose. Clamped against the viewport, and
        // collapsing gives back exactly what expanding took rather than a
        // guess -- hence grownBy.
        head.addEventListener('click', () => {
          const win = el.closest && el.closest('.awoo-window');
          const body = win && win.querySelector('.awoo-window-body');
          const wasOverflowing = body ? body.scrollHeight > body.clientHeight + 1 : true;
          const collapsing = expanded;
          expanded = !expanded;
          render();
          if (!win || !body) return;
          if (collapsing) {
            if (grownBy) {
              const r = win.getBoundingClientRect();
              win.style.height = Math.max(0, r.height - grownBy) + 'px';
            }
            grownBy = 0;
            return;
          }
          if (wasOverflowing) return;
          const grow = list.offsetHeight;
          const vp = viewportRect();
          const r = win.getBoundingClientRect();
          if (!grow || !(vp.h > 0)) return;
          const room = Math.max(0, vp.h - 8 - r.top);
          const target = Math.min(r.height + grow, room);
          if (target > r.height) {
            grownBy = target - r.height;
            win.style.height = target + 'px';
          }
        });

        const handle = {
          el,
          done: (m) => push('done', m),
          refused: (m) => push('refused', m),
          failed: (m) => push('failed', m),
          stopped: (m) => push('stopped', m),
          info: (m) => push('info', m),
          busy(m) {
            // A second busy replaces the first rather than stacking, so the
            // strip can never show two things in flight when one of them was
            // abandoned. The stale handle's methods become no-ops.
            if (openBusy && entries[0] === openBusy) entries.shift();
            const mine = { level: 'busy', text: String(m), atMs: Date.now() };
            entries.unshift(mine);
            while (entries.length > max) entries.pop();
            openBusy = mine;
            paint();
            const live = () => openBusy === mine;
            return {
              done: (t) => { if (live()) closeBusy('done', t); },
              refused: (t) => { if (live()) closeBusy('refused', t); },
              failed: (t) => { if (live()) closeBusy('failed', t); },
              stopped: (t) => { if (live()) closeBusy('stopped', t); },
              update: (t) => { if (live()) { mine.text = String(t); paint(); } },
            };
          },
          clear() { entries.length = 0; openBusy = null; paint(); },
          // Called by a module from its own close path. Expanding grows the
          // window, and growing it trips createWindow's persisting
          // ResizeObserver -- so closing while expanded BANKED the extra
          // height into saved geometry, and each open/expand/close cycle
          // stacked another one. Collapsing first gives it back.
          collapse() {
            if (!expanded) return;
            expanded = false;
            render();
            if (!grownBy) return;
            const win = el.closest && el.closest('.awoo-window');
            if (win) {
              const r = win.getBoundingClientRect();
              if (r.height) win.style.height = Math.max(0, r.height - grownBy) + 'px';
            }
            grownBy = 0;
          },
          dispose() {
            if (openBusy) console.warn('[AwooCore] activity strip disposed with "' + openBusy.text + '" still in flight — that is a module bug: every busy() must be resolved.');
            if (tick) clearInterval(tick);
          },
        };

        // Ages go stale silently, which is the one way this component could
        // lie. Cheap: one interval, one frame-batched write, and only the
        // relative-time text can change.
        // OWNED BY DEFAULT. This used to register teardown only when a caller
        // passed a scope, and neither module did -- so the interval ran for the
        // life of the page and dispose() was never reached, including after the
        // user disabled the module, which is meant to stop everything. That is
        // precisely the leak shape createScope exists to prevent, so the
        // fallback is coreScope rather than nothing.
        const tick = setInterval(paint, 15000);
        const owner = (spec.scope && typeof spec.scope.add === 'function') ? spec.scope : coreScope;
        owner.add(() => handle.dispose());
        render();
        return handle;
      },
      // {label, type?, value?, options?:[{value,label}], onChange?(value), info?} -> row element,
      // with row._input left as an escape hatch for a caller that needs to read/focus it later.
      inputRow(spec) {
        injectWindowStyleOnce();
        const row = document.createElement('div');
        row.className = 'awoo-ui-input-row';
        const label = document.createElement('label');
        label.textContent = spec.label;
        // ONE icon carrying BOTH tiers, rather than a second icon beside it.
        // The developer half is invisible until the setting is on, so a second
        // marker would be an empty slot most of the time -- and the whole point
        // of the tier is fewer things on screen, not more.
        if (spec.info || spec.devInfo) {
          const icon = ui.infoIcon(spec.info || '');
          if (spec.devInfo) icon.setAttribute('data-tooltip-dev', spec.devInfo);
          label.appendChild(icon);
        }
        const input = document.createElement(spec.type === 'select' ? 'select' : 'input');
        if (spec.type && spec.type !== 'select') input.type = spec.type;
        if (spec.type === 'select' && spec.options) {
          for (const opt of spec.options) {
            const o = document.createElement('option');
            o.value = opt.value; o.textContent = opt.label;
            input.appendChild(o);
          }
        }
        if (spec.value !== undefined) input.value = spec.value;
        if (spec.onChange) input.addEventListener('input', () => spec.onChange(input.value));
        row.appendChild(label);
        row.appendChild(input);
        row._input = input;
        return row;
      },
    };

    function buildUi() {
      applyThemeMode(); // sets --awoo-* on :root before anything below references them
      applyUiScale();
      applyCpSideWidth();
      const STYLE_ID = 'awoo-core-style';
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        /* THE TOP BAR (R69 round 6, the maintainer's C2): one thin frame
           around the group, no fill and no gradient; AWOO+, the Profile Sync
           icon and the module buttons are set apart by short rules. Hover
           OUTLINES a button instead of filling it, because a grey fill read
           as washed out outside Slate, and an open window keeps an accent-dim
           outline. 22px, to sit in the nav's own row height. */
        /* SIZED IN PLACE, NOT FROM THE :root TOKENS: a token is computed once,
           at :root, so the bar's own scale (applyBarScale, which sets
           --awoo-ui-scale on the bar) would never reach it. Each size below is
           the token's own formula, resolved here. */
        #awoo-core-group { display: inline-flex; align-items: center; gap: calc(2px * var(--awoo-ui-scale, 1)); vertical-align: middle;
          border-radius: 4px; font-family: var(--awoo-font, ${CORE_FONT}); line-height: 1;
          height: calc(22px * var(--awoo-bar-k, 1)); box-sizing: border-box; align-self: center; margin: 0 4px; padding: 1px;
          border: 1px solid var(--awoo-border); background: transparent; }
        /* Only when no nav bar could be found - see anchorGroup(). */
        #awoo-core-group.awoo-core-floating { position: fixed; top: 8px; right: 8px; z-index: 999500;
          background: var(--awoo-card); box-shadow: 0 4px 16px rgba(0,0,0,.4); }
        #awoo-core-btn { background: transparent; color: var(--awoo-primary); border: 1px solid transparent;
          border-radius: 3px; font-weight: 700; letter-spacing: .01em; padding: 0 calc(7px * var(--awoo-bar-k, 1)); cursor: pointer;
          font-size: calc(11px * var(--awoo-bar-k, 1));
          height: 100%; -webkit-font-smoothing: antialiased; transition: border-color .1s ease; }
        #awoo-core-btn:hover { border-color: var(--awoo-border-strong); }
        .awoo-core-bar-sep { width: 1px; height: calc(12px * var(--awoo-bar-k, 1)); background: var(--awoo-border); flex: none; margin: 0 3px; }
        .awoo-core-bar-sep[hidden] { display: none; }
        #awoo-core-quick-row { display: flex; align-items: center; gap: calc(2px * var(--awoo-ui-scale, 1)); height: 100%; }
        .awoo-core-quick-btn { background: none; border: 1px solid transparent; border-radius: 3px;
          color: var(--awoo-ink-soft); padding: 0 calc(7px * var(--awoo-bar-k, 1)); cursor: pointer;
          font-size: calc(11px * var(--awoo-ui-scale, 1)); height: 100%; font-weight: 500; position: relative;
          display: inline-flex; align-items: center; gap: calc(5px * var(--awoo-bar-k, 1));
          -webkit-font-smoothing: antialiased; transition: color .1s ease, border-color .1s ease; }
        .awoo-core-quick-btn:hover { color: var(--awoo-foreground); border-color: var(--awoo-border-strong); }
        .awoo-core-quick-btn:hover .awoo-core-sd { transform: scale(1.35); }
        .awoo-core-quick-btn .awoo-core-sd { transition: transform .12s ease; }
        /* The cap slider's placeholders: real width, clearly not real buttons. */
        .awoo-core-quick-ghost { cursor: default; border-style: dashed; border-color: var(--awoo-border); }
        .awoo-core-quick-ghost:hover { border-color: var(--awoo-border); color: var(--awoo-ink-soft); }
        /* THE PROFILE SYNC ICON: a status light, not a module button. A data
           stack with a small dot: fresh, old, or nothing synced (hollow). It
           never blinks. Hovering opens the sections card below it. */
        .awoo-core-profile-btn { padding: 0 calc(5px * var(--awoo-bar-k, 1)); }
        .awoo-core-profile-btn svg { width: calc(14px * var(--awoo-bar-k, 1)); height: calc(14px * var(--awoo-bar-k, 1)); display: block; }
        .awoo-core-profile-dot { position: absolute; right: 2px; bottom: 2px; width: calc(6px * var(--awoo-bar-k, 1)); height: calc(6px * var(--awoo-bar-k, 1)); border-radius: 50%;
          background: var(--awoo-success); box-shadow: 0 0 0 1.5px var(--awoo-solid-card, var(--awoo-card)); }
        .awoo-core-profile-dot.awoo-m-old { background: var(--awoo-warn); }
        .awoo-core-profile-dot.awoo-m-none { background: var(--awoo-solid-card, var(--awoo-card)); box-shadow: inset 0 0 0 1px currentColor, 0 0 0 1.5px var(--awoo-solid-card, var(--awoo-card)); }
        .awoo-core-profile-card { position: fixed; z-index: 1000500; width: 300px; box-sizing: border-box; background: var(--awoo-solid-card, var(--awoo-card));
          color: var(--awoo-popover-foreground); border: 1px solid var(--awoo-border-strong); border-radius: 6px;
          box-shadow: 0 10px 26px rgba(0,0,0,.45); padding: 8px 10px; pointer-events: none;
          font: calc(12px * var(--awoo-ui-scale, 1)) var(--awoo-font, ${CORE_FONT}); }
        .awoo-core-profile-card[hidden] { display: none; }
        .awoo-core-pc-head { display: flex; align-items: center; gap: var(--awoo-s3); font-weight: 700; margin-bottom: 6px; }
        .awoo-core-pc-head span:last-child { margin-left: auto; font-weight: 400; color: var(--awoo-ink-soft); }
        .awoo-core-pc-grid { display: grid; grid-template-columns: 1fr auto; gap: var(--awoo-s1) var(--awoo-s5); font-size: var(--awoo-fs-control); }
        .awoo-core-pc-grid .awoo-m-ok { color: var(--awoo-success); }
        .awoo-core-pc-grid .awoo-m-stale { color: var(--awoo-warn); }
        .awoo-core-pc-grid .awoo-m-miss { color: var(--awoo-ink-soft); }
        .awoo-core-pc-foot { margin-top: 6px; color: var(--awoo-ink-soft); font-size: var(--awoo-fs-caption); }
        .awoo-core-quick-btn-open { color: var(--awoo-primary); border-color: var(--awoo-accent-edge); }
        .awoo-core-quick-btn-open:hover { color: var(--awoo-primary); border-color: var(--awoo-accent); }

        /* ---- the state slot ----
           A module reports WHAT IT IS DOING, not merely whether its window is
           open, so the nav can answer "is my tracker still running?" without
           opening anything. Deliberately a slot rather than a dot: a state may
           render as a filled dot or as a glyph, so a level like "attention"
           can show "!" where a colour alone would not carry it.
           DISABLED AND IDLE MUST NOT LOOK ALIKE. An off module is HOLLOW (a
           ring, no fill); an idle one is FILLED and muted. Same size, opposite
           construction — the one distinction a greyed-dot-for-both loses. */
        .awoo-core-sd { width: 6px; height: 6px; border-radius: 50%; flex: none;
          background: currentColor; opacity: .45; display: inline-flex;
          align-items: center; justify-content: center;
          font-weight: 700; line-height: 1; font-style: normal; }
        .awoo-core-sd-off { background: none; box-shadow: inset 0 0 0 1px currentColor; opacity: .4; }
        .awoo-core-sd-idle { opacity: .45; }
        .awoo-core-sd-running { background: var(--awoo-primary); opacity: 1; }
        .awoo-core-sd-attention { background: none; color: var(--awoo-warn); opacity: 1;
          width: auto; height: auto; font-size: var(--awoo-fs-caption); }
        .awoo-core-sd-problem { background: none; color: var(--awoo-danger); opacity: 1;
          width: auto; height: auto; font-size: var(--awoo-fs-caption); }
        /* On the bar, the slot follows the bar's own scale (see #awoo-core-group). */
        #awoo-core-group .awoo-core-sd { width: calc(6px * var(--awoo-bar-k, 1)); height: calc(6px * var(--awoo-bar-k, 1)); }
        #awoo-core-group .awoo-core-sd-attention, #awoo-core-group .awoo-core-sd-problem {
          width: auto; height: auto; font-size: calc(10px * var(--awoo-ui-scale, 1)); }
        /* NO BLINK (the maintainer, 2026-09-25: "too distracting", and more so
           while Profile Sync is still imperfect). Colour and the glyph carry it. */
        #awoo-core-dropdown { position: fixed; z-index: 999501; background: var(--awoo-card);
          color: var(--awoo-popover-foreground); border: 2px solid var(--awoo-border); border-radius: 6px;
          box-shadow: 0 8px 24px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.04);
          padding: 0; font: calc(12px * var(--awoo-ui-scale, 1)) var(--awoo-font, ${CORE_FONT});
          width: calc(300px * var(--awoo-ui-scale, 1)); height: calc(400px * var(--awoo-ui-scale, 1));
          flex-direction: column; overflow: hidden; }
        #awoo-core-dropdown.awoo-pal-wide { width: calc(600px * var(--awoo-ui-scale, 1)); }
        /* ui.infoIcon's icon. It lived beside the old menu's section labels, and
           went with them in the R69 cleanup although ui.infoIcon still uses it:
           every (i) then drew at the SVG's natural size, huge. Kept here, by
           itself, and design-tokens.mjs now fails if it goes again. */
        .awoo-core-info-icon { display: inline-flex; align-items: center; opacity: var(--awoo-em-normal); cursor: help;
          position: relative; text-transform: none; letter-spacing: normal; }
        .awoo-core-info-icon svg { width: 11px; height: 11px; display: block; }
        /* ---- the menu as a command palette (REGISTER.md R69; DESIGN.md §9) ----
           Tight rows, one entry per thing, a fixed height so nothing jumps. */
        .awoo-pal-top { display: flex; align-items: center; gap: var(--awoo-s3); padding: var(--awoo-s2) var(--awoo-s2) var(--awoo-s2) var(--awoo-s4);
          border-bottom: 1px solid var(--awoo-border); flex: none; }
        .awoo-pal-top b { font-weight: 700; color: var(--awoo-primary); }
        .awoo-pal-count { font-size: var(--awoo-fs-caption); opacity: var(--awoo-em-muted); flex: 1; }
        .awoo-pal-ib { width: 24px; height: 24px; display: inline-grid; place-items: center; padding: 0; cursor: pointer;
          background: none; border: 1px solid transparent; border-radius: var(--awoo-r-sm); color: inherit; opacity: var(--awoo-em-muted); }
        .awoo-pal-ib:hover, .awoo-pal-ib:focus-visible { opacity: 1; background: var(--awoo-hover); border-color: var(--awoo-border); }
        .awoo-pal-ib svg { width: 14px; height: 14px; }
        .awoo-pal-search { display: flex; align-items: center; gap: var(--awoo-s3); padding: var(--awoo-s3) var(--awoo-s4);
          border-bottom: 1px solid var(--awoo-border); flex: none; }
        #awoo-core-dropdown:focus { outline: none; }
        .awoo-pal-search[hidden] { display: none; }
        .awoo-pal-search svg { width: 13px; height: 13px; opacity: var(--awoo-em-muted); flex: none; }
        .awoo-pal-search input { flex: 1; min-width: 0; background: none; border: none; outline: none; color: inherit;
          font: inherit; font-size: var(--awoo-fs-body); padding: 0; }
        .awoo-pal-main { flex: 1; min-height: 0; display: flex; }
        .awoo-pal-list { flex: 1; min-width: 0; overflow: auto; padding: var(--awoo-s1) var(--awoo-s2) var(--awoo-s2); }
        .awoo-pal-side { flex: 1; min-width: 0; overflow: auto; border-left: 1px solid var(--awoo-border);
          padding: var(--awoo-s3) var(--awoo-s4); display: flex; flex-direction: column; gap: var(--awoo-s3); }
        .awoo-pal-group { font-size: var(--awoo-fs-micro); text-transform: uppercase; letter-spacing: .1em; font-weight: 700;
          padding: var(--awoo-s3) var(--awoo-s3) var(--awoo-s1); display: flex; align-items: baseline; }
        .awoo-pal-glabel { opacity: var(--awoo-em-muted); }
        .awoo-pal-manage { margin-left: auto; background: none; border: none; color: inherit; font: inherit;
          text-transform: none; letter-spacing: 0; font-weight: 400; padding: 0; cursor: pointer; opacity: var(--awoo-em-faint); }
        .awoo-pal-manage:hover, .awoo-pal-manage:focus-visible { opacity: 1; color: var(--awoo-primary); }
        .awoo-pal-row { display: flex; align-items: center; gap: var(--awoo-s3); padding: 0 var(--awoo-s3);
          min-height: 22px; border-radius: var(--awoo-r-sm); cursor: pointer; }
        .awoo-pal-row.awoo-m-sel { background: var(--awoo-hover); }
        .awoo-pal-row .awoo-core-sd { margin: 0 1px; }
        .awoo-pal-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .awoo-pal-row.awoo-m-open .awoo-pal-name { color: var(--awoo-primary); font-weight: 600; }
        .awoo-pal-row.awoo-m-off .awoo-pal-name { opacity: var(--awoo-em-muted); }
        .awoo-pal-right { font-size: var(--awoo-fs-caption); opacity: var(--awoo-em-muted); font-variant-numeric: tabular-nums;
          white-space: nowrap; }
        .awoo-pal-right.awoo-m-warn { color: var(--awoo-warn); opacity: 1; }
        .awoo-pal-right.awoo-m-bad { color: var(--awoo-danger); opacity: 1; }
        /* "Open" appears on the row you point at or select, not on every tool. */
        .awoo-pal-right.awoo-m-go { visibility: hidden; color: var(--awoo-primary); opacity: 1; }
        .awoo-pal-row.awoo-m-sel .awoo-pal-right.awoo-m-go, .awoo-pal-row:hover .awoo-pal-right.awoo-m-go { visibility: visible; }
        .awoo-pal-toolmark { width: 8px; height: 8px; flex: none; border: 1px solid currentColor; border-radius: calc(var(--awoo-r-sm) / 2);
          opacity: var(--awoo-em-faint); margin: 0 -1px; }
        .awoo-pal-doc { border: none; width: 11px; height: 11px; display: inline-grid; place-items: center; opacity: var(--awoo-em-muted); }
        .awoo-pal-doc svg { width: 11px; height: 11px; }
        .awoo-pal-chev { border: none; width: auto; height: auto; line-height: 1; opacity: var(--awoo-em-muted); }
        .awoo-pal-tag { font-size: var(--awoo-fs-micro); text-transform: uppercase; letter-spacing: .05em; opacity: var(--awoo-em-muted); }
        .awoo-pal-empty, .awoo-pal-muted { font-size: var(--awoo-fs-caption); opacity: var(--awoo-em-muted); line-height: 1.4; }
        .awoo-pal-empty { padding: var(--awoo-s4); }
        .awoo-pal-h { font-weight: 700; font-size: var(--awoo-fs-title); }
        .awoo-pal-stat { display: flex; align-items: center; gap: var(--awoo-s3); font-size: var(--awoo-fs-control); }
        .awoo-pal-stat .awoo-m-warn { color: var(--awoo-warn); }
        .awoo-pal-stat .awoo-m-bad { color: var(--awoo-danger); }
        .awoo-pal-stat .awoo-pal-right { margin-left: auto; }
        .awoo-pal-acts { display: flex; flex-wrap: wrap; align-items: center; gap: var(--awoo-s2) var(--awoo-s4); font-size: var(--awoo-fs-control); }
        .awoo-pal-label { font-size: var(--awoo-fs-micro); text-transform: uppercase; letter-spacing: .08em; font-weight: 700;
          opacity: var(--awoo-em-muted); margin-top: var(--awoo-s2); }
        .awoo-pal-warn { font-size: var(--awoo-fs-caption); color: var(--awoo-warn); }
        .awoo-pal-meta { margin-top: auto; }
        .awoo-pal-card { border: 1px solid var(--awoo-border); border-radius: var(--awoo-r-sm); padding: var(--awoo-s3) var(--awoo-s4);
          display: flex; flex-direction: column; gap: var(--awoo-s3); }
        .awoo-pal-secgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 var(--awoo-s5); font-size: var(--awoo-fs-caption); }
        .awoo-pal-sec { display: flex; justify-content: space-between; gap: var(--awoo-s2); opacity: var(--awoo-em-muted); white-space: nowrap; }
        .awoo-pal-sec.awoo-m-ok, .awoo-pal-sec.awoo-m-stale { opacity: 1; }
        /* The mark is "awoo-m-mark", not ".mark": awooCls() prefixes every token
           the menu builds, so a bare ".mark" rule matched nothing and the column
           lost the Profile Sync colours (reported 2026-09-25). Same roles as the
           top-bar card: fresh in success, old in warn, never seen in soft ink. */
        .awoo-pal-sec.awoo-m-ok .awoo-m-mark { color: var(--awoo-success); font-weight: 700; }
        .awoo-pal-sec.awoo-m-stale .awoo-m-mark { color: var(--awoo-warn); font-weight: 700; }
        .awoo-pal-sec.awoo-m-miss .awoo-m-mark { color: var(--awoo-ink-soft); }
        .awoo-pal-att { display: flex; align-items: center; gap: var(--awoo-s3); background: none; border: none; color: inherit;
          font: inherit; font-size: var(--awoo-fs-caption); text-align: left; padding: var(--awoo-s1) var(--awoo-s2);
          border-radius: var(--awoo-r-sm); cursor: pointer; }
        .awoo-pal-att:hover { background: var(--awoo-hover); }
        .awoo-pal-psl { display: flex; align-items: center; gap: var(--awoo-s3); background: none; border: none; color: inherit;
          font: inherit; font-size: var(--awoo-fs-caption); text-align: left; cursor: pointer; flex: none;
          border-top: 1px solid var(--awoo-border); padding: var(--awoo-s2) var(--awoo-s4); opacity: var(--awoo-em-normal); }
        .awoo-pal-psl:hover { background: var(--awoo-hover); }
        .awoo-pal-foot { display: flex; align-items: center; gap: var(--awoo-s1); border-top: 1px solid var(--awoo-border);
          padding: var(--awoo-s2) var(--awoo-s3); flex: none; }
        .awoo-pal-cp { display: inline-flex; align-items: center; gap: var(--awoo-s2); cursor: pointer; font: inherit;
          font-size: var(--awoo-fs-control); font-weight: 600; color: var(--awoo-primary);
          background: color-mix(in srgb, var(--awoo-primary) 12%, transparent);
          border: 1px solid color-mix(in srgb, var(--awoo-primary) 40%, transparent);
          border-radius: var(--awoo-r-sm); padding: var(--awoo-s1) var(--awoo-s4); margin-right: var(--awoo-s1); }
        .awoo-pal-cp svg { width: 13px; height: 13px; }
        .awoo-pal-cp:hover { background: color-mix(in srgb, var(--awoo-primary) 20%, transparent); }
        .awoo-pal-ver { margin-left: auto; display: flex; flex-direction: column; align-items: flex-end;
          font-size: var(--awoo-fs-micro); opacity: var(--awoo-em-normal); font-variant-numeric: tabular-nums; line-height: 1.25; }
        /* A hover tint and the pointer, no underline: the colour already says it
           is special (the maintainer, 2026-09-25). */
        .awoo-pal-updlink { background: none; border: none; font: inherit; font-weight: 700; color: var(--awoo-warn);
          padding: 0 var(--awoo-s1); border-radius: var(--awoo-r-sm); cursor: pointer; }
        .awoo-pal-updlink:hover { background: color-mix(in srgb, var(--awoo-warn) 15%, transparent); }
        .awoo-ui-menu-sep { height: 1px; background: var(--awoo-border); margin: var(--awoo-s1) var(--awoo-s2); }
        /* GENERALIZED (was scoped to .awoo-core-info-icon only): "all buttons
           need hover-over info, especially condensed text or icons" — any
           element carrying data-tooltip gets the same styled bubble now,
           not just the dedicated info-icon SVG. Kept off native title attrs
           on these deliberately: two overlapping tooltips (one native, one
           custom) is worse than one. */
        /* An element carrying the hidden attribute must actually be hidden.
           The UA rule is only [hidden] { display: none }, which ANY inline
           display beats — so a row built with an inline display:flex and then
           hidden via el.hidden = true stays fully on screen, looking like a
           control that should not be there. That is exactly what the Settings
           capacity row did. */
        [hidden] { display: none !important; }

        /* ---- TOOLTIPS ARE A REAL ELEMENT NOW, NOT A ::after ----
           This was a pseudo-element for three iterations and every reported
           tooltip complaint traces to that one decision. A ::after cannot
           escape its ancestors, and all four symptoms follow:

           1. TRANSPARENT. "opacity" applies to an element's whole subtree,
              pseudo-elements included. Every info icon is styled at
              --awoo-em-muted and the disable-all button at --awoo-em-faint, so
              their tooltips rendered at 55% and 40% however opaque the
              background token was. THIS is why "transparent hover-overs" kept
              coming back after the --awoo-solid-* fix: that fix addressed a
              translucent theme COLOUR, and the cause was inherited opacity.
           2. ALWAYS OPENS RIGHT. "left: 0" anchors to the element's left edge
              and extends rightward; nothing could flip it.
           3. GOES OFF-SCREEN. Nothing clamped it to the viewport.
           4. FORCES A HORIZONTAL SCROLLBAR. An absolutely-positioned box
              contributes to its scroll container's scroll width the moment it
              becomes display:block, so hovering an icon in the Settings pane
              widened the pane. The old comment here claimed display:none had
              solved that -- it only moved it from always to on-hover.

           A real element on <body>, positioned fixed, has no ancestor to
           inherit from, contributes to no panel's scroll area, and can be
           flipped and clamped by the same pure helper the dropdown and every
           ui.menu already use. Same markup contract: any [data-tooltip]. */
        /* THE DEVELOPER TIER. Same bubble, tinted, with its second half set
           apart -- a separate popup would mean two things to position, two to
           dismiss, and a hover that changes shape depending on a setting. The
           accent border is what carries "this is not for you unless you asked
           for it" at a glance. */
        .awoo-ui-tip-hasdev { border-color: var(--awoo-primary); }
        .awoo-ui-tip-dev { display: block; margin-top: var(--awoo-s3);
          padding-top: var(--awoo-s3); border-top: 1px dashed var(--awoo-primary);
          color: var(--awoo-primary); }
        .awoo-ui-tip-dev[hidden] { display: none !important; }
        /* An info icon that only exists in developer mode. Deliberately the
           accent colour rather than the muted foreground every other icon
           uses, so it is obvious which icons appeared because of a setting. */
        .awoo-ui-devicon { color: var(--awoo-primary); opacity: var(--awoo-em-normal);
          cursor: help; display: inline-flex; align-items: center;
          font-size: var(--awoo-fs-caption); font-weight: 700; margin-left: var(--awoo-s2); }
        .awoo-ui-devicon:hover { opacity: 1; }
        .awoo-ui-tip { position: fixed; z-index: 1002500; box-sizing: border-box;
          background: var(--awoo-solid-card); color: var(--awoo-solid-popover-foreground);
          border: 1px solid var(--awoo-solid-border); border-radius: var(--awoo-r-sm);
          padding: 5px 7px; font-size: var(--awoo-fs-caption); line-height: 1.35;
          white-space: pre-line; pointer-events: none;
          box-shadow: 0 4px 12px rgba(0,0,0,.5); font: var(--awoo-fs-caption) var(--awoo-font);
          font-family: var(--awoo-font); }
        #awoo-core-toasts { position: fixed; right: 14px; bottom: 14px; z-index: 1002000;
          display: flex; flex-direction: column; gap: 8px; align-items: flex-end;
          pointer-events: none; font: calc(12px * var(--awoo-ui-scale, 1)) var(--awoo-font, ${CORE_FONT}); }
        .awoo-core-toast { pointer-events: auto; display: flex; align-items: center; gap: 8px;
          max-width: 320px; background: var(--awoo-card); color: var(--awoo-popover-foreground);
          border: 1px solid var(--awoo-border); border-left-width: 3px; border-radius: 6px;
          padding: 8px 10px; box-shadow: 0 8px 24px rgba(0,0,0,.45);
          opacity: 0; transform: translateY(6px); transition: opacity .18s, transform .18s; }
        .awoo-core-toast.awoo-core-toast-in { opacity: 1; transform: none; }
        .awoo-core-toast-info { border-left-color: var(--awoo-primary); }
        .awoo-core-toast-success { border-left-color: var(--awoo-success); }
        .awoo-core-toast-warn { border-left-color: var(--awoo-warn); }
        .awoo-core-toast-error { border-left-color: var(--awoo-danger); }
        .awoo-core-toast-msg { flex: 1; line-height: 1.35; }
        .awoo-core-toast-action { background: var(--awoo-primary); color: var(--awoo-primary-foreground);
          border: none; border-radius: 4px; font: inherit; font-size: 11px; font-weight: 600;
          padding: 3px 8px; cursor: pointer; flex: none; }
        .awoo-core-toast-close { background: none; border: none; color: inherit; opacity: .5;
          cursor: pointer; font-size: 14px; line-height: 1; padding: 0 2px; flex: none; }
        .awoo-core-toast-close:hover { opacity: 1; }
        @media (prefers-reduced-motion: reduce) {
          .awoo-core-toast { transition: none; }
        }
      `;
      // Injected once, keyed by id: during a Core update Tampermonkey can
      // briefly have two copies live, and two identical <style> blocks double
      // every rule that stacks (borders, padding) rather than replacing it.
      if (!document.getElementById(STYLE_ID)) document.head.appendChild(style);

      const group = document.createElement('div');
      group.id = 'awoo-core-group';
      applyBarScale(group);
      const coreBtn = document.createElement('button');
      coreBtn.id = 'awoo-core-btn';
      coreBtn.type = 'button';
      coreBtn.textContent = 'AWOO+ ▾';
      const quickRow = document.createElement('div');
      quickRow.id = 'awoo-core-quick-row';
      const profileBtn = document.createElement('button');
      profileBtn.type = 'button';
      profileBtn.id = 'awoo-core-profile-btn';
      profileBtn.className = 'awoo-core-quick-btn awoo-core-profile-btn';
      profileBtn.hidden = true;
      profileBtn.addEventListener('click', (e) => { e.stopPropagation(); openSettingsWindow('sync'); });
      profileBtn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        ui.menu(profileBtn, [
          { label: 'Sync now', onClick: () => { resyncProfile(); toast('Requested profile sync…', { type: 'info', duration: 2500 }); } },
          { label: 'Copy JSON', onClick: async () => {
            const ok = await copyTextToClipboard(JSON.stringify(getProfile(), null, 2));
            toast(ok ? 'Profile copied.' : 'Could not copy automatically.', { type: ok ? 'success' : 'warn', duration: 2500 });
          } },
          { label: 'Details…', onClick: () => openSettingsWindow('sync') },
          { label: 'Hide from the bar', onClick: () => setProfileOnBar(false) },
        ]);
      });
      profileBtn.setAttribute('aria-label', 'Profile Sync');
      profileBtn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">'
        + '<ellipse cx="8" cy="4" rx="5" ry="2"/><path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4"/>'
        + '<path d="M3 8c0 1.1 2.2 2 5 2s5-.9 5-2"/></svg>';
      const profileDot = document.createElement('i');
      profileDot.className = 'awoo-core-profile-dot';
      profileBtn.appendChild(profileDot);
      // The sections card: built on first hover, informational only (a
      // right-click has the actions), so it never takes the pointer.
      let profileCard = null;
      const showProfileCard = () => {
        if (!profileCard) {
          profileCard = document.createElement('div');
          profileCard.className = 'awoo-core-profile-card';
          document.body.appendChild(profileCard);
        }
        fillProfileCard(profileCard);
        profileCard.hidden = false;
        const rect = positionDropdownNearAnchor(profileBtn.getBoundingClientRect(),
          { w: profileCard.offsetWidth, h: profileCard.offsetHeight }, viewportRect(), 6);
        // Kept on screen even where the positioner would right-align it past
        // the left edge (a narrow window with the bar near the left).
        const vw = viewportRect().w;
        profileCard.style.left = Math.max(6, vw ? Math.min(rect.x, vw - profileCard.offsetWidth - 6) : rect.x) + 'px';
        profileCard.style.top = rect.y + 'px';
      };
      const hideProfileCard = () => { if (profileCard) profileCard.hidden = true; };
      profileBtn.addEventListener('pointerenter', showProfileCard);
      profileBtn.addEventListener('pointerleave', hideProfileCard);
      profileBtn.addEventListener('focus', showProfileCard);
      profileBtn.addEventListener('blur', hideProfileCard);
      profileBtn.addEventListener('pointerdown', hideProfileCard);
      const sepCore = document.createElement('span');
      sepCore.className = 'awoo-core-bar-sep';
      const sepProfile = document.createElement('span');
      sepProfile.className = 'awoo-core-bar-sep';
      group.appendChild(coreBtn);
      group.appendChild(sepCore);
      group.appendChild(profileBtn);
      group.appendChild(sepProfile);
      group.appendChild(quickRow);

      const dropdown = document.createElement('div');
      dropdown.id = 'awoo-core-dropdown';
      dropdown.style.display = 'none';
      // ---- THE MENU IS A COMMAND PALETTE (REGISTER.md R69; DESIGN.md §9) ----
      //
      // Chosen over a plain list and a tile grid in the R69 rounds: one entry
      // per thing (status dot, name, its live reading), search that also finds
      // hidden items and every Control Panel page, the arrow keys and Enter,
      // and a right-click menu for everything else. Two widths, both a fixed
      // height so the menu never jumps as rows change: compact, and wide with
      // a second column that is the player's choice (the selected item's
      // details, or an overview of Profile Sync and what needs attention).
      const pal = {};
      const mk = (tag, cls, text) => {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
      };
      pal.top = mk('div', 'awoo-pal-top');
      pal.top.appendChild(mk('b', null, 'AWOO+'));
      pal.count = mk('span', 'awoo-pal-count');
      pal.top.appendChild(pal.count);
      pal.layoutBtn = mk('button', 'awoo-pal-ib');
      pal.layoutBtn.type = 'button';
      pal.top.appendChild(pal.layoutBtn);
      pal.search = mk('div', 'awoo-pal-search');
      pal.search.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="7" cy="7" r="4.2"/><path d="m10.2 10.2 3.3 3.3"/></svg>';
      pal.input = mk('input');
      pal.input.type = 'text';
      pal.input.placeholder = 'Search modules, tools, settings…';
      pal.input.setAttribute('aria-label', 'Search AWOO+');
      pal.input.autocomplete = 'off';
      pal.input.spellcheck = false;
      pal.search.appendChild(pal.input);
      pal.main = mk('div', 'awoo-pal-main');
      pal.list = mk('div', 'awoo-pal-list');
      pal.list.setAttribute('role', 'listbox');
      pal.side = mk('div', 'awoo-pal-side');
      pal.main.appendChild(pal.list);
      pal.main.appendChild(pal.side);
      pal.psl = mk('button', 'awoo-pal-psl');
      pal.psl.type = 'button';
      pal.foot = mk('div', 'awoo-pal-foot');
      pal.cpBtn = mk('button', 'awoo-pal-cp');
      pal.cpBtn.type = 'button';
      pal.cpBtn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v1.8M8 12.4v1.8M1.8 8h1.8M12.4 8h1.8M3.6 3.6l1.3 1.3M11.1 11.1l1.3 1.3M3.6 12.4l1.3-1.3M11.1 4.9l1.3-1.3"/></svg><span>Control Panel</span>';
      pal.updBtn = mk('button', 'awoo-pal-ib');
      pal.updBtn.type = 'button';
      pal.updBtn.setAttribute('data-tooltip', 'Check for updates');
      // An arrow rising out of a circle: "a newer version", not "download a
      // file" (the old tray-and-arrow read as a download, R69 round 7). It sits
      // last, beside the version it checks.
      pal.updBtn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M8 11.2V5"/><path d="M5.4 7.4 8 4.8l2.6 2.6"/></svg>';
      // A BUG, for the button that copies debug info: the one people are sent
      // to find ("copy your debug info and paste it to me"), so it stays in
      // the menu rather than moving into the Control Panel only.
      pal.bugBtn = mk('button', 'awoo-pal-ib');
      pal.bugBtn.type = 'button';
      pal.bugBtn.setAttribute('data-tooltip', 'Copy debug info to share');
      pal.bugBtn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><rect x="5" y="5.2" width="6" height="8" rx="3"/><path d="M6.2 5.4a1.8 1.8 0 0 1 3.6 0"/><path d="M8 8v5M2.6 9h2.4M11 9h2.4M3.2 5.6l1.9 1.2M12.8 5.6l-1.9 1.2M3.2 12.6l1.9-1.3M12.8 12.6l-1.9-1.3"/></svg>';
      pal.ver = mk('span', 'awoo-pal-ver');
      pal.updLink = mk('button', 'awoo-pal-updlink');
      pal.updLink.type = 'button';
      pal.verText = mk('span', null);
      pal.ver.appendChild(pal.updLink);
      pal.ver.appendChild(pal.verText);
      for (const e of [pal.cpBtn, pal.bugBtn, pal.updBtn, pal.ver]) pal.foot.appendChild(e);
      for (const e of [pal.top, pal.search, pal.main, pal.psl, pal.foot]) dropdown.appendChild(e);
      document.body.appendChild(dropdown);

      pal.input.addEventListener('input', () => { palState.q = pal.input.value; palState.sel = 0; renderPalette(); });
      // One key handler, on the search box and on the menu itself: with the
      // search bar off (the default) the menu takes focus instead.
      const palKeys = (e) => {
        const n = palState.items.length;
        if (e.key === 'ArrowDown') { e.preventDefault(); if (n) selectPaletteRow(Math.min(n - 1, palState.sel + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); if (n) selectPaletteRow(Math.max(0, palState.sel - 1)); }
        else if (e.key === 'Enter') { e.preventDefault(); activatePaletteItem(palState.items[palState.sel]); }
        else if (e.key === 'Escape') { e.preventDefault(); closeDropdown(); }
        else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
          e.preventDefault();
          const row = pal.rows && pal.rows[palState.sel];
          if (row) openItemMenu(row, palState.items[palState.sel]);
        }
      };
      pal.input.addEventListener('keydown', palKeys);
      dropdown.tabIndex = -1;
      dropdown.addEventListener('keydown', (e) => { if (e.target === dropdown) palKeys(e); });
      pal.layoutBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setSetting('menuLayout', getSetting('menuLayout') === 'wide' ? 'compact' : 'wide');
        renderPalette();
        placeDropdown();
        focusPalette();
      });
      pal.cpBtn.addEventListener('click', (e) => { e.stopPropagation(); closeDropdown(); openSettingsWindow(); });
      pal.updBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        checkForUpdates(true).then(() => {
          if (!RELEASE.manifestUrl) toast('This is a dev build: update checks are off.', { type: 'info', duration: 3000 });
          else if (updateState.error) toast('Could not reach the update server. It will try again shortly.', { type: 'warn', duration: 3500 });
          else if (!updateState.available.length) toast('Everything is up to date.', { type: 'success', duration: 3000 });
          else {
            // A check you asked for always answers, found or not.
            const a = updateState.available;
            toast(a.length === 1 ? `${a[0].label} ${a[0].to} is available` : `${a.length} AWOO+ updates available`,
              { type: 'info', duration: 10000, action: 'Update', onAction: () => openUpdate(a[0]) });
          }
          renderPaletteFooter();
        });
      });
      pal.bugBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const copied = await copyTextToClipboard(window.__awooDiag());
        toast(copied ? 'Debug info copied: paste it into chat.' : 'Could not copy automatically: it is in the console (F12) instead.',
          { type: copied ? 'success' : 'warn', duration: 4000 });
      });
      pal.updLink.addEventListener('click', (e) => { e.stopPropagation(); closeDropdown(); openSettingsWindow('updates'); });
      pal.psl.addEventListener('click', (e) => { e.stopPropagation(); closeDropdown(); openSettingsWindow('sync'); });

      function computeDropdownRect() {
        const anchor = coreBtn.getBoundingClientRect();
        const wasHidden = dropdown.style.display === 'none';
        // Measure at natural size. If currently hidden, show off-screen-invisibly
        // just long enough to read real dimensions rather than a stale 0x0.
        if (wasHidden) { dropdown.style.visibility = 'hidden'; dropdown.style.display = 'block'; }
        const size = { w: dropdown.offsetWidth || 220, h: dropdown.offsetHeight || 200 };
        if (wasHidden) { dropdown.style.display = 'none'; dropdown.style.visibility = ''; }
        return positionDropdownNearAnchor(anchor, size, viewportRect(), 8);
      }
      function placeDropdown() {
        const rect = computeDropdownRect();
        dropdown.style.left = rect.x + 'px';
        dropdown.style.top = rect.y + 'px';
      }
      function openDropdown() {
        dropAlreadyInstalled();
        palState.q = '';
        palState.sel = 0;
        pal.input.value = '';
        pal.sig = null;
        dropdown.style.display = 'flex';
        renderPalette();
        placeDropdown();
        focusPalette();
      }
      // With search on, typing searches straight away. With it off, the menu
      // itself takes focus, so the arrow keys and Enter work without a box.
      function focusPalette() {
        try { (getSetting('menuSearch') === true ? pal.input : dropdown).focus({ preventScroll: true }); } catch (e) { /* not focusable yet */ }
      }
      function closeDropdown() {
        dropdown.style.display = 'none';
      }
      // Exposed so the shared browser-resize listener (below) can keep an
      // OPEN dropdown correctly placed too — a resize while it's open is
      // exactly the moment the old bug would have shown up mid-session.
      function repositionDropdownIfOpen() {
        if (dropdown.style.display !== 'none') placeDropdown();
      }
      coreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dropdown.style.display === 'none') openDropdown(); else closeDropdown();
      });
      document.addEventListener('click', (e) => {
        if (dropdown.style.display === 'none') return;
        if (dropdown.contains(e.target) || group.contains(e.target)) return;
        closeDropdown();
      });

      coreUi = {
        group, coreBtn, quickRow, profileBtn, profileDot, sepCore, sepProfile, dropdown, pal,
        // reachable from outside buildUi()'s closure: the shared browser-resize
        // listener, and the palette's own actions (which close the menu).
        repositionDropdownIfOpen, closeDropdown,
      };
      renderNumberFormatRow();
      renderUpdateRow();
      renderProfileRow();
      anchorGroup();
      watchForAnchor();
    }

    // The nav is client-rendered, so it usually does not exist when this runs.
    // Waiting on the 3s heartbeat made the bar visibly late; this injects on
    // the very mutation that produces the anchor, then stops watching.
    //
    // REPORTED 2026-09-06: "the script sometimes doesn't load". Recovery after
    // the SPA re-renders the nav and detaches our group was the 3s interval —
    // and a HIDDEN TAB clamps that to roughly once a minute. Open the game in a
    // background tab, or leave it while it re-routes, and the button can be
    // missing for a minute with nothing wrong. Same failure family as S8: work
    // that only happens on a timer stops happening when the tab is not looked
    // at. Three cheap non-timer paths now cover it.
    let anchorObserving = false;
    let anchoredOnce = false;
    function watchForAnchor() {
      if (anchorObserving || !document.body) return;
      // STAYS ARMED for the life of the page, rather than disconnecting once
      // anchored. Disconnecting meant an SPA nav swap had no fast recovery at
      // all - only the 3s heartbeat, which is the throttled path this whole
      // change exists to stop depending on.
      //
      // ON coreScope (v10), which is the framework's own observer budget being
      // spent on the one observer Core actually needs. The hand-rolled 250ms
      // debounce that used to live here is gone — scope.mutation() owns it, and
      // refuses anything faster. Core's rule and Core's compliance are now the
      // same code, which is the whole argument for the scope existing.
      anchorObserving = true;
      coreScope.mutation(document.body, { childList: true, subtree: true }, () => {
        if (!coreUi) return;
        const wasAttached = document.body.contains(coreUi.group);
        anchorGroup();
        if (!wasAttached && document.body.contains(coreUi.group) && !anchoredOnce) {
          anchoredOnce = true;
          // the character settings are loaded by now - re-read the real convention
          probeCharacter(true);
          probeMergedMultipliers(true); // same moment: the tree is finally populated
          if (refreshConvention()) {
            renderNumberFormatRow();
            for (const id of Object.keys(modules)) safely(id, 'onConventionChange');
          }
        }
      }, { debounceMs: 250 });
    }

    // ---- route changes, detected ONCE and shared (v9) ----
    //
    // Core already has to know when the SPA re-routes — that is when its own
    // nav group gets detached — so it already wraps history.pushState/
    // replaceState, listens on popstate, and re-checks on its 3s heartbeat.
    // Every one of those is a page-global side effect, and a module needing
    // the same signal was duplicating all three: fighter-allocator wrapped
    // history a SECOND time and ran its own 2s poll beside Core's heartbeat,
    // which is exactly the "ONE heartbeat, not three" argument one layer up.
    //
    // So the detection stays in one place and modules subscribe. Returns an
    // unsubscribe function; a throwing subscriber is logged and skipped rather
    // than taking the re-anchor path down with it (same contract as safely()).
    const navSubscribers = [];
    let lastNavPath = location.pathname;
    function onNavigate(fn) {
      if (typeof fn !== 'function') return () => {};
      navSubscribers.push(fn);
      return () => {
        const i = navSubscribers.indexOf(fn);
        if (i >= 0) navSubscribers.splice(i, 1);
      };
    }
    function notifyNavigation() {
      if (location.pathname === lastNavPath) return;
      const from = lastNavPath;
      lastNavPath = location.pathname;
      for (const fn of navSubscribers.slice()) {
        try { fn(location.pathname, from); }
        catch (err) { console.error('[AwooCore] an onNavigate subscriber threw; the rest are unaffected:', err); }
      }
    }

    // Re-attach immediately, without waiting for the next tick of anything.
    // The nav notification comes FIRST and is not gated on coreUi: a module can
    // subscribe before the launcher has finished building, and a route change
    // it misses is one it never hears about.
    function reanchorNow() {
      notifyNavigation();
      if (!coreUi || !document.body) return;
      anchorGroup();
      if (!document.body.contains(coreUi.group)) watchForAnchor();
    }

    // INCREMENTAL, not rebuild-every-time. With one module the difference was
    // invisible; with modules as separate scripts they register over a spread
    // of tens of milliseconds, and a full innerHTML rebuild per registration is
    // one layout pass each with the nav bar visibly resizing under the cursor.
    // The common cases — a module registering, a badge lighting up, a panel
    // opening — now touch one button's class and nothing else.
    let quickRowIds = [];
    // While the Control Panel's cap slider is being dragged: the cap being
    // previewed, and placeholder buttons fill the bar up to it so the player
    // sees the real width (REGISTER.md R69). null otherwise.
    let barPreview = null;
    function previewBarMax(n) {
      barPreview = Number.isFinite(n) ? n : null;
      if (coreUi) renderQuickRow();
    }
    function renderQuickRow() {
      // quickButton: false (v12) keeps a module out of the top bar entirely. For
      // a module with no window of its own (the grid overlay lives on the game's
      // page), a top-bar button has nothing to open, and the bar is filling up.
      // In the player's order (registry v2), loaded, and not kept off the bar.
      // A tweak never gets a button: it has no window to open.
      const shown = orderedIds(Object.keys(modules)).filter((id) => {
        const m = modules[id];
        return m.enabled && m.quickButton !== false && m.kind !== 'tweak' && !isIn('barHidden', id);
      }).slice(0, barPreview !== null ? barPreview : registry.barMax);
      for (const g of [...coreUi.quickRow.children]) {
        if (/(^|\s)awoo-core-quick-ghost(\s|$)/.test(g.className || '')) g.remove();
      }
      const sameOrder = shown.length >= quickRowIds.length
        && quickRowIds.every((id, i) => shown[i] === id);

      if (!sameOrder) {
        coreUi.quickRow.innerHTML = '';
        quickRowIds = [];
      }
      for (let i = quickRowIds.length; i < shown.length; i++) {
        const id = shown[i];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.awooId = id;
        // this only shows/hides the module's own GUI - enabling/disabling the
        // module itself happens exclusively via the dropdown rows below
        btn.addEventListener('click', (e) => { e.stopPropagation(); safely(id, 'onQuickClick'); });
        btn.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); ui.menu(btn, moduleMenuItems(id)); });
        coreUi.quickRow.appendChild(btn);
        quickRowIds.push(id);
      }
      // Update in place. setText/setAttr-style guards: assigning an identical
      // className or textContent still dirties layout.
      for (let i = 0; i < shown.length; i++) {
        const mod = modules[shown[i]];
        const btn = coreUi.quickRow.children[i];
        const cls = 'awoo-core-quick-btn' + (mod.open ? ' awoo-core-quick-btn-open' : '');
        if (btn.className !== cls) btn.className = cls;
        // Two independent signals, on purpose: the ACCENT says the window is
        // open, the SLOT says what the module is doing. They are different
        // questions and conflating them into one treatment was why the old
        // badge could only ever mean "something, somewhere".
        const st = mod.enabled ? (mod.state || 'idle') : 'off';
        const slotCls = 'awoo-core-sd awoo-core-sd-' + st;
        // Built once, updated in place. `children` rather than
        // firstElementChild/lastElementChild deliberately: those are the
        // properties the test DOM stub does not implement, and a render path
        // that only works in a real browser is a render path nothing tests.
        if (!btn.children[0]) btn.appendChild(document.createElement('i'));
        if (!btn.children[1]) btn.appendChild(document.createElement('span'));
        const slot = btn.children[0];
        const text = btn.children[1];
        if (slot.className !== slotCls) slot.className = slotCls;
        const glyph = STATE_GLYPH[st] || '';
        if (slot.textContent !== glyph) slot.textContent = glyph;
        const label = mod.shortLabel || mod.label;
        if (text.textContent !== label) text.textContent = label;
        const tip = mod.label + (mod.enabled ? ' — ' + stateText(mod) : ' — off');
        if (btn.title !== tip) btn.title = tip;
      }
      // Placeholders LAST, so children[i] above stays the i-th real button.
      if (barPreview !== null) {
        for (let i = shown.length; i < barPreview; i++) {
          const ghost = document.createElement('span');
          ghost.className = 'awoo-core-quick-btn awoo-core-quick-ghost';
          ghost.textContent = 'Module';
          coreUi.quickRow.appendChild(ghost);
        }
      }
    }

    // Kept minimal now that the compact dropdown no longer has a number-
    // format row of its own — the Settings window (openSettingsWindow) is
    // the detailed view; this just re-renders it if it happens to be open.
    function renderNumberFormatRow() {
      if (settingsUi) settingsUi.renderNumberFormat();
    }

    // ---- Profile Sync System ----
    // Exposes a unified state for the player's active profile across all categories.
    // Downstream modules and tools (Sculpture Stat Optimizer, Fighter Allocator, etc.)
    // consume this rather than scraping DOM or guessing (§9.4).
    //
    // THE STORE NOTIFIES ON CHANGE (REGISTER.md R92, API v16). Until v16 every
    // commit replaced the profile wholesale, called every listener, saved it,
    // and posted the whole profile to every other tab. A capture runs on every
    // client transition and every 15 s, so an idle tab re-ran every consumer
    // and re-wrote the same profile several times a minute; and because a
    // tab's capture merged onto its OWN last capture, committing it wholesale
    // threw away sections another tab had just broadcast (R92, item 2). Now a
    // commit is compared with the current profile section by section:
    //   changed  sections whose value differs. Compared as stable JSON (keys
    //            sorted): a merge rebuilds objects old keys first and a fresh
    //            capture builds them in its own order, and the same data in
    //            another key order is not news;
    //   stamped  sections whose meta.observedAt advanced: seen again, perhaps
    //            with the same value. Only their age moved.
    // Nothing changed and nothing stamped: no listener, no write, no message.
    // Otherwise listeners hear about a change at once and about ages at most
    // once a minute; the tab that OBSERVED it writes storage (read-merge-write)
    // and posts a delta; other tabs merge that delta section by section by
    // observedAt, and neither write nor re-post it.
    //
    // A real capture always stamps what it saw (profile-sync.js stamps every
    // observed section with the capture's clock), so an idle capture is an
    // age-only commit, not a no-op. Age-only is the path the budget turns on,
    // which is why each of its three outlets is throttled to a minute.
    let activeProfile = null;
    // Stable JSON of activeProfile's sections, filled as a diff needs them and
    // handed from one commit to the next, so a commit stringifies the sections
    // it brought and not also the profile it is compared with.
    let activeJson = new Map();
    // One entry per subscription, not per function: { fn, sections (Set, or
    // null for all), at (last delivery), ageOnly (stamped sections waiting
    // for their minute) }.
    const profileListeners = new Set();
    const PROFILE_STORAGE_KEY = 'awoo:profile:v1';
    // The three throttles. Age-only news waits up to a minute on every outlet:
    // a consumer that renders "3m ago" from its copy is then never more than a
    // minute behind, which is the resolution those labels have anyway. A value
    // change reaches listeners at once, other tabs within a second (the burst
    // of captures a page change causes becomes one message), and storage
    // within ten seconds: INSTRUMENTATION.md §4.4's "≤ 1 storage write per
    // 10 s", with the forced flush on leaving the page that §5 S1 established.
    const PROFILE_AGE_MS = 60 * 1000;
    const PROFILE_WRITE_MS = 10 * 1000;
    const PROFILE_POST_MS = 1000;
    // Top-level keys that are not sections.
    const PROFILE_NOT_SECTIONS = new Set(['meta', 'schemaVersion']);
    // Meta keys that say WHEN and WHERE, not WHO, and so never count as a
    // change: timestamp and source move with every capture, observedAt and
    // observedOn travel with their section, and queryAt (the per-query stamps
    // of R92's scheduler) merges by the latest stamp per query.
    const PROFILE_META_CLOCKS = new Set(['observedAt', 'observedOn', 'queryAt', 'timestamp', 'source']);
    // Identity fields where null means "this capture could not tell"
    // (normalizeProfile says so of characterId), so a null never erases a
    // known value. Not every meta field: a party id of null can be an
    // observation (no party), and must be able to replace an old id.
    const PROFILE_META_KEEP = new Set(['characterId', 'characterName', 'characterLevel']);
    let profileBc = null;

    try {
      if (typeof BroadcastChannel !== 'undefined') {
        profileBc = new BroadcastChannel('awoo-profile');
        profileBc.onmessage = (event) => {
          const data = event && event.data;
          if (!data || typeof data !== 'object') return;
          if (data.type === 'PROFILE_DELTA' && data.v === 1) {
            receiveProfileDelta(data);
          } else if (data.type === 'PROFILE_UPDATED' && data.profile) {
            // A whole profile from a tab running an older AWOO+ (v15 or
            // before). Merged section by section like a delta, never adopted
            // wholesale: that tab's copy is only as fresh as its own captures.
            setProfile(data.profile, true /* fromBc */);
          } else if (data.type === 'REQUEST_PROFILE_SYNC') {
            resyncProfile(true /* fromBc */);
            answerProfileRequest();
          }
        };
      }
    } catch (e) { /* ignore */ }

    // THE ANSWER TO A TOOL PAGE'S "Sync now". A tool's tab (tools/tool-sync.js)
    // asks with REQUEST_PROFILE_SYNC and, up to v15, heard back through the
    // PROFILE_UPDATED every capture posted. v16 posts deltas instead, which a
    // tool built before v16 does not read, so a request is answered with one
    // whole profile: the old contract, kept for exactly the case that asks.
    // One message per click; a v16 tab that hears it merges it like any other.
    function answerProfileRequest() {
      if (!profileBc || !activeProfile) return;
      try { profileBc.postMessage({ type: 'PROFILE_UPDATED', profile: activeProfile, timestamp: Date.now() }); } catch (e) { /* ignore */ }
    }

    function loadCachedProfile() {
      if (activeProfile) return activeProfile;
      try {
        const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
        const stored = raw ? JSON.parse(raw) : null;
        if (stored && typeof stored === 'object') {
          activeProfile = stored;
          activeJson = new Map();
        }
      } catch (e) {
        // refuse corrupted data
      }
      return activeProfile;
    }

    // Stable JSON: object keys sorted, so two readings of the same data
    // compare equal whatever order their keys were built in. Otherwise as
    // JSON.stringify (undefined dropped from objects, null in arrays).
    function stableJson(v) {
      if (v === undefined || typeof v === 'function') return 'null';
      if (v === null || typeof v !== 'object') return JSON.stringify(v);
      if (typeof v.toJSON === 'function') return stableJson(v.toJSON());
      if (Array.isArray(v)) return '[' + v.map((x) => stableJson(x)).join(',') + ']';
      const keys = Object.keys(v).filter((k) => v[k] !== undefined && typeof v[k] !== 'function').sort();
      return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableJson(v[k])).join(',') + '}';
    }
    // A section that cannot be serialised (a cycle, a BigInt from some future
    // caller) never compares equal to anything, so it always counts as changed:
    // a missed change is the failure worth avoiding, a spare notification is not.
    let unreadableSeq = 0;
    function sectionJson(p, k) {
      try { return stableJson(p ? p[k] : undefined); } catch (e) { return '\u0000unreadable ' + (++unreadableSeq); }
    }
    function metaIdentityJson(p) {
      const m = p && p.meta && typeof p.meta === 'object' ? p.meta : null;
      if (!m) return 'null';
      const who = {};
      for (const k of Object.keys(m)) if (!PROFILE_META_CLOCKS.has(k)) who[k] = m[k];
      try { return stableJson(who); } catch (e) { return '\u0000unreadable ' + (++unreadableSeq); }
    }
    function stampOf(map, k) {
      const v = map && typeof map === 'object' ? map[k] : undefined;
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    }
    function latestStamps(a, b) {
      const x = a && typeof a === 'object' ? a : null;
      const y = b && typeof b === 'object' ? b : null;
      if (!x && !y) return null;
      const out = Object.assign({}, x);
      if (y) {
        for (const k of Object.keys(y)) {
          const v = stampOf(y, k);
          const cur = stampOf(out, k);
          if (v !== null && (cur === null || v > cur)) out[k] = v;
        }
      }
      return out;
    }

    // WHOSE profile. The ids when both sides carry one, else the names when
    // both carry one, else "the same": a capture that could not read the
    // character is no evidence of another character.
    function sameCharacter(a, b) {
      const who = (p, k) => { const v = p && p.meta ? p.meta[k] : null; return typeof v === 'string' && v ? v : null; };
      const ia = who(a, 'characterId'), ib = who(b, 'characterId');
      if (ia && ib) return ia === ib;
      const na = who(a, 'characterName'), nb = who(b, 'characterName');
      if (na && nb) return na === nb;
      return true;
    }

    // MERGE TWO PROFILES SECTION BY SECTION, BY observedAt. Pure: returns a new
    // profile and changes neither input. Also Core.profile.merge.
    //
    // For each section the newer reading wins, and its stamp and page come
    // with it, so a stamp only ever moves forward. "Newer":
    //   both stamped      the later stamp; a tie keeps `base`, the copy
    //                     already held (unless opts.local, below);
    //   one stamped       the stamped one: a reading of unknown age never
    //                     displaces one whose age is known;
    //   neither stamped   `base`, except that a hole in `base` is filled;
    //   absent, or null without a stamp, in `incoming`: never taken. That is
    //                     what "not observed" looks like, and taking it would
    //                     erase a reading (R92 item 2 was exactly that).
    // opts.local: `incoming` is this tab's own commit (Core.profile.set), which
    // wins ties and unstamped values: a caller of set() is saying "this is the
    // profile now", as it always has, EXCEPT where the store provably holds a
    // newer reading, which it keeps.
    //
    // Another character (sameCharacter): `base` comes back untouched, or, when
    // local, `incoming` whole: this tab has just seen the switch, and nothing
    // of the old character may leak into the new one (the rule profile-sync.js
    // mergeObservedProfile already keeps).
    //
    // Meta: queryAt merges by the latest stamp per query; timestamp is the
    // later of the two; every other field (name, level, ids) comes from the
    // newer capture by meta.timestamp (always from `incoming` when local),
    // except that undefined never overwrites and a null never erases a known
    // identity (PROFILE_META_KEEP).
    function mergeBySection(base, incoming, opts) {
      const local = !!(opts && opts.local);
      if (!incoming || typeof incoming !== 'object') return base && typeof base === 'object' ? base : null;
      if (!base || typeof base !== 'object') return incoming;
      if (!sameCharacter(base, incoming)) return local ? incoming : base;
      const bm = base.meta && typeof base.meta === 'object' ? base.meta : {};
      const im = incoming.meta && typeof incoming.meta === 'object' ? incoming.meta : {};
      const bSeen = bm.observedAt || {};
      const iSeen = im.observedAt || {};
      const bOn = bm.observedOn || {};
      const iOn = im.observedOn || {};
      const owns = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

      const out = {};
      const schema = local
        ? (incoming.schemaVersion !== undefined ? incoming.schemaVersion : base.schemaVersion)
        : (base.schemaVersion !== undefined ? base.schemaVersion : incoming.schemaVersion);
      if (schema !== undefined) out.schemaVersion = schema;
      out.meta = null; // placed here so the key order reads schemaVersion, meta, sections
      const seen = {};
      const on = {};
      const keys = new Set([...Object.keys(base), ...Object.keys(incoming)]);
      for (const k of keys) {
        if (PROFILE_NOT_SECTIONS.has(k)) continue;
        const b = base[k];
        const v = incoming[k];
        const bs = stampOf(bSeen, k);
        const is = stampOf(iSeen, k);
        let take;
        if (v === undefined || (v === null && is === null)) take = false;
        else if (is !== null && bs !== null) take = local ? is >= bs : is > bs;
        else if (is !== null || bs !== null) take = is !== null;
        else take = local || b === undefined || b === null;
        if (take) out[k] = v;
        else if (owns(base, k)) out[k] = b;
        else out[k] = v === undefined ? null : v;
        const stamp = take ? is : bs;
        if (stamp !== null) seen[k] = stamp;
        const page = take && iOn[k] != null ? iOn[k] : bOn[k];
        if (page != null) on[k] = page;
      }
      // Stamps with no section beside them are kept as they were in `base`;
      // one arriving without its section is ignored, like any hole.
      for (const k of Object.keys(bSeen)) if (!keys.has(k) && stampOf(bSeen, k) !== null) seen[k] = bSeen[k];

      const meta = Object.assign({}, bm);
      const newer = local || (stampOf(im, 'timestamp') || 0) > (stampOf(bm, 'timestamp') || 0);
      for (const k of Object.keys(im)) {
        if (k === 'observedAt' || k === 'observedOn' || k === 'queryAt' || k === 'timestamp') continue;
        const v = im[k];
        if (v === undefined) continue;
        if (v === null && PROFILE_META_KEEP.has(k) && meta[k] != null) continue;
        const hole = meta[k] === undefined || (meta[k] === null && PROFILE_META_KEEP.has(k));
        if (newer || hole) meta[k] = v;
      }
      const ts = Math.max(stampOf(bm, 'timestamp') || 0, stampOf(im, 'timestamp') || 0);
      if (ts) meta.timestamp = ts;
      meta.observedAt = seen;
      meta.observedOn = on;
      const queryAt = latestStamps(bm.queryAt, im.queryAt);
      if (queryAt) meta.queryAt = queryAt;
      else delete meta.queryAt;
      out.meta = meta;
      return out;
    }

    // What a commit changes (see the header above). `json` is next's section
    // JSON, handed on as activeJson. `clocksMoved`: only queryAt moved, which
    // no listener hears about but storage and other tabs must still get.
    function diffProfiles(cur, next) {
      const json = new Map();
      const changed = [];
      const stamped = [];
      const cSeen = cur && cur.meta ? cur.meta.observedAt : null;
      const nSeen = next.meta ? next.meta.observedAt : null;
      const keys = new Set([...(cur ? Object.keys(cur) : []), ...Object.keys(next)]);
      for (const k of keys) {
        if (PROFILE_NOT_SECTIONS.has(k)) continue;
        if (cur && next[k] === cur[k]) {
          // The merge kept our own object: unchanged by construction.
          if (activeJson.has(k)) json.set(k, activeJson.get(k));
        } else {
          const a = sectionJson(next, k);
          json.set(k, a);
          const b = !cur ? 'null' : activeJson.has(k) ? activeJson.get(k) : sectionJson(cur, k);
          if (a !== b) changed.push(k);
        }
        const ns = stampOf(nSeen, k);
        const cs = stampOf(cSeen, k);
        if (ns !== null && (cs === null || ns > cs)) stamped.push(k);
      }
      if (metaIdentityJson(cur) !== metaIdentityJson(next)) changed.push('meta');
      const clocksMoved = sectionJson(cur && cur.meta, 'queryAt') !== sectionJson(next.meta, 'queryAt');
      return { changed, stamped, clocksMoved, json };
    }

    // Every commit goes through here: a local one (Core.profile.set, which is
    // a capture in this tab) or a receipt from another tab. Returns what it
    // changed, { changed, stamped } (both empty when nothing did), or null
    // when it refused: a receipt about another character.
    function commitProfile(incoming, local) {
      const cur = getProfile();
      let next;
      if (!cur) next = incoming;
      else if (!sameCharacter(cur, incoming)) {
        // Another tab on another character: none of its sections are ours.
        // This tab switching character: the new one replaces the old whole.
        if (!local) return null;
        next = incoming;
      } else next = mergeBySection(cur, incoming, { local });
      const d = diffProfiles(cur, next);
      if (!d.changed.length && !d.stamped.length && !d.clocksMoved) return { changed: [], stamped: [] };
      activeProfile = next;
      activeJson = d.json;
      if (local) {
        queueProfileWrite(d.changed.length > 0);
        queueProfilePost(d.changed, d.stamped);
      }
      if (d.changed.length || d.stamped.length) notifyProfile(d.changed, d.stamped);
      renderProfileRow();
      return { changed: d.changed.slice(), stamped: d.stamped.slice() };
    }

    // Core.profile.set(profile). The second argument is the channel's own
    // (a receipt from another tab), never a caller's.
    function setProfile(data, fromBc) {
      if (!data || typeof data !== 'object') return null;
      return commitProfile(data, !fromBc);
    }

    // A delta from another tab (postProfileNow's shape), rebuilt as a partial
    // profile and merged as a receipt.
    function receiveProfileDelta(d) {
      const sections = d.sections && typeof d.sections === 'object' ? d.sections : {};
      const meta = Object.assign({}, d.meta && typeof d.meta === 'object' ? d.meta : {});
      meta.characterId = typeof d.characterId === 'string' && d.characterId ? d.characterId : (meta.characterId || null);
      meta.characterName = typeof d.characterName === 'string' && d.characterName ? d.characterName : (meta.characterName || null);
      meta.observedAt = d.observedAt && typeof d.observedAt === 'object' ? d.observedAt : {};
      meta.observedOn = d.observedOn && typeof d.observedOn === 'object' ? d.observedOn : {};
      if (d.queryAt && typeof d.queryAt === 'object') meta.queryAt = d.queryAt;
      const incoming = { meta };
      if (d.schemaVersion !== undefined) incoming.schemaVersion = d.schemaVersion;
      for (const k of Object.keys(sections)) if (!PROFILE_NOT_SECTIONS.has(k)) incoming[k] = sections[k];
      return commitProfile(incoming, false);
    }

    // ---- listeners ----
    function notifyProfile(changed, stamped) {
      const now = Date.now();
      for (const l of [...profileListeners]) {
        if (!profileListeners.has(l)) continue; // unsubscribed by an earlier listener in this round
        const ch = l.sections ? changed.filter((s) => l.sections.has(s)) : changed;
        const st = l.sections ? stamped.filter((s) => l.sections.has(s)) : stamped;
        if (ch.length) { deliverProfile(l, ch, st); continue; }
        if (!st.length) continue;
        for (const s of st) l.ageOnly.add(s);
        if (now - l.at >= PROFILE_AGE_MS) deliverProfile(l, [], []);
      }
      armProfileAgeTimer();
    }
    // A delivery hands over the whole current profile, so it settles every age
    // the listener was waiting for as well.
    function deliverProfile(l, changed, stamped) {
      const st = new Set([...l.ageOnly, ...stamped]);
      l.ageOnly.clear();
      l.at = Date.now();
      try { l.fn(activeProfile, { changed: changed.slice(), stamped: [...st], initial: false }); } catch (e) { console.error('[AwooCore:Profile] Listener error:', e); }
    }
    // One timer for every listener's waiting ages, set for the earliest one
    // due and re-armed from the clock when it fires (AGENTS.md rule 5: a
    // hidden tab fires it late, and the delivery is then late, never wrong).
    let profileAgeTimer = null;
    let profileAgeDue = 0;
    function armProfileAgeTimer() {
      let due = Infinity;
      for (const l of profileListeners) if (l.ageOnly.size) due = Math.min(due, l.at + PROFILE_AGE_MS);
      if (due === Infinity) return;
      if (profileAgeTimer !== null) {
        if (due >= profileAgeDue) return;
        clearTimeout(profileAgeTimer);
      }
      profileAgeDue = due;
      profileAgeTimer = setTimeout(() => {
        profileAgeTimer = null;
        const now = Date.now();
        for (const l of [...profileListeners]) {
          if (profileListeners.has(l) && l.ageOnly.size && now - l.at >= PROFILE_AGE_MS) deliverProfile(l, [], []);
        }
        armProfileAgeTimer();
      }, Math.max(0, due - Date.now()));
    }

    // ---- storage: written by the tab that observed ----
    //
    // Trailing: a write lands PROFILE_WRITE_MS after the first unsaved change
    // (PROFILE_AGE_MS when only ages moved) and takes whatever the profile is
    // by then, so a burst of captures is one write.
    let profileWriteTimer = null;
    let profileWriteDue = 0;
    let profileWriteSince = 0;
    function queueProfileWrite(valueChanged) {
      const now = Date.now();
      if (profileWriteTimer === null) profileWriteSince = now;
      const due = profileWriteSince + (valueChanged ? PROFILE_WRITE_MS : PROFILE_AGE_MS);
      if (profileWriteTimer !== null) {
        if (due >= profileWriteDue) return;
        clearTimeout(profileWriteTimer);
      }
      profileWriteDue = due;
      profileWriteTimer = setTimeout(writeProfileNow, Math.max(0, due - now));
    }
    // READ-MERGE-WRITE. Another tab may have written a newer section since
    // this one loaded (a tab on an older AWOO+ writes its whole copy on every
    // capture), and a plain write would put this tab's older reading back over
    // it. Stored under another character: this tab's profile replaces it, as
    // the last tab to observe has always done.
    function writeProfileNow() {
      if (profileWriteTimer !== null) { clearTimeout(profileWriteTimer); profileWriteTimer = null; }
      const mine = activeProfile;
      if (!mine) return;
      let out = mine;
      try {
        const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
        const stored = raw ? JSON.parse(raw) : null;
        if (stored && typeof stored === 'object' && sameCharacter(stored, mine)) out = mergeBySection(stored, mine, { local: true });
      } catch (e) { /* unreadable: this tab's copy replaces it */ }
      try { localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(out)); } catch (e) { /* ignore quota errors */ }
    }

    // ---- other tabs: a delta, from the tab that observed ----
    //
    // PROFILE_DELTA v1:
    //   { type: 'PROFILE_DELTA', v: 1, characterId, characterName,
    //     sections: { <name>: value },   every section changed OR stamped since
    //                                    the last post, with its value
    //     observedAt: { <name>: ms }, observedOn: { <name>: path },
    //     meta: { the sender's meta minus the three stamp maps },
    //     queryAt?: { <query key>: ms }, schemaVersion?, at: ms }
    // A stamped section travels WITH its value, not as a bare stamp. A bare
    // stamp would tell a tab that missed the change (opened after it, say)
    // that its older value is fresh; with the value, a receiver that already
    // has it sees no change and hears only the age. The cost is one clone of
    // the page-held sections a minute.
    let profilePostTimer = null;
    let profilePostDue = 0;
    let profilePostSince = 0;
    let profilePostedAt = 0;
    let profilePostValue = false;
    const profilePostNames = new Set();
    function queueProfilePost(changed, stamped) {
      if (!profileBc) return;
      for (const s of changed) profilePostNames.add(s);
      for (const s of stamped) profilePostNames.add(s);
      if (changed.length) profilePostValue = true;
      const now = Date.now();
      if (profilePostTimer === null) profilePostSince = now;
      const due = profilePostValue ? profilePostSince + PROFILE_POST_MS : Math.max(now, profilePostedAt + PROFILE_AGE_MS);
      if (profilePostTimer !== null) {
        if (due >= profilePostDue) return;
        clearTimeout(profilePostTimer);
      }
      profilePostDue = due;
      profilePostTimer = setTimeout(postProfileNow, Math.max(0, due - now));
    }
    function postProfileNow() {
      if (profilePostTimer !== null) { clearTimeout(profilePostTimer); profilePostTimer = null; }
      const names = [...profilePostNames];
      profilePostNames.clear();
      profilePostValue = false;
      const p = activeProfile;
      if (!p || !profileBc) return;
      const m = p.meta && typeof p.meta === 'object' ? p.meta : {};
      const sections = {};
      const observedAt = {};
      const observedOn = {};
      for (const s of names) {
        if (PROFILE_NOT_SECTIONS.has(s) || p[s] === undefined) continue;
        sections[s] = p[s];
        if (stampOf(m.observedAt, s) !== null) observedAt[s] = m.observedAt[s];
        if (m.observedOn && m.observedOn[s] != null) observedOn[s] = m.observedOn[s];
      }
      const meta = {};
      for (const k of Object.keys(m)) if (k !== 'observedAt' && k !== 'observedOn' && k !== 'queryAt') meta[k] = m[k];
      const msg = {
        type: 'PROFILE_DELTA', v: 1,
        characterId: typeof m.characterId === 'string' ? m.characterId : null,
        characterName: typeof m.characterName === 'string' ? m.characterName : null,
        sections, observedAt, observedOn, meta, at: Date.now(),
      };
      if (m.queryAt && typeof m.queryAt === 'object') msg.queryAt = m.queryAt;
      if (p.schemaVersion !== undefined) msg.schemaVersion = p.schemaVersion;
      try { profileBc.postMessage(msg); } catch (e) { console.warn('[AwooCore:Profile] could not post a profile delta:', e); }
      profilePostedAt = Date.now();
    }

    // Leaving the page is the last chance for both (pagehide, wired with the
    // other flushes further down). Going hidden flushes storage only: the tab
    // lives on, and its throttled post still goes within the minute.
    function flushProfileStorage() {
      if (profileWriteTimer !== null) writeProfileNow();
    }
    function flushProfileWrites() {
      flushProfileStorage();
      if (profilePostTimer !== null) postProfileNow();
    }

    function getProfile() {
      if (!activeProfile) loadCachedProfile();
      return activeProfile;
    }

    // subscribe(fn, { sections }) returns an unsubscribe. fn(profile, info),
    // info = { changed, stamped, initial }: of the sections asked for, those
    // whose value changed and those whose age alone moved. `sections` omitted
    // means all of them; 'meta' names the identity fields (name, level, ids).
    // Called at once with the current profile (initial: true, every section
    // present counted as changed), then on each change to a section asked for,
    // and at most once a minute when only ages moved. A listener written
    // before v16, fn(profile), runs unchanged: it is called less often and
    // never misses a change.
    function subscribeProfile(fn, opts) {
      if (typeof fn !== 'function') return () => {};
      const asked = opts && Array.isArray(opts.sections)
        ? new Set(opts.sections.filter((s) => typeof s === 'string')) : null;
      const l = { fn, sections: asked, at: 0, ageOnly: new Set() };
      profileListeners.add(l);
      const cur = getProfile();
      if (cur) {
        l.at = Date.now();
        const present = Object.keys(cur).filter((k) => k !== 'schemaVersion' && cur[k] != null && (!asked || asked.has(k)));
        try { fn(cur, { changed: present, stamped: [], initial: true }); } catch (e) { console.error('[AwooCore:Profile] Listener error:', e); }
      }
      return () => { profileListeners.delete(l); };
    }

    function resyncProfile(fromBc) {
      try {
        window.dispatchEvent(new CustomEvent('awoo:profile:resync'));
      } catch (e) { /* ignore */ }
      if (!fromBc && profileBc) {
        try {
          profileBc.postMessage({ type: 'REQUEST_PROFILE_SYNC', timestamp: Date.now() });
        } catch (e) { /* ignore */ }
      }
    }

    function formatTimeAgo(ts) {
      if (!ts) return 'Not synced';
      const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
      if (sec < 5) return 'Just now';
      if (sec < 60) return sec + 's ago';
      const min = Math.floor(sec / 60);
      if (min < 60) return min + 'm ago';
      const hr = Math.floor(min / 60);
      return hr + 'h ago';
    }

    // `what` is the player's answer to "what is in this?". Which game queries
    // feed a section, and how each is kept, is NOT here: that is Profile
    // Sync's catalogue (src/core/profile-sync.js, Core.profile.catalogue), the
    // one home. A copy of the query names lived here until R92 and had
    // already drifted from what the normalizer reads.
    const PROFILE_CATEGORIES = [
      { id: 'core', label: 'Core & VIP', what: 'Your name, level, VIP level, gold and credits' },
      { id: 'levels', label: 'Levels', what: 'Skill levels: battling, crafting, sanctum and the rest' },
      { id: 'relicBoosts', label: 'Relic Boosts', what: 'Relic shop levels from the Boosts page: crit, multistrike, healing, defense' },
      { id: 'baseStats', label: 'Base Stats', what: 'Strength, health, dexterity and agility' },
      { id: 'statBoosts', label: 'Stat Boosts', what: 'Percent boosts to each stat, from every source' },
      { id: 'incomeBoosts', label: 'Income Multipliers', what: 'Percent boosts to gold and resources, from every source' },
      { id: 'mergedMultipliers', label: 'All Multipliers', what: 'The game\'s own merged multipliers (gold, experience and the rest)' },
      { id: 'pets', label: 'Pets & Slots', what: 'Pet slot levels (combat, gathering, utility) and your equipped pets' },
      { id: 'partner', label: 'Partner', what: 'Every partner: speed, intelligence, stats, skills and drops' },
      { id: 'sanctum', label: 'Sanctum Maps', what: 'Your active sanctum maps and skill-tree points' },
      { id: 'sculpture', label: 'Sculptures', what: 'The sculpture grid and its multipliers' },
      { id: 'fighters', label: 'Fighters', what: 'The fighters in your active preset' },
      { id: 'equipment', label: 'Equipment & Gems', what: 'Equipped fighter gear and gems, per slot' },
      { id: 'village', label: 'Village & PvP', what: 'Your village\'s name, buildings and strengths (PvP tiles are not read yet)' },
      // Loadouts change only when the player edits one, and the page where
      // they do is captured then; a day is how long one is worth without.
      { id: 'loadouts', label: 'Loadouts', what: 'Your sculpture presets and each grid, skill-tree presets, and item sets', staleMs: 24 * 60 * 60 * 1000 },
      // The party sections carry their own age limit (REGISTER.md R88): the
      // actions count moves every 10 s during a run and is only worth 10
      // minutes; members change rarely and are worth a day. The last-action
      // reading never goes old by time: a run's rate stays the rate until a
      // new run replaces it, and Party marks it when its conditions change.
      { id: 'party', label: 'Party', what: 'Your party: members, their actions, monsters and multipliers', staleMs: 24 * 60 * 60 * 1000 },
      { id: 'partyActions', label: 'Party Actions', what: 'Party actions left, max actions, and the last daily reset', staleMs: 10 * 60 * 1000 },
      { id: 'partyLastAction', label: 'Party Last Action', what: 'Gold and EXP from the last party action, and from the last run', staleMs: Infinity },
      { id: 'partyMonster', label: 'Party Monster', what: "Your party monster's level", staleMs: 24 * 60 * 60 * 1000 },
      { id: 'partyLevels', label: 'Party Levels', what: "Each party member's levels and EXP", staleMs: 24 * 60 * 60 * 1000 },
    ];

    // HOW FRESH ONE PROFILE SYNC SECTION IS. Six hours is the window the tools
    // use (tools/tool-sync.js DEFAULT_STALE_MS), on purpose: the Control Panel,
    // the top-bar button and every tool give one answer to "is this old".
    const PROFILE_STALE_MS = 6 * 60 * 60 * 1000;
    function profileFreshness(key, profile) {
      const p = profile === undefined ? getProfile() : profile;
      const v = p ? p[key] : null;
      if (v === null || v === undefined) return { state: 'miss', age: 'never seen', at: null };
      const at = p.meta && p.meta.observedAt && p.meta.observedAt[key];
      if (!at) return { state: 'stale', age: 'age unknown', at: null };
      const cat = PROFILE_CATEGORIES.find((c) => c.id === key);
      const limit = cat && cat.staleMs ? cat.staleMs : PROFILE_STALE_MS;
      return { state: Date.now() - at > limit ? 'stale' : 'ok', age: formatTimeAgo(at), at };
    }
    // OLD MATTERS ONLY WHERE SOMETHING USES IT (REGISTER.md R92). The sections
    // a STARTED module declares (about.uses) are what Profile Sync keeps
    // fresh, so they are the only ones whose age is news: an old section no
    // loaded module reads is state 'unused' ("old · unused", drawn muted), and
    // it never turns the top-bar light amber. Before R92 any old section did,
    // so a player with only Party loaded saw amber for a village nothing
    // reads, and the light meant nothing. Tools do not count: a tool asks for
    // its sections when it opens (openTool). The started rule is moduleInfo's.
    function usedProfileSections() {
      const out = new Set();
      for (const m of Object.values(modules)) {
        const started = m.lifecycle >= 2 ? !!m.started : !!m.enabled;
        if (started) for (const s of (m.uses || [])) out.add(s);
      }
      return out;
    }
    // profileFreshness plus that rule: state ok | stale | unused | miss.
    function profileSectionState(key, profile, used) {
      const f = profileFreshness(key, profile);
      return f.state === 'stale' && !(used || usedProfileSections()).has(key) ? Object.assign({}, f, { state: 'unused' }) : f;
    }
    // counts.stale / byState.stale: old AND used, the only amber there is.
    function profileSummary() {
      const p = getProfile();
      const used = usedProfileSections();
      const counts = { ok: 0, stale: 0, unused: 0, miss: 0 };
      const byState = { ok: [], stale: [], unused: [], miss: [] };
      for (const c of PROFILE_CATEGORIES) {
        const f = profileSectionState(c.id, p, used);
        counts[f.state]++;
        byState[f.state].push(c.label);
      }
      return { profile: p, used, counts, byState, at: p && p.meta ? p.meta.timestamp : null };
    }

    // ---- how each section is KEPT, for Control Panel › Profile Sync (R92) ----
    //
    // Derived, never stored: from Profile Sync's catalogue (Core.profile
    // .catalogue, the one home for which query feeds which section and how
    // often it may be read), what the started modules and the tools use, and
    // what the sync layer is doing now (Core.profile.syncStatus). One word or
    // two for the player, one sentence on hover, the queries and their clocks
    // for the developer tier:
    //   Page      the game sends it with every page (the character provider;
    //             the sidebar's party actions when nothing holds them);
    //   Every N   read in the background every N (the section's shortest
    //             interval) while a started module uses it;
    //   Live      held open: by the leading tab for a `hold` row a module
    //             uses, or in this tab now for a window that shows it;
    //   On open   only a tool uses it: read when that tool opens;
    //   —         nothing asks for it, or background reads are off / cannot
    //             run here; it updates when a game page shows it.
    function profileSyncStatus() {
      try { return typeof profileApi.syncStatus === 'function' ? profileApi.syncStatus() : null; } catch (e) { return null; }
    }
    function profileCatalogue() {
      return Array.isArray(profileApi.catalogue) ? profileApi.catalogue : [];
    }
    const everyText = (ms) => (ms < 60 * 60 * 1000 ? `Every ${Math.round(ms / 60000)} min` : `Every ${Math.round(ms / 3600000)} h`);
    const everyWords = (ms) => (ms < 60 * 60 * 1000 ? `${Math.round(ms / 60000)} minutes` : ms === 3600000 ? 'hour' : `${Math.round(ms / 3600000)} hours`);
    function formatTimeUntil(ts) {
      const sec = Math.round((ts - Date.now()) / 1000);
      if (sec <= 5) return 'due now';
      if (sec < 60) return `in ${sec}s`;
      const min = Math.round(sec / 60);
      if (min < 60) return `in ${min}m`;
      return `in ${Math.floor(min / 60)}h ${min % 60}m`;
    }
    // { label, tip, dev }. ctx = { used, toolUsed, status, catalogue, partyId }
    // (partyId: meta.partyId, null when the character document said "none").
    function profileKept(id, ctx) {
      const rows = ctx.catalogue.filter((r) => r.section === id);
      const st = ctx.status;
      const bg = st ? st.background : 'unsupported';
      const used = ctx.used.has(id);
      const byTool = ctx.toolUsed.has(id);
      const every = rows.filter((r) => r.every).map((r) => r.every);
      const shortest = every.length ? Math.min(...every) : null;
      const allPage = rows.length > 0 && rows.every((r) => r.kept === 'page');
      const hasPage = rows.some((r) => r.kept === 'page');
      const hasHold = rows.some((r) => r.hold);
      const hasLive = rows.some((r) => r.live);
      const statusRows = st && Array.isArray(st.rows) ? st.rows.filter((r) => r.section === id) : [];
      const heldNow = !!(st && Array.isArray(st.holds) && statusRows.some((r) => st.holds.includes(r.key)));
      const dev = profileKeptDev(rows, statusRows);
      const out = (label, tip) => ({ label, tip, dev });
      if (!rows.length) return out('—', 'AWOO+ never asks for this; it updates when a game page shows it.');
      if (allPage) return out('Page', 'The game sends this with every page, so it is always current.');
      // The party rows are asked only while the character document names a
      // party (the catalogue's when: 'party'); null there is an observation.
      const gated = rows.filter((r) => r.kept !== 'page');
      if (ctx.partyId === null && gated.length && gated.every((r) => r.when === 'party')) return out('—', 'You are not in a party, so AWOO+ asks for none of this.');
      if (heldNow) return out('Live', 'Kept open in this tab while a window that shows it is open, as the game\'s own page does.');
      if (used && hasHold && bg === 'on') return out('Live', 'Kept open by one tab while a loaded module uses it, as the game\'s sidebar does.');
      if (used && shortest !== null && bg === 'on') {
        return out(everyText(shortest), `Read once every ${everyWords(shortest)} while a loaded module uses it, from one tab, as opening its page would`
          + (hasLive ? ', and kept open while a window that shows it is open.' : '.'));
      }
      if (hasHold) return out('Page', 'The game\'s sidebar keeps this current on every page.');
      if (byTool && shortest !== null && bg !== 'off') {
        return out('On open', 'Read when a tool that uses it opens' + (hasPage ? '; part of it also comes with every page.' : '.'));
      }
      if (hasPage) return out('Page', 'Part of this comes with every page; the rest when a game page shows it.');
      if (bg === 'off' && (used || byTool)) return out('—', 'Background reads are off, so this updates only when a game page shows it.');
      if (bg === 'unsupported' && used) {
        return out('—', 'This browser cannot pick one tab to read from, so AWOO+ reads nothing in the background: this updates when a game page shows it, or on Sync now.');
      }
      return out('—', 'Nothing loaded uses it, so AWOO+ never asks; it updates when a game page shows it.');
    }
    // The developer half: each catalogue query of the section, how it is
    // kept, and its clocks here (members' levels summed over the members).
    function profileKeptDev(rows, statusRows) {
      if (!rows.length) return 'No query in Profile Sync\'s catalogue (src/core/profile-sync.js).';
      const parts = [];
      const seenNames = new Set();
      for (const r of rows) {
        if (seenNames.has(r.name)) continue;
        seenNames.add(r.name);
        const how = r.kept === 'page' ? 'held by the game on every page' : r.kept === 'held' ? 'held by the leading tab while used'
          : `background, ${everyText(r.every).toLowerCase()}`;
        let line = `${r.name} {${r.argKeys.join(', ')}}${r.perMember ? ' per member' : ''}: ${how}${r.live ? ', live while shown' : ''}${r.when === 'party' ? ', only in a party' : ''}`;
        const mine = statusRows.filter((s) => s.name === r.name && (!r.perMember || s.key.includes('#')) && (r.perMember || !s.key.includes('#')));
        if (mine.length) {
          const last = mine.map((s) => s.lastAt).filter(Number.isFinite);
          const next = mine.map((s) => s.nextAt).filter(Number.isFinite);
          const fails = mine.reduce((a, s) => a + (s.fails || 0), 0);
          const err = mine.map((s) => s.lastError).filter(Boolean)[0];
          line += `; last ${last.length === mine.length && last.length ? formatTimeAgo(Math.min(...last)).toLowerCase() : 'never'}`;
          if (next.length) line += `, next ${formatTimeUntil(Math.min(...next))}`;
          if (mine.some((s) => s.inFlight)) line += ', reading now';
          if (fails) line += `, ${fails} failure${fails === 1 ? '' : 's'}${err ? ` (${err})` : ''}`;
          if (r.perMember) line += ` (${mine.filter((s) => s.asked).length} member${mine.filter((s) => s.asked).length === 1 ? '' : 's'})`;
        }
        parts.push(line + '.');
      }
      return parts.join(' ');
    }
    // The background line on the Profile Sync banner: { text, tip, dev }.
    function profileBackgroundLine(st) {
      if (!st) return { text: 'Background reads: unavailable', tip: 'Profile Sync did not start, so AWOO+ reads nothing in the background.', dev: 'Core.profile.syncStatus is missing.' };
      const dev = `leader ${st.leader}, other tab leads ${st.otherLeader}; in flight ${st.inFlight}, queued ${st.queued}; `
        + `holds: ${(st.holds || []).join(', ') || 'none'}; capped: ${(st.capped || []).join(', ') || 'none'}; `
        + `refused: ceiling ${st.refused ? st.refused.ceiling : 0}, offline ${st.refused ? st.refused.offline : 0}`
        + (st.refused && st.refused.lastAt ? `, last ${st.refused.lastWhy} ${formatTimeAgo(st.refused.lastAt).toLowerCase()}` : '') + '.';
      if (st.background === 'unsupported') {
        return { text: 'Background reads: needs a newer browser', dev,
          tip: 'This browser has no Web Locks, which AWOO+ needs to pick one tab to read from, so it reads nothing in the background. Pages you open, tools and Sync now still work.' };
      }
      if (st.background === 'off') {
        return { text: 'Background reads: off', dev,
          tip: 'AWOO+ asks the game for nothing of its own; data updates when a game page shows it. Background reads and automatic sync are the switches below.' };
      }
      const n = `${st.readsLastHour} in the last hour`;
      if (st.leader) return { text: `Background reads: ${n} · this tab`, dev, tip: 'AWOO+ asks the game for what your loaded modules use, a few reads an hour, from one tab: this one. Each read is what opening that page would ask.' };
      if (st.otherLeader) return { text: `Background reads: ${n} · another tab`, dev, tip: 'Another Queslar tab reads for all of them, so this one adds nothing; what it reads arrives here too.' };
      return { text: 'Background reads: starting', dev, tip: 'No tab reads for the others yet: one starts once the game has loaded in a tab.' };
    }

    // ---- the Profile Sync button on the top bar (REGISTER.md R69) ----
    //
    // Its own button, first after AWOO+, outside the module buttons: it never
    // counts toward the player's cap, and hiding it is its own switch
    // (registry v2 `profileOnBar`). The dot says whether the data is fresh,
    // hovering says what is synced, a click opens the full page, and a
    // right-click offers the rest.
    function renderProfileButton() {
      if (!coreUi || !coreUi.profileBtn) return;
      const b = coreUi.profileBtn;
      const show = registry.profileOnBar !== false;
      if (b.hidden === show) b.hidden = !show;
      // A rule on each side of the icon; with the icon hidden, one is enough.
      if (coreUi.sepProfile && coreUi.sepProfile.hidden === show) coreUi.sepProfile.hidden = !show;
      if (!show) return;
      const sum = profileSummary();
      const dot = coreUi.profileDot;
      const cls = 'awoo-core-profile-dot' + (!sum.profile ? ' awoo-m-none' : sum.counts.stale ? ' awoo-m-old' : '');
      if (dot && dot.className !== cls) dot.className = cls;
    }
    // The card the icon opens on hover: every section and its age, the same
    // facts as Control Panel > Profile Sync, at a glance.
    function fillProfileCard(card) {
      const sum = profileSummary();
      card.innerHTML = '';
      const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
      const head = mk('div', 'awoo-core-pc-head');
      head.appendChild(dotEl(!sum.profile ? 'off' : sum.counts.stale ? 'attention' : 'running'));
      head.appendChild(mk('span', null, 'Profile Sync'));
      head.appendChild(mk('span', null, !sum.profile ? 'nothing synced yet'
        : sum.counts.stale ? `${sum.counts.stale} section${sum.counts.stale === 1 ? '' : 's'} old` : `synced ${formatTimeAgo(sum.at)}`));
      card.appendChild(head);
      const grid = mk('div', 'awoo-core-pc-grid');
      for (const c of PROFILE_CATEGORIES) {
        const f = profileSectionState(c.id, sum.profile, sum.used);
        grid.appendChild(mk('span', null, c.label));
        // Old but unused: the muted ink of "not seen", not the warning colour.
        grid.appendChild(mk('span', 'awoo-m-' + (f.state === 'unused' ? 'miss' : f.state), f.state === 'miss' ? 'not seen'
          : f.state === 'stale' ? `${f.age} · old` : f.state === 'unused' ? `${f.age} · old · unused` : f.age));
      }
      card.appendChild(grid);
      card.appendChild(mk('div', 'awoo-core-pc-foot', (getSetting('profileAutoSync') ? '' : 'Automatic sync is off. ')
        + 'Click for details · right-click for Sync now, Copy JSON, Hide'));
    }
    function setProfileOnBar(on) {
      registry.profileOnBar = !!on;
      saveState();
      renderProfileButton();
      notifyPanel();
    }

    // Called on every heartbeat and every capture. The old menu's profile row
    // lived here; Profile Sync is now its own top-bar button and Control Panel
    // page (R69), and the menu shows it only in its overview column.
    function renderProfileRow() {
      renderProfileButton();
    }

    const profileApi = {
      get autoSync() { return !!getSetting('profileAutoSync'); },
      get watchEnabled() { return getSetting('profileWatch') !== false; },
      get: getProfile,
      set: setProfile,
      subscribe: subscribeProfile,
      resync: resyncProfile,
      // v16: the store's own section merge (observedAt wins; see
      // mergeBySection), for a caller holding two copies of a profile.
      merge: mergeBySection,
      probeConvexClient,
    };

    // ---- Settings window (v6.1) ----
    //
    // A real window, not dropdown icons — number formatting needs room to
    // show BOTH separators and whether detection actually worked, and more
    // settings are coming (see the note in openSettingsWindow's body).
    // CLASS NAMES THE GAME CANNOT CLAIM. AWOO+ draws inside the game's page, so a
    // modifier class as plain as `warn` or `on` picks up whatever the game's
    // own stylesheet says about it: Profile Sync's "age unknown" cell rendered
    // as a red box on 2026-09-25 for exactly that reason. Every class token
    // the Control Panel and the menu build goes through here, and any token
    // not already `awoo-`-prefixed becomes `awoo-m-<token>`.
    const awooCls = (str) => String(str || '').split(/\s+/).filter(Boolean)
      .map((t) => (t.startsWith('awoo-') ? t : 'awoo-m-' + t)).join(' ');

    let settingsHandle = null;
    let settingsUi = null;
    // Module tabs are built from the modules present when the window is built.
    // A module that starts or stops afterwards (v14 lifecycle) makes that
    // content stale: an unloaded module's pane holds controls wired to a run
    // that no longer exists. Stale content is rebuilt at the next open rather
    // than patched, which is one code path instead of two.
    let settingsStale = false;
    function forgetModuleSettingsPane() { settingsStale = true; }
    // SEEDED, not zero. These start as the size the window is actually created
    // at, so the "size setting changed" branch in openSettingsWindow does not
    // fire on the FIRST open of every page load -- which it did, because 0
    // never equals the configured width, and that branch calls resetFull(),
    // which throws away the position you dragged it to. Geometry persistence
    // for this window was effectively off.
    let settingsMinW = 0, settingsMinH = 0;
    // ---- the jobs window (v11) ----
    //
    // The visualisation half of "the browser is the interface". Everything it
    // shows comes from the host; nothing is computed here.
    //
    // It polls only WHILE OPEN, on its own scope, so closing it stops the
    // traffic — a dashboard that keeps polling a local server after you have
    // stopped looking at it is exactly the kind of background cost §4.4 budgets
    // against, and it is invisible precisely because it is cheap per request.
    let jobsHandle = null;
    let jobsScope = null;

    function openJobsWindow() {
      if (!jobsHandle) {
        jobsHandle = createWindow({
          id: 'awoo-core-jobs', title: 'AWOO+ Jobs',
          resizable: 'vertical', minSize: { w: 520, h: 380 },
          onClose: () => { stopJobsPolling(); jobsHandle.close(); },
        });
      }
      const body = document.createElement('div');

      const status = document.createElement('div');
      status.style.cssText = 'font-size:11px; margin-bottom:8px; line-height:1.45;';
      body.appendChild(status);

      const listHost = document.createElement('div');
      body.appendChild(listHost);

      jobsHandle.setContent(body);
      jobsHandle.open();

      stopJobsPolling();
      // Owned by the WINDOW's scope, not Core's: the poll must die with the
      // window even if nothing remembers to stop it.
      jobsScope = jobsHandle.scope.child('jobs-poll');

      const refresh = async () => {
        if (jobs.state.state !== HOST_STATES.READY) await jobs.check();
        if (jobs.state.state !== HOST_STATES.READY) {
          status.textContent = `${jobs.state.state}: ${jobs.state.detail}`;
          listHost.innerHTML = '';
          return;
        }
        let live = { jobs: [] };
        let durable = { runs: [], resumable: [] };
        try {
          live = await (await hostFetch('/jobs')).json();
          durable = await jobs.runs();
        } catch (err) {
          status.textContent = `lost contact with the host: ${err.message}`;
          return;
        }

        const cap = jobs.state.health && jobs.state.health.capacity;
        const store = jobs.state.health && jobs.state.health.storage;
        status.textContent = `Connected — ${cap ? `${cap.busy}/${cap.workers} workers busy` : 'capacity unknown'}`
          + `${cap && cap.queued ? `, ${cap.queued} queued` : ''}`
          + `${store ? ` · ${store.knownFindings.toLocaleString()} simulations banked` : ''}`;

        // A resumable run is the one row that offers an ACTION, so it goes
        // first: it is the only thing here that is waiting on a decision.
        const rows = [
          ...durable.resumable.map((r) => ({ ...r, group: 'interrupted' })),
          ...live.jobs.map((j) => ({ ...j, group: j.status === 'running' || j.status === 'queued' ? 'active' : 'done' })),
          ...durable.runs.filter((r) => r.status !== 'interrupted' && !live.jobs.some((j) => j.jobId === r.jobId))
            .slice(0, 20).map((r) => ({ ...r, group: 'done' })),
        ];

        listHost.innerHTML = '';
        if (!rows.length) {
          const empty = document.createElement('div');
          empty.style.cssText = 'opacity:.7; font-size:11px; padding:12px 0;';
          empty.textContent = 'No jobs yet. Nothing has been submitted to this host.';
          listHost.appendChild(empty);
          return;
        }

        listHost.appendChild(ui.table({
          columns: [
            { key: 'jobId', label: 'Job' },
            { key: 'type', label: 'Type' },
            {
              key: 'status',
              label: 'Status',
              render: (r) => {
                if (r.group === 'interrupted') return `interrupted at ${r.completed ?? '?'}/${r.total ?? '?'}`;
                if (r.progress) return `${r.status} — ${r.progress.completed}${r.progress.total ? `/${r.progress.total}` : ''}`;
                return r.status;
              },
            },
            { key: 'durationMs', label: 'Took', render: (r) => (r.durationMs != null ? `${(r.durationMs / 1000).toFixed(1)}s` : '') },
          ],
          rows,
          rowActions: [
            {
              label: (r) => (r.group === 'interrupted' ? 'Resume' : 'Cancel'),
              onClick: async (r) => {
                if (r.group === 'interrupted') { toast('Resume is submitted by the module that owns this job type.'); return; }
                if (r.group === 'done') return;
                await jobs.cancel(r.jobId);
                refresh();
              },
            },
          ],
        }));
      };

      refresh();
      const loop = () => { refresh().finally(() => { if (jobsScope && !jobsScope.disposed) jobsScope.timeout(loop, 3000); }); };
      jobsScope.timeout(loop, 3000);
    }

    function stopJobsPolling() {
      if (jobsScope) { jobsScope.dispose(); jobsScope = null; }
    }

    function openSettingsWindow(tabId) {
      if (settingsHandle && settingsStale && !settingsHandle.isOpen()) {
        settingsHandle.destroy();
        settingsHandle = null;
        settingsUi = null;
      }
      if (!settingsHandle) {
        settingsStale = false;
        settingsHandle = createWindow({
          // Deliberately NOT resizable: a settings panel's job is to lay out
          // cleanly at one size, not to be fought with — the content itself
          // is sized to fit within this, and the body only scrolls once a
          // future tab genuinely overflows it.
          // The id stays 'awoo-core-settings' so every player's saved position
          // carries over; only the title changed (GLOSSARY.md: Control Panel).
          id: 'awoo-core-settings', title: 'AWOO+ Control Panel',
          // Read each time the panel comes forward, so the setting applies live.
          get alwaysOnTop() { return getSetting('cpOnTop') !== false; },
          resizable: false, minSize: { w: settingsSize().w, h: settingsSize().h },
        });
        settingsMinW = settingsSize().w;
        settingsMinH = settingsSize().h;
        settingsUi = buildSettingsContent();
        settingsHandle.setContent(settingsUi.root);
      }
      // Re-applied on every open, not only at creation: the size is a setting,
      // and a setting you have to close and reopen the window twice to see is
      // one people assume did not work. resetFull() re-floors the geometry
      // against the new minSize rather than leaving the old rect in place.
      const want = settingsSize();
      if (settingsHandle && (settingsMinW !== want.w || settingsMinH !== want.h)) {
        settingsMinW = want.w; settingsMinH = want.h;
        settingsHandle.setMinSize({ w: want.w, h: want.h });
        settingsHandle.resetFull();
      }
      settingsUi.renderNumberFormat();
      settingsUi.renderHostStatus();
      if (tabId && typeof settingsUi.selectTab === 'function') settingsUi.selectTab(tabId);
      settingsHandle.open();
    }

    function buildSettingsContent() {
      // A FIXED LABELLED SIDEBAR, not a hover-expanding icon rail. The rail
      // was what was asked for and it is the wrong shape for THIS window: at
      // 460px wide and deliberately non-resizable, a rail spends its expansion
      // covering the pane it is meant to navigate. Words also survive a fourth
      // and fifth module, where invented per-module glyphs do not.
      const root = document.createElement('div');
      root.className = 'awoo-settings';
      const side = document.createElement('div');
      side.className = 'awoo-settings-side';
      const paneHost = document.createElement('div');
      paneHost.className = 'awoo-settings-panes';
      root.appendChild(side);
      root.appendChild(paneHost);

      // EVERY CONTROL REGISTERS HOW TO RE-READ ITSELF. "Reset to default"
      // used to re-sync a hand-written list of three inputs, so the two added
      // afterwards (window size, developer notes) reset their STORED value and
      // left the control showing the old one -- which reads as the button
      // doing nothing. A list you have to remember to append to is a list that
      // goes stale; this one cannot, because adding a control is what adds its
      // syncer.
      const syncers = [];
      const onReset = (fn) => { syncers.push(fn); return fn; };

      // ---- THE CONTROL PANEL'S SHAPE (REGISTER.md R69; DESIGN.md §9) ----
      //
      // SECTIONS IN THE SIDEBAR, PAGES AS TABS INSIDE THE PAGE. The sidebar
      // stays five lines however many pages exist; what used to be a long flat
      // list of tabs was the "too much" the maintainer reacted to. Order is
      // theirs: General, Appearance, Modules; then Module settings, set apart;
      // then Development, at the bottom behind a dashed rule (work in progress
      // lives there, and only there). A collapsible tree is offered as the
      // alternative sidebar style (Appearance > Layout), because two good
      // designs were on the table and the maintainer asked for both.
      const SECTIONS = [
        { id: 'general', label: 'General' },
        { id: 'appearance', label: 'Appearance' },
        { id: 'modules', label: 'Modules' },
      ];
      const pages = [];
      let active = { section: 'general', page: 'general' };
      // Assigned once selectPageLazily exists further down; the sidebar calls
      // through this so there is exactly one code path for "show a page", and
      // it is the one that also renders it.
      let selectPageByIdLazily = (s, p) => selectPage(s, p);
      const treeSidebar = () => getSetting('panelNav') === 'tree';
      const tabStrip = document.createElement('div');
      tabStrip.className = 'awoo-cp-tabs';
      paneHost.appendChild(tabStrip);
      function addPage(section, id, label) {
        const pane = document.createElement('div');
        pane.className = 'awoo-settings-pane';
        pane.hidden = true;
        paneHost.appendChild(pane);
        pages.push({ section, id, label, pane });
        return pane;
      }
      const pagesOf = (section) => pages.filter((p) => p.section === section);
      function selectPage(section, pageId) {
        const list = pagesOf(section);
        const found = list.find((p) => p.id === pageId) || list[0] || pages[0];
        if (!found) return;
        active = { section: found.section, page: found.id };
        for (const p of pages) p.pane.hidden = p !== found;
        renderSide();
        renderTabs();
      }
      // Small counts beside a section or page: they answer "is anything
      // waiting here" without opening it.
      function badgeFor(section, pageId) {
        if (section === 'general' && (!pageId || pageId === 'updates')) {
          const n = updateState.available.length;
          return n ? { text: String(n), tone: 'warn' } : null;
        }
        if (section === 'modules' && !pageId) {
          const mods = Object.values(modules).filter((m) => m.kind !== 'tweak');
          return { text: `${mods.filter((m) => m.enabled).length}/${mods.length}` };
        }
        return null;
      }
      function badgeEl(b) {
        const el = document.createElement('span');
        el.className = awooCls('awoo-cp-badge' + (b.tone ? ' ' + b.tone : ''));
        el.textContent = b.text;
        return el;
      }
      function renderTabs() {
        tabStrip.innerHTML = '';
        const list = pagesOf(active.section);
        tabStrip.hidden = list.length < 2 || treeSidebar();
        for (const p of list) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = awooCls('awoo-cp-tab' + (p.id === active.page ? ' on' : ''));
          b.textContent = p.label;
          const badge = badgeFor(p.section, p.id);
          if (badge && p.id === 'updates') b.appendChild(badgeEl(badge));
          b.addEventListener('click', () => selectPageByIdLazily(p.section, p.id));
          tabStrip.appendChild(b);
        }
      }
      function sideItem(label, { on = false, dim = false, sub = false, badge = null, tag = null, onClick }) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = awooCls('awoo-settings-side-i' + (on ? ' on' : '') + (dim ? ' dim' : '') + (sub ? ' sub' : ''));
        const t = document.createElement('span');
        t.textContent = label;
        b.appendChild(t);
        if (badge) b.appendChild(badgeEl(badge));
        if (tag) { const w = document.createElement('span'); w.className = 'awoo-cp-wip'; w.textContent = tag; b.appendChild(w); }
        b.addEventListener('click', onClick);
        return b;
      }
      function sideHeading(text, { dashed = false } = {}) {
        const h = document.createElement('div');
        h.className = awooCls('awoo-settings-side-h' + (dashed ? ' dev' : ''));
        h.textContent = text;
        return h;
      }
      function renderSide() {
        side.innerHTML = '';
        const tree = treeSidebar();
        // The first group gets a heading like the two below it (R69 round 7):
        // without one, General / Appearance / Modules read as loose items
        // above two labelled groups. Named for what it configures, AWOO+
        // itself, since "General" is already one of its pages.
        side.appendChild(sideHeading('AWOO+'));
        for (const s of SECTIONS) {
          const open = active.section === s.id;
          side.appendChild(sideItem((tree ? (open ? '▾ ' : '▸ ') : '') + s.label, {
            on: !tree && open, badge: badgeFor(s.id),
            onClick: () => selectPageByIdLazily(s.id, open && tree ? active.page : (pagesOf(s.id)[0] || {}).id),
          }));
          if (tree && open) {
            for (const p of pagesOf(s.id)) {
              side.appendChild(sideItem(p.label, { on: p.id === active.page, sub: true,
                onClick: () => selectPageByIdLazily(p.section, p.id) }));
            }
          }
        }
        // In the player's module order (Modules page), not the order they were built in.
        const moduleSections = orderedIds([...new Set(pages.filter((p) => p.section.startsWith('m:')).map((p) => p.section.slice(2)))])
          .map((id) => 'm:' + id);
        if (moduleSections.length) {
          side.appendChild(sideHeading('Module settings'));
          for (const sec of moduleSections) {
            const id = sec.slice(2);
            const mod = modules[id];
            side.appendChild(sideItem((mod && mod.label) || id, {
              on: active.section === sec, dim: !(mod && mod.enabled), badge: mod && !mod.enabled ? { text: 'off' } : null,
              onClick: () => selectPageByIdLazily(sec, 'main'),
            }));
          }
        }
        side.appendChild(sideHeading('Development', { dashed: true }));
        side.appendChild(sideItem('Profile Sync', { on: active.section === 'sync',
          onClick: () => selectPageByIdLazily('sync', 'sync') }));
        side.appendChild(sideItem('Companion', { on: active.section === 'development', tag: 'WIP',
          onClick: () => selectPageByIdLazily('development', 'companion') }));
      }

      // Where an outside caller's tab id lands. The old flat ids ('general',
      // 'appearance', 'jobs', a module id) keep working, because module windows
      // pass their own id to Core.openSettings() from their gear button.
      const TARGETS = {
        general: ['general', 'general'], sync: ['sync', 'sync'], profile: ['sync', 'sync'],
        updates: ['general', 'updates'], changelog: ['general', 'changelog'], diag: ['general', 'diag'], diagnostics: ['general', 'diag'],
        appearance: ['appearance', 'style'], style: ['appearance', 'style'], layout: ['appearance', 'layout'],
        modules: ['modules', 'modules'], tools: ['modules', 'tools'], tweaks: ['modules', 'tweaks'], info: ['modules', 'info'],
        jobs: ['development', 'companion'], companion: ['development', 'companion'],
      };
      function resolveTarget(id) {
        if (TARGETS[id]) return TARGETS[id];
        if (pages.some((p) => p.section === 'm:' + id)) return ['m:' + id, 'main'];
        return ['general', 'general'];
      }

      const paneGeneral = addPage('general', 'general', 'General');
      // Under Development (the maintainer, 2026-09-25): the sync layer is still
      // being built, and Development is where work in progress lives.
      const paneSync = addPage('sync', 'sync', 'Profile Sync');
      // Its live part is drawn here, above the settings appended further down.
      const syncHost = document.createElement('div');
      syncHost.className = 'awoo-settings-pane';
      paneSync.appendChild(syncHost);
      const paneUpdates = addPage('general', 'updates', 'Updates');
      const paneChangelog = addPage('general', 'changelog', 'Changelog');
      const paneDiag = addPage('general', 'diag', 'Diagnostics');
      // Appearance is two pages: Style (how things LOOK and READ: theme, number
      // format, fonts) and Layout (where things sit and how they size).
      const paneAppearance = addPage('appearance', 'style', 'Style');
      const paneLayout = addPage('appearance', 'layout', 'Layout');
      const paneModules = addPage('modules', 'modules', 'Modules');
      const paneTools = addPage('modules', 'tools', 'Tools');
      const paneTweaks = addPage('modules', 'tweaks', 'Tweaks');
      const paneInfo = addPage('modules', 'info', 'Info');
      const paneJobs = addPage('development', 'companion', 'Companion');

      // A category heading inside a pane. Distinct from a group box on
      // purpose: the pane IS the group now, and boxing every category inside
      // it would draw three borders around one idea.
      function category(pane, text) {
        const c = document.createElement('div');
        c.className = 'awoo-settings-cat';
        c.textContent = text;
        pane.appendChild(c);
        return c;
      }

      // ---- the Appearance summary on General ----
      // A quiet one-liner in the corner of General — theme, number sample, text
      // face — so what is set is visible without opening the tab, and a click
      // goes there. Deliberately faint: it is a signpost, not a control.
      const appearanceSummary = document.createElement('button');
      appearanceSummary.type = 'button';
      appearanceSummary.className = 'awoo-settings-summary';
      appearanceSummary.title = 'Open Appearance';
      appearanceSummary.addEventListener('click', () => selectPageByIdLazily('appearance', 'style'));
      // Not shown since the Control Panel (R69): Appearance is now one line
      // below General in the sidebar, so a signpost to it was clutter. Kept
      // built, because renderNumberFormat() still refreshes its text.
      function renderAppearanceSummary() {
        const theme = (THEME_CHOICES().find((c) => c.id === themeId()) || {}).label || themeId();
        const face = fontChoice('text', fontsFor('awoo').text).label;
        appearanceSummary.textContent = `${theme} · ${formatNumber(1234.5)} · ${face}`;
      }

      // ---- number format ----
      const numGroup = document.createElement('div');
      numGroup.className = 'awoo-ui-group';
      const numStatus = document.createElement('div');
      numStatus.style.cssText = 'font-size:11px; opacity:.85; margin:4px 0;';
      numGroup.appendChild(numStatus);
      const numBtnRow = document.createElement('div');
      numBtnRow.style.cssText = 'display:flex; gap:6px; flex-wrap:wrap;';
      const numOptions = [
        { key: null, label: 'Auto-detect' },
        { key: '1.000,00', label: '1.000,00 (EU)' },
        { key: '1,000.00', label: '1,000.00 (US)' },
      ];
      const numBtns = numOptions.map((opt) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'awoo-ui-btn';
        btn.textContent = opt.label;
        btn.addEventListener('click', () => { setNumberLocaleOverride(opt.key); settingsUi.renderNumberFormat(); });
        numBtnRow.appendChild(btn);
        return { key: opt.key, btn };
      });
      numGroup.appendChild(numBtnRow);

      // ---- appearance ----
      // The named-theme picker that was "explicitly asked for, explicitly
      // deferred": AWOO Turquoise, the seven themes every tool also wears, and
      // Match game. Previewable, so it applies live (the save model above) —
      // picking a theme IS the preview, and a Save button in front of it would
      // ask you to confirm what you are already looking at.
      const themeGroup = document.createElement('div');
      themeGroup.className = 'awoo-ui-group';
      const themeRow = ui.inputRow({
        label: 'Theme',
        type: 'select',
        value: themeId(),
        options: THEME_CHOICES().map((c) => ({ value: c.id, label: c.label })),
        info: 'Tools you open from the AWOO+ menu use this theme too.',
        devInfo: 'Named themes come from src/tools/theme-tokens.css, generated into Core at build time, so '
          + 'the overlay and the tools cannot drift. AWOO Turquoise and Match game are game-shaped: eight '
          + 'game variables with the rest derived by color-mix and the semantic hues taken from Slate. A tool '
          + 'cannot read the game page, so under either of those it shows Slate and says so.',
        onChange: (v) => { setSetting('theme', v); renderAppearanceSummary(); },
      });
      themeGroup.appendChild(themeRow);
      // Theme first: it is the one appearance setting people change for fun.
      category(paneAppearance, 'Theme');
      onReset(() => { if (themeRow._input) themeRow._input.value = themeId(); });
      paneAppearance.appendChild(themeGroup);
      category(paneAppearance, 'Numbers');
      paneAppearance.appendChild(numGroup);

      // ---- windows ----
      const windowsGroup = document.createElement('div');
      windowsGroup.className = 'awoo-ui-group';
      windowsGroup.style.cssText = 'margin-top:10px;';

      const resizeRow = document.createElement('div');
      resizeRow.style.cssText = 'display:flex; align-items:center; gap:8px; margin:4px 0;';
      const resizeToggle = Core_ui_toggleRow({
        label: 'Enable window resizing',
        info: 'ON (default): every window (except this one) can be dragged by its bottom-right corner to '
          + 'resize it. OFF removes the resize handle entirely, for anyone who would rather every window '
          + 'just kept its default size.',
        checked: !!getSetting('windowResizingEnabled'),
        onChange: (v) => setSetting('windowResizingEnabled', v),
      });
      resizeToggle.style.margin = '0';
      const resetSizesBtn = document.createElement('button');
      resetSizesBtn.type = 'button';
      resetSizesBtn.className = 'awoo-ui-btn';
      resetSizesBtn.textContent = 'Reset window sizes';
      resetSizesBtn.title = 'Resets EVERY window\'s position AND size back to default, including this one — '
        + 'not the same as the dropdown\'s reset button, which only nudges position and leaves size alone.';
      resetSizesBtn.style.marginLeft = 'auto';
      resetSizesBtn.addEventListener('click', () => resetAllWindowSizes());
      resizeRow.appendChild(resizeToggle);
      resizeRow.appendChild(resetSizesBtn);
      windowsGroup.appendChild(resizeRow);

      // Previewable, so it applies live (DESIGN.md's save model): you pick a
      // size and the window you are looking at becomes that size. A Save
      // button in front of that would be asking you to confirm something you
      // can already see.
      const sizeRow = ui.inputRow({
        label: 'Control Panel size',
        type: 'select',
        value: getSetting('settingsSize'),
        options: Object.keys(SETTINGS_SIZES).map((k) => ({
          value: k, label: `${SETTINGS_SIZES[k].label} (${SETTINGS_SIZES[k].w}x${SETTINGS_SIZES[k].h})`,
        })),
        info: 'Pick a size. "Bring all panels on-screen" below puts it back where you can reach it.',
        devInfo: 'Non-resizable on purpose: the panes are laid out for a known width, so the choice is '
          + 'between designed sizes rather than a free drag handle.',
        onChange: (v) => {
          setSetting('settingsSize', v);
          const want = settingsSize();
          settingsMinW = want.w; settingsMinH = want.h;
          if (settingsHandle) { settingsHandle.setMinSize(want); settingsHandle.resetFull(); }
        },
      });
      windowsGroup.appendChild(sizeRow);
      const sideRow = ui.inputRow({
        label: 'Control Panel sidebar', type: 'select', value: CP_SIDE_WIDTHS[getSetting('cpSideWidth')] ? getSetting('cpSideWidth') : 'default',
        options: [{ value: 'narrow', label: 'Narrow' }, { value: 'default', label: 'Default' }, { value: 'wide', label: 'Wide' }],
        info: 'How wide the list on the left of this panel is. Wider fits long module names.',
        onChange: (v) => setSetting('cpSideWidth', CP_SIDE_WIDTHS[v] ? v : 'default'),
      });
      onReset(() => { if (sideRow._input) sideRow._input.value = getSetting('cpSideWidth'); applyCpSideWidth(); });
      windowsGroup.appendChild(sideRow);
      const onTopRow = Core_ui_toggleRow({
        label: 'Keep the Control Panel on top',
        info: 'Loading a module opens its window; with this on, the Control Panel stays above it.',
        checked: getSetting('cpOnTop') !== false,
        onChange: (v) => { setSetting('cpOnTop', v); if (settingsHandle && settingsHandle.isOpen()) settingsHandle.open(); },
      });
      onReset(() => { const i = onTopRow.querySelector('input[type="checkbox"]'); if (i) i.checked = getSetting('cpOnTop') !== false; });
      windowsGroup.appendChild(onTopRow);

      const reloadRow = Core_ui_toggleRow({
        label: 'Reopen module windows automatically on page reload',
        info: 'OFF (default): a module always opens its window the moment you enable it, but a page '
          + 'reload does NOT re-show windows that merely happened to be open last session — keeps a '
          + 'reload from cluttering the screen with everything you had open before.',
        checked: !!getSetting('autoShowOnReload'),
        onChange: (v) => setSetting('autoShowOnReload', v),
      });
      reloadRow.style.marginTop = '6px';
      windowsGroup.appendChild(reloadRow);
      // ---- profile ----
      const profileGroup = document.createElement('div');
      profileGroup.className = 'awoo-ui-group';
      const profileToggle = Core_ui_toggleRow({
        label: 'Sync profile automatically',
        info: 'ON (default): your character profile is kept up to date in the background, so every '
          + 'module and tool has current stats. OFF: it only updates when you press Sync now '
          + '(Profile Sync, or right-click its top-bar icon).',
        checked: !!getSetting('profileAutoSync'),
        onChange: (v) => setSetting('profileAutoSync', v),
      });
      profileGroup.appendChild(profileToggle);
      // "Background reads" since R92; it was "Keep party data open" while all
      // it governed was Party's watches. The key stays profileWatch.
      const watchToggle = Core_ui_toggleRow({
        label: 'Background reads',
        info: 'ON (default): AWOO+ asks the game for what your loaded modules use, a few reads an hour, '
          + 'from one tab, the way opening those pages would. OFF: AWOO+ adds no request of its own, '
          + 'and only reads what the pages you open show.',
        checked: getSetting('profileWatch') !== false,
        onChange: (v) => setSetting('profileWatch', v),
      });
      watchToggle.style.marginTop = '6px';
      {
        // The developer half, on the same info icon (the row's last child).
        const icon = watchToggle.children[watchToggle.children.length - 1];
        if (icon && icon.setAttribute) {
          icon.setAttribute('data-tooltip-dev', 'Setting profileWatch. Off: no Web Lock is taken, and no background read, hold, '
            + 'tool request or Sync now read is made (profile-sync.js). The automatic ones also need "Sync profile automatically".');
        }
      }
      profileGroup.appendChild(watchToggle);
      onReset(() => {
        const pt = profileToggle.querySelector('input[type="checkbox"]');
        if (pt) pt.checked = !!getSetting('profileAutoSync');
        const wt = watchToggle.querySelector('input[type="checkbox"]');
        if (wt) wt.checked = getSetting('profileWatch') !== false;
      });
      category(paneSync, 'Syncing');
      paneSync.appendChild(profileGroup);

      category(paneGeneral, 'Developer');
      const devGroup = document.createElement('div');
      devGroup.className = 'awoo-ui-group';
      devGroup.appendChild(Core_ui_toggleRow({
        label: 'Show developer info',
        info: 'Adds a tinted second half to hover text, explaining why things work the way they do.',
        checked: getSetting('showDevTooltips'),
        onChange: (v) => setSetting('showDevTooltips', v),
      }));
      onReset(() => {
        const dv = devGroup.querySelector('input[type="checkbox"]');
        if (dv) dv.checked = !!getSetting('showDevTooltips');
      });
      paneGeneral.appendChild(devGroup);

      category(paneLayout, 'Panels');
      onReset(() => {
        const rz = resizeToggle.querySelector('input[type="checkbox"]');
        if (rz) rz.checked = !!getSetting('windowResizingEnabled');
        const rl = reloadRow.querySelector('input[type="checkbox"]');
        if (rl) rl.checked = !!getSetting('autoShowOnReload');
        if (sizeRow && sizeRow._input) sizeRow._input.value = getSetting('settingsSize');
        // The window itself has to follow, or the select says Default while
        // the panel stays the size it was.
        const want = settingsSize();
        settingsMinW = want.w; settingsMinH = want.h;
        if (settingsHandle) { settingsHandle.setMinSize(want); settingsHandle.resetFull(); }
      });
      paneLayout.appendChild(windowsGroup);

      // ---- job host (v11) ----
      //
      // The client existed for a version before this did, which was a real gap:
      // `Core.jobs` could connect, submit and drive the capacity dial, and there
      // was no way to reach any of it. A settings API with no settings UI is a
      // feature nobody has.
      //
      // WHY THE STATUS LINE IS THE BIGGEST THING HERE. There are four ways this
      // can be not-working and each has a different fix — nothing listening,
      // wrong token, a host from another build, or never checked. Collapsing
      // them into a red dot would leave the user guessing which of four things
      // to try, so the line says the fix rather than the symptom.
      const hostGroup = document.createElement('div');
      hostGroup.className = 'awoo-ui-group';
      hostGroup.style.cssText = 'margin-top:10px;';
      const hostLabel = document.createElement('div');
      hostLabel.style.cssText = 'font-weight:bold; opacity:.7; text-transform:uppercase; font-size:10px; letter-spacing:.04em; margin-bottom:4px;';
      hostLabel.textContent = 'Companion';
      hostLabel.appendChild(ui.infoIcon(
        'An optional local program that runs long simulations outside the browser, so they keep going '
        + 'when this tab is closed. Everything here works without it — this only unlocks the long jobs. '
        + 'Start it with: node server/host.mjs',
      ));
      hostGroup.appendChild(hostLabel);

      const hostStatusLine = document.createElement('div');
      hostStatusLine.style.cssText = 'font-size:11px; margin:4px 0 8px; line-height:1.45;';
      hostGroup.appendChild(hostStatusLine);

      // TRANSACTIONAL, unlike every other setting in this window.
      //
      // These two only mean anything together, and they were being written to
      // localStorage on EVERY KEYSTROKE with no debounce — so "http://loc" was
      // your stored configuration for as long as it took to type the rest, and
      // a half-pasted token replaced a working one the moment you touched the
      // field. Neither previews itself: nothing about typing an address tells
      // you whether it is right, which is exactly the case a Save button is
      // for. It buffers, and the bar below commits.
      let hostDraft = null;
      const hostBar = document.createElement('div');
      hostBar.className = 'awoo-settings-savebar';
      hostBar.hidden = true;
      function markHostDirty(patch) {
        hostDraft = Object.assign({}, hostDraft, patch);
        hostBar.hidden = false;
        renderHostBar();
      }
      function discardHostDraft() {
        hostDraft = null;
        hostBar.hidden = true;
        hostUrlRow._input.value = jobs.config.url;
        hostTokenRow._input.value = '';
      }
      function commitHostDraft() {
        if (!hostDraft) return;
        setHostConfig(hostDraft);
        hostDraft = null;
        hostBar.hidden = true;
        hostTokenRow._input.value = '';
        hostTokenRow._input.placeholder = jobs.config.hasToken ? '•••••••• (saved)' : 'paste from the host';
        toast('Companion settings saved.', { type: 'success', duration: 3000 });
        if (typeof jobs.connect === 'function') jobs.connect();
      }
      function renderHostBar() {
        const n = hostDraft ? Object.keys(hostDraft).length : 0;
        hostBar.innerHTML = '';
        const label = document.createElement('span');
        label.className = 'awoo-settings-savebar-label';
        label.textContent = `Companion · ${n} unsaved change${n === 1 ? '' : 's'}`;
        const spacer = document.createElement('span');
        spacer.style.flex = '1';
        const discard = document.createElement('button');
        discard.type = 'button';
        discard.className = 'awoo-ui-btn';
        discard.textContent = 'Discard';
        discard.addEventListener('click', discardHostDraft);
        const save = document.createElement('button');
        save.type = 'button';
        save.className = 'awoo-ui-btn awoo-ui-btn-primary';
        save.textContent = 'Save & connect';
        save.addEventListener('click', commitHostDraft);
        for (const el of [label, spacer, discard, save]) hostBar.appendChild(el);
      }

      const hostUrlRow = ui.inputRow({
        label: 'Address',
        value: jobs.config.url,
        onChange: (v) => markHostDirty({ url: v.trim() }),
      });
      hostGroup.appendChild(hostUrlRow);

      const hostTokenRow = ui.inputRow({
        label: 'Token',
        value: '',
        info: 'The host prints this when it starts. It is regenerated every run and written nowhere, '
          + 'so it has to be pasted again after restarting the host.',
        onChange: (v) => markHostDirty({ token: v.trim() }),
      });
      hostTokenRow._input.placeholder = jobs.config.hasToken ? '•••••••• (saved)' : 'paste from the host';
      hostGroup.appendChild(hostTokenRow);
      hostGroup.appendChild(hostBar);

      // ---- capacity ----
      //
      // Hidden until connected, because "how many cores" is a meaningless
      // control when there is nothing to apply it to, and a disabled input with
      // no explanation is worse than an absent one.
      const capRow = document.createElement('div');
      capRow.style.cssText = 'display:flex; align-items:center; gap:8px; margin-top:8px;';
      capRow.style.display = 'none';
      const capLabel = document.createElement('label');
      capLabel.style.cssText = 'font-size:11px; flex:1;';
      capLabel.textContent = 'Workers';
      capLabel.appendChild(ui.infoIcon(
        'How many CPU cores the host may use. Safe to change while jobs are running: more takes effect '
        + 'immediately, fewer lets running jobs finish first and never throws work away.',
      ));
      const capInput = document.createElement('input');
      capInput.type = 'number';
      capInput.min = '1';
      capInput.style.cssText = 'width:64px;';
      const capApply = document.createElement('button');
      capApply.type = 'button';
      capApply.className = 'awoo-ui-btn';
      capApply.textContent = 'Apply';
      capRow.appendChild(capLabel);
      capRow.appendChild(capInput);
      capRow.appendChild(capApply);
      hostGroup.appendChild(capRow);

      const hostBtnRow = document.createElement('div');
      hostBtnRow.style.cssText = 'display:flex; gap:6px; margin-top:8px;';
      const hostCheckBtn = document.createElement('button');
      hostCheckBtn.type = 'button';
      hostCheckBtn.className = 'awoo-ui-btn awoo-ui-btn-primary';
      hostCheckBtn.textContent = 'Connect';
      const hostJobsBtn = document.createElement('button');
      hostJobsBtn.type = 'button';
      hostJobsBtn.className = 'awoo-ui-btn';
      hostJobsBtn.textContent = 'View jobs';
      hostJobsBtn.addEventListener('click', () => openJobsWindow());
      hostBtnRow.appendChild(hostCheckBtn);
      hostBtnRow.appendChild(hostJobsBtn);
      hostGroup.appendChild(hostBtnRow);

      const HOST_COPY = {
        [HOST_STATES.UNKNOWN]: ['', 'Not checked yet — press Connect.'],
        [HOST_STATES.READY]: ['var(--awoo-success)', 'Connected.'],
        [HOST_STATES.NO_HOST]: ['var(--awoo-warn)', 'Not running — start it yourself; a userscript cannot.'],
        [HOST_STATES.UNAUTHORIZED]: ['var(--awoo-warn)', 'Token not accepted.'],
        [HOST_STATES.MISMATCH]: ['var(--awoo-danger)', 'Version mismatch — do not use.'],
      };

      function renderHostStatus() {
        const s = jobs.state;
        const [color, headline] = HOST_COPY[s.state] || HOST_COPY[HOST_STATES.UNKNOWN];
        hostStatusLine.innerHTML = '';
        const strong = document.createElement('div');
        strong.style.cssText = `font-weight:bold;${color ? ` color:${color};` : ''}`;
        strong.textContent = headline;
        const detail = document.createElement('div');
        detail.style.cssText = 'opacity:.75; margin-top:2px;';
        detail.textContent = s.detail || '';
        hostStatusLine.appendChild(strong);
        if (s.detail) hostStatusLine.appendChild(detail);

        // A COMMAND YOU CAN PASTE, because pressing run is the one step that
        // stays yours. A userscript cannot start a process — no GM_* API
        // exposes that, and this project mandates @grant none anyway, so even
        // the weaker grants are off the table (DISTRIBUTION.md §1.3). What it CAN do
        // is remove every other bit of friction: navigator.clipboard needs no
        // grant and is already in production use for plan sharing.
        if (s.state === HOST_STATES.NO_HOST || s.state === HOST_STATES.MISMATCH) {
          const cmdRow = document.createElement('div');
          cmdRow.style.cssText = 'display:flex; align-items:center; gap:6px; margin-top:6px;';
          const cmd = document.createElement('code');
          cmd.textContent = HOST_START_COMMAND;
          cmd.style.cssText = 'flex:1; font-size:var(--awoo-fs-caption); opacity:.8; '
            + 'overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
          const copyBtn = document.createElement('button');
          copyBtn.type = 'button';
          copyBtn.className = 'awoo-ui-btn';
          copyBtn.textContent = 'Copy';
          copyBtn.setAttribute('data-tooltip',
            'Copies the command that starts the Companion. Run it in a terminal in your queslar-core clone.');
          copyBtn.setAttribute('data-tooltip-dev',
            'A userscript categorically cannot start a process: no GM_* API exposes it, and this project '
            + 'mandates @grant none anyway. See server/README.md section 7.');
          copyBtn.setAttribute('data-tooltip-wide', '');
          copyBtn.addEventListener('click', () => {
            try {
              navigator.clipboard.writeText(HOST_START_COMMAND);
              toast('Start command copied.', { type: 'success', duration: 3000 });
            } catch (e) {
              toast('Could not copy — select the command and copy it by hand.', { type: 'warn' });
            }
          });
          cmdRow.appendChild(cmd);
          cmdRow.appendChild(copyBtn);
          hostStatusLine.appendChild(cmdRow);
        }

        const cap = s.health && s.health.capacity;
        // `style.display`, not `.hidden`. This row carries an inline
        // `display:flex`, and an inline display beats the UA's
        // `[hidden]{display:none}` — so setting `.hidden` left it fully
        // visible. The stylesheet now also carries an `!important` version of
        // that rule so the same mistake cannot be made silently elsewhere, but
        // setting display directly is what this row actually needs.
        capRow.style.display = (s.state === HOST_STATES.READY && cap) ? 'flex' : 'none';
        if (cap) {
          capLabel.firstChild.nodeValue = `Workers (${cap.busy} busy, up to ${cap.maxUseful} useful) `;
          if (document.activeElement !== capInput) capInput.value = String(cap.workers);
          capInput.max = String(cap.maxUseful);
        }
      }

      hostCheckBtn.addEventListener('click', async () => {
        hostCheckBtn.disabled = true;
        hostCheckBtn.textContent = 'Checking…';
        try { await jobs.check(); } finally {
          hostCheckBtn.disabled = false;
          hostCheckBtn.textContent = 'Connect';
          renderHostStatus();
        }
      });

      capApply.addEventListener('click', async () => {
        const n = parseInt(capInput.value, 10);
        if (!Number.isInteger(n) || n < 1) { toast('Workers must be a whole number, 1 or more.'); return; }
        capApply.disabled = true;
        try {
          await jobs.setCapacity(n);
          await jobs.check();
          toast(`Host is now using ${n} worker${n === 1 ? '' : 's'}.`);
        } catch (err) {
          toast(`Could not change capacity: ${err.message}`);
        } finally {
          capApply.disabled = false;
          renderHostStatus();
        }
      });

      paneJobs.appendChild(hostGroup);

      // ---- fonts (ARTIFACT_STYLE_GUIDE.md Part II, "Fonts are a user
      // setting"; mockup: section 07 of the Design System artifact) ----
      //
      // TRANSACTIONAL, and the one previewable setting that is. The save
      // model above says a change that previews itself applies live — but a
      // font flip reflows every line under the reader's eyes, so trying three
      // faces would mean three reflows of whatever they were reading. The
      // preview beside each select carries the choice; nothing on the page
      // moves until "Save & apply".
      //
      // Two surfaces, set separately: the overlay and the tools are read in
      // different places at different sizes.
      const FONT_SURFACES = [
        { id: 'awoo', label: 'AWOO+ overlay', hint: 'These windows, the menu and the nav buttons.' },
        { id: 'tools', label: 'Tools', hint: 'Pages opened from the menu. Applies the next time one opens.' },
      ];
      const FONT_PREVIEW = { text: 'Sanctum skill tree', num: '8.00t · 1,049,000' };
      const savedFonts = () => ({ awoo: fontsFor('awoo'), tools: fontsFor('tools') });
      let fontDraft = savedFonts();
      const fontRefs = {};
      const fontsGroupHost = document.createElement('div');
      fontsGroupHost.className = 'awoo-settings-pane';
      for (const sf of FONT_SURFACES) {
        const group = document.createElement('div');
        group.className = 'awoo-ui-group';
        const head = document.createElement('div');
        head.className = 'awoo-ui-group-label';
        head.textContent = sf.label;
        const chip = document.createElement('span');
        chip.className = 'awoo-fonts-chip';
        head.appendChild(chip);
        group.appendChild(head);
        const hint = document.createElement('div');
        hint.className = 'awoo-fonts-hint';
        hint.textContent = sf.hint;
        group.appendChild(hint);
        fontRefs[sf.id] = { chip, selects: {}, previews: {} };
        for (const kind of ['text', 'num']) {
          const row = document.createElement('div');
          row.className = 'awoo-fonts-row';
          const label = document.createElement('label');
          label.textContent = kind === 'text' ? 'Text' : 'Numbers';
          const sel = document.createElement('select');
          sel.setAttribute('aria-label', `${sf.label} ${label.textContent.toLowerCase()} font`);
          for (const f of FONT_CHOICES[kind]) {
            const o = document.createElement('option');
            o.value = f.id;
            o.textContent = f.label + (f === FONT_CHOICES[kind][0] ? ' (default)' : '');
            sel.appendChild(o);
          }
          sel.addEventListener('change', () => {
            fontDraft[sf.id] = Object.assign({}, fontDraft[sf.id], { [kind]: sel.value });
            renderFonts();
          });
          const preview = document.createElement('div');
          preview.className = 'awoo-fonts-preview' + (kind === 'num' ? ' awoo-num' : '');
          preview.textContent = FONT_PREVIEW[kind];
          row.appendChild(label);
          row.appendChild(sel);
          row.appendChild(preview);
          group.appendChild(row);
          fontRefs[sf.id].selects[kind] = sel;
          fontRefs[sf.id].previews[kind] = preview;
        }
        fontsGroupHost.appendChild(group);
      }
      const fontBar = document.createElement('div');
      fontBar.className = 'awoo-settings-savebar';
      const fontBarLabel = document.createElement('span');
      fontBarLabel.className = 'awoo-settings-savebar-label';
      const fontBarSpacer = document.createElement('span');
      fontBarSpacer.style.flex = '1';
      const fontDiscard = document.createElement('button');
      fontDiscard.type = 'button';
      fontDiscard.className = 'awoo-ui-btn';
      fontDiscard.textContent = 'Discard';
      const fontSave = document.createElement('button');
      fontSave.type = 'button';
      fontSave.className = 'awoo-ui-btn awoo-ui-btn-primary';
      fontSave.textContent = 'Save & apply';
      for (const el of [fontBarLabel, fontBarSpacer, fontDiscard, fontSave]) fontBar.appendChild(el);
      fontsGroupHost.appendChild(fontBar);

      const fontDirty = (id) => {
        const s = savedFonts()[id];
        return s.text !== fontDraft[id].text || s.num !== fontDraft[id].num;
      };
      function renderFonts() {
        const dirtyLabels = [];
        for (const sf of FONT_SURFACES) {
          const refs = fontRefs[sf.id];
          const dirty = fontDirty(sf.id);
          if (dirty) dirtyLabels.push(sf.label);
          refs.chip.textContent = dirty ? 'unsaved' : 'saved';
          refs.chip.classList.toggle('dirty', dirty);
          for (const kind of ['text', 'num']) {
            const f = fontChoice(kind, fontDraft[sf.id][kind]);
            refs.selects[kind].value = f.id;
            // The preview has to be in the face it names. A preview that
            // silently falls back is a lie about what Save will do.
            loadFontFamily(f.family);
            refs.previews[kind].style.fontFamily = `${f.stack}, ${CORE_FONT}`;
          }
        }
        fontBar.hidden = dirtyLabels.length === 0;
        fontBarLabel.textContent = `Fonts · unsaved: ${dirtyLabels.join(', ')}`;
      }
      fontDiscard.addEventListener('click', () => { fontDraft = savedFonts(); renderFonts(); });
      fontSave.addEventListener('click', () => {
        setSetting('fonts', { awoo: Object.assign({}, fontDraft.awoo), tools: Object.assign({}, fontDraft.tools) });
        fontDraft = savedFonts();
        renderFonts();
        renderAppearanceSummary();
        toast('Fonts applied. Tools use them from the next one you open.', { type: 'success', duration: 3000 });
      });
      onReset(() => { fontDraft = savedFonts(); renderFonts(); renderAppearanceSummary(); });
      renderFonts();
      category(paneAppearance, 'Fonts');
      paneAppearance.appendChild(fontsGroupHost);

      // ---- backup ----
      // Export writes a file; import reads one, says what it holds, and asks
      // before touching anything. After an import the page reloads, because
      // every module read its state at start and would otherwise keep showing
      // the old one until the next reload anyway.
      category(paneGeneral, 'Backup');
      const backupGroup = document.createElement('div');
      backupGroup.className = 'awoo-ui-group';
      const backupHint = document.createElement('div');
      backupHint.className = 'awoo-fonts-hint';
      backupHint.textContent = 'Every AWOO+ setting, module, window and tool, in one file. '
        + 'Your character profile and Companion token are left out.';
      const backupRow = document.createElement('div');
      backupRow.className = 'awoo-ui-actions';
      backupRow.style.marginTop = 'var(--awoo-s3)';
      const exportBtn = document.createElement('button');
      exportBtn.type = 'button';
      exportBtn.className = 'awoo-ui-btn';
      exportBtn.textContent = 'Export settings';
      const importBtn = document.createElement('button');
      importBtn.type = 'button';
      importBtn.className = 'awoo-ui-btn';
      importBtn.textContent = 'Import settings…';
      const importFile = document.createElement('input');
      importFile.type = 'file';
      importFile.accept = '.json,application/json';
      importFile.hidden = true;
      exportBtn.addEventListener('click', () => {
        const data = collectBackup();
        const n = Object.keys(data.keys).length;
        try {
          const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
          const a = document.createElement('a');
          a.href = url;
          a.download = `awoo-settings-${data.exportedAt.slice(0, 10)}.json`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          toast(`Exported ${n} setting${n === 1 ? '' : 's'}.`, { type: 'success', duration: 3000 });
        } catch (err) {
          toast(`Export failed: ${err.message}`, { type: 'error' });
        }
      });
      importBtn.addEventListener('click', () => { importFile.value = ''; importFile.click(); });
      importFile.addEventListener('change', async () => {
        const file = importFile.files && importFile.files[0];
        if (!file) return;
        let data = null;
        try { data = JSON.parse(await file.text()); } catch (e) { data = null; }
        const check = checkBackup(data);
        if (!check.ok) { toast(`Not imported: ${check.reason}.`, { type: 'warn' }); return; }
        const when = typeof data.exportedAt === 'string' ? data.exportedAt.slice(0, 10) : 'an unknown date';
        const go = await ui.confirmDialog({
          title: 'Import settings',
          message: `${check.count} settings from ${when}. They replace the ones they name; `
            + 'everything else stays as it is. The page reloads to apply them.',
          confirmLabel: 'Import & reload',
        });
        if (!go) { toast('Import cancelled. Nothing changed.', { duration: 2500 }); return; }
        const res = applyBackup(data);
        if (!res.ok) { toast(`Not imported: ${res.reason}.`, { type: 'warn' }); return; }
        toast(`Imported ${res.count} settings. Reloading…`, { type: 'success', duration: 2000 });
        setTimeout(() => location.reload(), 900);
      });
      for (const el of [exportBtn, importBtn, importFile]) backupRow.appendChild(el);
      backupGroup.appendChild(backupHint);
      backupGroup.appendChild(backupRow);
      paneGeneral.appendChild(backupGroup);

      // ---- reset (settings, separate from "Reset window sizes" above —
      // one resets WHERE/HOW BIG things are, this resets the settings
      // THEMSELVES: number format override, theme, reload behaviour,
      // window-resizing-enabled) ----
      const resetSettingsRow = document.createElement('div');
      resetSettingsRow.style.cssText = 'margin-top:10px; display:flex; justify-content:flex-end;';
      const resetSettingsBtn = document.createElement('button');
      resetSettingsBtn.type = 'button';
      resetSettingsBtn.className = 'awoo-ui-btn';
      resetSettingsBtn.textContent = 'Reset settings to default';
      resetSettingsBtn.title = 'Resets number format, theme, and the toggles above back to default — '
        + 'does NOT touch window positions/sizes (use "Reset window sizes" above for that).';
      resetSettingsBtn.addEventListener('click', () => {
        setNumberLocaleOverride(null);
        for (const key of Object.keys(SETTINGS_DEFAULTS)) setSetting(key, SETTINGS_DEFAULTS[key]);
        for (const fn of syncers) { try { fn(); } catch (e) { console.error('[AwooCore] reset sync', e); } }
        settingsUi.renderNumberFormat();
        toast('Settings reset to default.', { type: 'success', duration: 3000 });
      });
      resetSettingsRow.appendChild(resetSettingsBtn);
      paneGeneral.appendChild(resetSettingsRow);

      // The "more settings are planned, see INSTRUMENTATION.md" note that used
      // to sit here is gone. It was true and it was addressed to whoever
      // maintains this, not to anyone using it -- a user cannot act on a
      // roadmap, and pointing them at a repo file they do not have is worse
      // than silence. The running list lives in REGISTER.md.

      // ==== the Control Panel's own pages (REGISTER.md R69) ====
      //
      // Built from small DOM helpers rather than innerHTML templates: labels
      // come from module and tool declarations, and a label is text, never
      // markup.
      const h = (tag, cls, text) => {
        const e = document.createElement(tag);
        if (cls) e.className = awooCls(cls);
        if (text != null) e.textContent = text;
        return e;
      };
      const btn = (label, onClick, { primary = false, small = false, title = '', disabled = false } = {}) => {
        const b = h('button', 'awoo-ui-btn' + (primary ? ' awoo-ui-btn-primary' : '') + (small ? ' awoo-cp-btn-sm' : ''), label);
        b.type = 'button';
        if (title) b.title = title;
        b.disabled = disabled;
        b.addEventListener('click', (e) => { e.stopPropagation(); onClick(e); });
        return b;
      };
      // A LABELLED PAIR, never a switch (DESIGN.md §9: switches and eye icons
      // "look weird"). The chosen side is filled; `go` tints it green where
      // the choice means "running".
      const pair = (options, value, onPick, { disabled = false } = {}) => {
        const wrap = h('span', 'awoo-cp-seg');
        for (const o of options) {
          const b = h('button', (o.value === value ? 'on' : '') + (o.value === value && o.go ? ' go' : ''), o.label);
          b.type = 'button';
          b.disabled = disabled;
          b.addEventListener('click', (e) => { e.stopPropagation(); if (o.value !== value) onPick(o.value); });
          wrap.appendChild(b);
        }
        return wrap;
      };
      const tick = (checked, onChange, { disabled = false, label = '', title = '' } = {}) => {
        const i = document.createElement('input');
        i.type = 'checkbox';
        i.checked = !!checked;
        i.disabled = disabled;
        if (label) i.setAttribute('aria-label', label);
        if (title) i.title = title;
        i.addEventListener('change', () => onChange(i.checked));
        return i;
      };
      const labelledTick = (text, checked, onChange) => {
        const l = h('label', 'awoo-cp-check');
        l.appendChild(tick(checked, onChange));
        l.appendChild(h('span', null, text));
        return l;
      };
      const sub = (text) => h('div', 'awoo-cp-sub', text);

      // ---- one status vocabulary (DESIGN.md §9; Modules › Info shows it) ----
      // The slot is the same dot the top bar draws; the text is the module's
      // own reading where it has one, because "04:12" is the answer and
      // "running" is only the category.
      function statusOf(mod) {
        if (!mod.enabled) return { slot: 'off', text: 'off', tone: '' };
        if (mod.crashed) return { slot: 'problem', text: 'crashed', tone: 'bad' };
        if (mod.errored) return { slot: 'problem', text: 'error', tone: 'bad' };
        if (mod.saveError) return { slot: 'attention', text: 'can\'t save', tone: 'warn' };
        const s = mod.state || 'idle';
        if (s === 'attention') return { slot: s, text: mod.stateDetail || 'needs you', tone: 'warn' };
        if (s === 'problem') return { slot: s, text: mod.stateDetail || 'problem', tone: 'bad' };
        return { slot: s, text: mod.stateDetail || (s === 'running' ? 'running' : ''), tone: '' };
      }
      function statusDot(slot) {
        const el = h('span', 'awoo-core-sd awoo-core-sd-' + slot);
        if (STATE_GLYPH[slot]) el.textContent = STATE_GLYPH[slot];
        return el;
      }

      // ---- how fresh a Profile Sync section is: Core's one answer ----
      const sectionLabel = (key) => ((PROFILE_CATEGORIES.find((c) => c.id === key) || {}).label) || key;
      const freshness = (key) => profileFreshness(key);
      function usesChips(keys) {
        const wrap = h('span', 'awoo-cp-uses');
        if (!keys || !keys.length) { wrap.appendChild(h('span', 'awoo-cp-chip', 'reads the page')); return wrap; }
        for (const k of keys) {
          const f = freshness(k);
          const c = h('span', 'awoo-cp-chip ' + f.state, sectionLabel(k));
          c.title = `${sectionLabel(k)}: ${f.state === 'ok' ? 'fresh, ' + f.age : f.state === 'stale' ? 'old, ' + f.age : 'never seen. Open that page in the game once.'}`;
          wrap.appendChild(c);
        }
        return wrap;
      }

      // ---- drag and drop, plus Alt+Up/Down on the handle ----
      // One order for the bar and the menu (registry v2). Dropping on a row
      // puts the dragged module where that row was.
      let dragId = null;
      function moveTo(srcId, dstId) {
        if (!srcId || !dstId || srcId === dstId) return;
        const all = orderedIds(Object.keys(modules));
        const from = all.indexOf(srcId);
        const to = all.indexOf(dstId);
        if (from < 0 || to < 0) return;
        all.splice(from, 1);
        all.splice(to, 0, srcId);
        const rest = registry.order.filter((x) => !all.includes(x));
        setOrder(all.concat(rest));
      }
      function wireDrag(row, handle, id, peers) {
        handle.addEventListener('pointerdown', () => { row.draggable = true; });
        row.addEventListener('dragstart', (e) => {
          dragId = id;
          row.classList.add('awoo-m-dragging');
          try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); } catch (err) { /* not all engines */ }
        });
        row.addEventListener('dragend', () => { row.draggable = false; row.classList.remove('awoo-m-dragging'); dragId = null; });
        row.addEventListener('dragover', (e) => {
          if (!dragId || dragId === id || !peers.includes(dragId)) return;
          e.preventDefault();
          row.classList.add('awoo-m-over');
        });
        row.addEventListener('dragleave', () => row.classList.remove('awoo-m-over'));
        row.addEventListener('drop', (e) => {
          e.preventDefault();
          row.classList.remove('awoo-m-over');
          const src = dragId;
          dragId = null;
          moveTo(src, id);
        });
        handle.addEventListener('keydown', (e) => {
          if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
          e.preventDefault();
          const i = peers.indexOf(id);
          const j = e.key === 'ArrowUp' ? i - 1 : i + 1;
          if (j < 0 || j >= peers.length) return;
          moveTo(id, peers[j]);
          const again = paneModules.querySelector(`[data-handle="${id}"]`);
          if (again) again.focus();
        });
      }

      // ---- Modules › Modules ----
      const liveCells = new Map();   // id -> { slot, text }, updated in place between rebuilds
      let modulesSig = '';
      function renderModulesPage(force) {
        const list = orderedIds(Object.keys(modules)).map((id) => modules[id]).filter((m) => m.kind !== 'tweak');
        const grouped = !!getSetting('cpGroupByCategory');
        const condensed = getSetting('cpCondensed') !== false;
        const sig = JSON.stringify([list.map((m) => [m.id, m.enabled, !!m.started, isIn('barHidden', m.id), isIn('menuHidden', m.id), !!m.crashed, !!m.saveError, m.startMs]),
          // NOT barPreview: a rebuild mid-drag would replace the slider under
          // the pointer (a countdown refreshes this page every second).
          grouped, condensed, registry.barMax, getSetting('menuClick')]);
        if (!force && sig === modulesSig) {
          // Only the live readings changed: patch them, keep focus and hover.
          for (const m of list) {
            const cell = liveCells.get(m.id);
            if (!cell) continue;
            const st = statusOf(m);
            cell.slot.className = 'awoo-core-sd awoo-core-sd-' + st.slot;
            cell.slot.textContent = STATE_GLYPH[st.slot] || '';
            cell.text.textContent = st.text ? '· ' + st.text : '';
            cell.text.className = awooCls('awoo-cp-live' + (st.tone ? ' ' + st.tone : ''));
          }
          return;
        }
        modulesSig = sig;
        liveCells.clear();
        const pane = paneModules;
        pane.innerHTML = '';
        pane.appendChild(sub('Loaded modules start with the page; a module that is off does not load at all. '
          + 'Drag to set the order the bar and the menu use.'));

        const opts = h('div', 'awoo-cp-opts');
        opts.appendChild(labelledTick('Group by category', grouped, (v) => { setSetting('cpGroupByCategory', v); renderModulesPage(true); }));
        opts.appendChild(labelledTick('Condensed list', condensed, (v) => { setSetting('cpCondensed', v); renderModulesPage(true); }));
        const loadedMs = list.filter((m) => m.started && Number.isFinite(m.startMs)).reduce((a, m) => a + m.startMs, 0);
        const cost = h('span', 'awoo-cp-cost', `Start time this load: ${Math.round(loadedMs * 10) / 10} ms`);
        cost.title = 'How long the loaded modules took to start when this page loaded. A module that is off costs nothing.';
        opts.appendChild(cost);
        pane.appendChild(opts);

        const table = h('table', 'awoo-cp-table');
        const head = h('thead');
        const r1 = h('tr');
        const th = (text, cls, attrs = {}) => { const c = h('th', cls, text); for (const k of Object.keys(attrs)) c.setAttribute(k, attrs[k]); return c; };
        r1.appendChild(th('', 'awoo-cp-hcol', { rowspan: '2' }));
        r1.appendChild(th('Module', '', { rowspan: '2' }));
        r1.appendChild(th('Loaded', 'c', { rowspan: '2' }));
        r1.appendChild(th('Shown in', 'c grp', { colspan: '2' }));
        r1.appendChild(th('Start', 'n awoo-cp-startcol', { rowspan: '2' }));
        r1.appendChild(th('', '', { rowspan: '2' }));
        // Menu before Bar (2026-09-25): every module can be in the menu, only
        // a loaded one with a window can be on the bar, so the column that
        // always applies comes first.
        const r2 = h('tr');
        r2.appendChild(th('Menu', 'c'));
        r2.appendChild(th('Bar', 'c'));
        head.appendChild(r1);
        head.appendChild(r2);
        table.appendChild(head);
        const body = h('tbody');
        const groups = grouped ? [...new Set(list.map((m) => m.category || 'Other'))] : [null];
        for (const g of groups) {
          const members = list.filter((m) => g === null || (m.category || 'Other') === g);
          if (g !== null) {
            const gr = h('tr', 'awoo-cp-grouprow');
            const gc = h('td', null, `${g} · ${members.filter((m) => m.enabled).length} of ${members.length} loaded`);
            gc.colSpan = 7;
            gr.appendChild(gc);
            body.appendChild(gr);
          }
          const peers = members.map((m) => m.id);
          for (const m of members) body.appendChild(moduleRow(m, peers, condensed));
        }
        table.appendChild(body);
        const wrap = h('div', 'awoo-cp-tablewrap');
        wrap.appendChild(table);
        pane.appendChild(wrap);

        // The click setting lives here, beside what it acts on.
        const clickRow = ui.inputRow({
          label: 'Clicking a module in the menu', type: 'select', value: getSetting('menuClick') === 'window' ? 'window' : 'load',
          options: [{ value: 'load', label: 'Loads or unloads it' }, { value: 'window', label: 'Only opens its window' }],
          info: 'Load/unload is the default: the menu is where modules you do not always need are switched on. '
            + '"Only opens its window" never stops a module from the menu; unload it here instead.',
          onChange: (v) => { setSetting('menuClick', v === 'window' ? 'window' : 'load'); if (coreUi) renderDropdown(); },
        });
        pane.appendChild(clickRow);

        pane.appendChild(topBarBox());

        const actions = h('div', 'awoo-ui-actionrow');
        actions.appendChild(btn('Unload all…', async () => {
          const on = Object.values(modules).filter((m) => m.enabled);
          if (!on.length) { toast('Nothing is loaded.', { type: 'info', duration: 2500 }); return; }
          const ok = await ui.confirmDialog({
            title: 'Unload every module',
            message: 'This stops, and saves first:\n' + on.map((m) => '  • ' + m.label).join('\n')
              + '\n\nAn alarm that is running stops too. Load them again here or from the menu.',
            confirmLabel: 'Unload all',
          });
          if (ok) disableAll();
        }));
        pane.appendChild(actions);
      }
      function moduleRow(m, peers, condensed) {
        const row = h('tr', m.enabled ? '' : 'dim');
        row.dataset.row = m.id;
        const hc = h('td', 'awoo-cp-hcol');
        const handle = h('button', 'awoo-cp-handle', '⋮⋮');
        handle.type = 'button';
        handle.dataset.handle = m.id;
        handle.title = 'Drag to reorder (Alt+Up / Alt+Down)';
        hc.appendChild(handle);
        row.appendChild(hc);
        wireDrag(row, handle, m.id, peers);

        const nc = h('td');
        const line = h('div', 'awoo-cp-name');
        const st = statusOf(m);
        const slot = statusDot(st.slot);
        line.appendChild(slot);
        line.appendChild(h('span', 'awoo-cp-label', m.label));
        if (!getSetting('cpGroupByCategory')) line.appendChild(h('span', 'awoo-cp-cat', m.category || 'Other'));
        const live = h('span', 'awoo-cp-live' + (st.tone ? ' ' + st.tone : ''), st.text ? '· ' + st.text : '');
        line.appendChild(live);
        liveCells.set(m.id, { slot, text: live });
        nc.appendChild(line);
        if (!condensed) {
          if (m.description) nc.appendChild(h('div', 'awoo-cp-desc', m.description));
          nc.appendChild(usesChips(m.uses));
        }
        if (m.lifecycle < 2) {
          const w = h('div', 'awoo-cp-desc warn', 'Older module: it runs even while off. Update AWOO+ Extras.');
          nc.appendChild(w);
        }
        row.appendChild(nc);

        const lc = h('td', 'c');
        lc.appendChild(pair([{ value: true, label: 'Load', go: true }, { value: false, label: 'Off' }], !!m.enabled,
          (v) => setEnabled(m.id, v)));
        row.appendChild(lc);
        const hasWindow = m.quickButton !== false;
        const mc = h('td', 'c');
        mc.appendChild(tick(!isIn('menuHidden', m.id), (v) => setShown(m.id, 'menu', v), { label: `Show ${m.label} in the menu` }));
        row.appendChild(mc);
        const bc = h('td', 'c');
        bc.appendChild(tick(!isIn('barHidden', m.id), (v) => setShown(m.id, 'bar', v), {
          disabled: !m.enabled || !hasWindow, label: `Show ${m.label} on the top bar`,
          title: !hasWindow ? 'No window, so no top-bar button' : !m.enabled ? 'Load it first' : '',
        }));
        row.appendChild(bc);
        const sc = h('td', 'n awoo-cp-startcol', m.started && Number.isFinite(m.startMs) ? `${m.startMs} ms` : '—');
        row.appendChild(sc);
        const gc = h('td', 'c');
        const gear = h('button', 'awoo-cp-gear', '⚙');
        gear.type = 'button';
        gear.title = `${m.label} settings`;
        gear.addEventListener('click', (e) => { e.stopPropagation(); selectPageByIdLazily('m:' + m.id, 'main'); });
        gc.appendChild(gear);
        row.appendChild(gc);
        return row;
      }
      // THE TOP BAR, previewed while the cap is dragged: the real bar fills
      // with placeholder buttons at their real size, so "how many fit" is
      // answered by looking, not by guessing. Applied on release.
      function topBarBox() {
        const box = h('div', 'awoo-ui-group');
        const lab = h('div', 'awoo-ui-group-label', 'Top bar');
        box.appendChild(lab);
        const used = Object.values(modules).filter((m) => m.enabled && m.quickButton !== false && m.kind !== 'tweak' && !isIn('barHidden', m.id)).length;
        const row = h('div', 'awoo-cp-slider');
        row.appendChild(h('span', 'awoo-cp-sub', 'Max buttons'));
        const input = document.createElement('input');
        input.type = 'range';
        input.min = String(AWOO_CORE_BAR_MAX_RANGE[0]);
        input.max = String(AWOO_CORE_BAR_MAX_RANGE[1]);
        input.value = String(barPreview !== null ? barPreview : registry.barMax);
        input.setAttribute('aria-label', 'Maximum top-bar buttons');
        const val = h('b', 'awoo-cp-sliderval', input.value);
        input.addEventListener('input', () => { val.textContent = input.value; previewBarMax(Number(input.value)); });
        input.addEventListener('change', () => { previewBarMax(null); setBarMax(Number(input.value)); });
        row.appendChild(input);
        row.appendChild(val);
        box.appendChild(row);
        box.appendChild(sub(`${Math.min(used, registry.barMax)} of ${registry.barMax} used. Drag to preview the buttons on the real bar; `
          + 'modules past the limit are still in the menu.'));
        return box;
      }
      paneModules._refresh = (force) => renderModulesPage(!!force);
      // Every other page redraws whole, so it does so only when its signature
      // changes (or when it is opened).
      let lastSideSig = '';
      function refreshWhen(pane, sigFn, render) {
        let last = null;
        pane._refresh = (force) => {
          const sig = sigFn();
          if (!force && sig === last) return;
          last = sig;
          render();
        };
      }

      // ---- Modules › Tools ----
      function renderToolsPage() {
        const pane = paneTools;
        pane.innerHTML = '';
        pane.appendChild(sub('Calculators and references that open in a new tab. Nothing runs until you open one, '
          + 'so the only choice is whether it is in the menu. The chips are what it fills in from Profile Sync, and how fresh that is.'));
        const condensedTools = getSetting('cpToolsCondensed') !== false;
        const topts = h('div', 'awoo-cp-opts');
        topts.appendChild(labelledTick('Condensed list', condensedTools, (v) => { setSetting('cpToolsCondensed', v); renderToolsPage(); }));
        pane.appendChild(topts);
        const table = h('table', 'awoo-cp-table');
        const head = h('tr');
        for (const [t, c] of [['Tool', ''], ['Fills in from your profile', ''], ['Menu', 'c'], ['', 'n']]) head.appendChild(h('th', c, t));
        const thead = h('thead');
        thead.appendChild(head);
        table.appendChild(thead);
        const body = h('tbody');
        const ids = orderedIds(Object.keys(tools));
        for (const id of ids) {
          const t = tools[id];
          const row = h('tr', isIn('toolMenuHidden', id) ? 'dim' : '');
          const nc = h('td');
          nc.appendChild(h('div', 'awoo-cp-label', t.label));
          if (t.description && !condensedTools) nc.appendChild(h('div', 'awoo-cp-desc', t.description));
          row.appendChild(nc);
          const uc = h('td');
          uc.appendChild(usesChips(t.uses));
          row.appendChild(uc);
          const mc = h('td', 'c');
          mc.appendChild(tick(!isIn('toolMenuHidden', id), (v) => setShown(id, 'menu', v), { label: `Show ${t.label} in the menu` }));
          row.appendChild(mc);
          const oc = h('td', 'n');
          oc.appendChild(btn('Open', () => openTool(id), { small: true }));
          row.appendChild(oc);
          body.appendChild(row);
        }
        // A tool a module carries does not exist while its module is off.
        // Say so, rather than letting it silently vanish from the list.
        for (const m of Object.values(modules)) {
          for (const ct of (m.carriedTools || [])) {
            if (tools[ct.id]) continue;
            const row = h('tr', 'dim');
            const nc = h('td');
            nc.appendChild(h('div', 'awoo-cp-label', ct.label));
            nc.appendChild(h('div', 'awoo-cp-desc', `Comes with ${m.label}, which is off.`));
            row.appendChild(nc);
            row.appendChild(h('td'));
            row.appendChild(h('td'));
            const oc = h('td', 'n');
            oc.appendChild(btn(`Load ${m.shortLabel || m.label}`, () => setEnabled(m.id, true), { small: true }));
            row.appendChild(oc);
            body.appendChild(row);
          }
        }
        table.appendChild(body);
        const wrap = h('div', 'awoo-cp-tablewrap');
        wrap.appendChild(table);
        pane.appendChild(wrap);
        if (!ids.length) pane.appendChild(sub('No tools are installed.'));
      }
      refreshWhen(paneTools, () => JSON.stringify([Object.keys(tools), registry.toolMenuHidden, getSetting('cpToolsCondensed'),
        Object.values(modules).map((m) => m.enabled), (getProfile() || { meta: {} }).meta.timestamp]), renderToolsPage);

      // ---- Modules › Tweaks ----
      const tweakOpen = new Set();
      function renderTweaksPage() {
        const pane = paneTweaks;
        pane.innerHTML = '';
        pane.appendChild(sub('Small improvements to the game\'s own pages. Each is one switch, and its settings live on its card.'));
        const list = orderedIds(Object.keys(modules)).map((id) => modules[id]).filter((m) => m.kind === 'tweak');
        for (const m of list) {
          const card = h('div', 'awoo-cp-card');
          const top = h('div', 'awoo-cp-cardhead');
          const txt = h('div');
          const nm = h('div', 'awoo-cp-name');
          nm.appendChild(statusDot(statusOf(m).slot));
          nm.appendChild(h('span', 'awoo-cp-label', m.label));
          txt.appendChild(nm);
          if (m.description) txt.appendChild(h('div', 'awoo-cp-desc', m.description));
          top.appendChild(txt);
          const hasSettings = m.settings && typeof m.settings.render === 'function';
          if (hasSettings) {
            top.appendChild(btn(tweakOpen.has(m.id) ? 'Hide settings' : 'Settings', () => {
              if (tweakOpen.has(m.id)) tweakOpen.delete(m.id); else tweakOpen.add(m.id);
              renderTweaksPage();
            }, { small: true }));
          }
          top.appendChild(pair([{ value: true, label: 'On', go: true }, { value: false, label: 'Off' }], !!m.enabled,
            (v) => setEnabled(m.id, v)));
          card.appendChild(top);
          if (hasSettings && tweakOpen.has(m.id)) {
            const bodyEl = h('div', 'awoo-cp-cardbody');
            try { m.settings.render(bodyEl); } catch (e) { bodyEl.textContent = 'Its settings could not be shown.'; }
            // The same Defaults button a module page has (below).
            if (typeof m.settings.reset === 'function') {
              const d = h('div', 'awoo-ui-actionrow');
              d.appendChild(btn('Defaults', () => {
                try { m.settings.reset(); } catch (e) { console.error('[AwooCore] settings reset for ' + m.id + ' threw', e); return; }
                renderTweaksPage();
                toast(`${m.label}: settings back to defaults.`, { type: 'success', duration: 3000 });
              }, { small: true }));
              bodyEl.appendChild(d);
            }
            card.appendChild(bodyEl);
          }
          pane.appendChild(card);
        }
        if (!list.length) pane.appendChild(sub('No tweaks are installed.'));
      }
      refreshWhen(paneTweaks, () => JSON.stringify([Object.values(modules).filter((m) => m.kind === 'tweak')
        .map((m) => [m.id, m.enabled, !!m.started, m.state]), [...tweakOpen]]), renderTweaksPage);

      // ---- Modules › Info: the status vocabulary, drawn with the real parts ----
      (function renderInfoPage() {
        const pane = paneInfo;
        pane.appendChild(sub('What each mark means. The menu, the top bar and this panel all draw them the same way.'));
        const rows = [
          ['off', 'Off', 'Not loaded. Nothing of it runs, and it costs nothing.'],
          ['idle', 'Idle', 'Loaded and waiting.'],
          ['running', 'Running', 'Doing something; its reading shows beside it (a countdown, a rate).'],
          ['attention', 'Needs you', 'It wants you to look: an alarm, a plan ready to review, a save that failed.'],
          ['problem', 'Problem', 'It reports something wrong, and its window says what. "Crashed" means AWOO+ caught an error from it: see General › Diagnostics.'],
        ];
        const grid = h('div', 'awoo-cp-legend');
        for (const [slot, name, what] of rows) {
          const a = h('div', 'awoo-cp-name');
          a.appendChild(statusDot(slot));
          a.appendChild(h('span', 'awoo-cp-label', name));
          grid.appendChild(a);
          grid.appendChild(h('div', 'awoo-cp-desc', what));
        }
        pane.appendChild(grid);
        category(pane, 'Three separate choices per module');
        const how = h('div', 'awoo-cp-legend');
        for (const [a, b] of [
          ['Load', 'Whether it starts with the page. Off means it never starts; what it saved is kept.'],
          ['Shown in: Menu', 'Whether it is listed in the AWOO+ menu.'],
          ['Shown in: Bar', 'Whether a loaded module has a top-bar button. Hiding it never stops it.'],
          ['Tweaks', 'Changes to the game\'s own pages, with no window: one switch each, under Modules › Tweaks.'],
          ['Tools', 'Pages that open in a new tab. Nothing runs until you open one.'],
        ]) {
          how.appendChild(h('div', 'awoo-cp-label', a));
          how.appendChild(h('div', 'awoo-cp-desc', b));
        }
        pane.appendChild(how);
      })();

      // ---- General › Profile Sync ----
      function renderSyncPage() {
        const host = syncHost;
        host.innerHTML = '';
        host.appendChild(sub('A read-only snapshot of your character, captured from the game\'s own data as you play. '
          + 'Modules and tools use it so you do not have to type your numbers in. It never acts on your account.'));
        const p = getProfile();
        const ts = p && p.meta && p.meta.timestamp;
        const banner = h('div', 'awoo-cp-banner ' + (p ? 'ok' : ''));
        // One rule for "old" everywhere (profileSummary): only what a loaded
        // module uses; old data nothing loaded reads is counted apart.
        const sum = profileSummary();
        const counts = sum.counts;
        const status = profileSyncStatus();
        banner.appendChild(statusDot(p ? 'running' : 'off'));
        const bt = h('div');
        bt.appendChild(h('b', null, p ? `Synced ${formatTimeAgo(ts)}` : 'Not synced yet'));
        bt.appendChild(h('div', 'awoo-cp-desc', `${counts.ok} of ${PROFILE_CATEGORIES.length} sections fresh`
          + (counts.stale ? `, ${counts.stale} old` : '') + (counts.unused ? `, ${counts.unused} old but unused` : '')
          + (counts.miss ? `, ${counts.miss} not seen yet` : '')
          + (getSetting('profileAutoSync') ? '' : ' · automatic sync is off')));
        // What the sync layer itself did (R92): short, the why on hover.
        const bg = profileBackgroundLine(status);
        const bgLine = h('div', 'awoo-cp-desc', bg.text);
        bgLine.setAttribute('data-tooltip', bg.tip);
        if (bg.dev) bgLine.setAttribute('data-tooltip-dev', bg.dev);
        bt.appendChild(bgLine);
        banner.appendChild(bt);
        const acts = h('span', 'awoo-cp-bannerright');
        acts.appendChild(btn('Sync now', () => { resyncProfile(); toast('Requested profile sync…', { type: 'info', duration: 2500 }); },
          { primary: true, small: true, title: 'Asks the game for every section now, as opening each page would (not with Background reads off).' }));
        acts.appendChild(btn('Copy JSON', async () => {
          const ok = await copyTextToClipboard(JSON.stringify(getProfile(), null, 2));
          toast(ok ? 'Profile copied.' : 'Could not copy automatically.', { type: ok ? 'success' : 'warn', duration: 2500 });
        }, { small: true, disabled: !p }));
        banner.appendChild(acts);
        host.appendChild(banner);

        const table = h('table', 'awoo-cp-table');
        const thead = h('thead');
        const hr = h('tr');
        for (const [t, c] of [['Section', ''], ['Last seen', 'n'], ['Kept', ''], ['Used by', '']]) hr.appendChild(h('th', c, t));
        thead.appendChild(hr);
        table.appendChild(thead);
        const body = h('tbody');
        const seenOn = (p && p.meta && p.meta.observedOn) || {};
        const keptCtx = {
          used: sum.used,
          toolUsed: new Set(Object.values(tools).flatMap((t) => t.uses || [])),
          status,
          catalogue: profileCatalogue(),
          partyId: p && p.meta ? p.meta.partyId : undefined,
        };
        for (const c of PROFILE_CATEGORIES) {
          const f = profileSectionState(c.id, p, sum.used);
          const row = h('tr');
          row.dataset.section = c.id;
          const name = h('td', 'awoo-cp-label', c.label);
          // What the section holds, and where it was last read. How it is
          // kept, and the game queries behind it, are the Kept cell's.
          name.setAttribute('data-tooltip', `${c.what || c.label}.`
            + (seenOn[c.id] ? ` Last read on ${seenOn[c.id]}.` : f.state === 'miss' ? ' Not read yet.' : ''));
          row.appendChild(name);
          // An unknown age is not an alarm: it is data kept from before AWOO+
          // stamped each section. Plain muted text, not a warning colour. Nor
          // is old data no loaded module uses (R92): muted, "old · unused".
          const unknown = (f.state === 'stale' || f.state === 'unused') && !f.at;
          row.appendChild(h('td', 'n ' + (f.state === 'ok' ? 'good' : unknown ? 'dimtext' : f.state === 'stale' ? 'warn' : 'dimtext'),
            f.state === 'miss' ? 'never seen' : unknown ? 'seen, age unknown'
              : f.age + (f.state === 'stale' ? ' · old' : f.state === 'unused' ? ' · old · unused' : '')));
          const kept = profileKept(c.id, keptCtx);
          const kc = h('td', null, kept.label);
          kc.setAttribute('data-tooltip', kept.tip);
          kc.setAttribute('data-tooltip-dev', kept.dev);
          row.appendChild(kc);
          const users = [
            ...Object.values(modules).filter((m) => (m.uses || []).includes(c.id)).map((m) => m.label),
            ...Object.values(tools).filter((t) => (t.uses || []).includes(c.id)).map((t) => t.label),
          ];
          row.appendChild(h('td', 'awoo-cp-desc', users.length ? users.join(', ') : 'nothing yet'));
          body.appendChild(row);
        }
        table.appendChild(body);
        const wrap = h('div', 'awoo-cp-tablewrap');
        wrap.appendChild(table);
        host.appendChild(wrap);
        // The old footer told the player to open each page to bring a section
        // up to date, which R92 made untrue for everything a module uses.
        host.appendChild(sub('A section counts as old after 6 hours, the same window the tools use. '
          + 'Kept says how each one stays current without you opening its page. '
          + 'Old data that no loaded module uses is dimmed, and does not turn the top-bar light amber.'));
        host.appendChild(labelledTick('Show Profile Sync on the top bar', registry.profileOnBar !== false, (v) => setProfileOnBar(v)));
      }
      // Redrawn when what it shows moved: the profile, the switches, what is
      // loaded, open or started, and what the sync layer did (not its clocks,
      // which would redraw it on every refresh).
      refreshWhen(paneSync, () => {
        const st = profileSyncStatus();
        return JSON.stringify([(getProfile() || { meta: {} }).meta.timestamp, getSetting('profileAutoSync'), getSetting('profileWatch'),
          registry.profileOnBar, Object.keys(tools), Object.values(modules).map((m) => [m.enabled, !!m.started, !!m.open]),
          st ? [st.background, st.leader, st.otherLeader, st.readsLastHour, st.holds] : null]);
      }, renderSyncPage);

      // ---- General › Updates (R56: say whether updates exist, and that a check ran) ----
      const notesOpen = new Set();
      let lastManualCheck = null;
      function renderUpdatesPage() {
        const pane = paneUpdates;
        pane.innerHTML = '';
        pane.appendChild(sub('AWOO+ finds updates; Tampermonkey installs them. Install opens Tampermonkey\'s install page; reload the game tab afterwards.'));
        const n = updateState.available.length;
        const banner = h('div', 'awoo-cp-banner');
        let title = '';
        let detail = '';
        if (!RELEASE.manifestUrl) {
          banner.classList.add('awoo-m-muted');
          banner.appendChild(statusDot('off'));
          title = 'Dev build: update checks are off';
          detail = 'This copy loads from disk through the dev proxy. Rebuild and refresh to update.';
        } else if (updateState.checking) {
          banner.appendChild(statusDot('running'));
          title = 'Checking…';
          detail = 'Fetching the release list.';
        } else if (updateState.error) {
          banner.classList.add('awoo-m-bad');
          banner.appendChild(statusDot('problem'));
          title = 'Could not reach the update server';
          detail = `"${updateState.error}". AWOO+ tries again in 15 minutes and will not pop up about it.`;
        } else if (n) {
          banner.classList.add('awoo-m-warn');
          banner.appendChild(statusDot('attention'));
          title = `${n} update${n === 1 ? '' : 's'} available`;
          detail = updateState.checkedAt ? `Checked ${formatTimeAgo(updateState.checkedAt)}. AWOO+ checks every 2 hours while the game is open.` : '';
        } else if (updateState.checkedAt) {
          banner.classList.add('awoo-m-ok');
          banner.appendChild(statusDot('running'));
          title = 'Everything is up to date';
          detail = `Checked ${formatTimeAgo(updateState.checkedAt)}${lastManualCheck && Date.now() - lastManualCheck < 60000 ? ' (just now, as you asked)' : ''}. AWOO+ checks every 2 hours while the game is open.`;
        } else {
          banner.appendChild(statusDot('idle'));
          title = 'Not checked yet this session';
          detail = 'The first check runs about 30 seconds after the page loads.';
        }
        const bt = h('div');
        bt.appendChild(h('b', null, title));
        if (detail) bt.appendChild(h('div', 'awoo-cp-desc', detail));
        banner.appendChild(bt);
        if (RELEASE.manifestUrl) {
          const r = h('span', 'awoo-cp-bannerright');
          r.appendChild(btn(updateState.checking ? 'Checking…' : 'Check now', () => {
            lastManualCheck = Date.now();
            checkForUpdates(true).then(() => renderUpdatesPage());
            renderUpdatesPage();
          }, { small: true, disabled: updateState.checking }));
          banner.appendChild(r);
        }
        pane.appendChild(banner);

        const table = h('table', 'awoo-cp-table');
        const thead = h('thead');
        const hr = h('tr');
        for (const [t, c] of [['Script', ''], ['Installed', 'n'], ['Available', 'n'], ['', 'n']]) hr.appendChild(h('th', c, t));
        thead.appendChild(hr);
        table.appendChild(thead);
        const body = h('tbody');
        const rows = [{ id: 'awoo-core', label: 'AWOO+', sub: 'The menu, this Control Panel, Profile Sync and the public tools', have: RELEASE.version }];
        if (window.__awooExtras && window.__awooExtras.version) {
          rows.push({ id: 'awoo-extras', label: 'AWOO+ Extras', sub: 'The modules and tools shared with you', have: window.__awooExtras.version });
        }
        for (const e of updateState.available) if (!rows.some((r) => r.id === e.id)) rows.push({ id: e.id, label: e.label, sub: '', have: e.from });
        for (const r of rows) {
          const e = updateState.available.find((x) => x.id === r.id);
          const row = h('tr');
          const nc = h('td');
          nc.appendChild(h('div', 'awoo-cp-label', r.label));
          if (r.sub) nc.appendChild(h('div', 'awoo-cp-desc', r.sub));
          if (e && e.notes && notesOpen.has(r.id)) nc.appendChild(h('div', 'awoo-cp-notes', e.notes));
          row.appendChild(nc);
          row.appendChild(h('td', 'n', r.have || '—'));
          row.appendChild(h('td', 'n ' + (e ? 'warn' : 'good'), e ? e.to : (RELEASE.manifestUrl && updateState.checkedAt ? 'up to date' : '—')));
          const ac = h('td', 'n');
          if (e) {
            if (e.notes) {
              ac.appendChild(btn(notesOpen.has(r.id) ? 'Hide' : 'What\'s new', () => {
                if (notesOpen.has(r.id)) notesOpen.delete(r.id); else notesOpen.add(r.id);
                renderUpdatesPage();
              }, { small: true }));
            }
            ac.appendChild(btn('Install', () => openUpdate(e), { small: true, primary: true }));
          }
          row.appendChild(ac);
          body.appendChild(row);
        }
        table.appendChild(body);
        const wrap = h('div', 'awoo-cp-tablewrap');
        wrap.appendChild(table);
        pane.appendChild(wrap);

        const checks = h('div', 'awoo-cp-desc');
        const needs = Object.keys(incompatible);
        const twice = Object.keys(duplicates);
        checks.textContent = [
          needs.length ? `Needs a newer AWOO+: ${needs.map((id) => incompatible[id].label).join(', ')}.` : 'No module needs a newer AWOO+.',
          twice.length ? `Installed twice (delete the older copy in Tampermonkey): ${twice.map((id) => (modules[id] && modules[id].label) || id).join(', ')}.` : 'Nothing is installed twice.',
        ].join(' ');
        pane.appendChild(checks);

        category(pane, 'Checking');
        pane.appendChild(ui.inputRow({
          label: 'Check for updates', type: 'select', value: ['auto', 'load', 'manual'].includes(getSetting('updateEvery')) ? getSetting('updateEvery') : 'auto',
          options: [{ value: 'auto', label: 'Every 2 hours' }, { value: 'load', label: 'Once per page load' }, { value: 'manual', label: 'Only when I ask' }],
          info: 'One small request to the release list. Installing is always your click, in Tampermonkey.',
          onChange: (v) => { setSetting('updateEvery', v); },
        }));
        pane.appendChild(labelledTick('Show a notice when an update is found', getSetting('updateNotice') !== false,
          (v) => setSetting('updateNotice', v)));
      }
      refreshWhen(paneUpdates, () => JSON.stringify([updateState.checking, updateState.error, updateState.checkedAt,
        updateState.available.map((e) => e.id + e.to), [...notesOpen], Object.keys(incompatible), Object.keys(duplicates)]), renderUpdatesPage);

      // ---- General › Changelog: what changed in AWOO+, newest first ----
      // Static for the life of the script, so drawn once, when first opened.
      paneChangelog._render = () => {
        const pane = paneChangelog;
        pane.appendChild(sub(`What changed in AWOO+, newest first. You have v${RELEASE.version}.`));
        if (!CHANGELOG.length) { pane.appendChild(sub('No changelog in this build.')); return; }
        for (const e of CHANGELOG) {
          const next = /^next update$/i.test(e.title);
          const head = category(pane, next ? 'Next update' : e.title);
          if (e.date && head) head.appendChild(h('span', 'awoo-cp-logdate', e.date));
          if (next) pane.appendChild(sub('Finished, and on its way in the next update.'));
          const ul = h('ul', 'awoo-cp-changes');
          for (const l of e.lines) ul.appendChild(h('li', null, l));
          pane.appendChild(ul);
        }
      };

      // ---- General › Diagnostics ----
      function renderDiagPage() {
        const pane = paneDiag;
        pane.innerHTML = '';
        pane.appendChild(sub('What is loaded, what it costs, and what went wrong. Nothing leaves this page unless you copy it, '
          + 'apart from the daily check-in described below.'));
        const d = diagnostics.peek();
        const errs = d.errors || [];
        const banner = h('div', 'awoo-cp-banner ' + (errs.length ? 'warn' : 'ok'));
        banner.appendChild(statusDot(errs.length ? 'attention' : 'running'));
        const bt = h('div');
        bt.appendChild(h('b', null, errs.length ? `${errs.length} error${errs.length === 1 ? '' : 's'} since the last check-in` : 'No errors since the last check-in'));
        bt.appendChild(h('div', 'awoo-cp-desc', errs.length ? 'Each was caught; nothing else stopped because of it.' : 'Everything that ran, ran cleanly.'));
        banner.appendChild(bt);
        const r = h('span', 'awoo-cp-bannerright');
        r.appendChild(btn('Copy debug info', async () => {
          const ok = await copyTextToClipboard(window.__awooDiag ? window.__awooDiag() : '');
          toast(ok ? 'Debug info copied: paste it into chat.' : 'Could not copy automatically: it is in the console (F12) instead.',
            { type: ok ? 'success' : 'warn', duration: 3500 });
        }, { primary: true, small: true }));
        banner.appendChild(r);
        pane.appendChild(banner);

        const table = h('table', 'awoo-cp-table');
        const thead = h('thead');
        const hr = h('tr');
        for (const [t, c] of [['Module', ''], ['Version', 'n'], ['State', ''], ['Start', 'n'], ['Holding', 'n'], ['Errors', 'n']]) hr.appendChild(h('th', c, t));
        thead.appendChild(hr);
        table.appendChild(thead);
        const body = h('tbody');
        for (const info of listModules()) {
          const m = modules[info.id];
          const row = h('tr', info.loaded ? '' : 'dim');
          const nc = h('td');
          const nm = h('div', 'awoo-cp-name');
          nm.appendChild(statusDot(statusOf(m).slot));
          nm.appendChild(h('span', 'awoo-cp-label', info.label));
          nc.appendChild(nm);
          row.appendChild(nc);
          row.appendChild(h('td', 'n', info.version || '—'));
          const state = info.lifecycle < 2 ? (info.loaded ? 'loaded' : 'off, still running (older module)')
            : !info.loaded ? 'off, not loaded' : info.crashed ? 'crashed' : info.started ? 'running' : 'waiting for the page';
          row.appendChild(h('td', info.crashed ? 'bad' : '', state + (info.saveError ? ' · can\'t save' : '')));
          row.appendChild(h('td', 'n', info.started && info.startMs !== null ? `${info.startMs} ms` : '—'));
          const held = info.held;
          const holding = h('td', 'n', held ? `${held.listeners + held.observers + held.intervals}` : '—');
          if (held) holding.title = `${held.listeners} listeners, ${held.observers} observers, ${held.intervals} intervals, ${held.windows} window(s)`;
          row.appendChild(holding);
          const n = errs.filter((e) => e.m === info.id).length;
          row.appendChild(h('td', 'n' + (n ? ' warn' : ''), String(n)));
          body.appendChild(row);
        }
        table.appendChild(body);
        const wrap = h('div', 'awoo-cp-tablewrap');
        wrap.appendChild(table);
        pane.appendChild(wrap);

        category(pane, 'This install');
        const facts = h('div', 'awoo-cp-legend');
        const fact = (k, v) => { facts.appendChild(h('div', 'awoo-cp-desc', k)); facts.appendChild(h('div', null, v)); };
        fact('AWOO+', `${RELEASE.version} · ${RELEASE.channel}${RELEASE.channel === 'dev'
          ? ' (loaded from disk: rebuild and refresh to change it)' : ' (installed: a reload does not update it)'} · API v${AWOO_CORE_VERSION}`);
        if (window.__awooExtras && window.__awooExtras.version) fact('AWOO+ Extras', `${window.__awooExtras.version}${window.__awooExtras.pack ? ' · ' + window.__awooExtras.pack : ''}`);
        const grp = document.getElementById('awoo-core-group');
        fact('Menu', !grp ? 'not built' : grp.classList.contains('awoo-core-floating') ? 'floating (the game\'s nav bar was not found)' : 'in the nav bar');
        const conv = getConvention();
        const convFrom = { setting: 'your game setting', remembered: 'your game setting, as last read', sample: 'a number on the page',
          browser: 'your browser', override: 'your choice' }[conv.source] || conv.source;
        fact('Number format', `1${conv.group}234${conv.decimal}5 · from ${convFrom}`);
        const prof = getProfile();
        fact('Profile Sync', prof && prof.meta ? `${prof.meta.source || 'unknown source'} · ${formatTimeAgo(prof.meta.timestamp)}` : 'nothing synced yet');
        const store = storageUse();
        fact('Storage', `${fmtKB(store.total)} of this site's browser storage`
          + (store.groups.length ? ' · ' + store.groups.slice(0, 4).map((g) => `${g.label} ${fmtKB(g.bytes)}`).join(', ') : ''));
        pane.appendChild(facts);

        category(pane, 'Recent errors');
        if (errs.length) {
          const log = h('pre', 'awoo-cp-log');
          log.textContent = errs.map((e) => `${(modules[e.m] && modules[e.m].label) || e.m} ${e.v || ''}  ${e.msg}`).join('\n');
          pane.appendChild(log);
          pane.appendChild(sub('The last ten are kept; the same error is not stored twice. They are sent with the next check-in, then cleared.'));
          const clear = h('div', 'awoo-ui-actionrow');
          clear.appendChild(btn('Clear the list', () => { diagnostics.take(); renderDiagPage(); }, { small: true }));
          pane.appendChild(clear);
        } else {
          pane.appendChild(sub('None.'));
        }
        category(pane, 'Check-in');
        const ci = publicApi.checkin && typeof publicApi.checkin.status === 'function' ? publicApi.checkin.status() : null;
        pane.appendChild(sub('Twice a day AWOO+ sends: character name, village, install and browser info, versions and errors. '
          + 'Never inventory, currencies or login details.'
          + (!ci ? '' : !ci.enabled ? ' This build sends nothing (a dev build has no address to send to).'
            : ci.sentAt ? ` Last sent ${formatTimeAgo(ci.sentAt)}; the next goes after ${new Date(ci.dueAt).toLocaleString()}.`
              : ' Not sent yet: it goes once your character name has been read.')));
      }
      // Bytes this script's keys take in the site's storage (UTF-16: two per
      // character), grouped by owner so "what is filling it" has an answer.
      function storageUse() {
        const groups = {};
        let total = 0;
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k || !k.startsWith('awoo:')) continue;
            const bytes = (k.length + (localStorage.getItem(k) || '').length) * 2;
            total += bytes;
            const owner = k.split(':')[1] || 'other';
            const label = owner === 'profile' ? 'Profile Sync' : owner === 'core' ? 'AWOO+ settings'
              : (modules[owner] && modules[owner].label) || owner;
            groups[label] = (groups[label] || 0) + bytes;
          }
        } catch (e) { /* storage blocked: nothing to count */ }
        return { total, groups: Object.keys(groups).map((label) => ({ label, bytes: groups[label] })).sort((a, b) => b.bytes - a.bytes) };
      }
      const fmtKB = (b) => (b < 1024 ? `${b} B` : `${Math.round(b / 102.4) / 10} KB`);
      refreshWhen(paneDiag, () => JSON.stringify([diagnostics.peek().errors.length,
        Object.values(modules).map((m) => [m.id, m.enabled, !!m.started, !!m.crashed, !!m.saveError, m.startMs])]), renderDiagPage);

      // ---- Appearance › Layout: the sidebar style ----
      const navRow = ui.inputRow({
        label: 'Sidebar', type: 'select', value: getSetting('panelNav') === 'tree' ? 'tree' : 'tabs',
        options: [{ value: 'tabs', label: 'Sections, with tabs in the page' }, { value: 'tree', label: 'Expandable list' }],
        info: 'How this Control Panel is navigated. Sections keeps the sidebar short; the expandable list shows every page in the sidebar.',
        onChange: (v) => { setSetting('panelNav', v === 'tree' ? 'tree' : 'tabs'); renderSide(); renderTabs(); },
      });
      onReset(() => { if (navRow._input) navRow._input.value = getSetting('panelNav') === 'tree' ? 'tree' : 'tabs'; renderSide(); renderTabs(); });
      category(paneLayout, 'Size');
      // THE SCALE APPLIES ON RELEASE (R69 round 7). It used to apply live on
      // every step, and the row it sits in scales too: the label grew, the
      // track shifted, and the thumb slid out from under the pointer mid-drag.
      // The number beside it follows the drag; the panel changes once, when
      // you let go. A notch marks 100%, and the reset button returns there.
      const SCALE_MIN = 80, SCALE_MAX = 130;
      // One slider, two uses: the UI scale and the top bar's own (below).
      const scaleSlider = ({ label, get, commit }) => {
        const row = document.createElement('div');
        row.className = 'awoo-cp-slider';
        const lab = document.createElement('span');
        lab.className = 'awoo-cp-sub';
        lab.textContent = label;
        const track = h('div', 'awoo-cp-range');
        const input = document.createElement('input');
        input.type = 'range';
        input.min = String(SCALE_MIN); input.max = String(SCALE_MAX); input.step = '5';
        input.value = String(get());
        input.setAttribute('aria-label', label);
        const notch = h('span', 'awoo-cp-notch');
        notch.style.setProperty('--awoo-notch', String((100 - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)));
        notch.title = '100%';
        track.appendChild(input);
        track.appendChild(notch);
        const val = document.createElement('b');
        val.className = 'awoo-cp-sliderval';
        const reset = btn('↺', () => { input.value = '100'; done(); }, { small: true });
        reset.title = 'Back to 100%';
        reset.setAttribute('aria-label', `Reset ${label} to 100%`);
        const show = () => {
          val.textContent = input.value + '%';
          reset.disabled = input.value === '100';
        };
        function done() { show(); commit(Number(input.value)); }
        input.addEventListener('input', show);
        input.addEventListener('change', done);
        show();
        row.appendChild(lab);
        row.appendChild(track);
        row.appendChild(val);
        row.appendChild(reset);
        return { row, sync() { input.value = String(get()); show(); } };
      };
      const uiScaleSlider = scaleSlider({
        label: 'UI scale',
        get: () => Math.round(uiScale() * 100),
        commit: (v) => {
          setSetting('uiScale', v);
          const want = settingsSize();
          settingsMinW = want.w; settingsMinH = want.h;
          if (settingsHandle) { settingsHandle.setMinSize(want); settingsHandle.resetFull(); }
        },
      });
      onReset(() => { uiScaleSlider.sync(); applyUiScale(); });
      paneLayout.appendChild(uiScaleSlider.row);
      category(paneLayout, 'The AWOO+ menu');
      const menuSizeRow = ui.inputRow({
        label: 'Size', type: 'select', value: getSetting('menuLayout') === 'wide' ? 'wide' : 'compact',
        options: [{ value: 'compact', label: 'Compact' }, { value: 'wide', label: 'Wide, with a second column' }],
        info: 'The menu\'s own header has the same switch.',
        onChange: (v) => setSetting('menuLayout', v === 'wide' ? 'wide' : 'compact'),
      });
      const menuPanelRow = ui.inputRow({
        label: 'Second column', type: 'select', value: getSetting('menuWidePanel') === 'overview' ? 'overview' : 'details',
        options: [{ value: 'details', label: 'Details of the selected item' }, { value: 'overview', label: 'Profile Sync and what needs attention' }],
        info: 'What the wide menu shows beside the list.',
        onChange: (v) => setSetting('menuWidePanel', v === 'overview' ? 'overview' : 'details'),
      });
      onReset(() => {
        if (menuSizeRow._input) menuSizeRow._input.value = getSetting('menuLayout') === 'wide' ? 'wide' : 'compact';
        if (menuPanelRow._input) menuPanelRow._input.value = getSetting('menuWidePanel') === 'overview' ? 'overview' : 'details';
      });
      paneLayout.appendChild(menuSizeRow);
      paneLayout.appendChild(menuPanelRow);
      const menuSearchRow = labelledTick('Search bar', getSetting('menuSearch') === true, (v) => setSetting('menuSearch', !!v));
      menuSearchRow.title = 'A search box at the top of the menu that also finds hidden modules and Control Panel pages.';
      paneLayout.appendChild(menuSearchRow);
      onReset(() => { const i = menuSearchRow.querySelector('input[type="checkbox"]'); if (i) i.checked = getSetting('menuSearch') === true; });
      category(paneLayout, 'This panel');
      paneLayout.appendChild(navRow);
      category(paneLayout, 'Top bar');
      const profileBarRow = labelledTick('Show Profile Sync on the top bar', registry.profileOnBar !== false, (v) => setProfileOnBar(v));
      paneLayout.appendChild(profileBarRow);
      paneLayout.appendChild(sub('Its own button, beside AWOO+. It does not count toward the module limit (Modules › Modules).'));
      onReset(() => { const i = profileBarRow.children[0]; if (i) i.checked = registry.profileOnBar !== false; });
      // Its own scale, or the UI scale's (2026-09-25). The slider shows only
      // while it applies, so an unticked box never leaves a dead control.
      const barSlider = scaleSlider({
        label: 'Top bar scale',
        get: () => Math.round(barScale() * 100),
        commit: (v) => setSetting('barScale', v),
      });
      const barOwnRow = labelledTick('Scale the top bar separately', getSetting('barScaleOwn') === true, (v) => {
        setSetting('barScaleOwn', !!v);
        barSlider.row.hidden = !v;
      });
      barOwnRow.title = 'Off: the top bar follows the UI scale. On: it has its own, height included, so it can fit the game\'s menu bar.';
      barSlider.row.hidden = getSetting('barScaleOwn') !== true;
      paneLayout.appendChild(barOwnRow);
      paneLayout.appendChild(barSlider.row);
      onReset(() => {
        const i = barOwnRow.querySelector('input[type="checkbox"]');
        if (i) i.checked = getSetting('barScaleOwn') === true;
        barSlider.row.hidden = getSetting('barScaleOwn') !== true;
        barSlider.sync();
        applyBarScale();
      });
      category(paneLayout, 'Recover');
      const recover = h('div', 'awoo-ui-actionrow');
      recover.appendChild(btn('Bring all panels on-screen', () => resetPositions()));
      recover.appendChild(btn('Reset panel sizes', () => resetAllWindowSizes()));
      paneLayout.appendChild(recover);

      // ---- Module settings: one page per module, set apart in the sidebar ----
      //
      // A module supplies { label, render(container), reset?() } and gets its
      // own page; with reset(), Core draws the page's Defaults button.
      // Rendered lazily, ONCE, the first time it is opened: a settings pane may
      // read live game state, and building all of them up front would run every
      // module's probe because someone opened the panel to change the theme.
      // A module that is OFF is listed too, dimmed, so its settings are where
      // the player expects them; its page says why it is empty and loads it.
      for (const id of orderedIds(Object.keys(modules))) {
        const mod = modules[id];
        if (!mod || mod.kind === 'tweak') continue;
        const spec = mod.settings;
        const hasRender = spec && typeof spec.render === 'function';
        void hasRender; // every module gets a page: its reset lives there
        const pane = addPage('m:' + id, 'main', (spec && spec.label) || mod.label || id);
        // Drawn for the run that exists NOW, and redrawn when the module loads
        // or unloads while the panel is open: a pane built by one run holds
        // controls wired to that run, which an unload has just discarded.
        let drawnFor = null;
        // Every module page ends with the same way out when something is
        // broken: wipe that module's saved data, and only that module's.
        // Defaults sits in the same row when the module has one (2026-09-25:
        // "put defaults and reset saved data next to each other"), the gentle
        // one first; the two are still different verbs with different reach.
        const resetFoot = (defaultsBtn) => {
          const m = modules[id];
          const label = (m && m.label) || id;
          category(pane, 'Reset');
          const row = h('div', 'awoo-ui-actionrow');
          if (defaultsBtn) row.appendChild(defaultsBtn);
          row.appendChild(btn('Reset saved data…', async () => {
            const keys = [];
            try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(`awoo:${id}:`)) keys.push(k); } } catch (e) { /* none */ }
            const ok = await ui.confirmDialog({
              title: `Reset ${label}`,
              message: `This deletes everything ${label} has saved (${keys.length} item${keys.length === 1 ? '' : 's'}), `
                + 'and starts it again from nothing if it is loaded.\n\nIts window position and size are kept. '
                + 'Nothing of any other module is touched.',
              confirmLabel: 'Reset saved data',
            });
            if (!ok) return;
            const removed = resetModuleData(id);
            drawnFor = null;
            toast(`${label}: saved data reset (${removed.length} item${removed.length === 1 ? '' : 's'}).`, { type: 'success', duration: 4000 });
          }));
          pane.appendChild(row);
          pane.appendChild(sub((defaultsBtn ? 'Defaults resets the settings above. ' : '')
            + 'Reset saved data is for when something in it is broken; your other modules and AWOO+ settings are kept.'));
        };
        pane._refresh = () => {
          const m = modules[id];
          const key = m && m.enabled && m.started ? m.ctx : 'off';
          if (key === drawnFor) return;
          drawnFor = key;
          pane.innerHTML = '';
          if (!m || !m.enabled) {
            pane.appendChild(sub(`${(m && m.label) || id} is off, so its settings are not loaded. They are kept, and apply when it loads.`));
            const a = h('div', 'awoo-ui-actionrow');
            a.appendChild(btn(`Load ${(m && m.label) || id}`, () => setEnabled(id, true), { primary: true }));
            pane.appendChild(a);
            resetFoot();
            return;
          }
          const sp = m.settings;
          let defaultsBtn = null;
          if (!sp || typeof sp.render !== 'function') pane.appendChild(sub('This module has no settings.'));
          else {
            try { sp.render(pane); } catch (e) {
              console.error('[AwooCore] settings tab for ' + id + ' threw', e);
              pane.appendChild(sub('This module\'s settings could not be shown.'));
            }
            // THE SAME DEFAULTS BUTTON ON EVERY MODULE PAGE (R69 round 7).
            // Each module used to draw its own, or none: Pet Slot Alarm had one
            // for half its page, the others had nothing ("some module settings
            // still lack the defaults button"). A module supplies
            // settings.reset(); Core draws the button, redraws the page, and
            // says so. Settings only: saved data is the separate button below.
            if (typeof sp.reset === 'function') {
              const b = btn('Defaults', () => {
                try { sp.reset(); } catch (e) {
                  console.error('[AwooCore] settings reset for ' + id + ' threw', e);
                  toast(`${m.label}: could not reset its settings.`, { type: 'warn', duration: 4000 });
                  return;
                }
                drawnFor = null;
                pane._refresh();
                toast(`${m.label}: settings back to defaults.`, { type: 'success', duration: 3000 });
              });
              b.title = 'Puts the settings on this page back to their defaults. Saved data is kept.';
              defaultsBtn = b;
            }
          }
          resetFoot(defaultsBtn);
        };
      }
      const renderedPages = new Set();
      const selectPageLazily = (section, pageId) => {
        selectPage(section, pageId);
        const p = pages.find((x) => x.section === active.section && x.id === active.page);
        if (!p) return;
        if (p.pane._render && !renderedPages.has(p)) { renderedPages.add(p); p.pane._render(); }
        if (p.pane._refresh) p.pane._refresh(true);
      };
      selectPageByIdLazily = selectPageLazily;
      selectPageLazily('general', 'general');

      return {
        root,
        // Old flat ids still land (TARGETS, above): a module's gear passes its own id.
        selectTab: (id) => { const [sec, pg] = resolveTarget(id); selectPageLazily(sec, pg); },
        // Called whenever a module or the registry changes while the panel is
        // open. Each page redraws only if what it shows actually changed, so a
        // countdown ticking once a second does not rebuild a table under the
        // pointer (the Modules page patches its live readings in place).
        refresh() {
          if (dragId) return;
          const sideSig = JSON.stringify([active, getSetting('panelNav'), updateState.available.length,
            Object.values(modules).map((m) => [m.id, m.enabled])]);
          if (sideSig !== lastSideSig) { lastSideSig = sideSig; renderSide(); renderTabs(); }
          const p = pages.find((x) => x.section === active.section && x.id === active.page);
          if (p && p.pane._refresh) p.pane._refresh(false);
        },
        renderHostStatus,
        renderNumberFormat() {
          const c = getConvention();
          const auto = c.source !== 'override';
          const sourceLabel = c.source === 'setting' ? "the game's setting"
            : c.source === 'remembered' ? "the game's setting, as last read"
            : c.source === 'sample' ? 'a number rendered on this page'
            : c.source === 'browser' ? 'your browser locale' : 'a manual override';
          // Both detections, side by side, with the one in use named. The game
          // outranks the browser; a manual choice outranks both.
          const det = c.detected || {};
          const browserFmt = det.browser ? `1${det.browser.group}000${det.browser.decimal}00` : '—';
          const detectLine = `Game: ${det.game || 'not read yet'} · Browser: ${browserFmt}`
            + (!auto ? ' · both overridden'
              : (c.source === 'setting' || c.source === 'remembered') ? ' · game wins'
              : c.source === 'sample' ? ' · read from a number on the page'
              : ' · using browser until the game is read');
          renderAppearanceSummary();
          numStatus.innerHTML = '';
          const line1 = document.createElement('div');
          line1.textContent = `Sample: ${formatNumber(1234567.8)}  (decimal "${c.decimal}", thousands "${c.group}")`;
          const line2 = document.createElement('div');
          line2.style.cssText = auto ? 'color:var(--awoo-success);' : 'color:var(--awoo-warn);';
          line2.textContent = auto ? `✓ Auto-detected from ${sourceLabel}.` : `Forced by you (not auto-detected).`;
          const line3 = document.createElement('div');
          line3.className = 'awoo-ui-note';
          line3.textContent = detectLine;
          numStatus.appendChild(line1);
          numStatus.appendChild(line2);
          numStatus.appendChild(line3);
          for (const { key, btn } of numBtns) {
            let stored = null;
            try { stored = localStorage.getItem(OVERRIDE_KEY); } catch (e) { /* ignore */ }
            const active = key === stored || (key === null && stored === null);
            btn.style.cssText = active ? 'font-weight:700; border-color: var(--awoo-primary); color: var(--awoo-primary);' : '';
          }
        },
      };
    }

    // A labelled checkbox with Core.ui's own info-icon — small enough not to
    // route through the full Core.ui object (defined further down this same
    // closure) while staying visually consistent with it.
    function Core_ui_toggleRow({ label, info, checked, onChange }) {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex; align-items:center; gap:7px; font-size:11.5px; cursor:pointer; margin:4px 0;';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = checked;
      input.style.cssText = 'margin:0;';
      input.addEventListener('change', () => onChange(input.checked));
      const text = document.createElement('span');
      text.textContent = label;
      row.appendChild(input);
      row.appendChild(text);
      if (info) row.appendChild(ui.infoIcon(info));
      return row;
    }

    // ONE ROW PER AVAILABLE UPDATE, plus a status line.
    //
    // The first version summarised "2 updates available" into a single row and
    // opened available[0] — so a user with a Core AND a module update was sent
    // to one of them and had no way to reach the other. Tampermonkey installs
    // one script per visit to one .user.js URL; there is no combined install,
    // so the UI has to offer each one.
    // REWORKED (v6.1): a module's own update now shows as a button that
    // only appears while hovering that module's row (renderDropdown), and
    // Core's own update shows as a small subtle button beside the version
    // number instead of a separate always-visible list — both were true
    // "show me only when it's actually relevant" simplifications of what
    // used to be one persistent block regardless of whether anything was
    // pending. This function now just refreshes the Core-update badge and
    // asks renderDropdown to pick up any per-module change.
    // What an update check found, where the player sees it: the menu's footer
    // ("N updates available" beside the version, opening the Updates page)
    // and the Control Panel's Updates page, which also says that a check ran
    // and when (R56). The old three-state footer row lived here.
    function renderUpdateRow() {
      if (!coreUi) return;
      renderPaletteFooter();
      renderDropdown();
    }

    // Opening is wrapped like a module callback (§4.1 rule 3): a tool that
    // throws while building its payload must not take the launcher down.
    function openTool(id) {
      const tool = tools[id];
      if (!tool) return;
      try {
        const target = typeof tool.open === 'function' ? tool.open() : tool.href;
        if (!target) throw new Error('tool.open() returned nothing to open');

        // A synthesised anchor click, not window.open. Chrome's popup blocker
        // treats window.open from a handler that did work first (building a
        // ~76KB blob) as suspicious, and blocks it; a real link activation is
        // the gesture browsers are built to allow. This was blocking the ROI
        // tool for at least one user.
        const a = document.createElement('a');
        a.href = target;
        a.target = '_blank';
        a.rel = 'noopener';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();

        // A TOOL ASKS ONCE WHEN IT OPENS (REGISTER.md R92): the sections it
        // declares (`uses`), each read now if older than fifteen minutes, as
        // opening their game pages would. The answers reach the tool's tab as
        // deltas (tools/tool-sync.js). Here, the one path every tool opens by
        // (a shelf's, or one a module carries, such as Party's Pet Slot ROI),
        // so no opener has to remember it; after the open, so a tool that
        // failed to build costs no read. Refused inside request() when
        // background reads are off.
        if (Array.isArray(tool.uses) && tool.uses.length && typeof profileApi.request === 'function') {
          try { Promise.resolve(profileApi.request(tool.uses.slice())).catch(() => { /* a read refused is not an open failed */ }); } catch (e) { /* ditto */ }
        }

        // Belt and braces: if it was still blocked, put a clickable way out in
        // front of the user rather than only in the console, which nobody has
        // open at the moment they click a menu item.
        setTimeout(() => {
          if (document.hasFocus()) return;   // a new tab took focus: it worked
          toast(`"${tool.label}" may have been blocked by the popup blocker.`, {
            type: 'warn', duration: 12000, action: 'Open here',
            onAction: () => { location.href = target; },
          });
        }, 400);
      } catch (err) {
        console.error(`[AwooCore] tool "${id}" failed to open:`, err);
        toast(`Could not open "${tool.label}" — see the console.`, { type: 'error' });
      }
    }

    // ---- module state: what it is DOING, not merely whether it is open ----
    //
    // `enabled` and `open` are Core's business; `state` is the module's own
    // report, and the nav exists to surface it — "is my tracker still
    // running?" should be answerable without opening anything.
    //
    // Four live states plus off. Deliberately generic, because the alternative
    // is every module inventing its own vocabulary in a row eight characters
    // wide. `attention` and `problem` render as a GLYPH rather than a coloured
    // dot: colour alone does not say "this one needs you", and it is the state
    // a colour-blind reading is most likely to lose.
    const MODULE_STATES = ['idle', 'running', 'attention', 'problem'];
    const STATE_GLYPH = { attention: '!', problem: '✕' };


    // The right-hand column of a dropdown row. A module's own `stateDetail` is
    // preferred over the generic word wherever it has one, because "2h 14m" is
    // the answer and "running" is only the category.
    function stateText(mod) {
      if (!mod.enabled) return 'off';
      if (mod.stateDetail) return mod.stateDetail;
      const s = mod.state || 'idle';
      if (s === 'idle') return 'idle';
      if (s === 'running') return 'running';
      if (s === 'attention') return 'needs you';
      return 'problem';
    }

    // ==== the palette's contents (REGISTER.md R69) ====
    //
    // `renderDropdown` keeps its name: every place that changes a module,
    // a tool or the registry already calls it, so the palette redraws from
    // the same triggers the old list did. It draws only while the menu is
    // open; opening it always draws.
    const palState = { q: '', sel: 0, items: [] };
    const palOpen = () => !!(coreUi && coreUi.dropdown && coreUi.dropdown.style.display !== 'none');

    function renderDropdown() {
      if (coreUi && coreUi.pal && palOpen()) renderPalette();
      notifyPanel();
    }
    function renderToolRows() { renderDropdown(); }

    // Everything the menu can find. With no search: the modules and tools the
    // player keeps in the menu. With a search: everything, including what is
    // hidden from the menu, tweaks, every Control Panel page and actions.
    const PALETTE_PAGES = [
      ['General', 'general', 'backup reset developer'], ['Profile Sync', 'sync', 'profile data sections'],
      ['Updates', 'updates', 'version install check'], ['Changelog', 'changelog', 'changes new history release notes'], ['Diagnostics', 'diag', 'debug errors bug storage check-in'],
      ['Style', 'style', 'theme numbers fonts appearance'], ['Layout', 'layout', 'size sidebar panels windows recover'],
      ['Modules', 'modules', 'load unload order bar menu'], ['Tools', 'tools', 'calculators'],
      ['Tweaks', 'tweaks', 'qol page'], ['Info', 'info', 'legend status marks'], ['Companion', 'companion', 'jobs host'],
    ];
    function paletteActions() {
      return [
        { label: 'Copy debug info', hint: 'For sharing a problem', kw: 'bug diagnostics share log', run: () => palEls().bugBtn.click() },
        { label: 'Check for updates', hint: 'Updates', kw: 'version install', run: () => palEls().updBtn.click() },
        { label: 'Sync profile now', hint: 'Profile Sync', kw: 'refresh data', run: () => { resyncProfile(); toast('Requested profile sync…', { type: 'info', duration: 2500 }); } },
        { label: 'Bring all panels on-screen', hint: 'Layout', kw: 'lost window reset position recover', run: () => { closePalette(); resetPositions(); } },
        { label: 'Unload every module', hint: 'Modules', kw: 'disable all off stop', run: () => { closePalette(); openSettingsWindow('modules'); } },
      ];
    }
    const palEls = () => coreUi.pal;
    function paletteItems() {
      const q = palState.q.trim().toLowerCase();
      const hit = (...parts) => !q || parts.filter(Boolean).join(' ').toLowerCase().includes(q);
      const out = [];
      for (const id of orderedIds(Object.keys(modules))) {
        const m = modules[id];
        if (m.kind === 'tweak') continue;
        if (!q && isIn('menuHidden', id)) continue;
        if (hit(m.label, m.shortLabel, m.category, m.description)) out.push({ kind: 'module', id, group: 'Modules' });
      }
      for (const id of Object.keys(incompatible)) {
        if (hit(incompatible[id].label)) out.push({ kind: 'notice', id, group: 'Modules', text: `${incompatible[id].label}: needs AWOO+ v${incompatible[id].needsCore}`, page: 'updates' });
      }
      for (const id of Object.keys(duplicates)) {
        const label = (modules[id] && modules[id].label) || id;
        if (hit(label)) out.push({ kind: 'notice', id: id + ':dup', group: 'Modules', text: `${label}: installed twice`, page: 'diag' });
      }
      for (const id of orderedIds(Object.keys(tools))) {
        const t = tools[id];
        if (!q && isIn('toolMenuHidden', id)) continue;
        if (hit(t.label, t.description, 'tool')) out.push({ kind: 'tool', id, group: 'Tools' });
      }
      if (q) {
        for (const id of orderedIds(Object.keys(modules))) {
          const m = modules[id];
          if (m.kind === 'tweak' && hit(m.label, m.description, 'tweak')) out.push({ kind: 'module', id, group: 'Tweaks' });
        }
        for (const [label, target, kw] of PALETTE_PAGES) {
          if (hit(label, kw, 'control panel settings')) out.push({ kind: 'page', id: 'page:' + target, group: 'Control Panel', label, target });
        }
        for (const id of orderedIds(Object.keys(modules))) {
          const m = modules[id];
          if (m.kind !== 'tweak' && hit(m.label + ' settings')) out.push({ kind: 'page', id: 'page:' + id, group: 'Control Panel', label: `${m.label} settings`, target: id });
        }
        for (const a of paletteActions()) if (hit(a.label, a.kw)) out.push(Object.assign({ kind: 'action', id: 'act:' + a.label, group: 'Actions' }, a));
      }
      return out;
    }

    function paletteStatus(m) {
      if (!m.enabled) return { slot: 'off', text: 'off', tone: '' };
      if (m.crashed) return { slot: 'problem', text: 'crashed', tone: 'bad' };
      if (m.errored) return { slot: 'problem', text: 'error', tone: 'bad' };
      if (m.saveError) return { slot: 'attention', text: 'can\'t save', tone: 'warn' };
      const s = m.state || 'idle';
      if (s === 'attention') return { slot: s, text: m.stateDetail || 'needs you', tone: 'warn' };
      if (s === 'problem') return { slot: s, text: m.stateDetail || 'problem', tone: 'bad' };
      return { slot: s, text: m.stateDetail || '', tone: '' };
    }
    function dotEl(slot) {
      const d = document.createElement('span');
      d.className = 'awoo-core-sd awoo-core-sd-' + slot;
      if (STATE_GLYPH[slot]) d.textContent = STATE_GLYPH[slot];
      return d;
    }
    const pmk = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = awooCls(cls);
      if (text != null) e.textContent = text;
      return e;
    };

    function renderPalette() {
      const P = palEls();
      if (!P) return;
      const wide = getSetting('menuLayout') === 'wide';
      coreUi.dropdown.classList.toggle('awoo-pal-wide', wide);
      P.search.hidden = getSetting('menuSearch') !== true;
      if (P.search.hidden && palState.q) { palState.q = ''; P.input.value = ''; }
      P.layoutBtn.setAttribute('data-tooltip', wide ? 'Compact layout' : 'Wide layout');
      P.layoutBtn.innerHTML = wide
        ? '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="4.5" y="3" width="7" height="10" rx="1.5"/></svg>'
        : '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M8.5 3v10"/></svg>';
      const mods = Object.values(modules).filter((m) => m.kind !== 'tweak');
      P.count.textContent = `${mods.filter((m) => m.enabled).length} of ${mods.length} loaded`;

      const items = paletteItems();
      // THE SAME LIST AS LAST TIME: patch the readings in place. A module
      // reporting a countdown calls this every second, and rebuilding the
      // rows would replace the one under the pointer mid-click.
      const sig = JSON.stringify([items.map((x) => x.kind + ':' + x.id), wide, getSetting('menuWidePanel'),
        registry.menuHidden, registry.toolMenuHidden, registry.profileOnBar,
        items.filter((x) => x.kind === 'module').map((x) => [modules[x.id].enabled, !!modules[x.id].open])]);
      if (sig === P.sig && P.rows) {
        palState.items = items;
        patchPalette();
        renderPaletteFooter();
        return;
      }
      P.sig = sig;
      palState.items = items;
      if (palState.sel >= palState.items.length) palState.sel = Math.max(0, palState.items.length - 1);
      P.list.innerHTML = '';
      P.rows = [];
      let group = null;
      palState.items.forEach((it, i) => {
        if (it.group !== group) {
          group = it.group;
          const gh = pmk('div', 'awoo-pal-group');
          gh.appendChild(pmk('span', 'awoo-pal-glabel', group));
          // Faint until pointed at: a way into Control Panel > Modules from
          // where the modules are, without competing with them.
          if (group === 'Modules') {
            const manage = pmk('button', 'awoo-pal-manage', 'manage');
            manage.type = 'button';
            manage.addEventListener('click', (e) => { e.stopPropagation(); closePalette(); openSettingsWindow('modules'); });
            gh.appendChild(manage);
          }
          P.list.appendChild(gh);
        }
        const row = paletteRow(it, i);
        P.rows.push(row);
        P.list.appendChild(row);
      });
      if (!palState.items.length) {
        P.list.appendChild(pmk('div', 'awoo-pal-empty', palState.q
          ? 'Nothing matches. Try a module name, "debug" or "font".'
          : 'Nothing is in the menu. Control Panel › Modules chooses what shows here.'));
      }
      P.side.hidden = !wide;
      if (wide) renderPaletteSide();
      const showPsl = !wide && registry.profileOnBar === false;
      P.psl.hidden = !showPsl;
      if (showPsl) {
        const sum = profileSummary();
        P.psl.innerHTML = '';
        P.psl.appendChild(dotEl(!sum.profile ? 'off' : sum.counts.stale ? 'attention' : 'running'));
        P.psl.appendChild(pmk('span', null, sum.profile
          ? `Profile synced ${formatTimeAgo(sum.at)} · ${sum.counts.ok} of ${PROFILE_CATEGORIES.length} fresh` : 'Profile not synced yet'));
      }
      renderPaletteFooter();
    }

    function patchPalette() {
      const P = palEls();
      palState.items.forEach((it, i) => {
        if (it.kind !== 'module') return;
        const row = P.rows[i];
        const m = modules[it.id];
        if (!row || !m) return;
        const st = paletteStatus(m);
        const dot = row.children[0];
        const cls = 'awoo-core-sd awoo-core-sd-' + st.slot;
        if (dot && dot.className !== cls) { dot.className = cls; dot.textContent = STATE_GLYPH[st.slot] || ''; }
        const right = row.children[row.children.length - 1];
        if (right && right.textContent !== st.text) right.textContent = st.text;
        const rcls = awooCls('awoo-pal-right' + (st.tone ? ' ' + st.tone : ''));
        if (right && right.className !== rcls) right.className = rcls;
      });
      // The details column redraws only when what it describes changed.
      const it = palState.items[palState.sel];
      const wide = getSetting('menuLayout') === 'wide';
      const sideSig = !wide ? '' : getSetting('menuWidePanel') === 'overview'
        ? JSON.stringify([Object.values(modules).map((m) => paletteStatus(m).tone + m.id), updateState.available.length, profileSummary().counts])
        : JSON.stringify(it && it.kind === 'module' ? [it.id, paletteStatus(modules[it.id]), !!modules[it.id].open] : [it && it.id]);
      if (wide && sideSig !== P.sideSig) { P.sideSig = sideSig; renderPaletteSide(); }
    }

    function paletteRow(it, i) {
      const row = pmk('div', 'awoo-pal-row' + (i === palState.sel ? ' sel' : ''));
      row.setAttribute('role', 'option');
      row.dataset.kind = it.kind;
      row.dataset.id = it.id;
      let right = null;
      if (it.kind === 'module') {
        const m = modules[it.id];
        const st = paletteStatus(m);
        row.appendChild(dotEl(st.slot));
        row.appendChild(pmk('span', 'awoo-pal-name', m.label));
        if (m.open) row.classList.add('awoo-m-open');
        if (!m.enabled) row.classList.add('awoo-m-off');
        if (isIn('menuHidden', it.id) && it.group === 'Modules') row.appendChild(pmk('span', 'awoo-pal-tag', 'hidden'));
        right = pmk('span', 'awoo-pal-right' + (st.tone ? ' ' + st.tone : ''), st.text);
        row.title = !m.enabled ? `${m.label} is off. ${getSetting('menuClick') === 'window' ? 'Click' : 'Click'} to load it and open it.`
          : getSetting('menuClick') === 'window' ? 'Click to open or close its window; right-click for more.'
            : 'Click to unload it; right-click for more.';
      } else if (it.kind === 'tool') {
        const t = tools[it.id];
        // A page with a folded corner: a tool is a page that opens in a new
        // tab. The old outlined square "looked weird" (R69 round 7).
        const mark = pmk('span', 'awoo-pal-toolmark awoo-pal-doc');
        mark.innerHTML = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1" stroke-linejoin="round"><path d="M2.5 1.5h4.5l2.5 2.5v6.5h-7z"/><path d="M7 1.5V4h2.5"/></svg>';
        row.appendChild(mark);
        row.appendChild(pmk('span', 'awoo-pal-name', t.label));
        if (isIn('toolMenuHidden', it.id)) row.appendChild(pmk('span', 'awoo-pal-tag', 'hidden'));
        right = pmk('span', 'awoo-pal-right go', 'Open ↗');
      } else if (it.kind === 'page' || it.kind === 'action') {
        row.appendChild(pmk('span', 'awoo-pal-toolmark awoo-pal-chev', '›'));
        row.appendChild(pmk('span', 'awoo-pal-name', it.label));
        right = pmk('span', 'awoo-pal-right', it.kind === 'page' ? 'Control Panel' : it.hint);
      } else if (it.kind === 'notice') {
        row.appendChild(dotEl('attention'));
        row.appendChild(pmk('span', 'awoo-pal-name', it.text));
      }
      if (right) row.appendChild(right);
      row.addEventListener('mouseenter', () => { if (palState.sel !== i) selectPaletteRow(i); });
      row.addEventListener('click', (e) => { e.stopPropagation(); activatePaletteItem(it); });
      row.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); selectPaletteRow(i); openItemMenu(row, it); });
      return row;
    }

    // Moving the selection repaints two rows and the details column, never
    // the list: the row under the pointer must not be rebuilt beneath it.
    function selectPaletteRow(i) {
      const P = palEls();
      if (!P || !P.rows) return;
      const prev = P.rows[palState.sel];
      if (prev) prev.classList.remove('awoo-m-sel');
      palState.sel = i;
      const row = P.rows[i];
      if (row) {
        row.classList.add('awoo-m-sel');
        if (row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
      }
      if (getSetting('menuLayout') === 'wide' && getSetting('menuWidePanel') !== 'overview') renderPaletteSide();
    }

    function activatePaletteItem(it) {
      if (!it) return;
      if (it.kind === 'module') {
        const m = modules[it.id];
        if (!m) return;
        if (m.kind === 'tweak') { setEnabled(it.id, !m.enabled); return; }
        if (getSetting('menuClick') === 'window' && m.enabled) { safely(it.id, 'onQuickClick'); renderPalette(); return; }
        const was = m.enabled;
        setEnabled(it.id, !was);
        // Easy to press by accident, so it says what happened and offers the
        // way back (an unload saved first; loading again restores it).
        toast(`${m.label} ${was ? 'unloaded' : 'loaded'}.`, {
          type: 'info', duration: 5000, action: 'Undo', onAction: () => setEnabled(it.id, was),
        });
      } else if (it.kind === 'tool') { closePalette(); openTool(it.id); }
      else if (it.kind === 'page') { closePalette(); openSettingsWindow(it.target); }
      else if (it.kind === 'action') { it.run(); }
      else if (it.kind === 'notice') { closePalette(); openSettingsWindow(it.page); }
    }

    // ---- right-click menus: rows here, and the top bar's module buttons ----
    function moduleMenuItems(id) {
      const m = modules[id];
      if (!m) return [];
      const hasWindow = m.quickButton !== false && m.kind !== 'tweak';
      const items = [];
      if (m.enabled && hasWindow) items.push({ label: m.open ? 'Close window' : 'Open window', onClick: () => safely(id, 'onQuickClick') });
      items.push({ label: m.enabled ? 'Unload' : 'Load', onClick: () => setEnabled(id, !m.enabled) });
      items.push({ separator: true });
      if (m.enabled && hasWindow) items.push({ label: 'Shown on the bar', checked: !isIn('barHidden', id), onClick: () => setShown(id, 'bar', isIn('barHidden', id)) });
      if (m.kind !== 'tweak') items.push({ label: 'Shown in the menu', checked: !isIn('menuHidden', id), onClick: () => setShown(id, 'menu', isIn('menuHidden', id)) });
      items.push({ separator: true });
      items.push({ label: 'Settings…', onClick: () => { closePalette(); openSettingsWindow(m.kind === 'tweak' ? 'tweaks' : id); } });
      if (m.enabled && hasWindow) items.push({ label: 'Bring window on-screen', onClick: () => safely(id, 'onResetPosition') });
      if (m.crashed || m.errored || m.saveError) items.push({ label: 'Show in Diagnostics', onClick: () => { closePalette(); openSettingsWindow('diag'); } });
      return items;
    }
    function openItemMenu(anchor, it) {
      if (!it) return;
      if (it.kind === 'module') ui.menu(anchor, moduleMenuItems(it.id));
      else if (it.kind === 'tool') {
        ui.menu(anchor, [
          { label: 'Open', onClick: () => { closePalette(); openTool(it.id); } },
          { separator: true },
          { label: 'Shown in the menu', checked: !isIn('toolMenuHidden', it.id), onClick: () => setShown(it.id, 'menu', isIn('toolMenuHidden', it.id)) },
        ]);
      }
    }

    // ---- the wide column: details of the selected item, or an overview ----
    function renderPaletteSide() {
      const P = palEls();
      if (!P) return;
      P.side.innerHTML = '';
      if (getSetting('menuWidePanel') === 'overview') { renderPaletteOverview(P.side); return; }
      const it = palState.items[palState.sel];
      if (!it) { P.side.appendChild(pmk('div', 'awoo-pal-muted', 'Nothing selected.')); return; }
      const box = P.side;
      const act = (label, fn, primary) => {
        const b = pmk('button', 'awoo-ui-btn awoo-cp-btn-sm' + (primary ? ' awoo-ui-btn-primary' : ''), label);
        b.type = 'button';
        b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
        return b;
      };
      const tickRow = (label, checked, fn) => {
        const l = pmk('label', 'awoo-cp-check');
        const i = document.createElement('input');
        i.type = 'checkbox';
        i.checked = checked;
        i.addEventListener('change', () => fn(i.checked));
        l.appendChild(i);
        l.appendChild(pmk('span', null, label));
        return l;
      };
      const chipsFor = (keys) => {
        const w = pmk('div', 'awoo-cp-uses');
        let old = false;
        for (const k of keys) {
          const f = profileFreshness(k);
          if (f.state !== 'ok') old = true;
          const c = pmk('span', 'awoo-cp-chip ' + f.state, ((PROFILE_CATEGORIES.find((x) => x.id === k) || {}).label) || k);
          c.title = f.state === 'miss' ? 'Never seen yet: a loaded module asks for it in the background, a tool when it opens, or open its page in the game.' : `${f.state === 'ok' ? 'Fresh' : 'Old'}, ${f.age}`;
          w.appendChild(c);
        }
        return { el: w, old };
      };
      if (it.kind === 'module') {
        const m = modules[it.id];
        const st = paletteStatus(m);
        box.appendChild(pmk('div', 'awoo-pal-h', m.label));
        const stl = pmk('div', 'awoo-pal-stat');
        stl.appendChild(dotEl(st.slot));
        stl.appendChild(pmk('span', st.tone, !m.enabled ? 'Off: not loaded' : m.crashed ? 'Crashed while starting'
          : (st.text || (m.state === 'running' ? 'Running' : 'Idle')) + (m.open ? ' · window open' : '')));
        box.appendChild(stl);
        if (!m.enabled && m.description) box.appendChild(pmk('div', 'awoo-pal-muted', m.description));
        const hasWindow = m.quickButton !== false && m.kind !== 'tweak';
        const acts = pmk('div', 'awoo-pal-acts');
        if (m.enabled && hasWindow) acts.appendChild(act(m.open ? 'Close' : 'Open', () => { safely(it.id, 'onQuickClick'); renderPalette(); }, true));
        acts.appendChild(act(m.enabled ? 'Unload' : 'Load and open', () => setEnabled(it.id, !m.enabled), !m.enabled));
        acts.appendChild(act('Settings', () => { closePalette(); openSettingsWindow(m.kind === 'tweak' ? 'tweaks' : it.id); }));
        if (m.enabled && hasWindow) acts.appendChild(act('On-screen', () => safely(it.id, 'onResetPosition')));
        box.appendChild(acts);
        if (m.kind !== 'tweak') {
          const shown = pmk('div', 'awoo-pal-acts');
          if (hasWindow) {
            const bar = tickRow('On the bar', !isIn('barHidden', it.id), (v) => setShown(it.id, 'bar', v));
            if (!m.enabled) bar.children[0].disabled = true;
            shown.appendChild(bar);
          }
          shown.appendChild(tickRow('In the menu', !isIn('menuHidden', it.id), (v) => setShown(it.id, 'menu', v)));
          box.appendChild(shown);
        }
        if ((m.uses || []).length) {
          box.appendChild(pmk('div', 'awoo-pal-label', 'Profile data'));
          const c = chipsFor(m.uses);
          box.appendChild(c.el);
          if (c.old) box.appendChild(act('Sync now', () => { resyncProfile(); toast('Requested profile sync…', { type: 'info', duration: 2500 }); }));
        }
        if (m.crashed || m.errored || m.saveError) {
          const warn = pmk('div', 'awoo-pal-warn', m.saveError ? `Could not save: ${m.saveError.msg}` : 'It hit an error; the rest of AWOO+ is unaffected.');
          box.appendChild(warn);
          box.appendChild(act('Diagnostics', () => { closePalette(); openSettingsWindow('diag'); }));
        }
        const meta = [m.version ? 'v' + m.version : null, m.started && Number.isFinite(m.startMs) ? `started in ${m.startMs} ms` : null]
          .filter(Boolean).join(' · ');
        if (meta) box.appendChild(pmk('div', 'awoo-pal-muted awoo-pal-meta', meta));
      } else if (it.kind === 'tool') {
        const t = tools[it.id];
        box.appendChild(pmk('div', 'awoo-pal-h', t.label));
        if (t.description) box.appendChild(pmk('div', 'awoo-pal-muted', t.description));
        box.appendChild(pmk('div', 'awoo-pal-muted', 'Opens in a new tab.'));
        const acts = pmk('div', 'awoo-pal-acts');
        acts.appendChild(act('Open', () => { closePalette(); openTool(it.id); }, true));
        box.appendChild(acts);
        box.appendChild(tickRow('In the menu', !isIn('toolMenuHidden', it.id), (v) => setShown(it.id, 'menu', v)));
        if ((t.uses || []).length) {
          box.appendChild(pmk('div', 'awoo-pal-label', 'Fills in from your profile'));
          const c = chipsFor(t.uses);
          box.appendChild(c.el);
          if (c.old) box.appendChild(act('Sync now', () => { resyncProfile(); toast('Requested profile sync…', { type: 'info', duration: 2500 }); }));
        }
      } else if (it.kind === 'page' || it.kind === 'action') {
        box.appendChild(pmk('div', 'awoo-pal-h', it.label));
        box.appendChild(pmk('div', 'awoo-pal-muted', it.kind === 'page' ? 'Control Panel' : it.hint));
        const acts = pmk('div', 'awoo-pal-acts');
        acts.appendChild(act('Go', () => activatePaletteItem(it), true));
        box.appendChild(acts);
      } else if (it.kind === 'notice') {
        box.appendChild(pmk('div', 'awoo-pal-h', it.text));
        const acts = pmk('div', 'awoo-pal-acts');
        acts.appendChild(act('Show me', () => activatePaletteItem(it), true));
        box.appendChild(acts);
      }
    }

    function renderPaletteOverview(box) {
      const sum = profileSummary();
      const card = pmk('div', 'awoo-pal-card');
      const head = pmk('div', 'awoo-pal-stat');
      head.appendChild(dotEl(!sum.profile ? 'off' : sum.counts.stale ? 'attention' : 'running'));
      head.appendChild(pmk('b', null, 'Profile Sync'));
      head.appendChild(pmk('span', 'awoo-pal-right', sum.profile ? formatTimeAgo(sum.at) : 'not synced'));
      card.appendChild(head);
      const grid = pmk('div', 'awoo-pal-secgrid');
      for (const c of PROFILE_CATEGORIES) {
        // Old but unused (R92, profileSummary): the cell stays muted and its
        // mark uncoloured; only old data a loaded module reads is warned of.
        const f = profileSectionState(c.id, sum.profile, sum.used);
        const cell = pmk('span', 'awoo-pal-sec ' + f.state);
        cell.appendChild(pmk('span', null, c.label));
        cell.appendChild(pmk('span', 'mark', f.state === 'ok' ? '✓' : f.state === 'stale' || f.state === 'unused' ? 'old' : '—'));
        cell.title = f.state === 'miss' ? 'Never seen' : f.state === 'unused' ? `${f.age}, not used by a loaded module` : f.age;
        grid.appendChild(cell);
      }
      card.appendChild(grid);
      const acts = pmk('div', 'awoo-pal-acts');
      const b1 = pmk('button', 'awoo-ui-btn awoo-cp-btn-sm', 'Sync now');
      b1.type = 'button';
      b1.addEventListener('click', (e) => { e.stopPropagation(); resyncProfile(); toast('Requested profile sync…', { type: 'info', duration: 2500 }); });
      const b2 = pmk('button', 'awoo-ui-btn awoo-cp-btn-sm', 'Details');
      b2.type = 'button';
      b2.addEventListener('click', (e) => { e.stopPropagation(); closePalette(); openSettingsWindow('sync'); });
      acts.appendChild(b1);
      acts.appendChild(b2);
      card.appendChild(acts);
      box.appendChild(card);

      box.appendChild(pmk('div', 'awoo-pal-label', 'Needs attention'));
      const list = [];
      for (const m of Object.values(modules)) {
        if (!m.enabled) continue;
        const st = paletteStatus(m);
        if (st.tone) list.push({ slot: st.slot, text: `${m.label}: ${st.text}`, go: () => { closePalette(); if (m.crashed || m.errored || m.saveError) openSettingsWindow('diag'); else safely(m.id, 'onQuickClick'); } });
      }
      if (sum.byState.stale.length) list.push({ slot: 'attention', text: `Old profile data: ${sum.byState.stale.join(', ')}`, go: () => { closePalette(); openSettingsWindow('sync'); } });
      if (updateState.available.length) list.push({ slot: 'attention', text: `${updateState.available.length} update${updateState.available.length === 1 ? '' : 's'} available`, go: () => { closePalette(); openSettingsWindow('updates'); } });
      if (!list.length) box.appendChild(pmk('div', 'awoo-pal-muted', 'Nothing. Everything loaded is fine.'));
      for (const x of list) {
        const r = pmk('button', 'awoo-pal-att');
        r.type = 'button';
        r.appendChild(dotEl(x.slot));
        r.appendChild(pmk('span', null, x.text));
        r.addEventListener('click', (e) => { e.stopPropagation(); x.go(); });
        box.appendChild(r);
      }
    }

    // The footer: the version, and "N updates available" beside it when there
    // are any (a hover tint and the pointer say it is clickable; it opens the
    // Updates page). No underline: its colour already sets it apart.
    function renderPaletteFooter() {
      const P = coreUi && coreUi.pal;
      if (!P) return;
      const n = updateState.available.length;
      P.updLink.hidden = !n;
      P.updLink.textContent = n ? `${n} update${n === 1 ? '' : 's'} available` : '';
      P.verText.textContent = 'AWOO+ ' + RELEASE.version;
    }

    function disableAll() {
      for (const id of Object.keys(modules)) {
        if (modules[id].enabled) setEnabled(id, false);
      }
    }

    // The dropdown's quick-recovery button — POSITION only, keeps whatever
    // size a window is currently at. Settings is reset in FULL here
    // regardless (position AND size): it has no on/off "module" state of its
    // own to gate on, and it needs to always be reachable from this one
    // always-available button — that's the whole point of routing "reset
    // everything else" through Settings' OWN reset button instead (below).
    function resetPositions() {
      for (const id of Object.keys(modules)) {
        const mod = modules[id];
        if (mod.enabled && mod.open) safely(id, 'onResetPosition');
      }
      // SETTINGS GETS THE FULL TREATMENT, including its size PREFERENCE.
      // This is the overlay's fallback of last resort that still has a UI --
      // the console's __awooResetCore() is below it -- so it has to be able to
      // recover from the one setting that can leave the Settings window itself
      // awkward. resetFull() alone would re-apply the very size that was the
      // problem, because the size is a stored preference rather than a
      // persisted rect.
      if (getSetting('settingsSize') !== SETTINGS_DEFAULTS.settingsSize) {
        setSetting('settingsSize', SETTINGS_DEFAULTS.settingsSize);
        const want = settingsSize();
        settingsMinW = want.w; settingsMinH = want.h;
        if (settingsHandle) settingsHandle.setMinSize(want);
      }
      if (settingsHandle) settingsHandle.resetFull();
    }

    // Settings' "Reset window sizes" button — the deliberate FULL reset
    // (position AND size), every registered window, whether or not its
    // module is currently enabled or open. Goes through windowRegistry
    // directly rather than the module onResetPosition hook precisely so it
    // does not depend on a module having wired that up, unlike the
    // quick-recovery button above.
    function resetAllWindowSizes() {
      for (const id in windowRegistry) windowRegistry[id].resetFull();
    }

    // ---- saving: Core.store (v14) ----
    //
    // ONE DOOR FOR A MODULE'S SAVES, for three reasons the modules could not
    // each solve alone:
    //   1. An unload must save FIRST. Core runs the unload, so Core has to be
    //      able to flush, whether or not the module remembered an onUnload.
    //   2. A failed save was silent everywhere (`catch (e) { ignore }` in every
    //      module). That is data loss the player never hears about. A failure
    //      now reaches Diagnostics, the module's row, and one toast.
    //   3. Where data lives is one decision in one place. It is localStorage
    //      today (every script is `@grant none`, so Tampermonkey stores none of
    //      it); moving it later is a change here, not in every module.
    //
    // write() takes a value OR a function returning one. The function form is
    // for a module whose state changes every second: it marks the store dirty
    // and the snapshot is built once, when the write actually happens.
    const STORE_DELAY_MS = 2000;
    const liveStores = new Set();
    const saveErrorsToasted = new Set();
    function makeStore(ownerId, key, { delayMs = STORE_DELAY_MS } = {}) {
      if (typeof key !== 'string' || !key) throw new Error(`[AwooCore] store() needs a storage key (module "${ownerId}")`);
      let pending;          // undefined = nothing to write
      let hasPending = false;
      let timer = null;
      // CLOSED once its module has unloaded. A callback the page still holds
      // (a listener on a game button, a stray timeout) can outlive the run
      // that registered it; if its write landed, the dead run's state would
      // overwrite what the fresh run saved. A closed store drops the write.
      let closed = false;
      const store = {
        key,
        get closed() { return closed; },
        close() { store.flush(); closed = true; liveStores.delete(store); },
        // Forget what is pending and close, WITHOUT writing: a module being
        // reset must not save its (possibly broken) state on the way out.
        drop() {
          if (timer !== null) { clearTimeout(timer); timer = null; }
          hasPending = false; pending = undefined; closed = true; liveStores.delete(store);
        },
        read() {
          try {
            const raw = localStorage.getItem(key);
            return raw == null ? null : JSON.parse(raw);
          } catch (e) { return null; }   // unreadable is absent, never a guess
        },
        write(value) {
          if (closed) return;
          pending = value; hasPending = true;
          if (timer === null) timer = setTimeout(() => { timer = null; store.flush(); }, delayMs);
        },
        writeNow(value) { if (closed) return false; pending = value; hasPending = true; return store.flush(); },
        get dirty() { return hasPending; },
        flush() {
          if (timer !== null) { clearTimeout(timer); timer = null; }
          if (!hasPending) return true;
          let value = pending;
          try {
            if (typeof value === 'function') value = value();
            localStorage.setItem(key, JSON.stringify(value));
            hasPending = false; pending = undefined;
            if (modules[ownerId]) modules[ownerId].saveError = null;
            return true;
          } catch (err) {
            // KEEP the pending value: a later flush (the next change, the tab
            // going to the background) retries it rather than losing it.
            reportSaveFailure(ownerId, key, err);
            return false;
          }
        },
      };
      liveStores.add(store);
      return store;
    }
    function reportSaveFailure(ownerId, key, err) {
      const msg = String((err && err.message) || err);
      if (modules[ownerId]) modules[ownerId].saveError = { at: Date.now(), key, msg };
      diagnostics.failed(ownerId, 'save', err);
      if (!saveErrorsToasted.has(ownerId)) {
        saveErrorsToasted.add(ownerId);
        const label = (modules[ownerId] && modules[ownerId].label) || ownerId;
        const full = /quota/i.test(msg) || (err && err.name === 'QuotaExceededError');
        try {
          toast(`AWOO+ couldn't save ${label}'s data${full ? ': this browser\'s storage for the game is full' : ''}. `
            + 'It will keep retrying. Control Panel › Diagnostics has details.', { type: 'warn', duration: 12000 });
        } catch (e) { /* the Diagnostics record above still stands */ }
      }
      if (coreUi) renderDropdownIfOpen();
    }
    function flushAllStores() { for (const s of liveStores) s.flush(); }

    // ---- the module lifecycle (v14; FRAMEWORK.md §3a, REGISTER.md R69) ----
    //
    // A module whose build declares `about.lifecycle >= 2` is registered from
    // that declaration WITHOUT running a line of its code, and its factory runs
    // only while it is loaded. EVERY LOAD RUNS IT FRESH: a new closure, with
    // state read back from storage. Unloading tears down everything that run
    // created, and Core can do that exhaustively because the module only ever
    // held a TRACKING copy of the API (moduleContext, below).
    //
    // Why a fresh run rather than start()/stop() inside one long-lived closure:
    // restarting in place means every `let` in a 2,000-line module has to be
    // reset by hand, and the one somebody forgets is a bug that only appears on
    // the second load. A fresh run makes "a restart is clean" structural, the
    // same move scopes made for teardown.
    const LIFECYCLE_HOOKS = ['onToggle', 'onQuickClick', 'onResetPosition', 'onUnload', 'settings'];
    const perfNow = () => ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());

    function queueEntry(id) {
      const q = window.__awooModules;
      return Array.isArray(q) ? q.find((e) => e && e.id === id && !e.duplicate) : null;
    }

    // What one run of a module owns, in creation order, so teardown can go in
    // exact reverse (a teardown may rely on anything created before it).
    function moduleContext(id) {
      const owned = [];
      let dead = false;
      let discard = false;
      const track = (kind, obj) => { if (!dead) owned.push({ kind, obj }); return obj; };
      // Core's own scope for this run: the default owner for anything a Core
      // builder would otherwise hang on coreScope. The activity strip did
      // exactly that when a module passed no scope, so every load left a 15 s
      // interval running for the life of the page (tests/module-lifecycle.mjs).
      const runScope = track('scope', createScope(`${id}/run`));
      const moduleUi = Object.create(ui, {
        activity: { value: (spec = {}) => ui.activity(Object.assign({}, spec, { scope: spec.scope || runScope })) },
      });
      const api = Object.create(publicApi, {
        ui: { value: moduleUi },
        createScope: { value: (name, opts) => track('scope', createScope(name, opts)) },
        createWindow: { value: (spec) => track('window', createWindow(spec)) },
        onNavigate: { value: (fn) => track('unsub', onNavigate(fn)) },
        provide: { value: (name, api) => track('unsub', provideService(id, name, api)) },
        onProvide: { value: (name, fn) => track('unsub', onProvide(name, fn)) },
        registerLink: { value: (tool) => { registerLink(tool); if (tool && tool.id && tools[tool.id]) track('tool', tool.id); } },
        store: { value: (key, opts) => track('store', makeStore(id, key, opts)) },
      });
      return {
        api,
        get dead() { return dead; },
        // Teardown drops pending saves instead of flushing them (resetModuleData).
        discardSaves() { discard = true; },
        // What this run is still holding, for Diagnostics.
        stats() {
          const out = { listeners: 0, intervals: 0, timeouts: 0, observers: 0, windows: 0 };
          for (const { kind, obj } of owned) {
            const s = kind === 'scope' ? obj.stats : kind === 'window' && obj.scope ? obj.scope.stats : null;
            if (kind === 'window') out.windows++;
            if (s) for (const k of Object.keys(s)) out[k] += s[k];
          }
          return out;
        },
        teardown() {
          if (dead) return;
          dead = true;
          // Saves first, while everything they might read still exists; or,
          // for a reset, nothing is saved at all.
          for (const { kind, obj } of owned) if (kind === 'store') { if (discard) obj.drop(); else obj.flush(); }
          for (let i = owned.length - 1; i >= 0; i--) {
            const { kind, obj } = owned[i];
            try {
              if (kind === 'scope') obj.dispose();
              else if (kind === 'window') obj.destroy();
              else if (kind === 'unsub') obj();
              else if (kind === 'tool') delete tools[obj];
              else if (kind === 'store') obj.close();
            } catch (err) {
              console.error(`[AwooCore] releasing a ${kind} of "${id}" failed; the rest are still released:`, err);
            }
          }
          owned.length = 0;
          if (coreUi) renderToolRows();
        },
      };
    }

    function startModule(id, { userAction = false } = {}) {
      const mod = modules[id];
      const entry = queueEntry(id);
      if (!mod || !entry || mod.started) return;
      const ctx = moduleContext(id);
      mod.ctx = ctx;
      mod.crashed = false;
      mod.errored = false;
      const t0 = perfNow();
      try {
        entry.descriptor = entry.factory(ctx.api) || null;
        mod.started = true;
      } catch (err) {
        // Crashed on the way up. Whatever it built before throwing is released,
        // and nothing it saved is touched: a crash never wipes data.
        mod.crashed = true;
        console.error(`[AwooCore] module "${id}" threw while starting; the rest are unaffected:`, err);
        diagnostics.failed(id, 'start', err);
        ctx.teardown();
        mod.ctx = null;
      }
      mod.startMs = Math.round((perfNow() - t0) * 10) / 10;
      if (mod.started) signalModules(id, 'start');
      // Loading from the menu shows the window, exactly as enabling always has.
      // A load at page start does not: reopening windows on reload is the
      // player's autoShowOnReload setting, which each module already honours.
      if (mod.started && userAction) safely(id, 'onToggle', true);
    }

    function stopModule(id) {
      const mod = modules[id];
      if (!mod || !mod.started) return;
      // 1. The module closes its own window, as it always has on disable.
      // 2. It saves: its own onUnload, then (inside teardown) every store it
      //    opened, so a module that forgot onUnload still loses nothing it
      //    wrote through Core.store.
      // 3. Everything that run created is released, newest first.
      safely(id, 'onToggle', false);
      safely(id, 'onUnload');
      if (mod.ctx) mod.ctx.teardown();
      mod.ctx = null;
      for (const hook of LIFECYCLE_HOOKS) delete mod[hook];
      Object.assign(mod, { started: false, open: false, badge: false, state: 'idle', stateDetail: null });
      const entry = queueEntry(id);
      if (entry) entry.descriptor = null;
      forgetModuleSettingsPane(id);
      updateTitleBadge();
      signalModules(id, 'stop');
    }

    // A module seen for the FIRST time joins the menu only while the menu has
    // fewer than five modules in it (the maintainer, 2026-09-25): a first
    // install starts with everything off and a short, readable menu; the rest
    // are one search, or one tick in Control Panel > Modules, away.
    const MENU_FIRST_SHOWN = 5;
    function placeNewInMenu(id) {
      if (registry.order.includes(id)) return;
      const shown = registry.order.filter((x) => modules[x] && modules[x].kind !== 'tweak' && !isIn('menuHidden', x)).length;
      if (shown >= MENU_FIRST_SHOWN) setIn('menuHidden', id, true);
    }

    // Registered from its declaration, not by running it (claim(), below).
    function adoptModule(entry) {
      const a = entry.about;
      if (a.needsCore && a.needsCore > AWOO_CORE_VERSION) {
        incompatible[entry.id] = { label: a.label || entry.id, needsCore: a.needsCore };
        if (!coreUi) buildUi();
        renderDropdown();
        return;
      }
      placeNewInMenu(entry.id);
      modules[entry.id] = Object.assign({ badge: false, open: false, state: 'idle' }, modules[entry.id] || {}, {
        id: entry.id,
        label: a.label || entry.id,
        shortLabel: a.shortLabel || null,
        description: a.description || '',
        category: a.category || 'Other',
        kind: a.kind === 'tweak' ? 'tweak' : 'module',
        uses: Array.isArray(a.uses) ? a.uses.slice() : [],
        carriedTools: Array.isArray(a.tools) ? a.tools.slice() : [],
        quickButton: a.quickButton === false ? false : undefined,
        lifecycle: a.lifecycle,
        version: entry.version,
        enabled: isIn('loaded', entry.id),
        started: false,
      });
      noteOrder(entry.id);
      if (!coreUi) buildUi();
      if (modules[entry.id].enabled) startModule(entry.id);
      dropAlreadyInstalled();
      renderQuickRow();
      renderDropdown();
      renderUpdateRow();
    }

    // RESET ONE MODULE'S SAVED DATA, for when something in it is broken (the
    // maintainer, 2026-09-25). Its run is stopped WITHOUT saving, because a save
    // on the way out would write the broken state straight back; every
    // `awoo:<id>:` key goes; and a module that was loaded starts again from
    // nothing. Its window position and size are kept: Layout > Reset panel
    // sizes is the tool for those. Returns the keys it removed.
    function resetModuleData(id) {
      const mod = modules[id];
      if (!mod) return [];
      const restart = !!mod.enabled && mod.lifecycle >= 2;
      if (mod.ctx) mod.ctx.discardSaves();
      if (mod.started) stopModule(id);
      const prefix = `awoo:${id}:`;
      const removed = [];
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.startsWith(prefix)) { localStorage.removeItem(k); removed.push(k); }
        }
      } catch (e) { /* storage blocked: nothing to remove */ }
      if (modules[id]) modules[id].saveError = null;
      if (restart) startModule(id, { userAction: false });
      renderQuickRow();
      renderDropdown();
      return removed;
    }

    // "enabled" in code is "Loaded" in the UI (GLOSSARY.md).
    function setEnabled(id, enabled) {
      const mod = modules[id];
      if (!mod || mod.enabled === enabled) return;
      mod.enabled = enabled;
      setIn('loaded', id, enabled);
      noteOrder(id);
      saveState();
      if (mod.lifecycle >= 2) {
        if (enabled) startModule(id, { userAction: true });
        else stopModule(id);
      } else {
        // Before v14, and still for a module that has not opted in: the code is
        // running either way, and off only closes the window.
        safely(id, 'onToggle', enabled);
        // moduleInfo() reports such a module started exactly while it is
        // loaded, so to Profile Sync this is a start or a stop.
        signalModules(id, enabled ? 'start' : 'stop');
      }
      renderQuickRow();
      renderDropdown();
    }

    // Where a loaded module shows. Never stops or starts anything.
    function setShown(id, where, shown) {
      const key = where === 'bar' ? 'barHidden' : where === 'menu' ? (tools[id] && !modules[id] ? 'toolMenuHidden' : 'menuHidden') : null;
      if (!key) return;
      setIn(key, id, !shown);
      noteOrder(id);
      saveState();
      if (coreUi) { renderQuickRow(); renderDropdown(); }
    }
    function setOrder(ids) {
      if (!Array.isArray(ids)) return;
      const next = ids.filter((x) => typeof x === 'string');
      for (const id of registry.order) if (!next.includes(id)) next.push(id);
      registry.order = next;
      saveState();
      if (coreUi) { renderQuickRow(); renderDropdown(); }
    }
    function setBarMax(n) {
      const [lo, hi] = AWOO_CORE_BAR_MAX_RANGE;
      const v = Math.min(hi, Math.max(lo, Math.round(Number(n))));
      if (!Number.isFinite(v) || v === registry.barMax) return;
      registry.barMax = v;
      saveState();
      if (coreUi) renderQuickRow();
    }

    // One module's whole picture, for the Control Panel and Diagnostics. A
    // COPY, so a caller cannot reach into Core's own record.
    function moduleInfo(id) {
      const m = modules[id];
      if (!m) return null;
      return {
        id, label: m.label, shortLabel: m.shortLabel || null, description: m.description || '',
        category: m.category || 'Other', kind: m.kind || 'module', uses: (m.uses || []).slice(),
        carriedTools: (m.carriedTools || []).slice(), version: m.version || null,
        lifecycle: m.lifecycle || 1, loaded: !!m.enabled, started: m.lifecycle >= 2 ? !!m.started : !!m.enabled,
        crashed: !!m.crashed, errored: !!m.errored, saveError: m.saveError || null,
        open: !!m.open, state: m.state || 'idle', stateDetail: m.stateDetail || null,
        startMs: Number.isFinite(m.startMs) ? m.startMs : null,
        held: m.ctx ? m.ctx.stats() : null,
        shownOnBar: !isIn('barHidden', id), shownInMenu: !isIn('menuHidden', id),
        hasWindow: m.quickButton !== false && m.kind !== 'tweak',
      };
    }
    function listModules() { return orderedIds(Object.keys(modules)).map(moduleInfo); }

    // registerLink({ id, label, href })  or  ({ id, label, open() })
    // `open()` is called at click time, not registration time — so a tool
    // that builds a blob URL only pays for it when actually opened, and a
    // rebuilt payload picks up any state that changed since load.
    function registerLink(tool) {
      if (!tool || !tool.id || !tool.label) {
        console.error('[AwooCore] registerLink needs at least { id, label }');
        return;
      }
      if (!tool.href && typeof tool.open !== 'function') {
        console.error(`[AwooCore] tool "${tool.id}" needs either href or open()`);
        return;
      }
      tools[tool.id] = tool;
      if (coreUi) renderToolRows();
    }

    // Returns the stored descriptor so a module's shim can hold on to it.
    //
    // `needsCore` is the module saying which Core API it was written against.
    // Refusing is the point: a module built for a newer Core would otherwise
    // call a method that does not exist and fail somewhere unrelated, and the
    // user would have no way to know an update was the fix. The reverse — a
    // new Core, an old module — must always keep working, which is why this
    // API only ever gains fields.
    function registerModule(mod) {
      if (!mod || !mod.id) {
        console.error('[AwooCore] registerModule needs at least { id, label }');
        return null;
      }
      if (mod.needsCore && mod.needsCore > AWOO_CORE_VERSION) {
        console.warn(`[AwooCore] "${mod.id}" needs Core v${mod.needsCore}; this is v${AWOO_CORE_VERSION}. Update AWOO+.`);
        incompatible[mod.id] = { label: mod.label || mod.id, needsCore: mod.needsCore };
        if (!coreUi) buildUi();
        renderDropdown();
        return null;
      }
      // UPDATED IN PLACE, never replaced: since v14 Core holds this record
      // across a module's run (startModule marks it started once the factory
      // returns, and the factory is what calls this). A replaced record left
      // that mark on an orphaned copy, so the module could never be unloaded.
      const existing = modules[mod.id];
      const wasStarted = effectivelyStarted(existing);
      modules[mod.id] = Object.assign(
        existing || { enabled: isIn('loaded', mod.id), badge: false, open: false },
        mod,
      );
      noteOrder(mod.id);
      // Its settings tab is new (or new again after a reload of the module).
      if (mod.settings) forgetModuleSettingsPane();
      // The version comes from the module's own @version header, via the shim
      // that read GM_info — looked up rather than passed, because a module
      // registers whenever <body> shows up, which is long after claim() ran.
      // Nothing to keep in sync, so nothing that can drift.
      if (!modules[mod.id].version) modules[mod.id].version = versionFromQueue(mod.id);
      if (!coreUi) buildUi();
      // A module registering is new information about what is installed, so a
      // remembered update for it may have just become stale.
      dropAlreadyInstalled();
      renderQuickRow();
      renderDropdown();
      renderUpdateRow();
      // A module from before the lifecycle is running from the moment it
      // registers. One that declares the lifecycle registers from inside its
      // factory, before startModule marks it started, and signals from there.
      if (!wasStarted && effectivelyStarted(modules[mod.id])) signalModules(mod.id, 'start');
      return modules[mod.id];
    }

    function updateTitleBadge() {
      const anyActive = Object.keys(modules).some((id) => modules[id].enabled && modules[id].badge);
      const hasPrefix = document.title.startsWith(BADGE_PREFIX);
      if (anyActive && !hasPrefix) document.title = BADGE_PREFIX + document.title;
      else if (!anyActive && hasPrefix) document.title = document.title.slice(BADGE_PREFIX.length);
    }

    function setBadge(id, active) {
      const mod = modules[id];
      if (!mod || mod.badge === active) return;
      mod.badge = active;
      // A badge has always meant "this module needs you now", which is exactly
      // `attention`. Kept as its own API because modules in the wild call it,
      // and mapped here so there is ONE state model rather than a badge flag
      // sitting beside a state field and disagreeing with it.
      if (active) { mod.state = 'attention'; }
      else if (mod.state === 'attention') { mod.state = mod.stateBeforeBadge || 'idle'; }
      renderQuickRow();
      renderDropdownIfOpen();
      updateTitleBadge();
    }

    // Core.setState(id, state, detail) — the module says what it is doing.
    // An unknown state is REFUSED rather than rendered as a blank slot: a
    // typo'd state that silently shows nothing is indistinguishable from a
    // module that stopped reporting, which is the failure this whole surface
    // exists to prevent.
    // Core.openSettings(tabId) — a module jumps straight to its own pane
    // rather than opening Settings and asking the user to find it.
    function openSettings(tabId) { openSettingsWindow(tabId); }

    function setState(id, state, detail) {
      const mod = modules[id];
      if (!mod) return;
      if (!MODULE_STATES.includes(state)) {
        console.warn('[AwooCore] setState: unknown state "' + state + '" for ' + id
          + ' — expected one of ' + MODULE_STATES.join(', '));
        return;
      }
      const text = detail == null ? '' : String(detail);
      if (mod.state === state && mod.stateDetail === text) return;
      if (state !== 'attention') mod.stateBeforeBadge = state;
      mod.state = state;
      mod.stateDetail = text;
      renderQuickRow();
      renderDropdownIfOpen();
    }

    // Only repaint the dropdown when it is actually on screen. It rebuilds
    // every row, and a module reporting a countdown calls this once a second.
    function renderDropdownIfOpen() {
      if (palOpen()) renderDropdown();
      notifyPanel();
    }
    function closePalette() { if (coreUi && coreUi.closeDropdown) coreUi.closeDropdown(); }
    // The Control Panel mirrors module state while it is open. It decides for
    // itself what actually needs redrawing (settingsUi.refresh).
    function notifyPanel() {
      if (settingsUi && typeof settingsUi.refresh === 'function' && settingsHandle && settingsHandle.isOpen()) {
        try { settingsUi.refresh(); } catch (e) { console.error('[AwooCore] Control Panel refresh failed', e); }
      }
    }

    function setOpen(id, isOpen) {
      const mod = modules[id];
      if (!mod || mod.open === isOpen) return;
      mod.open = isOpen;
      if (isOpen) diagnostics.opened(id);
      renderQuickRow();
      notifyPanel();
      signalModules(id, isOpen ? 'open' : 'close');
    }

    // WHICH MODULES RUN AND WHICH WINDOWS ARE OPEN, as an event (REGISTER.md
    // R92, API v16). Profile Sync keeps fresh what a started module uses, and
    // holds live data while that module's window is shown; it hears about a
    // change here instead of polling listModules(). Fired after the change,
    // so listModules() already agrees with it.
    //   window 'awoo:modules:change', detail { id, reason }, reason one of
    //   'open' | 'close' | 'start' | 'stop'
    // A stop closes the window without a separate 'close': a stopped module's
    // window counts as closed whatever its last report said.
    function signalModules(id, reason) {
      try { window.dispatchEvent(new CustomEvent('awoo:modules:change', { detail: { id, reason } })); } catch (e) { /* ignore */ }
    }
    // "Started" as moduleInfo() reports it: before the v14 lifecycle, a
    // module's code runs whenever it is loaded.
    function effectivelyStarted(m) { return !!m && (m.lifecycle >= 2 ? !!m.started : !!m.enabled); }

    // ---- module intake ----
    //
    // A module script pushes { id, version, factory } onto window.__awooModules
    // and calls claim(). claim() runs each factory exactly once, ever, and
    // hands it this Core. The entry keeps the descriptor the factory returned
    // so a module never has to be re-initialised - re-registering is cheap and
    // idempotent, re-running a module's setup would build a second panel.
    function versionFromQueue(id) {
      const queue = window.__awooModules;
      if (!Array.isArray(queue)) return null;
      const entry = queue.find((e) => e && e.id === id);
      return entry ? entry.version : null;
    }

    function supersedeIfNewer(queue, fresh) {
      const running = queue.find((e) => e && e !== fresh && e.id === fresh.id && e.claimed && !e.duplicate);
      if (!running || cmpVersion(fresh.version, running.version) <= 0) return false;
      const declared = (e) => !!(e.about && e.about.lifecycle >= 2);
      if (!declared(running) || !declared(fresh) || running.failed) return false;
      const mod = modules[fresh.id];
      if (mod && mod.started) stopModule(fresh.id);
      running.duplicate = true;
      running.superseded = true;
      fresh.duplicate = false;
      try { adoptModule(fresh); } catch (err) {
        fresh.failed = true;
        console.error(`[AwooCore] module "${fresh.id}" could not be registered; the rest are unaffected:`, err);
        diagnostics.failed(fresh.id, 'start', err);
      }
      console.warn(`[AwooCore] "${fresh.id}": running v${fresh.version}, not the older v${running.version} also installed.`);
      return true;
    }

    function claim() {
      const queue = window.__awooModules;
      if (!Array.isArray(queue)) return;
      const seen = new Set();
      for (const entry of queue) {
        if (!entry) continue;
        // TWO COPIES OF THE SAME MODULE is a state renaming the scripts makes
        // easy to reach: Tampermonkey identifies a script by @name + @namespace,
        // so a rename installs a SECOND copy rather than updating the first.
        // Both would push here, both factories would run, and the user would
        // get two panels and two sets of timers with no clue why. Claim the
        // first, and say so about the rest.
        if (entry.claimed || seen.has(entry.id)) {
          if (!entry.claimed && seen.has(entry.id)) {
            entry.claimed = true;
            entry.duplicate = true;
            duplicates[entry.id] = true;
            // THE NEWER COPY WINS (R69 round 7). Tampermonkey runs scripts in
            // install order, so a player who still has an old separate module
            // script ran THAT one, and the AWOO+ copy that shipped with the
            // update sat "duplicate, not run": debug info from players showed
            // the older modules instead of the ones they had just updated to.
            // A declared (v14) module can be swapped cleanly, because unload
            // tears its run down and saves; an older module's code already ran
            // when it was claimed and cannot be taken back, so it stays.
            supersedeIfNewer(queue, entry);
            console.warn(`[AwooCore] "${entry.id}" is installed twice - only one copy is running. `
              + 'Delete the older script in the Tampermonkey dashboard.');
            if (coreUi) renderDropdown();
          }
          seen.add(entry.id);
          continue;
        }
        seen.add(entry.id);
        entry.claimed = true;
        // v14: known from its declaration; its code runs only while loaded.
        if (entry.about && entry.about.lifecycle >= 2) {
          try { adoptModule(entry); } catch (err) {
            entry.failed = true;
            console.error(`[AwooCore] module "${entry.id}" could not be registered; the rest are unaffected:`, err);
            diagnostics.failed(entry.id, 'start', err);
          }
          continue;
        }
        try {
          entry.descriptor = entry.factory(publicApi) || null;
        } catch (err) {
          entry.failed = true;
          console.error(`[AwooCore] module "${entry.id}" threw while starting; the rest are unaffected:`, err);
          diagnostics.failed(entry.id, 'start', err);
        }
      }
    }

    // NOT TAKEN from the AWOO+ Framework: its general event bus. It is good
    // code, and with separate module scripts it would be the only channel
    // between modules — but no module has yet needed to talk to another one.
    // Core's API only ever gains fields, so adding it the day one does costs a
    // version bump and nothing else. Shipping it now would be building a
    // boundary from zero examples.
    //
    // STILL TRUE AT TWO MODULES (checked 2026-09-07; the original note said
    // "there is one module", which stopped being the case when
    // fighter-allocator landed). What the second module actually wanted was not
    // module-to-module messaging but a signal Core already computes for itself
    // — SPA route changes — so that shipped as one named subscription
    // (`onNavigate`, v9) rather than a generic bus. A named channel that
    // removes a duplicated global side effect is a different thing from a bus
    // built on the guess that messaging will be wanted eventually.
    //
    // THE DAY ONE DID (v15, REGISTER.md R90): the Pet Slot Alarm keeps its own
    // window and top-bar button but must not read the party itself, because
    // Party already does and two readers of one card can disagree (R87). What
    // it needs is not messages but Party's CURRENT answers, so what shipped is
    // still not a bus: a module PROVIDES a named object of accessors, another
    // USES it, and onProvide says when it appears or goes. Pull, not push; no
    // events, no payloads, nothing queued.
    //
    //   provide(name, api) -> release   one owner per name; released with the
    //                                    module's run, so an unloaded provider
    //                                    is never used
    //   use(name)          -> api | null
    //   onProvide(name, fn)-> unsub      fn(api | null) now and on each change
    //
    // A consumer must treat null as "not available" and say so (rule 3): the
    // provider may be off, not installed, or not started yet.
    const services = {};           // name -> { owner, api }
    const serviceWatchers = {};    // name -> Set(fn)
    function notifyService(name) {
      const api = services[name] ? services[name].api : null;
      for (const fn of [...(serviceWatchers[name] || [])]) {
        try { fn(api); } catch (err) { console.error(`[AwooCore] a watcher of the "${name}" service threw:`, err); }
      }
    }
    function provideService(owner, name, api) {
      if (typeof name !== 'string' || !name || !api || typeof api !== 'object') {
        console.error('[AwooCore] provide(name, api) needs a name and an object');
        return () => {};
      }
      if (services[name] && services[name].owner !== owner) {
        console.error(`[AwooCore] "${owner}" cannot provide "${name}": "${services[name].owner}" already does`);
        return () => {};
      }
      services[name] = { owner, api };
      notifyService(name);
      return () => {
        if (services[name] && services[name].api === api) { delete services[name]; notifyService(name); }
      };
    }
    function useService(name) { return services[name] ? services[name].api : null; }
    function onProvide(name, fn) {
      if (typeof fn !== 'function') return () => {};
      (serviceWatchers[name] = serviceWatchers[name] || new Set()).add(fn);
      try { fn(useService(name)); } catch (err) { console.error(`[AwooCore] a watcher of the "${name}" service threw:`, err); }
      return () => { if (serviceWatchers[name]) serviceWatchers[name].delete(fn); };
    }

    // ================================================================
    // ---- THE JOB HOST CLIENT (v11) — the browser as an interface ----
    // ================================================================
    //
    // THE DIVISION OF LABOUR, stated because it is the whole architecture:
    // **the browser interacts, connects live game data, and visualises. It does
    // not compute.** Long simulations run in a local host process
    // (`server/README.md`), because a browser tab cannot do the one thing that
    // matters most — keep working when it is closed.
    //
    // That is not a preference. `tests/bench-h4-permutation-budget.mjs`
    // measures the planned workloads: the largest is ~1.7 hours single-threaded
    // and fits nowhere in a tab, and even a Web Worker dies with the page.
    //
    // WHAT THIS CLIENT REFUSES TO DO:
    //
    //   * **Guess.** No host, wrong token, or a protocol mismatch each produce
    //     a distinct, named state. A module shows the user which one; it never
    //     silently falls back to a lesser answer, because a plan computed
    //     against a different build looks exactly like a good one.
    //   * **Hold the tab open.** Submit returns a handle. Progress is polled,
    //     and the job survives the tab closing — that is the entire point.
    //   * **Store the token anywhere but this browser.** It is regenerated
    //     every time the host starts, and is pasted in by the user.
    const JOBS_KEY = 'awoo:core:host';
    const jobsCfg = { url: 'http://127.0.0.1:8787', token: '' };
    try {
      const raw = localStorage.getItem(JOBS_KEY);
      if (raw) Object.assign(jobsCfg, JSON.parse(raw));
    } catch (e) { /* defaults stand */ }

    // NOT 'ok'/'error'. Each state has a different fix, and collapsing them
    // into one means the user is told "it didn't work" and left to guess which
    // of four things to try.
    // The host is started BY HAND, always. server/README.md §7 states the
    // constraint plainly ("Tampermonkey cannot ship a backend... It cannot
    // install a program, start a process, open a listening socket, or keep
    // anything alive after the tab closes") and it is a property of the
    // browser sandbox, not a gap to be worked around. The most a script can do
    // is detect, explain, and hand you the command.
    const HOST_START_COMMAND = 'node server/host.mjs --port 8787';

    const HOST_STATES = Object.freeze({
      UNKNOWN: 'unknown',            // not checked yet
      READY: 'ready',
      NO_HOST: 'no-host',            // nothing listening — start it
      UNAUTHORIZED: 'unauthorized',  // wrong/blank token — repaste it
      MISMATCH: 'mismatch',          // different build — update one side
    });

    let hostState = { state: HOST_STATES.UNKNOWN, detail: '', health: null, at: 0 };

    function setHostConfig(next) {
      Object.assign(jobsCfg, next || {});
      try { localStorage.setItem(JOBS_KEY, JSON.stringify(jobsCfg)); } catch (e) { /* ignore */ }
      hostState = { state: HOST_STATES.UNKNOWN, detail: 'not checked since the settings changed', health: null, at: 0 };
    }

    async function hostFetch(pathname, { method = 'GET', body } = {}) {
      const res = await fetch(jobsCfg.url.replace(/\/$/, '') + pathname, {
        method,
        headers: { 'content-type': 'application/json', 'x-awoo-token': jobsCfg.token },
        body: body === undefined ? undefined : JSON.stringify(body),
        // No cookies, ever. The host authenticates by header precisely because
        // cookies are attached automatically, which is what makes cross-site
        // requests dangerous — see server/security.mjs.
        credentials: 'omit',
        cache: 'no-store',
      });
      return res;
    }

    // Cheap, and the ONLY place the two builds are compared. Doing it here
    // rather than on submit means a mismatch is found before an expensive job
    // rather than at the end of one.
    async function checkHost() {
      if (!jobsCfg.token) {
        hostState = { state: HOST_STATES.UNAUTHORIZED, detail: 'no token set — start the host and paste the one it prints', health: null, at: Date.now() };
        return hostState;
      }
      try {
        const res = await hostFetch('/health');
        if (res.status === 401 || res.status === 403) {
          hostState = { state: HOST_STATES.UNAUTHORIZED, detail: `host refused this token (${res.status})`, health: null, at: Date.now() };
          return hostState;
        }
        const health = await res.json();
        if (health.protocolVersion !== JOBS_PROTOCOL_VERSION) {
          hostState = {
            state: HOST_STATES.MISMATCH,
            // NAME WHICH SIDE IS STALE. This used to print both numbers and
            // say "update whichever is older", leaving the arithmetic to the
            // reader — and the two sides update by completely different
            // mechanisms, so knowing which one matters more than knowing the
            // numbers. The client always knows its own build, so the
            // comparison is free; not doing it was the whole gap.
            //
            // The host deliberately does NOT self-update (server/README.md §7:
            // a program that replaces itself while holding hours of somebody's
            // computation is a program that loses it), so the remedy is always
            // a manual pull in the dev clone. The release repo publishes the
            // userscripts only — there is no installer for the host to point at.
            detail: health.protocolVersion < JOBS_PROTOCOL_VERSION
              ? `The HOST is older (speaks v${health.protocolVersion}, this script speaks v${JOBS_PROTOCOL_VERSION}). In your queslar-core clone: git pull, then restart the host.`
              : `THIS SCRIPT is older (speaks v${JOBS_PROTOCOL_VERSION}, the host speaks v${health.protocolVersion}). Update AWOO+ from the menu, or in the Tampermonkey dashboard.`,
            health, at: Date.now(),
          };
          return hostState;
        }
        // READY, and separately: is the Companion itself current? The protocol
        // check above answers "can these two talk"; this answers "is the half
        // that cannot update itself behind". They are different questions and
        // conflating them is why a months-old Companion could sit there
        // speaking the protocol perfectly and never mention it.
        //
        // Compared against the version this SCRIPT was released at, which is
        // the only upstream figure the browser has without another fetch. The
        // two are released together, so a Companion older than the script is
        // the case worth mentioning; newer is fine and says nothing.
        const stale = health.appVersion && health.appVersion !== 'unknown'
          && cmpVersion(RELEASE.version, health.appVersion) > 0;
        hostState = {
          state: HOST_STATES.READY,
          detail: `${health.capacity ? health.capacity.workers : '?'} workers`
            + (stale ? ` — Companion ${health.appVersion} is behind this script (${RELEASE.version}); git pull and restart it` : ''),
          health, at: Date.now(),
        };
      } catch (err) {
        // A refused connection is indistinguishable from a blocked one at this
        // layer, so the message names both rather than asserting one.
        hostState = {
          state: HOST_STATES.NO_HOST,
          detail: `nothing answered at ${jobsCfg.url} — start it with "node server/host.mjs", or check the port`,
          health: null, at: Date.now(),
        };
      }
      // ONE place, on every outcome. A Companion that starts or stops
      // mid-session moves every delegated feature without the user touching
      // anything -- which is what makes "it just works when running" and "it
      // fell back and said so" the same code path rather than two.
      syncCompanionFeatures();
      companionLastReady = hostState.state;
      return hostState;
    }

    // Kept in step with engine/jobs/protocol.js BY HAND, and that is a real
    // coupling worth naming: this file is a userscript and cannot import from
    // engine/. The handshake above is what turns a drift into a clear message
    // instead of a wrong answer, which is why the check is not optional.
    const JOBS_PROTOCOL_VERSION = 1;

    async function submitJob(spec) {
      const health = hostState.state === HOST_STATES.READY ? hostState : await checkHost();
      if (health.state !== HOST_STATES.READY) {
        const e = new Error(`job host not ready: ${health.detail}`);
        e.hostState = health.state;
        throw e;
      }
      const request = {
        protocolVersion: JOBS_PROTOCOL_VERSION,
        jobId: spec.jobId || `${spec.type}-${Date.now().toString(36)}`,
        type: spec.type,
        input: spec.input || {},
        snapshot: spec.snapshot || null,
        snapshotVersion: spec.snapshot ? spec.snapshot.snapshotVersion : null,
        simulationCount: spec.simulationCount || 1000,
        timeoutMs: spec.timeoutMs || null,
        clientVersion: `awoo-core/${RELEASE.version}`,
        createdAt: new Date().toISOString(),
      };
      const res = await hostFetch('/jobs', { method: 'POST', body: { ...request, resume: spec.resume === true } });
      const body = await res.json();
      if (!res.ok) {
        const e = new Error(body.error || `host returned ${res.status}`);
        e.code = body.code;
        throw e;
      }
      return { jobId: body.jobId, resumedFrom: body.resumedFrom || null, deduplicated: !!body.deduplicated };
    }

    // Polls until terminal, reporting progress. The interval is deliberately
    // slow: these jobs run for minutes to hours, and a tight poll spends the
    // tab-wake budget §4.4 protects to learn nothing.
    function watchJob(jobId, { onProgress = null, intervalMs = 2000, scope = null } = {}) {
      let stopped = false;
      const owner = scope || coreScope;
      const stop = () => { stopped = true; };
      owner.add(stop);
      const done = new Promise((resolve, reject) => {
        const tick = async () => {
          if (stopped) return;
          try {
            const res = await hostFetch(`/jobs/${encodeURIComponent(jobId)}`);
            const body = await res.json();
            if (body.progress && onProgress) onProgress(body.progress);
            if (body.result) { resolve(body.result); return; }
          } catch (err) {
            // A host that goes away mid-job is NOT a failed job — the work is
            // still on disk and resumable. Keep polling; say so if asked.
            hostState = { state: HOST_STATES.NO_HOST, detail: 'lost contact while a job was running', health: null, at: Date.now() };
          }
          owner.timeout(tick, intervalMs);
        };
        owner.timeout(tick, 0);
        owner.add(() => reject(new Error('watch cancelled')));
      });
      return { done, stop };
    }

    // ====================================================================
    // ---- COMPANION FEATURES — the delegation pattern (v12) --------------
    // ====================================================================
    //
    // The first thing a module wanted from the Companion was not a job. It was
    // an ALARM: something outside the browser that can make a noise when a
    // throttled background tab will not. That is a different shape from
    // submit-and-await, and it will not be the last of its kind, so it gets a
    // pattern rather than one module's bespoke wiring.
    //
    // ── THE RULE EVERY DELEGATED FEATURE FOLLOWS ────────────────────────
    //
    // A feature that CAN run in the browser must keep working when the
    // Companion is absent, and must SAY which way it is running. A feature
    // that genuinely cannot must say so up front instead of failing quietly.
    // Those are the only two honest shapes, and `fallback` picks between them.
    //
    // The failure this prevents is specific: a user turns something on, the
    // Companion is not running, and the feature silently does nothing. Nothing
    // in the UI is wrong, nothing errors, and they find out when the alarm they
    // relied on never went off.
    //
    // ── WHY THE BROWSER KEEPS THE THINKING ──────────────────────────────
    //
    // A delegated feature hands over a DECISION ALREADY MADE — a timestamp, a
    // title, a line of text. It never hands over the inputs and asks the
    // Companion to work it out. The game data lives in the tab; duplicating the
    // model across a process boundary is how the two halves start disagreeing,
    // and neither side would know which was right.
    //
    // ── AND THE BOUNDARY IS UNCHANGED ───────────────────────────────────
    //
    // `engine/jobs/protocol.js` is closed under advice. Delegation does not
    // widen that: a reminder spends nothing, starts nothing, commits nothing.
    // Anything that WOULD act on the account is not a candidate for this
    // pattern, and CLAUDE.md rule 4 still decides that, not this file.
    const companionFeatures = [];
    let companionLastReady = null;

    function companionHas(capability) {
      const caps = hostState && hostState.health && hostState.health.capabilities;
      return Array.isArray(caps) && caps.indexOf(capability) !== -1;
    }
    function companionReady(capability) {
      return hostState.state === HOST_STATES.READY && companionHas(capability);
    }

    // Re-evaluated whenever the handshake changes, so a Companion that starts
    // (or stops) mid-session moves every delegated feature without the user
    // doing anything. This is what makes "it just works when it is running" and
    // "it fell back and told me" the same code path.
    function syncCompanionFeatures() {
      for (const f of companionFeatures) {
        try { f._sync(); } catch (e) { console.error('[AwooCore] companion feature sync', e); }
      }
    }

    function makeCompanionFeature(spec) {
      if (!spec || !spec.id || !spec.capability) {
        console.error('[AwooCore] companion.feature needs { id, capability }');
        return null;
      }
      const prefKey = 'awoo:companion:' + spec.id;
      // Opt-in state is per FEATURE, not global: one module wanting the
      // Companion says nothing about another, and a user who distrusts one
      // delegation should not have to give up the rest.
      let enabled = true;
      try {
        const raw = localStorage.getItem(prefKey);
        if (raw !== null) enabled = raw === '1';
      } catch (e) { /* private mode: default on, nothing persisted */ }

      const el = document.createElement('div');
      el.className = 'awoo-ui-delegation';
      const dot = document.createElement('span');
      dot.className = 'awoo-ui-delegation-dot';
      const text = document.createElement('span');
      text.className = 'awoo-ui-delegation-text';
      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'awoo-ui-delegation-open';
      openBtn.textContent = 'Companion \u2197';
      openBtn.title = 'Open the Companion window';
      openBtn.addEventListener('click', (e) => { e.stopPropagation(); openJobsWindow(); });
      for (const n of [dot, text, openBtn]) el.appendChild(n);

      const handle = {
        el,
        get enabled() { return enabled; },
        get mode() {
          if (!enabled) return 'browser';
          return companionReady(spec.capability) ? 'companion' : 'browser';
        },
        // `fallback: false` means the feature has no in-browser form. Saying so
        // is the whole of its honesty: the status line stops promising a
        // fallback that does not exist and asks for the Companion instead.
        get usable() {
          return handle.mode === 'companion' || spec.fallback !== false;
        },
        setEnabled(v) {
          enabled = !!v;
          try { localStorage.setItem(prefKey, enabled ? '1' : '0'); } catch (e) { /* ignore */ }
          handle._sync();
        },
        // Runs `fn` only while actually delegating, and reports rather than
        // throwing: a Companion that goes away mid-session must degrade, not
        // break the module that was using it.
        async push(fn) {
          if (handle.mode !== 'companion') return false;
          try { await fn(companionApi); return true; } catch (e) {
            console.warn('[AwooCore] companion push failed for ' + spec.id, e);
            handle._error = e.message || String(e);
            handle._sync();
            return false;
          }
        },
        // THE COMPANION GROUP (2026-09-21, the module rebuild). One call gives a
        // module the whole standard group: dashed edge, the Info hue on its
        // label, a 6px dot and ONE status word, an Open link, and a body the
        // module fills with its own controls. The body dims to "muted" while
        // the Companion is not the one doing the work, still readable and
        // clickable, because turning it on is done from in there. The full
        // sentence goes on hover over the label, never inline.
        // `bodyNodes`: the module's controls. Returns the group element.
        group(bodyNodes) {
          if (handle._group) return handle._group.el;
          const g = document.createElement('div');
          g.className = 'awoo-ui-companion';
          const head = document.createElement('div');
          head.className = 'awoo-ui-companion-h';
          const name = document.createElement('span');
          name.textContent = 'Companion';
          const gdot = document.createElement('span');
          gdot.className = 'awoo-ui-delegation-dot';
          const word = document.createElement('span');
          word.className = 'awoo-ui-companion-word';
          const open = document.createElement('button');
          open.type = 'button';
          open.className = 'awoo-ui-delegation-open awoo-ui-companion-open';
          open.textContent = 'Open ↗';
          open.title = 'Open the Companion window';
          open.addEventListener('click', (e) => { e.stopPropagation(); openJobsWindow(); });
          for (const n of [name, gdot, word, open]) head.appendChild(n);
          const body = document.createElement('div');
          body.className = 'awoo-ui-companion-body';
          for (const n of (bodyNodes || [])) if (n) body.appendChild(n);
          const note = document.createElement('div');
          note.className = 'awoo-ui-companion-note';
          body.appendChild(note);
          g.appendChild(head);
          g.appendChild(body);
          handle._group = { el: g, head, dot: gdot, word, note };
          handle._sync();
          return g;
        },
        _group: null,
        _error: null,
        // The same sentence the status line shows. Exposed because a module may
        // want to log it (the activity strip is the obvious consumer) and
        // because asserting on rendered textContent means asserting on whatever
        // the DOM stub happens to aggregate -- which is not the contract.
        _status: '',
        get statusText() { return handle._status; },
        _sync() {
          const mode = handle.mode;
          const ready = companionReady(spec.capability);
          let cls = 'awoo-ui-delegation-dot';
          let msg;
          if (mode === 'companion') {
            cls += ' on';
            msg = (spec.label || 'This') + ' is running in the Companion.';
            handle._error = null;
          } else if (!enabled) {
            cls += ' off';
            msg = spec.fallback === false
              ? (spec.label || 'This') + ' needs the Companion, and you have it turned off here.'
              : (spec.label || 'This') + ' is running in this browser by your choice.';
          } else if (spec.fallback === false) {
            cls += ' warn';
            msg = (spec.label || 'This') + ' needs the Companion running.';
          } else {
            cls += ' warn';
            msg = (spec.label || 'This') + ' is running in this browser \u2014 '
              + (hostState.state === HOST_STATES.READY
                ? 'this Companion is too old for it.'
                : 'the Companion is not running.');
          }
          if (handle._error) msg += ' Last attempt failed: ' + handle._error;
          handle._status = msg;
          if (handle._group) {
            const gr = handle._group;
            // One word for the state, one short line for what that means.
            const wordText = mode === 'companion' ? 'running'
              : !enabled ? 'off here'
              : (hostState.state === HOST_STATES.READY && !ready ? 'too old' : 'not running');
            const noteText = handle._error ? 'Last attempt failed.'
              : mode === 'companion' ? 'Handed over. Works even if this tab sleeps.'
              : spec.fallback === false ? 'Needs the Companion.'
              : 'Works in this browser until it runs.';
            domWrite.attr(gr.dot, 'class', cls);
            domWrite.text(gr.word, wordText);
            domWrite.text(gr.note, noteText);
            domWrite.attr(gr.head, 'title', msg);
            gr.el.classList.toggle('awoo-ui-companion-dim', mode !== 'companion');
          }
          domWrite.attr(dot, 'class', cls);
          domWrite.text(text, msg);
          openBtn.hidden = ready && mode === 'companion';
          if (spec.onModeChange && companionLastReady !== null) {
            try { spec.onModeChange(mode); } catch (e) { console.error(e); }
          }
        },
      };
      companionFeatures.push(handle);
      handle._sync();
      return handle;
    }

    const companionApi = {
      get state() { return hostState.state; },
      has: companionHas,
      ready: companionReady,
      check: checkHost,
      open: () => openJobsWindow(),
      feature: makeCompanionFeature,
      request: (pathname, opts) => hostFetch(pathname, opts),
    };

    const jobs = {
      STATES: HOST_STATES,
      get config() { return { url: jobsCfg.url, hasToken: !!jobsCfg.token }; },
      setConfig: setHostConfig,
      get state() { return hostState; },
      check: checkHost,
      submit: submitJob,
      watch: watchJob,
      async cancel(jobId) { await hostFetch(`/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' }); },
      async runs() { const r = await hostFetch('/runs'); return r.json(); },
      async capacity() { const r = await hostFetch('/capacity'); return r.json(); },
      // The dial, from the UI. Changing it while jobs run is safe by design —
      // growth is immediate, shrinking retires workers as they finish.
      async setCapacity(workers) {
        const r = await hostFetch('/capacity', { method: 'POST', body: { workers } });
        return r.json();
      },
    };

    // navigator.clipboard.writeText needs a secure context AND (in some
    // browsers) a recent user gesture — both true here (the click handler
    // calls this synchronously-ish), but it can still be denied by a
    // permissions policy the page sets, or simply not exist on an older
    // browser. The execCommand fallback is deprecated but still works
    // everywhere the modern API might not, which is exactly the situation
    // it is for — this is not the place to drop a debug button because one
    // API had a bad day. Returns whether it actually copied.
    async function copyTextToClipboard(text) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch (e) { /* fall through to the legacy path below */ }
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch (e) { return false; }
    }

    // ---- toast ----
    //
    // For things worth saying once and not worth a panel: "update available",
    // "saved", "couldn't read your gold". Anything the user may want to re-read
    // belongs in a module's own window instead - a toast that has to be caught
    // is a bug report waiting to happen.
    let toastHost = null;
    function toast(message, opts) {
      opts = opts || {};
      if (!document.body) return { dismiss() {} };
      if (!toastHost) {
        toastHost = document.createElement('div');
        toastHost.id = 'awoo-core-toasts';
        document.body.appendChild(toastHost);
      }
      const el = document.createElement('div');
      el.className = 'awoo-core-toast awoo-core-toast-' + (opts.type || 'info');
      const text = document.createElement('span');
      text.className = 'awoo-core-toast-msg';
      text.textContent = message;
      el.appendChild(text);
      if (opts.action && opts.onAction) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'awoo-core-toast-action';
        btn.textContent = opts.action;
        btn.addEventListener('click', () => { try { opts.onAction(); } finally { dismiss(); } });
        el.appendChild(btn);
      }
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'awoo-core-toast-close';
      close.textContent = '×';
      close.title = 'Dismiss';
      close.addEventListener('click', () => dismiss());
      el.appendChild(close);
      toastHost.appendChild(el);
      // rAF does not fire in a hidden tab, so a toast raised while the user is
      // elsewhere would sit at opacity 0 until its own timer removed it -
      // invisible, and unrecoverable. The update notice is exactly the toast
      // most likely to be raised while nobody is looking.
      const reveal = () => el.classList.add('awoo-core-toast-in');
      if (document.hidden) setTimeout(reveal, 0); else requestAnimationFrame(reveal);

      let timer = null;
      const ms = opts.duration === undefined ? 6000 : opts.duration;
      function dismiss() {
        if (timer) clearTimeout(timer);
        el.classList.remove('awoo-core-toast-in');
        setTimeout(() => el.remove(), 200);
      }
      if (ms > 0) timer = setTimeout(dismiss, ms);
      return { dismiss };
    }

    // ---- update checking ----
    //
    // WHAT THIS IS AND IS NOT. Tampermonkey owns updating: it reads @version
    // from @updateURL on its own schedule and shows its own prompt, and a
    // script can neither trigger that check nor update itself. This is the
    // NOTIFICATION layer over that transport - it exists because TM's check is
    // slow and invisible, not because it is unreliable. Clicking through opens
    // the .user.js URL, which is what hands the actual install to TM. We never
    // fetch and eval a script ourselves. See DISTRIBUTION.md section 2.1.
    const UPDATE_KEY = 'awoo:core:updates';
    // Every 2h rather than 6h. The check is one ~1KB fetch of a static file on
    // a CDN, so the cost is not the network - it is that a stale answer makes
    // the row untrustworthy. Twice a day was too rare to be believed.
    // Deliberately NOT every page load: an idle game gets reloaded often, and
    // a request per load is a request per load whatever its size.
    const UPDATE_INTERVAL_MS = 2 * 60 * 60 * 1000;
    let checkedThisLoad = false;
    let updateState = { checkedAt: 0, available: [], error: null, checking: false };

    // REPORTED BUG (2026-09-10): "Update available" stuck showing on a dev
    // build, with per-module rows like "4.11.1-dev -> 4.11.1" that never
    // clear. checkForUpdates()'s own `if (!RELEASE.manifestUrl)` gate
    // correctly stops a DEV build from ever running a NEW check — but this
    // hydration step used to run unconditionally, so entries WRITTEN by an
    // earlier check under a DIFFERENT, non-dev script (the user had briefly
    // installed the standalone live-channel build to test the update flow,
    // then switched back to the dev proxy) got loaded right back in here,
    // regardless of the channel now running.
    //
    // Worse, dropAlreadyInstalled() below could never clear it again once
    // loaded: cmpVersion treats a "-dev"/"-beta" suffix as a PRE-release,
    // ordering it below the same numbered release — correct and intentional
    // for the beta -> live promotion this was designed for, but wrong for
    // dev specifically, whose version is not "not yet promoted", it is
    // "whatever's on disk right now". "4.11.1" reads as newer than
    // "4.11.1-dev" under that rule even when the dev build IS 4.11.1 (or
    // newer) — so the stale entry survived the revalidation pass forever,
    // on every future boot, regardless of what was actually installed.
    //
    // A dev build already promises "updates are off" elsewhere in this file;
    // this makes that promise complete instead of "off for new checks, but
    // still capable of showing something an old check wrote."
    if (RELEASE.manifestUrl) {
      try {
        const savedUpd = JSON.parse(localStorage.getItem(UPDATE_KEY) || 'null');
        // v2: lists saved before retired entries were skipped may still hold
        // a tombstone row. Drop those, and let the first check run on time.
        if (savedUpd && savedUpd.v === 2 && typeof savedUpd.checkedAt === 'number') {
          updateState.checkedAt = savedUpd.checkedAt;
          updateState.available = Array.isArray(savedUpd.available) ? savedUpd.available : [];
        }
      } catch (e) { /* first run, or storage blocked */ }
    }

    // REVALIDATE WHAT WE REMEMBERED, before showing any of it.
    //
    // The list is persisted so the menu has something to say before the first
    // network check - but a remembered entry describes the world as it was
    // hours ago, and the most likely thing to have happened since is that the
    // user installed it. Showing "update available" for a version they are
    // already running, until they press Check, is worse than showing nothing:
    // it teaches them the row is untrustworthy.
    //
    // Costs no network: installedVersion() knows Core's own version, and each
    // module's comes from its @version via the shim.
    function dropAlreadyInstalled() {
      const before = updateState.available.length;
      updateState.available = updateState.available.filter((e) => {
        const have = installedVersion(e.id);
        // Keep entries for things not yet registered - a module may simply not
        // have claimed yet at this point in the boot.
        if (!have) return true;
        return cmpVersion(e.to, have) > 0;
      });
      if (updateState.available.length !== before) persistUpdateState();
      return before - updateState.available.length;
    }

    // Numeric-segment compare, prerelease-aware enough for "5.0.1" vs
    // "5.0.1-beta": a version WITH a suffix sorts below the same version
    // without one, which is what makes promoting beta -> live an increase.
    function cmpVersion(a, b) {
      const split = (v) => {
        const parts = String(v || '0').split('-');
        return { nums: parts[0].split('.').map((n) => parseInt(n, 10) || 0), pre: parts[1] || '' };
      };
      const A = split(a), B = split(b);
      for (let i = 0; i < Math.max(A.nums.length, B.nums.length); i++) {
        const d = (A.nums[i] || 0) - (B.nums[i] || 0);
        if (d) return d < 0 ? -1 : 1;
      }
      if (A.pre === B.pre) return 0;
      if (!A.pre) return 1;   // a release beats the prerelease of the same number
      if (!B.pre) return -1;
      return A.pre < B.pre ? -1 : 1;
    }

    function installedVersion(id) {
      if (id === 'awoo-core') return RELEASE.version;
      if (id === 'awoo-extras') return (window.__awooExtras && window.__awooExtras.version) || null;
      const mod = modules[id];
      return mod && mod.version ? mod.version : null;
    }

    function persistUpdateState() {
      try {
        localStorage.setItem(UPDATE_KEY, JSON.stringify({
          v: 2, checkedAt: updateState.checkedAt, available: updateState.available,
        }));
      } catch (e) { /* ignore */ }
    }

    function checkForUpdates(manual) {
      if (updateState.checking) return Promise.resolve(updateState);
      if (!RELEASE.manifestUrl) {
        updateState.error = 'dev build - updates are off';
        if (coreUi) renderUpdateRow();
        return Promise.resolve(updateState);
      }
      if (!manual) {
        const every = getSetting('updateEvery');
        if (every === 'manual') return Promise.resolve(updateState);
        if (every === 'load' ? checkedThisLoad : Date.now() - updateState.checkedAt < UPDATE_INTERVAL_MS) {
          return Promise.resolve(updateState);
        }
      }
      checkedThisLoad = true;
      updateState.checking = true;
      updateState.error = null;
      if (coreUi) renderUpdateRow();

      return fetch(RELEASE.manifestUrl, { cache: 'no-store' })
        .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then((manifest) => {
          const entries = [];
          const consider = (id, label, published) => {
            if (!published || !published.version) return;
            const have = installedVersion(id);
            // No installed version means the script is not installed at all -
            // an update prompt for something you chose not to have is noise.
            if (!have) return;
            if (cmpVersion(published.version, have) > 0) {
              entries.push({ id, label, from: have, to: published.version, url: published.url, notes: published.notes || '' });
            }
          };
          consider('awoo-core', 'AWOO+', manifest.core);
          for (const m of (manifest.modules || [])) {
            // A module bundled into a script (REGISTER.md R81) updates with
            // that script, whose own row above already offers it: a second row
            // per module would be N buttons for one install. A standalone copy
            // left over from before the bundle updates itself to a tombstone
            // through Tampermonkey, which needs nothing from here.
            if (m.bundledIn) continue;
            // A retired entry is a tombstone for an old standalone copy. It is
            // not an update: installing it switches the module off, and when
            // the same module also runs from AWOO+ Extras the row could never
            // clear (reported 2026-09-25, Pet Slot Alarm 4.12.1 -> 4.12.2).
            // Tampermonkey delivers the tombstone by itself.
            if (m.retired) continue;
            consider(m.id, m.label || (modules[m.id] && modules[m.id].label) || m.id, m);
          }
          // AWOO+ Extras lives behind the gate, not in the public manifest.
          // Its own per-install manifest says what the gate would serve it;
          // without this the Extras row read "up to date" on any version.
          // A failure here is quiet: the public result still stands.
          const extrasBase = window.__awooExtras && window.__awooExtras.base;
          if (!extrasBase) return entries;
          return fetch(`${extrasBase}/manifest.json`, { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .then((gm) => { if (gm && gm.extras) consider('awoo-extras', 'AWOO+ Extras', gm.extras); return entries; })
            .catch(() => entries);
        })
        .then((entries) => {
          updateState.available = entries;
          updateState.checkedAt = Date.now();
          persistUpdateState();
          if (entries.length && !manual && getSetting('updateNotice') !== false) {
            toast(entries.length === 1
              ? `${entries[0].label} ${entries[0].to} is available`
              : `${entries.length} AWOO+ updates available`,
              { type: 'info', duration: 10000, action: 'Update', onAction: () => openUpdate(entries[0]) });
          }
          return updateState;
        })
        .catch((err) => {
          // Offline, host down, rate-limited. Back off rather than retry, and
          // never toast - an error popup on a flaky connection is worse than
          // no update check at all.
          updateState.error = String((err && err.message) || err);
          updateState.checkedAt = Date.now() - UPDATE_INTERVAL_MS + 15 * 60 * 1000;
          persistUpdateState();
          return updateState;
        })
        .finally(() => {
          updateState.checking = false;
          if (coreUi) renderUpdateRow();
        });
    }

    function openUpdate(entry) {
      if (!entry || !entry.url) return;
      window.open(entry.url, '_blank', 'noopener');
    }

    // ONE shared, debounced resize listener for every open window plus the
    // dropdown — not one per module (§4.4's "≤1 …per module" budget, applied
    // at the framework level instead of duplicated per window). This is the
    // actual gap behind the reported dropdown bug: nothing ever re-checked
    // position against a viewport that had changed size. Closed once, here,
    // for every window this framework will ever have, not just the dropdown.
    let viewportResizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(viewportResizeTimer);
      viewportResizeTimer = setTimeout(() => {
        for (const id of Object.keys(windowRegistry)) windowRegistry[id].reclamp();
        if (coreUi && coreUi.repositionDropdownIfOpen) coreUi.repositionDropdownIfOpen();
      }, 150);
    });

    // Flushes every window's pending debounced geometry save immediately —
    // see windowRegistry[id].flushPendingResize's comment for the bug this
    // closes (a resize whose 300ms debounce got throttled by a hidden tab,
    // then lost outright to a refresh before it ever fired). Cheap to call
    // even when nothing is pending: each flush is a single `if` per window.
    function flushAllPendingWindowResizes() {
      for (const id of Object.keys(windowRegistry)) {
        if (windowRegistry[id].flushPendingResize) windowRegistry[id].flushPendingResize();
      }
    }

    // Coming back to the tab is the moment it matters, and the moment a
    // throttled timer has not fired. Costs nothing while hidden.
    // Closing or leaving the tab: the last chance to save anything pending.
    coreScope.on(window, 'pagehide', flushAllStores);
    // The profile store's pending write and cross-tab delta (R92).
    coreScope.on(window, 'pagehide', flushProfileWrites);
    coreScope.on(document, 'visibilitychange', () => {
      if (document.visibilityState !== 'visible') {
        // GOING hidden, not coming back — the one moment a pending resize
        // save is about to start being throttled, so give it its immediate
        // path to disk right here rather than trusting the debounce to
        // outrun whatever happens next (a refresh, the tab closing, ...).
        flushAllPendingWindowResizes();
        // Same moment, same reason, for every module's saves (Core.store).
        flushAllStores();
        // And the profile's (storage only: see flushProfileWrites).
        flushProfileStorage();
        return;
      }
      reanchorNow();
      // Writes queued while hidden were HELD, not dropped (§5's S2 trap: state
      // must keep advancing while the pixels do not). This is where they land,
      // so coming back to the tab never shows a stale frame.
      scheduler.wake();
    });
    window.addEventListener('pageshow', reanchorNow);
    window.addEventListener('focus', reanchorNow);
    // Belt-and-suspenders alongside the visibilitychange flush above:
    // pagehide fires on an actual navigation/reload/close, including paths
    // (some mobile backgrounding, bfcache eviction) that do not reliably run
    // a visibilitychange first. Same idempotent flush, cheap to call twice.
    window.addEventListener('pagehide', flushAllPendingWindowResizes);

    // An SPA route change replaces the nav, which is exactly when our group
    // gets detached. history.pushState fires no event of its own, so it is
    // wrapped — cheaply, once, and it still calls through.
    //
    // WHOLLY OPTIONAL, AND GUARDED AS SUCH. This is a recovery nicety; an
    // environment where history is absent, frozen, or already wrapped by
    // something protective must not take the entire Core down at init, because
    // the symptom of that is indistinguishable from the bug this is fixing.
    try {
      if (typeof history === 'object' && history) {
        for (const method of ['pushState', 'replaceState']) {
          const original = history[method];
          if (typeof original !== 'function') continue;
          history[method] = function () {
            const result = original.apply(this, arguments);
            setTimeout(reanchorNow, 0);
            return result;
          };
        }
      }
    } catch (e) {
      console.warn('[AwooCore] could not hook history for re-anchoring; the heartbeat still covers it.', e);
    }
    window.addEventListener('popstate', () => setTimeout(reanchorNow, 0));

    // ONE heartbeat, not three. Core previously owned a 3s re-anchor timer, a
    // 5s badge timer and a 5s update poll; three timers that each wake the tab
    // independently is three chances to be the thing that stops it idling, for
    // work that is a few comparisons. Everything here is a no-op in the common
    // case: reanchorNow returns immediately when the group is attached,
    // updateTitleBadge compares before touching document.title, and
    // checkForUpdates returns until 6h have elapsed.
    //
    // 3s is the fastest of the three, and the only one where latency is
    // visible to the user.
    //
    // SLOW TICKS ride the same heartbeat, every tenth beat (~30s, about once a
    // minute in a hidden tab), for Core parts whose work is "check whether
    // something is due" (the daily check-in, src/core/checkin.js). A part gets
    // a hook here instead of an interval of its own, for the reason above.
    let heartbeats = 0;
    const slowTicks = [];
    function onSlowTick(fn) { if (typeof fn === 'function') slowTicks.push(fn); }
    setInterval(() => {
      reanchorNow();
      updateTitleBadge();
      renderProfileRow();
      // First update check after ~30s, then whenever checkForUpdates decides
      // its own 6h interval has passed.
      if (++heartbeats >= 10) checkForUpdates(false);
      if (heartbeats % 10 === 0) {
        for (const fn of slowTicks) {
          try { fn(); } catch (e) { console.warn('[AwooCore] a slow-tick hook threw; the others still run.', e); }
        }
      }
    }, 3000);

    // Named, not returned inline: moduleContext() builds each module's
    // tracking copy of the API on top of this object (Object.create), so it
    // has to be reachable from inside.
    const publicApi = {
      version: AWOO_CORE_VERSION,
      release: RELEASE,
      registerModule, registerLink, setEnabled, setBadge, setOpen,
      // v11: a module reports WHAT IT IS DOING, so the nav can answer
      // "is my tracker still running?" without opening anything.
      setState, openSettings,
      // v12: delegating a feature to the Companion, with an honest fallback.
      companion: companionApi,
      get moduleStates() { return MODULE_STATES.slice(); },
      // shared window framework (v6) — every module's panel and every
      // reusable table/modal/tooltip/input-row is built from these, so there
      // is one window system, not one per module.
      createWindow,
      ui,
      // shared settings (v6.1) — a module reads these rather than keeping
      // its own opinion of e.g. whether to reopen its window on reload.
      getSetting, setSetting,
      // v12: the named themes, and what a tool is handed when it opens.
      // toolHtml(html, extra) returns a tool payload with window.AWOO_APPEARANCE
      // (theme, developer info, tool fonts) and any `extra` window globals
      // inserted AFTER the doctype, so the page stays in standards mode.
      appearance, toolHtml,
      // Settings backup, as pure functions over a Storage — the test seam.
      __settingsBackupForTest: { collect: collectBackup, check: checkBackup, apply: applyBackup },
      get themes() { return THEME_CHOICES(); },
      // module intake — called by every module's shim, and once by Core itself
      claim,
      // transient, non-blocking feedback. Modules should prefer their own
      // panel for anything the user needs to re-read.
      toast,
      checkForUpdates,
      // v13 (R80): for Core parts. onSlowTick(fn) runs fn on every tenth
      // heartbeat; diagnostics is the module usage/error record the daily
      // check-in reports (peek to read, take to read and reset).
      onSlowTick,
      diagnostics: {
        peek: diagnostics.peek, take: diagnostics.take,
        versions() { const out = {}; for (const id of Object.keys(modules)) out[id] = modules[id].version || null; return out; },
      },
      // Read-only views of the two registries, for tests. Named so it is
      // obvious at a call site that anything using them is a test — a module
      // reaching into another module's state through here would be a bug,
      // and the name is the deterrent. Kept because the alternative is
      // asserting against a DOM stub, which tests the stub as much as the code.
      get __modulesForTest() { return modules; },
      get __toolsForTest() { return tools; },
      get __coreUiForTest() { return coreUi; },
      get __windowsForTest() { return windowRegistry; },
      // shared number handling - modules must use these, never their own parser
      parseNumber, formatNumber,
      // SPA route changes, detected once by Core and shared (v9). A module
      // must not wrap history itself — see notifyNavigation above.
      onNavigate,
      // v15: named services between modules (see "THE DAY ONE DID" above).
      provide: (name, api) => provideService('core', name, api),
      use: useService,
      onProvide,
      // ---- the framework layer (v10) — userscripts/FRAMEWORK.md ----
      // A module should own exactly one scope and register EVERYTHING with a
      // lifetime through it. That is what makes "cannot leak" a structural
      // property rather than a review checklist.
      createScope,
      get __coreScopeForTest() { return coreScope; },
      // Test seams for the SETTINGS SURFACE, not for its wiring. They exist
      // because `Core.jobs` shipped correct and unreachable — every API test
      // passed while the feature had no interface at all. A test that calls the
      // API cannot, by construction, notice that a user cannot.
      __openSettingsForTest() { openSettingsWindow(); },
      __settingsRootForTest() { return settingsUi && settingsUi.root; },
      // The local job host (v11). The browser submits and visualises; the host
      // computes and survives the tab closing. server/README.md.
      jobs,
      // live-state probes. All refuse (return null / false) rather than guess.
      walkFiber, walkFiberAll, probeCharacter, probeMergedMultipliers, probeConvexClient,
      profile: profileApi,
      // The profile store's pure parts and its pending work, for
      // tests/profile-store.mjs (R92).
      __profileStoreForTest: {
        mergeBySection, stableJson, sameCharacter, flush: flushProfileWrites,
        pending: () => ({ write: profileWriteTimer !== null, post: profilePostTimer !== null, age: profileAgeTimer !== null }),
        limits: { AGE_MS: PROFILE_AGE_MS, WRITE_MS: PROFILE_WRITE_MS, POST_MS: PROFILE_POST_MS },
      },
      getNumberConvention: getConvention,
      numberProvenance,
      setNumberLocaleOverride,
      get maxQuickButtons() { return registry.barMax; },
      set maxQuickButtons(v) { setBarMax(v); },
      // ---- v14: the lifecycle and the registry (REGISTER.md R69) ----
      // store(key) is only meaningful through a module's own copy of the API,
      // where it is tracked and flushed on unload; Core's own copy saves under
      // the owner "core".
      store: (key, opts) => makeStore('core', key, opts),
      setLoaded: setEnabled,
      setShown, setOrder, setBarMax, setProfileOnBar, resetModuleData,
      get profileOnBar() { return registry.profileOnBar !== false; },
      moduleInfo, listModules,
      get barMax() { return registry.barMax; },
      get order() { return registry.order.slice(); },
      __registryForTest: { migrate: migrateRegistry, get current() { return JSON.parse(JSON.stringify(registry)); } },
    };
    return publicApi;
  })();
  window.__AwooCore = Core;

  // THE OLD CORE, STILL INSTALLED. Because the rebrand changed @name and
  // @namespace, Tampermonkey installs AWOO+ as a new script and leaves
  // "Apoz Core" where it was. The two publish different globals, so the usual
  // two-Cores guard above cannot see it: both would run, both would draw a nav
  // button, and neither would stand down. Checked once now (old Core loaded
  // first) and once a few seconds later (old Core loaded after) — a one-shot
  // timer, never a poll. The notice stays until dismissed, because the fix is
  // a manual step the user has to go and do.
  (function warnIfOldCorePresent() {
    // Spelled in halves so a future find-and-replace of the old brand cannot
    // rewrite the one literal that has to keep the old spelling to work.
    const OLD_GLOBAL = '__' + 'Ap' + 'ozCore';
    let told = false;
    function check() {
      // typeof guard: in a browser `window` always exists; in the test harness the
      // delayed call can land after the stub page has been torn down.
      if (told || typeof window === 'undefined' || !window[OLD_GLOBAL]) return;
      told = true;
      const msg = 'The old "Apoz Core" script is still installed. Remove it in Tampermonkey '
        + '(Dashboard → delete "Apoz Core" and every "Apoz Core: …" script), then reload. '
        + 'AWOO+ replaces it. Settings start fresh.';
      console.warn('[AwooCore] ' + msg);
      try { Core.toast(msg, { type: 'warn', duration: 0 }); } catch (e) { /* console line above still stands */ }
    }
    check();
    setTimeout(check, 4000);
  })();

  // One command to answer "why is it not there?", because every previous
  // round of this has been guesswork over chat. Deliberately a global and
  // deliberately plain text: it is for pasting back, not for programs.
  // THE FLOOR UNDER EVERY OTHER RESET. The menu's reset fixes positions,
  // Settings' fixes sizes, and Settings' own reset fixes preferences — but all
  // three live inside a UI that a bad stored value could, in principle, stop
  // from rendering. This one needs nothing but a console, clears every key
  // this script owns, and says exactly what it removed.
  //
  // Deliberately NOT wired to a button: it throws away window layouts, the job
  // host address and every preference at once, which is a thing to reach for
  // when something is broken, not something to sit one misclick away.
  window.__awooResetCore = function (confirmToken) {
    const keys = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.indexOf('awoo:') === 0 || k.indexOf('awoo-core-') === 0)) keys.push(k);
      }
    } catch (e) { console.warn('[AwooCore] cannot read localStorage:', e); return; }
    if (confirmToken !== 'yes') {
      console.log('[AwooCore] __awooResetCore() would remove ' + keys.length + ' key(s):');
      for (const k of keys) console.log('   ' + k);
      console.log('[AwooCore] This does NOT touch a module\'s own saved data unless listed above.');
      console.log('[AwooCore] Re-run as __awooResetCore("yes") to actually clear them, then reload.');
      return keys;
    }
    for (const k of keys) { try { localStorage.removeItem(k); } catch (e) { /* keep going */ } }
    console.log('[AwooCore] cleared ' + keys.length + ' key(s). Reload the page.');
    return keys;
  };

  window.__awooDiag = function () {
    const q = Array.isArray(window.__awooModules) ? window.__awooModules : [];
    const group = document.getElementById('awoo-core-group');
    const lines = [
      '--- AWOO+ diagnostic ---',
      `Core:      v${Core.version}  release ${Core.release.channel} ${Core.release.version}`,
      // The first question when a change "did not show up" is which copy is on
      // screen. A dev build is the local one loaded off disk by the proxy and
      // updates the moment you rebuild; a live build only changes when
      // Tampermonkey runs an update check, which a page reload does not.
      Core.release.channel === 'dev'
        ? '           ^ LOCAL build via the dev proxy — rebuild + refresh the tab to see changes.'
        : '           ^ INSTALLED build — a page reload does NOT update it; use Check for updates.',
      `Menu:      ${group ? (document.body.contains(group) ? 'present in the page' : 'built but detached') : 'NOT BUILT'}`,
      // Three states, not two. This used to be a bare ternary, so a menu that
      // did not exist reported "in the nav bar" — the diagnostic contradicting
      // its own line above it, which is the fastest way to lose a reader's
      // trust in the whole output.
      `Anchor:    ${!group ? 'n/a — no menu was built' : group.classList.contains('awoo-core-floating') ? 'floating (no nav bar found)' : 'in the nav bar'}`,
      `Nav link:  ${document.querySelector('a[href="/game/log"]') ? 'found' : 'NOT FOUND'}`,
      `Modules:   ${q.length} queued`,
    ];
    for (const e of q) {
      // `hostVersion` differing from `version` means something other than this
      // module's own userscript loaded it — normally the dev proxy, which
      // `@require`s every file into ONE script so they all share its GM_info.
      // Saying so is the point: this line used to print the proxy's version as
      // if it were the module's, which is a wrong answer from the one tool
      // whose job is answering "what am I actually running".
      const loadedBy = e.hostVersion && e.hostVersion !== e.version ? `  [loaded by a v${e.hostVersion} script]` : '';
      lines.push(`  - ${e.id} v${e.version || '?'}`
        + ` ${e.claimed ? 'claimed' : 'NOT CLAIMED'}`
        + `${e.failed ? ' FAILED TO START' : ''}${e.superseded ? ' (OLDER COPY, not run: delete it in Tampermonkey)'
          : e.duplicate ? ' (duplicate, not run: delete one copy in Tampermonkey)' : ''}${loadedBy}`);
    }
    const reg = Core.__modulesForTest;
    lines.push(`Registered: ${Object.keys(reg).join(', ') || 'none'}`);
    // v14: loaded is not the same as running. A lifecycle module that is off
    // never started; one that crashed on the way up is loaded but not running.
    for (const id of Object.keys(reg)) {
      const i = Core.moduleInfo ? Core.moduleInfo(id) : null;
      if (!i) { lines.push(`  - ${id}: ${reg[id].enabled ? 'enabled' : 'disabled'}`); continue; }
      const run = i.lifecycle < 2 ? (i.loaded ? 'loaded (older module: runs even when off)' : 'off (older module: still running)')
        : !i.loaded ? 'off, not started'
          : i.crashed ? 'loaded, CRASHED while starting'
            : i.started ? `loaded, running (started in ${i.startMs} ms)` : 'loaded, not started';
      const h = i.held ? `  holds ${i.held.listeners} listeners, ${i.held.observers} observers, ${i.held.intervals} intervals` : '';
      const where = `${i.shownOnBar ? '' : ' [hidden from bar]'}${i.shownInMenu ? '' : ' [hidden from menu]'}`;
      lines.push(`  - ${id} (${i.kind}): ${run}${where}${h}${i.saveError ? `  SAVE FAILED: ${i.saveError.msg}` : ''}`);
    }
    lines.push(`Tools:     ${Object.keys(Core.__toolsForTest).join(', ') || 'none'}`);
    // Added 2026-09-10 during a real "why didn't my window save its size"
    // report — at the time, answering it needed pasting internal state by
    // hand. `el.id = 'awoo-window-' + spec.id` (createWindow, above) means
    // every registered window's live open/hidden state and its persisted
    // geometry are both readable from just the id, with no new accessor.
    const winIds = Object.keys(Core.__windowsForTest);
    lines.push(`Windows:   ${winIds.join(', ') || 'none'}`);
    for (const id of winIds) {
      const el = document.getElementById('awoo-window-' + id);
      const saved = (() => { try { return localStorage.getItem('awoo:core:window-geometry:' + id); } catch (e) { return null; } })();
      lines.push(`  - ${id}: ${el ? (el.hidden ? 'closed' : `open (${el.offsetWidth}x${el.offsetHeight} @ ${el.style.left},${el.style.top})`) : 'not built'}`
        + `  saved=${saved || 'none'}`);
    }
    lines.push(`Numbers:   ${JSON.stringify(Core.numberProvenance())}`);
    lines.push('--- end ---');
    const text = lines.join('\n');
    console.log(text);
    return text;
  };

  // Paste-and-send helper for when the menu lands in the wrong place. It
  // describes the page's real top-bar structure so the anchor can be aimed at
  // it, instead of another round of guessing at tag names from a screenshot.
  window.__awooWhereIsTheNav = function () {
    const out = [];
    const links = [...document.querySelectorAll('a')].filter((a) => a.offsetParent !== null);
    out.push(`visible <a> on the page: ${links.length}`);
    const game = links.filter((a) => (a.getAttribute('href') || '').includes('/game/'));
    out.push(`...of which contain "/game/": ${game.length}`);
    const groups = new Map();
    for (const a of game) {
      const parent = a.parentElement;
      if (!parent) continue;
      if (!groups.has(parent)) groups.set(parent, []);
      groups.get(parent).push(a);
    }
    const ranked = [...groups.entries()]
      .map(([el, g]) => ({ el, g, top: Math.round(el.getBoundingClientRect().top) }))
      .sort((a, b) => b.g.length - a.g.length)
      .slice(0, 3);
    for (const r of ranked) {
      out.push(`group of ${r.g.length} links, top=${r.top}px, parent=<${r.el.tagName.toLowerCase()}`
        + `${r.el.id ? ' id=' + r.el.id : ''} class="${(r.el.className || '').toString().slice(0, 80)}">`);
      out.push('   hrefs: ' + r.g.slice(0, 8).map((a) => a.getAttribute('href')).join(', '));
    }
    out.push(`<header> present: ${!!document.querySelector('header')}, <nav> present: ${!!document.querySelector('nav')}`);
    const text = out.join('\n');
    console.log(text);
    return text;
  };
  Core.claim(); // pick up any module that loaded before this script did

  // ---- core part: userscripts/src/core/checkin.js ----
  (function () {
  // DIAGNOSTICS CHECK-IN, TWICE A DAY — PART OF CORE (REGISTER.md R80).
  //
  // Reads no data/ fact (Core's NO-PROVENANCE applies); it reports what Core
  // already knows about itself and the character it is running for.
  //
  // WHAT IT SENDS, TWICE A DAY, AND NOTHING ELSE: character name, village,
  // install and browser info, versions and errors. That list is the notice
  // every install page and Core's own @description carry, word for word
  // (DIAGNOSTICS_NOTICE in userscripts/gate/worker.mjs; a test pins that the
  // two say the same). Never inventory, currencies or login details. The gate
  // keeps exactly what gate/store.mjs says it keeps and drops everything else.
  //
  // WHERE. A copy of AWOO+ Extras knows its own install's address on the gate,
  // because the gate writes it into that copy (window.__awooExtras.base), so a
  // gated player reports there and lands on the right branch of the Logs tree.
  // Everyone else reports to the public endpoint with a random install ID. A
  // dev build reports nowhere: it has neither.
  //
  // RULES. No name, no check-in (rule 3): sent only once the character name is
  // known, because a placeholder would file strangers under one name. Fire and
  // forget: never on a render path, never retried in a loop, never a toast on
  // failure. Rides Core's slow tick instead of owning a timer.

  const CHECKIN_KEY = 'awoo:core:checkin:v1';
  const INSTALL_KEY = 'awoo:core:install-id';
  const MOVED_KEY = 'awoo:core:moved-notice';
  // Twice a day since 2026-09-25 (was 20 h, "daily"): 11 h, not 12, keeps
  // the slack the daily cadence had for play sessions that drift. The public
  // notice still says "daily diagnostics", which stays true; changing its
  // wording is a gate deploy (DIAGNOSTICS_NOTICE in gate/worker.mjs).
  const DUE_MS = 11 * 60 * 60 * 1000;
  const RETRY_MS = 60 * 60 * 1000;      // after a send that never reached the gate
  const HTTPS = /^https:\/\//;

  const readJson = (key) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } };
  const writeJson = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* storage blocked: try again next load */ } };

  function installId() {
    try {
      let id = localStorage.getItem(INSTALL_KEY);
      if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
        const bytes = crypto.getRandomValues(new Uint8Array(12));
        let bin = '';
        for (const b of bytes) bin += String.fromCharCode(b);
        id = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        localStorage.setItem(INSTALL_KEY, id);
      }
      return id;
    } catch (e) { return null; }
  }

  /** Where this copy reports, or null. Extras first: it names the exact install. */
  function checkinTarget() {
    const extras = window.__awooExtras;
    if (extras && typeof extras.base === 'string' && HTTPS.test(extras.base)) {
      return { url: extras.base + '/hello', gated: true, extras };
    }
    if (typeof RELEASE.checkinUrl === 'string' && HTTPS.test(RELEASE.checkinUrl)) {
      return { url: RELEASE.checkinUrl, gated: false, extras: null };
    }
    return null;
  }

  function characterName() {
    const p = Core.profile && typeof Core.profile.get === 'function' ? Core.profile.get() : null;
    const fromProfile = p && p.meta && typeof p.meta.characterName === 'string' ? p.meta.characterName.trim() : '';
    if (fromProfile) return { name: fromProfile, profile: p };
    const probe = typeof Core.probeCharacter === 'function' ? Core.probeCharacter() : null;
    const probed = probe && typeof probe.name === 'string' ? probe.name.trim() : '';
    return probed ? { name: probed, profile: p } : null;
  }

  /** The body, or null when there is no name to send. Exported for the test. */
  function checkinPayload(target) {
    const who = characterName();
    if (!who) return null;
    const village = who.profile && who.profile.village && typeof who.profile.village.name === 'string' ? who.profile.village.name : null;
    const versions = Object.assign({ 'awoo-core': RELEASE.version }, Core.diagnostics.versions());
    if (target.extras && typeof target.extras.version === 'string') versions['awoo-extras'] = target.extras.version;
    const d = Core.diagnostics.peek();
    const body = {
      character: who.name,
      village,
      versions,
      used: d.opens,
      errors: d.errors,
      tmVersion: typeof GM_info !== 'undefined' && GM_info && typeof GM_info.version === 'string' ? GM_info.version : null,
    };
    if (!target.gated) body.installId = installId();
    return body;
  }

  let inFlight = false;
  function checkinTick(now = Date.now()) {
    const target = checkinTarget();
    if (!target || inFlight) return null;
    const st = readJson(CHECKIN_KEY) || {};
    if (st.target === target.url && st.sentAt && now - st.sentAt < DUE_MS) return null;
    if (st.failedAt && now - st.failedAt < RETRY_MS) return null;
    const body = checkinPayload(target);
    if (!body || (!target.gated && !body.installId)) return null;
    inFlight = true;
    // text/plain keeps this a "simple" request: no CORS preflight, one round trip.
    return fetch(target.url, {
      method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(body),
      keepalive: true, mode: 'cors', credentials: 'omit', cache: 'no-store',
    })
      .then(() => {
        // Any answer counts as delivered: the gate answers 204 to every
        // check-in it accepts or drops, and a 404 means the key is gone,
        // which asking again tomorrow will not change.
        Core.diagnostics.take();
        writeJson(CHECKIN_KEY, { target: target.url, sentAt: now });
      })
      .catch(() => { writeJson(CHECKIN_KEY, Object.assign({}, st, { failedAt: now })); })
      .finally(() => { inFlight = false; });
  }

  // SEPARATE SCRIPTS THAT ARE NOW PART OF AWOO+ EXTRAS (REGISTER.md R81).
  // Each old per-module gated script updates to a tombstone that leaves one
  // line behind, window.__awooMoved, carrying that key holder's own address for
  // Extras (the gate writes it in). Tampermonkey cannot turn an old script into
  // a differently named one, so this is the one click that finishes the move:
  // a notice with an Install button, shown at most once a day, and never once
  // Extras is running.
  function movedNotice(now = Date.now()) {
    const moved = Array.isArray(window.__awooMoved) ? window.__awooMoved : [];
    if (!moved.length || window.__awooExtras) return false;
    const last = readJson(MOVED_KEY);
    if (last && now - last < 24 * 60 * 60 * 1000) return false;
    const hit = moved.find((m) => m && typeof m.url === 'string' && HTTPS.test(m.url));
    writeJson(MOVED_KEY, now);
    Core.toast('Your separate AWOO+ scripts are now one: AWOO+ Extras.', hit
      ? { type: 'info', duration: 0, action: 'Install', onAction: () => window.open(hit.url, '_blank', 'noopener') }
      : { type: 'info', duration: 0 });
    return true;
  }

  Core.onSlowTick(() => { checkinTick(); movedNotice(); });
  Core.__checkinForTest = { tick: checkinTick, target: checkinTarget, payload: checkinPayload, movedNotice };
  // READ-ONLY, for the Control Panel's Diagnostics page (REGISTER.md R69): when
  // the last check-in went, and when the next is due. It sends nothing.
  Core.checkin = {
    status() {
      const st = readJson(CHECKIN_KEY) || {};
      return {
        enabled: !!checkinTarget(),
        sentAt: st.sentAt || null,
        failedAt: st.failedAt || null,
        dueAt: st.sentAt ? st.sentAt + DUE_MS : null,
      };
    },
  };
  })();

  // ---- core part: userscripts/src/core/profile-sync.js ----
  (function () {
  // PROFILE SYNC — PART OF CORE, NOT A MODULE (2026-09-18).
  //
  // Every module needs the player's live profile, so capturing it is Core's
  // job: an optional module would leave every other module guessing whether
  // the data exists. Built into the Core script by build.mjs buildCore(), which
  // wraps this file in its own function so its names cannot collide with
  // core.js. It runs after Core is constructed; `Core` is in scope.
  //
  // THE IMPORT LAYER RECORDS WHAT IT SAW; IT DERIVES NOTHING. Core consumes no
  // data/ facts by design (buildCore's NO-PROVENANCE), so this file does not
  // turn observations into game-formula results. It used to store a pet slot's
  // boost % computed from pets.slotUpgrade.boostFormula; nothing read it, and
  // every tool that needs the boost computes it from its own facts. The raw
  // slot level is the fact; the percentage is a consumer's calculation.
  //
  // Storage is Core's `awoo:profile:v1` via Core.profile.set(), never written
  // directly here.
  //
  // WHAT ASKS THE GAME FOR DATA, AND HOW OFTEN (REGISTER.md R92). A capture
  // reads the game client's own query cache and asks nothing. Everything that
  // does ask is below THE CATALOGUE, reads only from it, and is bounded in
  // code: background reads run in one tab (the Web Lock leader), one-shot, at
  // most one per query per interval, a minute apart at the least, a few at a
  // time, under an hourly ceiling, never while the socket is down and never
  // with Settings › Profile's switches off; holds are kept for what a player
  // is looking at, capped per tab.
  //
  // The ambient capture: every 15 s until the game's client is attached, then
  // every 60 s, because the client's own transitions drive captures from then
  // on and the poll only keeps the stamps of held queries moving.
  const AMBIENT_POLL_MS = 15_000;
  const AMBIENT_ATTACHED_MS = 60_000;

  const MIN_MS = 60_000;
  const HOUR_MS = 60 * MIN_MS;

  // Canonical base stat order as required by CONVENTIONS.md and optimizer tools
  const BASE_STAT_KEYS = ['strength', 'health', 'dexterity', 'agility'];

  // The last profile this tab committed. NOT the merge base any more: a capture
  // merges onto Core.profile.get(), which also holds what other tabs broadcast
  // (R92). Kept for the test seam only.
  let activeProfile = null;
  let attachedClient = null;
  let captureScheduled = false;
  let captureTimer = null;

  // ---- Query Extraction Helper ----
  // Convex stores active queries in a Map: token ->
  // { udfPath, args, result: { success, value } }.
  //
  // udfPath is Convex's CANONICAL form, "character/public:getActiveCharacter"
  // (the function-reference proxy joins path segments with "/" and puts ":"
  // before the export; see setQuery -> Sc() in the captured bundle). The names
  // normalizeProfile reads, and the captured API surface they are audited
  // against, are dotted: "character.public.getActiveCharacter". Key by the
  // dotted form, or no lookup ever matches: before R45 none did, and every
  // field the profile had came from the fiber/provider fallback.
  function dottedQueryName(udfPath) {
    const [modulePath, exportName = 'default'] = String(udfPath).split(':');
    return `${modulePath.replace(/\.js$/, '').split('/').join('.')}.${exportName}`;
  }

  // WHOSE DOCUMENT IS IT. One query name can be open with several argument
  // sets at once: the game's public profile page asks getLevels, getStats and
  // the rest with ANOTHER player's characterId (ProfileSkillTree `_t`,
  // 1.2.3.12), and R88 subscribes getLevels for each party member. Keyed by
  // name alone, whichever entry came last won, so viewing someone's profile
  // could write their levels into yours. The own character's id is read from
  // getActiveCharacter (or the provider); an entry asked for a different
  // characterId is never the player's own. Those entries are returned apart,
  // in `others[name][characterId]`, for the sections that want them.
  function queryEntries(client) {
    if (!client) return [];
    const optimistic = client.optimisticQueryResults || (client.client && client.client.optimisticQueryResults);
    const queryMap = optimistic && optimistic.queryResults;
    if (!queryMap || typeof queryMap.forEach !== 'function') return [];
    const out = [];
    try {
      queryMap.forEach((entry) => {
        if (!entry || !entry.udfPath) return;
        const res = entry.result;
        if (res && res.success && res.value !== undefined) {
          out.push({ name: dottedQueryName(entry.udfPath), args: entry.args, value: res.value });
        }
      });
    } catch (e) {
      console.warn('[AwooCore:ProfileSync] Failed scanning convex queries:', e);
    }
    return out;
  }

  // Convex keeps a query's args as an array holding one args object in some
  // builds and the object itself in others; read the characterId either way.
  function argCharacterId(args) {
    const a = Array.isArray(args) ? args[0] : args;
    return a && typeof a === 'object' && typeof a.characterId === 'string' ? a.characterId : null;
  }

  function extractConvexQueries(client, ownIdHint, ownVillageHint) {
    return splitQueries(queryEntries(client), ownIdHint, ownVillageHint).own;
  }

  // WHOSE VILLAGE IS IT (R92, found by part B). The village queries name a
  // village, not a character: getVillage is asked with { id }, getBuildings
  // and getStrengths with { villageId } (the catalogue's VILLAGE role, which
  // VILLAGE_ARG below is derived from). Decided by characterId alone, every
  // one of them looked like yours, so hovering another player's village (the
  // game opens getVillage with THEIR village id) wrote their village over
  // yours. The village id in the arguments: a string, null when a village
  // query carries none (not a shape the game uses: unattributable), or
  // undefined for a query that is not a village one.
  function argVillageId(e) {
    const key = VILLAGE_ARG[e.name];
    if (!key) return undefined;
    const a = Array.isArray(e.args) ? e.args[0] : e.args;
    return a && typeof a === 'object' && typeof a[key] === 'string' && a[key] ? a[key] : null;
  }

  // WHICH LOADOUT IS IT. The loadout id in the arguments of a query the
  // catalogue asks once per loadout (LOADOUT_ARG, derived from its rows): a
  // string, null when the arguments carry none, undefined for any other query.
  function argLoadoutId(e) {
    const key = LOADOUT_ARG[e.name];
    if (!key) return undefined;
    const a = Array.isArray(e.args) ? e.args[0] : e.args;
    return a && typeof a === 'object' && typeof a[key] === 'string' && a[key] ? a[key] : null;
  }

  // ownVillageHint: your villageId when getActiveCharacter is not in the
  // cache (the provider's character document, or the profile's
  // meta.villageId); null there means "you have no village", undefined "not
  // known".
  function splitQueries(entries, ownIdHint, ownVillageHint) {
    const own = {};
    const others = {};
    const active = entries.find((e) => e.name === 'character.public.getActiveCharacter');
    const ownId = (active && active.value && typeof active.value._id === 'string' && active.value._id) || ownIdHint || null;
    // The character document names your village, and a document without one
    // says you have none (Convex omits an unset field; normalizeProfile reads
    // it the same way). Without the document, the hint.
    const activeDoc = active && active.value && typeof active.value === 'object' ? active.value : null;
    const ownVillage = activeDoc
      ? (typeof activeDoc.villageId === 'string' && activeDoc.villageId ? activeDoc.villageId : null)
      : (typeof ownVillageHint === 'string' && ownVillageHint ? ownVillageHint : ownVillageHint === null ? null : undefined);
    for (const e of entries) {
      const cid = argCharacterId(e.args);
      if (cid && ownId && cid !== ownId) {
        (others[e.name] = others[e.name] || {})[cid] = e.value;
        continue;
      }
      // Own id unknown and the entry names a character: it is ours only if it
      // is the one such entry. Two means another player's is among them, and
      // refusing (rule 3) beats picking one.
      if (cid && !ownId && entries.some((o) => o !== e && o.name === e.name && argCharacterId(o.args) && argCharacterId(o.args) !== cid)) continue;
      // A village query is yours only when it names YOUR village. Yours not
      // known: the same rule as above, ours only as the one such entry. No
      // village of your own, or no village id in the arguments: someone
      // else's, or nobody can tell; either way not taken (rule 3).
      const vid = argVillageId(e);
      if (vid !== undefined) {
        if (vid === null || ownVillage === null) continue;
        if (ownVillage !== undefined && vid !== ownVillage) continue;
        if (ownVillage === undefined && entries.some((o) => o !== e && o.name === e.name && argVillageId(o) && argVillageId(o) !== vid)) continue;
      }
      // A query asked once per loadout (a sculpture preset's grid, a skill
      // tree's points) is open for several ids at once while the game or the
      // catalogue reads them, so it is kept per id: own[name] = { [id]: value }.
      // No id in the arguments: nobody can tell which loadout, so not taken.
      const kid = argLoadoutId(e);
      if (kid !== undefined) {
        if (kid) (own[e.name] = own[e.name] || {})[kid] = e.value;
        continue;
      }
      own[e.name] = e.value;
    }
    return { own, others, ownId };
  }

  // ---- Live React provider discovery ----
  // Queslar's current client (live-verified 2026-09-22) exposes two useful
  // provider props directly on fibers:
  //   memoizedProps.client.cachedSync -> Convex sync client
  //   memoizedProps.value             -> character context
  //
  // Core.walkFiber intentionally does not deep-crawl arbitrary application
  // objects. Do not make it recurse through tens of thousands of objects just
  // to reach these two known provider props. Walk fibers only, and inspect the
  // exact provider locations the live page proved.
  function scanReactProvidersForProfileData(startFiber) {
    const out = { client: null, context: null };
    let start = startFiber || null;

    if (!start && typeof document !== 'undefined') {
      const host = document.getElementById('root');
      if (host) {
        const key = Object.keys(host).find((k) =>
          k.startsWith('__reactContainer$') || k.startsWith('__reactFiber$'));
        if (key) start = host[key];
      }
    }
    if (!start || typeof start !== 'object') return out;

    const stack = [start];
    const seen = new Set();
    let visited = 0;
    while (stack.length && visited < 30000 && (!out.client || !out.context)) {
      const fiber = stack.pop();
      if (!fiber || typeof fiber !== 'object' || seen.has(fiber)) continue;
      seen.add(fiber);
      visited++;

      const props = fiber.memoizedProps;
      if (props && typeof props === 'object') {
        const cached = props.client && props.client.cachedSync;
        if (!out.client && cached && typeof cached === 'object' &&
            cached.optimisticQueryResults && cached.remoteQuerySet) {
          out.client = cached;
        }

        const value = props.value;
        if (!out.context && value && typeof value === 'object' && value.characterData &&
            (value.characterCurrency || value.characterLevels || value.characterMergedStats)) {
          out.context = value;
        }
      }

      if (fiber.child) stack.push(fiber.child);
      if (fiber.sibling) stack.push(fiber.sibling);
    }
    return out;
  }

  // ---- Tier 2: Fiber / provider fallback ----
  // `generic: false` skips the Core.walkFiber sweep below (capture cost, R92):
  // once the client is attached the query cache and the provider carry
  // everything it could find. The provider read at the top always runs.
  function scanFiberForProfileData(liveContext, { generic = true } = {}) {
    const data = {};
    const context = liveContext || scanReactProvidersForProfileData().context;

    // Live-verified provider context. These are raw observations only.
    if (context && typeof context === 'object') {
      if (context.characterData && typeof context.characterData === 'object') {
        // The provider's characterData IS getActiveCharacter's document
        // (CharacterDataProvider opens that query and hands its answer down,
        // 2026-09-23 bundle). Kept as found, so normalizeProfile can tell a
        // real character document from a profile-shaped bag the generic
        // sweep below turned up: only a real one may say "no party".
        data.characterDoc = context.characterData;
        data.character = Object.assign({}, context.characterData);
        if (context.characterLevels && typeof context.characterLevels.battling === 'number') {
          data.character.level = context.characterLevels.battling;
        }
      }
      if (context.characterCurrency && typeof context.characterCurrency === 'object') {
        data.currency = context.characterCurrency;
      }
      if (context.characterLevels && typeof context.characterLevels === 'object') {
        data.levels = context.characterLevels;
      }
      if (context.characterEquipmentSlots && typeof context.characterEquipmentSlots === 'object') {
        data.equipmentSlots = context.characterEquipmentSlots;
      }
      // Do NOT call characterMergedStats "base stats". The live account proved
      // these are post-multiplier character totals, not the base-stat values
      // Profile Sync's baseStats field promises.
      if (context.characterMergedStats && typeof context.characterMergedStats === 'object') {
        data.characterMergedStats = context.characterMergedStats;
      }
    }

    // Older/generic fallback remains useful for pages whose component already
    // exposes a profile-shaped bag directly.
    if (!generic || !Core || !Core.walkFiber) return data;
    Core.walkFiber((cand) => {
      if (!cand || typeof cand !== 'object') return false;

      if (!data.baseStats && typeof cand.strength === 'number' && typeof cand.health === 'number' &&
          typeof cand.dexterity === 'number' && typeof cand.agility === 'number' &&
          cand.strength > 0 && !cand.monsterGoldFlat) {
        data.baseStats = {
          strength: cand.strength,
          health: cand.health,
          dexterity: cand.dexterity,
          agility: cand.agility,
        };
      }
      if (!data.mergedMultipliers && typeof cand.monsterGoldFlat === 'number' &&
          typeof cand.monsterGoldPercentage === 'number') data.mergedMultipliers = cand;
      if (!data.character && typeof cand.level === 'number' && cand.level > 0 && (cand.name || cand.experience)) data.character = cand;
      if (!data.partner && cand.partner && typeof cand.partner === 'object') data.partner = cand.partner;
      if (!data.pets && cand.petSlots && typeof cand.petSlots === 'object') data.pets = cand;
      if (!data.sanctum && Array.isArray(cand.activeSanctums)) data.sanctum = cand.activeSanctums;
      if (!data.sculpture && cand.sculptureMultipliers && typeof cand.sculptureMultipliers === 'object') data.sculpture = cand;
      return false;
    }, false);

    return data;
  }

  // ---- Tier 3: DOM Fallback ----
  // Strict non-guessing reader for in-page stats (e.g. from #tutorial-stats or sidebar).
  function scanDomForProfileData() {
    const data = {};
    try {
      const statContainer = document.querySelector('#tutorial-stats') || document.querySelector('.player-stats');
      if (statContainer) {
        const text = statContainer.textContent || '';
        const parseStat = (name) => {
          const re = new RegExp(name + '[:\\s]+([0-9,.]+)', 'i');
          const m = text.match(re);
          if (!m) return null;
          return Core.parseNumber ? Core.parseNumber(m[1]) : parseFloat(m[1].replace(/,/g, ''));
        };
        const str = parseStat('Strength');
        const hp = parseStat('Health');
        const dex = parseStat('Dexterity');
        const agi = parseStat('Agility');
        if (str !== null && hp !== null && dex !== null && agi !== null) {
          data.baseStats = { strength: str, health: hp, dexterity: dex, agility: agi };
        }
      }
    } catch (e) { /* refuse on error */ }
    return data;
  }

  // Every finite number in a game document, minus Convex's own bookkeeping
  // (_creationTime). Used where the document IS the observation, keyed the way
  // the game keys it: relic-boost levels, village strengths, character levels.
  // null when nothing numeric is there, never an empty object that reads OK.
  function numericFields(doc) {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null;
    const out = {};
    for (const k of Object.keys(doc)) {
      if (k.charAt(0) === '_') continue;
      if (typeof doc[k] === 'number' && isFinite(doc[k])) out[k] = doc[k];
    }
    return Object.keys(out).length ? out : null;
  }

  // A loadout list (sculpture presets, skill-tree presets): the game's
  // documents are { _id, name, isActive, ... } (the schema's
  // characterSculpturePreset and characterSanctumSkillTreePreset, 2026-09-23
  // bundle), and its pages show name and "Active" from exactly these fields.
  // null when the answer is not a list; a document without an id is dropped.
  function loadoutList(raw) {
    if (!Array.isArray(raw)) return null;
    return raw.filter((d) => d && typeof d === 'object' && typeof d._id === 'string' && d._id)
      .map((d) => ({
        id: d._id,
        name: typeof d.name === 'string' ? d.name : null,
        active: typeof d.isActive === 'boolean' ? d.isActive : null,
      }));
  }

  // ---- Normalization Engine: schema awoo:profile:v1 ----
  // Pure function: takes extracted queries and fiber data, produces canonical profile.
  // INVARIANT (§9.4): refuse rather than guess. Unobserved values MUST be null, never 0.
  // known.skillTrees: your skill-tree ids from earlier captures (the profile's
  // loadouts.skillTreePresets), for telling your trees' points from a stranger's.
  function normalizeProfile(q = {}, fiber = {}, dom = {}, others = {}, ownId = null, known = {}) {
    // 1. Character & Core
    const queryChar = q['character.public.getActiveCharacter'] || null;
    const providerChar = fiber.character && typeof fiber.character === 'object' ? fiber.character : null;
    const rawChar = queryChar ||
                    providerChar ||
                    (Core.probeCharacter ? Core.probeCharacter() : null) || {};
    const rawCurrency = fiber.currency && typeof fiber.currency === 'object' ? fiber.currency : {};
    const currencyValue = (key) => {
      const entry = rawCurrency[key];
      return entry && typeof entry.value === 'number' ? entry.value : null;
    };

    const charName = typeof rawChar.name === 'string' ? rawChar.name : null;
    // THE LEVEL WAS NULL ON EVERY CAPTURE WITH THE CLIENT ATTACHED (found by
    // checking, R92). getActiveCharacter carries no level (the captured
    // document, capture/api/convex-2026-09-25/party-capture.json, has only
    // _id, name, partyId, villageId, userId and gameMode), and the query
    // document wins over the provider's above, so the provider's level was
    // never read once the query cache was reachable, which is always. The
    // level is the provider's characterLevels.battling (scanFiberForProfileData
    // puts it on fiber.character.level), taken only when both documents name
    // the same character; a query document that ever carries a level wins.
    const sameChar = !queryChar || !providerChar || !queryChar._id || !providerChar._id || queryChar._id === providerChar._id;
    const charLevel = typeof rawChar.level === 'number' ? Math.round(rawChar.level)
      : (sameChar && providerChar && typeof providerChar.level === 'number' ? Math.round(providerChar.level) : null);
    const vipLevel = typeof rawChar.vip === 'number' ? rawChar.vip : (typeof rawChar.vipLevel === 'number' ? rawChar.vipLevel : null);
    const gold = typeof rawChar.gold === 'number' ? rawChar.gold :
                 (typeof rawChar.gold === 'string' ? Core.parseNumber(rawChar.gold) : currencyValue('gold'));
    const credits = typeof rawChar.credits === 'number' ? rawChar.credits : currencyValue('credits');

    // 2. Base Stats
    const rawStats = q['character.stats.public.getStats'] || fiber.baseStats || dom.baseStats || null;
    let baseStats = null;
    if (rawStats && typeof rawStats === 'object') {
      const s = typeof rawStats.strength === 'number' ? rawStats.strength : null;
      const h = typeof rawStats.health === 'number' ? rawStats.health : null;
      const d = typeof rawStats.dexterity === 'number' ? rawStats.dexterity : null;
      const a = typeof rawStats.agility === 'number' ? rawStats.agility : null;
      if (s !== null || h !== null || d !== null || a !== null) baseStats = { strength: s, health: h, dexterity: d, agility: a };
    }

    // 3. Merged Multipliers & Boosts
    const merged = q['character.queries.getMergedMultipliers'] ||
                   fiber.mergedMultipliers ||
                   (Core.probeMergedMultipliers ? Core.probeMergedMultipliers() : null) || {};
    const rawBoosts = q['character.boosts.public.getMergedBoosts'] ||
                      q['character.boosts.public.getBoosts'] || {};

    // statBoosts: a per-SOURCE breakdown (equipment, gems, relics...) that no
    // captured query returns. getMergedMultipliers is keyed by MODIFIER
    // (capture/api/LIVE-merged-multipliers.json: stat, statStrength, gold,
    // partnerSpeedFlat...), never by source, so every statX field below was
    // null on the live page; the game builds the breakdown client-side from
    // about twenty queries (IncomeHoverCardWrapper). Kept for the day a real
    // source is read; it is null unless one of those fields is actually
    // present, so the panel stops calling an empty section OK.
    let statBoosts = null;
    const hasAnyBoost = rawBoosts.equipment !== undefined || merged.statEquipment !== undefined;
    if (hasAnyBoost) {
      statBoosts = {
        equipment: typeof rawBoosts.equipment === 'number' ? rawBoosts.equipment : (typeof merged.statEquipment === 'number' ? merged.statEquipment : null),
        gems: typeof rawBoosts.gems === 'number' ? rawBoosts.gems : (typeof merged.statGems === 'number' ? merged.statGems : null),
        relics: typeof rawBoosts.relics === 'number' ? rawBoosts.relics : (typeof merged.statRelics === 'number' ? merged.statRelics : null),
        battleBoosts: typeof rawBoosts.battleBoosts === 'number' ? rawBoosts.battleBoosts : (typeof merged.statBattleBoosts === 'number' ? merged.statBattleBoosts : null),
        combatPet: typeof rawBoosts.combatPet === 'number' ? rawBoosts.combatPet : (typeof merged.statCombatPet === 'number' ? merged.statCombatPet : null),
        pvpTiles: typeof rawBoosts.pvpTiles === 'number' ? rawBoosts.pvpTiles : (typeof merged.statPvpTiles === 'number' ? merged.statPvpTiles : null),
        villageBuildings: typeof rawBoosts.villageBuildings === 'number' ? rawBoosts.villageBuildings : (typeof merged.statVillageBuildings === 'number' ? merged.statVillageBuildings : null),
        villageService: typeof rawBoosts.villageService === 'number' ? rawBoosts.villageService : (typeof merged.statVillageService === 'number' ? merged.statVillageService : null),
        sanctumMultipliers: typeof rawBoosts.sanctumMultipliers === 'number' ? rawBoosts.sanctumMultipliers : (typeof merged.statSanctumMultipliers === 'number' ? merged.statSanctumMultipliers : null),
        partnerDropStats: typeof rawBoosts.partnerDropStats === 'number' ? rawBoosts.partnerDropStats : (typeof merged.statPartnerDropStats === 'number' ? merged.statPartnerDropStats : null),
        totalMultiplier: typeof merged.stat === 'number' ? merged.stat : null,
      };
    }

    // The merged multipliers themselves, as observed: every numeric key, raw.
    // This is the one real modifier-keyed source the tools can read (Pet Slot
    // ROI needs gold/potionEffect/monsterGold*, the gathering model needs
    // partnerSpeedFlat/partnerIntelligenceFlat/partnerBoostFlat/meat/iron/
    // wood/stone/resource/partnerAs*). A record, not a derivation.
    let mergedMultipliers = null;
    if (merged && typeof merged === 'object') {
      const out = {};
      for (const k of Object.keys(merged)) if (typeof merged[k] === 'number' && isFinite(merged[k])) out[k] = merged[k];
      if (Object.keys(out).length) mergedMultipliers = out;
    }

    let incomeBoosts = null;
    if (merged.monsterGoldFlat !== undefined || merged.monsterGoldPercentage !== undefined) {
      incomeBoosts = {
        monsterGoldFlat: typeof merged.monsterGoldFlat === 'number' ? merged.monsterGoldFlat : null,
        monsterGoldPercentage: typeof merged.monsterGoldPercentage === 'number' ? merged.monsterGoldPercentage : null,
        potionEffect: typeof merged.potionEffect === 'number' ? merged.potionEffect : null,
        relicBoost: typeof merged.goldRelic === 'number' ? merged.goldRelic : null,
      };
    }

    // 3b. Character levels, relic-shop boost levels.
    // SHAPES: capture/api/live-2026-08-24/levels.json ({battling, crafting,
    // sanctum, ...Experience}) and LIVE-boosts.json ({critChance: 49300,
    // miningBoost: 25234, ...}), the official API's copies of the same
    // documents these Convex queries return. Levels also come from the
    // character provider (characterLevels), which the live page always has.
    // The <skill>Experience fields are the EXP into the current level (the
    // captured document has them), which Party's EXP tab needs to say how many
    // levels a run gains (REGISTER.md R88).
    const LEVEL_KEYS = ['battling', 'crafting', 'sanctum', 'battlingExperience', 'craftingExperience', 'sanctumExperience'];
    const pickLevels = (raw) => {
      if (!raw) return null;
      const out = {};
      for (const k of LEVEL_KEYS) out[k] = typeof raw[k] === 'number' ? raw[k] : null;
      return out;
    };
    const levels = pickLevels(numericFields(q['character.levels.public.getLevels'] || fiber.levels || null));
    const relicBoosts = numericFields(q['character.boosts.public.getBoosts'] || null);

    // 4. Pets & Pet Slots
    const rawPetSlots = q['pets.queries.getPetSlots'] || (fiber.pets && fiber.pets.petSlots) || null;
    const rawEquippedPets = q['pets.queries.getEquippedPets'] || (fiber.pets && fiber.pets.equippedPets) || null;
    let pets = null;
    if (rawPetSlots || rawEquippedPets) {
      // The slot document keys each level as "<type>Level" (combatLevel,
      // utilityLevel, gatheringLevel): the bundle reads it as
      // petSlots[`${type}Level`] (CharacterDataProvider pt(e) and the pet
      // pages, 1.2.3.12). This read petSlots[type].level until 2026-09-23, a
      // shape nothing returns, so every synced slot level was null.
      const getSlotData = (type) => {
        const raw = rawPetSlots && rawPetSlots[type + 'Level'];
        const lvl = typeof raw === 'number' && isFinite(raw) ? raw : null;
        const equipped = Array.isArray(rawEquippedPets)
          ? rawEquippedPets.filter((pet) => pet && pet.type === type)
          : null;
        return { slotLevel: lvl, equipped };
      };
      pets = {
        combat: getSlotData('combat'),
        utility: getSlotData('utility'),
        gathering: getSlotData('gathering'),
      };
    }

    // 5. Partner
    // getPartner returns the ARRAY of the character's partner documents (the
    // Partners page reads a.length / a.findIndex on it, 1.2.3.12), each with
    // boosts {speed, intelligence}, stats {strength, health, agility,
    // dexterity}, skills {hunting, mining, woodcutting, stonecarving} and
    // skillType. It was read as one object carrying .speed/.intelligence/
    // .roster until 2026-09-23, so the section held three nulls and the panel
    // called it OK. Each document is recorded field by field; a field the
    // document does not carry stays null.
    //
    // No action interval here, on purpose: speed is the observation; the
    // engine derives the interval from it (engine/income/partners.js). This
    // line once reported a hard-coded 10 s for every partner.
    const rawPartners = q['partner.public.getPartner'] || fiber.partner || null;
    let partner = null;
    if (Array.isArray(rawPartners)) {
      const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
      const pick = (obj, keys) => {
        if (!obj || typeof obj !== 'object') return null;
        const out = {};
        for (const k of keys) out[k] = num(obj[k]);
        return out;
      };
      partner = {
        count: rawPartners.length,
        roster: rawPartners.filter((d) => d && typeof d === 'object').map((d) => ({
          id: typeof d._id === 'string' ? d._id : null,
          name: typeof d.name === 'string' ? d.name : null,
          skillType: typeof d.skillType === 'string' ? d.skillType : null,
          speed: num(d.boosts && d.boosts.speed),
          intelligence: num(d.boosts && d.boosts.intelligence),
          stats: pick(d.stats, ['strength', 'health', 'agility', 'dexterity']),
          skills: pick(d.skills, ['hunting', 'mining', 'woodcutting', 'stonecarving']),
        })),
      };
    }

    // 6. Sanctum
    const rawSanctums = q['sanctum.public.getActiveSanctums'] || fiber.sanctum || null;
    const rawSkillTree = q['sanctum.skilltree.public.getActiveSkillTreePoints'] || null;
    // skillTreePoints: the points bought with gold, which the Party Shop prices
    // the next ones from (sanctum.skillTree.pointCostFormula). BUNDLE: the
    // schema's characterSanctumCore {characterId, skillTreePoints,
    // dailySanctumsRemaining}, and the Skill Tree page reads
    // `.skillTreePoints` off it (1.2.3.12). No live document captured yet.
    const rawSanctumCore = q['sanctum.public.getSanctumCore'] || null;
    let sanctum = null;
    if (rawSanctums || rawSkillTree || rawSanctumCore) {
      const goldKeyUnlocked = rawSkillTree
        ? (Array.isArray(rawSkillTree) ? rawSkillTree.includes('w_key_gold') : Boolean(rawSkillTree.w_key_gold))
        : null;
      sanctum = {
        activeSanctums: Array.isArray(rawSanctums) ? rawSanctums : null,
        goldKeyPartnerStatsUnlocked: goldKeyUnlocked,
        skillTreePoints: rawSanctumCore && typeof rawSanctumCore.skillTreePoints === 'number' ? rawSanctumCore.skillTreePoints : null,
      };
    }

    // 7. Sculpture
    const rawSculptMultipliers = q['fighters.sculptures.public.getSculptureMultipliers'] ||
                                 (fiber.sculpture && fiber.sculpture.sculptureMultipliers) || null;
    let sculpture = null;
    if (rawSculptMultipliers) {
      sculpture = {
        multipliers: rawSculptMultipliers && typeof rawSculptMultipliers === 'object' ? {
          strength: typeof rawSculptMultipliers.strength === 'number' ? rawSculptMultipliers.strength : null,
          health: typeof rawSculptMultipliers.health === 'number' ? rawSculptMultipliers.health : null,
          dexterity: typeof rawSculptMultipliers.dexterity === 'number' ? rawSculptMultipliers.dexterity : null,
          agility: typeof rawSculptMultipliers.agility === 'number' ? rawSculptMultipliers.agility : null,
        } : null,
      };
    }

    // 8. Fighters
    const rawFighters = q['fighters.public.getCharacterFightersRaw'] ||
                        q['fighters.public.getActivePresetFighters'] || null;
    let fighters = null;
    if (rawFighters) {
      fighters = {
        roster: Array.isArray(rawFighters) ? rawFighters : (Array.isArray(rawFighters.fighters) ? rawFighters.fighters : null),
      };
    }

    // 9. Equipment & Gems
    const rawEquipSlots = q['equipment.queries.getEquipmentSlots'] || fiber.equipmentSlots || null;
    const rawGems = q['character.gems.queries.getEquippedGems'] || null;
    let equipment = null;
    if (rawEquipSlots || rawGems) {
      equipment = {
        slots: rawEquipSlots && typeof rawEquipSlots === 'object' && !Array.isArray(rawEquipSlots) ? rawEquipSlots : null,
        gems: Array.isArray(rawGems) ? rawGems : null,
      };
    }

    // 9b. Loadouts: the game's saved setups, each kind listed by one query
    // and some opened one loadout at a time. Their own section, so reading
    // them is paid only by a module that declares it uses them (the catalogue
    // reads by section): Party reads the sanctum section and has no use for
    // skill-tree presets.

    // Sculpture presets. The Sculptures page lists them with
    // getPresets({ characterId }) and opens one grid at a time with
    // getSculptureGrid({ characterId, presetId }), the active one first
    // (SculpturesPage, 2026-09-23 bundle). So a grid is kept per preset, by
    // the presetId it was asked with. CAPTURE: every placed sculpture's
    // `grid.presetId` names its preset (capture/api/LIVE-sculpture-grid.json);
    // a grid holding one that disagrees with its key is not taken (rule 3).
    // An empty grid is an observation: that preset has nothing placed.
    const sculpturePresets = loadoutList(q['fighters.sculptures.presets.getPresets']);
    let sculptureGrids = null;
    const rawGrids = q['fighters.sculptures.public.getSculptureGrid'];
    if (rawGrids && typeof rawGrids === 'object' && !Array.isArray(rawGrids)) {
      for (const [presetId, rows] of Object.entries(rawGrids)) {
        if (!Array.isArray(rows)) continue;
        if (rows.some((r) => !r || (r.grid && r.grid.presetId !== undefined && r.grid.presetId !== presetId))) continue;
        (sculptureGrids = sculptureGrids || {})[presetId] = rows;
      }
    }

    // Skill-tree presets. The Skill Tree page lists them with
    // getSkillTrees({ characterId }) and opens one preset's bought nodes with
    // getSkillTreePoints({ skillTreeId }): rows of the schema's
    // characterSanctumSkillTreePresetPoints, the page reading `.skillNodeId`
    // off each (ProfileSkillTree, 2026-09-23 bundle). No live document
    // captured yet. The points query names no character, and the public
    // profile page opens it for a STRANGER's trees too, so a tree's nodes are
    // taken only when the tree is yours: in this capture's own list, or the
    // one seen before (known.skillTrees).
    const skillTreePresets = loadoutList(q['sanctum.skilltree.public.getSkillTrees']);
    const ownTrees = new Set([...(skillTreePresets || []).map((t) => t.id),
      ...(Array.isArray(known.skillTrees) ? known.skillTrees : [])]);
    let skillTreeNodes = null;
    const rawTreePoints = q['sanctum.skilltree.public.getSkillTreePoints'];
    if (rawTreePoints && typeof rawTreePoints === 'object') {
      for (const [treeId, rows] of Object.entries(rawTreePoints)) {
        if (!ownTrees.has(treeId) || !Array.isArray(rows)) continue;
        const nodes = rows.map((r) => (r && typeof r.skillNodeId === 'string' ? r.skillNodeId : null));
        if (nodes.includes(null)) continue;
        (skillTreeNodes = skillTreeNodes || {})[treeId] = nodes;
      }
    }

    // Item sets: the game's swappable sets, each naming the gear,
    // gem and enchant per slot, three pets, a skill-tree preset and a
    // sculpture preset. BUNDLE: the schema's characterItemSets, every field
    // but characterId and name optional; the equipment sidebar holds
    // getCharacterItemSets({ characterId }) on every game page (page-wqOaeWAP,
    // "Sets (n)"). No live document captured yet. Ids only: what an id's item
    // is comes from elsewhere. A field the set leaves unset is null (Convex
    // omits it): nothing in that place.
    const rawSets = q['sets.public.getCharacterItemSets'];
    const idOf = (v) => (typeof v === 'string' && v ? v : null);
    const itemSets = Array.isArray(rawSets)
      ? rawSets.filter((d) => d && typeof d === 'object' && idOf(d._id)).map((d) => {
        const slots = {};
        for (const slot of ['leftHand', 'rightHand', 'head', 'body', 'hands', 'legs', 'feet']) {
          slots[slot] = { item: idOf(d[slot]), gem: idOf(d[`${slot}Gem`]), enchant: idOf(d[`${slot}Enchant`]) };
        }
        return {
          id: d._id,
          name: typeof d.name === 'string' ? d.name : null,
          assignment: Array.isArray(d.assignment) ? d.assignment : null,
          skillTree: idOf(d.skillTree),
          sculpturePreset: idOf(d.sculptureSet),
          slots,
          pets: { combat: idOf(d.combat), utility: idOf(d.utility), gathering: idOf(d.gathering) },
        };
      })
      : null;
    let loadouts = null;
    if (sculpturePresets || sculptureGrids || skillTreePresets || skillTreeNodes || itemSets) {
      loadouts = { sculpturePresets, sculptureGrids, skillTreePresets, skillTreeNodes, itemSets };
    }

    // 10. Village. PvP remains null until capture-verified.
    const rawVillage = q['village.queries.getVillage'] || null;
    const rawVillageBuildings = q['village.queries.getBuildings'] || null;
    // SHAPE: capture/api/LIVE-village-strengths.json ({brave: 33, loyal: 20, ...}).
    const villageStrengths = numericFields(q['village.queries.getStrengths'] || null);
    let village = null;
    if (rawVillage || rawVillageBuildings || villageStrengths) {
      village = {
        // The village's own name, for the daily check-in (REGISTER.md R80).
        // INFER tier: the official API's village document has a required
        // string `name` (capture/api/openapi.json, /api/character/village/base),
        // and getVillage is taken to return the same document. Null whenever
        // it is not a non-empty string, never a guess (rule 3); the merge
        // below keeps the last name seen while the village page is closed.
        name: rawVillage && typeof rawVillage.name === 'string' && rawVillage.name.trim() ? rawVillage.name.trim() : null,
        buildings: Array.isArray(rawVillageBuildings) ? rawVillageBuildings :
          (rawVillageBuildings && typeof rawVillageBuildings === 'object' ? rawVillageBuildings : null),
        strengths: villageStrengths,
        pvpTiles: null,
      };
    }

    // 11. Party (REGISTER.md R88). Every shape below is CAPTURE:
    // capture/api/convex-2026-09-25/party-capture.json and
    // party-capture-after-action.json, normalized by
    // tests/profile-sync-real-captures.mjs. The game's own id strings are
    // kept; nothing here is a game formula.
    const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
    const str = (v) => (typeof v === 'string' && v ? v : null);

    // The overview is opened by the Party page, or by Core itself while a
    // module uses it (the catalogue, R92). It carries no levels (partyLevels).
    // It replaces party.public.getParty, whose shape was never traced.
    const rawOverview = q['party.public.getOverview'] || null;
    let party = null;
    if (rawOverview && typeof rawOverview === 'object' && Array.isArray(rawOverview.members)) {
      party = {
        id: str(rawOverview._id),
        name: str(rawOverview.name),
        ownerId: str(rawOverview.ownerId),
        members: rawOverview.members.filter((m) => m && typeof m === 'object').map((m) => ({
          characterId: str(m.characterId) || str(m.character && m.character._id),
          name: str(m.character && m.character.name),
          actionsType: str(m.characterActions && m.characterActions.actionsType),
          isIdle: m.characterActions && typeof m.characterActions.isIdle === 'boolean' ? m.characterActions.isIdle : null,
          actionsRemaining: num(m.partyMembersActions && m.partyMembersActions.actionsRemaining),
          // monsterId IS the monster level: getPartyMonsterBattleStats
          // reports battleStats.level equal to it ("Monster 438199").
          monsterLevel: num(m.partyMembersActionsMonster && m.partyMembersActionsMonster.monsterId),
          // Every numeric merged key, raw, as the own mergedMultipliers section
          // keeps them: the EXP model reads monsterExperienceFlat/Percentage.
          mergedMultipliers: numericFields(m.characterMergedMultipliers),
        })),
      };
    }

    // The sidebar's Party Actions widget keeps getActions open on every page.
    // actionsToUse is the in-game "max actions"; lastRefresh is the last
    // daily reset (00:00 UTC in the capture).
    const rawActions = q['party.combat.public.getActions'] || null;
    const partyActions = rawActions && typeof rawActions === 'object' ? {
      actionsRemaining: num(rawActions.actionsRemaining),
      actionsToUse: num(rawActions.actionsToUse),
      lastRefresh: num(rawActions.lastRefresh),
    } : null;

    // The last party action's outcome, a reading. Gain is before tax; the tax
    // share is tax / gain (the capture: 972,436,655 of 31,442,118,515). Which
    // reading is the RUN's rate is decided at the merge (foldPartyLastAction),
    // the one place that sees the reading before this one.
    const rawLast = q['party.combat.public.getLastActionState'] || null;
    const outcome = rawLast && rawLast.lastActionState && rawLast.lastActionState.combatOutcome;
    let partyLastAction = null;
    if (outcome && typeof outcome === 'object') {
      const part = (o) => (o && typeof o === 'object'
        ? { gain: num(o.gain), tax: num(o.tax), taxEfficiency: num(o.taxEfficiency) } : null);
      const stats = rawLast.lastActionState.combatStatistics || {};
      const reading = {
        gold: part(outcome.gold),
        experience: part(outcome.experience),
        rounds: num(stats.rounds),
        // Two readings with the same outcome are one action seen twice. The
        // attack and crit counts make two real actions all but never collide.
        key: [outcome.gold && outcome.gold.gain, outcome.gold && outcome.gold.tax,
          outcome.experience && outcome.experience.gain, stats.rounds, stats.playerAttacks, stats.playerCrits].join('|'),
        seenAt: Date.now(),
      };
      partyLastAction = { last: reading, run: null, streak: 1 };
    }

    // The player's own party monster. Per member: the overview carries each
    // member's own (four members, three different levels, in the capture).
    const rawMonster = q['party.combat.public.getActionsMonster'] || null;
    const partyMonster = rawMonster && typeof rawMonster === 'object' ? {
      level: num(rawMonster.monsterId),
      area: num(rawMonster.area),
    } : null;

    // Levels by characterId: the player's own getLevels and any a watch opened
    // for another member (getLevels with their characterId, the query the
    // game's public profile page opens). Own levels stay in `levels`.
    const otherLevels = others['character.levels.public.getLevels'] || null;
    let partyLevels = null;
    if (otherLevels && typeof otherLevels === 'object') {
      for (const cid of Object.keys(otherLevels)) {
        const lv = pickLevels(numericFields(otherLevels[cid]));
        if (lv) (partyLevels = partyLevels || {})[cid] = lv;
      }
    }

    let source = 'convex';
    if (Object.keys(q).length === 0) source = Object.keys(fiber).length > 0 ? 'fiber' : 'dom';

    const now = Date.now();
    const sections = {
      core: { name: charName, level: charLevel, vipLevel, gold, credits },
      levels,
      relicBoosts,
      baseStats,
      statBoosts,
      incomeBoosts,
      mergedMultipliers,
      pets,
      partner,
      sanctum,
      sculpture,
      fighters,
      equipment,
      loadouts,
      village,
      party,
      partyActions,
      partyLastAction,
      partyMonster,
      partyLevels,
    };
    // WHEN EACH SECTION WAS LAST SEEN. meta.timestamp is when this capture
    // ran, and the merge below keeps sections from earlier captures, so a
    // tool that judged every section by meta.timestamp called a two-day-old
    // partner reading fresh (R49 found the Sculpture optimizer doing exactly
    // that). observedAt[section] is set only for a section this capture
    // actually observed; the merge keeps the older stamp for the rest.
    const observedAt = {};
    // And WHERE: the game page this capture ran on, per section, so the
    // Control Panel can say which page last taught it (REGISTER.md R69).
    const observedOn = {};
    const here = (typeof location !== 'undefined' && location.pathname) || null;
    for (const key of Object.keys(sections)) {
      const seen = key === 'core' ? (charName !== null || charLevel !== null) : sections[key] !== null;
      if (seen) { observedAt[key] = now; if (here) observedOn[key] = here; }
    }

    // WHICH VILLAGE AND PARTY YOU ARE IN (R92), from the character document
    // itself: getActiveCharacter, or the provider's characterData, which is
    // the same document. The catalogue asks the village queries with this
    // villageId, as the game's village pages do, and asks the party queries
    // only while it names a party. A field the document lacks is an
    // observation ("none": Convex omits an unset optional field), so it is
    // null; no document at all is no observation, so it is undefined and the
    // merge keeps the last one seen. The two must not be confused: a player
    // who leaves the party has to stop the party reads.
    const charDoc = queryChar || (fiber.characterDoc && typeof fiber.characterDoc === 'object' ? fiber.characterDoc : null);
    const docId = (k) => (charDoc ? (typeof charDoc[k] === 'string' && charDoc[k] ? charDoc[k] : null) : undefined);

    return Object.assign({
      schemaVersion: 1,
      meta: {
        timestamp: now,
        source,
        characterName: charName,
        characterLevel: charLevel,
        // The player's own characterId, as splitQueries resolved it: what the
        // catalogue asks with for a query the game keys by character, and how
        // a module tells your row of the party from the others' (REGISTER.md
        // R89, R92); null when this capture could not tell, and the merge
        // keeps the last one seen.
        characterId: typeof ownId === 'string' && ownId ? ownId : null,
        villageId: docId('villageId'),
        partyId: docId('partyId'),
        observedAt,
        observedOn,
        // When each catalogue query was last seen answered in the client's
        // cache, by catalogue key. Stamped by captureNow (it needs the args
        // the catalogue would ask with), merged by the latest stamp.
        queryAt: {},
      },
    }, sections);
  }

  // Page-specific Convex queries come and go as the player navigates. A
  // missing query means "not observed on this capture", not "the value became
  // null". Preserve the last observed value and replace it only when the new
  // capture actually observed something. Empty arrays/objects ARE observations
  // and therefore replace old values. This is deliberately a data merge, not a
  // game-mechanics derivation.
  //
  // The merge stops at the NORMALIZED fields and never descends into a raw
  // game document. Within a section, fields come from different queries
  // (equipment.slots vs equipment.gems), so each is kept or replaced on its
  // own. But a field's value (the equipment-slot map, the buildings map, a
  // multipliers object) is one observation, replaced whole: the game omits an
  // empty slot rather than sending null, so merging inside it key by key would
  // keep an unequipped item forever.
  //   depth 1: section.field      (every section)
  //   depth 2: pets.<type>.field  (pets nests one level per slot type)
  //   depth 0: mergedMultipliers  (one observation, replaced whole: a key the
  //            game stops sending is a modifier that went away)
  //   depth 2: loadouts.sculptureGrids.<presetId>, loadouts.skillTreeNodes.<treeId>
  //            (a capture sees one loadout's grid or nodes, rarely all; each
  //            is kept until its own next reading, and a loadout the game's
  //            list no longer has is dropped: pruneLoadouts)
  const MERGE_DEPTH = { pets: 2, mergedMultipliers: 0, relicBoosts: 0, loadouts: 2 };

  // A per-loadout map keeps only the ids the section's loadout list still
  // names: a deleted preset's grid must not outlive it. No list seen yet:
  // kept as is (nothing says which ids are gone).
  function pruneLoadouts(section, listKey, mapKey) {
    if (!section || !Array.isArray(section[listKey]) || !section[mapKey] || typeof section[mapKey] !== 'object') return section;
    const ids = new Set(section[listKey].map((l) => l.id));
    const kept = {};
    for (const [id, v] of Object.entries(section[mapKey])) if (ids.has(id)) kept[id] = v;
    return Object.assign({}, section, { [mapKey]: Object.keys(kept).length ? kept : null });
  }

  // WHICH LAST-ACTION READING IS THE RUN'S RATE (REGISTER.md R88). The gold
  // per action depends on the set in use: 31.44b from last week's party run,
  // 6.10b from one action taken today in another set (the 2026-09-25
  // captures). So a lone action must not replace the run's rate. A reading is
  // a run reading once RUN_MIN_READINGS distinct readings have arrived each
  // within RUN_GAP_MS of the one before; a run makes one every 10 s. The gap is
  // generous because a hidden tab clamps timers to about a minute
  // (INSTRUMENTATION.md §4.4), and a capture can arrive that late; three
  // readings rather than two because the maintainer's test used two actions.
  // `last` is always the latest reading; `run` is the latest run reading and
  // survives any number of lone ones. Sync bookkeeping, not a game formula.
  const RUN_GAP_MS = 90_000;
  const RUN_MIN_READINGS = 3;
  function foldPartyLastAction(prev, cur) {
    if (!cur || !cur.last) return prev === undefined ? null : prev;
    if (!prev || !prev.last) return cur;
    // The same action seen again: keep when it was FIRST seen.
    if (prev.last.key === cur.last.key) return prev;
    const streak = cur.last.seenAt - prev.last.seenAt <= RUN_GAP_MS ? (prev.streak || 1) + 1 : 1;
    return {
      last: cur.last,
      run: streak >= RUN_MIN_READINGS ? cur.last : (prev.run || null),
      streak,
    };
  }

  function mergeObservedProfile(previous, current) {
    if (!previous || typeof previous !== 'object') return current;
    if (!current || typeof current !== 'object') return previous;

    const prevName = previous.meta && previous.meta.characterName;
    const nextName = current.meta && current.meta.characterName;
    if (prevName && nextName && prevName !== nextName) return current;

    const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
    const mergeValue = (oldValue, newValue, depth) => {
      if (newValue === null || newValue === undefined) {
        return oldValue === undefined ? null : oldValue;
      }
      if (depth === 0 || !isPlainObject(newValue)) return newValue;

      const out = isPlainObject(oldValue) ? Object.assign({}, oldValue) : {};
      for (const key of Object.keys(newValue)) out[key] = mergeValue(out[key], newValue[key], depth - 1);
      return out;
    };

    const merged = {};
    for (const key of new Set([...Object.keys(previous), ...Object.keys(current)])) {
      merged[key] = key === 'partyLastAction'
        ? foldPartyLastAction(previous[key], current[key])
        : mergeValue(previous[key], current[key], key in MERGE_DEPTH ? MERGE_DEPTH[key] : 1);
    }
    if (merged.loadouts) {
      merged.loadouts = pruneLoadouts(merged.loadouts, 'sculpturePresets', 'sculptureGrids');
      merged.loadouts = pruneLoadouts(merged.loadouts, 'skillTreePresets', 'skillTreeNodes');
    }
    // Capture metadata describes this capture, never the page where an older
    // section happened to be observed. The one exception is observedAt, which
    // exists to remember exactly that: each section keeps the stamp of the
    // capture that last saw it.
    merged.schemaVersion = current.schemaVersion;
    const prevSeen = (previous.meta && previous.meta.observedAt) || {};
    const curSeen = (current.meta && current.meta.observedAt) || {};
    const prevOn = (previous.meta && previous.meta.observedOn) || {};
    const curOn = (current.meta && current.meta.observedOn) || {};
    // villageId/partyId: this capture's when it saw the character document
    // (null included: "none" is an observation), else the last one seen.
    const lastSeen = (k) => {
      if (current.meta && current.meta[k] !== undefined) return current.meta[k];
      return previous.meta && previous.meta[k] !== undefined ? previous.meta[k] : undefined;
    };
    // queryAt keeps the LATEST stamp per query, never the newer capture's
    // whole map: a query this capture did not see was still seen earlier.
    const queryAt = Object.assign({}, (previous.meta && previous.meta.queryAt) || {});
    for (const [k, t] of Object.entries((current.meta && current.meta.queryAt) || {})) {
      if (Number.isFinite(t) && !(queryAt[k] >= t)) queryAt[k] = t;
    }
    merged.meta = Object.assign({}, current.meta, {
      characterId: (current.meta && current.meta.characterId) || (previous.meta && previous.meta.characterId) || null,
      villageId: lastSeen('villageId'),
      partyId: lastSeen('partyId'),
      observedAt: Object.assign({}, prevSeen, curSeen),
      observedOn: Object.assign({}, prevOn, curOn),
      queryAt,
    });
    return merged;
  }

  // ---- THE CATALOGUE (REGISTER.md R92) ----
  //
  // THE ONE HOME for which game query feeds which profile section, with which
  // arguments, how often Core may read it in the background, and whether it
  // is held open while shown. Everything below that asks the game for data
  // reads this list and nothing else: the background schedule, the holds,
  // Sync now, a tool's request, and the deprecated Core.profile.watch. It is
  // the ALLOWLIST too: tests/profile-sync-catalogue.mjs checks every row
  // against the newest captured bundle (the game itself opens that query with
  // exactly these argument keys) and the captured API surface, so "only what
  // a game page asks for" (INSTRUMENTATION.md §10a) is checked, not promised.
  //
  // A READ IS A PAGE VISIT, NOT A SUBSCRIPTION: subscribe through the game's
  // own client, take the first answer, unsubscribe. One execution on the
  // server, on the socket the tab already has. Holding a query open, which the
  // server re-runs on every change, is kept for what a player is looking at.
  //
  //   args   the argument object, by role: OWN = your characterId, MEMBER =
  //          each other party member's (one read each), VILLAGE = your
  //          villageId. SCULPTURE_PRESET / SKILL_TREE = each of your
  //          sculpture presets / skill-tree presets the profile's own list
  //          names (one read each, like MEMBER). A role the profile cannot
  //          resolve means the row is not asked at all, never asked with a
  //          guess (rule 3).
  //   every  the background interval; null = never read in the background
  //          (the character provider holds it on every page, or it is held).
  //   live   held in the tab whose module window shows it, while visible.
  //   hold   held by the leading tab while a started module uses it.
  //   when   'party': only while the character document names a party.
  //
  // THE INTERVAL RULE (audited): every * 1.1 + 10 min is shorter than the
  // section's stale window (Core's PROFILE_CATEGORIES, 6 h by default), so a
  // section Core keeps never shows "old" while background reads work. That is
  // why the slow sections are 5 h rather than a day: the difference is about
  // one read an hour in all. The audit also pins the steady-state rate, with
  // every section in use and a full party, at no more than half the hourly
  // ceiling, so Sync now always has room.
  const OWN = 'own';
  const MEMBER = 'member';
  const VILLAGE = 'village';
  const SCULPTURE_PRESET = 'sculpturePreset';
  const SKILL_TREE = 'skillTree';
  // The roles asked once per id, and where ctxFrom keeps each role's ids.
  const EACH = { [MEMBER]: 'members', [SCULPTURE_PRESET]: 'sculpturePresets', [SKILL_TREE]: 'skillTrees' };

  const CATALOGUE = [
    // PAGE. The character provider holds these on every game page
    // (CharacterDataProvider, 2026-09-23 bundle: getActiveCharacter with {},
    // getEquipmentSlots with { characterId }, and the levels as its
    // characterLevels), so a capture always finds them and Core never asks.
    { section: 'core', name: 'character.public.getActiveCharacter', args: {}, every: null },
    { section: 'levels', name: 'character.levels.public.getLevels', args: { characterId: OWN }, every: null },
    { section: 'equipment', name: 'equipment.queries.getEquipmentSlots', args: { characterId: OWN }, every: null },
    // BACKGROUND. Each is a query the game's own pages open with
    // { characterId }; the income hover card alone (IncomeHoverCardWrapper)
    // opens most of them on one hover. The interval is how stale the section
    // may grow while a module uses it.
    { section: 'equipment', name: 'character.gems.queries.getEquippedGems', args: { characterId: OWN }, every: 5 * HOUR_MS },
    { section: 'relicBoosts', name: 'character.boosts.public.getBoosts', args: { characterId: OWN }, every: HOUR_MS },
    { section: 'baseStats', name: 'character.stats.public.getStats', args: { characterId: OWN }, every: HOUR_MS },
    { section: 'mergedMultipliers', name: 'character.queries.getMergedMultipliers', args: { characterId: OWN }, every: 30 * MIN_MS },
    { section: 'pets', name: 'pets.queries.getPetSlots', args: { characterId: OWN }, every: 3 * HOUR_MS },
    { section: 'pets', name: 'pets.queries.getEquippedPets', args: { characterId: OWN }, every: 3 * HOUR_MS },
    { section: 'partner', name: 'partner.public.getPartner', args: { characterId: OWN }, every: 5 * HOUR_MS },
    { section: 'sanctum', name: 'sanctum.public.getActiveSanctums', args: { characterId: OWN }, every: 5 * HOUR_MS },
    { section: 'sanctum', name: 'sanctum.skilltree.public.getActiveSkillTreePoints', args: { characterId: OWN }, every: 5 * HOUR_MS },
    { section: 'sanctum', name: 'sanctum.public.getSanctumCore', args: { characterId: OWN }, every: 5 * HOUR_MS },
    { section: 'sculpture', name: 'fighters.sculptures.public.getSculptureMultipliers', args: { characterId: OWN }, every: 5 * HOUR_MS },
    // LOADOUTS. The list of each kind, then one read per loadout in it, with
    // exactly the arguments the game's page opens it with: the Sculptures
    // page (getPresets, then getSculptureGrid per preset shown) and the Skill
    // Tree page (getSkillTrees, then getSkillTreePoints per preset shown).
    // A loadout appears in the schedule once its list has been read (the
    // follow-up below), and drops out when the list stops naming it. The item
    // sets name no per-set query: the list is the whole answer, and the
    // equipment sidebar holds it on every page, so this row is rarely due.
    { section: 'loadouts', name: 'fighters.sculptures.presets.getPresets', args: { characterId: OWN }, every: 12 * HOUR_MS },
    { section: 'loadouts', name: 'fighters.sculptures.public.getSculptureGrid', args: { characterId: OWN, presetId: SCULPTURE_PRESET }, every: 12 * HOUR_MS },
    { section: 'loadouts', name: 'sanctum.skilltree.public.getSkillTrees', args: { characterId: OWN }, every: 12 * HOUR_MS },
    { section: 'loadouts', name: 'sanctum.skilltree.public.getSkillTreePoints', args: { skillTreeId: SKILL_TREE }, every: 12 * HOUR_MS },
    { section: 'loadouts', name: 'sets.public.getCharacterItemSets', args: { characterId: OWN }, every: 12 * HOUR_MS },
    { section: 'fighters', name: 'fighters.public.getCharacterFightersRaw', args: { characterId: OWN }, every: 5 * HOUR_MS },
    // The village pages ask by village: getVillage with { id }, the other two
    // with { villageId }, both from the character document's villageId
    // (page-wqOaeWAP). No villageId observed: not asked.
    { section: 'village', name: 'village.queries.getVillage', args: { id: VILLAGE }, every: 5 * HOUR_MS },
    { section: 'village', name: 'village.queries.getBuildings', args: { villageId: VILLAGE }, every: 5 * HOUR_MS },
    { section: 'village', name: 'village.queries.getStrengths', args: { villageId: VILLAGE }, every: 5 * HOUR_MS },
    // THE PARTY. Read hourly in the background, held while a module window
    // that uses them is on screen, as the Party page holds them.
    { section: 'party', name: 'party.public.getOverview', args: { characterId: OWN }, every: HOUR_MS, live: true, when: 'party' },
    { section: 'partyMonster', name: 'party.combat.public.getActionsMonster', args: { characterId: OWN }, every: HOUR_MS, live: true, when: 'party' },
    // Other members' levels: the query the game's public profile page opens
    // with THAT player's id (live test: capture/api/convex-2026-09-25/
    // member-levels-test.json). Before R92 each was held around the clock in
    // every tab; now one read an hour each, from one tab.
    { section: 'partyLevels', name: 'character.levels.public.getLevels', args: { characterId: MEMBER }, every: HOUR_MS, live: true, when: 'party' },
    // HOLD. The game's sidebar holds both on every page for a signed-in player
    // (page-wqOaeWAP, the Party Actions widget), so the leader holding them
    // too adds a subscriber, not a request. While no party action happens the
    // server never re-runs them; during a run it re-runs them per action, as
    // it does for the sidebar, and a run needs a reading every 10 s anyway
    // (foldPartyLastAction). Cheaper than reading them every few minutes.
    { section: 'partyActions', name: 'party.combat.public.getActions', args: { characterId: OWN }, every: null, hold: true, live: true },
    { section: 'partyLastAction', name: 'party.combat.public.getLastActionState', args: { characterId: OWN }, every: null, hold: true, live: true },
  ];

  // Queries normalizeProfile reads that the catalogue deliberately never asks
  // for: taken when a game page happens to hold them. The catalogue audit
  // fails on a name read above that is in neither list.
  const PAGE_ONLY = [
    // statBoosts is null on the live page (no per-source breakdown comes from
    // it); nothing uses it, so nothing is worth a request.
    { section: 'statBoosts', name: 'character.boosts.public.getMergedBoosts' },
    // An alternative feed of the fighters section; the catalogue reads
    // getCharacterFightersRaw.
    { section: 'fighters', name: 'fighters.public.getActivePresetFighters' },
  ];

  // The legacy watch's allowlist, derived: every catalogue query, with its
  // argument keys (rows sharing a name share a shape; the audit checks).
  const WATCHABLE = {};
  for (const row of CATALOGUE) WATCHABLE[row.name] = Object.keys(row.args);
  // Which argument names the village, per village query (splitQueries).
  const VILLAGE_ARG = {};
  for (const row of CATALOGUE) for (const [k, role] of Object.entries(row.args)) if (role === VILLAGE) VILLAGE_ARG[row.name] = k;
  // Which argument names the loadout, per per-loadout query (splitQueries).
  const LOADOUT_ARG = {};
  for (const row of CATALOGUE) for (const [k, role] of Object.entries(row.args)) if (role === SCULPTURE_PRESET || role === SKILL_TREE) LOADOUT_ARG[row.name] = k;
  const CATALOGUE_SECTIONS = [...new Set(CATALOGUE.map((r) => r.section))];

  // For the UI and the audit: a frozen copy, no functions, nothing to resolve.
  // `kept` is how the section stays fresh: 'page' (the game holds it),
  // 'background' (read every `every` ms while used), 'held' (the leader holds
  // it while used).
  const PUBLIC_CATALOGUE = Object.freeze(CATALOGUE.map((r) => Object.freeze({
    section: r.section,
    name: r.name,
    argKeys: Object.freeze(Object.keys(r.args)),
    every: r.every,
    live: !!r.live,
    hold: !!r.hold,
    perMember: Object.values(r.args).includes(MEMBER),
    // The role asked once per id ('member', 'sculpturePreset', 'skillTree'), or null.
    each: Object.values(r.args).find((role) => role in EACH) || null,
    when: r.when || null,
    kept: r.hold ? 'held' : r.every === null ? 'page' : 'background',
  })));

  const READ_FLOOR_MS = MIN_MS;
  const READ_TIMEOUT_MS = 20_000;
  const MAX_IN_FLIGHT = 3;
  const READ_SPACING_MS = 250;
  const MAX_BACKGROUND_READS_PER_HOUR = 60;
  const BACKOFF_BASE_MS = 5 * MIN_MS;
  const BACKOFF_MAX_MS = 24 * HOUR_MS;
  const JITTER = 0.1;
  const ARM_MIN_MS = 5_000;
  const ARM_MAX_MS = 10 * MIN_MS;
  const OFFLINE_RETRY_MS = MIN_MS;
  const REQUEST_MAX_AGE_MS = 15 * MIN_MS;
  const SYNC_NOW_MAX_AGE_MS = MIN_MS;
  const SYNC_NOW_SETTLE_MS = 400;
  const MAX_WATCHES = 8;
  const LEADER_LOCK = 'awoo:profile:leader';

  // "party.combat.public.getActions" -> "party/combat/public:getActions", the
  // canonical form Convex's subscribe takes (dottedQueryName's inverse).
  function canonicalUdfPath(dotted) {
    const parts = String(dotted).split('.');
    const exp = parts.pop();
    return `${parts.join('/')}:${exp}`;
  }

  function currentProfile() {
    try { return Core.profile && typeof Core.profile.get === 'function' ? Core.profile.get() : null; } catch (e) { return null; }
  }

  // Whose ids the catalogue asks with, from the merged profile. Members come
  // from the party overview, and only when it is the party the character
  // document names (an overview of the party you left lists the wrong
  // people); without your own id none are taken, since yours could not be
  // left out. partyStale: the overview is of another party, so it is due now.
  function ctxFrom(profile) {
    const meta = (profile && profile.meta) || {};
    const id = (v) => (typeof v === 'string' && v ? v : null);
    const ownId = id(meta.characterId);
    const partyId = id(meta.partyId);
    const party = profile && profile.party && typeof profile.party === 'object' ? profile.party : null;
    const partyIdSeen = party ? id(party.id) : null;
    const sameParty = !!(party && partyId && (!partyIdSeen || partyIdSeen === partyId));
    const members = [];
    if (sameParty && ownId && Array.isArray(party.members)) {
      for (const m of party.members) {
        const cid = m && id(m.characterId);
        if (cid && cid !== ownId && !members.includes(cid)) members.push(cid);
      }
    }
    // Your loadouts, from the lists the profile last saw. Without your own id
    // none are asked: the per-loadout reads are yours only by that id.
    const ids = (list) => (ownId && Array.isArray(list) ? [...new Set(list.map((l) => l && id(l.id)).filter(Boolean))] : []);
    const lo = profile && profile.loadouts && typeof profile.loadouts === 'object' ? profile.loadouts : {};
    const sculpturePresets = ids(lo.sculpturePresets);
    const skillTrees = ids(lo.skillTreePresets);
    return { ownId, villageId: id(meta.villageId), partyId, members, sculpturePresets, skillTrees,
      partyStale: !!(partyIdSeen && partyId && partyIdSeen !== partyId) };
  }

  // A row's concrete asks: { name, section, args, key, row }. `key` is the
  // row's name, plus #<id> for a per-id row's (a member's characterId, a
  // loadout's id); it keys meta.queryAt and every per-query record here.
  // [] = not asked (a role unresolved, or `when`).
  function instancesOf(row, ctx) {
    if (row.when === 'party' && !ctx.partyId) return [];
    const each = Object.values(row.args).find((role) => role in EACH);
    const resolve = (one) => {
      const args = {};
      for (const [k, role] of Object.entries(row.args)) {
        const v = role === OWN ? ctx.ownId : role === VILLAGE ? ctx.villageId : role === each ? one : null;
        if (!v) return null;
        args[k] = v;
      }
      return args;
    };
    if (each) {
      return (ctx[EACH[each]] || []).map((one) => ({ row, name: row.name, section: row.section, args: resolve(one), key: `${row.name}#${one}`, stale: false }))
        .filter((inst) => inst.args);
    }
    const args = resolve(null);
    return args ? [{ row, name: row.name, section: row.section, args, key: row.name, stale: row.section === 'party' && ctx.partyStale }] : [];
  }

  function sameArgs(a, b) {
    const x = Array.isArray(a) ? a[0] : a;
    if (!x || typeof x !== 'object' || !b) return false;
    const kx = Object.keys(x);
    return kx.length === Object.keys(b).length && kx.every((k) => x[k] === b[k]);
  }

  // Stamp meta.queryAt for every catalogue ask whose answer is in the cache
  // right now, with exactly the args the catalogue would ask with (so a
  // hovered stranger's getVillage stamps nothing of yours). Mutates `profile`,
  // which is always a fresh object from mergeObservedProfile/normalizeProfile.
  //
  // knownQueryAt is this tab's own memory of the same stamps: what its
  // captures saw, and what the leading tab reported reading (SYNC_READS). The
  // schedule reads it beside the profile's, because the profile is not only
  // this tab's to write: a store that takes another tab's profile whole (the
  // one before R92 part A did) can hand back stamps older than this tab's,
  // and the leader then re-read queries it was itself holding open (found by
  // the two-tab test). Every commit carries it, so a tab that takes the lead
  // over knows what was read.
  //
  // Keys name no character (the profile is one character's), so both
  // memories are dropped when the player switches character: the new one's
  // sections were never read, whatever the old one's stamps say.
  const knownQueryAt = {};
  let knownFor = null;
  const noteQueryAt = (k, t) => { if (Number.isFinite(t) && !(knownQueryAt[k] >= t)) knownQueryAt[k] = t; };
  function forgetIfOtherCharacter(ownId) {
    if (!ownId) return;
    if (knownFor && knownFor !== ownId) {
      for (const k of Object.keys(knownQueryAt)) delete knownQueryAt[k];
      rowState.clear();
    }
    knownFor = ownId;
  }
  function stampQueries(profile, entries, now) {
    if (!profile || !profile.meta) return;
    const queryAt = Object.assign({}, profile.meta.queryAt || {});
    const ctx = ctxFrom(profile);
    forgetIfOtherCharacter(ctx.ownId);
    for (const row of CATALOGUE) {
      for (const inst of instancesOf(row, ctx)) {
        if (entries.some((e) => e.name === inst.name && sameArgs(e.args, inst.args))) noteQueryAt(inst.key, now);
      }
    }
    for (const [k, t] of Object.entries(knownQueryAt)) if (!(queryAt[k] >= t)) queryAt[k] = t;
    profile.meta.queryAt = queryAt;
  }

  // ---- Capture & Orchestration ----
  function captureNow() {
    captureScheduled = false;
    if (captureTimer !== null) { clearTimeout(captureTimer); captureTimer = null; }

    // The provider scan is the path the live page proved (2026-09-22, and the
    // R88 tier-3 test found the client there again); Core.probeConvexClient
    // returned null on the same page, so it is only the fallback now.
    const providers = scanReactProvidersForProfileData();
    const found = providers.client || (Core.probeConvexClient ? Core.probeConvexClient() : null) || null;
    if (found && found !== attachedClient) attachClient(found);
    // A scan that misses the client once (the tree mid-render) reads the one
    // already attached, which the game has not replaced.
    const client = found || attachedClient;

    // The reads whose answer is in the cache NOW, taken in the same turn as
    // the cache read below: this capture records them, and only once it is
    // committed may they unsubscribe (settleReads). The other order loses the
    // answer: unsubscribing the last subscriber drops it from the cache.
    const ready = readsWithAnswers();

    const ownHint = providers.context && providers.context.characterData && providers.context.characterData._id;
    // Your village, for telling your village queries from a stranger's: the
    // provider's character document (a document without one says none),
    // else the last one the profile saw.
    const provDoc = providers.context && providers.context.characterData && typeof providers.context.characterData === 'object' ? providers.context.characterData : null;
    const lastVillage = ((currentProfile() || {}).meta || {}).villageId;
    const villageHint = provDoc ? (typeof provDoc.villageId === 'string' && provDoc.villageId ? provDoc.villageId : null) : lastVillage;
    const entries = queryEntries(client);
    const split = splitQueries(entries, typeof ownHint === 'string' ? ownHint : null, villageHint);
    const q = split.own;
    // CAPTURE COST (R92). Once the client is attached and its cache holds the
    // character, the cache and the provider carry everything the generic
    // fiber sweep and the DOM scan could find (the stats text the DOM scan
    // reads is drawn from getStats, which the page holding it puts in the
    // cache). Both are skipped; the provider read stays: gold, levels and the
    // equipment slots come from it.
    const lean = !!client && !!q['character.public.getActiveCharacter'];
    const fiber = scanFiberForProfileData(providers.context, { generic: !lean });
    const dom = lean ? {} : scanDomForProfileData();

    const hasData = Object.keys(q).length > 0 || Object.keys(fiber).length > 0 || Object.keys(dom).length > 0;
    if (!hasData) { settleReads(ready); return null; }

    const before = currentProfile();
    const knownTrees = before && before.loadouts && Array.isArray(before.loadouts.skillTreePresets)
      && (!split.ownId || !before.meta || !before.meta.characterId || before.meta.characterId === split.ownId)
      ? before.loadouts.skillTreePresets.map((t) => t && t.id).filter(Boolean) : [];
    const observed = normalizeProfile(q, fiber, dom, split.others, split.ownId, { skillTrees: knownTrees });
    // Onto Core's profile, NOT this tab's last capture: Core's also holds what
    // other tabs broadcast. Merged onto its own last capture, a follower tab
    // dropped a section another tab had just seen whenever its own cache
    // lacked it (REGISTER.md R92, point 2).
    const profile = mergeObservedProfile(currentProfile(), observed);
    stampQueries(profile, entries, observed.meta.timestamp);
    activeProfile = profile;
    if (Core.profile && typeof Core.profile.set === 'function') Core.profile.set(profile);
    settleReads(ready);
    return profile;
  }

  function scheduleCapture() {
    if (captureScheduled) return;
    captureScheduled = true;
    captureTimer = setTimeout(() => { captureTimer = null; captureNow(); }, 250);
  }

  const soon = (fn) => {
    if (typeof queueMicrotask === 'function') queueMicrotask(fn);
    else Promise.resolve().then(fn);
  };

  // The client's transitions drive captures. A read waiting for its answer
  // does not wait for the 250 ms debounce: a hidden tab clamps that timer to
  // about a minute (INSTRUMENTATION.md §4.4), and the answer is here now. A
  // microtask rather than inside the handler, so no subscribe or unsubscribe
  // runs in the middle of the client's own transition.
  function onTransition() {
    if (inFlight.size) soon(completeReads);
    scheduleCapture();
  }

  function attachClient(client) {
    const previous = attachedClient;
    attachedClient = client;
    if (typeof client.addOnTransitionHandler === 'function') {
      try {
        client.addOnTransitionHandler(() => { onTransition(); });
      } catch (e) {
        console.warn('[AwooCore:ProfileSync] Failed hooking Convex transition handler:', e);
      }
    }
    // A new client (a reload of the game's own) has none of our holds, and a
    // read in flight on the old one will never answer here.
    for (const h of holds.values()) h.unsubscribe = null;
    if (previous) dropReads();
    if (ambientTimer !== null) startAmbient();
    seekLeadership();
    syncHolds();
  }

  const watchOn = () => !(Core.profile && Core.profile.watchEnabled === false);
  const autoSyncOn = () => !(Core.profile && Core.profile.autoSync === false);
  // Automatic asks (the schedule, the holds) need both switches; the player's
  // own Sync now needs only the background switch, as "Resync now" has
  // always worked with automatic sync off.
  const backgroundOn = () => watchOn() && autoSyncOn();
  const pageVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

  // Nothing is asked while the socket is down: the read would only time out.
  // A client with no connectionState cannot say, and is taken as connected.
  function connected() {
    const c = attachedClient;
    if (!c || typeof c.connectionState !== 'function') return true;
    try {
      const s = c.connectionState();
      return !(s && s.isWebSocketConnected === false);
    } catch (e) { return true; }
  }

  // Started modules and what they read (about.uses, Core v14). A tool's uses
  // arrive through request() when it opens.
  function startedModules() {
    let list = [];
    try { list = Core && typeof Core.listModules === 'function' ? Core.listModules() : []; } catch (e) { list = []; }
    return (Array.isArray(list) ? list : []).filter((m) => m && m.started)
      .map((m) => ({ id: m.id, uses: Array.isArray(m.uses) ? m.uses : [], open: !!m.open }));
  }
  function demandOf(mods) {
    const out = new Set();
    for (const m of mods) for (const s of m.uses) out.add(s);
    return out;
  }

  // ---- One tab leads (R92) ----
  //
  // Background reads and the `hold` rows run only in the tab holding this Web
  // Lock. It is requested once the tab has the game's client and background
  // reads are allowed; the callback returns a promise that settles only when
  // this tab gives the lead up (the background switch turned off), so the
  // browser hands the lock to the next tab in line when this one closes.
  // Without navigator.locks there is no leader and no background read at all:
  // only captures, and what the player asks for.
  const locksApi = () => (typeof navigator !== 'undefined' && navigator && navigator.locks &&
    typeof navigator.locks.request === 'function' ? navigator.locks : null);
  let isLeader = false;
  let leaderReq = null;
  let otherLeader = null; // another tab leads: true / false, null = not known

  function seekLeadership() {
    const locks = locksApi();
    if (!locks || leaderReq || !attachedClient || !watchOn()) return;
    const req = { ctl: typeof AbortController === 'function' ? new AbortController() : null, release: null };
    const held = new Promise((resolve) => { req.release = resolve; });
    leaderReq = req;
    let pending;
    try {
      pending = locks.request(LEADER_LOCK, req.ctl ? { signal: req.ctl.signal } : {}, () => {
        // Given up while waiting, and the abort lost the race: hand it on.
        if (leaderReq !== req) return null;
        isLeader = true;
        otherLeader = false;
        leadershipChanged();
        return held;
      });
    } catch (e) {
      leaderReq = null;
      return;
    }
    // Settles when this tab gave the lead up (yieldLeadership already said so)
    // or gave up waiting. Anything else (the lock taken away) ends the lead
    // here too, rather than leaving a tab that believes it still leads.
    Promise.resolve(pending).catch(() => { /* aborted while waiting: this tab gave up */ })
      .then(() => {
        if (leaderReq !== req) return;
        leaderReq = null;
        if (isLeader) { isLeader = false; leadershipChanged(); }
      });
    refreshLeaderView();
  }

  function yieldLeadership() {
    const req = leaderReq;
    if (!req) return;
    leaderReq = null;
    if (isLeader) {
      isLeader = false;
      req.release();
      leadershipChanged();
    } else if (req.ctl) {
      try { req.ctl.abort(); } catch (e) { /* already settled */ }
    }
  }

  // Whether ANOTHER tab leads, for the status line and request()'s routing.
  function refreshLeaderView() {
    const locks = locksApi();
    if (!locks || typeof locks.query !== 'function') return Promise.resolve(null);
    let p;
    try { p = locks.query(); } catch (e) { return Promise.resolve(null); }
    return Promise.resolve(p).then((s) => {
      const held = !!(s && Array.isArray(s.held) && s.held.some((l) => l && l.name === LEADER_LOCK));
      otherLeader = !isLeader && held;
      return otherLeader;
    }, () => null);
  }

  function leadershipChanged() {
    if (!isLeader) for (const [k, job] of queue) if (job.kind === 'background') queue.delete(k);
    syncHolds();
    armTimer();
  }

  // ---- Holds: what stays open (REGISTER.md R88 step 5, R92) ----
  //
  // Some data exists only while its game page is open: the party overview
  // (members, their multipliers and monsters) and other members' levels. A
  // hold asks the game's OWN Convex client to keep that query open, through
  // the same `subscribe` its pages use; the answer lands in the query cache,
  // the transition handler fires, and the ordinary capture reads it.
  //
  // Tested live 2026-09-25 (capture/api/convex-2026-09-25/README.md,
  // INSTRUMENTATION.md §10a): getOverview arrived within 5 s with no page
  // holding it, and the maintainer's other sessions stayed logged in.
  //
  // THE LOAD LIMIT. The maintainer approved this on the condition that the
  // game's developer would not mind the load, so only catalogue queries are
  // held, with the argument shape the game's page uses, and at most
  // MAX_WATCHES at once in a tab. Asking for a query the game already holds
  // adds a subscriber to it, not a request. A read, never an action (AGENTS.md
  // rule 4). Three kinds of holder share one refcounted table, so no query is
  // opened twice in a tab:
  //   lead    the leading tab, for the `hold` rows a started module uses;
  //   shown   any tab, for the `live` rows a module whose window is open uses,
  //           while the page is visible (the player is looking at it);
  //   legacy  Core.profile.watch (deprecated, below).
  // lead and shown need both Settings › Profile switches; legacy needs the
  // background one, as the watch always did.
  const holds = new Map(); // hold key -> { name, args, key, lead, shown:Set, legacy, unsubscribe }
  const capped = new Set(); // catalogue keys refused by the cap in the last pass
  const holdKeyOf = (name, args) => `${name} ${JSON.stringify(args, Object.keys(args).sort())}`;
  const holdHeld = (h) => h.lead || h.shown.size > 0 || h.legacy > 0;
  // A legacy hold opens only where one tab can answer for all: the leader,
  // or every tab when the browser has no Web Locks (there is no leader).
  const legacyMayOpen = () => watchOn() && (isLeader || !locksApi());
  const holdWanted = (h) => h.lead || h.shown.size > 0 || (h.legacy > 0 && legacyMayOpen());

  function newHold(name, args, key) {
    return { name, args: Object.assign({}, args), key, lead: false, shown: new Set(), legacy: 0, unsubscribe: null };
  }

  function syncHolds() {
    const wants = [];
    if (backgroundOn() && attachedClient) {
      const ctx = ctxFrom(currentProfile());
      const mods = startedModules();
      if (isLeader) {
        const demand = demandOf(mods);
        for (const row of CATALOGUE) {
          if (row.hold && demand.has(row.section)) for (const inst of instancesOf(row, ctx)) wants.push({ inst, by: null });
        }
      }
      if (pageVisible()) {
        for (const m of mods) {
          if (!m.open) continue;
          for (const row of CATALOGUE) {
            if (row.live && m.uses.includes(row.section)) for (const inst of instancesOf(row, ctx)) wants.push({ inst, by: m.id });
          }
        }
      }
    }
    for (const h of holds.values()) { h.lead = false; h.shown.clear(); }
    capped.clear();
    // Mark what is already open first, drop what nobody holds, and only then
    // add new ones against the cap: closing and reopening a kept query would
    // cost the server an unsubscribe and a subscribe for nothing.
    const fresh = [];
    for (const w of wants) {
      const h = holds.get(holdKeyOf(w.inst.name, w.inst.args));
      if (!h) { fresh.push(w); continue; }
      if (w.by === null) h.lead = true; else h.shown.add(w.by);
    }
    for (const [hk, h] of holds) if (!holdHeld(h)) { closeHold(h); holds.delete(hk); }
    for (const w of fresh) {
      const hk = holdKeyOf(w.inst.name, w.inst.args);
      let h = holds.get(hk);
      if (!h) {
        if (holds.size >= MAX_WATCHES) { capped.add(w.inst.key); continue; }
        h = newHold(w.inst.name, w.inst.args, w.inst.key);
        holds.set(hk, h);
      }
      if (w.by === null) h.lead = true; else h.shown.add(w.by);
    }
    openHolds();
  }

  // Nothing new opens while the socket is down (what is open stays open: the
  // client re-sends it on reconnect, and closing it would only churn). The
  // next commit after the reconnect opens the rest.
  function openHolds() {
    const client = attachedClient;
    const online = connected();
    for (const h of holds.values()) {
      const want = holdWanted(h);
      if (want && !h.unsubscribe && online && client && typeof client.subscribe === 'function') {
        try {
          const sub = client.subscribe(canonicalUdfPath(h.name), h.args);
          h.unsubscribe = sub && typeof sub.unsubscribe === 'function' ? sub.unsubscribe : () => {};
        } catch (e) {
          console.warn('[AwooCore:ProfileSync] hold failed:', h.name, e);
        }
      } else if (!want && h.unsubscribe) {
        closeHold(h);
      }
    }
  }

  function closeHold(h) {
    if (h.unsubscribe) { try { h.unsubscribe(); } catch (e) { /* the client may be gone */ } }
    h.unsubscribe = null;
  }

  // ---- Core.profile.watch: DEPRECATED (R92) ----
  //
  // Party before needsCore 16 asked for its party data with this: a watch per
  // query, opened in EVERY tab it was loaded in and held around the clock, so
  // three tabs held three copies of each member's levels. Modules now declare
  // what they read (about.uses) and Core fetches. This stays only so an older
  // Party keeps working under this AWOO+: same allowlist (every catalogue
  // query with its argument keys), same cap, same null on refusal, same
  // release function. What changed is WHERE it opens: in the leading tab
  // only, which answers for every tab through the store's broadcast. The
  // design (REGISTER.md R92) said "a local hold"; opening it in every tab is
  // the very duplication R92 removes, and "a second tab adds no subscription"
  // is tested with that older Party loaded
  // (tests/profile-sync-scheduler.mjs). Without Web Locks it opens locally,
  // exactly as before.
  //
  // Returns a release function, or null when refused: a query not on the
  // list, arguments of another shape, the cap reached, or background reads
  // off. A consumer given null reads the section as unobserved (rule 3).
  function watchQuery(name, args) {
    const shape = WATCHABLE[name];
    if (!shape || !watchOn()) return null;
    const a = args && typeof args === 'object' ? args : {};
    const keys = Object.keys(a).sort();
    if (keys.join(',') !== shape.slice().sort().join(',') || keys.some((k) => typeof a[k] !== 'string' || !a[k])) return null;
    const hk = holdKeyOf(name, a);
    let h = holds.get(hk);
    if (!h) {
      if (holds.size >= MAX_WATCHES) return null;
      const ownId = ctxFrom(currentProfile()).ownId;
      const key = a.characterId && ownId && a.characterId !== ownId ? `${name}#${a.characterId}` : name;
      h = newHold(name, a, key);
      holds.set(hk, h);
    }
    h.legacy++;
    openHolds();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      h.legacy--;
      if (!holdHeld(h)) { closeHold(h); if (holds.get(hk) === h) holds.delete(hk); } else openHolds();
    };
  }

  // ---- Background reads: a read is a page visit (R92) ----
  //
  // subscribe -> the first answer is in the cache -> captureNow() records it
  // -> THEN unsubscribe. One execution on the server, like opening the page
  // and leaving; no standing re-runs.
  //
  // THE BOUNDS, all enforced here and in dueAtOf:
  //   leader only       one tab reads for all; no Web Locks, no background.
  //   one per interval  due = last answer + every * (1 + jitter up to 10%), the
  //                     jitter so rows that start together drift apart.
  //   floor             no query read twice within READ_FLOOR_MS, whoever asks.
  //   in flight         at most MAX_IN_FLIGHT, each start READ_SPACING_MS after
  //                     the last.
  //   timeout           READ_TIMEOUT_MS, then unsubscribe and count a failure.
  //   back-off          after a failure the next try waits min(24 h, max(every,
  //                     5 min * 2^fails)); a success resets it.
  //   hourly ceiling    MAX_BACKGROUND_READS_PER_HOUR started in any rolling
  //                     hour, whoever asked; beyond it, refused and recorded.
  //   socket down       nothing is asked.
  //   switches off      nothing: with Settings › Profile's background switch
  //                     off, AWOO+ adds no subscription of its own.
  // Due-ness is derived from the clock and meta.queryAt (rule 5), never from a
  // per-tick counter, and never from a section's observedAt: a section fed by
  // three queries can be half fresh.
  const rowState = new Map(); // key -> { lastOkAt, lastStartAt, fails, failAt, lastError, jitter }
  const queue = new Map();    // key -> job, in arrival order
  const inFlight = new Map(); // key -> read
  const readLog = [];         // start times, the last hour
  const peerReads = [];       // what the leader reported, the last hour
  const refused = { ceiling: 0, offline: 0, lastAt: null, lastWhy: null };
  let lastReadStartAt = -Infinity;
  let pumpTimer = null;

  function stateOf(key) {
    let s = rowState.get(key);
    if (!s) {
      s = { lastOkAt: null, lastStartAt: null, fails: 0, failAt: null, lastError: null, jitter: Math.random() * JITTER };
      rowState.set(key, s);
    }
    return s;
  }
  const pruneLog = (log, now) => { while (log.length && log[0] <= now - HOUR_MS) log.shift(); };
  function refuse(why, n = 1) {
    refused[why] = (refused[why] || 0) + n;
    refused.lastAt = Date.now();
    refused.lastWhy = why;
  }

  function lastAtOf(key, profile) {
    const stamped = profile && profile.meta && profile.meta.queryAt ? profile.meta.queryAt[key] : null;
    const st = rowState.get(key);
    let best = null;
    for (const t of [stamped, knownQueryAt[key], st && st.lastOkAt]) if (Number.isFinite(t) && (best === null || t > best)) best = t;
    return best;
  }

  // A query this tab holds open is kept fresh by the server already: reading
  // it once more would add a subscriber and take it away again, for nothing.
  function heldHere(key) {
    for (const h of holds.values()) if (h.key === key && h.unsubscribe) return true;
    return false;
  }

  // When a background row is next due, from the clock (rule 5).
  function dueAtOf(inst, profile) {
    const st = rowState.get(inst.key) || { jitter: 0, fails: 0, failAt: null, lastStartAt: null };
    const last = inst.stale ? null : lastAtOf(inst.key, profile);
    let at = last === null ? 0 : last + inst.row.every * (1 + st.jitter);
    if (st.fails > 0 && st.failAt !== null) {
      at = Math.max(at, st.failAt + Math.min(BACKOFF_MAX_MS, Math.max(inst.row.every, BACKOFF_BASE_MS * Math.pow(2, st.fails))));
    }
    if (st.lastStartAt !== null) at = Math.max(at, st.lastStartAt + READ_FLOOR_MS);
    return at;
  }

  function enqueue(inst, kind, manual) {
    if (inFlight.has(inst.key) || queue.has(inst.key)) return false;
    queue.set(inst.key, { key: inst.key, name: inst.name, args: inst.args, kind, manual: !!manual });
    return true;
  }

  function mayRead(job) {
    if (!attachedClient || typeof attachedClient.subscribe !== 'function' || !watchOn()) return false;
    if (!job.manual && !autoSyncOn()) return false;
    if (job.kind === 'background' && !isLeader) return false;
    return true;
  }

  function pump() {
    if (pumpTimer !== null) return;
    while (queue.size && inFlight.size < MAX_IN_FLIGHT) {
      const now = Date.now();
      const [key, job] = queue.entries().next().value;
      if (!mayRead(job)) { queue.delete(key); continue; }
      if (!connected()) { refuse('offline', queue.size); queue.clear(); return; }
      const wait = lastReadStartAt + READ_SPACING_MS - now;
      if (wait > 0) {
        pumpTimer = setTimeout(() => { pumpTimer = null; pump(); }, wait);
        return;
      }
      pruneLog(readLog, now);
      if (readLog.length >= MAX_BACKGROUND_READS_PER_HOUR) {
        refuse('ceiling', queue.size);
        queue.clear();
        return;
      }
      queue.delete(key);
      const st = stateOf(key);
      if (st.lastStartAt !== null && now - st.lastStartAt < READ_FLOOR_MS) continue;
      startRead(job, now);
    }
  }

  function startRead(job, now) {
    const client = attachedClient;
    const st = stateOf(job.key);
    let sub = null;
    try {
      sub = client.subscribe(canonicalUdfPath(job.name), job.args);
    } catch (e) {
      console.warn('[AwooCore:ProfileSync] read failed:', job.name, e);
    }
    readLog.push(now);
    lastReadStartAt = now;
    st.lastStartAt = now;
    const read = {
      job, client, startedAt: now, timer: null,
      token: sub ? sub.queryToken : undefined,
      unsubscribe: sub && typeof sub.unsubscribe === 'function' ? sub.unsubscribe : () => {},
    };
    // Recorded, not finished: finishReads would pump, and this runs inside
    // pump's own loop.
    if (!sub) { recordOutcome(job.key, 'subscribe failed', now); return; }
    inFlight.set(job.key, read);
    read.timer = setTimeout(() => readTimedOut(job.key), READ_TIMEOUT_MS);
    // Already answered (a page holds it): record it in a moment, no wait.
    if (answerOf(read)) soon(completeReads);
  }

  // 'ok' | 'error' | null (no answer yet). By token through the client's own
  // cache; a client whose subscribe returned no token is matched by query
  // name and arguments instead.
  function answerOf(read) {
    const c = read.client;
    if (!c) return null;
    const optimistic = c.optimisticQueryResults || (c.client && c.client.optimisticQueryResults);
    const map = optimistic && optimistic.queryResults;
    let entry;
    if (map && typeof map.get === 'function') {
      if (read.token !== undefined) entry = map.get(read.token);
      else if (typeof map.forEach === 'function') {
        map.forEach((e) => {
          if (!entry && e && e.udfPath && dottedQueryName(e.udfPath) === read.job.name && sameArgs(e.args, read.job.args)) entry = e;
        });
      }
      if (entry && entry.result) return entry.result.success ? 'ok' : 'error';
      if (map.size !== undefined || entry !== undefined) return null;
    }
    if (read.token !== undefined && typeof c.hasLocalQueryResultByToken === 'function') {
      try { if (!c.hasLocalQueryResultByToken(read.token)) return null; } catch (e) { return null; }
      if (typeof c.localQueryResultByToken !== 'function') return 'ok';
      try { c.localQueryResultByToken(read.token); return 'ok'; } catch (e) { return 'error'; }
    }
    return null;
  }

  function readsWithAnswers() {
    const out = [];
    for (const r of inFlight.values()) if (r.client === attachedClient && answerOf(r)) out.push(r);
    return out;
  }
  function completeReads() {
    if (readsWithAnswers().length) captureNow();
  }
  function readTimedOut(key) {
    const r = inFlight.get(key);
    if (!r) return;
    r.timer = null;
    // A hidden tab can run this late, after the answer came: record it.
    if (answerOf(r)) { captureNow(); return; }
    finishReads([[r, 'timeout']]);
  }

  // Called by captureNow AFTER its commit, with the reads it saw answered.
  function settleReads(ready) {
    const done = [];
    for (const r of ready) if (inFlight.get(r.job.key) === r) done.push([r, answerOf(r) === 'ok' ? null : 'error']);
    if (done.length) finishReads(done);
  }

  function recordOutcome(key, error, now) {
    const st = stateOf(key);
    if (error) {
      st.fails++;
      st.failAt = now;
      st.lastError = error;
    } else {
      st.fails = 0;
      st.failAt = null;
      st.lastError = null;
      st.lastOkAt = now;
      st.jitter = Math.random() * JITTER;
    }
  }

  function finishReads(done) {
    const now = Date.now();
    const report = [];
    for (const [r, error] of done) {
      if (inFlight.get(r.job.key) === r) inFlight.delete(r.job.key);
      if (r.timer) { clearTimeout(r.timer); r.timer = null; }
      try { r.unsubscribe(); } catch (e) { /* the client may be gone */ }
      recordOutcome(r.job.key, error, now);
      report.push({ key: r.job.key, at: now, ok: !error });
    }
    postBc({ type: 'SYNC_READS', v: 1, characterId: ctxFrom(currentProfile()).ownId, reads: report, at: now });
    pump();
    armTimer();
  }

  // The game replaced its client: reads on the old one will never answer.
  // Neither a success nor a failure; the schedule asks again.
  function dropReads() {
    for (const r of inFlight.values()) {
      if (r.timer) clearTimeout(r.timer);
      try { r.unsubscribe(); } catch (e) { /* gone with its client */ }
    }
    inFlight.clear();
  }

  // ---- The schedule (leader only) ----
  //
  // ONE timer, set to the earliest due time (clamped ARM_MIN_MS..ARM_MAX_MS),
  // re-armed on each commit, module change, settings change and leadership
  // change; it only ever moves EARLIER when re-armed, so a busy page
  // committing every few seconds cannot keep pushing it back.
  let schedTimer = null;
  let schedAt = null;
  const canBackground = () => isLeader && backgroundOn() && !!attachedClient;

  function backgroundInstances(profile) {
    const demand = demandOf(startedModules());
    if (!demand.size) return [];
    const ctx = ctxFrom(profile);
    const out = [];
    for (const row of CATALOGUE) {
      if (row.every === null || !demand.has(row.section)) continue;
      for (const inst of instancesOf(row, ctx)) if (!heldHere(inst.key)) out.push(inst);
    }
    return out;
  }

  function clearSched() {
    if (schedTimer !== null) { clearTimeout(schedTimer); schedTimer = null; }
    schedAt = null;
  }

  function armTimer() {
    if (!canBackground()) { clearSched(); return; }
    const now = Date.now();
    let next = null;
    if (!connected()) next = now + OFFLINE_RETRY_MS;
    else {
      const p = currentProfile();
      for (const inst of backgroundInstances(p)) {
        if (queue.has(inst.key) || inFlight.has(inst.key)) continue;
        const d = dueAtOf(inst, p);
        if (next === null || d < next) next = d;
      }
      if (next === null) { clearSched(); return; }
      pruneLog(readLog, now);
      if (readLog.length >= MAX_BACKGROUND_READS_PER_HOUR) next = Math.max(next, readLog[0] + HOUR_MS);
    }
    const at = now + Math.min(ARM_MAX_MS, Math.max(ARM_MIN_MS, next - now));
    if (schedTimer !== null && schedAt <= at) return;
    clearSched();
    schedAt = at;
    schedTimer = setTimeout(tick, at - now);
  }

  function tick() {
    schedTimer = null;
    schedAt = null;
    if (canBackground() && connected()) {
      const now = Date.now();
      const p = currentProfile();
      for (const inst of backgroundInstances(p)) if (dueAtOf(inst, p) <= now) enqueue(inst, 'background', false);
      pump();
    }
    armTimer();
  }

  // ---- Asking on purpose: request() and Sync now ----
  function normSections(sections) {
    const list = sections === null || sections === undefined ? CATALOGUE_SECTIONS
      : (Array.isArray(sections) ? sections : [sections]);
    return [...new Set(list.filter((s) => typeof s === 'string' && CATALOGUE_SECTIONS.includes(s)))];
  }

  // Freshen these sections' rows now: every row that is asked at all (not
  // page-held) whose last answer is older than maxAgeMs, ignoring the
  // interval and whether a module uses it, inside every other bound.
  // Returns the keys queued here.
  //
  // FOLLOW-UP. Some asks only exist once another answer is in: the members'
  // levels need the overview's member list. So a request stays open for
  // REQUEST_FOLLOW_UP_MS and is run again on each commit in that time; what
  // was just read is fresh and what was just started is under the floor, so
  // a re-run queues only asks that are new.
  let followUp = null;
  const REQUEST_FOLLOW_UP_MS = MIN_MS;
  function runRequest(sections, maxAgeMs, manual) {
    if (!attachedClient || !watchOn() || (!manual && !autoSyncOn())) return [];
    if (!connected()) { refuse('offline'); return []; }
    const now = Date.now();
    if (!followUp || followUp.until < now || followUp.maxAgeMs !== maxAgeMs || followUp.manual !== !!manual) {
      followUp = { sections: new Set(sections), maxAgeMs, manual: !!manual, until: now + REQUEST_FOLLOW_UP_MS };
    } else {
      for (const s of sections) followUp.sections.add(s);
    }
    return queueRequest(sections, maxAgeMs, manual, now);
  }
  function followUpRequest() {
    const f = followUp;
    if (!f) return;
    if (f.until < Date.now()) { followUp = null; return; }
    if (!attachedClient || !watchOn() || (!f.manual && !autoSyncOn()) || !connected()) return;
    queueRequest([...f.sections], f.maxAgeMs, f.manual, Date.now());
  }
  function queueRequest(sections, maxAgeMs, manual, now) {
    const p = currentProfile();
    const ctx = ctxFrom(p);
    const want = new Set(sections);
    const keys = [];
    for (const row of CATALOGUE) {
      if (!want.has(row.section) || (row.every === null && !row.hold)) continue;
      for (const inst of instancesOf(row, ctx)) {
        if (heldHere(inst.key)) continue;
        const last = inst.stale ? null : lastAtOf(inst.key, p);
        if (last !== null && now - last < maxAgeMs) continue;
        const st = rowState.get(inst.key);
        if (st && st.lastStartAt !== null && now - st.lastStartAt < READ_FLOOR_MS) continue;
        if (enqueue(inst, 'request', manual)) keys.push(inst.key);
      }
    }
    pump();
    return keys;
  }

  // Core.profile.request(sections, { maxAgeMs }): a one-shot freshen, for a
  // tool that opens or anything that needs a section now. maxAgeMs defaults to
  // 15 minutes and is never under the one-minute floor. It runs in the leading
  // tab: here when this tab leads or no tab does, otherwise it is posted to
  // the leader (SYNC_REQUEST on awoo-profile). Resolves to { ran: 'here' |
  // 'leader' | 'off', keys } (keys: what was queued here).
  function request(sections, opts) {
    const list = normSections(sections);
    const o = opts && typeof opts === 'object' ? opts : {};
    const maxAgeMs = Math.max(READ_FLOOR_MS, Number.isFinite(o.maxAgeMs) ? o.maxAgeMs : REQUEST_MAX_AGE_MS);
    if (!list.length || !backgroundOn()) return Promise.resolve({ ran: 'off', keys: [] });
    if (isLeader || !locksApi()) return Promise.resolve({ ran: 'here', keys: runRequest(list, maxAgeMs, false) });
    return refreshLeaderView().then((elsewhere) => {
      if (isLeader || !elsewhere) return { ran: 'here', keys: runRequest(list, maxAgeMs, false) };
      postBc({ type: 'SYNC_REQUEST', v: 1, characterId: ctxFrom(currentProfile()).ownId, sections: list, maxAgeMs, at: Date.now() });
      return { ran: 'leader', keys: [] };
    });
  }

  // SYNC NOW, as clicking through every page would: every tab captures its
  // own cache (free), and the leader reads every catalogue section older
  // than a minute. Two signals carry it: Core's awoo:profile:resync event
  // (the button, in the tab it was pressed in, and in every other tab when
  // Core hears REQUEST_PROFILE_SYNC) and REQUEST_PROFILE_SYNC itself on this
  // file's channel. Both arrive for one press, so they are coalesced over
  // SYNC_NOW_SETTLE_MS. A tool page's REQUEST_PROFILE_SYNC may carry
  // `sections`: then only those are read. Core dispatches the event for that
  // message too, unsectioned, so a sectioned message narrows an "everything"
  // that only the event asked for; one that another tab's own REQUEST (no
  // sections) asked for stays everything.
  let syncNow = null;
  function noteSyncNow(sections, fromBc) {
    const list = Array.isArray(sections) ? normSections(sections) : null;
    if (!syncNow) {
      captureNow();
      syncNow = { all: false, allFromBc: false, sections: new Set(), timer: setTimeout(flushSyncNow, SYNC_NOW_SETTLE_MS) };
    }
    if (list === null) {
      syncNow.all = true;
      if (fromBc) syncNow.allFromBc = true;
    } else {
      for (const s of list) syncNow.sections.add(s);
    }
  }
  function flushSyncNow() {
    const s = syncNow;
    syncNow = null;
    if (!s || !watchOn()) return;
    const sections = s.sections.size && !s.allFromBc ? [...s.sections] : (s.all ? CATALOGUE_SECTIONS : [...s.sections]);
    if (!sections.length) return;
    // Every tab heard it; one reads. The leader, or, with no Web Locks and so
    // no leader, the tab the player is looking at.
    if (isLeader || (!locksApi() && pageVisible())) runRequest(sections, SYNC_NOW_MAX_AGE_MS, true);
  }

  // ---- Status, for the Control Panel (Part C of R92) ----
  // A copy. leader: this tab leads (null: no Web Locks, so nobody does).
  // background: 'on' | 'off' | 'unsupported'. readsLastHour: the reads this
  // tab started if it leads, else what the leader reported. rows: one per
  // catalogue ask (members expanded), with when it was last answered, when it
  // is next due here (null: not scheduled in this tab), and its failures.
  function syncStatus() {
    const now = Date.now();
    const p = currentProfile();
    const ctx = ctxFrom(p);
    const locks = !!locksApi();
    pruneLog(readLog, now);
    pruneLog(peerReads, now);
    const demand = demandOf(startedModules());
    const rows = [];
    for (const row of CATALOGUE) {
      const insts = instancesOf(row, ctx);
      const list = insts.length ? insts : [{ row, name: row.name, section: row.section, args: null, key: row.name, stale: false }];
      for (const inst of list) {
        const st = rowState.get(inst.key) || null;
        const scheduled = canBackground() && row.every !== null && !!inst.args && demand.has(row.section) && !heldHere(inst.key);
        const flight = inFlight.has(inst.key);
        rows.push({
          section: row.section, name: row.name, key: inst.key, every: row.every, live: !!row.live, hold: !!row.hold,
          asked: !!inst.args, used: demand.has(row.section),
          lastAt: lastAtOf(inst.key, p),
          nextAt: scheduled && !flight ? dueAtOf(inst, p) : null,
          inFlight: flight,
          fails: st ? st.fails : 0,
          lastError: st ? st.lastError : null,
        });
      }
    }
    refreshLeaderView();
    return {
      leader: locks ? isLeader : null,
      otherLeader: locks ? otherLeader : null,
      background: !locks ? 'unsupported' : (backgroundOn() ? 'on' : 'off'),
      readsLastHour: isLeader ? readLog.length : peerReads.length,
      inFlight: inFlight.size,
      queued: queue.size,
      holds: [...holds.values()].filter((h) => h.unsubscribe).map((h) => h.key),
      capped: [...capped],
      refused: Object.assign({}, refused),
      rows,
    };
  }

  if (Core.profile) {
    Core.profile.watch = watchQuery;
    Core.profile.request = request;
    Core.profile.syncStatus = syncStatus;
    Core.profile.catalogue = PUBLIC_CATALOGUE;
  }

  // ---- BroadcastChannel Cross-Tab Synchronization ----
  // Core's own channel (core.js) carries the profile between tabs; this one
  // carries the sync layer's own messages on the same name:
  //   REQUEST_PROFILE_SYNC  Sync now, from a tab or a tool page (sections?)
  //   SYNC_REQUEST          a follower's request(), for the leader to run
  //   SYNC_READS            the leader's finished reads, so followers know
  //                         what was read (status, and a new leader's due
  //                         times after a hand-over)
  // Other tabs on another character are ignored.
  let profileBc = null;
  function postBc(msg) {
    if (!profileBc) return;
    try { profileBc.postMessage(msg); } catch (e) { /* closed */ }
  }
  function sameCharacter(data) {
    const mine = ctxFrom(currentProfile()).ownId;
    return !(mine && typeof data.characterId === 'string' && data.characterId && data.characterId !== mine);
  }
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      profileBc = new BroadcastChannel('awoo-profile');
      profileBc.onmessage = (event) => {
        const data = event && event.data;
        if (!data || typeof data !== 'object') return;
        if (data.type === 'REQUEST_PROFILE_SYNC') {
          noteSyncNow(Array.isArray(data.sections) ? data.sections : null, true);
        } else if (data.type === 'SYNC_REQUEST' && data.v === 1) {
          if (isLeader && sameCharacter(data)) {
            const age = Number.isFinite(data.maxAgeMs) ? data.maxAgeMs : REQUEST_MAX_AGE_MS;
            runRequest(normSections(data.sections), Math.max(READ_FLOOR_MS, age), false);
          }
        } else if (data.type === 'SYNC_READS' && data.v === 1 && Array.isArray(data.reads)) {
          if (!sameCharacter(data)) return;
          if (!isLeader) otherLeader = true;
          for (const r of data.reads) {
            if (!r || typeof r.key !== 'string' || !Number.isFinite(r.at)) continue;
            peerReads.push(r.at);
            if (r.ok) noteQueryAt(r.key, r.at);
          }
          pruneLog(peerReads, Date.now());
        }
      };
    }
  } catch (e) { /* ignore */ }

  // ---- No module registration: Core does not switch itself off ----
  //
  // As a module this had an on/off toggle and a quick-capture button. Neither
  // survives: capture is always on, and the manual trigger is Core's own
  // "Resync profile" control, which dispatches the event handled below.
  // The test seam mirrors Core's __modulesForTest.
  Core.__profileSyncForTest = {
    normalizeProfile,
    mergeObservedProfile,
    foldPartyLastAction,
    extractConvexQueries,
    splitQueries,
    watchQuery,
    canonicalUdfPath,
    openWatches: openHolds,
    // The legacy watches live in the one hold table now (R92).
    watches: holds,
    holds,
    setClientForTest: (c) => { attachedClient = c; },
    scanReactProvidersForProfileData,
    scanFiberForProfileData,
    scanDomForProfileData,
    captureNow,
    getActiveProfile: () => activeProfile,
    BASE_STAT_KEYS,
    // R92: the catalogue and the scheduler's insides, for the catalogue audit
    // and tests/profile-sync-scheduler.mjs.
    CATALOGUE,
    PAGE_ONLY,
    WATCHABLE,
    ctxFrom,
    instancesOf,
    limits: {
      READ_FLOOR_MS, READ_TIMEOUT_MS, MAX_IN_FLIGHT, READ_SPACING_MS, MAX_BACKGROUND_READS_PER_HOUR,
      BACKOFF_BASE_MS, BACKOFF_MAX_MS, JITTER, ARM_MIN_MS, ARM_MAX_MS, MAX_WATCHES,
      AMBIENT_POLL_MS, AMBIENT_ATTACHED_MS, REQUEST_MAX_AGE_MS, SYNC_NOW_MAX_AGE_MS, LEADER_LOCK,
    },
    scheduler: {
      get isLeader() { return isLeader; },
      get schedAt() { return schedAt; },
      queue, inFlight, rowState, readLog,
      tick, armTimer, pump, syncHolds,
    },
  };

  window.addEventListener('awoo:profile:resync', () => { noteSyncNow(null, false); });

  // ---- Automatic captures, governed by Settings › Profile ----
  //
  // Everything below is automatic and stops when auto-sync is off; the resync
  // listener above is manual and never does. The background timer is STOPPED
  // when off rather than left ticking and returning early: a timer that fires
  // only to do nothing still wakes a hidden tab, which is the cost §4.4 of
  // INSTRUMENTATION.md exists to avoid.
  let ambientTimer = null;
  let ambientMs = null;
  function startAmbient() {
    const ms = attachedClient ? AMBIENT_ATTACHED_MS : AMBIENT_POLL_MS;
    if (ambientTimer !== null && ambientMs === ms) return;
    if (ambientTimer !== null) clearInterval(ambientTimer);
    ambientMs = ms;
    ambientTimer = setInterval(() => { captureNow(); }, ms);
  }
  function stopAmbient() {
    if (ambientTimer !== null) { clearInterval(ambientTimer); ambientTimer = null; ambientMs = null; }
  }
  // The switches: every automatic ask re-reads them, and these re-evaluate
  // at once, so turning one off closes what it opened now, not at the next
  // tick.
  window.addEventListener('awoo:profile:auto-sync', (e) => {
    if (e && e.detail) { startAmbient(); captureNow(); } else { stopAmbient(); }
    if (!autoSyncOn()) for (const [k, job] of queue) if (!job.manual) queue.delete(k);
    syncHolds();
    armTimer();
  });
  window.addEventListener('awoo:profile:watch', (e) => {
    if (e && e.detail) seekLeadership();
    else { yieldLeadership(); queue.clear(); }
    syncHolds();
    armTimer();
  });
  // A module started, stopped, opened or closed its window (Core fires this,
  // R92): what is held and what is due follow what is in use.
  window.addEventListener('awoo:modules:change', () => { syncHolds(); armTimer(); });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && autoSyncOn()) captureNow();
    // Live holds follow what the player can see.
    syncHolds();
  });

  // Every commit (this tab's captures, another tab's broadcast): the members,
  // ids and stamps the holds and the schedule are computed from may have moved.
  if (Core.profile && typeof Core.profile.subscribe === 'function') {
    Core.profile.subscribe(() => { syncHolds(); followUpRequest(); armTimer(); });
  }

  if (autoSyncOn()) {
    startAmbient();
    setTimeout(() => { captureNow(); }, 1000);
  }
  Core.__profileSyncForTest.isAmbientRunning = () => ambientTimer !== null;
  Core.__profileSyncForTest.ambientMs = () => ambientMs;
  })();

})();


// ---- bundled module: dungeon-win-rate ----
(function () {
  'use strict';

  // ==== GENERATED — DO NOT EDIT ====
  // Produced by userscripts/build.mjs from data/. Edit the FACT,
  // then rebuild; editing this block is overwritten and, worse,
  // silently diverges from the core it was supposed to mirror.

  // NO-PROVENANCE: scaffolded by new-module.mjs; dungeon-win-rate reads no data/ fact yet

  // ==== END GENERATED ====

  // ---- What this module is, for a Core that has not started it (generated from dungeon-win-rate.release.json) ----
  const AWOO_ABOUT = Object.freeze({"label":"Dungeon Win Rate","shortLabel":"Dungeon WR","description":"Scans dungeon history and summarizes wins, losses, attempts, and win rate.","category":"Fighters","kind":"module","uses":[],"needsCore":14,"lifecycle":2});

  // ---- Core intake shim (generated) ----
  // Requires the "AWOO+" userscript. Without it this module does nothing.
  (function (id, version, factory) {
    var host = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || null;
    var q = (window.__awooModules = window.__awooModules || []);
    q.push({ id: id, version: version, hostVersion: host, factory: factory, claimed: false, descriptor: null, about: AWOO_ABOUT });
    if (window.__AwooCore && window.__AwooCore.claim) { window.__AwooCore.claim(); return; }
    setTimeout(function () {
      if (!window.__AwooCore) console.warn('[AWOO+] "' + id + '" is installed but the AWOO+ script is not. Install AWOO+ and reload.');
    }, 8000);
  })("dungeon-win-rate", "0.1.1", function (Core) {
  if (AWOO_ABOUT.needsCore && !(Core.version >= AWOO_ABOUT.needsCore)) {
    if (Core.registerModule) Core.registerModule(Object.assign({ id: "dungeon-win-rate" }, AWOO_ABOUT));
    return null;
  }

const MODULE_ID = 'dungeon-win-rate';
const STORAGE_KEY = `awoo:${MODULE_ID}:v1`;

const scope = Core.createScope(MODULE_ID);

let windowHandle = null;
let scanning = false;
let stopRequested = false;
let currentPosition = null;
// The activity strip (Core v11): what each scan did, with its time. A scan
// opens one busy entry and always closes it — done with the count, stopped,
// or failed with the reason (DESIGN.md §5: no silent outcome).
let activity = null;
let scanEntry = null;

// Numbers in the PLAYER's convention, not the browser's (toLocaleString used
// the browser's locale, which is not what the game shows this character).
function numberSeparators() {
  try {
    const c = typeof Core.getNumberConvention === 'function' ? Core.getNumberConvention() : null;
    return { group: (c && c.group) || ',', decimal: (c && c.decimal) || '.' };
  } catch (e) { return { group: ',', decimal: '.' }; }
}
function fmtInt(n) {
  return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, numberSeparators().group);
}
function fmtPct(n) {
  return (Number(n) || 0).toFixed(2).replace('.', numberSeparators().decimal) + '%';
}
function fmtWhen(t) {
  if (!t) return '—';
  try { return new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch (e) { return new Date(t).toLocaleString(); }
}

// Saved through Core.store (v14): batched, flushed on unload and when the tab
// goes away, and a failed write is reported instead of swallowed. The copy in
// memory is the truth for this run; a fresh load reads it back from storage.
const store = Core.store(STORAGE_KEY);
let data = store.read() || {};

function load() {
  return data;
}

function save(patch) {
  data = { ...data, ...patch };
  store.write(data);
  renderWindow();
}

function clean(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function sleep(ms) {
  return new Promise((resolve) => {
    const id = setTimeout(resolve, ms);
    scope.add(() => clearTimeout(id));
  });
}

function parseDate(text) {
  const m = String(text || '').match(
    /([A-Z][a-z]{2})\s+(\d{1,2}),\s+(\d{4}),\s+(\d{2}):(\d{2}):(\d{2})/
  );
  if (!m) return 0;

  const months = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };

  return new Date(
    Number(m[3]),
    months[m[1]],
    Number(m[2]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6])
  ).getTime();
}

function duration(ms) {
  if (!ms || ms < 0) return '0m';

  let s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  s %= 86400;
  const h = Math.floor(s / 3600);
  s %= 3600;
  const m = Math.floor(s / 60);

  return [
    d ? `${d}d` : '',
    h ? `${h}h` : '',
    (m || (!d && !h)) ? `${m}m` : '',
  ].filter(Boolean).join(' ');
}

function findScrollBox() {
  const boxes = [...document.querySelectorAll('div,main,section')]
    .filter((el) => {
      const style = getComputedStyle(el);
      return /(auto|scroll)/i.test(style.overflowY) &&
        el.scrollHeight > el.clientHeight + 100;
    })
    .sort((a, b) => b.scrollHeight - a.scrollHeight);

  return boxes[0] || document.scrollingElement || document.documentElement;
}

// SPEED (reported 2026-09-21: "the scanning is too slow"). This used to call
// innerText on EVERY div, section, article and link on the page, every scroll
// step — innerText forces layout, and the list container's own text grows with
// every page of history loaded, so each step got slower than the last. Now a
// cheap textContent test runs first (no layout), and only card-sized elements
// that mention a dungeon result pay for innerText. The card-matching rules
// below are unchanged, so what is counted is exactly what was counted before.
const CARD_TEXT_MAX = 600;
function readCards(results = {}) {
  const nodes = [...document.querySelectorAll('div,section,article,a')]
    .filter((el) => {
      const t = el.textContent || '';
      return t.length < CARD_TEXT_MAX && /against dungeon level/i.test(t);
    })
    .map((el) => ({ el, text: clean(el.innerText) }))
    .filter((item) =>
      /against dungeon level/i.test(item.text) &&
      /\b(win|loss)\b/i.test(item.text) &&
      /[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4},\s+\d{2}:\d{2}:\d{2}/.test(item.text) &&
      item.el.getBoundingClientRect().width > 150
    )
    .sort((a, b) => a.text.length - b.text.length);

  for (const item of nodes) {
    const text = item.text;
    const time = parseDate(text);
    if (!time) continue;

    let wins = 0;
    let losses = 0;

    if (/win against dungeon level/i.test(text)) {
      wins = 1;
    }

    const lossMatch = text.match(/x\s*(\d+)\s+loss against dungeon level/i);
    if (lossMatch) {
      losses = Number(lossMatch[1]);
    } else if (/loss against dungeon level/i.test(text)) {
      losses = 1;
    }

    if (!wins && !losses) continue;

    const level = (text.match(/dungeon level\s+(\d+)/i) || [, ''])[1];
    const key = `${time}|${wins}|${losses}|${level}`;

    results[key] = { wins, losses, time };
  }

  return results;
}

function summary(results) {
  const arr = Object.values(results || {});
  let wins = 0;
  let losses = 0;
  let oldest = 0;
  let newest = 0;

  for (const row of arr) {
    wins += Number(row.wins || 0);
    losses += Number(row.losses || 0);

    if (!oldest || row.time < oldest) oldest = row.time;
    if (!newest || row.time > newest) newest = row.time;
  }

  const total = wins + losses;

  return {
    wins,
    losses,
    total,
    cards: arr.length,
    pct: total ? (wins / total) * 100 : 0,
    oldest,
    newest,
    covered: newest && oldest ? newest - oldest : 0,
  };
}

async function scan() {
  if (scanning) return;

  scanning = true;
  stopRequested = false;

  let results = {};
  let lastTotal = 0;
  let stuck = 0;

  save({
    status: 'Scanning',
    results: {},
    sum: null,
  });
  if (activity && typeof activity.busy === 'function') scanEntry = activity.busy('Scanning history · stay on this page');
  if (typeof Core.setState === 'function') Core.setState(MODULE_ID, 'running', 'scanning');

  const box = findScrollBox();

  try {
    box.scrollTop = 0;
    window.scrollTo(0, 0);
    await sleep(250);

    while (!stopRequested) {
      results = readCards(results);
      const s = summary(results);

      save({
        status: `Scanning · ${fmtInt(s.total)} attempts so far`,
        results,
        sum: s,
      });

      if (s.total === lastTotal) {
        stuck += 1;
      } else {
        stuck = 0;
        lastTotal = s.total;
      }

      const before = box.scrollTop;
      const heightBefore = box.scrollHeight;

      // Same step as before (0.85 of a screen, so a list that only renders what
      // is on screen cannot skip cards), but the WAIT is no longer a flat 900ms.
      box.scrollTop += Math.floor(box.clientHeight * 0.85);
      box.dispatchEvent(new Event('scroll', { bubbles: true }));

      window.scrollBy(0, Math.floor(window.innerHeight * 0.85));
      document.dispatchEvent(new Event('scroll', { bubbles: true }));

      const nearBottom =
        box.scrollTop + box.clientHeight >= box.scrollHeight - 20;

      // Mid-list, the next cards are already loaded and only need a frame to
      // render: a short wait. At the bottom, the next page comes from the
      // network: wait for the list to GROW, up to 1.5s, checking every 150ms.
      if (!nearBottom) {
        await sleep(120);
      } else {
        const until = Date.now() + 1500;
        while (Date.now() < until && box.scrollHeight === heightBefore && !stopRequested) await sleep(150);
      }

      if ((box.scrollTop === before || nearBottom) && box.scrollHeight === heightBefore && stuck >= 3) break;
      if (stuck >= 10) break;
    }

    const final = summary(results);
    save({
      status: stopRequested ? 'Stopped' : 'Done',
      results,
      sum: final,
    });
    const line = `${fmtInt(final.total)} attempts across ${fmtInt(final.cards)} history cards`;
    // Finding nothing is a refusal, not a result of zero: it means this page
    // holds no history cards to read, and saying "done, 0 attempts" would pass
    // off "I could not see any" as "you have none".
    if (scanEntry) {
      if (!final.cards && !stopRequested) scanEntry.refused('No dungeon history cards on this page.');
      else if (stopRequested) scanEntry.stopped('Stopped at ' + line);
      else scanEntry.done('Scanned ' + line);
    }
  } catch (err) {
    save({ status: 'Failed' });
    if (scanEntry) scanEntry.failed('Scan failed: ' + (err && err.message ? err.message : String(err)));
    else if (activity) activity.failed('Scan failed: ' + (err && err.message ? err.message : String(err)));
  } finally {
    scanEntry = null;
    if (typeof Core.setState === 'function') Core.setState(MODULE_ID, 'idle', '');
    scanning = false;
    stopRequested = false;
    renderWindow();
  }
}

function injectStyles() {
  // REBUILT 2026-09-21 onto Core's shared parts (DESIGN.md §3/§4): the answer
  // band, the action row, one label/value grid, the activity strip. The old
  // sheet was a private dark palette in monospace with 800-weight buttons and
  // a neon green headline; none of it is left. What remains is only the
  // content root's own name, so the module has somewhere to hang a rule.
  const style = document.createElement('style');
  style.textContent = `
    .awoo-dungeon-win-rate .awoo-ui-rows > .v{font-variant-numeric:tabular-nums}
  `;
  document.documentElement.appendChild(style);
  scope.add(() => style.remove());
}

function buildContent() {
  const root = document.createElement('div');
  root.className = 'awoo-dungeon-win-rate awoo-ui-stack';

  root.innerHTML = `
    <div class="awoo-ui-answer">
      <span class="awoo-ui-answer-value" data-winrate>—</span>
      <span class="awoo-ui-answer-unit">win rate</span>
      <span class="awoo-ui-chip" data-chip>Idle</span>
    </div>
    <div class="awoo-ui-context" data-context>No scan yet</div>
    <div class="awoo-ui-actionrow">
      <button class="awoo-ui-btn awoo-ui-btn-primary" data-action="scan" type="button">Scan history</button>
      <button class="awoo-ui-btn" data-action="stop" type="button">Stop</button>
      <button class="awoo-ui-btn" data-action="clear" type="button"
        data-tooltip="Forgets the scanned results on this device.">Clear</button>
    </div>
    <div class="awoo-ui-rows">
      <span class="k">Wins</span><span class="v" data-wins>0</span><span class="t"></span>
      <span class="k">Losses</span><span class="v" data-losses>0</span><span class="t"></span>
      <span class="k">History cards</span><span class="v" data-cards>0</span><span class="t"></span>
      <span class="k">Newest</span><span class="v" data-newest>—</span><span class="t"></span>
      <span class="k">Oldest</span><span class="v" data-oldest>—</span><span class="t"></span>
    </div>
  `;

  scope.on(root.querySelector('[data-action="scan"]'), 'click', () => {
    scan();
  });

  scope.on(root.querySelector('[data-action="stop"]'), 'click', () => {
    stopRequested = true;
    save({ status: 'Stopping' });
  });

  // Clear throws away a scan that can take minutes to redo, so it asks first.
  scope.on(root.querySelector('[data-action="clear"]'), 'click', async () => {
    if (scanning) return;
    if (Core.ui && typeof Core.ui.confirmDialog === 'function') {
      const ok = await Core.ui.confirmDialog({
        title: 'Clear results', danger: true, confirmLabel: 'Clear',
        message: 'Forget the scanned dungeon history on this device? Scanning again rebuilds it.',
      });
      if (!ok) return;
    }
    // FIXED 2026-09-25 ("clear doesn't clear properly"): this used to remove
    // only the storage key. The copy in memory (`data`) is what the window
    // draws and what the store writes back, so the old numbers stayed on
    // screen and returned on the next save. Forget both, and write the empty
    // state through the store so nothing pending can resurrect the old one.
    data = {};
    store.writeNow(data);
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* the empty write above already stands */ }
    renderWindow();
    if (activity) activity.stopped('Cleared the scanned results.');
  });

  return root;
}

function renderWindow() {
  if (!windowHandle?.el) return;

  const root = windowHandle.el.querySelector('.awoo-dungeon-win-rate');
  if (!root) return;

  const data = load();
  const s = data.sum || summary(data.results || {});

  const has = s.total > 0;
  root.querySelector('[data-winrate]').textContent = has ? fmtPct(s.pct) : '—';
  root.querySelector('[data-wins]').textContent = fmtInt(s.wins);
  root.querySelector('[data-losses]').textContent = fmtInt(s.losses);
  root.querySelector('[data-cards]').textContent = fmtInt(s.cards);
  root.querySelector('[data-newest]').textContent = fmtWhen(s.newest);
  root.querySelector('[data-oldest]').textContent = fmtWhen(s.oldest);
  root.querySelector('[data-context]').textContent = has
    ? `${fmtInt(s.total)} attempts · ${duration(s.covered)} covered`
    : 'No scan yet';

  const chip = root.querySelector('[data-chip]');
  chip.textContent = scanning ? 'Scanning' : (data.status === 'Failed' ? 'Failed' : has ? 'Done' : 'Idle');
  chip.className = 'awoo-ui-chip' + (scanning ? ' awoo-ui-chip-busy' : data.status === 'Failed' ? ' awoo-ui-chip-alert' : has ? ' awoo-ui-chip-run' : '');

  const scanBtn = root.querySelector('[data-action="scan"]');
  if (scanBtn) {
    scanBtn.disabled = scanning;
    scanBtn.textContent = scanning ? 'Scanning…' : 'Scan history';
  }
  const stopBtn = root.querySelector('[data-action="stop"]');
  if (stopBtn) stopBtn.disabled = !scanning;
  // A clear mid-scan would be refilled by the scan's next save.
  const clearBtn = root.querySelector('[data-action="clear"]');
  if (clearBtn) clearBtn.disabled = scanning;
}


function togglePanel(force) {
  const show = force !== undefined ? force : windowHandle.el.hidden;

  if (show) {
    windowHandle.open();
    renderWindow();
  } else {
    windowHandle.close();
  }

  Core.setOpen(MODULE_ID, show);
}

function bootstrap() {
  injectStyles();

  const content = buildContent();

  windowHandle = Core.createWindow({
    id: MODULE_ID,
    title: 'Dungeon Win Rate',
    content,
    // MEASURED 2026-09-21 on the rebuild (answer band, actions, five rows,
    // activity strip). minSize used to be passed as {width, height}, which
    // Core does not read ({w, h}), so this opened at Core's 360x240 fallback
    // and then resized itself to fit.
    // 290, not 330: reported slightly too tall. The content measured 197px
    // plus the strip; 290 leaves the strip room to open a line or two.
    defaultSize: { w: 360, h: 290 },
    minSize: { w: 320, h: 260 },
    resizable: true,
    onClose: () => togglePanel(false),
  });

  if (Core.ui && typeof Core.ui.activity === 'function') {
    activity = Core.ui.activity({ name: MODULE_ID, max: 6 });
    content.appendChild(activity.el);
  }

  // Label, short label, category and needsCore live in
  // dungeon-win-rate.release.json (`about`); the build hands them over as
  // AWOO_ABOUT so they have one home.
  Core.registerModule({
    ...AWOO_ABOUT,
    id: MODULE_ID,
    onToggle: (enabled) => togglePanel(enabled),
    onQuickClick: () => togglePanel(),
    onResetPosition: () => windowHandle.resetPosition(),
    // Unloaded mid-scan: end the loop. Every page it read is already saved.
    onUnload: () => { stopRequested = true; },
  });

  renderWindow();
}

if (document.body) {
  bootstrap();
} else {
  scope.on(document, 'DOMContentLoaded', bootstrap, { once: true });
}

  });
})();


// ---- bundled module: sculpture-grid-labels ----
(function () {
  'use strict';

  // ==== GENERATED — DO NOT EDIT ====
  // Produced by userscripts/build.mjs from data/. Edit the FACT,
  // then rebuild; editing this block is overwritten and, worse,
  // silently diverges from the core it was supposed to mirror.

  // NO-PROVENANCE: scaffolded by new-module.mjs; sculpture-grid-labels reads no data/ fact yet

  // ==== END GENERATED ====

  // ---- What this module is, for a Core that has not started it (generated from sculpture-grid-labels.release.json) ----
  const AWOO_ABOUT = Object.freeze({"label":"Sculpture Grid Labels","shortLabel":"Grid","description":"Shows sculpture mod names with roll percentages or item levels directly on the equipped grid.","category":"Fighters","kind":"tweak","quickButton":false,"uses":[],"needsCore":14,"lifecycle":2});

  // ---- Core intake shim (generated) ----
  // Requires the "AWOO+" userscript. Without it this module does nothing.
  (function (id, version, factory) {
    var host = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || null;
    var q = (window.__awooModules = window.__awooModules || []);
    q.push({ id: id, version: version, hostVersion: host, factory: factory, claimed: false, descriptor: null, about: AWOO_ABOUT });
    if (window.__AwooCore && window.__AwooCore.claim) { window.__AwooCore.claim(); return; }
    setTimeout(function () {
      if (!window.__AwooCore) console.warn('[AWOO+] "' + id + '" is installed but the AWOO+ script is not. Install AWOO+ and reload.');
    }, 8000);
  })("sculpture-grid-labels", "0.1.1", function (Core) {
  if (AWOO_ABOUT.needsCore && !(Core.version >= AWOO_ABOUT.needsCore)) {
    if (Core.registerModule) Core.registerModule(Object.assign({ id: "sculpture-grid-labels" }, AWOO_ABOUT));
    return null;
  }

const MODULE_ID = 'sculpture-grid-labels';
const STORAGE_KEY = `awoo:${MODULE_ID}:enabled`;

// The labels' type (rebuilt 2026-09-21): the overlay face at 600, not a
// monospace at 800-950, and one soft shadow instead of a 2px + 5px halo. The
// reported "letters are too bold" was the weight and the halo together.
// Colours are untouched: they are how a sculpture type is recognised.
const LABEL_SHADOW = '0 1px 1px rgba(0,0,0,.7)';

const ROWS = 8;
const COLS = 8;

const scope = Core.createScope(MODULE_ID);
// TWO flags, with one job each (settled by the maintainer 2026-09-21):
//   Core's switch  = the module is loaded, and its pill is on the page.
//   the pill       = the overlay is showing or not. Only the pill decides.
// There is deliberately NO top-bar button (registerModule quickButton:false):
// every top-bar button opens and closes a WINDOW, and this module has none —
// its surface is the game's own grid. A top-bar button that toggled the
// overlay would be the one button in the bar meaning something else, and the
// bar is filling up anyway. The module still reports its state to Core, so
// the AWOO+ menu row says "Overlay on/off".
// Through Core.store (v14). Stored as 1/0, which JSON writes as the same "1"
// and "0" this key always held, so nothing saved before v14 is misread.
const store = Core.store(STORAGE_KEY);
const savedPill = store.read();
let coreEnabled = false;                                   // Core's switch
let labelsOn = savedPill !== 0 && savedPill !== false;     // the pill
let enabled = false;                                       // = coreEnabled && labelsOn
let running = false;
let lastGridSignature = '';

// WHAT THE LABELS SHOW, and the rotate button that switches it (R69 round 7,
// the maintainer: a rotate button that swaps "name + percentage" for "name +
// sculpture ilevel"). The button sits beside the overlay pill while the
// overlay is on, and can be switched off in its settings (Modules › Tweaks).
// iLevel is the sculpture document's own field, the one the game's hover card
// feeds its effect formulas (SculptureHoverCard bundle, `e.iLevel`; CODE,
// data/formulas/sculptures.json). A sculpture without one shows a dash, never
// a guessed level (AGENTS.md rule 3).
const VIEW_DEFAULTS = { show: 'roll', rotateButton: true };
const viewStore = Core.store(`awoo:${MODULE_ID}:view`);
let view = readView();
function readView() {
  const raw = viewStore.read();
  const v = Object.assign({}, VIEW_DEFAULTS, raw && typeof raw === 'object' ? raw : {});
  return { show: v.show === 'ilevel' ? 'ilevel' : 'roll', rotateButton: v.rotateButton !== false };
}
function setView(patch) {
  view = Object.assign({}, view, patch);
  viewStore.write(view);
  lastGridSignature = '';
  if (coreEnabled) queueDecorate();
}
function iLevelOf(s) {
  const n = Number(s && s.iLevel);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

const STAT_DISPLAY_NAMES = {
  relicsAmount: 'Base Relics',
  relicsAmountFlat: 'Flat Relics',
  recipeDescriptions: 'Description',
  recipeImplicit: 'Implicit',
  recipeCopy: 'Copy',
  recipeSanctum: 'Sanctum',
  recipeReroll: 'Reroll',
  recipeLock: 'Lock',
  recipeInstantaneous: 'Instant',
  recipeMerge: 'Merge',
  recipeStatReroll: 'Stat Reroll',
  recipeEnhance: 'Enhance',
  recipeUpgrade: 'Upgrade',
  recipeVirtue: 'Virtue',
  recipeSculpture: 'Sculpture',
  gold: 'Gold',
  experience: 'XP',
  partnerExperience: 'Partner XP',
  stat: 'All Stats',
  statStrength: 'Strength',
  statAgility: 'Agility',
  statDexterity: 'Dexterity',
  statHealth: 'Health',
  drop: 'Drop Rate',
  meat: 'Meat',
  iron: 'Iron',
  wood: 'Wood',
  stone: 'Stone',
};

const UNIQUE_THEMES = {
  obelisk:        { border: '#e45b72', bg: 'rgba(228,91,114,.68)', text: '#fff4f6' },
  cornerstone:    { border: '#df7431', bg: 'rgba(223,116,49,.68)', text: '#fff4ea' },
  resonator:      { border: '#f2b35b', bg: 'rgba(242,179,91,.68)', text: '#fff8df' },
  amplifier:      { border: '#af64de', bg: 'rgba(175,100,222,.68)', text: '#fbf1ff' },
  perimeterStone: { border: '#4c9efe', bg: 'rgba(76,158,254,.68)', text: '#f2f8ff' },
  nexus:           { border: '#28b281', bg: 'rgba(40,178,129,.68)', text: '#effff9' },
  channeler:       { border: '#24b8c9', bg: 'rgba(36,184,201,.68)', text: '#effdff' },
};

const SHORT_NAMES = {
  relicsAmount: 'Base Rel',
  relicsAmountFlat: 'Flat Rel',
  recipeDescriptions: 'Desc',
  recipeImplicit: 'Impl',
  recipeCopy: 'Copy',
  recipeSanctum: 'Sanct',
  recipeReroll: 'Reroll',
  recipeLock: 'Lock',
  recipeInstantaneous: 'Instant',
  recipeMerge: 'Merge',
  recipeStatReroll: 'Stat RR',
  recipeEnhance: 'Enh',
  recipeUpgrade: 'Upgr',
  recipeVirtue: 'Virtue',
  recipeSculpture: 'Sculpt',
  gold: 'Gold',
  experience: 'XP',
  partnerExperience: 'P XP',
  stat: 'Stats',
  statStrength: 'STR',
  statAgility: 'AGI',
  statDexterity: 'DEX',
  statHealth: 'HP',
  drop: 'Drop',
  meat: 'Meat',
  iron: 'Iron',
  wood: 'Wood',
  stone: 'Stone',
};

const UNIQUE_TAGS = {
  obelisk: 'OBE',
  cornerstone: 'COR',
  resonator: 'RES',
  amplifier: 'AMP',
  perimeterStone: 'PER',
  nexus: 'NEX',
  channeler: 'CHA',
};

function getUniqueType(s) {
  if (!s) return null;

  const raw = String(
    s.type || s.unique || s.uniqueType || s.typeDisplayName || ''
  ).toLowerCase().trim();

  if (!raw || raw === 'none' || raw === 'null' || raw === 'undefined' || raw === 'non-unique') return null;
  if (raw === 'obelisk' || raw === 'obe') return 'obelisk';
  if (raw === 'cornerstone' || raw === 'cor') return 'cornerstone';
  if (raw === 'resonator' || raw === 'res') return 'resonator';
  if (raw === 'amplifier' || raw === 'amp') return 'amplifier';
  if (raw === 'perimeterstone' || raw.includes('perimeter') || raw === 'per' || raw === 'plr') return 'perimeterStone';
  if (raw === 'nexus' || raw === 'nex') return 'nexus';
  if (raw === 'channeler' || raw === 'cha') return 'channeler';

  return null;
}

function parseSize(size) {
  const m = String(size || '1x1').match(/^(\d+)x(\d+)$/i);

  return {
    w: m ? Math.max(1, Number(m[1])) : 1,
    h: m ? Math.max(1, Number(m[2])) : 1,
  };
}

/*
  IMPORTANT FIX:
  Sculpture stat values are stored as decimal multipliers.
  Example: the game displays 20.44% while the raw value is 0.2044.
  The old script incorrectly only multiplied values below 0.2, which broke
  every roll above 20%. Always convert the raw sculpture roll to percent.
*/
// NUMBERS, in the player's own convention (checked 2026-09-21).
// Parsing used to be `.replace(',', '.')`, which replaces only the FIRST comma:
// "1.234,5" and "1,234.5" both became "1.234.5", NaN, and the label silently
// read 0%. Core.parseNumber is the one parser every module must use — it knows
// whether this character reads "1.234" as a thousand or as one-point-two — and
// it refuses rather than guesses, so an unreadable value is ABSENT here, never
// zero (AGENTS.md rule 3). Output used to be toFixed(2) with a hard-coded dot;
// it now uses the player's decimal separator. (Core.formatNumber is not used:
// below 1,000 it rounds to whole numbers, and a roll reads 0.55%.)
function statValue(v) {
  if (typeof v === 'string') {
    const text = v.trim();
    const bare = text.replace('%', '').trim();
    const parsed = typeof Core.parseNumber === 'function'
      ? Core.parseNumber(bare)
      : (/^-?\d+(\.\d+)?$/.test(bare) ? Number(bare) : null);
    if (parsed === null || !Number.isFinite(parsed)) return null;

    // If the string explicitly contained %, it is already percent-form.
    if (text.includes('%')) return parsed;

    // Sculpture raw values are decimal multipliers.
    return Math.abs(parsed) <= 1 ? parsed * 100 : parsed;
  }

  const n = Number(v);
  if (v === null || v === undefined || !Number.isFinite(n)) return null;

  return Math.abs(n) <= 1 ? n * 100 : n;
}

function decimalSeparator() {
  try {
    const c = typeof Core.getNumberConvention === 'function' ? Core.getNumberConvention() : null;
    return (c && c.decimal) || '.';
  } catch (e) { return '.'; }
}

function formatRoll(v) {
  const n = statValue(v);
  if (n === null) return '—';
  const fixed = Number.isInteger(n) ? n.toFixed(0) : n.toFixed(2);
  return `${fixed.replace('.', decimalSeparator())}%`;
}

function looksLikeSculpture(obj) {
  return !!obj &&
    typeof obj === 'object' &&
    typeof obj.size === 'string' &&
    /^\d+x\d+$/i.test(obj.size) &&
    Array.isArray(obj.stats) &&
    obj.stats.length > 0;
}

function walkFiber(visit, budget = 40000) {
  const root = document.getElementById('root');
  if (!root) return;

  const key = Object.keys(root).find(
    (k) => k.startsWith('__reactContainer$') || k.startsWith('__reactFiber$')
  );

  if (!key) return;

  const seen = new Set();
  const stack = [root[key]];
  let visited = 0;

  while (stack.length && visited < budget) {
    const node = stack.pop();
    if (!node || seen.has(node)) continue;

    seen.add(node);
    visited += 1;

    let hook = node.memoizedState;
    let hops = 0;

    while (hook && typeof hook === 'object' && hops++ < 100) {
      if (hook.memoizedState !== undefined) visit(hook.memoizedState);
      hook = hook.next;
    }

    if (node.memoizedProps && typeof node.memoizedProps === 'object') {
      visit(node.memoizedProps);
    }

    if (
      node.stateNode &&
      typeof node.stateNode === 'object' &&
      !(node.stateNode instanceof Node)
    ) {
      visit(node.stateNode);
    }

    if (node.child) stack.push(node.child);
    if (node.sibling) stack.push(node.sibling);
  }
}

function findGrid() {
  const candidates = [];
  const seen = new WeakSet();
  let scanBudget = 100000;

  function scan(obj, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 8 || scanBudget-- <= 0) return;

    try {
      if (seen.has(obj)) return;
      seen.add(obj);
    } catch {
      return;
    }

    if (Array.isArray(obj)) {
      const sculptures = obj.filter(looksLikeSculpture);

      if (sculptures.length >= 5) {
        const equipped = sculptures.filter((s) =>
          s.grid &&
          s.grid.coordinates &&
          Number.isFinite(Number(s.grid.coordinates.x)) &&
          Number.isFinite(Number(s.grid.coordinates.y))
        );

        if (equipped.length >= 5) {
          const occupied = new Set();
          let valid = true;

          for (const s of equipped) {
            const { w, h } = parseSize(s.size);
            const x0 = Number(s.grid.coordinates.x);
            const y0 = Number(s.grid.coordinates.y);

            for (let dy = 0; dy < h; dy++) {
              for (let dx = 0; dx < w; dx++) {
                const x = x0 + dx;
                const y = y0 + dy;

                if (x < 0 || x >= COLS || y < 0 || y >= ROWS) {
                  valid = false;
                  continue;
                }

                const key = `${x},${y}`;
                if (occupied.has(key)) valid = false;
                occupied.add(key);
              }
            }
          }

          if (valid) {
            candidates.push({
              items: equipped,
              score: equipped.length * 10 + occupied.size,
            });
          }
        }
      }

      for (const item of obj.slice(0, 500)) {
        scan(item, depth + 1);
      }
      return;
    }

    if (obj instanceof Map) {
      for (const v of obj.values()) scan(v, depth + 1);
      return;
    }

    if (obj instanceof Set) {
      for (const v of obj.values()) scan(v, depth + 1);
      return;
    }

    let keys = [];
    try {
      keys = Object.keys(obj).slice(0, 120);
    } catch {
      return;
    }

    for (const key of keys) {
      try {
        const value = obj[key];
        if (value && typeof value === 'object') {
          scan(value, depth + 1);
        }
      } catch {
        // Ignore inaccessible properties.
      }
    }
  }

  // Use the exact traversal from the standalone version that is already known
  // to find the equipped sculpture array on the live Fighter page.
  walkFiber((value) => scan(value, 0));

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.items || null;
}

function getGridButtons() {
  const buttons = [...document.querySelectorAll('button[data-drop-target-for-element="true"]')]
    .filter((button) => button.offsetParent !== null);

  if (buttons.length < 64) return [];

  buttons.sort((a, b) => {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();

    if (Math.abs(ra.top - rb.top) > 8) return ra.top - rb.top;
    return ra.left - rb.left;
  });

  return buttons.slice(0, 64);
}


function cleanText(v) {
  return String(v || '').replace(/\s+/g, ' ').trim();
}

function findHighlightHeading() {
  const all = [...document.querySelectorAll('div, span, label, p')];
  const exact = all.filter(
    (el) =>
      cleanText(el.textContent).toUpperCase() === 'HIGHLIGHT' &&
      el.offsetParent !== null
  );

  if (!exact.length) return null;

  exact.sort((a, b) => {
    const ar = a.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    const score = (r) => (r.top < 200 ? 10000 : 0) + r.left;
    return score(ar) - score(br);
  });

  return exact[0];
}

function updateToggleAppearance(btn) {
  if (!btn) return;

  // The overlay's own tokens, so the pill reads as AWOO+ beside the game's
  // heading rather than as a third palette (the old neon green and slate
  // literals stay only as fallbacks for a Core without the contract).
  btn.textContent = enabled ? 'Overlay on' : 'Overlay off';
  btn.dataset.enabled = enabled ? '1' : '0';
  btn.style.background = enabled ? 'var(--awoo-bg-success, rgba(34,197,94,.18))' : 'transparent';
  btn.style.borderColor = enabled
    ? 'color-mix(in srgb, var(--awoo-success, #22c55e) 45%, transparent)'
    : 'var(--awoo-border-control, #64748b)';
  btn.style.color = enabled ? 'var(--awoo-success, #86efac)' : 'var(--awoo-ink-mute, #94a3b8)';
}

function ensurePageToggle() {
  const TOGGLE_ID = 'awoo-sculpture-grid-labels-toggle';

  let btn = document.getElementById(TOGGLE_ID);

  if (btn) {
    updateToggleAppearance(btn);
    ensureRotateButton(btn);
    return btn;
  }

  // UNDER THE GRID, centred (2026-09-21, the maintainer's call): it belongs to
  // the grid it switches, not to the page's Highlight filter it used to sit
  // beside. Falls back to beside that heading if the grid is not on screen.
  const buttons = getGridButtons();
  const gridEl = buttons.length ? buttons[0].parentElement : null;
  const heading = gridEl ? null : findHighlightHeading();
  if (!gridEl && (!heading || !heading.parentElement)) return null;

  btn = document.createElement('button');
  btn.id = TOGGLE_ID;
  btn.type = 'button';
  btn.title = 'Show or hide the mod names and rolls on the grid';

  btn.style.cssText = `
    padding:1px 9px;
    height:20px;
    border:1px solid var(--awoo-border-control, #64748b);
    border-radius:999px;
    font:600 10px/1 var(--awoo-font, system-ui, sans-serif);
    letter-spacing:.02em;
    cursor:pointer;
    vertical-align:middle;
    white-space:nowrap;
  `;

  scope.on(btn, 'click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    setLabels(!labelsOn);
  });

  if (gridEl) {
    const row = document.createElement('div');
    row.className = 'awoo-sculpture-grid-labels-toggle-row';
    row.appendChild(btn);
    gridEl.insertAdjacentElement('afterend', row);
  } else {
    btn.style.marginLeft = '8px';
    heading.insertAdjacentElement('afterend', btn);
  }
  updateToggleAppearance(btn);
  ensureRotateButton(btn);

  return btn;
}

const ROTATE_ID = 'awoo-sculpture-grid-labels-rotate';
// Two arrows chasing round a circle: "switch what is shown", not "reload".
const ROTATE_SVG = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" '
  + 'stroke-linecap="round" stroke-linejoin="round"><path d="M13.2 6.5A5.3 5.3 0 0 0 3.4 5"/><path d="M3.2 2.4V5.2H6"/>'
  + '<path d="M2.8 9.5a5.3 5.3 0 0 0 9.8 1.5"/><path d="M12.8 13.6v-2.8H10"/></svg>';
// Present only while the overlay is on and the setting allows it: with the
// overlay off there is nothing for it to switch.
function ensureRotateButton(pill) {
  let rb = document.getElementById(ROTATE_ID);
  if (!pill || !pill.parentElement || !enabled || !view.rotateButton) { rb?.remove(); return; }
  if (!rb) {
    rb = document.createElement('button');
    rb.id = ROTATE_ID;
    rb.type = 'button';
    rb.innerHTML = ROTATE_SVG;
    rb.style.cssText = `
      display:inline-grid;
      place-items:center;
      width:20px;
      height:20px;
      padding:0;
      margin-left:4px;
      border:1px solid var(--awoo-border-control, #64748b);
      border-radius:999px;
      background:transparent;
      color:var(--awoo-ink-soft, #cbd5e1);
      cursor:pointer;
      vertical-align:middle;
    `;
    scope.on(rb, 'click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setView({ show: view.show === 'ilevel' ? 'roll' : 'ilevel' });
    });
  }
  if (rb.previousElementSibling !== pill) pill.insertAdjacentElement('afterend', rb);
  const tip = view.show === 'ilevel' ? 'Showing item levels. Click to show rolls.' : 'Showing rolls. Click to show item levels.';
  if (rb.title !== tip) { rb.title = tip; rb.setAttribute('aria-label', tip); }
}

function clearOld(buttons = getGridButtons()) {
  document.querySelectorAll(
    '.awoo-sculpture-grid-labels-footprint-bg, .awoo-sculpture-grid-labels-footprint-gridline'
  ).forEach((el) => el.remove());

  for (const btn of buttons) {
    btn.querySelectorAll(
      ':scope > .awoo-sculpture-grid-labels-simple-label, :scope > .awoo-sculpture-grid-labels-effect-shade'
    ).forEach((el) => el.remove());

    btn.classList.remove('awoo-sculpture-grid-labels-clean-active', 'awoo-sculpture-grid-labels-multi-cell');

    if (btn.dataset.qsgSimple === '1') {
      btn.style.removeProperty('box-shadow');
      btn.style.removeProperty('border-color');
      btn.style.removeProperty('background-image');
      btn.style.removeProperty('background');
      btn.style.removeProperty('border-radius');

      if (btn.dataset.qsgOldTitle !== undefined) {
        btn.title = btn.dataset.qsgOldTitle;
        delete btn.dataset.qsgOldTitle;
      }

      delete btn.dataset.qsgSimple;
    }
  }
}

function buildSignature(sculptures) {
  return sculptures
    .map((s) => {
      const c = s.grid?.coordinates || {};
      const stats = Array.isArray(s.stats)
        ? s.stats.map((st) => `${st?.type || ''}:${String(st?.value ?? '')}`).join(',')
        : '';

      return [
        s.size,
        c.x,
        c.y,
        getUniqueType(s) || '',
        iLevelOf(s) ?? '',
        stats,
      ].join('|');
    })
    .sort()
    .join('::') + '#' + view.show;
}

function decorate() {
  if (!enabled) {
    clearOld();
    return;
  }

  const buttons = getGridButtons();
  if (buttons.length !== 64) return;

  const sculptures = findGrid();
  if (!sculptures?.length) return;

  const signature = buildSignature(sculptures);

  if (
    signature === lastGridSignature &&
    document.querySelector('.awoo-sculpture-grid-labels-simple-label')
  ) {
    return;
  }

  lastGridSignature = signature;
  clearOld(buttons);

  const MOD_PALETTE = [
    '#35e07a',
    '#f4d64e',
    '#ff5f6d',
    '#55d7ff',
    '#b883ff',
  ];

  const modCounts = new Map();
  const firstSeen = new Map();
  let seenOrder = 0;

  for (const sc of sculptures) {
    for (const st of (Array.isArray(sc.stats) ? sc.stats : [])) {
      const key = st?.type || '';
      if (!key) continue;

      modCounts.set(key, (modCounts.get(key) || 0) + 1);

      if (!firstSeen.has(key)) {
        firstSeen.set(key, seenOrder++);
      }
    }
  }

  const sortedModTypes = [...modCounts.keys()].sort((a, b) => {
    const countDiff = (modCounts.get(b) || 0) - (modCounts.get(a) || 0);
    return countDiff || (firstSeen.get(a) - firstSeen.get(b));
  });

  const gridModColorMap = new Map();

  sortedModTypes.forEach((key, idx) => {
    gridModColorMap.set(
      key,
      idx < MOD_PALETTE.length ? MOD_PALETTE[idx] : '#ffffff'
    );
  });

  const occupiedBy = new Map();

  for (const s of sculptures) {
    const coords = s.grid?.coordinates;
    if (!coords) continue;

    const x0 = Number(coords.x);
    const y0 = Number(coords.y);

    if (!Number.isFinite(x0) || !Number.isFinite(y0)) continue;

    const { w, h } = parseSize(s.size);

    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const x = x0 + dx;
        const y = y0 + dy;

        if (x >= 0 && x < COLS && y >= 0 && y < ROWS) {
          occupiedBy.set(`${x},${y}`, s);
        }
      }
    }
  }

  const obeliskAffected = new Set();

  for (const u of sculptures) {
    if (getUniqueType(u) !== 'obelisk') continue;

    const c = u.grid?.coordinates;
    if (!c) continue;

    const ux = Number(c.x);
    const uy = Number(c.y);

    if (!Number.isFinite(ux) || !Number.isFinite(uy)) continue;

    const { w: uw, h: uh } = parseSize(u.size);
    const rows = new Set(Array.from({ length: uh }, (_, i) => uy + i));
    const cols = new Set(Array.from({ length: uw }, (_, i) => ux + i));

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const key = `${x},${y}`;

        if (!occupiedBy.has(key) && (rows.has(y) || cols.has(x))) {
          obeliskAffected.add(key);
        }
      }
    }
  }

  for (const key of obeliskAffected) {
    const [x, y] = key.split(',').map(Number);
    const idx = y * COLS + x;
    const btn = buttons[idx];

    if (!btn) continue;

    if (getComputedStyle(btn).position === 'static') {
      btn.style.position = 'relative';
    }

    const shade = document.createElement('div');
    shade.className = 'awoo-sculpture-grid-labels-effect-shade';
    shade.dataset.effect = 'obe';
    shade.style.cssText =
      'position:absolute;inset:1px;z-index:20;pointer-events:none;border-radius:inherit;background:rgba(244,114,182,.12);';

    btn.appendChild(shade);
  }

  for (const s of sculptures) {
    const coords = s.grid?.coordinates;
    if (!coords) continue;

    const x0 = Number(coords.x);
    const y0 = Number(coords.y);

    if (!Number.isFinite(x0) || !Number.isFinite(y0)) continue;

    const { w, h } = parseSize(s.size);
    const uniqueType = getUniqueType(s);
    const theme = uniqueType ? UNIQUE_THEMES[uniqueType] : null;
    const border = theme?.border || '#64748b';
    const bg = theme?.bg || 'rgba(15,23,42,.32)';
    const text = theme?.text || '#f8fafc';

    const isMulti = w > 1 || h > 1;

    if (!isMulti) {
      const btn = buttons[y0 * COLS + x0];

      if (btn) {
        btn.dataset.qsgSimple = '1';
        btn.style.setProperty('border-color', border, 'important');
        btn.style.setProperty('box-shadow', `inset 0 0 0 999px ${bg}`, 'important');
      }
    } else {
      const first = buttons[y0 * COLS + x0];
      const last = buttons[(y0 + h - 1) * COLS + (x0 + w - 1)];
      const gridParent = first?.parentElement;

      if (first && last && gridParent && first.parentElement === last.parentElement) {
        // WHY THE OUTLINE DRIFTED, and what changed (2026-09-21). Positions
        // came from getBoundingClientRect() differences and were written as
        // CSS left/top — but absolute positioning is measured from the
        // parent's PADDING box, inside its border, and in layout pixels, not
        // screen pixels. A bordered grid container therefore shifted every
        // footprint by its border width, and any CSS scale on the grid
        // stretched the error. Both are corrected here. The outline also drew
        // a 2px, 7px-radius border of its own over the game's cells; it now
        // copies the cell's own border width and radius from the page, so it
        // lands ON the game's border instead of beside it.
        // NOT VERIFIED against the live grid (automation tabs log the player
        // out; see memory). If it still drifts, measure a real cell here.
        const parentRect = gridParent.getBoundingClientRect();
        const r1 = first.getBoundingClientRect();
        const r2 = last.getBoundingClientRect();
        const scaleX = gridParent.offsetWidth ? parentRect.width / gridParent.offsetWidth : 1;
        const scaleY = gridParent.offsetHeight ? parentRect.height / gridParent.offsetHeight : 1;
        const toLocalX = (x) => (x - parentRect.left) / (scaleX || 1) - (gridParent.clientLeft || 0);
        const toLocalY = (y) => (y - parentRect.top) / (scaleY || 1) - (gridParent.clientTop || 0);
        const cellStyle = getComputedStyle(first);
        const cellBorder = parseFloat(cellStyle.borderTopWidth) || 1;
        const cellRadius = cellStyle.borderTopLeftRadius || '6px';

        if (getComputedStyle(gridParent).position === 'static') {
          gridParent.style.position = 'relative';
        }

        const solid = document.createElement('div');
        solid.className = 'awoo-sculpture-grid-labels-footprint-bg';

        solid.style.cssText = `
          position:absolute;
          left:${toLocalX(r1.left)}px;
          top:${toLocalY(r1.top)}px;
          width:${(r2.right - r1.left) / (scaleX || 1)}px;
          height:${(r2.bottom - r1.top) / (scaleY || 1)}px;
          background:${bg};
          border:${cellBorder}px solid ${border};
          border-radius:${cellRadius};
          box-sizing:border-box;
          pointer-events:none;
          z-index:35;
        `;

        gridParent.appendChild(solid);

        for (let col = 1; col < w; col++) {
          const leftBtn = buttons[y0 * COLS + (x0 + col - 1)];
          const rightBtn = buttons[y0 * COLS + (x0 + col)];

          if (!leftBtn || !rightBtn) continue;

          const lr = leftBtn.getBoundingClientRect();
          const rr = rightBtn.getBoundingClientRect();
          const xLine = toLocalX((lr.right + rr.left) / 2);

          const line = document.createElement('div');
          line.className = 'awoo-sculpture-grid-labels-footprint-gridline';

          line.style.cssText = `
            position:absolute;
            left:${xLine - 0.5}px;
            top:${toLocalY(r1.top) + 6}px;
            width:1px;
            height:${(r2.bottom - r1.top) / (scaleY || 1) - 12}px;
            background:rgba(0,0,0,.35);
            pointer-events:none;
            z-index:46;
          `;

          gridParent.appendChild(line);
        }

        for (let row = 1; row < h; row++) {
          const topBtn = buttons[(y0 + row - 1) * COLS + x0];
          const bottomBtn = buttons[(y0 + row) * COLS + x0];

          if (!topBtn || !bottomBtn) continue;

          const tr = topBtn.getBoundingClientRect();
          const br = bottomBtn.getBoundingClientRect();
          const yLine = toLocalY((tr.bottom + br.top) / 2);

          const line = document.createElement('div');
          line.className = 'awoo-sculpture-grid-labels-footprint-gridline';

          line.style.cssText = `
            position:absolute;
            left:${toLocalX(r1.left) + 6}px;
            top:${yLine - 0.5}px;
            width:${(r2.right - r1.left) / (scaleX || 1) - 12}px;
            height:1px;
            background:rgba(0,0,0,.35);
            pointer-events:none;
            z-index:46;
          `;

          gridParent.appendChild(line);
        }
      }

      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const x = x0 + dx;
          const y = y0 + dy;

          if (x < 0 || x >= COLS || y < 0 || y >= ROWS) continue;

          const btn = buttons[y * COLS + x];
          if (!btn) continue;

          btn.dataset.qsgSimple = '1';
          btn.classList.add('awoo-sculpture-grid-labels-multi-cell');
          btn.style.setProperty('border-color', 'transparent', 'important');
          btn.style.setProperty('box-shadow', 'none', 'important');
          btn.style.setProperty('background', 'transparent', 'important');
        }
      }
    }

    const footprintButtons = [];

    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const x = x0 + dx;
        const y = y0 + dy;

        if (x < 0 || x >= COLS || y < 0 || y >= ROWS) continue;

        const btn = buttons[y * COLS + x];
        if (!btn) continue;

        btn.classList.add('awoo-sculpture-grid-labels-clean-active');

        if (getComputedStyle(btn).position === 'static') {
          btn.style.position = 'relative';
        }

        footprintButtons.push(btn);
      }
    }

    const stats = Array.isArray(s.stats) ? s.stats : [];
    const displayCount = Math.min(stats.length, footprintButtons.length);

    for (let i = 0; i < displayCount; i++) {
      const btn = footprintButtons[i];
      const stat = stats[i];
      const fullMod = STAT_DISPLAY_NAMES[stat.type] || stat.type || 'Unknown';
      const shortMod = SHORT_NAMES[stat.type] || fullMod;
      const pct = formatRoll(stat.value);
      const lv = iLevelOf(s);
      const lvText = lv === null ? '—' : `iLv ${lv}`;
      const statColor = gridModColorMap.get(stat.type) || '#ffffff';

      const label = document.createElement('div');
      label.className = 'awoo-sculpture-grid-labels-simple-label';

      label.style.cssText = `
        position:absolute;
        inset:0;
        z-index:50;
        pointer-events:none;
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        text-align:center;
        line-height:1.05;
        font-family:var(--awoo-font, system-ui, sans-serif);
        overflow:hidden;
      `;

      if (i === 0 && uniqueType) {
        const tag = document.createElement('div');
        tag.textContent = UNIQUE_TAGS[uniqueType] || '';

        tag.style.cssText =
          `font-size:8px;font-weight:600;color:${text};margin-bottom:3px;letter-spacing:.08em;text-shadow:${LABEL_SHADOW};`;

        label.appendChild(tag);
      }

      const modEl = document.createElement('div');
      modEl.textContent = shortMod;

      modEl.style.cssText =
        `font-size:8.5px;font-weight:600;color:${statColor};max-width:94%;white-space:nowrap;overflow:hidden;text-overflow:clip;letter-spacing:.06em;text-transform:uppercase;opacity:.92;text-shadow:${LABEL_SHADOW};`;

      const pctEl = document.createElement('div');
      pctEl.textContent = view.show === 'ilevel' ? lvText : pct;

      pctEl.style.cssText =
        `font-size:11.5px;font-weight:600;margin-top:3px;color:${statColor};font-variant-numeric:tabular-nums;text-shadow:${LABEL_SHADOW};`;

      label.append(modEl, pctEl);
      btn.appendChild(label);

      if (btn.dataset.qsgOldTitle === undefined) {
        btn.dataset.qsgOldTitle = btn.title || '';
      }

      btn.title =
        `${fullMod}: ${pct}${lv === null ? '' : ` · iLv ${lv}`}${i === 0 && uniqueType ? ` | ${uniqueType}` : ''}`;
    }
  }
}

// The one place the visible state changes, and the one place Core is told.
function sync() {
  enabled = coreEnabled && labelsOn;
  if (typeof Core.setState === 'function') Core.setState(MODULE_ID, enabled ? 'running' : 'idle', enabled ? 'Overlay on' : 'Overlay off');
  updateToggleAppearance(document.getElementById('awoo-sculpture-grid-labels-toggle'));
  ensureRotateButton(document.getElementById('awoo-sculpture-grid-labels-toggle'));
  if (enabled) {
    lastGridSignature = '';
    queueDecorate();
  } else {
    clearOld();
    if (!coreEnabled) {
      const pill = document.getElementById('awoo-sculpture-grid-labels-toggle');
      (pill && pill.parentElement && pill.parentElement.className === 'awoo-sculpture-grid-labels-toggle-row'
        ? pill.parentElement : pill)?.remove();
    }
  }
}

// Core's switch: loads the module and puts the pill on the page. Whether the
// overlay shows is the pill's own remembered choice; turning the module off
// removes both.
function setEnabled(next) {
  coreEnabled = !!next;
  sync();
}

// The pill: overlay on/off while the module stays loaded.
function setLabels(next) {
  labelsOn = !!next;
  store.write(labelsOn ? 1 : 0);
  sync();
}

function queueDecorate() {
  if (running) return;
  running = true;

  requestAnimationFrame(() => {
    try {
      // This tool is meant to live directly on the sculpture/fighter page.
      // Keep the small Labels ON/OFF button beside the game's HIGHLIGHT heading,
      // exactly like the standalone version did.
      // The pill exists only while the module is on in Core.
      if (coreEnabled) ensurePageToggle();

      if (enabled) {
        decorate();
      } else {
        clearOld();
      }
    } catch (err) {
      console.debug('[Sculpture Grid Labels]', err);
    } finally {
      running = false;
    }
  });
}

function injectStyles() {
  const style = document.createElement('style');

  style.textContent = `
    .awoo-sculpture-grid-labels-simple-label,
    .awoo-sculpture-grid-labels-effect-shade,
    .awoo-sculpture-grid-labels-footprint-bg,
    .awoo-sculpture-grid-labels-footprint-gridline{
      box-sizing:border-box;
    }

    /* THE HOVER BUG (reported 2026-09-21): hovering a tile brought the game's
       level numbers back, and they stayed. The hiding rule hung on a class
       this module adds to the tile — and the game re-renders a hovered tile,
       rewriting its className and dropping the class, while this module's
       label (a child React does not own) survives. Keying the rule on the
       LABEL's presence (:has) instead of on the class means a re-render cannot
       undo it: as long as our label is in the tile, the game's own content
       stays hidden. The class rule stays for browsers without :has. */
    .awoo-sculpture-grid-labels-clean-active > :not(.awoo-sculpture-grid-labels-simple-label):not(.awoo-sculpture-grid-labels-effect-shade),
    button:has(> .awoo-sculpture-grid-labels-simple-label) > :not(.awoo-sculpture-grid-labels-simple-label):not(.awoo-sculpture-grid-labels-effect-shade){
      visibility:hidden !important;
    }
    button:has(> .awoo-sculpture-grid-labels-simple-label){
      position:relative !important;
    }
    .awoo-sculpture-grid-labels-toggle-row{
      display:flex;
      justify-content:center;
      padding:var(--awoo-s3, 6px) 0 0;
    }

    .awoo-sculpture-grid-labels-clean-active{
      position:relative !important;
    }

    .awoo-sculpture-grid-labels-clean-active .awoo-sculpture-grid-labels-simple-label{
      z-index:60 !important;
    }

    .awoo-sculpture-grid-labels-multi-cell{
      z-index:40 !important;
    }
  `;

  document.documentElement.appendChild(style);
  scope.add(() => style.remove());
}

function bootstrap() {
  injectStyles();

  scope.add(() => {
    document.querySelector('.awoo-sculpture-grid-labels-toggle-row')?.remove();
    document.getElementById('awoo-sculpture-grid-labels-toggle')?.remove();
    document.getElementById(ROTATE_ID)?.remove();
    clearOld();
  });

  // A TWEAK since Core v14 (kind: 'tweak' in sculpture-grid-labels.release.json):
  // it changes the game's own page and has no window, so the Control Panel
  // lists it under Modules > Tweaks, not beside the windowed modules.
  const registered = Core.registerModule({
    ...AWOO_ABOUT,
    id: MODULE_ID,
    onToggle: (next) => setEnabled(next),
    settings: {
      label: 'Sculpture Grid Labels',
      render(container) {
        container.appendChild(Core.ui.inputRow({
          label: 'Labels show', type: 'select', value: view.show,
          options: [{ value: 'roll', label: 'Mod name and roll %' }, { value: 'ilevel', label: 'Mod name and item level' }],
          onChange: (v) => setView({ show: v === 'ilevel' ? 'ilevel' : 'roll' }),
        }));
        const row = document.createElement('label');
        row.style.cssText = 'display:flex; align-items:center; gap:var(--awoo-s3); font-size:var(--awoo-fs-control); cursor:pointer; margin:var(--awoo-s2) 0;';
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = view.rotateButton;
        scope.on(box, 'change', () => setView({ rotateButton: box.checked }));
        const text = document.createElement('span');
        text.textContent = 'Rotate button beside the overlay switch';
        row.append(box, text);
        container.appendChild(row);
      },
      reset: () => setView(Object.assign({}, VIEW_DEFAULTS)),
    },
  });

  // Initial paint, from Core's own record of whether this module is on.
  coreEnabled = !!(registered && registered.enabled);
  sync();

  // React/game DOM changes can replace the grid. Repaint only after actual DOM changes,
  // rather than hammering the page every 1.2 seconds forever.
  scope.mutation(
    document.documentElement,
    { childList: true, subtree: true },
    () => queueDecorate(),
    { debounceMs: 300 }
  );

  // If the user comes back to this tab after being away, repaint once.
  scope.on(document, 'visibilitychange', () => {
    if (!document.hidden && enabled) {
      lastGridSignature = '';
      queueDecorate();
    }
  });
}

if (document.body) {
  bootstrap();
} else {
  scope.on(document, 'DOMContentLoaded', bootstrap, { once: true });
}

  });
})();


// ---- bundled tools: awoo-tools-public ----
(function () {
  'use strict';

  // ==== GENERATED TOOL PAYLOADS — DO NOT EDIT ====
  // Tool payload: userscripts/src/tools/cost-tables.html (generated facts inlined)
  const AWOO_TOOL_COST_TABLES = "<!doctype html>\n<meta charset=\"utf-8\">\n<title>Cost Tables</title>\n<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\n<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700&family=Azeret+Mono:wght@400;500;600&display=swap\">\n\n<meta name=\"awoo-tool\" content=\"cost-tables\">\n<style>\n/* ===========================================================================\n   AWOO+ THEME TOKENS — GENERATED, DO NOT EDIT BY HAND.\n\n   Source: the AWOO+ Design System (projects/ARTIFACT_STYLE_GUIDE.md Part II,\n   live at https://claude.ai/artifact/3Xv8kdGSd6Lth8MhQEtBrS). Injected into\n   every tool page by userscripts/build.mjs at the <!-- @AWOO_THEME_TOKENS@ -->\n   marker, so one palette correction reaches every tool on the next build.\n\n   SEVEN THEMES, FOUR FAMILIES. A family name carries no mode; the variant\n   does, and only where more than one exists — which is why Slate and Claude\n   Code have no suffix.\n\n     Beach        light · dimmed\n     Slate        (was \"war room\" before the merge)\n     Claude       light · medium · dark\n     Claude Code  (RECONSTRUCTED from the brand register, not sampled)\n\n   ONE CONTRACT. Every theme defines the same 25 tokens and no component ever\n   names a colour, which is what makes an eighth theme a block of properties\n   rather than a rewrite. Two of those tokens exist for specific reasons:\n     --accent-edge     the soft edge of a tinted row. A full-strength accent\n                       ring reads as a frame around a table row, not emphasis\n                       on it.\n     --border-control  inputs, selects and buttons only, clearing WCAG\n                       1.4.11's 3:1 against surface. Table hairlines stay soft\n                       on --border.\n\n   Every text pair in every theme clears WCAG AA; tertiary \"muted\" text is\n   AA-large by design across the whole family.\n   =========================================================================== */\n:root{\n  /* Beach (light) is the base layer, so an un-stamped page is always legible. */\n  --ground:#EFE7D7;\n  --surface:#FAF5EC;\n  --surface-2:#F1E8D8;\n  --surface-3:#E7DCC7;\n  --border:#D8CBB2;\n  --border-strong:#C3B193;\n  --border-control:#8C7D64;\n  --ink:#33291D;\n  --ink-soft:#6B5C48;\n  --ink-mute:#94836C;\n  --accent:#8A4322;\n  --accent-fill:#A8552C;\n  --accent-edge:#D4AB93;\n  --bg-accent:#F3E2D8;\n  --on-accent:#FBF0E6;\n  --success:#3F5C33;\n  --success-fill:#4A6741;\n  --bg-success:#E4EBDC;\n  --danger:#8C2F2A;\n  --danger-fill:#A83A33;\n  --bg-danger:#F5E0DD;\n  --info:#41528A;\n  --bg-info:#E2E5F2;\n  --neutral:#6E5F49;\n  --bg-neutral:#EDE4D3;\n  --dev:#2E6B5C;\n  --bg-dev:#DCEBE6;\n  --shadow:0 1px 2px rgba(60,50,35,.07),0 4px 14px rgba(60,50,35,.06);\n\n  /* TYPE, corrected 2026-09-21 after MEASURING the glyphs rather than\n     recalling them.\n\n     NUMBERS ARE PUBLIC SANS, NOT A MONO FACE. The requirement was a clear,\n     unmarked zero. Measured by rendering each zero at 200px and sampling the\n     centre of its counter (capital O as the control, which reads 0% ink in\n     every face, proving the method): Noto Sans Mono 83%, DM Mono 80%, Roboto\n     Mono 69%, IBM Plex Mono 93%, JetBrains Mono 95%, Space Mono 95%, Cousine\n     100%. Every one of them marks the zero. So does the earlier \"fix\":\n     font-feature-settings \"zero\" 0 changes NOTHING in any of them, because\n     the mark is the default glyph, not an optional feature.\n\n     Public Sans's own zero measures 0% — genuinely open — and\n     font-variant-numeric: tabular-nums makes every digit exactly the same\n     width (measured: all ten at 70px against 40.7-64.75 proportional). Fixed\n     width is what a column needs; a monospaced FACE was never the\n     requirement. So the number face is the text face, with tabular figures.\n\n     --font-mono stays a real mono for identifiers and formula text, where\n     letter alignment matters: Azeret Mono, the only mono of the eight tested\n     whose zero measured 0%. */\n  --font-display:'Public Sans',system-ui,-apple-system,sans-serif;\n  --font-body:'Public Sans',system-ui,-apple-system,sans-serif;\n  --font-num:'Public Sans',system-ui,-apple-system,sans-serif;\n  --font-mono:'Azeret Mono',ui-monospace,'Cascadia Mono',monospace;\n  --display-tracking:-.005em; --display-caps:none;\n  --radius:6px;\n\n  /* DENSITY, 2026-09-21. These are read as data, not prose: a table row and a\n     nav row both want to be tighter than a paragraph. Tokens rather than\n     literals so \"slightly more condensed\" is one edit, everywhere. */\n  --row-y:2px;        /* table cell vertical padding */\n  --row-x:12px;       /* table cell horizontal padding */\n  --nav-y:3px;        /* sidebar nav row */\n  --ctl-y:2px;        /* input and select vertical padding */\n  --ctl-x:6px;\n  --ctl-w:78px;       /* a number input's default width - subtle, not a field */\n  --pad-panel:11px;\n}\n\n/* No explicit choice and a dark OS: Slate. */\n@media (prefers-color-scheme: dark){\n  :root:not([data-theme]){\n    --ground:#14181D;\n    --surface:#1B2027;\n    --surface-2:#20262D;\n    --surface-3:#272F37;\n    --border:#2B323A;\n    --border-strong:#3A434C;\n    --border-control:#6A7684;\n    --ink:#E8EAEB;\n    --ink-soft:#A9B0B6;\n    --ink-mute:#78828B;\n    --accent:#E3B36B;\n    --accent-fill:#C4923F;\n    --accent-edge:#5A4522;\n    --bg-accent:#2E2412;\n    --on-accent:#241300;\n    --success:#84C4AA;\n    --success-fill:#4F8C74;\n    --bg-success:#172E25;\n    --danger:#E28270;\n    --danger-fill:#C1503C;\n    --bg-danger:#351F1A;\n    --info:#B4A4E0;\n    --bg-info:#241F36;\n    --neutral:#9AA6B2;\n    --bg-neutral:#222A32;\n    --dev:#78C8BC;\n    --bg-dev:#14302C;\n    --shadow:0 1px 2px rgba(0,0,0,.4),0 6px 20px rgba(0,0,0,.34);\n  }\n}\n\n/* Beach (light) */\n:root[data-theme=\"beach\"]{\n  --ground:#EFE7D7;\n  --surface:#FAF5EC;\n  --surface-2:#F1E8D8;\n  --surface-3:#E7DCC7;\n  --border:#D8CBB2;\n  --border-strong:#C3B193;\n  --border-control:#8C7D64;\n  --ink:#33291D;\n  --ink-soft:#6B5C48;\n  --ink-mute:#94836C;\n  --accent:#8A4322;\n  --accent-fill:#A8552C;\n  --accent-edge:#D4AB93;\n  --bg-accent:#F3E2D8;\n  --on-accent:#FBF0E6;\n  --success:#3F5C33;\n  --success-fill:#4A6741;\n  --bg-success:#E4EBDC;\n  --danger:#8C2F2A;\n  --danger-fill:#A83A33;\n  --bg-danger:#F5E0DD;\n  --info:#41528A;\n  --bg-info:#E2E5F2;\n  --neutral:#6E5F49;\n  --bg-neutral:#EDE4D3;\n  --dev:#2E6B5C;\n  --bg-dev:#DCEBE6;\n  --shadow:0 1px 2px rgba(60,50,35,.07),0 4px 14px rgba(60,50,35,.06);\n}\n\n/* Beach (dimmed) */\n:root[data-theme=\"beach-dim\"]{\n  --ground:#17181A;\n  --surface:#1E2022;\n  --surface-2:#25282A;\n  --surface-3:#2E3134;\n  --border:#33373A;\n  --border-strong:#4A4F53;\n  --border-control:#6D7378;\n  --ink:#E6E4E0;\n  --ink-soft:#A8A49D;\n  --ink-mute:#7C7872;\n  --accent:#F2B189;\n  --accent-fill:#CC7A50;\n  --accent-edge:#5C412C;\n  --bg-accent:#31241A;\n  --on-accent:#1B0D05;\n  --success:#7CC49A;\n  --success-fill:#3F8A61;\n  --bg-success:#17301F;\n  --danger:#EB8272;\n  --danger-fill:#C0453A;\n  --bg-danger:#341D1B;\n  --info:#A3AEDD;\n  --bg-info:#1F2130;\n  --neutral:#A09B92;\n  --bg-neutral:#26282A;\n  --dev:#7FC9B8;\n  --bg-dev:#16302A;\n  --shadow:0 1px 2px rgba(0,0,0,.4),0 6px 20px rgba(0,0,0,.34);\n}\n\n/* Slate */\n:root[data-theme=\"slate\"]{\n  --ground:#14181D;\n  --surface:#1B2027;\n  --surface-2:#20262D;\n  --surface-3:#272F37;\n  --border:#2B323A;\n  --border-strong:#3A434C;\n  --border-control:#6A7684;\n  --ink:#E8EAEB;\n  --ink-soft:#A9B0B6;\n  --ink-mute:#78828B;\n  --accent:#E3B36B;\n  --accent-fill:#C4923F;\n  --accent-edge:#5A4522;\n  --bg-accent:#2E2412;\n  --on-accent:#241300;\n  --success:#84C4AA;\n  --success-fill:#4F8C74;\n  --bg-success:#172E25;\n  --danger:#E28270;\n  --danger-fill:#C1503C;\n  --bg-danger:#351F1A;\n  --info:#B4A4E0;\n  --bg-info:#241F36;\n  --neutral:#9AA6B2;\n  --bg-neutral:#222A32;\n  --dev:#78C8BC;\n  --bg-dev:#14302C;\n  --shadow:0 1px 2px rgba(0,0,0,.4),0 6px 20px rgba(0,0,0,.34);\n}\n\n/* Claude (light) */\n:root[data-theme=\"claude\"]{\n  --ground:#F0EEE6;\n  --surface:#FFFFFF;\n  --surface-2:#F7F6F1;\n  --surface-3:#EBE9E0;\n  --border:#DEDACE;\n  --border-strong:#C5C0B2;\n  --border-control:#8A8474;\n  --ink:#191917;\n  --ink-soft:#57544C;\n  --ink-mute:#84806F;\n  --accent:#A8461F;\n  --accent-fill:#B4552F;\n  --accent-edge:#DEB49F;\n  --bg-accent:#F7E6DD;\n  --on-accent:#FFF4EE;\n  --success:#276048;\n  --success-fill:#317055;\n  --bg-success:#D3E8DC;\n  --danger:#9E2B22;\n  --danger-fill:#BE4034;\n  --bg-danger:#F8E2DF;\n  --info:#474C93;\n  --bg-info:#E5E6F4;\n  --neutral:#6B6759;\n  --bg-neutral:#EDEBE2;\n  --dev:#256657;\n  --bg-dev:#D8EBE5;\n  --shadow:0 1px 2px rgba(60,50,35,.07),0 4px 14px rgba(60,50,35,.06);\n}\n\n/* Claude (medium) */\n:root[data-theme=\"claude-med\"]{\n  --ground:#26241F;\n  --surface:#2F2D27;\n  --surface-2:#37352E;\n  --surface-3:#403D35;\n  --border:#454239;\n  --border-strong:#5C5849;\n  --border-control:#807A68;\n  --ink:#EDEAE0;\n  --ink-soft:#B3AE9E;\n  --ink-mute:#8A8676;\n  --accent:#EFA189;\n  --accent-fill:#C26A4F;\n  --accent-edge:#66452F;\n  --bg-accent:#3B2A1E;\n  --on-accent:#1C0C03;\n  --success:#84C6A2;\n  --success-fill:#3C8A63;\n  --bg-success:#22342A;\n  --danger:#EE8B79;\n  --danger-fill:#BC4739;\n  --bg-danger:#3B2622;\n  --info:#AFA8E2;\n  --bg-info:#2B2839;\n  --neutral:#A8A292;\n  --bg-neutral:#343128;\n  --dev:#82C9B9;\n  --bg-dev:#1F3330;\n  --shadow:0 1px 2px rgba(0,0,0,.4),0 6px 20px rgba(0,0,0,.34);\n}\n\n/* Claude (dark) */\n:root[data-theme=\"claude-dark\"]{\n  --ground:#141312;\n  --surface:#1C1B19;\n  --surface-2:#232220;\n  --surface-3:#2C2A27;\n  --border:#31302C;\n  --border-strong:#47443E;\n  --border-control:#6E6A61;\n  --ink:#EFECE3;\n  --ink-soft:#ACA79A;\n  --ink-mute:#7E7A6E;\n  --accent:#F0A791;\n  --accent-fill:#C36E52;\n  --accent-edge:#523A26;\n  --bg-accent:#2B1D14;\n  --on-accent:#1A0A02;\n  --success:#82C9A3;\n  --success-fill:#3E8F66;\n  --bg-success:#14291D;\n  --danger:#F0907E;\n  --danger-fill:#C24A3B;\n  --bg-danger:#2E1B18;\n  --info:#B3ABE6;\n  --bg-info:#211E2E;\n  --neutral:#A5A092;\n  --bg-neutral:#26241F;\n  --dev:#7FCBBA;\n  --bg-dev:#132A26;\n  --shadow:0 1px 2px rgba(0,0,0,.4),0 6px 20px rgba(0,0,0,.34);\n}\n\n/* Claude Code */\n:root[data-theme=\"claude-code\"]{\n  --ground:#1F1E1D;\n  --surface:#262625;\n  --surface-2:#2E2E2C;\n  --surface-3:#383836;\n  --border:#3A3A38;\n  --border-strong:#54544F;\n  --border-control:#787870;\n  --ink:#F5F4EF;\n  --ink-soft:#B4B2A7;\n  --ink-mute:#88867C;\n  --accent:#E39070;\n  --accent-fill:#C2613F;\n  --accent-edge:#4A3227;\n  --bg-accent:#33221B;\n  --on-accent:#1A0A04;\n  --success:#7FC49E;\n  --success-fill:#3C8961;\n  --bg-success:#1C2E23;\n  --danger:#EE8B78;\n  --danger-fill:#BF4A39;\n  --bg-danger:#33211D;\n  --info:#ADA6E0;\n  --bg-info:#28253A;\n  --neutral:#A3A198;\n  --bg-neutral:#2C2C2A;\n  --dev:#7DC6B6;\n  --bg-dev:#1B2E2A;\n  --shadow:0 1px 2px rgba(0,0,0,.4),0 6px 20px rgba(0,0,0,.34);\n}\n\n/* LEGACY ALIASES. The tool CSS written against the war-room names keeps\n   working; a new theme only has to fill the role names above. Do not use\n   these in new code. */\n:root,:root[data-theme]{\n  --brass:var(--accent); --brass-fill:var(--accent-fill);\n  --brass-text:var(--accent); --on-brass:var(--on-accent); --bg-brass:var(--bg-accent);\n  --ember:var(--danger); --ember-fill:var(--danger-fill); --bg-ember:var(--bg-danger);\n  --moss:var(--success); --moss-fill:var(--success-fill); --bg-moss:var(--bg-success);\n  --violet:var(--info); --bg-violet:var(--bg-info);\n  --steel:var(--neutral); --bg-steel:var(--bg-neutral);\n  --font-head:var(--font-display);\n}\n\n/* NUMBERS. Tabular figures give fixed-width digits, which is what makes a\n   column line up; the face itself is proportional and its zero is open.\n   `font-feature-settings: \"zero\" 0` is deliberately NOT used - it was tried,\n   and it does nothing, because in every mono face tested the slash or dot is\n   the default glyph rather than an optional feature. The fix is face choice,\n   not a feature flag. */\n.num,[data-num],table td,.stat .v,.mini .mr{\n  font-variant-numeric:tabular-nums;\n}\n\n/* DEVELOPER INFO (DESIGN.md §7, register R67). Hidden unless the reader has\n   turned it on, and tinted with its own hue so it is never mistaken for\n   something written for a player. */\n:root:not([data-dev=\"on\"]) [data-dev-only]{display:none!important}\n[data-dev-only]{color:var(--dev)}\n.devpill{\n  font-family:var(--font-mono);font-size:.6rem;font-weight:700;\n  padding:1px 6px;border-radius:3px;background:var(--bg-dev);color:var(--dev);\n}\n\n</style>\n<style>\n/* ===========================================================================\n   AWOO+ TOOL SETTINGS — the gear menu every tool shares.\n\n   Hand-written, unlike theme-tokens.css beside it. Injected by\n   userscripts/build.mjs at the <!-- @AWOO_TOOL_SETTINGS@ --> marker together\n   with tool-settings.js, for the same reason the tokens are injected rather\n   than copied: the menu, the theme inheritance and the \"Match game\" fallback\n   were about to exist four times, and the fallback is the part that has to\n   change in one place when Core's theme snapshot reaches tool payloads.\n\n   Every selector is prefixed `awoo-gear` because it lands inside pages whose\n   own `.btn` / `.panel` / `.note` rules differ from tool to tool.\n   ARTIFACT_STYLE_GUIDE.md Part II, \"Settings menu\".\n   =========================================================================== */\n.awoo-gear{position:relative;flex:none}\n.awoo-gear-btn{\n  background:transparent; border:1px solid var(--border-control); color:var(--ink-soft);\n  border-radius:4px; padding:3px 8px; cursor:pointer;\n  font:inherit; font-size:.95rem; line-height:1;\n}\n.awoo-gear-btn:hover,.awoo-gear-btn[aria-expanded=\"true\"]{\n  color:var(--ink); border-color:var(--accent-fill); background:var(--surface-2);\n}\n.awoo-gear-menu{\n  position:absolute; right:0; top:calc(100% + 6px); z-index:60; width:250px;\n  background:var(--surface); color:var(--ink); border:1px solid var(--border-strong);\n  border-radius:6px; box-shadow:var(--shadow); padding:8px;\n  display:flex; flex-direction:column; gap:7px;\n  font-family:var(--font-body); font-size:14px; line-height:1.4; text-align:left;\n}\n/* Opening upward, for a gear that sits at the foot of the viewport. */\n.awoo-gear-menu.up{top:auto; bottom:calc(100% + 6px)}\n.awoo-gear-row{display:flex;flex-direction:column;gap:3px}\n.awoo-gear-row label{\n  font-size:.62rem;font-weight:700;letter-spacing:.08em;\n  text-transform:uppercase;color:var(--ink-mute);\n}\n.awoo-gear-row select{\n  background:var(--surface-2); color:var(--ink); border:1px solid var(--border-control);\n  border-radius:4px; padding:var(--ctl-y) var(--ctl-x); font:inherit; font-size:.76rem; width:100%;\n}\n.awoo-gear-check{flex-direction:row;align-items:center;gap:7px}\n.awoo-gear-check label{flex:1}\n.awoo-gear-check input{accent-color:var(--accent-fill);margin:0}\n.awoo-gear-note{font-size:.66rem;color:var(--ink-mute);line-height:1.4}\n.awoo-gear-note:empty{display:none}\n/* A fallback is information the reader needs, not a footnote: the page is\n   deliberately not in the theme they asked for, and it says so. */\n.awoo-gear-note.fallback{color:var(--info);background:var(--bg-info);border-radius:4px;padding:4px 6px}\n\n/* SIDEBAR PINNING (2026-09-21). The default is that a tool's sidebar scrolls\n   WITH the page, and is pinned only while the whole of it fits on screen — a\n   pinned sidebar taller than the window hides its own bottom until the page\n   ends, and an independently scrolling one is a second scrollbar to manage.\n   \"Sidebar scrolls on its own\" in the gear menu restores the older behaviour.\n   tool-settings.js measures and sets data-side-mode; nothing else should. */\n[data-awoo-sidebar][data-side-mode=\"sticky\"]{position:sticky;top:var(--side-top,20px)}\n[data-awoo-sidebar][data-side-mode=\"scroll\"]{\n  position:sticky; top:var(--side-top,20px);\n  max-height:calc(100vh - var(--side-top,20px) - 16px);\n  overflow-y:auto; overflow-x:hidden; scrollbar-width:thin;\n}\n\n/* ===========================================================================\n   THE SHARED TOOL KIT (2026-09-23): the title block, the sync card, the field\n   lights, the Live/Standard switch and the one tooltip. tool-sync.js renders\n   the dynamic parts; these rules are the whole of their look, so every tool\n   shows the same card and the same lights.\n   =========================================================================== */\n\n/* Title block: eyebrow, title, one line, and the gear top-right. The layout\n   Party Gold ROI and Stat Rate Optimizer settled, now the standard. */\n.awoo-head{position:relative;padding-right:2.4rem}\n.awoo-head .awoo-gear{position:absolute;top:0;right:0}\n.awoo-eyebrow{font-family:var(--font-mono);font-size:.63rem;letter-spacing:.11em;text-transform:uppercase;color:var(--accent);margin:0 0 .3rem}\n.awoo-title{font-family:var(--font-display);font-weight:700;font-size:1.7rem;line-height:1.05;margin:0 0 .3rem;text-wrap:balance;letter-spacing:normal;text-transform:none;color:var(--ink)}\n.awoo-sub{color:var(--ink-soft);font-size:.78rem;line-height:1.45;margin:0}\n\n/* Buttons the kit renders. Tools keep their own .btn; these do not collide. */\n.awoo-btn{\n  font-family:var(--font-body); font-size:.72rem; font-weight:500; color:var(--ink-soft);\n  background:var(--surface-2); border:1px solid var(--border-control); border-radius:6px;\n  padding:.28rem .6rem; cursor:pointer; white-space:nowrap; flex:1;\n}\n.awoo-btn:hover{border-color:var(--accent-fill);color:var(--accent);background:var(--surface-3)}\n.awoo-btn:disabled{opacity:.4;cursor:default}\n.awoo-btn:disabled:hover{border-color:var(--border-control);color:var(--ink-soft);background:var(--surface-2)}\n.awoo-btn-primary{color:var(--on-accent);background:var(--accent-fill);border-color:var(--accent-fill)}\n.awoo-btn-primary:hover{filter:brightness(1.07);color:var(--on-accent);background:var(--accent-fill)}\n\n/* The sync card: state and age on one line, the mode switch, two actions. */\n.awoo-sync{\n  background:var(--surface); border:1px solid var(--border); border-left:3px solid var(--border-strong);\n  border-radius:var(--radius); padding:var(--pad-panel); box-shadow:var(--shadow);\n  display:flex; flex-direction:column; gap:.45rem; font-family:var(--font-body); font-size:.75rem;\n}\n.awoo-sync[data-state=\"synced\"]{border-left-color:var(--success-fill)}\n.awoo-sync[data-state=\"stale\"]{border-left-color:var(--accent-fill)}\n.awoo-sync-head{display:flex;align-items:center;gap:.45rem}\n.awoo-sync-head .awoo-light{cursor:default;margin:0}\n.awoo-sync-state{font-weight:600;color:var(--ink);border-bottom:1px dotted var(--ink-mute);cursor:help}\n.awoo-sync-age{margin-left:auto;font-family:var(--font-num);font-variant-numeric:tabular-nums;color:var(--ink-mute);font-size:.68rem}\n.awoo-sync-actions{display:flex;gap:.35rem}\n\n/* Live / Standard. */\n.awoo-seg{display:grid;grid-template-columns:1fr 1fr;gap:2px;padding:2px;background:var(--surface-2);border:1px solid var(--border-control);border-radius:6px}\n.awoo-seg button{border:0;background:transparent;color:var(--ink-soft);font:inherit;font-size:.72rem;font-weight:600;padding:.22rem .4rem;border-radius:4px;cursor:pointer}\n.awoo-seg button:hover{color:var(--ink)}\n.awoo-seg button[aria-pressed=\"true\"]{background:var(--surface);color:var(--ink);box-shadow:var(--shadow)}\n[data-sync-mode=\"live\"] [data-mode-only=\"standard\"],\n[data-sync-mode=\"standard\"] [data-mode-only=\"live\"],\n:root:not([data-sync-mode]) [data-mode-only=\"standard\"]{display:none!important}\n\n/* A field's light. Filled means the game supplied it; hollow means it never\n   did (Core's convention: a state you cannot act on renders hollow). */\n.awoo-light{\n  display:inline-block; flex:none; width:.55rem; height:.55rem; border-radius:50%;\n  border:0; padding:0; margin:0 .3rem 0 0; vertical-align:middle; cursor:pointer;\n  background:transparent; box-shadow:inset 0 0 0 1.5px var(--ink-mute);\n}\n.awoo-light[data-state=\"synced\"]{background:var(--success-fill);box-shadow:none}\n.awoo-light[data-state=\"stale\"]{background:var(--accent-fill);box-shadow:none}\n.awoo-light[data-state=\"edited\"]{background:var(--info);box-shadow:none}\n.awoo-light[data-off=\"true\"]{opacity:.35}\n.awoo-light:focus-visible{outline:2px solid var(--accent-fill);outline-offset:2px}\n\n/* The one tooltip. */\n#awooTip{\n  position:fixed; z-index:200; left:0; top:0; max-width:22rem; pointer-events:none;\n  background:var(--ink); color:var(--surface); white-space:pre-line;\n  font-family:var(--font-body); font-size:.73rem; font-weight:400; line-height:1.45; letter-spacing:normal; text-transform:none;\n  padding:.45rem .6rem; border-radius:6px; box-shadow:var(--shadow);\n  opacity:0; visibility:hidden; transition:opacity .1s;\n}\n#awooTip.on{opacity:1;visibility:visible}\n#awooTip .awoo-tip-dev{display:block;margin-top:.35rem;padding-top:.35rem;border-top:1px solid var(--ink-mute);color:var(--bg-dev)}\n.awoo-tip{border-bottom:1px dotted var(--ink-mute);cursor:help}\n@media (prefers-reduced-motion:reduce){#awooTip{transition:none}}\n\n/* Number boxes (data-num): tabular figures in the number font, a size\n   smaller than body text (2026-09-23, asked for), right-aligned so a column\n   of them lines up on the last digit. */\ninput[data-num]{font-family:var(--font-num);font-variant-numeric:tabular-nums;font-size:.74rem;text-align:right}\n\n/* THE DEFAULT INPUT BOX is Pet Slot ROI's (the maintainer, 2026-09-25: \"I like\n   the input boxes from the pet ROI, make those default. They are nicely\n   compact in height\"). It lives here, in the kit every tool gets, because a\n   box each page styled for itself is how two of them went unstyled: Cost\n   Tables' level boxes became type=\"text\" for locale-aware numbers while its\n   rule still said input[type=number], and the optimizer's ratio boxes sat in\n   a table no rule reached. Both drew the browser's white box under the\n   theme's light ink, which is unreadable in every dark theme. A page rule with\n   a class still wins (this is element + attribute specificity; the select's\n   :not([multiple]) is there only to outrank a page's bare `select` reset), so a page sets\n   only what is its own: a width, an alignment. The gear menu keeps its own. */\ninput[type=number],input[type=text],input:not([type]),select:not([multiple]){\n  font-family:var(--font-num);font-size:.74rem;font-weight:600;color:var(--ink);\n  background:var(--surface-2);border:1px solid var(--border-control);border-radius:4px;\n  padding:var(--ctl-y) var(--ctl-x);min-width:0;font-variant-numeric:tabular-nums;\n  line-height:1.4;height:1.45rem;box-sizing:border-box}\nselect:not([multiple]){font-family:var(--font-body);font-weight:400}\ninput[type=number]{-moz-appearance:textfield;appearance:textfield;text-align:right}\ninput[type=number]::-webkit-outer-spin-button,\ninput[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}\ninput[type=number]:focus,input[type=text]:focus,input:not([type]):focus,select:focus{outline:2px solid var(--accent-fill);outline-offset:1px}\ninput[type=number]:disabled,input[type=text]:disabled,select:disabled{opacity:.45;cursor:not-allowed;background:var(--surface-3)}\n\n</style>\n<script>\n/* ===========================================================================\n   AWOO+ TOOL SETTINGS — theme, developer info and fonts, shared by every tool.\n\n   Hand-written. Injected by userscripts/build.mjs at <!-- @AWOO_TOOL_SETTINGS@ -->\n   (with tool-settings.css), so the inheritance rules below exist once rather\n   than once per tool. A page opts in by carrying the marker, naming itself in\n   <meta name=\"awoo-tool\" content=\"...\"> BEFORE the marker, and calling\n   AWOO_TOOL_SETTINGS.mount(el) from its own init.\n\n   INHERIT, THEN OVERRIDE (ARTIFACT_STYLE_GUIDE.md Part II and Part IV).\n   The theme, \"Show developer info\" and the tool fonts are the PLAYER's\n   settings, held by AWOO+ Core. Core hands them over when it opens a tool, as\n   window.AWOO_APPEARANCE, prepended to the payload the same way AWOO_LIVE is.\n   A choice made in this page's gear menu overrides the inherited one and is\n   remembered per tool; \"Match game\" hands the decision back to Core.\n\n   THE FALLBACKS, stated because each one is a deliberate answer rather than\n   whatever happened to render:\n     - Opened outside the game (nothing inherited): the OS preference decides,\n       Beach (light) or Slate — theme-tokens.css does that with no stamp.\n     - Core's theme is game-shaped (\"Match game\", or the AWOO Turquoise preset):\n       a tool opened in its own tab cannot read the game page's variables, and\n       Core's snapshot of them does not reach tool payloads yet. So the page\n       shows SLATE AND SAYS SO in the menu — never an unstyled page, never a\n       silent substitute. When the snapshot does reach the payload, this\n       branch is the one place that changes.\n   =========================================================================== */\n(function(){\n'use strict';\n\nvar THEMES = [\n  ['beach','Beach (light)'], ['beach-dim','Beach (dimmed)'], ['slate','Slate'],\n  ['claude','Claude (light)'], ['claude-med','Claude (medium)'], ['claude-dark','Claude (dark)'],\n  ['claude-code','Claude Code']\n];\nvar THEME_IDS = THEMES.map(function(t){ return t[0]; });\n// Core's two themes that are defined by the GAME's variables rather than by\n// our contract. Neither can be rendered in a separate tab yet.\nvar GAME_SHAPED = { matchGame:'Match game', awooTurquoise:'AWOO Turquoise' };\nvar FALLBACK_THEME = 'slate';\n\n// The two font lists of Settings > Fonts. Core carries the same two lists for\n// the overlay; userscripts/tests/tool-theme-contract.mjs fails if they drift apart.\n//   text: Public Sans (default) · Open Sans · Figtree\n//   num:  Public Sans with tabular figures (default) · Roboto Mono\n// Roboto Mono marks its zero (69% ink in the counter, measured); it is offered\n// because it was asked for, and labelled for what it is in Core's picker.\nvar FONT_TEXT = {\n  public:  { stack:\"'Public Sans',system-ui,-apple-system,sans-serif\", family:'Public+Sans:wght@400;500;600;700' },\n  open:    { stack:\"'Open Sans',system-ui,-apple-system,sans-serif\",   family:'Open+Sans:wght@400;500;600;700' },\n  figtree: { stack:\"'Figtree',system-ui,-apple-system,sans-serif\",     family:'Figtree:wght@400;500;600;700' }\n};\nvar FONT_NUM = {\n  public: { stack:\"'Public Sans',system-ui,-apple-system,sans-serif\", family:'Public+Sans:wght@400;500;600;700' },\n  roboto: { stack:\"'Roboto Mono',ui-monospace,monospace\",             family:'Roboto+Mono:wght@400;500;600' }\n};\n\n// NUMBER PRESENTATION (2026-09-23: moved here from Cost Tables, so every tool\n// carries it). The game keeps two per-character settings, both CODE facts in\n// data/tables/number-display.json: numberFormatting (standard | exponential |\n// letters) and numberLocale ('Local' -> the browser, '1.000,00', '1,000.00').\n// Core hands the player's own over in AWOO_APPEARANCE.number; the gear menu\n// can override either, per tool. The suffix ladder starts at 1e3, and below\n// 1e6 every mode falls through to standard, which is the game's own rule.\nvar NUM_MODES = ['letters', 'standard', 'exponential'];\nvar LADDER = ['k','m','b','t','qa','qi','sx','sp','oc','no','dc','ud'];\nvar LOCALE_MAP = { 'Local':null, '1.000,00':'de-DE', '1,000.00':'en-US' };\n\nvar root = document.documentElement;\nvar meta = document.querySelector('meta[name=\"awoo-tool\"]');\nvar TOOL = (meta && meta.getAttribute('content')) || 'tool';\nvar LS = 'awoo:tool:' + TOOL + ':appearance';\n\nvar local = { theme:null, dev:null, sideScroll:false, numMode:null, numLocale:null, fontText:null, fontNum:null };\ntry {\n  var raw = localStorage.getItem(LS);\n  if (raw){ var p = JSON.parse(raw); if (p && typeof p === 'object'){\n    local.theme = p.theme || null; local.dev = (typeof p.dev === 'boolean') ? p.dev : null; local.sideScroll = p.sideScroll === true;\n    local.numMode = NUM_MODES.indexOf(p.numMode) >= 0 ? p.numMode : null;\n    local.numLocale = Object.prototype.hasOwnProperty.call(LOCALE_MAP, p.numLocale) ? p.numLocale : null;\n    local.fontText = FONT_TEXT[p.fontText] ? p.fontText : null;\n    local.fontNum = FONT_NUM[p.fontNum] ? p.fontNum : null;\n  } }\n} catch(e){ /* private window or blocked storage: inherit everything */ }\nfunction persist(){\n  try { localStorage.setItem(LS, JSON.stringify(local)); } catch(e){ /* not durable, still applied */ }\n}\n\n// What Core handed over. AWOO_APPEARANCE is the channel; the profile section\n// is the older one Cost Tables was written against, kept so a page embedded\n// beside Core (not in its own tab) still inherits.\nfunction inherited(){\n  var out = { theme:null, dev:null, fonts:null };\n  var a = window.AWOO_APPEARANCE;\n  if (a && typeof a === 'object'){\n    if (typeof a.theme === 'string') out.theme = a.theme;\n    if (typeof a.dev === 'boolean') out.dev = a.dev;\n    if (a.fonts && typeof a.fonts === 'object') out.fonts = a.fonts;\n  }\n  try {\n    var core = window.AWOO_CORE || window.Core;\n    if (core && core.profile && typeof core.profile.section === 'function'){\n      var t = core.profile.section('settings.theme');\n      if (out.theme == null && t && typeof t.value === 'string') out.theme = t.value;\n      var d = core.profile.section('settings.showDeveloperInfo');\n      if (out.dev == null && d && typeof d.value === 'boolean') out.dev = d.value;\n    }\n  } catch(e){ /* absent is absent */ }\n  return out;\n}\n\n// The theme actually painted, and why. `note` is shown in the menu whenever\n// the page is not showing exactly what was asked for.\nfunction resolveTheme(){\n  if (local.theme && THEME_IDS.indexOf(local.theme) >= 0){\n    return { id:local.theme, source:'picked', note:'' };\n  }\n  var inh = inherited().theme;\n  if (inh && THEME_IDS.indexOf(inh) >= 0){\n    return { id:inh, source:'game', note:'' };\n  }\n  if (inh && GAME_SHAPED[inh]){\n    return { id:FALLBACK_THEME, source:'fallback',\n      note:'Your AWOO+ theme is ' + GAME_SHAPED[inh] + ', which a tool cannot read yet. Showing Slate.' };\n  }\n  return { id:null, source:'os', note:'No AWOO+ theme to match, so this follows your system: Beach or Slate.' };\n}\n\nfunction labelOf(id){\n  for (var i = 0; i < THEMES.length; i++) if (THEMES[i][0] === id) return THEMES[i][1];\n  return null;\n}\n\nfunction applyTheme(){\n  var r = resolveTheme();\n  if (r.id) root.setAttribute('data-theme', r.id);\n  else root.removeAttribute('data-theme');\n  return r;\n}\nfunction devOn(){\n  if (local.dev != null) return local.dev;\n  return !!inherited().dev;\n}\nfunction applyDev(){ root.setAttribute('data-dev', devOn() ? 'on' : 'off'); }\n\nfunction inheritedNumber(){\n  var a = window.AWOO_APPEARANCE && window.AWOO_APPEARANCE.number;\n  return {\n    mode: a && NUM_MODES.indexOf(a.formatting) >= 0 ? a.formatting : null,\n    locale: a && Object.prototype.hasOwnProperty.call(LOCALE_MAP, a.locale) ? a.locale : null\n  };\n}\nfunction numMode(){ return local.numMode || inheritedNumber().mode || 'letters'; }\nfunction numLocaleKey(){ return local.numLocale || inheritedNumber().locale || 'Local'; }\nfunction numLocaleTag(){\n  var tag = LOCALE_MAP[numLocaleKey()];\n  if (tag) return tag;\n  try { return navigator.language || 'en-US'; } catch(e){ return 'en-US'; }\n}\nfunction finite(n){ return typeof n === 'number' && isFinite(n); }\n// Grouped digits, rounded. A dash for anything that is not a number, so a\n// missing input never renders as a confident 0.\nfunction fmtInt(n){\n  if (!finite(n)) return n === Infinity ? '\\u221e' : '\\u2014';\n  try { return Math.round(n).toLocaleString(numLocaleTag()); } catch(e){ return String(Math.round(n)); }\n}\n// Exactly d decimals, in the player's separators.\nfunction fmtDec(n, d){\n  if (!finite(n)) return n === Infinity ? '\\u221e' : '\\u2014';\n  d = d == null ? 2 : d;\n  try { return n.toLocaleString(numLocaleTag(), { minimumFractionDigits:d, maximumFractionDigits:d }); }\n  catch(e){ return n.toFixed(d); }\n}\n// A fraction as a percentage: 0.1234 -> \"12.34%\".\nfunction fmtPct(frac, d){ return finite(frac) ? fmtDec(frac * 100, d == null ? 2 : d) + '%' : '\\u2014'; }\n// The game's own rule: below 1e6 standard (with up to `small` decimals for\n// small non-integers), from 1e6 letters / exponential / standard.\nfunction fmtNum(n, small){\n  if (!finite(n)) return n === Infinity ? '\\u221e' : '\\u2014';\n  if (n === 0) return '0';\n  var mode = numMode(), abs = Math.abs(n);\n  if (abs < 1e6 || mode === 'standard'){\n    if (abs < 1000 && small && Math.round(n) !== n){\n      var dd = abs < 10 ? small : Math.max(0, small - 1);\n      try { return n.toLocaleString(numLocaleTag(), { maximumFractionDigits:dd }); } catch(e){ return n.toFixed(dd); }\n    }\n    return fmtInt(n);\n  }\n  if (mode === 'exponential') return n.toExponential(2);\n  var i = Math.min(LADDER.length - 1, Math.floor(Math.log10(abs) / 3) - 1);\n  var v = n / Math.pow(1000, i + 1);\n  // Always two decimals: the game's own letter form (NumberDisplay, CODE;\n  // data/tables/number-display.json display.letterFormat.threshold). Cost\n  // Tables showed one decimal from 100 up until 2026-09-23, which the game never does.\n  return fmtDec(v, 2) + LADDER[i];\n}\n// Reads what a person typed, in the player's separators, with the game's\n// letter suffixes (\"4.18t\"). null when it is not a number, never 0.\nfunction parseNum(str){\n  if (typeof str === 'number') return finite(str) ? str : null;\n  if (typeof str !== 'string') return null;\n  var t = str.trim().toLowerCase().replace(/[\\s%]/g, '');\n  if (!t) return null;\n  var mult = 1, m = t.match(/(qa|qi|sx|sp|oc|no|dc|ud|k|m|b|t)$/);\n  if (m){ mult = Math.pow(1000, LADDER.indexOf(m[1]) + 1); t = t.slice(0, -m[1].length); }\n  var dec = fmtDec(1.5, 1).replace(/[0-9]/g, '') || '.';\n  var group = dec === ',' ? '.' : ',';\n  t = t.split(group).join('');\n  if (dec !== '.') t = t.replace(dec, '.');\n  if (!/^[-+]?\\d*\\.?\\d+(e[-+]?\\d+)?$/.test(t)) return null;\n  var v = parseFloat(t) * mult;\n  return finite(v) ? v : null;\n}\nfunction numberNote(){\n  var inh = inheritedNumber(), parts = [];\n  if (!local.numMode) parts.push(inh.mode ? 'format from game' : 'format: letters (not opened from the game)');\n  if (!local.numLocale) parts.push(inh.locale ? 'separators from game' : 'separators: browser');\n  return parts.join(' \\u00b7 ');\n}\n\n// Fonts: Settings > Fonts in Core sets the tools' faces for every tool, and\n// since 2026-09-23 each tool's gear can override them for that tool alone\n// (the maintainer asked for the number font in every settings menu). \"Match\n// AWOO+\" hands the choice back to Core. A face outside the page's own\n// stylesheet link is fetched only when chosen.\nfunction loadFamily(family){\n  if (!family || document.querySelector('link[data-awoo-font=\"' + family + '\"]')) return;\n  var l = document.createElement('link');\n  l.rel = 'stylesheet';\n  l.href = 'https://fonts.googleapis.com/css2?family=' + family + '&display=swap';\n  l.setAttribute('data-awoo-font', family);\n  (document.head || root).appendChild(l);\n}\nfunction fontIds(){\n  var f = inherited().fonts;\n  var tools = f && (f.tools || f);\n  return {\n    text: local.fontText || (tools && FONT_TEXT[tools.text] ? tools.text : null),\n    num: local.fontNum || (tools && FONT_NUM[tools.num] ? tools.num : null)\n  };\n}\nfunction applyFonts(){\n  var ids = fontIds();\n  var text = ids.text && FONT_TEXT[ids.text];\n  var num = ids.num && FONT_NUM[ids.num];\n  if (text){\n    loadFamily(text.family);\n    root.style.setProperty('--font-body', text.stack);\n    root.style.setProperty('--font-display', text.stack);\n  }\n  if (num){\n    loadFamily(num.family);\n    root.style.setProperty('--font-num', num.stack);\n  }\n  // Switching back to \"Match AWOO+\" with nothing inherited must undo an\n  // override, not leave the last one painted.\n  var rm = root.style && typeof root.style.removeProperty === 'function' ? function(k){ root.style.removeProperty(k); } : function(){};\n  if (!text){ rm('--font-body'); rm('--font-display'); }\n  if (!num) rm('--font-num');\n}\nvar FONT_LABEL = { public:'Public Sans', open:'Open Sans', figtree:'Figtree', roboto:'Roboto Mono (marked 0)' };\n\n/* NUMBER INPUTS (2026-09-23). A box marked data-num shows thousands\n   separators while you are not in it, and plain digits while you edit (so the\n   caret never fights a separator). What you paste may carry separators, as\n   long as they are your format's; letter suffixes (\"4.18t\") work too.\n   num.read(el) is how a page reads one: the value, or null, never 0 for a\n   box that is empty or not a number. */\nfunction showNum(el, v){\n  if (v === null || v === undefined){ return; }\n  var dig = el.getAttribute('data-num-digits');\n  var max = dig !== null ? parseInt(dig, 10) : 6;\n  var focused = document.activeElement === el;\n  try {\n    el.value = focused\n      ? v.toLocaleString(numLocaleTag(), { useGrouping:false, maximumFractionDigits:max })\n      : v.toLocaleString(numLocaleTag(), { maximumFractionDigits:max });\n  } catch(e){ el.value = String(v); }\n}\nfunction readNum(el){ return el ? parseNum(el.value) : null; }\nfunction enhanceNum(el){\n  if (!el || el.__awooNum) return;\n  el.__awooNum = true;\n  if (el.type === 'number') el.type = 'text';\n  el.setAttribute('inputmode', 'decimal');\n  el.setAttribute('autocomplete', 'off');\n  el.addEventListener('focus', function(){ var v = readNum(el); if (v !== null) showNum(el, v); });\n  el.addEventListener('blur', function(){ var v = readNum(el); if (v !== null) showNum(el, v); });\n  var v0 = readNum(el);\n  if (v0 === null && el.value){ var raw = parseFloat(el.value); if (isFinite(raw)) v0 = raw; }\n  if (v0 !== null) showNum(el, v0);\n}\nfunction enhanceAll(scope){\n  var list = (scope || document).querySelectorAll('input[data-num]');\n  for (var i = 0; i < list.length; i++) enhanceNum(list[i]);\n}\nfunction reformatAll(){\n  var list = document.querySelectorAll('input[data-num]');\n  for (var i = 0; i < list.length; i++){ if (document.activeElement !== list[i]){ var v = readNum(list[i]); if (v !== null) showNum(list[i], v); } }\n}\n\n// Sidebar pinning (see tool-settings.css). A page marks its sidebar with\n// data-awoo-sidebar, the viewport width from which it sits BESIDE the content\n// (data-side-min) and the pinned offset (data-side-top, e.g. below a sticky\n// top bar). Below that width the layout is one column and nothing is pinned.\nfunction sidebar(){ return document.querySelector('[data-awoo-sidebar]'); }\nfunction layoutSidebar(){\n  var el = sidebar();\n  if (!el) return;\n  var min = parseInt(el.getAttribute('data-side-min'), 10) || 0;\n  var top = parseInt(el.getAttribute('data-side-top'), 10) || 20;\n  el.style.setProperty('--side-top', top + 'px');\n  var mode;\n  if (window.innerWidth < min) mode = 'static';\n  else if (local.sideScroll) mode = 'scroll';\n  // scrollHeight is the content's own height whatever max-height says, so\n  // the measurement does not depend on the mode it is choosing between.\n  else mode = el.scrollHeight <= window.innerHeight - top - 16 ? 'sticky' : 'static';\n  if (el.getAttribute('data-side-mode') !== mode) el.setAttribute('data-side-mode', mode);\n}\nfunction watchSidebar(){\n  var el = sidebar();\n  if (!el) return;\n  layoutSidebar();\n  window.addEventListener('resize', layoutSidebar);\n  // Content grows and shrinks (a details panel opens, live data arrives), so\n  // the fit is re-measured on the element's own size changes too.\n  if (window.ResizeObserver) new ResizeObserver(layoutSidebar).observe(el);\n}\n\nvar listeners = [];\nfunction changed(){ for (var i = 0; i < listeners.length; i++){ try { listeners[i](); } catch(e){ /* one page bug must not stop the others */ } } }\n\n// Painted immediately, at parse time, so the page never flashes the base\n// theme before the stored or inherited one.\napplyTheme(); applyDev(); applyFonts();\n\nfunction el(tag, attrs, text){\n  var n = document.createElement(tag);\n  for (var k in attrs) n.setAttribute(k, attrs[k]);\n  if (text != null) n.textContent = text;\n  return n;\n}\n\n/* The gear menu. `host` is an empty element in the page's top bar; `opts.extra`\n   is an optional node of page-specific rows (Cost Tables' number format),\n   placed between Theme and Show developer info. `opts.up` opens it upward. */\nfunction mount(host, opts){\n  opts = opts || {};\n  if (!host) return;\n  host.classList.add('awoo-gear');\n  host.textContent = '';\n\n  var btn = el('button', { type:'button', 'class':'awoo-gear-btn', 'aria-expanded':'false',\n    'aria-controls':'awooGearMenu', 'aria-label':'Settings', title:'Settings' }, '⚙');\n  var menu = el('div', { id:'awooGearMenu', 'class':'awoo-gear-menu' + (opts.up ? ' up' : '') });\n  menu.hidden = true;\n\n  var themeRow = el('div', { 'class':'awoo-gear-row' });\n  themeRow.appendChild(el('label', { 'for':'awooThemeSel' }, 'Theme'));\n  var sel = el('select', { id:'awooThemeSel' });\n  var matchOpt = el('option', { value:'' }, 'Match game');\n  sel.appendChild(matchOpt);\n  THEMES.forEach(function(t){ sel.appendChild(el('option', { value:t[0] }, t[1])); });\n  themeRow.appendChild(sel);\n  menu.appendChild(themeRow);\n  var themeNote = el('div', { 'class':'awoo-gear-note' });\n  menu.appendChild(themeNote);\n\n  // Numbers and separators: in every tool's gear, not one tool's extra rows.\n  var numRow = el('div', { 'class':'awoo-gear-row' });\n  numRow.appendChild(el('label', { 'for':'awooNumMode' }, 'Numbers'));\n  var numSel = el('select', { id:'awooNumMode' });\n  [['', 'Match game'], ['letters', '105.44b'], ['standard', '105,440,000,000'], ['exponential', '1.05e+11']]\n    .forEach(function(o){ numSel.appendChild(el('option', { value:o[0] }, o[1])); });\n  numRow.appendChild(numSel);\n  menu.appendChild(numRow);\n  var locRow = el('div', { 'class':'awoo-gear-row' });\n  locRow.appendChild(el('label', { 'for':'awooNumLocale' }, 'Decimal separator'));\n  var locSel = el('select', { id:'awooNumLocale' });\n  [['', 'Match game'], ['1,000.00', '1,000.00 \\u00b7 point'], ['1.000,00', '1.000,00 \\u00b7 comma'], ['Local', 'Browser default']]\n    .forEach(function(o){ locSel.appendChild(el('option', { value:o[0] }, o[1])); });\n  locRow.appendChild(locSel);\n  menu.appendChild(locRow);\n  var numNote = el('div', { 'class':'awoo-gear-note' });\n  menu.appendChild(numNote);\n\n  function fontRow(id, label, list){\n    var row = el('div', { 'class':'awoo-gear-row' });\n    row.appendChild(el('label', { 'for':id }, label));\n    var sel2 = el('select', { id:id });\n    sel2.appendChild(el('option', { value:'' }, 'Match AWOO+'));\n    Object.keys(list).forEach(function(k){ sel2.appendChild(el('option', { value:k }, FONT_LABEL[k] || k)); });\n    row.appendChild(sel2);\n    menu.appendChild(row);\n    return sel2;\n  }\n  var fontNumSel = fontRow('awooFontNum', 'Number font', FONT_NUM);\n  var fontTextSel = fontRow('awooFontText', 'Text font', FONT_TEXT);\n\n  if (opts.extra) menu.appendChild(opts.extra);\n\n  var devRow = el('div', { 'class':'awoo-gear-row awoo-gear-check' });\n  devRow.appendChild(el('label', { 'for':'awooDevToggle' }, 'Show developer info'));\n  var dev = el('input', { type:'checkbox', id:'awooDevToggle' });\n  devRow.appendChild(dev);\n  menu.appendChild(devRow);\n  menu.appendChild(el('div', { 'class':'awoo-gear-note' },\n    opts.devHint || 'Adds the evidence tier, source files and last-checked date.'));\n\n  var side = null;\n  if (sidebar()){\n    var sideRow = el('div', { 'class':'awoo-gear-row awoo-gear-check' });\n    sideRow.appendChild(el('label', { 'for':'awooSideScroll' }, 'Sidebar scrolls on its own'));\n    side = el('input', { type:'checkbox', id:'awooSideScroll' });\n    sideRow.appendChild(side);\n    menu.appendChild(sideRow);\n    side.addEventListener('change', function(){\n      local.sideScroll = side.checked;\n      persist(); layoutSidebar(); changed();\n    });\n  }\n\n  host.appendChild(btn);\n  host.appendChild(menu);\n  watchSidebar();\n\n  function render(){\n    var r = resolveTheme();\n    sel.value = local.theme || '';\n    // \"Match game\" says what it resolved to, so the reader never has to open\n    // the list to find out which theme they are looking at.\n    matchOpt.textContent = 'Match game' + (r.source === 'picked' ? '' :\n      ' · ' + (r.id ? labelOf(r.id) : 'system'));\n    themeNote.textContent = (r.source === 'picked') ? '' : r.note;\n    themeNote.classList.toggle('fallback', r.source === 'fallback');\n    dev.checked = devOn();\n    if (side) side.checked = !!local.sideScroll;\n    numSel.value = local.numMode || '';\n    locSel.value = local.numLocale || '';\n    numNote.textContent = numberNote();\n    var fi = fontIds();\n    fontNumSel.value = local.fontNum || '';\n    fontTextSel.value = local.fontText || '';\n    fontNumSel.options[0].textContent = 'Match AWOO+' + (!local.fontNum ? ' \\u00b7 ' + (FONT_LABEL[fi.num] || 'Public Sans') : '');\n    fontTextSel.options[0].textContent = 'Match AWOO+' + (!local.fontText ? ' \\u00b7 ' + (FONT_LABEL[fi.text] || 'Public Sans') : '');\n  }\n  render();\n\n  fontNumSel.addEventListener('change', function(){\n    local.fontNum = fontNumSel.value || null;\n    persist(); applyFonts(); render(); changed();\n  });\n  fontTextSel.addEventListener('change', function(){\n    local.fontText = fontTextSel.value || null;\n    persist(); applyFonts(); render(); changed();\n  });\n\n  numSel.addEventListener('change', function(){\n    local.numMode = numSel.value || null;\n    persist(); render(); reformatAll(); changed();\n  });\n  locSel.addEventListener('change', function(){\n    local.numLocale = locSel.value || null;\n    persist(); render(); reformatAll(); changed();\n  });\n  enhanceAll();\n\n  sel.addEventListener('change', function(){\n    local.theme = sel.value || null;\n    persist(); applyTheme(); render(); changed();\n  });\n  dev.addEventListener('change', function(){\n    local.dev = dev.checked;\n    persist(); applyDev(); changed();\n  });\n\n  // Closes on outside click and on Escape, because a panel that only closes\n  // by clicking the same button again is a panel people leave open.\n  function setOpen(open){\n    menu.hidden = !open;\n    btn.setAttribute('aria-expanded', String(open));\n  }\n  btn.addEventListener('click', function(e){ e.stopPropagation(); setOpen(menu.hidden); });\n  menu.addEventListener('click', function(e){ e.stopPropagation(); });\n  document.addEventListener('click', function(){ setOpen(false); });\n  document.addEventListener('keydown', function(e){\n    if (e.key === 'Escape' && !menu.hidden){ setOpen(false); btn.focus(); }\n  });\n  // The OS flipping light/dark only matters while nothing more specific is set.\n  if (window.matchMedia){\n    var mq = window.matchMedia('(prefers-color-scheme: dark)');\n    var onOs = function(){ render(); changed(); };\n    if (mq.addEventListener) mq.addEventListener('change', onOs);\n    else if (mq.addListener) mq.addListener(onOs);\n  }\n}\n\n/* The developer tier of a Formula panel: one line per generated fact, with its\n   evidence tier, source file and last-checked date. Read from\n   window.AWOO_FACTS_META, which build.mjs writes from the same data/ entries\n   it generates the functions from — so this list cannot disagree with the\n   code the page actually runs. Returns <li> markup; the caller wraps it in a\n   list marked data-dev-only. */\nfunction esc(v){ return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }\nfunction sources(names){\n  var meta = window.AWOO_FACTS_META || {};\n  var keys = names || Object.keys(meta);\n  if (!keys.length) return '<li>This copy was opened without the generated facts block.</li>';\n  return keys.filter(function(k){ return meta[k]; }).map(function(k){\n    var m = meta[k];\n    return '<li><span class=\"devpill\">' + esc(m.confidence) + '</span> <code>' + esc(m.file) +\n      '</code> &middot; <code>' + esc(m.fact) + '</code>' +\n      (m.checked ? ' &middot; checked ' + esc(m.checked) : '') + '</li>';\n  }).join('');\n}\n\nwindow.AWOO_TOOL_SETTINGS = {\n  mount: mount,\n  // Number presentation, the same for every tool (see NUMBER PRESENTATION).\n  num: { mode:numMode, localeKey:numLocaleKey, localeTag:numLocaleTag,\n         fmt:fmtNum, int:fmtInt, dec:fmtDec, pct:fmtPct, parse:parseNum,\n         read:readNum, show:showNum, enhance:enhanceAll,\n         // A tool that stored its own override before this layer carried one\n         // hands it over once; an override already set here wins.\n         adopt:function(mode, locale){\n           var any = false;\n           if (!local.numMode && NUM_MODES.indexOf(mode) >= 0){ local.numMode = mode; any = true; }\n           if (!local.numLocale && Object.prototype.hasOwnProperty.call(LOCALE_MAP, locale)){ local.numLocale = locale; any = true; }\n           if (any) persist();\n         },\n         // Test seam.\n         _set:function(mode, locale){ local.numMode = mode || null; local.numLocale = locale || null; } },\n  sources: sources,\n  onChange: function(fn){ if (typeof fn === 'function') listeners.push(fn); },\n  theme: resolveTheme,\n  devOn: devOn,\n  themes: THEMES.slice(),\n  // Test seam: the resolution rules, callable without a DOM round-trip.\n  _resolve: function(localTheme, inheritedTheme){\n    var pl = local.theme, pa = window.AWOO_APPEARANCE;\n    local.theme = localTheme || null;\n    window.AWOO_APPEARANCE = inheritedTheme ? { theme:inheritedTheme } : undefined;\n    try { return resolveTheme(); } finally { local.theme = pl; window.AWOO_APPEARANCE = pa; }\n  },\n  _fonts: { text:FONT_TEXT, num:FONT_NUM }\n};\n})();\n\n</script>\n<script>\n/* ===========================================================================\n   AWOO+ TOOL SYNC — the profile, the four field states, the Live/Standard\n   switch and the one tooltip every tool shares (2026-09-23).\n\n   Hand-written. Injected by userscripts/build.mjs at <!-- @AWOO_TOOL_SETTINGS@ -->\n   right after tool-settings.js, so a tool that takes the gear menu takes this\n   too. NO-PROVENANCE: it moves the player's observations around and reads no\n   game fact; every formula stays in the tool that uses it.\n\n   WHERE THE PROFILE COMES FROM. A tool opens in its own tab, but that tab has\n   the game's origin (a blob URL), so the BroadcastChannel Core already speaks\n   ('awoo-profile') reaches it:\n     - window.AWOO_INITIAL_PROFILE: what Core handed over at open time, when\n       the tool's .release.json asks for it (prefill: [\"profile\"]);\n     - PROFILE_DELTA (Core v16, REGISTER.md R92): what each capture changed,\n       or saw again, section by section, merged here by observedAt exactly as\n       Core merges it between tabs (mergeDelta below);\n     - PROFILE_UPDATED: a whole profile. Every capture posted one up to Core\n       v15; v16 posts one only in answer to REQUEST_PROFILE_SYNC;\n     - REQUEST_PROFILE_SYNC: \"Sync now\" asks the game tabs to capture now and\n       the leading one to read the sections this tool uses\n       (window.AWOO_TOOL_USES, handed over at open time like the profile;\n       absent, every section).\n   Opening a tool from AWOO+ also asks, once (Core's openTool). Opened\n   anywhere else (a file, a preview), nothing arrives, and the card says so\n   rather than pretending.\n\n   THE FOUR FIELD STATES (REGISTER.md R48; ARTIFACT_STYLE_GUIDE.md Part III).\n   Every bound input carries a light, visible without hovering:\n     synced       read from the profile, fresh               filled, success\n     stale        read from the profile, older than the window filled, accent\n     edited       you typed it; a sync never overwrites it    filled, info\n     unavailable  never observed; the box holds your figure   hollow\n   Hover explains; a click hands that one field back to the profile. \"Reset\n   inputs\" on the card hands every field back at once.\n\n   A SYNC APPLIES ITSELF to every field you have not edited. That replaced the\n   old \"detect, then press Apply\" flow on purpose: R48 (the maintainer's own\n   note) asks that syncs update the fields and never the ones you changed, and\n   the light is the visibility the Apply step used to provide.\n\n   AGE IS PER SECTION. A reading's age is profile.meta.observedAt[section],\n   stamped by Profile Sync only for sections that capture actually saw. A\n   profile from an older AWOO+ has no stamps; its readings show as stale with\n   the age \"unknown\", never as fresh (R49 found a tool falling back to \"now\").\n\n   LIVE / STANDARD. A tool may offer the switch. Live: the account as it is.\n   Standard: a documented reference setup for the parts of the answer that\n   depend on one account's luck (a pet's rolls, a party's make-up), so two\n   runs, or two players, compare like with like. What Standard swaps is the\n   TOOL's decision, stated in the tool; this file only holds the state and\n   hides whatever a page marks data-mode-only=\"live\" or \"standard\".\n   =========================================================================== */\n(function(){\n'use strict';\n\nvar root = document.documentElement;\nvar meta = document.querySelector('meta[name=\"awoo-tool\"]');\nvar TOOL = (meta && meta.getAttribute('content')) || 'tool';\nvar LS = 'awoo:tool:' + TOOL + ':sync';\nvar DEFAULT_STALE_MS = 6 * 60 * 60 * 1000;\nvar NO_ANSWER_MS = 4000;\n\nfunction settings(){ return window.AWOO_TOOL_SETTINGS || null; }\n\nvar saved = { edited:{}, mode:null };\ntry {\n  var raw = localStorage.getItem(LS);\n  if (raw){ var o = JSON.parse(raw); if (o && typeof o === 'object'){\n    if (o.edited && typeof o.edited === 'object') saved.edited = o.edited;\n    if (o.mode === 'live' || o.mode === 'standard') saved.mode = o.mode;\n  } }\n} catch(e){ /* storage blocked: nothing remembered, everything still works */ }\nfunction persist(){ try { localStorage.setItem(LS, JSON.stringify(saved)); } catch(e){ /* not durable */ } }\n\n/* ---------------------------------------------------------------- profile */\nvar profile = (window.AWOO_INITIAL_PROFILE && typeof window.AWOO_INITIAL_PROFILE === 'object') ? window.AWOO_INITIAL_PROFILE : null;\nvar connected = !!profile;           // has anything ever arrived?\nvar requestedAt = null;              // last \"Sync now\", for the no-answer state\nvar profileListeners = [];\n\nfunction setProfile(p){\n  if (!p || typeof p !== 'object') return;\n  profile = p; connected = true; requestedAt = null;\n  applyAll();\n  for (var i = 0; i < profileListeners.length; i++){ try { profileListeners[i](profile); } catch(e){ /* one page bug must not stop the others */ } }\n  renderCards();\n}\n\n// The sections this tool reads (its release.json `uses`), when whoever opened\n// it said (tool-shelf.js, or the module carrying it). Only names, never\n// guessed: absent, \"Sync now\" asks for everything, as it always did.\nvar USES = (function(){\n  var u = window.AWOO_TOOL_USES;\n  if (!u || typeof u.length !== 'number') return null;\n  var out = [];\n  for (var i = 0; i < u.length; i++) if (typeof u[i] === 'string' && u[i] && out.indexOf(u[i]) < 0) out.push(u[i]);\n  return out.length ? out : null;\n})();\n\n/* MERGING WHAT ARRIVES (REGISTER.md R92). The same rule as Core's own\n   mergeBySection between tabs (core.js), so a tool never believes anything\n   the game tab would not:\n     - another character's message is ignored (ids when both carry one, else\n       names): a tab on your other character is not news about this one;\n     - per section, the newer observedAt wins; a reading whose age is known\n       beats one whose age is not; a section arriving with no stamp only\n       fills a hole; a section absent, or null with no stamp, is \"not\n       observed\" and never erases what is here;\n     - meta: queryAt and the timestamp take the latest; the rest (name,\n       level, ids) comes from the newer message, and a null never erases a\n       name or an id.\n   A whole PROFILE_UPDATED goes through the same merge, since the tab that\n   answers a \"Sync now\" may hold an older copy of a section than a delta\n   already brought; one for ANOTHER character replaces the profile, because\n   Core only answers with its own, current, character (you switched). */\nvar META_KEEP = { characterId:1, characterName:1, characterLevel:1 };\nfunction num(v){ return (typeof v === 'number' && isFinite(v)) ? v : null; }\nfunction who(meta, k){ var v = meta ? meta[k] : null; return (typeof v === 'string' && v) ? v : null; }\nfunction sameCharacter(a, b){\n  var ia = who(a, 'characterId'), ib = who(b, 'characterId');\n  if (ia && ib) return ia === ib;\n  var na = who(a, 'characterName'), nb = who(b, 'characterName');\n  if (na && nb) return na === nb;\n  return true;\n}\nfunction copy(o){ var out = {}; if (o && typeof o === 'object') for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) out[k] = o[k]; return out; }\n// base: the profile held; sections/meta: what arrived (meta carries the\n// observedAt/observedOn/queryAt maps). Returns a new profile.\nfunction mergeInto(base, sections, meta, schemaVersion){\n  var bm = (base && base.meta) || {};\n  var bSeen = bm.observedAt || {}, iSeen = meta.observedAt || {};\n  var bOn = bm.observedOn || {}, iOn = meta.observedOn || {};\n  var out = copy(base);\n  if (out.schemaVersion === undefined && schemaVersion !== undefined) out.schemaVersion = schemaVersion;\n  var seen = copy(bSeen), on = copy(bOn);\n  for (var k in sections){\n    if (!Object.prototype.hasOwnProperty.call(sections, k) || k === 'meta' || k === 'schemaVersion') continue;\n    var v = sections[k], is = num(iSeen[k]), bs = num(bSeen[k]), b = out[k];\n    var take;\n    if (v === undefined || (v === null && is === null)) take = false;\n    else if (is !== null && bs !== null) take = is > bs;\n    else if (is !== null || bs !== null) take = is !== null;\n    else take = b === undefined || b === null;\n    if (!take) continue;\n    out[k] = v;\n    if (is !== null) seen[k] = is;\n    if (iOn[k] != null) on[k] = iOn[k];\n  }\n  var m = copy(bm);\n  var newer = (num(meta.timestamp) || 0) > (num(bm.timestamp) || 0);\n  for (var f in meta){\n    if (!Object.prototype.hasOwnProperty.call(meta, f)) continue;\n    if (f === 'observedAt' || f === 'observedOn' || f === 'queryAt' || f === 'timestamp') continue;\n    var mv = meta[f];\n    if (mv === undefined) continue;\n    if (mv === null && META_KEEP[f] && m[f] != null) continue;\n    if (newer || m[f] === undefined || (m[f] === null && META_KEEP[f])) m[f] = mv;\n  }\n  var ts = Math.max(num(bm.timestamp) || 0, num(meta.timestamp) || 0);\n  if (ts) m.timestamp = ts;\n  m.observedAt = seen;\n  m.observedOn = on;\n  var qa = copy(bm.queryAt), iq = meta.queryAt || {};\n  for (var q in iq) if (num(iq[q]) !== null && !(num(qa[q]) >= iq[q])) qa[q] = iq[q];\n  m.queryAt = qa;\n  out.meta = m;\n  return out;\n}\n// PROFILE_DELTA v1 (core.js postProfileNow): { characterId, characterName,\n// sections, observedAt, observedOn, meta, queryAt?, schemaVersion? }.\nfunction mergeDelta(d){\n  var meta = copy(d.meta);\n  if (typeof d.characterId === 'string' && d.characterId) meta.characterId = d.characterId;\n  if (typeof d.characterName === 'string' && d.characterName) meta.characterName = d.characterName;\n  meta.observedAt = (d.observedAt && typeof d.observedAt === 'object') ? d.observedAt : {};\n  meta.observedOn = (d.observedOn && typeof d.observedOn === 'object') ? d.observedOn : {};\n  if (d.queryAt && typeof d.queryAt === 'object') meta.queryAt = d.queryAt;\n  if (profile && !sameCharacter(profile.meta, meta)) return;\n  setProfile(mergeInto(profile, (d.sections && typeof d.sections === 'object') ? d.sections : {}, meta, d.schemaVersion));\n}\nfunction mergeWhole(p){\n  if (!profile || !sameCharacter(profile.meta, p.meta)) { setProfile(p); return; }\n  var meta = copy(p.meta);\n  setProfile(mergeInto(profile, p, meta, p.schemaVersion));\n}\n\nvar bc = null;\ntry {\n  if (typeof BroadcastChannel !== 'undefined'){\n    bc = new BroadcastChannel('awoo-profile');\n    bc.onmessage = function(ev){\n      var d = ev && ev.data;\n      if (!d || typeof d !== 'object') return;\n      if (d.type === 'PROFILE_DELTA' && d.v === 1) mergeDelta(d);\n      else if (d.type === 'PROFILE_UPDATED' && d.profile && typeof d.profile === 'object') mergeWhole(d.profile);\n    };\n  }\n} catch(e){ bc = null; }\n\nfunction request(){\n  requestedAt = Date.now();\n  var msg = { type:'REQUEST_PROFILE_SYNC', timestamp:requestedAt };\n  if (USES) msg.sections = USES.slice();\n  if (bc){ try { bc.postMessage(msg); } catch(e){ /* closed */ } }\n  renderCards();\n  setTimeout(renderCards, NO_ANSWER_MS + 50);\n}\n\n// A dotted path into the profile; null for anything absent. Never 0.\nfunction get(path, p){\n  var cur = p || profile;\n  if (!cur || !path) return null;\n  var parts = String(path).split('.');\n  for (var i = 0; i < parts.length; i++){\n    if (cur == null || typeof cur !== 'object') return null;\n    cur = cur[parts[i]];\n  }\n  return cur === undefined ? null : cur;\n}\nfunction sectionAge(section){\n  var at = get('meta.observedAt.' + section);\n  return (typeof at === 'number' && isFinite(at)) ? at : null;\n}\n\n/* ----------------------------------------------------------------- fields */\nvar fields = [];\nvar byKey = {};\nvar applyListeners = [];\nvar applying = false;\n\n// f.local: the field reads a source of the page's own (another module's\n// handover) and is read even before any profile arrives; f.observedAt()\n// then dates it.\nfunction readField(f){\n  if (!profile && !f.local) return null;\n  var v;\n  try { v = typeof f.read === 'function' ? f.read(profile, get) : get(f.read); } catch(e){ v = null; }\n  if (v === undefined || v === null) return null;\n  if (typeof v === 'number' && !isFinite(v)) return null;\n  return v;\n}\nfunction modeAllows(f){ return !f.modes || f.modes.indexOf(mode()) >= 0; }\n\nfunction state(f){\n  if (saved.edited[f.key]) return 'edited';\n  var v = readField(f);\n  if (v === null) return 'unavailable';\n  var at = fieldAge(f);\n  if (at === null) return 'stale';\n  return (Date.now() - at) > (f.staleMs || DEFAULT_STALE_MS) ? 'stale' : 'synced';\n}\nfunction fieldAge(f){\n  if (typeof f.observedAt === 'function'){ var t = f.observedAt(profile); if (typeof t === 'number' && isFinite(t)) return t; }\n  return sectionAge(f.section || String(f.read).split('.')[0]);\n}\nfunction ago(at){\n  if (at === null) return 'unknown';\n  var s = Math.max(0, Math.round((Date.now() - at) / 1000));\n  if (s < 60) return s + 's';\n  var m = Math.round(s / 60); if (m < 60) return m + 'm';\n  var h = Math.round(m / 60); if (h < 48) return h + 'h';\n  return Math.round(h / 24) + 'd';\n}\nvar STATE_TIP = {\n  synced: 'Synced from the game. Click to re-sync.',\n  stale: 'Synced, but old. Click to re-sync.',\n  edited: 'Typed by you; a sync keeps it. Click to sync it again.',\n  unavailable: 'Not synced yet. This is your own figure.'\n};\nfunction lightTip(f, st){\n  var t = (st === 'unavailable' && f.unavailableTip) ? f.unavailableTip : STATE_TIP[st];\n  if (st === 'synced' || st === 'stale') t += ' (' + ago(fieldAge(f)) + ' old)';\n  if (f.source && (st === 'synced' || st === 'stale')){ var src = f.source(profile); if (src) t += ' From ' + src + '.'; }\n  if (!modeAllows(f)) t = 'Not used in ' + (mode() === 'standard' ? 'Standard' : 'Live') + ' mode.';\n  return t;\n}\nfunction devTip(f){\n  return 'Profile: ' + (f.path || (typeof f.read === 'string' ? f.read : f.key));\n}\n\nfunction setInput(f, v){\n  var el = f.el;\n  applying = true;\n  try {\n    var S = settings();\n    if (el.type === 'checkbox') el.checked = !!v;\n    else if (f.fmt) el.value = f.fmt(v);\n    else if (el.hasAttribute('data-num') && typeof v === 'number' && S && S.num) S.num.show(el, v);\n    else el.value = String(v);\n  } finally { applying = false; }\n}\nfunction renderLight(f){\n  if (!f.light) return;\n  var st = state(f);\n  f.light.setAttribute('data-state', st);\n  f.light.setAttribute('data-off', modeAllows(f) ? 'false' : 'true');\n  f.light.setAttribute('data-tip', lightTip(f, st));\n  f.light.setAttribute('data-tip-dev', devTip(f));\n  f.light.setAttribute('aria-label', 'Sync: ' + st);\n}\nfunction applyOne(f){\n  if (saved.edited[f.key] || !modeAllows(f)) return false;\n  var v = readField(f);\n  if (v === null) return false;\n  setInput(f, v);\n  return true;\n}\nfunction notifyApplied(){\n  for (var i = 0; i < applyListeners.length; i++){ try { applyListeners[i](); } catch(e){ /* keep going */ } }\n}\nfunction applyAll(){\n  var any = false;\n  for (var i = 0; i < fields.length; i++) any = applyOne(fields[i]) || any;\n  for (var j = 0; j < fields.length; j++) renderLight(fields[j]);\n  if (any) notifyApplied();\n  return any;\n}\n\nfunction labelFor(el){\n  if (el.id){ var l = document.querySelector('label[for=\"' + el.id + '\"]'); if (l) return l; }\n  return el.closest ? el.closest('label') : null;\n}\n\n/* bind(def) — def: { key, el, read: 'dotted.path' | function(profile, get),\n   section?, fmt?, staleMs?, modes?: ['live'] , label? }. Returns the field. */\nfunction bind(def){\n  if (!def || !def.el || !def.key) return null;\n  if (byKey[def.key]) return byKey[def.key];\n  var f = def;\n  if (!f.path && typeof f.read === 'string') f.path = f.read;\n  var host = f.label || labelFor(f.el);\n  var light = document.createElement('button');\n  light.type = 'button';\n  light.className = 'awoo-light';\n  if (host) host.insertBefore(light, host.firstChild);\n  f.light = light;\n  light.addEventListener('click', function(e){\n    e.preventDefault(); e.stopPropagation();\n    delete saved.edited[f.key]; persist();\n    if (!connected) request();\n    if (applyOne(f)) notifyApplied();\n    renderLight(f); renderCards();\n  });\n  var onEdit = function(){\n    if (applying) return;\n    saved.edited[f.key] = true; persist();\n    renderLight(f); renderCards();\n  };\n  f.el.addEventListener('input', onEdit);\n  f.el.addEventListener('change', onEdit);\n  fields.push(f); byKey[f.key] = f;\n  applyOne(f);\n  renderLight(f);\n  return f;\n}\nfunction resetAll(){\n  for (var x = 0; x < extensions.length; x++){ try { if (extensions[x].reset) extensions[x].reset(); } catch(e){ /* keep going */ } }\n  saved.edited = {}; persist();\n  if (!connected) request();\n  applyAll();\n  for (var j = 0; j < fields.length; j++) renderLight(fields[j]);\n  notifyApplied();\n  renderCards();\n}\n\n/* ------------------------------------------------------------------- mode */\nvar modeListeners = [];\nvar modeOffered = false;\nfunction mode(){ return modeOffered ? (saved.mode || 'live') : 'live'; }\nfunction setMode(m){\n  if (m !== 'live' && m !== 'standard') return;\n  saved.mode = m; persist();\n  root.setAttribute('data-sync-mode', mode());\n  applyAll();\n  for (var i = 0; i < modeListeners.length; i++){ try { modeListeners[i](mode()); } catch(e){ /* keep going */ } }\n  for (var j = 0; j < fields.length; j++) renderLight(fields[j]);\n  renderCards();\n}\n\n/* ------------------------------------------------------------------- card */\nvar cards = [];\nfunction el(tag, attrs, text){\n  var n = document.createElement(tag);\n  for (var k in attrs) n.setAttribute(k, attrs[k]);\n  if (text != null) n.textContent = text;\n  return n;\n}\n// A tool that keeps its own per-field state (Cost Tables re-renders its inputs\n// per subject, so it cannot bind a lasting element) reports through this: its\n// counts join the card, and the card's Reset reaches it.\nvar extensions = [];\nfunction summary(){\n  var total = 0, synced = 0, stale = 0, edited = 0;\n  for (var x = 0; x < extensions.length; x++){\n    var e = extensions[x].summary ? extensions[x].summary() : null;\n    if (e){ total += e.total || 0; synced += e.synced || 0; stale += e.stale || 0; edited += e.edited || 0; }\n  }\n  for (var i = 0; i < fields.length; i++){\n    if (!modeAllows(fields[i])) continue;\n    total++;\n    var st = state(fields[i]);\n    if (st === 'synced') synced++; else if (st === 'stale') stale++; else if (st === 'edited') edited++;\n  }\n  return { total:total, synced:synced, stale:stale, edited:edited };\n}\nfunction renderCards(){\n  for (var i = 0; i < cards.length; i++) renderCard(cards[i]);\n}\nfunction renderCard(c){\n  var s = summary();\n  var st, label, tip;\n  if (connected || s.synced || s.stale){\n    st = s.synced ? 'synced' : (s.stale ? 'stale' : 'unavailable');\n    label = s.synced || s.stale ? 'Synced' : 'Connected';\n    tip = 'Fields follow the game tab. ' + (s.synced + s.stale) + ' of ' + s.total + ' read' +\n      (s.edited ? ', ' + s.edited + ' typed by you' : '') + '.';\n  } else if (requestedAt && Date.now() - requestedAt < NO_ANSWER_MS){\n    st = 'stale'; label = 'Asking the game…'; tip = 'Waiting for an open Queslar tab to answer.';\n  } else if (requestedAt){\n    st = 'unavailable'; label = 'No game tab'; tip = 'No Queslar tab with AWOO+ answered. Open the game in this browser, then Sync.';\n  } else {\n    st = 'unavailable'; label = 'Not synced'; tip = 'Open this tool from AWOO+ in the game, or keep the game open and press Sync.';\n  }\n  c.box.setAttribute('data-state', st);\n  c.light.setAttribute('data-state', st);\n  c.state.textContent = label;\n  c.state.setAttribute('data-tip', tip);\n  var at = get('meta.timestamp');\n  c.age.textContent = (connected || s.synced || s.stale) ? (s.total ? (s.synced + s.stale) + '/' + s.total : '') + (at ? ' · ' + ago(at) : '') : '';\n  c.reset.disabled = !s.edited;\n  if (c.seg){\n    var m = mode();\n    c.seg.live.setAttribute('aria-pressed', String(m === 'live'));\n    c.seg.standard.setAttribute('aria-pressed', String(m === 'standard'));\n  }\n}\n/* card(host, { modes?: { live:tip, standard:tip } }) */\nfunction card(host, opts){\n  if (!host) return;\n  opts = opts || {};\n  host.textContent = '';\n  var box = el('div', { 'class':'awoo-sync', 'data-state':'unavailable' });\n  var head = el('div', { 'class':'awoo-sync-head' });\n  var light = el('span', { 'class':'awoo-light', 'data-state':'unavailable', 'aria-hidden':'true' });\n  var stEl = el('span', { 'class':'awoo-sync-state' });\n  var age = el('span', { 'class':'awoo-sync-age' });\n  head.appendChild(light); head.appendChild(stEl); head.appendChild(age);\n  box.appendChild(head);\n  var c = { box:box, light:light, state:stEl, age:age };\n  if (opts.modes){\n    modeOffered = true;\n    root.setAttribute('data-sync-mode', mode());\n    var seg = el('div', { 'class':'awoo-seg', role:'group', 'aria-label':'Mode' });\n    var live = el('button', { type:'button', 'data-tip':opts.modes.live || 'Your account, as synced.' }, 'Live');\n    var std = el('button', { type:'button', 'data-tip':opts.modes.standard || 'A fixed reference setup, for fair comparisons.' }, 'Standard');\n    live.addEventListener('click', function(){ setMode('live'); });\n    std.addEventListener('click', function(){ setMode('standard'); });\n    seg.appendChild(live); seg.appendChild(std);\n    box.appendChild(seg);\n    c.seg = { live:live, standard:std };\n  }\n  var actions = el('div', { 'class':'awoo-sync-actions' });\n  var syncBtn = el('button', { type:'button', 'class':'awoo-btn awoo-btn-primary', 'data-tip':'Ask the open game tab for a fresh reading.' }, 'Sync');\n  var reset = el('button', { type:'button', 'class':'awoo-btn', 'data-tip':'Hand every field you typed back to the game.' }, 'Reset inputs');\n  syncBtn.addEventListener('click', request);\n  reset.addEventListener('click', resetAll);\n  actions.appendChild(syncBtn); actions.appendChild(reset);\n  box.appendChild(actions);\n  c.reset = reset;\n  host.appendChild(box);\n  cards.push(c);\n  renderCard(c);\n  return c;\n}\n// Ages and staleness move with the clock, not only with events.\nsetInterval(function(){ renderCards(); for (var j = 0; j < fields.length; j++) renderLight(fields[j]); }, 30000);\n\n// One quiet request on load when Core handed nothing over: an already-open\n// game tab answers within a moment, and the card says so when none does.\nsetTimeout(function(){ if (!connected && bc) request(); }, 300);\n\n/* ---------------------------------------------------------------- tooltip */\n// ONE fixed-position element on <body> (the Core lesson, DESIGN.md: a\n// pseudo-element or an absolutely-positioned child is clipped by scroll\n// containers and inherits an ancestor's opacity). data-tip is for the\n// player; data-tip-dev is appended only with \"Show developer info\" on, in\n// the --dev tint (R67).\nvar tipEl = null, tipFor = null;\nfunction ensureTip(){\n  if (tipEl || !document.body) return tipEl;\n  tipEl = document.createElement('div');\n  tipEl.id = 'awooTip';\n  tipEl.setAttribute('role', 'tooltip');\n  document.body.appendChild(tipEl);\n  return tipEl;\n}\nfunction showTip(t){\n  var text = t.getAttribute('data-tip');\n  var s = settings();\n  var dev = s && s.devOn && s.devOn() ? t.getAttribute('data-tip-dev') : null;\n  if (!text && !dev) return;\n  var tip = ensureTip(); if (!tip) return;\n  tipFor = t;\n  tip.textContent = text || '';\n  if (dev){ var d = document.createElement('span'); d.className = 'awoo-tip-dev'; d.textContent = dev; tip.appendChild(d); }\n  tip.classList.add('on');\n  var r = t.getBoundingClientRect(), b = tip.getBoundingClientRect();\n  var left = Math.min(Math.max(8, r.left + r.width / 2 - b.width / 2), window.innerWidth - b.width - 8);\n  var top = r.top - b.height - 8;\n  if (top < 8) top = r.bottom + 8;\n  tip.style.left = Math.round(left) + 'px';\n  tip.style.top = Math.round(top) + 'px';\n}\nfunction hideTip(){ tipFor = null; if (tipEl) tipEl.classList.remove('on'); }\nfunction tipTarget(e){ return e.target && e.target.closest ? e.target.closest('[data-tip],[data-tip-dev]') : null; }\ndocument.addEventListener('mouseover', function(e){ var t = tipTarget(e); if (t) showTip(t); });\ndocument.addEventListener('mouseout', function(e){ var t = tipTarget(e); if (t && t === tipFor) hideTip(); });\ndocument.addEventListener('focusin', function(e){ var t = tipTarget(e); if (t) showTip(t); });\ndocument.addEventListener('focusout', hideTip);\nwindow.addEventListener('scroll', hideTip, true);\n\nwindow.AWOO_SYNC = {\n  profile: function(){ return profile; },\n  connected: function(){ return connected; },\n  get: get,\n  age: sectionAge,\n  onProfile: function(fn){ if (typeof fn === 'function') profileListeners.push(fn); },\n  onApply: function(fn){ if (typeof fn === 'function') applyListeners.push(fn); },\n  request: request,\n  bind: bind,\n  field: function(key){ return byKey[key] || null; },\n  state: function(key){ var f = byKey[key]; return f ? state(f) : null; },\n  isEdited: function(key){ return !!saved.edited[key]; },\n  resetAll: resetAll,\n  refresh: function(){ applyAll(); renderCards(); },\n  card: card,\n  extend: function(ext){ if (ext && typeof ext === 'object'){ extensions.push(ext); renderCards(); } },\n  renderCards: renderCards,\n  ago: ago,\n  mode: mode,\n  setMode: setMode,\n  onMode: function(fn){ if (typeof fn === 'function') modeListeners.push(fn); },\n  // Test seam: push a profile as if Core had broadcast it.\n  _receive: setProfile\n};\n})();\n\n</script>\n\n<style>\n*{box-sizing:border-box}\n[hidden]{display:none!important}\nbody{\n  margin:0; background:var(--ground); color:var(--ink);\n  font-family:var(--font-body); font-size:14px; line-height:1.5;\n  -webkit-font-smoothing:antialiased;\n}\nbutton,input,select{font-family:inherit;font-size:inherit;color:inherit}\n:focus-visible{outline:2px solid var(--brass-fill);outline-offset:2px;border-radius:3px}\n\n/* The title block and the gear live at the top of the sidebar, like every\n   other tool (2026-09-23; this page had its own top bar until then). */\n.btn{\n  background:var(--surface-2); border:1px solid var(--border-control);\n  border-radius:4px; padding:5px 11px; cursor:pointer;\n  font-size:.78rem; font-weight:600; letter-spacing:.02em;\n  transition:background .12s,border-color .12s;\n}\n.btn:hover{background:var(--surface-3);border-color:var(--brass-fill)}\n.btn.primary{background:var(--brass-fill);border-color:var(--brass-fill);color:var(--on-brass)}\n.btn.primary:hover{filter:brightness(1.07)}\n.btn.ghost{background:transparent}\n.btn.sm{padding:3px 8px;font-size:.72rem}\n\n/* --- shell ---------------------------------------------------------- */\n.shell{\n  max-width:1400px; margin:0 auto; padding:18px 20px 60px;\n  display:grid; grid-template-columns:288px minmax(0,1fr); gap:18px; align-items:start;\n}\n/* One column: the title, sync card and subject list first, as in every tool. */\n@media (max-width:1040px){\n  .shell{grid-template-columns:minmax(0,1fr)}\n}\n\n/* Pinned or not is the shared settings layer's call (tool-settings.js,\n   \"Sidebar scrolls on its own\"): by default the sidebar scrolls with the page\n   and is pinned only while it fits on screen. */\n.side{display:flex; flex-direction:column; gap:10px}\n.panel{\n  background:var(--surface); border:1px solid var(--border);\n  border-radius:6px; box-shadow:var(--shadow);\n}\n.panel > .ph{\n  font-family:var(--font-display); font-size:.7rem; font-weight:700;\n  letter-spacing:.09em; text-transform:uppercase; color:var(--ink-soft);\n  padding:7px var(--pad-panel); border-bottom:1px solid var(--border);\n  display:flex; align-items:center; gap:8px;\n}\n.panel .pb{padding:8px var(--pad-panel)}\n\n/* --- nav ------------------------------------------------------------ */\n.navgroup{padding:5px 0 4px}\n.navgroup + .navgroup{border-top:1px solid var(--border)}\n.navgroup h3{\n  margin:0 0 3px; padding:0 12px;\n  font-family:var(--font-head); font-size:.66rem; font-weight:600;\n  letter-spacing:.13em; text-transform:uppercase; color:var(--ink-mute);\n  display:flex; align-items:baseline; gap:6px;\n}\n/* The character level the group's system unlocks at. It is why the list is in\n   this order, so it may as well say so. */\n.navgroup h3 .gu{\n  margin-left:auto; font-family:var(--font-mono); font-size:.6rem;\n  letter-spacing:.02em; text-transform:none; color:var(--ink-mute); opacity:.8;\n}\n.ctl-inline{display:flex;align-items:center;gap:6px}\n.ctl-inline label{\n  font-size:.64rem;font-weight:600;letter-spacing:.09em;\n  text-transform:uppercase;color:var(--ink-mute);\n}\n.ctl-inline select{\n  background:var(--surface-2); border:1px solid var(--border-control);\n  border-radius:4px; padding:3px 6px; font-size:.74rem;\n}\n.navbtn{\n  display:flex; align-items:center; gap:8px; width:100%;\n  background:none; border:0; border-left:3px solid transparent;\n  padding:var(--nav-y) 12px var(--nav-y) 9px; text-align:left; cursor:pointer;\n  font-size:.79rem; color:var(--ink-soft); line-height:1.35;\n}\n.navbtn:hover{background:var(--surface-2);color:var(--ink)}\n.navbtn[aria-current=\"true\"]{\n  background:var(--bg-brass); border-left-color:var(--brass-fill);\n  color:var(--ink); font-weight:600;\n}\n.navbtn .nlv{\n  margin-left:auto; font-family:var(--font-mono); font-size:.7rem;\n  color:var(--ink-mute); font-variant-numeric:tabular-nums;\n}\n.navbtn[aria-current=\"true\"] .nlv{color:var(--brass)}\n\n/* --- options -------------------------------------------------------- */\n.optrow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:3px 0}\n.optrow label{font-size:.78rem;color:var(--ink-soft)}\n.switch{display:flex;border:1px solid var(--border-strong);border-radius:4px;overflow:hidden}\n.switch button{\n  background:var(--surface-2);border:0;padding:3px 9px;cursor:pointer;\n  font-size:.72rem;font-weight:600;color:var(--ink-mute);\n}\n.switch button + button{border-left:1px solid var(--border-strong)}\n.switch button[aria-pressed=\"true\"]{background:var(--brass-fill);color:var(--on-brass)}\n\n/* --- main system panel ---------------------------------------------- */\n.syshead{\n  display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap;\n  padding:11px 14px; border-bottom:1px solid var(--border);\n}\n.syshead h2{\n  font-family:var(--font-head); font-size:1.32rem; font-weight:600;\n  letter-spacing:.045em; text-transform:uppercase; margin:0; line-height:1.15;\n}\n.syshead .desc{flex-basis:100%;margin:0;font-size:.83rem;color:var(--ink-soft);max-width:72ch}\n.pill{\n  display:inline-flex;align-items:center;gap:5px;\n  font-family:var(--font-mono); font-size:.66rem; font-weight:600;\n  letter-spacing:.06em; padding:2px 7px; border-radius:3px;\n  background:var(--bg-steel); color:var(--steel); white-space:nowrap;\n}\n.pill.code{background:var(--bg-moss);color:var(--moss)}\n.pill.cross{background:var(--bg-brass);color:var(--brass-text)}\n.pill.live{background:var(--bg-moss);color:var(--moss)}\n.pill.open{background:var(--bg-violet);color:var(--violet)}\n.pill.cur{background:var(--bg-steel);color:var(--steel)}\n\n/* control strip */\n.controls{\n  display:flex; align-items:flex-end; gap:12px; flex-wrap:wrap;\n  padding:9px 14px; background:var(--surface-2); border-bottom:1px solid var(--border);\n}\n.field{display:flex;flex-direction:column;gap:3px}\n.field > .lab{\n  font-size:.66rem; font-weight:600; letter-spacing:.09em;\n  text-transform:uppercase; color:var(--ink-mute);\n  display:flex; align-items:center; gap:5px;\n}\n.field input, .field select{width:var(--ctl-w)}\n.field select{width:auto;min-width:112px}\n.field > .lab .awoo-light{margin:0}\n\n/* summary strip */\n.summary{\n  display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr));\n  gap:1px; background:var(--border); border-bottom:1px solid var(--border);\n}\n.stat{background:var(--surface);padding:8px 14px}\n.stat .k{\n  font-size:.64rem;font-weight:600;letter-spacing:.09em;text-transform:uppercase;\n  color:var(--ink-mute);display:block;margin-bottom:2px;\n}\n.stat .v{\n  font-family:var(--font-num); font-size:1.02rem; font-weight:600;\n  font-variant-numeric:tabular-nums; font-feature-settings:\"zero\" 0;\n  color:var(--ink); word-break:break-word;\n}\n.stat .v.accent{color:var(--brass)}\n.stat .u{font-size:.68rem;color:var(--ink-mute);font-weight:400;margin-left:3px}\n\n/* the rest of the bill, for systems that charge in more than one currency */\n.billstrip{\n  display:flex; align-items:center; gap:8px; flex-wrap:wrap;\n  padding:8px 16px; background:var(--surface-2); border-bottom:1px solid var(--border);\n}\n.billstrip .bk{\n  font-size:.64rem; font-weight:600; letter-spacing:.09em; text-transform:uppercase;\n  color:var(--ink-mute);\n}\n.billstrip .bv{\n  font-family:var(--font-mono); font-size:.76rem; font-variant-numeric:tabular-nums;\n  background:var(--surface); border:1px solid var(--border);\n  border-radius:3px; padding:1px 7px; color:var(--ink-soft);\n}\n\n/* table */\n.tablewrap{overflow-x:auto;overflow-y:auto}\ntable{border-collapse:collapse;width:100%;min-width:560px}\nthead th{\n  position:sticky; top:0; z-index:2; background:var(--surface-3);\n  font-family:var(--font-display); font-size:.64rem; font-weight:700;\n  letter-spacing:.08em; text-transform:uppercase; color:var(--ink-soft);\n  text-align:right; padding:5px var(--row-x); line-height:1.4;\n  border-bottom:1px solid var(--border-strong);\n  white-space:nowrap;\n}\nthead th:first-child{text-align:left}\nthead th .hsub{\n  display:block;font-family:var(--font-body);font-size:.64rem;\n  letter-spacing:.01em;text-transform:none;color:var(--ink-mute);font-weight:400;\n}\ntbody td{\n  padding:var(--row-y) var(--row-x); text-align:right;\n  border-bottom:1px solid var(--border);\n  font-family:var(--font-num); font-size:.8rem; line-height:1.7;\n  font-variant-numeric:tabular-nums;\n  white-space:nowrap;\n}\n/* Only the level itself is emphasised. Every figure bold made the whole table\n   read as bold, which is the same as none of it being emphasised. */\ntbody td:first-child{text-align:left;font-weight:600}\ntbody tr.past td{color:var(--ink-mute);background:var(--surface-2)}\n/* Fill treatment BC, settled 2026-09-21: the accent tint carries the state,\n   a SOFT edge gives it a shape. --accent-edge, never --accent-fill: a\n   full-strength ring reads as a frame around the row rather than emphasis on\n   it, which is exactly what it looked like at full strength. */\n/* The tint already says \"you are here\"; bolding every figure in the row on top\n   of it is the third signal for one fact. Only the level stays bold. */\ntbody tr.current td{\n  background:var(--bg-accent);\n  border-top:1px solid var(--accent-edge); border-bottom:1px solid var(--accent-edge);\n}\ntbody tr.current td:first-child{font-weight:700}\ntbody tr.current td:first-child::after{\n  content:'YOU'; margin-left:8px; font-family:var(--font-body);\n  font-size:.6rem; letter-spacing:.09em; color:var(--brass-text);\n  background:var(--surface); padding:1px 5px; border-radius:3px; font-weight:600;\n}\ntbody tr.target td{\n  background:var(--bg-success);\n  border-top:1px solid var(--accent-edge); border-bottom:1px solid var(--accent-edge);\n}\ntbody tr.target td:first-child{font-weight:700}\ntbody tr.target td:first-child::after{\n  content:'TARGET'; margin-left:8px; font-family:var(--font-body);\n  font-size:.6rem; letter-spacing:.09em; color:var(--moss);\n  background:var(--surface); padding:1px 5px; border-radius:3px; font-weight:600;\n}\ntbody tr:hover td{background:var(--surface-3)}\ntbody tr.current:hover td{background:var(--bg-brass)}\ntbody tr.target:hover td{background:var(--bg-moss)}\ntbody td.dash{color:var(--ink-mute)}\ntbody tr.bp td{background:var(--bg-info);border-top:1px solid var(--info)}\ntbody tr.bp:hover td{background:var(--bg-violet)}\ntbody td .bpnote{\n  font-family:var(--font-body);font-size:.6rem;letter-spacing:.06em;\n  color:var(--violet);margin-left:8px;text-transform:uppercase;font-weight:600;\n  border-bottom:1px dotted currentColor;cursor:help;\n}\n\n/* BREAKPOINTS (2026-09-23): every place the formula changes shape, listed\n   above the table whatever the step, with what changes there. Click one to\n   make it the target. */\n.bpstrip{\n  display:flex; align-items:center; gap:6px; flex-wrap:wrap;\n  padding:8px 14px; border-bottom:1px solid var(--border); background:var(--surface);\n}\n.bpstrip .bk{font-size:.64rem;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-mute);margin-right:2px}\n.bpchip{\n  display:inline-flex; align-items:baseline; gap:5px; cursor:pointer;\n  font-size:.72rem; color:var(--ink-soft); background:var(--bg-info);\n  border:1px solid color-mix(in srgb,var(--info) 35%,transparent); border-radius:4px; padding:2px 7px;\n}\n.bpchip b{font-family:var(--font-num);font-variant-numeric:tabular-nums;color:var(--info);font-weight:700}\n.bpchip:hover{border-color:var(--info);color:var(--ink)}\n.bpchip.passed{background:var(--surface-2);border-color:var(--border);opacity:.7}\n.bpchip.passed b{color:var(--ink-mute)}\n.bpnone{font-size:.72rem;color:var(--ink-mute)}\n\n.rowctl{\n  display:flex; align-items:center; justify-content:flex-end; gap:8px; flex-wrap:wrap;\n  padding:7px 14px; border-top:1px solid var(--border); background:var(--surface-2);\n}\n.rowctl .hint{margin-right:auto;font-size:.72rem;color:var(--ink-mute)}\n.rowctl input{width:64px}\n.rowctl label{font-size:.72rem;color:var(--ink-soft)}\n\n/* notes */\ndetails.notes{border-top:1px solid var(--border)}\ndetails.notes > summary{\n  cursor:pointer; padding:9px 16px; list-style:none;\n  font-family:var(--font-head); font-size:.72rem; font-weight:600;\n  letter-spacing:.1em; text-transform:uppercase; color:var(--ink-soft);\n  display:flex; align-items:center; gap:8px;\n}\ndetails.notes > summary::-webkit-details-marker{display:none}\ndetails.notes > summary::before{content:'▸';color:var(--brass);font-size:.8rem}\ndetails.notes[open] > summary::before{content:'▾'}\n.notebody{padding:0 16px 14px;font-size:.82rem;color:var(--ink-soft);max-width:82ch}\n.notebody p{margin:.5em 0}\n.notebody code, .formula{\n  font-family:var(--font-mono);font-size:.78rem;\n  background:var(--surface-3);padding:1px 5px;border-radius:3px;color:var(--ink);\n}\n.formula{display:block;padding:8px 11px;margin:.6em 0;white-space:pre-wrap;line-height:1.55;border-left:2px solid var(--brass-fill)}\n.srcline{\n  display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;padding-top:9px;\n  border-top:1px dashed var(--border);\n}\n.srcline .pill{background:var(--surface-3);color:var(--ink-mute)}\n\n/* Tooltips are the shared kit's (tool-sync.js): one fixed element, never\n   clipped by the table's scroll box. .tip only marks what has one. */\n.tip{cursor:help;border-bottom:1px dotted var(--ink-mute)}\n.banner{\n  display:flex;gap:9px;align-items:flex-start;\n  padding:9px 12px;border-radius:5px;font-size:.78rem;line-height:1.45;\n  background:var(--bg-violet); color:var(--ink); border:1px solid var(--violet);\n}\n.banner.warn{background:var(--bg-ember);border-color:var(--ember)}\n.banner b{font-weight:700}\n.foot{\n  max-width:1400px;margin:0 auto;padding:0 20px 40px;\n  font-size:.74rem;color:var(--ink-mute);line-height:1.6;\n}\n/* Standing default 5: one control that grows the table to the viewport,\n   not a drag handle and not incremental steps. */\n.expandbtn{margin-left:auto}\n\n/* v4 baseline: back-to-top, shown only once scrolled AND collapsed to one\n   column — on the wide sticky-sidebar layout the inputs never leave the\n   screen, so it would be redundant chrome. */\n#backTop{\n  position:fixed; right:18px; bottom:calc(18px + env(safe-area-inset-bottom,0px));\n  z-index:40; width:40px; height:40px; border-radius:50%;\n  background:var(--brass-fill); color:var(--on-brass);\n  border:1px solid var(--brass); box-shadow:var(--shadow);\n  font-size:1.05rem; line-height:1; cursor:pointer;\n}\n#backTop[hidden]{display:none!important}\n\n@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}\n</style>\n\n<script>\n/* Helpers the generated facts below call but do not define. `triangular` is\n   the shared arithmetic-series cost primitive (village strengths, relic\n   boosts, cave tools, sculptures all use it); `geomCost` is the geometric one\n   (village buildings and the village boss). Both are quoted from\n   engine/costs/primitives.js, and both are on window deliberately: the facts\n   are emitted into their own IIFE and resolve these through global scope,\n   exactly as those facts' own comments assume. */\n/* Function DECLARATIONS, not window assignments: an emitted fact resolves\n   `triangular` as a bare identifier, and a declaration in a classic script is\n   a real global binding in every environment, where `window.x = ...` only\n   happens to be one in a browser. Also mirrored onto window for the page's\n   own use. */\nfunction triangular(a, b, mult) { return ((a + b) * (b - a) * mult) / 2; }\nfunction geomCost(currentLevel, newLevel, base, ratio) {\n  ratio = ratio || 1.15;\n  var start = currentLevel + 1, count = newLevel - currentLevel;\n  return Math.round((base * Math.pow(ratio, start) * (Math.pow(ratio, count) - 1)) / (ratio - 1));\n}\nwindow.triangular = triangular;\nwindow.geomCost = geomCost;\n</script>\n\n<script>\n/* GENERATED from data/ by userscripts/build.mjs — do not edit. */\nwindow.AWOO_FACTS = (function () {\n  /* tables/sanctum-nodes.json :: sanctumNodes.formula.status  [CROSS] */\n  function sanctumNodeCost(currentLevel, newLevel) { const RATE = 125000, EXP = 5; let total = 0; for (let n = currentLevel + 1; n <= newLevel; n++) { total += RATE * Math.pow(n, EXP) + n * RATE * 100; } return { currency: 'gold', value: total }; } // costTable's per-node figures = round(sanctumNodeCost(n-1, n).value / 1e9), i.e. the table is in BILLIONS of gold, rounded\n  /* formulas/pets.json :: pets.slotUpgrade.costFormula  [CODE] */\n  function petSlotUpgradeCost(currentLevel, newLevel) { let total = 0; for (let r = currentLevel + 1; r <= newLevel; r++) total += r <= 150 ? Math.floor(500000 * r**3) : Math.floor(500000 * 150**3 * (r/150)**15); return { currency: 'gold', value: total }; } // per-level marginal cost at level L->L+1: floor(500000*(L+1)^3) while L+1<=150, else floor(500000*150^3*((L+1)/150)^15). Exactly continuous at the seam: both branches evaluate to floor(500000*150^3) = 1,687,500,000,000 at r=150.\n  /* formulas/equipment.json :: equipment.slotUpgrade.costFormula  [CODE] */\n  function slotUpgradeCost(currentLevel, newLevel) { let ratio = 1.1; let count = newLevel - currentLevel; if (count <= 0) return 0; let cost = Math.round(250 * ratio**(currentLevel+1) * (ratio**count - 1) / (ratio - 1)); return { meat: cost, iron: cost, wood: cost, stone: cost }; }\n  /* formulas/leveling.json :: leveling.genericExpRequired.formula  [CODE] */\n  function expRequired(level, type) { if (type === 'sanctum') level += 500; if (level < 10) return level * 150; if (level < 20) return level * 250; if (level < 40) return level * 400; if (level < 50) return level * 600; if (level < 100 || type === 'crafting') return level * 1000; let base = 20000 * Math.sqrt(level); if (level <= 500) return Math.round(base); let n = level - 500; let extra = 2500 * n**1.25; if (level > 10000) { n = level - 10000; extra += 100000 * n**1.4; } return Math.round(base + extra); }\n  /* formulas/partners.json :: partner.level.expFormula  [CODE] */\n  function partnerLevelExp(level) { if (level < 10) return level * 150; if (level < 20) return level * 200; if (level < 40) return level * 300; if (level < 50) return level * 400; let base = Math.round(25000 * level**0.5); if (level <= 1500) return Math.round(base); let n = level - 1500; let extra = 250 * n**1.25; if (level > 6000) { n = level - 6000; extra += 2500 * n**1.4; } return Math.round(base + extra); }\n  /* formulas/partners.json :: partner.boostUpgradeCost.formula  [CODE] */\n  function partnerBoostUpgradeCost(currentLevel, targetLevel) { const tri = (a, b, mult) => (a + b) * (b - a) / 2 * mult; if (targetLevel < 10) return tri(currentLevel, targetLevel, 150); let total = tri(Math.max(currentLevel - 9, 0), Math.max(targetLevel - 9, 1), 15000); const brackets = [[1000, 10000], [2000, 100000], [3500, 500000]]; for (const [threshold, mult] of brackets) { const a = Math.max(currentLevel, threshold), b = Math.max(targetLevel, threshold); if (a <= b) total += tri(a, b, mult); } return { currency: 'gold', value: total }; }\n  /* formulas/relic-boosts.json :: relicBoost.bracketSurcharge  [CODE] */\n  function bracketSurcharge(currentLevel, newLevel) { const series = (x, m) => x * (x + 1) / 2 * m; if (newLevel <= 5000) return 0; let sum = 0; const first = Math.floor((Math.max(currentLevel, 5001) - 5001) / 1000), last = Math.floor((newLevel - 5001) / 1000); for (let o = first; o <= last; o++) { const bracketStart = 5001 + o * 1000, bracketEnd = Math.min(5000 + (o + 1) * 1000, newLevel); const rate = o < 5 ? 20 : 20 + (o - 4) * 10; const lo = Math.max(currentLevel + 1, bracketStart), hi = bracketEnd; if (hi >= lo) sum += series(hi - 5000, rate) - series(lo - 5000 - 1, rate); } return sum; }\n  /* formulas/relic-boosts.json :: relicBoost.veryHighLevelSurcharge  [CODE] */\n  function veryHighLevelSurcharge(currentLevel, newLevel) { let low = Math.max(currentLevel, 50000); let high = Math.max(newLevel, 50000); if (low > high) return 0; return triangular(low - 50000, high - 50000, 50000); }\n  /* formulas/relic-boosts.json :: relicBoost.costFormula  [CODE] */\n  function boostCost(currentLevel, newLevel, boostType) { const series = (x, m) => x * (x + 1) / 2 * m; if (boostType==='defenseFlat' || boostType==='damageFlat') { let cost = series(newLevel, 100) - series(currentLevel, 100) + bracketSurcharge(currentLevel, newLevel); return {currency:'gold', value: Math.round(cost)}; } let cost = series(newLevel, 10) - series(currentLevel, 10) + bracketSurcharge(currentLevel, newLevel) + veryHighLevelSurcharge(currentLevel, newLevel); return {currency:'relics', value: Math.round(cost)}; }\n  /* formulas/sculptures.json :: sculptures.tileUpgradeCost  [CODE] */\n  function tileUpgradeCost(currentLevel, newLevel) { const series = (x, m) => x * (x + 1) / 2 * m; const a = Math.max(currentLevel, 2500), b = Math.max(newLevel, 2500); const past2500 = a <= b ? triangular(a - 2500, b - 2500, 2500000) : 0; return Math.round(series(newLevel, 25000) - series(currentLevel, 25000) + past2500); }  // level L costs 25,000*L, plus (L-2500-0.5)*2,500,000 past 2500\n  /* formulas/village-boss.json :: villageBoss.costFormula  [CODE] */\n  function villageBossCost(currentLevel, newLevel, base, ratio=1.15) { let start = currentLevel+1; let count = newLevel-currentLevel; return Math.round(base * ratio**start * (ratio**count - 1) / (ratio-1)); }\n  /* formulas/village.json :: village.buildings.costFormula.implementation  [CODE] */\n  function villageBuildingCost(currentLevel, newLevel) { const ratio = 1.15, start = currentLevel + 1, count = newLevel - currentLevel, ratioToStart = ratio ** start; const geomCost = (base) => Math.round(base * ratioToStart * (ratio ** count - 1) / (ratio - 1)); const out = [{currency: 'gold', value: geomCost(200000)}, {currency: 'meat', value: geomCost(4000)}, {currency: 'iron', value: geomCost(4000)}, {currency: 'wood', value: geomCost(4000)}, {currency: 'stone', value: geomCost(4000)}]; if (newLevel > 40) { const relicStart = Math.max(start, 41), relicCount = newLevel - relicStart + 1; if (relicCount > 0) out.push({currency: 'relics', value: Math.round(3000 * (ratio ** relicStart) * (ratio ** relicCount - 1) / (ratio - 1))}); } return out; }\n  /* formulas/caves.json :: caves.toolUpgradeCost.formula  [CODE] */\n  function caveToolUpgradeCost(currentLevel, targetLevel, toolName) { const tri = (a, b, mult) => (a + b) * (b - a) / 2 * mult; if (toolName === 'repeater') return { currency: 'diamonds', value: Math.round(1000 * (2 ** (targetLevel + 1) - 2 ** (currentLevel + 1)) / 9) }; const base = tri(currentLevel, targetLevel, 4000); const a = Math.max(currentLevel, 100), o = Math.max(targetLevel, 100), tier100 = a <= o ? tri(a, o, 4000) : 0; const c = Math.max(currentLevel, 200), l = Math.max(targetLevel, 200), tier200 = c <= l ? tri(c - 200, l - 200, 400000) : 0; const d = Math.max(currentLevel, 600), f = Math.max(targetLevel, 600), tier600 = d <= f ? tri(d - 600, f - 600, 2000000) : 0; const resourceCost = Math.round(base + tier100 + tier200 + tier600); const diamondCost = Math.round(tri(currentLevel, targetLevel, 1)); return { meat: resourceCost, iron: resourceCost, wood: resourceCost, stone: resourceCost, diamonds: diamondCost }; }\n  /* formulas/dungeons.json :: dungeon.fighterSlotCost.formula  [CODE] */\n  function fighterSlotCost(currentCount, targetCount) { if (targetCount <= currentCount) return { currency: 'gold', value: 0 }; return { currency: 'gold', value: 10000 * (Math.pow(10, targetCount + 1) - Math.pow(10, currentCount + 1)) / 9 }; }\n  /* tables/house-upgrades.json :: house.resourceCost.formula  [CODE] */\n  function houseUpgradeCost(currentLevel, newLevel) { const perLevel = (lvl) => 5000 + Math.round(5000 * Math.pow(lvl, 1.25)); let total = 0; for (let lvl = currentLevel + 1; lvl <= newLevel; lvl++) total += perLevel(lvl); let extra = 0; if (newLevel > 50) extra = (newLevel - Math.max(currentLevel, 50)) * 1e6; return { meat: total + extra, iron: total + extra, wood: total + extra, stone: total + extra }; }\n  return { sanctumNodeCost, petSlotUpgradeCost, slotUpgradeCost, expRequired, partnerLevelExp, partnerBoostUpgradeCost, bracketSurcharge, veryHighLevelSurcharge, boostCost, tileUpgradeCost, villageBossCost, villageBuildingCost, caveToolUpgradeCost, fighterSlotCost, houseUpgradeCost };\n})();\nwindow.AWOO_FACTS_META = {\"sanctumNodeCost\":{\"file\":\"tables/sanctum-nodes.json\",\"fact\":\"sanctumNodes.formula.status\",\"confidence\":\"CROSS\",\"checked\":\"2026-08-23\"},\"petSlotUpgradeCost\":{\"file\":\"formulas/pets.json\",\"fact\":\"pets.slotUpgrade.costFormula\",\"confidence\":\"CODE\",\"checked\":\"2026-09-07\"},\"slotUpgradeCost\":{\"file\":\"formulas/equipment.json\",\"fact\":\"equipment.slotUpgrade.costFormula\",\"confidence\":\"CODE\",\"checked\":\"2026-08-23\"},\"expRequired\":{\"file\":\"formulas/leveling.json\",\"fact\":\"leveling.genericExpRequired.formula\",\"confidence\":\"CODE\",\"checked\":\"2026-08-23\"},\"partnerLevelExp\":{\"file\":\"formulas/partners.json\",\"fact\":\"partner.level.expFormula\",\"confidence\":\"CODE\",\"checked\":\"2026-08-23\"},\"partnerBoostUpgradeCost\":{\"file\":\"formulas/partners.json\",\"fact\":\"partner.boostUpgradeCost.formula\",\"confidence\":\"CODE\",\"checked\":\"2026-08-23\"},\"bracketSurcharge\":{\"file\":\"formulas/relic-boosts.json\",\"fact\":\"relicBoost.bracketSurcharge\",\"confidence\":\"CODE\",\"checked\":\"2026-08-23\"},\"veryHighLevelSurcharge\":{\"file\":\"formulas/relic-boosts.json\",\"fact\":\"relicBoost.veryHighLevelSurcharge\",\"confidence\":\"CODE\",\"checked\":\"2026-08-23\"},\"boostCost\":{\"file\":\"formulas/relic-boosts.json\",\"fact\":\"relicBoost.costFormula\",\"confidence\":\"CODE\",\"checked\":\"2026-08-23\"},\"tileUpgradeCost\":{\"file\":\"formulas/sculptures.json\",\"fact\":\"sculptures.tileUpgradeCost\",\"confidence\":\"CODE\",\"checked\":\"2026-08-23\"},\"villageBossCost\":{\"file\":\"formulas/village-boss.json\",\"fact\":\"villageBoss.costFormula\",\"confidence\":\"CODE\",\"checked\":\"2026-08-23\"},\"villageBuildingCost\":{\"file\":\"formulas/village.json\",\"fact\":\"village.buildings.costFormula.implementation\",\"confidence\":\"CODE\",\"checked\":\"2026-08-23\"},\"caveToolUpgradeCost\":{\"file\":\"formulas/caves.json\",\"fact\":\"caves.toolUpgradeCost.formula\",\"confidence\":\"CODE\",\"checked\":\"2026-08-23\"},\"fighterSlotCost\":{\"file\":\"formulas/dungeons.json\",\"fact\":\"dungeon.fighterSlotCost.formula\",\"confidence\":\"CODE\",\"checked\":\"2026-08-23\"},\"houseUpgradeCost\":{\"file\":\"tables/house-upgrades.json\",\"fact\":\"house.resourceCost.formula\",\"confidence\":\"CODE\",\"checked\":\"2026-08-23\"}};\n</script>\n\n<div class=\"shell\">\n  <aside class=\"side\" data-awoo-sidebar data-side-min=\"1041\" data-side-top=\"20\">\n    <div class=\"awoo-head\">\n      <div id=\"gear\"></div>\n      <div class=\"awoo-eyebrow\">Upgrade pricing &middot; 15 systems</div>\n      <h1 class=\"awoo-title\">Cost Tables</h1>\n      <p class=\"awoo-sub\">What the next levels cost, from where you are to where you want to be.</p>\n    </div>\n    <div id=\"syncCard\"></div>\n    <nav class=\"panel\" id=\"nav\" aria-label=\"Cost systems\"></nav>\n    <button class=\"btn ghost sm\" type=\"button\" id=\"resetAllBtn\" data-tip=\"Current levels, targets, steps and row counts back to their defaults, for every subject.\">Reset every subject</button>\n\n    <div class=\"panel\">\n      <div class=\"ph\">Legend</div>\n      <div class=\"pb\" style=\"display:flex;flex-direction:column;gap:6px;font-size:.76rem;color:var(--ink-soft)\">\n        <div><span class=\"pill live\">LIVE</span> checked against the real game</div>\n        <div><span class=\"pill code\">CODE</span> read from the shipped bundle</div>\n        <div><span class=\"pill cross\">CROSS</span> matches a known table, small drift</div>\n        <div><span class=\"pill open\">OPEN</span> something here is unresolved</div>\n      </div>\n    </div>\n  </aside>\n\n  <main class=\"panel\" id=\"main\"></main>\n</div>\n\n<button id=\"backTop\" type=\"button\" aria-label=\"Back to top\" hidden>↑</button>\n\n<div class=\"foot\">\n  Formulas are generated from the AWOO+ core (<code>core/data/formulas/</code>) and\n  were last checked against the game's own code (1.2.3.12) on 2026-09-23. Confidence tags are that core's own evidence\n  tiers, not a generic severity scale — a <b>CROSS</b> or <b>OPEN</b> table is\n  telling you something real about how far to trust the number.\n</div>\n\n<script>\n(function(){\n'use strict';\n\n/* =====================================================================\n   NUMBER FORMATTING — the shared settings layer's (tool-settings.js,\n   2026-09-23). The game's own two settings, inherited through AWOO+ and\n   overridable in the gear menu, the same in every tool. This page carried\n   its own copy of that until then; its saved override is handed over once\n   (see load()).\n   ===================================================================== */\nvar NUM = window.AWOO_TOOL_SETTINGS.num;\nfunction fmtInt(n){ return NUM.int(n); }\nfunction fmtNum(n){ return NUM.fmt(n); }\n\n/* =====================================================================\n   COST FORMULAS — verbatim ports. Each system exposes range(a,b,variant)\n   returning a currency->amount map, NOT a per-level marginal that the\n   page then sums. That matters: several of these are bracketed\n   triangular sums whose own range function is the authority, and at\n   least one (partner boosts) is provably non-additive across its\n   level-10 seam. Summing marginals would quietly disagree with the game.\n   ===================================================================== */\nvar F = (typeof window !== 'undefined' && window.AWOO_FACTS) || null;\nvar triangular = window.triangular, geomCost = window.geomCost;\n\n// Every generated fact returns one of three shapes: a bare number, a\n// { currency, value } pair, or a map of currency -> amount. One normaliser,\n// so the emitted text is never edited to fit this page.\nfunction asCost(out, fallbackCurrency){\n  if (out == null) return {};\n  if (typeof out === 'number'){ var o = {}; o[fallbackCurrency] = out; return o; }\n  // Some facts return an ARRAY of {currency,value} (village buildings bills in\n  // six currencies that way); others a single such pair; others a plain map.\n  if (Array.isArray(out)){\n    var m = {};\n    for (var i=0;i<out.length;i++){ if (out[i] && out[i].currency) m[out[i].currency] = out[i].value; }\n    return m;\n  }\n  if (typeof out.currency === 'string'){ var p = {}; p[out.currency] = out.value; return p; }\n  return out;\n}\n// A fact that failed to generate must not silently become zero. If the build\n// did not inject it, the page says so rather than pricing everything free.\nfunction fact(name){\n  if (!F || typeof F[name] !== 'function') {\n    throw new Error('Cost Tables: generated fact \"' + name + '\" is missing — the page was opened unbuilt.');\n  }\n  return F[name];\n}\n\n// partner.slotUnlock.formula and dungeon.fighterSlotCost.formula are the same\n// base-10 closed form. The dungeon one generates; the partner one is recorded\n// as prose, so it is hand-written here against that shared shape.\nfunction base10Series(a,b){ return (10000*(Math.pow(10,b+1)-Math.pow(10,a+1)))/9; }\n\n/* GENERATED: tables/sanctum-nodes.json :: sanctumNodes.formula.status */\nfunction sanctumNodeCost(a,b){ return asCost(fact('sanctumNodeCost')(a,b),'gold').gold; }\n/* GENERATED: formulas/pets.json :: pets.slotUpgrade.costFormula */\nfunction petSlotCost(a,b){ return asCost(fact('petSlotUpgradeCost')(a,b),'gold').gold; }\n/* GENERATED: formulas/partners.json :: partner.boostUpgradeCost.formula */\nfunction partnerBoostCost(a,b){ return asCost(fact('partnerBoostUpgradeCost')(a,b),'gold').gold; }\n/* GENERATED: formulas/partners.json :: partner.level.expFormula */\nfunction partnerLevelExpAt(level){ return fact('partnerLevelExp')(level); }\n/* GENERATED: formulas/leveling.json :: leveling.genericExpRequired.formula */\nfunction levelExp(level,type){ return fact('expRequired')(level, type || 'battling'); }\n/* GENERATED: formulas/relic-boosts.json :: relicBoost.bracketSurcharge.\n   Hand-translated here until 2026-09-21, when the fact's pseudocode was\n   rewritten as real JavaScript (pinned against the engine's loop in\n   tests/income-relic-boosts-vs-known-captures.mjs). */\nfunction relicBracketSurcharge(a,b){ return fact('bracketSurcharge')(a,b); }\n/* GENERATED: formulas/relic-boosts.json :: relicBoost.costFormula — all three\n   layers, priced by the game's own boostCost rather than re-assembled here. */\nfunction relicBoostCost(a,b,boostType){ return fact('boostCost')(a,b,boostType); }\n/* GENERATED: formulas/relic-boosts.json :: relicBoost.veryHighLevelSurcharge */\nfunction relicVeryHigh(a,b){ return fact('veryHighLevelSurcharge')(a,b); }\n/* GENERATED: formulas/caves.json :: caves.toolUpgradeCost.formula */\nfunction caveToolCost(a,b,tool){ return asCost(fact('caveToolUpgradeCost')(a,b,tool),'meat'); }\n/* GENERATED: tables/house-upgrades.json :: house.resourceCost.formula */\nfunction houseCost(a,b){ return asCost(fact('houseUpgradeCost')(a,b),'meat'); }\n/* GENERATED: formulas/village.json :: village.buildings.costFormula.implementation */\nfunction villageBuildingCost(a,b){ return asCost(fact('villageBuildingCost')(a,b),'gold'); }\n\n/* =====================================================================\n   SYSTEM REGISTRY\n   ===================================================================== */\nvar CUR = {\n  gold:{label:'Gold'}, relics:{label:'Relics'}, diamonds:{label:'Diamonds'},\n  meat:{label:'Meat'}, iron:{label:'Iron'}, wood:{label:'Wood'}, stone:{label:'Stone'},\n  exp:{label:'EXP'}, essence:{label:'Boss essence'},\n  tileres:{label:'Tile resource'},\n  unrecorded:{label:'Unrecorded currency'}\n};\n\nvar SYSTEMS = [\n{\n  id:'sanctum', group:'Character', name:'Sanctum skill tree', tier:'CROSS',\n  unit:'nodes bought', unitShort:'Nodes', def:25, min:0, max:84, view:84, expandBy:0, step:1, checked:'2026-08-23',\n  maxNote:'84 is the whole tree — counted from the node graph in tables/skill-tree.json, not estimated.',\n  desc:'Priced on the TOTAL number of nodes you have bought tree-wide — not on any one node’s level. Node 26 costs the same whichever node you spend it on.',\n  cur:['gold'],\n  range:function(a,b){ return { gold: sanctumNodeCost(a,b) }; },\n  formula:'cost(n) = 125,000 · n⁵  +  12,500,000 · n      (n = the nth node bought)',\n  userNote:'Every node costs the same wherever you spend it — the price is set by how many you have bought in total, so the cheapest node is always the next one.',\n  devNote:'Reproduces the known cost table <b>exactly</b> for nodes 6–15, then runs 0.3–0.4% <b>low</b> from node 16 onward (computed 996 vs table 999 at node 24). Budget slightly above what this table says. Reading one real per-node price off the Skill Tree page past node 24 would settle what the drift actually is. Checked against the 1.2.3.12 bundle 2026-09-23: unchanged.',\n  srcs:['tables/sanctum-nodes.json','engine/income/sanctum.js'],\n  alias:'Called \"sanctum nodes\" in game, but 81 of its 84 nodes have nothing to do with sanctums.',\n  noBreaks:'One smooth curve: no breakpoints.'\n},\n{\n  id:'petslot', group:'Pets', name:'Pet slot', tier:'LIVE',\n  unit:'slot level', unitShort:'Level', def:100, min:0, max:300, view:30, expandBy:30, step:1, checked:'2026-09-07',\n  desc:'Each of the three slots levels and is paid for separately. Gold only — pet slots never cost village resources.',\n  variants:{ label:'Slot', options:[{id:'combat',label:'Combat'},{id:'utility',label:'Utility'},{id:'gathering',label:'Gathering'}] },\n  defByVariant:{ combat:136, utility:51, gathering:71 },\n  cur:['gold'],\n  breaks:[\n    { at:31, short:'boost ×2 rate', tip:'From here each level adds 2% boost instead of 1%. The rate steps up every 30 levels.' },\n    { at:61, short:'boost ×3 rate', tip:'Each level now adds 3% boost.' },\n    { at:91, short:'boost ×4 rate', tip:'Each level now adds 4% boost.' },\n    { at:121, short:'boost ×5 rate', tip:'Each level now adds 5% boost.' },\n    { at:151, short:'cost ×5 curve', tip:'Past 150 the cost exponent jumps from 3 to 15 (the patch notes call it \"x5 scaling\"). The boost still adds 6% a level up to 179.', dev:'pets.slotUpgrade.costFormula: floor(500,000 · 150³ · (L/150)^15) for L > 150.' },\n    { at:180, short:'boost falls to +450%', tip:'The pet boost saw-tooths from here: 179 gives +624%, 180 gives +450%, and it climbs 6% a level back to +624% at 209. Buying 179 → 180 lowers your boost; so does every 30th level after.', dev:'pets.slotUpgrade.boostFormula: the block term freezes at block 5 (0.3·5·6/2 = 4.5) while intoBlock keeps cycling.' }\n  ],\n  range:function(a,b){ return { gold: petSlotCost(a,b) }; },\n  formula:'level ≤ 150:  floor(500,000 · level³)\\nlevel > 150:  floor(500,000 · 150³ · (level/150)¹⁵)',\n  userNote:'Gold only, and each of the three slots is priced separately. Past level 150 the cost climbs far faster — the exponent jumps from 3 to 15, which is the dev’s “x5 scaling” note, while from level 180 the boost falls back to +450% every 30 levels.',\n  devNote:'The cubic branch is <b>live-verified</b> at three points on a real account (combat 135→136, utility 50→51, gathering 70→71 — all exact). The post-150 branch is <b>bundle-only</b>: no tracked account has reached 150 yet.',\n  srcs:['formulas/pets.json','engine/income/profile.js']\n},\n{\n  id:'equipslot', group:'Character', name:'Equipment slot', tier:'CODE',\n  unit:'slot level', unitShort:'Level', def:60, min:1, max:300, view:50, expandBy:50, step:1, checked:'2026-08-25',\n  desc:'Character equipment slots, each levelled on its own. Costs the same amount of all four village resources at once — no gold.',\n  variants:{ label:'Slot', options:[{id:'head',label:'Head'},{id:'body',label:'Body'},{id:'legs',label:'Legs'},{id:'hands',label:'Hands'},{id:'feet',label:'Feet'},{id:'leftHand',label:'Left hand'},{id:'rightHand',label:'Right hand'}] },\n  cur:['meat','iron','wood','stone'],\n  breaks:[\n    { at:31, short:'boost ×2 rate', tip:'The boost these levels buy accelerates in 30-level blocks: from here each level adds 2%.' },\n    { at:61, short:'boost ×3 rate', tip:'Each level now adds 3%.' },\n    { at:91, short:'boost ×4 rate', tip:'Each level now adds 4%.' },\n    { at:121, short:'boost ×5 rate', tip:'Each level now adds 5%.' },\n    { at:151, short:'boost ×6 rate', tip:'Each level now adds 6%. Unlike pets, equipment keeps climbing past 150.' },\n    { at:181, short:'boost ×7 rate', tip:'Each level now adds 7%.' },\n    { at:211, short:'boost ×8 rate', tip:'Each level now adds 8%.' },\n    { at:241, short:'boost ×9 rate', tip:'Each level now adds 9%.' },\n    { at:271, short:'boost ×10 rate', tip:'Each level now adds 10%.' }\n  ],\n  range:function(a,b){ return asCost(fact('slotUpgradeCost')(a,b),'meat'); },  /* GENERATED: equipment.slotUpgrade.costFormula */\n  formula:'geometric series, base 250, ratio 1.10 per level, charged in each of meat / iron / wood / stone',\n  userNote:'Costs the same amount of all four village resources at once, and no gold. The cost itself has no breakpoints; the boost these levels buy steps up every 30 levels — level 30 gives +30%, 60 gives +90%, 90 gives +180%.',\n  devNote:'A different curve from pet slots, and deliberately so — the level-150 cap the dev added to pets was gated on a pet-only branch and never touched equipment.',\n  srcs:['formulas/equipment.json','engine/income/profile.js']\n},\n{\n  id:'charlevel', group:'Character', name:'Level EXP', tier:'CODE',\n  unit:'level', unitShort:'Level', def:300, min:1, max:20000, view:2000, expandBy:2000, step:10, checked:'2026-09-23',\n  desc:'One curve backs three tracks. Crafting never leaves the flat stair-step; sanctum shifts the level by +500 before applying the same curve, so sanctum level N costs what battling level N+500 costs.',\n  variants:{ label:'Which level', options:[{id:'battling',label:'Character level'},{id:'crafting',label:'Crafting / forging level'},{id:'sanctum',label:'Sanctum level'}] },\n  defByVariant:{ battling:300, crafting:300, sanctum:120 },\n  cur:['exp'],\n  breaks:function(v){\n    var stairs = [\n      { at:10, short:'250 per level', tip:'Levels 10–19 cost 250 EXP × level.' },\n      { at:20, short:'400 per level', tip:'Levels 20–39 cost 400 EXP × level.' },\n      { at:40, short:'600 per level', tip:'Levels 40–49 cost 600 EXP × level.' },\n      { at:50, short:'1,000 per level', tip:'Levels 50–99 cost 1,000 EXP × level.' }\n    ];\n    if (v === 'crafting') return stairs.concat([{ at:100, short:'stays flat', tip:'Crafting never leaves the flat 1,000 × level stair-step.' }]);\n    var tail = [\n      { at:100, short:'√ curve', tip:'From here: 20,000 · √level.' },\n      { at:501, short:'+ power tail', tip:'Adds 2,500 · (level − 500)^1.25.' },\n      { at:10001, short:'+ steep tail', tip:'Adds 100,000 · (level − 10,000)^1.4 — the steepest part of the curve.', dev:'Changed in 1.2.3.11 from 10,000 · (level − 10,000)^1.35; this table used the old tail until 2026-09-23.' }\n    ];\n    if (v === 'sanctum') return [\n      { at:1, short:'starts on the √ curve', tip:'Sanctum level N is priced as character level N + 500, so it starts past the stair-steps, on the √ curve with its first tail.' },\n      { at:9501, short:'+ steep tail', tip:'Sanctum 9,501 is character-curve level 10,001: the steep tail starts here.' }\n    ];\n    return stairs.concat(tail);\n  },\n  range:function(a,b,v){ var t=0; for(var n=a+1;n<=b;n++) t+=levelExp(n,v||'battling'); return {exp:t}; },\n  formula:'<10: L·150   <20: L·250   <40: L·400   <50: L·600   <100: L·1000\\n≥100: 20,000·√L  (+ 2,500·(L−500)^1.25 past 500, + 100,000·(L−10,000)^1.4 past 10,000)',\n  userNote:'This is EXP required, not currency — the “cost” columns count experience. Crafting never leaves the flat stair-step; a sanctum level costs what a character level 500 higher would.',\n  devNote:'<b>Corrected 2026-09-23</b>: the past-10,000 tail changed in 1.2.3.11 (was 10,000·(L−10,000)^1.35). Every figure above level 10,000 in this table was low until then — about a sixth of the real value at 11,500. The sanctum +500 shift was read from the bundle only and has not been checked against a live sanctum level.',\n  srcs:['formulas/leveling.json','engine/income/leveling.js']\n},\n\n{\n  id:'partnerboost', group:'Partners', name:'Speed / intelligence boost', tier:'CODE',\n  unit:'boost level', unitShort:'Level', def:900, min:0, max:5000, view:200, expandBy:200, step:10, checked:'2026-08-25',\n  desc:'Per partner, per boost. The same function priced at current level 0 is what the game shows you as the refund when you reset a partner’s boosts.',\n  variants:{ label:'Boost', options:[{id:'speed',label:'Speed'},{id:'intelligence',label:'Intelligence'}] },\n  cur:['gold'],\n  breaks:[\n    { at:10, short:'rate 15,000', tip:'From level 10 each level costs about 15,000 × (level − 9). One purchase across this seam is slightly cheaper than two.', dev:'Known discontinuity: cost(5→15) = 270,000 but cost(5→9) + cost(9→15) = 274,200.' },\n    { at:1001, short:'+10,000/level', tip:'Past 1,000 each level adds about 10,000 × level on top.' },\n    { at:2001, short:'+100,000/level', tip:'Past 2,000 each level adds about 100,000 × level on top.' },\n    { at:3501, short:'+500,000/level', tip:'Past 3,500 each level adds about 500,000 × level on top: the steepest stretch.' }\n  ],\n  range:function(a,b){ return { gold: partnerBoostCost(a,b) }; },\n  formula:'below 10:  triangular(a, b, 150)\\nfrom 10:   triangular(max(a−9,0), max(b−9,1), 15,000)\\n+ triangular past 1,000 @ 10,000 · past 2,000 @ 100,000 · past 3,500 @ 500,000',\n  userNote:'Per partner, per boost: buying a level for every partner costs this times your partner count. The same figure priced from level 0 is what the game shows you as the refund when you reset a partner’s boosts.',\n  devNote:'<b>Known discontinuity at level 10.</b> One purchase spanning the seam is cheaper than the same range bought as two: cost(5→15) = 270,000, but cost(5→9) + cost(9→15) = 274,200. The ≥10 branch re-indexes by −9 and clamps at zero, so every starting level from 0 to 9 lands on the same point. A real property of the game’s formula, not a transcription slip — and the reason this page always prices a range with the range function rather than adding up single levels. The other three thresholds are properly additive. Synced level = your LOWEST partner’s, the one you would buy next to keep them even.',\n  srcs:['formulas/partners.json','engine/income/partners.js']\n},\n{\n  id:'partnerhire', group:'Partners', name:'Hire a partner', tier:'CODE',\n  unit:'partners owned', unitShort:'Partners', def:5, min:0, max:12, view:12, expandBy:0, step:1, checked:'2026-08-23',\n  desc:'Unlocking the next partner slot. Ten times the previous one, every time — the single steepest curve in the game.',\n  cur:['gold'],\n  range:function(a,b){ return { gold: base10Series(a,b) }; },\n  formula:'cost(a → b) = 10,000 · (10^(b+1) − 10^(a+1)) / 9',\n  userNote:'Ten times the previous one, every time — the steepest curve in the game. <b>Whether partners cap at all is unknown</b>; this table stops at 12 for a technical reason, not a game one.',\n  devNote:'It stops at 12 because that is where the cost passes what a double-precision number represents exactly. Byte-for-byte the same closed form as the fighter-slot cost, one shared primitive across two unrelated systems; fighter slots are known to cap at 6.',\n  srcs:['formulas/partners.json','engine/income/partners.js'],\n  noBreaks:'No breakpoints: every partner costs exactly ten times the one before.'\n},\n{\n  id:'partnerlevel', group:'Partners', name:'Partner level EXP', tier:'CODE',\n  unit:'partner level', unitShort:'Level', def:400, min:0, max:10000, view:500, expandBy:500, step:10, checked:'2026-09-23',\n  desc:'A sibling of the character curve with its own coefficients — same √ + power-tail family, different numbers.',\n  cur:['exp'],\n  breaks:[\n    { at:10, short:'200 per level', tip:'Levels 10–19 cost 200 EXP × level.' },\n    { at:20, short:'300 per level', tip:'Levels 20–39 cost 300 EXP × level.' },\n    { at:40, short:'400 per level', tip:'Levels 40–49 cost 400 EXP × level.' },\n    { at:50, short:'√ curve', tip:'From here: 25,000 · √level.' },\n    { at:1501, short:'+ power tail', tip:'Adds 250 · (level − 1,500)^1.25.' },\n    { at:6001, short:'+ steep tail', tip:'Adds 2,500 · (level − 6,000)^1.4.', dev:'The game’s own formula label still prints 1.35 here; the code charges 1.4 (since 1.2.3.11).' }\n  ],\n  range:function(a,b){ var t=0; for(var n=a+1;n<=b;n++) t+=partnerLevelExpAt(n); return {exp:t}; },\n  formula:'<10: L·150   <20: L·200   <40: L·300   <50: L·400\\n≥50: 25,000·√L  (+ 250·(L−1500)^1.25 past 1500, + 2,500·(L−6000)^1.4 past 6000)',\n  userNote:'A partner’s four <i>skills</i> level on this curve. They are not the same thing as its four base <i>stats</i>. Every skill level also raises that partner’s own income multiplier.',\n  devNote:'<b>Corrected 2026-09-23</b>: the past-6000 exponent is 1.4 since 1.2.3.11 (the Partners page label still says 1.35). The live checks all sit between 1,500 and 6,000, where the two agree. How partner stats grow is still unknown; the dev’s own wiki page for it reads “coming soon”.',\n  srcs:['formulas/partners.json','engine/income/partners.js']\n},\n\n{\n  id:'villagebuilding', group:'Village', name:'Buildings', tier:'LIVE',\n  unit:'building level', unitShort:'Level', def:38, min:1, max:200, view:50, expandBy:50, step:1, checked:'2026-08-25',\n  desc:'Every building shares one price curve. Gold and all four resources at once, on the same geometric curve at different bases. Relics join the bill only past level 40.',\n  variants:{ label:'Building', options:[{id:'market',label:'Market'},{id:'stable',label:'Stable'},{id:'tavern',label:'Tavern'},{id:'well',label:'Well'},{id:'mill',label:'Mill'},{id:'granary',label:'Granary'},{id:'shrine',label:'Shrine'},{id:'treasury',label:'Treasury'},{id:'warehouse',label:'Warehouse'}] },\n  cur:['gold','meat','iron','wood','stone','relics'],\n  breaks:[{ at:41, short:'relics join the bill', tip:'From level 41 every level also costs relics (base 3,000, ratio 1.15).' }],\n  range:villageBuildingCost,\n  formula:'gold: geometric base 200,000 · ratio 1.15\\nmeat / iron / wood / stone: geometric base 4,000 · ratio 1.15\\nrelics: geometric base 3,000, pivoted at level 41, nothing below',\n  userNote:'Every building shares one curve: pick yours to see your own level. Gold and all four resources at once; relics join the bill only past level 40.',\n  devNote:'<b>Live-verified end to end</b> across all six currencies against a real Village → Upgrades price, which also settled a long-standing 3,000-vs-8,000 disagreement in the relic coefficient in favour of 3,000.',\n  srcs:['formulas/village.json','engine/costs/village.js']\n},\n{\n  id:'villagestrength', group:'Village', name:'Strengths', tier:'OPEN',\n  unit:'strength level', unitShort:'Level', def:20, min:0, max:500, view:50, expandBy:50, step:1, checked:'2026-08-23',\n  desc:'Brave / Wealthy / Bold / Swift / Trailblazer / Potent all cost ×2. Loyal alone costs ×10 — five times any other strength, per level.',\n  variants:{ label:'Strength', options:[{id:'brave',label:'Brave (×2)'},{id:'wealthy',label:'Wealthy (×2)'},{id:'bold',label:'Bold (×2)'},{id:'swift',label:'Swift (×2)'},{id:'trailblazer',label:'Trailblazer (×2)'},{id:'potent',label:'Potent (×2)'},{id:'loyal',label:'Loyal (×10)'}] },\n  cur:['unrecorded'],\n  range:function(a,b,v){ return { unrecorded: Math.round(triangular(a,b, v==='loyal'?10:2)) }; },\n  formula:'cost(a → b) = triangular(a, b) × 10 for Loyal, × 2 for every other strength',\n  userNote:'Loyal costs five times what any other strength costs per level. The bonus side is simpler: level × 1% for the six, while Loyal returns the bare level.',\n  devNote:'<b>What this is paid in is not recorded anywhere in the core</b> — the bundle gives the arithmetic and not the currency, so the column is labelled “Cost” rather than guessed at. The bonus formula is cross-confirmed exactly against six live readings on two different characters.',\n  srcs:['formulas/village.json','engine/costs/village.js'],\n  noBreaks:'No breakpoints: one triangular curve.'\n},\n{\n  id:'villageboss', group:'Village', name:'Boss upgrades', tier:'CODE',\n  unit:'upgrade level', unitShort:'Level', def:15, min:0, max:200, view:50, expandBy:50, step:1, checked:'2026-08-25',\n  desc:'Four upgrade types, four different currencies, one shared curve — and an identical +2% per level whichever you buy.',\n  variants:{ label:'Upgrade', options:[\n    {id:'health',label:'Health (gold)'},{id:'attackSpeed',label:'Attack speed (relics)'},\n    {id:'dropQuality',label:'Drop quality (essence)'},{id:'duration',label:'Duration (4 resources)'}]},\n  cur:['gold','relics','essence','meat','iron','wood','stone'],\n  range:function(a,b,v){\n    var cfg={health:[200000,'gold'],attackSpeed:[3000,'relics'],dropQuality:[3000,'essence'],duration:[4000,'res']}[v||'health'];\n    var c=fact('villageBossCost')(a,b,cfg[0]);  /* GENERATED: villageBoss.costFormula */\n    if (cfg[1]==='res') return {meat:c,iron:c,wood:c,stone:c};\n    var o={}; o[cfg[1]]=c; return o;\n  },\n  formula:'geometric series, ratio 1.15, base 200,000 (gold) / 3,000 (relics) / 3,000 (essence) / 4,000 (each of four resources)',\n  userNote:'Four upgrade types, four different currencies, one shared curve — and every type gives the same +2% per level. The only real decision is which currency you would rather spend.',\n  devNote:'Confirmed to be literally the same helper function as Buildings, not merely a similar shape.',\n  srcs:['formulas/village-boss.json','engine/costs/village.js'],\n  noBreaks:'No breakpoints: one geometric curve (×1.15 per level).'\n},\n\n{\n  id:'sculpture', group:'Sculpture', name:'Sculpture tile', tier:'LIVE',\n  unit:'tile level', unitShort:'Level', def:223, min:0, max:3000, view:300, expandBy:300, step:25, checked:'2026-09-23',\n  desc:'Which resource a tile bills you in is fixed by its position on a 2×2 checkerboard — 16 of the 64 tiles on each resource. The price is the same wherever it sits.',\n  cur:['tileres'],\n  breaks:[{ at:2501, short:'+2.5m per level', tip:'Past level 2,500 every level also pays (level − 2,500) × 2,500,000 on top: the cost climbs a hundred times faster.', dev:'New in 1.2.3.11; this table did not know it until 2026-09-23.' }],\n  range:function(a,b){ return { tileres: fact('tileUpgradeCost')(a,b) }; },  /* GENERATED: sculptures.tileUpgradeCost */\n  formula:'level L costs 25,000 · L\\n+ past 2,500: (L − 2,500 − ½) · 2,500,000, in the same resource',\n  userNote:'Which resource a tile bills you in is fixed by its position on the grid; the price is the same wherever it sits. The slot boost these levels feed has diminishing returns, so the last levels cost the most and give the least.',\n  devNote:'<b>Corrected 2026-09-23.</b> Level L costs 25,000 × L exactly: 223 → 224 is 5,600,000, the live-observed “5.60m”. This table used triangular(a, b, 25,000), which prices it at 5,587,500 (“5.59m”) and was wrongly recorded as a match. The past-2,500 surcharge is from 1.2.3.11.',\n  srcs:['formulas/sculptures.json','engine/income/sculptures.js'],\n  curNote:'meat / iron / wood / stone — set by the tile’s coordinates'\n},\n{\n  id:'cavetool', group:'Caves', name:'Cave tools', tier:'LIVE',\n  unit:'tool level', unitShort:'Level', def:150, min:0, max:500, view:300, expandBy:100, step:5, checked:'2026-08-25',\n  desc:'Every tool but the repeater costs four resources plus a gentle diamond fee. The repeater is diamonds only, and doubles.',\n  variants:{ label:'Tool', options:[{id:'standard',label:'Any tool except repeater'},{id:'repeater',label:'Repeater (diamonds, ×2/level)'}] },\n  cur:['meat','iron','wood','stone','diamonds'],\n  breaks:function(v){\n    if (v === 'repeater') return [];\n    return [\n      { at:101, short:'+4,000 layer', tip:'Past level 100 a second 4,000-per-level layer is added to the resource cost.' },\n      { at:201, short:'+400,000 layer', tip:'Past level 200 a 400,000-per-level layer is added.' },\n      { at:601, short:'+2m layer', tip:'Past level 600 a 2,000,000-per-level layer is added.' }\n    ];\n  },\n  range:function(a,b,v){ return caveToolCost(a,b,v==='repeater'?'repeater':'standard'); },\n  formula:'resources: triangular @ 4,000, + 4,000 from level 100, + 400,000 from 200, + 2,000,000 from 600\\ndiamonds: triangular @ 1  (≈ the target level per single upgrade)\\nrepeater: 1,000 · (2^(b+1) − 2^(a+1)) / 9, diamonds only',\n  userNote:'Every tool but the repeater costs four resources plus a gentle diamond fee; the repeater is diamonds only, and doubles. Worth knowing before you spend: resetting a tool refunds all four resources and none of the diamonds — so the repeater refunds nothing at all.',\n  devNote:'<b>Live-verified exact</b> against four real upgrade prices. Checked against the 1.2.3.12 bundle 2026-09-23: unchanged.',\n  srcs:['formulas/caves.json','engine/income/caves.js']\n},\n{\n  id:'house', group:'Caves', name:'House', tier:'CROSS',\n  unit:'house level', unitShort:'Level', def:40, min:0, max:100, view:100, expandBy:50, step:1, checked:'2026-08-27',\n  desc:'All four resources at the same value each, on a gentle power curve — until level 50, where a flat million per level per resource lands on top.',\n  cur:['meat','iron','wood','stone'],\n  breaks:[{ at:51, short:'+1m per level', tip:'From level 51 every level also costs a flat 1,000,000 of each resource.' }],\n  range:houseCost,\n  formula:'per level: 5,000 + round(5,000 · level^1.25)\\npast level 50: + 1,000,000 per level, to each of the four resources',\n  userNote:'All four resources at the same value each, on a gentle curve — until level 50, where a flat million per level per resource lands on top.',\n  devNote:'26 of 32 known table rows match exactly; the six that miss look like transcription noise in the source table rather than a second branch.',\n  srcs:['tables/house-upgrades.json','engine/income/house.js']\n},\n{\n  id:'relicboost', group:'Relics', name:'Relic boost shop', tier:'CODE',\n  unit:'boost level', unitShort:'Level', def:2000, min:0, max:60000, view:2000, expandBy:2000, step:100, checked:'2026-09-23',\n  desc:'Defense and damage flat are gold and skip the top surcharge layer. Everything else is relic-paid and carries all three layers.',\n  variants:{ label:'Boost', options:[\n    {id:'critChance',label:'Crit chance'},{id:'critDamage',label:'Crit damage'},{id:'multistrike',label:'Multistrike'},\n    {id:'healing',label:'Healing'},{id:'defense',label:'Defense'},\n    {id:'huntingBoost',label:'Hunting'},{id:'miningBoost',label:'Mining'},{id:'woodcuttingBoost',label:'Woodcutting'},{id:'stonecarvingBoost',label:'Stonecarving'},\n    {id:'damageFlat',label:'Damage flat (gold)'},{id:'defenseFlat',label:'Defense flat (gold)'}]},\n  defByVariant:{ damageFlat:1000, defenseFlat:1000 },\n  cur:['relics','gold'],\n  breaks:function(v){\n    var gold = v === 'damageFlat' || v === 'defenseFlat';\n    var out = [\n      { at:5001, short:'+20 × (L−5,000)', tip:'Past 5,000 every level pays an extra (level − 5,000) × 20.' },\n      { at:10001, short:'rate +10 per 1,000', tip:'From 10,001 that extra rate climbs by 10 every 1,000 levels (30, 40, 50, …).' }\n    ];\n    if (!gold) out.push({ at:50001, short:'+50,000 layer', tip:'Past 50,000 relic-paid boosts add a third layer at 50,000 per level.', dev:'50,000 since 1.2.3.11; this table used 1.2.3.7’s 20,000 until 2026-09-23.' });\n    return out;\n  },\n  range:function(a,b,v){\n    var gold = v==='damageFlat' || v==='defenseFlat';\n    var out = relicBoostCost(a, b, gold ? 'damageFlat' : 'critChance');\n    return asCost(out, gold ? 'gold' : 'relics');\n  },\n  formula:'layer 1: level L costs L · 100 (gold types) or L · 10 (relic types)\\nlayer 2, past 5,000: (L − 5,000) · rate — 20 through 10,000, then +10 per 1,000 levels\\nlayer 3, past 50,000, relic types only: triangular @ 50,000/level',\n  userNote:'Defense and damage flat are gold-paid; everything else costs relics, and every relic type is priced the same. What a level buys: +10 flat for the gold types, level/5,000 for attack speed, level/2,000 for everything else.',\n  devNote:'<b>Corrected 2026-09-23</b> against the 1.2.3.12 function: layers 1 and 2 are arithmetic-series differences (level L costs L·rate; the old triangular form charged (L−½)·rate), and layer 3 charges 50,000 since 1.2.3.11 (was 20,000). The shattered-relics discount the game shows is server-side and not modelled.',\n  srcs:['formulas/relic-boosts.json','engine/income/relicBoosts.js']\n},\n{\n  id:'fighterslot', group:'Fighters', name:'Fighter slot', tier:'LIVE', generated:true,\n  unit:'fighter slots', unitShort:'Slots', def:5, min:0, max:6, view:6, expandBy:0, step:1, checked:'2026-08-23',\n  desc:'Expanding the fighter roster for dungeons. Six slots is the cap, and each one costs ten times the last.',\n  cur:['gold'],\n  range:function(a,b){ return asCost(fact('fighterSlotCost')(a,b),'gold'); },  /* GENERATED: dungeon.fighterSlotCost.formula */\n  formula:'cost(a → b) = 10,000 · (10^(b+1) − 10^(a+1)) / 9',\n  userNote:'Six slots is the cap, and each one costs ten times the last.',\n  devNote:'The cap of 6 is from the maintainer (2026-09-21). The arithmetic is certain, but <b>what it buys is inferred</b> from the function’s shape and where it sits in the bundle, not from watching a slot get bought — if you expand one and the price does not match this row, that is the more interesting finding.',\n  srcs:['formulas/dungeons.json','engine/costs/dungeon.js'],\n  noBreaks:'No breakpoints: each slot costs ten times the last, to the cap of 6.'\n}\n];\n\n// Groups are ordered by when a player unlocks the system, from\n// data/tables/feature-unlock-levels.json — not alphabetically and not by build\n// order. A newer player meets them top to bottom.\n// Ordered by roughly when a player meets each system (unlock levels are in\n// data/tables/feature-unlock-levels.json) - but the level itself is not shown.\n// It explains the order to whoever maintains this list; it is noise to a\n// reader who just wants the cost of their next pet slot.\nvar GROUPS = [\n  { id:'Character', label:'Character' },\n  { id:'Partners',  label:'Partners' },\n  { id:'Village',   label:'Village' },\n  { id:'Fighters',  label:'Fighters' },\n  { id:'Pets',      label:'Pets' },\n  { id:'Caves',     label:'Caves & house' },\n  { id:'Relics',    label:'Relics' },\n  { id:'Sculpture', label:'Sculptures' }\n];\n// Within a group, the order a player meets them: the thing you level first,\n// then what it gates. Explicit, because build order is not a meaning.\nvar ORDER = ['charlevel','equipslot','sanctum',\n             'partnerhire','partnerboost','partnerlevel',\n             'villagebuilding','villagestrength','villageboss',\n             'fighterslot',\n             'petslot',\n             'cavetool','house',\n             'relicboost',\n             'sculpture'];\nSYSTEMS.sort(function(a,b){\n  var ia = GROUPS.findIndex(function(g){ return g.id===a.group; });\n  var ib = GROUPS.findIndex(function(g){ return g.id===b.group; });\n  return ia !== ib ? ia - ib : ORDER.indexOf(a.id) - ORDER.indexOf(b.id);\n});\n\nvar BY_ID = {};\nSYSTEMS.forEach(function(s){ BY_ID[s.id]=s; });\n\n/* =====================================================================\n   PROFILE SYNC — live since 2026-09-23, through the shared kit\n   (tool-sync.js: the profile Core hands over and every capture after it).\n\n   Each subject key (\"<systemId>\" or \"<systemId>:<variantId>\") names what it\n   reads and which profile section dates it. A key with no entry is never\n   synced: its level is always yours to type. The four states are the kit's\n   (synced / stale / edited / unavailable); this page keeps its own record of\n   which keys you typed, because its inputs are rebuilt for every subject.\n   ===================================================================== */\nvar SYNC = window.AWOO_SYNC;\nvar STALE_MS = 6*60*60*1000;\nfunction g(path){ return SYNC.get(path); }\n// The lowest of your partners' speed or intelligence: the level you would buy\n// next to keep them even, which is the price this table can honestly quote.\nfunction lowestPartner(boost){\n  return function(){\n    var r = g('partner.roster');\n    if (!Array.isArray(r) || !r.length) return null;\n    var min = null;\n    for (var i = 0; i < r.length; i++){ var v = r[i] && r[i][boost]; if (typeof v === 'number' && (min === null || v < min)) min = v; }\n    return min;\n  };\n}\nvar PROFILE_READS = {\n  'charlevel:battling':   ['levels', function(){ var v = g('levels.battling'); return v != null ? v : g('core.level'); }],\n  'charlevel:crafting':   ['levels', 'levels.crafting'],\n  'charlevel:sanctum':    ['levels', 'levels.sanctum'],\n  'petslot:combat':       ['pets', 'pets.combat.slotLevel'],\n  'petslot:utility':      ['pets', 'pets.utility.slotLevel'],\n  'petslot:gathering':    ['pets', 'pets.gathering.slotLevel'],\n  'partnerboost:speed':        ['partner', lowestPartner('speed')],\n  'partnerboost:intelligence': ['partner', lowestPartner('intelligence')],\n  'partnerhire':          ['partner', 'partner.count']\n};\n['head','body','legs','hands','feet','leftHand','rightHand'].forEach(function(k){ PROFILE_READS['equipslot:' + k] = ['equipment', 'equipment.slots.' + k + 'Level']; });\n['market','stable','tavern','well','mill','granary','shrine','treasury','warehouse'].forEach(function(k){ PROFILE_READS['villagebuilding:' + k] = ['village', 'village.buildings.' + k]; });\n['brave','wealthy','bold','swift','trailblazer','potent','loyal'].forEach(function(k){ PROFILE_READS['villagestrength:' + k] = ['village', 'village.strengths.' + k]; });\n['critChance','critDamage','multistrike','healing','defense','huntingBoost','miningBoost','woodcuttingBoost','stonecarvingBoost','damageFlat','defenseFlat'].forEach(function(k){ PROFILE_READS['relicboost:' + k] = ['relicBoosts', 'relicBoosts.' + k]; });\n\n// key -> { value, observedAt } | null. Never 0 for \"not observed\".\nfunction profileValue(key){\n  var spec = PROFILE_READS[key];\n  if (!spec || !SYNC) return null;\n  var v = typeof spec[1] === 'function' ? spec[1]() : g(spec[1]);\n  if (typeof v !== 'number' || !isFinite(v)) return null;\n  return { value:v, observedAt:SYNC.age(spec[0]) };\n}\n\nvar edited = {};   // key -> true once the user types in that field\n\n/* state of one field: 'edited' | 'synced' | 'stale' | 'unavailable' */\nfunction fieldState(key){\n  if (edited[key]) return 'edited';\n  var p = profileValue(key);\n  if (!p) return 'unavailable';\n  if (p.observedAt === null || (Date.now() - p.observedAt) > STALE_MS) return 'stale';\n  return 'synced';\n}\nvar STATE_TEXT = {\n  edited:'Typed by you; a sync keeps it. Click to sync it again.',\n  synced:'Synced from the game. Click to re-sync.',\n  stale:'Synced, but over six hours old. Click to re-sync.',\n  unavailable:'Not synced: this is your own figure.'\n};\nfunction syncSummary(){\n  var out = { total:0, synced:0, stale:0, edited:0 };\n  for (var key in PROFILE_READS){\n    out.total++;\n    var st = fieldState(key);\n    if (st === 'synced') out.synced++; else if (st === 'stale') out.stale++; else if (st === 'edited') out.edited++;\n  }\n  return out;\n}\n\n/* =====================================================================\n   STATE\n   ===================================================================== */\n// Theme and \"Show developer info\" are the shared tool-settings layer's\n// (tool-settings.js): inherited from AWOO+ Core, overridable in the gear menu,\n// remembered per tool. Nothing here duplicates that.\n\nvar LS = 'awooCostTables.v1';\nvar state = { active:'charlevel', levels:{}, variants:{}, rows:{}, targets:{}, currency:{}, steps:{}, expanded:false };\n\n// Every system that HAS variants gets one selected before the first render.\n// Leaving it undefined would split the field key (\"petslot\") from the variant\n// the table is actually priced with (\"petslot:combat\") — a level typed into\n// one would be read back under the other, and no profile reading would match.\nSYSTEMS.forEach(function(s){\n  if (s.variants && !state.variants[s.id]) state.variants[s.id] = s.variants.options[0].id;\n});\n\nfunction keyFor(sys){\n  var v = state.variants[sys.id];\n  return (sys.variants && v) ? sys.id + ':' + v : sys.id;\n}\nfunction clampLevel(sys, v){\n  if (!isFinite(v)) return sys.min;\n  return Math.max(sys.min, Math.min(sys.max, Math.round(v)));\n}\nfunction stepFor(sys){\n  var v = state.steps[keyFor(sys)];\n  return (v && v > 0) ? Math.round(v) : sys.step;\n}\nfunction targetLevel(sys){\n  var k = keyFor(sys), lv = currentLevel(sys);\n  var t = state.targets[k];\n  if (t == null || t <= lv) return Math.min(lv + 10, sys.max);\n  return Math.min(t, sys.max);\n}\nfunction defaultLevel(sys){\n  var v = state.variants[sys.id];\n  if (sys.defByVariant && v && sys.defByVariant[v] != null) return sys.defByVariant[v];\n  return sys.def;\n}\nfunction currentLevel(sys){\n  var k = keyFor(sys);\n  if (edited[k] && state.levels[k] != null) return clampLevel(sys, state.levels[k]);\n  var p = profileValue(k);\n  if (p) return clampLevel(sys, p.value);\n  if (state.levels[k] != null) return clampLevel(sys, state.levels[k]);\n  return clampLevel(sys, defaultLevel(sys));\n}\n\nfunction load(){\n  try {\n    var raw = localStorage.getItem(LS);\n    if (!raw) return;\n    var o = JSON.parse(raw);\n    if (o.levels) state.levels = o.levels;\n    if (o.variants) state.variants = o.variants;\n    if (o.currency) state.currency = o.currency;\n    if (o.edited) edited = o.edited;\n    if (o.targets) state.targets = o.targets;\n    if (o.steps) state.steps = o.steps;\n    // This page kept its own number override until 2026-09-23; hand it to\n    // the shared layer once, where every tool now keeps it.\n    if (o.numberMode || o.numberLocale) NUM.adopt(o.numberMode, o.numberLocale);\n    if (o.expanded) state.expanded = true;\n    if (o.active && BY_ID[o.active]) state.active = o.active;\n  } catch(e){}\n}\nvar saveTimer = null;\nfunction save(){\n  clearTimeout(saveTimer);\n  saveTimer = setTimeout(function(){\n    try {\n      localStorage.setItem(LS, JSON.stringify({\n        levels:state.levels, variants:state.variants, currency:state.currency,\n        targets:state.targets, expanded:state.expanded,\n        steps:state.steps, edited:edited, active:state.active\n      }));\n    } catch(e){}\n  }, 700);\n}\n\n/* =====================================================================\n   RENDER\n   ===================================================================== */\nfunction esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;'); }\n\nfunction activeCurrency(sys){\n  var c = state.currency[sys.id];\n  if (c && sys.cur.indexOf(c) >= 0) return c;\n  return sys.cur[0];\n}\n\nfunction renderNav(){\n  var html = '', lastGroup = null;\n  SYSTEMS.forEach(function(s){\n    if (s.group !== lastGroup){\n      if (lastGroup !== null) html += '</div>';\n      var g = GROUPS.filter(function(x){ return x.id===s.group; })[0] || { label:s.group };\n      html += '<div class=\"navgroup\"><h3>' + esc(g.label) + '</h3>';\n      lastGroup = s.group;\n    }\n    var lv = currentLevel(s);\n    html += '<button class=\"navbtn\" type=\"button\" data-sys=\"' + s.id + '\"' +\n            (s.id===state.active ? ' aria-current=\"true\"' : '') + '>' +\n            esc(s.name) + '<span class=\"nlv\">' + fmtInt(lv) + '</span></button>';\n  });\n  html += '</div>';\n  document.getElementById('nav').innerHTML = html;\n}\n\nfunction costCell(amounts, cur){\n  var v = amounts[cur];\n  if (v == null) return '<td class=\"dash\">—</td>';\n  return '<td>' + fmtNum(v) + '</td>';\n}\n\nfunction renderSystem(){\n  var sys = BY_ID[state.active];\n  var cur = activeCurrency(sys);\n  var lv  = currentLevel(sys);\n  var key = keyFor(sys);\n  var fstate = fieldState(key);\n  var tgt = targetLevel(sys);\n  var step = stepFor(sys);\n  var rowsTo = state.rows[key];\n  if (rowsTo == null || rowsTo <= lv) rowsTo = Math.min(Math.max(lv + sys.view, tgt), sys.max);\n  rowsTo = Math.min(rowsTo, sys.max);\n  var from = Math.max(sys.min, lv - 3*step);\n  var variant = state.variants[sys.id] || (sys.variants ? sys.variants.options[0].id : null);\n\n  var h = '';\n\n  /* header */\n  h += '<div class=\"syshead\">';\n  h += '<h2>' + esc(sys.name) + '</h2>';\n  h += '<span class=\"pill ' + sys.tier.toLowerCase() + '\">' + sys.tier + '</span>';\n  h += '<span class=\"pill cur\">' + esc(sys.cur.map(function(c){return CUR[c].label;}).join(' · ')) + '</span>';\n  h += '<p class=\"desc\">' + sys.desc + (sys.alias ? ' <span class=\"tip\" data-tip=\"' + esc(sys.alias) + '\">Naming note.</span>' : '') + '</p>';\n  h += '</div>';\n\n  /* controls */\n  h += '<div class=\"controls\">';\n  h += '<div class=\"field\"><span class=\"lab\">' +\n       (PROFILE_READS[key]\n         ? '<button class=\"awoo-light\" type=\"button\" id=\"stateLight\" data-state=\"' + fstate + '\" aria-label=\"Sync: ' + fstate + '\" data-tip=\"' + esc(STATE_TEXT[fstate]) + '\" data-tip-dev=\"' + esc('Profile: ' + (typeof PROFILE_READS[key][1] === 'string' ? PROFILE_READS[key][1] : PROFILE_READS[key][0])) + '\"></button>'\n         : '<span class=\"awoo-light\" data-state=\"unavailable\" data-tip=\"Not something the game sync reads. Type your own level.\"></span>') +\n       '<span>Current ' + esc(sys.unit) + '</span></span>' +\n       '<input type=\"text\" data-num data-num-digits=\"0\" id=\"lvInput\" value=\"' + lv + '\" min=\"' + sys.min + '\" max=\"' + sys.max + '\" step=\"1\"></div>';\n  h += '<div class=\"field\"><span class=\"lab\"><span class=\"tip\" data-tip=\"' +\n       esc('Where you want to get to. Sets the headline total, and grows the table to reach it.') +\n       '\">Target</span></span>' +\n       '<input type=\"text\" data-num data-num-digits=\"0\" id=\"tgtInput\" value=\"' + tgt + '\" min=\"' + (lv+1) + '\" max=\"' + sys.max + '\" step=\"1\"></div>';\n  if (sys.variants){\n    h += '<div class=\"field\"><span class=\"lab\">' + esc(sys.variants.label) + '</span><select id=\"varSel\">';\n    sys.variants.options.forEach(function(o){\n      h += '<option value=\"' + o.id + '\"' + (o.id===variant?' selected':'') + '>' + esc(o.label) + '</option>';\n    });\n    h += '</select></div>';\n  }\n  if (sys.cur.length > 1){\n    h += '<div class=\"field\"><span class=\"lab\">Show cost in</span><select id=\"curSel\">';\n    sys.cur.forEach(function(c){\n      h += '<option value=\"' + c + '\"' + (c===cur?' selected':'') + '>' + esc(CUR[c].label) + '</option>';\n    });\n    h += '</select></div>';\n  }\n  h += '<div class=\"field\"><span class=\"lab\"><span class=\"tip\" data-tip=\"' +\n       esc('Rows advance by this many levels. A subject that runs to thousands is unreadable at 1.') +\n       '\">Step</span></span>' +\n       '<input type=\"text\" data-num data-num-digits=\"0\" id=\"stepInput\" value=\"' + step + '\" min=\"1\" max=\"' + Math.max(1, sys.max) + '\" step=\"1\"></div>';\n  h += '<button class=\"btn\" type=\"button\" id=\"resetSysBtn\">Reset this subject</button>';\n  h += '</div>';\n\n  /* summary — the headline is the question this page exists to answer:\n     what does it cost to get from where I am to where I want to be. */\n  var toTarget = sys.range(lv, tgt, variant);\n  var next1 = sys.range(lv, Math.min(lv+1, sys.max), variant);\n  var next5 = sys.range(lv, Math.min(lv+5, sys.max), variant);\n  var spent = sys.range(sys.min, lv, variant);\n  h += '<div class=\"summary\">';\n  h += '<div class=\"stat\"><span class=\"k\">' + fmtInt(lv) + ' → ' + fmtInt(tgt) + '</span><span class=\"v accent\">' +\n       fmtNum(toTarget[cur]||0) + '<span class=\"u\">' + esc(CUR[cur].label.toLowerCase()) + '</span></span></div>';\n  h += '<div class=\"stat\"><span class=\"k\">Next level</span><span class=\"v\">' + fmtNum(next1[cur]||0) + '</span></div>';\n  h += '<div class=\"stat\"><span class=\"k\">Next 5 → ' + fmtInt(Math.min(lv+5, sys.max)) + '</span><span class=\"v\">' + fmtNum(next5[cur]||0) + '</span></div>';\n  h += '<div class=\"stat\"><span class=\"k\">Sunk to ' + fmtInt(lv) + '</span><span class=\"v\">' + fmtNum(spent[cur]||0) + '</span></div>';\n  h += '</div>';\n\n  // The full bill for the target, when a system charges in more than one\n  // currency. The table can only show one column at a time; a village\n  // building upgrade you cannot actually afford in wood is not a detail.\n  var others = [];\n  for (var ck in toTarget){ if (ck !== cur && toTarget[ck]) others.push(CUR[ck].label + ' ' + fmtNum(toTarget[ck])); }\n  if (others.length){\n    h += '<div class=\"billstrip\"><span class=\"bk\">' + fmtInt(lv) + ' → ' + fmtInt(tgt) + ' also charges</span>' +\n         others.map(function(o){ return '<span class=\"bv\">' + esc(o) + '</span>'; }).join('') + '</div>';\n  }\n\n  /* breakpoints: every one, whatever the step, with what changes there */\n  var bps = breaksFor(sys, variant);\n  h += '<div class=\"bpstrip\"><span class=\"bk\">Breakpoints</span>';\n  if (bps.length){\n    bps.forEach(function(b){\n      h += '<button type=\"button\" class=\"bpchip' + (b.at <= lv ? ' passed' : '') + '\" data-bp=\"' + b.at + '\" data-tip=\"' +\n           esc(b.tip + (b.at <= lv ? ' (Behind you.)' : ' Click to make it your target.')) + '\"' +\n           (b.dev ? ' data-tip-dev=\"' + esc(b.dev) + '\"' : '') + '><b>' + fmtInt(b.at) + '</b>' + esc(b.short) + '</button>';\n    });\n  } else {\n    h += '<span class=\"bpnone\">' + esc(sys.noBreaks || 'None.') + '</span>';\n  }\n  h += '</div>';\n\n  if (sys.curNote){\n    h += '<div style=\"padding:10px 16px 0\"><div class=\"banner\"><span>' + sys.curNote + '</span></div></div>';\n  }\n\n  /* table */\n  h += '<div class=\"tablewrap\"><table><thead><tr>' +\n       '<th>' + esc(sys.unitShort) + '</th>' +\n       '<th>Cost<span class=\"hsub\">' +\n       (step === 1 ? 'this level alone' : 'this ' + step + '-level step') + '</span></th>' +\n       '<th>Cumulative<span class=\"hsub\">from ' + sys.min + '</span></th>' +\n       '<th>From level ' + fmtInt(lv) + '<span class=\"hsub\">what you still owe</span></th>' +\n       '</tr></thead><tbody>';\n\n  // Rows advance by `step`, and always include the current and target levels\n  // even when they do not land on a step boundary - a table that hides the two\n  // rows the reader came for is worse than an unaligned one.\n  var marks = {};\n  for (var q = Math.max(from, sys.min + 1); q <= rowsTo; q += step) marks[q] = true;\n  if (lv > sys.min) marks[lv] = true;\n  if (tgt > sys.min && tgt <= rowsTo) marks[tgt] = true;\n  // Breakpoint rows are always shown in range, even off-step: a table that\n  // steps past the level where the formula changes hides the one row that\n  // explains the jump.\n  var bpAt = {};\n  bps.forEach(function(b){ bpAt[b.at] = b; if (b.at > sys.min && b.at >= from && b.at <= rowsTo) marks[b.at] = true; });\n  var rowLevels = Object.keys(marks).map(Number).sort(function(a,b){ return a-b; });\n\n  for (var ri = 0; ri < rowLevels.length; ri++){\n    var n = rowLevels[ri];\n    var prev = ri > 0 ? rowLevels[ri-1] : Math.max(sys.min, n - step);\n    var cls = n === lv ? 'current' : (n < lv ? 'past' : '');\n    if (n === tgt && n !== lv) cls += ' target';\n    var bp = bpAt[n] || null;\n    if (bp) cls += ' bp';\n    var stepCost = sys.range(prev, n, variant);\n    var cum  = sys.range(sys.min, n, variant);\n    h += '<tr class=\"' + cls + '\"' + (n===lv ? ' id=\"curRow\"' : '') + '>';\n    h += '<td>' + fmtInt(n) + (bp ? '<span class=\"bpnote\" data-tip=\"' + esc(bp.tip) + '\">' + esc(bp.short) + '</span>' : '') + '</td>';\n    h += costCell(stepCost, cur);\n    h += costCell(cum, cur);\n    if (n <= lv) h += '<td class=\"dash\">—</td>';\n    else h += costCell(sys.range(lv, n, variant), cur);\n    h += '</tr>';\n  }\n  h += '</tbody></table></div>';\n\n  /* row controls */\n  h += '<div class=\"rowctl\">';\n  h += '<span class=\"hint\">Showing ' + Math.max(from, sys.min+1) + '–' + rowsTo +\n       ' of ' + sys.min + '–' + fmtInt(sys.max) + ', every ' + step + '.' +\n       (sys.maxNote ? ' ' + sys.maxNote : '') +\n       (bps.length ? ' Violet rows mark where the formula changes shape.' : '') + '</span>';\n  h += '<button class=\"btn sm expandbtn\" type=\"button\" id=\"expandBtn\" aria-pressed=\"' +\n       (state.expanded ? 'true' : 'false') + '\">' +\n       (state.expanded ? 'Shrink table' : 'Expand table') + '</button>';\n  if (rowsTo < sys.max && sys.expandBy) h += '<button class=\"btn sm\" type=\"button\" id=\"more30\">+' + sys.expandBy + ' levels</button>';\n  else h += '<span style=\"font-size:.72rem;color:var(--ink-mute)\">Showing the full range.</span>';\n  h += '</div>';\n\n  /* notes */\n  // Two audiences, one panel. A player wants the formula and the sentence that\n  // says what it means; the evidence tier, the source files and the\n  // last-checked date are for whoever maintains the numbers. The developer half\n  // is hidden unless \"Show developer info\" is on, and tinted with --dev when\n  // it is, so the two are never confused. DESIGN.md §7, register R67.\n  h += '<details class=\"notes\"><summary>Formula' +\n       '<span data-dev-only> &amp; source</span></summary><div class=\"notebody\">';\n  h += '<span class=\"formula\">' + esc(sys.formula) + '</span>';\n  h += '<p>' + sys.userNote + '</p>';\n  if (sys.devNote) h += '<p data-dev-only><span class=\"devpill\">dev</span> ' + sys.devNote + '</p>';\n  h += '<div class=\"srcline\" data-dev-only>' +\n       '<span class=\"devpill\">' + sys.tier + '</span>';\n  sys.srcs.forEach(function(x){ h += '<span class=\"devpill\">' + esc(x) + '</span>'; });\n  h += '<span class=\"devpill\">last checked ' + esc(sys.checked) + '</span>';\n  h += '</div></div></details>';\n\n  document.getElementById('main').innerHTML = h;\n  NUM.enhance(document.getElementById('main'));\n  wireSystem(sys);\n}\n\nfunction breaksFor(sys, variant){\n  var b = typeof sys.breaks === 'function' ? sys.breaks(variant) : (sys.breaks || []);\n  return b.filter(function(x){ return x.at >= sys.min && x.at <= sys.max; }).sort(function(x, y){ return x.at - y.at; });\n}\n\nfunction wireSystem(sys){\n  var key = keyFor(sys);\n\n  Array.prototype.forEach.call(document.querySelectorAll('.bpchip'), function(chip){\n    chip.addEventListener('click', function(){\n      var at = parseInt(chip.getAttribute('data-bp'), 10);\n      if (at > currentLevel(sys)){ state.targets[key] = at; delete state.rows[key]; save(); }\n      renderSystem(); sizeTable(); scrollRowIntoView(at);\n    });\n  });\n\n  var lvInput = document.getElementById('lvInput');\n  lvInput.addEventListener('input', function(){\n    var v = NUM.read(lvInput); if (v !== null) v = Math.round(v);\n    if (v === null || v < sys.min || v > sys.max) return;\n    state.levels[key] = v;\n    edited[key] = true;\n    save();\n    renderAll('lvInput');\n  });\n\n  var tgtInput = document.getElementById('tgtInput');\n  tgtInput.addEventListener('input', function(){\n    var v = NUM.read(tgtInput); if (v !== null) v = Math.round(v);\n    if (v === null || v <= currentLevel(sys) || v > sys.max) return;\n    state.targets[key] = v;\n    delete state.rows[key];\n    save();\n    renderAll('tgtInput');\n  });\n\n  var light = document.getElementById('stateLight');\n  if (light) light.addEventListener('click', function(){\n    delete edited[key];\n    delete state.levels[key];\n    save();\n    if (!SYNC.connected()) SYNC.request();\n    renderAll();\n  });\n\n  document.getElementById('resetSysBtn').addEventListener('click', function(){\n    delete edited[key];\n    delete state.levels[key];\n    delete state.rows[key];\n    delete state.targets[key];\n    delete state.steps[key];\n    save();\n    renderAll();\n  });\n\n  var varSel = document.getElementById('varSel');\n  if (varSel) varSel.addEventListener('change', function(){\n    state.variants[sys.id] = varSel.value;\n    save(); renderAll();\n  });\n\n  var curSel = document.getElementById('curSel');\n  if (curSel) curSel.addEventListener('change', function(){\n    state.currency[sys.id] = curSel.value;\n    save(); renderSystem();\n  });\n\n  var stepInput = document.getElementById('stepInput');\n  stepInput.addEventListener('input', function(){\n    var v = NUM.read(stepInput); if (v !== null) v = Math.round(v);\n    if (v === null || v < 1 || v > sys.max) return;\n    state.steps[key] = v;\n    save(); renderAll('stepInput');\n  });\n\n  document.getElementById('expandBtn').addEventListener('click', function(){\n    state.expanded = !state.expanded;\n    save(); renderSystem(); sizeTable(); scrollCurrentIntoView();\n  });\n\n  var more = document.getElementById('more30');\n  if (more) more.addEventListener('click', function(){\n    var lv = currentLevel(sys);\n    var now = state.rows[key] || Math.max(lv + sys.view, targetLevel(sys));\n    state.rows[key] = Math.min(now + sys.expandBy, sys.max);\n    save(); renderSystem();\n  });\n}\n\nfunction renderAll(refocusId, forceScrollY){\n  var scrollY = forceScrollY != null ? forceScrollY : window.scrollY;\n  var caret = null;\n  if (refocusId){\n    var was = document.getElementById(refocusId);\n    if (was) { try { caret = was.selectionStart; } catch(e){} }\n  }\n  renderNav();\n  if (SYNC) SYNC.renderCards();\n  renderSystem();\n  if (refocusId){\n    var el = document.getElementById(refocusId);\n    if (el){\n      el.focus();\n      // Put the caret back where the user left it. Jamming it to the end\n      // makes editing the middle of a number impossible.\n      try { if (caret != null) el.setSelectionRange(caret, caret); } catch(e){}\n    }\n  }\n  window.scrollTo(0, scrollY);\n  sizeTable();\n  scrollCurrentIntoView();\n}\n\n// The table gets a real height so \"scroll the current row into view\" means\n// something — sized to the viewport, not a fixed pixel count. Re-applied on\n// every render, because renderSystem() replaces the element.\nfunction sizeTable(){\n  var w = document.querySelector('.tablewrap');\n  if (!w) return;\n  var reserve = state.expanded ? 150 : 380;\n  w.style.maxHeight = Math.max(320, window.innerHeight - reserve) + 'px';\n}\n\nfunction scrollRowIntoView(level){\n  var wrap = document.querySelector('.tablewrap');\n  if (!wrap) return;\n  var rows = wrap.querySelectorAll('tbody tr');\n  for (var i = 0; i < rows.length; i++){\n    var c = rows[i].firstChild;\n    if (c && parseInt(c.textContent.replace(/[^0-9]/g, ''), 10) === level){\n      var delta = rows[i].getBoundingClientRect().top - wrap.getBoundingClientRect().top;\n      wrap.scrollTop = Math.max(0, wrap.scrollTop + delta - 3 * rows[i].offsetHeight);\n      return;\n    }\n  }\n}\n\nfunction scrollCurrentIntoView(){\n  var wrap = document.querySelector('.tablewrap');\n  var row = document.getElementById('curRow');\n  if (!wrap || !row) return;\n  // A few rows above the current one, the rest below — the decision is about\n  // what comes next, not what is already paid for. Measured rather than read\n  // off offsetTop, whose offsetParent is the panel here, not the scroller.\n  var delta = row.getBoundingClientRect().top - wrap.getBoundingClientRect().top;\n  wrap.scrollTop = Math.max(0, wrap.scrollTop + delta - 3 * row.offsetHeight);\n}\n\n/* =====================================================================\n   BOOT\n   ===================================================================== */\nfunction init(){\n  load();\n\n  document.getElementById('nav').addEventListener('click', function(e){\n    var b = e.target.closest('.navbtn');\n    if (!b) return;\n    state.active = b.getAttribute('data-sys');\n    save();\n    renderAll(null, 0);\n  });\n\n  document.getElementById('resetAllBtn').addEventListener('click', function(){\n    state.levels = {}; state.rows = {}; state.targets = {}; state.steps = {}; edited = {};\n    save(); renderAll();\n  });\n\n  AWOO_TOOL_SETTINGS.mount(document.getElementById('gear'), {\n    devHint: 'Adds the evidence tier, source files and last-checked date to each Formula panel.'\n  });\n  // Numbers and theme re-render the page; the gear menu says when they change.\n  AWOO_TOOL_SETTINGS.onChange(function(){ renderAll(); });\n\n  // The shared sync card, with this page's own per-subject state reported\n  // into it: its counts, and its Reset.\n  SYNC.card(document.getElementById('syncCard'));\n  SYNC.extend({\n    summary: syncSummary,\n    reset: function(){\n      for (var k in edited){ if (PROFILE_READS[k]) { delete edited[k]; delete state.levels[k]; } }\n      save(); renderAll();\n    }\n  });\n  // A live capture re-prices the page, but never under someone's typing: an\n  // input with focus waits for blur.\n  var pendingProfile = false;\n  SYNC.onProfile(function(){\n    var a = document.activeElement;\n    if (a && a.closest && a.closest('#main') && /INPUT|SELECT/.test(a.tagName)){ pendingProfile = true; return; }\n    renderAll();\n  });\n  document.addEventListener('focusout', function(){\n    if (pendingProfile){ pendingProfile = false; setTimeout(function(){ renderAll(); }, 0); }\n  });\n\n  var backTop = document.getElementById('backTop');\n  backTop.addEventListener('click', function(){ window.scrollTo({ top:0, behavior:'smooth' }); });\n  // Cheap enough not to need rAF gating, and a plain handler is verifiable in\n  // an automated browser where an rAF-gated one is not (style guide, Lessons).\n  var updateBackTop = function(){\n    backTop.hidden = !(window.scrollY > 320 && window.innerWidth <= 1040);\n  };\n  window.addEventListener('scroll', updateBackTop);\n  window.addEventListener('resize', function(){ sizeTable(); scrollCurrentIntoView(); updateBackTop(); });\n  updateBackTop();\n\n  renderAll();\n}\n\n/* The test seam, and the profile reads for inspection. */\nwindow.AWOO_COST_TABLES = {\n  refresh: function(){ renderAll(); return syncSummary(); },\n  reads: PROFILE_READS,\n  systems: SYSTEMS,\n  breaks: breaksFor\n};\nwindow.__AWOO_COST_TABLES_FOR_TEST = {\n  sanctumNodeCost:sanctumNodeCost, petSlotCost:petSlotCost,\n  partnerBoostCost:partnerBoostCost, levelExp:levelExp, houseCost:houseCost,\n  caveToolCost:caveToolCost, villageBuildingCost:villageBuildingCost,\n  relicBracketSurcharge:relicBracketSurcharge, triangular:triangular,\n  geomCost:geomCost, base10Series:base10Series,\n  fmtNum:function(n, mode, localeKey){\n    NUM._set(mode || 'letters', localeKey);\n    try { return fmtNum(n); } finally { NUM._set(null, null); }\n  },\n  profileValue:profileValue, fieldState:fieldState, breaksFor:breaksFor\n};\n\nif (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);\nelse init();\n})();\n</script>\n";

  // ---- Core intake shim (generated) ----
  // Requires the "AWOO+" userscript. Without it this module does nothing.
  (function (id, version, factory) {
    var host = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || null;
    var q = (window.__awooModules = window.__awooModules || []);
    q.push({ id: id, version: version, hostVersion: host, factory: factory, claimed: false, descriptor: null });
    if (window.__AwooCore && window.__AwooCore.claim) { window.__AwooCore.claim(); return; }
    setTimeout(function () {
      if (!window.__AwooCore) console.warn('[AWOO+] "' + id + '" is installed but the AWOO+ script is not. Install AWOO+ and reload.');
    }, 8000);
  })("awoo-tools-public", "7.0.8", function (Core) {

  // THE TOOL SHELF: how a tool page reaches the AWOO+ menu (REGISTER.md R84).
  //
  // NO-PROVENANCE: menu plumbing; each tool page carries its own facts,
  // generated into it from src/tools/<name>.facts.json.
  //
  // Runs in the GAME page, inside a generated script build.mjs calls a shelf
  // (one per audience: awoo-tools-public, -village, -trusted, -dev). Not to be
  // confused with tool-settings.js, which runs inside each tool page. The build
  // puts every tool payload above this as a string constant and every
  // `shelve(...)` call below it, from each tool's own .release.json, so adding a
  // tool is a page and a declaration, never a hand-written menu row.
  //
  // WHY THIS REPLACED THE TOOLS AND TOOLS ADVANCED MODULES. A tool used to reach
  // whoever its container script reached, so putting one calculator in a
  // narrower ring than the rest meant a second script (Tools Advanced), and
  // every tool needed its own copied opener in whichever script held it. Since
  // R81 every gated module ships inside one AWOO+ Extras file per player, so a
  // container script buys nothing, and a tool can carry its own audience.
  //
  // It registers links, not a module: there is nothing running and nothing to
  // persist, so an on/off switch would be a dead control. It appears under
  // "Tools" in the dropdown.
  //
  // WHY A NEW TAB IS THE RIGHT SHAPE, not a compromise: a second tab gets its
  // own main thread, so a heavy interactive page costs the game page nothing.
  // INSTRUMENTATION.md §2's throttling constraint is about BACKGROUND work, and
  // a calculator the user is looking at is by definition in the foreground.
  //
  // The payload is REBUILT on each open rather than cached, because the live
  // inputs prepended to it (the player's appearance settings, and the profile
  // for a tool that asks for it) must be what is true now, not at load. The
  // previous blob is revoked first, so exactly one per tool is ever alive.

  // Core.toolHtml (Core v12) prepends the appearance settings as
  // window.AWOO_APPEARANCE, plus any `extra` globals, AFTER the doctype the
  // build gives every tool: a <script> ahead of the doctype drops the page into
  // quirks mode. An older Core has no toolHtml; the tool then opens in its own
  // default theme, and `extra` still goes in at the same place.
  function toolPayload(html, extra) {
    if (typeof Core.toolHtml === 'function') return Core.toolHtml(html, extra);
    const body = Object.keys(extra || {})
      .map((k) => `window.${k}=${JSON.stringify(extra[k]).replace(/</g, '\\u003c')};`).join('');
    if (!body) return html;
    return html.replace(/^(<!doctype html>\n<meta charset="utf-8">\n)?/i, (head) => head + '<script>' + body + '<' + '/script>\n');
  }

  // The live inputs a tool can ask for in its .release.json `prefill`. Each
  // is read at open time and left out when absent (absent is not zero,
  // AGENTS.md rule 3): the page then asks the player instead.
  const PREFILL = {
    profile() {
      try { return Core.profile && Core.profile.get ? Core.profile.get() : null; } catch (e) { return null; }
    },
  };
  const PREFILL_GLOBAL = { profile: 'AWOO_INITIAL_PROFILE' };

  // `about` is the tool's own declaration (description, uses); an older
  // Core ignores the extra fields.
  //
  // The page is told its own `uses` too (window.AWOO_TOOL_USES, R92), so its
  // "Sync now" asks the game tab for those sections only (tools/tool-sync.js).
  // Opening it from AWOO+ asks for them once already: Core's openTool calls
  // Core.profile.request with the same list, which is why that is not done
  // here as well.
  function shelve(id, label, html, prefill, about) {
    let url = null;
    const uses = (about && Array.isArray(about.uses)) ? about.uses.slice() : [];
    Core.registerLink({
      id,
      label,
      description: (about && about.description) || '',
      uses,
      open() {
        if (url) { try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ } }
        const extra = {};
        for (const p of prefill || []) {
          const v = PREFILL[p] ? PREFILL[p]() : null;
          if (v != null) extra[PREFILL_GLOBAL[p]] = v;
        }
        if (uses.length) extra.AWOO_TOOL_USES = uses.slice();
        url = URL.createObjectURL(new Blob([toolPayload(html, extra)], { type: 'text/html' }));
        return url;
      },
    });
  }

  // ==== GENERATED — one row per tool, from src/tools/<id>.release.json ====
  shelve("cost-tables", "Cost Tables", AWOO_TOOL_COST_TABLES, ["profile"], {"description":"Upgrade costs by tier, with your own levels filled in.","uses":["levels","relicBoosts","pets","partner","equipment","village"]});

  });
})();

