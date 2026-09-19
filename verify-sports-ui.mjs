import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
const dom = new JSDOM(fs.readFileSync('dist/sports.html', 'utf8'), {
  url: 'http://localhost/sports.html',
  pretendToBeVisual: true,
});
const { window } = dom;
let callback,
  time = 0;
const noop = () => {};
const ctx = new Proxy({}, { get: () => noop, set: () => true });
window.HTMLCanvasElement.prototype.getContext = () => ctx;
Object.assign(globalThis, {
  window,
  document: window.document,
  localStorage: window.localStorage,
  requestAnimationFrame: (fn) => {
    callback = fn;
  },
});
class TestWorker {
  static last;
  constructor() {
    TestWorker.last = this;
  }
  postMessage(data) {
    this.message = data;
  }
  terminate() {
    this.terminated = true;
  }
}
globalThis.Worker = TestWorker;
await import('./dist/sports-ui.js');
const $ = (id) => document.getElementById(id),
  click = (id) => $(id).click(),
  change = (id, value) => {
    $(id).value = value;
    $(id).dispatchEvent(new window.Event('change'));
  };
assert.equal($('positionRows').children.length, 5);
assert.equal($('sportTitle').textContent, 'Soccer');
change('duration', '30');
change('speed', '16');
click('playMatch');
for (let i = 0; i < 25; i++) {
  time += 100;
  callback(time + performance.now());
}
assert.equal($('historyCount').textContent, '1 saved');
assert.equal(JSON.parse(localStorage.getItem('fleetcommander.sports.v1')).records.length, 1);
click('replayLast');
assert.equal($('scrub').disabled, false);
$('scrub').value = '100';
$('scrub').dispatchEvent(new window.Event('input'));
assert.equal($('replayTime').textContent, '00:20');
click('pauseMatch');
for (let i = 0; i < 100; i++) {
  time += 100;
  callback(time + performance.now());
}
assert.equal($('historyCount').textContent, '1 saved', 'replay must not add learning');
change('mode', 'football');
document.querySelector('[data-panel="playbook"]').click();
click('loadLayout');
click('applyFormation');
assert.match($('status').textContent, /Lineup saved/);
assert(JSON.parse(localStorage.getItem('fleetcommander.sports.lineups.v1')).football[0]);
$('positionRows').querySelector('input').value = '999';
click('applyFormation');
assert.match($('status').textContent, /X 6/);
assert.equal(
  JSON.parse(localStorage.getItem('fleetcommander.sports.lineups.v1')).football[0][0][0],
  9,
);
click('compareBatch');
assert($('playMatch').disabled);
assert.equal(TestWorker.last.message.kind, 'compare');
click('stopBatch');
assert.equal(TestWorker.last.message.type, 'stop');
TestWorker.last.onmessage({ data: { type: 'done', canceled: true } });
assert(!$('playMatch').disabled);
assert(TestWorker.last.terminated);
click('resetLearning');
click('resetLearning');
assert.equal($('historyCount').textContent, '0 saved');
console.log(
  'PASS sports UI: complete/save once, replay seek without relearning, lineup validation and persistence, batch cancellation controls, reset.',
);
window.close();
