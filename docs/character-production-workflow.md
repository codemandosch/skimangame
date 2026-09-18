# Freestyle skier: concept → Tripo Studio → Blender → Three.js

Adapted from `C:/Users/gaza/Projects/sorc/docs/art/character-production-workflow.md`.

## Character direction

An original adult freestyle skier with an oversized orange/cream jacket, loose charcoal snow pants, helmet, amber goggles and rigid cream boots. Aim for an early-2000s extreme-sports silhouette: long legs, readable cloth folds and athletic, expressive poses. SSX On Tour is the visual and movement reference, not a source of extracted assets.

The existing rider is assembled from rigid procedural shapes. Replace the clothing/body with a continuous skinned mesh while preserving gameplay-controlled translation, spin, flip and switch stance. Keep equipment separate from the generated body.

## Production

1. Create one full-body front A-pose image, with separated arms and legs, no skis, poles, props, alternate views or text. Inspect the actual generation input. Preserve it in `art/characters/freestyle-skier/concept/`.
2. Generate and inspect the body in one Tripo Studio workspace. Studio and API credentials/credits are separate. Use the signed-in Studio route if API credits are unavailable.
3. Retopologize for approximately 12k quads, inspect silhouette, then use the humanoid auto-rig. Verify shoulders, knees, elbows and hips in a preview animation before export. Do not rely on generic walk/run animations to produce skiing.
4. Export the skeleton, textures and a useful verification clip once, preserving the original archive under `tripo/`. Use FBX / Blender / 2k and in-place motion; verify the actual downloaded file and imported armature.
5. In Blender preserve the original import in a source `.blend`. Make local corrections in a separate game file. Normalize character size/facing and retain a usable Tripo skeleton. If rigging stalls or the export has no armature, fit a local deform skeleton. For this open/disconnected mesh, heat weighting uses a temporary watertight voxel proxy; barycentric transfer returns those weights to the unchanged textured mesh. Make boots and helmet rigid, then limit skinning to four normalized influences. Inspect deep knee bends, jacket hem and shoulders.
6. Build skiing poses on the retained rig: neutral flexed stance, carve left/right, tuck, charged crouch, jump extension, airborne compact pose, mute grab, tail grab, landing compression and switch look-back. Export a self-contained GLB with skin, textures and any authored clips; retain the editable `.blend` and a bone/mesh report.
7. In Three.js load the GLB with `GLTFLoader`, map the imported bones explicitly, and blend poses from gameplay state. Use measured rig proportions for IK. Anchor both feet to skis and grab hands to ski targets. Root translation and trick rotation remain physics-controlled, avoiding animation root-motion drift or double rotation.
8. Verify in the existing close-up rider viewer and in gameplay. Inspect front, side and rear views of carving, tuck, both grabs, landing, switch and reset. Run automated contact/continuity checks and the production build. Preserve the procedural rider as a load-failure fallback.

## Motion priorities

- Flexible hips, knees and ankles; stable boot-to-binding contact.
- Carving driven by lateral hip movement and leg angulation, with a quieter upper body.
- Tuck responds visibly to the tuck input, separately from boost and jump charge.
- A short extension at takeoff, compact body during tricks, and progressive landing absorption.
- Deliberate hand-to-ski contact and natural shoulder/elbow bends during grabs.
- Continuous transitions and correct forward/switch orientation.

## Reference

- [SSX On Tour official promotional skiing image, archived by MobyGames](https://www.mobygames.com/game/19627/ssx-on-tour/promo/group-38160/image-350057/)
- [SSX On Tour gameplay footage collection](https://www.gamespot.com/games/ssx-on-tour/videos/)

## Generation input

The concept was generated using the built-in imagegen tool. Prompt: one original adult freestyle skier, front A-pose, oversized burnt-orange technical jacket with cream shoulders and charcoal panels, baggy charcoal cargo snow pants, cream ski boots, black helmet and gloves, amber mirrored goggles; detailed game-character render on plain light gray; full body with separated limbs; no skis, poles, backpack, props, logos, text, alternate views or additional figures.

## Current production status (2026-09-18)

- [Tripo workspace](https://studio.tripo3d.ai/workspace/rigging/6f32b9db-23eb-4654-849c-dbedfffb0656).
- Generated with v3.1 (55 Studio credits); retopologized to 11,679 quads / 11,704 vertices (10 credits); humanoid v1.0 rig requested (20 credits). Last observed rig progress: 99%.
- The user exported `ski+jacket+3d+model.zip`. The unchanged archive is preserved as `art/characters/freestyle-skier/tripo/skier-source.zip`; imported FBX contains 11,704 vertices, 23,339 triangles, textures, **no skeleton and no clips**.
- Built a fitted 22-bone Blender rig, preserving the original mesh and UVs. Every vertex is weighted; at most four normalized influences. Boots and helmet use rigid corrections. Source and finished files are separate.
- Runtime asset: `public/models/freestyle-skier.glb` (6,968,368 bytes), 2.05 m tall, Y-up, facing -Z. Textures are embedded. The GLB has no baked clips: the runtime poses the skeleton directly and keeps root motion under gameplay control.
- Editable source: `art/characters/freestyle-skier/game/freestyle-skier.blend`, containing eleven 49-frame actions at 24 fps: Neutral, CarveLeft, CarveRight, Tuck, Charge, Takeoff, Airborne, MuteGrab, TailGrab, Landing and Switch. These capture the runtime transitions and can be edited in Blender.
- Added measured-limb IK, tuck/charge compression, takeoff extension, landing absorption, eased grab reaches and switch look-back. Mute positioning was corrected to avoid a knee bend reversal during release. Pole handles follow the palms; binding blocks were reduced to fit the boots.
- Contact tests use the real GLB: boot joint error below 3 mm and settled grab error below 25 mm. Transition checks cover carving, tuck, takeoff, both grabs/releases and switch. Front/side/rear inspection and live gameplay verification completed. Reloaded Blender actions agree with runtime matrices within 0.000005 at four sampled frames per action.
- Validation: all 20 rider/pose tests pass; Vite production build passes (bundle-size advisory). Latest full-suite snapshot: 62/63 pass; the separately developed BLACKRIDGE ski asset fails its dimension check (height 2.82 m). That concurrent equipment work is outside this character pass.
- This is an original procedural skiing performance with SSX-inspired proportions and pose direction, not motion capture or a reproduction of SSX animation. Extreme grab-to-ground contact prioritizes immediate ski placement; cloth has skin deformation, not cloth simulation. Fingers are part of the rigid glove rather than an articulated finger rig.

### Rebuild and verify

Run from the project root. `build_game.py` rebuilds the game blend from the preserved source, replacing local action edits; save any manual revisions separately first.

```powershell
blender --background --python art/characters/freestyle-skier/inspect_source.py
blender --background --python art/characters/freestyle-skier/build_game.py
node art/characters/freestyle-skier/capture_poses.mjs
blender --background --python art/characters/freestyle-skier/bake_poses.py
blender --background --python art/characters/freestyle-skier/verify_bake.py
npm test
npm run build
```

With Vite running, open `/tests/visual/rider.html`. Choose a pose and front/side/rear angle, toggle switch, or play the transition sequence. Reports are in `tripo/source-report.json`, `game/report.json` and `game/bake-verification.json`.
