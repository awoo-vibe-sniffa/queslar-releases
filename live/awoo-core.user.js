// ==UserScript==
// @name         AWOO+
// @namespace    awoo-core
// @author       Apoz
// @version      7.0.0
// @description  The shell every AWOO+ module plugs into: nav launcher, module + tool registries, shared number handling for the game's per-character decimal convention, and update checking. INSTALL THIS FIRST - on its own it adds a menu and nothing else. Every script in this family is named "AWOO+..." so they sort together in your dashboard.
// @match        https://v2.queslar.com/*
// @match        https://*.queslar.com/*
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
    "version": "7.0.0",
    "manifestUrl": "https://raw.githubusercontent.com/awoo-vibe-sniffa/queslar-releases/main/live/manifest.json"
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

  // FLAG (2026-08-30): no cap for now, per explicit request - revisit if a lot
  // of modules ever makes the top bar too wide/unwieldy.
  const AWOO_CORE_MAX_QUICK_BUTTONS = Infinity;

  // Bump on API change. What each version ADDED, so a module can tell what it
  // may rely on: 5 = standalone Core, claim(), toast, updates; 6 =
  // createWindow/ui.* shared window framework; 7 = ui.menu, ui.icon-btn/
  // primary-btn classes, windowResizingEnabled setting; 8 = walkFiberAll,
  // resetPosition/resetFull split, real theme presets, generalized
  // [data-tooltip]; 9 = onNavigate; 10 = createScope/ui.write/ui.dom — the
  // framework layer (userscripts/FRAMEWORK.md); 11 = jobs (the local job-host
  // client — see server/README.md).
  //
  // CORRECTED 2026-09-07: this list claimed v5 shipped a "bus". It never did —
  // see the "NOT TAKEN from the AWOO+ Framework" note further down, which
  // is the actual decision. A version history is the first thing a module
  // author reads to decide what exists, so a phantom entry in it is worse than
  // no list at all.
  const AWOO_CORE_VERSION = 11;

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
    : { channel: 'dev', manifestUrl: null, version: '0.0.0' };

  const Core = (function () {
    const REG_KEY = 'awoo:core:registry';
    const BADGE_PREFIX = '🔔 ';
    // Hoisted out of buildUi() (v6): the window framework's own injected
    // stylesheet needs the same font, and duplicating the string was how the
    // two chromes would have quietly drifted apart.
    const CORE_FONT = "Lato, 'Open Sans', Nunito, 'Segoe UI', system-ui, sans-serif";

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
      // OFF by default: the chrome renders from a fixed snapshot of this
      // game's own theme (liveAdaptTheme:false) rather than live var()
      // lookups, so it looks right even before the game's CSS has painted
      // and never shifts if the game's own theme changes underneath it.
      // Flip this on to go back to inheriting var(--awoo-card) etc. live, the
      // behaviour this Core always had before v6.1.
      liveAdaptTheme: false,
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
    };
    const SETTINGS_SIZES = {
      compact: { w: 520, h: 460, label: 'Compact' },
      default: { w: 580, h: 560, label: 'Default' },
      large: { w: 720, h: 660, label: 'Large' },
      tall: { w: 620, h: 820, label: 'Tall' },
    };
    const settingsSize = () => SETTINGS_SIZES[getSetting('settingsSize')] || SETTINGS_SIZES.default;
    let settings = Object.assign({}, SETTINGS_DEFAULTS);
    try {
      const rawSettings = localStorage.getItem(SETTINGS_KEY);
      if (rawSettings) Object.assign(settings, JSON.parse(rawSettings));
    } catch (e) { /* ignore, defaults stand */ }
    function getSetting(key) { return settings[key]; }
    function setSetting(key, value) {
      settings[key] = value;
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
      if (key === 'liveAdaptTheme') applyThemeMode();
      if (key === 'showDevTooltips') syncDevIcons();
      // Every already-open window picks up an on/off flip immediately, not
      // only the next time it happens to be opened fresh.
      if (key === 'windowResizingEnabled') {
        for (const id in windowRegistry) windowRegistry[id].applyResizability();
      }
      // Profile Sync lives outside this scope (src/core/profile-sync.js), so it
      // hears about the flip as an event and reads the value via Core.profile.
      if (key === 'profileAutoSync') {
        try { window.dispatchEvent(new CustomEvent('awoo:profile:auto-sync', { detail: !!value })); } catch (e) { /* ignore */ }
        renderProfileRow();
      }
    }

    // ---- theming: named presets, static snapshot by default, live var() adaptation opt-in ----
    //
    // "AWOO Turquoise" is the user's own real `.dark{}` theme block (given
    // 2026-09-07), replacing the earlier placeholder guesses — oklch() and
    // hex are mixed here exactly as supplied; every browser this runs in
    // already renders oklch() natively (the game's own CSS uses it too).
    const THEME_PRESETS = {
      awooTurquoise: {
        card: 'oklch(0.19 0.012 215)', border: '#392e22', primary: '#3e959a',
        'primary-foreground': 'oklch(0.98 0.01 200)', input: '#4e4137',
        foreground: 'oklch(0.92 0.018 55)', popover: 'oklch(0.18 0.012 215)',
        'popover-foreground': 'oklch(0.92 0.015 215)',
      },
    };
    const THEME_SNAPSHOT = THEME_PRESETS.awooTurquoise;
    const THEME_TOKENS = Object.keys(THEME_SNAPSHOT);
    function applyThemeMode() {
      const root = document.documentElement;
      if (!root || !root.style || typeof root.style.setProperty !== 'function') return;
      for (const key of THEME_TOKENS) {
        if (getSetting('liveAdaptTheme')) root.style.setProperty(`--awoo-${key}`, `var(--${key}, ${THEME_SNAPSHOT[key]})`);
        else root.style.setProperty(`--awoo-${key}`, THEME_SNAPSHOT[key]);
        // REPORTED BUG: floating tooltips rendered see-through while live-adapt
        // is on. Root cause: the game's own --card/--popover are likely rgba()
        // with alpha < 1, meant to sit over a backdrop-blur the game itself
        // provides — a tooltip has no such ancestor, so it shows whatever is
        // behind it instead of a solid panel. A floating overlay can never
        // safely inherit a translucent theme color, live-adapted or not, so it
        // always gets the guaranteed-opaque snapshot value here regardless of
        // the liveAdaptTheme setting.
        root.style.setProperty(`--awoo-solid-${key}`, THEME_SNAPSHOT[key]);
      }
      injectTokenStyleOnce();
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
          --awoo-fs-micro: 9px;    /* section labels, version tags */
          --awoo-fs-caption: 10px; /* table headers, tooltips */
          --awoo-fs-control: 11px; /* buttons, field labels */
          --awoo-fs-body: 12px;    /* window base, table cells, menu items */
          --awoo-fs-title: 13px;   /* window and modal titles */
          /* 24px measured as too loud once a countdown sat in it every second.
             Changed here rather than overridden per-module: it is the display
             STEP, and a module that wants a quieter one wants the step quieter. */
          --awoo-fs-display: 20px; /* the ONE number a window exists to show */
          /* space */
          --awoo-s1: 2px; --awoo-s2: 4px; --awoo-s3: 6px;
          --awoo-s4: 8px; --awoo-s5: 12px; --awoo-s6: 16px;
          /* radius: controls / containers / windows */
          --awoo-r-sm: 4px; --awoo-r-md: 6px; --awoo-r-lg: 8px;
          /* emphasis — four levels, because hierarchy carried by fourteen
             opacities is why the overlay read flat: everything was the same
             colour at a different strength, so nothing was ever foreground */
          --awoo-em-strong: 1; --awoo-em-normal: .85;
          --awoo-em-muted: .55; --awoo-em-faint: .4;
          /* semantic — meaning, not appearance. Muted variants are DERIVED
             (color-mix against the token), never hand-picked: two ambers one
             digit apart shipped for months because there was no token to
             point at. */
          --awoo-danger: var(--awoo-danger); --awoo-warn: var(--awoo-warn); --awoo-success: var(--awoo-success);
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
        .awoo-num { font-variant-numeric: tabular-nums; }
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

      const scope = {
        name,
        get disposed() { return disposed; },
        // Counts, for tests and for __awooDiag. A number nobody can produce is
        // a budget nobody can check.
        get size() { return teardowns.length; },
        get observers() { return observerCount; },

        add,

        on(target, type, handler, opts) {
          guard(`listen for "${type}"`);
          target.addEventListener(type, handler, opts);
          return add(() => target.removeEventListener(type, handler, opts));
        },

        interval(fn, ms) {
          guard('start an interval');
          const id = setInterval(fn, ms);
          return add(() => clearInterval(id));
        },

        // Returns a canceller as well as registering one, because a timeout is
        // the one thing callers routinely want to cancel EARLY — a debounce
        // restarted on every keystroke, say.
        timeout(fn, ms) {
          guard('start a timeout');
          let id = setTimeout(() => { id = null; fn(); }, ms);
          const cancel = () => { if (id !== null) { clearTimeout(id); id = null; } };
          add(cancel);
          return cancel;
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
          return add(() => {
            obs.disconnect();
            if (pending) clearTimeout(pending);
            observerCount--;
          });
        },

        resize(target, handler) {
          guard('observe resizes');
          if (typeof ResizeObserver !== 'function') return () => {};
          const ro = new ResizeObserver(handler);
          ro.observe(target);
          return add(() => ro.disconnect());
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
    let convexClientProbe;
    function probeConvexClient(force) {
      if (convexClientProbe !== undefined && !force) return convexClientProbe;
      let out = null;
      walkFiber((cand) => {
        if (cand && typeof cand === 'object') {
          if (cand.optimisticQueryResults && cand.remoteQuerySet) { out = cand; return true; }
          if (cand.client && cand.client.optimisticQueryResults && cand.client.remoteQuerySet) { out = cand.client; return true; }
          if (cand.convex && cand.convex.optimisticQueryResults && cand.convex.remoteQuerySet) { out = cand.convex; return true; }
        }
        return false;
      });
      convexClientProbe = out;
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

    function resolveConvention() {
      let stored = null;
      try { stored = localStorage.getItem(OVERRIDE_KEY); } catch (e) { /* ignore */ }
      if (stored && NUMBER_LOCALE_MAP[stored]) {
        return Object.assign(separatorsFor(NUMBER_LOCALE_MAP[stored]),
          { source: 'override', numberLocale: stored });
      }
      const fromFiber = probeNumberLocaleFromFiber();
      if (fromFiber && NUMBER_LOCALE_MAP[fromFiber]) {
        return Object.assign(separatorsFor(NUMBER_LOCALE_MAP[fromFiber]),
          { source: 'setting', numberLocale: fromFiber });
      }
      const fromSample = probeFromPageSample();
      if (fromSample) return Object.assign(fromSample, { source: 'sample', numberLocale: null });
      return Object.assign(separatorsFor(navigator.language || 'en-US'),
        { source: 'browser', numberLocale: 'Local' });
    }

    function getConvention() {
      if (!convention) convention = resolveConvention();
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
    let maxQuickButtons = AWOO_CORE_MAX_QUICK_BUTTONS;
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
    let enabledOrder = [];
    let coreUi = null;

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
        return undefined;
      }
    }

    try {
      const raw = localStorage.getItem(REG_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      if (saved && Array.isArray(saved.enabledOrder)) enabledOrder = saved.enabledOrder;
    } catch (e) { /* ignore */ }

    function saveState() {
      try { localStorage.setItem(REG_KEY, JSON.stringify({ enabledOrder })); } catch (e) { /* ignore */ }
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
        .awoo-window { position: fixed; z-index: 999000; display: flex; flex-direction: column;
          background: var(--awoo-card); color: var(--awoo-popover-foreground); border: 1px solid var(--awoo-border);
          border-radius: 8px;
          box-shadow: 0 12px 32px rgba(0,0,0,.45), 0 0 0 1px color-mix(in srgb, var(--awoo-primary) 22%, transparent);
          font: 12px ${CORE_FONT}; overflow: hidden; }
        .awoo-window[hidden] { display: none; }
        .awoo-window[data-resizable="true"] { resize: both; min-width: 260px; min-height: 160px; }
        .awoo-window-header { display: flex; align-items: center; gap: 6px; padding: 7px 9px;
          background: color-mix(in srgb, var(--awoo-card) 88%, #000);
          border-bottom: 1px solid var(--awoo-border);
          border-top: 2px solid var(--awoo-primary);
          cursor: move; user-select: none; flex: none; }
        .awoo-window-title { font-weight: 700; font-size: var(--awoo-fs-title); flex: 1;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; letter-spacing: -.01em; }
        .awoo-window-close { background: none; border: none; color: inherit;
          opacity: var(--awoo-em-muted); cursor: pointer;
          font-size: 16px; line-height: 1; padding: 0 3px; }
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
        .awoo-ui-table tr:hover td { background: var(--awoo-input); }
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
          font: 12px ${CORE_FONT}; }
        .awoo-ui-menu-item { display: block; width: 100%; text-align: left; background: none; border: none;
          color: inherit; font: inherit; font-size: 11.5px; padding: 6px 8px; border-radius: 4px; cursor: pointer; }
        .awoo-ui-menu-item:hover { background: var(--awoo-input); }
        .awoo-ui-modal-overlay { position: fixed; inset: 0; z-index: 1001000; background: rgba(0,0,0,.45);
          display: flex; align-items: center; justify-content: center; font: 12px ${CORE_FONT}; }
        .awoo-ui-modal { background: var(--awoo-card); color: var(--awoo-popover-foreground);
          border: 1px solid var(--awoo-border); border-radius: 8px; box-shadow: 0 16px 48px rgba(0,0,0,.5);
          padding: 16px; max-width: 360px; }
        .awoo-ui-modal-title { font-weight: 700; font-size: 13px; margin-bottom: 8px; }
        .awoo-ui-modal-msg { opacity: .85; line-height: 1.4; margin-bottom: 14px; white-space: pre-wrap; }
        .awoo-ui-modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
        /* ---- Settings: fixed sidebar, panes, and the save model ---- */
        .awoo-settings { display: flex; margin: -10px -11px; min-height: 100%; }
        .awoo-settings-side { flex: none; width: 112px; padding: var(--awoo-s3);
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
          border-radius: var(--awoo-r-sm); opacity: var(--awoo-em-muted); cursor: pointer;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .awoo-settings-side-i:hover { opacity: var(--awoo-em-normal); background: var(--awoo-input); }
        .awoo-settings-side-i.on { opacity: 1; background: var(--awoo-input); font-weight: 600; }
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
        .awoo-ui-answer { text-align: center; padding: var(--awoo-s2) 0 var(--awoo-s1); }
        .awoo-ui-answer-value { font-size: var(--awoo-fs-display); font-weight: 800;
          line-height: 1.1; font-variant-numeric: tabular-nums; }
        .awoo-ui-answer-sub { font-size: var(--awoo-fs-control); opacity: var(--awoo-em-muted); }

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

        /* ---- activity strip ---- */
        .awoo-ui-activity { margin: auto -11px -10px; border-top: 1px solid var(--awoo-border);
          background: color-mix(in srgb, var(--awoo-card) 94%, #000); flex: none; }
        .awoo-ui-activity-head { display: flex; align-items: center; gap: 7px; width: 100%;
          padding: var(--awoo-s3) 11px; background: none; border: none; color: inherit;
          font: inherit; font-size: var(--awoo-fs-body); text-align: left; cursor: pointer; }
        .awoo-ui-activity-head:hover { background: var(--awoo-input); }
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
      closeBtn.textContent = '×';
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
        const w = Math.min(minW, vp.w - 32);
        const h = Math.min(minH, vp.h - 32);
        return { x: Math.round((vp.w - w) / 2), y: Math.round((vp.h - h) / 3), w, h };
      }
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
        el.style.width = rect.w + 'px';
      }
      function currentRect() {
        return {
          x: parseFloat(el.style.left) || 0, y: parseFloat(el.style.top) || 0,
          w: el.offsetWidth, h: el.offsetHeight,
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
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'awoo-ui-menu-item';
          if (item.danger) btn.style.color = 'var(--awoo-danger)';
          btn.textContent = item.label;
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
      const STYLE_ID = 'awoo-core-style';
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        /* Flat, not a raised gradient — closer to the game's own flat control
           style — and shorter (20px) to sit comfortably in the nav's own
           row height instead of setting it. */
        #awoo-core-group { display: inline-flex; align-items: stretch; vertical-align: middle;
          border-radius: 5px; overflow: hidden; font-family: ${CORE_FONT}; line-height: 1;
          height: 20px; align-self: center; margin: 0 4px;
          border: 1px solid var(--awoo-border); background: var(--awoo-card); }
        #awoo-core-group:hover { border-color: var(--awoo-primary); }
        #awoo-core-group:active { box-shadow: inset 0 1px 2px rgba(0,0,0,.3); }
        /* Only when no nav bar could be found - see anchorGroup(). */
        #awoo-core-group.awoo-core-floating { position: fixed; top: 8px; right: 8px; z-index: 999500;
          background: var(--awoo-card); box-shadow: 0 4px 16px rgba(0,0,0,.4); }
        #awoo-core-btn { background: transparent; color: var(--awoo-primary); border: none;
          font-weight: 600; letter-spacing: .01em; padding: 0 8px; cursor: pointer; font-size: 11px;
          height: 100%; -webkit-font-smoothing: antialiased; }
        #awoo-core-btn:hover { background: var(--awoo-input); }
        #awoo-core-quick-row { display: flex; }
        .awoo-core-quick-btn { background: none; border: none; border-left: 1px solid var(--awoo-border);
          color: var(--awoo-foreground); opacity: var(--awoo-em-faint); padding: 0 7px; cursor: pointer;
          font-size: var(--awoo-fs-control); height: 100%; font-weight: 500; position: relative;
          display: inline-flex; align-items: center; gap: 5px;
          -webkit-font-smoothing: antialiased; transition: opacity .1s ease, color .1s ease; }
        .awoo-core-quick-btn:hover { opacity: .85; background: var(--awoo-input); }
        /* OPEN IS A HUE CHANGE, NOT A BRIGHTNESS CHANGE.
           The first version underlined via inset box-shadow, which read as
           decoration. The second went dim-grey -> bright-white + bold; the
           bold was the defect, because a weight change alters the text's
           WIDTH, so opening one module nudged every button to its right — the
           same reflow class as the alarm slider. And brightness alone tested
           as too quiet in a nav bar that is already busy.
           Accent-coloured text is a hue change: it survives a glance, costs no
           layout, and visually ties the open modules to the Core button, which
           already wears the same colour. */
        .awoo-core-quick-btn-open { opacity: 1; color: var(--awoo-primary); }
        .awoo-core-quick-btn-open:hover { opacity: 1; }

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
          width: auto; height: auto; font-size: var(--awoo-fs-caption);
          animation: awoo-core-blink 1.4s ease-in-out infinite; }
        .awoo-core-sd-problem { background: none; color: var(--awoo-danger); opacity: 1;
          width: auto; height: auto; font-size: var(--awoo-fs-caption); }
        @keyframes awoo-core-blink { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }
        @media (prefers-reduced-motion: reduce) { .awoo-core-sd-attention { animation: none; } }
        #awoo-core-dropdown { position: fixed; z-index: 999501; background: var(--awoo-card);
          color: var(--awoo-popover-foreground); border: 2px solid var(--awoo-border); border-radius: 6px;
          min-width: 220px; box-shadow: 0 8px 24px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.04);
          padding: 4px; font: 12px ${CORE_FONT}; }
        /* Tighter than before (was taking too much visual space for what it
           says) with more separation FROM its neighbours instead, via the
           section's own top margin rather than internal padding. */
        .awoo-core-section-label { font-size: 9px; text-transform: uppercase; opacity: .45;
          letter-spacing: .05em; padding: 2px 6px; margin-top: 4px; display: flex; align-items: center; gap: 4px; }
        .awoo-core-section-label:first-child { margin-top: 0; }
        .awoo-core-info-icon { display: inline-flex; align-items: center; opacity: .8; cursor: help;
          position: relative; text-transform: none; letter-spacing: normal; }
        .awoo-core-info-icon svg { width: 11px; height: 11px; display: block; }
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
          white-space: normal; pointer-events: none;
          box-shadow: 0 4px 12px rgba(0,0,0,.5); font: var(--awoo-fs-caption) var(--awoo-font);
          font-family: var(--awoo-font); }
        .awoo-core-separator { height: 1px; background: var(--awoo-border); margin: 6px 2px; }
        /* A GRID, NOT A FLEX ROW — the alignment contract (DESIGN.md §4)
           applies here too. With flex, every row sized its own name column, so
           the state text landed at a different x on each line and the rows
           read as floating rather than as one list. Three shared columns fix
           the indicator, the name and the state to the same positions down the
           whole list. Padding also came down from 6px to 4px vertical: the old
           spacing separated rows that belong together. */
        .awoo-core-row { display: grid; grid-template-columns: 10px minmax(0,1fr) auto;
          align-items: center; gap: var(--awoo-s4); padding: var(--awoo-s2) 7px;
          border-radius: var(--awoo-r-sm); cursor: pointer; }
        .awoo-core-row:hover { background: var(--awoo-input); }
        .awoo-core-row-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .awoo-core-row-state { font-size: var(--awoo-fs-caption); opacity: var(--awoo-em-muted);
          font-variant-numeric: tabular-nums; white-space: nowrap; }
        .awoo-core-row-state-live { color: var(--awoo-warn); opacity: 1; }
        .awoo-core-row-enabled { font-weight: 600; }
        /* DISABLED IS NOT DIM-ENABLED. A module that is off is struck from the
           list visually — lower opacity AND a hollow indicator AND its state
           column reading "off" — because "greyed" alone is the same signal an
           idle-but-enabled module gives, and those are different things.
           SCOPED TO MODULE ROWS. These were written as
           :not(.awoo-core-row-enabled), and a Tool row is also not enabled —
           it has no on/off state at all — so every tool inherited the
           disabled treatment and rendered dim and italic. Reported. A rule
           about "off" has to match on being a module first. */
        .awoo-core-row-module:not(.awoo-core-row-enabled) { opacity: var(--awoo-em-muted); }
        .awoo-core-row-module:not(.awoo-core-row-enabled) .awoo-core-row-name { font-style: italic; }
        /* Revealed on hover only — a row you're not looking at shouldn't
           carry an extra button's worth of visual noise. */
        .awoo-core-row-update-btn { display: none; margin-left: auto; background: var(--awoo-primary);
          color: var(--awoo-primary-foreground); border: none; border-radius: 4px; font: inherit;
          font-size: 9px; font-weight: 600; padding: 2px 6px; cursor: pointer; flex: none; }
        .awoo-core-row:hover .awoo-core-row-update-btn { display: inline-block; }
        .awoo-core-row-update-btn:hover { filter: brightness(1.1); }
        /* space-between spreads EVERY child, so with a label and two buttons
           it put one button in the middle of the row. The buttons are one
           group and have to be one flex child. */
        .awoo-core-modules-head { display: flex; align-items: center; justify-content: space-between; }
        .awoo-core-head-actions { display: flex; align-items: center; gap: var(--awoo-s1); flex: none; }
        .awoo-core-subtle-icon-btn { background: none; border: none; color: var(--awoo-foreground);
          opacity: .4; cursor: pointer; font-size: 11px; padding: 2px 4px; border-radius: 3px;
          display: inline-flex; align-items: center; }
        .awoo-core-subtle-icon-btn:hover { opacity: .9; background: var(--awoo-input); }
        .awoo-core-subtle-icon-btn svg { width: 12px; height: 12px; display: block; }
        .awoo-core-bottom-icons { display: flex; justify-content: flex-end; gap: 4px; padding: 4px 4px 2px; }
        .awoo-core-icon-btn { background: var(--awoo-input); border: 1px solid var(--awoo-border); border-radius: 4px;
          color: var(--awoo-foreground); font-size: 12px; padding: 4px 8px; cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center; }
        .awoo-core-icon-btn svg { width: 13px; height: 13px; display: block; }
        .awoo-core-icon-btn:hover { background: var(--awoo-popover); }
        .awoo-core-icon-btn:disabled { opacity: .4; cursor: not-allowed; }
        .awoo-core-version-row { display: flex; align-items: center; justify-content: space-between;
          padding: 2px 8px 4px; font-size: 9px; opacity: .55; }
        .awoo-core-self-update-btn { background: none; border: none; color: var(--awoo-primary);
          font: inherit; font-size: 9px; font-weight: 700; cursor: pointer; padding: 0; }
        .awoo-core-self-update-btn:hover { text-decoration: underline; }
        .awoo-core-update-ok { color: var(--awoo-success); opacity: 1; }
        .awoo-core-update-warn { color: var(--awoo-warn); opacity: 1; }
        #awoo-core-toasts { position: fixed; right: 14px; bottom: 14px; z-index: 1002000;
          display: flex; flex-direction: column; gap: 8px; align-items: flex-end;
          pointer-events: none; font: 12px ${CORE_FONT}; }
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
        .awoo-core-profile-block { margin-top: 2px; }
        .awoo-core-profile-head { display: flex; align-items: center; justify-content: space-between; }
        .awoo-core-profile-row { display: flex; align-items: center; justify-content: space-between;
          padding: 4px 6px; border-radius: var(--awoo-r-sm); background: var(--awoo-input);
          margin-top: 3px; font-size: 11px; cursor: pointer; position: relative; }
        .awoo-core-profile-row:hover { background: var(--awoo-card-hover, rgba(255,255,255,.07)); }
        .awoo-core-profile-status-summary { display: flex; align-items: center; gap: var(--awoo-s3); }
        .awoo-profile-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; background: var(--awoo-muted); }
        .awoo-profile-dot-live { background: var(--awoo-success); box-shadow: 0 0 6px var(--awoo-success); }
        .awoo-core-profile-time { font-size: 10px; opacity: .7; }
        .awoo-core-profile-chips { display: flex; gap: var(--awoo-s1); }
        .awoo-profile-chip { font-size: 9px; padding: 1px 4px; border-radius: 3px; background: rgba(255,255,255,.06); opacity: .75; }
        .awoo-profile-chip.ok { color: var(--awoo-success); background: rgba(34,197,94,.12); font-weight: 600; opacity: 1; }
        .awoo-profile-chip.missing { color: var(--awoo-muted); opacity: .4; }
        .awoo-core-profile-hud { position: absolute; left: 0; right: 0; bottom: calc(100% + 4px);
          background: var(--awoo-solid-card); border: 1px solid var(--awoo-solid-border);
          border-radius: var(--awoo-r-sm); padding: 6px 8px; box-shadow: 0 6px 18px rgba(0,0,0,.5);
          font-size: 10px; pointer-events: none; }
        .awoo-core-profile-hud-title { font-weight: 600; margin-bottom: 4px; border-bottom: 1px solid var(--awoo-border); padding-bottom: 2px; }
        .awoo-core-profile-hud-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--awoo-s1) var(--awoo-s4); }
        .awoo-core-profile-hud-item { display: flex; align-items: center; justify-content: space-between; }
      `;
      // Injected once, keyed by id: during a Core update Tampermonkey can
      // briefly have two copies live, and two identical <style> blocks double
      // every rule that stacks (borders, padding) rather than replacing it.
      if (!document.getElementById(STYLE_ID)) document.head.appendChild(style);

      const group = document.createElement('div');
      group.id = 'awoo-core-group';
      const coreBtn = document.createElement('button');
      coreBtn.id = 'awoo-core-btn';
      coreBtn.type = 'button';
      coreBtn.textContent = 'AWOO+ ▾';
      const quickRow = document.createElement('div');
      quickRow.id = 'awoo-core-quick-row';
      group.appendChild(coreBtn);
      group.appendChild(quickRow);

      const dropdown = document.createElement('div');
      dropdown.id = 'awoo-core-dropdown';
      dropdown.style.display = 'none';
      dropdown.innerHTML = `
        <div class="awoo-core-modules-head">
          <div class="awoo-core-section-label">Modules<span class="awoo-core-info-icon"
            data-tooltip="Turns a module on or off. The buttons in the top bar only show or hide a window - a hidden module keeps running and still rings its alarm." data-tooltip-dev="This is the only place that changes enabled state. setEnabled() force-closes the window on disable, because hiding a panel while its heartbeat kept running is how someone ended up with an alarm they could not find."
            ><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="6.3"/><line x1="8" y1="7.2" x2="8" y2="11.3" stroke-linecap="round"/><circle cx="8" cy="4.9" r="0.9" fill="currentColor" stroke="none"/></svg></span></div>
          <div class="awoo-core-head-actions">
            <button class="awoo-core-subtle-icon-btn" type="button" id="awoo-core-disable-all" data-tooltip="Disable all modules"
              ><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="4" y="4" width="8" height="8" rx="1"/></svg></button>
            <button class="awoo-core-subtle-icon-btn" type="button" id="awoo-core-reset-positions" data-tooltip="Bring every window back on-screen" data-tooltip-right
              ><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13 8A5 5 0 1 1 11.3 4.5"/><path d="M13 3.2v3.3h-3.3"/></svg></button>
          </div>
        </div>
        <div id="awoo-core-module-rows"></div>
        <div id="awoo-core-tools-block" style="display:none">
          <div class="awoo-core-separator"></div>
          <div class="awoo-core-section-label">Tools<span class="awoo-core-info-icon"
            data-tooltip="Standalone calculators and references. These open in a new tab and have no on/off state - there is nothing running to disable."
            ><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="6.3"/><line x1="8" y1="7.2" x2="8" y2="11.3" stroke-linecap="round"/><circle cx="8" cy="4.9" r="0.9" fill="currentColor" stroke="none"/></svg></span></div>
          <div id="awoo-core-tool-rows"></div>
        </div>
        <div id="awoo-core-profile-block">
          <div class="awoo-core-separator"></div>
          <div class="awoo-core-profile-head">
            <div class="awoo-core-section-label">Profile Sync<span class="awoo-core-info-icon"
              data-tooltip="Live snapshot of character stats, boosts, pets, partner, sanctum, and gear for downstream optimizers."
              ><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="6.3"/><line x1="8" y1="7.2" x2="8" y2="11.3" stroke-linecap="round"/><circle cx="8" cy="4.9" r="0.9" fill="currentColor" stroke="none"/></svg></span></div>
            <div class="awoo-core-head-actions">
              <button class="awoo-core-subtle-icon-btn" type="button" id="awoo-core-resync-profile" data-tooltip="Force resync profile now"
                ><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13 8A5 5 0 1 1 11.3 4.5"/><path d="M13 3.2v3.3h-3.3"/></svg></button>
              <button class="awoo-core-subtle-icon-btn" type="button" id="awoo-core-copy-profile" data-tooltip="Copy active profile snapshot (JSON)" data-tooltip-right
                ><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="7" height="8" rx="1"/><path d="M3.5 10V4a1 1 0 0 1 1-1H10"/></svg></button>
            </div>
          </div>
          <div id="awoo-core-profile-row" class="awoo-core-profile-row">
            <div class="awoo-core-profile-status-summary">
              <span id="awoo-core-profile-dot" class="awoo-profile-dot"></span>
              <span id="awoo-core-profile-time">Not synced</span>
            </div>
            <div id="awoo-core-profile-chips" class="awoo-core-profile-chips"></div>
            <div id="awoo-core-profile-hud" class="awoo-core-profile-hud" style="display:none">
              <div class="awoo-core-profile-hud-title">Category Status</div>
              <div id="awoo-core-profile-hud-grid" class="awoo-core-profile-hud-grid"></div>
            </div>
          </div>
        </div>
        <div class="awoo-core-separator"></div>
        <div class="awoo-core-bottom-icons">
          <button class="awoo-core-icon-btn" type="button" id="awoo-core-open-settings" data-tooltip="Settings">⚙</button>
          <button class="awoo-core-icon-btn" type="button" id="awoo-core-open-jobs" data-tooltip="Progress and results from the Companion, if it is running. Set it up in Settings." data-tooltip-dev="Nothing shipped submits a job yet - the tier exists for work too large for a tab. server/README.md section 8.3 lists what is host-required versus host-optional." data-tooltip-wide>⧗</button>
          <button class="awoo-core-icon-btn" type="button" id="awoo-core-copy-diag" data-tooltip="Copy debug info to share" data-tooltip-dev="Runs __awooDiag() and copies its text output to the clipboard - the same thing calling it yourself in the console (F12) would print." data-tooltip-right
            ><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="7" height="8" rx="1"/><path d="M3.5 10V4a1 1 0 0 1 1-1H10"/></svg></button>
          <!-- Far right, and a DOWNLOAD arrow rather than the circular one it
               used to share with the position reset. Two buttons doing
               unrelated things wore the same glyph, which is a coin-flip every
               time you reach for one. Reset-positions kept the circular arrow
               (it means "put it back") and moved up beside Disable all, where
               the other whole-overlay controls are. -->
          <button class="awoo-core-icon-btn" type="button" id="awoo-core-check-updates" data-tooltip="Check for updates" data-tooltip-right
            ><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.5v7.5"/><path d="M5 7.2 8 10.2l3-3"/><path d="M3 12.5h10"/></svg></button>
        </div>
        <div class="awoo-core-version-row">
          <span id="awoo-core-self-ver"></span>
          <span id="awoo-core-self-update" style="margin-left:auto"></span>
        </div>
      `;
      document.body.appendChild(dropdown);
      const moduleRows = dropdown.querySelector('#awoo-core-module-rows');
      const toolRows = dropdown.querySelector('#awoo-core-tool-rows');
      const toolsBlock = dropdown.querySelector('#awoo-core-tools-block');
      const disableAllBtn = dropdown.querySelector('#awoo-core-disable-all');
      const resetPositionsBtn = dropdown.querySelector('#awoo-core-reset-positions');
      const openSettingsBtn = dropdown.querySelector('#awoo-core-open-settings');
      const checkUpdatesBtn = dropdown.querySelector('#awoo-core-check-updates');
      disableAllBtn.addEventListener('click', (e) => { e.stopPropagation(); disableAll(); });
      resetPositionsBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        closeDropdown();
        const ok = await ui.confirmDialog({
          title: 'Reset window positions',
          // ENUMERATED, because "reset" is a word people press cautiously and
          // a vague one gets pressed either never or by accident. Each line is
          // a thing that will visibly change, and the last two say what is
          // deliberately left alone so nobody reaches for this expecting it.
          message: 'This will:\n'
            + '  \u2022 move every OPEN module window back to its default position\n'
            + '  \u2022 move the Settings window back, and return it to its default size\n\n'
            + 'It will NOT change the size of module windows, or any other setting. '
            + 'For sizes too, use "Reset window sizes" in Settings.',
          confirmLabel: 'Reset positions',
        });
        if (ok) resetPositions();
      });
      openSettingsBtn.addEventListener('click', (e) => { e.stopPropagation(); closeDropdown(); openSettingsWindow(); });
      // Beside Settings rather than in the tools list: a tool row is labelled
      // "opens in a new tab" and this is an in-page window, so listing it there
      // would promise the wrong thing.
      dropdown.querySelector('#awoo-core-open-jobs')
        .addEventListener('click', (e) => { e.stopPropagation(); closeDropdown(); openJobsWindow(); });
      // REQUESTED 2026-09-10 — the actual ask was "an easy way to share
      // debug info with you", not a console specifically (weighed both:
      // a custom in-page console would run at the SAME privilege as the
      // real DevTools one — Tampermonkey's @grant none shares the page's
      // own window — so it would not be more CAPABLE, only differently
      // packaged, and getting it to feel as good as the real console
      // (history, multi-line input, readable object output) is ongoing
      // work chasing a tool that already exists for free). One button that
      // runs the diagnostic already built for exactly this (__awooDiag(),
      // below) and puts it straight on the clipboard covers the actual
      // request without any of that.
      dropdown.querySelector('#awoo-core-copy-diag').addEventListener('click', async (e) => {
        e.stopPropagation();
        const text = window.__awooDiag();
        const copied = await copyTextToClipboard(text);
        toast(copied ? 'Debug info copied — paste it into chat.' : 'Could not copy automatically — it is in the console (F12) instead.',
          { type: copied ? 'success' : 'warn', duration: 4000 });
      });
      checkUpdatesBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        checkForUpdates(true).then(() => {
          if (!updateState.available.length && !updateState.error) {
            toast('Everything is up to date.', { type: 'success', duration: 3000 });
          }
        });
      });

      const resyncProfileBtn = dropdown.querySelector('#awoo-core-resync-profile');
      if (resyncProfileBtn) {
        resyncProfileBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          resyncProfile();
          toast('Requested profile sync...', { type: 'info', duration: 2500 });
        });
      }
      const copyProfileBtn = dropdown.querySelector('#awoo-core-copy-profile');
      if (copyProfileBtn) {
        copyProfileBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const p = getProfile();
          if (!p) {
            toast('No profile snapshot available yet.', { type: 'warn', duration: 3000 });
            return;
          }
          const copied = await copyTextToClipboard(JSON.stringify(p, null, 2));
          toast(copied ? 'Profile snapshot copied to clipboard.' : 'Could not copy profile snapshot automatically.',
            { type: copied ? 'success' : 'warn', duration: 3000 });
        });
      }
      const profileRow = dropdown.querySelector('#awoo-core-profile-row');
      const profileHud = dropdown.querySelector('#awoo-core-profile-hud');
      if (profileRow && profileHud) {
        profileRow.addEventListener('mouseenter', () => { profileHud.style.display = 'block'; });
        profileRow.addEventListener('mouseleave', () => { profileHud.style.display = 'none'; });
      }

      // Number-format cycling moved into the Settings window (openSettingsWindow) —
      // it needs room to show the decimal/thousands separators and the
      // detected-vs-forced state clearly, which the compact dropdown doesn't have.

      // REPORTED BUG, fixed here rather than worked around: this used to place
      // the dropdown at coreBtn's left edge with no width check at all, so a
      // button sitting near the right edge of the viewport (the floating
      // fallback in particular — see .awoo-core-floating, top:8/right:8)
      // opened a menu that ran straight off the screen. positionDropdownNearAnchor
      // measures the button's LIVE rect and the menu's real size, then flips
      // alignment instead of overflowing.
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
        // Cheap and local: never show a row the user has already acted on.
        dropAlreadyInstalled();
        renderUpdateRow();
        placeDropdown();
        dropdown.style.display = 'block';
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

      const selfVer = dropdown.querySelector('#awoo-core-self-ver');
      const selfUpdate = dropdown.querySelector('#awoo-core-self-update');
      coreUi = {
        group, coreBtn, quickRow, dropdown, moduleRows, toolRows, toolsBlock, selfVer, selfUpdate,
        // reachable from the shared browser-resize listener outside buildUi()'s closure
        repositionDropdownIfOpen,
      };
      if (selfVer) selfVer.textContent = 'Core v' + RELEASE.version;
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
    function renderQuickRow() {
      const shown = enabledOrder.filter((id) => modules[id]).slice(0, maxQuickButtons);
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
    let activeProfile = null;
    const profileListeners = new Set();
    const PROFILE_STORAGE_KEY = 'awoo:profile:v1';
    let profileSaveTimer = null;
    let profileBc = null;

    try {
      if (typeof BroadcastChannel !== 'undefined') {
        profileBc = new BroadcastChannel('awoo-profile');
        profileBc.onmessage = (event) => {
          const data = event && event.data;
          if (!data || typeof data !== 'object') return;
          if (data.type === 'PROFILE_UPDATED' && data.profile) {
            setProfile(data.profile, true /* fromBc */);
          } else if (data.type === 'REQUEST_PROFILE_SYNC') {
            resyncProfile(true /* fromBc */);
          }
        };
      }
    } catch (e) { /* ignore */ }

    function loadCachedProfile() {
      if (activeProfile) return activeProfile;
      try {
        const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
        if (raw) {
          activeProfile = JSON.parse(raw);
        }
      } catch (e) {
        // refuse corrupted data
      }
      return activeProfile;
    }

    function saveProfileDebounced(profile) {
      if (profileSaveTimer) clearTimeout(profileSaveTimer);
      profileSaveTimer = setTimeout(() => {
        profileSaveTimer = null;
        try {
          if (profile) {
            localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
          }
        } catch (e) { /* ignore quota errors */ }
      }, 300);
    }

    function setProfile(data, fromBc) {
      if (!data || typeof data !== 'object') return;
      activeProfile = data;
      saveProfileDebounced(data);
      if (!fromBc && profileBc) {
        try {
          profileBc.postMessage({ type: 'PROFILE_UPDATED', profile: data, timestamp: Date.now() });
        } catch (e) { /* ignore */ }
      }
      for (const fn of profileListeners) {
        try { fn(activeProfile); } catch (e) { console.error('[AwooCore:Profile] Listener error:', e); }
      }
      renderProfileRow();
    }

    function getProfile() {
      if (!activeProfile) loadCachedProfile();
      return activeProfile;
    }

    function subscribeProfile(fn) {
      if (typeof fn !== 'function') return () => {};
      profileListeners.add(fn);
      const cur = getProfile();
      if (cur) {
        try { fn(cur); } catch (e) { /* ignore */ }
      }
      return () => { profileListeners.delete(fn); };
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

    const PROFILE_CATEGORIES = [
      { id: 'core', label: 'Core & VIP' },
      { id: 'baseStats', label: 'Base Stats' },
      { id: 'statBoosts', label: 'Stat Boosts' },
      { id: 'incomeBoosts', label: 'Income Multipliers' },
      { id: 'pets', label: 'Pets & Slots' },
      { id: 'partner', label: 'Partner' },
      { id: 'sanctum', label: 'Sanctum Maps' },
      { id: 'sculpture', label: 'Sculptures' },
      { id: 'fighters', label: 'Fighters' },
      { id: 'equipment', label: 'Equipment & Gems' },
      { id: 'village', label: 'Village & PvP' },
      { id: 'party', label: 'Party' },
    ];

    // The dropdown REPORTS the auto-sync setting and never toggles it: one
    // setting, one switch (Settings › Profile). A second switch here would be
    // a second place for the two to disagree.
    function autoSyncSuffix() {
      return getSetting('profileAutoSync') ? '' : ' · auto-sync off';
    }

    function renderProfileRow() {
      if (!coreUi || !coreUi.dropdown) return;
      const dot = coreUi.dropdown.querySelector('#awoo-core-profile-dot');
      const time = coreUi.dropdown.querySelector('#awoo-core-profile-time');
      const chips = coreUi.dropdown.querySelector('#awoo-core-profile-chips');
      const hudGrid = coreUi.dropdown.querySelector('#awoo-core-profile-hud-grid');
      if (!dot || !time || !chips || !hudGrid) return;

      const profile = getProfile();
      if (!profile) {
        dot.className = 'awoo-profile-dot';
        time.textContent = 'Not synced' + autoSyncSuffix();
        chips.innerHTML = '<span class="awoo-profile-chip missing">No data</span>';
        hudGrid.innerHTML = PROFILE_CATEGORIES.map((c) => `
          <div class="awoo-core-profile-hud-item">
            <span style="opacity:.6">${c.label}</span>
            <span style="opacity:.4">Missing</span>
          </div>
        `).join('');
        return;
      }

      const ts = profile.meta && profile.meta.timestamp ? profile.meta.timestamp : null;
      time.textContent = formatTimeAgo(ts) + autoSyncSuffix();
      dot.className = 'awoo-profile-dot awoo-profile-dot-live';

      const keyPills = [
        { key: 'baseStats', label: 'Stats' },
        { key: 'statBoosts', label: 'Boosts' },
        { key: 'pets', label: 'Pets' },
        { key: 'partner', label: 'Partner' },
        { key: 'sculpture', label: 'Sculpt' },
      ];
      chips.innerHTML = keyPills.map((p) => {
        const has = profile[p.key] !== null && profile[p.key] !== undefined;
        return `<span class="awoo-profile-chip ${has ? 'ok' : 'missing'}">${p.label}</span>`;
      }).join('');

      hudGrid.innerHTML = PROFILE_CATEGORIES.map((c) => {
        const val = profile[c.id];
        const ok = val !== null && val !== undefined;
        return `
          <div class="awoo-core-profile-hud-item">
            <span style="opacity:.85">${c.label}</span>
            <span style="color:${ok ? 'var(--awoo-success)' : 'var(--awoo-muted)'}; font-weight:${ok ? '600' : 'normal'}">${ok ? 'OK' : 'Missing'}</span>
          </div>
        `;
      }).join('');
    }

    const profileApi = {
      get autoSync() { return !!getSetting('profileAutoSync'); },
      get: getProfile,
      set: setProfile,
      subscribe: subscribeProfile,
      resync: resyncProfile,
      probeConvexClient,
    };

    // ---- Settings window (v6.1) ----
    //
    // A real window, not dropdown icons — number formatting needs room to
    // show BOTH separators and whether detection actually worked, and more
    // settings are coming (see the note in openSettingsWindow's body).
    let settingsHandle = null;
    let settingsUi = null;
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
      if (!settingsHandle) {
        settingsHandle = createWindow({
          // Deliberately NOT resizable: a settings panel's job is to lay out
          // cleanly at one size, not to be fought with — the content itself
          // is sized to fit within this, and the body only scrolls once a
          // future tab genuinely overflows it.
          id: 'awoo-core-settings', title: 'AWOO+ Settings',
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

      const tabs = [];
      let activeTabId = null;
      // Assigned once selectTabLazily exists further down; renderSide's click
      // handlers call through this rather than capturing either function
      // directly, so there is exactly one code path for "show a tab" and it
      // is the one that also renders the tab.
      let selectTabByIdLazily = (id) => selectTab(id);
      function addTab(id, label, group) {
        const pane = document.createElement('div');
        pane.className = 'awoo-settings-pane';
        pane.hidden = true;
        paneHost.appendChild(pane);
        tabs.push({ id, label, group, pane });
        return pane;
      }
      function selectTab(id) {
        const found = tabs.find((t) => t.id === id) || tabs[0];
        if (!found) return;
        activeTabId = found.id;
        for (const t of tabs) t.pane.hidden = t !== found;
        renderSide();
      }
      function renderSide() {
        side.innerHTML = '';
        let lastGroup = null;
        for (const t of tabs) {
          if (t.group !== lastGroup) {
            const h = document.createElement('div');
            h.className = 'awoo-settings-side-h';
            h.textContent = t.group;
            side.appendChild(h);
            lastGroup = t.group;
          }
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'awoo-settings-side-i' + (t.id === activeTabId ? ' on' : '');
          b.textContent = t.label;
          // selectTabLazily, NOT selectTab. This was the bug behind "module
          // settings tabs are empty from the sidebar but appear when I use the
          // gear on the module window": the gear routes through
          // openSettingsWindow -> settingsUi.selectTab, which IS the lazy
          // version, while the sidebar called the raw one -- which swaps which
          // pane is visible and never renders its content. A pane whose
          // _render has not run is simply an empty div, so the symptom was a
          // correctly-selected, entirely blank tab.
          //
          // Late-bound through a wrapper because selectTabLazily is defined
          // below this function (it needs the tab list to exist first), and
          // capturing it by value here would capture undefined.
          b.addEventListener('click', () => selectTabByIdLazily(t.id));
          side.appendChild(b);
        }
      }

      const paneGeneral = addTab('general', 'General', 'Core');
      const paneJobs = addTab('jobs', 'Companion', 'Core');

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

      // ---- number format ----
      const numGroup = document.createElement('div');
      numGroup.className = 'awoo-ui-group';
      const numLabel = document.createElement('div');
      numLabel.style.cssText = 'font-weight:bold; opacity:.7; text-transform:uppercase; font-size:10px; letter-spacing:.04em;';
      numLabel.textContent = 'Number format';
      numGroup.appendChild(numLabel);
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
      category(paneGeneral, 'Numbers');
      paneGeneral.appendChild(numGroup);

      // ---- appearance ----
      // A dropdown, not a checkbox — "liveAdaptTheme" is still the only
      // setting underneath it (2 real states today), but this is the shape a
      // future third state (another named preset, then a custom saved
      // theme — explicitly asked for, explicitly deferred) slots into
      // without another rebuild of this section.
      const themeGroup = document.createElement('div');
      themeGroup.className = 'awoo-ui-group';
      themeGroup.style.cssText = 'margin-top:10px;';
      const themeLabel = document.createElement('div');
      themeLabel.style.cssText = 'font-weight:bold; opacity:.7; text-transform:uppercase; font-size:10px; letter-spacing:.04em; margin-bottom:4px;';
      themeLabel.textContent = 'Appearance';
      themeGroup.appendChild(themeLabel);

      const themeSelectRow = document.createElement('div');
      themeSelectRow.style.cssText = 'display:flex; align-items:center; gap:8px; font-size:11.5px;';
      const themeSelectLabel = document.createElement('span');
      themeSelectLabel.textContent = 'Theme';
      themeSelectLabel.style.opacity = '.85';
      const themeSelect = document.createElement('select');
      themeSelect.style.cssText = 'font: inherit; font-size:11px; background: var(--awoo-input); '
        + 'color: var(--awoo-foreground); border: 1px solid var(--awoo-border); border-radius:4px; '
        + 'padding:3px 6px; margin-left:auto;';
      const optAwoo = document.createElement('option');
      optAwoo.value = 'awooTurquoise';
      optAwoo.textContent = 'AWOO Turquoise';
      const optAuto = document.createElement('option');
      optAuto.value = 'auto';
      optAuto.textContent = 'Auto-adapt to live game CSS';
      themeSelect.appendChild(optAwoo);
      themeSelect.appendChild(optAuto);
      themeSelect.value = getSetting('liveAdaptTheme') ? 'auto' : 'awooTurquoise';
      themeSelect.addEventListener('change', () => setSetting('liveAdaptTheme', themeSelect.value === 'auto'));
      themeSelectRow.appendChild(themeSelectLabel);
      themeSelectRow.appendChild(themeSelect);
      themeSelectRow.appendChild(ui.infoIcon(
        '"AWOO Turquoise" (default): a fixed snapshot, so it looks right immediately and never shifts. '
        + '"Auto-adapt": colors are read live from the game\'s own CSS variables instead.',
      ));
      themeGroup.appendChild(themeSelectRow);
      category(paneGeneral, 'Appearance');
      onReset(() => { themeSelect.value = getSetting('liveAdaptTheme') ? 'auto' : 'awooTurquoise'; });
      paneGeneral.appendChild(themeGroup);

      // ---- windows ----
      const windowsGroup = document.createElement('div');
      windowsGroup.className = 'awoo-ui-group';
      windowsGroup.style.cssText = 'margin-top:10px;';
      const windowsLabel = document.createElement('div');
      windowsLabel.style.cssText = 'font-weight:bold; opacity:.7; text-transform:uppercase; font-size:10px; letter-spacing:.04em; margin-bottom:4px;';
      windowsLabel.textContent = 'Windows';
      windowsGroup.appendChild(windowsLabel);

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
        label: 'Settings window size',
        type: 'select',
        value: getSetting('settingsSize'),
        options: Object.keys(SETTINGS_SIZES).map((k) => ({
          value: k, label: `${SETTINGS_SIZES[k].label} (${SETTINGS_SIZES[k].w}x${SETTINGS_SIZES[k].h})`,
        })),
        info: 'Pick a size. "Reset window positions" in the menu puts it back.',
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
          + 'module and tool has current stats. OFF: it only updates when you press "Resync now" in '
          + 'the AWOO+ menu.',
        checked: !!getSetting('profileAutoSync'),
        onChange: (v) => setSetting('profileAutoSync', v),
      });
      profileGroup.appendChild(profileToggle);
      onReset(() => {
        const pt = profileToggle.querySelector('input[type="checkbox"]');
        if (pt) pt.checked = !!getSetting('profileAutoSync');
      });
      category(paneGeneral, 'Profile');
      paneGeneral.appendChild(profileGroup);

      category(paneGeneral, 'Developer');
      const devGroup = document.createElement('div');
      devGroup.className = 'awoo-ui-group';
      devGroup.appendChild(Core_ui_toggleRow({
        label: 'Show developer notes in hover text',
        info: 'Adds a tinted second half to hover text, explaining why things work the way they do.',
        checked: getSetting('showDevTooltips'),
        onChange: (v) => setSetting('showDevTooltips', v),
      }));
      onReset(() => {
        const dv = devGroup.querySelector('input[type="checkbox"]');
        if (dv) dv.checked = !!getSetting('showDevTooltips');
      });
      paneGeneral.appendChild(devGroup);

      category(paneGeneral, 'Windows');
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
      paneGeneral.appendChild(windowsGroup);

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
        // the weaker grants are off the table (HANDOFF rule 1). What it CAN do
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
      // than silence. The running list still lives in HANDOFF.md.

      // ---- module tabs ----
      //
      // A module supplies { label, render(container) } and gets its own pane.
      // Rendered lazily, ONCE, the first time its tab is opened: a module's
      // settings pane may read live game state, and building all of them up
      // front would run every module's probe because someone opened Settings
      // to change the theme.
      for (const id of Object.keys(modules)) {
        const mod = modules[id];
        const spec = mod && mod.settings;
        if (!spec || typeof spec.render !== 'function') continue;
        const pane = addTab(id, spec.label || mod.label || id, 'Modules');
        pane._render = () => {
          try { spec.render(pane); } catch (e) {
            console.error('[AwooCore] settings tab for ' + id + ' threw', e);
            pane.textContent = 'This module\'s settings could not be shown.';
          }
        };
      }
      const renderedTabs = new Set();
      const selectTabLazily = (id) => {
        selectTab(id);
        const t = tabs.find((x) => x.id === activeTabId);
        if (t && t.pane._render && !renderedTabs.has(t.id)) {
          renderedTabs.add(t.id);
          t.pane._render();
        }
      };
      selectTabByIdLazily = selectTabLazily;
      selectTabLazily('general');

      return {
        root,
        selectTab: selectTabLazily,
        renderHostStatus,
        renderNumberFormat() {
          const c = getConvention();
          const auto = c.source !== 'override';
          const sourceLabel = c.source === 'setting' ? "the game's own numberLocale setting"
            : c.source === 'sample' ? 'a number rendered on this page'
            : c.source === 'browser' ? 'your browser locale' : 'a manual override';
          numStatus.innerHTML = '';
          const line1 = document.createElement('div');
          line1.textContent = `Sample: ${formatNumber(1234567.8)}  (decimal "${c.decimal}", thousands "${c.group}")`;
          const line2 = document.createElement('div');
          line2.style.cssText = auto ? 'color:var(--awoo-success);' : 'color:var(--awoo-warn);';
          line2.textContent = auto ? `✓ Auto-detected from ${sourceLabel}.` : `Forced by you (not auto-detected).`;
          numStatus.appendChild(line1);
          numStatus.appendChild(line2);
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
      input.style.cssText = 'width:13px; height:13px; accent-color: var(--awoo-primary); margin:0;';
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
    function renderUpdateRow() {
      if (!coreUi) return;
      // THREE STATES, AND THE THIRD IS THE POINT. This used to render only
      // "an update exists" and otherwise nothing at all, so a check that ran
      // and found nothing looked exactly like a check that never ran — the
      // question behind "tell me when it finds nothing" is not *is there an
      // update*, it is *did the check actually happen*. Hence the timestamp.
      if (coreUi.selfUpdate) {
        const box = coreUi.selfUpdate;
        box.innerHTML = '';
        const entry = updateState.available.find((e) => e.id === 'awoo-core');
        const others = updateState.available.length - (entry ? 1 : 0);
        if (updateState.checking) {
          const el = document.createElement('span');
          el.textContent = 'Checking…';
          box.appendChild(el);
        } else if (entry || others > 0) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'awoo-core-self-update-btn';
          btn.textContent = entry ? `Core ${entry.to} available ↗` : 'Update available ↗';
          btn.title = entry
            ? (entry.notes || `${entry.from} → ${entry.to}. Opens the script so Tampermonkey can install it.`)
            : `${others} module update${others === 1 ? '' : 's'} available. Opens the first; see the rows above for the rest.`;
          // REPORTED BUG (2026-09-10): "clicking Update available does
          // nothing." This button always LOOKED clickable, but only ever
          // got a click handler when `entry` (a Core-specific update)
          // existed — the module-only branch (Core itself is current, but
          // one or more modules have an update) rendered the exact same
          // button with no listener at all. Same fallback the "N updates
          // available" toast already uses for the same ambiguity (one
          // button, several possible targets): open the first entry: only
          // Tampermonkey lets you install several updates from one click.
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openUpdate(entry || updateState.available[0]);
          });
          box.appendChild(btn);
        } else if (!RELEASE.manifestUrl) {
          // NOT A FAILURE. A dev/proxy build deliberately has no manifest URL
          // -- there is nothing to check against, by design -- and the
          // three-state footer originally rendered that through the error
          // branch, so pressing Update on the proxy reported "Check failed".
          // Reported immediately after it shipped. "Off" and "broken" are
          // different states and the whole point of this footer is that a
          // check which did not happen must not look like one that did.
          const el = document.createElement('span');
          el.textContent = 'dev build — updates off';
          el.title = 'This build came from the dev proxy, so it has no update URL baked in. '
            + 'Rebuild from src/ to change it; the live channel is what checks for updates.';
          box.appendChild(el);
        } else if (updateState.error) {
          const el = document.createElement('span');
          el.className = 'awoo-core-update-warn';
          el.textContent = 'Check failed';
          el.title = updateState.error;
          box.appendChild(el);
        } else if (updateState.checkedAt) {
          const el = document.createElement('span');
          el.className = 'awoo-core-update-ok';
          el.textContent = 'Up to date · ' + shortAgo(updateState.checkedAt);
          el.title = 'Last checked ' + new Date(updateState.checkedAt).toLocaleString();
          box.appendChild(el);
        }
      }
      if (coreUi.moduleRows) renderDropdown();
    }

    // Relative, from a stored timestamp — never accumulated (INSTRUMENTATION §4.4).
    function shortAgo(atMs) {
      const s = Math.max(0, Math.round((Date.now() - atMs) / 1000));
      if (s < 60) return 'just now';
      if (s < 3600) return Math.round(s / 60) + 'm ago';
      if (s < 86400) return Math.round(s / 3600) + 'h ago';
      return Math.round(s / 86400) + 'd ago';
    }

    function renderToolRows() {
      const ids = Object.keys(tools);
      coreUi.toolsBlock.style.display = ids.length ? 'block' : 'none';
      coreUi.toolRows.innerHTML = '';
      for (const id of ids) {
        const tool = tools[id];
        const row = document.createElement('div');
        row.className = 'awoo-core-row';
        const dot = document.createElement('span');
        dot.className = 'awoo-core-sd';
        dot.style.visibility = 'hidden'; // holds the grid column, so tool and module names align
        const label = document.createElement('span');
        label.className = 'awoo-core-row-name';
        label.textContent = tool.label;
        const arrow = document.createElement('span');
        arrow.textContent = '↗';
        arrow.className = 'awoo-core-row-state';
        arrow.title = 'Opens in a new tab';
        row.appendChild(dot);
        row.appendChild(label);
        row.appendChild(arrow);
        row.addEventListener('click', (e) => { e.stopPropagation(); openTool(id); });
        coreUi.toolRows.appendChild(row);
      }
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

    function stateSlot(mod) {
      const el = document.createElement('span');
      const s = mod.enabled ? (mod.state || 'idle') : 'off';
      el.className = 'awoo-core-sd awoo-core-sd-' + s;
      if (STATE_GLYPH[s]) el.textContent = STATE_GLYPH[s];
      return el;
    }

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

    function renderDropdown() {
      renderToolRows();
      coreUi.moduleRows.innerHTML = '';
      for (const id of Object.keys(modules)) {
        const mod = modules[id];
        const row = document.createElement('div');
        row.className = 'awoo-core-row awoo-core-row-module'
          + (mod.enabled ? ' awoo-core-row-enabled' : '');
        row.appendChild(stateSlot(mod));
        const label = document.createElement('span');
        label.className = 'awoo-core-row-name';
        label.textContent = mod.label;
        // The version moved OUT of every row and into the dropdown's footer,
        // which freed the right-hand column for the thing that actually
        // changes — what the module is doing, or that it has an update. A
        // row's own version is still one hover away, so nothing was lost.
        // (Putting it in the script's @name instead would have been the
        // obvious surfacing and is a trap: Tampermonkey identifies a script by
        // @namespace + @name, so a name that changes every release installs a
        // new script every release and updating stops working entirely.)
        row.title = (mod.description ? mod.description + ' — ' : '')
          + (mod.version ? 'v' + mod.version : '');
        row.appendChild(label);

        // The right-hand column carries ONE thing, in priority order: an
        // available update beats a live state, because it is actionable and
        // the state will still be there afterwards.
        const updateEntry = updateState.available.find((e) => e.id === id);
        const state = document.createElement('span');
        state.className = 'awoo-core-row-state';
        if (updateEntry) {
          state.className += ' awoo-core-row-state-live';
          state.textContent = `${updateEntry.from} → ${updateEntry.to}`;
          row.title = updateEntry.notes || row.title;
          state.style.cursor = 'pointer';
          state.addEventListener('click', (e) => { e.stopPropagation(); openUpdate(updateEntry); });
        } else {
          state.textContent = stateText(mod);
          if (mod.enabled && (mod.state === 'attention' || mod.state === 'problem')) {
            state.className += ' awoo-core-row-state-live';
          }
        }
        // A SECOND, FASTER HOVER, deliberately narrower than the row's own.
        // The row carries a native `title` (description + version), which the
        // browser shows after its own ~1s delay — fine for a description
        // nobody is hunting for. The version IS hunted for, so the state cell
        // carries it through Core's own tooltip, which appears immediately.
        //
        // `title=""` on the cell is load-bearing: a native title on an
        // ANCESTOR still shows while hovering a child, so without this you get
        // both bubbles at once, which the tooltip rules here already forbid.
        if (mod.version) {
          state.setAttribute('data-tooltip', mod.label + ' v' + mod.version);
          state.title = '';
        }
        row.appendChild(state);
        row.addEventListener('click', (e) => { e.stopPropagation(); setEnabled(id, !mod.enabled); });
        coreUi.moduleRows.appendChild(row);
      }
      for (const id of Object.keys(duplicates)) {
        const row = document.createElement('div');
        row.className = 'awoo-core-row';
        row.style.cssText = 'opacity:.6;cursor:default';
        row.title = 'Two copies of this module are installed. One is running; '
          + 'delete the older script in the Tampermonkey dashboard.';
        const dot = document.createElement('span');
        dot.className = 'awoo-core-sd awoo-core-sd-problem';
        dot.textContent = '!';
        const label = document.createElement('span');
        label.className = 'awoo-core-row-name';
        label.textContent = `${(modules[id] && modules[id].label) || id} - installed twice`;
        row.appendChild(dot);
        row.appendChild(label);
        row.appendChild(document.createElement('span'));
        coreUi.moduleRows.appendChild(row);
      }

      // A module that refused to register is worse than a missing one: the
      // user installed something and the menu shows no trace of it. Say why.
      for (const id of Object.keys(incompatible)) {
        const info = incompatible[id];
        const row = document.createElement('div');
        row.className = 'awoo-core-row';
        row.style.cssText = 'opacity:.55;cursor:default';
        row.title = `This module needs AWOO+ v${info.needsCore}. Update Core from the row below.`;
        const dot = document.createElement('span');
        dot.className = 'awoo-core-sd awoo-core-sd-attention';
        dot.textContent = '!';
        const label = document.createElement('span');
        label.className = 'awoo-core-row-name';
        label.textContent = `${info.label} — needs Core v${info.needsCore}`;
        row.appendChild(dot);
        row.appendChild(label);
        row.appendChild(document.createElement('span'));
        coreUi.moduleRows.appendChild(row);
      }
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

    function setEnabled(id, enabled) {
      const mod = modules[id];
      if (!mod || mod.enabled === enabled) return;
      mod.enabled = enabled;
      enabledOrder = enabledOrder.filter((x) => x !== id);
      if (enabled) enabledOrder.unshift(id);
      saveState();
      renderQuickRow();
      renderDropdown();
      safely(id, 'onToggle', enabled);
    }

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
      const existing = modules[mod.id];
      modules[mod.id] = Object.assign(
        { enabled: enabledOrder.includes(mod.id), badge: false, open: false },
        existing || {}, mod,
      );
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
      return modules[mod.id];
    }

    function updateTitleBadge() {
      const anyActive = enabledOrder.some((id) => modules[id] && modules[id].enabled && modules[id].badge);
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
      if (coreUi && coreUi.dropdown && !coreUi.dropdown.hidden) renderDropdown();
    }

    function setOpen(id, isOpen) {
      const mod = modules[id];
      if (!mod || mod.open === isOpen) return;
      mod.open = isOpen;
      renderQuickRow();
    }

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
            console.warn(`[AwooCore] "${entry.id}" is installed twice - only one copy is running. `
              + 'Delete the older script in the Tampermonkey dashboard.');
            if (coreUi) renderDropdown();
          }
          seen.add(entry.id);
          continue;
        }
        seen.add(entry.id);
        entry.claimed = true;
        try {
          entry.descriptor = entry.factory(Core) || null;
        } catch (err) {
          entry.failed = true;
          console.error(`[AwooCore] module "${entry.id}" threw while starting; the rest are unaffected:`, err);
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
        if (savedUpd && typeof savedUpd.checkedAt === 'number') {
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
      const mod = modules[id];
      return mod && mod.version ? mod.version : null;
    }

    function persistUpdateState() {
      try {
        localStorage.setItem(UPDATE_KEY, JSON.stringify({
          checkedAt: updateState.checkedAt, available: updateState.available,
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
      if (!manual && Date.now() - updateState.checkedAt < UPDATE_INTERVAL_MS) {
        return Promise.resolve(updateState);
      }
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
            consider(m.id, m.label || (modules[m.id] && modules[m.id].label) || m.id, m);
          }
          updateState.available = entries;
          updateState.checkedAt = Date.now();
          persistUpdateState();
          if (entries.length && !manual) {
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
    coreScope.on(document, 'visibilitychange', () => {
      if (document.visibilityState !== 'visible') {
        // GOING hidden, not coming back — the one moment a pending resize
        // save is about to start being throttled, so give it its immediate
        // path to disk right here rather than trusting the debounce to
        // outrun whatever happens next (a refresh, the tab closing, ...).
        flushAllPendingWindowResizes();
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
    let heartbeats = 0;
    setInterval(() => {
      reanchorNow();
      updateTitleBadge();
      renderProfileRow();
      // First update check after ~30s, then whenever checkForUpdates decides
      // its own 6h interval has passed.
      if (++heartbeats >= 10) checkForUpdates(false);
    }, 3000);

    return {
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
      // module intake — called by every module's shim, and once by Core itself
      claim,
      // transient, non-blocking feedback. Modules should prefer their own
      // panel for anything the user needs to re-read.
      toast,
      checkForUpdates,
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
      getNumberConvention: getConvention,
      numberProvenance,
      setNumberLocaleOverride,
      get maxQuickButtons() { return maxQuickButtons; },
      set maxQuickButtons(v) { maxQuickButtons = v; if (coreUi) renderQuickRow(); },
    };
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
        + `${e.failed ? ' FAILED TO START' : ''}${e.duplicate ? ' (duplicate, not run)' : ''}${loadedBy}`);
    }
    const reg = Core.__modulesForTest;
    lines.push(`Registered: ${Object.keys(reg).join(', ') || 'none'}`);
    for (const id of Object.keys(reg)) {
      lines.push(`  - ${id}: ${reg[id].enabled ? 'enabled' : 'disabled'}`);
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
  const AMBIENT_POLL_MS = 15_000;

  // Canonical base stat order as required by CONVENTIONS.md and optimizer tools
  const BASE_STAT_KEYS = ['strength', 'health', 'dexterity', 'agility'];

  let activeProfile = null;
  let attachedClient = null;
  let captureScheduled = false;

  // ---- Query Extraction Helper ----
  // Scans the active Convex client's optimistic and remote query results.
  // Convex stores active queries in a Map: token -> { udfPath, args, result: { success, value } }
  function extractConvexQueries(client) {
    if (!client) return {};
    const optimistic = client.optimisticQueryResults || (client.client && client.client.optimisticQueryResults);
    const queryMap = optimistic && optimistic.queryResults;
    if (!queryMap || typeof queryMap.forEach !== 'function') return {};

    const queries = {};
    try {
      queryMap.forEach((entry) => {
        if (!entry || !entry.udfPath) return;
        const res = entry.result;
        if (res && res.success && res.value !== undefined) {
          queries[entry.udfPath] = res.value;
        }
      });
    } catch (e) {
      console.warn('[AwooCore:ProfileSync] Failed scanning convex queries:', e);
    }
    return queries;
  }

  // ---- Tier 2: Fiber Bag Scan Fallback ----
  // Scans the React fiber tree for query results or component state if Convex queries
  // map is still empty or uninitialized.
  function scanFiberForProfileData() {
    const data = {};
    if (!Core || !Core.walkFiber) return data;

    Core.walkFiber((cand) => {
      if (!cand || typeof cand !== 'object') return false;

      // Base stats
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

      // Merged multipliers
      if (!data.mergedMultipliers && typeof cand.monsterGoldFlat === 'number' && typeof cand.monsterGoldPercentage === 'number') {
        data.mergedMultipliers = cand;
      }

      // Character core
      if (!data.character && typeof cand.level === 'number' && cand.level > 0 && (cand.name || cand.experience)) {
        data.character = cand;
      }

      // Partner
      if (!data.partner && cand.partner && typeof cand.partner === 'object') {
        data.partner = cand.partner;
      }

      // Pets
      if (!data.pets && cand.petSlots && typeof cand.petSlots === 'object') {
        data.pets = cand;
      }

      // Sanctums
      if (!data.sanctum && Array.isArray(cand.activeSanctums)) {
        data.sanctum = cand.activeSanctums;
      }

      // Sculptures
      if (!data.sculpture && cand.sculptureMultipliers && typeof cand.sculptureMultipliers === 'object') {
        data.sculpture = cand;
      }

      return false; // keep scanning for all items
    }, false /* stopAtFirst = false */);

    return data;
  }

  // ---- Tier 3: DOM Fallback ----
  // Strict non-guessing reader for in-page stats (e.g. from #tutorial-stats or sidebar).
  function scanDomForProfileData() {
    const data = {};
    try {
      // Look for stats container
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

  // ---- Normalization Engine: schema awoo:profile:v1 ----
  // Pure function: takes extracted queries and fiber data, produces canonical profile.
  // INVARIANT (§9.4): refuse rather than guess. Unobserved values MUST be null, never 0.
  function normalizeProfile(q = {}, fiber = {}, dom = {}) {
    // 1. Character & Core
    const rawChar = q['character.public.getCharacter'] ||
                    q['character.queries.getCharacter'] ||
                    fiber.character ||
                    (Core.probeCharacter ? Core.probeCharacter() : null) || {};

    const charName = typeof rawChar.name === 'string' ? rawChar.name : null;
    const charLevel = typeof rawChar.level === 'number' ? Math.round(rawChar.level) : null;
    const vipLevel = typeof rawChar.vip === 'number' ? rawChar.vip : (typeof rawChar.vipLevel === 'number' ? rawChar.vipLevel : null);
    const gold = typeof rawChar.gold === 'number' ? rawChar.gold : (typeof rawChar.gold === 'string' ? Core.parseNumber(rawChar.gold) : null);
    const credits = typeof rawChar.credits === 'number' ? rawChar.credits : null;

    // 2. Base Stats (Strength -> Health -> Dexterity -> Agility)
    const rawStats = q['character.stats.public.getStats'] ||
                     q['character.stats.queries.getStats'] ||
                     fiber.baseStats ||
                     dom.baseStats || null;

    let baseStats = null;
    if (rawStats && typeof rawStats === 'object') {
      const s = typeof rawStats.strength === 'number' ? rawStats.strength : null;
      const h = typeof rawStats.health === 'number' ? rawStats.health : null;
      const d = typeof rawStats.dexterity === 'number' ? rawStats.dexterity : null;
      const a = typeof rawStats.agility === 'number' ? rawStats.agility : null;
      if (s !== null || h !== null || d !== null || a !== null) {
        baseStats = { strength: s, health: h, dexterity: d, agility: a };
      }
    }

    // 3. Merged Multipliers & Boosts
    const merged = q['character.queries.getMergedMultipliers'] ||
                   q['character.public.getMergedMultipliers'] ||
                   fiber.mergedMultipliers ||
                   (Core.probeMergedMultipliers ? Core.probeMergedMultipliers() : null) || {};

    const rawBoosts = q['character.boosts.public.getMergedBoosts'] ||
                      q['character.boosts.public.getBoosts'] ||
                      q['character.boosts.queries.getBoosts'] || {};

    // 10-Source Stat Boost Breakdown
    let statBoosts = null;
    const hasAnyBoost = merged.stat !== undefined || rawBoosts.equipment !== undefined || merged.statStrength !== undefined;
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

    // Income Boosts
    let incomeBoosts = null;
    if (merged.monsterGoldFlat !== undefined || merged.monsterGoldPercentage !== undefined) {
      incomeBoosts = {
        monsterGoldFlat: typeof merged.monsterGoldFlat === 'number' ? merged.monsterGoldFlat : null,
        monsterGoldPercentage: typeof merged.monsterGoldPercentage === 'number' ? merged.monsterGoldPercentage : null,
        potionEffect: typeof merged.potionEffect === 'number' ? merged.potionEffect : null,
        relicBoost: typeof merged.goldRelic === 'number' ? merged.goldRelic : null,
      };
    }

    // 4. Pets & Pet Slots
    const rawPetSlots = q['pets.queries.getPetSlots'] ||
                        q['pets.public.getPetSlots'] ||
                        (fiber.pets && fiber.pets.petSlots) || null;
    const rawEquippedPets = q['pets.queries.getEquippedPets'] ||
                            q['pets.public.getEquippedPets'] ||
                            (fiber.pets && fiber.pets.equippedPets) || null;

    let pets = null;
    if (rawPetSlots || rawEquippedPets) {
      const getSlotData = (type) => {
        const slot = rawPetSlots && rawPetSlots[type];
        const lvl = slot && typeof slot.level === 'number' ? slot.level : null;
        const equipped = rawEquippedPets ? (Array.isArray(rawEquippedPets[type]) ? rawEquippedPets[type] : (rawEquippedPets[type] ? [rawEquippedPets[type]] : [])) : null;
        return {
          slotLevel: lvl,
          equipped: equipped,
        };
      };

      pets = {
        combat: getSlotData('combat'),
        utility: getSlotData('utility'),
        gathering: getSlotData('gathering'),
      };
    }

    // 5. Partner
    const rawPartner = q['partner.public.getPartner'] ||
                       q['partner.queries.getPartner'] ||
                       fiber.partner || null;
    const rawPartnerMerged = q['partner.public.getMergedStats'] ||
                             q['partner.queries.getMergedStats'] || null;

    let partner = null;
    if (rawPartner || rawPartnerMerged) {
      const speed = rawPartner && typeof rawPartner.speed === 'number' ? rawPartner.speed : (rawPartnerMerged && typeof rawPartnerMerged.speed === 'number' ? rawPartnerMerged.speed : null);
      const intAlloc = rawPartner && typeof rawPartner.intelligence === 'number' ? rawPartner.intelligence : (rawPartnerMerged && typeof rawPartnerMerged.intelligence === 'number' ? rawPartnerMerged.intelligence : null);
      // No action interval here, on purpose. This line used to read an
      // identifier that was never defined, so every profile reported exactly
      // 10 s whatever the partner's speed. The real interval (partners.json,
      // the partner action-interval formula) ranges 16.36-180 s, so 10 was
      // never right for anyone. Speed is the observation; the engine derives
      // the interval from it (engine/income/partners.js).
      partner = {
        speed: speed,
        intelligence: intAlloc,
        roster: rawPartner && Array.isArray(rawPartner.roster) ? rawPartner.roster : null,
      };
    }

    // 6. Sanctum
    const rawSanctums = q['sanctum.public.getActiveSanctums'] ||
                        q['sanctum.queries.getActiveSanctums'] ||
                        fiber.sanctum || null;
    const rawSkillTree = q['sanctum.skilltree.public.getActiveSkillTreePoints'] ||
                         q['sanctum.skilltree.queries.getActiveSkillTreePoints'] || null;

    let sanctum = null;
    if (rawSanctums || rawSkillTree) {
      const goldKeyUnlocked = rawSkillTree ? (Array.isArray(rawSkillTree) ? rawSkillTree.includes('w_key_gold') : Boolean(rawSkillTree.w_key_gold)) : null;
      sanctum = {
        activeSanctums: Array.isArray(rawSanctums) ? rawSanctums : null,
        goldKeyPartnerStatsUnlocked: goldKeyUnlocked,
      };
    }

    // 7. Sculpture
    const rawSculptMultipliers = q['fighters.sculptures.public.getSculptureMultipliers'] ||
                                 q['fighters.sculptures.queries.getSculptureMultipliers'] ||
                                 (fiber.sculpture && fiber.sculpture.sculptureMultipliers) || null;
    const rawSculptGrid = q['fighters.sculptures.public.getSculptureGrid'] ||
                          q['fighters.sculptures.queries.getSculptureGrid'] ||
                          (fiber.sculpture && fiber.sculpture.grid) || null;

    let sculpture = null;
    if (rawSculptMultipliers || rawSculptGrid) {
      sculpture = {
        grid: Array.isArray(rawSculptGrid) ? rawSculptGrid : null,
        multipliers: rawSculptMultipliers && typeof rawSculptMultipliers === 'object' ? {
          strength: typeof rawSculptMultipliers.strength === 'number' ? rawSculptMultipliers.strength : null,
          health: typeof rawSculptMultipliers.health === 'number' ? rawSculptMultipliers.health : null,
          dexterity: typeof rawSculptMultipliers.dexterity === 'number' ? rawSculptMultipliers.dexterity : null,
          agility: typeof rawSculptMultipliers.agility === 'number' ? rawSculptMultipliers.agility : null,
        } : null,
      };
    }

    // 8. Fighters
    const rawFighters = q['fighters.public.getFighters'] ||
                        q['fighters.queries.getFighters'] || null;
    let fighters = null;
    if (rawFighters) {
      fighters = {
        roster: Array.isArray(rawFighters) ? rawFighters : (Array.isArray(rawFighters.fighters) ? rawFighters.fighters : null),
      };
    }

    // 9. Equipment & Gems
    const rawEquip = q['equipment.public.getEquipment'] ||
                     q['equipment.queries.getEquipment'] || null;
    const rawGems = q['equipment.gems.public.getGems'] ||
                    q['equipment.gems.queries.getGems'] || null;
    let equipment = null;
    if (rawEquip || rawGems) {
      equipment = {
        slots: rawEquip && typeof rawEquip === 'object' ? rawEquip : null,
        gems: Array.isArray(rawGems) ? rawGems : null,
      };
    }

    // 10. Village & PvP
    const rawVillage = q['village.public.getVillage'] ||
                       q['village.queries.getVillage'] || null;
    const rawPvp = q['pvp.public.getVillageTiles'] ||
                   q['pvp.queries.getVillageTiles'] || null;
    let village = null;
    if (rawVillage || rawPvp) {
      village = {
        buildings: rawVillage ? (Array.isArray(rawVillage) ? rawVillage : (rawVillage.buildings || null)) : null,
        pvpTiles: Array.isArray(rawPvp) ? rawPvp : null,
      };
    }

    // 11. Party
    const rawParty = q['party.public.getParty'] ||
                     q['party.queries.getParty'] || null;
    let party = null;
    if (rawParty) {
      party = {
        id: rawParty._id || rawParty.id || null,
        members: Array.isArray(rawParty.members) ? rawParty.members : null,
      };
    }

    // Determine source
    let source = 'convex';
    if (Object.keys(q).length === 0) {
      source = Object.keys(fiber).length > 0 ? 'fiber' : 'dom';
    }

    return {
      schemaVersion: 1,
      meta: {
        timestamp: Date.now(),
        source: source,
        characterName: charName,
        characterLevel: charLevel,
      },
      core: {
        name: charName,
        level: charLevel,
        vipLevel: vipLevel,
        gold: gold,
        credits: credits,
      },
      baseStats: baseStats,
      statBoosts: statBoosts,
      incomeBoosts: incomeBoosts,
      pets: pets,
      partner: partner,
      sanctum: sanctum,
      sculpture: sculpture,
      fighters: fighters,
      equipment: equipment,
      village: village,
      party: party,
    };
  }

  // ---- Capture & Orchestration ----
  function captureNow() {
    captureScheduled = false;

    // Probe Convex Client
    const client = Core.probeConvexClient ? Core.probeConvexClient() : null;
    if (client && client !== attachedClient) {
      attachedClient = client;
      if (typeof client.addOnTransitionHandler === 'function') {
        try {
          client.addOnTransitionHandler(() => {
            scheduleCapture();
          });
        } catch (e) {
          console.warn('[AwooCore:ProfileSync] Failed hooking Convex transition handler:', e);
        }
      }
    }

    const q = extractConvexQueries(client);
    const fiber = scanFiberForProfileData();
    const dom = scanDomForProfileData();

    // Check if we found anything useful
    const hasData = Object.keys(q).length > 0 || Object.keys(fiber).length > 0 || Object.keys(dom).length > 0;
    if (!hasData) {
      return null;
    }

    const profile = normalizeProfile(q, fiber, dom);
    activeProfile = profile;

    if (Core.profile && typeof Core.profile.set === 'function') {
      Core.profile.set(profile);
    }

    return profile;
  }

  function scheduleCapture() {
    if (captureScheduled) return;
    captureScheduled = true;
    setTimeout(() => {
      captureNow();
    }, 250);
  }

  // ---- BroadcastChannel Cross-Tab Synchronization ----
  let profileBc = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      profileBc = new BroadcastChannel('awoo-profile');
      profileBc.onmessage = (event) => {
        const data = event && event.data;
        if (!data || typeof data !== 'object') return;
        if (data.type === 'REQUEST_PROFILE_SYNC') {
          captureNow();
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
    extractConvexQueries,
    scanFiberForProfileData,
    scanDomForProfileData,
    captureNow,
    getActiveProfile: () => activeProfile,
    BASE_STAT_KEYS,
  };

  // Listen for Core resync events
  window.addEventListener('awoo:profile:resync', () => {
    captureNow();
  });

  // ---- Automatic captures, governed by Settings › Profile ----
  //
  // Everything below is automatic and stops when auto-sync is off; the resync
  // listener above is manual and never does. The background timer is STOPPED
  // when off rather than left ticking and returning early: a timer that fires
  // only to do nothing still wakes a hidden tab, which is the cost §4.4 of
  // INSTRUMENTATION.md exists to avoid.
  const autoSyncOn = () => !(Core.profile && Core.profile.autoSync === false);
  let ambientTimer = null;
  function startAmbient() {
    if (ambientTimer === null) ambientTimer = setInterval(() => { captureNow(); }, AMBIENT_POLL_MS);
  }
  function stopAmbient() {
    if (ambientTimer !== null) { clearInterval(ambientTimer); ambientTimer = null; }
  }
  window.addEventListener('awoo:profile:auto-sync', (e) => {
    if (e && e.detail) { startAmbient(); captureNow(); } else { stopAmbient(); }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && autoSyncOn()) {
      captureNow();
    }
  });

  if (autoSyncOn()) {
    startAmbient();
    setTimeout(() => { captureNow(); }, 1000);
  }
  Core.__profileSyncForTest.isAmbientRunning = () => ambientTimer !== null;
  })();

})();
