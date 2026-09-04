/**
 * SplashScreen — the FlowState Rail homepage.
 *
 * This is a ROUTE, not an overlay. It is what `/` renders, and it is mounted
 * only while you are on `/`. That is deliberate and it is what makes the two
 * obvious behaviours work:
 *
 *   - Refreshing on /dashboard (or anywhere else) does NOT replay the intro,
 *     because this component is not mounted on those routes at all.
 *   - Clicking FLOW in the dashboard HUD goes to `/`, which mounts this
 *     fresh, so the sequence plays again every time you go home.
 *
 * An earlier version mounted this in index.js as a full-screen overlay beside
 * <App />. That played on every page load regardless of route, so a refresh
 * on the dashboard replayed the whole intro, and `/` still rendered the old
 * placeholder underneath. Scoping it to the route removes both problems
 * without any special-casing.
 *
 * Sequence:
 *   0 -> 50%    unlit train resolving out of black
 *   50%         the world blooms in; the train pulls away from standstill
 *   100%        parks here — LAUNCH appears, train still unpainted
 *   on Launch   livery sweeps on nose to tail, then routes to the dashboard
 *
 * REMOVING IT:
 *   1. delete this folder (src/components/SplashScreen/)
 *   2. in src/App.js, point the "/" route back at your own home component
 * Nothing else in the project references it.
 *
 * SAFETY: every failure path ends at the dashboard. A decorative homepage must
 * never be able to trap someone on a dead screen, so no-WebGL, a scene build
 * throw and a stalled sequence all resolve by handing over to the app.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import {
  frame,
  startSequence,
  stopSequence,
  skipSequence,
  launchSequence,
  statusFor,
  TIMING,
} from './splashSequence';
import { createTrainScene } from './trainScene';
import './SplashScreen.css';

/* ------------------------------------------------------------------ *
 * Options
 * ------------------------------------------------------------------ */

/**
 * false (current) — plays every time you land on `/`, which is what you want
 *                   when `/` is the homepage and FLOW brings you back to it.
 * true            — plays once per browser tab; later visits to `/` skip
 *                   straight to the dashboard. Handy while developing, since
 *                   it stops the intro replaying on every hot reload.
 */
const PLAY_ONCE_PER_SESSION = false;
const SESSION_KEY = 'fsr_splash_played';

/** Where LAUNCH goes, and where every bail-out path lands. */
const LAUNCH_ROUTE = '/dashboard';

/** Fade length. Must match the .fsr-splash transition in SplashScreen.css. */
const FADE_MS = 750;

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext('webgl2') || c.getContext('webgl'))
    );
  } catch (e) {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Stage — owns the WebGL scene. Unmounting it tears the scene down.
 * ------------------------------------------------------------------ */
function SplashStage({ onDone }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const fillRef = useRef(null);
  const pctRef = useRef(null);
  const statusRef = useRef(null);
  const launchRef = useRef(null);

  const [leaving, setLeaving] = useState(false);
  const [ready, setReady] = useState(false);

  /**
   * Fade FIRST, then navigate.
   *
   * The opposite order was right when this was an overlay — the dashboard was
   * already mounted underneath, so routing early gave it the whole fade to
   * come alive. As a route it is the reverse: navigating unmounts this
   * component immediately and the exit animation never plays. So the fade runs
   * to completion and the route change happens at the end of it.
   */
  const finish = useCallback(() => {
    setLeaving(true);
    window.setTimeout(onDone, FADE_MS);
  }, [onDone]);

  // --- WebGL scene -------------------------------------------------
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;

    let handle = null;
    try {
      handle = createTrainScene(el);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[splash] scene failed to build, skipping intro:', err);
      onDone();
      return undefined;
    }
    return () => {
      if (handle) handle.dispose();
    };
  }, [onDone]);

  // --- timeline ----------------------------------------------------
  useEffect(() => {
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      finish();
    };

    // Watchdog covers only the automatic run-up. Once we reach 'ready' the
    // splash is waiting on a person, and a timer that fired mid-decision
    // would yank the screen away from them.
    let guard = window.setTimeout(done, TIMING.WATCHDOG);

    startSequence((phase) => {
      if (phase === 'ready') {
        window.clearTimeout(guard);
        setReady(true);
      }
      if (phase === 'reveal') {
        setReady(false);
        // Re-arm for the reveal, which is automatic again.
        window.clearTimeout(guard);
        guard = window.setTimeout(done, TIMING.REVEAL_DURATION + TIMING.HANDOFF + 4000);
      }
      if (phase === 'done') done();
    });

    return () => {
      window.clearTimeout(guard);
      stopSequence();
    };
  }, [finish]);

  // --- progress UI -------------------------------------------------
  // Written straight to the DOM from one rAF loop. No state, no re-renders:
  // this screen is on display exactly when the main thread is busiest, and a
  // per-frame setState competes with the work the splash exists to cover.
  useEffect(() => {
    let raf = 0;
    let lastPct = -1;
    let lastStatus = '';
    let lastInk = -1;
    const loop = () => {
      const p = frame.progress;

      // The sky behind the wordmark travels from black to near-white, so the
      // wordmark has to travel the other way or it disappears into it. Only
      // written when the quantised value actually changes, so this is a
      // handful of style writes across the whole sequence, not one a frame.
      const ink = Math.round(236 - 210 * frame.worldMix);
      if (ink !== lastInk && rootRef.current) {
        rootRef.current.style.setProperty(
          '--fsr-brand-ink',
          `rgb(${ink},${ink + 1},${ink + 2})`
        );
        lastInk = ink;
      }

      if (fillRef.current) {
        // scaleX, not width — width is a layout property and would reflow
        // the page on every frame.
        fillRef.current.style.transform = `scaleX(${p})`;
      }
      const whole = Math.round(p * 100);
      if (whole !== lastPct && pctRef.current) {
        pctRef.current.textContent = String(whole).padStart(3, '0');
        lastPct = whole;
      }
      const s = statusFor(p);
      if (s !== lastStatus && statusRef.current) {
        statusRef.current.textContent = s;
        lastStatus = s;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Move focus to Launch when it appears, so the sequence stays operable from
  // the keyboard and Enter does the obvious thing.
  useEffect(() => {
    if (ready && launchRef.current) launchRef.current.focus();
  }, [ready]);

  // --- keyboard ----------------------------------------------------
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') skipSequence();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      ref={rootRef}
      className="fsr-splash"
      data-leaving={leaving ? 'true' : 'false'}
      data-ready={ready ? 'true' : 'false'}
      role="status"
      aria-live="polite"
      aria-label="FlowState Rail"
    >
      <div className="fsr-splash__stage" ref={stageRef} aria-hidden="true" />

      <div className="fsr-splash__brand">
        FLOW<i>FLOWSTATE RAIL</i>
      </div>

      <div className="fsr-splash__hud">
        <div className="fsr-splash__bar">
          <span className="fsr-splash__fill" ref={fillRef} />
        </div>
        <div className="fsr-splash__meta">
          <span ref={statusRef}>INITIALIZING</span>
          <span className="fsr-splash__pct" ref={pctRef}>000</span>
        </div>

        <button
          type="button"
          ref={launchRef}
          className="fsr-splash__launch"
          onClick={() => launchSequence()}
          tabIndex={ready ? 0 : -1}
          aria-hidden={!ready}
        >
          <span>Launch</span>
        </button>
      </div>

      <button
        type="button"
        className="fsr-splash__skip"
        onClick={() => skipSequence()}
      >
        Skip
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Route entry.
 *
 * NOTE: must be rendered inside <BrowserRouter> (it is — App.js routes it) —
 * useNavigate throws outside a router context.
 * ------------------------------------------------------------------ */
export default function SplashScreen() {
  const navigate = useNavigate();

  // Decided once, on mount, so it cannot flip mid-sequence.
  const [skipToApp] = useState(() => {
    if (typeof window === 'undefined') return true;
    if (!hasWebGL()) return true;
    if (PLAY_ONCE_PER_SESSION) {
      try {
        return sessionStorage.getItem(SESSION_KEY) === '1';
      } catch (e) {
        return false;
      }
    }
    return false;
  });

  const handleDone = useCallback(() => {
    if (PLAY_ONCE_PER_SESSION) {
      try {
        sessionStorage.setItem(SESSION_KEY, '1');
      } catch (e) {
        /* private mode — just play again next time */
      }
    }
    // `replace` so the finished intro is not left sitting in history: pressing
    // Back from the dashboard should not drop you into the splash you just
    // completed. FLOW in the HUD is the way back to it.
    navigate(LAUNCH_ROUTE, { replace: true });
  }, [navigate]);

  /**
   * No WebGL, or already played this session. This route has nothing to draw,
   * so hand over to the app rather than rendering a blank homepage — which is
   * exactly what would happen if this returned null.
   */
  if (skipToApp) return <Navigate to={LAUNCH_ROUTE} replace />;

  return <SplashStage onDone={handleDone} />;
}
