# Live Blender MCP Setup for Gridfall

This is the interactive workflow we want: Blender stays open, Codex connects to
it through MCP, then we iterate on the live scene.

## Install checklist

1. Install Blender from:

```text
https://www.blender.org/download/
```

2. Install `uv`, which provides `uvx`:

```powershell
python -m pip install --user uv
```

Restart the terminal/Codex app if `uvx` is not found immediately.

3. Install the Blender MCP addon from:

```text
https://github.com/ahujasid/blender-mcp
```

Typical flow:

- Download or clone the repo.
- In Blender: `Edit > Preferences > Add-ons > Install...`
- Choose the addon zip or addon Python file from the Blender MCP repo.
- Enable the addon.
- Open the Blender MCP panel and start the local server.

## Codex MCP config snippet

Add this to:

```text
C:\Users\artur\.codex\config.toml
```

```toml
[mcp_servers.blender]
command = "uvx"
args = ["blender-mcp"]
startup_timeout_sec = 120
```

If Blender MCP uses a non-default port, add env values:

```toml
[mcp_servers.blender.env]
BLENDER_HOST = "127.0.0.1"
BLENDER_PORT = "9876"
```

Then restart Codex so it discovers the new MCP server.

## First live test prompt

After Blender is open and the addon server is started, ask Codex:

```text
Use the Blender MCP server. Run the script at
C:\Users\artur\OneDrive\Documents\Gridfall\experiments\blender-mcp-texture-test\gridfall_scene.py
inside the active Blender scene, then inspect the scene and improve the board
materials, lighting, and spell animation. Export .blend and .glb into the
experiment output folder. Do not modify the Gridfall game source.
```

## Why this differs from direct Blender Python

Direct Python is a repeatable build/export pipeline.

Blender MCP is a live art-direction loop: Codex can create, inspect, adjust,
render, and export inside the currently open Blender scene.

