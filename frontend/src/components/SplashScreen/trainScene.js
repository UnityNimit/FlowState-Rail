/**
 * trainScene.js — the WebGL half of the intro splash.
 *
 * Framework-free vanilla three.js. Knows nothing about React; you hand it a
 * DOM node and it returns a dispose function.
 *
 * Uses only packages already in this project's package.json (three,
 * postprocessing). Nothing new to install.
 *
 * Part of the FlowState Rail intro splash. Self-contained — deleting the
 * SplashScreen folder and the two lines in src/index.js removes it entirely.
 */

import * as THREE from 'three';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  VignetteEffect,
  NoiseEffect,
  ToneMappingEffect,
  ToneMappingMode,
  BlendFunction,
  KernelSize,
  ChromaticAberrationEffect,
} from 'postprocessing';

import { frame, damp, smoothstep, REVEAL_ON_LAUNCH } from './splashSequence';

/* ================================================================== *
 * PALETTE
 * ================================================================== */
/**
 * HIGH-KEY MONOCHROME.
 *
 * The scene is graphite on white: a bright overcast sky, dark grey ground,
 * and a dark grey train silhouetted between them. There is no hue anywhere —
 * every value below is a neutral, so nothing can drift the image toward a
 * cast. Accents (rail glints, speed streaks, UI) are pure white.
 *
 * Note the sky is brightest just above the HORIZON rather than at the zenith.
 * That is how overcast skies actually read; a flat white dome looks like a
 * missing background rather than weather.
 */
const P = {
  /* Livery — only reachable if REVEAL_ON_LAUNCH is switched back on. */
  green: '#2fbfae',
  greenDeep: '#1b9d90',
  pink: '#e0447f',
  white: '#eef1f2',
  shadow: '#cfd6d9',
  glass: '#0e1518',

  /* Train */
  bodyGrey: '#3a3f42',
  skirt: '#17191b',
  metal: '#9aa0a4',

  /* Sky, zenith down to below the horizon */
  skyTop: '#d9dddf',
  skyUpper: '#eceff0',
  skyHorizon: '#f8f9fa',
  skyLow: '#d6dadc',
  skyBelow: '#74797c',

  /** Haze matches the horizon, so distance dissolves into the sky. */
  fog: '#e9ecee',

  ballast: '#303336',
  earth: '#232527',
  ridgeNear: '#24272a',
  ridgeMid: '#313538',
  ridgeFar: '#414548',

  accent: '#ffffff',
};

/* ================================================================== *
 * PROCEDURAL TEXTURES — zero network assets.
 * A splash that must download its own textures defeats its own purpose.
 * ================================================================== */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, x: c.getContext('2d') };
}
function tex(canvas, { srgb = true, aniso = 16 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}
function roundRect(x, X, Y, W, H, R) {
  x.beginPath();
  x.moveTo(X + R, Y);
  x.arcTo(X + W, Y, X + W, Y + H, R);
  x.arcTo(X + W, Y + H, X, Y + H, R);
  x.arcTo(X, Y + H, X, Y, R);
  x.arcTo(X, Y, X + W, Y, R);
  x.closePath();
}

/* --- livery ---------------------------------------------------------
 * UV convention: u = tail(0) -> nose(1); v = derived from LOCAL HEIGHT,
 * not from the sweep angle. That is what keeps the green/pink/white bands
 * dead level all the way round the rounded section and down the tapering
 * nose — an angle-based V makes the stripe wobble as the body narrows.
 */
const BAND = {
  roofEquip: 0.955,
  greenBottom: 0.582,
  pinkTop: 0.582,
  pinkBottom: 0.538,
  winTop: 0.8,
  winBottom: 0.665,
};

function paintLivery(x, W, H, mode, head) {
  const yOf = (v) => (1 - v) * H; // canvas y=0 is v=1 (the roof)
  const rnd = mulberry32(head ? 7 : 13);

  if (mode === 'color') {
    const lo = x.createLinearGradient(0, yOf(BAND.pinkBottom), 0, H);
    lo.addColorStop(0, P.white);
    lo.addColorStop(0.72, P.white);
    lo.addColorStop(1, P.shadow);
    x.fillStyle = lo;
    x.fillRect(0, yOf(BAND.pinkBottom), W, H - yOf(BAND.pinkBottom));

    const up = x.createLinearGradient(0, 0, 0, yOf(BAND.greenBottom));
    up.addColorStop(0, P.greenDeep);
    up.addColorStop(0.45, P.green);
    up.addColorStop(1, P.green);
    x.fillStyle = up;
    x.fillRect(0, 0, W, yOf(BAND.greenBottom));

    x.fillStyle = P.pink;
    x.fillRect(0, yOf(BAND.pinkTop), W, yOf(BAND.pinkBottom) - yOf(BAND.pinkTop));

    x.fillStyle = 'rgba(20,28,32,.85)';
    x.fillRect(0, 0, W, yOf(BAND.roofEquip));
  } else if (mode === 'emissive') {
    x.fillStyle = '#000';
    x.fillRect(0, 0, W, H);
  } else {
    x.fillStyle = '#484848';
    x.fillRect(0, 0, W, H);
    x.fillStyle = '#737373';
    x.fillRect(0, yOf(0.16), W, H - yOf(0.16));
  }

  const uS = 0.035;
  const uE = head ? 0.5 : 0.965;
  const count = head ? 8 : 16;
  const winY = yOf(BAND.winTop);
  const winH = yOf(BAND.winBottom) - yOf(BAND.winTop);
  const pitch = ((uE - uS) * W) / count;
  const winW = pitch * 0.62;

  for (let i = 0; i < count; i++) {
    const X = uS * W + i * pitch + (pitch - winW) / 2;
    const R = winH * 0.34;
    if (mode === 'color') {
      roundRect(x, X, winY, winW, winH, R);
      x.fillStyle = P.glass;
      x.fill();
      const g = x.createLinearGradient(0, winY, 0, winY + winH);
      g.addColorStop(0, 'rgba(150,220,225,.30)');
      g.addColorStop(0.5, 'rgba(150,220,225,.04)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fill();
    } else if (mode === 'emissive') {
      // Only some cabins are lit — a fully lit train reads as a toy.
      if (rnd() > 0.32) {
        roundRect(x, X, winY, winW, winH, R);
        x.fillStyle = rnd() > 0.5 ? '#a8ecdf' : '#7fd8d4';
        x.globalAlpha = 0.55 + rnd() * 0.45;
        x.fill();
        x.globalAlpha = 1;
      }
    } else {
      roundRect(x, X, winY, winW, winH, R);
      x.fillStyle = '#1e1e1e';
      x.fill();
    }
  }

  if (mode === 'color') {
    x.strokeStyle = 'rgba(0,0,0,.22)';
    x.lineWidth = Math.max(1, W / 900);
    for (const du of head ? [0.54] : [0.16, 0.84]) {
      const X = du * W;
      const dw = W * 0.028;
      x.fillStyle = 'rgba(255,255,255,.10)';
      x.fillRect(X, yOf(0.86), dw, yOf(0.12) - yOf(0.86));
      x.beginPath();
      x.moveTo(X, yOf(0.86));
      x.lineTo(X, yOf(0.12));
      x.moveTo(X + dw, yOf(0.86));
      x.lineTo(X + dw, yOf(0.12));
      x.stroke();
    }
    x.strokeStyle = 'rgba(0,0,0,.10)';
    x.beginPath();
    x.moveTo(0, yOf(0.63));
    x.lineTo(W, yOf(0.63));
    x.stroke();
    // grime along the lower edge — kills the "CGI plastic" look
    const gr = x.createLinearGradient(0, yOf(0.3), 0, H);
    gr.addColorStop(0, 'rgba(40,50,55,0)');
    gr.addColorStop(1, 'rgba(40,50,55,.35)');
    x.fillStyle = gr;
    x.fillRect(0, yOf(0.3), W, H - yOf(0.3));
  }

  if (head) {
    const hx = 0.945 * W;
    const hy = yOf(0.44);
    if (mode === 'color') {
      x.fillStyle = '#0c1114';
      roundRect(x, hx, hy, W * 0.035, H * 0.075, H * 0.02);
      x.fill();
    } else if (mode === 'emissive') {
      const g = x.createRadialGradient(
        hx + W * 0.017, hy + H * 0.037, 0,
        hx + W * 0.017, hy + H * 0.037, W * 0.03
      );
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.45, '#dff6ff');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(hx - W * 0.02, hy - H * 0.05, W * 0.09, H * 0.18);
    }
  }
}

function makeLivery(head) {
  const W = 2048;
  const H = 512;
  const a = cv(W, H); paintLivery(a.x, W, H, 'color', head);
  const b = cv(W, H); paintLivery(b.x, W, H, 'emissive', head);
  const c = cv(W, H); paintLivery(c.x, W, H, 'roughness', head);
  return {
    map: tex(a.c),
    emissiveMap: tex(b.c),
    roughnessMap: tex(c.c, { srgb: false }),
  };
}

/* --- track bed -------------------------------------------------------
 * Sleepers are PAINTED, not instanced. At 42 m/s with 0.62m pitch they cross
 * the frame at ~68 Hz — far past the display refresh — so discrete geometry
 * strobes and reverses (the wagon-wheel effect). No amount of MSAA fixes it,
 * because the aliasing is temporal, not spatial. In a texture the mip chain
 * filters it for free, it is one draw call instead of ~700 instances, and we
 * can crossfade to a pre-smeared copy for honest directional motion blur with
 * no velocity buffer.
 */
export const TILE_METRES = 6.2; // = 10 sleepers at 0.62m

function paintBed(x, S) {
  const rnd = mulberry32(2718);
  x.fillStyle = P.ballast;
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) {
    const l = 26 + rnd() * 56;
    x.fillStyle = `rgb(${l},${l + 3},${l + 5})`;
    x.beginPath();
    x.ellipse(rnd() * S, rnd() * S, 1 + rnd() * 3.2, (1 + rnd() * 3.2) * (0.6 + rnd() * 0.6), rnd() * Math.PI, 0, 6.2832);
    x.fill();
  }
  const N = 10;
  const pitch = S / N;
  const w = pitch * 0.42;
  for (let i = 0; i < N; i++) {
    const X = i * pitch + (pitch - w) / 2;
    const y0 = S * 0.19;
    const y1 = S * 0.81;
    const g = x.createLinearGradient(X, 0, X + w, 0);
    g.addColorStop(0, '#4a4f52');
    g.addColorStop(0.35, '#5e6467');
    g.addColorStop(1, '#3c4144');
    x.fillStyle = g;
    x.fillRect(X, y0, w, y1 - y0);
    x.fillStyle = 'rgba(0,0,0,.45)';
    x.fillRect(X + w, y0, w * 0.18, y1 - y0);
  }
}

function makeBed(blur) {
  const S = 1024;
  const a = cv(S, S);
  paintBed(a.x, S);
  if (!blur) return tex(a.c);
  // x-only box blur: canvas filter:blur() is isotropic and would smear across
  // the track too. Wrapped copies keep the tile seamless.
  const o = cv(S, S);
  const TAPS = 28;
  o.x.globalAlpha = 1 / TAPS;
  for (let i = 0; i < TAPS; i++) {
    const dx = (i / TAPS) * S * 0.5;
    o.x.drawImage(a.c, dx, 0);
    o.x.drawImage(a.c, dx - S, 0);
  }
  o.x.globalAlpha = 1;
  return tex(o.c);
}

function makeSky() {
  const { c, x } = cv(8, 1024);
  const g = x.createLinearGradient(0, 0, 0, 1024);
  g.addColorStop(0.0, P.skyTop);
  g.addColorStop(0.4, P.skyUpper);
  g.addColorStop(0.66, P.skyHorizon);
  g.addColorStop(0.74, P.skyLow);
  g.addColorStop(1.0, P.skyBelow);
  x.fillStyle = g;
  x.fillRect(0, 0, 8, 1024);
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function makeEarth() {
  const S = 512;
  const { c, x } = cv(S, S);
  const rnd = mulberry32(99);
  x.fillStyle = P.earth;
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    // Neutral mottling only — any hue here would tint the largest surface in
    // the frame and pull the whole image off monochrome.
    const l = (30 + rnd() * 26) | 0;
    x.fillStyle = `rgba(${l},${l + 1},${l + 2},.5)`;
    x.beginPath();
    x.arc(rnd() * S, rnd() * S, 2 + rnd() * 12, 0, 6.2832);
    x.fill();
  }
  return tex(c, { aniso: 8 });
}

function makeStreak() {
  const W = 256;
  const H = 32;
  const { c, x } = cv(W, H);
  x.fillStyle = '#000';
  x.fillRect(0, 0, W, H);
  const g = x.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.42, 'rgba(255,255,255,.92)');
  g.addColorStop(0.58, 'rgba(255,255,255,.92)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  const v = x.createLinearGradient(0, 0, 0, H);
  v.addColorStop(0, '#000');
  v.addColorStop(0.5, '#fff');
  v.addColorStop(1, '#000');
  x.globalCompositeOperation = 'multiply';
  x.fillStyle = v;
  x.fillRect(0, 0, W, H);
  x.globalCompositeOperation = 'source-over';
  return tex(c);
}

/* ================================================================== *
 * REVEAL SHADER
 *
 * Injected at <opaque_fragment> so we modify LINEAR `outgoingLight`.
 * three's chunk order is
 *     opaque_fragment -> tonemapping -> colorspace -> fog -> dithering
 * so injecting at <dithering_fragment> (the usual choice) puts you after tone
 * mapping and sRGB encode: the emissive wavefront then clips instead of
 * rolling off, and bloom has nothing above 1.0 to latch onto.
 *
 * Verified against three r160 and r180 — both expose the same hooks.
 * ================================================================== */
const revealU = {
  uReveal: { value: 0 },
  uRange: { value: new THREE.Vector2(-160, 0) },
  /**
   * With REVEAL_ON_LAUNCH off this is not a placeholder — it IS the train's
   * final look, so it is a real dark grey rather than the near-black it was
   * when it only had to survive a couple of seconds against a black screen.
   * The shading below it is a fixed three-point rig, deliberately independent
   * of the scene lights, so the body keeps the same value whether the world
   * behind it is black or white.
   */
  uDark: { value: new THREE.Color('#282c2f') },
  uEdge: { value: new THREE.Color('#ffffff') },
};
const worldU = { uWorld: { value: 0 } };

function patchReveal(mat) {
  const list = Array.isArray(mat) ? mat : [mat];
  for (const m of list) {
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, revealU);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vRW;\nvarying vec3 vRN;')
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n vRN = normalize(mat3(modelMatrix)*objectNormal);')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n vRW = (modelMatrix*vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vRW; varying vec3 vRN;
uniform float uReveal; uniform vec2 uRange; uniform vec3 uDark; uniform vec3 uEdge;`)
        .replace('#include <opaque_fragment>', `{
  float axis = (vRW.x - uRange.x) / max(uRange.y - uRange.x, 1e-4);
  float head = mix(1.18, -0.18, uReveal);     // nose -> tail
  float m = smoothstep(head, head + 0.13, axis);
  vec3  N = normalize(vRN);
  float key  = clamp(dot(N, normalize(vec3(0.30,0.92,0.26))), 0.0, 1.0);
  float fill = clamp(dot(N, normalize(vec3(-0.6,0.15,-0.75))), 0.0, 1.0);
  float fres = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)),0.0,1.0), 3.0);
  vec3 darkCol = uDark * (0.55 + 1.35*pow(key,1.7) + 0.35*fill) + uEdge*fres*0.045;
  // Narrower and dimmer than it looks like it should be. uEdge is now white
  // rather than teal, and white carries roughly three times the luminance of
  // a saturated hue at the same nominal value — so the multiplier that gave a
  // crisp teal band blows a white one into a blob that swallows the nose.
  float edge = exp(-pow((axis-head)/0.034, 2.0));
  edge *= smoothstep(0.0,0.04,uReveal) * (1.0 - smoothstep(0.94,1.0,uReveal));
  outgoingLight = mix(darkCol, outgoingLight, m) + uEdge*edge*1.7;
}
#include <opaque_fragment>`);
    };
    // Without this three reuses a program compiled BEFORE the patch and the
    // whole effect silently does nothing. The #1 onBeforeCompile gotcha.
    m.customProgramCacheKey = () => 'fsr-reveal-v1';
    m.needsUpdate = true;
  }
}

function patchWorld(mat) {
  const list = Array.isArray(mat) ? mat : [mat];
  for (const m of list) {
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, worldU);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uWorld;')
        .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n gl_FragColor.rgb *= uWorld;');
    };
    m.customProgramCacheKey = () => 'fsr-world-v1';
    m.needsUpdate = true;
  }
}

/* ================================================================== *
 * TRAIN GEOMETRY — swept superellipse.
 * Real E5 numbers, 1 unit = 1 metre: 3.35m wide, roof 3.70m above rail,
 * underside 0.90m, 25m cars, 1.435m gauge, 0.86m wheels. Getting the ratios
 * right is most of why a render reads as convincing.
 * ================================================================== */
const T = {
  LEN: 25, GAP: 0.6, HW: 1.675, HH: 1.4, FLOOR: 2.3,
  NOSE_FRAC: 0.56, N: 3.4, V_LIFT: 0.32, CARS: 6, AROUND: 44,
};
const HALF_GAUGE = 0.7175;
const WHEEL_R = 0.43;

function sect(th, n) {
  const c = Math.cos(th);
  const s = Math.sin(th);
  const p = 2 / n;
  let x = Math.sign(c) * Math.pow(Math.abs(c), p);
  const y = Math.sign(s) * Math.pow(Math.abs(s), p);
  x *= 1 - 0.14 * Math.pow(Math.max(0, -y), 1.5); // tuck the underframe in
  x *= 1 - 0.07 * Math.pow(Math.max(0, y), 2.2);  // ease the shoulders
  return [x, y];
}

function ringsFor(head, tail) {
  const L = T.LEN;
  const R = [];
  const tailLen = tail ? L * 0.16 : L * 0.012;
  const STEPS = tail ? 14 : 3;
  for (let i = 0; i < STEPS; i++) {
    const s = i / STEPS;
    const k = tail ? Math.pow(1 - Math.pow(1 - s, 1.6), 0.5) : Math.pow(s, 0.5);
    R.push({
      x: tailLen * s,
      sw: 0.22 + 0.78 * k,
      sh: tail ? 0.2 + 0.8 * k : 0.55 + 0.45 * k,
      cy: tail ? -0.34 * Math.pow(1 - s, 1.7) : 0,
      nose: tail ? (1 - s) * 0.6 : 0,
    });
  }
  const noseStart = head ? L * (1 - T.NOSE_FRAC) : L * 0.988;
  for (let i = 0; i <= 6; i++) {
    R.push({ x: tailLen + ((noseStart - tailLen) * i) / 6, sw: 1, sh: 1, cy: 0, nose: 0 });
  }
  if (head) {
    for (let j = 1; j <= 48; j++) {
      const s = j / 48;
      R.push({
        x: noseStart + (L - noseStart) * Math.pow(s, 0.84),
        // width holds wide then falls away late — the duckbill "shovel"
        sw: 0.17 + 0.83 * Math.pow(1 - Math.pow(s, 2.7), 0.3),
        // height collapses EARLIER than width. This asymmetry IS the E5 look.
        sh: 0.1 + 0.9 * Math.pow(1 - Math.pow(s, 1.25), 0.58),
        cy: -0.55 * Math.pow(s, 1.7), // tip ends ~1.5m above rail
        nose: s,
      });
    }
  } else {
    R.push({ x: L, sw: 0.985, sh: 0.96, cy: 0, nose: 0 });
  }
  return R;
}

function carGeometry(head, tail = false) {
  const R = ringsFor(head, tail);
  const A = T.AROUND;
  const { HW: hw, HH: hh, LEN: L } = T;
  const pos = [];
  const uv = [];
  const idx = [];
  for (const r of R) {
    for (let a = 0; a < A; a++) {
      const th = (a / A) * 6.283185307;
      const [sx, sy] = sect(th, T.N);
      const y = (sy * r.sh + r.cy) * hh;
      const z = sx * r.sw * hw;
      pos.push(r.x, y, z);
      uv.push(r.x / L, (y / hh + 1) / 2 + T.V_LIFT * r.nose);
    }
  }
  for (let r = 0; r < R.length - 1; r++) {
    for (let a = 0; a < A; a++) {
      const a2 = (a + 1) % A;
      const i0 = r * A + a;
      const i1 = r * A + a2;
      const i2 = (r + 1) * A + a;
      const i3 = (r + 1) * A + a2;
      idx.push(i0, i2, i1, i1, i2, i3);
    }
  }
  const cap = (ri, flip) => {
    const r = R[ri];
    const c = pos.length / 3;
    const cyW = r.cy * hh;
    pos.push(r.x, cyW, 0);
    uv.push(r.x / L, (cyW / hh + 1) / 2 + T.V_LIFT * r.nose);
    for (let a = 0; a < A; a++) {
      const a2 = (a + 1) % A;
      const i0 = ri * A + a;
      const i1 = ri * A + a2;
      if (flip) idx.push(c, i1, i0);
      else idx.push(c, i0, i1);
    }
  };
  cap(0, true);
  cap(R.length - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function merge(list) {
  let vc = 0;
  let ic = 0;
  for (const g of list) {
    if (!g.attributes.normal) g.computeVertexNormals();
    vc += g.attributes.position.count;
    ic += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vc * 3);
  const nor = new Float32Array(vc * 3);
  const uv = new Float32Array(vc * 2);
  const idx = new Uint32Array(ic);
  let vo = 0;
  let io = 0;
  for (const g of list) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
    if (g.index) {
      const a = g.index.array;
      for (let i = 0; i < a.length; i++) idx[io + i] = a[i] + vo;
      io += a.length;
    } else {
      for (let i = 0; i < n; i++) idx[io + i] = i + vo;
      io += n;
    }
    vo += n;
    g.dispose();
  }
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  o.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  o.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  o.setIndex(new THREE.BufferAttribute(idx, 1));
  return o;
}

function underframe() {
  const parts = [];
  const L = T.LEN;
  const railTop = -T.FLOOR;
  const wheelY = railTop + WHEEL_R;
  const skirt = new THREE.BoxGeometry(L * 0.9, 0.5, T.HW * 1.5);
  skirt.translate(L * 0.5, -T.HH - 0.18, 0);
  parts.push(skirt);
  for (const bx of [L * 0.2, L * 0.8]) {
    const f = new THREE.BoxGeometry(3.6, 0.95, T.HW * 1.74);
    f.translate(bx, wheelY + 0.3, 0);
    parts.push(f);
    for (const wx of [bx - 1.25, bx + 1.25]) {
      for (const wz of [-HALF_GAUGE, HALF_GAUGE]) {
        const w = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.14, 20);
        w.rotateX(Math.PI / 2);
        w.translate(wx, wheelY, wz);
        parts.push(w);
      }
    }
  }
  return merge(parts);
}

function pantograph() {
  const p = [];
  const b = new THREE.BoxGeometry(2.6, 0.18, 1.5); b.translate(0, T.HH + 0.06, 0); p.push(b);
  const l = new THREE.BoxGeometry(2.0, 0.12, 0.12); l.rotateZ(-0.62); l.translate(-0.5, T.HH + 0.66, 0); p.push(l);
  const u = new THREE.BoxGeometry(1.7, 0.1, 0.1); u.rotateZ(0.5); u.translate(0.72, T.HH + 1.06, 0); p.push(u);
  const s = new THREE.BoxGeometry(0.3, 0.07, 1.9); s.translate(1.4, T.HH + 1.42, 0); p.push(s);
  return merge(p);
}

const carX = (i) => -i * (T.LEN + T.GAP) - T.LEN;
const TRAIN_SPAN = { min: -(T.CARS * T.LEN + (T.CARS - 1) * T.GAP), max: 0 };

/* ================================================================== *
 * RIDGES
 * All layers scroll at the SAME world speed; the parallax comes from
 * perspective because they sit at different depths, which is what actually
 * happens out of a train window. Per-layer speed multipliers are the usual
 * shortcut and always read slightly wrong.
 *
 * Heights are sums of sines at INTEGER frequencies over the period, so the
 * shape is exactly periodic and the wrap seam is invisible.
 * ================================================================== */
function ridgeGeo(period, height, seed, zJit) {
  const COLS = 260;
  const total = period * 3;
  const pos = [];
  const col = [];
  const idx = [];
  const H = [
    [1, 0.5, seed * 1.7], [2, 0.26, seed * 3.1], [3, 0.15, seed * 0.9],
    [5, 0.09, seed * 2.3], [8, 0.05, seed * 4.4], [13, 0.028, seed * 1.1],
  ];
  const at = (x) => {
    let y = 0;
    for (const [f, a, p] of H) y += a * Math.sin((6.283185307 * f * x) / period + p);
    return (y * 0.5 + 0.5) * height;
  };
  for (let i = 0; i <= COLS; i++) {
    const x = -period + total * (i / COLS);
    const z = Math.sin((6.283185307 * 3 * x) / period + seed) * zJit;
    pos.push(x, at(x), z, x, -height * 1.4, z);
    col.push(1.18, 1.18, 1.18, 0.55, 0.55, 0.55); // ridgelines catch some sky
  }
  for (let i = 0; i < COLS; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ================================================================== *
 * SCENE FACTORY
 * ================================================================== */
const TILES = 192;
const SPAN = TILES * TILE_METRES;
const X_MAX = 254.2;
const X_MIN = X_MAX - SPAN;
const CX = (X_MIN + X_MAX) / 2;
const BED_HW = 4.6;
const POLE_PITCH = 45;
/** Baseline haze. Thinned during the reveal so the world sharpens with it. */
const FOG_DENSITY = 0.0014;

/** Coarse capability probe — not a benchmark, just enough to avoid handing a
 *  4-pass composer to an integrated GPU on a phone. */
function detectQuality() {
  if (typeof navigator === 'undefined') return 'high';
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const cores = navigator.hardwareConcurrency || 8;
  const mem = navigator.deviceMemory || 8;
  return mobile || cores <= 4 || mem <= 4 ? 'low' : 'high';
}

/**
 * Build the scene into `container`.
 * @returns {{dispose: function}}
 */
export function createTrainScene(container) {
  const quality = detectQuality();
  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };

  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: false,
    stencil: false,
    depth: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1.5 : 2));
  renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#000000');
  // Lighter than the night grade: heavy haze against a bright sky washes the
  // ground pale within a few hundred metres, and the dark ground is the point.
  scene.fog = new THREE.FogExp2(new THREE.Color('#000000'), FOG_DENSITY);
  const FOG_DARK = new THREE.Color('#000000');
  const FOG_LIT = new THREE.Color(P.fog);

  const camera = new THREE.PerspectiveCamera(
    30,
    (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
    0.5,
    5000
  );
  camera.position.set(36, 8, 30);

  /* --- lights ------------------------------------------------------
   * Every light is neutral. A tinted key or rim is the fastest way to break a
   * monochrome scheme, because the cast lands on the largest, flattest
   * surfaces first and reads as a colour grade rather than as lighting. */
  const amb = new THREE.AmbientLight('#dde2e5', 0.05);
  const key = new THREE.DirectionalLight('#ffffff', 0.25); key.position.set(60, 70, 45);
  const rim = new THREE.DirectionalLight('#ced5d9', 0.14); rim.position.set(-70, 30, -60);
  const hemi = new THREE.HemisphereLight('#d2d8db', '#26282a', 0.28);
  scene.add(amb, key, rim, hemi);

  /* --- sky --- */
  const skyMat = track(new THREE.MeshBasicMaterial({
    map: track(makeSky()), side: THREE.BackSide, depthWrite: false, fog: false,
  }));
  patchWorld(skyMat);
  const skyGeo = track(new THREE.SphereGeometry(3000, 32, 24));
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -100;
  sky.frustumCulled = false;
  scene.add(sky);

  /* --- ridges --- */
  const ridgeSpecs = [
    { period: 420, height: 26, depth: -170, color: P.ridgeNear, seed: 1.3, z: 10 },
    { period: 760, height: 62, depth: -340, color: P.ridgeMid, seed: 4.7, z: 22 },
    { period: 1400, height: 118, depth: -640, color: P.ridgeFar, seed: 8.1, z: 40 },
  ];
  const ridgeGroups = ridgeSpecs.map((s) => {
    const m = track(new THREE.MeshBasicMaterial({
      color: new THREE.Color(s.color), vertexColors: true, fog: true, side: THREE.DoubleSide,
    }));
    patchWorld(m);
    const mesh = new THREE.Mesh(track(ridgeGeo(s.period, s.height, s.seed, s.z)), m);
    mesh.position.set(0, -4, s.depth);
    const g = new THREE.Group();
    g.add(mesh);
    scene.add(g);
    return { g, period: s.period };
  });

  /* --- ground --- */
  const earthTex = track(makeEarth());
  earthTex.repeat.set(SPAN / 55, 1800 / 55);
  const earthMat = track(new THREE.MeshStandardMaterial({
    map: earthTex, roughness: 0.95, metalness: 0, color: new THREE.Color('#2b2d2f'),
  }));
  patchWorld(earthMat);
  const ground = new THREE.Mesh(track(new THREE.PlaneGeometry(SPAN, 1800)), earthMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(CX, -0.62, -300);
  scene.add(ground);

  /* --- track bed (sharp + pre-blurred crossfade) --- */
  const bedSharpT = track(makeBed(false)); bedSharpT.repeat.set(TILES, 1);
  const bedBlurT = track(makeBed(true)); bedBlurT.repeat.set(TILES, 1);
  const bedMatS = track(new THREE.MeshStandardMaterial({ map: bedSharpT, roughness: 0.9, metalness: 0.05 }));
  const bedMatB = track(new THREE.MeshStandardMaterial({
    map: bedBlurT, roughness: 0.9, metalness: 0.05, transparent: true, opacity: 0, depthWrite: false,
  }));
  patchWorld(bedMatS); patchWorld(bedMatB);
  const bedGeo = track(new THREE.PlaneGeometry(SPAN, BED_HW * 2));
  const bedA = new THREE.Mesh(bedGeo, bedMatS);
  bedA.rotation.x = -Math.PI / 2; bedA.position.set(CX, -0.3, 0); scene.add(bedA);
  const bedB = new THREE.Mesh(bedGeo, bedMatB);
  bedB.rotation.x = -Math.PI / 2; bedB.position.set(CX, -0.295, 0); bedB.renderOrder = 1; scene.add(bedB);

  /* --- rails --- */
  const railMat = track(new THREE.MeshStandardMaterial({
    color: new THREE.Color('#b6bdc1'), metalness: 0.92, roughness: 0.22,
  }));
  patchWorld(railMat);
  const railGeo = track(new THREE.BoxGeometry(SPAN, 0.14, 0.072));
  for (const z of [-HALF_GAUGE, HALF_GAUGE]) {
    const r = new THREE.Mesh(railGeo, railMat);
    r.position.set(CX, -0.07, z);
    scene.add(r);
  }

  /* --- catenary (treadmill: wrap the GROUP, not the instances) --- */
  const poleParts = [];
  {
    const m = new THREE.BoxGeometry(0.24, 8.4, 0.24); m.translate(0, 4.2, -4.1); poleParts.push(m);
    const a = new THREE.BoxGeometry(0.16, 0.16, 4.3); a.translate(0, 6.6, -2.0); poleParts.push(a);
    const b = new THREE.BoxGeometry(0.12, 2.4, 0.12); b.rotateX(0.72); b.translate(0, 5.4, -3.2); poleParts.push(b);
    const d = new THREE.BoxGeometry(0.06, 1.2, 0.06); d.translate(0, 5.8, 0); poleParts.push(d);
  }
  const poleMat = track(new THREE.MeshStandardMaterial({
    color: new THREE.Color('#4c5053'), metalness: 0.8, roughness: 0.45,
  }));
  patchWorld(poleMat);
  const poleCount = Math.ceil(SPAN / POLE_PITCH) + 2;
  const poles = new THREE.InstancedMesh(track(merge(poleParts)), poleMat, poleCount);
  poles.frustumCulled = false;
  {
    const d = new THREE.Object3D();
    for (let i = 0; i < poleCount; i++) {
      d.position.set(X_MIN + i * POLE_PITCH, 0, 0);
      d.updateMatrix();
      poles.setMatrixAt(i, d.matrix);
    }
    poles.instanceMatrix.needsUpdate = true;
  }
  const wireMat = track(new THREE.MeshBasicMaterial({ color: new THREE.Color('#33373a'), fog: true }));
  patchWorld(wireMat);
  const wireGeo = track(new THREE.BoxGeometry(SPAN, 0.05, 0.05));
  const catGroup = new THREE.Group();
  catGroup.add(poles);
  for (const y of [5.2, 6.62]) {
    const w = new THREE.Mesh(wireGeo, wireMat);
    w.position.set(CX, y, 0);
    catGroup.add(w);
  }
  scene.add(catGroup);

  /* --- speed lines -------------------------------------------------
   * Kept strictly in the NEAR FIELD on the camera's side of the track. Spread
   * through the full depth they stop reading as motion and start reading as
   * scratches ruled across the picture — over the sky, over the train — which
   * destroys the depth the rest of the scene works to build. */
  const SL_COUNT = quality === 'low' ? 14 : 26;
  const SL_RANGE = 150;
  const slMat = track(new THREE.MeshBasicMaterial({
    map: track(makeStreak()), transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
  }));
  const slGeo = track(new THREE.PlaneGeometry(1, 1));
  const slMesh = new THREE.InstancedMesh(slGeo, slMat, SL_COUNT);
  slMesh.frustumCulled = false;
  scene.add(slMesh);
  const slSeeds = (() => {
    let a = 12345;
    const rnd = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
    return Array.from({ length: SL_COUNT }, () => ({
      x: rnd() * SL_RANGE, y: 0.3 + rnd() * 4.6, z: 7 + rnd() * 13, s: 0.5 + rnd() * 0.8,
    }));
  })();
  const slDummy = new THREE.Object3D();

  /* --- the train ---------------------------------------------------
   * With the reveal switched off the livery is never visible for a single
   * frame — the shader replaces the shaded result outright — so the textures
   * are not built at all. That is six 2048x512 canvases and roughly 24MB of
   * texture memory skipped, which matters most on exactly the low-end devices
   * that are slowest to paint them. */
  let matHead;
  let matMid;

  if (REVEAL_ON_LAUNCH) {
    const liveryH = makeLivery(true);
    const liveryM = makeLivery(false);
    [liveryH, liveryM].forEach((s) => { track(s.map); track(s.emissiveMap); track(s.roughnessMap); });
    const bodyMat = (set) => {
      const m = track(new THREE.MeshStandardMaterial({
        map: set.map, roughnessMap: set.roughnessMap, emissiveMap: set.emissiveMap,
        emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0,
        metalness: 0.18, roughness: 1, envMapIntensity: 1.15,
      }));
      patchReveal(m);
      return m;
    };
    matHead = bodyMat(liveryH);
    matMid = bodyMat(liveryM);
  } else {
    const plain = () => {
      const m = track(new THREE.MeshStandardMaterial({
        color: new THREE.Color(P.bodyGrey), metalness: 0.28, roughness: 0.42,
      }));
      patchReveal(m);
      return m;
    };
    matHead = plain();
    matMid = plain();
  }
  const matUnder = track(new THREE.MeshStandardMaterial({ color: new THREE.Color(P.skirt), metalness: 0.65, roughness: 0.62 }));
  const matPan = track(new THREE.MeshStandardMaterial({ color: new THREE.Color(P.metal), metalness: 0.9, roughness: 0.34 }));
  patchReveal(matUnder);
  patchReveal(matPan);

  const geoHead = track(carGeometry(true));
  const geoMid = track(carGeometry(false));
  const geoTail = track(carGeometry(false, true));
  const geoUnder = track(underframe());
  const geoPan = track(pantograph());

  const train = new THREE.Group();
  for (let i = 0; i < T.CARS; i++) {
    const g = new THREE.Group();
    g.position.x = carX(i);
    const isHead = i === 0;
    const isTail = i === T.CARS - 1;
    g.add(new THREE.Mesh(isHead ? geoHead : isTail ? geoTail : geoMid, isHead ? matHead : matMid));
    g.add(new THREE.Mesh(geoUnder, matUnder));
    if (i === 2 || i === 4) {
      const p = new THREE.Mesh(geoPan, matPan);
      p.position.x = T.LEN * 0.62;
      g.add(p);
    }
    train.add(g);
  }
  /* NOTE — there is deliberately no headlight sprite here.
   *
   * An additive glow sprite was the obvious way to light the nose, and it was
   * wrong twice over: parented to the train group it sat ahead of and above
   * the nose tip, so it floated detached in mid-air, and a big soft additive
   * blob over a dark scene reads as lens dirt rather than as a lamp.
   *
   * The headlight is instead baked into the livery's emissive map at the real
   * lamp position, so it is attached to the geometry, occludes correctly, and
   * gets its glow from the bloom pass like every other light in the frame. */
  train.position.y = T.FLOOR; // lift the body onto the bogies
  scene.add(train);
  revealU.uRange.value.set(TRAIN_SPAN.min, TRAIN_SPAN.max);

  /* --- composer ----------------------------------------------------
   * HalfFloat framebuffer + tone mapping AS AN EFFECT (not on the renderer)
   * so bloom sees true HDR values above 1.0 and the reveal wavefront actually
   * glows instead of clipping.
   *
   * Wrapped in try/catch: if the postprocessing version ever disagrees with
   * this API, the splash degrades to a plain render rather than throwing
   * inside the app's boot path. */
  let composer = null;
  let bloom = null;
  let ca = null;
  try {
    composer = new EffectComposer(renderer, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: quality === 'low' ? 0 : 4,
    });
    composer.addPass(new RenderPass(scene, camera));
    // Threshold is high because the sky is now a large bright surface. Tuned
    // for a night scene (0.7) it would catch the sky itself and haze the whole
    // frame; at 0.86 only genuine highlights — rail glints, speed streaks —
    // get through.
    bloom = new BloomEffect({
      intensity: 0.35, luminanceThreshold: 0.86, luminanceSmoothing: 0.2,
      mipmapBlur: true, kernelSize: KernelSize.LARGE,
    });
    const effects = [bloom];
    if (quality === 'high') {
      const noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: true });
      noise.blendMode.opacity.value = 0.028;
      effects.push(new VignetteEffect({ darkness: 0.66, offset: 0.28 }), noise);
    } else {
      effects.push(new VignetteEffect({ darkness: 0.62, offset: 0.3 }));
    }
    // Lens character. Sits at a barely-there baseline and spikes as the
    // livery wavefront passes, so the reveal feels like it costs the optics
    // something. Must come BEFORE tone mapping — it displaces colour
    // channels, and doing that to already-tone-mapped values crushes the
    // fringe into banding.
    ca = new ChromaticAberrationEffect({
      offset: new THREE.Vector2(0.00007, 0.00003),
      radialModulation: false,
      modulationOffset: 0,
    });
    effects.push(ca);
    effects.push(new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }));
    composer.addPass(new EffectPass(camera, ...effects));
    composer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[splash] post-processing unavailable, falling back:', err);
    composer = null;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
  }

  /* --- camera rig --------------------------------------------------
   * Poses blended on continuous channels, never snapped. Elevation is higher
   * than a trackside eye on purpose: looking slightly down the roofline is
   * what shows the nose taper and the length of the rake at the same time.
   * TUNE THE COMPOSITION HERE FIRST. */
  const POSE = {
    dark: { p: new THREE.Vector3(36, 8.0, 30), t: new THREE.Vector3(-16, 2.4, 0), fov: 30 },
    world: { p: new THREE.Vector3(44, 14.5, 39), t: new THREE.Vector3(-26, 2.6, 0), fov: 34 },
    hero: { p: new THREE.Vector3(48, 16.0, 43), t: new THREE.Vector3(-30, 3.0, 0), fov: 35 },
  };
  const camPos = POSE.dark.p.clone();
  const camTgt = POSE.dark.t.clone();
  const wantP = new THREE.Vector3();
  const wantT = new THREE.Vector3();

  /* --- pointer parallax --------------------------------------------
   * A fixed camera over a moving world still reads as a video. Coupling the
   * camera to the pointer by a couple of units is what makes it read as a
   * space you are standing in. Deliberately tiny, and damped hard, so it
   * never competes with the choreography. */
  const ptr = { x: 0, y: 0 };
  const ptrTarget = { x: 0, y: 0 };
  const onPointer = (e) => {
    ptrTarget.x = (e.clientX / window.innerWidth) * 2 - 1;
    ptrTarget.y = -((e.clientY / window.innerHeight) * 2 - 1);
  };
  window.addEventListener('pointermove', onPointer, { passive: true });

  /* --- resize --- */
  const onResize = () => {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    if (composer) composer.setSize(w, h);
  };
  window.addEventListener('resize', onResize);

  /* --- frame loop --------------------------------------------------
   * Nothing below allocates. Pose vectors and the instancing dummy are all
   * hoisted; ~240 Vector3s a second handed to the GC is a classic source of
   * the periodic micro-stutter people blame on "three being slow". */
  const clock = new THREE.Clock();
  let raf = 0;
  let disposed = false;

  const render = () => {
    if (disposed) return;
    raf = requestAnimationFrame(render);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = frame.elapsed;
    const w = frame.worldMix;
    const h = smoothstep(0.15, 1, frame.reveal);

    /* THE LAUNCH MOMENT.
     * `surge` is a single 0 -> 1 -> 0 bell across the livery sweep, and every
     * environment effect below hangs off it. Driving them all from one curve
     * is what makes the moment land as one event rather than as five effects
     * that happen to fire near each other. */
    const surge = Math.sin(Math.min(frame.reveal, 1) * Math.PI);

    worldU.uWorld.value = w;
    revealU.uReveal.value = frame.reveal;

    // Key light flares as the wavefront runs, as though the train's own lamps
    // are lighting the formation.
    key.intensity = 0.25 + w * 1.5 + surge * 0.55;
    rim.intensity = 0.14 + w * 0.6 + surge * 0.3;
    amb.intensity = 0.05 + w * 0.28 + surge * 0.08;

    /* The haze has to come up WITH the world. A light fog colour applied at
     * worldMix 0 would wash the far cars pale grey while the screen is still
     * meant to be black, so the fog is lerped from black to its target. */
    scene.fog.color.copy(FOG_DARK).lerp(FOG_LIT, w);
    /* ...and it thins as the livery lands, so the distance sharpens at the
     * exact moment the train does. The world coming into focus reads as the
     * system waking up, which is the point of the whole screen. */
    scene.fog.density = FOG_DENSITY * (1 - 0.42 * h);

    // Treadmills: one float each, for any number of elements.
    for (const r of ridgeGroups) r.g.position.x = -(frame.distance % r.period);
    catGroup.position.x = -(frame.distance % POLE_PITCH);
    const off = (frame.distance / TILE_METRES) % 1;
    bedSharpT.offset.x = off;
    bedBlurT.offset.x = off;
    bedMatB.opacity = Math.min(1, frame.speedMix * 1.15);
    earthTex.offset.x = (frame.distance / 55) % 1;

    // Streaks burst as the livery lands, then settle back to the cruise value.
    const vis = Math.max(0, frame.speedMix - 0.12) * w;
    slMat.opacity = vis * (0.15 + surge * 0.5);
    if (vis > 0.001) {
      const len = 4 + frame.speedMix * 22 + surge * 26;
      for (let i = 0; i < SL_COUNT; i++) {
        const s = slSeeds[i];
        const x = ((((s.x - frame.distance) % SL_RANGE) + SL_RANGE) % SL_RANGE) - SL_RANGE * 0.35;
        slDummy.position.set(x, s.y, s.z);
        slDummy.scale.set(len * s.s, 0.07 + 0.05 * s.s, 1);
        slDummy.updateMatrix();
        slMesh.setMatrixAt(i, slDummy.matrix);
      }
      slMesh.instanceMatrix.needsUpdate = true;
    }

    if (REVEAL_ON_LAUNCH) {
      // Cabin lights and the headlight surge in behind the wavefront. The
      // head car is driven harder than the trailers so the lamp reads as a
      // lamp; bloom does the rest.
      // Named apart from the outer `surge` on purpose: this one is an
      // overshoot multiplier (1 -> 1.55 -> 1), not the 0 -> 1 -> 0 bell.
      const emissiveSurge = 1 + 0.55 * surge;
      matMid.emissiveIntensity = frame.reveal * emissiveSurge * 1.15;
      matHead.emissiveIntensity = frame.reveal * emissiveSurge * 1.45;
    }

    // Idle life — centimetres, deliberately. You should feel it, not see it.
    const spd = frame.speedMix;
    train.position.y = T.FLOOR + (Math.sin(t * 1.9) * 0.03 + Math.sin(t * 3.7 + 1.3) * 0.014 + Math.sin(t * 7.1) * 0.005) * spd;
    train.rotation.z = (Math.sin(t * 1.3 + 0.7) * 0.0028 + Math.sin(t * 2.9) * 0.0012) * spd;
    train.rotation.y = Math.sin(t * 0.9) * 0.0016 * spd + (1 - w) * Math.sin(t * 0.22) * 0.085;

    wantP.copy(POSE.dark.p).lerp(POSE.world.p, w).lerp(POSE.hero.p, h);
    wantT.copy(POSE.dark.t).lerp(POSE.world.t, w).lerp(POSE.hero.t, h);
    const creep = 1 - w;
    wantP.x += Math.sin(t * 0.16) * 5.5 * creep;
    wantP.z += Math.cos(t * 0.16) * 4.0 * creep;
    wantP.y += Math.sin(t * 0.11 + 1.1) * 1.4 * creep;
    wantP.y += (Math.sin(t * 2.3) * 0.09 + Math.sin(t * 5.1) * 0.035) * spd;
    wantP.z += Math.sin(t * 1.7 + 0.6) * 0.11 * spd;

    /* Dolly in on the launch, then back out. Pushing toward the target rather
     * than narrowing the FOV keeps the perspective honest — a zoom would
     * flatten the nose at the exact moment it is worth looking at. */
    if (surge > 0.001) {
      wantP.lerp(wantT, surge * 0.085);
      wantP.y += surge * 0.9;
    }

    /* Pointer parallax, faded in with the world so it never fights the
     * opening move. */
    if (!frame.reducedMotion) {
      ptr.x = damp(ptr.x, ptrTarget.x * w, 2.2, dt);
      ptr.y = damp(ptr.y, ptrTarget.y * w, 2.2, dt);
      wantP.x += ptr.x * 2.2;
      wantP.y += ptr.y * 1.5;
    }

    camPos.x = damp(camPos.x, wantP.x, 2.6, dt);
    camPos.y = damp(camPos.y, wantP.y, 2.6, dt);
    camPos.z = damp(camPos.z, wantP.z, 2.6, dt);
    camTgt.x = damp(camTgt.x, wantT.x, 2.2, dt);
    camTgt.y = damp(camTgt.y, wantT.y, 2.2, dt);
    camTgt.z = damp(camTgt.z, wantT.z, 2.2, dt);
    camera.position.copy(camPos);
    /* A whisper of roll. lookAt() rebuilds the camera basis from `up`, so
     * tilting `up` is the only way to get roll without fighting it every
     * frame. Two slow sines that never repeat together, plus a lean into the
     * launch — under a third of a degree, felt rather than seen. */
    const roll =
      (Math.sin(t * 0.23) * 0.0026 + Math.sin(t * 0.37 + 1.7) * 0.0014) * spd +
      surge * 0.004;
    camera.up.set(Math.sin(roll), Math.cos(roll), 0);
    camera.lookAt(camTgt);

    const fov = POSE.dark.fov + (POSE.world.fov - POSE.dark.fov) * w + (POSE.hero.fov - POSE.world.fov) * h;
    // Widen the lens on narrow viewports so a phone keeps the whole rake in
    // frame instead of cropping to a green blur.
    const aspect = camera.aspect;
    const want = fov + (aspect < 1 ? (1 - aspect) * 16 : 0);
    if (Math.abs(camera.fov - want) > 0.01) {
      camera.fov = damp(camera.fov, want, 3, dt);
      camera.updateProjectionMatrix();
    }

    if (bloom) bloom.intensity = 0.3 + w * 0.16 + surge * 0.6;
    if (ca) {
      // Peaks around a pixel of fringing at 1080p — enough to feel, not
      // enough to name.
      // Baseline is almost nothing on purpose. Thin high-contrast geometry —
      // catenary masts against a bright sky, the rail glint — fringes visibly
      // at values that look negligible on paper, so the effect lives almost
      // entirely in the surge.
      const k = 0.00007 + surge * 0.001;
      ca.offset.set(k, k * 0.45);
    }

    if (composer) composer.render();
    else renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(render);

  /* --- teardown ----------------------------------------------------
   * Thorough on purpose. This runs while the dashboard is coming alive, and
   * a leaked WebGL context plus a 60fps render loop behind the app would
   * quietly halve the framerate of the track diagram forever. */
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointermove', onPointer);
    if (composer) { try { composer.dispose(); } catch (e) { /* noop */ } }
    scene.traverse((o) => {
      if (o.isMesh || o.isInstancedMesh || o.isSprite) {
        if (o.geometry) o.geometry.dispose();
      }
    });
    for (const d of disposables) { try { d.dispose(); } catch (e) { /* noop */ } }
    scene.clear();
    renderer.dispose();
    renderer.forceContextLoss();
    if (renderer.domElement && renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
  };

  return { dispose };
}
