# MAD STEEZ

A playable browser skiing game inspired by SSX On Tour. Explore Blackridge, an open mountain roughly 4 km across with 531 natural terrain features, including twelve huge jumps. Built with [Three.js](https://threejs.org/docs/), Vite, and original procedural artwork.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. New runs spawn at the centre of a flat, round 3.5 m pad on Blackridge's summit, just wider than the skis. Turn in place with left/right arrows (or J/L), then hold Ctrl to skate off in your chosen direction. The raised summit camera follows your heading and looks down the face while the run timer waits for your first push. The lift's summit roof clears this downhill approach. `npm run build` produces a static deployment in `dist/`; `npm run preview` serves that build locally. No accounts, API keys or asset-generation services are needed.

Blackridge is the only map. Older map links also open Blackridge, and existing Blackridge best scores are preserved.

The **East Face Park Line** is built into Blackridge: a 160 m wide groomed strip follows the face's average downhill pitch, with feathered edges joining the surrounding mountain. The drop-in and park features sit 100 m uphill from their original locations. Three large curved kickers retain their 32 / 40 / 48 m heights with 10% longer approaches for gentler takeoffs. Their separate landings are 140 / 144 / 148 m wide and 96 / 102 / 108 m long: the front half has been removed, and the landing starts rise 24 / 28 / 32 m above the groomed strip for steeper descents. Each landing starts with a plateau covering 35% of its length and following the groomed mountain pitch before descending more steeply to the runout. Gaps are approximately 137.87 / 146.2 / 136 m. The first kicker sits 5.27 m uphill of its earlier position, keeping its landing in place. Two metal handrails, 50 and 60 m long, sit between the jumps with low 32 m entry kickers. A lower spine jump finishes the line with a curved approach, roughly 25 m of rise above the groomed strip, and a straight 16 m horizontal takeoff edge. Its approximately 65° lip redirects approach momentum forward and upward without the former takeoff speed loss. Left/right controls let you choose the landing faces on either side of its 4 m wide, 112 m long central plateau, followed by a 120 m taper. Surface travel and airborne motion carry the same approach momentum through the curved ramp, and charged pops work consistently before and just after the lip. A height pole midway along the spine measures 0–60 m above the lip, with metre ticks and labels every 10 m. Blue snow dye marks the lips and landing zones, and orange flags mark the lane edges. Use **Ride East Face Park Line** from the start or pause screen to reach the line; Backspace restarts at that drop-in, and **Back to the summit** returns to the summit. Handrails catch automatically: tap left/right for a 180, release Space to pop.

Blackridge has approximately 1,900 vertical metres of relief. Descend any side, traverse between six named areas, and finish after landing in the outer base runout. Staggered wind lips, cliff shelves, connected ridges and catch bowls replace the former corridor. The small round summit platform blends into steep slopes in every direction, with twelve early cornices and further side hits connecting the major jumps. Another 100 small wind lips fill the gaps: 20 on the upper mountain, 35 in the middle and 45 lower down, with space reserved for existing approaches and landings. A further 359 broad snowfield rollers connect the gaps, while deep basin exits retain smooth central paths. A terrain coverage regression checks that every sampled point on the main mountain has a takeoff within 200 m. Distant terrain retains more detail so upcoming lips remain visible. All sloped mountain terrain is snow-covered; steepness alone never exposes rock. Signature jumps produce long flights, with exceptional fast, charged approaches exceeding twelve seconds in simulation. Takeoffs respond to the terrain and approach direction. A contour minimap and altitude display help with orientation; there are no mandatory gates or ordered jumps. Terrain rendering near the skier shares its two-metre triangles with collision. Rider alignment accounts for both forward and sideways slope, and the camera checks terrain clearance throughout turns.

## Controls

| Key            | On snow                        | In the air            |
| -------------- | ------------------------------ | --------------------- |
| ← / → or J / L | Carve left / right             | Spin left / right and adjust flight |
| ↑ / ↓ or I / K | Tuck / brake                   | Frontflip / backflip  |
| Space     | Hold to charge; release to pop | Release within 0.3 seconds of leaving a ledge to use the held charge |
| Ctrl      | Hold to skate and double pole; assistance fades out at 144 km/h | — |
| Q / W / E / S / D  | —                              | Blunt / mute / tail / Octo / Japan grab |
| A              | —                              | Daffy: front nose + rear tail grab; release to recover |
| Escape / P     | Pause / resume                 | Pause / resume        |
| F              | —                              | Bow and Arrow double grab |
| R              | —                              | Hold Hang Out; release to recover |
| Backspace      | Restart at the summit          | Restart at the summit |
| M              | Toggle sound                   | Toggle sound          |

On snow, only releasing Space adds pop. While sliding a lift cable, pressing Space pops immediately. Turning and holding charge keep the skis on ordinary snow; authored lips and kickers release the skis cleanly at their crests and carry their ramp lift into a natural jump. Arrow keys control both skiing and aerial tricks. Hold Space to charge the jump, then release close to a lip for more airtime; a short grace window also accepts a release just after leaving the edge. Speed builds downhill and falls uphill; flatter terrain gradually slows you through drag. Tucking reduces drag, while braking and carving shed speed. Hold either **Ctrl** key to skate and double pole from rest or add speed while cruising. The stronger forward push fades smoothly with speed and stops contributing at **144 km/h**; it has no effect in the air, on lift cables, or during a wipeout. Holding an arrow through takeoff starts the corresponding trick. A carve carries into spin in the same direction, even if you release the turn on the pop frame; straighten out before takeoff for a straight air.

Hold ↑ or ↓ at the lip to set flip momentum, and ← / → to set spin momentum. Holding a vertical and side arrow together favors spin: the flip component is reduced to 60%, producing a cork around one stable tilted axis. All four diagonal combinations work, while straight flips and spins keep their full speed. A short 0.12-second takeoff window also accepts your first input just after launch. Rotation control then fades continuously with airtime. Spin corrections reach about 14% strength after one second and 7% after two seconds; up/down corrections have stronger acceleration and fade more gently, retaining about 74% and 62% respectively, with a 55% minimum for late landing adjustments. Up/down remains responsive throughout long jumps; opposite input first slows existing momentum, then can reverse it if held. Releasing the arrows eases rotation to a stop at the resulting angle, without seeking a level orientation. Release earlier to allow for that extra rotation. Release just the flip arrow to settle into a tilted spin. Landings use the rider's actual orientation, and corks do not earn credit for flips the rider never completed. Bring the skis back under you before touchdown, pointing downhill or switch. There is no midair auto-leveling or automatic trick completion.

Hold Q, W, E, S or D for grabs; combine grabs, spins and flips for a score multiplier. Hold F for Bow and Arrow: extend one leg sideways, tuck the other toward the opposite knee and hold one ski with each hand. Release F to recover. Hold R in the air for Hang Out: arch back, spread your arms, bend your knees and loosely cross the skis. Combine it with a backflip, then release R to recover. Backspace respawns. D performs Japan: one leg extended, the other tucked back, with the opposite hand gripping beneath the tucked ski binding. S performs Octo: crossed skis with one hand holding the front of one ski and the other holding the tail of the other ski. Hold A in the air for Daffy: one ski extends forward and the other back, with one hand on the front ski’s nose and the other on the rear ski’s tail. The pose takes 0.5 seconds to enter and 0.5 seconds to recover after release. Release A before landing; touching down before recovery finishes causes a wipeout. Completing the pose and recovery earns trick credit. Clean landings bank the score. Landing upside-down or sideways causes a brief wipeout and automatic local recovery. A straight-air jump also earns a small reward.

Aerial controls take inspiration from the directional spin/flip combinations in the [SSX On Tour Prima guide](https://ogxbox.co.uk/media/com_eshop/attachments/SSX_on_Tour_Strategy_Guide_Book.pdf). The shared arrow-key controls and momentum are a keyboard adaptation, not a claim to reproduce the original game's internal physics.

Best completed-run score is saved in browser storage. Leaving the window automatically pauses. The pause and finish overlays have replay controls. Sound starts muted and uses synthesized wind, ski scrape and impact sounds.

The **RP Rock Mix** player below the top controls streams [Radio Paradise](https://radioparadise.com)'s live rock station. Click **PLAY**, adjust **VOL**, or click **STOP** to disconnect. Radio starts off and has independent volume and playback controls from the game's SOUND / M effects toggle. It keeps playing through pauses and restarts. An internet connection is required; connection failures show **RETRY**. No music is bundled with the game. The stream comes from the station's [stream directory](https://radioparadise.com/listen/stream-links).

Land a 180 or 540 to ride switch. That stance persists along the slope and into your next charged jump or automatic ramp takeoff. Straight airs and 360s keep your stance; another odd half-turn changes it. Controls remain relative to the downhill direction. The HUD shows SWITCH, and tricks started backward receive a SWITCH label. A wipeout recovery or respawn restores forward stance.

## Alpine environment

The mountain has three original Blender fir variants with snow-covered branches and fine needle fringes. Blackridge keeps 150 well-spaced trees in small lower-mountain groups, strictly below the halfway summit-to-base elevation, with authored jump approaches and landings kept clear. Distant trees use simplified instanced geometry.

Snow has subtle wind-shaped surface relief, cooler shaded areas, and soft powder spray that follows the skier's direction, grows during carving/braking, and settles back onto terrain. Twin ski grooves with pale powder edges follow every grounded turn and remain visible for the whole run; restarting clears them. Tracks are visual surface impressions and do not deform the collision terrain. High clouds, matching sun/shadow direction and layered distant ridges complete the environment.

The editable Blender source and rebuild instructions are in [art/environment/snow-firs](art/environment/snow-firs/README.md). Open `/tests/visual/environment.html` on the dev server to inspect the firs, lower mountain, powder and tracks.

## Summit Express / cable rails

Logs, handrails and lift cables earn 20 points per metre slid, capped at 1,000 distance points per combo before multipliers. Pops and rail reconnections share that cap. Completed rail 180s add 180 points. Link slides with flips, spins, grabs or Daffy before landing on snow to build one combo; each extra trick category adds 0.5× to the multiplier. The HUD shows pending points and the multiplier throughout slides and jumps. Pops and rail reconnections keep the combo alive, clean snow landings bank it, and wipeouts lose the pending combo.

Blackridge also has 90 rideable fallen trunks spread across its six faces: 60 slope logs, 38-56 metres long, resting on low snow ridges, and 30 logs, 30-38 metres long, projecting from natural ledges and kickers. The snow supports have broad shoulders and tapered approaches, with matching rendered terrain and ski collision. Touch any exposed part of a trunk with your skis to snap into a sideways slide, including slow or crosswise entries along its sides. Upright landings on top also catch automatically. Tap left/right for a 180 and release Space to pop. Trunk slides keep the normal follow camera. A minimum horizontal slide speed of 32 m/s keeps every trunk moving, and uphill timber preserves that speed (or a faster entry speed) through its automatic end launch. The original procedural timber has ridged bark, exposed growth rings, snapped branches and patches of snow; rendering and ski contact share the same top line. Inspect and try both kinds at `/tests/visual/logs.html`.

The mountain has an animated chairlift running between base and summit, with sagging twin cables, support towers and terminal wheels. Blackridge's lift follows the Hanging Glacier fall line, with gentler sideways slopes beneath the wires and approach kickers aligned to both cables. The orange line on the minimap marks its route.

Fly upright within 3.5 metres of either cable to magnetically snap into a sideways slide, including approaches from the side or below. The lift terminal sits just below the summit. The skier aligns perpendicular to the wire and stays attached through its changes in slope. Tap left/right (or J/L) for one animated 180 in that direction; holding the key does not repeat the turn. Tap Space to pop immediately, keeping your momentum; magnetic capture waits until you return toward the wire so it does not cancel your jump. Time the pop to clear a tower's upper guard and reconnect beyond it. Hitting a support causes a wipeout and detaches the skier. Reaching a terminal releases the skier into the air. Snow tracks and powder are suppressed while on the cable.

Rendering, landing capture and swept tower collisions share `src/lift-layout.js`; `src/cable-physics.js` handles attachment, turns, pops and crashes, and `src/lift-world.js` builds the instanced towers and moving chairs. `tests/cable-rail.test.js` covers real snow-to-cable entries, both cables, directional 180s, tower impacts, tower clearances at 30/60/120 Hz, reset/pause, and reverse travel. The development-only `/tests/visual/lift.html` page provides landing, crash and successful tower-hop demonstrations using the normal game physics.

## Structure and checks

- `src/course.js`: course selection and shared terrain functions used by simulation, rider, effects and rendering.
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
- `tests/blackridge.test.js`: all-direction descents, signature jump flights, completion and legacy map links.
- `tests/mountain-contact.test.js`: full-circle slope contact, matching terrain triangles, restart detail and camera clearance.
- `tests/rider-pose.test.js`: hand/ski contact, boot alignment, limb lengths and smooth turning regressions.
- `tests/skinned-rider.test.js`: contact and transition checks against the actual shipped GLB, including transformed parent spaces.
- `tests/visual/rider.html`: development-only close-up pose viewer. Open this path on the Vite server to inspect grabs, leg crossing and carving from different angles.
- `tests/visual/grabs.html`: development-only contact sheet of every held grab from several angles, showing how far each skinned hand misses its ski. Narrow it with `?grabs=mute,japan&views=front,side&size=400`.

```sh
npm test
npm run build
```

## Prototype scope

This is an original SSX-inspired prototype, not a recreation using the original game's models, terrain or music. The rider uses an original generated concept, a Tripo mesh and textures, and a fitted Blender skeleton. Ski-specific poses are blended procedurally with measured limb lengths; eleven editable actions are also saved in the Blender file. The BLACKRIDGE twin-tip skis use an original generated concept and Tripo mesh finished in Blender, with procedural equipment retained as a load-failure fallback. The environment uses procedural geometry and an original generated granite texture in `public/textures/alpine-granite.png`. Terrain blends this texture across cliff faces and adds snow surface relief. It includes one rider and one open mountain; no snowboarding, opponents, mobile touch controls or gamepad support. Blackridge trees have collision and are kept clear of the authored jump approaches and catch basins. For good performance, use a desktop browser with hardware acceleration. Google Fonts improves HUD typography when online; local system fonts provide a fallback.
