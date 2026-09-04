/**
 * splashSequence.js — timing engine for the intro splash.
 *
 * Framework-free on purpose: one rAF loop mutates one plain object. React
 * never re-renders during the sequence.
 *
 * WHY THAT MATTERS HERE: this splash is on screen at exactly the moment your
 * dashboard is doing its heaviest work — mounting, opening the socket, laying
 * out the track diagram. A per-frame setState would compete with the very work
 * the splash exists to hide, and you would see it as a progress bar that ticks
 * in jerks.
 *
 * Part of the FlowState Rail intro splash. Self-contained — deleting the
 * SplashScreen folder and the two lines in src/index.js removes it entirely.
 */

/**
 * Does pressing LAUNCH repaint the train?
 *
 * true (current) — the E5 livery sweeps on nose-to-tail behind a glowing
 *                  wavefront, cabin lights surging in behind it, then hands
 *                  off to the dashboard.
 * false          — the train keeps its grey finish and Launch simply routes.
 *
 * Worth knowing why this reads as well as it does against the monochrome
 * scene: the world has no hue in it anywhere, so the livery arriving is the
 * ONLY colour in the frame. The repaint stops being a texture swap and
 * becomes the payoff the whole sequence has been withholding.
 *
 * The flag also gates livery texture generation in trainScene.js — turning it
 * off skips six 2048x512 canvases that would never be displayed.
 */
export const REVEAL_ON_LAUNCH = true;

/* ------------------------------------------------------------------ *
 * Tuning — everything you are likely to want to change is here.
 * ------------------------------------------------------------------ */
export const TIMING = {
  /** Splash never finishes faster than this, even on a warm cache (ms). */
  MIN_DURATION: 4800,
  /** Progress value at which the world blooms in. */
  WORLD_AT: 0.5,
  /** How long the world takes to fade up (ms). */
  WORLD_FADE: 1500,
  /** The bar pauses here while the world arrives — the "beat" (ms). */
  WORLD_HOLD: 380,
  /** Train accelerates from standstill to cruise over this (ms). */
  SPEED_RAMP: 4000,
  /** Livery sweep, nose to tail (ms). Plays after LAUNCH is pressed. */
  REVEAL_DURATION: 1900,
  /** Hold on the finished frame before handing off to the app (ms). */
  HANDOFF: 700,
  /** World units per second at cruise. Drives every scroller. */
  CRUISE_SPEED: 42,
  /**
   * Hard watchdog covering the AUTOMATIC part of the sequence only (ms).
   * It is cleared once we reach 'ready', because from there the splash is
   * waiting on a human, and a timer that fires while someone is deciding
   * whether to click Launch would yank the screen out from under them.
   */
  WATCHDOG: 15000,
};

/** Live, mutable frame state. Read inside the render loop; never in render(). */
export const frame = {
  progress: 0,
  worldMix: 0,
  reveal: 0,
  speedMix: 0,
  speed: 0,
  /** Shared odometer — EVERY scroller derives from this so nothing drifts. */
  distance: 0,
  elapsed: 0,
  reducedMotion: false,
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
export const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/**
 * Framerate-independent exponential smoothing. `lambda` is roughly
 * e-foldings per second. Using this instead of `a += (b - a) * 0.1` means the
 * motion looks identical on a 60Hz laptop panel and a 165Hz monitor — the
 * naive form runs almost three times faster on the latter.
 */
export const damp = (current, target, lambda, dt) =>
  target + (current - target) * Math.exp(-lambda * dt);

/* ------------------------------------------------------------------ */

let raf = 0;
let startedAt = 0;
let lastT = 0;
let holdUntil = 0;
let worldAt = -1;
let revealAt = -1;
let launchRequested = false;
let bailRequested = false;
let phase = 'idle';
let onPhase = null;

/**
 * Phases:
 *   dark   0 -> 50%   unlit train resolving out of black
 *   world  50 -> 100% world blooms in, train accelerates, still unpainted
 *   ready  100%       WAITING FOR THE USER — Launch button is showing
 *   reveal            livery sweeps on, nose to tail
 *   done              hand off to the app
 */
export const getPhase = () => phase;

function setPhase(next) {
  if (phase === next) return;
  phase = next;
  if (onPhase) onPhase(next);
}

/**
 * Start the livery reveal. Called by the Launch button — the sequence parks
 * at 'ready' until this fires, so the reveal is something the user triggers
 * rather than something that happens at them.
 */
export function launchSequence() {
  launchRequested = true;
}

/**
 * Bail out entirely: no reveal, straight to the app. Wired to Escape and the
 * Skip control. This is a genuine escape hatch, not a fast-forward — someone
 * who wants out should get out, not get out one step closer.
 */
export function skipSequence() {
  bailRequested = true;
}

export function startSequence(phaseCallback) {
  onPhase = phaseCallback || null;
  frame.reducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  startedAt = performance.now();
  lastT = startedAt;
  holdUntil = 0;
  worldAt = -1;
  revealAt = -1;
  launchRequested = false;
  bailRequested = false;
  frame.progress = 0;
  frame.worldMix = 0;
  frame.reveal = 0;
  frame.speedMix = 0;
  frame.speed = 0;
  frame.distance = 0;
  frame.elapsed = 0;

  phase = 'idle';
  setPhase('dark');
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(tick);
}

export function stopSequence() {
  cancelAnimationFrame(raf);
  raf = 0;
  onPhase = null;
  phase = 'idle';
}

function tick(now) {
  // Clamp dt. A backgrounded tab hands you a multi-second delta on return,
  // which would teleport the whole world in one frame.
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  frame.elapsed = (now - startedAt) / 1000;

  // Escape hatch wins over everything.
  if (bailRequested) {
    setPhase('done');
    raf = requestAnimationFrame(tick);
    return;
  }

  const duration = frame.reducedMotion
    ? TIMING.MIN_DURATION * 0.45
    : TIMING.MIN_DURATION;

  let target = easeOutQuint(clamp01((now - startedAt) / duration));

  // The beat: hold the bar at the threshold while the world arrives.
  if (holdUntil === 0 && target >= TIMING.WORLD_AT) {
    holdUntil = now + (frame.reducedMotion ? 0 : TIMING.WORLD_HOLD);
  }
  if (holdUntil !== 0 && now < holdUntil) {
    target = Math.min(target, TIMING.WORLD_AT);
  }

  // Monotonic: a progress bar must never go backwards.
  frame.progress = Math.max(frame.progress, damp(frame.progress, target, 5.5, dt));

  if (phase === 'dark' && frame.progress >= TIMING.WORLD_AT - 0.001) {
    worldAt = now;
    setPhase('world');
  }
  if (phase === 'world' && frame.progress >= 0.9995) {
    // Park here. The train stays unpainted and the world keeps running until
    // the user presses Launch.
    setPhase('ready');
  }
  if (phase === 'ready' && launchRequested) {
    if (REVEAL_ON_LAUNCH) {
      revealAt = now;
      setPhase('reveal');
    } else {
      // No repaint: the overlay's own cross-fade carries the transition.
      setPhase('done');
    }
  }
  if (
    phase === 'reveal' &&
    revealAt > 0 &&
    now - revealAt >= TIMING.REVEAL_DURATION + TIMING.HANDOFF
  ) {
    setPhase('done');
  }

  if (worldAt > 0) {
    frame.worldMix = easeOutCubic(clamp01((now - worldAt) / TIMING.WORLD_FADE));
    // Quint ease off standstill: a 450-tonne train has mass. A linear ramp
    // reads as a toy.
    frame.speedMix = easeOutQuint(clamp01((now - worldAt) / TIMING.SPEED_RAMP));
  }
  if (revealAt > 0) {
    frame.reveal = easeInOutCubic(
      clamp01((now - revealAt) / TIMING.REVEAL_DURATION)
    );
  }

  frame.speed = frame.speedMix * TIMING.CRUISE_SPEED * (frame.reducedMotion ? 0.35 : 1);
  frame.distance += frame.speed * dt;

  raf = requestAnimationFrame(tick);
}

/** Status copy, themed to the control-room vocabulary of the app behind it. */
export function statusFor(p) {
  if (p < 0.16) return 'INITIALIZING';
  if (p < 0.33) return 'LOADING TRACK TOPOLOGY';
  if (p < 0.5) return 'RESOLVING SIGNAL STATE';
  if (p < 0.66) return 'RELEASING BRAKES';
  if (p < 0.84) return 'SPOOLING TRACTION';
  if (p < 0.999) return 'CLEARING SECTION';
  return 'SECTION CLEAR';
}
