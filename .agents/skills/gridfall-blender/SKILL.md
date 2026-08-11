---
name: gridfall-blender
description: Inspect, edit, and verify Gridfall Blender scenes through the configured `blender_ai` and `blender` MCP servers. Use for Blender scene, object, mesh, material, rigging, animation, camera, viewport, render, import, or export work in this repository, including MCP connectivity diagnostics. Prefer the structured Gridfall API and use raw `bpy` only as a narrow fallback.
---

# Gridfall Blender

Use the two Blender MCP servers as complementary interfaces to the same open Blender session:

- Prefer `blender_ai` for normal work. Select its typed scene, modeling, mesh, material, rigging, animation, inspection, measurement, snapshot, or assertion tools.
- Use `blender` for quick scene information, viewport screenshots, external asset integrations, and narrowly scoped fallback operations.
- Use `blender.execute_blender_code` only when no structured `blender_ai` operation covers the task. Keep code minimal and read-only unless the user requested a mutation.

## Workflow

1. Confirm access with a read-only scene or context query before changing anything.
2. Inspect the relevant objects, mode, active object, and selection. Preserve this state when the operation does not require changing it.
3. Choose the narrowest structured `blender_ai` action that satisfies the request.
4. Apply only the requested mutation. Do not save the `.blend` file unless the user asks to save or the task explicitly requires a persisted artifact.
5. Verify structural results with `blender_ai` inspection, measurement, snapshot, or assertion tools.
6. Verify visible results with a viewport screenshot or render when appearance matters.
7. Report what changed, the verification evidence, and whether the Blender file was saved.

## Diagnostics

- When asked to test both MCPs, query equivalent read-only state through each server and compare scene name, mode, object counts, selection, or active object.
- If `blender_ai` is unavailable but `blender` works, check its Codex MCP configuration, process startup, and the Blender addon RPC listener on `127.0.0.1:8765`. Do not silently treat the fallback server as proof that `blender_ai` works.
- Allow for a slower initial startup of `blender_ai`; its configured startup timeout is longer because it exposes a large typed tool surface.
- If tools were added or MCP configuration changed during the current task, explain that Codex may need a restart or a new task to refresh the published tool list.

## Safety

- Treat delete, clean-scene, modifier application, mesh topology edits, rig changes, imports, and overwrites as potentially destructive.
- Resolve exact target object names before destructive actions.
- Prefer inspect-before-change and verify-after-change.
- Never run broad arbitrary Python merely to avoid discovering an existing structured tool.
