import assert from 'node:assert/strict';
import * as T from './dist/three.js';
import {
  CommanderSimulation,
  createCommanderFleet,
  validateCommanderFleet,
  COMMANDER_EXAMPLES,
  commanderGroups,
  COMMANDER_OBSTACLES,
} from './dist/fleet-commander-core.js';
import { BEACON_PALETTE } from './dist/beacon-palette.js';
import { compileProgram, validateSwarmProgram, sampleSwarmProgram } from './dist/swarm-program.js';
import {
  parseFleetFile,
  readFleetLibrary,
  saveNamedFleet,
} from './dist/fleet-commander-storage.js';
import { instanceParts } from './dist/fleet-commander-renderer.js';
const clone = (v) => JSON.parse(JSON.stringify(v)),
  tick = (sim, seconds) => {
    for (let i = 0; i < seconds * 60; i++) sim.step(1 / 60);
  };
assert.equal(BEACON_PALETTE.length, 9);
assert.equal(new Set(BEACON_PALETTE.map((c) => c.hex)).size, 9);
assert.equal(BEACON_PALETTE.at(-1).id, 'white');
const six = createCommanderFleet(6);
assert.equal(six.roster.filter((d) => d.type === 'scout').length, 4);
assert.equal(six.roster.filter((d) => d.type === 'relay').length, 2);
const fleet = createCommanderFleet(100, 'mixed');
assert.equal(new Set(fleet.roster.map((d) => d.type)).size, 4);
assert.equal(new Set(fleet.roster.map((d) => d.id)).size, 100);
assert.throws(
  () => validateSwarmProgram(fleet.program),
  /valid aircraft/,
  'campaign programs cannot smuggle in the Commander roster',
);
for (const mutate of [
  (f) => f.roster.push(f.roster[0]),
  (f) => (f.roster[1].id = f.roster[0].id),
  (f) => (f.roster[0].color = 'constructor'),
  (f) => (f.roster[0].type = '__proto__'),
  (f) => (f.objective[0] = Infinity),
  (f) => (f.options.beaconSize = 80),
  (f) => delete f.program,
  (f) => (f.program.settings.formulaX = 'fetch("/")'),
]) {
  const bad = clone(fleet);
  mutate(bad);
  assert.throws(() => validateCommanderFleet(bad));
}
assert.throws(() => parseFleetFile('not json'), /valid JSON/);
assert.throws(() => parseFleetFile('x'.repeat(2000001)), /2 MB/);
const store = new Map(),
  storage = { getItem: (k) => store.get(k) || null, setItem: (k, v) => store.set(k, v) };
const saved = clone(fleet);
saved.name = 'Words & drawings';
saved.roster[7].color = 'white';
saved.program.settings.shape = 'drawing';
saved.program.strokes = [
  [
    [-1, -1],
    [0, 1],
  ],
  [
    [0.5, 0.4],
    [1, 0],
  ],
];
saved.program.settings.formulaX = '8*sin(t+i)';
saveNamedFleet(storage, saved);
assert.deepEqual(readFleetLibrary(storage)[0], validateCommanderFleet(saved));
assert.deepEqual(parseFleetFile(JSON.stringify(saved)), validateCommanderFleet(saved));
saved.roster[0].name = 'Repainted scout';
saveNamedFleet(storage, saved);
assert.equal(readFleetLibrary(storage).length, 1);
assert.equal(readFleetLibrary(storage)[0].roster[0].name, 'Repainted scout');
for (const source of Object.values(COMMANDER_EXAMPLES))
  for (const n of [1, 6, 100]) {
    const f = createCommanderFleet(n);
    f.program.mode = 'script';
    f.program.source = source;
    assert.doesNotThrow(() => validateCommanderFleet(f));
  }
const groups = commanderGroups(fleet.roster),
  compiled = compileProgram('select cyan\nheight 40\nselect alpha\nassign operator\nrepeat 20', {
    aircraft: fleet.roster.map((d) => d.id),
    groups,
  });
assert.deepEqual(compiled.cues[0].ids, groups.cyan);
assert.deepEqual(compiled.cues[1].ids, groups.alpha);
assert.throws(
  () =>
    compileProgram('select magenta\nheight 40', {
      aircraft: fleet.roster.map((d) => d.id),
      groups,
    }),
  /Unknown aircraft/,
);
const sim = new CommanderSimulation();
sim.launch();
let peak = 0;
const cpu = performance.now();
for (let i = 0; i < 1800; i++) {
  sim.step(1 / 60);
  peak = Math.max(peak, sim.checks);
}
const averageMs = (performance.now() - cpu) / 1800;
assert.equal(sim.metrics().active, 100);
assert(sim.metrics().cohesion >= 98);
assert(peak < (100 * 99) / 2, 'spatial buckets reduce pair checks in the launch / grid case');
const paused = clone(sim.drones.map((d) => d.pos)),
  time = sim.elapsed;
sim.running = false;
tick(sim, 2);
assert.deepEqual(
  sim.drones.map((d) => d.pos),
  paused,
);
assert.equal(sim.elapsed, time);
sim.running = true;
sim.recall();
tick(sim, 100);
assert(
  sim.drones.every((d) => d.mode === 'DOCK'),
  'all 100 return to individual launch pads',
);
for (const [name, source] of Object.entries(COMMANDER_EXAMPLES)) {
  const f = createCommanderFleet(100, 'mixed');
  f.program.mode = 'script';
  f.program.source = source;
  const run = new CommanderSimulation(f);
  run.launch();
  tick(run, 50);
  assert.equal(run.metrics().active, 100, name);
  for (const d of run.drones) {
    assert([...d.pos, ...d.velocity, ...d.target].every(Number.isFinite), name);
    assert(
      Math.abs(d.pos[0]) <= 220 && d.pos[1] >= 1 && d.pos[1] <= 90 && Math.abs(d.pos[2]) <= 220,
    );
    for (const box of COMMANDER_OBSTACLES)
      assert(
        !(
          Math.abs(d.pos[0] - box.x) < box.w &&
          Math.abs(d.pos[2] - box.z) < box.d &&
          d.pos[1] < box.h
        ),
      );
  }
}
const trace = createCommanderFleet(100).program;
trace.settings.shape = 'drawing';
trace.settings.morph = 0;
trace.settings.trace = true;
trace.strokes = [
  [
    [-1, 0],
    [1, 0],
  ],
];
assert.equal(
  new Set(trace.ids.map((id) => sampleSwarmProgram(trace, id, { time: 10 }).target.join(','))).size,
  100,
  'all drones occupy unique trace phases',
);
const reserve = new CommanderSimulation(createCommanderFleet(6));
reserve.fleet.options.unlimited = false;
reserve.launch();
tick(reserve, 3);
reserve.drones[0].battery = 11;
tick(reserve, 1);
assert.equal(reserve.drones[0].mode, 'RETURN');
assert(
  !reserve.program.activeIds.includes(reserve.drones[0].id),
  'reserve return removes program authority',
);
const groupsSim = new CommanderSimulation(createCommanderFleet(25));
groupsSim.launch();
const config = groupsSim.snapshot();
config.program.mode = 'script';
config.program.source =
  'select all\nassign formation\nwait 5\nselect relays\nassign bike\nrepeat 15';
groupsSim.apply(config);
tick(groupsSim, 9);
assert(
  groupsSim.drones.filter((d) => d.type === 'relay').every((d) => d.order === 'bike'),
  'program applies timed cues to drones that were queued during Apply',
);
const drill = new CommanderSimulation(createCommanderFleet(100));
drill.startChallenge('formation');
for (const shape of ['ring', 'line', 'grid', 'wedge']) {
  assert.equal(drill.challenge.shape, shape);
  const next = drill.snapshot();
  Object.assign(next.program.settings, { shape, field: 'none', pattern: 'hold', show: 'none' });
  drill.apply(next);
  for (let i = 0; i < 50 * 60 && drill.challenge.shape === shape && !drill.challenge.finished; i++)
    drill.step(1 / 60);
}
assert(
  drill.challenge.finished && drill.challenge.stage === 4,
  'formation drill can be completed through real simulation',
);
assert(drill.challenge.score >= 400);
const hunt = new CommanderSimulation(createCommanderFleet(100));
hunt.startChallenge('hunt');
const ids = hunt.drones.filter((d) => d.color === hunt.challenge.color).map((d) => d.id);
hunt.send(ids);
tick(hunt, 20);
assert(
  hunt.challenge.stage >= 1 && hunt.challenge.score >= 100,
  'hunt is playable with a color group and queued launch',
);
const party = new CommanderSimulation(createCommanderFleet(6));
party.startChallenge('party', ['A', 'B']);
const seed = party.challenge.seed;
party.send(party.drones.filter((d) => d.color === party.challenge.color).map((d) => d.id));
tick(party, 91);
assert(party.challenge.roundOver && !party.challenge.finished);
assert.equal(party.challenge.scores[0].player, 'A');
party.program.settings.height = 60;
assert(party.nextPlayer());
assert.equal(party.challenge.turn, 1);
assert.equal(
  party.program.settings.height,
  seed.program.settings.height,
  'next player receives original configuration',
);
tick(party, 91);
assert(party.challenge.finished);
assert.equal(party.challenge.scores.length, 2);
const scene = new T.Scene(),
  model = new T.Group(),
  mesh = new T.Mesh(new T.BoxGeometry(1, 1, 1), new T.MeshStandardMaterial());
model.position.set(1, 2, 3);
model.add(mesh);
const parts = instanceParts(model, scene);
assert.equal(parts.length, 1);
assert.equal(parts[0].mesh.instanceMatrix.count, 10000);
assert.equal(parts[0].mesh.geometry, mesh.geometry);
assert.equal(parts[0].mesh.count, 0);
assert.deepEqual(new T.Vector3().setFromMatrixPosition(parts[0].local).toArray(), [1, 2, 3]);
console.log(
  'PASS: 1–100 aircraft, nine colors, bounded fleet import and save round trips, campaign isolation, grouped scripts, unique trace phases, finite motion, reserve return, all-aircraft docking, playable drills/hunt, fair party turns and shared instanced geometry. CPU 100-drone grid step:',
  averageMs.toFixed(2) + ' ms; peak neighborhood checks:',
  peak + '. GPU frame rate is device dependent.',
);
