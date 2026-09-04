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

const PLAY_ONCE_PER_SESSION = false;
const SESSION_KEY = 'fsr_splash_played';
const LAUNCH_ROUTE = '/dashboard';
const FADE_MS = 750;

/** Service maximum shown on the speed readout. The scene's own speed is
 *  chosen for how it looks; this scales that to a real figure. */
const TOP_SPEED_KMH = 320;

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

function SplashStage({ onDone }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const fillRef = useRef(null);
  const launchRef = useRef(null);
  const brandRef = useRef(null);
  const statusRef = useRef(null);
  const pctRef = useRef(null);
  const speedRef = useRef(null);

  const [leaving, setLeaving] = useState(false);
  const [ready, setReady] = useState(false);
  // Gates everything that belongs to the lit world (copy, telemetry, section
  // label). The dark half of the sequence stays deliberately bare — the
  // silhouette has to carry it alone — and the content arrives with the world.
  const [world, setWorld] = useState(false);

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

    let guard = window.setTimeout(done, TIMING.WATCHDOG);

    startSequence((phase) => {
      if (phase === 'world') setWorld(true);
      if (phase === 'ready') {
        window.clearTimeout(guard);
        setReady(true);
      }
      if (phase === 'reveal') {
        setReady(false);
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

  // --- readouts ----------------------------------------------------
  // One rAF loop writing straight to the DOM. No state, no re-renders: this
  // screen is on display exactly when the main thread is busiest, and a
  // per-frame setState competes with the work the splash exists to cover.
  // Every write below is guarded by a change check, so across the whole
  // sequence this is a few dozen DOM touches rather than one per frame.
  useEffect(() => {
    let raf = 0;
    let lastPct = -1;
    let lastStatus = '';
    let lastInk = -1;
    let lastKmh = -1;

    const loop = () => {
      const p = frame.progress;
      const w = frame.worldMix;

      // The sky travels from black to near-white. Anything sitting on it has
      // to travel the other way or it vanishes: the logo flips via an invert
      // filter, the section label via this colour token.
      const ink = Math.round(236 - 210 * w);
      if (ink !== lastInk) {
        if (brandRef.current) brandRef.current.style.filter = `invert(${w})`;
        if (rootRef.current) {
          rootRef.current.style.setProperty(
            '--fsr-sky-ink',
            `rgb(${ink},${ink + 1},${ink + 2})`
          );
        }
        lastInk = ink;
      }

      // scaleX, not width — width is a layout property and would reflow the
      // page on every frame.
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${p})`;

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

      // Speed climbs on the same eased ramp the train accelerates on, so the
      // number and the motion are the same curve rather than two guesses.
      const kmh = Math.round(frame.speedMix * TOP_SPEED_KMH);
      if (kmh !== lastKmh && speedRef.current) {
        speedRef.current.textContent = kmh;
        lastKmh = kmh;
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

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
      data-world={world ? 'true' : 'false'}
      role="status"
      aria-live="polite"
      aria-label="FlowState Rail"
    >
      <div className="fsr-splash__stage" ref={stageRef} aria-hidden="true" />

      <img
        ref={brandRef}
        src="/logo.png"
        alt="FlowState Rail"
        className="fsr-splash__brand"
      />

      <div className="fsr-splash__section">Section Control System</div>

      <div className="fsr-splash__intro">
        <p className="fsr-splash__eyebrow" style={{ '--i': 0 }}>
          FlowState Rail · Decision Support
        </p>
        <h1 className="fsr-splash__title">
          <span style={{ '--i': 1 }}>Move more trains</span>
          <span style={{ '--i': 2 }}>through the same track.</span>
        </h1>
        <p className="fsr-splash__sub" style={{ '--i': 3 }}>
          Precedence, platform allocation and conflict resolution for
          high-density railway sections — computed continuously, second by
          second.
        </p>
      </div>

      <aside className="fsr-splash__tele" aria-hidden="true">
        <div className="fsr-splash__tele-row" style={{ '--i': 0 }}>
          <span className="fsr-splash__tele-k">Speed</span>
          <span className="fsr-splash__tele-v is-accent">
            <b ref={speedRef}>0</b>
            <small>KM/H</small>
          </span>
        </div>
        <span className="fsr-splash__tele-rule" style={{ '--i': 1 }} />
        <div className="fsr-splash__tele-row" style={{ '--i': 2 }}>
          <span className="fsr-splash__tele-k">Set</span>
          <span className="fsr-splash__tele-v">U 12</span>
        </div>
        <span className="fsr-splash__tele-rule" style={{ '--i': 3 }} />
        <div className="fsr-splash__tele-row" style={{ '--i': 4 }}>
          <span className="fsr-splash__tele-k">Section</span>
          <span className="fsr-splash__tele-v">DLI · GZB</span>
        </div>
      </aside>

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
    </div>
  );
}

export default function SplashScreen() {
  const navigate = useNavigate();

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
        // private mode
      }
    }
    navigate(LAUNCH_ROUTE, { replace: true });
  }, [navigate]);

  if (skipToApp) return <Navigate to={LAUNCH_ROUTE} replace />;

  return <SplashStage onDone={handleDone} />;
}
