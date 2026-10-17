# Perk Mode

Enable **Perk Mode** with the switch on character selection. It applies to Hotseat, private multiplayer, Free For All, and both Best-of-Three formats. In multiplayer the host sets the shared switch before anyone confirms a Character; all seats see the setting.

- Each standard Character starts with their Base/Reserve Perk in Hand. The other starting Perks join the two normally reserved Phase 2 Perks in a pool of four available Perks.
- Choose opening Focus normally. Draw two ordinary opening Cards and take the Base Perk, then shuffle two non-actionable **PERK** Cards into the remaining Deck and put the selected Focus Card on top. Later players keep their extra opening draw without displacing that Focus Card.
- Drawing PERK consumes it immediately and queues a choice of one remaining Perk to add to Hand. Multiple PERK draws require successive choices. The underlying game phase is preserved while choices resolve, including other pending Card effects and rewards. Consumed PERK Cards never enter Discard or recycle. Extra PERK Cards drawn after the pool is exhausted are consumed without a choice.
- Acquiring a Perk permanently removes it from that player's choice pool for the match. Using or Removing it does not make it available again.
- With a leveled Perk selected in Hand, target any occupied slot in your own Spell Echo. Discard that slot's Perk, shift each lower-level slot up one level, and insert the selected Perk at Level 1, executing its Level 1 effects. Higher slots stay unchanged. For example, replacing C in `[A, B, C]` with D gives `[D, A, B]`, with C in Discard. Normal Action, Perk-use, one-use-copy, and undo rules apply. Click/tap a slot or press its number key. An empty Level 1 remains a valid insertion target; empty higher slots are not replacement targets.
- Phase 1 keeps its normal remaining Focus Card rewards and additionally offers PERK. Choosing PERK always shuffles it into the Deck, even for the Action Quest Winner.
- Phase 2 offers every character Card not yet acquired, including remaining Focus Cards and Perks. Ordinary reward destination rules apply.
- Best-of-Three Match 2 starts with a fresh pool for its Character. Match 3 carries each winner's remaining pool alongside their Cards and Spell Echo.

Kazka remains an unfinished Hotseat-only Character with her existing fixed deck and no opening Focus or Phase reward setup. Training Dummies keep their existing test decks.

The replacement feature is controlled solely by `allowsAnySpellEchoReplacement(state)` in `shared/game.ts`. The shared UI target predicate and authoritative command validation both consult it. To enable the feature for the overall game, change that policy function; the mode-independent `insertPerkIntoSpellEcho` helper and `play-perk.echoPosition` command already implement the insertion and shifting. Omitting `echoPosition` keeps the original Level 1 behavior for existing clients.

Non-browser checks: `npm run check:perk-mode`, `npm run check:spell-echo-insertion`, `npm run check:perk-mode-server`, `npm run check:best-of-three`, `npm run check:action-undo`, `npm run check:mana-choice-queue`, `npm run typecheck`, and `npm run build`. The server check uses an isolated server and WebSocket clients.
