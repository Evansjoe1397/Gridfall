# The Trench perimeter

Source: `experiments/Meshy_AI_Moonlit_Graveyard_Are_0909174235_texture.glb`.
Editable local project: `experiments/trench-perimeter.blend` (experiments is git-ignored).
The Blender project preserves the starting scene, the complete imported source,
the edited perimeter, and a reimport of the compressed runtime GLB in separate scenes.

The interior floor, columns, boxes and central terrain were removed from a copy
of the combined source mesh. Four bisect planes at Blender X = +/-0.735 and
Y = +/-0.73 define the opening. Faces inside that rectangle and unused vertices
were deleted. The remaining perimeter was decimated from 294,362 faces to
126,635 triangles, retaining UVs, arches, fence, walls and exterior vegetation.
Vertices were raised by 0.133 to put the original floor level at zero.

Export only the selected perimeter in the active scene, with glTF Y-up, normals,
UVs, and all three original 2048x2048 textures. Compress with glTF Transform 4.5.0:

```powershell
npx --yes @gltf-transform/cli@4.5.0 jpeg experiments/trench-perimeter-uncompressed.glb experiments/trench-perimeter-textures.glb --quality 88
npx --yes @gltf-transform/cli@4.5.0 meshopt experiments/trench-perimeter-textures.glb public/models/trench-perimeter.glb
```

The runtime asset uses EXT_meshopt_compression and KHR_mesh_quantization, supported
by the existing Three.js GLTFLoader with MeshoptDecoder. It contains one mesh and
one material, with no source interior, cameras or other scenes.

Measured on 2026-09-09 (decimal MB):

| Asset | Size | Triangles |
| --- | ---: | ---: |
| Original Meshy arena | 17.95 MB | 341,642 |
| Trench perimeter | 3.03 MB | 126,635 |
| Nagrand outer ring | 2.90 MB | 128,022 |
| Lordaeron cemetery perimeter | 52.33 MB | 1,582,878 |

The runtime placement preserves proportions and fits the 1.46-wide opening to
the board width plus two world units. A 90-degree rotation around the vertical
axis aligns the opposing arches with the central trench. A square platform supports the wall bases.
Gameplay cells, high ground, obstacles and rules continue to come from the arena
definition. Visibility switches with the active arena, using the same cached
loading approach as Nagrand and Lordaeron.

Verified by reimporting and rendering the final compressed GLB in Blender,
inspecting its mesh/material/texture data, checking the empty interior, TypeScript
type checking, and a production build. In-game browser verification is left to
the user per project instructions.
