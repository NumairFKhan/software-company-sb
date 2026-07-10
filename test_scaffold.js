#!/usr/bin/env node
/**
 * DashRunner — Ticket M1 Acceptance-Criteria Test
 *
 * Validates the structural requirements of dashrunner.html without
 * a browser runtime.  Reads the file as text and asserts that every
 * required element / pattern is present.
 *
 * Run: node test_scaffold.js
 * Exit 0 = all checks pass; exit 1 = at least one failure.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'dashrunner.html');

// ── Load file ─────────────────────────────────────────────────
let src;
try {
    src = fs.readFileSync(FILE, 'utf8');
} catch (e) {
    console.error(`FAIL  Cannot read ${FILE}: ${e.message}`);
    process.exit(1);
}

// ── Test helpers ──────────────────────────────────────────────
let passed = 0;
let failed = 0;

function check(description, condition, detail = '') {
    if (condition) {
        console.log(`  PASS  ${description}`);
        passed++;
    } else {
        console.error(`  FAIL  ${description}${detail ? ' — ' + detail : ''}`);
        failed++;
    }
}

function includes(pattern, description, detail = '') {
    const found = typeof pattern === 'string'
        ? src.includes(pattern)
        : pattern.test(src);
    check(description, found, detail);
}

// ── Tests ─────────────────────────────────────────────────────

console.log('\nDashRunner M1 — Canvas Scaffold & Scrolling Game Loop\n');

// ── AC1: Single HTML file, no external http/https dependencies ─
console.log('AC1: No external dependencies');
check(
    'DOCTYPE html present',
    src.includes('<!DOCTYPE html>')
);
check(
    'No <script src="http…"> external scripts',
    !/<script[^>]+src=["']https?:/.test(src),
    'Phaser CDN or other remote script found'
);
check(
    'No <link href="http…"> external stylesheets',
    !/<link[^>]+href=["']https?:/.test(src),
    'Remote stylesheet found'
);

// ── AC2: Canvas element ───────────────────────────────────────
console.log('\nAC2: Canvas fills viewport');
includes(
    '<canvas',
    '<canvas> element present'
);
includes(
    'window.innerWidth',
    'canvas.width set to window.innerWidth'
);
includes(
    'window.innerHeight',
    'canvas.height set to window.innerHeight'
);
includes(
    "addEventListener('resize'",
    "window resize listener attached",
);

// ── AC3: Delta-time-capped rAF loop ──────────────────────────
console.log('\nAC3: requestAnimationFrame loop with dt clamped to 50ms');
includes(
    'requestAnimationFrame',
    'requestAnimationFrame used for game loop'
);
// Check the clamping pattern — accepts either inline literal 0.05 or named MAX_DT constant
includes(
    /Math\.min\s*\([\s\S]*?(?:0\.05|MAX_DT)\s*\)/,
    'dt clamped via Math.min(…, 0.05 or MAX_DT) — 50ms max',
    'Pattern Math.min(…, 0.05|MAX_DT) not found'
);
includes(
    'MAX_DT',
    'MAX_DT constant defined'
);

// ── AC4: Scrolling track ──────────────────────────────────────
console.log('\nAC4: Scrolling track background');
includes(
    'trackScrollX',
    'trackScrollX scroll accumulator present'
);
includes(
    /trackScrollX\s*\+=\s*GameState\.trackSpeed/,
    'trackScrollX incremented by trackSpeed each frame'
);
includes(
    /fillRect/,
    'fillRect used for track drawing'
);
includes(
    /NUM_LANES\s*=\s*3/,
    'NUM_LANES = 3 defined'
);

// ── AC5: Static player rectangle ─────────────────────────────
console.log('\nAC5: Static player rectangle in centre lane');
includes(
    'drawPlayer',
    'drawPlayer function present'
);
includes(
    /lane\s*:\s*1/,
    'Player starts in lane 1 (centre)'
);
includes(
    /PLAYER_W|Player\.width/,
    'Player width defined'
);
includes(
    /PLAYER_H|Player\.height/,
    'Player height defined'
);

// ── AC6: GameState.phase routing ─────────────────────────────
console.log('\nAC6: GameState with phase routing');
includes(
    "phase: 'start'",
    "GameState.phase initialised to 'start'"
);
includes(
    "'playing'",
    "Phase 'playing' referenced"
);
includes(
    "'dead'",
    "Phase 'dead' referenced"
);
includes(
    'distanceM',
    'distanceM field in GameState'
);
includes(
    'trackSpeed',
    'trackSpeed field in GameState'
);
includes(
    'elapsedPlayMs',
    'elapsedPlayMs field in GameState (for difficulty ramp)'
);
includes(
    'activeEffect',
    'activeEffect field in GameState (for power-ups, M4)'
);
includes(
    'spawnCursor',
    'spawnCursor field in GameState (for obstacle spawn, M3)'
);

// ── Security: no innerHTML with user-controlled data ─────────
console.log('\nSecurity: no innerHTML string injection');
const innerHTMLUsage = (src.match(/innerHTML\s*=/g) || []).length;
check(
    'innerHTML not used at all (all text via canvas fillText)',
    innerHTMLUsage === 0,
    `Found ${innerHTMLUsage} occurrence(s) of innerHTML=`
);
includes(
    'fillText',
    'fillText used for all on-screen text'
);

// ── Touch / click: start & restart handlers ───────────────────
console.log('\nInput: start & restart handlers');
includes(
    'keydown',
    'keydown event listener attached'
);
includes(
    'touchend',
    'touchend event listener attached'
);
includes(
    'startGame',
    'startGame function defined'
);
includes(
    'restartGame',
    'restartGame function defined'
);

// ── Summary ───────────────────────────────────────────────────
console.log(`\n── Results: ${passed} passed, ${failed} failed ──\n`);
process.exit(failed > 0 ? 1 : 0);
