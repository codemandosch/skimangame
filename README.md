# SKIMANGAME

A playable browser skiing game inspired by SSX On Tour. Choose the original 1,180 m Bluebird park run or Blackridge, an open mountain roughly 4 km across with 531 natural terrain features, including twelve huge jumps. Built with [Three.js](https://threejs.org/docs/), Vite, and original procedural artwork.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. On Blackridge, choose a heading with left/right arrows at the summit, then press up to push off. Bluebird starts moving immediately. `npm run build` produces a static deployment in `dist/`; `npm run preview` serves that build locally. No accounts, API keys or asset-generation services are needed.

The **MAP** picker switches between courses and starts a fresh run. Blackridge is the default; `/?map=blackridge` and `/?map=bluebird` link directly to either map. Best scores are saved separately.

Blackridge has approximately 1,900 vertical metres of relief. Descend any side, traverse between six named areas, and finish after landing in the outer base runout. Staggered wind lips, cliff shelves, connected ridges and catch bowls replace the former corridor. The small summit tip falls away steeply in every direction, with twelve early cornices and further side hits connecting the major jumps. Another 100 small wind lips fill the gaps: 20 on the upper mountain, 35 in the middle and 45 lower down, with space reserved for existing approaches and landings. A further 359 broad snowfield rollers connect the gaps, while deep basin exits retain smooth central paths. A terrain coverage regression checks that every sampled point on the main mountain has a takeoff within 200 m. Distant terrain retains more detail so upcoming lips remain visible. All sloped mountain terrain is snow-covered; steepness alone never exposes rock. Signature jumps produce long flights, with exceptional fast, charged approaches exceeding twelve seconds in simulation. Takeoffs respond to the terrain and approach direction. A contour minimap and altitude display help with orientation; there are no mandatory gates or ordered jumps. Terrain rendering near the skier shares its two-metre triangles with collision. Rider alignment accounts for both forward and sideways slope, and the camera checks terrain clearance throughout turns.

## Controls

| Key            | On snow                        | In the air            |
| -------------- | ------------------------------ | --------------------- |
| ← / → or J / L | Carve left / right             | Spin left / right and adjust flight |
| ↑ / ↓ or I / K | Tuck / brake                   | Frontflip / backflip  |
| Space     | Hold to charge; release to pop | —             |
| Q / W / E / S / D  | —                              | Mute / blunt / tail / Octo / Japan grab |
| A              | —                              | Daffy: front nose + rear tail grab; release to recover |
| Escape / P     | Pause / resume                 | Pause / resume        |
| R              | Restart at the summit          | Restart at the summit |
| M              | Toggle sound                   | Toggle sound          |

Only releasing Space adds pop. Turning and holding charge keep the skis on ordinary snow; riding off an edge starts a natural fall without upward lift. Arrow keys control both skiing and aerial tricks. Hold Space to charge the jump, then release close to a lip for more airtime. Speed builds downhill and falls uphill; flatter terrain gradually slows you through drag. Tucking reduces drag, while braking and carving shed speed. Holding an arrow through takeoff starts the corresponding trick. A carve carries into spin in the same direction, even if you release the turn on the pop frame; straighten out before takeoff for a straight air.

Hold ↑ or ↓ at the lip to set flip momentum, and ← / → to set spin momentum. A short 0.12-second takeoff window also accepts your first input just after launch. Rotation control then fades continuously with airtime. Spin corrections reach about 14% strength after one second and 7% after two seconds; flip corrections fade more gently, retaining about 38% and 20% respectively, with a 15% minimum for late landing adjustments. Late inputs make small corrections; opposite input slows existing momentum instead of instantly reversing it. Releasing the arrows eases rotation to a stop at the resulting angle, without seeking a level orientation. Release earlier to allow for that extra rotation. For a cork-style tilted spin, set both rotations near takeoff, then release the flip to settle into a tilt while holding the spin. Bring the skis back under you before touchdown, pointing downhill or switch. There is no midair auto-leveling or automatic trick completion.

Hold Q, W, E, S or D for grabs; combine grabs, spins and flips for a score multiplier. D performs Japan: one leg extended, the other tucked back, with the opposite hand gripping beneath the tucked ski binding. S performs Octo: crossed skis with one hand holding the front of one ski and the other holding the tail of the other ski. Hold A in the air for Daffy: one ski extends forward and the other back, with one hand on the front ski’s nose and the other on the rear ski’s tail. The pose takes 0.5 seconds to enter and 0.5 seconds to recover after release. Release A before landing; touching down before recovery finishes causes a wipeout. Completing the pose and recovery earns trick credit. Clean landings bank the score. Landing upside-down or sideways causes a brief wipeout and automatic local recovery. A straight-air jump also earns a small reward.

Aerial controls take inspiration from the directional spin/flip combinations in the [SSX On Tour Prima guide](https://ogxbox.co.uk/media/com_eshop/attachments/SSX_on_Tour_Strategy_Guide_Book.pdf). The shared arrow-key controls and momentum are a keyboard adaptation, not a claim to reproduce the original game's internal physics.

Best completed-run score is saved in browser storage. Leaving the window automatically pauses. The pause and finish overlays have replay controls. Sound starts muted and uses synthesized wind, ski scrape and impact sounds.

The **RP Rock Mix** player below the top controls streams [Radio Paradise](https://radioparadise.com)'s live rock station. Click **PLAY**, adjust **VOL**, or click **STOP** to disconnect. Radio starts off and has independent volume and playback controls from the game's SOUND / M effects toggle. It keeps playing through pauses and restarts. An internet connection is required; connection failures show **RETRY**. No music is bundled with the game. The stream comes from the station's [stream directory](https://radioparadise.com/listen/stream-links).

Land a 180 or 540 to ride switch. That stance persists along the slope and into your next charged jump or automatic ramp takeoff. Straight airs and 360s keep your stance; another odd half-turn changes it. Controls remain relative to the downhill direction. The HUD shows SWITCH, and tricks started backward receive a SWITCH label. A wipeout recovery or respawn restores forward stance.

## Structure and checks

- `src/course.js`: course selection and shared terrain functions used by simulation, rider, effects and rendering.
- `src/bluebird.js`: original terrain and five park jump profiles.
- `src/blackridge.js`: open-mountain terrain, 531 terrain features, trees and base detection.
- `src/mountain-physics.js`: arbitrary-direction skiing, natural takeoffs and open-mountain completion.
- `src/mountain-world.js`: terrain tiles, detail updates and lower-mountain forest.
- `src/ground-frame.js`: compound-slope rider alignment and ski clearance.
- `src/mountain-camera.js` and `src/mountain-map.js`: terrain-aware chase camera and contour navigation.
- `src/physics.js`: deterministic ski simulation, tricks, landings and scoring.
- `src/world.js`: mountain, snow, forest, rocks, course furniture and moving chairlift.
- `src/skier.js`: skinned character integration, generated BLACKRIDGE equipment and procedural load-failure fallbacks.
- `src/skinned-rider.js`: measured-limb IK for the Blender skeleton, rigid boot contact, grab reach and head movement.
- `public/models/freestyle-skier.glb`: self-contained textured character with a 22-bone Blender rig.
- `art/characters/freestyle-skier/`: concept, preserved Tripo export, rigging scripts and editable Blender actions; see `docs/character-production-workflow.md`.
- `public/models/blackridge-ski.glb`: original textured twin-tip ski and binding, duplicated as rigid equipment at runtime.
- `art/equipment/blackridge-skis/`: generation input, preserved Tripo export, Blender source and reproducible finishing scripts.
- `src/rider-pose.js`: blended carving/tuck poses and two-bone arm/leg IK. Grabs target points on the moving ski; boots and bindings share the same transform.
- `src/rider-materials.js`: clothing seams, equipment graphics and rider materials.
- `src/effects.js`: pooled snow spray, ski tracks and synthesized audio.
- `src/main.js`: keyboard input, fixed 120 Hz simulation, camera and HUD.
- `tests/physics.test.js`: automated skiing and gameplay regressions.
- `tests/blackridge.test.js`: all-direction descents, signature jump flights, completion and course switching.
- `tests/mountain-contact.test.js`: full-circle slope contact, matching terrain triangles, restart detail and camera clearance.
- `tests/rider-pose.test.js`: hand/ski contact, boot alignment, limb lengths and smooth turning regressions.
- `tests/skinned-rider.test.js`: contact and transition checks against the actual shipped GLB, including transformed parent spaces.
- `tests/visual/rider.html`: development-only close-up pose viewer. Open this path on the Vite server to inspect grabs, leg crossing and carving from different angles.

```sh
npm test
npm run build
```

## Prototype scope

This is an original SSX-inspired prototype, not a recreation using the original game's models, terrain or music. The rider uses an original generated concept, a Tripo mesh and textures, and a fitted Blender skeleton. Ski-specific poses are blended procedurally with measured limb lengths; eleven editable actions are also saved in the Blender file. The BLACKRIDGE twin-tip skis use an original generated concept and Tripo mesh finished in Blender, with procedural equipment retained as a load-failure fallback. The environment uses procedural geometry and an original generated granite texture in `public/textures/alpine-granite.png`. Terrain blends this texture across cliff faces and adds snow surface relief. It includes one rider and two courses; no snowboarding, rails, opponents, mobile touch controls or gamepad support. Blackridge trees have collision and are kept clear of the authored jump approaches and catch basins. Bluebird scenery remains outside its bounded ski corridor. For good performance, use a desktop browser with hardware acceleration. Google Fonts improves HUD typography when online; local system fonts provide a fallback.

