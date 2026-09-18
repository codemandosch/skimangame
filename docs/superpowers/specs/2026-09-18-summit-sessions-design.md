# MAD STEEZ — skiing prototype

Build a keyboard-first browser skiing game inspired by the arcade movement and alpine presentation of SSX On Tour. The game starts directly on a single downhill course with five jumps. No customization or menu navigation is needed. Original procedural artwork and branding keep all assets available in the repository.

Three.js renders a third-person skier, detailed snow, mountains, forest, terrain park ramps, ski lifts, shadows, particles and trails. Vite serves and bundles the application. A pure JavaScript simulation uses a fixed 120 Hz step, independent of the render rate. Terrain sampling is shared between rendering and physics. Custom physics are preferred to rigid-body simulation for predictable, forgiving arcade controls; Babylon.js would also work but its integrated subsystems are unnecessary here.

Ground controls: A/D or left/right carve, W/up tuck, S/down brake, hold/release Space to charge/pop, Shift to spend boost. In air A/D spin, W/S flip, Q/E grab. Releasing rotation controls assists alignment; unsafe landings bail and recover locally. Landed tricks bank points and refill boost. The five ramps launch automatically at their lips; a charged release adds height. Escape/P pauses, R respawns at the top. Pause, respawn and sound buttons are available. Tab blur and hidden document pause the simulation and clear input.

The run has progress, speed, boost, airborne combo feedback, total score and a compact finish overlay with replay. A best score is stored locally when available. Graphics aim for a rich snow resort with a cyan sky, distant mountain layers, cold shadows, warm sunlight and a brightly clothed animated skier. This first version uses procedural assets rather than original SSX game assets and does not claim visual parity with a full production game.

Modules: course.js defines the height field and jump profiles; physics.js owns state and progression; world.js builds environment; skier.js poses the rider; effects.js owns particles/trails/audio; main.js binds input, fixed stepping, camera, UI and rendering; style.css presents the HUD.

Verification: Node tests cover acceleration/braking, five automatic takeoffs, charged jump height, steering bounds, airborne control, safe and unsafe landings, combo banking, pause, reset and finish. Build with Vite. Inspect the running game in a browser and exercise controls, pause/restart and at least one full run. Keep the server available to the user.

