# Project instructions

## Verification

Never perform in-browser checks or browser automation to verify changes. The user handles browser verification; these checks are too slow and token expensive. Use appropriate non-browser checks, such as type checking and production builds, and report their results. Do not open a browser or start a browser verification workflow unless the user explicitly overrides this instruction.

## Local multiplayer via Cloudflare Tunnel

When the user asks to run, raise, start, or update multiplayer locally, use this workflow without asking them to repeat the details:

1. Check whether Gridfall is already serving on `http://127.0.0.1:2567` and whether a `cloudflared` process is exposing that exact origin.
2. Run `npm run build` so `dist` contains the latest client. Port `2567` serves both the built client and the Colyseus WebSocket rooms, so only one tunnel is needed.
3. Start or restart the production server with `npm run start` from the repository root. If an existing Gridfall server is running, update it by rebuilding and restarting it; do not create a duplicate listener.
4. If a healthy tunnel for port `2567` is already running, keep it and reuse its public URL. Otherwise start a Cloudflare Quick Tunnel with `cloudflared tunnel --url http://127.0.0.1:2567 --no-autoupdate`. Run long-lived processes hidden/backgrounded and write their stdout/stderr to repository-local log files.
5. Verify without a browser: confirm the local URL returns HTTP 200, extract the current `https://*.trycloudflare.com` URL from the Cloudflare log, confirm that public URL returns HTTP 200, and confirm both `node` and `cloudflared` processes remain alive.
6. Report the public URL and verification result to the user. Quick-tunnel URLs are temporary and may change after a tunnel restart.
