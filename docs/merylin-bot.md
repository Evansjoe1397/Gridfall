# Merylin on Nagrand

Select **Hotseat → 1 versus 1 → Nagrand → your Character → Merylin · Tactical Bot**. You control Player 1; the bot controls Merylin as Player 2. This entry always uses Standard mode, regardless of the Perk Mode switch. Manual Hotseat opponents remain available. The first bot does not support other arenas, Free For All or Best-of-Three.

The bot issues the same commands as a human. It chooses opening Focus, Phase rewards and their destinations, Perks and Spell Echo, movement, attacks, defense, Combat Cards, finishing moves and mandatory discards. Character-specific choices include Summon preparation, Yamato movement, Lightbringer swapping, Frostmourne's HP cost, Kamelot removal and Spellsinger's Discard recovery. Common opponent-forced choices and Quest Reward Cards are included.

## Tactical policy

`src/merylin-bot.ts` configures Merylin's policy in the shared `src/nagrand-bot-core.ts` planner. The planner generates candidate commands and checks them through the shared rules engine on hypothetical states. It scores HP and defeat risk, Card preservation, Summon, Echo development, terrain, Tactician/Redirect positions, spacing and current Quest objectives. A bounded beam search examines a second decision for the five most promising ordinary-turn candidates. Mandatory combat choices are resolved within forecasts where possible. Only the first command is executed; the bot observes again after every real change. [Da Orkk](orkk-bot.md) is a separate selectable policy using the same observation, controller and Worker infrastructure.

Before an incoming Attack reveals, defense is evaluated against low, middle and high attack hypotheses from the opponent's authored character pool. When attacking, it weighs taking the hit and hypothetical defenses. These are estimates of possible responses, not the human's selected Cards. The initial policy is deterministic and has one difficulty setting. It is a heuristic opponent, not an optimal solver or a trained model; balancing against human play remains useful.

Finishing-move forecasts include Guard's discard payment, required Hand-limit discards and actual turn-end consequences. Optional end discards are evaluated through completion too, so discarding useful Cards cannot artificially postpone Burning damage in the score. Merylin treats retained Burning as a continuing damage liability and can clear it with ordinary Burning Dash, paying the immediate damage and accepting random movement. A winning Attack or another useful action can still come first; stepping through flames during Dash can apply new Burning under the normal rules.

Echo development values multiple installed Perks, higher levels and an open first slot when another Perk is available in Hand. A legal upcoming automatic shift receives planning value, allowing Merylin to skip an unnecessary activation and add more Perks on following turns. This is balanced against immediate Summon/Attack benefits; she can still activate Carian when that enables a finishing Attack. These changes address the November 15 dump's repeated Guard-with-Burning and slot-1 Carian reuse.

## Information boundary

Only `src/merylin-bot-observation.ts` reads live state. The planner and its Worker receive a filtered clone:

- Merylin's own Hand and public state are available.
- Unrevealed enemy Hand Cards and enemy draw order become anonymous placeholders.
- Merylin's Deck is put into a canonical hypothetical order; genuinely known top Cards are retained. She cannot inspect future shuffled draws.
- An incoming committed Attack is replaced with a hypothesis until the normal combat reveal or a legal Oracle reveal. Its in-flight copy in Discard/Removed is also excluded: the engine discards Attacks before revealing them.
- Unrevealed enemy Oracle caches are stripped. The chosen Defend Card is retained once the normal combat reveal makes it public, so forecasts can resolve it correctly.
- Private enemy Combat Card selections, logs, visual events, undo snapshots and deferred combat results are omitted. Publicly revealed Cards/statuses remain available.
- Lightbringer's continuation can require the human's committed defense before its face is public. That Card and its command IDs become an anonymous legal defense proxy until the normal reveal; swap planning never inspects the actual Card.

`simulateGameCommand` preserves engine instance, draw and random counters, and uses isolated deterministic planning randomness. Simulation cannot mutate the match, advance the live random stream or learn its next outcome.

## Controller and UI

Planning runs in a dedicated module Worker with short delays between actions. Responses carry a revision and are discarded if the match changed while thinking. The human's Hand/perspective stays on P1, including private Combat Card selection; input cannot submit P2 commands. The phase label announces when Merylin is choosing. Planner failures expose a Retry bot control instead of silently transferring control or skipping a required choice.

## Verification

Use the `check:merylin-bot`, `check:merylin-bot-match`, `check:merylin-bot-ui` and `check:merylin-bot-worker` scripts. Node's `--experimental-transform-types` can execute the scripts directly when sandboxed tsx cannot spawn. Build before the worker check.

Coverage includes tactical Attack/Summon cases, hidden-information/draw-order invariance, the in-flight Discard and Oracle cache leaks, private extra Card selections, opening and all Phase rewards, Level 3 Perk choices, Yamato, mandatory discards, UI/controller stale-state handling and execution of the actual production Worker bundle through a Node message shim. Full-match checks use 27 seeded games against simple scripted opponents covering all nine Hotseat characters; they measure legality and completion, not difficulty against humans. No browser automation is used.
