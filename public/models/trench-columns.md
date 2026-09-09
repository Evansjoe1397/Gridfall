# Trench columns

Two columns extracted from the upper-left and upper-right of
`experiments/Meshy_AI_Moonlit_Graveyard_Are_0909174235_texture.glb`.
Editable source and runtime-check scenes are saved locally in
`experiments/trench-columns.blend`; the complete original arena is preserved.

Extraction boxes in Blender coordinates:

- Column 1: X = -0.453 +/- 0.074.
- Column 2: X = 0.450 +/- 0.074.
- Both: Y = 0.430 to 0.583; Z >= -0.128, excluding the arena floor.

The source columns would be about 2.14 units tall at a 1.45-unit footprint.
They are extended to 3.9 units by stretching the shaft between original
Z = -0.077 and 0.025; the capital is translated upward, and the base stays
proportioned. The square plinths were subsequently removed with a horizontal
cut at Z = 0.36 in the elongated meshes. The rounded bases are grounded at zero,
and the shafts extended to retain the 3.9-unit height. Runtime placement uses
a 1.30 x 3.9 x 1.34 bounding box. The earlier plinth versions remain in separate
Blender scenes; the game exports contain only the rounded bases.

Original UV-mapped base color was baked to a separate 1024-square atlas per
column. Each uses one rough stone material and one JPEG texture. Meshopt
compression reduces the assets to approximately 115 KB and 122 KB after plinth
removal. No decimation was needed. Existing pillar GLBs are
504 KB (Nagrand) and 2,186 KB (Lordaeron).

The new columns remain preserved as temporary, unused Trench assets. The Trench
currently reuses the established Lordaeron pillar model. All arenas independently
select a rotation from 0 to 360 degrees per pillar,
retained for that pillar's lifetime. This is client-side visual variation;
collision and gameplay are unchanged. Other arenas retain their own models.

Verified by reimporting/rendering both compressed GLBs in Blender, checking
dimensions and triangle counts, TypeScript type checking and production build.
