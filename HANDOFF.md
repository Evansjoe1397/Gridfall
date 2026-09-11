# Gridfall Development Handoff

Updated 2026-09-09. Read this document completely before continuing.

## Workspace and instructions

- Workspace: C:\Users\evans\BoardGame\BoardGame2
- Repository: https://github.com/Evansjoe1397/Gridfall.git
- Branch: main
- Local HEAD and last-fetched origin/main: 17869c7 (Update character rules and merge latest interface improvements).
- No fetch was performed for this handoff. Check GitHub again only when relevant to the user's request.
- Preserve all existing work. Do not commit or push unless explicitly requested.
- Read AGENTS.md. It prohibits browser checks/automation unless the user explicitly overrides it; the user handles visual verification.
- Use apply_patch for file edits. Launch background processes with hidden windows.
- No new development task is pending: the user requested this handoff and a fresh conversation.

## Uncommitted work to preserve

Before this document was updated, these files were modified:
- server/index.ts
- src/main.ts
- src/style.css

They contain the new live character-selection model previews. HANDOFF.md is now also modified. The preview changes have NOT been committed or pushed.

A safety stash remains:
stash@{0}: On main: Preserve local gameplay changes before 2026-09-08 pull

That stash contains older gameplay work already restored, merged, and committed in 17869c7. Do not apply it again. Leave it alone unless cleanup is requested.

## Latest feature: live model previews in online character selection

User requested Mortal Kombat-style previews in the empty areas beside the central character picker:
- Local player's highlighted model on the left.
- Opponent's highlighted model on the right.
- Highlighting does not confirm selection.
- Online clients see one another's current highlight.
- In three-player matches both opponents appear on the right.

Implementation:
- src/main.ts: lobbyModelPreviews and renderLobbyModelPreviews near the bottom of the file.
- Separate cached model roots per seat reuse the existing createObiWanShinobi, createDaOrkk, createLongHatLogan, createJohnChrist, createSpectre, createWreckna, and createMerylin factories.
- Independent transparent Three.js renderers, lighting, full-body camera framing, and imported-model idle animation updates. Models are separate from archive/board roots.
- renderOnlineLobby and renderOnlineSelectionFrames update the previews.
- Pointer entry and keyboard focus immediately update local selection and send hover-character. Last highlight persists when the pointer leaves.
- A click confirms only after the required players have joined.
- server/index.ts allows previewCharacter while waiting for other players. Confirmation still requires a full lobby.
- Existing lobby-state selections and characters distinguish highlight from confirmed selection.
- CSS positions previews beside #onlineWaiting. Below 1100px they sit above the picker; FFA opponents share the right side.
- Animation rendering skips hidden/disconnected preview hosts.
- This feature targets the online waiting/selection screen; the separate Hotseat picker was not changed.

Verification after the final preview edits:
- npm run typecheck: PASS
- npm run build: PASS
- git diff --check: PASS (Git reports normal LF/CRLF warnings)
- Non-browser SDK smoke test against the running local server: PASS for highlight before another player joins, late-join highlight snapshot, remote highlight swaps, and confirmation remaining separate.
- No browser/visual verification was performed. User may still report layout, framing, or animation refinements. FFA preview layout has not been visually verified.
- The production build was refreshed, making the preview code available through the public server while it was running.

## Runtime state and launch instructions

At handoff, Get-Process found no node or cloudflared processes. The Cloudflare log records shutdown on 2026-09-08 at 20:13 UTC. Check ports/processes again before launching.

Last temporary public URL:
https://raid-genius-construction-volunteer.trycloudflare.com

Treat that URL as expired; do not promise it is available.

Development:
1. Check ports 5173 and 2567 to avoid duplicate servers.
2. Run npm run dev from the workspace.
3. Local Vite client: http://localhost:5173/
4. Multiplayer server: http://localhost:2567/

Public multiplayer:
1. Run npm run build; port 2567 serves dist, not Vite's current source.
2. Keep the multiplayer server running.
3. Launch cloudflared tunnel --url http://127.0.0.1:2567 --no-autoupdate
4. Read the new temporary URL and verify HTTP reachability with a non-browser request.

Use hidden Start-Process helpers. Existing log names:
- dev-server.log / dev-server-error.log
- cloudflared.log / cloudflared-error.log

One tunnel to port 2567 serves both the game and WebSocket rooms. Rebuild after source/model changes for public players to receive them. Server source edits under tsx watch restart the server and can interrupt active rooms.

## Recent committed work

17869c7 combined local gameplay updates with:
- fc12e4e: icons, HP bars, box pop-ups
- 192f9a5: sky improvements

The merge preserved the upstream gameIcon system and local character rule changes. Important recent gameplay details:
- Merylin starts at 20/20 HP; archive metadata and setup assertions match.
- Moonlight second-square damage is 2; Lightbringer doubles its High Ground bonus.
- John Christ gains a unique Hand-only Judgement when entering Spirit Form if not already held. Attack Value 2; after combat gain Stoic Shell if victorious. Removed whenever it leaves Hand and at turn end; cannot pay Guard/Dash; automatic removal for overstacking.
- Feed the Spirit's Blessing payment additionally heals actual HP lost from combat damage, excluding attacking card post-combat effect damage.
- Wreckna's Decay was renamed Curse. Internal card/command ID decay remains for compatibility.
- Curse: level 1 steal 1 MOV; level 2 add Headache to target Hand; level 3 block target trait until target end turn. traitBlocked and status UI gate affected character traits.
- Curse gates Lightsaber bonuses/passive renewal, John's Spirit entry and Stoic healing, Merylin's Summon-enabled attacks, Spectre replica origins, Logan Mana generation/Consume, and passive Rage generation/attack spending. Card-generated statuses/resources follow the requested exceptions. Wreckna trait powers also respect suppression.
- Multiplayer FFA opening focus independence and combat spectator UI are included in that commit.

These are implementation summaries, not replacements for reading the current authoritative rules.

## Known validation limitation

The last full npm run check:rules stopped at the previously reported assertion:
"Each tied Tank Junior leader receives Helmet."
scripts/check-rules.ts:774

This was present before the latest merge and preview work. It remains unresolved; do not claim the full rules suite passes. Assertions after this failure do not execute. Do not broaden a routine UI task into unrelated rule repair.

The production build has the known non-fatal chunk-size warning (>500 kB).

## Code map and development guidance

- shared/game.ts: authoritative cards, state, commands, targeting, combat, traits, quests.
- shared/arenas.ts: board and arena definitions.
- server/index.ts: Colyseus rooms, seats, lobby highlight/confirmation, state broadcasts.
- src/main.ts: UI, online client, Three.js board and character factories, archive and lobby previews.
- src/style.css: responsive layout and visual styling.
- src/game-icons.ts and src/assets/icons/: current icon system.
- src/i18n.ts: translations.
- scripts/check-rules.ts and scripts/check-replica-targeting.ts: rule regressions.
- public/models/: imported character assets.

Online roster includes Shinobi, Da Orkk, Logan, John Christ, Spectre, Wreckna, and Merylin. Multiple players can select the same character. Keep Hotseat and multiplayer rules aligned unless explicitly directed otherwise.

Large rules/UI files contain layered historical logic. Search related selectors and command handlers before changing behavior. Use dealDamage with source attribution and existing movement/statistics helpers. Inspect current FFA victory logic rather than assuming every death immediately ends a match.

## Prompt for the new conversation

Continue development of Gridfall in C:\Users\evans\BoardGame\BoardGame2. Read HANDOFF.md completely and AGENTS.md first, inspect Git status, and preserve the uncommitted character-selection model previews. Do not reapply the old safety stash. Do not commit or push unless I explicitly request it. Use non-browser verification as instructed by AGENTS.md. Wait for my next development request.
