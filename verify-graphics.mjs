import assert from 'node:assert/strict';
import * as T from './dist/three.js?v=0.6.0';
import {
  DirectorEnvironment,
  SCENERIES,
  SKIES,
  terrainHeight,
} from './dist/director-environment.js?v=0.6.0';
import { ScenePostFX, GRAPHICS_QUALITY } from './dist/scene-postfx.js?v=0.6.0';
import { surfaceMaterial } from './dist/scene-materials.js?v=0.6.0';
import { buildRangeObstacles } from './dist/range-props.js?v=0.6.0';
import { COMMANDER_OBSTACLES } from './dist/fleet-commander-core.js?v=0.6.0';
for (let x = -1024; x <= 1024; x += 128)
  for (let z = -1024; z <= 1024; z += 128) {
    assert.equal(terrainHeight(x, z), -0.15);
    assert(Number.isFinite(terrainHeight(x, z)));
  }
const renderer = { toneMappingExposure: 1 },
  scene = new T.Scene(),
  env = new DirectorEnvironment(scene, renderer),
  camera = new T.PerspectiveCamera();
camera.position.set(40, 100, 260);
camera.lookAt(0, 50, 0);
for (const scenery of Object.keys(SCENERIES)) {
  env.setScenery(scenery);
  const size = scene.children.length;
  for (const sky of Object.keys(SKIES)) {
    env.setSky(sky);
    env.setAtmosphere({ wetness: 0.7, clouds: 0.8, haze: 1.4 });
    env.update(camera, 42);
    assert(scene.children.length === size);
    assert(env.ground.receiveShadow);
    assert(
      env.materials.every((m) => !m.userData.surface || m.userData.surface.wetness.value === 0.7),
    );
    assert(env.sunlight.target.position.distanceTo(camera.position) > 80);
  }
  let triangles = 0,
    instances = 0;
  env.backdrop.traverse((o) => {
    if (o.geometry) {
      assert(o.geometry.attributes.position.array.every(Number.isFinite));
      triangles += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3;
    }
    if (o.isInstancedMesh) instances += o.count;
  });
  assert(triangles > 60000);
  if (scenery === 'stadium') assert(instances > 4000);
  if (scenery === 'alpine') assert(instances > 1500);
}
for (const quality of Object.values(GRAPHICS_QUALITY)) {
  env.setQuality(quality);
  assert.equal(env.sunlight.shadow.mapSize.x, quality.shadows);
}
env.dispose();
assert.equal(scene.children.length, 0);
const obstacles = buildRangeObstacles(COMMANDER_OBSTACLES);
assert.equal(obstacles.children.length, 3);
assert(obstacles.children.every((b) => b.children.length > 20));
for (const kind of ['grass', 'concrete', 'glass', 'metal', 'water', 'stone']) {
  const m = surfaceMaterial('#abc', kind),
    s = {
      uniforms: {},
      vertexShader: T.ShaderLib.standard.vertexShader,
      fragmentShader: T.ShaderLib.standard.fragmentShader,
    };
  m.onBeforeCompile(s);
  assert(s.vertexShader.includes('instanceMatrix*surfaceWorld'));
  assert(s.fragmentShader.includes('roughnessFactor=clamp'));
  assert(s.uniforms.wetness);
  assert(!s.fragmentShader.includes('undefined'));
  m.dispose();
}
const calls = [],
  gpu = {
    extensions: { has: () => true },
    capabilities: { maxSamples: 4 },
    setRenderTarget: (t) => calls.push(t),
    render: () => {},
  };
const post = new ScenePostFX(gpu);
post.setQuality('cinema');
post.resize(1600, 900);
assert.equal(post.sceneTarget.samples, 4);
assert.equal(post.blurA.width, 400);
post.render(scene, camera);
assert.equal(calls.at(-1), null);
assert(calls.length > 3);
post.setQuality('performance');
calls.length = 0;
post.render(scene, camera);
assert.deepEqual(calls, [null]);
post.dispose();
const unsupported = new ScenePostFX({ ...gpu, extensions: { has: () => false } });
unsupported.setQuality('cinema');
assert(!unsupported.enabled);
unsupported.dispose();
console.log(
  'PASS: 24 scenery/sky combinations, terrain and detailed geometry, shadow focus, physical surface uniforms, quality changes, post-processing pass order, HDR capability fallback and resource disposal.',
);
