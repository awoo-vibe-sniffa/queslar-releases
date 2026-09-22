// ==UserScript==
// @name         AWOO+: Dungeon Win Rate
// @namespace    awoo-core
// @author       Weeble
// @version      0.1.0
// @description  AWOO+ module (requires "AWOO+"). Dungeon Win Rate: describe what it does, and say plainly if it ever acts on the page rather than only reading it.
// @match        https://v2.queslar.com/*
// @match        https://*.queslar.com/*
// @grant        none
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/awoo-vibe-sniffa/queslar-releases/main/live/dungeon-win-rate.user.js
// @downloadURL  https://raw.githubusercontent.com/awoo-vibe-sniffa/queslar-releases/main/live/dungeon-win-rate.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ==== GENERATED — DO NOT EDIT ====
  // Produced by userscripts/build.mjs from data/. Edit the FACT,
  // then rebuild; editing this block is overwritten and, worse,
  // silently diverges from the core it was supposed to mirror.

  // NO-PROVENANCE: scaffolded by new-module.mjs; dungeon-win-rate reads no data/ fact yet

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
  })("dungeon-win-rate", "0.1.0", function (Core) {

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

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function save(patch) {
  const next = { ...load(), ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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
    if (Core.ui && typeof Core.ui.confirmDialog === 'function') {
      const ok = await Core.ui.confirmDialog({
        title: 'Clear results', danger: true, confirmLabel: 'Clear',
        message: 'Forget the scanned dungeon history on this device? Scanning again rebuilds it.',
      });
      if (!ok) return;
    }
    localStorage.removeItem(STORAGE_KEY);
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

  Core.registerModule({
    id: MODULE_ID,
    label: 'Dungeon Win Rate',
    shortLabel: 'Win rate', // the top-bar button; a full name there crowds the bar
    description: 'Scans dungeon history and summarizes wins, losses, attempts, and win rate.',
    needsCore: 10,
    onToggle: (enabled) => togglePanel(enabled),
    onQuickClick: () => togglePanel(),
    onResetPosition: () => windowHandle.resetPosition(),
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
