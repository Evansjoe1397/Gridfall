import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
assert.match(source, /WrecknaTombLichIcon/);
assert.match(source, /player\.character === 'wreckna' && player\.wrecknaInsideTombId === tombId/);
assert.match(source, /if \(!currentObjectIds\.has\(id\)\)[\s\S]*?lichIcon\.visible = false/);
assert.match(source, /occupant\.id === 'P1' \? 0x169bd3 : occupant\.id === 'P2' \? 0xff5d68 : 0xa06cff/);
assert.match(source, /lichIcon\.raycast = \(\) => \{\}/);
console.log('Wreckna Tomb Lich icon checks passed.');
