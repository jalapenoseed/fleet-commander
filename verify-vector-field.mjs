// DOM/simulation regression checks. WebGL rendering and real device gestures
// still need visual/device QA; the renderer below is deliberately a test double.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import * as Three from './dist/three.js';

const html = fs.readFileSync('dist/labs/vector-field/index.html', 'utf8');
const source = fs
  .readFileSync('dist/labs/vector-field/main.js', 'utf8')
  .replace(/^import .*?;\s*/, '');
const dom = new JSDOM(html, { pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
const { document } = window;
const $ = (id) => document.getElementById(id);
let render;
class Renderer {
  constructor() {
    this.shadowMap = {};
    render = this;
  }
  setPixelRatio() {}
  setSize(width, height) {
    this.size = [width, height];
  }
  render(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
  }
}
let elapsed = 0;
class Clock {
  getDelta() {
    elapsed += 1 / 60;
    return 1 / 60;
  }
  get elapsedTime() {
    return elapsed;
  }
}
let nextFrame;
let observedResize;
window.THREE = { ...Three, WebGLRenderer: Renderer, Clock };
window.matchMedia = () => ({ matches: false });
window.ResizeObserver = class {
  constructor(cb) {
    observedResize = cb;
  }
  observe() {}
};
window.requestAnimationFrame = (cb) => {
  nextFrame = cb;
};
let rect = { left: 0, top: 70, width: 390, height: 550 };
$('viewport').getBoundingClientRect = () => rect;
$('scene').getBoundingClientRect = () => rect;
$('scene').setPointerCapture = () => {};
$('scene').releasePointerCapture = () => {};
$('scene').hasPointerCapture = () => false;
vm.runInContext(source, dom.getInternalVMContext());
const frames = (n = 20) => {
  for (let i = 0; i < n; i++) nextFrame();
};
const fire = (id, type, props = {}) => {
  const event = new window.Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, props);
  $(id).dispatchEvent(event);
  return event;
};
const agents = render.scene.children.filter((o) => o.geometry?.type === 'ConeGeometry');
const target = render.scene.children.find((o) =>
  o.children.some((c) => c.geometry?.type === 'OctahedronGeometry'),
);
assert.equal(agents.length, 100);
assert.deepEqual(render.size, [390, 550]);
assert.equal($('controlsToggle').getAttribute('aria-expanded'), 'false');
assert.equal($('inspector').inert, true);
$('controlsToggle').click();
assert.equal($('inspector').inert, false);
$('closeControls').click();
assert.equal(document.activeElement, $('controlsToggle'));
frames(90);
assert(Number($('speedStat').textContent) > 0);
const moving = agents[0].position.clone();
frames();
assert(agents[0].position.distanceTo(moving) > 0);
$('pause').click();
const stopped = agents[0].position.clone();
frames();
assert.equal(agents[0].position.distanceTo(stopped), 0);
assert.equal($('runState').textContent, 'Paused');
$('reset').click();
assert.equal($('collisionStat').textContent, '0');
assert(agents[0].position.distanceTo(stopped) > 0, 'Reset must update meshes even while paused');
$('pause').click();
assert.equal($('runState').textContent, 'Running');
$('preset').value = 'gather';
fire('preset', 'change');
assert.equal($('vortex').value, '0');
assert.equal($('vortexOut').textContent, '0.0');
$('attraction').value = '7';
fire('attraction', 'input');
assert.equal($('preset').value, 'custom');
$('restore').click();
assert.equal($('attraction').value, '3.2');
assert.equal($('dampingOut').textContent, '0.85');
document.querySelector('[data-mode=learn]').click();
assert(!$('lesson').classList.contains('hidden'));
document.querySelector('[data-mode=dev]').click();
frames();
assert.equal(JSON.parse($('devPanel').textContent).agents, 100);
fire('vectors', 'change');
$('vectors').checked = false;
fire('vectors', 'change');
const arrows = render.scene.children.find((o) => o.children[0]?.type === 'ArrowHelper');
assert.equal(arrows.visible, false);
$('trails').checked = false;
fire('trails', 'change');
const trails = render.scene.children.find(
  (o) => o.type === 'LineSegments' && o.geometry.attributes.color,
);
assert.equal(trails.visible, false);
$('trails').checked = true;
fire('trails', 'change');
assert.equal(trails.visible, true);
$('viewTop').click();
assert.equal($('viewTop').getAttribute('aria-pressed'), 'true');
$('placeTarget').click();
fire('scene', 'pointerdown', { pointerId: 1, clientX: 230, clientY: 330 });
fire('scene', 'pointerup', { pointerId: 1, clientX: 230, clientY: 330 });
assert.equal($('placeTarget').getAttribute('aria-pressed'), 'false');
assert(Math.hypot(target.position.x, target.position.z) <= 29);
const targetBeforeOrbit = target.position.clone();
fire('scene', 'pointerdown', { pointerId: 1, clientX: 170, clientY: 200 });
fire('scene', 'pointermove', { pointerId: 1, clientX: 250, clientY: 220 });
fire('scene', 'pointercancel', { pointerId: 1 });
assert.equal(target.position.distanceTo(targetBeforeOrbit), 0, 'Orbit must not move target');
$('viewReset').click();
const beforePinch = render.camera.position.length();
fire('scene', 'pointerdown', { pointerId: 1, clientX: 100, clientY: 220 });
fire('scene', 'pointerdown', { pointerId: 2, clientX: 200, clientY: 220 });
fire('scene', 'pointermove', { pointerId: 2, clientX: 280, clientY: 220 });
assert(render.camera.position.length() < beforePinch);
fire('scene', 'pointerup', { pointerId: 1 });
fire('scene', 'pointerup', { pointerId: 2 });
for (const [width, height] of [
  [844, 240],
  [1280, 650],
  [360, 420],
]) {
  rect = { ...rect, width, height };
  observedResize();
  assert.equal(render.camera.aspect, width / height);
  assert.deepEqual(render.size, [width, height]);
}
frames(300);
for (const agent of agents) {
  assert(Number.isFinite(agent.position.x) && Number.isFinite(agent.position.z));
  assert(Math.hypot(agent.position.x, agent.position.z) < 30);
}
const paths = trails.geometry.attributes.position.array;
assert([...paths].every(Number.isFinite));
assert(
  paths.some((value, i) => i % 6 === 0 && Math.abs(value - paths[i + 3]) > 0.001),
  'Trails contain real path segments',
);
console.log(
  'PASS: 100-agent simulation, pause/reset, presets, layers, Toy/Learn/Dev, inspector, target/orbit separation, pinch zoom, camera resize and finite trail buffers. WebGL/device visual QA remains separate.',
);
dom.window.close();
