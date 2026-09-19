import assert from 'node:assert/strict';
import {
  PLANETS,
  LAB_DEFAULTS,
  labSettings,
  massLedger,
  energyBudget,
  freeFlightDrain,
} from './dist/planet-physics.js';
import { ReplayBuffer, replayScene, validateReplay } from './dist/replay-buffer.js';
import { journalData, recommendScenario } from './dist/scenario-journal.js';
import { CommanderSimulation, createCommanderFleet } from './dist/fleet-commander-core.js';
import { CombatSimulation } from './dist/combat-simulation.js';
import { BattleEffects } from './dist/battle-effects.js';
import { DirectorEnvironment } from './dist/director-environment.js';
import * as T from './dist/three.js';

const budget = energyBudget();
assert(Math.abs(budget.mass - 0.674) < 1e-9);
assert.equal(budget.watts, 148);
assert(Math.abs(budget.minutes - (45 / 148) * 60) < 1e-9);
assert.equal(massLedger().length, 7);
assert.equal(energyBudget({ ...LAB_DEFAULTS, planet: 'moon' }).mass, budget.mass);
assert(energyBudget({ ...LAB_DEFAULTS, planet: 'moon' }).weight < budget.weight / 5);
assert.equal(
  freeFlightDrain(
    { ...LAB_DEFAULTS, energyModel: true, batteryWh: 100, flightWatts: 100, electronicsWatts: 0 },
    0,
    99,
  ),
  1 / 36,
);
assert.equal(labSettings({ planet: 'prototype', flightWatts: Infinity }).planet, 'earth');
assert.equal(labSettings({ flightWatts: Infinity }).flightWatts, 140);
for (const planet of ['moon', 'mars']) {
  const sim = new CommanderSimulation(createCommanderFleet(1));
  sim.lab = labSettings({ planet, rotorMode: 'constrained' });
  sim.drones[0].pos = [0, 20, 0];
  sim.drones[0].mode = 'FLY';
  for (let i = 0; i < 20; i++) sim.step(0.05);
  assert(sim.drones[0].pos[1] < 20);
  assert(Math.abs(sim.drones[0].velocity[1] + PLANETS[planet].gravity) < 0.02);
  for (let i = 0; i < 300; i++) sim.step(0.05);
  assert.equal(sim.drones[0].mode, 'LANDED');
  assert.equal(sim.drones[0].pos[1], sim.drones[0].home[1]);
}
const sim = new CommanderSimulation(createCommanderFleet(8, 'mixed'));
sim.lab = labSettings({ planet: 'moon' });
const combat = new CombatSimulation(sim);
await combat.start();
assert.equal(combat.world.gravity.y, -1.62);
const buffer = new ReplayBuffer();
for (let i = 0; i < 1200; i++) {
  sim.step(1 / 60);
  if (i === 240) combat.damage(sim.drones[0], 100, 'Test impact');
  buffer.sample(sim);
}
assert(buffer.frames.length <= 180);
assert(buffer.clips.length > 0);
assert(buffer.clips.length <= 6);
assert(buffer.clips.some((c) => c.label === 'Aircraft down'));
const clip = buffer.clips[0],
  liveState = JSON.stringify(sim.drones),
  bodyBefore = combat.bodies.get(sim.drones[1].id).body.translation();
for (let i = 0; i < 80; i++) {
  const playback = replayScene(clip, i / 10, sim);
  assert(playback !== sim);
  assert(playback.drones !== sim.drones);
  assert(playback.drones.every((d) => d.pos.every(Number.isFinite)));
}
assert.equal(JSON.stringify(sim.drones), liveState);
assert.deepEqual(combat.bodies.get(sim.drones[1].id).body.translation(), bodyBefore);
const exported = { kind: 'fleetcommander-replay', version: 1, clip };
assert.equal(
  validateReplay(JSON.parse(JSON.stringify(exported))).frames.length,
  clip.frames.length,
);
const invalid = JSON.parse(JSON.stringify(exported));
invalid.clip.frames[0].drones[0].pos = [null, 0, 0];
assert.throws(() => validateReplay(invalid));
assert.throws(() => validateReplay({ kind: 'other' }));
const scene = new T.Scene(),
  effects = new BattleEffects(scene);
combat.emit('explosion', [0, 30, 0], 1);
effects.update(sim, 1 / 60);
assert(effects.debris.count > 0);
assert.equal(effects.shockwaves.count, 0, 'no atmospheric ring in vacuum');
assert(effects.fragments.every((f) => f.pos.every(Number.isFinite)));
effects.reset();
assert.equal(effects.debris.count, 0);
effects.dispose();
assert.equal(scene.children.length, 0);
const env = new DirectorEnvironment(scene, {});
env.setScenery('moon');
env.setSky('lunar');
assert.equal(scene.fog, null);
assert.equal(env.skyUniforms.cloudCover.value, 0);
assert.equal(env.skyUniforms.atmosphere.value, 0);
env.setScenery('mars');
env.setSky('martian');
assert(scene.fog);
assert.equal(env.skyUniforms.cloudCover.value, 0);
env.dispose();
combat.stop();
const journal = journalData(null);
assert.equal(recommendScenario(journal).key, 'skirmish');
journal.rounds.push({
  id: 'test',
  preset: 'skirmish',
  seconds: 25,
  friendly: 2,
  enemy: 0,
  result: 'Friendly victory',
  planet: 'earth',
  rating: 1,
});
assert.equal(recommendScenario(journal).key, 'furball');
assert.deepEqual(journalData(journal), journal);
assert.throws(() => journalData({ kind: 'other' }));
console.log(
  'PASS: mass/weight units, Wh accounting, constrained Moon/Mars fall, arena gravity, bounded highlights, replay roundtrip and live-world isolation, vacuum effects, planet lighting and scenario journal.',
);
