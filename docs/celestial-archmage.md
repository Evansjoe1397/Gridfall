The Celestial Archmage replaces Long Hat Logan's in-game body. Gameplay rules, Mana orbs and existing spell effects remain connected to the magician character.

Asset preparation uses `scripts/prepare-archmage-blender.py` through the live Blender RPC connection, then `node scripts/prepare-archmage-glb.mjs`. The original GLB remains in `experiments/Meshy_AI_Celestial_Archmage_All_Animations.glb`. A backup precedes changes to topology, textures and animation. The prepared Blender scene retains all 16 source clips plus the new Idle and the persistent Character Animations sidebar. Export only the active scene and explicitly select both mesh and rig.

The source contains one mesh, one 28-bone rig, 256,752 triangles and three 2048px textures (22.51 MiB). Decimation at 0.5 precedes the Armature modifier; the prepared mesh has 128,375 triangles and 1024px textures. The full animation GLB is 6.74 MiB; the eight-clip game asset is 6.40 MiB. No Draco decoder is needed. Skin weights and UVs are retained; Blender normalizes the four strongest influences when exporting.

| Source clip | Prepared name | Game use |
| --- | --- | --- |
| `01a0ea43-e141-76eb-8e15-fbad51d8b45b` | Walk | Routes of 1–2 tiles |
| Running | Running | Routes of 3+ tiles |
| `01a0ea51-e374-711d-805f-c775b7c6e6ff` | Summon | First frame supplies Idle's stance |
| `01a08602-fddf-710a-8cd6-02df116b4303` | Conjure | Loop for 10 seconds between 10-second Idle periods |
| `01a0ea50-1820-71e8-8833-28face8b1671` | Power | Spell raise, hold and recovery |
| `01a0ea47-8774-7647-9c41-f4a4b7d89ac4` | Wall | Spellblock raise and hold |
| Dead | Dead | Defeat |

Idle breathes subtly through the upper spine and neck; the legs stay fixed. Ambient Conjure is interrupted by movement, casts, defence and death. Walk's 3.51-unit forward root travel is removed from its clip. Its measured speed is 1.17051 model units/second, and Running's grounded-foot speed is 5.13802. The rendered scale is 2.5 / 1.7. Movement duration uses these speeds; clip phase follows actual route distance, including diagonals and scaled character bodies.

Power frame 1–20 is retimed to 350ms. It holds exactly frame 20 during Magic Hand direction selection and object transfer, then skips to frame 80 and plays recovery in 250ms after the effect and character turn finish. Normal spell/projectile release also uses the raised pose. Wall frame 1–40 plays in the same 365ms as the complete Spellblock wall assembly; frame 40 holds for the visual's lifetime, followed by Idle. Wall recovery is intentionally pending a later animation pass.

Summon, Conjure, Power and Wall have foot pitch/roll repaired using the rig's neutral boot orientation, preserving horizontal foot heading. Toe rotations are neutralized and a small hip height correction restores ground contact. Idle inherits that correction. This fixes the source animation's raised toe appearance without cutting geometry or altering foot weights.

`npm run check:archmage` loads the actual game GLB in Three.js without image decoding, browser automation or GPU rendering. It verifies skin/clip structure, ambient timing, raise/hold/recovery boundaries, locomotion phase, Spellblock lifetime, death/reset and level feet. Blender screenshots in `experiments/Archmage_*_Verified.png` cover spell and locomotion poses; `Archmage_Feet_Corrected.png` records the boot correction. The prepared scene is `experiments/Celestial_Archmage_Game_Prepared.blend`.
