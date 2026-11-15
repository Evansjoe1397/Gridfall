# Lordaeron

The shared Hotseat/online arena has six starting Wooden Boxes: three fixed, one random clear High Ground Square and two distinct random uncolored interior Squares. The latter exclude board edges, colored terrain, bases, starts, Slides and fixed Objects. Slides are C5, F5 and D3.

Player 1's original Base Squares are A6/A7, with A6 as its starting Square. All Base colors come from the same function as the top player HUD: Player 1 violet-blue (#5e54ff), Player 2 red (#d11f4f), Player 3 green (#50c878). Claimed Bases follow their current owner; upgraded Kamelot Bases retain that hue with brighter tints.

Whenever a Wooden Box is destroyed on Lordaeron, an Apple appears at its final Square. Existing Box respawn rules continue. Other Objects and other arenas do not drop Apples. Apples persist until collected and do not block movement or participate in combat/Object targeting.

Entering or passing through an Apple Square with a living player character removes the Apple and immediately grants 1 usable MOV. It does not increase maximum Movement Range or grant a Free Move. Ordinary movement, Slides, Card movement, teleports and forced movement use the same pickup rule. Multiple Apples each grant their point; merely spawning one beneath a stationary character does not collect it.

Apple movement is spent before ordinary movement. Unspent Apple MOV expires for **all collectors** when the currently active player's turn fully ends, after required/optional end-turn choices. An inactive collector therefore cannot carry the bonus into their next turn. Existing non-Apple movement is retained. Movement/Action snapshots restore pickups and their movement when the corresponding effect is reverted.

Apples use red procedural fruit, a brown stem and green leaf. Pickup grants the normal MOV callout and a temporary movement status tooltip. `check:lordaeron-apples` covers destruction, arena isolation, pickups, movement and forced movement, Slides, John's movement ledger, full turn-end expiry, undo, visual cleanup and Base relocation.
