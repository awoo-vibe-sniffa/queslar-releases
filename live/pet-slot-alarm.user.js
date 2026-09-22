// ==UserScript==
// @name         AWOO+: Pet Slot Alarm
// @namespace    awoo-core
// @author       Apoz
// @version      4.12.1
// @description  AWOO+ module (requires "AWOO+"). Read-only overlay: estimates time until the Combat pet slot upgrade is affordable from your live gold and the exact upgrade-cost formula (no need to sit on the Pets page), rings a gentle alarm - and optionally a desktop notification - when it is, and stays accurate in a backgrounded tab. Ships the Party Gold ROI calculator. No auto-clicking.
// @match        https://v2.queslar.com/*
// @match        https://*.queslar.com/*
// @grant        none
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/awoo-vibe-sniffa/queslar-releases/main/live/pet-slot-alarm.user.js
// @downloadURL  https://raw.githubusercontent.com/awoo-vibe-sniffa/queslar-releases/main/live/pet-slot-alarm.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ==== GENERATED — DO NOT EDIT ====
  // Produced by userscripts/build.mjs from data/. Edit the FACT,
  // then rebuild; editing this block is overwritten and, worse,
  // silently diverges from the core it was supposed to mirror.

  // formulas/pets.json :: pets.slotUpgrade.costFormula  [CODE]
  function petSlotUpgradeCost(currentLevel, newLevel) { let total = 0; for (let r = currentLevel + 1; r <= newLevel; r++) total += r <= 150 ? Math.floor(500000 * r**3) : Math.floor(500000 * 150**3 * (r/150)**15); return { currency: 'gold', value: total }; } // per-level marginal cost at level L->L+1: floor(500000*(L+1)^3) while L+1<=150, else floor(500000*150^3*((L+1)/150)^15). Exactly continuous at the seam: both branches evaluate to floor(500000*150^3) = 1,687,500,000,000 at r=150.

  // formulas/pets.json :: pets.slotUpgrade.boostFormula  [CODE]
  function petSlotBoostPercent(slotLevel) { let block = Math.floor(slotLevel / 30); let intoBlock = slotLevel % 30; if (block >= 5) return 0.3*5*6/2 + intoBlock*0.01*6; return 0.3*block*(block+1)/2 + intoBlock*0.01*(block+1); }

  // PROVENANCE — generated from this module's facts manifest.
  const PROVENANCE = [
    { file: "formulas/pets.json", fact: "pets.slotUpgrade.costFormula" },
    { file: "formulas/pets.json", fact: "pets.slotUpgrade.boostFormula" },
  ];
  void PROVENANCE; // declaration only — never read at runtime

  // ==== END GENERATED ====

  // ==== GENERATED TOOL PAYLOADS — DO NOT EDIT ====
  // Tool payload: userscripts/src/tools/party-gold-roi.html (generated facts inlined)
  const AWOO_TOOL_PARTY_GOLD_ROI = "<!doctype html>\n<meta charset=\"utf-8\">\n<title>Party Gold ROI</title>\n<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\n<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700;800&family=Azeret+Mono:wght@400;500;600&display=swap\">\n<meta name=\"awoo-tool\" content=\"party-gold-roi\">\n<style>\n/* ===========================================================================\n   AWOO+ THEME TOKENS — GENERATED, DO NOT EDIT BY HAND.\n\n   Source: the AWOO+ Design System (projects/ARTIFACT_STYLE_GUIDE.md Part II,\n   live at https://claude.ai/artifact/3Xv8kdGSd6Lth8MhQEtBrS). Injected into\n   every tool page by userscripts/build.mjs at the <!-- @AWOO_THEME_TOKENS@ -->\n   marker, so one palette correction reaches every tool on the next build.\n\n   SEVEN THEMES, FOUR FAMILIES. A family name carries no mode; the variant\n   does, and only where more than one exists — which is why Slate and Claude\n   Code have no suffix.\n\n     Beach        light · dimmed\n     Slate        (was \"war room\" before the merge)\n     Claude       light · medium · dark\n     Claude Code  (RECONSTRUCTED from the brand register, not sampled)\n\n   ONE CONTRACT. Every theme defines the same 25 tokens and no component ever\n   names a colour, which is what makes an eighth theme a block of properties\n   rather than a rewrite. Two of those tokens exist for specific reasons:\n     --accent-edge     the soft edge of a tinted row. A full-strength accent\n                       ring reads as a frame around a table row, not emphasis\n                       on it.\n     --border-control  inputs, selects and buttons only, clearing WCAG\n                       1.4.11's 3:1 against surface. Table hairlines stay soft\n                       on --border.\n\n   Every text pair in every theme clears WCAG AA; tertiary \"muted\" text is\n   AA-large by design across the whole family.\n   =========================================================================== */\n:root{\n  /* Beach (light) is the base layer, so an un-stamped page is always legible. */\n  --ground:#EFE7D7;\n  --surface:#FAF5EC;\n  --surface-2:#F1E8D8;\n  --surface-3:#E7DCC7;\n  --border:#D8CBB2;\n  --border-strong:#C3B193;\n  --border-control:#8C7D64;\n  --ink:#33291D;\n  --ink-soft:#6B5C48;\n  --ink-mute:#94836C;\n  --accent:#8A4322;\n  --accent-fill:#A8552C;\n  --accent-edge:#D4AB93;\n  --bg-accent:#F3E2D8;\n  --on-accent:#FBF0E6;\n  --success:#3F5C33;\n  --success-fill:#4A6741;\n  --bg-success:#E4EBDC;\n  --danger:#8C2F2A;\n  --danger-fill:#A83A33;\n  --bg-danger:#F5E0DD;\n  --info:#41528A;\n  --bg-info:#E2E5F2;\n  --neutral:#6E5F49;\n  --bg-neutral:#EDE4D3;\n  --dev:#2E6B5C;\n  --bg-dev:#DCEBE6;\n  --shadow:0 1px 2px rgba(60,50,35,.07),0 4px 14px rgba(60,50,35,.06);\n\n  /* TYPE, corrected 2026-09-21 after MEASURING the glyphs rather than\n     recalling them.\n\n     NUMBERS ARE PUBLIC SANS, NOT A MONO FACE. The requirement was a clear,\n     unmarked zero. Measured by rendering each zero at 200px and sampling the\n     centre of its counter (capital O as the control, which reads 0% ink in\n     every face, proving the method): Noto Sans Mono 83%, DM Mono 80%, Roboto\n     Mono 69%, IBM Plex Mono 93%, JetBrains Mono 95%, Space Mono 95%, Cousine\n     100%. Every one of them marks the zero. So does the earlier \"fix\":\n     font-feature-settings \"zero\" 0 changes NOTHING in any of them, because\n     the mark is the default glyph, not an optional feature.\n\n     Public Sans's own zero measures 0% — genuinely open — and\n     font-variant-numeric: tabular-nums makes every digit exactly the same\n     width (measured: all ten at 70px against 40.7-64.75 proportional). Fixed\n     width is what a column needs; a monospaced FACE was never the\n     requirement. So the number face is the text face, with tabular figures.\n\n     --font-mono stays a real mono for identifiers and formula text, where\n     letter alignment matters: Azeret Mono, the only mono of the eight tested\n     whose zero measured 0%. */\n  --font-display:'Public Sans',system-ui,-apple-system,sans-serif;\n  --font-body:'Public Sans',system-ui,-apple-system,sans-serif;\n  --font-num:'Public Sans',system-ui,-apple-system,sans-serif;\n  --font-mono:'Azeret Mono',ui-monospace,'Cascadia Mono',monospace;\n  --display-tracking:-.005em; --display-caps:none;\n  --radius:6px;\n\n  /* DENSITY, 2026-09-21. These are read as data, not prose: a table row and a\n     nav row both want to be tighter than a paragraph. Tokens rather than\n     literals so \"slightly more condensed\" is one edit, everywhere. */\n  --row-y:2px;        /* table cell vertical padding */\n  --row-x:12px;       /* table cell horizontal padding */\n  --nav-y:3px;        /* sidebar nav row */\n  --ctl-y:2px;        /* input and select vertical padding */\n  --ctl-x:6px;\n  --ctl-w:78px;       /* a number input's default width - subtle, not a field */\n  --pad-panel:11px;\n}\n\n/* No explicit choice and a dark OS: Slate. */\n@media (prefers-color-scheme: dark){\n  :root:not([data-theme]){\n    --ground:#14181D;\n    --surface:#1B2027;\n    --surface-2:#20262D;\n    --surface-3:#272F37;\n    --border:#2B323A;\n    --border-strong:#3A434C;\n    --border-control:#6A7684;\n    --ink:#E8EAEB;\n    --ink-soft:#A9B0B6;\n    --ink-mute:#78828B;\n    --accent:#E3B36B;\n    --accent-fill:#C4923F;\n    --accent-edge:#5A4522;\n    --bg-accent:#2E2412;\n    --on-accent:#241300;\n    --success:#84C4AA;\n    --success-fill:#4F8C74;\n    --bg-success:#172E25;\n    --danger:#E28270;\n    --danger-fill:#C1503C;\n    --bg-danger:#351F1A;\n    --info:#B4A4E0;\n    --bg-info:#241F36;\n    --neutral:#9AA6B2;\n    --bg-neutral:#222A32;\n    --dev:#78C8BC;\n    --bg-dev:#14302C;\n    --shadow:0 1px 2px rgba(0,0,0,.4),0 6px 20px rgba(0,0,0,.34);\n  }\n}\n\n/* Beach (light) */\n:root[data-theme=\"beach\"]{\n  --ground:#EFE7D7;\n  --surface:#FAF5EC;\n  --surface-2:#F1E8D8;\n  --surface-3:#E7DCC7;\n  --border:#D8CBB2;\n  --border-strong:#C3B193;\n  --border-control:#8C7D64;\n  --ink:#33291D;\n  --ink-soft:#6B5C48;\n  --ink-mute:#94836C;\n  --accent:#8A4322;\n  --accent-fill:#A8552C;\n  --accent-edge:#D4AB93;\n  --bg-accent:#F3E2D8;\n  --on-accent:#FBF0E6;\n  --success:#3F5C33;\n  --success-fill:#4A6741;\n  --bg-success:#E4EBDC;\n  --danger:#8C2F2A;\n  --danger-fill:#A83A33;\n  --bg-danger:#F5E0DD;\n  --info:#41528A;\n  --bg-info:#E2E5F2;\n  --neutral:#6E5F49;\n  --bg-neutral:#EDE4D3;\n  --dev:#2E6B5C;\n  --bg-dev:#DCEBE6;\n  --shadow:0 1px 2px rgba(60,50,35,.07),0 4px 14px rgba(60,50,35,.06);\n}\n\n/* Beach (dimmed) */\n:root[data-theme=\"beach-dim\"]{\n  --ground:#17181A;\n  --surface:#1E2022;\n  --surface-2:#25282A;\n  --surface-3:#2E3134;\n  --border:#33373A;\n  --border-strong:#4A4F53;\n  --border-control:#6D7378;\n  --ink:#E6E4E0;\n  --ink-soft:#A8A49D;\n  --ink-mute:#7C7872;\n  --accent:#F2B189;\n  --accent-fill:#CC7A50;\n  --accent-edge:#5C412C;\n  --bg-accent:#31241A;\n  --on-accent:#1B0D05;\n  --success:#7CC49A;\n  --success-fill:#3F8A61;\n  --bg-success:#17301F;\n  --danger:#EB8272;\n  --danger-fill:#C0453A;\n  --bg-danger:#341D1B;\n  --info:#A3AEDD;\n  --bg-info:#1F2130;\n  --neutral:#A09B92;\n  --bg-neutral:#26282A;\n  --dev:#7FC9B8;\n  --bg-dev:#16302A;\n  --shadow:0 1px 2px rgba(0,0,0,.4),0 6px 20px rgba(0,0,0,.34);\n}\n\n/* Slate */\n:root[data-theme=\"slate\"]{\n  --ground:#14181D;\n  --surface:#1B2027;\n  --surface-2:#20262D;\n  --surface-3:#272F37;\n  --border:#2B323A;\n  --border-strong:#3A434C;\n  --border-control:#6A7684;\n  --ink:#E8EAEB;\n  --ink-soft:#A9B0B6;\n  --ink-mute:#78828B;\n  --accent:#E3B36B;\n  --accent-fill:#C4923F;\n  --accent-edge:#5A4522;\n  --bg-accent:#2E2412;\n  --on-accent:#241300;\n  --success:#84C4AA;\n  --success-fill:#4F8C74;\n  --bg-success:#172E25;\n  --danger:#E28270;\n  --danger-fill:#C1503C;\n  --bg-danger:#351F1A;\n  --info:#B4A4E0;\n  --bg-info:#241F36;\n  --neutral:#9AA6B2;\n  --bg-neutral:#222A32;\n  --dev:#78C8BC;\n  --bg-dev:#14302C;\n  --shadow:0 1px 2px rgba(0,0,0,.4),0 6px 20px rgba(0,0,0,.34);\n}\n\n/* Claude (light) */\n:root[data-theme=\"claude\"]{\n  --ground:#F0EEE6;\n  --surface:#FFFFFF;\n  --surface-2:#F7F6F1;\n  --surface-3:#EBE9E0;\n  --border:#DEDACE;\n  --border-strong:#C5C0B2;\n  --border-control:#8A8474;\n  --ink:#191917;\n  --ink-soft:#57544C;\n  --ink-mute:#84806F;\n  --accent:#A8461F;\n  --accent-fill:#B4552F;\n  --accent-edge:#DEB49F;\n  --bg-accent:#F7E6DD;\n  --on-accent:#FFF4EE;\n  --success:#276048;\n  --success-fill:#317055;\n  --bg-success:#D3E8DC;\n  --danger:#9E2B22;\n  --danger-fill:#BE4034;\n  --bg-danger:#F8E2DF;\n  --info:#474C93;\n  --bg-info:#E5E6F4;\n  --neutral:#6B6759;\n  --bg-neutral:#EDEBE2;\n  --dev:#256657;\n  --bg-dev:#D8EBE5;\n  --shadow:0 1px 2px rgba(60,50,35,.07),0 4px 14px rgba(60,50,35,.06);\n}\n\n/* Claude (medium) */\n:root[data-theme=\"claude-med\"]{\n  --ground:#26241F;\n  --surface:#2F2D27;\n  --surface-2:#37352E;\n  --surface-3:#403D35;\n  --border:#454239;\n  --border-strong:#5C5849;\n  --border-control:#807A68;\n  --ink:#EDEAE0;\n  --ink-soft:#B3AE9E;\n  --ink-mute:#8A8676;\n  --accent:#EFA189;\n  --accent-fill:#C26A4F;\n  --accent-edge:#66452F;\n  --bg-accent:#3B2A1E;\n  --on-accent:#1C0C03;\n  --success:#84C6A2;\n  --success-fill:#3C8A63;\n  --bg-success:#22342A;\n  --danger:#EE8B79;\n  --danger-fill:#BC4739;\n  --bg-danger:#3B2622;\n  --info:#AFA8E2;\n  --bg-info:#2B2839;\n  --neutral:#A8A292;\n  --bg-neutral:#343128;\n  --dev:#82C9B9;\n  --bg-dev:#1F3330;\n  --shadow:0 1px 2px rgba(0,0,0,.4),0 6px 20px rgba(0,0,0,.34);\n}\n\n/* Claude (dark) */\n:root[data-theme=\"claude-dark\"]{\n  --ground:#141312;\n  --surface:#1C1B19;\n  --surface-2:#232220;\n  --surface-3:#2C2A27;\n  --border:#31302C;\n  --border-strong:#47443E;\n  --border-control:#6E6A61;\n  --ink:#EFECE3;\n  --ink-soft:#ACA79A;\n  --ink-mute:#7E7A6E;\n  --accent:#F0A791;\n  --accent-fill:#C36E52;\n  --accent-edge:#523A26;\n  --bg-accent:#2B1D14;\n  --on-accent:#1A0A02;\n  --success:#82C9A3;\n  --success-fill:#3E8F66;\n  --bg-success:#14291D;\n  --danger:#F0907E;\n  --danger-fill:#C24A3B;\n  --bg-danger:#2E1B18;\n  --info:#B3ABE6;\n  --bg-info:#211E2E;\n  --neutral:#A5A092;\n  --bg-neutral:#26241F;\n  --dev:#7FCBBA;\n  --bg-dev:#132A26;\n  --shadow:0 1px 2px rgba(0,0,0,.4),0 6px 20px rgba(0,0,0,.34);\n}\n\n/* Claude Code */\n:root[data-theme=\"claude-code\"]{\n  --ground:#1F1E1D;\n  --surface:#262625;\n  --surface-2:#2E2E2C;\n  --surface-3:#383836;\n  --border:#3A3A38;\n  --border-strong:#54544F;\n  --border-control:#787870;\n  --ink:#F5F4EF;\n  --ink-soft:#B4B2A7;\n  --ink-mute:#88867C;\n  --accent:#E39070;\n  --accent-fill:#C2613F;\n  --accent-edge:#4A3227;\n  --bg-accent:#33221B;\n  --on-accent:#1A0A04;\n  --success:#7FC49E;\n  --success-fill:#3C8961;\n  --bg-success:#1C2E23;\n  --danger:#EE8B78;\n  --danger-fill:#BF4A39;\n  --bg-danger:#33211D;\n  --info:#ADA6E0;\n  --bg-info:#28253A;\n  --neutral:#A3A198;\n  --bg-neutral:#2C2C2A;\n  --dev:#7DC6B6;\n  --bg-dev:#1B2E2A;\n  --shadow:0 1px 2px rgba(0,0,0,.4),0 6px 20px rgba(0,0,0,.34);\n}\n\n/* LEGACY ALIASES. The tool CSS written against the war-room names keeps\n   working; a new theme only has to fill the role names above. Do not use\n   these in new code. */\n:root,:root[data-theme]{\n  --brass:var(--accent); --brass-fill:var(--accent-fill);\n  --brass-text:var(--accent); --on-brass:var(--on-accent); --bg-brass:var(--bg-accent);\n  --ember:var(--danger); --ember-fill:var(--danger-fill); --bg-ember:var(--bg-danger);\n  --moss:var(--success); --moss-fill:var(--success-fill); --bg-moss:var(--bg-success);\n  --violet:var(--info); --bg-violet:var(--bg-info);\n  --steel:var(--neutral); --bg-steel:var(--bg-neutral);\n  --font-head:var(--font-display);\n}\n\n/* NUMBERS. Tabular figures give fixed-width digits, which is what makes a\n   column line up; the face itself is proportional and its zero is open.\n   `font-feature-settings: \"zero\" 0` is deliberately NOT used - it was tried,\n   and it does nothing, because in every mono face tested the slash or dot is\n   the default glyph rather than an optional feature. The fix is face choice,\n   not a feature flag. */\n.num,[data-num],table td,.stat .v,.mini .mr{\n  font-variant-numeric:tabular-nums;\n}\n\n/* DEVELOPER INFO (DESIGN.md §7, register R67). Hidden unless the reader has\n   turned it on, and tinted with its own hue so it is never mistaken for\n   something written for a player. */\n:root:not([data-dev=\"on\"]) [data-dev-only]{display:none!important}\n[data-dev-only]{color:var(--dev)}\n.devpill{\n  font-family:var(--font-mono);font-size:.6rem;font-weight:700;\n  padding:1px 6px;border-radius:3px;background:var(--bg-dev);color:var(--dev);\n}\n\n</style>\n<style>\n/* ===========================================================================\n   AWOO+ TOOL SETTINGS — the gear menu every tool shares.\n\n   Hand-written, unlike theme-tokens.css beside it. Injected by\n   userscripts/build.mjs at the <!-- @AWOO_TOOL_SETTINGS@ --> marker together\n   with tool-settings.js, for the same reason the tokens are injected rather\n   than copied: the menu, the theme inheritance and the \"Match game\" fallback\n   were about to exist four times, and the fallback is the part that has to\n   change in one place when Core's theme snapshot reaches tool payloads.\n\n   Every selector is prefixed `awoo-gear` because it lands inside pages whose\n   own `.btn` / `.panel` / `.note` rules differ from tool to tool.\n   ARTIFACT_STYLE_GUIDE.md Part II, \"Settings menu\".\n   =========================================================================== */\n.awoo-gear{position:relative;flex:none}\n.awoo-gear-btn{\n  background:transparent; border:1px solid var(--border-control); color:var(--ink-soft);\n  border-radius:4px; padding:3px 8px; cursor:pointer;\n  font:inherit; font-size:.95rem; line-height:1;\n}\n.awoo-gear-btn:hover,.awoo-gear-btn[aria-expanded=\"true\"]{\n  color:var(--ink); border-color:var(--accent-fill); background:var(--surface-2);\n}\n.awoo-gear-menu{\n  position:absolute; right:0; top:calc(100% + 6px); z-index:60; width:250px;\n  background:var(--surface); color:var(--ink); border:1px solid var(--border-strong);\n  border-radius:6px; box-shadow:var(--shadow); padding:8px;\n  display:flex; flex-direction:column; gap:7px;\n  font-family:var(--font-body); font-size:14px; line-height:1.4; text-align:left;\n}\n/* Opening upward, for a gear that sits at the foot of the viewport. */\n.awoo-gear-menu.up{top:auto; bottom:calc(100% + 6px)}\n.awoo-gear-row{display:flex;flex-direction:column;gap:3px}\n.awoo-gear-row label{\n  font-size:.62rem;font-weight:700;letter-spacing:.08em;\n  text-transform:uppercase;color:var(--ink-mute);\n}\n.awoo-gear-row select{\n  background:var(--surface-2); color:var(--ink); border:1px solid var(--border-control);\n  border-radius:4px; padding:var(--ctl-y) var(--ctl-x); font:inherit; font-size:.76rem; width:100%;\n}\n.awoo-gear-check{flex-direction:row;align-items:center;gap:7px}\n.awoo-gear-check label{flex:1}\n.awoo-gear-check input{accent-color:var(--accent-fill);margin:0}\n.awoo-gear-note{font-size:.66rem;color:var(--ink-mute);line-height:1.4}\n.awoo-gear-note:empty{display:none}\n/* A fallback is information the reader needs, not a footnote: the page is\n   deliberately not in the theme they asked for, and it says so. */\n.awoo-gear-note.fallback{color:var(--info);background:var(--bg-info);border-radius:4px;padding:4px 6px}\n\n/* SIDEBAR PINNING (2026-09-21). The default is that a tool's sidebar scrolls\n   WITH the page, and is pinned only while the whole of it fits on screen — a\n   pinned sidebar taller than the window hides its own bottom until the page\n   ends, and an independently scrolling one is a second scrollbar to manage.\n   \"Sidebar scrolls on its own\" in the gear menu restores the older behaviour.\n   tool-settings.js measures and sets data-side-mode; nothing else should. */\n[data-awoo-sidebar][data-side-mode=\"sticky\"]{position:sticky;top:var(--side-top,20px)}\n[data-awoo-sidebar][data-side-mode=\"scroll\"]{\n  position:sticky; top:var(--side-top,20px);\n  max-height:calc(100vh - var(--side-top,20px) - 16px);\n  overflow-y:auto; overflow-x:hidden; scrollbar-width:thin;\n}\n\n</style>\n<script>\n/* ===========================================================================\n   AWOO+ TOOL SETTINGS — theme, developer info and fonts, shared by every tool.\n\n   Hand-written. Injected by userscripts/build.mjs at <!-- @AWOO_TOOL_SETTINGS@ -->\n   (with tool-settings.css), so the inheritance rules below exist once rather\n   than once per tool. A page opts in by carrying the marker, naming itself in\n   <meta name=\"awoo-tool\" content=\"...\"> BEFORE the marker, and calling\n   AWOO_TOOL_SETTINGS.mount(el) from its own init.\n\n   INHERIT, THEN OVERRIDE (ARTIFACT_STYLE_GUIDE.md Part II and Part IV).\n   The theme, \"Show developer info\" and the tool fonts are the PLAYER's\n   settings, held by AWOO+ Core. Core hands them over when it opens a tool, as\n   window.AWOO_APPEARANCE, prepended to the payload the same way AWOO_LIVE is.\n   A choice made in this page's gear menu overrides the inherited one and is\n   remembered per tool; \"Match game\" hands the decision back to Core.\n\n   THE FALLBACKS, stated because each one is a deliberate answer rather than\n   whatever happened to render:\n     - Opened outside the game (nothing inherited): the OS preference decides,\n       Beach (light) or Slate — theme-tokens.css does that with no stamp.\n     - Core's theme is game-shaped (\"Match game\", or the AWOO Turquoise preset):\n       a tool opened in its own tab cannot read the game page's variables, and\n       Core's snapshot of them does not reach tool payloads yet. So the page\n       shows SLATE AND SAYS SO in the menu — never an unstyled page, never a\n       silent substitute. When the snapshot does reach the payload, this\n       branch is the one place that changes.\n   =========================================================================== */\n(function(){\n'use strict';\n\nvar THEMES = [\n  ['beach','Beach (light)'], ['beach-dim','Beach (dimmed)'], ['slate','Slate'],\n  ['claude','Claude (light)'], ['claude-med','Claude (medium)'], ['claude-dark','Claude (dark)'],\n  ['claude-code','Claude Code']\n];\nvar THEME_IDS = THEMES.map(function(t){ return t[0]; });\n// Core's two themes that are defined by the GAME's variables rather than by\n// our contract. Neither can be rendered in a separate tab yet.\nvar GAME_SHAPED = { matchGame:'Match game', awooTurquoise:'AWOO Turquoise' };\nvar FALLBACK_THEME = 'slate';\n\n// The two font lists of Settings > Fonts. Core carries the same two lists for\n// the overlay; userscripts/tests/tool-theme-contract.mjs fails if they drift apart.\n//   text: Public Sans (default) · Open Sans · Figtree\n//   num:  Public Sans with tabular figures (default) · Roboto Mono\n// Roboto Mono marks its zero (69% ink in the counter, measured); it is offered\n// because it was asked for, and labelled for what it is in Core's picker.\nvar FONT_TEXT = {\n  public:  { stack:\"'Public Sans',system-ui,-apple-system,sans-serif\", family:'Public+Sans:wght@400;500;600;700' },\n  open:    { stack:\"'Open Sans',system-ui,-apple-system,sans-serif\",   family:'Open+Sans:wght@400;500;600;700' },\n  figtree: { stack:\"'Figtree',system-ui,-apple-system,sans-serif\",     family:'Figtree:wght@400;500;600;700' }\n};\nvar FONT_NUM = {\n  public: { stack:\"'Public Sans',system-ui,-apple-system,sans-serif\", family:'Public+Sans:wght@400;500;600;700' },\n  roboto: { stack:\"'Roboto Mono',ui-monospace,monospace\",             family:'Roboto+Mono:wght@400;500;600' }\n};\n\nvar root = document.documentElement;\nvar meta = document.querySelector('meta[name=\"awoo-tool\"]');\nvar TOOL = (meta && meta.getAttribute('content')) || 'tool';\nvar LS = 'awoo:tool:' + TOOL + ':appearance';\n\nvar local = { theme:null, dev:null, sideScroll:false };\ntry {\n  var raw = localStorage.getItem(LS);\n  if (raw){ var p = JSON.parse(raw); if (p && typeof p === 'object'){ local.theme = p.theme || null; local.dev = (typeof p.dev === 'boolean') ? p.dev : null; local.sideScroll = p.sideScroll === true; } }\n} catch(e){ /* private window or blocked storage: inherit everything */ }\nfunction persist(){\n  try { localStorage.setItem(LS, JSON.stringify(local)); } catch(e){ /* not durable, still applied */ }\n}\n\n// What Core handed over. AWOO_APPEARANCE is the channel; the profile section\n// is the older one Cost Tables was written against, kept so a page embedded\n// beside Core (not in its own tab) still inherits.\nfunction inherited(){\n  var out = { theme:null, dev:null, fonts:null };\n  var a = window.AWOO_APPEARANCE;\n  if (a && typeof a === 'object'){\n    if (typeof a.theme === 'string') out.theme = a.theme;\n    if (typeof a.dev === 'boolean') out.dev = a.dev;\n    if (a.fonts && typeof a.fonts === 'object') out.fonts = a.fonts;\n  }\n  try {\n    var core = window.AWOO_CORE || window.Core;\n    if (core && core.profile && typeof core.profile.section === 'function'){\n      var t = core.profile.section('settings.theme');\n      if (out.theme == null && t && typeof t.value === 'string') out.theme = t.value;\n      var d = core.profile.section('settings.showDeveloperInfo');\n      if (out.dev == null && d && typeof d.value === 'boolean') out.dev = d.value;\n    }\n  } catch(e){ /* absent is absent */ }\n  return out;\n}\n\n// The theme actually painted, and why. `note` is shown in the menu whenever\n// the page is not showing exactly what was asked for.\nfunction resolveTheme(){\n  if (local.theme && THEME_IDS.indexOf(local.theme) >= 0){\n    return { id:local.theme, source:'picked', note:'' };\n  }\n  var inh = inherited().theme;\n  if (inh && THEME_IDS.indexOf(inh) >= 0){\n    return { id:inh, source:'game', note:'' };\n  }\n  if (inh && GAME_SHAPED[inh]){\n    return { id:FALLBACK_THEME, source:'fallback',\n      note:'Your AWOO+ theme is ' + GAME_SHAPED[inh] + ', which a tool cannot read yet. Showing Slate.' };\n  }\n  return { id:null, source:'os', note:'No AWOO+ theme to match, so this follows your system: Beach or Slate.' };\n}\n\nfunction labelOf(id){\n  for (var i = 0; i < THEMES.length; i++) if (THEMES[i][0] === id) return THEMES[i][1];\n  return null;\n}\n\nfunction applyTheme(){\n  var r = resolveTheme();\n  if (r.id) root.setAttribute('data-theme', r.id);\n  else root.removeAttribute('data-theme');\n  return r;\n}\nfunction devOn(){\n  if (local.dev != null) return local.dev;\n  return !!inherited().dev;\n}\nfunction applyDev(){ root.setAttribute('data-dev', devOn() ? 'on' : 'off'); }\n\n// Fonts are never chosen here: Settings > Fonts in Core is the only place,\n// and each surface is saved there explicitly. A tool just wears the result.\n// A face outside the page's own stylesheet link is fetched only when chosen.\nfunction loadFamily(family){\n  if (!family || document.querySelector('link[data-awoo-font=\"' + family + '\"]')) return;\n  var l = document.createElement('link');\n  l.rel = 'stylesheet';\n  l.href = 'https://fonts.googleapis.com/css2?family=' + family + '&display=swap';\n  l.setAttribute('data-awoo-font', family);\n  (document.head || root).appendChild(l);\n}\nfunction applyFonts(){\n  var f = inherited().fonts;\n  var tools = f && (f.tools || f);\n  var text = tools && FONT_TEXT[tools.text];\n  var num = tools && FONT_NUM[tools.num];\n  if (text){\n    loadFamily(text.family);\n    root.style.setProperty('--font-body', text.stack);\n    root.style.setProperty('--font-display', text.stack);\n  }\n  if (num){\n    loadFamily(num.family);\n    root.style.setProperty('--font-num', num.stack);\n  }\n}\n\n// Sidebar pinning (see tool-settings.css). A page marks its sidebar with\n// data-awoo-sidebar, the viewport width from which it sits BESIDE the content\n// (data-side-min) and the pinned offset (data-side-top, e.g. below a sticky\n// top bar). Below that width the layout is one column and nothing is pinned.\nfunction sidebar(){ return document.querySelector('[data-awoo-sidebar]'); }\nfunction layoutSidebar(){\n  var el = sidebar();\n  if (!el) return;\n  var min = parseInt(el.getAttribute('data-side-min'), 10) || 0;\n  var top = parseInt(el.getAttribute('data-side-top'), 10) || 20;\n  el.style.setProperty('--side-top', top + 'px');\n  var mode;\n  if (window.innerWidth < min) mode = 'static';\n  else if (local.sideScroll) mode = 'scroll';\n  // scrollHeight is the content's own height whatever max-height says, so\n  // the measurement does not depend on the mode it is choosing between.\n  else mode = el.scrollHeight <= window.innerHeight - top - 16 ? 'sticky' : 'static';\n  if (el.getAttribute('data-side-mode') !== mode) el.setAttribute('data-side-mode', mode);\n}\nfunction watchSidebar(){\n  var el = sidebar();\n  if (!el) return;\n  layoutSidebar();\n  window.addEventListener('resize', layoutSidebar);\n  // Content grows and shrinks (a details panel opens, live data arrives), so\n  // the fit is re-measured on the element's own size changes too.\n  if (window.ResizeObserver) new ResizeObserver(layoutSidebar).observe(el);\n}\n\nvar listeners = [];\nfunction changed(){ for (var i = 0; i < listeners.length; i++){ try { listeners[i](); } catch(e){ /* one page bug must not stop the others */ } } }\n\n// Painted immediately, at parse time, so the page never flashes the base\n// theme before the stored or inherited one.\napplyTheme(); applyDev(); applyFonts();\n\nfunction el(tag, attrs, text){\n  var n = document.createElement(tag);\n  for (var k in attrs) n.setAttribute(k, attrs[k]);\n  if (text != null) n.textContent = text;\n  return n;\n}\n\n/* The gear menu. `host` is an empty element in the page's top bar; `opts.extra`\n   is an optional node of page-specific rows (Cost Tables' number format),\n   placed between Theme and Show developer info. `opts.up` opens it upward. */\nfunction mount(host, opts){\n  opts = opts || {};\n  if (!host) return;\n  host.classList.add('awoo-gear');\n  host.textContent = '';\n\n  var btn = el('button', { type:'button', 'class':'awoo-gear-btn', 'aria-expanded':'false',\n    'aria-controls':'awooGearMenu', 'aria-label':'Settings', title:'Settings' }, '⚙');\n  var menu = el('div', { id:'awooGearMenu', 'class':'awoo-gear-menu' + (opts.up ? ' up' : '') });\n  menu.hidden = true;\n\n  var themeRow = el('div', { 'class':'awoo-gear-row' });\n  themeRow.appendChild(el('label', { 'for':'awooThemeSel' }, 'Theme'));\n  var sel = el('select', { id:'awooThemeSel' });\n  var matchOpt = el('option', { value:'' }, 'Match game');\n  sel.appendChild(matchOpt);\n  THEMES.forEach(function(t){ sel.appendChild(el('option', { value:t[0] }, t[1])); });\n  themeRow.appendChild(sel);\n  menu.appendChild(themeRow);\n  var themeNote = el('div', { 'class':'awoo-gear-note' });\n  menu.appendChild(themeNote);\n\n  if (opts.extra) menu.appendChild(opts.extra);\n\n  var devRow = el('div', { 'class':'awoo-gear-row awoo-gear-check' });\n  devRow.appendChild(el('label', { 'for':'awooDevToggle' }, 'Show developer info'));\n  var dev = el('input', { type:'checkbox', id:'awooDevToggle' });\n  devRow.appendChild(dev);\n  menu.appendChild(devRow);\n  menu.appendChild(el('div', { 'class':'awoo-gear-note' },\n    opts.devHint || 'Adds the evidence tier, source files and last-checked date.'));\n\n  var side = null;\n  if (sidebar()){\n    var sideRow = el('div', { 'class':'awoo-gear-row awoo-gear-check' });\n    sideRow.appendChild(el('label', { 'for':'awooSideScroll' }, 'Sidebar scrolls on its own'));\n    side = el('input', { type:'checkbox', id:'awooSideScroll' });\n    sideRow.appendChild(side);\n    menu.appendChild(sideRow);\n    side.addEventListener('change', function(){\n      local.sideScroll = side.checked;\n      persist(); layoutSidebar(); changed();\n    });\n  }\n\n  host.appendChild(btn);\n  host.appendChild(menu);\n  watchSidebar();\n\n  function render(){\n    var r = resolveTheme();\n    sel.value = local.theme || '';\n    // \"Match game\" says what it resolved to, so the reader never has to open\n    // the list to find out which theme they are looking at.\n    matchOpt.textContent = 'Match game' + (r.source === 'picked' ? '' :\n      ' · ' + (r.id ? labelOf(r.id) : 'system'));\n    themeNote.textContent = (r.source === 'picked') ? '' : r.note;\n    themeNote.classList.toggle('fallback', r.source === 'fallback');\n    dev.checked = devOn();\n    if (side) side.checked = !!local.sideScroll;\n  }\n  render();\n\n  sel.addEventListener('change', function(){\n    local.theme = sel.value || null;\n    persist(); applyTheme(); render(); changed();\n  });\n  dev.addEventListener('change', function(){\n    local.dev = dev.checked;\n    persist(); applyDev(); changed();\n  });\n\n  // Closes on outside click and on Escape, because a panel that only closes\n  // by clicking the same button again is a panel people leave open.\n  function setOpen(open){\n    menu.hidden = !open;\n    btn.setAttribute('aria-expanded', String(open));\n  }\n  btn.addEventListener('click', function(e){ e.stopPropagation(); setOpen(menu.hidden); });\n  menu.addEventListener('click', function(e){ e.stopPropagation(); });\n  document.addEventListener('click', function(){ setOpen(false); });\n  document.addEventListener('keydown', function(e){\n    if (e.key === 'Escape' && !menu.hidden){ setOpen(false); btn.focus(); }\n  });\n  // The OS flipping light/dark only matters while nothing more specific is set.\n  if (window.matchMedia){\n    var mq = window.matchMedia('(prefers-color-scheme: dark)');\n    var onOs = function(){ render(); changed(); };\n    if (mq.addEventListener) mq.addEventListener('change', onOs);\n    else if (mq.addListener) mq.addListener(onOs);\n  }\n}\n\n/* The developer tier of a Formula panel: one line per generated fact, with its\n   evidence tier, source file and last-checked date. Read from\n   window.AWOO_FACTS_META, which build.mjs writes from the same data/ entries\n   it generates the functions from — so this list cannot disagree with the\n   code the page actually runs. Returns <li> markup; the caller wraps it in a\n   list marked data-dev-only. */\nfunction esc(v){ return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }\nfunction sources(names){\n  var meta = window.AWOO_FACTS_META || {};\n  var keys = names || Object.keys(meta);\n  if (!keys.length) return '<li>This copy was opened without the generated facts block.</li>';\n  return keys.filter(function(k){ return meta[k]; }).map(function(k){\n    var m = meta[k];\n    return '<li><span class=\"devpill\">' + esc(m.confidence) + '</span> <code>' + esc(m.file) +\n      '</code> &middot; <code>' + esc(m.fact) + '</code>' +\n      (m.checked ? ' &middot; checked ' + esc(m.checked) : '') + '</li>';\n  }).join('');\n}\n\nwindow.AWOO_TOOL_SETTINGS = {\n  mount: mount,\n  sources: sources,\n  onChange: function(fn){ if (typeof fn === 'function') listeners.push(fn); },\n  theme: resolveTheme,\n  devOn: devOn,\n  themes: THEMES.slice(),\n  // Test seam: the resolution rules, callable without a DOM round-trip.\n  _resolve: function(localTheme, inheritedTheme){\n    var pl = local.theme, pa = window.AWOO_APPEARANCE;\n    local.theme = localTheme || null;\n    window.AWOO_APPEARANCE = inheritedTheme ? { theme:inheritedTheme } : undefined;\n    try { return resolveTheme(); } finally { local.theme = pl; window.AWOO_APPEARANCE = pa; }\n  },\n  _fonts: { text:FONT_TEXT, num:FONT_NUM }\n};\n})();\n\n</script>\n<style>\n/* ---------------------------------------------------------------------------\n   THEME: none of its own. The palette is the shared token contract\n   (theme-tokens.css, injected above), so every component below names a ROLE,\n   never a colour. Rebuilt 2026-09-21 onto it (ARTIFACT_STYLE_GUIDE.md Part\n   II-b); the four hand-built palettes this page used to carry (Beach, Ink,\n   Slate, Umber) are gone, and Ink and Umber were retired by DESIGN.md.\n   Two role decisions worth stating, because they are where it could have\n   gone either way:\n     - the answer figures (headline gold, the verdict, the step values) were\n       terracotta \"warm\", and are now --accent: in Beach that is the same\n       terracotta, and in every other theme it is that theme's emphasis hue.\n     - combat vs utility keeps the page's original pairing: terracotta and\n       olive, which in the contract are --accent and --success (in Beach they\n       are the old hues exactly). --info was tried for utility on 2026-09-21\n       and rejected on sight: the purple read as foreign. Because green now\n       marks utility here, \"the flip\" is outlined in ink, not green.\n--------------------------------------------------------------------------- */\n*{box-sizing:border-box}\n[hidden]{display:none!important}\nhtml,body{margin:0;background:var(--ground)}\n/* No sideways scrolling, ever. A separately-scrolling sidebar is wanted; a\n   horizontal bar never is. */\nbody{color:var(--ink);font-family:var(--font-body);line-height:1.5;font-size:.9rem;overflow-x:hidden}\na{color:inherit}\n\n/* ---- shell: sized for 1440p at the default window width ---- */\n.app{display:grid;grid-template-columns:340px minmax(0,1fr);gap:1.5rem;\n     max-width:1680px;margin:0 auto;padding:1.5rem 1.5rem 4rem}\n@media (max-width:1100px){.app{grid-template-columns:1fr;padding:1.25rem 1rem 4rem}}\n\n.eyebrow{font-family:var(--font-mono);font-size:.63rem;letter-spacing:.11em;text-transform:uppercase;color:var(--accent);margin-bottom:.3rem}\nh1{font-family:var(--font-display);font-weight:700;font-size:1.7rem;margin:0 0 .3rem;line-height:1;text-wrap:balance}\n.sub{color:var(--ink-soft);font-size:.78rem;margin:0 0 1rem;line-height:1.45}\n\n/* ---- sidebar ---- */\n.sidebar-inner{display:flex;flex-direction:column;gap:.55rem}\n/* Pinned or not is the shared settings layer's call (tool-settings.js,\n   \"Sidebar scrolls on its own\"): by default the sidebar scrolls with the page\n   and is pinned only while it fits on screen. These rules only style the\n   scrollbar for readers who turn independent scrolling back on. */\n.sidebar-inner[data-side-mode=\"scroll\"]{padding-right:.45rem}\n.sidebar-inner::-webkit-scrollbar{width:8px}\n.sidebar-inner::-webkit-scrollbar-thumb{background:var(--border-strong);border-radius:4px}\n.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:var(--pad-panel);box-shadow:var(--shadow)}\n\n.sec-label{font-family:var(--font-mono);font-size:.6rem;letter-spacing:.09em;text-transform:uppercase;\n  color:var(--ink-mute);display:flex;align-items:center;gap:.3rem;margin:0 0 .5rem}\n.sec-label .rule{flex:1;height:1px;background:var(--border)}\n\n/* ---- compact, aligned inputs ---- */\n.fields{display:grid;grid-template-columns:1fr var(--ctl-w);align-items:center;gap:.16rem .45rem}\n.fields label{font-size:.73rem;color:var(--ink-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;\n  display:flex;align-items:center;gap:.25rem;min-width:0}\n.fields input[type=number],.fields input[type=text]{\n  font-family:var(--font-num);font-size:.8rem;font-weight:600;color:var(--ink);\n  background:var(--surface-2);border:1px solid var(--border-control);border-radius:4px;\n  padding:var(--ctl-y) var(--ctl-x);width:100%;min-width:0;font-variant-numeric:tabular-nums;\n  text-align:right;line-height:1.4;height:1.45rem}\n/* A number input reserves a spinner gutter and a text input does not, so\n   right-aligned values in the same column sat at two different x positions.\n   Removing the spinner is what lines the column up. */\n.fields input[type=number]{-moz-appearance:textfield;appearance:textfield}\n.fields input[type=number]::-webkit-outer-spin-button,\n.fields input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}\n.fields input:focus{outline:2px solid var(--accent-fill);outline-offset:1px}\n.fields input:disabled{opacity:.45;cursor:not-allowed;background:var(--surface-3)}\n.checkrow{grid-column:1 / -1;display:flex;align-items:center;gap:.4rem;font-size:.75rem;color:var(--ink-soft);cursor:pointer;user-select:none}\n.checkrow input{width:.85rem;height:.85rem;accent-color:var(--accent-fill);margin:0;cursor:pointer}\n.note{grid-column:1 / -1;font-size:.68rem;color:var(--ink-mute);line-height:1.35;margin:.2rem 0 0}\n\n/* ---- buttons, one family ---- */\n.btn{font-family:var(--font-body);font-size:.72rem;font-weight:500;color:var(--ink-soft);\n  background:var(--surface-2);border:1px solid var(--border-control);border-radius:6px;\n  padding:.28rem .6rem;cursor:pointer;white-space:nowrap;transition:background .12s,border-color .12s,color .12s}\n.btn:hover{border-color:var(--accent-fill);color:var(--accent);background:var(--surface-3)}\n.btn:disabled{opacity:.4;cursor:default}\n.btn:disabled:hover{border-color:var(--border-control);color:var(--ink-soft);background:var(--surface-2)}\n.btn-primary{color:var(--on-accent);background:var(--accent-fill);border-color:var(--accent-fill)}\n.btn-primary:hover{filter:brightness(1.07);color:var(--on-accent);background:var(--accent-fill);border-color:var(--accent-fill)}\n.btnrow{display:flex;gap:.35rem;margin-top:.5rem}\n.btnrow .btn{flex:1}\n\n/* ---- results ---- */\n.result{display:flex;justify-content:space-between;align-items:baseline;gap:.5rem;padding:.22rem 0;font-size:.78rem}\n.result + .result{border-top:1px dashed var(--border)}\n.result .k{color:var(--ink-soft)}\n.result .v{font-family:var(--font-num);font-weight:600;font-variant-numeric:tabular-nums}\n.result.hero .v{font-family:var(--font-display);font-size:1.5rem;font-weight:700;color:var(--accent);line-height:1}\n.result .v.good{color:var(--success)} .result .v.off{color:var(--danger)}\n\n/* ---- live import ---- */\n.live{border-left:3px solid var(--border-strong)}\n.live.on{border-left-color:var(--success-fill)}\n.live-head{display:flex;justify-content:space-between;align-items:center;gap:.4rem;margin-bottom:.4rem}\n.live-when{font-family:var(--font-num);font-size:.62rem;color:var(--ink-mute)}\n.live-list{display:grid;grid-template-columns:1fr auto;gap:.1rem .5rem;font-size:.72rem;margin-bottom:.4rem}\n.live-list .k{color:var(--ink-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.live-list .v{font-family:var(--font-num);font-weight:600;text-align:right;font-variant-numeric:tabular-nums}\n.live-empty{font-size:.72rem;color:var(--ink-soft);line-height:1.45}\n\n/* ---- tooltips: fixed-position, so a scroll container cannot clip them ---- */\n.tip{border-bottom:1px dotted var(--ink-mute);cursor:help}\n.ico{display:inline-flex;align-items:center;justify-content:center;width:.85rem;height:.85rem;\n  border-radius:50%;border:1px solid var(--ink-mute);color:var(--ink-mute);\n  font-size:.55rem;font-weight:700;cursor:help;flex:none;font-style:normal}\n.ico:hover,.ico:focus{border-color:var(--accent);color:var(--accent);outline:none}\n#tip{position:fixed;z-index:200;max-width:22rem;background:var(--ink);color:var(--surface);white-space:pre-line;\n  font-family:var(--font-body);font-size:.73rem;font-weight:400;line-height:1.45;\n  padding:.45rem .6rem;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.28);\n  opacity:0;visibility:hidden;transition:opacity .1s;pointer-events:none;left:0;top:0}\n#tip.on{opacity:1;visibility:visible}\n#tip .tipdev{display:block;margin-top:.35rem;padding-top:.35rem;border-top:1px solid var(--ink-mute);color:var(--bg-dev)}\n\n/* ---- main ---- */\nh3.sec{font-family:var(--font-display);font-weight:700;font-size:1.25rem;margin:1.6rem 0 .2rem}\nh3.sec:first-child{margin-top:0}\n.sec-sub{color:var(--ink-soft);font-size:.78rem;margin:0 0 .7rem;max-width:74ch}\n\n.verdict{background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--accent);\n  border-radius:var(--radius);padding:.85rem 1rem;margin-bottom:1rem;box-shadow:var(--shadow)}\n.verdict-head{display:flex;align-items:baseline;gap:.6rem;flex-wrap:wrap;margin-bottom:.4rem}\n.verdict-kicker{font-family:var(--font-mono);font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-mute)}\n.verdict-answer{font-family:var(--font-display);font-weight:800;font-size:1.6rem;line-height:1;color:var(--accent)}\n.verdict-answer.util{color:var(--success)}\n.verdict p{font-size:.8rem;color:var(--ink-soft);margin:0}\n.verdict p + p{margin-top:.35rem}\n.verdict strong{color:var(--ink)}\n\n.compare{display:grid;grid-template-columns:1fr 1fr;gap:.8rem;margin-bottom:1rem}\n@media (max-width:820px){.compare{grid-template-columns:1fr}}\n.box{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:.75rem .9rem;box-shadow:var(--shadow)}\n.box.win{border-color:var(--success);box-shadow:inset 3px 0 0 var(--success),var(--shadow)}\n.box h5{margin:0 0 .2rem;font-size:.62rem;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-mute);display:flex;align-items:center;gap:.35rem}\n.box .big{font-family:var(--font-display);font-size:1.5rem;color:var(--accent);line-height:1.05}\n.box .unit{font-family:var(--font-num);font-size:.6rem;color:var(--ink-mute);text-transform:uppercase;letter-spacing:.05em}\n.box dl{display:grid;grid-template-columns:auto 1fr;gap:.05rem .6rem;margin:.45rem 0 0;font-size:.72rem}\n.box dt{color:var(--ink-mute)} .box dd{margin:0;font-family:var(--font-num);text-align:right;font-variant-numeric:tabular-nums}\n.box p{margin:.35rem 0 0;font-size:.72rem;color:var(--ink-soft)}\n.tag{font-family:var(--font-body);font-size:.55rem;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);border:1px solid currentColor;border-radius:3px;padding:0 .22rem}\n.tag.win{color:var(--success)}\n\n.panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:.75rem .9rem;margin-bottom:1rem;box-shadow:var(--shadow)}\n.panel h5{margin:0 0 .5rem;font-size:.62rem;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-mute)}\n.panel .note{font-size:.78rem;color:var(--ink-soft);margin:.5rem 0 0}\n.panel .note strong{color:var(--ink)}\n\n.strip{display:flex;gap:2px;flex-wrap:wrap;margin-bottom:.5rem}\n.cell{width:1.5rem;height:1.5rem;border-radius:4px;display:flex;align-items:center;justify-content:center;\n  font-family:var(--font-num);font-size:.55rem;font-weight:600}\n/* Treatment BC (style guide Part II): a category is a low-chroma tint with a\n   soft edge, never a saturated fill behind text. */\n.cell.c{background:var(--bg-accent);color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent-edge)}\n.cell.u{background:var(--bg-success);color:var(--success);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--success) 40%,transparent)}\n.cell.flip{outline:2px solid var(--ink);outline-offset:1px}\n.legend{display:flex;gap:.9rem;flex-wrap:wrap;font-size:.7rem;color:var(--ink-soft);margin-top:.4rem}\n.legend span{display:flex;align-items:center;gap:.3rem}\n.sw{width:.75rem;height:.75rem;border-radius:3px;border:1px solid var(--border);display:inline-block}\n\n/* ---- tables ---- */\n.tbl-wrap{overflow:auto;max-height:480px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);box-shadow:var(--shadow)}\n.tbl-wrap.tall{max-height:calc(100vh - 11rem)}\n.tbl-wrap.auto{max-height:none}\ntable.roi{width:100%;border-collapse:collapse;font-size:.75rem}\ntable.roi thead th{position:sticky;background:var(--surface-2);text-align:right;font-family:var(--font-mono);\n  font-weight:500;font-size:.63rem;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-mute);\n  padding:.32rem var(--row-x);white-space:nowrap;z-index:2}\ntable.roi thead tr.grp th{top:0;font-size:.58rem;letter-spacing:.09em;color:var(--ink-soft);\n  border-bottom:1px solid var(--border);background:var(--surface-3)}\ntable.roi thead tr.cols th{top:1.4rem;border-bottom:1px solid var(--border)}\ntable.roi thead th:first-child{text-align:left}\ntable.roi tbody td{text-align:right;padding:var(--row-y) var(--row-x);line-height:1.4;font-family:var(--font-num);font-variant-numeric:tabular-nums;\n  border-top:1px solid var(--border);white-space:nowrap}\ntable.roi tbody td.lvl{text-align:left;color:var(--ink-soft)}\ntable.roi tbody td.sep,table.roi thead th.sep{border-left:1px solid var(--border)}\ntable.roi tbody tr.boundary td{color:var(--success)}\ntable.roi tbody tr.band{background:var(--bg-success)}\n/* The current row: tint plus a SOFT edge (treatment BC). The old 2px accent\n   rules read as a frame around the row rather than emphasis on it, and bold\n   now marks the row's identifier only (style guide, Density). */\ntable.roi tbody tr.current{background:var(--bg-accent)}\ntable.roi tbody tr.current td{box-shadow:inset 0 1px 0 var(--accent-edge),inset 0 -1px 0 var(--accent-edge)}\ntable.roi tbody tr.current td.lvl{font-weight:600;color:var(--ink)}\n.tblfoot{display:flex;justify-content:flex-end;align-items:center;gap:.35rem;padding:.45rem .1rem 0;flex-wrap:wrap}\n.tblfoot .count{margin-right:auto;font-family:var(--font-num);font-size:.66rem;color:var(--ink-mute)}\n.tblfoot input{font-family:var(--font-num);font-size:.72rem;width:var(--ctl-w);padding:var(--ctl-y) var(--ctl-x);text-align:right;\n  background:var(--surface-2);border:1px solid var(--border-control);border-radius:6px;color:var(--ink)}\n\ndetails.panel summary{cursor:pointer;font-weight:600;font-size:.82rem;list-style:none;display:flex;align-items:center;gap:.4rem}\ndetails.panel summary::-webkit-details-marker{display:none}\ndetails.panel summary::before{content:'\\25B8';font-family:var(--font-mono);color:var(--accent);transition:transform .15s;font-size:.75rem}\ndetails.panel[open] summary::before{transform:rotate(90deg)}\ndetails.panel summary .s{font-weight:400;color:var(--ink-soft);font-size:.73rem}\n.panel-body{margin-top:.7rem}\n.panel-body h4{font-size:.63rem;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-mute);margin:.9rem 0 .35rem}\n.panel-body h4:first-child{margin-top:0}\n.panel-body ul{margin:0;padding-left:1rem;color:var(--ink-soft);font-size:.77rem}\n.panel-body li{margin-bottom:.3rem}\ncode{font-family:var(--font-mono);background:var(--surface-2);padding:.03rem .25rem;border-radius:3px;color:var(--ink);font-size:.9em}\n\n.calc{position:relative;padding-left:1.5rem}\n.calc::before{content:\"\";position:absolute;left:.52rem;top:.4rem;bottom:.8rem;width:1px;background:var(--border-strong)}\n.step{position:relative;margin-bottom:.45rem;display:flex;align-items:baseline;gap:.5rem;flex-wrap:wrap;font-size:.78rem}\n.step-n{position:absolute;left:-1.5rem;top:.05rem;width:1.05rem;height:1.05rem;border-radius:50%;\n  background:var(--surface);border:1.5px solid var(--border-strong);display:flex;align-items:center;justify-content:center;\n  font-family:var(--font-num);font-weight:600;font-size:.58rem;color:var(--ink-soft)}\n.step .l{color:var(--ink);font-weight:600}\n.step .e{font-family:var(--font-mono);font-size:.68rem;color:var(--ink-mute);flex:1 1 auto}\n.step .v{font-family:var(--font-num);font-weight:700;margin-left:auto;color:var(--accent);white-space:nowrap}\n.step.final .v{color:var(--success);font-size:.88rem}\n\n/* The page title block carries the shared gear menu (tool-settings.css). */\n.head{position:relative;padding-right:2.4rem}\n.head .awoo-gear{position:absolute;top:0;right:0}\n@media (prefers-reduced-motion:reduce){*{transition:none!important}}\n</style>\n\n<div class=\"app\">\n  <aside>\n    <div class=\"sidebar-inner\" data-awoo-sidebar data-side-min=\"1101\" data-side-top=\"20\">\n      <div class=\"head\">\n        <div id=\"gear\"></div>\n        <div class=\"eyebrow\">Combat vs Utility pet slot</div>\n        <h1>Party Gold ROI</h1>\n        <p class=\"sub\">Every multiplier that reaches your party-action gold, and which pet slot is the better buy right now.</p>\n      </div>\n\n      <div class=\"card live\" id=\"liveCard\">\n        <div class=\"live-head\">\n          <span class=\"sec-label\" style=\"margin:0\">Live import<span class=\"ico\" tabindex=\"0\" data-tip=\"Filled in by the AWOO+ userscript when you open this page from the in-game menu. Nothing is sent anywhere - the values are handed over in-page.\">i</span></span>\n          <span class=\"live-when\" id=\"liveWhen\"></span>\n        </div>\n        <div class=\"live-list\" id=\"liveList\"></div>\n        <div class=\"live-empty\" id=\"liveEmpty\">Not opened from the game. Open <strong>AWOO+ &rsaquo; Tools &rsaquo; Party Gold ROI</strong> inside Queslar to fill this in automatically.</div>\n        <div class=\"btnrow\" id=\"liveActions\" hidden>\n          <button type=\"button\" class=\"btn btn-primary\" id=\"liveApplyBtn\">Apply live values</button>\n        </div>\n      </div>\n\n      <div class=\"card\">\n        <div class=\"sec-label\">Pet slots<span class=\"rule\"></span></div>\n        <div class=\"fields\">\n          <label for=\"combatInput\">Combat slot level</label>\n          <input type=\"number\" id=\"combatInput\" min=\"0\" max=\"5000\" value=\"50\">\n          <label for=\"utilityInput\">Utility slot level</label>\n          <input type=\"number\" id=\"utilityInput\" min=\"0\" max=\"5000\" value=\"30\">\n        </div>\n        <div style=\"margin-top:.55rem\">\n          <div class=\"result hero\"><span class=\"k\">Gold / action</span><span class=\"v\" id=\"headlineGold\">&mdash;</span></div>\n          <div class=\"result\" id=\"keptRow\" hidden><span class=\"k\">After village tax</span><span class=\"v\" id=\"keptGold\">&mdash;</span></div>\n          <div class=\"result\"><span class=\"k\">Combat boost</span><span class=\"v\" id=\"combatBoostOut\">&mdash;</span></div>\n          <div class=\"result\"><span class=\"k\">Utility boost</span><span class=\"v\" id=\"utilityBoostOut\">&mdash;</span></div>\n          <div class=\"result\" id=\"calibRow\" hidden><span class=\"k tip\" data-tip=\"Difference between this model and the gold/action you actually measured in game. Set it under Calibration.\">vs observed</span><span class=\"v\" id=\"calibOut\">&mdash;</span></div>\n        </div>\n        <div class=\"btnrow\">\n          <button type=\"button\" class=\"btn\" id=\"resetBtn\">Reset</button>\n          <button type=\"button\" class=\"btn\" id=\"saveDefaultBtn\">Save as default</button>\n        </div>\n      </div>\n\n      <div class=\"card\">\n        <div class=\"sec-label\">Combat context<span class=\"rule\"></span><span class=\"ico\" tabindex=\"0\" data-tip=\"The values that change most often between sessions. Gold scales in a straight line with monster level.\">i</span></div>\n        <div class=\"fields\">\n          <label for=\"monsterLevelInput\">Monster level</label>\n          <input type=\"number\" id=\"monsterLevelInput\" min=\"1\" max=\"10000000\" value=\"230000\">\n          <label for=\"characterLevelInput\">Character level</label>\n          <input type=\"number\" id=\"characterLevelInput\" min=\"1\" max=\"1000000\" value=\"11500\">\n          <label for=\"actionsPerWeekInput\">Actions / week</label>\n          <input type=\"number\" id=\"actionsPerWeekInput\" min=\"1\" max=\"200000\" value=\"6000\">\n        </div>\n      </div>\n\n      <div class=\"card\">\n        <div class=\"sec-label\">Pet modifiers<span class=\"rule\"></span><span class=\"ico\" tabindex=\"0\" data-tip=\"If the userscript imported your pets' actual rolled modifiers, those are used and the normalisation inputs grey out. Untick to model a pet from iLevel / tier / roll instead.\">i</span></div>\n        <div class=\"fields\">\n          <label class=\"checkrow\"><input type=\"checkbox\" id=\"useLivePetInput\"><span>Use imported pet modifiers</span></label>\n          <label for=\"petILevelInput\">Pet iLevel</label>\n          <input type=\"number\" id=\"petILevelInput\" min=\"101\" max=\"10000000\" value=\"11000\">\n          <label for=\"petTierInput\">Tier</label>\n          <input type=\"number\" id=\"petTierInput\" min=\"1\" max=\"16\" value=\"16\">\n          <label for=\"petRollPercentileInput\">Roll percentile</label>\n          <input type=\"number\" id=\"petRollPercentileInput\" min=\"0\" max=\"100\" value=\"75\">\n        </div>\n        <div style=\"margin-top:.45rem\">\n          <div class=\"result\"><span class=\"k\">Added base gold</span><span class=\"v\" id=\"rollFlatOut\">&mdash;</span></div>\n          <div class=\"result\"><span class=\"k\">Increased base gold</span><span class=\"v\" id=\"rollPctOut\">&mdash;</span></div>\n          <div class=\"result\"><span class=\"k\">Potion effect</span><span class=\"v\" id=\"rollPotionOut\">&mdash;</span></div>\n        </div>\n        <p class=\"note\" id=\"petSourceNote\"></p>\n      </div>\n\n      <div class=\"card\">\n        <div class=\"sec-label\">Character boosts<span class=\"rule\"></span><span class=\"ico\" tabindex=\"0\" data-tip=\"If the userscript imported your stacked Gold Boost, that one measured number replaces the four components below and they grey out. It is the same figure as your Character > Boosts 'Gold Boost' card.\">i</span></div>\n        <div class=\"fields\">\n          <label class=\"checkrow\"><input type=\"checkbox\" id=\"useLiveGoldBoostInput\"><span>Use measured Gold Boost</span></label>\n          <label for=\"goldBoostInput\">Measured total %</label>\n          <input type=\"number\" id=\"goldBoostInput\" min=\"0\" max=\"10000000\" step=\"0.01\" value=\"0\">\n          <label for=\"enchantsInput\">Enchants %</label>\n          <input type=\"number\" id=\"enchantsInput\" min=\"0\" max=\"100000\" value=\"518\">\n          <label for=\"sculpturesInput\">Sculpture grid %</label>\n          <input type=\"number\" id=\"sculpturesInput\" min=\"0\" max=\"100000\" value=\"500\">\n          <label for=\"skillTreeInput\">Skill tree %</label>\n          <input type=\"number\" id=\"skillTreeInput\" min=\"0\" max=\"100000\" value=\"0\">\n          <label for=\"petGoldModInput\">Pets' Gold %<span class=\"ico\" tabindex=\"0\" data-tip=\"Your pets' own income>gold modifier - the boost registry lists pets as a source of gold separately from the Added/Increased Base Gold rolls that feed gold.base. Both are real and they are not the same number.\">i</span></label>\n          <input type=\"number\" id=\"petGoldModInput\" min=\"0\" max=\"100000\" value=\"0\">\n          <p class=\"note\" id=\"goldBoostNote\"></p>\n        </div>\n      </div>\n\n      <div class=\"card\">\n        <div class=\"sec-label\">Village<span class=\"rule\"></span><span class=\"ico\" tabindex=\"0\" data-tip=\"Market and Exploration feed gold; Potent and Exploration feed Potion Effect; the two map tiles are separate multipliers on each.\" data-tip-dev=\"Not a guess: tables/boost-sources.json, the game's own boost registry.\">i</span></div>\n        <div class=\"fields\">\n          <label for=\"marketInput\">Market %</label>\n          <input type=\"number\" id=\"marketInput\" min=\"0\" max=\"100000\" value=\"320\">\n          <label for=\"villageInput\">Exploration %</label>\n          <input type=\"number\" id=\"villageInput\" min=\"0\" max=\"10000\" value=\"40\">\n          <label for=\"potentInput\">Potent %</label>\n          <input type=\"number\" id=\"potentInput\" min=\"0\" max=\"10000\" value=\"40\">\n          <label for=\"pvpGoldTileInput\">Gold tile %</label>\n          <input type=\"number\" id=\"pvpGoldTileInput\" min=\"0\" max=\"10000\" value=\"20\">\n          <label for=\"pvpPotionTileInput\">Potion Effect tile %</label>\n          <input type=\"number\" id=\"pvpPotionTileInput\" min=\"0\" max=\"10000\" value=\"4\">\n          <label for=\"taxInput\">Tax %<span class=\"ico\" tabindex=\"0\" data-tip=\"The share of party gold the village takes before you keep it. Derived automatically when the tracker can see both the gross and kept figures on a battle card; otherwise type it once and it is remembered.\">i</span></label>\n          <input type=\"number\" id=\"taxInput\" min=\"0\" max=\"100\" step=\"0.1\" value=\"0\">\n          <p class=\"note\">Exploration reaches both gold and Potion Effect; Potent reaches only Potion Effect.</p>\n        </div>\n      </div>\n\n      <div class=\"card\">\n        <div class=\"sec-label\">Party<span class=\"rule\"></span><span class=\"ico\" tabindex=\"0\" data-tip=\"Pooled Base is the SUM of every member's own fully-stacked Gold Boost, not an average. At exactly 5 members the combined total takes a x0.8 penalty; 1-4 members take none.\">i</span></div>\n        <div class=\"fields\">\n          <label for=\"partyMembersInput\">Members</label>\n          <input type=\"number\" id=\"partyMembersInput\" min=\"1\" max=\"5\" value=\"4\">\n          <label class=\"checkrow\"><input type=\"checkbox\" id=\"othersSameInput\" checked><span>Party matches me</span></label>\n          <label for=\"othersGoldBoostInput\" id=\"partyAvgLabel\">Party average %</label>\n          <input type=\"number\" id=\"othersGoldBoostInput\" min=\"0\" max=\"1000000\" value=\"0\">\n          <p class=\"note\" id=\"partyNote\" hidden></p>\n        </div>\n      </div>\n\n      <div class=\"card\">\n        <div class=\"sec-label\">Premium &amp; event<span class=\"rule\"></span></div>\n        <div class=\"fields\">\n          <label class=\"checkrow\"><input type=\"checkbox\" id=\"vipInput\" checked><span>VIP active (+10%)</span></label>\n          <label for=\"goldPotionInput\">Gold potion base %</label>\n          <input type=\"number\" id=\"goldPotionInput\" min=\"0\" max=\"10000\" value=\"10\">\n          <label for=\"eventInput\">Event %</label>\n          <input type=\"number\" id=\"eventInput\" min=\"0\" max=\"100000\" value=\"0\">\n        </div>\n      </div>\n\n      <div class=\"card\">\n        <div class=\"sec-label\">Calibration<span class=\"rule\"></span><span class=\"ico\" tabindex=\"0\" data-tip=\"Enter the gold/action you actually see in game. The sidebar shows the gap; the Formulas panel lists what each shape of gap points at.\">i</span></div>\n        <div class=\"fields\">\n          <label for=\"observedGoldInput\">Observed / action (B)</label>\n          <input type=\"number\" id=\"observedGoldInput\" min=\"0\" max=\"1000000000\" step=\"0.001\" value=\"0\">\n          <p class=\"note\">0 = off. Compared against the after-tax figure &mdash; the gold you actually keep, which is the honest measure of income.</p>\n        </div>\n      </div>\n    </div>\n  </aside>\n\n  <main>\n    <div class=\"verdict\" id=\"verdict\">\n      <div class=\"verdict-head\">\n        <span class=\"verdict-kicker\">Buy next</span>\n        <span class=\"verdict-answer\" id=\"verdictAnswer\">&mdash;</span>\n      </div>\n      <p id=\"verdictWhy\">&mdash;</p>\n      <p id=\"verdictBreak\">&mdash;</p>\n    </div>\n\n    <h3 class=\"sec\" id=\"breakpoint\">Breakpoint comparison</h3>\n    <p class=\"sec-sub\">Both slots share the <em>identical</em> cost curve <code>floor(500,000 &times; L&sup3;)</code> keyed on their own next level, so the only fair comparison is gold/action gained per gold spent.</p>\n\n    <div class=\"compare\">\n      <div class=\"box\" id=\"combatBox\">\n        <h5>Combat slot <span id=\"combatNextLbl\"></span><span class=\"tag win\" id=\"combatWinTag\" hidden>better</span></h5>\n        <div class=\"big\" id=\"combatComparBig\">&mdash;</div>\n        <div class=\"unit\">gold/action gained per 1B spent</div>\n        <dl>\n          <dt>Level cost</dt><dd id=\"combatStepCost\">&mdash;</dd>\n          <dt>Gold/action gained</dt><dd id=\"combatStepGain\">&mdash;</dd>\n          <dt>Pays back in</dt><dd id=\"combatStepBack\">&mdash;</dd>\n        </dl>\n        <p>Multiplies the dominant <code>gold.base</code> term directly.</p>\n      </div>\n      <div class=\"box\" id=\"utilityBox\">\n        <h5>Utility slot <span id=\"utilNextLbl\"></span><span class=\"tag win\" id=\"utilWinTag\" hidden>better</span></h5>\n        <div class=\"big\" id=\"utilComparBig\">&mdash;</div>\n        <div class=\"unit\">gold/action gained per 1B spent</div>\n        <dl>\n          <dt>Level cost</dt><dd id=\"utilStepCost\">&mdash;</dd>\n          <dt>Gold/action gained</dt><dd id=\"utilStepGain\">&mdash;</dd>\n          <dt>Pays back in</dt><dd id=\"utilStepBack\">&mdash;</dd>\n        </dl>\n        <p>Boosts one nested additive term three layers deep &mdash; much weaker leverage.</p>\n      </div>\n    </div>\n\n    <div class=\"panel\">\n      <h5>Where the two slots break even</h5>\n      <div class=\"tbl-wrap auto\"><table class=\"roi\">\n        <thead>\n          <tr class=\"cols\"><th>If combat slot is</th><th>Utility worth buying up to</th><th>Utility boost there</th><th>Cost of that utility level</th><th>Cost of the combat level</th></tr>\n        </thead>\n        <tbody id=\"crossTbody\"></tbody>\n      </table></div>\n      <p class=\"note\">Read a row as: <strong>at that combat level, every utility level up to the second column returns more gold per gold spent than the next combat level does</strong>. The column climbs in steps because a slot's rate steps up every 30 levels, so a utility level just past a boundary can briefly out-earn combat again.</p>\n    </div>\n\n    <div class=\"panel\">\n      <h5>Next 100 purchases, buying the better slot each time</h5>\n      <div class=\"strip\" id=\"planStrip\"></div>\n      <div class=\"legend\">\n        <span><i class=\"sw\" style=\"background:var(--bg-accent);border-color:var(--accent-edge)\"></i> combat</span>\n        <span><i class=\"sw\" style=\"background:var(--bg-success);border-color:color-mix(in srgb,var(--success) 40%,transparent)\"></i> utility</span>\n        <span><i class=\"sw\" style=\"background:var(--surface);border:2px solid var(--ink)\"></i> the flip</span>\n      </div>\n      <p class=\"note\" id=\"planNote\">&mdash;</p>\n    </div>\n\n    <h3 class=\"sec\" id=\"combat-table\">Combat pet slot ROI</h3>\n    <p class=\"sec-sub\">Utility pet held at your current input. Cumulative measured from your current combat slot level.</p>\n    <div class=\"tbl-wrap\" id=\"combatWrap\"><table class=\"roi\">\n      <thead>\n        <tr class=\"grp\"><th colspan=\"4\"></th><th colspan=\"2\">this level alone</th><th colspan=\"3\" class=\"sep\">cumulative from current</th></tr>\n        <tr class=\"cols\"><th>Slot</th><th>Boost</th><th>Gold / action</th><th>Level cost</th><th>Payback (actions)</th><th>Weeks</th><th class=\"sep\">Total cost</th><th>Payback (actions)</th><th>Weeks</th></tr>\n      </thead>\n      <tbody id=\"combatTbody\"></tbody>\n    </table></div>\n    <div class=\"tblfoot\">\n      <span class=\"count\" id=\"combatRowCount\"></span>\n      <button type=\"button\" class=\"btn\" id=\"combatExpandBtn\">Expand</button>\n      <button type=\"button\" class=\"btn\" id=\"combatMoreBtn\">+50</button>\n      <input type=\"number\" id=\"combatJumpInput\" min=\"0\" max=\"5000\" placeholder=\"to level\">\n      <button type=\"button\" class=\"btn\" id=\"combatJumpBtn\">Go</button>\n    </div>\n\n    <h3 class=\"sec\" id=\"utility-table\">Utility pet slot ROI</h3>\n    <p class=\"sec-sub\">Combat pet held at your current input. Only Potion Effect% changes with this slot &mdash; same cost curve, much weaker leverage.</p>\n    <div class=\"tbl-wrap\" id=\"utilityWrap\"><table class=\"roi\">\n      <thead>\n        <tr class=\"grp\"><th colspan=\"4\"></th><th colspan=\"2\">this level alone</th><th colspan=\"3\" class=\"sep\">cumulative from current</th></tr>\n        <tr class=\"cols\"><th>Slot</th><th>Boost</th><th>Gold / action</th><th>Level cost</th><th>Payback (actions)</th><th>Weeks</th><th class=\"sep\">Total cost</th><th>Payback (actions)</th><th>Weeks</th></tr>\n      </thead>\n      <tbody id=\"utilityTbody\"></tbody>\n    </table></div>\n    <div class=\"tblfoot\">\n      <span class=\"count\" id=\"utilityRowCount\"></span>\n      <button type=\"button\" class=\"btn\" id=\"utilityExpandBtn\">Expand</button>\n      <button type=\"button\" class=\"btn\" id=\"utilityMoreBtn\">+50</button>\n      <input type=\"number\" id=\"utilityJumpInput\" min=\"0\" max=\"5000\" placeholder=\"to level\">\n      <button type=\"button\" class=\"btn\" id=\"utilityJumpBtn\">Go</button>\n    </div>\n\n    <div class=\"legend\" style=\"margin:.6rem 0 1.5rem\">\n      <span><i class=\"sw\" style=\"background:var(--bg-accent);border-color:var(--accent-edge)\"></i> your current slot level</span>\n      <span><i class=\"sw\" style=\"background:var(--bg-success)\"></i> pays back in 2&ndash;4 weeks</span>\n      <span><i class=\"sw\" style=\"background:var(--surface);border-color:var(--success)\"></i> <span style=\"color:var(--success)\">green</span> = block boundary (31/61/91), rate steps up</span>\n    </div>\n\n    <details class=\"panel\" id=\"steps\">\n      <summary>Calculation steps <span class=\"s\">&mdash; how gold/action was derived, in order</span></summary>\n      <div class=\"panel-body\"><div class=\"calc\" id=\"ledger\"></div></div>\n    </details>\n\n    <details class=\"panel\" id=\"notes\">\n      <summary>Formula<span data-dev-only> &amp; source</span> <span class=\"s\">&mdash; assumptions, and where a gap comes from</span></summary>\n      <div class=\"panel-body\">\n        <h4>Where a gap between this model and your real gold/action comes from</h4>\n        <ul>\n          <li><strong>Compare the same figure.</strong> The game shows gold two ways &mdash; the pre-tax amount gained, and the amount <em>kept</em> after village tax. Both are correct; they are just not the same number. Set Tax% and this page shows both, so a mismatch is a real mismatch rather than a units problem.<span data-dev-only> Tax is not a recorded fact in the core, so it defaults to 0.</span></li>\n          <li><strong>Party members' own boosts.</strong> Pooled Base is the <em>sum</em> of every member's fully-stacked Gold Boost. If they are not clones of you, untick &ldquo;Others match me&rdquo;. Usually the largest single source of drift.</li>\n          <li><strong>Party size.</strong> At exactly 5 members the combined total is multiplied by 0.8; 1&ndash;4 take no penalty.</li>\n          <li><strong>Categories once pinned at 0</strong> and editable now: skill-tree gold, the pets' own &ldquo;Gold&rdquo; modifier, event, and the gold potion's base value.</li>\n          <li>A stable <em>percentage</em> gap is a missing multiplier; a stable <em>absolute</em> gap points at the base terms or the monster level.</li>\n        </ul>\n        <h4>Assumptions</h4>\n        <ul>\n          <li><strong>Level costs are cumulative to reach a level, individual to buy one.</strong> Each level has its own price &mdash; <code>floor(500,000 &times; L&sup3;)</code> for the level you are buying into.</li>\n          <li><strong>Use the per-level column to decide where to stop.</strong> It is the correct marginal rule; cumulative is the budgeting view.</li>\n          <li>Both pet slots share the identical cost formula and the identical 30-level accelerating boost curve.</li>\n          <li>Every field is remembered in this browser only.</li>\n        </ul>\n        <h4 data-dev-only>Source</h4>\n        <ul id=\"provenanceList\" data-dev-only></ul>\n        <h4>Why the utility pet is so much weaker</h4>\n        <ul>\n          <li>The combat pet's slot level multiplies <strong>monsterGoldFlat / monsterGoldPercentage directly</strong> &mdash; the dominant term in <code>gold.base</code>, which is then multiplied again by the party multiplier.</li>\n          <li>The utility pet's slot level only boosts its own <strong>raw Potion Effect roll</strong> &mdash; one additive term inside Potion Effect's Base, feeding a small Premium sub-term dwarfed by the pooled party Base it multiplies against.</li>\n        </ul>\n      </div>\n    </details>\n  </main>\n</div>\n\n<div id=\"tip\" role=\"tooltip\"></div>\n<script>\n/* GENERATED from data/ by userscripts/build.mjs — do not edit. */\nwindow.AWOO_FACTS = (function () {\n  /* formulas/pets.json :: pets.slotUpgrade.costFormula  [CODE] */\n  function petSlotUpgradeCost(currentLevel, newLevel) { let total = 0; for (let r = currentLevel + 1; r <= newLevel; r++) total += r <= 150 ? Math.floor(500000 * r**3) : Math.floor(500000 * 150**3 * (r/150)**15); return { currency: 'gold', value: total }; } // per-level marginal cost at level L->L+1: floor(500000*(L+1)^3) while L+1<=150, else floor(500000*150^3*((L+1)/150)^15). Exactly continuous at the seam: both branches evaluate to floor(500000*150^3) = 1,687,500,000,000 at r=150.\n  /* formulas/pets.json :: pets.slotUpgrade.boostFormula  [CODE] */\n  function petSlotBoostPercent(slotLevel) { let block = Math.floor(slotLevel / 30); let intoBlock = slotLevel % 30; if (block >= 5) return 0.3*5*6/2 + intoBlock*0.01*6; return 0.3*block*(block+1)/2 + intoBlock*0.01*(block+1); }\n  /* formulas/party.json :: party.fifthMemberPenalty.formula  [CODE] */\n  function partySizeMultiplier(memberCount) { return memberCount === 5 ? 0.8 : 1; }\n  /* formulas/economy.json :: gold.levelMultiplier  [LIVE] */\n  function goldLevelMultiplier(characterLevel) { return 1 + 0.0001 * characterLevel; }\n  /* tables/modifier-tiers.json :: tiers.pet.boostPercent  [CODE] */\n  const petTierBoostPercent = [10,20,30,40,50,60,70,80,90,100,125,150,170,190,210,230];\n  return { petSlotUpgradeCost, petSlotBoostPercent, partySizeMultiplier, goldLevelMultiplier, petTierBoostPercent };\n})();\nwindow.AWOO_FACTS_META = {\"petSlotUpgradeCost\":{\"file\":\"formulas/pets.json\",\"fact\":\"pets.slotUpgrade.costFormula\",\"confidence\":\"CODE\",\"checked\":\"2026-09-07\"},\"petSlotBoostPercent\":{\"file\":\"formulas/pets.json\",\"fact\":\"pets.slotUpgrade.boostFormula\",\"confidence\":\"CODE\",\"checked\":\"2026-09-07\"},\"partySizeMultiplier\":{\"file\":\"formulas/party.json\",\"fact\":\"party.fifthMemberPenalty.formula\",\"confidence\":\"CODE\",\"checked\":\"2026-08-23\"},\"goldLevelMultiplier\":{\"file\":\"formulas/economy.json\",\"fact\":\"gold.levelMultiplier\",\"confidence\":\"LIVE\",\"checked\":\"2026-08-22\"},\"petTierBoostPercent\":{\"file\":\"tables/modifier-tiers.json\",\"fact\":\"tiers.pet.boostPercent\",\"confidence\":\"CODE\",\"checked\":\"2026-08-22\"}};\n</script>\n<script>\n(function(){\n  \"use strict\";\n\n  var STORAGE_KEY = 'petSlotROI.inputs.v4';\n  var DEFAULTS_KEY = 'petSlotROI.defaults.v3';\n  var LEGACY_STORAGE = ['petSlotROI.inputs.v3','petSlotROI.inputs.v2'];\n  var LEGACY_DEFAULTS = ['petSlotROI.defaults.v2','petSlotROI.defaults.v1'];\n\n  var ORIGINAL_DEFAULTS = {\n    combat: 50, utility: 30,\n    enchants: 518, sculptures: 500, skillTree: 0, petGoldMod: 0,\n    market: 320, village: 40, potent: 40,\n    pvpGoldTile: 20, pvpPotionTile: 4, tax: 0, goldBoost: 0,\n    partyMembers: 4, othersGoldBoost: 0,\n    goldPotion: 10, event: 0,\n    monsterLevel: 230000, characterLevel: 11500, actionsPerWeek: 6000,\n    petILevel: 11000, petTier: 16, petRollPercentile: 75,\n    observedGold: 0\n  };\n  var DEFAULTS = Object.assign({}, ORIGINAL_DEFAULTS);\n  var CHECK_DEFAULTS = { vip: true, othersSame: true, useLivePet: false, useLiveGoldBoost: false };\n\n  var FIELD_IDS = {\n    combat: 'combatInput', utility: 'utilityInput',\n    enchants: 'enchantsInput', sculptures: 'sculpturesInput',\n    skillTree: 'skillTreeInput', petGoldMod: 'petGoldModInput',\n    market: 'marketInput', village: 'villageInput', potent: 'potentInput',\n    pvpGoldTile: 'pvpGoldTileInput', pvpPotionTile: 'pvpPotionTileInput', tax: 'taxInput',\n    goldBoost: 'goldBoostInput',\n    partyMembers: 'partyMembersInput', othersGoldBoost: 'othersGoldBoostInput',\n    goldPotion: 'goldPotionInput', event: 'eventInput',\n    monsterLevel: 'monsterLevelInput', characterLevel: 'characterLevelInput', actionsPerWeek: 'actionsPerWeekInput',\n    petILevel: 'petILevelInput', petTier: 'petTierInput', petRollPercentile: 'petRollPercentileInput',\n    observedGold: 'observedGoldInput'\n  };\n  var CHECK_IDS = { vip: 'vipInput', othersSame: 'othersSameInput',\n                    useLivePet: 'useLivePetInput', useLiveGoldBoost: 'useLiveGoldBoostInput' };\n  var VIP_PCT_WHEN_ON = 0.10;\n\n  // ---- core facts, all generated into window.AWOO_FACTS by the build ----\n  // slotBoostPercent is emitted from pets.slotUpgrade.boostFormula -- the PET\n  // curve, which stopped being the equipment one on 2026-09-07. Every call\n  // below is a pet slot (combat or utility), so there is no equipment caller\n  // here to keep on the old curve.\n  // Despite the name it returns a FRACTION, so *100 happens here and nowhere\n  // else. The percent form is always a whole number, so rounding is exact and\n  // is the only thing between the UI and \"+70.00000000000001%\".\n  function slotBoostPct(L){ return Math.round(AWOO_FACTS.petSlotBoostPercent(L) * 100); }\n  function stepCost(L){ return AWOO_FACTS.petSlotUpgradeCost(L - 1, L).value; }\n\n  function petTierMultiplier(tier){\n    var t = AWOO_FACTS.petTierBoostPercent;\n    tier = Math.max(1, Math.min(t.length, Math.round(tier)));\n    return 1 + t[tier-1]/100;\n  }\n  function petVariance(pct){ return 0.97 + Math.max(0, Math.min(100, pct))/100 * (1.03-0.97); }\n\n  // The pet's rolled modifiers. Either MODELLED from iLevel/tier/roll, or taken\n  // straight from what the userscript read off your actual pets. The modelled\n  // path is for normalised comparisons; the live path is your real answer, and\n  // when it is in use the modelling inputs grey out rather than being left to\n  // look as though they still matter.\n  function petRawRolls(p){\n    if (p.useLivePet && p.livePet) {\n      return { source: 'live',\n        rawFlat: p.livePet.flat, rawPct: p.livePet.pct, rawPotionEffect: p.livePet.potion };\n    }\n    var iL = Math.max(p.petILevel, 101);\n    var tm = petTierMultiplier(p.petTier);\n    var v = petVariance(p.petRollPercentile);\n    var base = Math.pow(iL-100, 0.49);\n    return { source: 'modelled',\n      rawFlat: Math.log(base+1) * 0.1 * v * tm,\n      rawPct: base * 0.005 * v * tm,\n      rawPotionEffect: base * 0.0025 * v * tm };\n  }\n\n  // ---- formatting ----\n  // The PLAYER's separators (2026-09-21). AWOO+ Core hands over the game's\n  // numberLocale in window.AWOO_APPEARANCE when it opens this tab; this page\n  // used to hard-code a dot and en-US grouping whatever the game showed.\n  // Opened outside the game, it keeps that historic en-US form.\n  var NUM_LOCALE = (function(){\n    var a = window.AWOO_APPEARANCE && window.AWOO_APPEARANCE.number;\n    var key = a && a.locale;\n    return key === '1.000,00' ? 'de-DE' : key === '1,000.00' ? 'en-US' : key === 'Local' ? undefined : 'en-US';\n  })();\n  var DEC = (function(){\n    try {\n      var part = new Intl.NumberFormat(NUM_LOCALE).formatToParts(1.5).filter(function(x){ return x.type === 'decimal'; })[0];\n      return part ? part.value : '.';\n    } catch(e){ return '.'; }\n  })();\n  function dec(s){ return DEC === '.' ? s : s.replace('.', DEC); }\n  function fmt(n){\n    if (!isFinite(n)) return '—';\n    var u=[['Qa',1e15],['T',1e12],['B',1e9],['M',1e6],['K',1e3]];\n    for(var k=0;k<u.length;k++){ if (Math.abs(n)>=u[k][1]) return dec((n/u[k][1]).toFixed(2))+u[k][0]; }\n    return n.toFixed(0);\n  }\n  function fmtInt(n){ return isFinite(n) ? Math.round(n).toLocaleString(NUM_LOCALE) : '—'; }\n  function P(x){ return dec((x*100).toFixed(2))+'%'; }\n  function weeks(w){ return !isFinite(w) ? '—' : w < 1 ? dec((w*7).toFixed(1))+' d' : dec(w.toFixed(1))+' wk'; }\n  function clampLevel(v){ v = parseInt(v,10); if (isNaN(v)||v<0) v=0; return v>5000?5000:v; }\n  function num(v, fb){ v = parseFloat(v); return isNaN(v) ? fb : v; }\n\n  // ---- profile ----\n  // buildProfile() is pure: raw values in, normalised profile out. readInputs()\n  // is the only part that touches the DOM. That split is what lets\n  // tests/userscript-roi-math.mjs exercise the shipped arithmetic rather than a\n  // re-typed copy of it.\n  function buildProfile(raw){\n    raw = Object.assign({}, ORIGINAL_DEFAULTS,\n      { vipChecked: true, othersSame: true, useLivePet: false, useLiveGoldBoost: false, livePet: null }, raw);\n    raw.combat = clampLevel(raw.combat);\n    raw.utility = clampLevel(raw.utility);\n    if (raw.actionsPerWeek <= 0) raw.actionsPerWeek = 1;\n    if (raw.petILevel < 101) raw.petILevel = 101;\n    raw.partyMembers = Math.max(1, Math.min(5, Math.round(raw.partyMembers)));\n\n    var p = {\n      combat: raw.combat, utility: raw.utility,\n      partyMembers: raw.partyMembers,\n      othersSameAsMe: !!raw.othersSame,\n      othersGoldBoost: raw.othersGoldBoost/100,\n      vip: raw.vipChecked ? VIP_PCT_WHEN_ON : 0,\n      goldPotionBase: raw.goldPotion/100,\n      event: raw.event/100,\n      enchants: raw.enchants/100, sculptures: raw.sculptures/100,\n      skillTree: raw.skillTree/100, petGoldMod: raw.petGoldMod/100,\n      market: raw.market/100, pvpGoldTile: raw.pvpGoldTile/100,\n      village: raw.village/100, potent: raw.potent/100, pvpPotionTile: raw.pvpPotionTile/100,\n      tax: Math.max(0, Math.min(100, raw.tax))/100,\n      goldBoost: raw.goldBoost/100,\n      useLiveGoldBoost: !!raw.useLiveGoldBoost && raw.goldBoost > 0,\n      monsterLevel: raw.monsterLevel, characterLevel: raw.characterLevel,\n      actionsPerWeek: raw.actionsPerWeek,\n      petILevel: raw.petILevel, petTier: raw.petTier, petRollPercentile: raw.petRollPercentile,\n      useLivePet: !!raw.useLivePet, livePet: raw.livePet || null,\n      observedGold: raw.observedGold > 0 ? raw.observedGold * 1e9 : null\n    };\n    p.rolls = petRawRolls(p);\n    p.pooled = pooledBase(p);\n    p.levelMult = AWOO_FACTS.goldLevelMultiplier(p.characterLevel);\n    return p;\n  }\n\n  function readInputs(){\n    var raw = {}, key;\n    for (key in FIELD_IDS) raw[key] = num(document.getElementById(FIELD_IDS[key]).value, DEFAULTS[key]);\n    raw.vipChecked = document.getElementById(CHECK_IDS.vip).checked;\n    raw.othersSame = document.getElementById(CHECK_IDS.othersSame).checked;\n    raw.useLivePet = document.getElementById(CHECK_IDS.useLivePet).checked;\n    raw.useLiveGoldBoost = document.getElementById(CHECK_IDS.useLiveGoldBoost).checked;\n    raw.livePet = livePetModifiers;\n    return buildProfile(raw);\n  }\n\n  // ---- formula chain ----\n  // Your fully-stacked income>gold total — the number on the Character >\n  // Boosts \"Gold Boost\" card.\n  //\n  // When the userscript has measured it, that ONE number replaces the whole\n  // computation. It is deliberately not folded into any single component:\n  // adding a measured total to \"Enchants\" would double-count it against\n  // Market, Village and the rest, and the result would look plausible while\n  // being wrong by whatever those contribute.\n  //\n  // Village stays live even under the override, because it feeds Potion Effect\n  // as well as gold and only the gold half is being replaced.\n  function personalGoldTotal(p){\n    if (p.useLiveGoldBoost) return p.goldBoost;\n    var base = p.enchants + p.market + p.village + p.sculptures + p.skillTree + p.petGoldMod;\n    return (1+base)*(1+p.pvpGoldTile) - 1;\n  }\n  // party.gold.rewardBoostFormula: PooledBase is the SUM across members of each\n  // member's OWN fully-stacked personal total. party.fifthMemberPenalty.formula\n  // then applies x0.8 at exactly 5.\n  function pooledBase(p){\n    var mine = personalGoldTotal(p);\n    var others = (p.partyMembers - 1) * (p.othersSameAsMe ? mine : p.othersGoldBoost);\n    return (mine + others) * AWOO_FACTS.partySizeMultiplier(p.partyMembers);\n  }\n\n  // The hot path. A crossover scan evaluates this ~1,600 times per combat level\n  // examined, so it allocates nothing and reads values hoisted in buildProfile.\n  function partyMultAt(p, U){\n    var pe = p.rolls.rawPotionEffect * (1 + slotBoostPct(U)/100);\n    var potionEffectTotal = (1 + pe + p.potent + p.village + p.skillTree)*(1+p.pvpPotionTile) - 1;\n    var premium = p.vip + p.goldPotionBase*(1+potionEffectTotal);\n    return (1+p.pooled)*(1+premium)*(1+p.event);\n  }\n  function potionMix(p, U){\n    var pe = p.rolls.rawPotionEffect * (1 + slotBoostPct(U)/100);\n    // Potent + Exploration + skill tree, per the registry's income>potionEffect\n    // base group. The old model added Exploration TWICE as a stand-in for\n    // \"Exploration and Potent are about the same\" - they are separate sources\n    // and only one of them also reaches gold.\n    var potionEffectBase = pe + p.potent + p.village + p.skillTree;\n    var potionEffectTotal = (1+potionEffectBase)*(1+p.pvpPotionTile) - 1;\n    var goldPotionBonus = p.goldPotionBase*(1+potionEffectTotal);\n    return { petPotionEffect: pe, potionEffectBase: potionEffectBase,\n             potionEffectTotal: potionEffectTotal, goldPotionBonus: goldPotionBonus,\n             premium: p.vip + goldPotionBonus, mult: partyMultAt(p, U) };\n  }\n  function goldBaseAt(p, C){\n    var boost = 1 + slotBoostPct(C)/100;\n    return (3 + p.rolls.rawFlat*boost) * (1 + p.rolls.rawPct*boost) * p.monsterLevel;\n  }\n  function goldPerAction(p, C, U){ return goldBaseAt(p, C) * p.levelMult * partyMultAt(p, U); }\n  // What you actually keep. A flat tax scales both channels equally, so it never\n  // changes WHICH slot to buy - it only makes the number comparable to the\n  // game's own \"kept\" figure.\n  function keptPerAction(p, C, U){ return goldPerAction(p, C, U) * (1 - p.tax); }\n\n  // ---- marginal economics ----\n  function marginal(p, C, U, channel){\n    var next = (channel === 'combat' ? C : U) + 1;\n    var cost = stepCost(next);\n    var gain = channel === 'combat'\n      ? goldPerAction(p, C+1, U) - goldPerAction(p, C, U)\n      : goldPerAction(p, C, U+1) - goldPerAction(p, C, U);\n    return { level: next, cost: cost, gain: gain, eff: cost > 0 ? gain/cost : Infinity,\n             paybackActions: gain > 0 ? cost/gain : Infinity };\n  }\n\n  // Largest utility level at which utility still beats combat, for a fixed\n  // combat level. NOT an early-exit search: a slot's per-level rate steps up\n  // every 30 levels, so efficiency JUMPS at 30/60/90 and the winning set is not\n  // contiguous. Scanning the whole range is cheap and is the only correct way.\n  var CROSS_SCAN_CAP = 400;\n  function crossoverUtility(p, C, cap){\n    cap = cap || CROSS_SCAN_CAP;\n    if (!p._cross) p._cross = {};\n    if (p._cross[C] !== undefined) return p._cross[C];\n    var best = -1;\n    for (var U = 0; U <= cap; U++){\n      if (marginal(p, C, U, 'utility').eff >= marginal(p, C, U, 'combat').eff) best = U;\n    }\n    p._cross[C] = best;\n    return best;\n  }\n\n  function greedyPlan(p, steps){\n    var C = p.combat, U = p.utility, seq = [], total = 0, flipAt = -1, prev = null;\n    for (var i = 0; i < steps; i++){\n      var mc = marginal(p, C, U, 'combat'), mu = marginal(p, C, U, 'utility');\n      var pick = mu.eff > mc.eff ? 'utility' : 'combat';\n      var m = pick === 'combat' ? mc : mu;\n      if (prev !== null && pick !== prev && flipAt < 0) flipAt = i;\n      prev = pick; total += m.cost;\n      seq.push({ channel: pick, level: m.level, cost: m.cost });\n      if (pick === 'combat') C++; else U++;\n    }\n    return { seq: seq, total: total, flipAt: flipAt, endC: C, endU: U };\n  }\n\n  // ---- tooltips ----\n  // ONE fixed-position element, not a bubble inside each trigger. The old\n  // per-element bubbles were clipped by the sidebar's scroll container, which\n  // is unavoidable for an absolutely-positioned child of an overflow:auto\n  // ancestor. Fixed positioning escapes the container entirely.\n  var tipEl = null, tipFor = null;\n  // Two tiers (DESIGN.md §7, R67): data-tip is for the player; data-tip-dev\n  // (where the number was read, which file it comes from) is appended only\n  // when \"Show developer info\" is on, in its own --dev tint.\n  function showTip(el){\n    var text = el.getAttribute('data-tip');\n    var dev = AWOO_TOOL_SETTINGS.devOn() ? el.getAttribute('data-tip-dev') : null;\n    if (!text && !dev) return;\n    tipFor = el;\n    tipEl.textContent = text || '';\n    if (dev){ var d = document.createElement('span'); d.className = 'tipdev'; d.textContent = dev; tipEl.appendChild(d); }\n    tipEl.classList.add('on');\n    var r = el.getBoundingClientRect();\n    var t = tipEl.getBoundingClientRect();\n    var left = Math.min(Math.max(8, r.left + r.width/2 - t.width/2), window.innerWidth - t.width - 8);\n    var top = r.top - t.height - 8;\n    if (top < 8) top = r.bottom + 8;   // flip below when there is no room above\n    tipEl.style.left = Math.round(left) + 'px';\n    tipEl.style.top = Math.round(top) + 'px';\n  }\n  function hideTip(){ tipFor = null; tipEl.classList.remove('on'); }\n  function initTips(){\n    tipEl = document.getElementById('tip');\n    document.addEventListener('mouseover', function(e){\n      var el = e.target && e.target.closest && e.target.closest('[data-tip],[data-tip-dev]');\n      if (el) showTip(el);\n    });\n    document.addEventListener('mouseout', function(e){\n      var el = e.target && e.target.closest && e.target.closest('[data-tip],[data-tip-dev]');\n      if (el && el === tipFor) hideTip();\n    });\n    document.addEventListener('focusin', function(e){\n      var el = e.target && e.target.closest && e.target.closest('[data-tip],[data-tip-dev]');\n      if (el) showTip(el);\n    });\n    document.addEventListener('focusout', hideTip);\n    // A tooltip pinned to viewport coordinates is wrong the moment anything\n    // scrolls, and re-measuring on every scroll frame is not worth it.\n    window.addEventListener('scroll', hideTip, true);\n  }\n\n  // ---- calculation steps ----\n  function tipAttr(technical){ return technical.replace(/&/g,'&amp;').replace(/\"/g,'&quot;').replace(/</g,'&lt;'); }\n  function tipSpan(label, technical){\n    return '<span class=\"tip\" data-tip=\"' + tipAttr(technical) + '\">' + label + '</span>';\n  }\n  function buildLedger(p){\n    var C = p.combat, U = p.utility;\n    var mix = potionMix(p, U);\n    var gb = goldBaseAt(p, C);\n    var lm = p.levelMult;\n    var gpa = gb * lm * mix.mult;\n    var kept = gpa * (1 - p.tax);\n    var baseSum = p.enchants + p.market + p.village + p.sculptures + p.skillTree + p.petGoldMod;\n    var penalty = AWOO_FACTS.partySizeMultiplier(p.partyMembers);\n\n    document.getElementById('headlineGold').textContent = fmt(gpa);\n    var keptRow = document.getElementById('keptRow');\n    keptRow.hidden = !p.tax;\n    if (p.tax) document.getElementById('keptGold').textContent = fmt(kept);\n    document.getElementById('combatBoostOut').textContent = '+' + slotBoostPct(C) + '%';\n    document.getElementById('utilityBoostOut').textContent = '+' + slotBoostPct(U) + '%';\n\n    document.getElementById('rollFlatOut').textContent = p.rolls.rawFlat.toFixed(3);\n    document.getElementById('rollPctOut').textContent = P(p.rolls.rawPct);\n    document.getElementById('rollPotionOut').textContent = P(p.rolls.rawPotionEffect);\n    document.getElementById('petSourceNote').textContent = p.rolls.source === 'live'\n      ? (livePetModifiers && livePetModifiers.atSlot !== undefined\n          ? 'Derived from your live merged modifiers at combat slot ' + livePetModifiers.atSlot +\n            ', with the slot boost divided back out. Exact if your pet is the only source of these.'\n          : 'From your imported pets, before the slot boost.')\n      : 'Modelled from iLevel / tier / roll, before the slot boost.';\n\n    // 5 x 0.8 = 4 exactly, so a 5th member who matches you is worth precisely\n    // nothing to pooled gold - not obvious from either rule on its own.\n    var partyNote = document.getElementById('partyNote');\n    if (p.partyMembers === 5){\n      var withoutFifth = p.othersSameAsMe ? 4*personalGoldTotal(p) : personalGoldTotal(p) + 3*p.othersGoldBoost;\n      var fifthWorth = p.pooled - withoutFifth;\n      partyNote.innerHTML = Math.abs(fifthWorth) < 1e-9\n        ? '<strong>The 5th member is exactly break-even for gold</strong> — 5 &times; 0.8 = 4. They only pay for themselves if their own Gold Boost beats a quarter of the other four’s total.'\n        : fifthWorth > 0\n          ? '5th member adds <strong>+' + P(fifthWorth) + '</strong> to Pooled Base after the &times;0.8 penalty.'\n          : '5th member <strong>costs</strong> ' + P(-fifthWorth) + ' of Pooled Base — the penalty outweighs them.';\n      partyNote.hidden = false;\n    } else { partyNote.hidden = true; }\n\n    var calibRow = document.getElementById('calibRow');\n    if (p.observedGold){\n      var d = kept - p.observedGold;\n      var el = document.getElementById('calibOut');\n      el.textContent = (d >= 0 ? '+' : '−') + fmt(Math.abs(d)) + ' (' + (d/p.observedGold*100).toFixed(1) + '%)';\n      el.className = 'v ' + (Math.abs(d/p.observedGold) < 0.01 ? 'good' : 'off');\n      calibRow.hidden = false;\n    } else { calibRow.hidden = true; }\n\n    var steps = [\n      ['Personal Gold Boost', 'mirrors Character > Boosts > \"Gold Boost\" - per member, pre-pool',\n       '(1+' + P(baseSum) + ')x(1+' + P(p.pvpGoldTile) + ' PvP)-1', P(personalGoldTotal(p))],\n      ['Party Pooling', 'party.gold.rewardBoostFormula - the sum of each member’s own total',\n       (p.othersSameAsMe ? P(personalGoldTotal(p)) + 'x' + p.partyMembers\n                         : 'me ' + P(personalGoldTotal(p)) + ' + ' + (p.partyMembers-1) + 'x' + P(p.othersGoldBoost))\n       + (penalty !== 1 ? ' x' + penalty + ' (5-member penalty)' : ''), P(p.pooled)],\n      ['Potion Effect', 'Utility pet, slot ' + U,\n       'pet + potent + exploration + skill tree, x(1+tile)', P(mix.potionEffectTotal)],\n      ['Gold Potion to Premium', 'goldPotionBase x (1+potionEffectTotal), feeds Premium with VIP',\n       p.goldPotionBase.toFixed(2) + 'x(1+' + P(mix.potionEffectTotal) + ') + VIP ' + P(p.vip), P(mix.premium)],\n      ['Party Gold Multiplier', '(1+Pooled)(1+Premium)(1+Event)',\n       '(1+' + P(p.pooled) + ')x(1+' + P(mix.premium) + ')x(1+' + P(p.event) + ')', 'x' + mix.mult.toFixed(2)],\n      ['Monster Gold Base', 'Combat pet, slot ' + C,\n       '(3+rawFlat x boost)x(1+rawPct x boost)x' + fmtInt(p.monsterLevel), fmt(gb)]\n    ];\n    var html = '';\n    for (var i = 0; i < steps.length; i++){\n      html += '<div class=\"step\"><span class=\"step-n\">' + (i+1) + '</span>'\n        + '<span class=\"l\">' + tipSpan(steps[i][0], steps[i][1]) + '</span>'\n        + '<span class=\"e\">' + steps[i][2] + '</span>'\n        + '<span class=\"v\">' + steps[i][3] + '</span></div>';\n    }\n    html += '<div class=\"step final\"><span class=\"step-n\">' + (steps.length+1) + '</span>'\n      + '<span class=\"l\">' + tipSpan('Gold / Party Action', 'gold.base x level mult (1+0.0001 x characterLevel) x party mult') + '</span>'\n      + '<span class=\"e\">' + fmt(gb) + 'x' + lm.toFixed(2) + 'x' + mix.mult.toFixed(2) + '</span>'\n      + '<span class=\"v\">' + fmt(gpa) + '</span></div>';\n    if (p.tax) {\n      html += '<div class=\"step final\"><span class=\"step-n\">' + (steps.length+2) + '</span>'\n        + '<span class=\"l\">' + tipSpan('Kept after tax', 'true income - what reaches your gold after the village takes its share') + '</span>'\n        + '<span class=\"e\">' + fmt(gpa) + ' x (1-' + P(p.tax) + ')</span>'\n        + '<span class=\"v\">' + fmt(kept) + '</span></div>';\n    }\n    document.getElementById('ledger').innerHTML = html;\n  }\n\n  // ---- breakpoint ----\n  function buildBreakpoint(p){\n    var mc = marginal(p, p.combat, p.utility, 'combat');\n    var mu = marginal(p, p.combat, p.utility, 'utility');\n    var combatWins = mc.eff >= mu.eff;\n\n    function fill(prefix, m, boxId, tagId){\n      document.getElementById(prefix + 'ComparBig').textContent = (m.eff*1e9).toFixed(m.eff*1e9 < 10 ? 2 : 0);\n      document.getElementById(prefix + 'StepCost').textContent = fmt(m.cost);\n      document.getElementById(prefix + 'StepGain').textContent = fmt(m.gain);\n      document.getElementById(prefix + 'StepBack').textContent =\n        weeks(m.paybackActions / p.actionsPerWeek) + ' (' + fmtInt(m.paybackActions) + ')';\n      document.getElementById(boxId).classList.toggle('win', (prefix === 'combat') === combatWins);\n      document.getElementById(tagId).hidden = (prefix === 'combat') !== combatWins;\n    }\n    document.getElementById('combatNextLbl').textContent = '→ ' + mc.level;\n    document.getElementById('utilNextLbl').textContent = '→ ' + mu.level;\n    fill('combat', mc, 'combatBox', 'combatWinTag');\n    fill('util', mu, 'utilityBox', 'utilWinTag');\n\n    var ratio = combatWins ? (mu.eff > 0 ? mc.eff/mu.eff : Infinity) : (mc.eff > 0 ? mu.eff/mc.eff : Infinity);\n    var ans = document.getElementById('verdictAnswer');\n    ans.textContent = combatWins ? 'COMBAT → ' + mc.level : 'UTILITY → ' + mu.level;\n    ans.classList.toggle('util', !combatWins);\n    document.getElementById('verdictWhy').innerHTML =\n      'At combat <strong>' + p.combat + '</strong> / utility <strong>' + p.utility + '</strong>, the next <strong>' +\n      (combatWins ? 'combat' : 'utility') + '</strong> level returns <strong>' +\n      (isFinite(ratio) ? ratio.toFixed(1) + '×' : '∞') + '</strong> more gold/action per gold spent. It costs ' +\n      fmt((combatWins?mc:mu).cost) + ' and pays back in ' + weeks((combatWins?mc:mu).paybackActions / p.actionsPerWeek) + '.';\n\n    var bp = crossoverUtility(p, p.combat);\n    document.getElementById('verdictBreak').innerHTML = bp < 0\n      ? 'Break-even is behind you: at combat <strong>' + p.combat + '</strong>, no utility level beats the next combat level.'\n      : 'Break-even: at combat <strong>' + p.combat + '</strong>, utility is worth buying up to <strong>' + bp + '</strong>' +\n        (p.utility <= bp ? ' — you are at ' + p.utility + ', so ' + (bp - p.utility) + ' worthwhile level' + (bp-p.utility===1?'':'s') + ' remain.'\n                         : ' — you are already past it at ' + p.utility + '.');\n\n    var ladder = [0,30,60,90,120,150,180,210,240];\n    if (ladder.indexOf(p.combat) < 0) ladder.push(p.combat);\n    ladder.sort(function(a,b){ return a-b; });\n    var rows = '';\n    for (var i = 0; i < ladder.length; i++){\n      var C = ladder[i], u = crossoverUtility(p, C), isCur = C === p.combat;\n      rows += '<tr class=\"' + (isCur ? 'current' : '') + '\">' +\n        '<td class=\"lvl\">' + C + (isCur ? ' <span class=\"tag\">you</span>' : '') + '</td>' +\n        '<td>' + (u < 0 ? 'none — combat always wins' : u) + '</td>' +\n        '<td>' + (u < 0 ? '—' : '+' + slotBoostPct(u) + '%') + '</td>' +\n        '<td>' + (u < 1 ? '—' : fmt(stepCost(u))) + '</td>' +\n        '<td>' + fmt(stepCost(C+1)) + '</td></tr>';\n    }\n    document.getElementById('crossTbody').innerHTML = rows;\n\n    var PLAN_STEPS = 100, plan = greedyPlan(p, PLAN_STEPS), strip = '';\n    for (var j = 0; j < plan.seq.length; j++){\n      var s = plan.seq[j];\n      strip += '<div class=\"cell ' + (s.channel === 'combat' ? 'c' : 'u') + (j === plan.flipAt ? ' flip' : '') +\n        '\" data-tip=\"#' + (j+1) + ' — ' + s.channel + ' slot level ' + s.level + ', ' + fmt(s.cost) + ' gold\">' + s.level + '</div>';\n    }\n    document.getElementById('planStrip').innerHTML = strip;\n    var nC = plan.seq.filter(function(s){ return s.channel === 'combat'; }).length;\n    var goldNow = keptPerAction(p, p.combat, p.utility);\n    document.getElementById('planNote').innerHTML =\n      '<strong>' + nC + ' combat</strong> and <strong>' + (PLAN_STEPS - nC) + ' utility</strong> levels, ending at combat ' +\n      plan.endC + ' / utility ' + plan.endU + '. Total ' + fmt(plan.total) + ' gold — about ' +\n      weeks(plan.total / goldNow / p.actionsPerWeek) + ' of income at ' + fmt(goldNow) + '/action kept and ' +\n      fmtInt(p.actionsPerWeek) + ' actions a week. ' +\n      (plan.flipAt < 0 ? 'No flip inside this window.' : 'First flip at purchase <strong>#' + (plan.flipAt + 1) + '</strong>.');\n  }\n\n  // ---- ROI tables ----\n  function buildTableRows(p, sweepFn, currentLevel, maxLevel){\n    var rows = [], cur = clampLevel(currentLevel), gAtCur = sweepFn(cur), cum = 0;\n    var topLevel = Math.max(maxLevel, cur), prevGold = null;\n    for (var L = 0; L <= topLevel; L++){\n      var gold = sweepFn(L);\n      var cost = L === 0 ? 0 : stepCost(L);\n      var marg = L === 0 ? 0 : gold - prevGold;\n      prevGold = gold;\n      var margAct = L === 0 ? null : cost/marg, cumCost = null, cumAct = null;\n      if (L > cur){ cum += cost; cumCost = cum; cumAct = cum/(gold - gAtCur); }\n      var cls = [];\n      if (L === cur) cls.push('current');\n      if (L > 0 && L % 30 === 1) cls.push('boundary');\n      var mw = margAct ? margAct/p.actionsPerWeek : null;\n      if (mw !== null && mw >= 2 && mw <= 4) cls.push('band');\n      rows.push('<tr class=\"'+cls.join(' ')+'\"'+(L===cur?' data-current=\"1\"':'')+'>' +\n        '<td class=\"lvl\">'+L+(L===cur?' <span class=\"tag\">current</span>':'')+'</td>' +\n        '<td>'+slotBoostPct(L)+'%</td><td>'+fmt(gold)+'</td>' +\n        '<td>'+(L===0?'—':fmt(cost))+'</td>' +\n        '<td>'+(margAct===null?'—':fmtInt(margAct))+'</td>' +\n        '<td>'+(mw===null?'—':mw.toFixed(2))+'</td>' +\n        '<td class=\"sep\">'+(cumCost===null?'—':fmt(cumCost))+'</td>' +\n        '<td>'+(cumAct===null?'—':fmtInt(cumAct))+'</td>' +\n        '<td>'+(cumAct===null?'—':(cumAct/p.actionsPerWeek).toFixed(2))+'</td></tr>');\n    }\n    return { html: rows.join(''), count: rows.length, top: topLevel };\n  }\n\n  // Put the user's current level where they can see it, with a few rows of\n  // context above and the rest - the levels they might actually buy - below.\n  function scrollToCurrent(wrapId){\n    var wrap = document.getElementById(wrapId);\n    if (!wrap) return;\n    var row = wrap.querySelector('tr[data-current]');\n    if (!row) return;\n    var head = wrap.querySelector('thead');\n    var headH = head ? head.getBoundingClientRect().height : 0;\n    wrap.scrollTop = Math.max(0, row.offsetTop - headH - row.offsetHeight * 4);\n  }\n\n  var combatMaxLevel = 200, utilityMaxLevel = 200;\n  var MAX_LEVEL_CAP = 5000;\n  var pendingScroll = true;\n\n  // Coalesced through rAF: typing fires `input` per keystroke and a full render\n  // rebuilds two tables plus a 400-step crossover scan. rAF never fires in a\n  // hidden tab, so a page opened into the background falls back to a timeout\n  // rather than sitting blank until it is looked at.\n  var renderQueued = false;\n  function requestRender(){\n    if (renderQueued) return;\n    renderQueued = true;\n    var run = function(){ renderQueued = false; render(); };\n    if (document.hidden) setTimeout(run, 0); else requestAnimationFrame(run);\n  }\n  var saveTimer = null;\n  function requestSave(){\n    clearTimeout(saveTimer);\n    saveTimer = setTimeout(function(){\n      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(collectRawValues())); } catch(e){}\n    }, 800);\n  }\n\n  function render(){\n    var p = readInputs();\n    syncPetInputsEnabled();\n    buildLedger(p);\n    buildBreakpoint(p);\n\n    var c = buildTableRows(p, function(L){ return goldPerAction(p, L, p.utility); }, p.combat, combatMaxLevel);\n    var u = buildTableRows(p, function(L){ return goldPerAction(p, p.combat, L); }, p.utility, utilityMaxLevel);\n    document.getElementById('combatTbody').innerHTML = c.html;\n    document.getElementById('utilityTbody').innerHTML = u.html;\n    document.getElementById('combatRowCount').textContent = 'levels 0–' + c.top;\n    document.getElementById('utilityRowCount').textContent = 'levels 0–' + u.top;\n    document.getElementById('combatMoreBtn').disabled = combatMaxLevel >= MAX_LEVEL_CAP;\n    document.getElementById('utilityMoreBtn').disabled = utilityMaxLevel >= MAX_LEVEL_CAP;\n\n    // Only on load and on apply - re-scrolling on every keystroke would fight\n    // the user while they read.\n    if (pendingScroll){ pendingScroll = false; scrollToCurrent('combatWrap'); scrollToCurrent('utilityWrap'); }\n    requestSave();\n  }\n\n  // ---- persistence ----\n  function collectRawValues(){\n    var out = {}, key;\n    for (key in FIELD_IDS) out[key] = document.getElementById(FIELD_IDS[key]).value;\n    for (key in CHECK_IDS) out['chk_' + key] = document.getElementById(CHECK_IDS[key]).checked;\n    return out;\n  }\n  function applyRawValues(vals){\n    var key;\n    for (key in FIELD_IDS) if (vals[key] !== undefined) document.getElementById(FIELD_IDS[key]).value = vals[key];\n    for (key in CHECK_IDS){\n      if (vals['chk_' + key] !== undefined) document.getElementById(CHECK_IDS[key]).checked = !!vals['chk_' + key];\n      else if (key === 'vip' && vals.vipChecked !== undefined) document.getElementById(CHECK_IDS[key]).checked = !!vals.vipChecked;\n    }\n  }\n  function applyDefaults(){\n    var key;\n    for (key in FIELD_IDS) document.getElementById(FIELD_IDS[key]).value = DEFAULTS[key];\n    for (key in CHECK_IDS) document.getElementById(CHECK_IDS[key]).checked = CHECK_DEFAULTS[key];\n    combatMaxLevel = 200; utilityMaxLevel = 200; pendingScroll = true;\n  }\n  function readStored(keys){\n    for (var i = 0; i < keys.length; i++){\n      try { var raw = localStorage.getItem(keys[i]); if (raw) return JSON.parse(raw); } catch(e){}\n    }\n    return null;\n  }\n  function saveAsDefault(){\n    var raw = collectRawValues();\n    for (var key in FIELD_IDS) DEFAULTS[key] = num(raw[key], DEFAULTS[key]);\n    try { localStorage.setItem(DEFAULTS_KEY, JSON.stringify(DEFAULTS)); } catch(e){}\n    flash(document.getElementById('saveDefaultBtn'), 'Saved ✓');\n  }\n  function flash(btn, text){\n    var original = btn.textContent;\n    btn.textContent = text;\n    setTimeout(function(){ btn.textContent = original; }, 1400);\n  }\n\n  // ---- live import ----\n  // Every entry is optional and carries its own source string; a field that\n  // could not be read is ABSENT rather than defaulted. Nothing is guessed - a\n  // plausible wrong input changes the recommendation without looking like it.\n  var LIVE_MAP = {\n    combat:          { label: 'Combat slot',       field: 'combat' },\n    utility:         { label: 'Utility slot',      field: 'utility' },\n    characterLevel:  { label: 'Character level',   field: 'characterLevel' },\n    monsterLevel:    { label: 'Monster level',     field: 'monsterLevel' },\n    partyMembers:    { label: 'Party members',     field: 'partyMembers' },\n    othersGoldBoost: { label: 'Party average', field: 'othersGoldBoost', suffix: '%' },\n    goldBoost:       { label: 'Your gold boost',   field: 'goldBoost', suffix: '%' },\n    actionsPerWeek:  { label: 'Actions / week',    field: 'actionsPerWeek' },\n    tax:             { label: 'Village tax',       field: 'tax', suffix: '%' },\n    observedGold:    { label: 'Observed gold/act', field: 'observedGold', scale: 1e-9, suffix: 'B' }\n  };\n  var liveData = null;\n  var livePetModifiers = null;\n  var livePartyMembers = null;   // [{ name, gold }] - see renderPartyAverageTip()\n  var livePartyMe = null;        // which of them is you, so the average excludes you\n\n  function initLive(){\n    var card = document.getElementById('liveCard');\n    var src = (typeof window !== 'undefined' && window.AWOO_LIVE) || null;\n    if (!src || !src.fields) return;\n\n    if (src.pet && typeof src.pet.flat === 'number' && typeof src.pet.pct === 'number') {\n      livePetModifiers = { flat: src.pet.flat, pct: src.pet.pct, potion: src.pet.potion || 0,\n                           atSlot: src.pet.atSlot };\n    }\n    if (src.party && Array.isArray(src.party.members)) {\n      livePartyMembers = src.party.members;\n      livePartyMe = src.party.me || null;\n    }\n    var keys = Object.keys(src.fields).filter(function(k){\n      return LIVE_MAP[k] && src.fields[k] && typeof src.fields[k].value === 'number' && isFinite(src.fields[k].value);\n    });\n    if (!keys.length && !livePetModifiers) return;\n\n    liveData = src;\n    card.classList.add('on');\n    var ageMin = src.ts ? Math.round((Date.now() - src.ts)/60000) : null;\n    document.getElementById('liveWhen').textContent = ageMin === null ? '' : (ageMin < 1 ? 'just now' : ageMin + 'm ago');\n    document.getElementById('liveEmpty').hidden = true;\n    document.getElementById('liveActions').hidden = false;\n\n    var html = keys.map(function(k){\n      var m = LIVE_MAP[k], f = src.fields[k], v = f.value * (m.scale || 1);\n      return '<span class=\"k\" data-tip-dev=\"' + tipAttr(f.from ? 'Read from: ' + f.from : '') + '\">' + m.label + '</span>' +\n        '<span class=\"v\">' + (Math.abs(v) >= 1000 ? fmtInt(v) : (Math.round(v*100)/100)) + (m.suffix || '') + '</span>';\n    }).join('');\n    if (livePetModifiers) html += '<span class=\"k\">Pet modifiers</span><span class=\"v\">imported</span>';\n    document.getElementById('liveList').innerHTML = html;\n\n    document.getElementById('liveApplyBtn').addEventListener('click', function(){\n      applyLive();\n      flash(document.getElementById('liveApplyBtn'), 'Applied ✓');\n    });\n  }\n\n  function applyLive(){\n    if (!liveData) return;\n    for (var k in liveData.fields){\n      var m = LIVE_MAP[k];\n      if (!m) continue;\n      var f = liveData.fields[k];\n      if (!f || typeof f.value !== 'number' || !isFinite(f.value)) continue;\n      var el = document.getElementById(FIELD_IDS[m.field]);\n      if (el) el.value = String(Math.round(f.value * (m.scale || 1) * 1000) / 1000);\n    }\n    if (liveData.fields.othersGoldBoost) document.getElementById(CHECK_IDS.othersSame).checked = false;\n    if (livePetModifiers) document.getElementById(CHECK_IDS.useLivePet).checked = true;\n    if (liveData.fields.goldBoost) document.getElementById(CHECK_IDS.useLiveGoldBoost).checked = true;\n    pendingScroll = true;\n    requestRender();\n  }\n\n  // Each member on its own line, then the average that the model actually\n  // uses. Showing only the average invites \"where did that come from\" every\n  // time it looks wrong; showing the inputs and the arithmetic answers it\n  // before it is asked.\n  function renderPartyAverageTip(){\n    var label = document.getElementById('partyAvgLabel');\n    if (!label) return;\n    if (!livePartyMembers || !livePartyMembers.length){\n      label.removeAttribute('data-tip');\n      label.classList.remove('tip');\n      return;\n    }\n    // Show the working, and show the RIGHT average. The field holds the average\n    // of the OTHER members, because this page models you from your own boosts\n    // and multiplies the rest by (members - 1) — averaging you in as well would\n    // count you twice. A tooltip that quietly showed the all-members average\n    // next to a field holding a different number is worse than none.\n    var lines = [], sum = 0, n = 0;\n    for (var i = 0; i < livePartyMembers.length; i++){\n      var m = livePartyMembers[i];\n      var pct = m.gold * 100;\n      var isMe = livePartyMe && m.name === livePartyMe;\n      if (!isMe){ sum += pct; n++; }\n      lines.push((isMe ? '• ' : '  ') + m.name + '   ' + pct.toFixed(1) + '%' + (isMe ? '   (you)' : ''));\n    }\n    lines.push('');\n    lines.push(n\n      ? 'average of the other ' + n + '   ' + (sum / n).toFixed(1) + '%'\n      : 'average   ' + (sum / livePartyMembers.length).toFixed(1) + '%');\n    if (n) lines.push('(you are modelled from your own boosts above)');\n    label.setAttribute('data-tip', lines.join('\\n'));\n    label.classList.add('tip');\n  }\n\n  // Greying out is the honest signal: when real pet data is in use, the\n  // normalisation inputs are not contributing and should not look as if they are.\n  function syncPetInputsEnabled(){\n    var live = document.getElementById(CHECK_IDS.useLivePet);\n    live.disabled = !livePetModifiers;\n    var on = live.checked && !!livePetModifiers;\n    ['petILevel','petTier','petRollPercentile'].forEach(function(k){\n      document.getElementById(FIELD_IDS[k]).disabled = on;\n    });\n\n    // Same honesty rule for the gold-boost override: when one measured number\n    // is doing the work, the components must not look as though they are.\n    var gbCheck = document.getElementById(CHECK_IDS.useLiveGoldBoost);\n    var gbValue = num(document.getElementById(FIELD_IDS.goldBoost).value, 0);\n    gbCheck.disabled = !(gbValue > 0);\n    var gbOn = gbCheck.checked && gbValue > 0;\n    ['enchants','sculptures','skillTree','petGoldMod','market','pvpGoldTile'].forEach(function(k){\n      document.getElementById(FIELD_IDS[k]).disabled = gbOn;\n    });\n    document.getElementById('goldBoostNote').textContent = gbOn\n      ? 'Measured total in use — these components are ignored. Village still feeds Potion Effect.'\n      : (gbValue > 0 ? 'A measured total is available; tick to use it instead of the components.' : '');\n  }\n\n  function initProvenance(){\n    var ul = document.getElementById('provenanceList');\n    var names = (window.AWOO_FACTS && Object.keys(window.AWOO_FACTS)) || [];\n    // Evidence tier, file and last-checked date per fact, generated by the\n    // build from the same data/ entries as the functions (AWOO_FACTS_META).\n    ul.innerHTML = names.length\n      ? AWOO_TOOL_SETTINGS.sources(names) +\n        '<li>Emitted into this page by <code>userscripts/build.mjs</code> from <code>data/</code>. Correct the fact in the core and rebuild — nothing here is retyped.</li>'\n      : '<li>This copy was opened without the generated facts block.</li>';\n  }\n\n  function extend(which, by, to){\n    if (which === 'combat') combatMaxLevel = Math.min(MAX_LEVEL_CAP, to !== undefined ? to : combatMaxLevel + by);\n    else utilityMaxLevel = Math.min(MAX_LEVEL_CAP, to !== undefined ? to : utilityMaxLevel + by);\n    requestRender();\n  }\n\n  function init(){\n    var savedDefaults = readStored([DEFAULTS_KEY].concat(LEGACY_DEFAULTS));\n    if (savedDefaults) for (var dk in DEFAULTS) if (savedDefaults[dk] !== undefined) DEFAULTS[dk] = savedDefaults[dk];\n\n    applyDefaults();\n    var saved = readStored([STORAGE_KEY].concat(LEGACY_STORAGE));\n    if (saved) applyRawValues(saved);\n\n    for (var key in FIELD_IDS) document.getElementById(FIELD_IDS[key]).addEventListener('input', requestRender);\n    for (var ckey in CHECK_IDS) document.getElementById(CHECK_IDS[ckey]).addEventListener('change', requestRender);\n\n    document.getElementById('resetBtn').addEventListener('click', function(){ applyDefaults(); requestRender(); });\n    document.getElementById('saveDefaultBtn').addEventListener('click', saveAsDefault);\n\n    [['combat','combatWrap'],['utility','utilityWrap']].forEach(function(pair){\n      var which = pair[0], wrapId = pair[1];\n      document.getElementById(which + 'MoreBtn').addEventListener('click', function(){ extend(which, 50); });\n      document.getElementById(which + 'JumpBtn').addEventListener('click', function(){\n        var v = clampLevel(document.getElementById(which + 'JumpInput').value);\n        if (v > 0) extend(which, 0, v);\n      });\n      document.getElementById(which + 'JumpInput').addEventListener('keydown', function(e){\n        if (e.key === 'Enter') document.getElementById(which + 'JumpBtn').click();\n      });\n      // One-time expansion to fit the viewport, leaving room for the header and\n      // the controls. Not a drag handle, not incremental steps.\n      var btn = document.getElementById(which + 'ExpandBtn');\n      btn.addEventListener('click', function(){\n        var wrap = document.getElementById(wrapId);\n        var tall = wrap.classList.toggle('tall');\n        btn.textContent = tall ? 'Shrink' : 'Expand';\n        scrollToCurrent(wrapId);\n      });\n    });\n\n    initTips();\n    initLive();\n    renderPartyAverageTip();\n    initProvenance();\n    AWOO_TOOL_SETTINGS.mount(document.getElementById('gear'));\n    render();\n  }\n\n  // Named so it is obvious at any call site that this is a test seam, not an\n  // API - same reasoning as Core's __modulesForTest.\n  window.__PARTY_GOLD_ROI_FOR_TEST = {\n    buildProfile: buildProfile, goldPerAction: goldPerAction, keptPerAction: keptPerAction,\n    marginal: marginal, crossoverUtility: crossoverUtility, greedyPlan: greedyPlan,\n    slotBoostPct: slotBoostPct, stepCost: stepCost,\n    personalGoldTotal: personalGoldTotal, pooledBase: pooledBase\n  };\n\n  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);\n  else init();\n})();\n</script>\n";

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
  })("pet-slot-alarm", "4.12.1", function (Core) {


  const ACTION_MS = 10_000;
  const AMBIENT_POLL_MS = 8_000;
  const SLOT_LABEL = 'combat';
  const MODULE_ID = 'pet-slot-alarm';
  const STORAGE_KEY = `awoo:${MODULE_ID}:v3`;

  // ---- alarm cadence ----
  //
  // A REPORTED BUG SHAPED THIS. A user hit "ready", bought the upgrade, and
  // navigated away in the same second; the tracker never got to re-read the
  // slot card, so it kept believing the OLD level was still unaffordable-then-
  // affordable, and chimed every 30s. Disabling the module did not stop it
  // (D1 below), and disabling the SCRIPT does not unload already-running code
  // from an open page, so the only thing that worked was killing the browser.
  //
  // The cadence is now: quick at first, decelerating, and it GIVES UP. An
  // alarm that cannot stop on its own is not a safety feature, it is a
  // hostage situation.
  const ALARM_DEFAULTS = {
    firstMs: 10_000,     // gap before the second chime
    maxMs: 120_000,      // never slower than this
    growth: 1.35,        // each gap this much longer than the last
    maxRepeats: 25,      // then auto-silence, with a way back
    volume: 0.32,
  };
  let alarmCfg = Object.assign({}, ALARM_DEFAULTS);
  let alarmRepeats = 0;
  // ---- number parsing/formatting: delegated to Core ----
  // A module must NEVER carry its own separator logic. The user's decimal /
  // thousands convention is a per-character game setting (see Core), so a
  // local guess is wrong for half the player base - "1.234" is 1234 under one
  // convention and 1.234 under the other.

  function parseGoldString(str) {
    if (!str) return null;
    return Core.parseNumber(String(str).replace(/gold/gi, ''));
  }

  function formatGold(value) {
    return Core.formatNumber(value);
  }

  function formatMsRemaining(ms) {
    if (ms === null) return { actionsStr: '∞', timeStr: 'unlimited' };
    const clamped = Math.max(0, ms);
    const totalSeconds = Math.ceil(clamped / 1000);
    const actionsLeft = Math.max(0, Math.ceil(clamped / ACTION_MS));
    const hh = Math.floor(totalSeconds / 3600);
    const mm = Math.floor((totalSeconds % 3600) / 60);
    return { actionsStr: `${actionsLeft}`, timeStr: `${hh}:${String(mm).padStart(2, '0')}` };
  }

  function formatAgo(atMs) {
    if (atMs === null) return 'never';
    const s = Math.max(0, Math.floor((Date.now() - atMs) / 1000));
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    return `${Math.floor(m / 60)}h ago`;
  }

  // ---- pet slot upgrade cost ----
  // The formula itself is GENERATED into this file from
  // data/formulas/pets.json by userscripts/build.mjs — see the generated
  // block at the top. That is INSTRUMENTATION.md §6's option 1: the fact is
  // not copied here, it is emitted, so a correction in data/ arrives on the
  // next build rather than needing someone to notice. This wrapper is the
  // only local part: the generated function returns a cumulative cost across
  // a level RANGE, and what this module wants is the next single step.
  function nextUpgradeCost(currentLevel) {
    return petSlotUpgradeCost(currentLevel, currentLevel + 1).value;
  }

  // ---- Pets page: slot card read ----

  // REPORTED 2026-09-06: the live import picked up somebody else's slot levels.
  //
  // The card selectors are generic, so they match just as happily on another
  // player's profile as on your own pets page — and a wrong slot level silently
  // changes both the alarm's cost target and the ROI tool's recommendation.
  //
  // The gate is a pathname allowlist rather than anything cleverer, because the
  // failure has to be conservative: on any page we are not sure about, we read
  // NOTHING and keep the value we already had. A missing reading is visible in
  // the panel ("not read yet"); a wrong one is not.
  //
  // FIXED 2026-09-10 — REPORTED REGRESSION: "alarm doesn't capture the pet
  // slot level any more... used to do that successfully and stable." Root
  // cause: a live patch moved the player's own Pets page from `/game/pets`
  // to `/game/profile/pets` (user-confirmed live, this session) — which broke
  // TWO things in the old gate at once: the prefix match no longer matched
  // the new own-page path at all, AND even a widened prefix match would have
  // been immediately vetoed by the very blacklist this function used to keep
  // out other players' views (`/profile/` was on it, precisely because
  // "someone else's profile" was the failure mode being guarded against —
  // and now that literal word is part of YOUR OWN path too).
  //
  // Replaced the prefix + word-blacklist with an EXACT match on the full own-
  // page path instead of trying to patch the blacklist. This sidesteps the
  // conflict rather than re-solving it with another guessed word: any other
  // player's view needs an extra path segment (an id, a slug, `/view/...`,
  // whatever the game actually uses — still not live-confirmed, see the note
  // below), and an exact match rejects every one of those by construction,
  // with no need to enumerate them. Doubt still reads as "not sure" and
  // returns false, matching this function's whole reason for existing.
  //
  // STILL NEEDS ONE LIVE CONFIRMATION: what another player's Pets view URL
  // actually looks like now, to be sure it does NOT also collapse to exactly
  // `/game/profile/pets` (e.g. if the game scopes the viewed player by query
  // string or session state rather than the path). Exact-match is strictly
  // safer than the old prefix+blacklist against everything checked so far,
  // but has not been checked against a real other-player URL post-patch.
  function isOwnPetsPage() {
    return location.pathname.replace(/\/+$/, '') === '/game/profile/pets';
  }

  function findSlotCard(label) {
    if (!isOwnPetsPage()) return null;
    const want = (label || SLOT_LABEL).toLowerCase();
    const titles = document.querySelectorAll('[data-slot="card-title"]');
    for (const title of titles) {
      if (title.textContent.trim().toLowerCase() === want) {
        return title.closest('[data-slot="card"]');
      }
    }
    return null;
  }

  function findUpgradeButton(card) {
    for (const btn of card.querySelectorAll('button')) {
      if (btn.textContent.trim().toLowerCase() === 'upgrade slot') return btn;
    }
    return null;
  }

  function readSlotLevel(card) {
    for (const el of card.querySelectorAll('.text-muted-foreground')) {
      const m = el.textContent.match(/slot level:\s*(\d+)/i);
      if (m) return parseInt(m[1], 10);
    }
    return null;
  }

  function readCurrentGold(card) {
    const el = card.querySelector('.text-red-500, .text-green-500');
    return el ? parseGoldString(el.textContent) : null;
  }

  const boundUpgradeButtons = new WeakSet();
  function bindUpgradeButtonListener(btn) {
    if (!btn || boundUpgradeButtons.has(btn)) return;
    boundUpgradeButtons.add(btn);
    btn.addEventListener('click', () => {
      // D3 — the level we hold is now WRONG, and the cost of a wrong level is
      // a permanently-satisfied "ready" test. Treat it as unknown rather than
      // stale: recomputeEta() refuses without a level, so no alarm can fire on
      // a belief we know is out of date. If the re-read below never lands
      // (the user navigated away in the same second, which is exactly what
      // happened), it stays unknown and stays quiet until the Pets page is
      // seen again.
      lastSync = { atMs: Date.now(), level: null, current: null };
      trackerEtaMs = null;
      trackerAlarmFired = false;
      trackerAcknowledged = false;
      nextAlarmAtMs = null;
      alarmRepeats = 0;
      render();
      // the page may take a moment to reflect the purchase; check twice
      setTimeout(refreshFromLiveData, 400);
      setTimeout(refreshFromLiveData, 1200);
    });
  }

  // ---- Party Battle page: automatic one-shot gold/action grab ----
  // Purely reads what the page already rendered from its own battle-result
  // card - no extra requests beyond normal play, and only tried once per
  // visit to that page (not a continuous poll).

  function isPartyBattlePage() {
    return location.pathname.startsWith('/game/party/battle');
  }

  let lastPathname = location.pathname;
  let partyRateGrabbedThisVisit = false;
  function checkRouteChange() {
    const path = location.pathname;
    if (path !== lastPathname) {
      lastPathname = path;
      if (isPartyBattlePage()) partyRateGrabbedThisVisit = false;
    }
  }

  // The battle card, read for BOTH numbers it shows.
  //
  // It reports gold gained and gold kept, and the difference is the village
  // tax. That makes the tax rate a derived measurement rather than something
  // the user has to look up and type - and it is measured from the same card
  // in the same instant, so the two figures cannot drift apart.
  //
  // Guarded hard, because a wrong tax silently rescales every number in the
  // ROI tool: both values must parse, the kept must be strictly smaller and
  // strictly positive, and the implied rate must land in a sane band. Anything
  // else returns no rate at all rather than a suspicious one.
  function scanPartyGoldCard() {
    const root = document.querySelector('main') || document.body;
    for (const span of root.querySelectorAll('.font-semibold')) {
      if (!/gold$/i.test(span.textContent.trim())) continue;
      const muted = span.parentElement && span.parentElement.querySelector('.text-muted-foreground');
      if (!muted) continue;
      const lines = [...muted.querySelectorAll('div')].map((d) => d.textContent.trim());
      if (!lines.length) continue;

      let kept = null, gross = null;
      for (const line of lines) {
        // suffix set matches the game's own ladder (k..ud), not just k/m/b/t
        const keptMatch = line.match(/^([\d.,]+\s*(?:[a-z]{1,2})?)\s*kept/i);
        if (keptMatch) { const v = parseGoldString(keptMatch[1]); if (v !== null) kept = v; continue; }
        const bare = line.match(/^([\d.,]+\s*(?:[a-z]{1,2})?)\s*(?:gold\b|gained\b)?$/i);
        if (bare) { const v = parseGoldString(bare[1]); if (v !== null && v > 0) gross = Math.max(gross || 0, v); }
      }
      if (kept === null) continue;

      let taxRate = null;
      if (gross !== null && gross > kept && kept > 0) {
        const rate = 1 - kept / gross;
        // A village tax outside this band is far likelier to be two unrelated
        // numbers on one card than a real rate.
        if (rate > 0.0005 && rate < 0.75) taxRate = rate;
      }
      return { kept, gross, taxRate };
    }
    return null;
  }


  // ---- Ambient sidebar stat (party actions remaining) ----
  // Polled slowly and scoped to the sidebar - this is "nice to have" context,
  // not latency-sensitive, so it stays off the fast debounced refresh path.

  // The persistent gold counter, wherever the shell renders it.
  //
  // THIS IS WHAT LETS THE ALARM WORK WITHOUT THE PETS PAGE. The upgrade cost is
  // a formula we already carry (generated from data/formulas/pets.json), and the
  // slot level changes only when you buy one - so the single value that has to
  // stay fresh is your gold, and the game shows that on every screen. Requiring
  // a visit to Pets > Combat just to learn "can I afford it yet" was the tracker
  // asking the page a question it could answer itself.
  //
  // Two passes, strict first. Nothing is inferred: if neither pass finds a
  // labelled gold figure, the answer is null and the panel says so.
  function readGlobalGold(root) {
    for (const el of root.querySelectorAll('div, span, p')) {
      if (el.children.length > 0) continue;
      const m = el.textContent.trim().match(/^([\d.,]+\s*[a-z]{0,2})\s*gold$/i);
      if (m) {
        const val = parseGoldString(m[1]);
        if (val !== null) return val;
      }
    }
    // Split markup: the number and the word "gold" in sibling nodes. Only
    // accepted when the PARENT's own text is nothing but that pair, which is
    // what keeps a random number next to the word "gold" in a sentence out.
    for (const el of root.querySelectorAll('div, span, p')) {
      if (el.children.length > 0) continue;
      const raw = el.textContent.trim();
      if (!/^[\d.,]+\s*[a-z]{0,2}$/i.test(raw)) continue;
      const parent = el.parentElement;
      if (!parent) continue;
      if (!/^[\d.,]+\s*[a-z]{0,2}\s*gold$/i.test(parent.textContent.trim())) continue;
      const val = parseGoldString(raw);
      if (val !== null) return val;
    }
    return null;
  }

  function readPartyActionsRemaining(root) {
    for (const el of root.querySelectorAll('div, span')) {
      if (el.children.length > 0) continue;
      const m = el.textContent.trim().match(/^([\d.,]+)\s*party$/i);
      if (m) {
        const val = parseGoldString(m[1]);
        if (val !== null) return Math.round(val);
      }
    }
    return null;
  }

  let partyActionsRemaining = null;
  let partyActionsAtMs = null;
  let partyStaleSaidAtMs = null; // rate-limits the stale-party-reading strip line
  let keepAwakeBeforeSilence = false; // what silencing pulled down, so un-silencing can restore it

  // PLAYER confidence, and deliberately a setting rather than a constant.
  // The user's own figure: party actions run overnight, the daily reset lands
  // in the middle, and the pool is topped up by roughly this much before the
  // session ends. It is an average of someone's own experience, not a measured
  // game fact, so it lives where it can be corrected and is labelled as an
  // assumption wherever it changes a number. 0 turns it off.
  const OVERNIGHT_ACTIONS_DEFAULT = 860;
  let overnightActions = OVERNIGHT_ACTIONS_DEFAULT;

  // probeMergedMultipliers walks the React fiber, which is not free, and the
  // projection wants it on every render. Cached with a TTL rather than probed
  // per frame; null means "not readable right now", which the projection
  // reports rather than papering over.
  let mergedCache = null, mergedCacheAtMs = 0;
  const MERGED_TTL_MS = 60000;
  function mergedMultipliers() {
    if (mergedCache && Date.now() - mergedCacheAtMs < MERGED_TTL_MS) return mergedCache;
    if (typeof Core.probeMergedMultipliers !== 'function') return null;
    const m = Core.probeMergedMultipliers();
    if (m) { mergedCache = m; mergedCacheAtMs = Date.now(); }
    return m || null;
  }
  let goldNow = null;      // gold read off the persistent counter
  let goldAtMs = null;
  let goldFrom = null;     // 'sidebar' | 'pets card' - shown, never guessed

  function pollAmbientStats() {
    const root = document.getElementById('sidebar-left') || document.body;
    const remaining = readPartyActionsRemaining(root);
    if (remaining !== null) { partyActionsRemaining = remaining; partyActionsAtMs = Date.now(); }

    const gold = readGlobalGold(root);
    if (gold !== null) { goldNow = gold; goldAtMs = Date.now(); goldFrom = 'sidebar'; recomputeEta(); }

    // The ambient poll is now on the alarm's critical path: on most pages it is
    // the ONLY thing that learns your gold changed, so it has to be allowed to
    // ring. checkTrackerReady() is idempotent and cheap.
    if (runState === 'running') checkTrackerReady();
    render();
  }

  // ---- session (Start/Stop/Reset - controls whether the alarm is armed) ----

  let runState = 'idle'; // idle | running
  let runEndsAtMs = null; // absolute Date.now() deadline; null = unlimited
  let configuredRunActions = null; // null = unlimited

  // WALL CLOCK, NOT TICK COUNTING. The old code did `runRemainingMs -= 1000`
  // once per timer callback, which silently assumed the callback fires once a
  // second. It does not: a backgrounded tab clamps timers to roughly once a
  // MINUTE, so a session left running in the background counted down ~60x too
  // slowly and the "actions remaining" number was simply wrong on return.
  // Deriving remaining time from a stored deadline makes the display correct
  // no matter how often - or how rarely - anything actually runs.
  function runRemaining() {
    return runEndsAtMs === null ? null : runEndsAtMs - Date.now();
  }

  // ---- the run's end condition (v4.8) ----
  //
  // "Run for N actions" became "run until N actions remain, PARTY-WIDE", and
  // that is not a relabel: it swaps a DEADLINE, which cannot fail, for a
  // THRESHOLD on a live probe, which can. `configuredRunActions` now means the
  // party-actions figure to stop AT, not a count of your own actions to burn.
  //
  // Three rules, and the first is the one that matters:
  //
  // 1. AN ABSENT READING NEVER ENDS THE SESSION. Treating "I could not read
  //    the party's actions" as "the party has none left" is absent-as-zero,
  //    the exact failure CLAUDE.md rule 3 exists to stop, and here it would
  //    silence an alarm the user is relying on. Absent holds, and says so.
  // 2. A reading that has gone stale is reported, not trusted silently. The
  //    ambient poll refreshes roughly every 8s; a value minutes old means the
  //    page stopped showing it, which the user should know before the
  //    threshold fires off it.
  // 3. With no party reading ever seen, the old clock-based deadline still
  //    governs, so a session started on a page that never exposes the figure
  //    behaves exactly as it did before rather than running forever.
  const PARTY_STALE_MS = 150000;
  function runStatus() {
    if (configuredRunActions === null) return { mode: 'unlimited', done: false };
    if (partyActionsRemaining !== null) {
      const staleMs = partyActionsAtMs === null ? null : Date.now() - partyActionsAtMs;
      return {
        mode: 'party',
        done: partyActionsRemaining <= configuredRunActions,
        left: partyActionsRemaining - configuredRunActions,
        stale: staleMs !== null && staleMs > PARTY_STALE_MS,
        staleMs,
      };
    }
    const left = runRemaining();
    return { mode: 'clock', done: left !== null && left <= 0, left };
  }

  function startTracking() {
    if (runState === 'running') return;
    runEndsAtMs = configuredRunActions !== null ? Date.now() + configuredRunActions * ACTION_MS : null;
    trackerAlarmFired = false;
    trackerAcknowledged = false;
    nextAlarmAtMs = null;
    runState = 'running';
    const ctx = ensureAudioCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    applyKeepAwake();
    say('done', configuredRunActions === null
      ? 'Session started — running until you stop it.'
      : `Session started — running until ${configuredRunActions} party actions remain.`);
    reportState('running', '');
    refreshFromLiveData();
  }

  // `reason` distinguishes the two ways a session ends, because they are not
  // the same event: reaching the threshold is a RESULT, and the user pressing
  // Stop is them ending it. The strip's levels carry that difference (`done`
  // vs `stopped`) rather than flattening both into "session over".
  function stopTracking(reason) {
    const wasRunning = runState === 'running';
    runState = 'idle';
    runEndsAtMs = null;
    applyKeepAwake();
    if (wasRunning) {
      if (reason) say('done', reason);
      else say('stopped', 'Session stopped by you.');
    }
    reportState('idle', '');
    render();
  }

  function resetSession() {
    runEndsAtMs = configuredRunActions !== null ? Date.now() + configuredRunActions * ACTION_MS : null;
    trackerAlarmFired = false;
    trackerAcknowledged = false;
    nextAlarmAtMs = null;
    say('done', 'Session reset.');
    refreshFromLiveData();
  }

  function commitDuration() {
    const raw = ui.durationInput.value.trim();
    if (raw === '') {
      configuredRunActions = null;
    } else {
      const n = parseInt(raw, 10);
      configuredRunActions = (Number.isFinite(n) && n > 0) ? n : null;
    }
    ui.durationInput.value = configuredRunActions !== null ? String(configuredRunActions) : '';
    if (runState === 'running') {
      runEndsAtMs = configuredRunActions !== null ? Date.now() + configuredRunActions * ACTION_MS : null;
    }
    render();
  }

  // ---- ETA computation ----

  let trackerEtaMs = null; // absolute Date.now()-based timestamp, or null = unknown
  let trackerAlarmFired = false;
  let trackerAcknowledged = false;
  let nextAlarmAtMs = null;
  let lastSync = { atMs: null, level: null, current: null };
  let goldRefusedAtMs = null; // rate-limits the "gold read refused" strip line
  // Both pet slot levels, remembered across pages. The tracker itself only
  // needs `combat`; `utility` exists so the ROI tool can be handed a real
  // starting position instead of a placeholder.
  let slotLevels = { combat: null, utility: null };
  let autoRateRaw = null; // gold/action grabbed from the Party Battle page
  let autoRateAtMs = null;
  let derivedTaxRate = null; // 0..1, from the same card - see scanPartyGoldCard()
  let customRateRaw = null; // manual override for the ETA test, null = use auto

  function effectiveRate() {
    return customRateRaw !== null ? customRateRaw : autoRateRaw;
  }

  // Freshest gold reading available, whatever produced it. The Pets card is
  // exact but only exists on that page; the sidebar counter is everywhere.
  function goldSnapshot() {
    const fromCard = (lastSync.current !== null && lastSync.atMs !== null)
      ? { value: lastSync.current, atMs: lastSync.atMs, from: 'pets card' } : null;
    const fromBar = (goldNow !== null && goldAtMs !== null)
      ? { value: goldNow, atMs: goldAtMs, from: goldFrom || 'sidebar' } : null;
    if (!fromCard) return fromBar;
    if (!fromBar) return fromCard;
    return fromBar.atMs >= fromCard.atMs ? fromBar : fromCard;
  }

  // What your gold is BY NOW, not when the page last rendered it.
  //
  // A backgrounded tab stops re-rendering, so the DOM figure goes stale exactly
  // when you most want it. The ETA was already estimate-based, so the alarm was
  // always right; it was the DISPLAY that lied. Projecting forward at the known
  // rate makes the panel agree with the alarm.
  //
  // Capped at the point it would cover the upgrade: past that, the projection
  // is unfalsifiable and there is nothing useful to claim.
  function projectedGold() {
    const gold = goldSnapshot();
    if (!gold) return null;
    const rate = effectiveRate();
    if (!rate) return { value: gold.value, from: gold.from, projected: false, atMs: gold.atMs };
    const actions = Math.floor((Date.now() - gold.atMs) / ACTION_MS);
    if (actions <= 0) return { value: gold.value, from: gold.from, projected: false, atMs: gold.atMs };
    const need = lastSync.level !== null ? nextUpgradeCost(lastSync.level) : Infinity;
    const projected = Math.min(gold.value + actions * rate, Math.max(gold.value, need));
    return { value: projected, from: gold.from, projected: true, atMs: gold.atMs };
  }

  function recomputeEta() {
    const gold = goldSnapshot();
    if (lastSync.level === null || !gold) { trackerEtaMs = null; return; }
    const deficit = nextUpgradeCost(lastSync.level) - gold.value;
    // Affordable as of that reading - the formula said so, no page visit needed.
    if (deficit <= 0) { trackerEtaMs = gold.atMs; return; }
    const rate = effectiveRate();
    if (!rate) { trackerEtaMs = null; return; }
    trackerEtaMs = gold.atMs + Math.ceil(deficit / rate) * ACTION_MS;
  }

  function commitCustomRate() {
    const raw = ui.goldRateInput.value.trim();
    if (raw === '') {
      customRateRaw = null;
    } else {
      const billions = parseFloat(raw.replace(',', '.'));
      customRateRaw = (Number.isFinite(billions) && billions > 0) ? billions * 1e9 : null;
    }
    recomputeEta();
    render();
  }

  function refreshFromLiveData() {
    checkRouteChange();

    if (isPartyBattlePage() && !partyRateGrabbedThisVisit) {
      const card = scanPartyGoldCard();
      if (card !== null) {
        autoRateRaw = card.kept;
        autoRateAtMs = Date.now();
        if (card.taxRate !== null) derivedTaxRate = card.taxRate;
        partyRateGrabbedThisVisit = true;
        // Named with the VALUE, not just "updated". A confirmation that does
        // not say what it read leaves you no better off than silence — you
        // still have to open the panel to find out whether it got a sane
        // number, which is the trip the line was supposed to save.
        say('done', `Party gold rate updated — ${formatGold(card.kept)}/action`
          + (card.taxRate !== null ? ` (tax ${Math.round(card.taxRate * 100)}%)` : ''));
      } else {
        // The page said it was the Party Battle page and the card was not
        // readable. Silence here is what made this whole class of problem
        // invisible: nothing distinguishes "no card on this page" from "the
        // scan has never worked". Once per visit, not once per poll.
        partyRateGrabbedThisVisit = true;
        say('refused', 'On the Party Battle page but could not read the gold card — rate left unchanged.');
      }
    }

    for (const label of ['combat', 'utility']) {
      const c = findSlotCard(label);
      if (!c) continue;
      const lv = readSlotLevel(c);
      if (lv !== null) slotLevels[label] = lv;
    }

    const card = findSlotCard();
    if (card) {
      const level = readSlotLevel(card);
      const current = readCurrentGold(card);
      const btn = findUpgradeButton(card);
      bindUpgradeButtonListener(btn);
      // PER-FIELD, NOT WHOLE-OBJECT. This used to be
      //   lastSync = { atMs: Date.now(), level, current };
      // which wrote BOTH probes' results including their nulls, so one failed
      // read replaced a perfectly good previous value with "unknown" — while
      // the identical pattern twenty lines above (slotLevels) correctly guards
      // with `if (lv !== null)`. Two sibling reads, opposite behaviour.
      //
      // This is a CLAUDE.md rule-3 violation, and absent-treated-as-present is
      // the failure mode this project has been hurt by worst: a null gold read
      // became "you have no gold", which moves the ETA rather than pausing it.
      // Keeping the last known value and SAYING the read refused is the whole
      // of §9.4 — refuse rather than guess, and tell the user which input went
      // missing rather than degrading silently.
      lastSync.atMs = Date.now();
      if (level !== null) lastSync.level = level;
      if (current !== null) lastSync.current = current;
      else if (goldRefusedAtMs === null || Date.now() - goldRefusedAtMs > 60000) {
        // Rate-limited: this poll runs every few seconds and a genuinely
        // absent card would otherwise fill the strip with one line per tick.
        goldRefusedAtMs = Date.now();
        say('refused', 'Could not read gold from the slot card — keeping the last value.');
      }
      if (btn && !btn.disabled) {
        trackerEtaMs = Date.now();
      } else {
        recomputeEta();
      }
    } else if (autoRateRaw !== null || customRateRaw !== null) {
      recomputeEta();
    }

    render();
  }

  function nextAlarmGap() {
    const gap = alarmCfg.firstMs * Math.pow(alarmCfg.growth, Math.max(0, alarmRepeats - 1));
    return Math.min(alarmCfg.maxMs, Math.round(gap));
  }

  function checkTrackerReady() {
    if (trackerEtaMs === null) return;
    const remaining = trackerEtaMs - Date.now();
    if (remaining > 0) {
      trackerAlarmFired = false;
      trackerAcknowledged = false;
      nextAlarmAtMs = null;
      alarmRepeats = 0;
      return;
    }
    if (trackerAcknowledged) return;
    // THE COMPANION OWNS THE NOISE WHEN IT HAS IT. Both alarms stay armed --
    // choosing one owner up front means getting it wrong exactly when the
    // Companion disappears -- so the browser stays silent only while the
    // Companion is genuinely delegating, and takes over the instant it is not.
    // The badge, the strip line and the ready state all still update either
    // way; this suppresses the SOUND, nothing else.
    if (companionMode() === 'companion') { trackerAlarmFired = true; return; }
    const now = Date.now();
    if (!trackerAlarmFired || now >= nextAlarmAtMs) {
      const first = !trackerAlarmFired;
      trackerAlarmFired = true;
      alarmRepeats++;
      playGentleAlarm();
      if (first) notifyReady();

      // D2 — THE CAP. Without it the only way out of a wrongly-latched ready
      // state is closing the browser, which is what actually happened to
      // someone. Silencing is not "giving up on telling you": the panel, the
      // badge and the title marker all stay lit.
      if (alarmRepeats >= alarmCfg.maxRepeats) {
        trackerAcknowledged = true;
        Core.toast(`Alarm silenced after ${alarmRepeats} chimes — still ready.`, {
          type: 'warn', duration: 12000,
          action: 'Ring again', onAction: () => { trackerAcknowledged = false; alarmRepeats = 0; render(); },
        });
      }
      nextAlarmAtMs = now + nextAlarmGap();
    }
  }

  function snoozeAlarm() {
    trackerAcknowledged = true;
    render();
  }

  // SILENCE vs SNOOZE, because a toggle makes them easier to confuse.
  //   Snooze  - acks THIS ready alert only. Keep-awake untouched, the setting
  //             untouched, and the next time the ETA goes stale it rings again.
  //   Silence - the heavy one. Acks, clears the whole cadence, and pulls down
  //             keep-awake, i.e. "stop making noise at all". Also the module's
  //             own disable path, which is why it must stay callable any time.
  //
  // `silenced` is a USER INTENT, held separately from the cadence fields it
  // clears. That separation is the whole reason un-silencing can work:
  // checkTrackerReady() legitimately resets trackerAcknowledged on its own
  // whenever a fresh reading pushes the ETA back into the future, so acked-ness
  // is not a place to remember a decision -- it would evaporate on the next
  // poll and the button would flip back to "Silence" on its own.
  let silenced = false;

  function silenceAlarm() {
    silenced = true;
    trackerAcknowledged = true;
    trackerAlarmFired = false;
    nextAlarmAtMs = null;
    alarmRepeats = 0;
    // Remembered so un-silencing can put back what silencing took, rather than
    // reading the checkbox -- which the user may have changed meanwhile.
    keepAwakeBeforeSilence = keepAwake;
    if (keepAwakeNodes) { keepAwake = false; applyKeepAwake(); }
    saveProgress();
  }

  // The way back. Deliberately NOT just `silenced = false`: the module has to
  // land in the state it would have been in had you never pressed it.
  //
  //   * Clearing trackerAcknowledged re-arms the chime, and checkTrackerReady()
  //     rings on the very next tick IF the upgrade is ready right now. If it is
  //     not, that same function leaves everything alone, so un-silencing while
  //     nothing is due is silent -- which is the behaviour you want and the
  //     reason this does not ring anything itself.
  //   * alarmRepeats resets so the cadence starts from the first gap again
  //     rather than resuming mid-curve at a nine-minute interval.
  //   * keep-awake comes back only if it was on when you silenced AND a session
  //     is still running; restoring it into an idle session would hold the tab
  //     awake for nothing.
  function unsilenceAlarm() {
    silenced = false;
    trackerAcknowledged = false;
    trackerAlarmFired = false;
    nextAlarmAtMs = null;
    alarmRepeats = 0;
    if (keepAwakeBeforeSilence && runState === 'running') {
      keepAwake = true;
      applyKeepAwake();
    }
    keepAwakeBeforeSilence = false;
    saveProgress();
  }

  // ---- alarm (Web Audio, self-contained) ----

  let audioCtx = null;
  function ensureAudioCtx() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; }
    }
    return audioCtx;
  }

  function playGentleAlarm() {
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523, 659, 784].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const start = now + i * 0.16;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(alarmCfg.volume, start + 0.04);
      gain.gain.linearRampToValueAtTime(0, start + 0.4);
      osc.connect(gain).connect(ctx.destination);
      // Torn down on `ended` rather than left to the graph. This alarm REPEATS
      // while unacknowledged, so it is six nodes per chime for as long as the
      // user is away — the one place in this module where "the browser will
      // probably collect it" is a bet made thousands of times.
      osc.onended = () => {
        try { osc.disconnect(); gain.disconnect(); } catch (e) { /* already gone */ }
      };
      osc.start(start);
      osc.stop(start + 0.45);
    });
  }

  // ---- the snapshot handed to the Party Gold ROI tool ----
  //
  // Everything here is read from what the page already rendered (or from the
  // React tree the page already built). Each field carries WHERE it came from,
  // and a field that could not be read is ABSENT rather than defaulted - the
  // tool then leaves that input alone. A plausible wrong slot level in a
  // "which should I buy" tool is worse than an empty one, because it changes
  // the answer without looking like it did.
  // The party, from the React tree rather than the Party page.
  //
  // Reading it out of the tree instead of scraping the overview matters for a
  // practical reason: the numbers are wanted while the user is on the BATTLE
  // page, and requiring a trip to Overview to import them is the same mistake
  // as requiring a trip to Pets to learn a slot level (S9).
  //
  // SHAPE SOURCE: data/formulas/party.json, party.fifthMemberPenalty.liveCapture
  // - a real 5-member party captured as members keyed by name, each carrying
  // gold / experience / statRate / dropRate as PERCENTAGES. That capture is
  // what makes this a read rather than a guess.
  function partyFromFiber() {
    if (!Core.walkFiber) return null;
    let out = null;
    Core.walkFiber((cand) => {
      const m = cand.members;
      if (!Array.isArray(m) || m.length < 1 || m.length > 5) return false;
      if (!m.every((x) => x && typeof x === 'object' && typeof x.name === 'string')) return false;
      // Each member's own stacked income>gold total is what party pooling sums
      // (party.gold.rewardBoostFormula). Accept it under either the flat key or
      // a nested multipliers object, and only if EVERY member has it - a
      // partial read would silently under-count the pool.
      const goldOf = (x) => {
        if (typeof x.gold === 'number' && isFinite(x.gold)) return x.gold;
        const mm = x.mergedMultipliers || x.multipliers;
        if (mm && typeof mm.gold === 'number' && isFinite(mm.gold)) return mm.gold;
        return null;
      };
      const golds = m.map(goldOf);
      out = {
        count: m.length,
        names: m.map((x) => x.name),
        golds: golds.every((g) => g !== null) ? golds : null,
      };
      return true;
    });
    return out;
  }


  // The pet's own rolled modifiers, recovered from the merged totals.
  //
  // THE SUBTLETY THAT MAKES THIS WORTH READING. merged.monsterGoldFlat is the
  // value the game USES, which per pets.slotBoostFormula is already
  // rawRolledValue x (1 + slotBoost/100). The ROI tool needs the RAW roll,
  // because it re-applies the boost itself while sweeping slot levels — hand it
  // the merged figure and every row would be boosted twice.
  //
  // So divide the boost back out at the slot level we observed. That is exact
  // if the pet is the only contributor, and an over-estimate of the raw roll by
  // whatever share comes from elsewhere if it is not. The user confirmed no
  // other sources on their account; the tool labels the values as derived so
  // the assumption travels with them rather than being buried here.
  function petRollsFromMerged(merged) {
    if (!merged || slotLevels.combat === null) return null;
    // The PET curve (pets.slotUpgrade.boostFormula). Was equipment's until 2026-09-09;
    // above slot level 180 that overstated the boost, which here would have
    // UNDER-stated the raw roll it is being divided back out of.
    const boost = 1 + petSlotBoostPercent(slotLevels.combat);   // fraction, not percent
    if (!(boost > 0)) return null;
    const flat = merged.monsterGoldFlat / boost;
    const pct = merged.monsterGoldPercentage / boost;
    if (!isFinite(flat) || !isFinite(pct)) return null;
    const out = { flat, pct, potion: 0, atSlot: slotLevels.combat };
    // Potion Effect rides the UTILITY slot, so it de-boosts against that one.
    if (typeof merged.potionEffect === 'number' && isFinite(merged.potionEffect)
        && slotLevels.utility !== null) {
      const uBoost = 1 + petSlotBoostPercent(slotLevels.utility);
      if (uBoost > 0) out.potion = merged.potionEffect / uBoost;
    }
    return out;
  }

  function collectLiveSnapshot() {
    const fields = {};
    const add = (key, value, from) => {
      if (typeof value === 'number' && isFinite(value) && value >= 0) fields[key] = { value, from };
    };

    add('combat', slotLevels.combat, 'Pets page');
    add('utility', slotLevels.utility, 'Pets page');

    const ch = Core.probeCharacter ? Core.probeCharacter() : null;
    if (ch) add('characterLevel', ch.level, 'character data');

    const party = partyFromFiber();
    if (party) {
      add('partyMembers', party.count, 'party data');
      // The OTHERS' average, not the party's. The tool models 'me' from my own
      // boosts and multiplies the rest by (members - 1), so handing it a figure
      // that included me would count me twice. Identifying which member is me
      // by name is the only way to drop the right one - and if that fails, the
      // field is omitted rather than sent slightly wrong.
      const me = Core.probeCharacter ? Core.probeCharacter() : null;
      if (party.golds && party.names && me && me.name) {
        const others = [];
        for (let i = 0; i < party.names.length; i++) {
          if (party.names[i] !== me.name) others.push(party.golds[i]);
        }
        if (others.length && others.length === party.count - 1) {
          const avg = others.reduce((a2, b2) => a2 + b2, 0) / others.length;
          add('othersGoldBoost', avg * 100, `avg of ${others.length} party member${others.length === 1 ? '' : 's'}`);
        }
      }
    }

    const rate = effectiveRate();
    add('observedGold', rate, customRateRaw !== null ? 'your custom rate' : 'party battle reward');

    if (derivedTaxRate !== null) add('tax', derivedTaxRate * 100, 'gained vs kept on a battle card');

    const merged = Core.probeMergedMultipliers ? Core.probeMergedMultipliers() : null;
    let pet = null;
    if (merged) {
      // Your stacked income>gold total, as a percentage — the number on the
      // Character > Boosts "Gold Boost" card. Sent as an OVERRIDE for the
      // tool's computed total, never merged into one of its components, which
      // would double-count against the others.
      if (typeof merged.gold === 'number' && isFinite(merged.gold)) {
        add('goldBoost', merged.gold * 100, 'merged multipliers');
      }
      pet = petRollsFromMerged(merged);
    }

    // The per-member breakdown travels alongside the average so the tool can
    // show its working. The average alone invites 'where did that come from'
    // every time it looks surprising.
    let partyDetail = null;
    if (party && party.golds && party.names) {
      const me2 = Core.probeCharacter ? Core.probeCharacter() : null;
      partyDetail = {
        me: me2 && me2.name ? me2.name : null,
        members: party.names.map((n, i) => ({ name: n, gold: party.golds[i] })),
      };
    }

    return {
      ts: Date.now(),
      // DELIBERATELY NOT RENAMED with the module's display label, and no
      // longer matching the @name either (that became "AWOO+: Pet Slot
      // Alarm" 2026-09-09, with the break accepted on purpose). This is a
      // provenance stamp on captured observations: records already on disk
      // carry this exact string, and changing it makes one producer look like
      // two whenever anything groups by source. It is a historical identifier,
      // not a label — if it ever must change, migrate the existing records in
      // the same commit rather than leaving two names for one tool.
      source: 'AWOO+: Pet Slot Alarm',
      numberProvenance: Core.numberProvenance ? Core.numberProvenance() : null,
      fields,
      pet,
      party: partyDetail,
    };
  }

  // ---- running in the background ----
  //
  // THE PROBLEM. A hidden tab is not a slow tab, it is a stopped one: Chrome
  // clamps a background page's timers to roughly once a minute, and stops
  // requestAnimationFrame entirely. For an idle game that is the normal case,
  // not the edge case - the tab you are waiting on is the tab you are not
  // looking at.
  //
  // THREE LAYERS, in order of how much they are relied on:
  //
  //   1. CORRECTNESS, unconditional: every value here is derived from
  //      Date.now(), never accumulated per tick (see runRemaining()). However
  //      rarely anything runs, what it computes when it does run is right.
  //      This layer is the one that matters and it needs no permission,
  //      no toggle and no browser cooperation.
  //   2. PROMPTNESS, best effort: the 1s heartbeat moves into a dedicated
  //      Worker, whose timers a hidden page throttles on a different and less
  //      aggressive schedule than its own. Plus an immediate re-check the
  //      moment the tab is looked at again. If the Worker fails to start, the
  //      setInterval fallback is used and nothing else changes.
  //   3. ESCALATION, opt-in: a desktop notification (survives a hidden tab by
  //      design) and a near-silent audio keepalive (a tab that is playing
  //      audio is exempted from the harshest throttling tier). Both default
  //      OFF - one needs a permission prompt, the other burns a little CPU,
  //      and neither should be spent without being asked for.
  let keepAwake = false;    // near-silent tone while armed
  let notifyOnReady = false; // desktop notification when the alarm first fires
  let keepAwakeNodes = null;
  let tickWorker = null;
  let tickFallback = null;

  // Chrome refuses to start an AudioContext before the user has interacted
  // with the page, and logs a warning every time you try. Restoring an armed
  // session at load did exactly that, twice, on every page load - noise in the
  // console that made a real error harder to spot, which is precisely what
  // happened here.
  //
  // So the keepalive waits for a gesture. Any click or key anywhere counts,
  // and by then the user has almost certainly touched the panel anyway.
  let hadUserGesture = false;
  function noteUserGesture() {
    if (hadUserGesture) return;
    hadUserGesture = true;
    document.removeEventListener('pointerdown', noteUserGesture, true);
    document.removeEventListener('keydown', noteUserGesture, true);
    applyKeepAwake();          // honour a restored preference now that we may
  }
  document.addEventListener('pointerdown', noteUserGesture, true);
  document.addEventListener('keydown', noteUserGesture, true);

  function applyKeepAwake() {
    const want = keepAwake && runState === 'running' && hadUserGesture;
    if (want === !!keepAwakeNodes) return;
    if (!want) {
      try { keepAwakeNodes.osc.stop(); } catch (e) { /* already stopped */ }
      // Both ends of the chain, not just the gain: osc -> gain -> destination.
      // Leaving osc connected to a disconnected gain keeps the pair reachable,
      // and this toggles every time tracking starts or stops.
      try { keepAwakeNodes.osc.disconnect(); } catch (e) { /* ignore */ }
      try { keepAwakeNodes.gain.disconnect(); } catch (e) { /* ignore */ }
      keepAwakeNodes = null;
      return;
    }
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 40;         // below where a laptop speaker reproduces anything
      gain.gain.value = 0.0008;         // non-zero so the tab counts as playing audio
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      keepAwakeNodes = { osc, gain };
    } catch (e) { keepAwakeNodes = null; }
  }

  function notifyReady() {
    if (!notifyOnReady) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible') return; // you are already looking at it
    try {
      const n = new Notification('Queslar — combat slot upgrade ready', {
        body: lastSync.level !== null
          ? `Slot ${lastSync.level} → ${lastSync.level + 1} is affordable.`
          : 'The next combat pet slot level is affordable.',
        tag: 'awoo-pet-slot-alarm', // replaces its own previous one instead of stacking
      });
      n.onclick = () => { try { window.focus(); n.close(); } catch (e) { /* ignore */ } };
    } catch (e) { /* notifications unavailable - the sound already played */ }
  }

  function requestNotifyPermission() {
    if (typeof Notification === 'undefined') return Promise.resolve('denied');
    if (Notification.permission !== 'default') return Promise.resolve(Notification.permission);
    try { return Promise.resolve(Notification.requestPermission()); }
    catch (e) { return Promise.resolve('denied'); }
  }

  function startHeartbeat() {
    // Worker timers are on a different throttling schedule to the page's own.
    // Best effort only - correctness never depends on the cadence.
    let url = null;
    try {
      const src = 'let id=null;onmessage=function(e){if(e.data==="start"){if(id)return;'
        + 'id=setInterval(function(){postMessage(0);},1000);}else{clearInterval(id);id=null;}};';
      url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      tickWorker = new Worker(url);
      tickWorker.onmessage = () => { try { masterTick(); } catch (e) { /* never kill the worker */ } };
      tickWorker.onerror = () => { tickWorker = null; if (!tickFallback) tickFallback = setInterval(masterTick, 1000); };
      tickWorker.postMessage('start');
    } catch (e) {
      tickWorker = null;
    } finally {
      // Revoked whether or not the Worker constructed. On the failure path the
      // URL would otherwise be held for the life of the page for nothing - the
      // browsers most likely to reject a blob Worker are exactly the ones where
      // that leak goes unnoticed.
      if (url) { try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ } }
    }
    if (!tickWorker) tickFallback = setInterval(masterTick, 1000);
  }

  // ---- persistence ----
  //
  // localStorage.setItem is SYNCHRONOUS and touches disk. render() runs every
  // second, so writing from there was ~86k blocking writes/day for a value that
  // meaningfully changes about once a minute. Instead: mark dirty, flush on a
  // slow timer, and always flush before the page goes away so nothing is lost.

  let storeDirty = false;
  function saveProgress() { storeDirty = true; }

  function flushProgress() {
    if (!storeDirty) return;
    storeDirty = false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        runState, runEndsAtMs, configuredRunActions,
        keepAwake, notifyOnReady, alarmCfg, derivedTaxRate,
        customRateValue: ui.goldRateInput.value, customRateRaw,
        autoRateRaw, autoRateAtMs,
        lastSync, slotLevels, trackerEtaMs, trackerAlarmFired, trackerAcknowledged, nextAlarmAtMs,
        partyActionsRemaining, partyActionsAtMs, overnightActions,
        panelOpen,
        savedAt: Date.now(),
      }));
    } catch (e) { /* storage unavailable, ignore */ }
  }

  function loadProgress() {
    let saved = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch (e) { saved = null; }
    if (!saved) return;

    configuredRunActions = typeof saved.configuredRunActions === 'number' ? saved.configuredRunActions : null;
    ui.durationInput.value = configuredRunActions !== null ? String(configuredRunActions) : '';

    if (typeof saved.customRateValue === 'string') ui.goldRateInput.value = saved.customRateValue;
    customRateRaw = typeof saved.customRateRaw === 'number' ? saved.customRateRaw : null;

    autoRateRaw = typeof saved.autoRateRaw === 'number' ? saved.autoRateRaw : null;
    autoRateAtMs = typeof saved.autoRateAtMs === 'number' ? saved.autoRateAtMs : null;

    if (saved.lastSync) lastSync = saved.lastSync;
    if (saved.slotLevels) slotLevels = Object.assign({ combat: null, utility: null }, saved.slotLevels);
    trackerEtaMs = typeof saved.trackerEtaMs === 'number' ? saved.trackerEtaMs : null;
    trackerAlarmFired = !!saved.trackerAlarmFired;
    trackerAcknowledged = !!saved.trackerAcknowledged;
    nextAlarmAtMs = typeof saved.nextAlarmAtMs === 'number' ? saved.nextAlarmAtMs : null;

    overnightActions = typeof saved.overnightActions === 'number' && saved.overnightActions >= 0
      ? saved.overnightActions : OVERNIGHT_ACTIONS_DEFAULT;
    partyActionsRemaining = typeof saved.partyActionsRemaining === 'number' ? saved.partyActionsRemaining : null;
    partyActionsAtMs = typeof saved.partyActionsAtMs === 'number' ? saved.partyActionsAtMs : null;

    panelOpen = !!saved.panelOpen;
    // windowGeometry itself is no longer read here (v6) — Core.createWindow
    // now owns geometry persistence under its own key; see
    // migrateWindowGeometryOnce(), called once before the window is created.

    keepAwake = !!saved.keepAwake;
    notifyOnReady = !!saved.notifyOnReady;
    if (typeof saved.derivedTaxRate === 'number' && isFinite(saved.derivedTaxRate)) {
      derivedTaxRate = saved.derivedTaxRate;
    }
    // Merged over the defaults, not replaced by them: a saved config from an
    // older version is missing whatever was added since, and a missing volume
    // reading as 0 would be a silently mute alarm.
    if (saved.alarmCfg && typeof saved.alarmCfg === 'object') {
      alarmCfg = Object.assign({}, ALARM_DEFAULTS, saved.alarmCfg);
    }

    if (saved.runState === 'running') {
      // v3 stored a REMAINING duration plus the save time; v4 stores the
      // deadline itself. Convert the old shape once so an armed session
      // survives the upgrade instead of silently disarming.
      const deadline = typeof saved.runEndsAtMs === 'number' ? saved.runEndsAtMs
        : (typeof saved.runRemainingMs === 'number'
            ? (saved.savedAt || Date.now()) + saved.runRemainingMs
            : null);
      if (deadline !== null && deadline <= Date.now()) {
        runState = 'idle';
        runEndsAtMs = null;
      } else {
        runState = 'running';
        runEndsAtMs = deadline;
      }
    }
  }

  // ---- rendering ----

  // Assigning .textContent replaces the text node and dirties layout even when
  // the string is identical, so compare first. ~15 writes/sec become ~0 at idle.
  function setText(el, value) {
    if (el && el.textContent !== value) el.textContent = value;
  }
  function setAttr(el, prop, value) {
    if (el && el[prop] !== value) el[prop] = value;
  }
  // For real ATTRIBUTES. setAttr assigns a property, which is right for
  // disabled/checked/title/className and silently wrong for anything else: it
  // was called with 'class' for the Start/Stop/Reset relevance dimming, which
  // set an unused expando named "class" and never changed a class at all —
  // the dimming has never shown in a real browser. 'class' now goes through
  // className; data-* attributes go through here. false/null/'' removes.
  function setAttrib(el, name, value) {
    if (!el || typeof el.setAttribute !== 'function') return;
    if (value === false || value === null || value === undefined || value === '') { el.removeAttribute(name); return; }
    const v = value === true ? '' : String(value);
    if (el.getAttribute(name) !== v) el.setAttribute(name, v);
  }

  // Writes the config INTO the inputs, plus a plain-language preview of the
  // resulting cadence. Four numbers do not tell you what the alarm will
  // actually do; "10s, 14s, 18s... stopping after ~9m" does.
  // NEVER write into a control the user is currently using. render() runs once
  // a second while the panel is open, so the previous version overwrote the
  // volume slider mid-drag and replaced half-typed numbers with the stored
  // value - the field fought back on every keystroke.
  function setFieldUnlessEditing(el, value) {
    if (!el || el === document.activeElement) return;
    setAttr(el, 'value', value);
  }

  // The preview is a 25-iteration loop and a string build, and it only changes
  // when the config does - which is on a click, not on a tick. Recomputing it
  // every second was work whose output was already on screen.
  let alarmPreviewKey = null;
  function renderAlarmSettings() {
    if (!ui.alarmVolume) return;
    setFieldUnlessEditing(ui.alarmVolume, String(Math.round(alarmCfg.volume * 100)));
    setText(ui.alarmVolumeOut, `${Math.round(alarmCfg.volume * 100)}%`);
    setFieldUnlessEditing(ui.alarmFirst, String(Math.round(alarmCfg.firstMs / 1000)));
    setFieldUnlessEditing(ui.alarmMax, String(Math.round(alarmCfg.maxMs / 1000)));
    setFieldUnlessEditing(ui.alarmRepeats, String(alarmCfg.maxRepeats));
    setFieldUnlessEditing(ui.alarmGrowth, String(alarmCfg.growth));

    const key = `${alarmCfg.firstMs}|${alarmCfg.maxMs}|${alarmCfg.growth}|${alarmCfg.maxRepeats}`;
    if (key === alarmPreviewKey) return;
    alarmPreviewKey = key;

    let total = 0;
    const gaps = [];
    for (let i = 1; i < alarmCfg.maxRepeats; i++) {
      const gap = Math.min(alarmCfg.maxMs, alarmCfg.firstMs * Math.pow(alarmCfg.growth, i - 1));
      total += gap;
      if (gaps.length < 3) gaps.push(`${Math.round(gap / 1000)}s`);
    }
    const mins = Math.round(total / 60000);
    setText(ui.alarmPreview, alarmCfg.maxRepeats <= 1
      ? 'One chime, then silence.'
      : `Gaps: ${gaps.join(', ')}… then silence after ~${mins < 1 ? '<1' : mins}m.`);
  }

  function render() {
    // Marking dirty must happen BEFORE the visibility bail: state keeps changing
    // while the panel is hidden (the countdown, the ETA), and skipping this
    // would silently stop persisting it.
    saveProgress();

    // The badge drives the top bar, so it must stay live even when the panel is
    // hidden. Everything below it is panel DOM and is skipped while invisible.
    //
    // REPORTED BUG: "ready" showed up before a session was even started. Cause:
    // trackerEtaMs is what got PERSISTED from the previous session and can sit
    // in the past the moment the page loads, well before Start is pressed again
    // — nothing gated the ready state on a session actually being armed. There
    // is nothing to be "ready" for if no alarm is armed to fire.
    const staleEta = trackerEtaMs !== null && trackerEtaMs <= Date.now();
    const isReady = runState === 'running' && staleEta;
    Core.setBadge(MODULE_ID, isReady);
    // The nav's state slot. "armed" was rejected as the wording — a session is
    // RUNNING, and when the upgrade is affordable the module needs you, which
    // is what `attention` means everywhere else in the overlay.
    if (runState === 'running') {
      const st = runStatus();
      reportState(isReady ? 'attention' : 'running',
        isReady ? 'upgrade ready'
          : st.mode === 'party' && !st.stale ? `${st.left} to go`
          : st.mode === 'clock' && st.left !== null ? formatMsRemaining(st.left).timeStr
          : 'running');
    } else {
      reportState('idle', '');
    }
    if (!panelOpen) return;

    renderAnswer(isReady, staleEta);
    // The label names the ACTION, not the state: a button reading "Silenced"
    // leaves you guessing whether pressing it silences or un-silences.
    if (ui.silenceBtn) {
      setText(ui.silenceBtn, silenced ? 'Un-silence' : 'Silence');
      setAttr(ui.silenceBtn, 'className', 'awoo-ui-btn' + (silenced ? ' awoo-ui-btn-primary' : ''));
    }
    renderProjection();

    // PROMINENCE TRACKS RELEVANCE. All three used to sit at equal weight in
    // every state, which made a row of three the loudest thing under the
    // countdown. Now the one that does something is normal and the others
    // dim -- dimmed rather than hidden, so the panel keeps its shape and
    // nothing reflows when the state changes.
    const running = runState === 'running';
    setAttr(ui.startBtn, 'className', 'awoo-ui-btn' + (running ? ' awoo-pet-slot-alarm-dim' : ' awoo-ui-btn-primary'));
    setAttr(ui.stopBtn, 'className', 'awoo-ui-btn' + (running ? '' : ' awoo-pet-slot-alarm-dim'));
    // Reset re-derives the run's end from the configured figure, so it does
    // something exactly when a session is NOT running and a figure is set --
    // which is also when it is the button you want. It was hard-coded dim in
    // every state, i.e. the relevance rule applied to it backwards.
    const resetUseful = !running && configuredRunActions !== null;
    setAttr(ui.resetBtn, 'className', 'awoo-ui-btn' + (resetUseful ? '' : ' awoo-pet-slot-alarm-dim'));
    setAttr(ui.startBtn, 'disabled', runState === 'running');
    setAttr(ui.stopBtn, 'disabled', runState === 'idle');

    setText(ui.detailLevel, lastSync.level !== null ? `${lastSync.level} → ${lastSync.level + 1}` : '—');
    const requiredGold = lastSync.level !== null ? nextUpgradeCost(lastSync.level) : null;
    // DECLARED BEFORE USE, and that is the entire fix for a bug that made the
    // whole module fail to start: this const used to sit BELOW the two lines
    // that read it, so `const` put it in the temporal dead zone and render()
    // threw ReferenceError on its first call. claim() caught it, marked the
    // module failed, and the menu button never appeared - reported twice as
    // "the script doesn't load".
    const gold = projectedGold();
    setText(ui.detailGold, (gold || requiredGold !== null)
      ? `${gold ? formatGold(gold.value) : '—'} of ${formatGold(requiredGold)}` : '—');
    // Where the gold figure came from is hover detail; how old it is sits in
    // the unit column, where it can be compared down the list at a glance.
    setAttrib(ui.detailGold, 'data-tooltip', gold
      ? `Gold you hold, against what slot ${lastSync.level !== null ? lastSync.level + 1 : 'next'} costs. Read from the ${gold.from}${gold.projected ? ', projected forward from your rate' : ''}, ${formatAgo(gold.atMs)}.`
      : 'Gold you hold, against what the next slot costs. Not read yet.');
    setText(ui.detailGoldAge, gold ? shortAgo(gold.atMs) : '');
    setAttr(ui.detailGoldAge, 'title', gold ? `read ${formatAgo(gold.atMs)}` : '');

    setAttr(ui.notifyCheck, 'checked', notifyOnReady);
    setAttr(ui.keepAwakeCheck, 'checked', keepAwake);
    ui.notifyRow = ui.notifyRow || ui.content.querySelector('#awoo-pet-slot-alarm-notify-row');
    const notifyBlocked = typeof Notification === 'undefined' || Notification.permission === 'denied';
    ui.notifyRow.classList.toggle('awoo-pet-slot-alarm-check-off', notifyBlocked);
    setAttr(ui.notifyCheck, 'disabled', notifyBlocked);
    setText(ui.bgNote, notifyBlocked
      ? 'Notifications are blocked for this site — the sound still plays.'
      : (keepAwake && runState === 'running')
        ? 'Playing a near-silent tone so this tab keeps full timer speed.'
        : 'The countdown is clock-based, so it stays correct while hidden either way.');

    const rate = effectiveRate();
    setText(ui.detailRate, rate ? `${formatGold(rate)}/action` : '—');
    setAttrib(ui.detailRate, 'data-tooltip', rate === null ? 'Gold per action — not measured yet.'
      : customRateRaw !== null ? 'Gold per action — a manual rate from Settings, not measured.'
      : `Gold per action, measured from your Party Battle page${autoRateAtMs !== null ? ', ' + formatAgo(autoRateAtMs) : ''}.`);
    setText(ui.detailRateAge, rate === null ? '' : customRateRaw !== null ? 'set' : shortAgo(autoRateAtMs));
    setText(ui.detailSynced, shortAgo(lastSync.atMs));
    setAttr(ui.detailSynced, 'title', `Pets page read ${formatAgo(lastSync.atMs)}`);

    const snoozable = runState === 'running' && isReady && !trackerAcknowledged;
    setAttr(ui.snoozeBtn, 'disabled', !snoozable);
    setAttrib(ui.snoozeBtn, 'data-idle', !(runState === 'running' && isReady));
    renderAlarmSettings();
  }

  // ---- READINESS: the one failure that looks like success ----
  //
  // If no gold rate has been measured, this module can still show a countdown
  // -- it just has nothing real to base it on. That is worse than showing
  // nothing, because a fictional ETA arms a fictional alarm and you plan
  // around it. The rule everywhere else in this project is "refuse rather than
  // guess"; the UI half of that is saying which input is missing, out loud,
  // where you are already looking.
  //
  // Ordered by how badly each breaks the answer, and only the worst is shown:
  // a stack of warnings is a thing people stop reading.
  function readinessState() {
    if (autoRateRaw === null && customRateRaw === null) {
      return { level: 'warn', glyph: '!', short: 'No gold rate yet — open Party Battle once',
        text: 'No gold rate measured yet. Open the Party Battle page once and this will read it '
          + 'by itself - until then there is no ETA and the alarm cannot arm.' };
    }
    if (lastSync.level === null) {
      return { level: 'warn', glyph: '!', short: 'Slot unknown — open your Pets page once',
        text: 'Slot level unknown. Open your Pets page once so it can see which upgrade you are saving for.' };
    }
    if (customRateRaw !== null) {
      return { level: 'warn', glyph: '!', short: 'Manual rate — the ETA is hypothetical',
        text: 'Using a manual rate from Settings, not a measured one. The ETA is hypothetical - '
          + 'press Auto there to go back to reading it.' };
    }
    if (goldSnapshot() === null) {
      return { level: 'warn', glyph: '!', short: 'Cannot read gold — using the last value',
        text: 'Cannot read your gold right now. Keeping the last value; the ETA is as stale as the Synced line says.' };
    }
    return { level: 'ok', glyph: '\u2713',
      text: 'Reading your gold and rate automatically. No server or companion program involved.' };
  }

  // THE ANSWER BAND (rebuilt 2026-09-21, DESIGN.md §3). ONE display element:
  // the time until the next slot — this module is the alarm, so the alarm is
  // the answer. The session's party-action count, which used to be a second
  // headline, is the context line; so is a missing input, in warn colour,
  // which is what the readiness banner used to say in a paragraph. The state
  // chip says what the module is doing in one word.
  function renderAnswer(isReady, staleEta) {
    const nextSlot = lastSync.level !== null ? lastSync.level + 1 : null;
    let value, unit, good = false;
    if (trackerEtaMs === null) { value = '—'; unit = 'no estimate yet'; }
    else if (isReady) { value = 'Ready'; unit = nextSlot !== null ? `slot ${nextSlot}` : 'next slot'; good = true; }
    else if (staleEta && runState !== 'running') { value = 'Off'; unit = 'estimate expired'; }
    else {
      const eta = formatMsRemaining(Math.max(0, trackerEtaMs - Date.now()));
      value = eta.timeStr; unit = nextSlot !== null ? `until slot ${nextSlot}` : 'to go';
    }
    setText(ui.heroValue, value);
    setAttr(ui.heroValue, 'className', 'awoo-ui-answer-value awoo-num' + (good ? ' awoo-ui-answer-good' : ''));
    setText(ui.heroUnit, unit);

    let chip = 'Off', chipCls = '';
    if (isReady) { chip = trackerAcknowledged ? 'Snoozed' : 'Ringing'; chipCls = trackerAcknowledged ? ' awoo-ui-chip-run' : ' awoo-ui-chip-alert'; }
    else if (runState === 'running') { chip = 'Armed'; chipCls = ' awoo-ui-chip-run'; }
    setText(ui.heroChip, chip);
    setAttr(ui.heroChip, 'className', 'awoo-ui-chip' + chipCls);
    setAttr(ui.heroChip, 'title', isReady
      ? (trackerAcknowledged ? 'Snoozed until the next upgrade.' : 'Upgrade ready — the alarm repeats until you snooze or silence it.')
      : runState === 'running' ? 'The alarm is armed for your next slot.' : 'Press Start to arm the alarm.');

    // The context line: a refusal first (it outranks everything), else the
    // session in numbers.
    const rd = readinessState();
    if (rd.level === 'warn') {
      setText(ui.context, rd.short);
      setAttr(ui.context, 'className', 'awoo-ui-context warn');
      setAttrib(ui.context, 'data-tooltip', rd.text);
      return;
    }
    setAttr(ui.context, 'className', 'awoo-ui-context');
    setAttrib(ui.context, 'data-tooltip', '');
    const parts = [];
    if (partyActionsRemaining !== null) parts.push(`${partyActionsRemaining} party actions left`);
    if (runState === 'running') {
      const st = runStatus();
      if (st.mode === 'party') parts.push(`stops at ${configuredRunActions}${st.stale ? ' (stale)' : ''}`);
      else {
        const left = runRemaining();
        parts.push(left === null ? 'no stop set' : `${formatMsRemaining(left).actionsStr} actions in session`);
      }
    } else if (configuredRunActions !== null) {
      parts.push(`stops at ${configuredRunActions} when started`);
    }
    if (!isReady && trackerEtaMs !== null && !(staleEta && runState !== 'running')) {
      parts.push(`~${formatMsRemaining(Math.max(0, trackerEtaMs - Date.now())).actionsStr} actions to go`);
    }
    setText(ui.context, parts.length ? parts.join(' \u00b7 ') : 'Reading gold and rate automatically');
  }

  // Ages for the unit column: short enough for 4.5ch.
  function shortAgo(atMs) {
    if (atMs === null || atMs === undefined) return '';
    const s = Math.max(0, Math.floor((Date.now() - atMs) / 1000));
    if (s < 60) return 'now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return h < 48 ? `${h}h` : `${Math.floor(h / 24)}d`;
  }

  // ---- projected gold by the end of the session ----
  //
  // TWO ESTIMATES, because they answer different questions and the gap between
  // them IS the answer to a third: is it worth taking slot upgrades during the
  // run, or banking?
  //
  //   flat      = every remaining action at TODAY's rate. No upgrades, no
  //               compounding. The floor.
  //   upgrading = take each combat-slot upgrade the moment it is affordable.
  //               Every upgrade costs gold now and raises the rate for every
  //               action after it, so this is a simulation rather than a
  //               formula -- the crossover depends on how many actions remain.
  //
  // THE RATE MODEL, and its one assumption stated plainly. A slot upgrade
  // raises the pet's gold modifier, and the module already de-boosts
  // merged.monsterGoldPercentage by the slot's own boost curve to recover the
  // raw roll (petRollsFromMerged). So the rate at level L is the measured rate
  // scaled by (1 + raw*(1+boost(L))) / (1 + merged), which is exactly 1 at the
  // current level. The assumption inherited from petRollsFromMerged is that
  // merged.monsterGoldPercentage is pet-driven; if other sources contribute,
  // this OVERSTATES how much an upgrade helps. Flagged in the UI note rather
  // than hidden, because it is the number's weakest joint.
  //
  // Refuses rather than approximates: no rate, no slot level, no merged
  // multipliers, or no known action count all return null, and the row says
  // which one is missing (CLAUDE.md rule 3).
  const PROJECTION_ACTION_CAP = 200000;

  function remainingActionsForProjection() {
    if (configuredRunActions === null) return null;
    if (partyActionsRemaining !== null) {
      return Math.max(0, partyActionsRemaining - configuredRunActions);
    }
    const left = runRemaining();
    return left === null ? null : Math.max(0, Math.round(left / ACTION_MS));
  }

  function simulateUpgradePath(actions, startLevel, startGold, rate0, rawPct, mergedPct) {
    const rateAt = (L) => rate0 * (1 + rawPct * (1 + petSlotBoostPercent(L))) / (1 + mergedPct);
    let level = startLevel, gold = startGold, earned = 0, spent = 0, upgrades = 0;
    const n = Math.min(actions, PROJECTION_ACTION_CAP);
    for (let a = 0; a < n; a++) {
      const r = rateAt(level);
      gold += r; earned += r;
      // Buy as soon as affordable -- "within about ten actions of each ring",
      // which at this resolution is immediately. The inner guard exists
      // because a large enough balance could clear several levels at once and
      // an unbounded while inside a loop is how a projection hangs a tab.
      let guard = 0;
      while (guard++ < 64) {
        const cost = petSlotUpgradeCost(level, level + 1).value;
        if (!(gold >= cost)) break;
        gold -= cost; spent += cost; level++; upgrades++;
      }
    }
    return { earned, spent, endGold: gold, endLevel: level, upgrades, capped: actions > n };
  }

  // MEMOISED, because render() runs once a second and this is a simulation.
  // The loop is O(actions) -- typically a few thousand, up to the cap -- with a
  // cost computation per iteration, and none of its inputs change between most
  // ticks. Re-running it every second was a main-thread cost for no new answer.
  //
  // Gold is quantised into the key rather than used raw: it moves continuously
  // while a session runs, so keying on the exact figure would miss every cache
  // hit and the memo would be decoration. A thousandth of the current value is
  // far below what changes any displayed number.
  let projCache = null;
  function projectionKey(level, gold, rate, actions) {
    const goldBucket = gold === 0 ? 0 : Math.round(gold / Math.max(1, Math.abs(gold) / 1000));
    return [level, goldBucket, rate, actions, overnightActions].join('|');
  }

  function projectGold() {
    const rate = effectiveRate();
    if (!rate) return { blocked: 'no gold rate measured yet' };
    const base = remainingActionsForProjection();
    if (base === null) return { blocked: 'set a stop-at figure to project from' };
    // The overnight allowance tops up a run that is STILL GOING. Adding it to a
    // session already past its stop point projected 860 actions of earnings for
    // a run with nothing left in it.
    const actions = base > 0 ? base + Math.max(0, overnightActions) : 0;
    const flat = actions * rate;

    const gold = goldSnapshot();
    const merged = mergedMultipliers();
    if (lastSync.level === null) return { flat, actions, blocked: 'slot level unknown' };
    if (!gold) return { flat, actions, blocked: 'gold not readable' };
    if (!merged || typeof merged.monsterGoldPercentage !== 'number') {
      return { flat, actions, blocked: 'pet gold modifiers not readable on this page' };
    }
    const mergedPct = merged.monsterGoldPercentage;
    const boost0 = 1 + petSlotBoostPercent(lastSync.level);
    if (!(boost0 > 0)) return { flat, actions, blocked: 'slot boost unavailable' };
    const rawPct = mergedPct / boost0;
    const key = projectionKey(lastSync.level, gold.value, rate, actions);
    if (projCache && projCache.key === key) return { flat, actions, sim: projCache.sim };
    const sim = simulateUpgradePath(actions, lastSync.level, gold.value, rate, rawPct, mergedPct);
    projCache = { key, sim };
    return { flat, actions, sim };
  }

  function renderProjection() {
    if (!ui.projUpgrade) return;
    const p = projectGold();
    setText(ui.projFlat, p.flat == null ? '\u2014' : formatGold(p.flat));
    if (p.sim) {
      setText(ui.projUpgrade, formatGold(p.sim.earned));
      setText(ui.projUpgradeNote, p.sim.upgrades === 0
        ? 'no upgrade affordable in time'
        : `${p.sim.upgrades} upgrade${p.sim.upgrades === 1 ? '' : 's'} · `
          + `${formatGold(p.sim.spent)} spent · slot ${p.sim.endLevel} · `
          + `${formatGold(p.sim.endGold)} left`);
    } else {
      setText(ui.projUpgrade, '\u2014');
      // The reason reads as its own sentence. It used to be prefixed 'needs ',
      // which produced 'needs no gold rate measured yet'.
      setText(ui.projUpgradeNote, p.blocked ? p.blocked.charAt(0).toUpperCase() + p.blocked.slice(1) + '.' : '');
    }
    // The caveat moved to the hover. It still has to be SAID -- the overnight
    // figure is an assumption and a number built on one should admit it -- but
    // it does not have to occupy two lines under every estimate to do so.
    setText(ui.projNote, p.actions == null ? ''
      : `${p.actions.toLocaleString()} actions`
        + (overnightActions > 0 && p.actions > 0 ? ` \u00b7 incl. +${overnightActions} overnight` : ''));
    setAttr(ui.projNote, 'title', overnightActions > 0
      ? `Includes ${overnightActions} actions for the overnight daily reset. That is an assumption, not a measurement \u2014 change it in this module's Settings tab.`
      : '');
  }

  function masterTick() {
    syncCompanionAlarm();
    if (runState === 'running') {
      const st = runStatus();
      if (st.done) {
        stopTracking(st.mode === 'party'
          ? `Party actions reached ${configuredRunActions} — session ended.`
          : 'Session length reached — ended.');
        return;
      }
      // Rate-limited to once per stale window, not once per tick: this runs
      // every second and the strip is a record, not a siren.
      if (st.stale && (partyStaleSaidAtMs === null || Date.now() - partyStaleSaidAtMs > PARTY_STALE_MS)) {
        partyStaleSaidAtMs = Date.now();
        say('refused', `Party actions last read ${formatAgo(partyActionsAtMs)} — still running, not ending on a stale figure.`);
      }
      checkTrackerReady();
    }
    render();
  }

// ---- overlay UI ----

  const ui = {};
  let panelOpen = false;
  let windowHandle = null; // Core.createWindow(...) — owns geometry, drag, resize, chrome
  let activity = null;     // Core.ui.activity(...) — the module's own record of what it did
  let cadenceNode = null;  // the alarm-cadence rows, adopted by the Settings pane

  // ---- the Companion delegation (Core v12) ----
  //
  // The browser alarm is not replaced, it is SHADOWED. Both stay armed: the
  // Companion because it can make a noise a throttled tab cannot, and the
  // browser because the Companion may not be running, may be stopped
  // mid-session, or may be on a machine that goes to sleep.
  //
  // Double-ringing is prevented at the point of noise rather than by choosing
  // one owner up front -- see checkTrackerReady. Choosing an owner would mean
  // getting it wrong exactly when the Companion disappears, which is the case
  // the delegation exists for.
  let companionAlarm = null;
  let lastPushedEtaMs = null;

  function companionMode() {
    return companionAlarm ? companionAlarm.mode : 'browser';
  }

  // Pushed whenever the deadline MOVES, not on a schedule: the Companion's
  // reminder is idempotent by id, so re-registering replaces rather than
  // stacks, and a re-push costs one request against a local socket.
  function syncCompanionAlarm() {
    if (!companionAlarm) return;
    const eta = (runState === 'running' && trackerEtaMs !== null) ? trackerEtaMs : null;
    if (eta === lastPushedEtaMs) return;
    lastPushedEtaMs = eta;
    if (eta === null) {
      companionAlarm.push((api) => api.request('/reminders/' + encodeURIComponent(REMINDER_ID),
        { method: 'DELETE' }));
      return;
    }
    companionAlarm.push(async (api) => {
      // A DECISION, already made. The Companion is told when and what, never
      // the gold rate and the cost -- duplicating that model across the process
      // boundary is how the two halves start disagreeing about the answer.
      const res = await api.request('/reminders', {
        method: 'POST',
        body: {
          id: REMINDER_ID,
          atMs: eta,
          title: 'Pet slot upgrade ready',
          body: lastSync.level !== null
            ? `Slot ${lastSync.level} \u2192 ${lastSync.level + 1} is affordable.`
            : 'Your combat pet slot upgrade is affordable.',
          source: 'AWOO+: Pet Slot Alarm',
        },
      });
      if (!res.ok) throw new Error('the Companion refused the reminder (HTTP ' + res.status + ')');
      say('done', 'Alarm handed to the Companion \u2014 it will ring even if this tab is throttled.');
    });
  }
  const REMINDER_ID = 'pet-slot-alarm:pet-slot';
  let rateNode = null;     // the manual rate override, likewise

  // say(level, text) — one call site for every "tell the user what happened".
  // Safe before the panel is built and safe against an older Core: a module
  // must never fail because its feedback surface is missing.
  function say(level, text) {
    if (activity && typeof activity[level] === 'function') activity[level](text);
  }

  // The nav's state slot. Reported on every meaningful transition so the
  // header can answer "is this still counting down?" without opening the
  // panel. Guarded for the same reason as everything else here.
  function reportState(state, detail) {
    if (typeof Core.setState === 'function') Core.setState(MODULE_ID, state, detail || '');
  }

  // Migrated onto Core's shared window framework (v6): the chrome (panel
  // border/shadow, header, drag, resize, close button) that used to be
  // hand-rolled here (#awoo-pet-slot-alarm-panel/#awoo-pet-slot-alarm-header/#awoo-pet-slot-alarm-body) now comes from
  // Core.createWindow — every rule below is CONTENT styling, not chrome.
  function buildPanelContent() {
    const style = document.createElement('style');
    // MODULE-SPECIFIC RULES ONLY. Everything that was a re-typed copy of a
    // Core primitive is gone: .awoo-pet-slot-alarm-group WAS byte-for-byte Core's
    // .awoo-ui-group, the tooltip ::after was a hand-copy of Core's global
    // [data-tooltip], and .awoo-pet-slot-alarm-body-btn/.awoo-pet-slot-alarm-small-btn duplicated
    // .awoo-ui-btn-primary/.awoo-ui-btn. Those were not variations — they were
    // the shared thing, typed twice, and then drifting apart. That drift is
    // the whole of the reported "these two modules look like different
    // products".
    //
    // EVERY THEME READ IS NAMESPACED. This block used to read the GAME's raw
    // var(--border) / var(--input) / var(--primary), which meant choosing
    // "AWOO Turquoise" restyled every surface in the overlay EXCEPT this
    // module. fighter-allocator already carried a comment about this exact bug
    // class; this module never got the fix. The raw variable stays as the
    // fallback so an older Core underneath still renders something sane.
    style.textContent = `
      .awoo-pet-slot-alarm-buttons { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--awoo-s4);
        margin-top: var(--awoo-s4); }
      .awoo-pet-slot-alarm-buttons.awoo-pet-slot-alarm-two { grid-template-columns: 1fr auto; align-items: center; }

      .awoo-pet-slot-alarm-hint-inline { opacity: var(--awoo-em-muted); font-size: var(--awoo-fs-caption); }
      .awoo-pet-slot-alarm-check { display: flex; align-items: center; gap: 7px; font-size: var(--awoo-fs-control);
        cursor: pointer; user-select: none; }
      .awoo-pet-slot-alarm-check input[type="checkbox"] { width: 13px; height: 13px;
        accent-color: var(--awoo-primary, var(--primary)); cursor: pointer; margin: 0; }
      .awoo-pet-slot-alarm-check.awoo-pet-slot-alarm-check-off { opacity: var(--awoo-em-muted); }
      .awoo-ui-rows input[type="range"] { width: 100%; accent-color: var(--awoo-primary, var(--primary));
        margin: 0; padding: 0; border: none; background: none; }

      .awoo-pet-slot-alarm-setter { display: flex; align-items: center; gap: var(--awoo-s3);
        font-size: var(--awoo-fs-control); opacity: var(--awoo-em-normal); }
      .awoo-pet-slot-alarm-setter input[type="number"], .awoo-pet-slot-alarm-setter input[type="text"] {
        background: var(--awoo-input, var(--input)); color: inherit;
        border: 1px solid var(--awoo-border, var(--border));
        border-radius: var(--awoo-r-sm); padding: 3px 5px; width: 70px; box-sizing: border-box;
        font: inherit; font-variant-numeric: tabular-nums; }
      #awoo-pet-slot-alarm-gold-rate { width: 130px; }
      .awoo-ui-rows > .k[data-tooltip], .awoo-ui-rows > .v[data-tooltip] { cursor: help; }
      .awoo-pet-slot-alarm-info-icon { display: inline-flex; align-items: center; justify-content: center;
        opacity: var(--awoo-em-muted); cursor: help; margin-left: var(--awoo-s2); position: relative; }
      .awoo-pet-slot-alarm-info-icon:hover { opacity: 1; }
      .awoo-pet-slot-alarm-info-icon svg { width: 13px; height: 13px; display: block; }

      /* The cadence lives in this module's own Settings tab now (Core v11's
         sidebar). It is set once and then never touched, so it does not earn
         permanent main-window space -- while volume IS adjusted out of the
         box and keeps its row. The rows are BUILT here and re-parented into
         the pane, so every existing listener and id survives by reference
         rather than being rebuilt against a second copy.
         The growth factor is exposed for the first time: it always drove the
         curve between the two gap fields, and with no control for it you
         could set both ends of a shape you could not see. */
      .awoo-pet-slot-alarm-adv-body { display: flex; flex-direction: column; gap: var(--awoo-s3); }

      /* The commit button sits WITH the input it commits. It used to be alone
         on a right-aligned row below, connected to nothing. */
      /* SPECIFICITY, not luck. Core's .awoo-ui-rows input sets width:100% and
         this sets 5.5em -- both (0,1,1), so the winner was decided by which
         stylesheet was appended last, which depends on which module built its
         panel first. When Core won, the input filled the cell and pushed the
         Set button over the unit label beside it. Two classes beats one, in
         every load order. */
      .awoo-ui-rows .awoo-pet-slot-alarm-setter-inline { display: flex; align-items: center; gap: var(--awoo-s2); }
      .awoo-ui-rows .awoo-pet-slot-alarm-setter-inline input { width: 4.5em; flex: none; }
      .awoo-ui-rows .awoo-pet-slot-alarm-setter-inline button { flex: none; }


      /* Irrelevant right now, not gone. Dimming keeps the panel's shape stable
         so nothing jumps as the state changes -- hiding them would reflow the
         window every time you pressed Start. */
      .awoo-pet-slot-alarm-dim { opacity: var(--awoo-em-faint); }

      /* Snooze only means something while it rings. It keeps its place in the
         row (visibility, not display) so the row never reflows. */
      #awoo-pet-slot-alarm-snooze[data-idle] { visibility: hidden; }
      .awoo-ui-rows > .t[title] { cursor: help; }
    `;
    document.head.appendChild(style);

    // Just the CONTENT now — no outer panel/header markup. Core.createWindow
    // supplies the title bar (with its own close button) around whatever
    // element handle.setContent() is given.
    const content = document.createElement('div');
    ui.content = content; // referenced later, in render(), outside this closure
    content.className = 'awoo-ui-stack';
    // ONE GRID TEMPLATE FOR EVERY LABEL/VALUE LIST (DESIGN.md §4).
    // Progress and Alarm both use .awoo-ui-rows, so their labels, values and
    // trailing units land on the same three x-positions — groups aligning
    // with each OTHER, not merely within themselves. The previous markup had
    // two independent grids, each sizing its own `auto` label column, and a
    // value right-aligned in one where its neighbour was left-aligned; both
    // were internally correct and they did not agree.
    //
    // The trailing column is a fixed ch width, which is what stops the volume
    // readout resizing the slider beside it as the percentage gains a digit —
    // the actual mechanism behind the reported alarm drift. Nothing was
    // misaligned; the track was breathing.
    // ---- LAYOUT: status at the top, data in the middle, controls by subject ----
    //
    // The previous arrangement mixed all three. A group called "Progress" held
    // the alarm's own headline AND the detail readouts AND the Snooze/Test
    // buttons, so the thing you look at (is it ringing?), the thing you read
    // (what does it know?) and the thing you press (make it stop) were one
    // block. That is most of what "the layout is a bit chaotic" was pointing
    // at. Now the alarm's state sits with the countdown it belongs to, the
    // detail rows are only data, and every alarm control lives under Alarm.
    //
    // CUSTOM ETA IS GONE FROM THE MAIN WINDOW. The whole point of this module
    // is that it reads the rate itself; a hand-typed rate produces a
    // hypothetical ETA, which is a debugging tool rather than a daily control,
    // and giving it a permanent panel implied the automatic path was optional.
    // It moved to the Settings tab. What replaced it is the opposite thing: a
    // readiness line that says out loud when the automatic reading is MISSING,
    // because an ETA computed without a real gold rate is the one failure this
    // module can have that still looks like it is working.
    content.innerHTML = `
        <div class="awoo-ui-answer">
          <span id="awoo-pet-slot-alarm-hero-value" class="awoo-ui-answer-value">Off</span>
          <span id="awoo-pet-slot-alarm-hero-unit" class="awoo-ui-answer-unit"></span>
          <span id="awoo-pet-slot-alarm-hero-chip" class="awoo-ui-chip">Off</span>
        </div>
        <div id="awoo-pet-slot-alarm-context" class="awoo-ui-context">&nbsp;</div>
        <div class="awoo-ui-actionrow">
          <button id="awoo-pet-slot-alarm-start" class="awoo-ui-btn awoo-ui-btn-primary" type="button">Start</button>
          <button id="awoo-pet-slot-alarm-stop" class="awoo-ui-btn" type="button">Stop</button>
          <button id="awoo-pet-slot-alarm-reset" class="awoo-ui-btn" type="button"
            data-tooltip="Re-arms the session from your stop-at figure.">Reset</button>
        </div>

        <div class="awoo-ui-rows">
          <span class="k">Slot</span>
          <span class="v awoo-num" id="awoo-pet-slot-alarm-detail-level" data-tooltip="Your combat pet slot now, and the level it is saving toward.">—</span>
          <span class="t" id="awoo-pet-slot-alarm-detail-synced"></span>
          <span class="k">Gold</span>
          <span class="v awoo-num" id="awoo-pet-slot-alarm-detail-gold">—</span>
          <span class="t" id="awoo-pet-slot-alarm-detail-gold-age"></span>
          <span class="k">Rate</span>
          <span class="v awoo-num" id="awoo-pet-slot-alarm-detail-rate">—</span>
          <span class="t" id="awoo-pet-slot-alarm-detail-rate-age"></span>
        </div>

        <div class="awoo-ui-group">
          <div class="awoo-ui-group-label">Session</div>
          <div class="awoo-ui-rows">
            <span class="k" data-tooltip="Ends the session once the party has this many actions left. Falls back to counting your own actions if the party figure cannot be read." data-tooltip-wide>Stop at</span>
            <span class="awoo-pet-slot-alarm-setter-inline">
              <input id="awoo-pet-slot-alarm-duration" type="number" min="0" placeholder="&#8734;" />
              <button id="awoo-pet-slot-alarm-duration-set" class="awoo-ui-btn" type="button">Set</button>
            </span>
            <span class="t"></span>
            <span class="k">At pace</span>
            <span class="v awoo-num" id="awoo-pet-slot-alarm-proj-flat" data-tooltip="Party gold by the end of the session at your current rate. No upgrades, no compounding." data-tooltip-wide>—</span><span class="t"></span>
            <span class="k">Reinvesting</span>
            <span class="v awoo-num" id="awoo-pet-slot-alarm-proj-upgrade" data-tooltip="If you take each slot upgrade as soon as you can afford it. Each one costs gold now and raises the rate for every action after." data-tooltip-wide>—</span><span class="t"></span>
            <span class="wide awoo-ui-note" id="awoo-pet-slot-alarm-proj-upgrade-note"></span>
            <span class="wide awoo-ui-note" id="awoo-pet-slot-alarm-proj-note"></span>
          </div>
        </div>

        <div class="awoo-ui-group">
          <div class="awoo-ui-group-label"
            data-tooltip-dev="The countdown reads the clock rather than counting ticks, so a throttled background tab cannot drift it; only the SOUND is at risk, which is what the two options below protect."
            >Alarm<button type="button" class="awoo-ui-group-link"
            id="awoo-pet-slot-alarm-advanced-link" data-tooltip="Gap between chimes, and when it gives up.">Cadence &#8599;</button></div>
          <div class="awoo-ui-rows">
            <label class="k" for="awoo-pet-slot-alarm-alarm-volume">Volume</label>
            <input id="awoo-pet-slot-alarm-alarm-volume" type="range" min="0" max="100" step="5" />
            <span id="awoo-pet-slot-alarm-alarm-volume-out" class="t"></span>
            <span class="wide awoo-ui-actionrow">
              <button id="awoo-pet-slot-alarm-test-alarm" class="awoo-ui-btn" type="button">Test</button>
              <button id="awoo-pet-slot-alarm-alarm-silence" class="awoo-ui-btn" type="button">Silence</button>
              <button id="awoo-pet-slot-alarm-snooze" class="awoo-ui-btn" type="button" data-idle>Snooze</button>
            </span>
            <label class="wide awoo-pet-slot-alarm-check" id="awoo-pet-slot-alarm-notify-row">
              <input id="awoo-pet-slot-alarm-notify" type="checkbox" /><span>Desktop notification</span></label>
            <label class="wide awoo-pet-slot-alarm-check" id="awoo-pet-slot-alarm-keepawake-row">
              <input id="awoo-pet-slot-alarm-keepawake" type="checkbox" /><span>Keep tab awake while running</span></label>
            <span class="wide awoo-ui-note" id="awoo-pet-slot-alarm-bg-note"></span>
          </div>
        </div>

        <div id="awoo-pet-slot-alarm-companion-row"></div>
        <label class="awoo-pet-slot-alarm-check" id="awoo-pet-slot-alarm-companion-toggle-row">
          <input id="awoo-pet-slot-alarm-companion-toggle" type="checkbox" /><span>Ring through the Companion</span></label>

        <div class="awoo-pet-slot-alarm-adv-body" hidden>
          <div class="awoo-ui-rows">
            <label class="k" for="awoo-pet-slot-alarm-alarm-first">First gap</label>
            <input id="awoo-pet-slot-alarm-alarm-first" type="number" min="2" max="600" step="1" />
            <span class="t">s</span>
            <label class="k" for="awoo-pet-slot-alarm-alarm-growth">Growth</label>
            <input id="awoo-pet-slot-alarm-alarm-growth" type="number" min="1" max="4" step="0.05" />
            <span class="t">&#215;</span>
            <label class="k" for="awoo-pet-slot-alarm-alarm-max">Ceiling</label>
            <input id="awoo-pet-slot-alarm-alarm-max" type="number" min="5" max="3600" step="5" />
            <span class="t">s</span>
            <label class="k" for="awoo-pet-slot-alarm-alarm-repeats">Stop after</label>
            <input id="awoo-pet-slot-alarm-alarm-repeats" type="number" min="1" max="999" step="1" />
            <span class="t">&#215;</span>
          </div>
          <div id="awoo-pet-slot-alarm-alarm-preview" class="awoo-pet-slot-alarm-hint-inline"></div>
          <div class="awoo-pet-slot-alarm-buttons awoo-pet-slot-alarm-two">
            <span></span>
            <button id="awoo-pet-slot-alarm-alarm-defaults" class="awoo-ui-btn" type="button">Defaults</button>
          </div>
        </div>
        <div class="awoo-pet-slot-alarm-adv-rate" hidden>
          <div class="awoo-pet-slot-alarm-hint-inline" style="margin-bottom:var(--awoo-s3)">
            Overrides the rate this module reads for itself, to work out a hypothetical ETA.
            Leave it empty unless you are testing something: a typed rate is not measured, so
            the alarm it produces is a guess.
          </div>
          <div class="awoo-pet-slot-alarm-setter">
            <input id="awoo-pet-slot-alarm-gold-rate" type="text" placeholder="e.g. 12,34 (B/action)" />
            <button id="awoo-pet-slot-alarm-gold-rate-set" class="awoo-ui-btn" type="button">Set</button>
            <button id="awoo-pet-slot-alarm-gold-rate-auto" class="awoo-ui-btn" type="button">Auto</button>
          </div>
        </div>
    `;

    ui.heroValue = content.querySelector('#awoo-pet-slot-alarm-hero-value');
    ui.heroUnit = content.querySelector('#awoo-pet-slot-alarm-hero-unit');
    ui.heroChip = content.querySelector('#awoo-pet-slot-alarm-hero-chip');
    ui.context = content.querySelector('#awoo-pet-slot-alarm-context');
    ui.startBtn = content.querySelector('#awoo-pet-slot-alarm-start');
    ui.stopBtn = content.querySelector('#awoo-pet-slot-alarm-stop');
    ui.resetBtn = content.querySelector('#awoo-pet-slot-alarm-reset');
    ui.durationInput = content.querySelector('#awoo-pet-slot-alarm-duration');
    ui.durationSetBtn = content.querySelector('#awoo-pet-slot-alarm-duration-set');

    ui.detailLevel = content.querySelector('#awoo-pet-slot-alarm-detail-level');
    ui.detailGold = content.querySelector('#awoo-pet-slot-alarm-detail-gold');
    ui.detailRate = content.querySelector('#awoo-pet-slot-alarm-detail-rate');
    ui.detailRateAge = content.querySelector('#awoo-pet-slot-alarm-detail-rate-age');
    ui.detailSynced = content.querySelector('#awoo-pet-slot-alarm-detail-synced');
    ui.snoozeBtn = content.querySelector('#awoo-pet-slot-alarm-snooze');
    ui.testAlarmBtn = content.querySelector('#awoo-pet-slot-alarm-test-alarm');

    ui.detailGoldAge = content.querySelector('#awoo-pet-slot-alarm-detail-gold-age');
    ui.notifyCheck = content.querySelector('#awoo-pet-slot-alarm-notify');
    ui.keepAwakeCheck = content.querySelector('#awoo-pet-slot-alarm-keepawake');
    ui.bgNote = content.querySelector('#awoo-pet-slot-alarm-bg-note');

    ui.notifyCheck.addEventListener('change', () => {
      if (!ui.notifyCheck.checked) { notifyOnReady = false; saveProgress(); render(); return; }
      // The permission prompt must come from the click itself, so it is
      // requested here rather than lazily at alarm time - when the tab is
      // hidden and a prompt would be both blocked and useless.
      requestNotifyPermission().then((perm) => {
        notifyOnReady = perm === 'granted';
        ui.notifyCheck.checked = notifyOnReady;
        saveProgress();
        render();
      });
    });
    ui.keepAwakeCheck.addEventListener('change', () => {
      keepAwake = ui.keepAwakeCheck.checked;
      applyKeepAwake();
      saveProgress();
      render();
    });

    ui.alarmVolume = content.querySelector('#awoo-pet-slot-alarm-alarm-volume');
    ui.silenceBtn = content.querySelector('#awoo-pet-slot-alarm-alarm-silence');
    ui.projUpgrade = content.querySelector('#awoo-pet-slot-alarm-proj-upgrade');
    ui.projUpgradeNote = content.querySelector('#awoo-pet-slot-alarm-proj-upgrade-note');
    ui.projFlat = content.querySelector('#awoo-pet-slot-alarm-proj-flat');
    ui.projNote = content.querySelector('#awoo-pet-slot-alarm-proj-note');
    ui.companionToggle = content.querySelector('#awoo-pet-slot-alarm-companion-toggle');
    if (ui.companionToggle) {
      ui.companionToggle.checked = companionAlarm ? companionAlarm.enabled : false;
      ui.companionToggle.disabled = !companionAlarm;
      ui.companionToggle.addEventListener('change', () => {
        if (!companionAlarm) return;
        companionAlarm.setEnabled(ui.companionToggle.checked);
        lastPushedEtaMs = null;
        syncCompanionAlarm();
        say(ui.companionToggle.checked ? 'done' : 'stopped',
          ui.companionToggle.checked
            ? 'Alarm will use the Companion when it is running.'
            : 'Alarm will stay in this browser.');
      });
    }
    ui.alarmVolumeOut = content.querySelector('#awoo-pet-slot-alarm-alarm-volume-out');
    ui.alarmFirst = content.querySelector('#awoo-pet-slot-alarm-alarm-first');
    ui.alarmMax = content.querySelector('#awoo-pet-slot-alarm-alarm-max');
    ui.alarmRepeats = content.querySelector('#awoo-pet-slot-alarm-alarm-repeats');
    ui.alarmGrowth = content.querySelector('#awoo-pet-slot-alarm-alarm-growth');
    ui.alarmPreview = content.querySelector('#awoo-pet-slot-alarm-alarm-preview');

    function readAlarmSettings() {
      const num = (el, lo, hi, fallback) => {
        const v = parseFloat(el.value);
        return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
      };
      alarmCfg.volume = num(ui.alarmVolume, 0, 100, 32) / 100;
      alarmCfg.firstMs = num(ui.alarmFirst, 2, 600, 10) * 1000;
      alarmCfg.maxMs = num(ui.alarmMax, 5, 3600, 120) * 1000;
      // A slowest-gap below the first gap would make the cadence run backwards.
      if (alarmCfg.maxMs < alarmCfg.firstMs) alarmCfg.maxMs = alarmCfg.firstMs;
      alarmCfg.maxRepeats = Math.round(num(ui.alarmRepeats, 1, 999, 25));
      // Exposed for the first time. It always drove the curve between the two
      // gap fields (nextAlarmGap multiplies by it per repeat); with no control
      // for it, "first gap" and "ceiling" were two ends of a shape you could
      // not see. 1 means a flat cadence, which is a legitimate choice.
      alarmCfg.growth = num(ui.alarmGrowth, 1, 4, ALARM_DEFAULTS.growth);
      saveProgress();
      renderAlarmSettings();
    }
    for (const el of [ui.alarmVolume, ui.alarmFirst, ui.alarmMax, ui.alarmRepeats, ui.alarmGrowth]) {
      el.addEventListener('change', readAlarmSettings);
    }
    ui.alarmVolume.addEventListener('input', () => {
      ui.alarmVolumeOut.textContent = `${ui.alarmVolume.value}%`;
    });
    content.querySelector('#awoo-pet-slot-alarm-alarm-silence').addEventListener('click', () => {
      if (silenced) {
        unsilenceAlarm();
        Core.toast('Alarm back on.', { type: 'success', duration: 3000 });
        say('done', 'Alarm un-silenced' + (runState === 'running' ? ' — it will ring when ready.' : '.'));
      } else {
        silenceAlarm();
        Core.toast('Alarm silenced.', { type: 'success', duration: 3000 });
        say('stopped', 'Alarm silenced — it will not ring until you turn it back on.');
      }
      render();
    });
    content.querySelector('#awoo-pet-slot-alarm-alarm-defaults').addEventListener('click', () => {
      alarmCfg = Object.assign({}, ALARM_DEFAULTS);
      renderAlarmSettings();
      saveProgress();
      say('done', 'Alarm cadence reset to defaults.');
    });

    ui.goldRateInput = content.querySelector('#awoo-pet-slot-alarm-gold-rate');
    ui.goldRateSetBtn = content.querySelector('#awoo-pet-slot-alarm-gold-rate-set');
    ui.goldRateAutoBtn = content.querySelector('#awoo-pet-slot-alarm-gold-rate-auto');

    ui.startBtn.addEventListener('click', startTracking);
    // Wrapped, not passed directly: stopTracking's first argument is the
    // end REASON, and handing it a click Event would print one into the strip.
    ui.stopBtn.addEventListener('click', () => stopTracking());
    ui.resetBtn.addEventListener('click', resetSession);

    ui.durationSetBtn.addEventListener('click', commitDuration);
    ui.durationInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') commitDuration(); });

    ui.goldRateSetBtn.addEventListener('click', commitCustomRate);
    ui.goldRateInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') commitCustomRate(); });
    ui.goldRateAutoBtn.addEventListener('click', () => {
      ui.goldRateInput.value = '';
      commitCustomRate();
    });

    ui.snoozeBtn.addEventListener('click', snoozeAlarm);
    ui.testAlarmBtn.addEventListener('click', () => {
      const ctx = ensureAudioCtx();
      if (ctx && ctx.state === 'suspended') ctx.resume();
      playGentleAlarm();
      // also flash the top-bar badge/title so Test previews the whole signal,
      // not just the sound - settles back to the real state after a couple seconds
      Core.setBadge(MODULE_ID, true);
      setTimeout(() => {
        Core.setBadge(MODULE_ID, trackerEtaMs !== null && trackerEtaMs <= Date.now());
      }, 2000);
    });

    // Chrome (drag, resize, close button, geometry persistence) is Core's job
    // now — createWindow replaces the resize-toggle button and the hand-rolled
    // makeDraggable/saveWindowGeometry pair that used to live here.
    // The cadence block is built with the panel (so its ids resolve and every
    // listener above is already attached) and then handed to the Settings
    // pane, which ADOPTS the same node. Re-parenting rather than rebuilding is
    // what keeps one set of inputs: two copies would drift the moment one was
    // edited while the other was on screen.
    cadenceNode = content.querySelector('.awoo-pet-slot-alarm-adv-body');
    rateNode = content.querySelector('.awoo-pet-slot-alarm-adv-rate');
    const advLink = content.querySelector('#awoo-pet-slot-alarm-advanced-link');
    if (advLink) {
      advLink.addEventListener('click', () => {
        if (typeof Core.openSettings === 'function') Core.openSettings(MODULE_ID);
        else say('refused', 'This Core is too old to open module settings — update Core.');
      });
    }

    // Guarded like every optional Core API: an older Core beneath a newer
    // module is a state real users reach, and without it the module simply has
    // no delegation and keeps its browser alarm.
    if (Core.companion && typeof Core.companion.feature === 'function') {
      companionAlarm = Core.companion.feature({
        id: 'pet-slot-alarm.alarm',
        capability: 'remind',
        label: 'The alarm',
        // TRUE, and it is the important half: the browser alarm is a real
        // fallback, not a stub, so losing the Companion costs reliability
        // rather than the feature.
        fallback: true,
        onModeChange: () => { lastPushedEtaMs = null; syncCompanionAlarm(); },
      });
      // appendChild into the placeholder rather than replaceWith on it: the
      // shared DOM stub implements the former and not the latter, and a render
      // path that only works in a real browser is one nothing tests.
      // The standard Companion group (Core v12): its own dashed group, dim
      // while the Companion is not ringing, holding this module's one
      // Companion control. An older Core has no group(); then the old status
      // line and the toggle sit in the same place, as before.
      const host = content.querySelector('#awoo-pet-slot-alarm-companion-row');
      const toggleRow = content.querySelector('#awoo-pet-slot-alarm-companion-toggle-row');
      if (host && companionAlarm && typeof companionAlarm.group === 'function') {
        host.appendChild(companionAlarm.group([toggleRow]));
      } else if (host && companionAlarm) {
        host.appendChild(companionAlarm.el);
      }
    }

    // THE ACTIVITY STRIP (Core v11). Guarded, because an older Core beneath a
    // newer module is a state real users reach — and this module degrades to
    // exactly what it did before if the API is absent, rather than throwing.
    if (Core.ui && typeof Core.ui.activity === 'function') {
      activity = Core.ui.activity({ name: MODULE_ID, max: 6 });
      content.appendChild(activity.el);
    }

    migrateWindowGeometryOnce();
    windowHandle = Core.createWindow({
      id: MODULE_ID,
      title: 'Pet Slot Alarm',
      resizable: true,
      // MEASURED AGAINST WHAT IS ACTUALLY ON SCREEN AT OPEN, which went stale
      // three times before this. REBUILT 2026-09-21 (the module rebuild): the
      // answer band, the action row, three detail rows, Session (with the
      // estimate folded in), Alarm (with the background toggles folded in), the
      // Companion group and the activity strip measured 520px of content in a
      // real browser, i.e. ~575px of window with the header and padding. 620
      // leaves room for the estimate's two note lines and an opened strip.
      // Width 460, not 380: at 380 the gold/rate values and their ages wrapped.
      // defaultSize is what it OPENS at and what Reset returns to; minSize is
      // only the floor a drag stops at. If you add or remove a group,
      // RE-MEASURE (open it, compare .awoo-window-body scrollHeight with
      // clientHeight) rather than nudging these numbers.
      // 680, not 620: reported slightly too short once the estimate notes and
      // a few strip lines are showing, which is its normal running state.
      defaultSize: { w: 460, h: 680 },
      minSize: { w: 380, h: 420 },
      settingsTab: MODULE_ID,
      content,
      onClose: () => togglePanel(false),
    });
  }

  // ONE-TIME MIGRATION (v6): Core.createWindow now owns geometry persistence
  // under its own awoo:core:window-geometry:<id> key. Seed it from this module's
  // pre-v6 saved position, if any, so an existing user's custom placement
  // survives the framework migration instead of silently resetting to
  // default. Cosmetic data — a failure here is never worth failing boot over.
  function migrateWindowGeometryOnce() {
    const NEW_KEY = 'awoo:core:window-geometry:' + MODULE_ID;
    try {
      if (localStorage.getItem(NEW_KEY)) return; // already migrated, or repositioned since
      const raw = localStorage.getItem(STORAGE_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      const g = saved && saved.windowGeometry;
      if (!g || !g.left || !g.top) return; // never dragged - let the new default apply
      const x = parseFloat(g.left), y = parseFloat(g.top);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const w = parseFloat(g.width), h = parseFloat(g.height);
      localStorage.setItem(NEW_KEY, JSON.stringify({
        x, y, w: Number.isFinite(w) ? w : 300, h: Number.isFinite(h) ? h : 460,
      }));
    } catch (e) { /* cosmetic migration only - never block boot on it */ }
  }

  function togglePanel(force) {
    const show = force !== undefined ? force : windowHandle.el.hidden;
    // Collapse the activity strip on the way DOWN. Expanding it grows the
    // window, and growing the window trips createWindow's persisting
    // ResizeObserver -- so closing while expanded banked the extra height into
    // saved geometry and every open/expand/close cycle stacked another one.
    if (!show && activity && typeof activity.collapse === 'function') activity.collapse();
    if (show) windowHandle.open(); else windowHandle.close();
    panelOpen = show;
    Core.setOpen(MODULE_ID, show);
    // render() skips panel DOM while hidden, so repaint on the way back up
    // rather than showing a stale frame until the next tick
    if (show) render();
    saveProgress();
  }

  // @run-at is document-start so we are live before the SPA paints; body may
  // not exist yet, so gate the DOM-touching bootstrap on it.
  function whenBodyReady(fn) {
    if (document.body) return fn();
    const obs = new MutationObserver(() => {
      if (document.body) { obs.disconnect(); fn(); }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  whenBodyReady(bootstrap);

  function bootstrap() {
  buildPanelContent();
  loadProgress();
  applyKeepAwake(); // a session restored as still-armed keeps its keepalive
  renderAlarmSettings();
  render();
  pollAmbientStats();

  // ---- Party Gold ROI: this module's own calculator ----
  //
  // Shared calculators live in the Tools module (tools.js, which also holds the
  // reasoning for opening a tool in its own tab). This one stays here on purpose:
  // its live prefill IS this module's observations — slot levels read on the
  // Pets page, the gold rate seen in party battles, the derived tax — none of
  // which a separate script can see. It moves when the import layer
  // (REGISTER.md R46) gives it a data source that is not this alarm.
  //
  // The payload is REBUILT on each open rather than cached, because a live
  // snapshot is prepended to it and a cached URL would hand over whatever was
  // true the first time. The previous blob is revoked first, so exactly one is
  // ever alive.
  let roiUrl = null;
  Core.registerLink({
    id: 'party-gold-roi',
    label: 'Party Gold ROI',
    open() {
      if (roiUrl) { try { URL.revokeObjectURL(roiUrl); } catch (e) { /* ignore */ } }
      const snapshot = collectLiveSnapshot();
      // Core.toolHtml (Core v12) hands over the player's theme, developer-info
      // and tool-font settings with the snapshot, and inserts both AFTER the
      // doctype: a <script> ahead of it puts the page in quirks mode, where a
      // correct theme renders wrong. An older Core has no toolHtml; then only
      // the snapshot goes in, at the same place. `</` inside a JSON string
      // would close the script element early, hence the escape.
      const html = typeof Core.toolHtml === 'function'
        ? Core.toolHtml(AWOO_TOOL_PARTY_GOLD_ROI, { AWOO_LIVE: snapshot })
        : AWOO_TOOL_PARTY_GOLD_ROI.replace(/^(<!doctype html>\n<meta charset="utf-8">\n)?/i, (head) => head
          + '<script>window.AWOO_LIVE=' + JSON.stringify(snapshot).replace(/</g, '\\u003c') + ';<' + '/script>');
      roiUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      return roiUrl;
    },
  });

  Core.registerModule({
    id: MODULE_ID,
    // One name everywhere (id = filename = storage/CSS namespace = label).
    // This module was `eta-tracker` until 2026-09-18; it was renamed with a
    // deliberate settings reset, as part of the AWOO+ naming standard.
    label: 'Pet Slot Alarm',
    shortLabel: 'Alarm',
    description: 'Estimates time to the next combat pet slot upgrade and rings when it is affordable',
    // The Core API this was written against. A Core older than this refuses
    // the registration and says which version is needed, instead of the module
    // half-working and failing somewhere unrelated. See DISTRIBUTION.md §1.2.
    needsCore: 6, // v6: migrated onto Core.createWindow/Core.ui.* — see buildPanelContent()
    // Its own pane in Core's shared Settings window (v11). render() is called
    // once, the first time the tab is opened — which is also the first moment
    // the panel is guaranteed to have been built, so the node exists to adopt.
    settings: {
      label: 'Pet Slot Alarm',
      render(container) {
        const head = document.createElement('div');
        head.className = 'awoo-settings-cat';
        head.textContent = 'Alarm cadence';
        container.appendChild(head);
        if (cadenceNode) {
          cadenceNode.hidden = false;
          container.appendChild(cadenceNode);
        } else {
          const note = document.createElement('div');
          note.className = 'awoo-pet-slot-alarm-hint-inline';
          note.textContent = 'Open the Pet Slot Alarm window once to load these.';
          container.appendChild(note);
        }
        const oh = document.createElement('div');
        oh.className = 'awoo-settings-cat';
        oh.textContent = 'Session projection';
        container.appendChild(oh);
        const ohRow = Core.ui.inputRow({
          label: 'Overnight actions',
          type: 'number',
          value: String(overnightActions),
          info: 'Party actions usually run through the daily reset overnight, which tops the pool '
            + 'back up before a session ends. This is YOUR average, not a measured game figure, so '
            + 'the projections label it as an assumption. Set 0 to leave it out.',
          onChange: (v) => {
            const n = parseInt(v, 10);
            overnightActions = Number.isFinite(n) && n >= 0 ? n : 0;
            saveProgress();
            render();
          },
        });
        container.appendChild(ohRow);

        if (rateNode) {
          const h2 = document.createElement('div');
          h2.className = 'awoo-settings-cat';
          h2.textContent = 'Manual rate override (testing)';
          container.appendChild(h2);
          rateNode.hidden = false;
          container.appendChild(rateNode);
        }
      },
    },
    // enabling in the dropdown just adds the quick button - it does NOT open
    // the window; disabling always force-closes it though
    // D1 — disabling must DISARM, not just hide. Hiding the panel while the
    // heartbeat kept running is how a user ended up with an alarm they could
    // not reach: the panel was gone, so Stop and Snooze were gone with it.
    // stopTracking() also drops the keep-awake tone.
    //
    // Note for anyone debugging this: disabling the SCRIPT in Tampermonkey
    // does not unload code from a page that is already open — only a reload
    // does. Disabling the MODULE here is the thing that stops it live.
    // Enabling always shows the window right away — a page RELOAD restoring
    // last session's open state is the separate, settings-gated case (see
    // bootstrap()'s own togglePanel(true) call, below).
    onToggle: (enabled) => {
      if (enabled) togglePanel(true);
      else { stopTracking(); silenceAlarm(); togglePanel(false); }
    },
    onQuickClick: () => togglePanel(),
    // the number convention resolves late (needs React) and can be overridden -
    // everything previously parsed under a wrong guess must be re-read
    onConventionChange: () => {
      autoRateRaw = null;
      autoRateAtMs = null;
      partyRateGrabbedThisVisit = false;
      lastSync = { atMs: null, level: null, current: null };
      slotLevels = { combat: null, utility: null };
      goldNow = null; goldAtMs = null; goldFrom = null;
      refreshFromLiveData();
    },
    // Test seam, same pattern and same naming deterrent as Core's
    // __modulesForTest: the alarm bug this pins was reported by a real user,
    // and its whole nature is internal state that no DOM assertion can see.
    __forTest: {
      state: () => ({ runState, trackerEtaMs, trackerAcknowledged, alarmRepeats,
        level: lastSync.level, keepAwake, alarmCfg }),
      arm: (etaMs, level) => { runState = 'running'; lastSync = { atMs: Date.now(), level, current: 0 };
        trackerEtaMs = etaMs; trackerAcknowledged = false; trackerAlarmFired = false;
        nextAlarmAtMs = null; alarmRepeats = 0; },
      tick: () => checkTrackerReady(),
      unsilence: () => unsilenceAlarm(),
      isSilenced: () => silenced,
      simulateUpgradePath, petSlotBoostPercent, petSlotUpgradeCost,
      silence: () => silenceAlarm(),
      simulatePurchaseClick: () => {
        lastSync = { atMs: Date.now(), level: null, current: null };
        trackerEtaMs = null; trackerAlarmFired = false; trackerAcknowledged = false;
        nextAlarmAtMs = null; alarmRepeats = 0;
      },
      recomputeEta: () => { recomputeEta(); return trackerEtaMs; },
    },
    onResetPosition: () => windowHandle.resetPosition(),
  });

  // Settings-gated (v6.1, default OFF): a page reload restoring every window
  // that happened to be open last session is clutter most of the time —
  // enabling a module fresh (onToggle above) always still shows it though.
  if (panelOpen && Core.getSetting && Core.getSetting('autoShowOnReload')) togglePanel(true);

  // debounced: an unthrottled observer here fired on every DOM change (chat
  // scrolling, ticking progress bars, hover cards) and could hang the tab -
  // coalesce bursts into at most ~2.5 checks/sec. Ambient sidebar stats are
  // deliberately NOT read here - they're on their own slow interval below.
  let refreshTimer = null;
  function scheduleRefresh() {
    if (refreshTimer) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      refreshFromLiveData();
    }, 400);
  }
  new MutationObserver(scheduleRefresh).observe(document.body, { childList: true, subtree: true });

  startHeartbeat();
  setInterval(pollAmbientStats, AMBIENT_POLL_MS);

  // one write per 10s at most, and always one before the page goes away.
  // pagehide covers tab close/navigation; visibilitychange covers backgrounding,
  // which is when a throttled timer might not fire again at all.
  setInterval(flushProgress, 10000);
  window.addEventListener('pagehide', flushProgress);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { flushProgress(); return; }
    // Coming back: whatever the throttled heartbeat missed is caught up here in
    // one pass, so the panel is never showing a minute-old frame on return.
    pollAmbientStats();
    refreshFromLiveData();
    if (runState === 'running') checkTrackerReady();
  });
  }

  });
})();
