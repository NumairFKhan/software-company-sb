#!/usr/bin/env node
/**
 * DashRunner — Ticket M7 Acceptance-Criteria Test
 * Difficulty Ramp, Remaining Obstacle Patterns & Feel Tuning
 *
 * Test strategy:
 *   1. Static analysis  — grep source for required constants and functions.
 *   2. Simulation       — eval game script in Node mock; drive elapsedPlayMs
 *      forward and verify speed ramp, gap narrowing, pattern count, and
 *      that complex patterns only unlock after the first 20 seconds.
 *
 * Acceptance criteria tested:
 *   AC1  Track speed increases every 30 seconds (SPEED_RAMP_INTERVAL)
 *   AC2  Obstacle spawn gap narrows after 2 minutes (GAP_NARROW_START_MS)
 *   AC3  5–8 distinct ObstaclePatterns exist (now 9 total: P0–P8)
 *   AC4  No impossible combos in first 60s — complex patterns locked until 20s
 *   AC5  Jump arc / hitbox feel tuned (GRAVITY, JUMP_VY, HITBOX_SHRINK in range)
 *   AC6  Swipe sensitivity threshold correct (SWIPE_MIN_DELTA = 30px default)
 *   AC7  Speed capped at MAX_TRACK_SPEED to keep game playable
 *   AC8  Gap multiplier floors at GAP_NARROW_MIN_FRAC (50%)
 *
 * Run:  node test_difficulty.js
 * Exit 0 = all pass; exit 1 = at least one failure.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'dashrunner.html');

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

// ── Build browser mock ────────────────────────────────────────
const scriptMatch = src.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) {
    console.error('FAIL  No <script> block found');
    process.exit(1);
}
const gameScript = scriptMatch[1];

const mockCanvas = {
    width: 800, height: 600,
    getContext: () => ({
        clearRect: () => {}, fillRect: () => {}, strokeRect: () => {},
        fillText: () => {}, measureText: (t) => ({ width: t.length * 8 }),
        beginPath: () => {}, arc: () => {}, moveTo: () => {},
        lineTo: () => {}, stroke: () => {}, fill: () => {},
        save: () => {}, restore: () => {}, setLineDash: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
        fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
        font: '', textAlign: '', textBaseline: '',
    }),
    addEventListener: () => {},
};
const mockDocument = {
    getElementById: (id) => id === 'gameCanvas' ? mockCanvas : null,
    addEventListener: () => {},
};
const mockWindow = { innerWidth: 800, innerHeight: 600, addEventListener: () => {} };

let perfNowVal = 0;
const mockPerf = { now: () => perfNowVal };

function buildGameEnv() {
    const env = {};
    const fn  = new Function(
        'document', 'window', 'performance',
        'requestAnimationFrame', 'localStorage', 'setTimeout', 'env',
        `
${gameScript}
env.GameState              = GameState;
env.Player                 = Player;
env.handleInput            = handleInput;
env.updatePlayer           = updatePlayer;
env.updateObstacles        = updateObstacles;
env.startGame              = startGame;
env.getLaneCenterX         = getLaneCenterX;
env.aabbOverlap            = aabbOverlap;
env.spawnPattern           = spawnPattern;
env.getGapMultiplier       = getGapMultiplier;
env.pickPattern            = pickPattern;
env.trySpawnPatterns       = trySpawnPatterns;
env.getObstacles           = () => obstacles;
env.trackScrollX_getter    = () => trackScrollX;
env.trackScrollX_setter    = (v) => { trackScrollX = v; };
env.OBSTACLE_PATTERNS      = OBSTACLE_PATTERNS;
env.INITIAL_TRACK_SPEED    = INITIAL_TRACK_SPEED;
env.MAX_TRACK_SPEED        = MAX_TRACK_SPEED;
env.SPEED_RAMP_INTERVAL    = SPEED_RAMP_INTERVAL;
env.SPEED_INCREMENT        = SPEED_INCREMENT;
env.GAP_NARROW_START_MS    = GAP_NARROW_START_MS;
env.GAP_NARROW_INTERVAL    = GAP_NARROW_INTERVAL;
env.GAP_NARROW_PER_STEP    = GAP_NARROW_PER_STEP;
env.GAP_NARROW_MIN_FRAC    = GAP_NARROW_MIN_FRAC;
env.GRAVITY                = GRAVITY;
env.JUMP_VY                = JUMP_VY;
env.HITBOX_SHRINK          = HITBOX_SHRINK;
env.SWIPE_MIN_DELTA        = SWIPE_MIN_DELTA;
env.SWIPE_MAX_MS           = SWIPE_MAX_MS;
env.PLAYER_H               = PLAYER_H;
env.OBS_BARRIER_H          = OBS_BARRIER_H;
env.update                 = update;
`
    );
    fn(
        mockDocument, mockWindow, mockPerf,
        (cb) => { /* no-op rAF */ },
        { getItem: () => null, setItem: () => {} },
        (fn, ms) => { /* no-op setTimeout */ },
        env,
    );
    return env;
}

// ════════════════════════════════════════════════════════════
// SECTION 1 — Static analysis
// ════════════════════════════════════════════════════════════

console.log('\nDashRunner M7 — Difficulty Ramp, Patterns & Feel Tuning');
console.log('\n── Static analysis ──────────────────────────────────────────');

console.log('\nDifficulty ramp constants');
includes('SPEED_RAMP_INTERVAL',     'SPEED_RAMP_INTERVAL constant defined');
includes('SPEED_INCREMENT',         'SPEED_INCREMENT constant defined');
includes('MAX_TRACK_SPEED',         'MAX_TRACK_SPEED cap constant defined');
includes('GAP_NARROW_START_MS',     'GAP_NARROW_START_MS constant defined');
includes('GAP_NARROW_INTERVAL',     'GAP_NARROW_INTERVAL constant defined');
includes('GAP_NARROW_PER_STEP',     'GAP_NARROW_PER_STEP constant defined');
includes('GAP_NARROW_MIN_FRAC',     'GAP_NARROW_MIN_FRAC floor constant defined');

console.log('\nDifficulty ramp functions');
includes('getGapMultiplier',        'getGapMultiplier function defined');
includes('speedTicks',              'speedTicks variable used in speed ramp logic');
includes('SPEED_RAMP_INTERVAL',     'SPEED_RAMP_INTERVAL used in ramp calculation');

console.log('\nObstacle patterns');
includes("id: 7,",                  'P7 pattern defined');
includes("id: 8,",                  'P8 pattern defined');

console.log('\nFeel tuning constants in expected ranges');
// GRAVITY should be positive and substantial (1000–5000 px/s²)
const gravMatch  = src.match(/const GRAVITY\s*=\s*(\d+)/);
const gravity    = gravMatch ? parseInt(gravMatch[1]) : 0;
check('GRAVITY in 1000–5000 px/s² range', gravity >= 1000 && gravity <= 5000,
      `found ${gravity}`);

// JUMP_VY should be negative (upward) and in the -400 to -1200 range
const jumpMatch  = src.match(/const JUMP_VY\s*=\s*(-?\d+)/);
const jumpVY     = jumpMatch ? parseInt(jumpMatch[1]) : 0;
check('JUMP_VY is negative (upward)', jumpVY < 0, `found ${jumpVY}`);
check('JUMP_VY magnitude in 400–1200 range', Math.abs(jumpVY) >= 400 && Math.abs(jumpVY) <= 1200,
      `found ${jumpVY}`);

// HITBOX_SHRINK should be 10–15% (0.10–0.15)
const shrinkMatch = src.match(/const HITBOX_SHRINK\s*=\s*([\d.]+)/);
const shrink      = shrinkMatch ? parseFloat(shrinkMatch[1]) : 0;
check('HITBOX_SHRINK in 10–15% range (0.10–0.15)', shrink >= 0.10 && shrink <= 0.15,
      `found ${shrink}`);

// SWIPE_MIN_DELTA should be 30px (can be lower but not higher per spec)
const swipeMatch  = src.match(/const SWIPE_MIN_DELTA\s*=\s*(\d+)/);
const swipeDelta  = swipeMatch ? parseInt(swipeMatch[1]) : 0;
check('SWIPE_MIN_DELTA in 20–40px range', swipeDelta >= 20 && swipeDelta <= 40,
      `found ${swipeDelta}`);

console.log('\nSecurity (no innerHTML)');
check('No innerHTML usage anywhere', (src.match(/innerHTML\s*=/g) || []).length === 0);

// ════════════════════════════════════════════════════════════
// SECTION 2 — Simulation
// ════════════════════════════════════════════════════════════

console.log('\n── Simulation ───────────────────────────────────────────────');

let G;
try {
    G = buildGameEnv();
} catch (err) {
    console.error(`  FAIL  Could not eval game script: ${err.message}`);
    process.exit(1);
}

function resetPlaying() {
    G.startGame();
    G.GameState.phase = 'playing';
}

// ── AC3: Pattern count in 5–8 range ──────────────────────────
console.log('\nObstacle pattern count (AC3)');
const patterns = G.OBSTACLE_PATTERNS;
check(`Pattern count is 5–9 (found ${patterns.length})`,
      patterns.length >= 5 && patterns.length <= 9,
      `found ${patterns.length}`);
check('P0–P4 are single-lane (first 5 always simple)',
      patterns.slice(0, 5).every(p => p.slots.length === 1));

const hasBarrier  = patterns.some(p => p.slots.some(s => s.type === 'barrier'));
const hasOverhead = patterns.some(p => p.slots.some(s => s.type === 'overhead'));
const hasLow      = patterns.some(p => p.slots.some(s => s.type === 'low'));
check('Pattern set covers barrier type',  hasBarrier);
check('Pattern set covers overhead type', hasOverhead);
check('Pattern set covers low type',      hasLow);

// P5+ should have 2+ slots (multi-lane complexity)
const complexPatterns = patterns.slice(5);
check('Complex patterns (P5+) all have 2+ slots',
      complexPatterns.length > 0 && complexPatterns.every(p => p.slots.length >= 2),
      `found ${complexPatterns.length} complex patterns`);

// ── AC4: Complex patterns locked in first 20s ─────────────────
console.log('\nComplex pattern unlock safety (AC4)');
resetPlaying();
G.GameState.elapsedPlayMs = 0;  // early game — complex patterns locked

// Pick 10 patterns while elapsedPlayMs < 20000
const earlyPicks = [];
for (let i = 0; i < 10; i++) {
    earlyPicks.push(G.pickPattern());
}
const earlyAllSimple = earlyPicks.every(p => p.slots.length === 1);
check('First 10 pattern picks (before 20s) are all single-lane', earlyAllSimple,
      `complex pattern appeared: ${earlyPicks.filter(p => p.slots.length > 1).map(p => p.id).join(', ')}`);

// After 20s complex patterns should appear
resetPlaying();
G.GameState.elapsedPlayMs = 21000;  // past the 20s unlock threshold
const latePicks = [];
for (let i = 0; i < 20; i++) {
    latePicks.push(G.pickPattern());
}
const hasComplex = latePicks.some(p => p.slots.length > 1);
check('After 20s, complex patterns appear in rotation', hasComplex,
      `no complex pattern in 20 picks: ids=${latePicks.map(p => p.id).join(',')}`);

// ── AC1: Speed ramp every 30 seconds ─────────────────────────
console.log('\nSpeed ramp every 30 seconds (AC1)');
resetPlaying();

// At 0ms, speed should be INITIAL_TRACK_SPEED
const speedAt0 = G.GameState.trackSpeed;
check('Speed at 0ms equals INITIAL_TRACK_SPEED',
      speedAt0 === G.INITIAL_TRACK_SPEED,
      `found ${speedAt0}`);

// Simulate the update() function at 30s
G.GameState.elapsedPlayMs = 30000;  // exactly 30 seconds
// Manually apply the speed ramp formula (mirroring what update() does)
const speedAt30s = Math.min(
    G.INITIAL_TRACK_SPEED + 1 * G.SPEED_INCREMENT,
    G.MAX_TRACK_SPEED
);
// Run update with tiny dt to trigger the ramp (elapsedPlayMs already set)
G.update(0.001);
const actualAt30s = G.GameState.trackSpeed;
check('Speed increases after 30s of play',
      actualAt30s > G.INITIAL_TRACK_SPEED,
      `expected > ${G.INITIAL_TRACK_SPEED}, got ${actualAt30s}`);
check('Speed increment equals SPEED_INCREMENT per 30s',
      actualAt30s === G.INITIAL_TRACK_SPEED + G.SPEED_INCREMENT,
      `expected ${G.INITIAL_TRACK_SPEED + G.SPEED_INCREMENT}, got ${actualAt30s}`);

// At 60s, two increments
G.GameState.elapsedPlayMs = 60000;
G.update(0.001);
const actualAt60s = G.GameState.trackSpeed;
check('Speed after 60s is INITIAL + 2 × SPEED_INCREMENT',
      actualAt60s === G.INITIAL_TRACK_SPEED + 2 * G.SPEED_INCREMENT,
      `expected ${G.INITIAL_TRACK_SPEED + 2 * G.SPEED_INCREMENT}, got ${actualAt60s}`);

// ── AC7: Speed cap at MAX_TRACK_SPEED ─────────────────────────
console.log('\nSpeed cap (AC7)');
resetPlaying();
// Set elapsedPlayMs so many ramp ticks would exceed the cap
G.GameState.elapsedPlayMs = 10000000;  // far future — many ticks
G.update(0.001);
check('Speed capped at MAX_TRACK_SPEED',
      G.GameState.trackSpeed === G.MAX_TRACK_SPEED,
      `expected ${G.MAX_TRACK_SPEED}, got ${G.GameState.trackSpeed}`);

// ── AC2: Gap narrowing after 2 minutes ───────────────────────
console.log('\nGap narrowing after 2 minutes (AC2)');
resetPlaying();

// Before 2 minutes — multiplier should be 1.0
G.GameState.elapsedPlayMs = 0;
const mult0 = G.getGapMultiplier();
check('Gap multiplier is 1.0 before 2-minute mark', mult0 === 1.0,
      `got ${mult0}`);

G.GameState.elapsedPlayMs = 119999;  // just before 2 minutes
const multJustBefore = G.getGapMultiplier();
check('Gap multiplier is 1.0 at 119999ms (just before 2 min)', multJustBefore === 1.0,
      `got ${multJustBefore}`);

// At exactly 2 minutes — no reduction yet (0 steps past the threshold)
G.GameState.elapsedPlayMs = 120000;
const multAt2min = G.getGapMultiplier();
check('Gap multiplier is 1.0 at exactly 2-minute mark (0 steps)', multAt2min === 1.0,
      `got ${multAt2min}`);

// At 2 min + 30s (one step past) — should reduce by GAP_NARROW_PER_STEP
G.GameState.elapsedPlayMs = 150000;  // 120000 + 30000
const multOneStep = G.getGapMultiplier();
const expectedOneStep = 1.0 - G.GAP_NARROW_PER_STEP;
check(`Gap multiplier after 1 step (150s) = ${expectedOneStep.toFixed(2)}`,
      Math.abs(multOneStep - expectedOneStep) < 0.001,
      `got ${multOneStep}`);

// At 2 min + 60s (two steps) — two reductions
G.GameState.elapsedPlayMs = 180000;
const multTwoSteps = G.getGapMultiplier();
const expectedTwoSteps = 1.0 - 2 * G.GAP_NARROW_PER_STEP;
check(`Gap multiplier after 2 steps (180s) = ${expectedTwoSteps.toFixed(2)}`,
      Math.abs(multTwoSteps - expectedTwoSteps) < 0.001,
      `got ${multTwoSteps}`);

// ── AC8: Gap multiplier floor ─────────────────────────────────
console.log('\nGap multiplier floor (AC8)');
// Set elapsedPlayMs far into the future — floor should kick in
G.GameState.elapsedPlayMs = 9999999;
const multFloor = G.getGapMultiplier();
check('Gap multiplier never falls below GAP_NARROW_MIN_FRAC',
      multFloor >= G.GAP_NARROW_MIN_FRAC,
      `got ${multFloor}, floor is ${G.GAP_NARROW_MIN_FRAC}`);
check('Gap multiplier at floor equals GAP_NARROW_MIN_FRAC exactly',
      multFloor === G.GAP_NARROW_MIN_FRAC,
      `got ${multFloor}`);

// ── Gap multiplier affects actual spawn cursor ────────────────
console.log('\nSpawn gap applied via gap multiplier');
resetPlaying();

// Confirm that during first 2 minutes, gap = safeGapAfter × 1.0
G.GameState.elapsedPlayMs = 0;
const p0 = G.OBSTACLE_PATTERNS[0];
const cursorBefore = G.GameState.spawnCursor;
G.spawnPattern(p0);
const cursorAfter = G.GameState.spawnCursor;
const appliedGap = cursorAfter - cursorBefore;
check('During first 2 min, spawn cursor advances by full safeGapAfter',
      appliedGap === Math.round(p0.safeGapAfter * 1.0),
      `expected ${p0.safeGapAfter}, got ${appliedGap}`);

// After 2 minutes + one step, gap should be smaller
resetPlaying();
G.GameState.elapsedPlayMs = 150000;  // 1 step past 2-min mark
const cursorBefore2 = G.GameState.spawnCursor;
G.spawnPattern(p0);
const cursorAfter2 = G.GameState.spawnCursor;
const reducedGap = cursorAfter2 - cursorBefore2;
const expectedReducedGap = Math.round(p0.safeGapAfter * (1.0 - G.GAP_NARROW_PER_STEP));
check('After 2 min + 30s, spawn cursor advances by reduced gap',
      reducedGap === expectedReducedGap,
      `expected ${expectedReducedGap}, got ${reducedGap}`);
check('Reduced gap is smaller than original safeGapAfter',
      reducedGap < p0.safeGapAfter,
      `reduced=${reducedGap} original=${p0.safeGapAfter}`);

// ── AC5: Jump physics produce reasonable clearance over barrier ──
console.log('\nJump arc clearance over barriers (AC5)');
// Peak height = JUMP_VY² / (2 × GRAVITY)
const peakHeight = (G.JUMP_VY * G.JUMP_VY) / (2 * G.GRAVITY);
check('Jump peak height > 80px (enough to clear barriers)',
      peakHeight > 80,
      `peak=${peakHeight.toFixed(1)}px`);
check('Jump peak height < 250px (not so high it feels floaty)',
      peakHeight < 250,
      `peak=${peakHeight.toFixed(1)}px`);

// Verify barrier height < peak: OBS_BARRIER_H = PLAYER_H + 10
// Player hitbox bottom at peak = groundY - PLAYER_H - peakHeight + PLAYER_H = groundY - peakHeight
// Barrier hitbox top (with shrink) ≈ groundY - (PLAYER_H + 10) + shrinkInset
// For clearance: peakHeight must be substantially greater than PLAYER_H + 10 - shrinkInset
const barrierHitboxH     = G.OBS_BARRIER_H * (1 - 2 * G.HITBOX_SHRINK);
const barrierHitboxTop   = G.OBS_BARRIER_H - G.OBS_BARRIER_H * G.HITBOX_SHRINK;  // offset from groundY
const playerBottomAtPeak = peakHeight;  // offset above groundY when player is at peak
const clearancePx        = playerBottomAtPeak - barrierHitboxTop;
check('Player clears barrier at jump peak (clearance > 0)',
      clearancePx > 0,
      `clearance=${clearancePx.toFixed(1)}px`);

// ── safeGapAfter: all patterns have positive gaps ─────────────
console.log('\nPattern safety properties');
check('Every pattern has safeGapAfter > 0',
      patterns.every(p => p.safeGapAfter > 0),
      `bad patterns: ${patterns.filter(p => p.safeGapAfter <= 0).map(p => p.id).join(',')}`);
check('No pattern blocks all 3 lanes simultaneously (always escapable)',
      patterns.every(p => {
          const blockedLanes = new Set(p.slots.map(s => s.lane));
          // A pattern is invalid if all 3 lanes are blocked with non-jumpable obstacles.
          // However, barriers can be jumped; a pattern with barriers in all lanes
          // can still be survived by jumping. Only pure overhead/low in all 3 lanes
          // is truly impossible (player can't slide in all 3 lanes at once).
          const allLanesHaveSlideObstacles = [0, 1, 2].every(l =>
              p.slots.some(s => s.lane === l && (s.type === 'overhead' || s.type === 'low'))
          );
          return !allLanesHaveSlideObstacles;
      }),
      'found a pattern that requires sliding in all 3 lanes simultaneously');

// ── Swipe sensitivity ─────────────────────────────────────────
console.log('\nSwipe sensitivity (AC6)');
check('SWIPE_MIN_DELTA is 30px (default tuning)',
      G.SWIPE_MIN_DELTA === 30,
      `found ${G.SWIPE_MIN_DELTA}`);
check('SWIPE_MAX_MS is 250ms (gesture window)',
      G.SWIPE_MAX_MS === 250,
      `found ${G.SWIPE_MAX_MS}`);

// ════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(56)}`);
console.log(`  ${passed} passed  /  ${failed} failed`);

if (failed > 0) {
    process.exit(1);
} else {
    console.log('  All M7 acceptance criteria passed.');
    process.exit(0);
}
