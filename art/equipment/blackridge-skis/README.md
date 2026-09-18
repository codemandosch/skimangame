# BLACKRIDGE freestyle skis

Original rigid equipment produced with the same concept → Tripo Studio → Blender → Three.js workflow as the rider.

- Concept: `concept/blackridge-ski-generation-input.png` (single isolated ski, generated with the built-in image tool).
- Tripo workspace: <https://studio.tripo3d.ai/workspace/texture/f6c681fd-a26e-4c19-bc88-db9582fced8e>
- Studio work: v3.1 image-to-3D, 4,848-quad retopology, 2K texture.
- Preserved export: `tripo/blackridge-ski.zip`, SHA256 `A335F121C60816F6469A67C088FFFA8BD29D985858F0A96B0553602F851E0708`.
- Blender finish: 2.82 m long, 0.19 m wide, binding centered at the local origin, Y-up GLB output.
- Runtime asset: `public/models/blackridge-ski.glb` (4,407 vertices / 8,822 triangles, embedded color and normal maps).

Tripo interpreted the perspective concept as a broad board. `build_game.py` keeps the generated surface, binding, textures and twin-tip profile while restoring realistic freestyle-ski proportions before export.

Rebuild with Blender 5.2:

```powershell
blender --background --python art/equipment/blackridge-skis/inspect_source.py
blender --background --python art/equipment/blackridge-skis/build_game.py
node --test tests/blackridge-ski.test.js tests/blackridge-ski-loader.test.js
```
