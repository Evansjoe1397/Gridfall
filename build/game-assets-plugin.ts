import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { GAME_ASSET_PATHS } from '../src/game-asset-catalog.ts';

/** Give public gameplay resources the same content-addressed caching as JS/CSS. */
export function gameAssetsPlugin(): Plugin {
  let assets: { path: string; fileName: string; source: Buffer; bytes: number }[] = [];
  return {
    name: 'gridfall-game-assets',
    config(_config, environment) {
      assets = GAME_ASSET_PATHS.map(path => {
        const source = readFileSync(resolve('public', path));
        const hash = createHash('sha256').update(source).digest('hex').slice(0, 16);
        return { path, fileName: `assets/game/${hash}-${basename(path)}`, source, bytes: source.length };
      });
      return {
        publicDir: environment.command === 'build' ? false : 'public',
        define: {
          __GRIDFALL_ARTWORK_BYTES__: JSON.stringify(Object.fromEntries(
            ['combat-portraits', 'character-profiles', 'icons'].flatMap(directory =>
              readdirSync(resolve('src/assets', directory)).filter(name => /\.(avif|png|webp|svg)$/i.test(name)).map(name => [
                `./assets/${directory}/${name}`, statSync(resolve('src/assets', directory, name)).size,
              ])),
          )),
          __GRIDFALL_ASSETS__: JSON.stringify(Object.fromEntries(assets.map(asset => [asset.path, {
            url: environment.command === 'build' ? asset.fileName : `${asset.path}?asset=${asset.fileName.split('/').at(-1)!.slice(0, 16)}`,
            bytes: asset.bytes,
          }]))),
        },
      };
    },
    generateBundle() {
      for (const { fileName, source } of assets) this.emitFile({ type: 'asset', fileName, source });
      // Runtime models/textures already have hashed URLs. Avoid copying duplicate
      // originals and abandoned GLBs into every production deployment.
      const copyPublic = (directory: string, prefix = '') => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
          const name = `${prefix}${entry.name}`;
          const sourcePath = resolve(directory, entry.name);
          if (entry.isDirectory()) copyPublic(sourcePath, `${name}/`);
          else if (!GAME_ASSET_PATHS.includes(name) && !(name.startsWith('models/') && name.endsWith('.glb'))) {
            this.emitFile({ type: 'asset', fileName: name, source: readFileSync(sourcePath) });
          }
        }
      };
      copyPublic(resolve('public'));
    },
  };
}
