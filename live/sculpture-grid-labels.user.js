// ==UserScript==
// @name         AWOO+: Sculpture Grid Labels
// @namespace    awoo-core
// @author       Weeble
// @version      0.1.0
// @description  AWOO+ module (requires "AWOO+"). Sculpture Grid Labels: describe what it does, and say plainly if it ever acts on the page rather than only reading it.
// @match        https://v2.queslar.com/*
// @match        https://*.queslar.com/*
// @grant        none
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/awoo-vibe-sniffa/queslar-releases/main/live/sculpture-grid-labels.user.js
// @downloadURL  https://raw.githubusercontent.com/awoo-vibe-sniffa/queslar-releases/main/live/sculpture-grid-labels.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ==== GENERATED — DO NOT EDIT ====
  // Produced by userscripts/build.mjs from data/. Edit the FACT,
  // then rebuild; editing this block is overwritten and, worse,
  // silently diverges from the core it was supposed to mirror.

  // NO-PROVENANCE: scaffolded by new-module.mjs; sculpture-grid-labels reads no data/ fact yet

  // ==== END GENERATED ====

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
  })("sculpture-grid-labels", "0.1.0", function (Core) {

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
let coreEnabled = false;                                   // Core's switch
let labelsOn = localStorage.getItem(STORAGE_KEY) !== '0';  // the pill
let enabled = false;                                       // = coreEnabled && labelsOn
let running = false;
let lastGridSignature = '';

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

  return btn;
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
        stats,
      ].join('|');
    })
    .sort()
    .join('::');
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
      pctEl.textContent = pct;

      pctEl.style.cssText =
        `font-size:11.5px;font-weight:600;margin-top:3px;color:${statColor};font-variant-numeric:tabular-nums;text-shadow:${LABEL_SHADOW};`;

      label.append(modEl, pctEl);
      btn.appendChild(label);

      if (btn.dataset.qsgOldTitle === undefined) {
        btn.dataset.qsgOldTitle = btn.title || '';
      }

      btn.title =
        `${fullMod}: ${pct}${i === 0 && uniqueType ? ` | ${uniqueType}` : ''}`;
    }
  }
}

// The one place the visible state changes, and the one place Core is told.
function sync() {
  enabled = coreEnabled && labelsOn;
  if (typeof Core.setState === 'function') Core.setState(MODULE_ID, enabled ? 'running' : 'idle', enabled ? 'Overlay on' : 'Overlay off');
  updateToggleAppearance(document.getElementById('awoo-sculpture-grid-labels-toggle'));
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
  localStorage.setItem(STORAGE_KEY, labelsOn ? '1' : '0');
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
    clearOld();
  });

  const registered = Core.registerModule({
    id: MODULE_ID,
    label: 'Sculpture Grid Labels',
    description: 'Shows sculpture mod names and roll percentages directly on the equipped grid.',
    needsCore: 10,
    shortLabel: 'Grid',
    quickButton: false,
    onToggle: (next) => setEnabled(next),
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
