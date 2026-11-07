// Tool setup: npm install --prefix output/performance-tools --no-audit --no-fund @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions sharp meshoptimizer
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const tools = path.resolve(process.argv[2] ?? 'output/performance-tools/node_modules');
const requireTool = createRequire(path.join(tools, '..', 'package.json'));
const { default: sharp } = await import(pathToFileURL(requireTool.resolve('sharp')));
const { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } = await import(pathToFileURL(requireTool.resolve('meshoptimizer')));
const { NodeIO } = await import(pathToFileURL(path.join(tools, '@gltf-transform/core/dist/index.js')));
const { ALL_EXTENSIONS, EXTTextureWebP, EXTMeshoptCompression } = await import(pathToFileURL(path.join(tools, '@gltf-transform/extensions/dist/index.js')));
const { weld, simplify, dedup, prune, meshopt } = await import(pathToFileURL(path.join(tools, '@gltf-transform/functions/dist/index.js')));
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const backup = path.resolve('output/performance-assets-originals');
fs.mkdirSync(backup, { recursive: true });
fs.writeFileSync(path.join(backup, '.gitignore'), '*\n');
const results = [];
async function writeAsset(file, bytes) {
  if (fs.existsSync(file) && fs.readFileSync(file).equals(Buffer.from(bytes))) return;
  const temporary = `${file}.optimizing`;
  fs.writeFileSync(temporary, bytes);
  for (let attempt = 0; ; attempt++) {
    try { fs.renameSync(temporary, file); return; }
    catch (error) {
      if (attempt === 9) throw error;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}
function preserve(file) {
  const saved = path.join(backup, file);
  fs.mkdirSync(path.dirname(saved), { recursive: true });
  if (!fs.existsSync(saved)) fs.copyFileSync(file, saved);
  return saved;
}
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
function signature(document) {
  const root = document.getRoot();
  return {
    nodes: root.listNodes().map(node => [node.getName(), node.getTranslation(), node.getRotation(), node.getScale()]),
    skins: root.listSkins().map(skin => [skin.getName(), skin.listJoints().map(node => node.getName()), [...(skin.getInverseBindMatrices()?.getArray() ?? [])]]),
    animations: createHash('sha256').update(JSON.stringify(root.listAnimations().map(animation => [animation.getName(), animation.listChannels().map(channel => [
      channel.getTargetNode()?.getName(), channel.getTargetPath(), channel.getSampler()?.getInterpolation(),
      [...(channel.getSampler()?.getInput()?.getArray() ?? [])], [...(channel.getSampler()?.getOutput()?.getArray() ?? [])],
    ])]))).digest('hex'),
  };
}
function triangleCount(document) {
  return document.getRoot().listMeshes().reduce((sum, mesh) => sum + mesh.listPrimitives().reduce((n, primitive) => n + (primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION').getCount()) / 3, 0), 0);
}

for (const directory of ['src/assets/combat-portraits', 'src/assets/character-profiles']) {
  const savedDirectory = path.join(backup, directory);
  const names = new Set([...fs.readdirSync(directory), ...(fs.existsSync(savedDirectory) ? fs.readdirSync(savedDirectory) : [])]);
  for (const name of [...names].filter(name => name.endsWith('.png'))) {
    const file = path.join(directory, name), original = preserve(file), target = file.replace(/\.png$/, '.webp');
    const metadata = await sharp(original).metadata();
    if (!fs.existsSync(file) && fs.existsSync(target)) {
      const output = await sharp(target).metadata();
      results.push({ file, target, beforeBytes: fs.statSync(original).size, afterBytes: fs.statSync(target).size,
        beforeSize: `${metadata.width}x${metadata.height}`, afterSize: `${output.width}x${output.height}` });
      continue;
    }
    const bytes = await sharp(original).resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 88, alphaQuality: 100, effort: 6 }).toBuffer();
    const output = await sharp(bytes).metadata();
    assert.equal(output.hasAlpha, metadata.hasAlpha, `Alpha was lost: ${file}`);
    fs.writeFileSync(target, bytes);
    fs.unlinkSync(file);
    results.push({ file, target, beforeBytes: fs.statSync(original).size, afterBytes: bytes.length,
      beforeSize: `${metadata.width}x${metadata.height}`, afterSize: `${output.width}x${output.height}` });
  }
}

for (const name of ['ground', 'cliff-rock-v1', 'polish-stone-v1']) {
  const file = `public/textures/nagrand/${name}.png`, original = preserve(file), target = file.replace(/\.png$/, '.webp');
  const metadata = await sharp(original).metadata();
  const bytes = await sharp(original).resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 92, alphaQuality: 100, effort: 6 }).toBuffer();
  fs.writeFileSync(target, bytes);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  results.push({ file, target, beforeBytes: fs.statSync(original).size, afterBytes: bytes.length,
    beforeSize: `${metadata.width}x${metadata.height}`, afterSize: `${(await sharp(bytes).metadata()).width}x${(await sharp(bytes).metadata()).height}` });
}

const modelNames = fs.readdirSync('public/models').filter(name => name.endsWith('.glb') && ![
  'da-orkh.glb', 'da-orkh-optimized.glb', 'long-hat-logan.glb', 'long-hat-logan-test.glb', 'long-hat-logan-death.glb',
].includes(name));
for (const name of modelNames) {
  const file = path.join('public/models', name), original = preserve(file);
  const document = await io.read(original), root = document.getRoot();
  const before = signature(document), trianglesBefore = triangleCount(document);
  const colorTextures = new Set(root.listMaterials().flatMap(material => [material.getBaseColorTexture(), material.getEmissiveTexture()]).filter(Boolean));
  const dataTextures = new Set(root.listMaterials().flatMap(material => [material.getNormalTexture(), material.getMetallicRoughnessTexture(), material.getOcclusionTexture()]).filter(Boolean));
  let changed = false;
  for (const texture of root.listTextures()) {
    const image = texture.getImage();
    if (!image) continue;
    const metadata = await sharp(image).metadata();
    const isColor = colorTextures.has(texture) && !dataTextures.has(texture);
    const tooLarge = Math.max(metadata.width, metadata.height) > 2048;
    if (!tooLarge && (!isColor || metadata.format === 'webp')) continue;
    let pipeline = sharp(image).resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true });
    let output;
    if (isColor) {
      output = await pipeline.webp({ quality: 90, alphaQuality: 100, effort: 6 }).toBuffer();
      document.createExtension(EXTTextureWebP).setRequired(true);
      texture.setMimeType('image/webp');
    } else if (metadata.format === 'jpeg') output = await pipeline.jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer();
    else if (metadata.format === 'webp') output = await pipeline.webp({ lossless: true, effort: 6 }).toBuffer();
    else output = await pipeline.png({ compressionLevel: 9 }).toBuffer();
    texture.setImage(output);
    changed = true;
  }
  const simplifyPerimeter = name === 'lordaeron-cemetery-perimeter.glb';
  if (simplifyPerimeter) {
    assert.equal(root.listSkins().length, 0);
    assert.equal(root.listAnimations().length, 0);
    await document.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.5, error: 0.001 }), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    changed = true;
  }
  if (!changed) continue;
  if (!simplifyPerimeter) document.createExtension(EXTMeshoptCompression).setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  const output = await io.writeBinary(document);
  const reread = await io.readBinary(output);
  // Texture-only edits must preserve the complete rig, clip timing and bindings.
  if (!simplifyPerimeter) {
    const after = signature(reread);
    assert.equal(after.animations, before.animations, `Animation samples or bindings changed: ${name}`);
    assert.equal(JSON.stringify(after.skins), JSON.stringify(before.skins), `Skin bindings changed: ${name}`);
    assert.equal(after.nodes.length, before.nodes.length, `Node count changed: ${name}`);
    after.nodes.forEach((node, index) => {
      assert.equal(node[0], before.nodes[index][0], `Node name changed: ${name}`);
      for (let component = 1; component <= 3; component++) node[component].forEach((value, axis) =>
        assert.ok(Math.abs(value - before.nodes[index][component][axis]) < 1e-5, `Node transform changed: ${name}/${node[0]}`));
    });
  }
  if (output.length >= fs.statSync(original).size && !simplifyPerimeter) continue;
  await writeAsset(file, output);
  results.push({ file, beforeBytes: fs.statSync(original).size, afterBytes: output.length,
    trianglesBefore, trianglesAfter: triangleCount(reread), clips: root.listAnimations().length });
  console.log(`${name}: ${(fs.statSync(original).size / 1048576).toFixed(2)} → ${(output.length / 1048576).toFixed(2)} MiB`);
}
fs.writeFileSync(path.join(backup, 'optimization-results.json'), JSON.stringify(results, null, 2));
console.table(results.map(result => ({ file: result.file, beforeMiB: +(result.beforeBytes / 1048576).toFixed(2),
  afterMiB: +(result.afterBytes / 1048576).toFixed(2), triangles: result.trianglesAfter, size: result.afterSize })));
console.log('Originals and exact results:', backup);
