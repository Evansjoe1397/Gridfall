# Combat portraits

Transparent character artwork displayed behind the combat-resolution dialog belongs here.

Use `<character-id>.<role>.<extension>` for a character's general role portrait. Use `<character-id>.<role>.<card-id>.<extension>` for a card-specific override. A conditional variant uses `<character-id>.<role>.<card-id>.<variant>.<extension>`. Supported extensions are PNG, WebP, and AVIF. Supported roles are `attack` and `defend`.

Examples:

- `merylin.attack.png`
- `magician.defend.webp`
- `john-christ.attack.avif`
- `merylin.attack.excalibur.png`
- `magician.defend.spellblock.webp`
- `merylin.attack.lightbringer.highground.png`

Character IDs: `shinobi`, `orkk`, `magician`, `john-christ`, `spectre`, `wreckna`, and `merylin`.

The UI discovers these files at build time. A matching conditional variant has first priority, followed by the card-specific portrait and then the character's general Attack or Defend portrait. Missing slots remain invisible.
