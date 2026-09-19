import assert from 'node:assert/strict';
import * as T from './dist/three.js?v=0.6.0';
import {
  SwarmLighting,
  lightingSettings,
  LIGHTING_PRESETS,
} from './dist/swarm-lighting.js?v=0.6.0';
import { AircraftBeacons } from './dist/aircraft-beacons.js?v=0.6.0';
import { DirectorEnvironment } from './dist/director-environment.js?v=0.6.0';
const root = new T.Scene(),
  rig = new SwarmLighting(root),
  beacons = new AircraftBeacons(root),
  camera = new T.PerspectiveCamera();
camera.position.set(0, 5, 15);
const drone = (i, pos = [i, 3, 0]) => ({
  id: 'drone-' + String(i + 1).padStart(3, '0'),
  pos,
  color: i % 2 ? 'red' : 'blue',
  mode: 'FLY',
});
const drones = Array.from({ length: 32 }, (_, i) => drone(i));
const snapshot = JSON.stringify(drones);
rig.update(drones, camera, { obstacles: false });
assert.equal(rig.pools.geometry.instanceCount, 32);
assert.equal(rig.lights.filter((l) => l.intensity > 0).length, 8);
const slots = [...rig.slots];
rig.update([...drones].reverse(), camera, { obstacles: false });
assert.deepEqual(rig.slots, slots);
assert.equal(JSON.stringify(drones), snapshot);
for (const [q, budget] of [
  ['performance', 4],
  ['balanced', 8],
  ['cinema', 12],
]) {
  rig.configure({}, q);
  rig.update(drones, camera, { obstacles: false });
  assert.equal(rig.lights.filter((l) => l.intensity > 0).length, budget);
}
rig.configure({ beaconPower: 0 });
rig.update(drones, camera, { obstacles: false });
assert(rig.lights.every((l) => l.intensity === 0));
assert.equal(rig.pools.geometry.instanceCount, 0);
rig.configure({});
rig.update([drone(0, [0, 100, 0])], camera, { obstacles: false });
assert.equal(rig.pools.geometry.instanceCount, 0);
rig.update([], camera);
assert.equal(rig.pools.geometry.instanceCount, 0);
assert(rig.lights.every((l) => l.intensity === 0));
assert.equal(lightingSettings({ exposure: Infinity }).exposure, 0);
assert.equal(lightingSettings({ beaconPower: 100 }).beaconPower, 3);
const fleet = Array.from({ length: 10000 }, (_, i) =>
  drone(i, [((i % 100) - 50) * 2, 3, Math.floor(i / 100) * 2]),
);
const t = performance.now();
rig.update(fleet, camera, { obstacles: false });
const cost = performance.now() - t;
assert.equal(rig.pools.geometry.instanceCount, 10000);
assert(rig.lights.filter((l) => l.intensity > 0).length <= 8);
assert(Object.values(rig.pools.geometry.attributes).every((a) => a.array.every(Number.isFinite)));
beacons.update(fleet, camera, { intensity: 2, haze: 1.5 });
assert.equal(beacons.points.geometry.drawRange.count, 10000);
assert.equal(beacons.points.material.uniforms.intensity.value, 2);
beacons.update([], camera);
assert.equal(beacons.points.geometry.drawRange.count, 0);
const r = { toneMappingExposure: 1 },
  env = new DirectorEnvironment(new T.Scene(), r);
env.setSky('night');
const baseline = r.toneMappingExposure,
  stage = env.lights[0].intensity;
env.setLighting({ exposure: 1, stage: 0.1 });
assert.equal(r.toneMappingExposure, baseline * 2);
assert.equal(env.lights[0].intensity, stage * 0.1);
env.setScenery('coast');
env.setScenery('stadium');
assert.equal(env.lights[0].intensity, stage * 0.1);
assert(Math.abs(env.fixtureMaterial.emissiveIntensity - 0.3) < 1e-9);
env.dispose();
for (const p of Object.values(LIGHTING_PRESETS))
  assert.deepEqual(
    lightingSettings(p),
    Object.fromEntries(Object.keys(lightingSettings()).map((k) => [k, p[k]])),
  );
rig.dispose();
beacons.dispose();
assert.equal(root.children.length, 0);
console.log(
  `PASS: bounded lights, stable assignments, zero/10k fleets, no simulation mutation, HDR beacon uniforms, exposure/stage persistence and disposal. 10k lighting update: ${cost.toFixed(1)} ms (CPU only).`,
);
