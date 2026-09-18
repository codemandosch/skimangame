# Skinned Freestyle Skier Implementation Plan

**Goal:** Replace the rigid segmented rider with a Tripo-generated, Blender-finished skinned freestyle skier and improve ski-specific movement.

**Architecture:** Keep the deterministic physics and root trick transforms. Drive the imported skeleton from a pose adapter with measured limb proportions and constrained equipment contact. Retain the existing procedural asset as a load-failure fallback.

**Tech Stack:** Tripo Studio, Blender 5.2, Three.js 0.180, Vite, Node test runner.

**Spec:** `docs/character-production-workflow.md`

## Work sequence

- [x] Inspect Sorc workflow, existing rider geometry/IK, physics and visual viewer.
- [x] Create and inspect the single-character concept; preserve it in the project.
- [x] Generate and retopologize in Tripo Studio; preserve the user-exported archive. Tripo rig stalled; user authorized local Blender rigging.
- [x] Inspect the unrigged import and textures, fit/weight a Blender skeleton, normalize the asset and export a game GLB with a bone report.
- [x] Add behavioral regression tests for tuck input, animation continuity and real-rig ski/grab contact; use failures to correct reach and knee transitions.
- [x] Implement the skinned rider adapter, equipment attachment and required pose improvements. Extend the viewer to inspect the new states.
- [x] Bake eleven editable actions and verify their matrices after reloading the Blender file.
- [x] Run Node tests and Vite build, inspect key poses and verify the rider in the game. Record limitations and asset provenance in the workflow documentation.

## Files

- `art/characters/freestyle-skier/`: concept, immutable Tripo source, Blender source and finishing script/report.
- `public/models/`: runtime GLB.
- `src/skier.js`: existing equipment/fallback and root movement integration.
- `src/rider-pose.js`: pose controls and limb targets.
- `src/skinned-rider.js`: imported skeleton adapter and asset loading.
- `src/physics.js`: expose tuck/brake input state to animation without changing dynamics.
- `tests/rider-pose.test.js`, `tests/skinned-rider.test.js`: movement/contact checks.
- `tests/visual/rider.html`, `tests/visual/rider-lab.js`: visual pose inspection.
