# Intro splash

A WebGL loading sequence that plays over the app on load, then fades out to
reveal whatever route is underneath.

| Progress | What happens |
|---|---|
| 0 → 50% | Black. An unlit E5-series rake resolves out of the dark. Camera creeps around the nose. |
| 50% | The bar **pauses for a beat** while the world blooms in — sky, ridges, ballast, rails, catenary. The train pulls away from standstill. |
| 50 → 100% | The world reaches cruise. The train is still unpainted. |
| 100% | **Parks here.** A LAUNCH button appears and the world keeps running. Nothing advances until someone clicks. |
| on Launch | The **livery sweeps on**, nose to tail, behind a glowing wavefront; cabin lights and the headlight surge in behind it. Then it routes to `/dashboard` and cross-fades. |

The world is high-key monochrome — bright overcast sky, dark grey ground, dark
grey train between them, white accents, no hue anywhere (see `P` at the top of
`trainScene.js`). The livery is the single exception, and that is the point:
it is the only colour in the frame, so the repaint reads as the payoff the
sequence has been withholding rather than as a texture swap.

`Escape` or the Skip control bails out at any point — straight to the app, no
reveal. That is a real escape hatch, not a fast-forward: someone who wants out
should get out, not get one step closer to out.

## How it is wired in

It is a **route**: this component is what `/` renders. It is mounted only
while you are on `/`, and that single fact is what makes the two obvious
behaviours work.

| You do | What happens | Why |
|---|---|---|
| Refresh on `/dashboard` | Dashboard reloads. No intro. | The splash isn't mounted on that route. |
| Click FLOW in the HUD | Goes to `/`, intro plays again | The route mounts fresh each time. |
| Press LAUNCH | Fades, then routes to `/dashboard` | |

Total footprint in existing code: **two lines in `src/App.js`** — the import,
and the `/` route element.

An earlier version mounted this in `src/index.js` as a full-screen overlay
beside `<App />`. That meant it played on *every* page load regardless of
route, so refreshing the dashboard replayed the whole intro, and `/` still
rendered the old placeholder underneath it. Scoping it to the route removed
both problems with no special-casing — worth remembering if you are ever
tempted to move it back up to `index.js`.

`src/pages/HomePage.js` and `HomePage.css` are now unreferenced — they were the
placeholder this replaced. Safe to delete whenever you like; they are left in
place rather than removed for you.

## Removing it

1. Delete `src/components/SplashScreen/`
2. In `src/App.js`, point the `/` route back at your own home component

That's the whole removal. No other file changed.

## Dependencies

None added. Uses `three` and `postprocessing`, both already in
`package.json`. Every texture is painted on a `<canvas>` at runtime — there
are no image files to download, because a loading screen that downloads its
own assets defeats its own purpose.

## Tuning

| What | Where |
|---|---|
| Duration, cruise speed, the 50% beat | `TIMING` in `splashSequence.js` |
| **Camera composition** | `POSE` in `trainScene.js` — start here |
| Livery colours, fog, ridge tones | `P` at the top of `trainScene.js` |
| Body proportions, car count, nose length | `T` in `trainScene.js` |
| Status line copy | `statusFor()` in `splashSequence.js` |
| Play once per tab vs. every load | `PLAY_ONCE_PER_SESSION` in `SplashScreen.js` |
| Where Launch goes | `LAUNCH_ROUTE` in `SplashScreen.js` |
| Repaint the train on Launch | `REVEAL_ON_LAUNCH` in `splashSequence.js` (see below) |
| Overlay chrome (bar, brand, Launch, skip) | `SplashScreen.css` |

`MIN_DURATION` is 4800ms. During development you will probably want
`PLAY_ONCE_PER_SESSION = true` so it doesn't replay on every hot reload.

Scale is 1 unit = 1 metre with real E5 dimensions: 3.35m wide, roof 3.70m
above rail, 25m cars, 1.435m gauge, 0.86m wheels.

## Notes for whoever maintains this

**It cannot break the app.** Every failure path ends in "reveal the app":
no WebGL support, a scene-construction throw, a postprocessing API mismatch,
or a hung sequence (15s watchdog) all dismiss the overlay. Escape or the Skip
control also end it immediately.

**It fully tears down.** When the sequence finishes, the WebGL context is
disposed and the canvas removed. Leaving a render loop running behind the
track diagram would quietly cost you framerate for the rest of the session.

**`REVEAL_ON_LAUNCH` is a real switch, not dead code.** It is `true`: Launch
repaints the train in the E5 livery. Set it `false` and the train keeps its
grey finish and Launch just hands off. The switch also gates livery texture
generation, so with it off the scene skips six 2048×512 canvases and ~24MB of
texture memory it would never display.

**The watchdog does not cover the Launch wait.** It is armed for the automatic
run-up, cleared on `ready`, and re-armed for the reveal. A timer that fired
while someone was deciding whether to click would yank the screen out from
under them.

**There is deliberately no headlight sprite.** An additive glow sprite was the
obvious way to light the nose and it was wrong twice over: parented to the
train group it sat ahead of and above the nose tip, so it floated detached in
mid-air, and a big soft additive blob over a dark scene reads as lens dirt
rather than as a lamp. The headlight is baked into the livery's emissive map at
the real lamp position instead, so it is attached to the geometry, occludes
correctly, and gets its glow from the bloom pass like every other light.

**Three things in here are load-bearing and easy to break:**

1. The reveal shader injects at `<opaque_fragment>` and modifies linear
   `outgoingLight`. three's chunk order is
   `opaque_fragment → tonemapping → colorspace → fog → dithering`, so
   injecting at the end (the usual choice) puts you after tone mapping and
   sRGB encode — the wavefront then clips instead of rolling off, and bloom
   has nothing above 1.0 to latch onto.
2. `customProgramCacheKey` on the patched materials is mandatory. Without it
   three reuses a program compiled *before* the patch and the effect silently
   does nothing.
3. Sleepers are painted into the track texture, not instanced. At cruise they
   would cross the frame at ~68 Hz, past the display refresh, so discrete
   geometry strobes and reverses. That is temporal aliasing — MSAA cannot fix
   it.

Verified against three r160 and r180.

## Swapping in a different train model

`trainScene.js` builds the train procedurally (swept superellipse — that's how
you get the E5's long duckbill nose). To use a GLB instead, load it with
`GLTFLoader`, call `patchReveal()` on each mesh's material, and set
`revealU.uRange` from the model's bounding box on the X axis. The rest of the
sequence is model-agnostic.
