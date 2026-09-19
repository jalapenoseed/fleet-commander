import { mountCommandShell } from './dist/command-shell.js';
import { mountSimulationLab } from './dist/simulation-lab-ui.js';
import { mountDirector } from './dist/director-ui.js';
import { mountArena } from './dist/arena-ui.js';
import { mountArtStudio } from './dist/art-studio.js';
import { mountNerdLab } from './dist/nerd-lab-ui.js';
import * as fleetScoreModule from './dist/fleet-score.js';
import * as fleetEffectsModule from './dist/fleet-effects.js';
import * as fleetEffectsUIModule from './dist/fleet-effects-ui.js';
import * as fleetHelpModule from './dist/fleet-help.js';
import * as wordSequenceModule from './dist/word-sequence.js';
import * as rhythm from './dist/swarm-rhythm.js';
import * as presets from './dist/commander-presets.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import * as core from './dist/fleet-commander-core.js';
import * as palette from './dist/beacon-palette.js';
import * as program from './dist/swarm-program.js';
import * as storage from './dist/fleet-commander-storage.js';
const dom = new JSDOM(fs.readFileSync('dist/index.html', 'utf8'), {
    url: 'https://gridrunner.test/commander.html',
  }),
  w = dom.window,
  doc = w.document;
w.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {} });
w.HTMLCanvasElement.prototype.setPointerCapture = () => {};
class CommanderRenderer {
  constructor(host, { onStatus }) {
    this.host = host;
    this.kind = 'Test renderer';
    this.renderer = null;
    onStatus(this.kind);
  }
  setView() {}
  render() {}
  dispose() {}
}
Object.assign(globalThis, {
  document: doc,
  window: w,
  localStorage: w.localStorage,
  Event: w.Event,
  MutationObserver: w.MutationObserver,
  matchMedia: () => ({ matches: false }),
});
const ctx = vm.createContext({
  mountCommandShell,
  mountSimulationLab,
  mountDirector,
  mountArena,
  mountArtStudio,
  mountNerdLab,
  ...fleetScoreModule,
  ...fleetEffectsModule,
  ...fleetEffectsUIModule,
  ...fleetHelpModule,
  ...wordSequenceModule,
  ...rhythm,
  ...presets,
  ...core,
  ...palette,
  ...program,
  ...storage,
  CommanderRenderer,
  document: doc,
  window: w,
  localStorage: w.localStorage,
  sessionStorage: w.sessionStorage,
  matchMedia: () => ({ matches: false }),
  console,
  performance,
  URL,
  Blob,
  setTimeout,
  requestAnimationFrame() {},
});
const stripStaticImports = (source) =>
  source.replace(/^import\s+(?:[\s\S]*?\s+from\s+)?['"][^'"]+['"];\n/gm, '');
vm.runInContext(stripStaticImports(fs.readFileSync('dist/fleet-commander.js', 'utf8')), ctx);
const run = (code) => vm.runInContext(code, ctx),
  by = (id) => doc.getElementById(id),
  flush = () => new Promise((resolve) => setImmediate(resolve));
async function click(id) {
  assert(by(id), id);
  by(id).click();
  await flush();
}
function input(id, value, event = 'change') {
  by(id).value = value;
  by(id).dispatchEvent(new w.Event(event, { bubbles: true }));
}
assert.equal(by('selectedDrone').options.length, 100);
await click('launch');
run('for(let i=0;i<600;i++)sim.step(1/60);updateReadouts()');
assert.equal(by('active').textContent, '100 / 100');
await click('pause');
const pos = run('JSON.stringify(sim.drones.map(d=>d.pos))');
run('sim.step(.05)');
assert.equal(run('JSON.stringify(sim.drones.map(d=>d.pos))'), pos);
await click('pause');
input('programMode', 'script');
input('script', 'select white\nassign bike\nselect all\nformation ring');
await click('applyProgram');
assert.equal(run('sim.program.mode'), 'script');
input('script', 'select nowhere\nformation ring');
await click('applyProgram');
assert(by('notice').classList.contains('error'));
assert(!run('sim.program.source.includes("nowhere")'));
input('script', 'select all\nformation ring');
await click('applyProgram');
input('commanderPreset', 'dual');
await click('loadPreset');
assert.equal(by('shape').value, 'double-orbit');
assert.equal(run('sim.program.mode'), 'script');
await click('applyProgram');
assert.equal(run('sim.program.settings.shape'), 'double-orbit');
input('commanderPreset', 'beat');
await click('loadPreset');
input('bpm', '96');
await click('beatDance');
await click('applyProgram');
assert.equal(run('sim.program.settings.bpm'), 96);
assert(run('sim.program.settings.beatSync'));
assert.equal(run('sim.program.settings.show'), 'dance');
assert.equal(run('sim.program.settings.offset'), 0);
await click('chooseDrawing');
assert.equal(by('shape').value, 'drawing');
assert(!by('drawInputs').hidden);
for (const key of [
  ' ',
  'ArrowRight',
  'ArrowRight',
  ' ',
  'ArrowDown',
  ' ',
  'Enter',
  'ArrowLeft',
  ' ',
])
  by('drawPad').dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true }));
assert.equal(run('strokes.length'), 2);
await click('applyProgram');
assert.equal(run('sim.program.strokes.length'), 2);
input('paintGroup', 'scouts');
doc.querySelector('[aria-label="Paint group White"]').click();
await flush();
assert(run('sim.drones.filter(d=>d.type==="scout").every(d=>d.color==="white")'));
input('fleetName', 'My hundred');
await click('saveFleet');
assert.equal(storage.readFleetLibrary(w.localStorage)[0].roster.length, 100);
assert.equal(storage.readFleetLibrary(w.localStorage)[0].program.strokes.length, 2);
assert.equal(storage.readFleetLibrary(w.localStorage)[0].program.settings.bpm, 96);
assert(storage.readFleetLibrary(w.localStorage)[0].program.settings.beatSync);
input('count', '6');
await click('build');
assert.equal(run('sim.drones.length'), 6);
assert.equal(run('sim.drones.filter(d=>d.type==="relay").length'), 2);
input('savedFleets', 'My hundred');
await click('loadFleet');
assert.equal(run('sim.drones.length'), 100);
assert.equal(run('strokes.length'), 2);
assert.equal(run('sim.drones.filter(d=>d.type==="scout"&&d.color==="white").length'), 67);
input('count', '10001');
await click('build');
assert.equal(run('sim.drones.length'), 100);
assert.match(by('notice').textContent, /0 to 10,000/);
input('gameMode', 'party');
input('players', 'Ada\nBo');
await click('startGame');
assert.equal(run('sim.challenge.mode'), 'party');
assert(by('rosterControls').disabled);
assert(by('importFleet').disabled);
run('for(let i=0;i<91*60;i++)sim.step(1/60);updateReadouts()');
assert(!by('nextPlayer').hidden);
await click('nextPlayer');
assert.equal(run('sim.challenge.players[sim.challenge.turn]'), 'Bo');
await click('freeFlight');
assert(!by('rosterControls').disabled);
// Use the same visible controls for the new fleet and word-sequence workflow.
input('count', '2000');
await click('build');
assert.equal(run('sim.drones.length'), 2000);
doc.querySelector('[data-task="words"]').click();
assert.equal(by('view').value, 'front');
assert(!by('wordInputs').hidden);
assert(by('formationInputs').hidden);
await click('editSequence');
assert(by('sequenceDialog').open);
input('sequenceWords', 'HELLO\nWORLD\nGRID');
input('sequenceHold', '9');
input('sequenceTransition', '12');
await click('runSequence');
assert(!by('sequenceDialog').open);
assert.equal(run('sim.program.settings.sequenceWords'), 'HELLO\nWORLD\nGRID');
assert.equal(run('sim.drones.length'), 2000);
assert(run('sim.program.settings.sequenceEnabled'));
run('for(let i=0;i<265;i++)sim.step(.05);updateReadouts()');
assert.equal(by('active').textContent, '2000 / 2000');
await click('pause');
const stopped = run('sim.program.time');
run('sim.step(.05)');
assert.equal(run('sim.program.time'), stopped);
await click('editSequence');
input('sequenceWords', 'ONE');
await click('runSequence');
assert(by('sequenceDialog').open);
assert.match(by('sequenceError').textContent, /2–16/);
assert.equal(run('sim.program.settings.sequenceWords'), 'HELLO\nWORLD\nGRID');
input('sequenceWords', 'HELLO\nWORLD');
await click('closeSequence');
await click('programHelp');
assert(by('fleetHelpDialog').open);
[...by('fleetHelpDialog').querySelectorAll('button')]
  .find((b) => b.textContent === 'Build up to 10,000 aircraft')
  .click();
assert(!by('tab-fleet').hidden);
assert.equal(doc.activeElement.id, 'count');
input('fleetName', 'Two thousand');
await click('saveFleet');
assert.equal(
  storage.readFleetLibrary(w.localStorage).find((f) => f.name === 'Two thousand').roster.length,
  2000,
);
await click('editEffects');
assert(by('effectsDialog').open);
input('field2', 'vortex');
input('field3', 'wave');
input('strength2', '5');
input('phaseVariance', '1.5');
await click('closeEffects');
assert(!by('effectsDialog').open);
assert(by('effectsStatus').textContent.includes('vortex'));
await click('applyProgram');
assert.equal(run('sim.program.settings.field2'), 'vortex');
assert.equal(run('sim.program.settings.field3'), 'wave');
assert.equal(run('sim.program.settings.phaseVariance'), 1.5);
input('programMode', 'script');
input('script', 'bad command');
input('formulaX', 'bad formula');
await click('clearEffects');
assert.equal(by('programMode').value, 'manual');
assert.equal(by('pattern').value, 'none');
assert.equal(by('field2').value, 'none');
assert.equal(by('field3').value, 'none');
await click('applyProgram');
assert(!by('notice').classList.contains('error'));
assert.equal(run('sim.program.settings.variance'), 0);
assert.equal(run('sim.program.settings.shape'), 'word', 'clear preserves the selected formation');
// Boids controls survive apply/save and the dedicated reset leaves other layers intact.
input('count', '100');
await click('build');
await click('editEffects');
input('boids', 'on');
input('boidCohesion', '1.2', 'input');
input('field2', 'wave');
await click('closeEffects');
await click('applyProgram');
assert.equal(run('sim.program.settings.boids'), 'on');
assert.equal(run('sim.program.settings.boidCohesion'), 1.2);
assert.match(by('effectsStatus').textContent, /Boids: on/);
input('fleetName', 'Flocking');
await click('saveFleet');
assert.equal(
  storage.readFleetLibrary(w.localStorage).find((f) => f.name === 'Flocking').program.settings
    .boidCohesion,
  1.2,
);
await click('editEffects');
doc.querySelector('[data-boids-reset]').click();
assert.equal(by('boids').value, 'none');
assert.equal(by('field2').value, 'wave');
await click('closeEffects');
await click('applyProgram');
assert.equal(run('sim.program.settings.boids'), 'none');
assert.equal(run('sim.program.settings.field2'), 'wave');
input('commanderPreset', 'flock');
await click('loadPreset');
await click('applyProgram');
assert.equal(run('sim.program.settings.boids'), 'on');
await click('clearEffects');
await click('applyProgram');
assert.equal(run('sim.program.settings.boids'), 'none');
// Empty fleets, larger capacity and battery test controls are actual UI flows.
input('count', '0');
await click('build');
run('updateReadouts()');
assert.equal(run('sim.drones.length'), 0);
assert.equal(by('active').textContent, '0 / 0');
assert(!by('emptyPrompt').hidden);
assert(by('updateDrone').disabled);
await click('launch');
input('gameMode', 'hunt');
await click('startGame');
assert.match(by('notice').textContent, /at least one/);
input('count', '5000');
await click('build');
assert.equal(run('sim.drones.length'), 5000);
assert.equal(by('selectedDrone').options.length, 5000);
input('count', '10000');
await click('build');
assert.equal(run('sim.drones.length'), 10000);
assert.equal(by('selectedDrone').options.length, 10000);
input('fleetName', 'Ten thousand');
await click('saveFleet');
assert.equal(
  storage.readFleetLibrary(w.localStorage).find((f) => f.name === 'Ten thousand').roster.length,
  10000,
);
input('count', '6');
await click('build');
assert.equal(run('sim.fleet.options.unlimited'), false);
input('batteryDrain', '10');
assert.equal(run('sim.fleet.options.batteryDrain'), 10);
await click('launch');
run('for(let i=0;i<200;i++)sim.step(.05)');
input('testCharge', '0');
await click('setCharge');
run('for(let i=0;i<500;i++)sim.step(.05);updateReadouts()');
assert.equal(run('sim.metrics().landed'), 6);
await click('recharge');
assert(run('sim.drones.every(d=>d.battery===100)'));
await click('launch');
run('sim.step(.05)');
assert(run('sim.drones.some(d=>d.mode==="FLY")'));
// Actual Combat controls must restore the show roster, even after a reset or page close.
async function settleCombat() {
  for (let i = 0; i < 300 && run('arena.combat.loading'); i++)
    await new Promise((resolve) => setTimeout(resolve, 10));
  assert(!run('arena.combat.loading'), 'physics initialization completed');
}
const showBeforeCombat = run('JSON.stringify(sim.snapshot())');
await click('prepareCombat');
await settleCombat();
run('arena.update()');
assert(run('arena.combat.enabled'));
assert.equal(by('friendlyAlive').textContent, '3');
assert.equal(by('enemyAlive').textContent, '3');
assert.equal(by('friendlyFlying').textContent, 'FRIENDLY 3/3 flying');
assert.equal(by('enemyFlying').textContent, 'HOSTILE 3/3 flying');
assert(!by('friendlyFlying').closest('.team-survival').hidden);
input('friendlyFormation', 'shield');
assert.equal(run('arena.combat.formations.friendly'), 'shield');
run('sim.drones[0].cooldown=0');
await click('dropPayload');
assert.equal(run('arena.combat.payloads.length'), 1);
await click('saveFleet');
assert.match(by('notice').textContent, /Exit combat/);
await click('exportFleet');
assert.match(by('notice').textContent, /Exit combat/);
await click('engageCombat');
assert(run('arena.combat.engaged'));
await click('ceaseCombat');
assert(!run('arena.combat.engaged'));
await click('exitCombat');
assert.equal(run('JSON.stringify(sim.snapshot())'), showBeforeCombat);
await click('newSkirmish');
await settleCombat();
run('arena.update()');
assert.equal(run('sim.drones.length'), 24);
assert.equal(by('friendlyAlive').textContent, '12');
assert.equal(by('commandGroup').querySelector('[value="cyan"]').textContent, 'Cyan · 12');
run('arena.combat.damage(sim.drones[0],100)');
run('arena.update()');
assert.equal(by('friendlyFlying').textContent, 'FRIENDLY 11/12 flying');
assert.equal(by('enemyFlying').textContent, 'HOSTILE 12/12 flying');
assert.match(by('friendlyLosses').textContent, /1 down/);
await click('resetCombat');
await settleCombat();
run('arena.update()');
assert(run('sim.drones.every(d=>d.health===100)'));
assert.equal(run('arena.combat.payloads.length'), 0);
assert(!run('arena.combat.engaged'));
assert.equal(by('friendlyFlying').textContent, 'FRIENDLY 12/12 flying');
assert.match(by('friendlyLosses').textContent, /0 down/);
await click('freeFlight');
assert(!run('arena.combat.enabled'));
assert.equal(run('JSON.stringify(sim.snapshot())'), showBeforeCombat);
assert.equal(by('selectedDrone').options.length, 6);
assert(by('friendlyFlying').closest('.team-survival').hidden);
// One-tap presets, live tuning and repeated rounds all preserve the same original show.
by('battleSound').checked = false;
input('battlePreset', 'furball');
assert.equal(by('battleCount').value, '32');
assert.equal(run('arena.combat.tactics.friendly'), 'interceptor');
assert(!by('autoPayloads').checked);
await click('startAIBattle');
await settleCombat();
run('arena.update()');
assert(run('arena.combat.engaged'));
assert.equal(run('sim.drones.length'), 32);
input('combatSpeed', '0.65', 'input');
input('combatDamage', '0.25', 'input');
input('friendlyTactic', 'bomber');
assert.equal(run('arena.combat.settings.speed'), 0.65);
assert.equal(run('arena.combat.settings.damage'), 0.25);
assert.equal(run('arena.combat.tactics.friendly'), 'bomber');
assert.equal(by('battlePreset').value, 'custom');
const selectedBefore = run('selected');
await click('nextCombatDrone');
assert.notEqual(run('selected'), selectedBefore);
run(
  'renderer.view="fpv";arena.combat.damage(sim.drones.find(d=>d.id===selected),100);arena.tick()',
);
assert(
  run('sim.drones.find(d=>d.id===selected).mode==="FLY"'),
  'auto FPV skips a destroyed subject',
);
by('repeatBattle').checked = true;
run('arena.combat.configure({roundSeconds:.1});for(let i=0;i<10;i++)sim.step(1/60)');
assert(run('!!arena.combat.winner'));
run('sim.running=false;arena.combat.time+=20;arena.tick()');
assert(!run('arena.combat.engaged'), 'paused battle does not restart');
run('sim.running=true;arena.tick()');
await flush();
await settleCombat();
run('arena.update()');
assert(run('arena.combat.engaged'));
assert.match(by('combatStatus').textContent, /Round 2/);
assert.equal(run('sim.drones.length'), 32);
assert.equal(run('JSON.stringify(arena.combat.saved)'), showBeforeCombat);
await click('ceaseCombat');
assert(!by('repeatBattle').checked);
await click('exitCombat');
assert.equal(run('JSON.stringify(sim.snapshot())'), showBeforeCombat);
assert.equal(JSON.parse(w.localStorage.getItem('fleetcommander.arena.v1')).settings.speed, 0.65);
input('labPlanet', 'moon');
input('labRotor', 'arcade');
await click('applyLab');
assert.equal(run('sim.lab.planet'), 'moon');
await click('newSkirmish');
await settleCombat();
run('for(let i=0;i<150;i++){sim.step(1/60);simulationLab.tick();}');
await click('saveRecentReplay');
assert(by('replayList').querySelector('button'));
const liveReplayBefore = run('JSON.stringify(sim.drones)');
by('replayList').querySelector('button').click();
assert(run('simulationLab.replaying'));
assert.equal(run('sim.running'), false);
run('for(let i=0;i<50;i++)simulationLab.renderScene(1/60)');
assert.equal(run('JSON.stringify(sim.drones)'), liveReplayBefore);
await click('exitReplay');
assert(!run('simulationLab.replaying'));
assert(run('sim.running'));
await click('exitCombat');
input('labPlanet', 'earth');
await click('applyLab');
assert(doc.querySelector('[data-tab="squads"]'));
assert(doc.querySelector('.command-rail'));
assert(by('findControl'));
assert(by('tab-nerd'));
assert(
  ['combat', 'bestfight', 'survivor'].every((value) =>
    [...by('view').options].some((o) => o.value === value),
  ),
);
assert.deepEqual(
  [...by('replaySpeed').options].map((o) => Number(o.value)),
  [0.125, 0.25, 0.5, 1, 2],
);
await click('use80085');
assert.match(by('numberReadout').textContent, /80085.*0x138D5/);
input('weatherPreset', 'storm');
assert.equal(run('renderer.weather.settings.rain'), 1);
assert.equal(run('renderer.weather.settings.lightning'), 0.72);
input('weatherPreset', 'clear');
await click('newSkirmish');
await settleCombat();
w.dispatchEvent(new w.PageTransitionEvent('pagehide', { persisted: true }));
assert(run('arena.combat.enabled'), 'bfcache must preserve the running scene');
assert.equal(
  JSON.stringify(storage.parseFleetFile(w.sessionStorage.getItem('fleetcommander.working.v1'))),
  showBeforeCombat,
);
w.dispatchEvent(new w.PageTransitionEvent('pagehide'));
assert(!run('arena.combat.enabled'));
assert.equal(
  JSON.stringify(storage.parseFleetFile(w.sessionStorage.getItem('fleetcommander.working.v1'))),
  showBeforeCombat,
);
console.log(
  'PASS: actual Commander UI, large rosters, shows, saves, battery tests, Combat prepare/engage/drop/reset/exit, save guards, faction controls and original show restoration on page close.',
);
