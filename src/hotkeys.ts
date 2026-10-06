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
      { keys: ['R'], action: 'Dash.', detail: 'Discard a non-Blessing Card and move again to finish your turn.' },
      { keys: ['C'], action: 'Cancel the latest movement segment.', detail: 'Available when the Cancel movement button is shown and enabled. Movement before a Perk becomes cancellable after undoing that Perk.' },
      { keys: ['Ctrl', 'Z'], action: 'Undo the latest movement segment or Perk.', detail: 'During your turn, in online and local games, while not typing. Undo movement first, then the latest Perk, then earlier movement. Another Perk replaces the previous Perk checkpoint. Attacking, Guard, Dash, ending the turn, other actions, opponent choices, Card draws/reveals, and random results commit earlier history.' },
      { keys: ['Alt', '1–9'], action: 'Activate a Hand Card by its position from left to right.', detail: 'Performs the same action as clicking that Card, including selecting it for a discard. Number row and numpad both work; disabled Cards cannot be activated.' },
      { keys: ['1–3'], action: 'Activate your Spell Echo slot 1, 2, or 3.', detail: 'Number row and numpad both work; the slot must be enabled.' },
    ],
  },
  {
    title: 'Interface and choices',
    shortcuts: [
      { keys: ['Ctrl', 'D'], action: 'Show or hide the developer diagnostics panel.', detail: 'Available in the lobby and matches while not typing, with no other modifier keys. Shows FPS, frame timing, board-renderer statistics, and game / connection state. Overrides the browser bookmark shortcut.' },
      { keys: ['Tab'], action: 'Show or hide the combat summary.', detail: 'Toggles the current summary during combat, or reopens the last summary after combat.' },
      { keys: ['H'], action: 'Show or hide Character HP bars on the board.' },
      { keys: ['J'], action: 'Enable or disable Perk-use labels.' },
      { keys: ['T'], action: 'Toggle movement path previews and MOV-cost labels.', detail: 'Enabled by default. Available in the game with no modifier keys, while not typing in a text field. Includes automatic Slides and collision outcomes.' },
      { keys: ['K'], action: 'Toggle Compact Hand.' },
      { keys: ['Esc'], action: 'Close the current popup or cancel an available choice.', detail: 'Closes HINTS, the Discard Deck, the end-turn reminder, Quick Attack, or Object Attack confirmation. Cancels Wooden Box relocation, Card targeting, or Dash; ends Dance Through; declines Feed Spirit or Anguish status removal. Gameplay choices cannot be cancelled during the combat reveal.' },
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
      { keys: ['Hover a green movement Square'], action: 'Preview the Character’s route and MOV cost, including automatic Slides and collisions.', detail: 'Requires path previews enabled (T). Available while choosing your movement destination, including Dash and special movement. Mouse or pen only; hidden while dragging the camera. Step-by-step movement previews the next step. Free Slides and Card-granted movement do not add MOV cost. Orange markers show pushes, damage, or destruction.' },
      { keys: ['Click an enemy'], action: 'Open Quick Attack, then choose a Card to attack immediately.', detail: 'Available with no Card selected or while moving, when at least one Attack Card can target that enemy.' },
      { keys: ['Double-click a Wooden Box'], action: 'Select a Wooden Box for test relocation.', detail: 'During the active phase, then click an empty Square to teleport it. Esc cancels.' },
      { keys: ['Hover a Compact Hand Card'], action: 'Show its full Card preview.' },
      { keys: ['Click outside a popup'], action: 'Close Quick Attack or Object Attack confirmation.', detail: 'Click the backdrop to close HINTS or the Discard Deck.' },
      { keys: ['Mouse wheel over Perks'], action: 'Scroll through Perks in the Character browser.' },
      { keys: ['Drag / wheel on Character preview'], action: 'Rotate / zoom the Character model in the browser.', detail: 'Left mouse drag rotates; mouse wheel or middle mouse drag zooms. On touch screens, one finger rotates and a two-finger pinch zooms.' },
    ],
  },
];
