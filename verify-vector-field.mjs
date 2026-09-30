// DOM and Three.js object checks with a stub GPU renderer; not visual/device QA.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { JSDOM, VirtualConsole } from 'jsdom';
import * as THREE from './dist/three.js';
import * as simulation from './dist/labs/vector-field/simulation.js';
const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (e) => errors.push(e));
const dom = new JSDOM(fs.readFileSync('dist/labs/vector-field/index.html', 'utf8'), {
  url: 'http://localhost/labs/vector-field/',
  pretendToBeVisual: true,
  runScripts: 'outside-only',
  virtualConsole,
});
const { window } = dom,
  { document } = window;
const $ = (id) => document.getElementById(id);
let render;
class Renderer {
  constructor() {
    this.shadowMap = {};
    render = this;
  }
  setPixelRatio() {}
  setSize(w, h) {
    this.size = [w, h];
  }
  render(s, c) {
    this.scene = s;
    this.camera = c;
    s.updateMatrixWorld();
    c.updateMatrixWorld();
  }
}
class Clock {
  getDelta() {
    return 1 / 60;
  }
}
let nextFrame, resize;
Object.assign(window, simulation, {
  THREE: { ...THREE, WebGLRenderer: Renderer, Clock },
  matchMedia: () => ({ matches: false }),
  ResizeObserver: class {
    constructor(cb) {
      resize = cb;
    }
    observe() {}
  },
});
window.requestAnimationFrame = (cb) => {
  nextFrame = cb;
};
let rect = { left: 0, top: 70, width: 390, height: 550 };
$('viewport').getBoundingClientRect = () => rect;
$('scene').getBoundingClientRect = () => rect;
$('scene').setPointerCapture = () => {};
$('scene').hasPointerCapture = () => false;
const source = fs
  .readFileSync('dist/labs/vector-field/main.js', 'utf8')
  .replace(/^import[\s\S]*?from ['"].*?['"];?\s*/gm, '');
vm.runInContext(source, dom.getInternalVMContext());
const lab = vm.runInContext('lab', dom.getInternalVMContext());
const frames = (n = 15) => {
  for (let i = 0; i < n; i++) nextFrame();
};
const fire = (id, type, props = {}) => {
  const e = new window.Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, props);
  $(id).dispatchEvent(e);
};
const change = (id, value) => {
  $(id).value = value;
  fire(id, 'change');
};
const tap = () => {
  fire('scene', 'pointerdown', { pointerId: 1, clientX: 195, clientY: 345 });
  fire('scene', 'pointerup', { pointerId: 1, clientX: 195, clientY: 345 });
};
assert.equal(lab.agents.length, 44);
assert.equal($('inspector').inert, true);
$('controlsToggle').click();
assert.equal($('inspector').inert, false);
frames();
assert($('activeStat').textContent.includes('/44'));
$('pause').click();
const x = lab.agents[0].x;
frames();
assert.equal(lab.agents[0].x, x);
$('reset').click();
assert.equal(lab.summary().down, 0);
$('pause').click();
$('viewTop').click();
$('addTarget').click();
tap();
assert.equal(lab.targets.length, 4);
change('fieldType', 'jammer');
$('addField').click();
tap();
assert.equal(lab.fields.length, 1);
assert.equal(lab.fields[0].type, 'jammer');
$('radius').value = '7';
fire('radius', 'input');
assert.equal(lab.fields[0].r, 7);
$('removeField').click();
assert.equal(lab.fields.length, 0);
change('role', 'striker');
change('squadFormation', 'grid');
change('play', 'patrol');
assert.equal(lab.squads[0].role, 'striker');
assert.equal(lab.squads[0].formation, 'grid');
assert.equal(lab.squads[0].play, 'patrol');
$('addRule').click();
assert.equal(lab.squads[0].rules.length, 1);
$('demoTimeline').click();
assert.equal(lab.squads[0].cues.length, 4);
$('timelineToggle').click();
frames(60);
assert(lab.squads[0].timelineTime > 0.5);
$('playhead').value = '16';
fire('playhead', 'input');
assert.equal(lab.squads[0].timeline, false);
assert.equal(lab.squads[0].formation, 'grid');
$('saveScript').click();
assert(window.localStorage.getItem('fleet-field-script-v2'));
lab.squads[0].rules = [];
$('loadScript').click();
assert.equal(lab.squads[0].rules.length, 1);
$('scriptSource').value = '{"rules": [{"when": "execute", "then": "anything"}], "cues": []}';
$('applyScript').click();
assert($('scriptError').textContent.includes('Unknown'));
assert.equal(lab.squads[0].rules.length, 1, 'Invalid script is atomic');
change('spawnTeam', 'red');
$('spawnCount').value = '12';
$('spawnSquad').click();
tap();
assert.equal(lab.squads.length, 3);
assert.equal(lab.agents.length, 56);
assert.equal(lab.squads[2].team, 'red');
$('removeSquad').click();
assert.equal(lab.squads.length, 2);
assert.equal(lab.agents.length, 44);
change('scenario', 'skirmish');
$('loadScenario').click();
assert(lab.combat);
assert.equal(lab.squads.length, 4);
assert.equal(lab.agents.length, 80);
$('combat').checked = false;
fire('combat', 'change');
assert.equal(lab.combat, false);
for (const name of ['fields', 'scripts', 'forces', 'learn', 'squads']) {
  document.querySelector(`[data-pane=${name}]`).click();
  assert.equal(document.querySelector(`[data-panel=${name}]`).hidden, false);
}
$('viewReset').click();
const before = render.camera.position.length();
fire('scene', 'pointerdown', { pointerId: 1, clientX: 100, clientY: 200 });
fire('scene', 'pointerdown', { pointerId: 2, clientX: 200, clientY: 200 });
fire('scene', 'pointermove', { pointerId: 2, clientX: 280, clientY: 200 });
assert(render.camera.position.length() < before);
fire('scene', 'pointercancel', { pointerId: 1 });
fire('scene', 'pointercancel', { pointerId: 2 });
for (const [width, height] of [
  [360, 500],
  [844, 220],
  [1280, 700],
]) {
  rect = { ...rect, width, height };
  resize();
  assert.deepEqual(render.size, [width, height]);
  assert.equal(render.camera.aspect, width / height);
}
frames(60);
assert.equal(errors.length, 0, errors.map((e) => e.message).join('\n'));
assert.equal(
  new Set([...document.querySelectorAll('[id]')].map((e) => e.id)).size,
  document.querySelectorAll('[id]').length,
  'IDs are unique',
);
console.log(
  'PASS: app initializes, tabs/inspector, pause/reset, target/field placement and removal, field editing, squad orders/deployment/removal, rule/timeline editor, scrubbing, local script save/load, invalid script recovery, scenario loading, combat switch and camera gestures/resizing. GPU rendering still requires device QA.',
);
dom.window.close();
