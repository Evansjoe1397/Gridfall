import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_MODEL_PATHS, GAME_TEXTURE_PATHS } from '../src/game-asset-catalog.ts';
import { applyCommand, createMultiplayerState, createLordaeronMultiplayerState, type GameState } from '../shared/game.ts';

const mib = (bytes: number) => +(bytes / 1048576).toFixed(2);
function imageSize(bytes: Buffer): [number, number] | undefined {
  if (bytes.toString('hex', 0, 8) === '89504e470d0a1a0a') return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  if (bytes.readUInt16BE(0) === 0xffd8) {
    for (let offset = 2; offset + 9 < bytes.length;) {
      if (bytes[offset++] !== 0xff) continue;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const length = bytes.readUInt16BE(offset);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return [bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3)];
      if (length < 2) break;
      offset += length;
    }
  }
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    const type = bytes.toString('ascii', 12, 16);
    if (type === 'VP8X') return [bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1];
    if (type === 'VP8 ') return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
    if (type === 'VP8L') {
      const bits = bytes.readUInt32LE(21);
      return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
    }
  }
}

const models = GAME_MODEL_PATHS.map(path => {
  const data = readFileSync(join('public', path));
  const jsonLength = data.readUInt32LE(12);
  const gltf = JSON.parse(data.toString('utf8', 20, 20 + jsonLength));
  const binaryStart = 20 + jsonLength + 8;
  const primitives = (gltf.meshes ?? []).flatMap((mesh: any) => mesh.primitives);
  const triangles = primitives.reduce((sum: number, primitive: any) => {
    const count = gltf.accessors[primitive.indices ?? primitive.attributes.POSITION].count;
    return sum + ([5, 6].includes(primitive.mode) ? Math.max(0, count - 2) : (primitive.mode ?? 4) === 4 ? count / 3 : 0);
  }, 0);
  const images = (gltf.images ?? []).map((image: any) => {
    const view = gltf.bufferViews?.[image.bufferView];
    return view ? imageSize(data.subarray(binaryStart + (view.byteOffset ?? 0), binaryStart + (view.byteOffset ?? 0) + view.byteLength)) : undefined;
  });
  const pixels = images.reduce((sum: number, size: [number, number] | undefined) => sum + (size ? size[0] * size[1] : 0), 0);
  return { path, MiB: mib(data.length), primitives: primitives.length, triangles, clips: gltf.animations?.length ?? 0,
    images: images.map((size: number[] | undefined) => size?.join('×') ?? 'unknown').join(', '),
    textureRGBAWithMipsMiB: mib(pixels * 4 * 4 / 3) };
});
console.table(models.sort((a, b) => b.triangles - a.triangles));
const textureBytes = GAME_TEXTURE_PATHS.reduce((sum, path) => sum + statSync(join('public', path)).size, 0);
const artworkDirs = ['src/assets/combat-portraits', 'src/assets/character-profiles', 'src/assets/icons'];
const artworkBytes = artworkDirs.reduce((sum, dir) => sum + readdirSync(dir).filter(name => /\.(png|avif|webp|svg)$/i.test(name)).reduce((n, name) => n + statSync(join(dir, name)).size, 0), 0);
console.log(JSON.stringify({ gameplayModelsMiB: mib(GAME_MODEL_PATHS.reduce((sum, path) => sum + statSync(join('public', path)).size, 0)),
  gameplayTexturesMiB: mib(textureBytes), interfaceArtworkMiB: mib(artworkBytes),
  modelTextureRGBAWithMipsMiB: +models.reduce((sum, model) => sum + model.textureRGBAWithMipsMiB, 0).toFixed(2),
  note: 'Geometry counts are stored mesh primitives, not measured frame submissions. Texture estimate excludes compression, duplicates, browser overhead and framebuffer/shadow memory.' }, null, 2));

function benchmark(name: string, state: GameState) {
  state.phase = 'active';
  state.players[state.activePlayerId].freeMoveUsed = true;
  if (!state.players[state.activePlayerId].hand.length) state.players[state.activePlayerId].hand = [{ instanceId: 'benchmark-block', cardId: 'block' }];
  const command = { type: 'guard', playerId: state.activePlayerId };
  for (let i = 0; i < 20; i++) applyCommand(state, command);
  const commandTimes: number[] = [], serializationTimes: number[] = [];
  for (let i = 0; i < 200; i++) {
    let started = performance.now();
    const result = applyCommand(state, command);
    if (!result.ok) throw new Error(result.error);
    commandTimes.push(performance.now() - started);
    started = performance.now();
    JSON.stringify(result.state);
    serializationTimes.push(performance.now() - started);
  }
  const summary = (times: number[]) => {
    times.sort((a, b) => a - b);
    return { medianMs: +times[100].toFixed(3), p95Ms: +times[190].toFixed(3), maxMs: +times.at(-1)!.toFixed(3) };
  };
  console.log(JSON.stringify({ benchmark: name, samples: 200, command: summary(commandTimes), JSON: summary(serializationTimes),
    wireJSONKiB: +(Buffer.byteLength(JSON.stringify(state)) / 1024).toFixed(2) }));
}
const duel = createMultiplayerState({ P1: 'magician', P2: 'spectre', P3: 'orkk' });
const ffa = createLordaeronMultiplayerState({ P1: 'magician', P2: 'spectre', P3: 'orkk' });
benchmark('fresh duel / guard', duel);
benchmark('fresh FFA / guard', ffa);
const longMatch = structuredClone(duel);
longMatch.log = Array.from({ length: 2000 }, (_, index) => `Round ${index}: representative accumulated match log entry.`);
benchmark('duel / guard / synthetic 2000-entry log', longMatch);
