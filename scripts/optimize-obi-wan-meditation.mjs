// Usage: node scripts/optimize-obi-wan-meditation.mjs <tool node_modules directory>
// Tool dependencies: @gltf-transform/core and meshoptimizer (build-time only).
// Windows image resizing uses System.Drawing; source GLB is never modified.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
const deps = path.resolve(process.argv[2] ?? 'node_modules');
const { NodeIO } = await import(pathToFileURL(path.join(deps, '@gltf-transform/core/dist/index.js')));
const { MeshoptSimplifier } = await import(pathToFileURL(path.join(deps, 'meshoptimizer/meshopt_simplifier.js')));
await MeshoptSimplifier.ready;
const input = 'experiments/Meshy_AI_ObiWan_Idle.glb';
const output = 'public/models/obi-wan-meditation.glb';
const io = new NodeIO();
const doc = await io.read(input);
const root = doc.getRoot();
if (root.listAnimations().length || root.listSkins().length || root.listMeshes().length !== 1) throw new Error('Expected one static meditation mesh.');
const primitive = root.listMeshes()[0].listPrimitives()[0];
const positions = primitive.getAttribute('POSITION').getArray();
const uv = primitive.getAttribute('TEXCOORD_0').getArray();
const oldIndices = primitive.getIndices();
// Keep UV island boundaries locked. Permissive collapses stretched atlas regions
// across the robe, producing skin-colored triangular patches on its fabric.
const [indices, error] = MeshoptSimplifier.simplifyWithAttributes(
  new Uint32Array(oldIndices.getArray()), positions, 3, uv, 2, [1, 1], null, 18000 * 3, 0.001, [],
);
const [remap, count] = MeshoptSimplifier.compactMesh(indices);
for (const semantic of primitive.listSemantics()) {
  const accessor = primitive.getAttribute(semantic);
  const source = accessor.getArray();
  const size = accessor.getElementSize();
  const result = new source.constructor(count * size);
  for (let i = 0; i < remap.length; i++) if (remap[i] !== 0xffffffff) result.set(source.subarray(i * size, (i + 1) * size), remap[i] * size);
  accessor.setArray(result);
}
oldIndices.setArray(count <= 65535 ? new Uint16Array(indices) : indices);
const temp = path.resolve('tmp/meditation-textures');
fs.mkdirSync(temp, { recursive: true });
for (const [i, texture] of root.listTextures().entries()) {
  const original = path.join(temp, `${i}-source.jpg`);
  const resized = path.join(temp, `${i}-small.jpg`);
  fs.writeFileSync(original, texture.getImage());
  const quote = (s) => "'" + s.replaceAll("'", "''") + "'";
  execFileSync('powershell', ['-NoProfile', '-Command', `
    $ErrorActionPreference = 'Stop'
    Add-Type -AssemblyName System.Drawing
    $img = [System.Drawing.Image]::FromFile(${quote(original)})
    Write-Output ("Texture ${i}: " + $img.Width + "x" + $img.Height)
    $ratio = [Math]::Min([double]1, [double](1024 / [Math]::Max($img.Width, $img.Height)))
    $bmp = New-Object System.Drawing.Bitmap ([int]($img.Width * $ratio)), ([int]($img.Height * $ratio))
    $graphics = [System.Drawing.Graphics]::FromImage($bmp)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.DrawImage($img, 0, 0, $bmp.Width, $bmp.Height)
    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
    $parameters = New-Object System.Drawing.Imaging.EncoderParameters 1
    $parameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]80)
    $bmp.Save(${quote(resized)}, $codec, $parameters)
    $graphics.Dispose(); $bmp.Dispose(); $img.Dispose()
  `], { stdio: 'inherit' });
  texture.setImage(fs.readFileSync(resized)).setMimeType('image/jpeg');
}
root.listNodes()[0].setName('Meditation');
await io.write(output, doc);
console.log(JSON.stringify({ sourceBytes: fs.statSync(input).size, outputBytes: fs.statSync(output).size, triangles: indices.length / 3, vertices: count, relativeError: error }));
