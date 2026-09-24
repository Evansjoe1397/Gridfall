# Combat portraits

Transparent character artwork displayed behind the combat-resolution dialog belongs here.

Use `<character-id>.<role>.<extension>` for a character's general role portrait. Use `<character-id>.<role>.<card-id>.<extension>` for a card-specific override. A conditional variant uses `<character-id>.<role>.<card-id>.<variant>.<extension>`. The general `spirit` and `replica` variants apply to any card with `<character-id>.<role>.<variant>.<extension>`. Supported extensions are PNG, WebP, and AVIF. Supported roles are `attack` and `defend`.

Examples:

- `merylin.attack.png`
- `magician.defend.webp`
- `john-christ.attack.avif`
- `john-christ.attack.spirit.png`
- `john-christ.defend.spirit.png`
- `spectre.attack.replica.png`
- `spectre.defend.replica.png`
- `merylin.attack.excalibur.png`
- `magician.defend.spellblock.webp`
- `merylin.attack.lightbringer.highground.png`

Character IDs: `shinobi`, `orkk`, `magician`, `john-christ`, `spectre`, `wreckna`, and `merylin`.

The UI discovers these files at build time. A matching card-specific conditional variant has first priority, followed by a general form variant, a card-specific portrait, and the character's general Attack or Defend portrait. Missing slots remain invisible.
