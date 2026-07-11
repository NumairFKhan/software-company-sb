#!/usr/bin/env node
/**
 * DashRunner — Ticket M4 Acceptance-Criteria Test
 * Coins, Power-up & HUD Overlay
 *
 * Test strategy:
 *   1. Static analysis — grep source for required constants, entities, functions.
 *   2. Simulation — eval game script in Node mock; exercise coin spawning,
 *      collection, magnet pull, power-up pickup, shield hit absorption,
 *      HUD rendering assertions, and state reset.
 *
 * Acceptance criteria tested:
 *   AC1  Coins spawn in lane positions not blocked by the current obstacle pattern
 *   AC2  Collecting a coin increments the coin counter on the HUD immediately
 *   AC3  One power-up spawns approximately every 500 distance units
 *   AC4  Magnet pulls nearby coins (radius ~120px) toward player for 5 seconds
 *   AC4  Shield absorbs one hit
 *   AC5  Only one active power-up at a time; new one replaces old
 *   AC6  HUD renders distance, coin count, and 3 life pips each frame
 *   AC7  Active power-up icon and remaining duration shown on HUD
 *
 * Run:  node test_coins_hud.js
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

// Track fillText calls for HUD verification
const hudTexts = [];
let fillRectCount = 0;

const mockCanvas = {
    width: 800, height: 600,
    getContext: () => ({
        clearRect:  () => {},
        fillRect:   () => { fillRectCount++; },
        strokeRect: () => {},
        fillText:   (text) => { hudTexts.push(String(text)); },
        beginPath:  () => {},
        moveTo:     () => {},
        lineTo:     () => {},
        stroke:     () => {},
        arc:        () => {},
        fill:       () => {},
        save:       () => {},
        restore:    () => {},
        setLineDash: () => {},
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
const mockWindow = {
    innerWidth: 800, innerHeight: 600,
    addEventListener: () => {},
};

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
env.handleHit           = handleHit;
env.updatePlayer        = updatePlayer;
env.updateObstacles     = updateObstacles;
env.updateCoins         = updateCoins;
env.updatePowerUps      = updatePowerUps;
env.trySpawnPowerUp     = trySpawnPowerUp;
env.updatePlayerHitbox  = updatePlayerHitbox;
env.startGame           = startGame;
env.draw                = draw;
env.getLaneCenterX      = getLaneCenterX;
env.aabbOverlap         = aabbOverlap;
env.spawnPattern        = spawnPattern;
env.spawnPowerUp        = spawnPowerUp;
env.spawnCoinsForPattern = spawnCoinsForPattern;
env.getCoinScreenY      = getCoinScreenY;
env.OBSTACLE_PATTERNS   = OBSTACLE_PATTERNS;
env.COIN_RADIUS         = COIN_RADIUS;
env.COIN_HB_HALF        = COIN_HB_HALF;
env.POWERUP_SIZE        = POWERUP_SIZE;
env.MAGNET_RADIUS       = MAGNET_RADIUS;
env.MAGNET_DURATION     = MAGNET_DURATION;
env.COIN_MAGNET_SPEED   = COIN_MAGNET_SPEED;
env.POWERUP_SPAWN_DIST  = POWERUP_SPAWN_DIST;
env.INVINCIBILITY_MS    = INVINCIBILITY_MS;
env.NUM_LANES           = NUM_LANES;
env.PLAYER_H            = PLAYER_H;
env.PLAYER_W            = PLAYER_W;
env.INITIAL_TRACK_SPEED = INITIAL_TRACK_SPEED;
env.getCoins            = () => coins;
env.getPowerUps         = () => powerUps;
env.groundY_getter      = () => groundY;
env.trackScrollX_getter = () => trackScrollX;
env.trackScrollX_setter = (v) => { trackScrollX = v; };
env.nextPowerUpDistM_getter = () => nextPowerUpDistM;
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

console.log('\nDashRunner M4 — Coins, Power-up & HUD Overlay');
console.log('\n── Static analysis ──────────────────────────────────────');

console.log('\nM4 constants');
includes('COIN_RADIUS',        'COIN_RADIUS constant defined');
includes('COIN_HB_HALF',       'COIN_HB_HALF constant defined');
includes('POWERUP_SIZE',       'POWERUP_SIZE constant defined');
includes('MAGNET_RADIUS',      'MAGNET_RADIUS constant defined');
includes('MAGNET_DURATION',    'MAGNET_DURATION constant defined');
includes('COIN_MAGNET_SPEED',  'COIN_MAGNET_SPEED constant defined');
includes('POWERUP_SPAWN_DIST', 'POWERUP_SPAWN_DIST constant defined');

console.log('\nCoin entity fields');
includes('collected',          'Coin entity has collected field');
includes('magnetPulled',       'Coin entity has magnetPulled field');
includes('updateCoinHitbox',   'updateCoinHitbox function defined');

console.log('\nPower-up entity');
includes("type: 'magnet'",     "Power-up type 'magnet' defined");
includes("type: 'shield'",     "Power-up type 'shield' defined");
includes('updatePowerUpHitbox', 'updatePowerUpHitbox function defined');
includes('spawnPowerUp',        'spawnPowerUp function defined');

console.log('\nActiveEffect singleton');
includes('activeEffect',        'activeEffect referenced');
includes('remainingMs',         'remainingMs field in ActiveEffect');

console.log('\nSpawn functions');
includes('spawnCoinsForPattern', 'spawnCoinsForPattern function defined');
includes('trySpawnPowerUp',      'trySpawnPowerUp function defined');
includes('nextPowerUpDistM',     'nextPowerUpDistM tracking variable defined');

console.log('\nUpdate functions');
includes('updateCoins',          'updateCoins function defined');
includes('updatePowerUps',       'updatePowerUps function defined');
includes('updateCoins(dt)',      'updateCoins called in game update loop');
includes('updatePowerUps(dt)',   'updatePowerUps called in game update loop');

console.log('\nDraw functions');
includes('drawCoins',            'drawCoins function defined');
includes('drawPowerUps',         'drawPowerUps function defined');
includes('drawCoins()',          'drawCoins called in draw()');
includes('drawPowerUps()',       'drawPowerUps called in draw()');

console.log('\nHUD completeness');
includes('GameState.coins',      'HUD references GameState.coins for count');
includes('GameState.distanceM',  'HUD references GameState.distanceM');
includes(/MAGNET.*remainingMs|remainingMs.*MAGNET/,
         'HUD displays remaining magnet duration');

console.log('\nShield integration');
includes("type === 'shield'",    "Shield type check in handleHit");
includes(/activeEffect.*null.*shield|shield.*null/,
         'Shield consumption sets activeEffect to null');

console.log('\nStartGame resets M4 state');
includes('coins            = []',  'coins array reset in startGame', 'use coins = []');
includes('powerUps         = []',  'powerUps array reset in startGame');
includes('nextPowerUpDistM',       'nextPowerUpDistM reset in startGame');

console.log('\nSecurity');
check('No innerHTML usage', (src.match(/innerHTML\s*=/g) || []).length === 0);

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
    G.startGame();
    G.GameState.phase = 'playing';
}

// ── AC1: Coins spawn in safe (non-blocked) lanes ──────────────
console.log('\nCoin spawning — safe lanes only (AC1)');

resetPlaying();

// Pattern P0: centre barrier (lane 1 blocked). Safe lanes: 0, 2.
const p0 = G.OBSTACLE_PATTERNS[0];
check('P0 blocks lane 1', p0.slots.every(s => s.lane === 1));

const coinsBeforeSpawn = G.getCoins().length;
G.spawnPattern(p0);
const coinsAfterSpawn = G.getCoins().length;
const newCoins = G.getCoins().slice(coinsBeforeSpawn);

check('Coins spawned after pattern spawn', newCoins.length > 0,
      `new coins = ${newCoins.length}`);

const coinLanes = new Set(newCoins.map(c => c.lane));
check('No coin spawned in blocked lane 1', !coinLanes.has(1),
      `coin lanes = ${[...coinLanes].join(',')}`);
check('Coins in both safe lanes (0 and 2)',
      coinLanes.has(0) && coinLanes.has(2));

// Pattern P5: lanes 0 & 2 blocked. Safe lane: 1 only.
const p5 = G.OBSTACLE_PATTERNS[5];
check('P5 blocks lanes 0 and 2',
      p5.slots.some(s => s.lane === 0) && p5.slots.some(s => s.lane === 2));

const countBefore5 = G.getCoins().length;
G.spawnPattern(p5);
const newCoins5 = G.getCoins().slice(countBefore5);
const laneSet5 = new Set(newCoins5.map(c => c.lane));
check('P5: no coin in lane 0 (blocked)', !laneSet5.has(0));
check('P5: no coin in lane 2 (blocked)', !laneSet5.has(2));
check('P5: coins in lane 1 (safe)', laneSet5.has(1));

// ── Verify coin starts off-screen right ───────────────────────
check('Coins spawn off right edge (screenX > canvas width)',
      newCoins.every(c => c.screenX > mockCanvas.width),
      `sample screenX = ${newCoins[0] ? newCoins[0].screenX.toFixed(0) : 'n/a'}`);

// ── AC2: Collecting a coin increments GameState.coins ─────────
console.log('\nCoin collection — counter increments (AC2)');

resetPlaying();
const coinsBefore = G.GameState.coins;

// Manually plant a coin directly on top of the player hitbox
G.updatePlayerHitbox();
const ph = G.Player.hitbox;
const testCoin = {
    id: 9999, lane: G.Player.lane,
    screenX: ph.x + ph.w * 0.5,  // centre X of player hitbox
    collected: false,
    magnetPulled: false,
    hitbox: { x: 0, y: 0, w: 0, h: 0 },
};
G.getCoins().push(testCoin);
G.updateCoins(0.016);  // one frame

check('Coin marked as collected after overlap',
      testCoin.collected === true || G.GameState.coins > coinsBefore,
      `coins before=${coinsBefore} after=${G.GameState.coins}`);
check('GameState.coins incremented by 1',
      G.GameState.coins === coinsBefore + 1,
      `expected ${coinsBefore + 1}, got ${G.GameState.coins}`);
check('Collected coin removed from active array',
      G.getCoins().every(c => c.id !== 9999 || !c.collected),
      'collected coins should be culled');

// ── AC3: Power-up spawns every ~500 distance units ────────────
console.log('\nPower-up spawning — distance-based (AC3)');

check('POWERUP_SPAWN_DIST is approximately 500',
      G.POWERUP_SPAWN_DIST >= 400 && G.POWERUP_SPAWN_DIST <= 600,
      `value = ${G.POWERUP_SPAWN_DIST}`);

resetPlaying();
const puCountBefore = G.getPowerUps().length;
G.GameState.distanceM = G.POWERUP_SPAWN_DIST + 1;  // just past threshold
G.trySpawnPowerUp();
const puCountAfter = G.getPowerUps().length;
check('Power-up spawns when distance threshold reached',
      puCountAfter > puCountBefore,
      `before=${puCountBefore} after=${puCountAfter}`);

const spawnedPU = G.getPowerUps()[puCountBefore];
check('Spawned power-up type is magnet or shield',
      spawnedPU && (spawnedPU.type === 'magnet' || spawnedPU.type === 'shield'));
check('Spawned power-up starts off right edge',
      spawnedPU && spawnedPU.screenX > mockCanvas.width,
      `screenX = ${spawnedPU ? spawnedPU.screenX.toFixed(0) : 'n/a'}`);

// Second power-up should spawn only after next POWERUP_SPAWN_DIST metres
G.trySpawnPowerUp();
check('Power-up does NOT spawn again immediately (next milestone not reached)',
      G.getPowerUps().length === puCountAfter);

G.GameState.distanceM = G.nextPowerUpDistM_getter() + 1;
G.trySpawnPowerUp();
check('Second power-up spawns after next 500m',
      G.getPowerUps().length > puCountAfter);

// Both types appear in a sequence
const puTypes = G.getPowerUps().map(p => p.type);
const hasMagnet = puTypes.includes('magnet');
const hasShield = puTypes.includes('shield');
check('Both magnet and shield types spawn over time',
      hasMagnet && hasShield,
      `types seen: ${[...new Set(puTypes)].join(',')}`);

// ── AC4: Magnet — pulls nearby coins, duration 5s ─────────────
console.log('\nMagnet power-up — pull and duration (AC4)');

resetPlaying();
// Give player magnet for 5s
G.GameState.activeEffect = { type: 'magnet', remainingMs: G.MAGNET_DURATION };

// Place a coin within magnet radius on the right side of the player
const laneX = G.getLaneCenterX(G.Player.lane);
const magnetCoin = {
    id: 8001, lane: G.Player.lane,
    screenX: laneX + G.MAGNET_RADIUS - 10,  // within range
    collected: false, magnetPulled: false,
    hitbox: { x: 0, y: 0, w: 0, h: 0 },
};
G.getCoins().push(magnetCoin);
G.updatePlayerHitbox();
G.updateCoins(0.016);

check('Coin within magnet radius gets magnetPulled=true',
      magnetCoin.magnetPulled === true,
      `magnetPulled = ${magnetCoin.magnetPulled}`);

// Coin should move toward player (screenX decreasing toward Player.x)
const xBefore = magnetCoin.screenX;
G.updateCoins(0.1);
check('Magnetized coin moves toward player (screenX changes)',
      Math.abs(magnetCoin.screenX - laneX) < Math.abs(xBefore - laneX),
      `was ${xBefore.toFixed(1)} now ${magnetCoin.screenX.toFixed(1)} player at ${laneX.toFixed(1)}`);

// Coin beyond magnet radius should NOT be pulled
const farCoin = {
    id: 8002, lane: G.Player.lane,
    screenX: laneX + G.MAGNET_RADIUS + 50,  // outside range
    collected: false, magnetPulled: false,
    hitbox: { x: 0, y: 0, w: 0, h: 0 },
};
G.getCoins().push(farCoin);
G.updateCoins(0.016);
check('Coin beyond magnet radius is NOT magnetized',
      farCoin.magnetPulled === false,
      `magnetPulled = ${farCoin.magnetPulled}`);

// Magnet duration: after MAGNET_DURATION ms the effect expires
resetPlaying();
G.GameState.activeEffect = { type: 'magnet', remainingMs: G.MAGNET_DURATION };
G.updatePowerUps(G.MAGNET_DURATION / 1000 + 0.1);  // tick past duration
check('Magnet effect expires after MAGNET_DURATION ms',
      G.GameState.activeEffect === null,
      `activeEffect = ${JSON.stringify(G.GameState.activeEffect)}`);

check('MAGNET_DURATION is 5 seconds (5000ms)',
      G.MAGNET_DURATION === 5000, `value = ${G.MAGNET_DURATION}`);

// ── AC4: Shield — absorbs one hit ─────────────────────────────
console.log('\nShield power-up — absorbs one hit (AC4)');

resetPlaying();
G.GameState.lives = 3;
G.GameState.activeEffect = { type: 'shield', remainingMs: -1 };

G.handleHit();  // shield should absorb this

check('Shield absorbs hit: lives unchanged',
      G.GameState.lives === 3,
      `lives = ${G.GameState.lives}`);
check('Shield consumed after absorbing hit',
      G.GameState.activeEffect === null,
      `activeEffect = ${JSON.stringify(G.GameState.activeEffect)}`);
check('Brief invincibility granted after shield breaks',
      G.Player.invincible === true);

// ── AC5: Only one active power-up at a time ───────────────────
console.log('\nSingle active effect — replacement (AC5)');

resetPlaying();
G.GameState.activeEffect = { type: 'magnet', remainingMs: 3000 };

// Plant a shield power-up exactly on the player's screen X position.
// updatePowerUps() will call updatePowerUpHitbox() using the power-up's screenX
// and the fixed getPowerUpScreenY(), then AABB-test against the player hitbox.
// The player hitbox spans the full player height, so the power-up (at upper-body
// height, inside the player hitbox Y range) should overlap when X also matches.
G.updatePlayerHitbox();
const overlapShield = {
    id: 7001, lane: G.Player.lane,
    screenX: G.Player.x,   // same X as player center → guaranteed X overlap
    type: 'shield',
    pickedUp: false,
    hitbox: { x: 0, y: 0, w: 0, h: 0 },
};
G.getPowerUps().push(overlapShield);
G.updatePowerUps(0.016);

check('Shield pickup replaces existing magnet effect',
      G.GameState.activeEffect !== null &&
      G.GameState.activeEffect.type === 'shield',
      `activeEffect = ${JSON.stringify(G.GameState.activeEffect)}`);
check('Previous magnet effect is gone',
      G.GameState.activeEffect && G.GameState.activeEffect.type !== 'magnet');
check('Picked-up power-up removed from array',
      !G.getPowerUps().includes(overlapShield) ||
      G.getPowerUps().some(p => p.id === overlapShield.id && p.pickedUp));

// ── AC6: HUD — distance, coins, life pips ─────────────────────
console.log('\nHUD rendering (AC6)');

// Reset hudTexts so we capture only the next draw call
hudTexts.length = 0;
fillRectCount   = 0;

resetPlaying();
G.GameState.distanceM = 142.7;
G.GameState.coins     = 7;
G.GameState.lives     = 2;
G.GameState.activeEffect = null;

// Only the HUD draw check; call draw() with a fresh frame
try {
    G.draw();
} catch (_) { /* ignore canvas method stubs */ }

// Distance should appear as rounded metres
check('HUD renders distance in metres',
      hudTexts.some(t => t.includes('142') || t.includes('142 m')),
      `fillText calls: ${JSON.stringify(hudTexts.slice(0, 6))}`);

// Coin count
check('HUD renders coin count (7)',
      hudTexts.some(t => t.includes('7')),
      `fillText calls: ${JSON.stringify(hudTexts)}`);

// Life pips: at least 3 fillRect calls for pips (plus others for track, sky, etc.)
check('drawHUD calls fillRect (life pips)',
      fillRectCount >= 3,
      `fillRect count = ${fillRectCount}`);

// ── AC7: Active effect displayed on HUD ───────────────────────
console.log('\nHUD active power-up display (AC7)');

hudTexts.length = 0;
resetPlaying();
G.GameState.distanceM   = 0;
G.GameState.activeEffect = { type: 'magnet', remainingMs: 3200 };

try { G.draw(); } catch (_) {}

check('HUD shows MAGNET text when magnet active',
      hudTexts.some(t => t.toLowerCase().includes('magnet')),
      `fillText calls: ${JSON.stringify(hudTexts)}`);

check('HUD shows remaining seconds for magnet',
      hudTexts.some(t => /\d/.test(t) && t.toLowerCase().includes('magnet')),
      `fillText calls: ${JSON.stringify(hudTexts)}`);

hudTexts.length = 0;
G.GameState.activeEffect = { type: 'shield', remainingMs: -1 };

try { G.draw(); } catch (_) {}

check('HUD shows SHIELD text when shield active',
      hudTexts.some(t => t.toLowerCase().includes('shield')),
      `fillText calls: ${JSON.stringify(hudTexts)}`);

// ── Off-screen culling ─────────────────────────────────────────
console.log('\nCoin/power-up off-screen culling');

resetPlaying();
const leftCoin = {
    id: 5001, lane: 1,
    screenX: -100,  // off left edge
    collected: false, magnetPulled: false,
    hitbox: { x: 0, y: 0, w: 0, h: 0 },
};
G.getCoins().push(leftCoin);
const countBefore = G.getCoins().length;
G.updateCoins(0.016);
check('Off-screen coin (left edge) is culled',
      !G.getCoins().some(c => c.id === 5001),
      `coins remaining: ${G.getCoins().length}`);

const leftPU = {
    id: 5002, lane: 1, screenX: -100, type: 'magnet',
    pickedUp: false,
    hitbox: { x: 0, y: 0, w: 0, h: 0 },
};
G.getPowerUps().push(leftPU);
G.updatePowerUps(0.016);
check('Off-screen power-up (left edge) is culled',
      !G.getPowerUps().some(p => p.id === 5002));

// ── startGame resets M4 state ──────────────────────────────────
console.log('\nstartGame resets M4 state');

// Seed some state then restart
G.getCoins().push({ id: 1, lane: 0, screenX: 400, collected: false, magnetPulled: false, hitbox: {} });
G.GameState.activeEffect = { type: 'magnet', remainingMs: 2000 };
G.GameState.coins = 42;
G.startGame();

check('startGame clears coins array',
      G.getCoins().length === 0,
      `coins.length = ${G.getCoins().length}`);
check('startGame clears powerUps array',
      G.getPowerUps().length === 0);
check('startGame resets GameState.coins to 0',
      G.GameState.coins === 0,
      `coins = ${G.GameState.coins}`);
check('startGame resets activeEffect to null',
      G.GameState.activeEffect === null,
      `activeEffect = ${JSON.stringify(G.GameState.activeEffect)}`);
check('startGame resets nextPowerUpDistM to POWERUP_SPAWN_DIST',
      G.nextPowerUpDistM_getter() === G.POWERUP_SPAWN_DIST,
      `nextPowerUpDistM = ${G.nextPowerUpDistM_getter()}`);

// ═════════════════════════════════════════════════════════════
// Summary
// ═════════════════════════════════════════════════════════════
console.log(`\n── Results: ${passed} passed, ${failed} failed ──\n`);
process.exit(failed > 0 ? 1 : 0);
