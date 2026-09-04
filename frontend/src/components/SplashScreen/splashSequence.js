export const REVEAL_ON_LAUNCH = true;

export const TIMING = {
  MIN_DURATION: 4800,
  WORLD_AT: 0.5,
  WORLD_FADE: 1500,
  WORLD_HOLD: 380,
  SPEED_RAMP: 4000,
  REVEAL_DURATION: 1900,
  HANDOFF: 700,
  CRUISE_SPEED: 42,
  WATCHDOG: 15000,
};

export const frame = {
  progress: 0,
  worldMix: 0,
  reveal: 0,
  speedMix: 0,
  speed: 0,
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

export const damp = (current, target, lambda, dt) =>
  target + (current - target) * Math.exp(-lambda * dt);

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

export const getPhase = () => phase;

function setPhase(next) {
  if (phase === next) return;
  phase = next;
  if (onPhase) onPhase(next);
}

export function launchSequence() {
  launchRequested = true;
}

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
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  frame.elapsed = (now - startedAt) / 1000;

  if (bailRequested) {
    setPhase('done');
    raf = requestAnimationFrame(tick);
    return;
  }

  const duration = frame.reducedMotion
    ? TIMING.MIN_DURATION * 0.45
    : TIMING.MIN_DURATION;

  let target = easeOutQuint(clamp01((now - startedAt) / duration));

  if (holdUntil === 0 && target >= TIMING.WORLD_AT) {
    holdUntil = now + (frame.reducedMotion ? 0 : TIMING.WORLD_HOLD);
  }
  if (holdUntil !== 0 && now < holdUntil) {
    target = Math.min(target, TIMING.WORLD_AT);
  }

  frame.progress = Math.max(frame.progress, damp(frame.progress, target, 5.5, dt));

  if (phase === 'dark' && frame.progress >= TIMING.WORLD_AT - 0.001) {
    worldAt = now;
    setPhase('world');
  }
  if (phase === 'world' && frame.progress >= 0.9995) {
    setPhase('ready');
  }
  if (phase === 'ready' && launchRequested) {
    if (REVEAL_ON_LAUNCH) {
      revealAt = now;
      setPhase('reveal');
    } else {
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