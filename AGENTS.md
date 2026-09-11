# Project instructions

## Verification

Never perform in-browser checks or browser automation to verify changes. The user handles browser verification; these checks are too slow and token expensive. Use appropriate non-browser checks, such as type checking and production builds, and report their results. Do not open a browser or start a browser verification workflow unless the user explicitly overrides this instruction.

## Blender GLB import workflow

When asked to import a GLB or a folder of character-animation GLBs into Blender, use the `gridfall-blender` skill and this workflow:

1. Resolve the exact source files and inspect the live scene before changing anything. An empty scene or untouched default startup objects may be discarded. Treat authored/imported work as important unless the user explicitly says otherwise: save a recoverable `.blend` checkpoint first, then create a new empty scene for the import. Do not factory-reset Blender or disable its MCP connection.
2. Report source size in MiB (bytes / 1,048,576), mesh/triangle counts, texture sizes, and animation counts. If each animation comes in its own GLB, verify mesh and rig compatibility and merge all clips onto one character rig in one scene; do not keep duplicate bodies, textures, or armatures. Preserve clip names, timing, and bindings. If rigs differ, inspect/resolve the mismatch rather than blindly assigning Actions.
3. Make every imported clip accessible as a one-click button in the 3D Viewport's **N sidebar → Animation → Character Animations** panel. The Dope Sheet glTF panel alone does not satisfy this. Scope the controls to the active scene/character, protect Actions with Fake User, and retain named NLA tracks for export. Set the timeline to the selected clip and handle layered Action slots. Keep the panel implementation recoverable as a script/add-on; runtime-only panel registration is not persistent after restarting Blender.
4. Enable Material Preview (textures), frame the character, and keep armature overlays from obscuring it. Inspect any unwanted white `Icosphere`/sphere helper; remove only the confirmed helper, clearing bone custom-shape references if necessary. Do not remove spheres that are real character parts or effects.
5. Optimize conservatively when the measured size or complexity warrants it. Deduplicate repeated assets first. Keep a backup before changing topology, textures, or weights. Apply any modest decimation before the Armature modifier, preserving UVs and skinning; verify appearance and several poses. Do not use broad geometry cuts to fix animation distortion: inspect bone weights first and request a precise user selection when the affected surface cannot be identified safely.
6. Verify the single intended body/rig, complete clip list, animation binding, textures, and visible result with Blender inspection and viewport screenshots. For merged files, generate a separate merged GLB without overwriting sources and report its size. Save the prepared scene to a new `.blend` checkpoint, report paths, and explain any remaining limitations. Importing an alternate character into Blender does not itself authorize replacing its in-game model.

## Local multiplayer via Cloudflare Tunnel

When the user asks to run, raise, start, or update multiplayer locally, use this workflow without asking them to repeat the details:

1. Check whether Gridfall is already serving on `http://127.0.0.1:2567` and whether a `cloudflared` process is exposing that exact origin.
2. Run `npm run build` so `dist` contains the latest client. Port `2567` serves both the built client and the Colyseus WebSocket rooms, so only one tunnel is needed.
3. Start or restart the production server with `npm run start` from the repository root. If an existing Gridfall server is running, update it by rebuilding and restarting it; do not create a duplicate listener.
4. If a healthy tunnel for port `2567` is already running, keep it and reuse its public URL. Otherwise start a Cloudflare Quick Tunnel with `cloudflared tunnel --url http://127.0.0.1:2567 --no-autoupdate`. Run long-lived processes hidden/backgrounded and write their stdout/stderr to repository-local log files.
5. Verify without a browser: confirm the local URL returns HTTP 200, extract the current `https://*.trycloudflare.com` URL from the Cloudflare log, confirm that public URL returns HTTP 200, and confirm both `node` and `cloudflared` processes remain alive.
6. Report the public URL and verification result to the user. Quick-tunnel URLs are temporary and may change after a tunnel restart.
