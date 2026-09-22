// ==UserScript==
// @name         AWOO+: Fighter Allocator
// @namespace    awoo-core
// @author       Apoz
// @version      1.12.1
// @description  AWOO+ module (requires "AWOO+"). Allocates gold-purchased fighter stats (Health/Damage/Hit/Dodge/Defense/Crit Damage) across your 6 fighters. Class-keyed profiles with a full table (category, classes, date, source), World Boss-aware math (Hit target from boss level, exact Damage/Crit Damage split), and two-way import/export with the community "Fighter Optimizer" gold-plan format. Fills the game's own stat inputs; never auto-clicks Save Preset.
// @match        https://v2.queslar.com/*
// @match        https://*.queslar.com/*
// @grant        none
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/awoo-vibe-sniffa/queslar-releases/main/live/fighter-allocator.user.js
// @downloadURL  https://raw.githubusercontent.com/awoo-vibe-sniffa/queslar-releases/main/live/fighter-allocator.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ==== GENERATED — DO NOT EDIT ====
  // Produced by userscripts/build.mjs from data/. Edit the FACT,
  // then rebuild; editing this block is overwritten and, worse,
  // silently diverges from the core it was supposed to mirror.

  // constants/fighters.json :: fighters.perPointScale  [CODE]
  const FIGHTER_PER_POINT_SCALE = {"health":100,"defense":10,"damage":25,"critDamage":0.0025,"hit":50,"dodge":50};

  // constants/fighters.json :: fighters.flatBase  [CODE]
  const FIGHTER_FLAT_BASE = {"health":500,"defense":25,"damage":100,"critDamage":0,"hit":50,"dodge":50};

  // constants/fighters.json :: fighters.monsterStatBreakpointScale  [CODE]
  function monsterStatBreakpointScale(level, linearMult, chunkMult) { const linear = level * linearMult; let bonus = 0; let chunkCount = 0; if (level > 600) { let remaining = level; for (; remaining > 600 && chunkCount < 5; ) { bonus += (remaining - 600) * chunkMult; remaining -= 300; chunkCount++; } if (remaining > 3000) { bonus += (remaining - 3000) * chunkMult; remaining -= 3000; chunkCount++; for (; remaining > 600; ) { bonus += (remaining - 600) * chunkMult; remaining -= chunkCount >= 10 ? 200 : 300; chunkCount++; } } } return linear + bonus; }

  // constants/fighters.json :: fighters.statPurchase.costFormula  [CODE]
  function fighterStatPurchaseCost(fromLevel, toLevel) { const count = toLevel - fromLevel; return (fromLevel + toLevel) * count / 2 * 10000; }

  // tables/modifier-tiers.json :: tiers.equipment.boostPercent  [CODE]
  const EQUIPMENT_TIER_BOOST_PERCENT = [10,20,30,40,50,75,100,125,150,175,200,250,275,300,325,350];

  // PROVENANCE — generated from this module's facts manifest.
  const PROVENANCE = [
    { file: "constants/fighters.json", fact: "fighters.perPointScale" },
    { file: "constants/fighters.json", fact: "fighters.flatBase" },
    { file: "constants/fighters.json", fact: "fighters.monsterStatBreakpointScale" },
    { file: "constants/fighters.json", fact: "fighters.statPurchase.costFormula" },
    { file: "tables/modifier-tiers.json", fact: "tiers.equipment.boostPercent" },
  ];
  void PROVENANCE; // declaration only — never read at runtime

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
  })("fighter-allocator", "1.12.1", function (Core) {


  const MODULE_ID = 'fighter-allocator';
  const STORAGE_KEY = `awoo:${MODULE_ID}:v1`;

  // ==== domain constants ====

  // The 6 raw, gold-purchased stats — same 6 the game's own slider UI shows.
  const STATS = ['Health', 'Damage', 'Hit', 'Dodge', 'Defense', 'Crit Damage'];
  // display name -> fighters.perPointScale/flatBase key (camelCase, no space)
  const STAT_KEY = { Health: 'health', Damage: 'damage', Hit: 'hit', Dodge: 'dodge', Defense: 'defense', 'Crit Damage': 'critDamage' };

  // Fuller than the community script's own 11-class dropdown (battle-fighters.md
  // documents 18) — no reason to limit OUR class-matching to a subset that
  // happens to be all one other script recognises.
  const ALL_CLASSES = [
    'Warrior', 'Brawler', 'Priest', 'Assassin', 'Mage', 'Shadow Dancer',
    'Berserker', 'Paladin', 'Crusader', 'Sentinel', 'Bastion', 'Tank',
    'Knight', 'Wizard', 'Cavalry', 'Healer', 'Synchronizer', 'Hunter',
  ];

  // AN EXPLICIT MAP, NOT A SLICE. Six of these classes share a first letter
  // and three share their first two (Brawler / Bastion / Berserker), so any
  // "take the first N characters" rule collides -- and a collision here does
  // not look like a bug, it looks like two different fighters being the same
  // one. Written out, then asserted unique at load, because the failure is
  // silent and the assertion costs nothing.
  //
  // Assassin is ASN rather than the obvious three letters, deliberately.
  const CLASS_ABBREV = {
    'Warrior': 'WAR', 'Brawler': 'BRA', 'Priest': 'PRI', 'Assassin': 'ASN',
    'Mage': 'MAG', 'Shadow Dancer': 'SD', 'Berserker': 'BSK', 'Paladin': 'PAL',
    'Crusader': 'CRU', 'Sentinel': 'SEN', 'Bastion': 'BAS', 'Tank': 'TNK',
    'Knight': 'KNI', 'Wizard': 'WIZ', 'Cavalry': 'CAV', 'Healer': 'HEA',
    'Synchronizer': 'SYN', 'Hunter': 'HUN',
  };
  {
    // Load-time, not test-time, because a module shipped with a collision is
    // worse than one that refuses to start with a console line saying which.
    const seen = new Set();
    for (const cls of ALL_CLASSES) {
      const a = CLASS_ABBREV[cls];
      if (!a) console.error('[fighter-allocator] no abbreviation for class:', cls);
      else if (seen.has(a)) console.error('[fighter-allocator] duplicate class abbreviation:', a, cls);
      seen.add(a);
    }
  }

  // Unknown classes fall back to their own name rather than a guess: an
  // imported plan can name a class this build has never heard of, and showing
  // it in full is the honest rendering of "I do not know what this is".
  function abbrevClass(name) {
    return CLASS_ABBREV[name] || name;
  }

  const POSITIONS = ['Left Top', 'Left Middle', 'Left Bottom', 'Right Top', 'Right Middle', 'Right Bottom'];

  const CATEGORIES = ['World Boss', 'Dungeon Pushing', 'Caves', 'Other'];

  // ==== pure allocation math (Node-testable — see fighter-allocator-math.mjs) ====

  // bossDodge(level) = 50*level below 600; the breakpoint formula (promoted
  // to a data/ fact this session, see fighters.monsterStatBreakpointScale)
  // keeps this exact past 600 too, instead of silently going wrong there the
  // way a hand-derived linear shortcut would.
  function bossDodgeAtLevel(level) {
    const raw = monsterStatBreakpointScale(level, 1, 1) - 1; // generateRawMonster's dodge offset
    return raw * FIGHTER_PER_POINT_SCALE.dodge + FIGHTER_FLAT_BASE.dodge;
  }

  // hitChance = clamp(0.25 + 0.75*hit/(hit+bossDodge), 0.25, 0.95); the 0.95
  // ceiling is reached exactly at hit = 14*bossDodge. Past this, a Hit point
  // is worth exactly zero — CONFIDENCE NOTE: contingent on
  // worldBoss.fighterBossStatGeneration (data/formulas/worldboss.json),
  // still INFER-tier, not yet HAR-confirmed. Surface that in the UI, not just
  // here — see the info-icon on the Boss level field in buildOptimizerContent().
  function hitTargetForBossLevel(level) {
    return 14 * bossDodgeAtLevel(level);
  }

  function statFinalFromRaw(stat, points) {
    const key = STAT_KEY[stat] || stat;
    return points * FIGHTER_PER_POINT_SCALE[key] + FIGHTER_FLAT_BASE[key];
  }

  // Inverts statFinalFromRaw for a TARGET final value. `gearBonus` is however
  // much of that final stat the caller already knows comes from gear/base
  // (0 if unknown) — absent a live read, this is a reasonable default, not a
  // guess dressed as one: the caller is choosing not to supply it, not us
  // failing to find it.
  function rawPointsForFinalStat(stat, targetFinal, gearBonus) {
    const key = STAT_KEY[stat] || stat;
    const needed = targetFinal - (gearBonus || 0) - FIGHTER_FLAT_BASE[key];
    return Math.max(0, Math.round(needed / FIGHTER_PER_POINT_SCALE[key]));
  }

  // ==== gold <-> raw-points, from the VERIFIED cost formula ====
  //
  // fighterStatPurchaseCost (the emitted fact) is cost(fromLevel,toLevel) =
  // (from+to)*(to-from)/2*10000, checked exactly against all 6 stats on a
  // real account's live allocation screenshot (see the fact's own
  // verifiedBy note). Cost to buy N points from level e simplifies to
  // 5000*((e+N)^2 - e^2) — the SAME coefficient for every one of the 6
  // stats, which is what makes a gold budget and a raw-point budget
  // proportional via one shared curve rather than needing a per-stat
  // conversion.
  function goldCostForPoints(currentRaw, addPoints) {
    currentRaw = currentRaw || 0;
    addPoints = Math.max(0, addPoints || 0);
    return fighterStatPurchaseCost(currentRaw, currentRaw + addPoints);
  }

  // Inverts the cost formula for a SINGLE stat: the highest raw level
  // reachable from currentRaw given goldBudget. (e+t)(t-e)/2*10000<=budget
  // => t <= sqrt(budget/5000 + e^2).
  function maxLevelForBudget(currentRaw, goldBudget) {
    currentRaw = currentRaw || 0;
    if (!(goldBudget > 0)) return currentRaw;
    return Math.sqrt(goldBudget / 5000 + currentRaw * currentRaw);
  }

  // Maximises damage * (1 + critChance*critDamage) over a GOLD budget split
  // between the two stats. Because both stats share the identical quadratic
  // cost curve (fighters.statPurchase.costFormula), a fixed gold budget
  // traces a CIRCLE in (Damage-raw-level, CritDamage-raw-level) space —
  // D^2 + C^2 = goldBudget/5000 + D0^2 + C0^2 — not a straight line the way
  // a fixed RAW-POINT budget would. This supersedes an earlier, wrong
  // assumption in this project that the split converges to 50/50 raw
  // points: that was only true under a linear (points-budget) constraint,
  // and the real constraint is this circle. Solved numerically (ternary
  // search over the circle's angle) rather than forcing a closed form — the
  // Lagrange condition here doesn't reduce to one cleanly once the flatBase/
  // "+1" baseline terms are included, and this is cheap arithmetic either way.
  function splitDamageCritDamageByGold({ goldBudget, currentDamageRaw, currentCritDamageRaw, critChance }) {
    const D0 = currentDamageRaw || 0, C0 = currentCritDamageRaw || 0;
    if (!(goldBudget > 0)) return { damageRaw: D0, critDamageRaw: C0, damagePoints: 0, critDamagePoints: 0 };
    const a = FIGHTER_PER_POINT_SCALE.damage, b = FIGHTER_FLAT_BASE.damage;
    const p = (critChance || 0) * FIGHTER_PER_POINT_SCALE.critDamage;
    const K = goldBudget / 5000 + D0 * D0 + C0 * C0;
    const sqrtK = Math.sqrt(Math.max(0, K));

    let D, C;
    if (!(p > 0)) {
      // No crit chance at all -> Crit Damage is worth literally zero; every
      // point of the budget goes to Damage. C cannot go BELOW its current
      // level (points aren't un-spent), so the circle degenerates to that.
      D = Math.sqrt(Math.max(D0 * D0, K - C0 * C0));
      C = C0;
    } else {
      const f = (theta) => {
        const d = sqrtK * Math.cos(theta), c = sqrtK * Math.sin(theta);
        return (a * d + b) * (p * c + 1);
      };
      let lo = 0, hi = Math.PI / 2;
      for (let i = 0; i < 60; i++) {
        const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
        if (f(m1) < f(m2)) lo = m1; else hi = m2;
      }
      const theta = (lo + hi) / 2;
      D = sqrtK * Math.cos(theta);
      C = sqrtK * Math.sin(theta);
    }
    D = Math.max(D, D0);
    C = Math.max(C, C0);
    return {
      damageRaw: Math.round(D), critDamageRaw: Math.round(C),
      damagePoints: Math.max(0, Math.round(D - D0)), critDamagePoints: Math.max(0, Math.round(C - C0)),
    };
  }

  // The chance an attack lands. The 0.95 ceiling is why "buy Hit to the cap"
  // was ever tempting — and, as it turns out, exactly why it is wrong.
  function hitChanceAt(hitRaw, bossLevel, gearHitBonus) {
    const hf = statFinalFromRaw('Hit', hitRaw) + (gearHitBonus || 0);
    const dodge = bossDodgeAtLevel(bossLevel);
    if (!(hf > 0)) return 0.25;
    return Math.min(0.95, Math.max(0.25, 0.25 + 0.75 * hf / (hf + dodge)));
  }

  // Expected damage per attack — the thing actually being maximised.
  //
  // EVERY TERM IS A TOTAL: gear + implicits + flat base + points bought. The
  // first version of this used only the purchased part, which is not a smaller
  // version of the same problem — it is a different one. Because the three
  // terms MULTIPLY, a gear bonus on one of them changes the marginal value of
  // buying more of the OTHERS, so ignoring gear does not merely under-report
  // the damage, it moves the optimal split.
  function expectedDamage({ hitRaw, damageRaw, critDamageRaw, bossLevel, critChance, gearHitBonus, gearDamageBonus, gearCritDamageBonus }) {
    return hitChanceAt(hitRaw, bossLevel, gearHitBonus)
      * (statFinalFromRaw('Damage', damageRaw) + (gearDamageBonus || 0))
      * (1 + (critChance || 0) * (statFinalFromRaw('Crit Damage', critDamageRaw) + (gearCritDamageBonus || 0)));
  }

  // ONE JOINT OPTIMISATION OVER ALL THREE STATS — corrected 2026-09-08.
  //
  // ── WHAT WAS WRONG, AND BY HOW MUCH ──────────────────────────────────────
  //
  // The previous version bought Hit FIRST, all the way to its saturation
  // target, and only then split whatever was left between Damage and Crit
  // Damage. Its stated justification was that "past the cap a Hit level is
  // worth literally zero while Damage/Crit Damage never stop paying off".
  // That argument is sound and proves only that you must not go PAST the cap.
  // It says nothing about whether you should go TO it — and the answer is no.
  //
  // **At the cap, the marginal value of Hit is exactly zero** (that is what a
  // cap means), while Damage and Crit Damage still have strictly positive
  // marginal value. So the last gold spent reaching the cap always buys less
  // than the same gold spent elsewhere: the optimum is strictly BELOW it.
  // Measured at boss L400 with a covering budget: **+7.2% expected damage**
  // from stopping at ~91% hit chance instead of 95%.
  //
  // The shortfall case was far worse, and was not a rounding error. When the
  // budget could not reach the cap, the old code put the ENTIRE budget into
  // Hit and left Damage and Crit Damage at zero — a fighter with a good chance
  // to land an attack that does nothing. Measured at the same boss level:
  // **78x worse at a 1b budget, 1479x worse at 100b.** The old comment called
  // this "reasonable since Hit multiplies the whole attack", which confuses
  // multiplying with mattering: 0.65 x 0 is not better than 0.52 x 384.
  //
  // ── THE STRUCTURE, WHICH IS THE SAME ONE, ONE DIMENSION UP ───────────────
  //
  // All six stats share the identical quadratic cost curve, so a gold budget
  // is a SPHERE in (Hit, Damage, CritDamage) raw-level space:
  //   H^2 + D^2 + C^2 = goldBudget/5000 + H0^2 + D0^2 + C0^2
  // The old Damage/CritDamage split already used exactly this insight in 2D (a
  // circle). Fixing Hit first is what flattened a sphere into a circle and
  // threw away the dimension that mattered most.
  //
  // Solved numerically — coarse spherical grid, then ternary refinement on
  // each angle. Not closed-form on purpose: the hit-chance term is a saturating
  // rational function, and forcing a closed form would mean linearising the
  // one part of this whose curvature IS the finding.
  function allocateFighterForWorldBoss({ goldBudget, bossLevel, currentHitRaw, currentDamageRaw, currentCritDamageRaw, critChance, gearHitBonus, gearDamageBonus, gearCritDamageBonus }) {
    const H0 = Math.max(0, currentHitRaw || 0);
    const D0 = Math.max(0, currentDamageRaw || 0);
    const C0 = Math.max(0, currentCritDamageRaw || 0);
    const hitTargetFinal = hitTargetForBossLevel(bossLevel);
    const hitTargetRaw = Math.max(H0, rawPointsForFinalStat('Hit', hitTargetFinal, gearHitBonus || 0));
    const hitCostToCap = goldCostForPoints(H0, hitTargetRaw - H0);

    const K = Math.max(0, goldBudget || 0) / 5000 + H0 * H0 + D0 * D0 + C0 * C0;
    const R = Math.sqrt(K);

    // Points already bought cannot be un-bought, so every candidate is floored
    // at the current level. (H0,D0,C0) is always inside the sphere by
    // construction, so a feasible point always exists.
    const at = (phi, theta) => {
      const H = Math.max(H0, R * Math.sin(phi) * Math.cos(theta));
      const D = Math.max(D0, R * Math.sin(phi) * Math.sin(theta));
      const C = Math.max(C0, R * Math.cos(phi));
      return { H, D, C };
    };
    const score = (phi, theta) => {
      const p = at(phi, theta);
      return expectedDamage({
        hitRaw: p.H, damageRaw: p.D, critDamageRaw: p.C, bossLevel, critChance,
        gearHitBonus, gearDamageBonus, gearCritDamageBonus,
      });
    };

    // Coarse grid first. The product of a saturating term and two increasing
    // ones is well-behaved here but not provably unimodal, and seeding the
    // refinement from a grid costs ~1600 evaluations of pure arithmetic.
    const HALF_PI = Math.PI / 2;
    let bestPhi = HALF_PI / 2, bestTheta = HALF_PI / 2, bestVal = -Infinity;
    const G = 40;
    for (let i = 0; i <= G; i++) {
      for (let j = 0; j <= G; j++) {
        const phi = HALF_PI * i / G, theta = HALF_PI * j / G;
        const v = score(phi, theta);
        if (v > bestVal) { bestVal = v; bestPhi = phi; bestTheta = theta; }
      }
    }
    // Then ternary-refine each angle in turn, around the grid cell that won.
    const cell = HALF_PI / G;
    for (let pass = 0; pass < 4; pass++) {
      let lo = Math.max(0, bestPhi - cell), hi = Math.min(HALF_PI, bestPhi + cell);
      for (let k = 0; k < 40; k++) {
        const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
        if (score(m1, bestTheta) < score(m2, bestTheta)) lo = m1; else hi = m2;
      }
      bestPhi = (lo + hi) / 2;
      lo = Math.max(0, bestTheta - cell); hi = Math.min(HALF_PI, bestTheta + cell);
      for (let k = 0; k < 40; k++) {
        const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
        if (score(bestPhi, m1) < score(bestPhi, m2)) lo = m1; else hi = m2;
      }
      bestTheta = (lo + hi) / 2;
    }

    const best = at(bestPhi, bestTheta);
    const hitRaw = Math.round(best.H);
    const damageRaw = Math.round(best.D);
    const critDamageRaw = Math.round(best.C);
    const achievedHitChance = hitChanceAt(hitRaw, bossLevel, gearHitBonus);

    return {
      hitRaw, hitPoints: Math.max(0, hitRaw - H0),
      damageRaw, damagePoints: Math.max(0, damageRaw - D0),
      critDamageRaw, critDamagePoints: Math.max(0, critDamageRaw - C0),
      // Reported so the UI can SAY what it chose rather than implying a cap was
      // aimed for. `hitFullyCovered` is kept for the existing log line but now
      // means "the budget could have reached the cap", not "we spent it there".
      achievedHitChance,
      stoppedBelowCap: hitRaw < hitTargetRaw,
      hitTargetFinal, hitTargetRaw, hitCostGold: hitCostToCap,
      hitFullyCovered: hitCostToCap <= (goldBudget || 0),
      expectedDamage: expectedDamage({
        hitRaw, damageRaw, critDamageRaw, bossLevel, critChance,
        gearHitBonus, gearDamageBonus, gearCritDamageBonus,
      }),
      gearHitBonus: gearHitBonus || 0, gearDamageBonus: gearDamageBonus || 0, gearCritDamageBonus: gearCritDamageBonus || 0,
    };
  }

  // ==== R22: no plan from inputs that were not read ====
  //
  // THE BUG THIS CLOSES, found in the 2026-09-19 register review: the plan
  // step turned an unread Crit Chance into the 0.1 base and unread gear into
  // zero, planned anyway, and said so only in a log line — and the opt-in
  // auto-save could then commit that plan. Absent is not zero (AGENTS.md
  // rule 3): a geared fighter planned as ungeared buys Hit it does not need,
  // because gear Hit is exactly what the plan would otherwise have bought.
  //
  // So both inputs are now REQUIRED per fighter, and a fighter missing either
  // one is named, with what is missing. One gap refuses the whole plan rather
  // than planning five fighters: a World Boss plan replaces the preset, and a
  // preset with one fighter left unplanned is not a plan anyone asked for.
  function worldBossReadGaps(classes, critByClass, gearByClass) {
    const gaps = [];
    for (const cls of classes) {
      const missing = [];
      if (!(critByClass && Number.isFinite(critByClass[cls]))) missing.push('Crit Chance');
      if (!(gearByClass && gearByClass[cls])) missing.push('gear');
      if (missing.length) gaps.push({ class: cls, missing });
    }
    return gaps;
  }

  function describeReadGaps(gaps) {
    return gaps.map((g) => `${g.class} (${g.missing.join(' and ')})`).join(', ');
  }

  // The plan step, pure: every read already taken, nothing touched. Returns
  // `{ refused }` naming each fighter whose reads failed, or the per-fighter
  // allocations. Split out of runWorldBossOptimization so the refusal is
  // testable without a Fighters page to scan.
  function planWorldBoss({ layout, level, perFighterGold, critByClass, gearByClass }) {
    const refused = worldBossReadGaps(layout, critByClass, gearByClass);
    if (refused.length) return { refused };
    const allocs = {};
    for (const cls of layout) {
      const gear = gearByClass[cls];
      // A World Boss plan REPLACES an allocation rather than adding to it, so
      // the starting point is zero bought points — the preset is reset before
      // it is filled. Gear is different: it is not spendable and is always
      // there, so it belongs in the objective as a fixed offset.
      allocs[cls] = allocateFighterForWorldBoss({
        goldBudget: perFighterGold, bossLevel: level,
        currentHitRaw: 0, currentDamageRaw: 0, currentCritDamageRaw: 0,
        critChance: critByClass[cls],
        gearHitBonus: gear.hit || 0,
        gearDamageBonus: gear.damage || 0,
        gearCritDamageBonus: gear.critDamage || 0,
      });
    }
    return { allocs };
  }

  // The auto-save half of R22. A plan saved before this fix, or imported from
  // someone else's copy, can still carry the gap in its own meta — the
  // optimiser has always recorded critByClass and gearByClass there, with
  // null or a missing key for a failed read. Only optimiser plans are judged
  // (meta.bossLevel is set nowhere else): a hand-made plan's numbers are the
  // player's own, and there is no read to have failed. A plan from before
  // gear was read at all has no gearByClass, and is refused for the same
  // reason — it was planned gear-blind.
  function autoSaveReadRefusal(profile) {
    const meta = (profile && profile.meta) || {};
    if (meta.bossLevel == null) return null;
    const gaps = worldBossReadGaps(Object.keys(profile.stats || {}), meta.critByClass, meta.gearByClass);
    return gaps.length
      ? `Auto-save is on, but this plan was made without reading ${describeReadGaps(gaps)} — `
        + 'check it, then press Save Preset yourself, or re-run the optimiser.'
      : null;
  }

  // ==== legacy sqrt-budget scaling — for friend-format compatibility, and for ====
  // ==== re-scaling any non-World-Boss profile against a new live budget      ====
  const BUDGET_SAFETY = 0.9995; // matches the community script's own constant, so a shared profile scales identically in both tools
  function scaleLevel(level, playerBudgetB, sourceBudgetB) {
    if (!(sourceBudgetB > 0) || !(playerBudgetB > 0)) return Math.max(0, Math.round(level || 0));
    return Math.max(0, Math.round((level || 0) * Math.sqrt((playerBudgetB * BUDGET_SAFETY) / sourceBudgetB)));
  }

  // ==== profile schema ====
  //
  // Class-keyed, not position-keyed (the community script's format keys by
  // grid position) — this is what makes "apply even if my class order is
  // different" fall out of the data model instead of needing a special case.
  // { id, name, category, createdAt, updatedAt, source, archived,
  //   classLayout: [6 class names, position order at save time — display/export only],
  //   stats: { className: { Health, Damage, Hit, Dodge, Defense, "Crit Damage" } },
  //   sourceBudgetB, meta: { bossLevel? } }

  function newProfileId() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function emptyStatBlock() {
    const s = {};
    for (const stat of STATS) s[stat] = 0;
    return s;
  }

  function makeProfile(partial) {
    const now = Date.now();
    return Object.assign({
      id: newProfileId(),
      name: 'Untitled plan',
      category: 'Other',
      createdAt: now,
      updatedAt: now,
      source: 'You',
      archived: false,
      classLayout: [],
      stats: {},
      sourceBudgetB: null,
      meta: {},
    }, partial);
  }

  // ==== profile store — dirty-flag + debounced flush, exactly pet-slot-alarm's ====
  // ==== pattern (INSTRUMENTATION.md §5 S1): no per-change synchronous write  ====
  let profiles = [];

  // Persisted alongside `profiles` in the same STORAGE_KEY blob — see
  // recordBossLevelObservation()/predictBossLevel() below for the shape and
  // why it is two fields, not one.
  let bossLevelMemory = { lastKnown: null, log: [] };

  // Module settings (item 5/6): allocation pacing and the opt-in auto-save
  // gate. Same store, same debounced flush — these are rare, deliberate
  // changes (a Settings-tab toggle), not worth a second persistence path.
  const DEFAULT_MODULE_SETTINGS = Object.freeze({ allocatePace: 'fast', autoSavePreset: false });
  let moduleSettings = Object.assign({}, DEFAULT_MODULE_SETTINGS);

  let storeDirty = false;
  function markDirty() { storeDirty = true; }

  function flushStore() {
    if (!storeDirty) return;
    storeDirty = false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        profiles, bossLevelMemory, settings: moduleSettings, savedAt: Date.now(),
      }));
    } catch (e) { /* storage unavailable, ignore */ }
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      if (saved && Array.isArray(saved.profiles)) profiles = saved.profiles;
      if (saved && saved.bossLevelMemory && typeof saved.bossLevelMemory === 'object') {
        bossLevelMemory = {
          lastKnown: saved.bossLevelMemory.lastKnown || null,
          log: Array.isArray(saved.bossLevelMemory.log) ? saved.bossLevelMemory.log : [],
        };
      }
      if (saved && saved.settings && typeof saved.settings === 'object') {
        moduleSettings = Object.assign({}, DEFAULT_MODULE_SETTINGS, saved.settings);
      }
    } catch (e) { profiles = []; }
  }

  function setModuleSetting(key, value) {
    moduleSettings = Object.assign({}, moduleSettings, { [key]: value });
    markDirty();
  }

  function upsertProfile(profile) {
    const i = profiles.findIndex((p) => p.id === profile.id);
    profile.updatedAt = Date.now();
    if (i === -1) profiles.push(profile); else profiles[i] = profile;
    markDirty();
    return profile;
  }
  function deleteProfileHard(id) {
    profiles = profiles.filter((p) => p.id !== id);
    markDirty();
  }
  function setArchived(id, archived) {
    const p = profiles.find((x) => x.id === id);
    if (p) { p.archived = archived; p.updatedAt = Date.now(); markDirty(); }
  }
  // For the table's inline Edit — only ever touches name/category/source/
  // updatedAt (the columns the user asked to be editable there; the stat
  // allocation itself is not). updatedAt defaults to now UNLESS the caller
  // explicitly supplied one (editing the Updated date itself is one of the
  // four editable fields, so a save must be able to set it deliberately,
  // not just always overwrite it with "now").
  function updateProfileFields(id, fields) {
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    Object.assign(p, fields);
    if (!('updatedAt' in fields)) p.updatedAt = Date.now();
    markDirty();
  }
  function duplicateProfile(id, newName) {
    const p = profiles.find((x) => x.id === id);
    if (!p) return null;
    const copy = makeProfile(Object.assign({}, JSON.parse(JSON.stringify(p)), {
      id: newProfileId(), name: newName || (p.name + ' (copy)'), createdAt: Date.now(),
    }));
    profiles.push(copy);
    markDirty();
    return copy;
  }

  // ==== import: auto-detect the community script's two shapes, plus our own ====
  //
  // Mirrors normalizeImportedPlan's branch logic (the community Tampermonkey
  // "Fighter Optimizer" script) as the reference mapping, ported rather than
  // copied: proper Error messages surfaced in-panel instead of alert()/thrown
  // strings, and no client-side mutation of global state mid-parse.
  // THE FORMAT TAG IS A WIRE FORMAT, NOT BRANDING. It is written into plan files
  // people have saved and shared, and import accepts a file only on an exact
  // match. The 2026-09-18 rebrand's find-and-replace renamed it, twice, which
  // would have made every plan exported before that date unimportable; the
  // only test was an export->import round trip, which passes whatever the tag
  // says as long as both sides agree. So: new exports carry the new tag, and
  // every tag ever shipped stays importable. Never remove an entry from this
  // list. The legacy spelling is split so the next rename cannot rewrite it.
  const NATIVE_FORMATS = ['awoo-fighter-allocator-v1', 'ap' + 'oz-fighter-allocator-v1'];

  function detectAndNormalizeImport(raw, defaultName) {
    if (!raw || typeof raw !== 'object') throw new Error('That is not a valid plan (not a JSON object).');

    if (NATIVE_FORMATS.includes(raw.format)) {
      return normalizeNativeExport(raw);
    }
    if (Array.isArray(raw.allocations)) {
      return normalizeFriendPlanRows(raw, defaultName);
    }
    if (Array.isArray(raw.layout) && raw.stats && typeof raw.stats === 'object') {
      return normalizeFriendSetupShape(raw, defaultName);
    }
    throw new Error('Unrecognised plan format — expected a Fighter Optimizer gold-plan export, '
      + 'a class/layout setup object, or a plan exported from this tool.');
  }

  function normalizePositionName(name) {
    const idx = POSITIONS.findIndex((p) => p.toLowerCase() === String(name || '').trim().toLowerCase());
    if (idx !== -1) return idx;
    const n = parseInt(name, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 6) return n - 1;
    return -1;
  }

  // ---- the one number rule the import path has to get right ----
  //
  // REPORTED: "community import mishandles comma/dot". The import path used
  // bare `Number()` everywhere, and the obvious fix — route it all through
  // `Core.parseNumber` — is WRONG and would corrupt data that is currently
  // correct. A JSON *number* is locale-neutral by specification: `1.234` in
  // JSON genuinely means 1.234, and reinterpreting it under the player's
  // display convention would turn it into 1234.
  //
  // So the rule is about the JS type, not the format:
  //   • already a `number`  -> use it as-is, it cannot be ambiguous.
  //   • a `string`          -> `Core.parseNumber`, which knows the account's
  //                            own group/decimal convention and RETURNS NULL
  //                            rather than guessing on an ambiguous one.
  // Anything else, or a refusal, is null — and callers must SAY so rather than
  // defaulting, because a silently-dropped stat is a wrong plan that looks
  // right (CLAUDE.md rule 3).
  //
  // The real community export's shape is UNCONFIRMED — nobody has captured
  // one — so both branches have to work rather than one being the "real" path.
  function importNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
      const t = value.trim();
      if (t === '') return null;
      if (typeof Core.parseNumber === 'function') {
        const n = Core.parseNumber(t);
        return Number.isFinite(n) ? n : null;
      }
      // Older Core: refuse rather than fall back to Number(), which is exactly
      // the misparse being fixed.
      return null;
    }
    return null;
  }

  // REPORTED BUG (2026-09-10): importing a real "queslar-scaled-gold-plan-v2"
  // plan (the community Fighter Optimizer's own format) and allocating it
  // filled every stat input with numbers in the hundreds of millions to
  // billions, instead of the plan's own modest per-stat counts (a few
  // thousand at most). Root cause: a UNITS mismatch this function was
  // creating silently. The community format's `sourceBudgetB`/`budgetB`
  // field is BILLIONS-denominated by its own name and convention — the
  // reported plan's own `name` field said so outright, "4535.101b total
  // plan" for a `sourceBudgetB` of 4535.10056 — but everything on AWOO's
  // side that this value gets compared against (`liveBudgetB`, read by
  // getTotalBudget() below, and scaleLevel()'s ratio) is RAW gold, with no
  // division ever applied. `findSourceBudgetB` was returning the
  // community-format value completely unconverted, so `scaleLevel`'s
  // `sqrt(playerBudgetB / sourceBudgetB)` computed the ratio between a raw
  // gold figure (liveBudgetB, of the order of 1e12+) and a billions figure
  // (sourceBudgetB, of the order of 1e3-1e4) — off by roughly 1e9, and the
  // sqrt of THAT (~31,623x) is exactly what turned a few thousand into
  // hundreds of millions.
  //
  // Fixed at the one place this function returns a value: an alias whose
  // OWN name declares billions ("...b"/"...billions") gets multiplied by
  // 1e9 here, once, converting it into AWOO's raw-gold convention before it
  // ever reaches scaleLevel(). The bare aliases (a plain "budget"/
  // "totalBudget"/"usableGold", no "b" suffix) make no such claim about
  // their own unit and are left exactly as written — guessing a conversion
  // there risks the opposite failure this fixes, for a shape nobody has
  // actually reported.
  const BILLIONS_DENOMINATED_ALIASES = new Set(['budgetb', 'budgetbillions', 'sourcebudgetb',
    'additionalbudgetb', 'additionalbudgetbillions', 'usablegoldb']);
  function findSourceBudgetB(data) {
    if (!data || typeof data !== 'object') return null;
    const aliases = new Set(['budgetb', 'budgetbillions', 'sourcebudgetb', 'additionalbudgetb',
      'additionalbudgetbillions', 'budget', 'additionalbudget', 'goldbudget', 'totalbudget',
      'usablegold', 'usablegoldb']);
    for (const [key, value] of Object.entries(data)) {
      const normKey = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
      if (aliases.has(normKey)) {
        // Was `typeof value === 'number'` only, so a STRING-encoded budget was
        // not misparsed — it was invisible, which is a quieter failure and a
        // worse one: the plan imported looking complete, minus its budget.
        const n = importNumber(value);
        if (n !== null && n > 0) return BILLIONS_DENOMINATED_ALIASES.has(normKey) ? n * 1e9 : n;
      }
    }
    for (const value of Object.values(data)) {
      if (value && typeof value === 'object') {
        const found = findSourceBudgetB(value);
        if (found) return found;
      }
    }
    return null;
  }

  // { allocations: [{position, fighter, stat, recommended}, ...], sourceBudgetB|budgetB, name }
  function normalizeFriendPlanRows(raw, defaultName) {
    const layout = new Array(6).fill(null);
    const stats = {};
    for (const row of raw.allocations) {
      const fighter = row.fighter || row.Fighter;
      const posIdx = normalizePositionName(row.position ?? row.Position ?? row.slot ?? row.Slot);
      const stat = STATS.find((s) => s.toLowerCase() === String(row.stat || row.Stat || '').toLowerCase());
      const level = importNumber(row.recommended ?? row.Recommended ?? row.level ?? row.Level);
      if (!fighter || posIdx === -1 || !stat || level === null) {
        throw new Error('Each row needs a recognisable Position, Fighter, Stat and Recommended level'
          + ' — and the level must be a plain number, or text this account\'s number format can read.');
      }
      layout[posIdx] = fighter;
      if (!stats[fighter]) stats[fighter] = emptyStatBlock();
      stats[fighter][stat] = Math.max(0, Math.round(level));
    }
    if (layout.some((c) => !c)) throw new Error('Imported plan is missing one or more fighter positions.');
    const sourceBudgetB = findSourceBudgetB(raw);
    return makeProfile({
      name: raw.name || defaultName || 'Imported plan',
      classLayout: layout,
      stats,
      sourceBudgetB,
      source: 'Imported (Fighter Optimizer)',
    });
  }

  // { layout: [6 class names], stats: { className: { Health, Damage, ... } } }
  function normalizeFriendSetupShape(raw, defaultName) {
    const layout = raw.layout.slice(0, 6);
    if (layout.length !== 6 || layout.some((c) => !c)) {
      throw new Error('layout must name exactly 6 fighter classes.');
    }
    const stats = {};
    for (const cls of layout) {
      const src = raw.stats[cls] || {};
      stats[cls] = emptyStatBlock();
      for (const stat of STATS) {
        if (src[stat] === undefined || src[stat] === null) continue;
        const v = importNumber(src[stat]);
        // A present-but-unreadable value is REFUSED, not skipped: silently
        // leaving it at zero produces a plan that allocates nothing to that
        // stat and looks deliberate.
        if (v === null) {
          throw new Error(`"${cls}" has a ${stat} value that could not be read as a number`
            + ` (got ${JSON.stringify(src[stat])}). Check the file's number format.`);
        }
        stats[cls][stat] = Math.max(0, Math.round(v));
      }
    }
    return makeProfile({
      name: raw.label || raw.name || defaultName || 'Imported setup',
      classLayout: layout,
      stats,
      sourceBudgetB: findSourceBudgetB(raw),
      source: 'Imported (Fighter Optimizer)',
    });
  }

  function normalizeNativeExport(raw) {
    if (!raw.stats || typeof raw.stats !== 'object') throw new Error('Missing "stats".');
    return makeProfile({
      name: raw.name || 'Imported plan',
      category: CATEGORIES.includes(raw.category) ? raw.category : 'Other',
      classLayout: Array.isArray(raw.classLayout) ? raw.classLayout : [],
      stats: raw.stats,
      sourceBudgetB: raw.sourceBudgetB || null,
      source: raw.source || 'Imported',
      meta: raw.meta || {},
    });
  }

  // ==== export ====

  function exportNative(profile) {
    return JSON.stringify({
      format: NATIVE_FORMATS[0],
      name: profile.name,
      category: profile.category,
      classLayout: profile.classLayout,
      stats: profile.stats,
      sourceBudgetB: profile.sourceBudgetB,
      source: profile.source,
      meta: profile.meta,
      exportedAt: new Date().toISOString(),
    }, null, 2);
  }

  // Reconstructs a queslar-scaled-gold-plan-v2-shaped JSON — the community
  // script's own import format — so a profile built here can be handed back
  // unchanged. Requires the profile's classLayout (position order); a
  // class-keyed profile with no recorded layout cannot be position-exported.
  function exportFriendFormat(profile) {
    if (!profile.classLayout || profile.classLayout.length !== 6) {
      throw new Error('This profile has no recorded 6-position layout to export against — '
        + 'load it once against a live formation, then export.');
    }
    // profile.sourceBudgetB is raw gold everywhere on this side (see
    // findSourceBudgetB's comment) — the community format's own
    // "...BudgetB" fields are billions-denominated, so this is the inverse
    // of the /1e9 that import applies, not a new convention. Without it,
    // a plan re-exported after being imported (or reallocated) would carry
    // a billions-labelled field holding a raw-gold number nine zeroes too
    // large, breaking it for the next tool that reads it — the exact class
    // of bug this whole fix closes on the way in.
    const budgetB = (profile.sourceBudgetB || 100e9) / 1e9;
    const allocations = [];
    profile.classLayout.forEach((cls, i) => {
      const stats = profile.stats[cls] || emptyStatBlock();
      for (const stat of STATS) {
        allocations.push({
          position: POSITIONS[i], fighter: cls, stat, current: 0,
          recommended: stats[stat] || 0, add: stats[stat] || 0,
        });
      }
    });
    return JSON.stringify({
      format: 'queslar-scaled-gold-plan-v2', version: '2.1.11',
      name: profile.name, savedAt: new Date().toISOString(),
      sourceBudgetB: budgetB, budgetB, allocations,
    }, null, 2);
  }

  // ==== class-order-independent resolution ====
  //
  // Resolves a profile's class-keyed stats against whatever the LIVE
  // position->class layout currently is — the actual fix for "allocate even
  // if my class order is wrong". Never assumes; reports exactly what did and
  // did not match so the caller can put a real warning in front of the user
  // rather than silently skipping or silently guessing.
  function resolveProfileAgainstLayout(profile, liveLayout) {
    const classCounts = {};
    for (const cls of liveLayout) classCounts[cls] = (classCounts[cls] || 0) + 1;
    const duplicatesOnPage = Object.keys(classCounts).filter((c) => classCounts[c] > 1);

    const matched = [];
    const unmatched = [];
    for (const cls of Object.keys(profile.stats)) {
      const index = liveLayout.indexOf(cls);
      if (index === -1) unmatched.push(cls);
      else matched.push({ class: cls, index });
    }
    return { matched, unmatched, duplicatesOnPage };
  }

  // ==== DOM read/assist layer ====
  //
  // BEST-EFFORT PORT of the community "Fighter Optimizer" script's own DOM
  // probing, hardened where practical — NOT yet smoke-tested against a live
  // page (no browser access from where this was written). Per CONVENTIONS.md's
  // write-inversion rule, verify every selector below against
  // test.v2.queslar.com before this ever touches the live account; treat
  // this section as the one part of the module still owed that pass.

  function text(el) {
    return (el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function getClassFromButton(btn) {
    const t = text(btn);
    return ALL_CLASSES.find((cls) => t === cls || t.includes(cls)) || null;
  }

  // Same visual-geometry heuristic the community script uses to find the 6
  // formation buttons (no stable id/data-attribute observed on this page) —
  // flagged here, not hidden, because a geometry heuristic is exactly the
  // kind of thing a page redesign silently breaks.
  function getClassButtons() {
    const buttons = [...document.querySelectorAll('button')].filter((btn) => {
      const rect = btn.getBoundingClientRect();
      const cls = getClassFromButton(btn);
      const style = getComputedStyle(btn);
      return cls && rect.width >= 70 && rect.width <= 240 && rect.height >= 28 && rect.height <= 70
        && rect.top > 150 && style.display !== 'none' && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0;
    });
    const seen = new Set();
    const unique = [];
    for (const btn of buttons) {
      const rect = btn.getBoundingClientRect();
      const key = `${Math.round(rect.left)}-${Math.round(rect.top)}-${getClassFromButton(btn)}`;
      if (!seen.has(key)) { seen.add(key); unique.push(btn); }
    }
    if (unique.length < 6) return unique;
    const byX = [...unique].sort((a, b) => {
      const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
      return (ar.left + ar.width / 2) - (br.left + br.width / 2);
    });
    const bestSix = byX.length > 6 ? byX.slice(0, 6) : byX;
    const centers = bestSix.map((btn) => { const r = btn.getBoundingClientRect(); return r.left + r.width / 2; });
    let splitIndex = 3, largestGap = -Infinity;
    for (let i = 1; i < centers.length; i++) {
      const gap = centers[i] - centers[i - 1];
      if (gap > largestGap) { largestGap = gap; splitIndex = i; }
    }
    let front = bestSix.slice(0, splitIndex), back = bestSix.slice(splitIndex);
    if (front.length !== 3 || back.length !== 3) { front = bestSix.slice(0, 3); back = bestSix.slice(-3); }
    front.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    back.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    return [...front, ...back];
  }

  function getLiveClassLayout() {
    return getClassButtons().map((btn) => getClassFromButton(btn));
  }

  // "PRESET ALLOCATED 0 / 236.49b" — Core.parseNumber handles the k/m/b/t/…
  // ladder AND the account's own decimal/thousands convention, so this reads
  // the number after the slash without any hand-rolled suffix parsing.
  // THE USABLE PRESET GOLD — "Preset Allocated · <spent> / <total>" on the
  // Fighters page (bundle 2026-09-07: a <p> label, then a <p> holding
  // "<span>spent</span> / <total>"). REPORTED BROKEN 2026-09-21. The likeliest
  // cause is not the page: the total is parsed in the player's number
  // convention, and the convention was being taken from the BROWSER before the
  // game's own setting had rendered (fixed in Core the same day). A browser on
  // 1,000.00 reading a game on 1.000,00 sees "12,34b" as malformed grouping,
  // and parseNumber refuses it, which is correct. So this probe now:
  //   - finds the label structurally, by its own text, and reads the value from
  //     the element after it, falling back to the old page-text scan;
  //   - records WHY it failed in liveBudgetDiag (label not found, no "/ total",
  //     or a total it could not read in the current convention), which the
  //     detection chips show on hover instead of a bare "not read".
  // It still refuses rather than guesses: an unreadable total is null.
  let liveBudgetDiag = { reason: 'not read yet', raw: null };
  function getTotalBudget() {
    const labelEl = [...document.querySelectorAll('p,span,div')]
      .find((el) => el.children.length === 0 && /^preset allocated$/i.test((el.textContent || '').trim()));
    let raw = null;
    if (labelEl) {
      const holder = labelEl.nextElementSibling || (labelEl.parentElement && labelEl.parentElement.nextElementSibling);
      const t = holder ? (holder.textContent || '') : (labelEl.parentElement ? labelEl.parentElement.textContent : '');
      const m = t.match(/\/\s*([\d.,]+\s*[a-z]{0,2})/i);
      if (m) raw = m[1];
    }
    if (raw === null) {
      const pageText = document.body.innerText || '';
      const idx = pageText.toUpperCase().indexOf('PRESET ALLOCATED');
      if (idx === -1) {
        liveBudgetDiag = { reason: 'the "Preset Allocated" line is not on this page', raw: null };
        return null;
      }
      const m = pageText.slice(idx, idx + 300).match(/\/\s*([\d.,]+\s*[a-z]{0,2})/i);
      if (!m) {
        liveBudgetDiag = { reason: 'found "Preset Allocated" but no "/ total" after it', raw: null };
        return null;
      }
      raw = m[1];
    }
    const v = Core.parseNumber(raw.replace(/\s+/g, ''));
    if (!(v && v > 0)) {
      let conv = null;
      try { conv = Core.getNumberConvention ? Core.getNumberConvention() : null; } catch (e) { conv = null; }
      liveBudgetDiag = { raw, reason: `read "${raw}" but it is not a number in your ${conv ? '1' + conv.group + '000' + conv.decimal + '00' : 'current'} format` };
      return null;
    }
    liveBudgetDiag = { raw, reason: '' };
    return v;
  }

  function findStatCard(statName) {
    const cards = [...document.querySelectorAll('div')].filter((el) => text(el).startsWith(statName) && el.querySelector('input'));
    return cards[0] || null;
  }

  function findStatInput(statName) {
    return findStatCard(statName)?.querySelector('input') || null;
  }

  // THE GAME'S OWN TOTAL FOR A STAT, read off the allocation screen.
  //
  // Reported by the user 2026-09-08 and it is the best source available: the
  // number beside each slider shows the GEAR TOTAL when the allocation is 0,
  // and rises as points are added. So it already folds in gear, implicits,
  // enchants and anything else — including sources nobody here has enumerated,
  // which is precisely the failure mode of adding up items by hand.
  //
  // Preferred over the fiber walk for exactly that reason. The fiber read
  // stays as a fallback because this one depends on the card's rendered text,
  // and text layout is the least stable thing on a page we do not own.
  //
  // Parsed by taking the largest number in the card that is NOT the input's
  // own value: the card also contains the allocation number itself, and on a
  // fresh preset both can be present. Uses Core.parseNumber, so it honours the
  // account's decimal convention rather than assuming a locale.
  function readStatTotalFromCard(statName) {
    const card = findStatCard(statName);
    if (!card) return null;
    const input = card.querySelector('input');
    const own = input ? Core.parseNumber(input.value) : null;
    // THE MAGNITUDE SUFFIX MUST TRAVEL WITH THE NUMBER. `Core.parseNumber`
    // understands "744,70k"; a `[\d.,]+` match hands it "744,70" and loses the
    // k — a 1000x error that produces a plausible-looking small number rather
    // than an obvious failure. That is exactly how the first version read a
    // gear Crit Damage of 5,380 against a true value near 10, and then planned
    // 9 Crit Damage points off it.
    const nums = (text(card).match(/\d[\d.,]*\s*[a-z]{0,2}/gi) || [])
      .map((s) => Core.parseNumber(s))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (!nums.length) return null;
    const candidates = nums.filter((n) => own == null || n !== own);
    if (!candidates.length) return null;
    return Math.max(...candidates);
  }

  // Gear contribution = the displayed total minus what the bought points
  // contribute. Floored at 0: negative would mean the two reads disagree, and
  // carrying that into the objective would bias every allocation for that
  // fighter rather than failing visibly.
  // Returns null — REFUSES — rather than clamping, when the displayed total
  // cannot be what it claims to be.
  //
  // The total must at least cover what the bought points alone contribute; a
  // smaller number means the read grabbed some other number on the card, not
  // the total. The first version clamped that case to 0, so a failed read
  // arrived at the optimiser as "this fighter has no gear" — indistinguishable
  // from a true zero, and acted on with full confidence. Wrong gear data is
  // worse than none, because none is at least the plan we already had.
  function gearFromDisplayedTotal(stat, displayedTotal, boughtPoints) {
    if (!Number.isFinite(displayedTotal)) return null;
    const fromPoints = statFinalFromRaw(stat, boughtPoints || 0) - FIGHTER_FLAT_BASE[STAT_KEY[stat] || stat];
    if (displayedTotal < fromPoints) return null;
    return displayedTotal - fromPoints;
  }

  // The slider-filling write this module performs — Assist, not Act
  // (INSTRUMENTATION.md §7): fills a value into a real input the game
  // already renders. By itself it never touches Save; the player commits
  // their own allocation UNLESS they have explicitly opted into auto-save
  // (item 6, Settings tab — see attemptAutoSave()'s own header for the gates
  // that stand between "sliders filled" and "Save clicked"). Ported from the
  // community script's setReactInput, same mechanism (React's own value
  // setter, then input+change events) since it's the part already proven to
  // work reliably against this page.
  function setReactInput(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, String(value));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ==== allocation pacing (item 5, Settings tab) ====
  //
  // The fill loop clicks a fighter, waits for the SPA to re-render, writes
  // each of the 6 sliders with a short wait between them, then waits once
  // more before moving to the next fighter. REPORTED: "feels very slow"
  // running all 6 fighters end to end — the old numbers alone (before
  // verification or Save even start) added up to 700+6*250+400=2600ms per
  // fighter, 15.6s total. These sleeps only exist to give the page a chance
  // to catch up between writes; verifyAppliedValues() below is what actually
  // PROVES each value landed, so a faster pace that occasionally races ahead
  // of a slow render is CAUGHT there, not silently trusted — that is what
  // justifies a faster DEFAULT rather than leaving the original, more
  // conservative numbers as the default forever.
  //
  // `slow` is the ORIGINAL, live-proven pacing verbatim, kept as the
  // fallback for anyone whose page can't keep up with `fast` — copied, not
  // re-derived, so it can never accidentally drift from the numbers this
  // module actually shipped with for months.
  const ALLOCATE_PACING = {
    fast: { selectMs: 300, statMs: 100, settleMs: 150 },
    slow: { selectMs: 700, statMs: 250, settleMs: 400 },
  };
  function allocatePacing() {
    return ALLOCATE_PACING[moduleSettings.allocatePace === 'slow' ? 'slow' : 'fast'];
  }

  // Fills every matched position's 6 stat inputs. Non-World-Boss profiles
  // (or a World-Boss profile applied at a different budget than it was
  // saved at) are rescaled via the same sqrt relationship the community
  // script uses, so a shared plan behaves identically in both tools.
  // shouldAbort() is checked once per fighter — the Stop button during an
  // allocation; the whole thing is quick, so a per-fighter grain is enough,
  // it never leaves a fighter half-filled.
  async function applyResolved(matched, profile, liveButtons, budgetB, log, shouldAbort) {
    const pace = allocatePacing();
    for (const { class: cls, index } of matched) {
      if (shouldAbort && shouldAbort()) throw new Error('Stopped.');
      const fighterStats = profile.stats[cls];
      liveButtons[index].closest('div')?.click();
      if (log) log(`Selecting ${cls}…`);
      await sleep(pace.selectMs);
      for (const stat of STATS) {
        const input = findStatInput(stat);
        if (!input) throw new Error(`Could not find the ${stat} input for ${cls} — the page layout may have changed.`);
        const target = scaleLevel(fighterStats[stat], budgetB, profile.sourceBudgetB || budgetB);
        setReactInput(input, target);
        await sleep(pace.statMs);
      }
      await sleep(pace.settleMs);
    }
  }

  // ==== UI ====

  const ui = {};
  let windowHandle = null;
  let panelOpen = false;
  let liveBudgetB = null;
  let liveLayout = [];

  function refreshLiveReads() {
    liveBudgetB = getTotalBudget();
    liveLayout = getLiveClassLayout();
  }

  function categoryBadge(category) {
    const span = document.createElement('span');
    span.textContent = category;
    // A pill in the Neutral role: a category, not a judgement.
    span.className = 'awoo-fighter-allocator-type';
    return span;
  }

  // "7 Sept" — day + abbreviated month, no year (a saved-plans list doesn't
  // span years in practice, and the fuller date is one hover away via the
  // title attribute set where this is used).
  function formatShortDate(ms) {
    if (!ms) return '—';
    const d = new Date(ms);
    return `${d.getDate()} ${d.toLocaleDateString(undefined, { month: 'short' })}`;
  }

  const INLINE_EDIT_INPUT_CSS = 'width:100%; font: inherit; font-size:var(--awoo-fs-control); box-sizing:border-box; '
    + 'background: var(--awoo-input, var(--input)); color: var(--awoo-foreground, var(--foreground)); '
    + 'border: 1px solid var(--awoo-border, var(--border)); border-radius:var(--awoo-r-sm); padding:3px 5px;';

  // A square icon action button for the table's actions column — Allocate/
  // Share stay as their own labelled/icon buttons (feedback: "Allocate is
  // good", "share is good"); this is for Archive/Delete/Edit/Save/Cancel,
  // which read as too heavy as a third/fourth/fifth text label in a row.
  // Always carries a hover tooltip (data-tooltip, not native title) per
  // "all buttons need hover-over info, especially condensed text or icons".
  function buildIconBtn({ svg, tooltip, danger, onClick }) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'awoo-ui-icon-btn' + (danger ? ' awoo-ui-btn-danger' : '');
    btn.setAttribute('data-tooltip', tooltip);
    btn.setAttribute('data-tooltip-right', '');
    btn.innerHTML = svg;
    btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return btn;
  }
  const ICON = {
    archive: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="12" height="3" rx="0.6"/><path d="M3 6v6.5A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5V6"/><path d="M6.5 8.5h3"/></svg>',
    unarchive: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="12" height="3" rx="0.6"/><path d="M3 6v6.5A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5V6"/><path d="M8 11.5V8m0 0 1.6 1.6M8 8 6.4 9.6"/></svg>',
    trash: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5h10M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M4.5 4.5 5 13a1.2 1.2 0 0 0 1.2 1.1h3.6A1.2 1.2 0 0 0 11 13l.5-8.5"/><path d="M6.7 7v4.3M9.3 7v4.3"/></svg>',
    edit: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2.5 13.5 5 5.8 12.7 2.5 13.5l0.8-3.3Z"/></svg>',
    save: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.3 6.3 11.5 13 4"/></svg>',
    cancel: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  };

  // Two shared configs (columns/actions), used for BOTH the active-plans
  // table and the archived one below it — same shape, so they read as one
  // consistent list split by a divider, not two different tables.
  function buildTableColumns() {
    return [
      { key: 'name', label: 'Name', render: (p) => {
        if (ui.editingProfileId === p.id) {
          const input = document.createElement('input');
          input.type = 'text'; input.value = p.name; input.style.cssText = INLINE_EDIT_INPUT_CSS;
          input.addEventListener('input', () => { ui.editDraft.name = input.value; });
          input.addEventListener('click', (e) => e.stopPropagation());
          return input;
        }
        const span = document.createElement('span');
        span.textContent = p.name;
        if (p.archived) span.style.opacity = '.55';
        return span;
      } },
      { key: 'category', label: 'Type', render: (p) => {
        if (ui.editingProfileId === p.id) {
          const select = document.createElement('select');
          select.style.cssText = INLINE_EDIT_INPUT_CSS;
          for (const c of CATEGORIES) {
            const opt = document.createElement('option');
            opt.value = c; opt.textContent = c; opt.selected = c === p.category;
            select.appendChild(opt);
          }
          select.addEventListener('change', () => { ui.editDraft.category = select.value; });
          select.addEventListener('click', (e) => e.stopPropagation());
          return select;
        }
        return categoryBadge(p.category);
      } },
      { key: 'classLayout', label: 'Classes (1→6)', info: 'Left Top → Left Middle → Left Bottom → Right Top → Right Middle → Right Bottom, the order fighters are attacked in.',
        render: (p) => {
          // Abbreviated, with the full name on Core's own tooltip rather than
          // a native title -- this project replaced title on condensed UI so
          // there is one hover mechanism, and Core's appears immediately where
          // the native one lags about a second.
          const names = (p.classLayout && p.classLayout.length)
            ? p.classLayout : Object.keys(p.stats);
          const wrap = document.createElement('span');
          wrap.className = 'awoo-fighter-allocator-classes';
          names.forEach((n, i) => {
            if (i) wrap.appendChild(document.createTextNode(' '));
            const el = document.createElement('span');
            el.className = 'awoo-fighter-allocator-class';
            el.textContent = abbrevClass(n);
            el.setAttribute('data-tooltip', `${POSITIONS[i] || 'Position ' + (i + 1)} — ${n}`);
            wrap.appendChild(el);
          });
          return wrap;
        } },
      { key: 'source', label: 'Source', render: (p) => {
        if (ui.editingProfileId === p.id) {
          const input = document.createElement('input');
          input.type = 'text'; input.value = p.source || ''; input.style.cssText = INLINE_EDIT_INPUT_CSS;
          input.addEventListener('input', () => { ui.editDraft.source = input.value; });
          input.addEventListener('click', (e) => e.stopPropagation());
          return input;
        }
        const span = document.createElement('span');
        span.textContent = p.source || '';
        return span;
      } },
      { key: 'updatedAt', label: 'Updated', render: (p) => {
        if (ui.editingProfileId === p.id) {
          const input = document.createElement('input');
          input.type = 'date';
          input.value = p.updatedAt ? new Date(p.updatedAt).toISOString().slice(0, 10) : '';
          input.style.cssText = INLINE_EDIT_INPUT_CSS;
          input.addEventListener('input', () => {
            ui.editDraft.updatedAt = input.value ? new Date(input.value).getTime() : undefined;
          });
          input.addEventListener('click', (e) => e.stopPropagation());
          return input;
        }
        const span = document.createElement('span');
        span.textContent = formatShortDate(p.updatedAt);
        span.title = p.updatedAt ? new Date(p.updatedAt).toLocaleString() : '';
        return span;
      } },
    ];
  }

  function saveProfileEdit(p) {
    const draft = ui.editDraft || {};
    const fields = {
      name: (draft.name !== undefined ? draft.name : p.name).trim() || p.name,
      category: draft.category !== undefined ? draft.category : p.category,
      source: draft.source !== undefined ? draft.source : p.source,
    };
    if (draft.updatedAt !== undefined) fields.updatedAt = draft.updatedAt;
    updateProfileFields(p.id, fields);
    ui.editingProfileId = null;
    ui.editDraft = null;
    rerenderProfiles();
    Core.toast('Plan updated.', { type: 'success', duration: 2500 });
  }

  function buildRowActions() {
    return [
      { render: (p) => {
        if (ui.editingProfileId === p.id) {
          return buildIconBtn({ svg: ICON.save, tooltip: 'Save changes', onClick: () => saveProfileEdit(p) });
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        // A plain button, not primary: one per ROW made the table a column of
        // accent fills, which is why nothing in this window stood out. The
        // window's one primary is Optimize, in the header.
        btn.className = 'awoo-ui-btn';
        btn.textContent = 'Allocate';
        btn.addEventListener('click', () => loadProfileFlow(p));
        return btn;
      } },
      { render: (p) => {
        if (ui.editingProfileId === p.id) {
          return buildIconBtn({
            svg: ICON.cancel, tooltip: 'Cancel',
            onClick: () => { ui.editingProfileId = null; ui.editDraft = null; rerenderProfiles(); },
          });
        }
        return buildIconBtn({
          svg: ICON.edit, tooltip: 'Edit name / type / source / date',
          onClick: () => { ui.editingProfileId = p.id; ui.editDraft = {}; rerenderProfiles(); },
        });
      } },
      { render: (p) => {
        if (ui.editingProfileId === p.id) return document.createElement('span'); // keeps column count stable while editing
        return buildIconBtn({
          svg: p.archived ? ICON.unarchive : ICON.archive,
          tooltip: p.archived ? 'Unarchive' : 'Archive',
          onClick: () => { setArchived(p.id, !p.archived); rerenderProfiles(); },
        });
      } },
      { render: (p) => {
        if (ui.editingProfileId === p.id) return document.createElement('span');
        return buildIconBtn({
          svg: ICON.trash, tooltip: 'Delete', danger: true,
          onClick: async () => {
            const ok = await Core.ui.confirmDialog({
              title: 'Delete plan', danger: true, confirmLabel: 'Delete',
              message: `Delete "${p.name}" permanently? This cannot be undone.`,
            });
            if (ok) { deleteProfileHard(p.id); rerenderProfiles(); }
          },
        });
      } },
      // Far-right, deliberately an icon not a label: sharing one plan out is
      // a much rarer action than Allocate/Edit/Archive/Delete.
      { render: (p) => (ui.editingProfileId === p.id ? document.createElement('span') : buildShareButton(p)) },
    ];
  }

  // Archived plans are visually distinct (dimmed name, above) AND physically
  // separated — their own table below a divider, not interleaved with active
  // plans, per explicit feedback.
  function renderProfileTable() {
    const wrap = document.createElement('div');
    const active = profiles.filter((p) => !p.archived);
    const archived = profiles.filter((p) => p.archived);
    const columns = buildTableColumns();
    const rowActions = buildRowActions();
    const rowClass = (p) => (p.id === currentPlanId ? 'awoo-ui-row-current' : '');
    const table = Core.ui.table({ columns, rows: active, rowActions, rowClass });
    padWithGhostRows(table, columns.length + 1, active.length);
    wrap.appendChild(table);
    if (ui.showArchived && archived.length) {
      wrap.appendChild(buildArchivedDivider(archived.length));
      wrap.appendChild(Core.ui.table({ columns, rows: archived, rowActions, rowClass }));
    }
    return wrap;
  }

  // REDESIGNED 2026-09-08 — reported "too fragmented, needs to be thinner and
  // less fragmented". The old version was a border-top rule with an uppercase
  // label sitting BELOW it as its own line — two visual fragments (a rule,
  // then a caption) reading as two things instead of one divider. This is a
  // single element: one thin 1px rule with the label sitting ON it
  // (::before/::after fill the space either side, in the .awoo-fighter-allocator-divider
  // rule below), all on design tokens so it stays "obviously a separator"
  // without adding a new opacity/font-size literal.
  function buildArchivedDivider(count) {
    const divider = document.createElement('div');
    divider.className = 'awoo-fighter-allocator-divider';
    divider.textContent = `Archived (${count})`;
    return divider;
  }

  // Placeholder rows up to a resting count. Not decoration: without them an
  // empty plan list renders a header with nothing underneath, which reads as a
  // broken table rather than an empty one — and a table that grows from zero
  // resizes the whole panel the moment you add your first plan.
  // Was 5 — reported "the plans table should be longer by default even when
  // empty... looks stubby". Raised alongside .awoo-fighter-allocator-table-scroll's
  // min-height (buildPanelContent's <style>) so the resting shape actually
  // reads as deliberate; the max-height SCROLL CEILING there is unchanged.
  const RESTING_ROWS = 8;
  function padWithGhostRows(table, colCount, realRows) {
    const body = table.querySelector('tbody');
    if (!body) return;
    for (let i = realRows; i < RESTING_ROWS; i++) {
      const tr = document.createElement('tr');
      tr.className = 'awoo-fighter-allocator-ghost';
      for (let c = 0; c < colCount; c++) tr.appendChild(document.createElement('td'));
      body.appendChild(tr);
    }
  }

  // THE PLAN IN USE (2026-09-21, the "less bland" pass). The last plan whose
  // allocation verified on target is marked as the table's current row, so the
  // window says at a glance which build your fighters are wearing — state in
  // the table itself, not an extra headline above it (this window's subject is
  // the table, so it still has no answer band; DESIGN.md §3).
  const CURRENT_KEY = `awoo:${MODULE_ID}:current`;
  let currentPlanId = null;
  let currentPlanAt = null;
  try {
    const raw = localStorage.getItem(CURRENT_KEY);
    if (raw && raw.charAt(0) === '{') { const o = JSON.parse(raw); currentPlanId = o.id || null; currentPlanAt = o.at || null; }
    else currentPlanId = raw;
  } catch (e) { /* none */ }
  function markCurrentPlan(id) {
    currentPlanId = id;
    currentPlanAt = Date.now();
    try { localStorage.setItem(CURRENT_KEY, JSON.stringify({ id, at: currentPlanAt })); } catch (e) { /* not durable, still shown */ }
    rerenderProfiles();
    renderInUse();
  }

  function rerenderProfiles() {
    if (!ui.profileTableContainer) return;
    ui.profileTableContainer.innerHTML = '';
    ui.profileTableContainer.appendChild(renderProfileTable());
    if (ui.tableHint) {
      // With no plans at all this line IS the empty state — there was none
      // before, at all. With some, it stays as the answer to "how do I add
      // another", which is the question the blank space raises.
      const n = profiles.filter((p) => !p.archived).length;
      if (ui.planCount) ui.planCount.textContent = n ? String(n) : '';
      ui.tableHint.textContent = n === 0
        ? 'No plans yet. Optimize for World Boss, or Import one.'
        : 'Optimize for World Boss, or Import, to add another.';
    }
  }

  // ==== status bar — the bottom-of-window progress/result line for Allocate ====
  // TWO SURFACES, BECAUSE THEY ARE TWO DIFFERENT THINGS.
  //
  // `ambient` is state AT REST — which page you are on, what gold was read. It
  // is true continuously, it is re-derived on every poll, and writing it into
  // an event log would bury the events under a hundred identical lines. It
  // gets a quiet context line that is simply overwritten.
  //
  // Everything else is an EVENT: it happened once, at a time, and the user
  // wants the record. That goes to Core's activity strip, where the level
  // carries the meaning (a verification mismatch is `failed` and names both
  // numbers; the user pressing Stop is `stopped`, not a failure).
  //
  // Keeping ONE setStatus() signature is deliberate: every existing call site
  // already passes the right level, so the routing lands without touching
  // twelve call sites and inventing twelve chances to mislabel one.
  function setStatus(message, level) {
    if (level === 'ambient') {
      if (ui.contextLine) ui.contextLine.textContent = message;
      return;
    }
    const lvl = level === 'error' ? 'failed' : level === 'success' ? 'done' : 'info';
    say(lvl, message);
  }

  // say(level, text) — the one call site for "tell the user what happened".
  // Guarded: an older Core beneath a newer module is a state real users reach,
  // and a module must never fail because its feedback surface is missing.
  function say(level, text) {
    if (activity && typeof activity[level] === 'function') activity[level](text);
  }

  function reportState(state, detail) {
    if (typeof Core.setState === 'function') Core.setState(MODULE_ID, state, detail || '');
  }

  let allocateAbort = false;
  let activity = null; // Core.ui.activity(...) — this module's record of what it did

  // "Allocate" — the ONE action that touches the game page. Verifies it's on
  // the right page, resolves classes against the LIVE formation (order-
  // independent), fills every slider, then RE-READS each one to confirm the
  // page actually reflects the target — an internal check that doesn't
  // depend on guessing the shape of the game's own save-confirmation toast —
  // plus a best-effort watch for that toast too, since a real "the game
  // itself agrees" signal is worth having when it's there. Save Preset is
  // still the PLAYER'S to press (CLAUDE.md rule 4) UNLESS auto-save is
  // explicitly turned on in Settings — see attemptAutoSave(), reached only
  // after verification is clean.
  async function loadProfileFlow(profile) {
    refreshLiveReads();
    setStatus(`Loading "${profile.name}"…`, 'info');
    if (!liveBudgetB) {
      setStatus('Could not read your usable preset gold — open the Fighters page first.', 'error');
      return;
    }
    const buttons = getClassButtons();
    if (buttons.length !== 6) {
      setStatus(`Expected 6 fighter slots, found ${buttons.length} — open the Fighters page first.`, 'error');
      return;
    }
    const resolution = resolveProfileAgainstLayout(profile, liveLayout);
    if (resolution.duplicatesOnPage.length) {
      const ok = await Core.ui.confirmDialog({
        title: 'Duplicate class detected',
        message: `Your formation has more than one ${resolution.duplicatesOnPage.join(', ')} — class-based matching is `
          + `ambiguous here. Continue anyway (first match wins), or cancel and fix your formation?`,
        confirmLabel: 'Continue anyway', danger: true,
      });
      if (!ok) { setStatus('Cancelled — duplicate class in your formation.', 'error'); return; }
    }
    if (resolution.unmatched.length) {
      const ok = await Core.ui.confirmDialog({
        title: 'Some classes not found',
        message: `This plan includes ${resolution.unmatched.join(', ')}, not present in your current formation. `
          + `Load anyway, skipping those?`,
        confirmLabel: 'Load anyway',
      });
      if (!ok) { setStatus('Cancelled — some classes were not in your formation.', 'error'); return; }
    }
    if (!resolution.matched.length) {
      setStatus('Nothing to load — no classes in this plan matched your current formation.', 'error');
      return;
    }
    allocateAbort = false;
    if (ui.stopAllocateBtn) ui.stopAllocateBtn.hidden = false;
    reportState('running', 'allocating');
    try {
      setStatus(`Filling sliders for ${resolution.matched.length} fighter(s)…`, 'info');
      await applyResolved(resolution.matched, profile, buttons, liveBudgetB,
        (msg) => setStatus(msg, 'info'), () => allocateAbort);

      setStatus('Verifying every slider landed on target…', 'info');
      const mismatches = await verifyAppliedValues(resolution.matched, profile, buttons, liveBudgetB);
      if (mismatches.length) {
        setStatus(`Filled, but ${mismatches.length} value(s) don't match what was requested — `
          + `${mismatches.slice(0, 3).map((m) => `${m.class} ${m.stat}: wanted ${m.want}, page shows ${m.got}`).join('; ')}. `
          + `Check before pressing Save Preset.`, 'error');
        reportState('problem', 'check sliders');
        return;
      }
      setStatus('All sliders confirmed on target.', 'success');
      markCurrentPlan(profile.id);

      // OPT-IN, off by default (moduleSettings.autoSavePreset — Settings tab,
      // item 5/6). See attemptAutoSave()'s own header for every gate and why
      // each exists; this only ever gets HERE, past a clean verification,
      // which is itself the first of those gates.
      const autoSaved = moduleSettings.autoSavePreset ? await attemptAutoSave(profile) : false;
      if (!autoSaved) {
        setStatus('Press Save Preset in-game to commit — watching for confirmation…', 'info');
        const sawSaveToast = await watchForSaveConfirmation(SAVE_CONFIRMATION_WATCH_MS);
        setStatus(sawSaveToast
          ? '✓ Successfully saved — the game confirmed it.'
          : `Sliders are set and verified — press Save Preset in-game if you haven't yet `
            + `(no in-game confirmation seen within ${SAVE_CONFIRMATION_WATCH_MS / 1000}s, but the values on the page are correct).`,
        sawSaveToast ? 'success' : 'info');
      }
    } catch (err) {
      console.error('[fighter-allocator]', err);
      // The user pressing Stop is not a failure, and flattening the two into
      // one red line loses the distinction that matters when you look back at
      // what happened: `stopped` is you, `failed` is the tool.
      if (err.message === 'Stopped.') {
        say('stopped', 'Allocation stopped by you — some fighters may be partly filled, check before Save Preset.');
      } else {
        setStatus(String(err.message || err), 'error');
      }
    } finally {
      if (ui.stopAllocateBtn) ui.stopAllocateBtn.hidden = true;
      reportState('idle', '');
    }
  }

  // Re-reads every filled stat input's CURRENT value and compares against
  // what applyResolved was asked to set — independent of trusting the fill
  // mechanism worked, and independent of the game's own toast wording.
  // FIXED 2026-09-08 — this was reporting mismatches that were not real.
  //
  // It clicked a fighter and read the inputs IMMEDIATELY. The page is an SPA:
  // the click schedules a re-render, it does not perform one. So the read
  // landed on whatever was still on screen — the PREVIOUS fighter's values —
  // and every fighter after the first was compared against its neighbour.
  //
  // The user's report is the proof: "Bastion Damage: wanted 3256, page shows
  // 3250" while Berserker's Damage was 3250, and "Bastion Crit Damage: wanted
  // 2278, page shows 2287" while Berserker's was 2287. Neighbouring fighters
  // have near-identical allocations, which is exactly why this looked like a
  // rounding problem rather than a stale read — and why the allocation was
  // always correct when checked by hand afterwards.
  //
  // The fix is not a fixed sleep. It POLLS until the field reaches the value
  // just written, with a timeout, so a genuine mismatch is still reported —
  // a fixed delay would only make the race less likely, and this check exists
  // precisely to be trusted before someone presses Save Preset.
  async function verifyAppliedValues(matched, profile, liveButtons, budgetB) {
    const mismatches = [];
    for (const { class: cls, index } of matched) {
      const fighterStats = profile.stats[cls];
      liveButtons[index].closest('div')?.click();

      for (const stat of STATS) {
        const want = scaleLevel(fighterStats[stat], budgetB, profile.sourceBudgetB || budgetB);
        let got = null;
        let input = null;
        // ~1.2s of patience, checked often. Settles in one or two ticks in the
        // normal case, so this costs nothing when the page is keeping up.
        for (let attempt = 0; attempt < 24; attempt++) {
          input = findStatInput(stat);
          if (input) {
            got = Core.parseNumber(input.value);
            if (got === want) break;
          }
          // eslint-disable-next-line no-await-in-loop
          await sleep(50);
        }
        if (!input) continue;
        if (got !== want) mismatches.push({ class: cls, stat, want, got });
      }
    }
    return mismatches;
  }

  // Best-effort, short-lived watch for the game's OWN save-confirmation
  // toast — scans newly-added elements for wording like "saved"/"success".
  // Not load-bearing: verifyAppliedValues() above is the real confirmation,
  // this is a bonus signal when the game's own UI happens to say so too.
  function watchForSaveConfirmation(timeoutMs) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (done) return; done = true; obs.disconnect(); clearTimeout(timer); resolve(v); };
      const obs = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            const t = (node.textContent || '').toLowerCase();
            if (/\b(saved|success)/.test(t) && t.length < 200) { finish(true); return; }
          }
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      const timer = setTimeout(() => finish(false), timeoutMs);
    });
  }

  // STREAMLINED 2026-09-08 — reported "feels very slow": this watch was
  // always only a BONUS signal (see the comment above; verifyAppliedValues
  // is the real proof the values are correct), so it never needed to hold
  // the status line for 15s on the common case where the game's own toast
  // either shows within a second or two or never shows at all (different
  // wording, or none — both are equally likely given the toast text is
  // unconfirmed, per archive/HANDOFF.md). 5s stays generous next to how fast the
  // community script's own toast reportedly appears.
  const SAVE_CONFIRMATION_WATCH_MS = 5000;

  // Reads BOTH sides of "PRESET ALLOCATED X / Y" — getTotalBudget() above
  // only ever wanted Y (the usable total, for the optimiser's budget math);
  // the auto-save gate below needs X too, because it is the one number that
  // says whether what was just filled is something the GAME itself would
  // consider affordable, independent of trusting our own arithmetic to have
  // reproduced that correctly.
  function getAllocatedAndBudget() {
    const pageText = document.body.innerText || '';
    const idx = pageText.toUpperCase().indexOf('PRESET ALLOCATED');
    if (idx === -1) return null;
    const section = pageText.slice(idx, idx + 300);
    const m = section.match(/PRESET ALLOCATED\s*([\d.,]+\s*[a-z]{0,2})\s*\/\s*([\d.,]+\s*[a-z]{0,2})/i);
    if (!m) return null;
    const allocated = Core.parseNumber(m[1].replace(/\s+/g, ''));
    const budget = Core.parseNumber(m[2].replace(/\s+/g, ''));
    if (!(budget > 0) || !(allocated >= 0)) return null;
    return { allocated, budget };
  }

  // Locates the game's own "Save Preset" button by its rendered text — same
  // approach as getClassFromButton, because nothing here has a stable
  // selector to key off. UNVERIFIED against a live page, same as the rest of
  // this file's DOM layer (archive/HANDOFF.md) — flagged, not hidden, and exactly
  // why attemptAutoSave() below refuses cleanly rather than clicking blind
  // when this comes back null.
  function findSavePresetButton() {
    return [...document.querySelectorAll('button')].find((btn) => /save preset/i.test(text(btn))) || null;
  }

  // ==== item 6: opt-in auto-save — press Save Preset ourselves ====
  //
  // CLAUDE.md rule 4: "never act on the live account — the player presses
  // the button." This function is the one place in the whole module that
  // would violate that if it fired wrong, so it is OFF by default
  // (moduleSettings.autoSavePreset, set only from the Settings tab) and
  // every gate below is a REFUSAL rather than a best-effort: failing any one
  // of them stops the click and falls back to the ordinary manual-save path
  // exactly as if the setting were off, rather than clicking anyway and
  // hoping the rest was fine.
  //
  // THE GATES, AND WHY EACH ONE EXISTS:
  //  1. Every slider already verified on target. Enforced by the CALLER —
  //     this is only ever reached from loadProfileFlow's branch where
  //     `mismatches.length === 0` — restated here as a comment (not a
  //     redundant re-check) so this function's contract still reads
  //     correctly in isolation, per the task's own "at minimum" requirement.
  //  2. The budget line must be freshly READABLE, not merely readable
  //     earlier in this run. Everything before this point ran seconds ago;
  //     a live account's gold is exactly the kind of thing that can move
  //     underneath a multi-second fill loop (another tab spending it, a
  //     passive-income tick). This refuses rather than falling back to the
  //     STALE liveBudgetB captured at the start of the run — CLAUDE.md rule
  //     3, absent rather than defaulted.
  //  3. What the GAME now says is allocated must not exceed what the GAME
  //     now says is available (with a tiny epsilon — both numbers come from
  //     TEXT the game already rounded for display, e.g. "236.49b", so the
  //     last significant digit is display noise, not a real overspend).
  //     Deliberately the game's own two numbers compared to EACH OTHER, not
  //     our computed target compared to our computed budget — our
  //     arithmetic could be internally consistent and still disagree with
  //     what the page actually reflects, and this is the one check that
  //     does not trust our own math to catch that.
  //  4. The 6 formation slots must still be on screen. An SPA navigation
  //     between finishing verification and this call (the user clicking
  //     away, a route change mid-flow) would otherwise mean "click whatever
  //     is now at these coordinates" — the same class of risk the geometry
  //     heuristic in getClassButtons already has to guard against.
  //  5. (Checked first, R22.) An optimiser plan must have been made from
  //     read inputs — autoSaveReadRefusal(). The sliders can be exactly on
  //     target and the target still wrong, and no page check sees that.
  //
  // Any refusal is SAID (DESIGN.md §5 — a refusal is a result, and it is
  // shown), then falls through to the manual watch, so turning this setting
  // on can never make the outcome WORSE than leaving it off.
  const AUTO_SAVE_OVERSPEND_EPSILON = 1.0005;
  async function attemptAutoSave(profile) {
    const readRefusal = autoSaveReadRefusal(profile);
    if (readRefusal) {
      say('refused', readRefusal);
      return false;
    }
    const budgetInfo = getAllocatedAndBudget();
    if (!budgetInfo) {
      say('refused', 'Auto-save is on, but the preset budget line could not be re-read just now — press Save Preset yourself.');
      return false;
    }
    if (budgetInfo.allocated > budgetInfo.budget * AUTO_SAVE_OVERSPEND_EPSILON) {
      say('refused', `Auto-save is on, but the page shows ${Core.formatNumber(budgetInfo.allocated)} allocated `
        + `against a ${Core.formatNumber(budgetInfo.budget)} budget — refusing to click Save rather than trust `
        + `that. Check the page before saving.`);
      return false;
    }
    if (getClassButtons().length !== 6) {
      say('refused', 'Auto-save is on, but the 6 fighter slots are no longer on screen — press Save Preset yourself.');
      return false;
    }
    const saveBtn = findSavePresetButton();
    if (!saveBtn) {
      say('refused', 'Auto-save is on, but the Save Preset button could not be found — press Save Preset yourself.');
      return false;
    }
    saveBtn.click();
    setStatus('Save Preset clicked — watching for the game\'s confirmation…', 'info');
    const sawSaveToast = await watchForSaveConfirmation(SAVE_CONFIRMATION_WATCH_MS);
    setStatus(sawSaveToast
      ? '✓ Saved automatically — the game confirmed it.'
      : `Save Preset was clicked, but no in-game confirmation was seen within ${SAVE_CONFIRMATION_WATCH_MS / 1000}s `
        + `— check the page. The sliders were verified correct before saving.`,
    sawSaveToast ? 'success' : 'info');
    return true;
  }

  // REWORKED: was a flat form (boss level / crit chance / gold-per-fighter,
  // all typed in by hand, one "Generate" button) sitting inline in the main
  // panel. Reported as confusing ("Gold/fighter still doesn't make sense to
  // me... everything should be calculated automatically") and it was
  // crowding the profile table, which should be what this window is mostly
  // about. Now: one button here, a dedicated window does the actual work —
  // scan every fighter's gear, compute, ready a profile — and the main
  // panel goes back to being the profile table front and center.
  // Best-effort: scans the page's own rendered text for "Fighter World Boss
  // Level N" (the exact Archive wording) and takes the FIRST match, which is
  // the most recent entry in a list that renders newest-first. Absent rather
  // than defaulted if the Archive isn't the current page/panel — the level
  // field is left for manual entry, never silently guessed.
  function readLatestFighterWorldBossLevel() {
    const text = document.body.innerText || '';
    const m = text.match(/Fighter World Boss Level\s+(\d+)/i);
    return m ? parseInt(m[1], 10) : null;
  }

  // ==== boss-level memory: persisted across sessions, with an HONEST prediction ====
  //
  // Was `let lastKnownBossLevel = null` — in-memory only, so every browser
  // restart threw away the one number the World Boss optimizer window most
  // wants pre-filled, and a returning user had to go re-read it in-game
  // before this module could tell them anything useful. Now stored in this
  // module's own STORAGE_KEY blob alongside `profiles` (flushStore, above).
  //
  // TWO FIELDS, not one, because they answer two different questions:
  //   - `lastKnown` (one value + timestamp) is "the last thing this module
  //     actually read". Updated on EVERY successful read, changed or not —
  //     it is what "last seen 2d ago" reports, and what pre-fills the input.
  //   - `log` (a short history) is "when did the number actually MOVE".
  //     Updated ONLY when the level differs from the last logged entry —
  //     logging every unchanged re-visit would flood it with zero-growth
  //     rows and bias a naive rate estimate toward "no growth" the longer a
  //     session happens to sit open on the archive page.
  function recordBossLevelObservation(level) {
    if (!Number.isFinite(level) || level <= 0) return;
    const now = Date.now();
    bossLevelMemory.lastKnown = { level, atMs: now };
    const log = bossLevelMemory.log || [];
    if (!log.length || log[log.length - 1].level !== level) {
      log.push({ level, atMs: now });
      // Bounded, not for storage's sake, but because a months-old entry
      // would pull a "recent rate" estimate toward a cadence the account may
      // not still have — see predictBossLevelFromLog below.
      while (log.length > 12) log.shift();
    }
    bossLevelMemory.log = log;
    markDirty();
  }

  // PURE, deliberately: given a log and a "now", returns a predicted current
  // level or null — never reads Date.now() itself, so it is directly
  // testable without mocking the clock (userscripts/tests/lib/dom-stub.mjs
  // has no fake timer). predictBossLevel() below is the one real caller.
  //
  // THE PREDICTION IS DELIBERATELY THIN. The only data this project actually
  // has is two or more real observations of a rising number over real time —
  // nothing is known about the game's own boss-progression cadence (weekly
  // reset? per-guild-action? uncapped?), so anything fancier than "the
  // average rate THIS ACCOUNT has actually shown" would be a growth model
  // dressed up as a measurement. CLAUDE.md rule 3: refuse rather than guess.
  // With fewer than two DISTINCT levels logged there is nothing to divide,
  // so this returns null rather than defaulting to some assumed cadence —
  // the task's own instruction, restated as code: "if you cannot justify a
  // prediction from the data actually available, say so and just restore
  // the last value."
  function predictBossLevelFromLog(log, nowMs) {
    if (!Array.isArray(log) || log.length < 2) return null;
    const first = log[0], last = log[log.length - 1];
    const dLevel = last.level - first.level;
    const dMs = last.atMs - first.atMs;
    if (!(dLevel > 0) || !(dMs > 0)) return null; // flat or reversed — nothing to extrapolate
    const ratePerMs = dLevel / dMs;
    const predicted = Math.round(last.level + ratePerMs * (nowMs - last.atMs));
    // Never predicts BELOW the last real observation — a boss level does not
    // go down, so a non-positive-looking result here only means nowMs is at
    // or before the last observation, not a real prediction worth offering.
    return predicted > last.level ? { level: predicted, ratePerDay: ratePerMs * 86400000 } : null;
  }
  function predictBossLevel() {
    return predictBossLevelFromLog(bossLevelMemory.log, Date.now());
  }

  // OBSERVABLE, WHICH IT HAS NEVER BEEN. Both the route string and the
  // "Fighter World Boss Level N" wording come from session notes and have
  // never been confirmed against the real page — and this function used to
  // return silently on every miss: no log, no toast, no status. So a user
  // could not tell "this page had no boss level" from "this has never once
  // worked", which is exactly why it was still unverified after shipping.
  //
  // NOTHING ABOUT THE ROUTE OR THE WORDING IS CHANGED HERE. Guessing at a
  // better guess would just move the unverified claim. What changes is that
  // ONE visit to the page now says which half failed, so the next live session
  // can settle it instead of re-deriving the question.
  let archiveMissSaidFor = null;
  function checkArchivePageForBossLevel() {
    const path = location.pathname;
    const onRoute = path.includes('/world-boss/archive');
    const level = onRoute ? readLatestFighterWorldBossLevel() : null;
    if (level) {
      recordBossLevelObservation(level);
      if (ui.optLevelInput && !ui.optLevelInput.value) ui.optLevelInput.value = String(level);
      renderBossLevelContext(); // no-op if the optimizer window was never built
      if (archiveMissSaidFor !== null) archiveMissSaidFor = null;
      say('done', `World Boss level ${level} picked up from the archive page.`);
      return;
    }
    // Once per path, not once per navigation event: Core's heartbeat re-runs
    // this, and a strip full of the same line is a strip nobody reads.
    if (!onRoute || archiveMissSaidFor === path) return;
    archiveMissSaidFor = path;
    say('refused', `On ${path} but no "Fighter World Boss Level N" text found`
      + ' — boss level not auto-filled. Route matched; the wording may differ.');
  }
  // Route detection belongs to Core (v9's onNavigate), not here. This used to
  // wrap history.pushState/replaceState a SECOND time — Core already wraps
  // both — and run a 2s setInterval beside Core's own 3s heartbeat, so the page
  // carried two independent monkey-patches of the same two globals and this
  // module carried two timers. Core sees every signal this did (its history
  // hook, popstate, and the heartbeat that covers router internals bypassing
  // pushState), so subscribing gets the same coverage with none of the
  // duplication.
  //
  // The old local mechanism survives only as a fallback for an OLDER installed
  // Core: Tampermonkey updates each script separately, so a v8 Core with this
  // module is a real state, and it must degrade rather than go silent.
  function watchForArchivePage() {
    const onNav = () => setTimeout(checkArchivePageForBossLevel, 400); // let the SPA finish rendering the new route first

    if (typeof Core.onNavigate === 'function') {
      Core.onNavigate(onNav);
    } else {
      let lastPath = location.pathname;
      const onNavLegacy = () => {
        if (location.pathname === lastPath) return;
        lastPath = location.pathname;
        onNav();
      };
      try {
        const origPush = history.pushState.bind(history);
        history.pushState = function (...args) { const r = origPush(...args); onNavLegacy(); return r; };
        const origReplace = history.replaceState.bind(history);
        history.replaceState = function (...args) { const r = origReplace(...args); onNavLegacy(); return r; };
      } catch (e) { /* read-only history in some contexts — the poll below still covers it */ }
      window.addEventListener('popstate', onNavLegacy);
      setInterval(onNavLegacy, 2000);
    }

    checkArchivePageForBossLevel(); // covers a fresh load landing directly on the archive page
  }

  // REPLACES a broken page-text scan (confirmed live 2026-09-07: every
  // fighter came back "could not read" — clicking a formation slot shows
  // the stat-allocation panel, not gear text, exactly as archive/HANDOFF.md's own
  // unverified-DOM-layer note predicted). Traced the REAL data shape from
  // the client bundle instead of guessing again (capture/raw bundle chunks
  // FighterEquipmentHoverCard-DCxqO59W.js / EquipmentCard-BTjWQlQe.js /
  // CharacterDataProvider-CoFUkJx8.js, 2026-09-07): an equipped item is
  // `{ _id, stats: [{type, value, tier, placement}, ...], ... }`, and Crit
  // Chance is just one array entry with `type === "fighterCritChance"` — no
  // dedicated field, no page text guaranteed to exist at all.
  //
  // Reads it via the SAME React-fiber-walk technique already used elsewhere
  // in this codebase (Core.walkFiber/probeCharacter) rather than a new
  // mechanism — `Core.walkFiberAll` (visits every match, doesn't stop at the
  // first) so multiple equipped items each contributing Crit Chance are
  // summed, not just the first one found. De-duplicates by the item's own
  // `_id` so re-scanning after another click can never double-count the
  // same item still resolved in the tree from before.
  //
  // UNVERIFIED end to end: the bundle confirms the SHAPE, not that this
  // data is actually reachable in the fiber tree from a plain formation-slot
  // click with nothing hovered (per the bundle trace, it may only resolve
  // while a specific item is being hovered, or a gear-selection modal is
  // open) — needs a live pass to confirm whether clicking alone is enough,
  // or whether hovering each equipped item first will be needed too.
  // ── THE WHOLE ASSEMBLED FIGHTER STAT BLOCK, NOT JUST CRIT CHANCE ────────
  //
  // Added 2026-09-08 after the user asked whether the optimiser accounts for
  // gear. It did not — and worse, it passed `currentHitRaw/Damage/CritDamage:
  // 0` hardcoded, so it planned every fighter as if they were naked with zero
  // purchased points. That is wrong in a way that changes the ANSWER, not just
  // the reported numbers: expected damage is
  //   hit(H_total) x D_total x (1 + critChance x CD_total)
  // and each total is gear + base + purchased. A fighter already carrying a
  // large gear Damage bonus gets proportionally less from buying more Damage,
  // which shifts the optimal split toward Crit Damage — and vice versa. Gear
  // Hit likewise reduces how many Hit points buy a given hit chance.
  //
  // SHAPE, traced from the shipped bundle (CODE-tier, 2026-09-07 capture):
  // `simulator.worker-B9yF9GIb.js` and `page-c4WAz33r.js` both carry the
  // fighter object's schema —
  //   { class, placement:{row,column}, stats: { health, healthMax, defense,
  //     damage, dodge, hit, critDamage, fighterMultistrike?,
  //     fighterCritChance?, fighterThorns?, fighterLifesteal?, fighterRegen?,
  //     fighterHealing? } }
  // Note which names are which: the BASE stats are plain (`hit`, `damage`,
  // `critDamage`); only the fighter-specific percentage stats carry the
  // `fighter` prefix. Looking for `fighterDamage` or `fighterHit` finds
  // nothing, because they do not exist.
  //
  // This is the fighter's TOTAL, already including gear, implicits and
  // purchased points — which is better than summing individual items, because
  // it cannot miss a source nobody thought to enumerate.
  // CORRECTED 2026-09-08, ON LIVE OUTPUT. The first version of this looked for
  // the fighter's ASSEMBLED stat block — `{ class, stats: { health, damage,
  // hit, critDamage, ... } }` — a shape that genuinely exists in the bundle
  // (`simulator.worker`, `page-c4WAz33r.js`). It reported "gear NOT read" for
  // all six fighters on a real account: that object is BUILT when submitting to
  // the simulator, it does not sit in React state waiting to be walked.
  //
  // What demonstrably IS reachable is the equipped ITEM, because the Crit
  // Chance read has been doing it successfully on this account all along.
  // So this generalises the mechanism already proven to work rather than
  // guessing at a third shape.
  //
  // ITEM SHAPE, from the bundle:
  //   { _id, name, rarity, iLevel, virtue,
  //     stats:     [{ type, tier, value }],
  //     implicits: [{ type, tier, value }] }
  // `value` is the RESOLVED amount, so item level and tier are already baked
  // into it — reading `value` is reading the gear's real contribution, which
  // is what the question "does it account for equipment level?" is asking.
  //
  // Base stat types are plain (`hit`, `damage`, `critDamage`); only the
  // fighter-specific percentage stats carry the `fighter` prefix. There is no
  // `fighterDamage` or `fighterHit` — grepping the bundle for them finds
  // nothing.
  const GEAR_STAT_TYPES = Object.freeze(['hit', 'damage', 'critDamage', 'fighterCritChance']);

  // THE TIER MULTIPLIER, WITHOUT WHICH EVERY GEAR READ IS SILENTLY TOO SMALL.
  //
  // An item's fiber `value` is the BASE ROLL, not what the game shows. The
  // displayed number is `value x (1 + boostPercent[tier]/100)`. Confirmed
  // three independent ways against one live item, 2026-09-08 — the user
  // supplied the rendered equipment card and the fiber dump for the same gear:
  //
  //   Damage      T16   267,668  x 4.50  = 1,204,506   card: "1,20m"
  //   Hit         T16   641,654  x 4.50  = 2,887,443   card: "2,89m"
  //   CritChance  T12   0.07127  x 3.50  = 0.24945     card: "24,95%"
  //
  // Three stats, two different tiers, all matching to display precision. That
  // is what makes this CROSS-tier rather than a plausible-looking guess.
  //
  // The consequence is not cosmetic: the scan had been reporting this account's
  // Crit Chance as 17.13% when it is ~34.95%, and every gear Hit/Damage figure
  // at between a fifth and a quarter of its real value.
  function equipmentTierMultiplier(tier) {
    const pct = EQUIPMENT_TIER_BOOST_PERCENT[(tier || 1) - 1];
    // Unknown tier -> 1x rather than 0x or a guess: an unrecognised tier should
    // under-report by the multiplier, never erase the stat entirely.
    return pct == null ? 1 : 1 + pct / 100;
  }

  // A PASTE-BACK PROBE, in the same spirit as `__awooDiag()` and
  // `__awooWhereIsTheNav()`. Two attempts at reading gear have now been made
  // from bundle-traced shapes, and one of them found nothing live. Rather than
  // guess a third time, this reports what the fiber walk ACTUALLY contains so
  // the next attempt is aimed at something real.
  //
  // Deliberately plain text and deliberately global: it is for pasting back,
  // not for programs. Open a fighter first so their gear is rendered.
  window.__awooFighterProbe = function () {
    const out = ['--- AWOO+ Fighter Allocator: gear probe ---'];
    if (!Core.walkFiberAll) {
      out.push('Core.walkFiberAll is missing — update AWOO+.');
      const t = out.join('\n'); console.log(t); return t;
    }
    const shapes = new Map();
    let objects = 0;
    Core.walkFiberAll((cand) => {
      if (!cand || typeof cand !== 'object') return false;
      objects++;
      if (!Array.isArray(cand.stats)) return false;
      // Summarise by the SET of stat types it carries, so a hundred items
      // collapse into a handful of distinct shapes.
      const types = [...new Set(cand.stats.map((s) => s && s.type).filter(Boolean))].sort();
      const key = types.join(',') || '(no typed stats)';
      const rec = shapes.get(key) || { count: 0, sample: null };
      rec.count++;
      if (!rec.sample) {
        rec.sample = {
          keys: Object.keys(cand).slice(0, 12),
          firstStat: cand.stats[0] || null,
          implicits: Array.isArray(cand.implicits) ? cand.implicits.length : 'absent',
          iLevel: cand.iLevel ?? 'absent',
        };
      }
      shapes.set(key, rec);
      return false; // never stop; we want the whole picture
    });
    out.push(`objects visited: ${objects}`);
    out.push(`distinct stat-array shapes: ${shapes.size}`);
    for (const [types, rec] of shapes) {
      out.push(`\n  x${rec.count}  types: ${types}`);
      out.push(`      keys: ${rec.sample.keys.join(', ')}`);
      out.push(`      iLevel: ${rec.sample.iLevel}  implicits: ${rec.sample.implicits}`);
      out.push(`      first stat entry: ${JSON.stringify(rec.sample.firstStat)}`);
    }
    const scan = scanEquippedStatsViaFiber();
    out.push(`\nwhat the fiber item-scan makes of it: ${scan ? JSON.stringify(scan) : 'NOTHING FOUND'}`);
    if (scan && scan.items <= 2) {
      out.push('  NOTE: that is one or two ITEMS, not the whole loadout. The fiber only');
      out.push('  holds the card currently rendered, so this is a floor, never a total.');
    }

    // The allocation cards, verbatim. This is the half that decides whether
    // gear can be read at all, and every failure so far has been a parsing
    // failure rather than a missing element — so show the raw text, what was
    // tokenised out of it, and what each step concluded.
    out.push('\n--- allocation cards (the "page totals" source) ---');
    for (const stat of ['Hit', 'Damage', 'Crit Damage']) {
      const card = findStatCard(stat);
      if (!card) { out.push(`\n  ${stat}: NO CARD FOUND`); continue; }
      const input = card.querySelector('input');
      const raw = text(card);
      const tokens = raw.match(/\d[\d.,]*\s*[a-z]{0,2}/gi) || [];
      out.push(`\n  ${stat}:`);
      out.push(`    raw text: ${JSON.stringify(raw.slice(0, 220))}`);
      out.push(`    input value: ${JSON.stringify(input ? input.value : null)}`
        + ` -> parsed ${input ? Core.parseNumber(input.value) : 'n/a'}`);
      out.push(`    tokens -> parsed: ${tokens.map((t) => `${JSON.stringify(t)}=${Core.parseNumber(t)}`).join(', ') || '(none)'}`);
      const total = readStatTotalFromCard(stat);
      const bought = input ? Core.parseNumber(input.value) : 0;
      out.push(`    chosen total: ${total}`);
      out.push(`    points contribute: ${statFinalFromRaw(stat, bought || 0) - FIGHTER_FLAT_BASE[STAT_KEY[stat] || stat]}`);
      out.push(`    => gear: ${gearFromDisplayedTotal(stat, total, bought || 0) ?? 'REFUSED (total is below what the points alone contribute)'}`);
    }
    out.push('--- end ---');
    const text = out.join('\n');
    console.log(text);
    return text;
  };

  function scanEquippedStatsViaFiber() {
    if (!Core.walkFiberAll) return null;
    const seenItemIds = new Set();
    const sums = { hit: 0, damage: 0, critDamage: 0, fighterCritChance: 0 };
    let items = 0;
    Core.walkFiberAll((cand) => {
      if (!cand || !Array.isArray(cand.stats)) return false;
      const id = cand._id;
      if (id != null && seenItemIds.has(id)) return false;
      // Implicits count too: they are on the same item and contribute the same
      // way. Reading only `stats` would silently undercount every item that
      // carries one.
      const rows = cand.stats.concat(Array.isArray(cand.implicits) ? cand.implicits : []);
      let matched = false;
      for (const s of rows) {
        if (!s || typeof s.value !== 'number' || !GEAR_STAT_TYPES.includes(s.type)) continue;
        sums[s.type] += s.value * equipmentTierMultiplier(s.tier);
        matched = true;
      }
      if (!matched) return false;
      if (id != null) seenItemIds.add(id);
      items++;
      return true;
    });
    return items ? { ...sums, items } : null;
  }

  function scanEquippedCritChanceViaFiber() {
    if (!Core.walkFiberAll) return null;
    const seenItemIds = new Set();
    let sum = 0;
    let found = false;
    Core.walkFiberAll((cand) => {
      if (!cand || !Array.isArray(cand.stats)) return false;
      const id = cand._id;
      if (id != null && seenItemIds.has(id)) return false;
      const entry = cand.stats.find((s) => s && s.type === 'fighterCritChance');
      if (!entry || typeof entry.value !== 'number') return false;
      if (id != null) seenItemIds.add(id);
      sum += entry.value;
      found = true;
      return true;
    });
    if (!found) return null;
    // UNVERIFIED UNIT ASSUMPTION: treating entry.value as a decimal fraction
    // (0.125 = 12.5%), matching how this repo represents Crit Chance
    // everywhere else (fighters.critChance.base = 0.1). If the raw API
    // value turns out to be percent-scaled instead (12.5, not 0.125), this
    // undercounts by 100x — the sanity check below at least surfaces that
    // rather than silently trusting an implausible total.
    const total = 0.1 + sum; // fighters.critChance.base
    if (total > 5) {
      console.warn(`[fighter-allocator] scanned Crit Chance ${total} looks implausibly high — `
        + `entry.value may be percent-scaled, not a fraction. Treating as unreliable.`);
      return null;
    }
    return total;
  }

  // Best-effort FALLBACK, kept because it's cheap and harmless even though
  // it was confirmed broken from the formation view specifically: scans the
  // page's rendered text for every "Critical hit chance" row and sums the
  // percentages that follow it, plus the 0.1 base. Only ever reached if the
  // fiber-based reader above finds nothing.
  function scanEquippedCritChanceViaPageText() {
    const text = document.body.innerText || '';
    const matches = [...text.matchAll(/Critical hit chance[^%\d]*(\d[\d.,]*)\s*%/gi)];
    if (!matches.length) return null;
    let sum = 0.1; // fighters.critChance.base
    for (const m of matches) {
      const plain = Core.parseNumber(m[1]); // Core.parseNumber has no % handling - the % was stripped by the regex, scale here
      if (plain !== null) sum += plain / 100;
    }
    return sum;
  }

  function scanEquippedCritChance() {
    return scanEquippedCritChanceViaFiber() ?? scanEquippedCritChanceViaPageText();
  }

  // ==== the World Boss optimizer window ====
  //
  // UNVERIFIED DOM LAYER, flagged rather than hidden: this clicks each of
  // the 6 formation buttons in turn (the SAME click already proven to work
  // in applyResolved/verifyAppliedValues, reused rather than a new
  // mechanism), waits for the page to react, then runs the existing
  // page-text Crit Chance scan against whatever that click revealed. It
  // assumes clicking a fighter's slot shows enough of their equipped-gear
  // text to match "Critical hit chance" rows — that assumption is carried
  // over from the ORIGINAL single-fighter manual scan, never confirmed
  // against a page where every fighter was visited automatically this way.
  // Needs a live pass on test.v2.queslar.com before trusting the numbers
  // for a real allocation.
  let optimizerHandle = null;
  let optimizerAbort = false;
  let optimizerRunning = false;
  // A finished calculation, waiting on the user's explicit "Add to profile
  // list" — set by runWorldBossOptimization(), consumed (and cleared) by
  // the Add button in buildOptimizerContent(). Cleared on abort too, so a
  // stopped run never leaves a stale pending result sitting behind an Add
  // button that would push the WRONG (incomplete) plan.
  let pendingOptimizerResult = null;

  function openWorldBossOptimizer() {
    if (!optimizerHandle) {
      optimizerHandle = Core.createWindow({
        id: 'fighter-allocator-optimizer', title: 'Optimize for World Boss',
        // RESIZED 2026-09-08 — reported: pressing Start reveals more reasoning
        // log than the old fixed 420x440 box could show, forcing a scroll
        // mid-run. 'both' (was `false`) plus a taller floor so a full
        // 6-fighter scan+plan fits without scrolling at the default size —
        // see buildOptimizerContent()'s log element for the other half of
        // this (max-height removed, flex:1 instead, so it keeps growing with
        // whatever size the user drags this to).
        resizable: 'both', alwaysOnTop: true, minSize: { w: 480, h: 560 }, persistGeometry: false,
      });
      optimizerHandle.setContent(buildOptimizerContent());
    }
    refreshLiveReads();
    renderOptimizerBudgetLine();
    if (ui.optLevelInput && !ui.optLevelInput.value) {
      // Prefer a fresh live read over persisted memory — if we happen to
      // already be sitting on the archive page, that number needs no "how
      // stale" caveat. Either way it becomes a real observation.
      const live = readLatestFighterWorldBossLevel();
      if (live) recordBossLevelObservation(live);
      const level = live || (bossLevelMemory.lastKnown && bossLevelMemory.lastKnown.level);
      if (level) ui.optLevelInput.value = String(level);
    }
    renderBossLevelContext();
    optimizerHandle.open();
  }

  function buildOptimizerContent() {
    const wrap = document.createElement('div');
    // flex:1 + min-height:0: this is the ONLY child of the window's own
    // flex-column body (.awoo-window-body, core.js), so giving it flex:1
    // lets it actually EXPAND to fill the window instead of sizing to its
    // own content — which is what lets the log below grow with the window
    // rather than being capped (item 2: the window is resizable now).
    wrap.style.cssText = 'display:flex; flex-direction:column; gap:var(--awoo-s4); flex:1; min-height:0;';

    const intro = document.createElement('div');
    intro.style.cssText = 'font-size:var(--awoo-fs-control); opacity:var(--awoo-em-normal); line-height:1.4;';
    intro.textContent = 'Opens each fighter in turn to read their equipped Crit Chance, then computes '
      + 'the exact Hit target for this boss level and the optimal Damage/Crit Damage split with '
      + 'whatever gold remains — automatic, split evenly across your 6 fighters. Needs the Fighters '
      + 'page open.';
    wrap.appendChild(intro);

    const levelRow = Core.ui.inputRow({
      label: 'Boss level', type: 'number', value: '',
      info: 'bossDodge(level) = 50×level below level 600 (exact past that too, via the same '
        + 'breakpoint formula the game uses for monster generation). Contingent on an INFER-tier '
        + 'assumption that the Fighter World Boss reuses that generation pipeline — not yet '
        + 'HAR-confirmed. Auto-filled from the World Boss Archive page; edit freely.',
      onChange: () => {},
    });
    wrap.appendChild(levelRow);
    ui.optLevelInput = levelRow._input;

    // Item 1: where the pre-filled level came from, and — only when there is
    // real history to justify one — a clearly separate SUGGESTION next to it,
    // never applied to the field automatically. See recordBossLevelObservation/
    // predictBossLevelFromLog above for why this refuses more often than not.
    const levelContext = document.createElement('div');
    levelContext.style.cssText = 'font-size:var(--awoo-fs-caption); opacity:var(--awoo-em-muted); '
      + 'display:flex; align-items:center; gap:var(--awoo-s3); flex-wrap:wrap;';
    wrap.appendChild(levelContext);
    ui.optLevelContext = levelContext;

    const budgetLine = document.createElement('div');
    budgetLine.style.cssText = 'font-size:var(--awoo-fs-control); opacity:var(--awoo-em-normal);';
    wrap.appendChild(budgetLine);
    ui.optBudgetLine = budgetLine;

    // THE MAX-HEIGHT WAS THE REAL CULPRIT (item 2): 190px capped this to
    // under 8 lines no matter how much room the window actually had, so
    // pressing Start on a real 6-fighter run always overflowed it. flex:1
    // lets the log claim whatever space the window (now resizable) isn't
    // using for the fixed rows around it; min-height is only the floor for a
    // freshly-opened, un-resized window.
    const log = document.createElement('div');
    log.style.cssText = 'font-size:var(--awoo-fs-control); border:1px solid var(--awoo-border, var(--border)); '
      + 'border-radius:var(--awoo-r-md); padding:var(--awoo-s3) var(--awoo-s4); min-height:220px; flex:1; '
      + 'overflow-y:auto; background: var(--awoo-input, var(--input)); white-space:pre-wrap;';
    log.textContent = 'Ready.';
    wrap.appendChild(log);
    ui.optLog = log;

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex; gap:8px;';
    const startBtn = document.createElement('button');
    startBtn.type = 'button'; startBtn.className = 'awoo-ui-btn awoo-ui-btn-primary';
    startBtn.textContent = 'Start';
    startBtn.addEventListener('click', () => runWorldBossOptimization());
    const stopBtn = document.createElement('button');
    stopBtn.type = 'button'; stopBtn.className = 'awoo-ui-btn awoo-ui-btn-danger';
    stopBtn.textContent = 'Stop';
    stopBtn.disabled = true;
    stopBtn.title = 'Stops after the fighter currently being scanned — nothing is generated from a stopped run.';
    stopBtn.addEventListener('click', () => { optimizerAbort = true; });
    btnRow.appendChild(startBtn);
    btnRow.appendChild(stopBtn);
    wrap.appendChild(btnRow);
    ui.optStartBtn = startBtn;
    ui.optStopBtn = stopBtn;

    // The "add to profile list" step — hidden until a run finishes, so
    // nothing gets pushed into the table without a deliberate confirm. Name
    // is editable here (category/source/classes match the profile table's
    // own columns, but only name makes sense to change before it even
    // exists — the others are set from what was actually detected).
    const resultRow = document.createElement('div');
    resultRow.hidden = true;
    resultRow.className = 'awoo-fighter-allocator-group';
    resultRow.style.cssText += 'flex-direction:row; align-items:center; gap:8px;';
    const resultNameInput = document.createElement('input');
    resultNameInput.type = 'text';
    resultNameInput.style.cssText = 'flex:1; font: inherit; font-size:var(--awoo-fs-body); background: var(--awoo-input, var(--input)); '
      + 'color: var(--awoo-foreground, var(--foreground)); border: 1px solid var(--awoo-border, var(--border)); '
      + 'border-radius:var(--awoo-r-sm); padding:4px 7px;';
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'awoo-ui-btn awoo-ui-btn-primary';
    addBtn.textContent = 'Add to profile list';
    addBtn.addEventListener('click', () => {
      if (!pendingOptimizerResult) return;
      const name = resultNameInput.value.trim() || 'World Boss plan';
      const draft = makeProfile({
        name, category: 'World Boss',
        classLayout: pendingOptimizerResult.classLayout,
        stats: pendingOptimizerResult.stats,
        sourceBudgetB: pendingOptimizerResult.sourceBudgetB,
        source: 'You',
        meta: pendingOptimizerResult.meta,
      });
      upsertProfile(draft);
      rerenderProfiles();
      optLog(`Added "${draft.name}" to your plans below. Press Allocate on it when ready.`);
      say('done', `Plan "${draft.name}" added from the World Boss optimiser.`);
      Core.toast(`Added "${draft.name}".`, { type: 'success', duration: 5000 });
      pendingOptimizerResult = null;
      resultRow.hidden = true;
    });
    resultRow.appendChild(resultNameInput);
    resultRow.appendChild(addBtn);
    wrap.appendChild(resultRow);
    ui.optResultRow = resultRow;
    ui.optResultName = resultNameInput;

    return wrap;
  }

  function renderOptimizerBudgetLine() {
    if (!ui.optBudgetLine) return;
    ui.optBudgetLine.textContent = liveBudgetB
      ? `Usable preset gold: ${Core.formatNumber(liveBudgetB)} (${Core.formatNumber(liveBudgetB / 6)} / fighter, split evenly)`
      : 'Usable preset gold: not read — open the Fighters page first.';
  }

  // "2d ago" / "5h ago" / "just now" — coarse on purpose, matching the
  // activity strip's own agoText() one level up: nobody needs second-level
  // precision for "when did I last see this".
  function formatRelativeAgo(ms) {
    if (!(ms >= 0)) return 'just now';
    const mins = ms / 60000;
    if (mins < 1) return 'just now';
    if (mins < 60) return `${Math.round(mins)}m ago`;
    const hours = mins / 60;
    if (hours < 48) return `${Math.round(hours)}h ago`;
    return `${Math.round(hours / 24)}d ago`;
  }

  // Renders "last seen"/"predicted" beside the Boss level field. Never
  // touches ui.optLevelInput.value itself — the prediction is offered via
  // its own button (below), which the user has to press. That is what makes
  // it a suggestion and not a silent guess (item 1's explicit requirement).
  function renderBossLevelContext() {
    const el = ui.optLevelContext;
    if (!el) return;
    el.innerHTML = '';
    const known = bossLevelMemory.lastKnown;
    if (!known) {
      el.textContent = 'No boss level remembered yet — visit the World Boss Archive page once, or enter it below.';
      return;
    }
    const seen = document.createElement('span');
    seen.textContent = `Last seen: level ${known.level}, ${formatRelativeAgo(Date.now() - known.atMs)}.`;
    el.appendChild(seen);

    const prediction = predictBossLevel();
    if (!prediction) return; // not enough real history to justify one — say nothing rather than guess
    const predSpan = document.createElement('span');
    predSpan.textContent = `Predicted now: ~${prediction.level} `
      + `(from your own history, ~${prediction.ratePerDay.toFixed(1)}/day) —`;
    el.appendChild(predSpan);
    const useBtn = document.createElement('button');
    useBtn.type = 'button';
    useBtn.className = 'awoo-ui-btn';
    useBtn.textContent = `Use ${prediction.level}`;
    useBtn.title = 'Fills the field with the predicted level — a suggestion from your own observed history, '
      + 'never applied automatically.';
    useBtn.addEventListener('click', () => {
      if (ui.optLevelInput) ui.optLevelInput.value = String(prediction.level);
    });
    el.appendChild(useBtn);
  }

  function optLog(msg) {
    if (!ui.optLog) return;
    ui.optLog.textContent += '\n' + msg;
    ui.optLog.scrollTop = ui.optLog.scrollHeight;
  }

  async function runWorldBossOptimization() {
    if (optimizerRunning) return;
    refreshLiveReads();
    renderOptimizerBudgetLine();
    const level = Number(ui.optLevelInput && ui.optLevelInput.value);
    if (!Number.isFinite(level) || level <= 0) { Core.toast('Enter a boss level first.', { type: 'error' }); return; }
    if (!liveLayout.length || liveLayout.length !== 6 || liveLayout.some((c) => !c)) {
      Core.toast('Could not read your current 6-fighter formation. Open the Fighters page first.', { type: 'error' });
      return;
    }
    if (!(liveBudgetB > 0)) {
      Core.toast('Could not read your usable preset gold. Open the Fighters page first.', { type: 'error' });
      return;
    }
    const buttons = getClassButtons();
    if (buttons.length !== 6) {
      Core.toast(`Expected 6 fighter slots, found ${buttons.length}.`, { type: 'error' });
      return;
    }

    optimizerRunning = true;
    optimizerAbort = false;
    pendingOptimizerResult = null;
    if (ui.optResultRow) ui.optResultRow.hidden = true;
    ui.optStartBtn.disabled = true;
    ui.optStopBtn.disabled = false;
    ui.optLog.textContent = 'Scanning 6 fighters for equipped Crit Chance…';

    const perFighterGold = liveBudgetB / 6;
    const critByClass = {};
    const gearByClass = {};
    const boughtByClass = {};
    let stopped = false;
    for (let i = 0; i < 6; i++) {
      if (optimizerAbort) { stopped = true; break; }
      const cls = liveLayout[i];
      optLog(`Opening ${cls} (${i + 1}/6)…`);
      buttons[i].closest('div')?.click();
      await sleep(700);
      if (optimizerAbort) { stopped = true; break; }
      // The whole assembled stat block, which includes gear, implicits and
      // whatever is already bought — not just Crit Chance. See
      // scanEquippedStatsViaFiber for the bundle-traced item shape and why
      // ignoring gear changes the ANSWER rather than only the reported totals.
      // Points already bought, read from the game's own allocation inputs —
      // the same boxes the allocator later fills. Reported so a run says what
      // it actually saw rather than implying it started from nothing.
      const bought = {};
      for (const stat of ['Hit', 'Damage', 'Crit Damage']) {
        const input = findStatInput(stat);
        const v = input ? Core.parseNumber(input.value) : null;
        bought[stat] = Number.isFinite(v) ? v : 0;
      }
      boughtByClass[cls] = bought;

      // TWO SOURCES, EACH FOR WHAT IT IS ACTUALLY GOOD AT. Not a preference
      // order — a division of labour, and the reason is structural.
      //
      //  * BASE STATS (Hit, Damage, Crit Damage) come from the number the game
      //    displays beside each allocation slider. At 0 allocation that number
      //    IS the gear total, and it rises as points are added. It therefore
      //    already folds in gear, implicits, enchants and any source nobody
      //    here has enumerated — which is the exact failure mode of adding up
      //    items by hand.
      //
      //  * FIGHTER-PREFIXED STATS (fighterCritChance, and multistrike/thorns/
      //    lifesteal if they ever matter here) CANNOT come from that number,
      //    and this is the correction the user supplied: a slider total can
      //    only show a stat that HAS a slider. An implicit granting thorns or
      //    crit chance is real, contributes, and appears nowhere on the
      //    allocation screen. Those must come from the item scan, which is
      //    also the read already proven to work live.
      //
      // So the fiber scan runs ALWAYS, not just as a fallback — an earlier
      // draft only ran it when the card read failed, which would have silently
      // dropped Crit Chance on every account where the cards read fine.
      const viaFiber = scanEquippedStatsViaFiber();

      const fromCards = {};
      let cardsOk = true;
      for (const [stat, key] of [['Hit', 'hit'], ['Damage', 'damage'], ['Crit Damage', 'critDamage']]) {
        const total = readStatTotalFromCard(stat);
        const g = gearFromDisplayedTotal(stat, total, bought[stat]);
        if (g == null) { cardsOk = false; break; }
        fromCards[key] = g;
      }

      // FIBER FIRST, reversed 2026-09-08 on evidence. The card-text read was
      // preferred for one build because it is the game's own total — but on a
      // live account it produced a gear Crit Damage of 5,380 against a true
      // value near 48, by picking the wrong number out of the card's text.
      // The fiber read, once the tier multiplier is applied, reproduces the
      // rendered card to display precision on three stats across two tiers.
      //
      // Structure beats text scraping when the structure is verified: the card
      // read stays as a fallback, but it is the one that has been wrong.
      if (viaFiber) gearByClass[cls] = { ...viaFiber, source: `${viaFiber.items} item(s) via fiber` };
      else if (cardsOk) gearByClass[cls] = { ...fromCards, source: 'page totals (fiber found nothing)' };

      // When the item scan read this fighter's gear, its Crit Chance sum IS a
      // read, zero included: the items were seen and none carries any. Before
      // R22 a zero here fell through to scanEquippedCritChance(), which finds
      // nothing on such a fighter, and the unread-becomes-0.1 default hid it.
      // Now that an unread Crit Chance refuses the plan, falling through would
      // refuse every fighter with no crit gear. The same >5 guard as
      // scanEquippedCritChanceViaFiber applies, for the same unit doubt.
      const fiberCrit = viaFiber ? 0.1 + viaFiber.fighterCritChance : null; // fighters.critChance.base + gear
      const found = fiberCrit != null && fiberCrit <= 5 ? fiberCrit : scanEquippedCritChance();
      critByClass[cls] = found;

      const g = gearByClass[cls];
      optLog(found !== null
        ? `  ${cls}: ${(found * 100).toFixed(2)}% Crit Chance`
          + (g
            ? `, gear (${g.source}): Hit ${Core.formatNumber(Math.round(g.hit))} / Damage ${Core.formatNumber(Math.round(g.damage))} / Crit Dmg ${Core.formatNumber(Math.round(g.critDamage))}`
            : ', gear NOT read')
          + (bought.Hit || bought.Damage || bought['Crit Damage']
            ? `, already bought H${Core.formatNumber(bought.Hit)}/D${Core.formatNumber(bought.Damage)}/C${Core.formatNumber(bought['Crit Damage'])}` : '')
        : `  ${cls}: could not read Crit Chance${g ? '' : ' or gear'}.`);
    }

    if (stopped) {
      optLog('Stopped — no plan generated.');
      optimizerRunning = false;
      ui.optStartBtn.disabled = false;
      ui.optStopBtn.disabled = true;
      return;
    }

    const plan = planWorldBoss({ layout: liveLayout, level, perFighterGold, critByClass, gearByClass });
    if (plan.refused) {
      // R22: said in three places on purpose — the log is where the run is
      // read, the toast is what is seen, and the activity record is what is
      // looked back at. A refusal is a result (DESIGN.md §5).
      const reason = `No plan: could not read ${describeReadGaps(plan.refused)}. `
        + 'Open each named fighter so their gear is on screen, then run it again.';
      optLog(reason);
      Core.toast(reason, { type: 'error' });
      say('refused', reason);
      optimizerRunning = false;
      ui.optStartBtn.disabled = false;
      ui.optStopBtn.disabled = true;
      return;
    }

    optLog('Computing optimal allocation…');
    const stats = {};
    for (const cls of liveLayout) {
      const critChance = critByClass[cls];
      const alloc = plan.allocs[cls];
      stats[cls] = Object.assign(emptyStatBlock(), {
        Hit: alloc.hitRaw, Damage: alloc.damageRaw, 'Crit Damage': alloc.critDamageRaw,
      });
      // Show the actual reasoning per fighter, not just the final numbers —
      // which target it aimed for, whether the budget covered it, and what
      // crit chance the split was computed against.
      // REWRITTEN 2026-09-08 — the old line described an algorithm that no
      // longer exists. It said "Hit target X (fully covered) -> Y raw Hit.
      // Remainder: ...", which is the buy-Hit-first-then-split strategy that
      // was replaced precisely because it was wrong. A log that narrates a
      // superseded method is worse than no log: it reads as confirmation.
      optLog(`  ${cls}: ${Core.formatNumber(alloc.hitRaw)} Hit / ${Core.formatNumber(alloc.damageRaw)} Damage / `
        + `${Core.formatNumber(alloc.critDamageRaw)} Crit Damage `
        + `→ ${(alloc.achievedHitChance * 100).toFixed(1)}% hit chance`
        + (alloc.stoppedBelowCap
          ? ` (deliberately below the ${(0.95 * 100).toFixed(0)}% cap — a Hit point there is worth zero, damage still pays)`
          : ' (at the cap)')
        + `. Crit Chance ${(critChance * 100).toFixed(2)}%, gear included.`);
    }
    // Pending, not pushed yet — the calculation is done, but "add to profile
    // list" is now its own explicit step rather than happening automatically.
    // The date already shows in the table's own Updated column, so the
    // default name doesn't repeat it.
    pendingOptimizerResult = {
      classLayout: liveLayout.slice(), stats, sourceBudgetB: liveBudgetB,
      meta: { bossLevel: level, critByClass, gearByClass },
    };
    if (ui.optResultName) ui.optResultName.value = `World Boss L${level}`;
    if (ui.optResultRow) ui.optResultRow.hidden = false;
    optLog('Done. Review the plan above, then "Add to profile list" when you\'re happy with it.');

    optimizerRunning = false;
    ui.optStartBtn.disabled = false;
    ui.optStopBtn.disabled = true;
  }

  function copyOrPrompt(build) {
    let text;
    try { text = build(); } catch (err) { Core.toast(String(err.message || err), { type: 'error' }); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => Core.toast('Copied to clipboard.', { type: 'success', duration: 2500 }),
        () => prompt('Copy this:', text),
      );
    } else {
      prompt('Copy this:', text);
    }
  }

  // The table row's far-right action: a small square icon button instead of
  // a third text label next to Allocate/Archive/Delete — sharing one plan
  // out is rarer than those three and doesn't need equal visual weight.
  // Opens a tiny anchored menu (Core.ui.menu) rather than the full Import/
  // Export window, since from a row the only thing this SPECIFIC plan needs
  // is exporting it, in one format or the other — importing a new plan
  // stays on the toolbar button (openImportExportModal(null)), and "Import
  // OVER this profile" is still reachable from there too.
  function buildShareButton(profile) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'awoo-ui-icon-btn';
    btn.setAttribute('data-tooltip', 'Export / share this plan');
    btn.setAttribute('data-tooltip-right', '');
    btn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" '
      + 'stroke-linecap="round" stroke-linejoin="round"><circle cx="12.5" cy="3.5" r="1.8"/>'
      + '<circle cx="3.5" cy="8" r="1.8"/><circle cx="12.5" cy="12.5" r="1.8"/>'
      + '<path d="M5.1 7 11 4.3M5.1 9 11 11.7"/></svg>';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      Core.ui.menu(btn, [
        { label: 'Export — AWOO+ format', onClick: () => copyOrPrompt(() => exportNative(profile)) },
        { label: 'Export — community format', onClick: () => copyOrPrompt(() => exportFriendFormat(profile)) },
        { label: 'Import over this plan…', onClick: () => openImportExportModal(profile) },
      ]);
    });
    return btn;
  }

  // ONE entry point for importing a plan, either creating a new one (from
  // the toolbar, `profile` null) or aimed at an existing one (from a row's
  // share menu's "Import over this plan…", `profile` set — see the NOTE
  // inside promptAndImport below about what that scoping does and doesn't do
  // yet). Always-on-top: a small dialog meant to sit over the main window,
  // not compete with it for focus/z-order.
  //
  // ITEM 7 — USED TO ALSO OFFER EXPORT HERE, gated behind `profile` (enabled
  // when opened from a row, permanently DISABLED with a title="…" when
  // opened from the toolbar). INVESTIGATED rather than patched blind, after
  // being reported as "the Export buttons appear to do nothing":
  //
  //   They were not silently broken — when reachable (profile set) they DID
  //   copy to the clipboard / fall back to a native prompt(), the same
  //   feedback every other export path in this module gives.
  //
  //   The real problem: this modal's OWN surrounding comment already said
  //   export moved to the per-row share menu ("this is ONLY for bringing a
  //   new plan in, hence 'Import' not 'Import/Export'"), and the toolbar
  //   button's label agrees — but this modal was never updated to match, so
  //   it kept a permanently-disabled pair of buttons in the one place most
  //   people actually reach it (the toolbar, where profile is null — "does
  //   nothing" is a fair read of two greyed-out buttons whose only
  //   explanation was a native title tooltip, not this file's own styled
  //   data-tooltip convention), and a working-but-REDUNDANT pair in the one
  //   place they weren't disabled (a row's share menu, which already has its
  //   own direct "Export — AWOO+ format" / "Export — community format" items
  //   ONE CLICK before this modal even opens — see buildShareButton above).
  //
  //   Removed rather than wired up: there was nothing broken to fix, the
  //   working copy was simply pointless. Multi-profile export stays out of
  //   scope, per the standing note above exportFriendFormat.
  let importExportHandle = null;
  function openImportExportModal(profile) {
    if (!importExportHandle) {
      importExportHandle = Core.createWindow({
        id: 'fighter-allocator-import-export',
        title: 'Import a Plan',
        resizable: false,
        alwaysOnTop: true,
        minSize: { w: 380, h: 260 },
        persistGeometry: false,
      });
    }
    const body = document.createElement('div');
    body.style.cssText = 'display:flex; flex-direction:column; gap:10px;';

    function section(label, formatBadge, doImport) {
      const box = document.createElement('div');
      box.className = 'awoo-fighter-allocator-group';
      const head = document.createElement('div');
      head.className = 'awoo-fighter-allocator-group-label';
      head.textContent = label;
      const badge = document.createElement('span');
      badge.style.cssText = 'margin-left:6px; opacity:var(--awoo-em-muted); font-weight:normal; text-transform:none;';
      badge.textContent = formatBadge;
      head.appendChild(badge);
      box.appendChild(head);
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; gap:6px;';
      const importBtn = document.createElement('button');
      importBtn.type = 'button'; importBtn.className = 'awoo-ui-btn';
      importBtn.textContent = 'Import…';
      importBtn.addEventListener('click', doImport);
      row.appendChild(importBtn);
      box.appendChild(row);
      return box;
    }

    const promptAndImport = (parse, label) => () => {
      const raw = prompt(`Paste ${label} JSON:`);
      if (!raw) return;
      try {
        const imported = parse(JSON.parse(raw));
        // FOUND IN PASSING while removing this modal's dead Export buttons,
        // out of scope for this pass: when `profile` is set (opened via
        // "Import over this plan…"), this still creates a brand-new plan via
        // upsertProfile rather than overwriting `profile` — makeProfile
        // always mints a fresh id and nothing here ever reads `profile.id`.
        // The "Scoped to" label below is currently aspirational, not
        // enforced. Flagged rather than silently left for the next person to
        // rediscover.
        upsertProfile(imported);
        rerenderProfiles();
        Core.toast(`Imported "${imported.name}".`, { type: 'success' });
        importExportHandle.close();
      } catch (err) {
        Core.toast(`Import failed: ${err.message}`, { type: 'error', duration: 8000 });
      }
    };

    body.appendChild(section(
      'Fighter Optimizer', '(community script format)',
      promptAndImport((raw) => detectAndNormalizeImport(raw, 'Imported plan'), 'a Fighter Optimizer gold-plan export'),
    ));
    body.appendChild(section(
      'AWOO+ Fighter Allocator', '(this tool\'s own format)',
      promptAndImport((raw) => detectAndNormalizeImport(raw, 'Imported plan'), 'a plan exported from this tool'),
    ));

    if (profile) {
      const label = document.createElement('div');
      label.style.cssText = 'font-size:var(--awoo-fs-control); opacity:var(--awoo-em-muted);';
      label.textContent = `Scoped to: ${profile.name}`;
      body.insertBefore(label, body.firstChild);
    }

    importExportHandle.setContent(body);
    importExportHandle.open();
  }

  // A labelled checkbox for the Settings pane (item 5/6). core.js has its
  // own Core_ui_toggleRow with this exact shape, but it is deliberately NOT
  // exposed on Core.ui (FRAMEWORK.md: nine builders, not a component
  // library) — this mirrors it rather than inventing a different-looking
  // checkbox, so the Settings tab reads as one system.
  function buildToggleRow({ label, info, checked, onChange }) {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex; align-items:center; gap:var(--awoo-s3); '
      + 'font-size:var(--awoo-fs-control); cursor:pointer; margin:var(--awoo-s2) 0;';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!checked;
    input.style.cssText = 'width:13px; height:13px; accent-color: var(--awoo-primary); margin:0;';
    input.addEventListener('change', () => onChange(input.checked));
    const span = document.createElement('span');
    span.textContent = label;
    row.appendChild(input);
    row.appendChild(span);
    if (info && Core.ui && typeof Core.ui.infoIcon === 'function') row.appendChild(Core.ui.infoIcon(info));
    return row;
  }

  function buildPanelContent() {
    const content = document.createElement('div');
    // The shared content root: bands spaced by Core, and a flex column so the
    // plans table (flex:1) takes the window's spare height.
    content.className = 'awoo-ui-stack';
    content.style.flex = '1';
    content.style.minHeight = '0';

    const style = document.createElement('style');
    style.textContent = `
      /* Uses the --awoo-* namespaced tokens (with a raw-var fallback), the
         SAME source Core's own chrome draws from — not the game's raw
         --border/--input/etc directly. REPORTED: the export menu's colors
         "didn't match the theme somehow" — root cause was exactly this
         mismatch: Core's shared components already followed the (once-
         placeholder, now real) snapshot, while this module's own CSS still
         read the game's LIVE variables regardless of the liveAdaptTheme
         setting, so the two could disagree any time they weren't
         coincidentally equal. */
      .awoo-fighter-allocator-group { border: 1px solid var(--awoo-border, var(--border));
        border-radius: var(--awoo-r-md); padding: var(--awoo-s4) 10px;
        display: flex; flex-direction: column; gap: var(--awoo-s3); }
      .awoo-fighter-allocator-group-label { font-weight: 600; opacity: var(--awoo-em-normal);
        text-transform: uppercase; font-size: var(--awoo-fs-caption); letter-spacing: .04em; }
      .awoo-fighter-allocator-count { margin-left: var(--awoo-s3); opacity: var(--awoo-em-muted);
        font-weight: 400; letter-spacing: 0; }
      /* State at rest, not an alert box: which page you are on and what gold
         was read. Events go to the activity strip instead. */
      /* THE DETECTION ROW (2026-09-21): two chips, each with an icon, then the
         plan in use. The chips carry the state, so they are not muted. */
      .awoo-fighter-allocator-detrow { display: flex; align-items: center; gap: var(--awoo-s4); }
      #awoo-fighter-allocator-context { flex: 1; display: flex; align-items: center; gap: var(--awoo-s3);
        min-width: 0; font-size: var(--awoo-fs-control); }
      .awoo-fighter-allocator-det { display: inline-flex; align-items: center; gap: var(--awoo-s2);
        padding: var(--awoo-s1) var(--awoo-s3); border-radius: var(--awoo-r-lg); cursor: help;
        border: 1px solid var(--awoo-border, var(--border)); white-space: nowrap; }
      .awoo-fighter-allocator-det b { font-weight: 600; }
      .awoo-fighter-allocator-det-icon { display: inline-grid; place-items: center; width: 14px; height: 14px;
        border-radius: 50%; font-size: var(--awoo-fs-micro); font-weight: 700; }
      .awoo-fighter-allocator-det-ok { background: var(--awoo-bg-success, transparent);
        border-color: color-mix(in srgb, var(--awoo-success) 35%, transparent); }
      .awoo-fighter-allocator-det-ok .awoo-fighter-allocator-det-icon { background: var(--awoo-success); color: var(--awoo-surface, var(--awoo-card)); }
      .awoo-fighter-allocator-det-miss { background: var(--awoo-bg-danger, transparent);
        border-color: color-mix(in srgb, var(--awoo-danger) 35%, transparent); }
      .awoo-fighter-allocator-det-miss .awoo-fighter-allocator-det-icon { background: var(--awoo-danger); color: var(--awoo-surface, var(--awoo-card)); }
      .awoo-fighter-allocator-inuse { margin-left: auto; opacity: var(--awoo-em-muted); white-space: nowrap;
        overflow: hidden; text-overflow: ellipsis; min-width: 0; }

      /* THE TABLE, made distinct (2026-09-21, "looks too bland"): framed, a
         header band, a faint zebra, and one fixed row height that the resting
         ghost rows share — so the table is the size it will be before the
         first plan lands. Buttons one step lower so a row does not grow to fit
         them. Plan names carry the weight; everything else does not. */
      .awoo-fighter-allocator-table-scroll { border: 1px solid var(--awoo-border, var(--border));
        border-radius: var(--awoo-r-md); }
      .awoo-fighter-allocator-table-scroll .awoo-ui-table th { position: sticky; top: 0; z-index: 1;
        background: var(--awoo-surface-3, var(--awoo-input)); opacity: 1; padding: var(--awoo-s3) var(--awoo-s4); }
      .awoo-fighter-allocator-table-scroll .awoo-ui-table td { height: 32px; padding: 0 var(--awoo-s4); }
      .awoo-fighter-allocator-table-scroll .awoo-ui-table tbody tr:nth-child(even) td {
        background: color-mix(in srgb, var(--awoo-input) 35%, transparent); }
      .awoo-fighter-allocator-table-scroll .awoo-ui-table tbody tr:hover td { background: var(--awoo-input); }
      .awoo-fighter-allocator-table-scroll .awoo-ui-table td:first-child { font-weight: 600; }
      .awoo-fighter-allocator-table-scroll .awoo-ui-btn { padding: 1px var(--awoo-s4); }
      /* The actions cell is a flex row (Core), and flex STRETCHES its children by
         default: the Allocate button grew to the row height and pushed every
         real row 2px taller than the resting rows. Centred, it keeps its own. */
      .awoo-fighter-allocator-table-scroll .awoo-ui-actions { align-items: center; box-sizing: border-box; }
      .awoo-fighter-allocator-table-scroll .awoo-ui-icon-btn { width: 22px; height: 22px; }
      .awoo-fighter-allocator-group-label .awoo-ui-btn { padding: 2px var(--awoo-s4); }
      .awoo-fighter-allocator-type { font-size: var(--awoo-fs-caption); padding: 1px var(--awoo-s3);
        border-radius: var(--awoo-r-lg); background: var(--awoo-bg-neutral, var(--awoo-input));
        color: var(--awoo-neutral, inherit); white-space: nowrap; }

      /* THE TABLE GROWS, THEN SCROLLS.
         Nothing set a height before, so extra window height became blank space
         BELOW the status row rather than around the table, and an empty plan
         list rendered a header with nothing under it at all. Now: a resting
         minimum so the panel never looks broken when nearly empty, growth as
         plans are added, and a scrollbar only once it reaches a generous
         ceiling. The resting height is why adding your first plan replaces a
         ghost row in place instead of resizing the panel. */
      .awoo-fighter-allocator-table-wrap { flex: 1; display: flex; flex-direction: column; min-height: 0; }
      /* min-height raised 148->220 alongside RESTING_ROWS 5->8 (item 3):
         an empty table should read as deliberately spacious, not stubby. The
         SCROLL CEILING (max-height) is untouched on purpose — this only
         changes the floor. */
      .awoo-fighter-allocator-table-scroll { overflow: auto; min-height: 288px; max-height: 420px; flex: 1; }
      /* 288 = the header band plus RESTING_ROWS (8) at the 32px row height, so an
         empty or short table is exactly the size a full screen of plans will be. */
      /* EMPTY, NOT FILLED. These drew a bar per cell tinted from --awoo-border,
         which is a warm brown, so an empty table read as a stack of smudges --
         reported as distracting, and fairly: a placeholder that draws
         something looks like content that failed to load rather than like
         room. The row keeps its height and its separator line, and nothing
         else. The resting count (RESTING_ROWS) is what actually does the work
         here; the bars were never the point. */
      .awoo-fighter-allocator-ghost td { color: transparent; }
      /* Small-caps and tracking so an abbreviation reads as a deliberate
         short form rather than a truncated word. */
      .awoo-fighter-allocator-classes { font-variant: small-caps; letter-spacing: .04em; white-space: nowrap; }
      .awoo-fighter-allocator-class { cursor: help; }
      .awoo-fighter-allocator-class:hover { color: var(--awoo-primary, var(--primary)); }
      .awoo-fighter-allocator-hint { text-align: center; font-size: var(--awoo-fs-caption);
        opacity: var(--awoo-em-muted); padding: var(--awoo-s4) var(--awoo-s2) var(--awoo-s1);
        line-height: 1.5; }
      /* THE ARCHIVED-PLANS DIVIDER (item 4) — one thin rule, label sitting ON
         it via ::before/::after either side, instead of a rule plus a
         separate caption line underneath (the "too fragmented" report). */
      .awoo-fighter-allocator-divider { display: flex; align-items: center; gap: var(--awoo-s3);
        margin: var(--awoo-s5) 0 var(--awoo-s3); font-size: var(--awoo-fs-micro);
        text-transform: uppercase; letter-spacing: .05em; opacity: var(--awoo-em-muted); }
      .awoo-fighter-allocator-divider::before, .awoo-fighter-allocator-divider::after { content: ""; flex: 1; height: 1px;
        background: var(--awoo-border, var(--border)); }
    `;
    document.head.appendChild(style);

    // THE PLANS TABLE IS THE SUBJECT OF THIS WINDOW, so nothing sits above it.
    // The World Boss optimiser used to open the panel with a headline and a
    // primary button, which read as the module's purpose — it is not. It is
    // one of several ways to CREATE a plan, so it belongs in the table's own
    // action row beside Import, at the same weight.
    //
    // Deliberately NO answer band here either. DESIGN.md §3 allows at most one
    // display-scale element per window, not exactly one, and a window whose
    // subject is a table has none — inventing a headline out of whatever
    // number was nearest is how a panel ends up shouting a figure nobody
    // opened it for. The gold reading lives in the context line instead.
    const tableWrap = document.createElement('div');
    tableWrap.className = 'awoo-fighter-allocator-group awoo-fighter-allocator-table-wrap';
    const tableHeading = document.createElement('div');
    tableHeading.className = 'awoo-fighter-allocator-group-label';
    tableHeading.style.cssText += 'display:flex; justify-content:space-between; align-items:center;';
    const tableHeadingLeft = document.createElement('span');
    tableHeadingLeft.textContent = 'Fighter Plans';
    // The count sits in the heading, quietly — how many plans you have is
    // useful at a glance and does not deserve a line of its own.
    const planCount = document.createElement('span');
    planCount.className = 'awoo-fighter-allocator-count awoo-num';
    tableHeadingLeft.appendChild(planCount);
    ui.planCount = planCount;
    tableHeading.appendChild(tableHeadingLeft);

    const tableHeadingRight = document.createElement('span');
    tableHeadingRight.className = 'awoo-ui-actionrow';

    // A button, not a checkbox — subtler color than Import (this is a view
    // filter, not a primary action), text swaps with state instead of a
    // separate label.
    const archivedToggleBtn = document.createElement('button');
    archivedToggleBtn.type = 'button';
    archivedToggleBtn.className = 'awoo-ui-btn';
    function renderArchivedToggleBtn() {
      archivedToggleBtn.textContent = ui.showArchived ? 'Hide archived' : 'Show archived';
    }
    renderArchivedToggleBtn();
    archivedToggleBtn.addEventListener('click', () => {
      ui.showArchived = !ui.showArchived;
      renderArchivedToggleBtn();
      rerenderProfiles();
    });
    tableHeadingRight.appendChild(archivedToggleBtn);

    // Export now lives per-row (the share icon in the far-right column) —
    // this is ONLY for bringing a new plan in, hence "Import" not
    // "Import / Export". A plain text button, not an icon: this button's
    // location was fine, it just read heavier than the table's own text at
    // the dropdown's larger icon-button font.
    const importBtn = document.createElement('button');
    importBtn.type = 'button';
    importBtn.className = 'awoo-ui-btn';
    importBtn.textContent = 'Import';
    importBtn.title = 'Import a plan — Fighter Optimizer format or this tool\'s own';
    importBtn.addEventListener('click', () => openImportExportModal(null));
    tableHeadingRight.appendChild(importBtn);

    // The "+" that used to sit here was permanently disabled behind a
    // "coming soon" tooltip. A control that cannot be used is worse than no
    // control: it occupies the place where a working one would go and teaches
    // people not to look there. It comes back when it does something.
    const wbBtn = document.createElement('button');
    wbBtn.type = 'button';
    wbBtn.className = 'awoo-ui-btn awoo-ui-btn-primary';
    wbBtn.textContent = 'Optimize for World Boss';
    wbBtn.title = 'Scans every fighter\'s equipped Crit Chance, then computes the exact Hit target and '
      + 'Damage/Crit Damage split for the current World Boss level — no manual fields to fill in.';
    wbBtn.addEventListener('click', () => openWorldBossOptimizer());
    tableHeadingRight.appendChild(wbBtn);
    tableHeading.appendChild(tableHeadingRight);
    tableWrap.appendChild(tableHeading);

    const tableContainer = document.createElement('div');
    tableContainer.className = 'awoo-fighter-allocator-table-scroll';
    tableWrap.appendChild(tableContainer);
    ui.profileTableContainer = tableContainer;

    const hint = document.createElement('div');
    hint.className = 'awoo-fighter-allocator-hint';
    tableWrap.appendChild(hint);
    ui.tableHint = hint;

    rerenderProfiles();

    const statusRow = document.createElement('div');
    statusRow.className = 'awoo-fighter-allocator-detrow';
    const contextLine = document.createElement('div');
    contextLine.id = 'awoo-fighter-allocator-context';
    const detFormation = document.createElement('span');
    const detGold = document.createElement('span');
    const inUse = document.createElement('span');
    inUse.className = 'awoo-fighter-allocator-inuse';
    contextLine.appendChild(detFormation);
    contextLine.appendChild(detGold);
    contextLine.appendChild(inUse);
    statusRow.appendChild(contextLine);
    ui.contextLine = contextLine;
    ui.detFormation = detFormation;
    ui.detGold = detGold;
    ui.inUse = inUse;

    const stopAllocateBtn = document.createElement('button');
    stopAllocateBtn.type = 'button';
    stopAllocateBtn.className = 'awoo-ui-btn awoo-ui-btn-danger';
    stopAllocateBtn.textContent = 'Stop';
    stopAllocateBtn.hidden = true;
    stopAllocateBtn.title = 'Stops after the fighter currently being filled — check its sliders before Save Preset.';
    stopAllocateBtn.addEventListener('click', () => { allocateAbort = true; });
    statusRow.appendChild(stopAllocateBtn);
    ui.stopAllocateBtn = stopAllocateBtn;

    // The context line (which page, what gold was read) opens the window
    // rather than trailing the table: it is the state everything below depends
    // on, and at the bottom it sat under a table that can scroll away from it.
    // (appended here rather than inserted before, so it works everywhere a
    // plain appendChild does, the test DOM included)
    content.appendChild(statusRow);
    content.appendChild(tableWrap);

    // Guarded, like every optional Core API: without it the module simply has
    // no strip, rather than failing to start.
    if (Core.ui && typeof Core.ui.activity === 'function') {
      activity = Core.ui.activity({ name: MODULE_ID, max: 6 });
      content.appendChild(activity.el);
    }
    updateAmbientStatus();

    return content;
  }

  // The status bar's IDLE content — page/gold detection, not an action
  // result. setStatus() (used by loadProfileFlow) overwrites this during an
  // actual allocation and callers restore it afterward via this function.
  // THE TWO DETECTIONS, as chips with an icon each (2026-09-21, asked for:
  // "both detections should show with an icon if detected or not"). This used
  // to be one sentence that could only say one thing at a time; allocating
  // needs BOTH, so both are always visible, each with its value or, on hover,
  // exactly why it is missing.
  function detectionChip(el, okNow, label, value, why) {
    if (!el) return;
    el.className = 'awoo-fighter-allocator-det ' + (okNow ? 'awoo-fighter-allocator-det-ok' : 'awoo-fighter-allocator-det-miss');
    el.textContent = '';
    const icon = document.createElement('span');
    icon.className = 'awoo-fighter-allocator-det-icon';
    icon.textContent = okNow ? '\u2713' : '\u2715';
    const name = document.createElement('span');
    name.textContent = label;
    const val = document.createElement('b');
    val.className = 'awoo-num';
    val.textContent = value;
    el.appendChild(icon); el.appendChild(name); el.appendChild(val);
    el.setAttribute('data-tooltip', why);
  }
  function updateAmbientStatus() {
    if (!ui.contextLine) return;
    const found = liveLayout.filter((c) => c).length;
    const onFightersPage = liveLayout.length === 6 && found === 6;
    detectionChip(ui.detFormation, onFightersPage, 'Formation', `${found}/6`,
      onFightersPage ? 'All six fighter slots found on this page.'
        : 'Open the Fighters page: allocating needs all six fighter slots on screen.');
    detectionChip(ui.detGold, !!liveBudgetB, 'Preset gold',
      liveBudgetB ? Core.formatNumber(liveBudgetB) : '—',
      liveBudgetB ? 'Read from "Preset Allocated" on the Fighters page.'
        : `Not read: ${liveBudgetDiag.reason}.`);
    renderInUse();
  }
  function renderInUse() {
    if (!ui.inUse) return;
    const p = profiles.find((x) => x.id === currentPlanId);
    ui.inUse.textContent = p ? `In use: ${p.name}${currentPlanAt ? ' \u00b7 ' + agoShort(currentPlanAt) : ''}` : '';
  }
  function agoShort(ms) {
    const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    const h = Math.round(m / 60);
    return h < 48 ? h + 'h ago' : Math.round(h / 24) + 'd ago';
  }

  function togglePanel(force) {
    const show = force !== undefined ? force : windowHandle.el.hidden;
    if (show) {
      refreshLiveReads();
      updateAmbientStatus();
      windowHandle.open();
    } else {
      // See pet-slot-alarm's identical call: an expanded strip grew the window,
      // and closing while grown persisted that height into saved geometry.
      if (activity && typeof activity.collapse === 'function') activity.collapse();
      windowHandle.close();
    }
    panelOpen = show;
    Core.setOpen(MODULE_ID, show);
  }

  function whenBodyReady(fn) {
    if (document.body) return fn();
    const obs = new MutationObserver(() => { if (document.body) { obs.disconnect(); fn(); } });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  whenBodyReady(bootstrap);

  function bootstrap() {
    loadStore();
    watchForArchivePage();
    const content = buildPanelContent();
    windowHandle = Core.createWindow({
      id: MODULE_ID,
      title: 'Fighter Allocator',
      // REPORTED: vertical-only read as "broken" (drag handle looked
      // draggable in both directions but width never moved) — was originally
      // vertical-only on the theory that the table should drive width, not a
      // drag, but the actions column has grown since (Allocate/Archive/
      // Delete/share-icon) so a user drag is a legitimate way to get more
      // room now too. Capped at the viewport size either way (applyMaxSize).
      resizable: 'both',
      // h bumped 640->680: RESTING_ROWS/table-scroll min-height both grew
      // (item 3, "table should be longer by default even when empty") — this
      // keeps the taller resting table visible without the window body's own
      // overflow:auto kicking in on a freshly-opened, un-resized window.
      //
      // w bumped 640->850 (2026-09-10, REPORTED: rows double-lining at the
      // old width). The Name/Type/Classes(1-6)/Source/Updated/Actions table
      // uses `table-layout:auto` (no fixed column widths), so a name or
      // class list that doesn't fit WRAPS the cell onto a second line
      // instead of growing the table — confirmed directly in a real browser
      // with representative plan names ("World Boss build", "Dungeon push
      // v3"): every row single-lined at 822px, and a longer but still
      // realistic name ("World Boss push (Optimized)", 28 chars — the "a
      // bit more space for naming" ask) still fit at 850px with room to
      // spare. 850 rather than landing exactly on the measured 822 for the
      // same reason `minSize.h` above got real headroom, not just the
      // measured number.
      // HEIGHT RE-MEASURED 2026-09-21 on the redesign, and lowered from 680
      // (reported as too tall): the detection row, the plans table at its
      // resting eight 32px rows, the hint and the activity strip fit in 520
      // with the table at its floor — extra height only ever grew the table.
      // The drag floor is lower still, so a small screen can shrink it.
      defaultSize: { w: 850, h: 520 },
      minSize: { w: 560, h: 420 },
      settingsTab: MODULE_ID, // gear button in the header -> this module's Settings pane, registered below
      content,
      onClose: () => togglePanel(false),
    });

    Core.registerModule({
      id: MODULE_ID,
      label: 'Fighter Allocator',
      shortLabel: 'Fighters',
      description: 'Allocate gold-purchased fighter stats — class-keyed profiles, World Boss math, '
        + 'two-way Fighter Optimizer import/export. Fills and verifies sliders; only clicks Save Preset '
        + 'itself if you opt in from Settings.',
      needsCore: 8, // uses Core.ui.menu (v7) and Core.walkFiberAll (v8)
      // Own pane in Core's shared Settings window (v11: registerModule({settings})
      // + createWindow({settingsTab}), above). Rendered lazily by Core, once,
      // the first time the tab is opened. Degrades cleanly on an older Core —
      // an unknown `settings`/`settingsTab` field is simply ignored, so this
      // module works identically either way, just without the gear button;
      // no needsCore bump for that reason alone (FRAMEWORK.md §5: degrade,
      // never disappear).
      settings: {
        label: 'Fighter Allocator',
        render(container) {
          const speedHead = document.createElement('div');
          speedHead.className = 'awoo-settings-cat';
          speedHead.textContent = 'Allocation speed';
          container.appendChild(speedHead);

          const speedRow = Core.ui.inputRow({
            label: 'Fill pace', type: 'select',
            options: [
              { value: 'fast', label: 'Fast (default)' },
              { value: 'slow', label: 'Slower — original pacing' },
            ],
            value: moduleSettings.allocatePace,
            info: 'How long Allocate waits between clicking a fighter, writing each slider, and moving to '
              + 'the next one. Every value is re-read and compared against its target afterward regardless '
              + 'of pace (see the status line once Allocate finishes), so a faster pace that races ahead of '
              + 'a slow page is CAUGHT, not silently trusted. Try Slower only if you actually see mismatches '
              + 'reported.',
            onChange: (v) => setModuleSetting('allocatePace', v === 'slow' ? 'slow' : 'fast'),
          });
          container.appendChild(speedRow);

          const saveHead = document.createElement('div');
          saveHead.className = 'awoo-settings-cat';
          saveHead.textContent = 'Save Preset';
          container.appendChild(saveHead);

          const warn = document.createElement('div');
          warn.style.cssText = 'font-size:var(--awoo-fs-control); opacity:var(--awoo-em-normal); line-height:1.45;';
          warn.textContent = 'OFF by default. Allocate always fills and verifies your sliders on the page; '
            + 'it never touches the Save button unless this is turned on. When it IS on, Allocate still '
            + 'refuses to click Save if any slider fails verification, or if the page\'s own budget line '
            + 'cannot be freshly re-read — see the info icon below for the exact gates.';
          container.appendChild(warn);

          const autoSaveRow = buildToggleRow({
            label: 'Let Allocate press Save Preset for me',
            info: 'Gated: every slider must independently verify against its target AND the preset\'s total '
              + 'spend, read fresh right before clicking, must not exceed the budget the game itself shows as '
              + 'available. Either failing refuses to click Save and says why in the activity strip — same as '
              + 'leaving this off. This never runs on its own; it only fires at the end of an Allocate you '
              + 'started yourself. CLAUDE.md rule 4: "never act on the live account — the player presses the '
              + 'button" — this exists to be the one deliberate, documented exception, not a loophole.',
            checked: !!moduleSettings.autoSavePreset,
            onChange: (v) => setModuleSetting('autoSavePreset', v),
          });
          container.appendChild(autoSaveRow);
        },
      },
      // Enabling always shows the window right away, matching pet-slot-alarm.
      // Nothing to gate on reload here yet — this module doesn't persist
      // panelOpen the way pet-slot-alarm does, so there's no prior-session
      // state to restore either way.
      onToggle: (enabled) => togglePanel(enabled),
      onQuickClick: () => togglePanel(),
      onResetPosition: () => windowHandle.resetPosition(),
      onConventionChange: () => { rerenderProfiles(); },
      __forTest: {
        profiles: () => profiles,
        upsertProfile, deleteProfileHard, setArchived, duplicateProfile,
        detectAndNormalizeImport, exportNative, exportFriendFormat, importNumber,
        CLASS_ABBREV, abbrevClass, ALL_CLASSES,
        resolveProfileAgainstLayout,
        bossDodgeAtLevel, hitTargetForBossLevel, hitChanceAt, expectedDamage,
        scanEquippedStatsViaFiber, readStatTotalFromCard, gearFromDisplayedTotal, equipmentTierMultiplier,
        statFinalFromRaw, rawPointsForFinalStat, scaleLevel,
        goldCostForPoints, maxLevelForBudget, splitDamageCritDamageByGold, allocateFighterForWorldBoss,
        // ---- R22: no plan, and no auto-save, from unread inputs ----
        worldBossReadGaps, planWorldBoss, autoSaveReadRefusal,
        // ---- item 1: boss-level memory ----
        STORAGE_KEY, flushStore, loadStore,
        bossLevelMemory: () => bossLevelMemory,
        recordBossLevelObservation, predictBossLevel, predictBossLevelFromLog,
        // ---- item 5/6: pacing + module settings + the auto-save gate ----
        moduleSettings: () => moduleSettings, setModuleSetting, allocatePacing,
        getAllocatedAndBudget, findSavePresetButton, attemptAutoSave,
      },
    });

    setInterval(flushStore, 10000);
    window.addEventListener('pagehide', flushStore);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushStore();
    });
  }

  });
})();
