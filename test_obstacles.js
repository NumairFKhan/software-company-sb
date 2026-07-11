#!/usr/bin/env node
/**
 * DashRunner — Ticket M3 Acceptance-Criteria Test
 * Obstacles, Collision Detection & Lives System
 *
 * Strategy:
 *   1. Static analysis — grep source for required constructs.
 *   2. Simulation    — eval game script in Node mock; exercise
 *      spawn manager, AABB collision, lives system, and invincibility.
 *
 * Run: node test_obstacles.js
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

// ── Helpers ───────────────────────────────────────────────────
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
        fillText: () => {}, beginPath: () => {}, moveTo: () => {},
        lineTo: () => {}, stroke: () => {}, save: () => {}, restore: () => {},
        setLineDash: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
        fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
        font: '', textAlign: '', textBaseline: '',
    }),
    addEventListener: () => {},
};
const eventListeners = {};
const mockDocument = {
    getElementById: (id) => id === 'gameCanvas' ? mockCanvas : null,
    addEventListener: (type, fn) => {
        eventListeners[type] = eventListeners[type] || [];
        eventListeners[type].push(fn);
    },
};
const mockWindow = { innerWidth: 800, innerHeight: 600, addEventListener: () => {} };

let perfNowVal = 0;
const mockPerf = { now: () => perfNowVal };

function buildGameEnv() {
    const env = {};
    const fn  = new Function(
        'document', 'window', 'performance',
        'requestAnimationFrame', 'localStorage', 'env',
        `
${gameScript}
env.GameState           = GameState;
env.Player              = Player;
env.handleInput         = handleInput;
env.updatePlayer        = updatePlayer;
env.updateObstacles     = updateObstacles;
env.updatePlayerHitbox  = updatePlayerHitbox;
env.startGame           = startGame;
env.getLaneCenterX      = getLaneCenterX;
env.aabbOverlap         = aabbOverlap;
env.checkCollisions     = checkCollisions;
env.handleHit           = handleHit;
env.spawnPattern        = spawnPattern;
env.trySpawnPatterns    = trySpawnPatterns;
env.getObstacleGeometry = getObstacleGeometry;
env.updateObstacleHitbox= updateObstacleHitbox;
env.getObstacles        = () => obstacles;
env.getPatternIndex     = () => patternIndex;
env.groundY_getter      = () => groundY;
env.trackScrollX_getter = () => trackScrollX;
env.trackScrollX_setter = (v) => { trackScrollX = v; };
env.OBSTACLE_PATTERNS   = OBSTACLE_PATTERNS;
env.INVINCIBILITY_MS    = INVINCIBILITY_MS;
env.HITBOX_SHRINK       = HITBOX_SHRINK;
env.OBS_W               = OBS_W;
env.OBS_BARRIER_H       = OBS_BARRIER_H;
env.PLAYER_H            = PLAYER_H;
env.PLAYER_W            = PLAYER_W;
env.NUM_LANES           = NUM_LANES;
env.INITIAL_TRACK_SPEED = INITIAL_TRACK_SPEED;
`
    );
    fn(
        mockDocument, mockWindow, mockPerf,
        (cb) => { /* no-op rAF */ },
        { getItem: () => null, setItem: () => {} },
        env,
    );
    return env;
}

// ═════════════════════════════════════════════════════════════
// SECTION 1 — Static analysis
// ═════════════════════════════════════════════════════════════

console.log('\nDashRunner M3 — Obstacles, Collision Detection & Lives System');
console.log('\n── Static analysis ──────────────────────────────────────────');

console.log('\nObstaclePattern data');
includes('OBSTACLE_PATTERNS',          'OBSTACLE_PATTERNS array defined');
includes("type: 'barrier'",            "barrier type present in patterns");
includes("type: 'overhead'",           "overhead type present in patterns");
includes("type: 'low'",               "low type present in patterns");
includes('safeGapAfter',               'safeGapAfter field defined on patterns');
includes('relativeX',                  'relativeX slot field defined');
includes('patternId',                  'patternId field on obstacle entity');

console.log('\nObstacle entity fields');
includes('screenX',                    'screenX field on obstacles');
includes('hitbox',                     'hitbox field on obstacles');

console.log('\nSpawn manager');
includes('spawnCursor',                'spawnCursor used in spawn manager');
includes('trySpawnPatterns',           'trySpawnPatterns function defined');
includes('spawnPattern',               'spawnPattern function defined');

console.log('\nCollision & lives');
includes('aabbOverlap',                'aabbOverlap function defined');
includes('checkCollisions',            'checkCollisions function defined');
includes('INVINCIBILITY_MS',           'INVINCIBILITY_MS constant defined');
includes('invincibleTimer',            'invincibleTimer used');
includes('Player.invincible',          'Player.invincible checked');
includes('handleHit',                  'handleHit function defined');
includes(/GameState\.lives--/,         'GameState.lives decremented on hit');
includes("GameState.phase  = 'dead'",  "phase set to 'dead' on 0 lives");

console.log('\nSecurity');
check('No innerHTML usage',
      (src.match(/innerHTML\s*=/g) || []).length === 0);

// ═════════════════════════════════════════════════════════════
// SECTION 2 — Simulation
// ═════════════════════════════════════════════════════════════

console.log('\n── Simulation ───────────────────────────────────────────────');

let G;
try {
    G = buildGameEnv();
} catch (err) {
    console.error(`  FAIL  Could not eval game script: ${err.message}`);
    process.exit(1);
}

function resetPlaying() {
    G.GameState.phase = 'playing';
    G.startGame();
}

// ── AC1: At least 5 patterns covering all 3 types ─────────────
console.log('\nObstaclePatterns (AC1)');
const patterns = G.OBSTACLE_PATTERNS;
check('At least 5 ObstaclePatterns defined', patterns.length >= 5,
      `found ${patterns.length}`);

const hasBarrier  = patterns.some(p => p.slots.some(s => s.type === 'barrier'));
const hasOverhead = patterns.some(p => p.slots.some(s => s.type === 'overhead'));
const hasLow      = patterns.some(p => p.slots.some(s => s.type === 'low'));
check('Pattern set includes barrier type',  hasBarrier);
check('Pattern set includes overhead type', hasOverhead);
check('Pattern set includes low type',      hasLow);
check('Every pattern has safeGapAfter > 0',
      patterns.every(p => p.safeGapAfter > 0));
check('Every pattern has at least 1 slot',
      patterns.every(p => p.slots.length >= 1));

// ── AC2: Spawn manager — safe gap respected ────────────────────
console.log('\nSpawn manager — safe gap (AC2)');

resetPlaying();
const groundY = G.groundY_getter();

// trackScrollX is advanced by update() each frame, but updateObstacles() is what
// actually spawns. Set trackScrollX directly past spawnCursor to trigger spawn.
const spawnTrigger = G.GameState.spawnCursor;
G.trackScrollX_setter(spawnTrigger + 1);  // just past the threshold
G.updateObstacles(0.001);                 // tiny dt so no physics tunneling
const countAfterFirst = G.getObstacles().length;
check('Obstacles spawn after scroll threshold', countAfterFirst > 0,
      `obstacles.length=${countAfterFirst}`);

// Advance far enough for a second pattern spawn (past safeGapAfter of first pattern)
const secondTrigger = G.GameState.spawnCursor;
G.trackScrollX_setter(secondTrigger + 1);
G.updateObstacles(0.001);
const countAfterSecond = G.getObstacles().length;
check('Multiple patterns spawn over time', countAfterSecond > countAfterFirst,
      `after1=${countAfterFirst} after2=${countAfterSecond}`);

// ── AC2b: No impossible combos — first patterns are single-lane ─
console.log('\nSafe first-60s patterns (AC2)');

resetPlaying();
// First 5 patterns (before complex unlock at 20s) should all be single-slot
const earlyPatterns = G.OBSTACLE_PATTERNS.slice(0, 5);
const allSingleLane = earlyPatterns.every(p => p.slots.length === 1);
check('First 5 patterns are single-lane (safe for first 60s)', allSingleLane);

// ── AC3: AABB collision — correctness ─────────────────────────
console.log('\nAABB collision detection (AC3)');

// Manually test aabbOverlap
const a = { x: 10, y: 10, w: 20, h: 20 };
const overlapping = { x: 20, y: 20, w: 20, h: 20 };
const adjacent    = { x: 30, y: 10, w: 20, h: 20 };  // just touching right edge — no overlap
const separate    = { x: 50, y: 50, w: 10, h: 10 };

check('aabbOverlap: overlapping rects → true',  G.aabbOverlap(a, overlapping));
check('aabbOverlap: adjacent (no overlap) → false', !G.aabbOverlap(a, adjacent));
check('aabbOverlap: separate rects → false',    !G.aabbOverlap(a, separate));

// ── AC3: Hitbox shrink ─────────────────────────────────────────
console.log('\nHitbox shrink (AC3)');

resetPlaying();
const testObs = {
    id: 999, lane: 1, screenX: 200, type: 'barrier',
    patternId: 0, hitbox: { x: 0, y: 0, w: 0, h: 0 }, _geo: null,
};
G.updateObstacleHitbox(testObs);

const expectedW = G.OBS_W * (1 - G.HITBOX_SHRINK * 2);
const fullW     = G.OBS_W;
check('Obstacle hitbox width is shrunk from sprite width',
      testObs.hitbox.w < fullW,
      `sprite w=${fullW} hitbox w=${testObs.hitbox.w.toFixed(1)}`);
check('Shrink is ≥10% and ≤20% on each side',
      G.HITBOX_SHRINK >= 0.10 && G.HITBOX_SHRINK <= 0.20,
      `HITBOX_SHRINK=${G.HITBOX_SHRINK}`);

// ── AC4: Lives system — hit costs a life ──────────────────────
console.log('\nLives system — hit costs a life (AC4)');

resetPlaying();
check('Starts with 3 lives', G.GameState.lives === 3, `got ${G.GameState.lives}`);

G.handleHit();
check('After 1 hit: 2 lives remain', G.GameState.lives === 2, `got ${G.GameState.lives}`);
check('After 1 hit: player is invincible', G.Player.invincible === true);
check('invincibleTimer set to INVINCIBILITY_MS',
      G.Player.invincibleTimer === G.INVINCIBILITY_MS,
      `got ${G.Player.invincibleTimer}`);
check('Phase still playing after 1 hit', G.GameState.phase === 'playing');

// ── AC4: Invincibility window ─────────────────────────────────
console.log('\nInvincibility window (AC4)');

resetPlaying();
G.handleHit();  // invincible = true, timer = 2000ms

// Simulate 1.5s — still invincible
G.updateObstacles(1.5);
check('Still invincible after 1.5s', G.Player.invincible === true,
      `timer=${G.Player.invincibleTimer}`);

// Simulate another 0.6s (total > 2s)
G.updateObstacles(0.6);
check('Invincibility expires after 2s',
      G.Player.invincible === false,
      `invincible=${G.Player.invincible} timer=${G.Player.invincibleTimer}`);

// ── AC4: Invincibility prevents collision damage ───────────────
console.log('\nCollision skipped while invincible (AC4)');

resetPlaying();
G.handleHit();   // 2 lives, invincible=true
const livesBeforeHit = G.GameState.lives;

// Force a collision while invincible — should not reduce lives
G.checkCollisions();  // no obstacles but invincible guard must be in place
// Now place an obstacle directly on player and call checkCollisions
const obsOnPlayer = {
    id: 998, lane: G.Player.lane, screenX: 0, type: 'barrier',
    patternId: 0, hitbox: G.Player.hitbox, _geo: null,
};
// Temporarily inject obstacle
const obstaclesBefore = G.getObstacles().slice();
G.getObstacles().push(obsOnPlayer);

G.Player.invincible = true;
G.checkCollisions();
check('Invincible player not damaged by direct overlap',
      G.GameState.lives === livesBeforeHit,
      `lives=${G.GameState.lives}`);

// Remove injected obstacle
const obs = G.getObstacles();
obs.splice(obs.indexOf(obsOnPlayer), 1);

// ── AC5: Death on 0 lives ─────────────────────────────────────
console.log('\nDeath transition (AC5)');

resetPlaying();
G.handleHit();  // 2 lives
G.Player.invincible = false;
G.handleHit();  // 1 life
G.Player.invincible = false;
G.handleHit();  // 0 lives → dead

check("Phase = 'dead' after 3rd hit",
      G.GameState.phase === 'dead',
      `phase=${G.GameState.phase}`);
check('lives = 0 on death', G.GameState.lives === 0);
check('Player not invincible on death', G.Player.invincible === false);

// ── AC6: Off-screen culling ────────────────────────────────────
console.log('\nOff-screen obstacle culling (AC6)');

resetPlaying();
// Inject an obstacle far off the left edge
const farLeft = {
    id: 997, lane: 1, screenX: -200, type: 'barrier',
    patternId: 0, hitbox: { x: -200, y: 470, w: 40, h: 55 }, _geo: null,
};
G.getObstacles().push(farLeft);
const countBefore = G.getObstacles().length;

// One update tick — cull should remove it (screenX + OBS_W = -200 + 50 = -150 < -60)
G.updateObstacles(0.001);  // tiny dt so trackScrollX barely moves
const countAfter = G.getObstacles().length;
check('Off-screen obstacles are culled',
      countAfter < countBefore,
      `before=${countBefore} after=${countAfter}`);

// ── Geometry sanity: overhead/low require slide ────────────────
console.log('\nObstacle geometry: overhead/low require slide (geometry)');

const gnd = G.groundY_getter();
const PH  = G.PLAYER_H;

['overhead', 'low'].forEach(type => {
    const geo = G.getObstacleGeometry(type);
    const hitShrink = geo.h * G.HITBOX_SHRINK;
    const hitYBot   = (geo.yTop + geo.h) - hitShrink;

    const runPlayerTop   = gnd - PH;
    const slidePlayerTop = gnd - PH * 0.5;

    // Running player (top=runPlayerTop, bot=gnd) must hit
    const runHit = runPlayerTop < hitYBot && gnd > (geo.yTop + hitShrink);
    // Sliding player (top=slidePlayerTop, bot=gnd) must clear
    const slideClear = !(slidePlayerTop < hitYBot && gnd > (geo.yTop + hitShrink));

    check(`${type}: running player collides`,     runHit,    `hitYBot=${hitYBot.toFixed(1)} runTop=${runPlayerTop}`);
    check(`${type}: sliding player clears`,        slideClear, `hitYBot=${hitYBot.toFixed(1)} slideTop=${slidePlayerTop}`);
});

// Barrier must hit both run and slide (ground-anchored, can't slide under)
{
    const geo = G.getObstacleGeometry('barrier');
    const hitShrink = geo.h * G.HITBOX_SHRINK;
    const hitYBot   = (geo.yTop + geo.h) - hitShrink;
    const hitYTop   = geo.yTop + hitShrink;
    const slideHit  = gnd - PH * 0.5 < hitYBot && gnd > hitYTop;
    check('barrier: sliding player also collides (must jump)', slideHit);
}

// ═════════════════════════════════════════════════════════════
// Summary
// ═════════════════════════════════════════════════════════════
console.log(`\n── Results: ${passed} passed, ${failed} failed ──\n`);
process.exit(failed > 0 ? 1 : 0);
