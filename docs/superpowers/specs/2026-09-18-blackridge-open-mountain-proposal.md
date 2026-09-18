# Blackridge: one open mountain

Status: approved and implemented as a playable terrain pass. Automated traversal, flight, slope-contact, camera and existing gameplay checks pass (74 tests). The mountain surface was also inspected in an offline Blender render. Live browser traversal and frame-time profiling remain unverified because the browser automation connection was unavailable.

Latest playtest revision: reduced the summit cap from 32 m to 2 m, added 36 staggered snow lips (72 total features), and made every sloped heightfield surface snow-covered. Tests sample opening steepness in 64 directions and useful early jumps plus base completion in 32 directions. Airborne gravity remains 22 m/s². The original proposal below is retained as design context.

## What changes for the player

Start on a small summit cap, look across the whole mountain, choose a heading, and descend in any direction. Left/right arrows turn the skis rather than shifting sideways inside a corridor. The chase camera turns with the rider. Up tucks, down brakes, arrows become the existing aerial controls in flight, and W or Space still boosts and charges a pop. There is no prescribed sequence of jumps, centerline, lateral clamp, or mandatory checkpoint.

The entire mountain is playable terrain, including the land between the named areas. Names describe terrain character; they do not define separate levels, lanes, or invisible boundaries. Every face reaches the base, and neighboring faces connect through broad shoulders and saddle crossings. Reaching the low runout around any side of the mountain ends the run, after the rider has landed.

## Recommended construction

Use an authored terrain field rendered in Three.js, with procedural detail layered onto explicitly designed landforms. This preserves precise agreement between ski collision and the visible surface while allowing many iterations of the layout.

An entirely noise-generated mountain would be quicker but would not reliably produce readable takeoffs, clear landings, or worthwhile traverses. A single giant Blender mesh would allow close sculpting but make collision, large-area detail, and repeated jump tuning more difficult. Blender may help with individual rock formations later; it is not needed to establish the playable mountain.

## Scale and silhouette

- Initial target: roughly 4 km across, with 1.7–2.0 km of vertical relief. Final dimensions follow trajectory and traversal tests.
- An irregular summit massif with several descending ridges, uneven shoulders, offset basins, and a broad low runout. Avoid a rotationally symmetric cone or regularly spaced terrace rings.
- A small convex summit cap lets the player choose a direction before acceleration builds. The surrounding upper faces are immediately steep, maintaining the speed requested for Blackridge.
- Local slopes carry the difficulty: approximately 35–50 degrees on exposed faces, gentler catch bowls and connecting shoulders, and short near-vertical cliff sections.
- Large shapes come first: summit, watersheds, ridges, valleys, cliffs, and catch bowls. Small surface noise must not obscure these shapes or turn every descent into repetitive bumps.

## Terrain character around the mountain

| Area | Terrain and play | Connections |
| --- | --- | --- |
| North: The Wall | Exposed upper face; interrupted rock shelves; narrow optional chutes and large cliff drops with visible snow aprons. | Shelves have snow breaks at their ends, allowing traversal toward either neighboring face. |
| Northeast: Hanging Glacier | Rolling upper snowfield with wind cornices, broad natural kickers, and long step-down landings. | A broad shoulder links the upper face to Sun Bowl without a compulsory drop. |
| Southeast: Sun Bowl | The widest open carving area; large convex rollers, side hits on basin walls, and multiple landing choices. | Accessible laterally from the glacier and Cathedral Spines. |
| South: Cathedral Spines | Branching snow ridges with rock islands between them; ski a crest, drop into a gully, or cross a low saddle. | At least two traversable saddles connect neighboring gullies. No continuous rock wall partitions the mountain. |
| Southwest: Thunder Basin | The largest cliff drops and most dramatic airtime; stacked but offset rock amphitheaters opening into broad landing basins. | Snow ramps skirt the biggest cliffs, allowing the player to continue without taking every risk. |
| Northwest: Windfield | Fast wind-shaped rollers, smaller linked jumps, broad diagonal traverses, and sparse trees near the base. | Open shoulders reconnect to The Wall and Thunder Basin. |

These areas overlap organically. Forest appears on suitable lower slopes across several faces, not as a rigid circular band. Upper rock exposure responds to slope and landform rather than distance from a former course centerline.

## Jumps and cliffs

Begin with approximately 30–40 significant terrain features distributed across the mountain, including at least ten signature huge jumps/drops. Mix large cliffs, wind lips, ridge transfers, side hits, and medium rollers. Their distribution follows the landforms rather than uniform spacing or a numbered route.

Every signature feature needs:

1. A visible approach with enough space to line up or turn away.
2. A readable lip or edge from the gameplay camera, not only from overhead.
3. A clear landing apron sized for ordinary, tucked, boosted, and charged approaches.
4. Recovery space and a real choice of direction after landing.
5. A bypass or neighboring descent so the feature is optional.

Cliff edges launch the rider wherever they leave supporting terrain. Natural kickers work when approached across their physical surface at a suitable heading; crossing an invisible course coordinate must not launch a rider. Signature jumps target 8–12 seconds of airtime, with a few exceptional sends targeting 12–15 seconds on a fast, charged approach. Smaller natural features remain useful for shorter linked tricks and changes of line.

The longest flights need several hundred metres of horizontal clearance and substantial vertical relief. Reserve entire catch basins for them before placing smaller features, connecting traverses, trees, or rocks. Their landings must remain visible and forgiving across a range of speeds; do not achieve long flights merely by reducing gravity everywhere. Final airtime comes from trajectory measurements and playtesting, with terrain and launch curvature tuned together.

Rock faces and snow ridges are terrain, not background decoration. Standalone rocks and trees placed in playable areas need collision or must be kept outside clear landings and access routes. Do not fill an apparent route with non-colliding scenery that the player passes through.

## Freedom, steering, and camera

Movement uses planar position and velocity across both horizontal axes. Gravity responds to the local terrain gradient, rather than pushing toward one fixed world direction. Steering changes heading continuously; the rider can complete a full turn, traverse a face, enter a neighboring bowl, or briefly climb using carried speed and boost. Uphill motion loses speed naturally; this is still skiing rather than unrestricted flight.

Provide responsive low-speed turning and a small skating/push-off action through the existing up/tuck control so a player who stops across a slope can recover without an automatic reset. Summit selection uses this same control: turn at low speed, then push into the chosen face. Braking must allow deliberate speed control on steep slopes.

The chase camera follows the travel heading with smoothing, stays clear of terrain, and looks far enough downhill to reveal landings. Aerial trick rotations do not whip the camera around. Rider slope alignment, ski trails, spray, and shadows all follow the current heading and local terrain rather than the old fixed downhill axis.

## Completion and navigation

End a run on reaching the low outer runout on any face and returning to ground contact. Use both location within the runout and elevation so an interior gully or low airborne trajectory cannot prematurely finish the run. There is no single finish gate to locate.

Replace the linear ten-jump progress bar with altitude remaining, current area, and a compact contour minimap showing the rider's position and facing. The minimap is an orientation aid, not a prescribed route. Do not display a next-jump instruction or mark every feature with a flag. Score, airtime, boost, and pop charge retain their existing behavior.

## Implementation boundaries

- Keep Bluebird available with its established course behavior.
- Add a mountain terrain model owning height, gradient/normal, feature descriptions, spawn, and base/runout queries.
- Add free-mountain movement using the same trick, scoring, and landing rules. Shared behavior should stay shared; route-specific forward motion and clamps remain exclusive to Bluebird.
- Replace Blackridge rendering with terrain tiles at appropriate levels of detail, dense near the rider and along important cliff/lip silhouettes. Collision samples the same terrain model independently of rendering detail.
- Adapt camera, skier alignment, effects, reset, and HUD for arbitrary headings. Preserve the current rider, skis, radio, and control mappings.
- Keep terrain parameters and authored feature locations readable and deterministic so playtesting adjustments remain repeatable.

## Acceptance and design iteration

1. Inspect the mountain from above, from all sides, and at ski height. The silhouette and individual areas must be recognizably different.
2. Verify that the summit supports descent in every compass direction, including directions previously blocked by the corridor.
3. Ski across area boundaries and use saddles and shoulders to change faces at upper and middle elevations. Avoid layouts that merely create six independent tracks.
4. Verify natural falling from unmarked cliff edges, terrain-based takeoffs from multiple headings, braking, uphill slowing, low-speed recovery, and safe local wipeout recovery.
5. Test each signature jump across several approach speeds, offsets, and angles. Verify landing clearance and sufficient space afterward; inspect the view of the landing from the chase camera.
6. Complete runs through every face and confirm finish detection only triggers in the base runout. Check that paused or airborne states cannot finish incorrectly.
7. Inspect all-direction camera clearance, rider orientation, tracks, spray, and shadows. Test turns across angle wraparound and resets.
8. Run existing rider, control, scoring, and Bluebird regressions. Add mountain traversal, terrain continuity, launch, landing, and completion regressions.
9. Profile actual browser frame time and memory while traversing the mountain. Tune detail without flattening the important lips and cliffs.

The first terrain pass is a playable blockout, not the finished mountain. Review connectivity and the major landforms before polishing rock materials and vegetation. The final design pass must be based on multiple traverses and descents, not just a straight-line automated run.
