import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  CommanderSimulation,
  createCommanderFleet,
  validateCommanderFleet,
  FIELD_LIMIT,
  ALTITUDE_LIMIT,
} from './dist/fleet-commander-core.js';
import { compactFleet, parseFleetFile, FLEET_STORAGE_KEY } from './dist/fleet-commander-storage.js';
import { sampleSwarmProgram } from './dist/swarm-program.js';
import { boidSteering, BOID_DEFAULTS } from './dist/boids.js';
const tick = (s, n) => {
  for (let i = 0; i < n; i++) s.step(0.05);
};
const zero = new CommanderSimulation(createCommanderFleet(0));
zero.launch();
zero.step(0.05);
zero.recall();
zero.recharge();
assert.equal(zero.metrics().total, 0);
assert.equal(zero.metrics().battery, 0);
assert.throws(() => zero.startChallenge('hunt'), /at least one/);
assert.equal(parseFleetFile(JSON.stringify(compactFleet(zero.snapshot()))).roster.length, 0);
for (const count of [5000, 10000]) {
  const config = createCommanderFleet(count);
  config.program.settings.boids = 'on';
  config.program.settings.countIn = 0;
  config.program.settings.morph = 0;
  const sim = new CommanderSimulation(config);
  assert.equal(new Set(sim.drones.map((d) => d.id)).size, count);
  assert.equal(new Set(sim.drones.map((d) => d.home.join(','))).size, count);
  assert.equal(sim.drones.at(-1).id, count === 10000 ? 'drone-10000' : 'drone-5000');
  sim.launch();
  sim.elapsed = 12;
  const start = performance.now();
  tick(sim, 40);
  const ms = (performance.now() - start) / 40;
  assert.equal(sim.metrics().active, count);
  assert(
    sim.drones.every((d) => d.battery < 100 && d.velocity.some((v) => v !== 0)),
    'every aircraft has energy and a live body',
  );
  assert.equal(
    new Set(sim.drones.map((d) => d.pos.join(','))).size,
    count,
    'each body remains distinct',
  );
  assert(
    sim.drones.every(
      (d) =>
        [...d.pos, ...d.velocity, ...d.target].every(Number.isFinite) &&
        Math.abs(d.pos[0]) <= FIELD_LIMIT &&
        Math.abs(d.pos[2]) <= FIELD_LIMIT &&
        d.pos[1] <= ALTITUDE_LIMIT,
    ),
  );
  const stored = JSON.stringify(compactFleet(sim.snapshot()));
  assert(stored.length < 2000000);
  assert.equal(parseFleetFile(stored).roster.length, count);
  for (const shape of ['ring', 'grid', 'column', 'line', 'scatter']) {
    sim.program.settings.shape = shape;
    sim.program.time = 20;
    const targets = sim.program.ids.map((id) => sampleSwarmProgram(sim.program, id).target);
    assert.equal(
      new Set(targets.map((p) => p.join(','))).size,
      count,
      shape + ' assigns distinct targets',
    );
    assert(
      targets.every(
        (p) =>
          Math.abs(p[0]) < FIELD_LIMIT && Math.abs(p[2]) < FIELD_LIMIT && p[1] < ALTITUDE_LIMIT,
      ),
      shape + ' fits the field',
    );
  }
  console.log(
    'PASS:',
    count,
    'independent drone bodies with Boids, unique pads/IDs/targets, energy and JSON roundtrip;',
    ms.toFixed(1),
    'ms CPU step; not a GPU frame-rate claim.',
  );
}
const battery = new CommanderSimulation(createCommanderFleet(6));
battery.launch();
tick(battery, 200);
assert(battery.drones.every((d) => d.battery < 100));
battery.setCharge(
  battery.drones.map((d) => d.id),
  11,
);
battery.step(0.05);
assert(battery.drones.every((d) => d.mode === 'RETURN'));
tick(battery, 1600);
assert(battery.drones.every((d) => d.mode === 'DOCK'));
battery.recharge();
assert(battery.drones.every((d) => d.battery === 100));
battery.launch();
tick(battery, 200);
battery.setCharge(
  battery.drones.map((d) => d.id),
  0,
);
tick(battery, 500);
assert.equal(battery.metrics().landed, 6);
battery.recharge();
battery.launch();
tick(battery, 80);
assert.equal(
  battery.metrics().active,
  6,
  'emergency-landed aircraft can be serviced and relaunched',
);
const normal = new CommanderSimulation(createCommanderFleet(1)),
  fast = new CommanderSimulation(createCommanderFleet(1));
fast.fleet.options.batteryDrain = 10;
normal.launch();
fast.launch();
tick(normal, 100);
tick(fast, 100);
assert(Math.abs((100 - fast.drones[0].battery) / (100 - normal.drones[0].battery) - 10) < 0.01);
normal.fleet.options.unlimited = true;
const charge = normal.drones[0].battery;
tick(normal, 20);
assert.equal(normal.drones[0].battery, charge);
normal.startChallenge('hunt');
assert.throws(() => normal.setCharge(['drone-001'], 0), /locked/);
const legacy = createCommanderFleet(3);
legacy.kind = 'gridrunner-commander-fleet';
delete legacy.options.batteryDrain;
assert.equal(validateCommanderFleet(legacy).options.batteryDrain, 1);
assert.equal(validateCommanderFleet(legacy).kind, 'fleet-commander-fleet');
assert.equal(FLEET_STORAGE_KEY, 'fleetcommander.fleets.v1');
assert.deepEqual(
  boidSteering({ id: 'a', pos: [0, 20, 0], velocity: [0, 0, 0] }, { settings: BOID_DEFAULTS }),
  [0, 0, 0],
);
// All four retained production meshes are genuine GLBs, with embedded buffers.
for (const name of ['SCOUT', 'RELAY', 'CARGO', 'UTILITY']) {
  const bytes = zlib.gunzipSync(fs.readFileSync('dist/assets/drones/GR_' + name + '_01.glb.gz'));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  const len = bytes.readUInt32LE(12),
    gltf = JSON.parse(bytes.subarray(20, 20 + len).toString());
  assert(gltf.meshes.length > 0);
  assert(gltf.buffers.every((b) => !b.uri));
}
const html = fs.readFileSync('dist/index.html', 'utf8');
assert(!html.includes('GRIDRUNNER') && !html.includes('commanderReturn'));
assert(!fs.existsSync('dist/game.js') && !fs.existsSync('dist/story-campaign.js'));
for (const file of fs.readdirSync('dist').filter((f) => f.endsWith('.js'))) {
  const source = fs.readFileSync('dist/' + file, 'utf8');
  for (const m of source.matchAll(/from\s*['"](\.[^'"]+)['"]/g))
    assert(fs.existsSync(path.resolve('dist', m[1].split('?')[0])), file + ' import ' + m[1]);
}
console.log(
  'PASS: empty fleets, finite/accelerated/unlimited batteries, reserve return, emergency landing/recharge/relaunch, challenge locks, legacy imports, four real airframe GLBs, and no campaign executable.',
);
