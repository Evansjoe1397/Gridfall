import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as THREE from 'three';
import { WebGLPrograms } from 'three/src/renderers/webgl/WebGLPrograms.js';
import { OverlayMeasurements, positionOverlay, statusOverlayBounds } from '../src/overlay-layout.ts';
import { isScenePrewarming, prewarmPointLightVariants, visiblePointLightCount } from '../src/shader-warmup.ts';
import { FrameWorkProfiler } from '../src/frame-work.ts';

// Geometry getters deliberately fail: the animation-facing cache must never use them.
const element = { getBoundingClientRect() { throw new Error('Forced layout'); },
  get clientWidth() { throw new Error('Forced layout'); }, get offsetWidth() { throw new Error('Forced layout'); } } as unknown as HTMLElement;
let deliver!: ResizeObserverCallback;
const observed = new Set<Element>();
const sizes = new OverlayMeasurements(callback => {
  deliver = callback;
  return { observe: target => { observed.add(target); }, unobserve: target => { observed.delete(target); } };
});
sizes.observe(element); sizes.observe(element);
assert.equal(observed.size, 1);
assert.equal(sizes.statusBounds(element, 100, 200, 0.5), undefined);
deliver([{ target: element, borderBoxSize: [{ inlineSize: 216, blockSize: 64 }] } as unknown as ResizeObserverEntry], {} as ResizeObserver);
assert.equal(sizes.width(element), 216);
assert.deepEqual(sizes.statusBounds(element, 100, 200, 0.5), { left: 46, right: 154, top: 159, bottom: 191, width: 108, height: 32 });
deliver([{ target: element, borderBoxSize: [{ inlineSize: 0, blockSize: 0 }] } as unknown as ResizeObserverEntry], {} as ResizeObserver);
assert.equal(sizes.width(element), 216, 'Hiding an element retains its last intrinsic size');
sizes.forget(element);
assert.equal(observed.size, 0);
assert.equal(sizes.width(element), 0);
deliver([{ target: element, borderBoxSize: [{ inlineSize: 300, blockSize: 64 }] } as unknown as ResizeObserverEntry], {} as ResizeObserver);
assert.equal(sizes.width(element), 0, 'Late resize notifications cannot revive an unobserved element');

// Compare analytical bounds against the CSS transform matrix, including transform-origin.
for (const scale of [0.28, 0.5, 1.15]) {
  const width = 216, height = 64, x = 713.25, y = 288.75;
  const transform = new THREE.Matrix4().makeTranslation(width / 2, height, 0)
    .multiply(new THREE.Matrix4().makeTranslation(x, y, 0))
    .multiply(new THREE.Matrix4().makeTranslation(-width / 2, -height - 9, 0))
    .multiply(new THREE.Matrix4().makeScale(scale, scale, 1))
    .multiply(new THREE.Matrix4().makeTranslation(-width / 2, -height, 0));
  const corners = [new THREE.Vector3(), new THREE.Vector3(width, height, 0)].map(point => point.applyMatrix4(transform));
  const bounds = statusOverlayBounds(x, y, scale, width, height);
  assert.ok(Math.abs(bounds.left - corners[0].x) < 1e-9);
  assert.ok(Math.abs(bounds.top - corners[0].y) < 1e-9);
  assert.ok(Math.abs(bounds.right - corners[1].x) < 1e-9);
  assert.ok(Math.abs(bounds.bottom - corners[1].y) < 1e-9);
}
const properties = new Map<string, string>();
positionOverlay({ style: { setProperty: (key: string, value: string) => properties.set(key, value) } } as unknown as HTMLElement, 12.5, 29.75);
assert.deepEqual([...properties], [['--overlay-x', '12.5px'], ['--overlay-y', '29.75px']]);

// Guard the actual frame functions against reintroducing read/write layout loops.
const source = ts.createSourceFile('src/main.ts', readFileSync('src/main.ts', 'utf8'), ts.ScriptTarget.Latest, true);
const hotFunctions = ['updateCharacterHealthBars', 'updateOverheadStatusRows', 'updateDamageVisuals', 'updatePerkUseLabels', 'updateCharacterCalloutBubbles', 'updateObjectCalloutBubbles'];
for (const name of hotFunctions) {
  const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)!;
  assert.ok(declaration, name);
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAccessExpression(node)) {
      assert.ok(!['getBoundingClientRect', 'clientWidth', 'clientHeight', 'offsetWidth', 'offsetHeight'].includes(node.name.text), `${name} reads layout: ${node.name.text}`);
      if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'style') {
        assert.ok(!['left', 'top'].includes(node.name.text), `${name} must move overlays with transforms`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(declaration);
}

// Exercise Three's actual program-key implementation, without a WebGL context.
const programs = WebGLPrograms({ outputColorSpace: THREE.SRGBColorSpace }, {}, {}, { precision: 'highp', logarithmicDepthBuffer: false }, {}, {});
const keyFor = (count: number) => programs.getProgramCacheKey({ shaderID: 'physical', isRawShaderMaterial: false, numPointLights: count, customProgramCacheKey: '' });
assert.notEqual(keyFor(1), keyFor(2), 'A spell light changes the real Three shader key');
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
const original = new THREE.PointLight(0xffaa00, 0, 5);
const hidden = new THREE.Group(); hidden.visible = false; hidden.add(new THREE.PointLight());
const otherLayer = new THREE.PointLight(); otherLayer.layers.set(2);
scene.add(original, hidden, otherLayer);
const children = [...scene.children];
const warmed = new Set<string>(), counts: number[] = [];
const compiler = { async compileAsync() {
  const count = visiblePointLightCount(scene, camera);
  counts.push(count); warmed.add(keyFor(count));
  return new Set<THREE.Material>();
} };
await prewarmPointLightVariants(compiler, scene, camera);
assert.deepEqual(counts, [1, 2, 3, 4], 'Zero-intensity visible lights must prewarm additional variants');
assert.deepEqual(scene.children, children, 'Warmup must not retain extra scene lights');
assert.equal(isScenePrewarming(scene), false);
for (const count of [2, 3, 4, 1, 2]) assert.ok(warmed.has(keyFor(count)), 'Common spell-light keys were prepared before gameplay');
assert.equal(original.intensity, 0);
for (const failAt of [1, 3]) {
  let calls = 0;
  await assert.rejects(prewarmPointLightVariants({ async compileAsync() {
    if (++calls === failAt) throw new Error('compile failure');
    return new Set<THREE.Material>();
  } }, scene, camera), /compile failure/);
  assert.deepEqual(scene.children, children, 'Failed compilation must clean up temporary lights');
  assert.equal(isScenePrewarming(scene), false);
}
let release!: () => void, calls = 0;
const concurrent = { async compileAsync() {
  if (++calls === 1) await new Promise<void>(resolve => { release = resolve; });
  return new Set<THREE.Material>();
} };
const first = prewarmPointLightVariants(concurrent, scene, camera);
const second = prewarmPointLightVariants(concurrent, scene, camera);
assert.equal(first, second, 'Concurrent preparation must share one warmup');
assert.ok(isScenePrewarming(scene));
release(); await first;
assert.equal(calls, 4);
assert.deepEqual(scene.children, children);

const profiler = new FrameWorkProfiler();
for (let i = 0; i < 1000; i++) profiler.record(i === 0 ? 55 : 1, i === 1 ? 70 : 2, i === 2 ? 3 : 4, 4);
const snapshot = profiler.snapshot();
assert.equal(snapshot.sampleCount, 600, 'Diagnostics retain a bounded timing window');
assert.deepEqual(snapshot.hud, { p95Ms: 1, maxMs: 1 });
assert.equal(snapshot.peakHudMs, 55, 'Old spikes survive between diagnostic samples');
assert.equal(snapshot.peakRenderSubmissionMs, 70);
assert.equal(snapshot.growthFrames, 1);
assert.equal(profiler.record(1, 2, 4, 3).programGrowth, 0, 'Removing programs is not shader growth');
assert.deepEqual(profiler.recordLongFrame({ duration: 120.1, scripts: [
  { forcedStyleAndLayoutDuration: 5 }, { forcedStyleAndLayoutDuration: 7.25, sourceFunctionName: 'updateHUD' },
] }), { durationMs: 120.1, forcedStyleAndLayoutMs: 12.25, sourceFunction: 'updateHUD' });
profiler.recordLongFrame({ duration: 80 });
assert.equal(profiler.snapshot().longFrames.maxForcedStyleLayoutMs, 12.25);
assert.equal(profiler.snapshot().longFrames.count, 2);
profiler.reset();
assert.equal(profiler.snapshot().sampleCount, 0);
assert.equal(profiler.snapshot().peakHudMs, 0);
assert.equal(profiler.snapshot().longFrames.count, 0);

// Exercise optional browser-observer wiring without starting a browser.
const originalObserver = Object.getOwnPropertyDescriptor(globalThis, 'PerformanceObserver');
let notify!: PerformanceObserverCallback;
let enabled = true, reported = 0, didObserve = false;
class FakePerformanceObserver {
  static supportedEntryTypes = ['long-animation-frame'];
  constructor(callback: PerformanceObserverCallback) { notify = callback; }
  observe(options: PerformanceObserverInit) { assert.equal(options.type, 'long-animation-frame'); didObserve = true; }
  disconnect() {}
}
try {
  Object.defineProperty(globalThis, 'PerformanceObserver', { value: FakePerformanceObserver, configurable: true });
  profiler.observeLongFrames(() => enabled, () => reported++);
  assert.ok(didObserve);
  assert.ok(profiler.snapshot().longFrames.supported);
  const deliverFrame = (startTime: number) => notify({ getEntries: () => [{ startTime, duration: 75, scripts: [{ forcedStyleAndLayoutDuration: 9 }] }] } as unknown as PerformanceObserverEntryList, {} as PerformanceObserver);
  deliverFrame(0);
  assert.equal(reported, 0, 'Entries from before the match/reset must be excluded');
  enabled = false; deliverFrame(performance.now());
  assert.equal(reported, 0, 'Paused/hidden/preparing frames must not be reported');
  enabled = true; deliverFrame(performance.now());
  assert.equal(reported, 1);
  assert.equal(profiler.snapshot().longFrames.maxForcedStyleLayoutMs, 9);
  FakePerformanceObserver.supportedEntryTypes = [];
  const unsupported = new FrameWorkProfiler();
  unsupported.observeLongFrames(() => true, () => assert.fail('Unsupported API must remain inactive'));
  assert.equal(unsupported.snapshot().longFrames.supported, false);
} finally {
  if (originalObserver) Object.defineProperty(globalThis, 'PerformanceObserver', originalObserver);
  else Reflect.deleteProperty(globalThis, 'PerformanceObserver');
}
console.log(JSON.stringify({ result: 'PASS', hudFunctionsWithoutLayoutReads: hotFunctions.length, preparedShaderLightCounts: counts,
  checks: ['resize cache', 'CSS matrix alignment', 'shader keys', 'warmup cleanup/failure/concurrency', 'bounded CPU timings', 'forced-layout attribution'] }));
