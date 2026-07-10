#!/usr/bin/env node
/**
 * DashRunner — Ticket M2 Acceptance-Criteria Test
 * Player Movement & Keyboard Controls
 *
 * Two-layer test strategy:
 *   1. Static analysis — grep the HTML source for required patterns.
 *   2. Simulation — eval the game script in a minimal browser mock and
 *      exercise handleInput() / updatePlayer() directly to verify behaviour.
 *
 * Run: node test_movement.js
 * Exit 0 = all checks pass; exit 1 = at least one failure.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'dashrunner.html');

// ── Load source ───────────────────────────────────────────────
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

// ── Extract inline script ─────────────────────────────────────
// Pull the JS between <script> tags for simulation.
const scriptMatch = src.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) {
    console.error('FAIL  No <script> block found');
    process.exit(1);
}
const gameScript = scriptMatch[1];

// ── Browser environment mock ──────────────────────────────────
// Minimal stubs so the game script can be eval'd in Node.js.
const mockCanvas = {
    width:  800,
    height: 600,
    getContext: () => ({
        clearRect:          () => {},
        fillRect:           () => {},
        strokeRect:         () => {},
        fillText:           () => {},
        beginPath:          () => {},
        moveTo:             () => {},
        lineTo:             () => {},
        stroke:             () => {},
        save:               () => {},
        restore:            () => {},
        setLineDash:        () => {},
        createLinearGradient: () => ({
            addColorStop: () => {},
        }),
        // Settable style props
        fillStyle:    '',
        strokeStyle:  '',
        lineWidth:    1,
        globalAlpha:  1,
        font:         '',
        textAlign:    '',
        textBaseline: '',
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
const mockWindow = {
    innerWidth:      800,
    innerHeight:     600,
    addEventListener: () => {},
};
// Expose globals needed by the script
const mockPerformanceNow = () => 0;

// Wrap eval in a function that exposes the globals.
// We do NOT pass `canvas` as a parameter because the game script declares
// `const canvas = document.getElementById('gameCanvas')` itself — passing it
// as a named param alongside `const canvas` inside the script body causes a
// "Identifier already declared" error.  Instead we let the mock document's
// getElementById stub return mockCanvas.
function buildGameEnv() {
    const env = {};
    const fn = new Function(
        'document', 'window', 'performance',
        'requestAnimationFrame', 'localStorage', 'env',
        `
${gameScript}
// Expose internals for testing
env.GameState         = GameState;
env.Player            = Player;
env.handleInput       = handleInput;
env.updatePlayer      = updatePlayer;
env.updatePlayerHitbox= updatePlayerHitbox;
env.startGame         = startGame;
env.getLaneCenterX    = getLaneCenterX;
env.groundY_getter    = () => groundY;
env.laneCooldown_get  = () => laneCooldown;
env.slideHeld_get     = () => slideHeld;
env.GRAVITY           = GRAVITY;
env.JUMP_VY           = JUMP_VY;
env.LANE_COOLDOWN_MS  = LANE_COOLDOWN_MS;
env.NUM_LANES         = NUM_LANES;
env.PLAYER_H          = PLAYER_H;
env.PLAYER_W          = PLAYER_W;
`
    );
    fn(
        mockDocument,
        mockWindow,
        { now: mockPerformanceNow },
        (cb) => { /* no-op rAF — just register, don't call in tests */ },
        { getItem: () => null, setItem: () => {} },
        env,
    );
    return env;
}

let G; // game environment — built once per section that needs simulation

// ═════════════════════════════════════════════════════════════
// SECTION 1 — Static analysis
// ═════════════════════════════════════════════════════════════

console.log('\nDashRunner M2 — Player Movement & Keyboard Controls');
console.log('\n── Static analysis ──────────────────────────────────────');

// ── Constants ─────────────────────────────────────────────────
console.log('\nConstants');
includes('GRAVITY',           'GRAVITY constant defined');
includes('JUMP_VY',           'JUMP_VY constant defined');
includes('LANE_COOLDOWN_MS',  'LANE_COOLDOWN_MS constant defined');
includes(/LANE_COOLDOWN_MS\s*=\s*100/, 'LANE_COOLDOWN_MS = 100 (ms)');

// ── State variables ───────────────────────────────────────────
console.log('\nMovement state variables');
includes('laneCooldown',      'laneCooldown declared');
includes('slideHeld',         'slideHeld declared');

// ── Functions ─────────────────────────────────────────────────
console.log('\nRequired functions');
includes('function handleInput',    'handleInput function defined');
includes('function updatePlayer',   'updatePlayer function defined');
includes('updatePlayer(dt)',        'updatePlayer(dt) called from update()');

// ── Keyboard scheme coverage ──────────────────────────────────
console.log('\nKeyboard schemes (arrows + WASD + Space)');
includes("case 'ArrowLeft'",  "ArrowLeft handled");
includes("case 'ArrowRight'", "ArrowRight handled");
includes("case 'ArrowUp'",    "ArrowUp handled");
includes("case 'ArrowDown'",  "ArrowDown handled");
includes("case 'a'",          "A key handled");
includes("case 'A'",          "A key (capital) handled");
includes("case 'd'",          "D key handled");
includes("case 'D'",          "D key (capital) handled");
includes("case 'w'",          "W key handled");
includes("case 'W'",          "W key (capital) handled");
includes("case 's'",          "S key handled");
includes("case 'S'",          "S key (capital) handled");
includes("case ' '",          "Space handled");

// ── keyup for slide release ───────────────────────────────────
console.log('\nkeyup slide-release');
includes('keyup',              'keyup event listener registered');
includes("handleInput('slideEnd')", "slideEnd fired on keyup");

// ── Slide ─────────────────────────────────────────────────────
console.log('\nSlide logic');
includes("'slideStart'",       "slideStart action handled in handleInput");
includes("'slideEnd'",         "slideEnd action handled in handleInput");
includes("Player.state === 'slide'", "Slide state referenced");
includes("Player.height * 0.5", "Slide halves height");

// ── Jump arc ─────────────────────────────────────────────────
console.log('\nJump arc physics');
includes('GRAVITY * dt',      'Gravity applied each frame');
includes('Player.vy += GRAVITY', 'Player.vy integrated with gravity');
includes('Player.y  += Player.vy', 'Player.y moved by vy');
includes('JUMP_VY',           'JUMP_VY applied on jump');

// ── State-machine guards ──────────────────────────────────────
console.log('\nState-machine guards');
includes("Player.state === 'run'", "jump/slide only from 'run' state");
includes(/Player\.state\s*=\s*'jump'/, "Player.state set to 'jump'");
includes(/Player\.state\s*=\s*'slide'/, "Player.state set to 'slide'");
includes(/Player\.state\s*=\s*'run'/, "Player.state reset to 'run'");

// ── Hitbox per state ─────────────────────────────────────────
console.log('\nHitbox per state');
includes(/Player\.state\s*===\s*'jump'[\s\S]{1,200}?0\.75/, "Jump hitbox is narrower (0.75 width)");
includes(/Player\.state\s*===\s*'slide'[\s\S]{1,200}?0\.5/, "Slide hitbox is half height");

// ── startGame resets movement state ──────────────────────────
console.log('\nstartGame resets movement state');
includes(/laneCooldown\s*=\s*0/, "laneCooldown reset to 0 in startGame");
includes(/slideHeld\s*=\s*false/, "slideHeld reset to false in startGame");

// ── Security: no innerHTML ────────────────────────────────────
console.log('\nSecurity');
const innerHTMLCount = (src.match(/innerHTML\s*=/g) || []).length;
check('No innerHTML usage', innerHTMLCount === 0, `${innerHTMLCount} occurrence(s) found`);

// ═════════════════════════════════════════════════════════════
// SECTION 2 — Simulation
// Build the game env once and exercise the logic directly.
// ═════════════════════════════════════════════════════════════

console.log('\n── Simulation ───────────────────────────────────────────');

try {
    G = buildGameEnv();
} catch (err) {
    console.error(`  FAIL  Could not eval game script: ${err.message}`);
    process.exit(1);
}

// Helper: put game in playing phase with a clean player
function resetToPlaying() {
    G.GameState.phase = 'playing';
    G.startGame();          // resets everything including laneCooldown/slideHeld
}

const groundY = G.groundY_getter();

// ── Constants have sane values ────────────────────────────────
console.log('\nPhysics constants sanity');
check('GRAVITY > 0',                        G.GRAVITY > 0,    `got ${G.GRAVITY}`);
check('JUMP_VY < 0 (upward)',               G.JUMP_VY < 0,    `got ${G.JUMP_VY}`);
check('LANE_COOLDOWN_MS === 100',           G.LANE_COOLDOWN_MS === 100);
check('NUM_LANES === 3',                    G.NUM_LANES === 3);

// Verify peak height is "reasonable" (> player height so jump clears obstacles)
const peakH = (G.JUMP_VY * G.JUMP_VY) / (2 * G.GRAVITY);
check(
    `Jump peak height (${Math.round(peakH)}px) > PLAYER_H (${G.PLAYER_H}px)`,
    peakH > G.PLAYER_H,
    `peak=${peakH.toFixed(1)} player height=${G.PLAYER_H}`
);

// ── Lane switch: instant snap with cooldown ───────────────────
console.log('\nLane switch');

resetToPlaying();
const startLane = G.Player.lane;  // should be 1 (center)
G.handleInput('left');
check('Lane switch left moves from 1 → 0', G.Player.lane === 0);

const cooldownAfterSwitch = G.laneCooldown_get();
check('Cooldown set after switch (> 0)',   cooldownAfterSwitch > 0, `got ${cooldownAfterSwitch}`);
check('Cooldown is LANE_COOLDOWN_MS',      cooldownAfterSwitch === G.LANE_COOLDOWN_MS);

// Second immediate left should be blocked by cooldown
G.handleInput('left');
check('Cannot switch left again during cooldown (lane stays 0)', G.Player.lane === 0);

// Simulate cooldown expiry
resetToPlaying(); // lane=1, cooldown=0
G.handleInput('right');
check('Lane switch right moves from 1 → 2', G.Player.lane === 2);

// Cannot go past right boundary
G.updatePlayer(0.11); // drain cooldown (110ms > 100ms threshold)
G.handleInput('right');
check('Cannot switch past right boundary (lane stays 2)', G.Player.lane === 2);

// Cannot go past left boundary
resetToPlaying();
G.updatePlayer(0); // no-op but ensures clean state
G.handleInput('left');
G.updatePlayer(0.11);
G.handleInput('left');
check('Cannot switch past left boundary (lane stays 0)', G.Player.lane === 0);

// x updates on lane switch
resetToPlaying();
G.handleInput('right');
const expectedX = G.getLaneCenterX(2);
check('Player.x updates on lane switch', G.Player.x === expectedX, `got ${G.Player.x}, expected ${expectedX}`);

// ── Cooldown ticks down with updatePlayer ─────────────────────
console.log('\nCooldown decay');

resetToPlaying();
G.handleInput('left');
const cd1 = G.laneCooldown_get();
G.updatePlayer(0.05);                  // 50ms tick
const cd2 = G.laneCooldown_get();
check('Cooldown decreases after updatePlayer tick', cd2 < cd1, `before=${cd1} after=${cd2}`);
G.updatePlayer(0.06);                  // another 60ms — total > 100ms
check('Cooldown reaches 0 after enough time', G.laneCooldown_get() === 0);

// ── Jump: state machine ───────────────────────────────────────
console.log('\nJump state machine');

resetToPlaying();
check('Player starts in run state',   G.Player.state === 'run');
G.handleInput('jump');
check('Jump transitions run → jump',  G.Player.state === 'jump');
check('Player.vy set to JUMP_VY',     G.Player.vy === G.JUMP_VY, `got ${G.Player.vy}`);

// Cannot jump again while airborne
G.handleInput('jump');
check('Cannot double-jump (state stays jump)', G.Player.state === 'jump');

// Cannot slide while jumping
G.handleInput('slideStart');
check('Cannot slide while jumping (state stays jump)', G.Player.state === 'jump');

// ── Jump arc: player rises then falls ─────────────────────────
console.log('\nJump arc kinematics');

resetToPlaying();
const groundLandY = groundY - G.PLAYER_H;
G.handleInput('jump');
const yAtStart = G.Player.y;

// Simulate 10 frames at 16ms each (approx 160ms of jump)
let minY = G.Player.y;
for (let i = 0; i < 10; i++) {
    G.updatePlayer(0.016);
    if (G.Player.y < minY) minY = G.Player.y;
}
check('Player rises above start during jump', minY < yAtStart, `minY=${minY}, start=${yAtStart}`);

// Simulate until landing (max 120 frames = 2s — well beyond air time)
for (let i = 0; i < 120; i++) {
    if (G.Player.state !== 'jump') break;
    G.updatePlayer(0.016);
}
check('Player lands (state returns to run)', G.Player.state === 'run', `state=${G.Player.state}`);
check('Player.y at ground level after landing', Math.abs(G.Player.y - groundLandY) < 1,
      `y=${G.Player.y}, expected=${groundLandY}`);
check('Player.vy = 0 after landing', G.Player.vy === 0);

// ── Slide: state machine ──────────────────────────────────────
console.log('\nSlide state machine');

resetToPlaying();
G.handleInput('slideStart');
check('Slide transitions run → slide', G.Player.state === 'slide');

// Hitbox should be half height while sliding
const slideHitboxH = G.Player.hitbox.h;
G.handleInput('slideEnd');
check('slideEnd transitions slide → run', G.Player.state === 'run');

const runHitboxH = G.Player.hitbox.h;
check('Slide hitbox shorter than run hitbox', slideHitboxH < runHitboxH,
      `slide=${slideHitboxH} run=${runHitboxH}`);

// Cannot jump while sliding
resetToPlaying();
G.handleInput('slideStart');
G.handleInput('jump');
check('Cannot jump while sliding (state stays slide)', G.Player.state === 'slide');

// ── Hitbox per state ──────────────────────────────────────────
console.log('\nHitbox shapes');

// Run
resetToPlaying();
G.updatePlayerHitbox();
const runHB = { ...G.Player.hitbox };

// Slide
resetToPlaying();
G.handleInput('slideStart');
const slideHB = { ...G.Player.hitbox };
check('Slide hitbox height <= run hitbox height / 2',
      slideHB.h <= runHB.h / 2 + 1,
      `slideH=${slideHB.h} runH=${runHB.h}`);

// Jump (before gravity moves player)
resetToPlaying();
G.handleInput('jump');
const jumpHB = { ...G.Player.hitbox };
check('Jump hitbox narrower than run hitbox', jumpHB.w < runHB.w,
      `jumpW=${jumpHB.w} runW=${runHB.w}`);
check('Jump hitbox height same as run', jumpHB.h === runHB.h,
      `jumpH=${jumpHB.h} runH=${runHB.h}`);

// ── handleInput no-ops when not playing ──────────────────────
console.log('\nhandleInput guards');

resetToPlaying();
G.GameState.phase = 'start';
const laneBefore = G.Player.lane;
G.handleInput('left');
check('handleInput no-op on start screen', G.Player.lane === laneBefore);

G.GameState.phase = 'dead';
G.handleInput('jump');
check('handleInput no-op on game-over screen', G.Player.state !== 'jump');

// ═════════════════════════════════════════════════════════════
// Summary
// ═════════════════════════════════════════════════════════════
console.log(`\n── Results: ${passed} passed, ${failed} failed ──\n`);
process.exit(failed > 0 ? 1 : 0);
