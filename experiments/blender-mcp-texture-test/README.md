# Gridfall Blender MCP Texture Test

This folder is an isolated sandbox for testing prettier Gridfall assets without
touching the game source.

## What this test creates

- An 8x8 stylized board with procedural tile materials.
- Low-poly wooden boxes and stone pillars.
- A simple magician-like hero marker with animated bobbing.
- A glowing spell projectile path and pulsing target tile.
- Camera, lights, and export settings for `.blend` and `.glb`.

## Run with Blender directly

If Blender is installed and available as `blender`:

```powershell
.\run.ps1
```

Or run manually:

```powershell
blender --background --python .\gridfall_scene.py
```

Outputs are written to:

```text
output/gridfall_texture_animation_test.blend
output/gridfall_texture_animation_test.glb
```

## Use with Blender MCP

1. Install and enable a Blender MCP addon/server.
2. Open Blender and start the MCP connection from the addon panel.
3. Give the assistant the contents of `mcp_prompt.md`.
4. Ask it to execute or adapt `gridfall_scene.py`.

The goal is to test the art pipeline, not to integrate these assets into the
game yet.

