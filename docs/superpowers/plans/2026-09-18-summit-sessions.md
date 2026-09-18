# MAD STEEZ Implementation Plan

**Goal:** Deliver a playable and visually polished five-jump skiing game in the browser.

**Architecture:** Pure fixed-step ski simulation and shared terrain sampler feed a Three.js scene. Browser input and a small HTML HUD wrap the immediate-start run.

**Tech Stack:** JavaScript modules, Three.js, Vite, Node test runner.

**Spec:** docs/superpowers/specs/2026-09-18-summit-sessions-design.md

## Global constraints

- Keyboard first; one slope, five jumps; no snowboarding or customization.
- Starts immediately; pause and respawn always accessible.
- Prioritize skiing, tricks, jump feel and alpine visuals.

## Tasks

- [x] 1. Write failing simulation tests in tests/physics.test.js. Implement src/course.js exports JUMPS, LENGTH, centerAt(s), groundHeight(x,s), rampAt(x,s), and src/physics.js exports createState(), step(state,input,dt), respawn(state), resolveLanding(state). Run `npm test` through red and green. Verify real acceleration, five takeoffs/landings, jump charge, landing safety, pause/reset and finish.
- [x] 2. Build src/world.js and src/skier.js. Share groundHeight between terrain vertices and physics; build terrain, mountains, forest, course markers, lift and articulated skier. Wire index.html, src/main.js and src/style.css for immediate play and responsive HUD. Verify `npm run build`.
- [x] 3. Add src/effects.js for pooled snow spray, persistent ski tracks and synthesized ski/wind/landing sounds. Tune camera, tricks and boost feedback while maintaining deterministic physics.
- [x] 4. Run tests and production build; inspect browser and exercise real keyboard input, jump/landing, pause/resume/respawn and complete run. Correct observed issues. Record controls, setup and limitations in README.md and leave local preview running.


