#!/usr/bin/env node
/**
 * DashRunner — Ticket M6 Acceptance-Criteria Test
 * Start Screen, Game-Over Screen & localStorage High Score
 *
 * Test strategy:
 *   1. Static analysis  — grep source for required identifiers and patterns.
 *   2. Simulation       — eval game script in Node mock; exercise the full
 *      death → save → restart → start-screen loop; verify localStorage
 *      read/write, "New Best!" flag, high-score display, restartGame flow.
 *
 * Acceptance criteria tested:
 *   AC1  Start screen displays title, controls cheat-sheet, stored high score
 *        (or '---' on first play)
 *   AC2  Game begins on keypress or tap from start screen
 *   AC3  Game-Over screen shows final distance, final coin count, high score
 *   AC4  'New Best!' label appears when run beats stored record; high score updated
 *   AC5  Visible Restart button on game-over screen; Restart resets GameState
 *        and transitions to 'start' phase
 *   AC6  High score persists across sessions via localStorage key 'dashrunner_hs'
 *   AC7  Game-Over screen includes "Best score saved on this browser" note
 *
 * Run:  node test_screens.js
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

// ── Extract game script ────────────────────────────────────────
const scriptMatch = src.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) {
    console.error('FAIL  No <script> block found in dashrunner.html');
    process.exit(1);
}
const gameScript = scriptMatch[1];

// ── Canvas context mock ───────────────────────────────────────
// IMPORTANT: getContext() must always return the SAME object so that the
// game's captured `ctx` reference and our test patch point to the same thing.
const mockCtx = {
    clearRect:    () => {},
    fillRect:     () => {},
    strokeRect:   () => {},
    fillText:     () => {},          // patched per-test below
    beginPath:    () => {},
    moveTo:       () => {},
    lineTo:       () => {},
    stroke:       () => {},
    arc:          () => {},
    fill:         () => {},
    save:         () => {},
    restore:      () => {},
    setLineDash:  () => {},
    measureText:  (t) => ({ width: t.length * 8 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
    font: '', textAlign: '', textBaseline: '',
};

const mockCanvas = {
    width: 800, height: 600,
    getContext: () => mockCtx,    // always the same object — tests can patch mockCtx.fillText
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

// ── Build game environment ────────────────────────────────────
// lsData: optional { bestDistance, bestCoins } to pre-seed localStorage.
function buildGameEnv(lsData = null) {
    const lsStore = {};
    if (lsData) {
        lsStore['dashrunner_hs'] = JSON.stringify(lsData);
    }
    const mockLS = {
        _store: lsStore,
        getItem:    (k)    => lsStore[k] !== undefined ? lsStore[k] : null,
        setItem:    (k, v) => { lsStore[k] = String(v); },
        removeItem: (k)    => { delete lsStore[k]; },
    };

    const env = {};
    const fn  = new Function(
        'document', 'window', 'performance',
        'requestAnimationFrame', 'localStorage', 'env',
        `
${gameScript}
env.GameState             = GameState;
env.Player                = Player;
env.handleInput           = handleInput;
env.handleHit             = handleHit;
env.updatePlayer          = updatePlayer;
env.updateObstacles       = updateObstacles;
env.updateCoins           = updateCoins;
env.updatePowerUps        = updatePowerUps;
env.updatePlayerHitbox    = updatePlayerHitbox;
env.startGame             = startGame;
env.restartGame           = restartGame;
env.loadHighScore         = loadHighScore;
env.saveHighScore         = saveHighScore;
env.draw                  = draw;
env.drawStartOverlay      = drawStartOverlay;
env.drawGameOverOverlay   = drawGameOverOverlay;
env.getLaneCenterX        = getLaneCenterX;
env.highScore_getter      = () => highScore;
env.newBestAchieved_getter = () => newBestAchieved;
env.localStorage          = localStorage;
env.INITIAL_TRACK_SPEED   = INITIAL_TRACK_SPEED;
env.INITIAL_SPAWN_GAP     = INITIAL_SPAWN_GAP;
env.NUM_LANES             = NUM_LANES;
env.PLAYER_H              = PLAYER_H;
env.POWERUP_SPAWN_DIST    = POWERUP_SPAWN_DIST;
`
    );
    fn(
        mockDocument, mockWindow, mockPerf,
        (cb) => { /* no-op rAF */ },
        mockLS,
        env,
    );
    return { env, mockLS };
}

// Helper: capture fillText calls during a draw function invocation.
// Patches mockCtx.fillText for the duration of the call then restores it.
function captureDrawText(drawFn) {
    const captured = [];
    const prev = mockCtx.fillText;
    mockCtx.fillText = (t) => { captured.push(String(t)); };
    try {
        drawFn();
    } finally {
        mockCtx.fillText = prev;
    }
    return captured;
}

// ═════════════════════════════════════════════════════════════
// SECTION 1 — Static analysis
// ═════════════════════════════════════════════════════════════

console.log('\nDashRunner M6 — Start Screen, Game-Over Screen & localStorage High Score');
console.log('\n── Section 1: Static analysis ───────────────────────────');

console.log('\nAC6: localStorage key and schema');
includes('dashrunner_hs',                    "localStorage key 'dashrunner_hs' present");
includes('bestDistance',                     'bestDistance field in hs schema');
includes('bestCoins',                        'bestCoins field in hs schema');
includes('loadHighScore',                    'loadHighScore function defined');
includes('saveHighScore',                    'saveHighScore function defined');
includes(/localStorage\.getItem/,            'localStorage.getItem used in loadHighScore');
includes(/localStorage\.setItem/,            'localStorage.setItem used in saveHighScore');
includes(/try\s*\{[\s\S]*?localStorage/,     'localStorage wrapped in try/catch');

console.log('\nAC1: Start screen static elements');
includes('DASHRUNNER',                       "Start screen title 'DASHRUNNER' drawn");
includes('Switch lanes',                     'Controls cheat-sheet entry for lane switch');
includes('Jump',                             'Controls cheat-sheet entry for jump');
includes('Slide',                            'Controls cheat-sheet entry for slide');
includes('Best: ---',                        "Default 'Best: ---' text for first play");
includes('Press any key or tap to start',    "Start prompt drawn on start screen");

console.log('\nAC3 + AC7: Game-Over screen static elements');
includes('GAME OVER',                        "'GAME OVER' title drawn on game-over screen");
includes('GameState.distanceM',             'Final distance rendered from GameState');
includes('GameState.coins',                 'Final coin count rendered from GameState');
includes('Best score saved on this browser', 'Cross-device disclaimer note present');

console.log('\nAC4: New Best! label');
includes('New Best',                         "'New Best!' label defined in drawGameOverOverlay");
includes('newBestAchieved',                  'newBestAchieved flag referenced in overlay draw');

console.log('\nAC5: Restart button');
includes('RESTART',                          "Visible RESTART button label drawn");
includes('restartGame',                      'restartGame function defined');

console.log('\nSecurity: no innerHTML / no DOM string injection');
check(
    'innerHTML not used at all (all text via fillText)',
    (src.match(/innerHTML\s*=/g) || []).length === 0,
    'Found innerHTML= usage'
);
includes('fillText',                         'fillText used for text rendering');

// ═════════════════════════════════════════════════════════════
// SECTION 2 — Simulation
// ═════════════════════════════════════════════════════════════

console.log('\n── Section 2: Simulation ────────────────────────────────');

// ── Test 2.1: loadHighScore on first play (no stored data) ───
console.log('\n2.1  loadHighScore — no stored data (first play)');
{
    const { env } = buildGameEnv(null);
    const hs = env.highScore_getter();
    check('bestDistance defaults to 0', hs.bestDistance === 0);
    check('bestCoins defaults to 0',    hs.bestCoins    === 0);
}

// ── Test 2.2: loadHighScore reads stored record ───────────────
console.log('\n2.2  loadHighScore — existing record is read correctly');
{
    const stored = { bestDistance: 1500, bestCoins: 42 };
    const { env } = buildGameEnv(stored);
    const hs = env.highScore_getter();
    check(`bestDistance read as ${stored.bestDistance}`, hs.bestDistance === stored.bestDistance);
    check(`bestCoins read as ${stored.bestCoins}`,       hs.bestCoins    === stored.bestCoins);
}

// ── Test 2.3: saveHighScore writes new record to localStorage ─
console.log('\n2.3  saveHighScore — new record is persisted to localStorage');
{
    const { env, mockLS } = buildGameEnv(null);
    env.GameState.distanceM = 850.7;
    env.GameState.coins     = 19;
    env.saveHighScore();

    const raw = mockLS.getItem('dashrunner_hs');
    check('dashrunner_hs written to localStorage', raw !== null);
    const parsed = JSON.parse(raw);
    check('bestDistance persisted correctly', parsed.bestDistance === 850);  // Math.floor
    check('bestCoins persisted correctly',    parsed.bestCoins    === 19);
    check('newBestAchieved is true after new record', env.newBestAchieved_getter() === true);
}

// ── Test 2.4: saveHighScore does NOT write if record not beaten ─
console.log('\n2.4  saveHighScore — no write when record not beaten');
{
    const stored = { bestDistance: 2000, bestCoins: 100 };
    const { env, mockLS } = buildGameEnv(stored);
    env.GameState.distanceM = 500;
    env.GameState.coins     = 10;
    env.saveHighScore();

    const raw = mockLS.getItem('dashrunner_hs');
    if (raw !== null) {
        const parsed = JSON.parse(raw);
        check('bestDistance NOT overwritten by shorter run', parsed.bestDistance >= stored.bestDistance);
    } else {
        // No write at all is also correct (record not beaten → no update needed)
        check('localStorage not rewritten with inferior run', true);
    }
    check('newBestAchieved is false when record not beaten', env.newBestAchieved_getter() === false);
}

// ── Test 2.5: highScore updates in memory and newBest flag set ─
console.log('\n2.5  saveHighScore — in-memory highScore updated on new record');
{
    const stored = { bestDistance: 300, bestCoins: 5 };
    const { env } = buildGameEnv(stored);
    env.GameState.distanceM = 1200.5;
    env.GameState.coins     = 3;   // distance beats record, coins do not
    env.saveHighScore();
    const hs = env.highScore_getter();
    check('highScore.bestDistance updated to new record', hs.bestDistance === 1200);
    check('highScore.bestCoins unchanged (previous was higher)', hs.bestCoins === 5);
    check('newBestAchieved true (distance improved)', env.newBestAchieved_getter() === true);
}

// ── Test 2.6: handleHit death calls saveHighScore ─────────────
console.log('\n2.6  handleHit — saveHighScore called on final life lost');
{
    const { env, mockLS } = buildGameEnv(null);
    env.startGame();
    env.GameState.distanceM = 420;
    env.GameState.coins     = 8;
    env.GameState.lives     = 1;
    env.Player.lives        = 1;
    env.Player.invincible   = false;

    env.handleHit();  // final hit → lives = 0 → phase = 'dead'

    check("phase set to 'dead' after final hit", env.GameState.phase === 'dead');
    const raw = mockLS.getItem('dashrunner_hs');
    check('localStorage written on death (high score saved)', raw !== null);
}

// ── Test 2.7: restartGame resets to 'start' phase ─────────────
console.log('\n2.7  restartGame — resets GameState to start phase');
{
    const { env } = buildGameEnv(null);
    env.startGame();
    env.GameState.phase     = 'dead';
    env.GameState.distanceM = 999;
    env.GameState.coins     = 50;
    env.GameState.lives     = 0;

    env.restartGame();

    check("GameState.phase reset to 'start'",    env.GameState.phase      === 'start');
    check('GameState.distanceM reset to 0',       env.GameState.distanceM  === 0);
    check('GameState.coins reset to 0',           env.GameState.coins      === 0);
    check('GameState.lives reset to 3',           env.GameState.lives      === 3);
    check('GameState.elapsedPlayMs reset to 0',   env.GameState.elapsedPlayMs === 0);
    check('GameState.activeEffect reset to null',  env.GameState.activeEffect === null);
    check('GameState.trackSpeed reset to initial', env.GameState.trackSpeed === env.INITIAL_TRACK_SPEED);
}

// ── Test 2.8: drawStartOverlay shows '---' with no stored score ─
console.log('\n2.8  drawStartOverlay — shows "---" on first play');
{
    const { env } = buildGameEnv(null);
    // highScore.bestDistance === 0 → should display 'Best: ---'
    const captured = captureDrawText(() => env.drawStartOverlay(800, 600));
    check(
        "Start screen shows 'Best: ---' with no stored score",
        captured.some(t => t.includes('---')),
        `fillText calls: ${JSON.stringify(captured)}`
    );
    check(
        "'DASHRUNNER' title rendered on start screen",
        captured.some(t => t.includes('DASHRUNNER')),
        `fillText calls: ${JSON.stringify(captured)}`
    );
}

// ── Test 2.9: drawStartOverlay shows stored high score ─────────
console.log('\n2.9  drawStartOverlay — shows stored high score');
{
    const { env } = buildGameEnv({ bestDistance: 777, bestCoins: 33 });
    const captured = captureDrawText(() => env.drawStartOverlay(800, 600));
    check(
        "Start screen shows stored bestDistance (777)",
        captured.some(t => t.includes('777')),
        `fillText calls: ${JSON.stringify(captured)}`
    );
    check(
        "Start screen shows stored bestCoins (33)",
        captured.some(t => t.includes('33')),
        `fillText calls: ${JSON.stringify(captured)}`
    );
    // Should NOT show '---' when a record exists
    check(
        "Start screen does NOT show '---' when a record exists",
        !captured.some(t => t.includes('---')),
        `Unexpected '---' found in: ${JSON.stringify(captured)}`
    );
}

// ── Test 2.10: drawGameOverOverlay shows final stats + note ────
console.log('\n2.10 drawGameOverOverlay — shows distance, coins, disclaimer');
{
    const { env } = buildGameEnv(null);
    env.startGame();
    env.GameState.distanceM = 350;
    env.GameState.coins     = 12;
    env.GameState.phase     = 'dead';

    const captured = captureDrawText(() => env.drawGameOverOverlay(800, 600));

    check(
        "Game-over screen renders 'GAME OVER'",
        captured.some(t => t.includes('GAME OVER')),
        `fillText calls: ${JSON.stringify(captured)}`
    );
    check(
        "Game-over screen shows final distance (350)",
        captured.some(t => t.includes('350')),
        `fillText calls: ${JSON.stringify(captured)}`
    );
    check(
        "Game-over screen shows final coins (12)",
        captured.some(t => t.includes('12')),
        `fillText calls: ${JSON.stringify(captured)}`
    );
    check(
        "Game-over screen has 'Best score saved on this browser' disclaimer",
        captured.some(t => t.includes('Best score saved on this browser')),
        `fillText calls: ${JSON.stringify(captured)}`
    );
    check(
        "Restart button label 'RESTART' rendered",
        captured.some(t => t.includes('RESTART')),
        `fillText calls: ${JSON.stringify(captured)}`
    );
}

// ── Test 2.11: "New Best!" shown only when record beaten ────────
console.log('\n2.11 drawGameOverOverlay — "New Best!" badge only when record beaten');
{
    // Run that beats the record
    const { env } = buildGameEnv({ bestDistance: 100, bestCoins: 5 });
    env.GameState.distanceM = 500;
    env.GameState.coins     = 20;
    env.saveHighScore();  // sets newBestAchieved = true

    const capturedBest = captureDrawText(() => env.drawGameOverOverlay(800, 600));
    check(
        "'New Best!' badge visible after record-breaking run",
        capturedBest.some(t => t.toLowerCase().includes('new best')),
        `fillText calls: ${JSON.stringify(capturedBest)}`
    );
}
{
    // Run that does NOT beat the record
    const { env } = buildGameEnv({ bestDistance: 2000, bestCoins: 100 });
    env.GameState.distanceM = 50;
    env.GameState.coins     = 1;
    env.saveHighScore();  // newBestAchieved = false

    const capturedNoBest = captureDrawText(() => env.drawGameOverOverlay(800, 600));
    check(
        "'New Best!' NOT shown when record not beaten",
        !capturedNoBest.some(t => t.toLowerCase().includes('new best')),
        `Unexpected "new best" text in: ${JSON.stringify(capturedNoBest)}`
    );
}

// ── Test 2.12: localStorage try/catch — blocked LS ─────────────
console.log('\n2.12 localStorage error handling — blocked storage does not crash');
{
    const throwingLS = {
        getItem:  () => { throw new Error('SecurityError: localStorage blocked'); },
        setItem:  () => { throw new Error('SecurityError: localStorage blocked'); },
    };

    const env = {};
    const fn  = new Function(
        'document', 'window', 'performance',
        'requestAnimationFrame', 'localStorage', 'env',
        `
${gameScript}
env.loadHighScore        = loadHighScore;
env.saveHighScore        = saveHighScore;
env.GameState            = GameState;
env.highScore_getter     = () => highScore;
env.newBestAchieved_getter = () => newBestAchieved;
`
    );

    let crashed = false;
    try {
        fn(mockDocument, mockWindow, mockPerf, () => {}, throwingLS, env);
        // Only test load — do not call saveHighScore here because that would
        // update the in-memory highScore.bestDistance, invalidating the defaults check.
        env.loadHighScore();
    } catch (e) {
        crashed = true;
    }
    check('Blocked localStorage does not crash the game', !crashed,
        crashed ? 'An exception escaped try/catch blocks' : '');

    if (!crashed) {
        const hs = env.highScore_getter();
        check(
            'highScore still has valid defaults after blocked read',
            hs.bestDistance === 0 && hs.bestCoins === 0,
            `Got bestDistance=${hs.bestDistance}, bestCoins=${hs.bestCoins}`
        );
    }
}
{
    // Separate sub-test: blocked setItem doesn't crash during saveHighScore
    const throwingSetItemLS = {
        getItem:  () => null,   // read succeeds (returns null = no stored data)
        setItem:  () => { throw new Error('QuotaExceededError'); },
    };

    const env2 = {};
    const fn2  = new Function(
        'document', 'window', 'performance',
        'requestAnimationFrame', 'localStorage', 'env',
        `
${gameScript}
env.saveHighScore = saveHighScore;
env.GameState     = GameState;
`
    );

    let savecrashed = false;
    try {
        fn2(mockDocument, mockWindow, mockPerf, () => {}, throwingSetItemLS, env2);
        env2.GameState.distanceM = 100;
        env2.GameState.coins     = 5;
        env2.saveHighScore();
    } catch (e) {
        savecrashed = true;
    }
    check('Blocked setItem (QuotaExceededError) does not crash saveHighScore', !savecrashed);
}

// ── Test 2.13: startGame triggered from 'start' phase ──────────
console.log('\n2.13 startGame — transitions from "start" to "playing"');
{
    const { env } = buildGameEnv(null);
    check("Initial phase is 'start'", env.GameState.phase === 'start');
    env.startGame();
    check("After startGame(), phase is 'playing'", env.GameState.phase === 'playing');
}

// ── Test 2.14: full loop — play → die → restart → start ────────
console.log('\n2.14 Full loop: play → die → restart → start screen');
{
    const { env, mockLS } = buildGameEnv(null);

    // Start the game
    env.startGame();
    check("Phase is 'playing' after startGame()", env.GameState.phase === 'playing');

    // Simulate travel and coins collected
    env.GameState.distanceM = 200;
    env.GameState.coins     = 7;

    // Lose all lives
    env.GameState.lives   = 1;
    env.Player.lives      = 1;
    env.Player.invincible = false;
    env.handleHit();
    check("Phase is 'dead' after losing last life", env.GameState.phase === 'dead');

    // High score was saved
    const raw = mockLS.getItem('dashrunner_hs');
    check('High score saved on death', raw !== null);
    if (raw) {
        const parsed = JSON.parse(raw);
        check('Saved distance matches run', parsed.bestDistance === 200);
    }

    // Restart returns to start screen
    env.restartGame();
    check("Phase is 'start' after restartGame()", env.GameState.phase === 'start');
    check('distanceM reset to 0 after restart',   env.GameState.distanceM  === 0);
    check('coins reset to 0 after restart',        env.GameState.coins      === 0);
    check('lives reset to 3 after restart',        env.GameState.lives      === 3);
}

// ═════════════════════════════════════════════════════════════
// Summary
// ═════════════════════════════════════════════════════════════
console.log(`\n── Results: ${passed} passed, ${failed} failed ──\n`);
process.exit(failed > 0 ? 1 : 0);
