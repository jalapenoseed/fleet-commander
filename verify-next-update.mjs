import assert from 'node:assert/strict';
import * as T from './dist/three.js';
import { NavierStokesField, fluidSettings } from './dist/fluid-field.js';
import { LOGIC_GATES, gateOutput, truthTable, fullAdder, numberFormats } from './dist/logic-lab.js';
import { ArenaWeather, weatherSettings } from './dist/arena-weather.js';
import { DirectorCamera, bestFightPair, longestSurvivor } from './dist/director-camera.js';
import { DRONE_AUDIO_PROFILES, droneSoundProfile } from './dist/arena-audio.js';
import { REPLAY_SPEEDS, replayPlaybackRate } from './dist/simulation-lab-ui.js';

for (const gate of Object.keys(LOGIC_GATES)) {
  const rows = truthTable(gate);
  assert.equal(rows.length, 4);
  assert(rows.every((row) => [0, 1].includes(row.out)));
}
assert.equal(gateOutput('AND', true, true), true);
assert.equal(gateOutput('XOR', true, true), false);
assert.deepEqual(fullAdder(1, 1, 1), { sum: 1, carry: 1 });
assert.deepEqual(numberFormats(1337), { decimal: 1337, binary: '10100111001', hex: '0x539' });
assert.equal(numberFormats(80085).hex, '0x138D5');
assert.throws(() => gateOutput('FLUX', true, false));

assert.deepEqual(REPLAY_SPEEDS, [0.125, 0.25, 0.5, 1, 2]);
assert.equal(replayPlaybackRate(1, 4, 4.5, true), 0.125);
assert.equal(replayPlaybackRate(0.5, 1, 4, true), 0.5);
assert.equal(replayPlaybackRate(99, 0, 5, false), 0.25);

const bounded = fluidSettings({ enabled: true, viscosity: 99, resolution: 100, domain: 1 });
assert.equal(bounded.viscosity, 0.12);
assert.equal(bounded.resolution, 28);
assert.equal(bounded.domain, 120);
const field = new NavierStokesField({
  enabled: true,
  resolution: 16,
  viscosity: 0.02,
  domain: 300,
});
for (let i = 0; i < 160; i++)
  field.step(0.08, { speed: 18, direction: 240, gust: 9, time: i * 0.08 });
for (const value of [
  ...field.sample(0, 0),
  ...field.sample(140, -140),
  field.stats().divergence,
  field.stats().vorticity,
])
  assert(Number.isFinite(value));
assert(field.stats().cells === 256);
assert(Math.hypot(...field.sample(0, 0)) > 0.1);

const weather = new ArenaWeather();
assert.equal(weather.settings.lightning, 0);
weather.configure({
  rain: 1,
  windSpeed: 20,
  gust: 12,
  physicsFx: 1,
  audioFx: 0.7,
  fluidEnabled: true,
  viscosity: 0.03,
});
for (let i = 0; i < 30; i++) weather.update(0.08);
assert(weather.batteryMultiplier() > 1);
assert(Math.hypot(...weather.velocityAt([10, 30, -15], weather.time, 'test')) > 0);
assert(weather.strike({ x: 0, y: 2, z: 200 }));
assert.equal(weather.events.at(-1).type, 'thunder');
assert(
  weather.signalFor({ pos: [800, 0, 0], health: 20 }) <
    weather.signalFor({ pos: [0, 0, 0], health: 100 }),
);
weather.setWorld('moon');
assert.deepEqual(weather.velocityAt([10, 30, -15]), [0, 0, 0]);
assert.equal(weather.batteryMultiplier(), 1);
assert.equal(weather.strike(), false);
assert.equal(weatherSettings({ windSpeed: 999, rain: -2 }).windSpeed, 35);

const drone = (id, side, pos, velocity, targetId, kills = 0) => ({
  id,
  combatSide: side,
  pos,
  velocity,
  mode: 'FLY',
  health: 100,
  battery: 100,
  yaw: 0,
  attitude: { pitch: 0, roll: 0 },
  ai: { targetId, state: 'Intercept' },
  combatStats: { kills, lastAction: 8, survivalTime: 10 },
});
const a = drone('friendly-1', 'friendly', [0, 30, 0], [12, 0, 0], 'enemy-1', 1),
  b = drone('enemy-1', 'enemy', [18, 32, 4], [-11, 0, 0], 'friendly-1', 2),
  c = drone('enemy-2', 'enemy', [150, 40, 100], [1, 0, 0], 'friendly-1');
const sim = {
  drones: [a, b, c],
  running: true,
  elapsed: 10,
  fleet: { options: { reducedMotion: false, obstacles: false } },
  combat: { time: 10, battleTime: 10, events: [], world: {} },
};
assert.deepEqual(bestFightPair(sim).slice(0, 2), [a, b]);
assert.equal(longestSurvivor(sim).id, a.id, 'the last member of a faction is the survivor subject');
const camera = new T.PerspectiveCamera(),
  rig = new DirectorCamera();
rig.setView();
rig.update(camera, sim, 'bestfight', a, 0.016);
assert.match(rig.label, /friendly-1 vs enemy-1/);
assert(camera.position.toArray().every(Number.isFinite));
rig.setView();
rig.update(camera, sim, 'survivor', a, 0.016);
assert.equal(rig.subject, a.id);
a.mode = 'WRECK';
rig.update(camera, sim, 'survivor', b, 0.016);
assert.notEqual(rig.subject, a.id);
assert(sim.drones.find((d) => d.id === rig.subject)?.mode === 'FLY');
a.mode = 'FLY';
rig.setView();
rig.update(camera, sim, 'combat', a, 0.016);
assert.match(rig.label, /Cinematic action/);
assert(camera.position.toArray().every(Number.isFinite));

assert.equal(droneSoundProfile({ type: 'cargo' }), DRONE_AUDIO_PROFILES.cargo);
assert(DRONE_AUDIO_PROFILES.cargo.baseHz < DRONE_AUDIO_PROFILES.scout.baseHz);
assert(DRONE_AUDIO_PROFILES.cargo.gain > DRONE_AUDIO_PROFILES.scout.gain);
assert(DRONE_AUDIO_PROFILES.cargo.motors > DRONE_AUDIO_PROFILES.scout.motors);
console.log(
  'PASS: fluid wind, weather coupling, logic gates/default registers, smart slow motion, action/best-fight/survivor cameras and airframe audio profiles.',
);
