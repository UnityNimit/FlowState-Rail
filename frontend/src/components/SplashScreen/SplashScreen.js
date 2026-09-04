import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import {
  frame,
  startSequence,
  stopSequence,
  skipSequence,
  launchSequence,
  TIMING,
} from './splashSequence';
import { createTrainScene } from './trainScene';
import './SplashScreen.css';

const PLAY_ONCE_PER_SESSION = false;
const SESSION_KEY = 'fsr_splash_played';
const LAUNCH_ROUTE = '/dashboard';
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

function SplashStage({ onDone }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const fillRef = useRef(null);
  const launchRef = useRef(null);
  
  // 1. ADD A REF FOR THE LOGO
  const brandRef = useRef(null); 

  const [leaving, setLeaving] = useState(false);
  const [ready, setReady] = useState(false);

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

  // --- progress UI -------------------------------------------------
  useEffect(() => {
    let raf = 0;
    
    const loop = () => {
      // 2. DIRECTLY UPDATE THE LOGO FILTER IN THE ANIMATION LOOP
      if (brandRef.current) {
        // frame.worldMix goes from 0 (night) to 1 (day).
        // invert(0) keeps the logo white. invert(1) turns it completely black!
        brandRef.current.style.filter = `invert(${frame.worldMix})`;
      }

      if (fillRef.current) {
        fillRef.current.style.transform = `scaleX(${frame.progress})`;
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
      role="status"
      aria-live="polite"
      aria-label="FlowState Rail"
    >
      <div className="fsr-splash__stage" ref={stageRef} aria-hidden="true" />

      {/* 3. ATTACH THE REF TO THE IMAGE */}
      <img 
        ref={brandRef} 
        src="/logo.png" 
        alt="FlowState Rail Logo" 
        className="fsr-splash__brand" 
      />

      <div className="fsr-splash__hud">
        <div className="fsr-splash__bar">
          <span className="fsr-splash__fill" ref={fillRef} />
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