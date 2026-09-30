import * as THREE from '../../three.js';

const canvas = document.querySelector('#scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (error) {
  document.querySelector('#renderError').hidden = false;
  throw error;
}
const viewport = document.querySelector('#viewport');
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  document.querySelector('#renderError').hidden = false;
});
canvas.addEventListener('webglcontextrestored', () => location.reload());

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x182a34);
scene.fog = new THREE.Fog(0x182a34, 100, 220);
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 500);
camera.position.set(0, 38, 42);
camera.lookAt(0, 0, 0);

scene.add(new THREE.HemisphereLight(0xdaefff, 0x405058, 2.5));
const sun = new THREE.DirectionalLight(0xffffff, 3.2);
sun.position.set(-18, 35, 22);
scene.add(sun);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 100 });
sun.shadow.bias = -0.001;
sun.shadow.normalBias = 0.05;

const floor = new THREE.Mesh(
  new THREE.CylinderGeometry(31, 31, 0.65, 96),
  new THREE.MeshStandardMaterial({ color: 0x314953, roughness: 0.9, metalness: 0.05 }),
);
floor.position.y = -0.43;
floor.receiveShadow = true;
scene.add(floor);
const boundary = new THREE.Mesh(
  new THREE.TorusGeometry(29.5, 0.045, 6, 160),
  new THREE.MeshBasicMaterial({ color: 0x73989c }),
);
boundary.rotation.x = Math.PI / 2;
boundary.position.y = -0.08;
scene.add(boundary);
const grid = new THREE.GridHelper(60, 30, 0x6a8994, 0x486571);
grid.material.transparent = true;
grid.material.opacity = 0.38;
scene.add(grid);

const obstacleData = [
  { x: -9, z: -5, r: 3.1 },
  { x: 5, z: -8, r: 2.7 },
  { x: 10, z: 4, r: 3.4 },
  { x: -5, z: 9, r: 2.5 },
];
for (const o of obstacleData) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(o.r, o.r * 0.92, 2.2, 32),
    new THREE.MeshStandardMaterial({ color: 0x82939a, roughness: 0.65, metalness: 0.25 }),
  );
  mesh.position.set(o.x, 1, o.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(o.r + 0.25, 0.06, 8, 48),
    new THREE.MeshBasicMaterial({ color: 0xe0a480, transparent: true, opacity: 0.9 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.set(o.x, 2.13, o.z);
  scene.add(ring);
}

const target = new THREE.Group();
const targetCore = new THREE.Mesh(
  new THREE.OctahedronGeometry(0.68),
  new THREE.MeshStandardMaterial({
    color: 0xffce73,
    emissive: 0xf3a93c,
    emissiveIntensity: 0.8,
    roughness: 0.3,
  }),
);
const targetRing = new THREE.Mesh(
  new THREE.TorusGeometry(1.7, 0.08, 10, 64),
  new THREE.MeshBasicMaterial({ color: 0xffce73, transparent: true, opacity: 0.95 }),
);
targetRing.rotation.x = Math.PI / 2;
target.add(targetCore, targetRing);
target.position.set(0, 0.55, 0);
scene.add(target);

const N = 100;
const positions = [],
  velocities = [],
  agents = [];
const agentGeo = new THREE.ConeGeometry(0.29, 0.85, 4);
agentGeo.rotateX(Math.PI / 2);
const agentMat = new THREE.MeshStandardMaterial({
  color: 0xa8fce1,
  emissive: 0x4dc5a5,
  emissiveIntensity: 0.6,
  roughness: 0.5,
  metalness: 0.15,
});
// One shared buffer: 24 fading path segments per agent, sampled at 20 Hz.
const TRAIL_STEPS = 24;
const trailHistory = Array.from({ length: N }, () => []);
const trailGeo = new THREE.BufferGeometry();
const trailPositions = new Float32Array(N * TRAIL_STEPS * 6);
const trailColors = new Float32Array(trailPositions.length);
const trailColor = new THREE.Color(0x72c9b3),
  floorColor = new THREE.Color(0x314953);
for (let i = 0; i < N; i++)
  for (let j = 0; j < TRAIL_STEPS; j++) {
    const c = floorColor.clone().lerp(trailColor, 0.15 + 0.85 * (1 - j / TRAIL_STEPS));
    for (let v = 0; v < 2; v++) c.toArray(trailColors, (i * TRAIL_STEPS + j) * 6 + v * 3);
  }
trailGeo.setAttribute(
  'position',
  new THREE.BufferAttribute(trailPositions, 3).setUsage(THREE.DynamicDrawUsage),
);
trailGeo.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
const trailLines = new THREE.LineSegments(
  trailGeo,
  new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7 }),
);
trailLines.frustumCulled = false;
scene.add(trailLines);
let trailElapsed = 0;
function clearTrails() {
  for (let i = 0; i < N; i++)
    trailHistory[i] = Array.from({ length: TRAIL_STEPS + 1 }, () => positions[i].clone());
  updateTrails(false);
}
function updateTrails(sample = true) {
  for (let i = 0; i < N; i++) {
    const h = trailHistory[i];
    if (sample) {
      h.unshift(positions[i].clone());
      h.length = TRAIL_STEPS + 1;
    }
    for (let j = 0; j < TRAIL_STEPS; j++) {
      const k = (i * TRAIL_STEPS + j) * 6;
      trailPositions.set([h[j].x, 0.18, h[j].z, h[j + 1].x, 0.18, h[j + 1].z], k);
    }
  }
  trailGeo.attributes.position.needsUpdate = true;
}

function randomPos() {
  let p;
  do {
    const a = Math.random() * Math.PI * 2,
      r = 8 + Math.random() * 18;
    p = new THREE.Vector3(Math.cos(a) * r, 0.42, Math.sin(a) * r);
  } while (obstacleData.some((o) => Math.hypot(p.x - o.x, p.z - o.z) < o.r + 0.6));
  return p;
}
for (let i = 0; i < N; i++) {
  const p = randomPos(),
    v = new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2);
  positions.push(p);
  velocities.push(v);
  const m = new THREE.Mesh(agentGeo, agentMat);
  m.position.copy(p);
  m.castShadow = true;
  scene.add(m);
  agents.push(m);
}

clearTrails();
const arrowGroup = new THREE.Group();
scene.add(arrowGroup);
const arrows = [];
for (let x = -24; x <= 24; x += 4) {
  for (let z = -24; z <= 24; z += 4) {
    const a = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(x, 0.08, z),
      1,
      0x7d9eae,
      0.28,
      0.12,
    );
    a.line.material.transparent = true;
    a.line.material.opacity = 0.55;
    a.cone.material.transparent = true;
    a.cone.material.opacity = 0.65;
    arrowGroup.add(a);
    arrows.push(a);
  }
}

const ui = {};
for (const id of [
  'attraction',
  'vortex',
  'separation',
  'avoid',
  'wind',
  'damping',
  'vectors',
  'trails',
])
  ui[id] = document.querySelector('#' + id);
for (const id of ['attraction', 'vortex', 'separation', 'avoid', 'wind', 'damping']) {
  const out = document.querySelector('#' + id + 'Out');
  const sync = () => (out.textContent = Number(ui[id].value).toFixed(id === 'damping' ? 2 : 1));
  ui[id].addEventListener('input', () => {
    sync();
    document.querySelector('#preset').value = 'custom';
  });
  sync();
}
ui.vectors.addEventListener('change', () => (arrowGroup.visible = ui.vectors.checked));
ui.trails.addEventListener('change', () => (trailLines.visible = ui.trails.checked));

let paused = false,
  collisions = 0;
const tmp = new THREE.Vector3(),
  tmp2 = new THREE.Vector3(),
  force = new THREE.Vector3();
const raycaster = new THREE.Raycaster(),
  mouse = new THREE.Vector2(),
  plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function params() {
  return {
    attraction: +ui.attraction.value,
    vortex: +ui.vortex.value,
    separation: +ui.separation.value,
    avoid: +ui.avoid.value,
    wind: +ui.wind.value,
    damping: +ui.damping.value,
  };
}
function fieldAt(pos, index = -1) {
  const p = params();
  force.set(0, 0, 0);
  tmp.subVectors(target.position, pos);
  tmp.y = 0;
  const d = Math.max(1, tmp.length());
  force.addScaledVector(tmp.normalize(), p.attraction * Math.min(1, d / 8));
  tmp2.set(-tmp.z, 0, tmp.x);
  force.addScaledVector(tmp2, p.vortex / (1 + d * 0.12));
  force.x += p.wind;

  for (const o of obstacleData) {
    tmp.set(pos.x - o.x, 0, pos.z - o.z);
    const od = tmp.length(),
      reach = o.r + 4.2;
    if (od < reach) force.addScaledVector(tmp.normalize(), p.avoid * (1 - od / reach));
  }
  if (index >= 0) {
    for (let j = 0; j < N; j++) {
      if (j === index) continue;
      tmp.subVectors(pos, positions[j]);
      tmp.y = 0;
      const sd = tmp.length();
      if (sd > 0.001 && sd < 2.2)
        force.addScaledVector(tmp.normalize(), p.separation * (1 - sd / 2.2));
    }
  }
  return force;
}
function reset() {
  collisions = 0;
  for (let i = 0; i < N; i++) {
    positions[i].copy(randomPos());
    velocities[i].set((Math.random() - 0.5) * 1.5, 0, (Math.random() - 0.5) * 1.5);
    agents[i].position.copy(positions[i]);
  }
  clearTrails();
  document.querySelector('#collisionStat').textContent = '0';
  updateStats();
}
document.querySelector('#reset').addEventListener('click', reset);
const pauseBtn = document.querySelector('#pause');
function togglePause() {
  paused = !paused;
  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  pauseBtn.setAttribute('aria-pressed', String(paused));
  const status = document.querySelector('#runState');
  status.textContent = paused ? 'Paused' : 'Running';
  status.classList.toggle('paused', paused);
}
pauseBtn.addEventListener('click', togglePause);

const modes = document.querySelectorAll('.mode'),
  lesson = document.querySelector('#lesson'),
  dev = document.querySelector('#devPanel');
modes.forEach((b) =>
  b.addEventListener('click', () => {
    modes.forEach((x) => {
      x.classList.toggle('active', x === b);
      x.setAttribute('aria-pressed', String(x === b));
    });
    lesson.classList.toggle('hidden', b.dataset.mode !== 'learn');
    dev.classList.toggle('hidden', b.dataset.mode !== 'dev');
  }),
);

const presets = {
  balanced: { attraction: 3.2, vortex: 1.5, separation: 3.8, avoid: 6.2, wind: 0.6, damping: 0.85 },
  orbit: { attraction: 2.5, vortex: 5, separation: 3.8, avoid: 8, wind: 0, damping: 0.4 },
  gather: { attraction: 5, vortex: 0, separation: 2, avoid: 9, wind: 0, damping: 1.5 },
  wind: { attraction: 1.8, vortex: 0.5, separation: 4, avoid: 9, wind: 2.6, damping: 0.65 },
};
function applyPreset(name) {
  for (const [id, value] of Object.entries(presets[name])) {
    ui[id].value = value;
    document.querySelector('#' + id + 'Out').textContent = value.toFixed(id === 'damping' ? 2 : 1);
  }
  document.querySelector('#preset').value = name;
}
document.querySelector('#preset').addEventListener('change', (e) => applyPreset(e.target.value));
document.querySelector('#restore').addEventListener('click', () => applyPreset('balanced'));
const inspector = document.querySelector('#inspector'),
  controlsToggle = document.querySelector('#controlsToggle');
function setControls(open) {
  document.body.classList.toggle('controls-open', open);
  inspector.inert = !open;
  controlsToggle.setAttribute('aria-expanded', String(open));
  controlsToggle.textContent = open ? 'Hide controls' : 'Tune field';
}
controlsToggle.addEventListener('click', () =>
  setControls(!document.body.classList.contains('controls-open')),
);
document.querySelector('#closeControls').addEventListener('click', () => {
  setControls(false);
  controlsToggle.focus();
});
setControls(matchMedia('(min-width:1000px)').matches);

let yaw = 0,
  pitch = 0.93,
  distance = 80,
  zoom = 1,
  topView = false,
  placing = false;
const placeBtn = document.querySelector('#placeTarget'),
  hint = document.querySelector('#gestureHint');
function setPlacing(value) {
  placing = value;
  placeBtn.setAttribute('aria-pressed', String(value));
  placeBtn.textContent = value ? 'Tap arena' : 'Place target';
  canvas.classList.toggle('targeting', value);
  hint.textContent = value
    ? 'Tap or drag an open spot to move the target'
    : 'Drag to orbit · Pinch or scroll to zoom';
}
placeBtn.addEventListener('click', () => {
  setPlacing(!placing);
  if (placing && innerWidth < 1000) setControls(false);
});
function updateCamera() {
  const cp = Math.cos(pitch),
    sp = Math.sin(pitch);
  camera.position.set(
    Math.sin(yaw) * cp * distance * zoom,
    sp * distance * zoom,
    Math.cos(yaw) * cp * distance * zoom,
  );
  camera.lookAt(0, 0, 0);
}
function fitCamera() {
  const vertical = THREE.MathUtils.degToRad(camera.fov / 2);
  const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
  distance = 33 / Math.sin(Math.min(vertical, horizontal));
  updateCamera();
}
function setTopView(value) {
  topView = value;
  pitch = value ? Math.PI / 2 - 0.001 : 0.93;
  yaw = 0;
  document.querySelector('#viewTop').setAttribute('aria-pressed', String(value));
  document.querySelector('#viewTop').textContent = value ? '3D view' : 'Top view';
  updateCamera();
}
document.querySelector('#viewTop').addEventListener('click', () => setTopView(!topView));
document.querySelector('#viewReset').addEventListener('click', () => {
  zoom = 1;
  setTopView(false);
  fitCamera();
});
function moveTarget(e) {
  const r = canvas.getBoundingClientRect();
  mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(mouse, camera);
  const hit = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(plane, hit)) {
    const radius = Math.hypot(hit.x, hit.z);
    if (radius > 27) hit.multiplyScalar(27 / radius);
    for (const o of obstacleData) {
      const dx = hit.x - o.x,
        dz = hit.z - o.z,
        d = Math.hypot(dx, dz);
      if (d < o.r + 1) {
        hit.x = o.x + (d ? dx / d : 1) * (o.r + 1);
        hit.z = o.z + (d ? dz / d : 0) * (o.r + 1);
      }
    }
    hit.y = 0.55;
    target.position.copy(hit);
  }
}
const pointers = new Map();
let pinchDistance = 0,
  usedPinch = false;
function span() {
  const p = [...pointers.values()];
  return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
}
canvas.addEventListener('pointerdown', (e) => {
  if (pointers.size === 0) usedPinch = false;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  canvas.setPointerCapture(e.pointerId);
  if (pointers.size === 2) {
    pinchDistance = span();
    usedPinch = true;
  }
  if (placing && pointers.size === 1) moveTarget(e);
});
canvas.addEventListener('pointermove', (e) => {
  const old = pointers.get(e.pointerId);
  if (!old) return;
  const dx = e.clientX - old.x,
    dy = e.clientY - old.y;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const next = span();
    zoom = THREE.MathUtils.clamp((zoom * pinchDistance) / Math.max(1, next), 0.45, 1.8);
    pinchDistance = next;
    updateCamera();
    return;
  }
  if (usedPinch) return;
  if (placing) {
    moveTarget(e);
    return;
  }
  yaw -= dx * 0.006;
  pitch = THREE.MathUtils.clamp(pitch + dy * 0.006, 0.35, Math.PI / 2 - 0.001);
  updateCamera();
});
function releasePointer(e) {
  pointers.delete(e.pointerId);
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  if (!pointers.size && placing && !usedPinch && e.type === 'pointerup') setPlacing(false);
}
canvas.addEventListener('pointerup', releasePointer);
canvas.addEventListener('pointercancel', releasePointer);
canvas.addEventListener('lostpointercapture', (e) => pointers.delete(e.pointerId));
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    zoom = THREE.MathUtils.clamp(zoom + e.deltaY * 0.001, 0.45, 1.8);
    updateCamera();
  },
  { passive: false },
);
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    setPlacing(false);
    setControls(false);
    controlsToggle.focus();
    return;
  }
  if (e.target.closest('input,select,button,textarea') || e.ctrlKey || e.metaKey || e.altKey)
    return;
  if (e.code === 'Space') {
    e.preventDefault();
    togglePause();
  }
  if (e.key.toLowerCase() === 'r') reset();
});
function updateStats() {
  let speed = 0,
    near = 0;
  for (let i = 0; i < N; i++) {
    speed += velocities[i].length();
    if (positions[i].distanceTo(target.position) < 4) near++;
  }
  document.querySelector('#speedStat').textContent = (speed / N).toFixed(2);
  document.querySelector('#collisionStat').textContent = collisions;
  document.querySelector('#goalStat').textContent = Math.round((near / N) * 100) + '%';
}

const clock = new THREE.Clock();
let frames = 0,
  lastStats = 0;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.03, clock.getDelta());
  const time = clock.elapsedTime;
  if (!paused) targetCore.rotation.y += dt * 0.8;

  if (!paused) {
    const p = params();
    for (let i = 0; i < N; i++) {
      const pos = positions[i],
        vel = velocities[i];
      const f = fieldAt(pos, i).clone();
      vel.addScaledVector(f, dt);
      vel.multiplyScalar(Math.exp(-p.damping * dt));
      const speed = vel.length();
      if (speed > 7) vel.multiplyScalar(7 / speed);
      pos.addScaledVector(vel, dt);

      const radial = Math.hypot(pos.x, pos.z);
      if (radial > 29) {
        tmp.set(pos.x, 0, pos.z).normalize();
        vel.reflect(tmp).multiplyScalar(0.7);
        pos.x = tmp.x * 28.8;
        pos.z = tmp.z * 28.8;
      }
      for (const o of obstacleData) {
        const dx = pos.x - o.x,
          dz = pos.z - o.z,
          d = Math.hypot(dx, dz);
        if (d < o.r + 0.3) {
          collisions++;
          const nx = dx / (d || 1),
            nz = dz / (d || 1);
          pos.x = o.x + nx * (o.r + 0.35);
          pos.z = o.z + nz * (o.r + 0.35);
          vel.x += nx * 2;
          vel.z += nz * 2;
        }
      }
      const m = agents[i];
      m.position.copy(pos);
      if (vel.lengthSq() > 0.01)
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), vel.clone().normalize());
    }
    trailElapsed += dt;
    if (trailElapsed >= 0.05) {
      updateTrails();
      trailElapsed = 0;
    }
  }
  if (time - lastStats > 0.15) {
    updateStats();
    if (!dev.classList.contains('hidden'))
      dev.textContent = JSON.stringify(
        {
          target: { x: +target.position.x.toFixed(2), z: +target.position.z.toFixed(2) },
          params: params(),
          agents: N,
          collisions,
        },
        null,
        2,
      );
    lastStats = time;
  }

  if (frames++ % 3 === 0 && arrowGroup.visible) {
    for (const a of arrows) {
      const f = fieldAt(a.position).clone();
      f.y = 0;
      const len = Math.min(2.2, 0.35 + f.length() * 0.2);
      if (f.lengthSq() > 0.0001) a.setDirection(f.normalize());
      a.setLength(len, 0.22, 0.1);
    }
  }
  renderer.render(scene, camera);
}
function resize() {
  const { width, height } = viewport.getBoundingClientRect();
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  fitCamera();
}
new ResizeObserver(resize).observe(viewport);
resize();
animate();
