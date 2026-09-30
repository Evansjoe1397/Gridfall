# Visual polish preview

Press **Shift+V** during a match to compare lighting, shadows, and Nagrand tiles.
Press **Shift+B** to toggle ACES filmic tone mapping at 1.12 exposure independently.
Shift+V starts off. The Trench starts with Shift+B on and light level at 150%;
other arenas start with Shift+B off and light level at 100%. Defaults apply when
entering an arena; manual toggles and light-level changes remain available.
First activation of Shift+V on Nagrand loads the stone texture before
switching; a failed load leaves the preview off and offers a retry.

`src/visual-polish.ts` owns `visualPolish`: `enabled` controls the tile/lighting
preview; `tiles` and `lighting` can be set independently in code for tuning.
`filmicToneMapping.enabled` controls only tone mapping and exposure, independently
of Shift+V. Shift+B works with the lighting preview either on or off.

- Nagrand only: generated stone, small physical bevels, darker slab sides,
  deterministic roughness/tint variation, and tile shadow casting. Dimensions,
  top elevations, special-square colors, and gameplay highlights are retained.
- Nagrand, Lordaeron, Trench: balanced key/fill light, shadow coverage fitted in
  light space, and reduced normal bias.
- Lordaeron and Trench tile geometry and materials are not changed by this feature.
- Pipe is excluded from Shift+V; independent Shift+B tone mapping is available.
- No fire, water, interaction-animation, or gameplay changes.

The existing Ctrl+K dawn mode and Alt+plus/minus light controls still work.
Turning each preview off restores its baseline for the currently selected light mode.
Camera and match state stay intact. The old Ctrl+L Nagrand texture alternative
remains separate; disable preview to change that option. The original floor is
not replaced by this feature.

## Generated asset

`public/textures/nagrand/polish-stone-v1.png` was generated with the built-in
image generation tool, independently of the older optional Nagrand atlas.
The same shared texture is reused with tile-specific UV rotations; physical
bevels and side shading are supplied by geometry, not baked lighting.

Visual review remains manual. In particular, assess stone scale, player-color
readability, shadow acne, and spell brightness under both light modes.

## Non-browser checks

`npm run typecheck`, `npm run build`, and
`npx tsx scripts/check-visual-polish.ts`.
