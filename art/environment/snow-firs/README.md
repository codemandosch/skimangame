# Alpine snow firs

Three original Blender-built evergreen variants with irregular branch whorls,
needle fringes, exposed bark and snow resting on top of the boughs. Vertex colors
keep the asset self-contained. No external textures, credentials or generated
third-party assets are required.

Rebuild from the project root:

```powershell
blender --background --python art/environment/snow-firs/build_firs.py
```

The builder writes the editable `snow-firs.blend` beside this file and the runtime
`public/models/snow-firs.glb`. Each `AlpineFir_0` through `AlpineFir_2` group has
three meshes: bark, needles, snow. Matching `_LOD` groups contain simplified
distant geometry. The runtime instances these meshes, uses full detail within
220 metres and distant geometry out to 1,500 metres, and varies rotation/scale.

Blackridge contains 150 sparse, separated trees below half the summit-to-base
elevation. Authored jump approaches and catch corridors remain clear; small
snowfield rollers do not exclude trees across the whole mountain. Trunk collision
uses the same placement data as rendering. Bluebird has up to 100 trees, also
restricted by elevation and kept outside the ski corridor.

Open `/tests/visual/environment.html` on the Vite server to inspect the tree
variants, actual lower slopes, or a continuous powder/track demonstration.

Snow tracks are surface geometry with compressed grooves and raised edge strips,
not a deformable terrain simulation. They follow the collision heightfield, stop
during flight, persist for a whole run in append-only GPU chunks, and are disposed
on restart. Powder uses directional edge ejection, drag, gravity, wind and terrain
settling. Broad wind relief is shader detail and does not change ski physics.
