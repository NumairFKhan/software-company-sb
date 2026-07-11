#!/usr/bin/env node
/**
 * DashRunner — Ticket M5 Acceptance-Criteria Test
 * Mobile Touch / Swipe Controls
 *
 * Test strategy:
 *   1. Static analysis — grep source for required constants and listener patterns.
 *   2. Simulation — eval game script in Node mock; exercise touchstart/touchmove/touchend
 *      sequences and verify the correct handleInput() actions are fired.
 *
 * Acceptance criteria tested:
 *   AC1  Swipe left/right triggers lane switch; swipe up triggers jump; swipe down triggers slide
 *   AC2  Gesture requires minimum 30px delta and completes within 250ms
 *   AC3  Swipe gestures call preventDefault on touchmove only while gesture is in-flight,
 *        scoped to the canvas element (not window/document)
 *   AC4  No iOS Safari scroll conflicts (passive:false on canvas touchmove only)
 *   AC6  Touch input fires the same handleInput() as keyboard — no duplicate logic
 *
 * Run:  node test_touch.js
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

// Capture addEventListener calls per target so we can fire synthetic events
const canvasListeners  = {};  // type → [{handler, opts}]
const documentListeners = {};
const windowListeners   = {};

function makeAddListener(store) {
    return (type, handler, opts) => {
        if (!store[type]) store[type] = [];
        store[type].push({ handler, opts: opts || {} });
    };
}

const mockCanvas = {
    width: 800, height: 600,
    getContext: () => ({
        clearRect:            () => {},
        fillRect:             () => {},
        strokeRect:           () => {},
        fillText:             () => {},
        beginPath:            () => {},
        moveTo:               () => {},
        lineTo:               () => {},
        stroke:               () => {},
        arc:                  () => {},
        fill:                 () => {},
        save:                 () => {},
        restore:              () => {},
        setLineDash:          () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
        fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
        font: '', textAlign: '', textBaseline: '',
    }),
    addEventListener: makeAddListener(canvasListeners),
};

const mockDocument = {
    getElementById:  (id) => id === 'gameCanvas' ? mockCanvas : null,
    addEventListener: makeAddListener(documentListeners),
};
const mockWindow = {
    innerWidth: 800, innerHeight: 600,
    addEventListener: makeAddListener(windowListeners),
};

let perfNowVal = 0;
const mockPerf = { now: () => perfNowVal };

// Collected setTimeout calls so we can fire them manually in tests
const pendingTimeouts = [];
function mockSetTimeout(fn, delay) {
    pendingTimeouts.push({ fn, delay });
    return pendingTimeouts.length - 1;
}
function flushTimeouts() {
    while (pendingTimeouts.length > 0) {
        const t = pendingTimeouts.shift();
        t.fn();
    }
}

// Track handleInput calls via a wrapper written into env
const inputLog = [];

function buildGameEnv() {
    const env = {};
    const fn  = new Function(
        'document', 'window', 'performance', 'setTimeout',
        'requestAnimationFrame', 'localStorage', 'env',
        `
${gameScript}
env.GameState            = GameState;
env.Player               = Player;
env.handleInput_orig     = handleInput;
env.startGame            = startGame;
env.restartGame          = restartGame;
env.getLaneCenterX       = getLaneCenterX;
env.updatePlayerHitbox   = updatePlayerHitbox;
env.SWIPE_MIN_DELTA      = SWIPE_MIN_DELTA;
env.SWIPE_MAX_MS         = SWIPE_MAX_MS;
env.SWIPE_PREVENT_PX     = SWIPE_PREVENT_PX;
env.SLIDE_AUTO_RELEASE_MS = SLIDE_AUTO_RELEASE_MS;
env.NUM_LANES            = NUM_LANES;
env.INITIAL_TRACK_SPEED  = INITIAL_TRACK_SPEED;
env.PLAYER_H             = PLAYER_H;
env.PLAYER_W             = PLAYER_W;
`
    );
    fn(
        mockDocument, mockWindow, mockPerf, mockSetTimeout,
        (cb) => { /* no-op rAF */ },
        { getItem: () => null, setItem: () => {} },
        env,
    );
    return env;
}

// ── Helper: fire a synthetic touch event sequence ─────────────
// Fires touchstart, optional touchmove events, then touchend on the canvas.
function fireSwipe({ x0, y0, x1, y1, durationMs = 150 }) {
    const preventedMoves = [];

    const mockTouchStartEvt = {
        touches: [{ clientX: x0, clientY: y0 }],
        changedTouches: [{ clientX: x0, clientY: y0 }],
        preventDefault: () => {},
    };

    // Set perf.now to gesture start time
    perfNowVal = 1000;  // baseline

    // Fire touchstart
    (canvasListeners['touchstart'] || []).forEach(({ handler }) => handler(mockTouchStartEvt));

    // Fire a touchmove mid-gesture
    const midX = (x0 + x1) / 2;
    const midY = (y0 + y1) / 2;
    let preventCalled = false;
    const mockTouchMoveEvt = {
        touches: [{ clientX: midX, clientY: midY }],
        changedTouches: [{ clientX: midX, clientY: midY }],
        preventDefault: () => { preventCalled = true; },
    };
    (canvasListeners['touchmove'] || []).forEach(({ handler }) => handler(mockTouchMoveEvt));
    preventedMoves.push(preventCalled);

    // Advance time by durationMs
    perfNowVal = 1000 + durationMs;

    // Fire touchend
    const mockTouchEndEvt = {
        touches: [],
        changedTouches: [{ clientX: x1, clientY: y1 }],
        preventDefault: () => {},
    };
    (canvasListeners['touchend'] || []).forEach(({ handler }) => handler(mockTouchEndEvt));

    return { preventedMoves };
}

// ── Helper: put game into playing state ────────────────────────
function setPlaying(env) {
    env.startGame();
}

// ═════════════════════════════════════════════════════════════
// SECTION 1 — Static analysis
// ═════════════════════════════════════════════════════════════

console.log('\nDashRunner M5 — Mobile Touch / Swipe Controls');
console.log('\n── Static analysis ──────────────────────────────────────');

console.log('\nM5 constants');
includes('SWIPE_MIN_DELTA',      'SWIPE_MIN_DELTA constant defined (min swipe distance)');
includes('SWIPE_MAX_MS',         'SWIPE_MAX_MS constant defined (max gesture window)');
includes('SWIPE_PREVENT_PX',     'SWIPE_PREVENT_PX constant defined (preventDefault threshold)');
includes('SLIDE_AUTO_RELEASE_MS','SLIDE_AUTO_RELEASE_MS constant defined (auto-release duration)');

console.log('\nM5 gesture recognizer structure');
includes('touchstart',           'touchstart listener registered');
includes('touchmove',            'touchmove listener registered');
includes('touchcancel',          'touchcancel listener registered (interrupt handling)');
includes('gestureActive',        'gestureActive flag tracks in-flight gesture');
includes('changedTouches',       'touchend reads changedTouches for final position');

console.log('\nM5 passive:false on touchmove (required for iOS Safari 16+)');
// The touchmove on canvas must use passive:false to allow preventDefault.
// We check for the presence of both strings in the source (dynamic listener
// registration tests below confirm they are correctly combined).
includes(/passive\s*:\s*false/,
         'source contains passive: false (required for touchmove on iOS Safari 16+)');

console.log('\nM5 direction classification');
includes('Math.abs(dx) > Math.abs(dy)',
         'horizontal vs vertical classification via |dx|>|dy|');
includes("handleInput('jump')",     "swipe up fires handleInput('jump')");
includes("handleInput('slideStart')",  "swipe down fires handleInput('slideStart')");
includes("handleInput('slideEnd')",    'slide auto-release fires handleInput("slideEnd")');
includes("handleInput(dx < 0 ? 'left' : 'right')",
         'horizontal swipe fires left or right action');

console.log('\nM5 threshold enforcement');
includes('SWIPE_MIN_DELTA', 'SWIPE_MIN_DELTA used in gesture validation');
includes('SWIPE_MAX_MS',    'SWIPE_MAX_MS used in gesture validation');

console.log('\nM5 no duplicate logic');
// The swipe handler must call handleInput() — not duplicate the action logic inline.
const directStateSet = /gestureActive[^}]*Player\.state\s*=/.test(src);
check('SwipeRecognizer does not set Player.state directly (no duplicate logic)',
      !directStateSet);

// ═════════════════════════════════════════════════════════════
// SECTION 2 — Listener registration checks
// ═════════════════════════════════════════════════════════════

console.log('\n── Listener registration ────────────────────────────────');

// Build env to capture listeners
buildGameEnv();

check('touchstart listener registered on canvas',
      (canvasListeners['touchstart'] || []).length > 0);
check('touchmove listener registered on canvas',
      (canvasListeners['touchmove'] || []).length > 0);
// touchend: at least one for start/restart + one for SwipeRecognizer
check('touchend listener(s) registered on canvas',
      (canvasListeners['touchend'] || []).length >= 1);
check('touchcancel listener registered on canvas',
      (canvasListeners['touchcancel'] || []).length > 0);

// Verify touchmove has passive:false
const touchmoveListeners = canvasListeners['touchmove'] || [];
const hasPassiveFalse = touchmoveListeners.some(l => l.opts && l.opts.passive === false);
check('canvas touchmove listener has { passive: false }', hasPassiveFalse,
      'required for preventDefault on iOS Safari 16+');

// Verify touchmove is NOT on document or window
const docTouchMove = (documentListeners['touchmove'] || []).length;
const winTouchMove = (windowListeners['touchmove'] || []).length;
check('touchmove NOT attached to document (canvas-scoped only)', docTouchMove === 0);
check('touchmove NOT attached to window (canvas-scoped only)',  winTouchMove === 0);

// ═════════════════════════════════════════════════════════════
// SECTION 3 — Gesture simulation
// ═════════════════════════════════════════════════════════════

console.log('\n── Gesture simulation ───────────────────────────────────');

// Rebuild a fresh env for simulation tests.
// Reset listener stores.
Object.keys(canvasListeners).forEach(k => delete canvasListeners[k]);
Object.keys(documentListeners).forEach(k => delete documentListeners[k]);
Object.keys(windowListeners).forEach(k => delete windowListeners[k]);
pendingTimeouts.length = 0;

const env = buildGameEnv();
setPlaying(env);

// Intercept handleInput to log calls
const actionsLog = [];
const origHandleInput = env.handleInput_orig;

// Patch the handleInput in the closure by replacing it via the listener mechanism:
// Since we can't easily patch the closed-over handleInput, we instead check
// Player.lane / Player.state before and after gestures.

console.log('\nSwipe LEFT (−50px x, 0 y, 150ms) → lane switch left');
{
    const before = env.Player.lane;
    // Start in center lane; ensure cooldown is 0
    env.startGame();
    env.Player.lane = 1;
    env.Player.x    = env.getLaneCenterX(1);
    env.updatePlayerHitbox();

    fireSwipe({ x0: 400, y0: 300, x1: 350, y1: 300, durationMs: 150 });
    const after = env.Player.lane;
    check('Swipe left (50px, 150ms) switches lane from 1 → 0',
          after === 0, `lane was ${before}, now ${after}`);
}

console.log('\nSwipe RIGHT (+50px x, 0 y, 150ms) → lane switch right');
{
    env.startGame();
    env.Player.lane = 1;
    env.Player.x    = env.getLaneCenterX(1);
    env.updatePlayerHitbox();

    fireSwipe({ x0: 350, y0: 300, x1: 400, y1: 300, durationMs: 150 });
    const after = env.Player.lane;
    check('Swipe right (50px, 150ms) switches lane from 1 → 2',
          after === 2, `lane now ${after}`);
}

console.log('\nSwipe UP (0 x, −50px y, 150ms) → jump');
{
    env.startGame();
    env.Player.state = 'run';

    fireSwipe({ x0: 400, y0: 350, x1: 400, y1: 300, durationMs: 150 });
    const state = env.Player.state;
    check("Swipe up (50px, 150ms) sets player state to 'jump'",
          state === 'jump', `state is '${state}'`);
}

console.log('\nSwipe DOWN (0 x, +50px y, 150ms) → slide, then auto-release');
{
    env.startGame();
    env.Player.state = 'run';
    pendingTimeouts.length = 0;

    fireSwipe({ x0: 400, y0: 300, x1: 400, y1: 350, durationMs: 150 });
    const stateAfterSwipe = env.Player.state;
    check("Swipe down (50px, 150ms) sets player state to 'slide'",
          stateAfterSwipe === 'slide', `state is '${stateAfterSwipe}'`);

    // Fire the auto-release setTimeout
    flushTimeouts();
    const stateAfterRelease = env.Player.state;
    check("Auto-release (slideEnd) restores player state to 'run'",
          stateAfterRelease === 'run', `state after release is '${stateAfterRelease}'`);
}

console.log('\nMinimum distance threshold: <30px swipe → no action');
{
    env.startGame();
    env.Player.lane  = 1;
    env.Player.state = 'run';

    // Only 20px → below SWIPE_MIN_DELTA of 30px
    fireSwipe({ x0: 400, y0: 300, x1: 420, y1: 300, durationMs: 150 });
    const laneAfter  = env.Player.lane;
    check('Swipe < 30px is ignored (lane stays at 1)',
          laneAfter === 1, `lane is ${laneAfter}`);
}

console.log('\nMaximum time threshold: >250ms swipe → no action');
{
    env.startGame();
    env.Player.lane  = 1;
    env.Player.state = 'run';

    // 60px but 300ms → above SWIPE_MAX_MS of 250ms
    fireSwipe({ x0: 400, y0: 300, x1: 340, y1: 300, durationMs: 300 });
    const laneAfter = env.Player.lane;
    check('Swipe > 250ms is ignored (lane stays at 1)',
          laneAfter === 1, `lane is ${laneAfter}`);
}

console.log("\ntouch not in playing phase → no game action");
{
    // We need to set phase='start' BEFORE firing touchstart so that
    // gesturePhase is captured as 'start', preventing swipe processing.
    // (startGame() would set phase='playing', so we manually set phase here.)
    env.GameState.phase = 'start';
    env.Player.lane     = 1;
    env.Player.state    = 'run';

    // Fire touchstart with phase='start' to set gesturePhase='start'
    perfNowVal = 7000;
    const touchStartEvt = {
        touches: [{ clientX: 400, clientY: 300 }],
        changedTouches: [{ clientX: 400, clientY: 300 }],
        preventDefault: () => {},
    };
    (canvasListeners['touchstart'] || []).forEach(({ handler }) => handler(touchStartEvt));

    // Simulate: start/restart touchend fires (sets phase='playing'), THEN swipe touchend
    // In our fixed implementation, gesturePhase is still 'start' → swipe ignored
    env.GameState.phase = 'playing';  // mimic what startGame() touchend would do

    perfNowVal = 7000 + 150;
    const touchEndEvt = {
        touches: [],
        changedTouches: [{ clientX: 350, clientY: 300 }],  // 50px left — valid swipe
        preventDefault: () => {},
    };
    (canvasListeners['touchend'] || []).forEach(({ handler }) => handler(touchEndEvt));

    const laneAfter = env.Player.lane;
    check("Gesture begun in 'start' phase not processed even if phase changes to 'playing' by touchend",
          laneAfter === 1, `lane is ${laneAfter}`);
}

console.log('\npreventDefault called on touchmove when gesture is moving (in-flight)');
{
    env.startGame();
    env.Player.state = 'run';

    // Reset perfNow
    perfNowVal = 2000;
    let prevented = false;

    const touchStartEvt = {
        touches: [{ clientX: 400, clientY: 300 }],
        changedTouches: [{ clientX: 400, clientY: 300 }],
        preventDefault: () => {},
    };
    (canvasListeners['touchstart'] || []).forEach(({ handler }) => handler(touchStartEvt));

    // Move enough to cross SWIPE_PREVENT_PX
    const touchMoveEvt = {
        touches: [{ clientX: 415, clientY: 300 }],  // 15px > 10px PREVENT_PX
        changedTouches: [{ clientX: 415, clientY: 300 }],
        preventDefault: () => { prevented = true; },
    };
    (canvasListeners['touchmove'] || []).forEach(({ handler }) => handler(touchMoveEvt));

    check('preventDefault called on touchmove when delta > SWIPE_PREVENT_PX',
          prevented, `prevented=${prevented}`);
}

console.log('\npreventDefault NOT called on touchmove when movement is tiny');
{
    env.startGame();
    perfNowVal = 3000;

    const touchStartEvt = {
        touches: [{ clientX: 400, clientY: 300 }],
        changedTouches: [{ clientX: 400, clientY: 300 }],
        preventDefault: () => {},
    };
    (canvasListeners['touchstart'] || []).forEach(({ handler }) => handler(touchStartEvt));

    // Only 5px movement — below SWIPE_PREVENT_PX (10px)
    let prevented = false;
    const touchMoveEvt = {
        touches: [{ clientX: 405, clientY: 300 }],
        changedTouches: [{ clientX: 405, clientY: 300 }],
        preventDefault: () => { prevented = true; },
    };
    (canvasListeners['touchmove'] || []).forEach(({ handler }) => handler(touchMoveEvt));

    check('preventDefault NOT called when movement < SWIPE_PREVENT_PX',
          !prevented, `prevented=${prevented}`);
}

console.log('\ntouchcancel resets gesture (no phantom actions)');
{
    env.startGame();
    env.Player.lane  = 1;
    env.Player.state = 'run';
    perfNowVal = 4000;

    // Start a gesture
    const touchStartEvt = {
        touches: [{ clientX: 400, clientY: 300 }],
        changedTouches: [{ clientX: 400, clientY: 300 }],
        preventDefault: () => {},
    };
    (canvasListeners['touchstart'] || []).forEach(({ handler }) => handler(touchStartEvt));

    // Cancel it
    (canvasListeners['touchcancel'] || []).forEach(({ handler }) => handler({}));

    // Now fire touchend — should NOT trigger an action since gesture was cancelled
    perfNowVal = 4000 + 150;
    const touchEndEvt = {
        touches: [],
        changedTouches: [{ clientX: 340, clientY: 300 }],  // 60px left — would be valid swipe
        preventDefault: () => {},
    };
    (canvasListeners['touchend'] || []).forEach(({ handler }) => handler(touchEndEvt));

    const laneAfter = env.Player.lane;
    check('touchcancel cancels gesture; subsequent touchend does not switch lane',
          laneAfter === 1, `lane is ${laneAfter}`);
}

console.log('\nmulti-touch cancels gesture');
{
    env.startGame();
    env.Player.lane  = 1;
    env.Player.state = 'run';
    perfNowVal = 5000;

    // Start a single-finger gesture
    const touchStartEvt1 = {
        touches: [{ clientX: 400, clientY: 300 }],
        changedTouches: [{ clientX: 400, clientY: 300 }],
        preventDefault: () => {},
    };
    (canvasListeners['touchstart'] || []).forEach(({ handler }) => handler(touchStartEvt1));

    // Second finger arrives — multi-touch start, should cancel gesture
    const touchStartEvt2 = {
        touches: [{ clientX: 400, clientY: 300 }, { clientX: 200, clientY: 200 }],
        changedTouches: [{ clientX: 200, clientY: 200 }],
        preventDefault: () => {},
    };
    (canvasListeners['touchstart'] || []).forEach(({ handler }) => handler(touchStartEvt2));

    // Now fire touchend — should be no-op
    perfNowVal = 5000 + 150;
    const touchEndEvt = {
        touches: [],
        changedTouches: [{ clientX: 340, clientY: 300 }],
        preventDefault: () => {},
    };
    (canvasListeners['touchend'] || []).forEach(({ handler }) => handler(touchEndEvt));

    check('Multi-touch cancels gesture; touchend does not trigger action',
          env.Player.lane === 1, `lane is ${env.Player.lane}`);
}

// ═════════════════════════════════════════════════════════════
// Summary
// ═════════════════════════════════════════════════════════════

console.log(`\n────────────────────────────────────────────────────────`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
    process.exit(1);
} else {
    console.log('All M5 touch/swipe tests passed ✓');
    process.exit(0);
}
