// HINTS > Hotkeys is rendered from this catalog. Update it whenever an input
// binding is added, changed, or removed (including mouse/touch shortcuts).
type Shortcut = { keys: readonly string[]; action: string; detail?: string };
type ShortcutSection = { title: string; shortcuts: readonly Shortcut[] };

export const HOTKEY_SECTIONS: readonly ShortcutSection[] = [
  {
    title: 'Turn actions and Cards',
    shortcuts: [
      { keys: ['Space'], action: 'End your turn.', detail: 'Opens the finishing-move reminder when applicable. Unavailable during the combat reveal.' },
      { keys: ['F'], action: 'Free Move + Draw Card.', detail: 'Available when the Free Move button is enabled.' },
      { keys: ['G'], action: 'Guard.', detail: 'Draw a Card, discard a Card, then end your turn.' },
      { keys: ['R'], action: 'Dash.', detail: 'Discard a non-Blessing Card and move again to finish your turn. With Burning, Fyrebanks takes its usual Dash Damage, Removes the Burning Cards, gains +1 MOV per Card, and chooses his route only with an active Trait and at least 1 previously accumulated Pyro Charge. This does not spend a Charge. With no Charges, or for other characters, Burning Dash movement is random. Fyrestarter offers a separate optional Dash through its Dash / Skip Dash buttons; another Action ends that Dash without ending the turn.' },
      { keys: ['C'], action: 'Cancel the latest movement segment.', detail: 'Available when the Cancel movement button is shown and enabled. Movement before a Perk becomes cancellable after undoing that Perk.' },
      { keys: ['Ctrl', 'Z'], action: 'Undo the latest movement segment or Perk.', detail: 'During your turn, in online and local games, while not typing. Undo movement first, then the latest Perk, then earlier movement. Another Perk replaces the previous Perk checkpoint. Attacking, Guard, Dash, ending the turn, other actions, opponent choices, Card draws/reveals, and random results commit earlier history.' },
      { keys: ['Alt', '1–9'], action: 'Activate a Hand Card by its position from left to right.', detail: 'Performs the same action as clicking that Card, including selecting it for a discard. Number row and numpad both work; disabled Cards cannot be activated.' },
      { keys: ['1–3'], action: 'Activate your Spell Echo slot 1, 2, or 3.', detail: 'Number row and numpad both work; the slot must be enabled. With a leveled Perk selected from Hand, insert it at Level 1. In Perk Mode, targeting an occupied Level 2 or 3 discards that Perk and shifts the lower Perks up one level.' },
    ],
  },
  {
    title: 'Interface and choices',
    shortcuts: [
      { keys: ['Ctrl', 'D'], action: 'Show or hide the developer diagnostics panel.', detail: 'Available in the lobby and matches while not typing, with no other modifier keys. Shows FPS, frame timing, board-renderer statistics, and game / connection state; includes debug dump export and issue markers. Recording continues with the panel closed. Overrides the browser bookmark shortcut.' },
      { keys: ['Ctrl', 'Shift', 'D'], action: 'Download the current debug dump.', detail: 'Available in the lobby and matches while not typing, without Alt or Meta. Works while client recording is paused. Includes available server history in online games. Overrides the browser bookmark-all-tabs shortcut.' },
      { keys: ['Ctrl', 'Shift', 'R'], action: 'Pause or resume client debug recording.', detail: 'Available in the lobby and matches while not typing, without Alt or Meta. Preserves recorded history and marks the recording gap. Shared multiplayer server history continues. Overrides the browser hard-reload shortcut.' },
      { keys: ['Tab'], action: 'Show or hide the combat summary.', detail: 'Toggles the current summary during combat, or reopens the last summary after combat.' },
      { keys: ['H'], action: 'Show or hide Character HP bars on the board.' },
      { keys: ['J'], action: 'Enable or disable Perk-use labels.' },
      { keys: ['T'], action: 'Toggle movement path previews and MOV-cost labels.', detail: 'Disabled by default. Available in the game with no modifier keys, while not typing in a text field. Includes automatic Slides and collision outcomes. Arm da Wiz’s Shield path preview remains enabled independently.' },
      { keys: ['Hold Alt'], action: 'Temporarily show movement path previews and MOV-cost labels.', detail: 'Either Alt key works while held in the game, outside text fields and Statistics. Releasing Alt restores the T toggle setting. Arm da Wiz’s Shield preview does not require Alt.' },
      { keys: ['K'], action: 'Toggle Compact Hand.' },
      { keys: ['Esc'], action: 'Close the current popup or cancel an available choice.', detail: 'Closes Statistics, HINTS, the Discard Deck, the end-turn reminder, Quick Attack, or Object Attack confirmation. Gameplay shortcuts are suspended while Statistics is open. Cancels Wooden Box relocation, Card targeting, Phylactery replacement, or Dash; ends Dance Through between completed tile animations; declines Feed Spirit or Anguish status removal. Gameplay choices cannot be cancelled during the combat reveal.' },
      { keys: ['←', '→'], action: 'Cycle Spectre’s Perk origin.', detail: 'While choosing an origin, cycle between eligible Replicas and Spectre where allowed.' },
      { keys: ['Enter'], action: 'Confirm Spectre’s selected Perk origin.' },
      { keys: ['Ctrl', 'C'], action: 'Copy the selected Room ID.', detail: 'In the online lobby, click the Room ID to select it first.' },
    ],
  },
  {
    title: 'Camera',
    shortcuts: [
      { keys: ['W / S'], action: 'Move the camera forward or backward.', detail: 'Hold the key to move continuously.' },
      { keys: ['A / D'], action: 'Move the camera left or right.', detail: 'Hold the key to move continuously.' },
      { keys: ['Q / E'], action: 'Rotate the camera around the board.', detail: 'Hold the key to rotate continuously.' },
      { keys: ['Home'], action: 'Reset the camera angle and zoom to fit the arena.' },
      { keys: ['Left or right mouse drag'], action: 'Rotate and tilt the board camera.' },
      { keys: ['Middle mouse drag'], action: 'Pan the board camera.' },
      { keys: ['Mouse wheel'], action: 'Zoom the camera in or out.' },
      { keys: ['One-finger drag'], action: 'Rotate and tilt the board camera on a touch screen.' },
      { keys: ['Two-finger drag / pinch'], action: 'Pan / zoom the board camera on a touch screen.' },
    ],
  },
  {
    title: 'Visual settings',
    shortcuts: [
      { keys: ['Shift', 'V'], action: 'Toggle visual polish.', detail: 'Enabled by default, including polished Nagrand tiles. The Pipe remains unchanged.' },
      { keys: ['Shift', 'B'], action: 'Toggle filmic tone mapping.' },
      { keys: ['Ctrl', 'K'], action: 'Toggle dawn arena lighting.' },
      { keys: ['Alt', '+ / ='], action: 'Increase dawn light level.', detail: 'Requires dawn lighting. Numpad + also works.' },
      { keys: ['Alt', '−'], action: 'Decrease dawn light level.', detail: 'Requires dawn lighting. Numpad − also works.' },
      { keys: ['Ctrl', 'L'], action: 'Switch between original and new Nagrand textures.', detail: 'Nagrand only. Turn visual polish off first with Shift+V.' },
      { keys: ['Ctrl', 'B'], action: 'Show or hide the surrounding Nagrand landscape.', detail: 'Nagrand only.' },
    ],
  },
  {
    title: 'Mouse shortcuts and browsing',
    shortcuts: [
      { keys: ['Click / tap a highlighted movement Square'], action: 'Choose a movement destination.', detail: 'Obi Wan’s Dance Through waits for each single-tile animation to finish before accepting another move or gameplay action. Extra clicks during the step are ignored, including while waiting for an online move response.' },
      { keys: ['Click / tap your Spell Echo'], action: 'Place a selected Hand Perk in Spell Echo at Level 1.', detail: 'Select a Perk with levels during your active turn. In Perk Mode, click any occupied slot to discard its Perk, shift all lower Perks up one level, and insert the selected Perk at Level 1. Higher Perks stay in place. Outside Perk Mode only Level 1 can be replaced. Normal Action and Perk-use costs apply.' },
      { keys: ['Hover a green movement Square'], action: 'Preview the Character’s route and MOV cost, including automatic Slides and collisions.', detail: 'Hold Alt or enable movement previews with T (disabled by default). Available while choosing your movement destination, including Dash and special movement. Mouse or pen only; hidden while dragging the camera. Step-by-step movement previews the next step. Free Slides and Card-granted movement do not add MOV cost. Orange markers show pushes, damage, or destruction.' },
      { keys: ['Hover an eligible Iron Shield'], action: 'Preview Arm da Wiz’s Shield recall path.', detail: 'Always enabled independently of T and Alt. Da Orkk only, while choosing a Shield to recall with Arm da Wiz. Mouse or pen only; hidden while dragging the camera. Enemy-tile line sections change color for pulls at every level; level 2+ also shows predicted damage.' },
      { keys: ['Click a highlighted Iron Shield'], action: 'Recall and equip that Shield with Arm da Wiz.', detail: 'Da Orkk only, after choosing Recall Shield. Click the Shield on the board or its Square; only your Shields with a valid recall path are selectable. Hover to preview the route and damage first. Esc cancels.' },
      { keys: ['Click an enemy'], action: 'Open Quick Attack, then choose a Card to attack immediately.', detail: 'Available with no Card selected or while moving, when at least one Attack Card can target that enemy.' },
      { keys: ['Click a highlighted Pyrodash lane'], action: 'Choose Fyrebanks’ Pyrodash direction.', detail: 'After combat, when the target lies between two compass directions. A magnified Attack chooses the outgoing lane from the Lens before movement starts. Click any highlighted Square along the red or blue lane; the reflected dash then runs automatically. Touch selection uses the same lanes.' },
      { keys: ['Dash / Skip Dash', 'Esc'], action: 'Choose or finish Fyrestarter Dash.', detail: 'After Fyrestarter absorbs, use its choice buttons; Esc skips the Dash while keeping absorption. Burning pays automatically, otherwise select an eligible Hand Card. During its controlled Dash, Finish Fyrestarter Dash or Esc ends movement immunity and unused Dash MOV, keeping the turn and unused pre-Dash MOV. C / Ctrl+Z cancels a movement segment normally; taking another Action ends this Dash.' },
      { keys: ['Click / tap a highlighted Square', 'Esc'], action: 'Aim or cancel Ray of Fire.', detail: 'After using Fyrebanks’ Ray of Fire, select a visible Square within Attack Range, including your own. Fire follows the direct line through both endpoints. Higher levels then absorb flames and affect an enemy on the target. Esc or Cancel Ray of Fire restores the Perk and Action before selection.' },
      { keys: ['Click Lens, then a highlighted enemy'], action: 'Magnify Fyrebanks’ Attack through the Lens.', detail: 'Select an Attack Card and a Lens within Range on a straight row, column or diagonal. Dragon Claws destroys it normally. Then select a visible enemy within Range 2 of the Lens; the Card and Action are spent only then. A non-straight Attack asks for destruction confirmation. Mouse and touch use the same targets.' },
      { keys: ['Esc / Cancel Lens'], action: 'Cancel Lens targeting or its destruction confirmation.', detail: 'Available before the second target commits combat or destruction is confirmed. Restores the preceding Card, Action and movement selections.' },
      { keys: ['Click adjacent Square / push direction'], action: 'Use Summon Lens, then optionally push it at Level 2 or 3.', detail: 'Fyrebanks only. Choose a highlighted adjacent Square to replace the existing Lens. Then choose a highlighted direction away from Fyrebanks to push 1 Square. Keep Lens here skips the push; Esc or Cancel Summon Lens cancels the Perk and restores the previous Lens.' },
      { keys: ['Click a highlighted enemy'], action: 'Select a target for Kazka’s chosen Narration effect.', detail: 'Available after choosing an enemy Narration effect. Only visible enemies in Range with a valid effect are selectable; unchanged HP and starting positions cannot be reverted. A lone living enemy is selected automatically. Use Cancel effect to decline; Holograms are visual markers only.' },
      { keys: ['Double-click a Wooden Box'], action: 'Select a Wooden Box for test relocation.', detail: 'During the active phase, then click an empty Square to teleport it. Esc cancels.' },
      { keys: ['Hover a Compact Hand Card'], action: 'Show its full Card preview.' },
      { keys: ['Click outside a popup'], action: 'Close Quick Attack or Object Attack confirmation.', detail: 'Click the backdrop to close HINTS or the Discard Deck.' },
      { keys: ['Mouse wheel over Perks'], action: 'Scroll through Perks in the Character browser.' },
      { keys: ['Drag / wheel on Character preview'], action: 'Rotate / zoom the Character model in the browser.', detail: 'Left mouse drag rotates; mouse wheel or middle mouse drag zooms. On touch screens, one finger rotates and a two-finger pinch zooms.' },
    ],
  },
];
