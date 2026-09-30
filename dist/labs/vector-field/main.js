import * as THREE from '../../three.js';
import {
  SwarmLab,
  DEFAULTS,
  FIELD_TYPES,
  SENSORS,
  ROLES,
  FORMATIONS,
  PLAYS,
  CONDITIONS,
  REACTIONS,
  TEAM_COLORS,
  LIMITS,
  validateScript,
  clearPoint,
} from './simulation.js?v=swarm-2';

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

const lab = new SwarmLab();
const $ = (id) => document.getElementById(id);
let selectedSquad = lab.squads[0].id,
  selectedTarget = lab.targets[0].id,
  selectedField = '',
  paused = false,
  placement = null,
  activePane = 'squads';
const squad = () => lab.squads.find((s) => s.id === selectedSquad);
const color = new THREE.Color(),
  dummy = new THREE.Object3D();
const bodyGeo = new THREE.ConeGeometry(0.3, 0.85, 4);
bodyGeo.rotateX(Math.PI / 2);
const droneMesh = new THREE.InstancedMesh(
  bodyGeo,
  new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.48,
    metalness: 0.2,
    emissive: 0x16372f,
    emissiveIntensity: 0.3,
  }),
  LIMITS.agents,
);
droneMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
droneMesh.castShadow = true;
droneMesh.frustumCulled = false;
scene.add(droneMesh);
const healthMesh = new THREE.InstancedMesh(
  new THREE.BoxGeometry(0.7, 0.045, 0.07),
  new THREE.MeshBasicMaterial({ color: 0x9df3d5 }),
  LIMITS.agents,
);
healthMesh.frustumCulled = false;
scene.add(healthMesh);
const selectionRing = new THREE.Mesh(
  new THREE.TorusGeometry(1, 0.045, 6, 48),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }),
);
selectionRing.rotation.x = Math.PI / 2;
scene.add(selectionRing);
const targetVisuals = new Map(),
  fieldVisuals = new Map(),
  labels = new Map();
const history = new Map(),
  TRAIL_STEPS = 16;
const trailPositions = new Float32Array(LIMITS.agents * TRAIL_STEPS * 6),
  trailColors = new Float32Array(trailPositions.length);
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute(
  'position',
  new THREE.BufferAttribute(trailPositions, 3).setUsage(THREE.DynamicDrawUsage),
);
trailGeo.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
const trails = new THREE.LineSegments(
  trailGeo,
  new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.52 }),
);
trails.frustumCulled = false;
scene.add(trails);
const shotPositions = new Float32Array(LIMITS.agents * 6),
  shotColors = new Float32Array(shotPositions.length),
  shotGeo = new THREE.BufferGeometry();
shotGeo.setAttribute('position', new THREE.BufferAttribute(shotPositions, 3));
shotGeo.setAttribute('color', new THREE.BufferAttribute(shotColors, 3));
const beams = new THREE.LineSegments(
  shotGeo,
  new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }),
);
beams.frustumCulled = false;
scene.add(beams);
const arrowGroup = new THREE.Group(),
  arrows = [];
scene.add(arrowGroup);
for (let x = -24; x <= 24; x += 6)
  for (let z = -24; z <= 24; z += 6) {
    const a = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(x, 0.08, z),
      1,
      0x7097a0,
      0.22,
      0.1,
    );
    a.line.material.transparent = true;
    a.line.material.opacity = 0.45;
    a.cone.material.transparent = true;
    a.cone.material.opacity = 0.5;
    arrowGroup.add(a);
    arrows.push(a);
  }
function disposeGroup(group) {
  group.traverse((o) => {
    o.geometry?.dispose();
    if (o.material)
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
  });
  scene.remove(group);
}
function labelFor(id, kind) {
  if (!labels.has(id)) {
    const el = document.createElement('span');
    el.className = `arena-label ${kind}-label`;
    $('arenaLabels').append(el);
    labels.set(id, el);
  }
  return labels.get(id);
}
function syncObjects() {
  for (const [id, g] of targetVisuals)
    if (!lab.targets.some((t) => t.id === id)) {
      disposeGroup(g);
      targetVisuals.delete(id);
    }
  for (const [id, g] of fieldVisuals)
    if (!lab.fields.some((f) => f.id === id)) {
      disposeGroup(g);
      fieldVisuals.delete(id);
    }
  for (const [id, el] of labels)
    if (![...lab.targets, ...lab.fields, ...lab.squads].some((o) => o.id === id)) {
      el.remove();
      labels.delete(id);
    }
  for (const t of lab.targets) {
    if (!targetVisuals.has(t.id)) {
      const g = new THREE.Group();
      const m = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.65),
        new THREE.MeshStandardMaterial({
          color: 0xffce73,
          emissive: 0xf3a93c,
          emissiveIntensity: 0.7,
        }),
      );
      g.add(m);
      const r = new THREE.Mesh(
        new THREE.TorusGeometry(1.2, 0.06, 8, 48),
        new THREE.MeshBasicMaterial({ color: 0xffce73 }),
      );
      r.rotation.x = Math.PI / 2;
      g.add(r);
      scene.add(g);
      targetVisuals.set(t.id, g);
    }
    targetVisuals.get(t.id).position.set(t.x, 0.5, t.z);
    labelFor(t.id, 'target');
  }
  for (const f of lab.fields) {
    if (!fieldVisuals.has(f.id)) {
      const g = new THREE.Group();
      const disk = new THREE.Mesh(
        new THREE.CircleGeometry(1, 64),
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0.1,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      disk.rotation.x = -Math.PI / 2;
      disk.position.y = 0.04;
      g.add(disk);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1, 0.012, 6, 96),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8 }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.07;
      g.add(ring);
      const emitter = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.45, 0.8, 8),
        new THREE.MeshStandardMaterial({ roughness: 0.4, emissiveIntensity: 0.7 }),
      );
      emitter.position.y = 0.45;
      g.add(emitter);
      scene.add(g);
      fieldVisuals.set(f.id, g);
    }
    const g = fieldVisuals.get(f.id);
    g.position.set(f.x, 0, f.z);
    g.children[0].scale.setScalar(f.r);
    g.children[1].scale.setScalar(f.r);
    for (const c of g.children) c.material.color.set(FIELD_TYPES[f.type].color);
    g.children[2].material.emissive.set(FIELD_TYPES[f.type].color);
    labelFor(f.id, 'field');
  }
  for (const s of lab.squads) labelFor(s.id, 'squad');
  for (const id of history.keys()) if (!lab.agents.some((a) => a.id === id)) history.delete(id);
}
function renderAgents(sample) {
  droneMesh.count = healthMesh.count = lab.agents.length;
  const squads = new Map(lab.squads.map((s) => [s.id, s]));
  for (let i = 0; i < lab.agents.length; i++) {
    const a = lab.agents[i],
      s = squads.get(a.squad);
    dummy.position.set(a.x, a.alive ? 0.45 : 0.08, a.z);
    dummy.rotation.set(a.alive ? 0 : Math.PI / 2, Math.atan2(a.vx, a.vz), 0);
    dummy.scale.setScalar(a.alive ? 1 : 0.7);
    dummy.updateMatrix();
    droneMesh.setMatrixAt(i, dummy.matrix);
    color.set(
      !a.alive
        ? '#485963'
        : a.stun > 0
          ? '#ffffff'
          : a.jam > 0.3
            ? '#d998ff'
            : a.marked > 0
              ? '#ffcc70'
              : TEAM_COLORS[s.team],
    );
    droneMesh.setColorAt(i, color);
    dummy.position.y = a.alive ? 1.05 : 0.08;
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(Math.max(0, a.hp) / 100, a.alive ? 1 : 0, 1);
    dummy.updateMatrix();
    healthMesh.setMatrixAt(i, dummy.matrix);
    if (!history.has(a.id))
      history.set(
        a.id,
        Array.from({ length: TRAIL_STEPS + 1 }, () => ({ x: a.x, z: a.z })),
      );
    const h = history.get(a.id);
    if (sample) {
      h.unshift({ x: a.x, z: a.z });
      h.length = TRAIL_STEPS + 1;
    }
    const c = new THREE.Color(TEAM_COLORS[s.team]);
    for (let j = 0; j < TRAIL_STEPS; j++) {
      const k = (i * TRAIL_STEPS + j) * 6;
      trailPositions.set([h[j].x, 0.15, h[j].z, h[j + 1].x, 0.15, h[j + 1].z], k);
      const shade = c.clone().multiplyScalar((1 - j / TRAIL_STEPS) * 0.75 + 0.15);
      shade.toArray(trailColors, k);
      shade.toArray(trailColors, k + 3);
    }
  }
  droneMesh.instanceMatrix.needsUpdate = true;
  if (droneMesh.instanceColor) droneMesh.instanceColor.needsUpdate = true;
  healthMesh.instanceMatrix.needsUpdate = true;
  trailGeo.setDrawRange(0, lab.agents.length * TRAIL_STEPS * 2);
  trailGeo.attributes.position.needsUpdate = true;
  trailGeo.attributes.color.needsUpdate = true;
  const shots = lab.shots.slice(-LIMITS.agents);
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    shotPositions.set([s.x, 0.55, s.z, s.tx, 0.55, s.tz], i * 6);
    color.set(TEAM_COLORS[s.team]);
    color.toArray(shotColors, i * 6);
    color.toArray(shotColors, i * 6 + 3);
  }
  shotGeo.setDrawRange(0, shots.length * 2);
  shotGeo.attributes.position.needsUpdate = true;
  shotGeo.attributes.color.needsUpdate = true;
  const selected = squad();
  selectionRing.visible = !!selected;
  if (selected) {
    selectionRing.position.set(selected.anchor.x, 0.1, selected.anchor.z);
    selectionRing.scale.setScalar(2.2);
  }
}
const projected = new THREE.Vector3();
function placeLabel(id, x, z, text, tint) {
  const el = labels.get(id);
  if (!el) return;
  projected.set(x, 1.5, z).project(camera);
  el.hidden = projected.z > 1 || projected.z < -1;
  if (el.hidden) return;
  el.style.left = `${(projected.x * 0.5 + 0.5) * 100}%`;
  el.style.top = `${(-projected.y * 0.5 + 0.5) * 100}%`;
  el.textContent = text;
  if (tint) el.style.borderColor = tint;
}
function renderLabels() {
  for (const s of lab.squads) {
    const members = lab.members(s);
    if (!members.length) {
      labels.get(s.id).hidden = true;
      continue;
    }
    const x = members.reduce((n, a) => n + a.x, 0) / members.length,
      z = members.reduce((n, a) => n + a.z, 0) / members.length;
    placeLabel(s.id, x, z, `${s.name} · ${members.length} · ${s.role}`, TEAM_COLORS[s.team]);
  }
  for (const t of lab.targets) placeLabel(t.id, t.x, t.z, t.name);
  for (const f of lab.fields) {
    placeLabel(
      f.id,
      f.x,
      f.z,
      `${FIELD_TYPES[f.type].label}${!f.enabled ? ' · off' : f.type === 'emp' ? (lab.time % 4 < 2 ? ' · pulse' : ' · idle') : ''}`,
      FIELD_TYPES[f.type].color,
    );
    labels.get(f.id).hidden = !$('showFields').checked;
  }
}
function updateArrows() {
  const s = squad(),
    t = lab.targets.find((t) => t.id === s?.target) || { x: 0, z: 0 };
  for (const a of arrows) {
    const dx = t.x - a.position.x,
      dz = t.z - a.position.z,
      d = Math.hypot(dx, dz) || 1;
    let x =
        (dx / d) * lab.params.attraction -
        ((dz / d) * lab.params.vortex) / (1 + d * 0.12) +
        lab.params.wind,
      z = (dz / d) * lab.params.attraction + ((dx / d) * lab.params.vortex) / (1 + d * 0.12);
    for (const f of lab.fields) {
      if (!f.enabled || (s && !lab.applies(f, s))) continue;
      const dx = a.position.x - f.x,
        dz = a.position.z - f.z,
        d = Math.hypot(dx, dz) || 1,
        k = f.strength * 4 * Math.max(0, 1 - d / f.r);
      if (f.type === 'attract') {
        x -= (dx / d) * k;
        z -= (dz / d) * k;
      }
      if (f.type === 'repel') {
        x += (dx / d) * k;
        z += (dz / d) * k;
      }
      if (f.type === 'vortex') {
        x -= (dz / d) * k;
        z += (dx / d) * k;
      }
    }
    const len = Math.hypot(x, z);
    a.setDirection(new THREE.Vector3(x, 0, z).normalize());
    a.setLength(Math.min(2.5, 0.15 + len * 0.25), 0.2, 0.09);
  }
}
function option(value, label) {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = label;
  return o;
}
function fill(id, entries, value) {
  const el = $(id);
  el.replaceChildren(...entries.map(([v, l]) => option(v, l)));
  if (entries.some(([v]) => v === value)) el.value = value;
}
function title(s) {
  return s[0].toUpperCase() + s.slice(1);
}
fill(
  'fieldType',
  Object.entries(FIELD_TYPES).map(([k, v]) => [k, v.label]),
  'radar',
);
fill(
  'role',
  Object.entries(ROLES).map(([k, v]) => [k, v.label]),
  'scout',
);
fill(
  'sensor',
  Object.entries(SENSORS).map(([k, v]) => [k, v.label]),
  'radar',
);
for (const id of ['squadFormation', 'cueFormation'])
  fill(
    id,
    FORMATIONS.map((s) => [s, title(s)]),
    'wedge',
  );
for (const id of ['play', 'cuePlay'])
  fill(
    id,
    PLAYS.map((s) => [s, title(s)]),
    'move',
  );
fill('ruleWhen', Object.entries(CONDITIONS), 'jammed');
fill('ruleThen', Object.entries(REACTIONS), 'evade');
function toast(text) {
  $('toast').textContent = text;
  toastUntil = performance.now() + 4500;
}
let toastUntil = 0;
const panelTitles = {
  squads: 'Squads & orders',
  fields: 'Place in the arena',
  scripts: 'Reactions & animation',
  forces: 'Shape the flow',
  learn: 'Learn the sandbox',
};
function setPane(pane) {
  activePane = pane;
  document
    .querySelectorAll('[data-panel]')
    .forEach((el) => (el.hidden = el.dataset.panel !== pane));
  document
    .querySelectorAll('[data-pane]')
    .forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.pane === pane)));
  $('panelHeading').textContent = panelTitles[pane];
}
for (const button of document.querySelectorAll('[data-pane]'))
  button.addEventListener('click', () => setPane(button.dataset.pane));
function setControls(open) {
  document.body.classList.toggle('controls-open', open);
  $('inspector').inert = !open;
  $('controlsToggle').setAttribute('aria-expanded', String(open));
  $('controlsToggle').textContent = open ? 'Hide controls' : 'Command';
}
$('controlsToggle').onclick = () => setControls(!document.body.classList.contains('controls-open'));
$('closeControls').onclick = () => {
  setControls(false);
  $('controlsToggle').focus();
};
setControls(matchMedia('(min-width:1000px)').matches);
function refreshLists() {
  if (!squad()) selectedSquad = lab.squads[0]?.id || '';
  if (!lab.targets.some((t) => t.id === selectedTarget)) selectedTarget = lab.targets[0]?.id || '';
  fill(
    'squadSelect',
    lab.squads.map((s) => [
      s.id,
      `${s.name} / ${title(s.team)} / ${lab.members(s, false).length} drones`,
    ]),
    selectedSquad,
  );
  fill(
    'targetSelect',
    lab.targets.map((t) => [t.id, t.name]),
    selectedTarget,
  );
  fill(
    'squadTarget',
    [['', 'Home'], ...lab.targets.map((t) => [t.id, t.name])],
    squad()?.target || '',
  );
  fill(
    'escort',
    [
      ['', 'Choose a teammate'],
      ...lab.squads
        .filter((s) => s.id !== selectedSquad && s.team === squad()?.team)
        .map((s) => [s.id, s.name]),
    ],
    squad()?.escort || '',
  );
  fill(
    'fieldSelect',
    [['', 'New field'], ...lab.fields.map((f) => [f.id, `${f.id} · ${FIELD_TYPES[f.type].label}`])],
    selectedField,
  );
  for (const id of [
    'role',
    'sensor',
    'squadFormation',
    'play',
    'squadTarget',
    'escort',
    'spacing',
    'spin',
    'avoidFields',
    'adaptive',
    'attackOrder',
    'removeSquad',
    'addRule',
    'addCue',
    'timelineToggle',
    'timelineReset',
    'demoTimeline',
    'applyScript',
  ])
    $(id).disabled = !squad();
  $('moveTarget').disabled = $('removeTarget').disabled = !selectedTarget;
  $('moveField').disabled = $('removeField').disabled = !selectedField;
  syncObjects();
}
const roleText = {
  scout: 'Scouts sense farther and fly faster. They do not fire tags.',
  guard: 'Guards tag nearby visible opponents when combat is on.',
  striker: 'Strikers fly faster and deal more tag damage.',
  jammer: 'Jammers disrupt opponents within 6 arena units when combat is on.',
  medic: 'Medics heal active teammates within 5 units. They cannot revive disabled drones.',
  relay: 'Relays support friendly links within 7 units, reducing jamming.',
};
function syncSquad() {
  editingRule = -1;
  $('addRule').textContent = 'Add reaction';
  const s = squad();
  if (!s) return;
  for (const [id, key] of [
    ['role', 'role'],
    ['sensor', 'sensor'],
    ['squadFormation', 'formation'],
    ['play', 'play'],
    ['squadTarget', 'target'],
    ['escort', 'escort'],
    ['spacing', 'spacing'],
    ['spin', 'spin'],
  ])
    $(id).value = s[key];
  $('avoidFields').checked = s.avoidFields;
  $('adaptive').checked = s.adaptive;
  $('spacingOut').textContent = s.spacing.toFixed(1);
  $('spinOut').textContent = s.spin.toFixed(1);
  $('roleHelp').textContent = roleText[s.role];
  $('scriptSquadName').textContent = s.name;
  $('timelineLoop').checked = s.timelineLoop;
  syncScripts();
}
$('squadSelect').onchange = () => {
  selectedSquad = $('squadSelect').value;
  refreshLists();
  syncSquad();
};
for (const [id, key] of [
  ['role', 'role'],
  ['sensor', 'sensor'],
  ['squadFormation', 'formation'],
  ['play', 'play'],
  ['squadTarget', 'target'],
  ['escort', 'escort'],
])
  $(id).onchange = () => {
    if (!squad()) return;
    squad()[key] = $(id).value;
    if (['formation', 'play'].includes(key)) squad().timeline = false;
    lab.log(`${squad().name}: ${key} set to ${$(id).selectedOptions[0].textContent}.`);
    syncSquad();
  };
for (const id of ['spacing', 'spin'])
  $(id).oninput = () => {
    if (!squad()) return;
    squad()[id] = +$(id).value;
    squad().timeline = false;
    $(id + 'Out').textContent = (+$(id).value).toFixed(1);
  };
for (const id of ['avoidFields', 'adaptive'])
  $(id).onchange = () => {
    if (squad()) squad()[id] = $(id).checked;
  };
$('combat').onchange = () => {
  lab.combat = $('combat').checked;
  lab.result = '';
  lab.shots = [];
  toast(
    lab.combat
      ? 'Tag combat enabled. Sensors still determine who can engage.'
      : 'Tag combat off. Zone effects remain active.',
  );
};
$('attackOrder').onclick = () => {
  if (!squad()) return;
  squad().play = 'attack';
  squad().timeline = false;
  syncSquad();
  toast(lab.combat ? 'Attack order set.' : 'Attack order set. Turn on tag combat to engage.');
};
$('removeSquad').onclick = () => {
  lab.removeSquad(selectedSquad);
  refreshLists();
  syncSquad();
};
$('loadScenario').onclick = () => {
  lab.scenario($('scenario').value);
  selectedSquad = lab.squads[0].id;
  selectedTarget = lab.targets[0].id;
  selectedField = '';
  history.clear();
  setPlacement(null);
  $('combat').checked = lab.combat;
  syncForces();
  refreshLists();
  syncSquad();
  syncField();
  toast('Scenario loaded.');
};
$('targetSelect').onchange = () => {
  selectedTarget = $('targetSelect').value;
};
$('removeTarget').onclick = () => {
  lab.removeTarget(selectedTarget);
  refreshLists();
  syncSquad();
};
function syncField() {
  const f = lab.fields.find((f) => f.id === selectedField);
  if (f) {
    $('fieldType').value = f.type;
    $('radius').value = f.r;
    $('strength').value = f.strength;
    $('fieldTeam').value = f.affects;
    $('fieldEnabled').checked = f.enabled;
  }
  $('radiusOut').textContent = (+$('radius').value).toFixed(1);
  $('strengthOut').textContent = (+$('strength').value).toFixed(2);
  $('fieldHelp').textContent = FIELD_TYPES[$('fieldType').value].description;
}
$('fieldSelect').onchange = () => {
  selectedField = $('fieldSelect').value;
  refreshLists();
  syncField();
};
for (const id of ['fieldType', 'radius', 'strength', 'fieldTeam', 'fieldEnabled'])
  $(id).addEventListener(id === 'radius' || id === 'strength' ? 'input' : 'change', () => {
    const f = lab.fields.find((f) => f.id === selectedField);
    if (f)
      Object.assign(f, {
        type: $('fieldType').value,
        r: +$('radius').value,
        strength: +$('strength').value,
        affects: $('fieldTeam').value,
        enabled: $('fieldEnabled').checked,
      });
    syncField();
    syncObjects();
  });
$('removeField').onclick = () => {
  lab.removeField(selectedField);
  selectedField = '';
  refreshLists();
  syncField();
};
const presets = {
  balanced: DEFAULTS,
  orbit: { ...DEFAULTS, attraction: 2.5, vortex: 5, wind: 0, damping: 0.4 },
  gather: { ...DEFAULTS, attraction: 5, vortex: 0, wind: 0, damping: 1.5 },
  wind: { ...DEFAULTS, attraction: 1.8, vortex: 0.5, wind: 2.6, damping: 0.65 },
};
function syncForces() {
  for (const [id, value] of Object.entries(lab.params)) {
    $(id).value = value;
    $(id + 'Out').textContent = value.toFixed(id === 'damping' ? 2 : 1);
  }
}
for (const id of Object.keys(DEFAULTS))
  $(id).oninput = () => {
    lab.params[id] = +$(id).value;
    $(id + 'Out').textContent = (+$(id).value).toFixed(id === 'damping' ? 2 : 1);
    $('preset').value = 'custom';
  };
$('preset').onchange = () => {
  lab.params = { ...presets[$('preset').value] };
  syncForces();
};
$('restore').onclick = () => {
  lab.params = { ...DEFAULTS };
  $('preset').value = 'balanced';
  syncForces();
};
$('vectors').onchange = () => (arrowGroup.visible = $('vectors').checked);
$('trails').onchange = () => (trails.visible = $('trails').checked);
let editingRule = -1;
function publicScript(s) {
  return {
    rules: s.rules.map(({ when, then, threshold, cooldown, enabled }) => ({
      when,
      then,
      threshold,
      cooldown,
      enabled,
    })),
    cues: s.cues.map((c) => ({ ...c })),
  };
}
function listButton(text, action) {
  const b = document.createElement('button');
  b.textContent = text;
  b.onclick = action;
  return b;
}
function syncScripts() {
  const s = squad();
  if (!s) {
    $('ruleList').replaceChildren();
    $('cueList').replaceChildren();
    return;
  }
  $('scriptSource').value = JSON.stringify(publicScript(s), null, 2);
  $('scriptError').textContent = '';
  $('ruleList').replaceChildren(
    ...s.rules.map((r, i) => {
      const row = document.createElement('article');
      row.classList.toggle('disabled', r.enabled === false);
      const p = document.createElement('p');
      p.textContent = `${i + 1}. When ${CONDITIONS[r.when].toLowerCase()}${r.when === 'hurt' ? ` (${r.threshold}%)` : ''}, ${REACTIONS[r.then].toLowerCase()}.`;
      row.append(
        p,
        listButton('Edit', () => {
          editingRule = i;
          $('ruleWhen').value = r.when;
          $('ruleThen').value = r.then;
          $('ruleThreshold').value = r.threshold;
          $('ruleCooldown').value = r.cooldown;
          $('addRule').textContent = 'Save reaction';
        }),
        listButton(r.enabled === false ? 'Enable' : 'Disable', () => {
          r.enabled = r.enabled === false;
          r.wasTrue = false;
          syncScripts();
        }),
        listButton('Up', () => {
          if (i) {
            [s.rules[i - 1], s.rules[i]] = [s.rules[i], s.rules[i - 1]];
            syncScripts();
          }
        }),
        listButton('Remove', () => {
          s.rules.splice(i, 1);
          editingRule = -1;
          $('addRule').textContent = 'Add reaction';
          syncScripts();
        }),
      );
      return row;
    }),
  );
  $('cueList').replaceChildren(
    ...s.cues.map((c, i) => {
      const row = document.createElement('article'),
        p = document.createElement('p');
      p.textContent = `${c.at}s · ${title(c.formation)} / ${c.play} · spacing ${c.spacing} · spin ${c.spin}`;
      row.append(
        p,
        listButton('Edit', () => {
          for (const [id, key] of [
            ['cueAt', 'at'],
            ['cueFormation', 'formation'],
            ['cuePlay', 'play'],
            ['cueSpacing', 'spacing'],
            ['cueSpin', 'spin'],
          ])
            $(id).value = c[key];
        }),
        listButton('Remove', () => {
          s.cues.splice(i, 1);
          syncScripts();
        }),
      );
      return row;
    }),
  );
  s.timelineLength = Math.max(30, ...s.cues.map((c) => c.at + 6));
  $('playhead').max = s.timelineLength;
}
function scriptError(error) {
  $('scriptError').textContent = error.message;
  toast(error.message);
}
$('addRule').onclick = () => {
  const s = squad();
  if (!s) return;
  try {
    const candidate = {
      when: $('ruleWhen').value,
      then: $('ruleThen').value,
      threshold: +$('ruleThreshold').value,
      cooldown: +$('ruleCooldown').value,
      enabled: true,
    };
    const rules = publicScript(s).rules;
    if (editingRule >= 0 && editingRule < rules.length) rules[editingRule] = candidate;
    else rules.push(candidate);
    s.rules = validateScript({ rules, cues: s.cues }).rules;
    editingRule = -1;
    $('addRule').textContent = 'Add reaction';
    syncScripts();
  } catch (e) {
    scriptError(e);
  }
};
$('addCue').onclick = () => {
  const s = squad();
  if (!s) return;
  try {
    const c = {
      at: +$('cueAt').value,
      formation: $('cueFormation').value,
      play: $('cuePlay').value,
      spacing: +$('cueSpacing').value,
      spin: +$('cueSpin').value,
    };
    s.cues = validateScript({
      rules: publicScript(s).rules,
      cues: [...s.cues.filter((x) => x.at !== c.at), c],
    }).cues;
    syncScripts();
  } catch (e) {
    scriptError(e);
  }
};
$('applyScript').onclick = () => {
  const s = squad();
  if (!s) return;
  try {
    const data = validateScript(JSON.parse($('scriptSource').value));
    s.rules = data.rules;
    s.cues = data.cues;
    s.timeline = false;
    s.timelineTime = 0;
    s.overrideUntil = 0;
    syncScripts();
    toast('Script applied to ' + s.name + '.');
  } catch (e) {
    scriptError(e);
  }
};
$('saveScript').onclick = () => {
  if (!squad()) return;
  try {
    localStorage.setItem('fleet-field-script-v2', JSON.stringify(publicScript(squad())));
    toast('Saved this squad script on this device.');
  } catch (e) {
    toast('This browser could not save the script. Keep a copy of the JSON text.');
  }
};
$('loadScript').onclick = () => {
  if (!squad()) return;
  try {
    const raw = localStorage.getItem('fleet-field-script-v2');
    if (!raw) {
      toast('No saved script on this device.');
      return;
    }
    const data = validateScript(JSON.parse(raw));
    Object.assign(squad(), data, { timeline: false, timelineTime: 0, overrideUntil: 0 });
    syncScripts();
    toast('Saved script loaded into ' + squad().name + '.');
  } catch (e) {
    scriptError(e);
  }
};
$('demoTimeline').onclick = () => {
  const s = squad();
  if (!s) return;
  s.cues = [
    { at: 0, formation: 'ring', play: 'move', spacing: 1.2, spin: 0.4 },
    { at: 8, formation: 'wedge', play: 'move', spacing: 1.7, spin: 0 },
    { at: 16, formation: 'grid', play: 'move', spacing: 1.4, spin: -0.3 },
    { at: 24, formation: 'spiral', play: 'orbit', spacing: 1.1, spin: 0.6 },
  ];
  s.timelineTime = 0;
  s.timeline = false;
  syncScripts();
  toast('Example loaded. Press Play timeline.');
};
$('timelineToggle').onclick = () => {
  const s = squad();
  if (!s) return;
  if (!s.cues.length) {
    toast('Add cues or load the example first.');
    return;
  }
  s.timeline = !s.timeline;
  if (s.timelineTime >= s.timelineLength) s.timelineTime = 0;
};
$('timelineReset').onclick = () => {
  const s = squad();
  if (!s) return;
  s.timelineTime = 0;
  s.heading = 0;
  s.overrideUntil = 0;
  lab.applyTimeline(s);
  syncSquad();
};
$('timelineLoop').onchange = () => {
  if (squad()) squad().timelineLoop = $('timelineLoop').checked;
};
$('playhead').oninput = () => {
  const s = squad();
  if (!s) return;
  s.timeline = false;
  s.timelineTime = +$('playhead').value;
  s.overrideUntil = 0;
  lab.applyTimeline(s);
  $('playheadOut').textContent = s.timelineTime.toFixed(1) + ' s';
};

let yaw = 0,
  pitch = 0.93,
  distance = 80,
  zoom = 1,
  topView = false;
const raycaster = new THREE.Raycaster(),
  mouse = new THREE.Vector2(),
  plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function updateCamera() {
  const cp = Math.cos(pitch),
    sp = Math.sin(pitch);
  camera.position.set(
    Math.sin(yaw) * cp * distance * zoom,
    sp * distance * zoom,
    Math.cos(yaw) * cp * distance * zoom,
  );
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
}
function fitCamera() {
  const vertical = THREE.MathUtils.degToRad(camera.fov / 2),
    horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
  distance = 33 / Math.sin(Math.min(vertical, horizontal));
  updateCamera();
}
function setTopView(value) {
  topView = value;
  pitch = value ? Math.PI / 2 - 0.001 : 0.93;
  yaw = 0;
  $('viewTop').setAttribute('aria-pressed', String(value));
  $('viewTop').textContent = value ? '3D view' : 'Top view';
  updateCamera();
}
$('viewTop').onclick = () => setTopView(!topView);
$('viewReset').onclick = () => {
  zoom = 1;
  setTopView(false);
  fitCamera();
};
function setPlacement(mode) {
  placement = mode;
  canvas.classList.toggle('targeting', !!mode);
  $('placeTarget').textContent = mode ? 'Cancel placement' : 'Place objects';
  $('gestureHint').textContent = mode
    ? `Tap arena to ${mode.label}. Drag still orbits; pinch still zooms.`
    : 'Drag to orbit · Pinch to zoom · Tap a squad to select';
  if (mode && innerWidth < 1000) setControls(false);
}
$('placeTarget').onclick = () => {
  if (placement) setPlacement(null);
  else {
    setPane('fields');
    setControls(true);
  }
};
$('addTarget').onclick = () => setPlacement({ kind: 'addTarget', label: 'add a target' });
$('moveTarget').onclick = () =>
  setPlacement({ kind: 'moveTarget', id: selectedTarget, label: 'move the selected target' });
$('addField').onclick = () =>
  setPlacement({
    kind: 'addField',
    type: $('fieldType').value,
    r: +$('radius').value,
    strength: +$('strength').value,
    affects: $('fieldTeam').value,
    label: 'place ' + FIELD_TYPES[$('fieldType').value].label.toLowerCase(),
  });
$('moveField').onclick = () =>
  setPlacement({ kind: 'moveField', id: selectedField, label: 'move the selected field' });
$('spawnSquad').onclick = () => {
  const count = +$('spawnCount').value;
  if (!Number.isInteger(count) || count < 4 || count > 60) {
    toast('Choose 4–60 drones.');
    return;
  }
  setPlacement({
    kind: 'squad',
    team: $('spawnTeam').value,
    count,
    role: squad()?.role || 'scout',
    formation: squad()?.formation || 'wedge',
    label: 'deploy the new squad',
  });
};
function pointAt(e) {
  const r = canvas.getBoundingClientRect();
  mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(mouse, camera);
  const hit = new THREE.Vector3();
  return raycaster.ray.intersectPlane(plane, hit) ? hit : null;
}
function clickArena(e) {
  const hit = pointAt(e);
  if (!hit) return;
  const p = clearPoint(hit.x, hit.z, 1);
  if (placement) {
    const mode = placement;
    let success = true;
    if (mode.kind === 'addTarget') {
      const t = lab.addTarget(p.x, p.z);
      if (t) selectedTarget = t.id;
      else success = false;
    }
    if (mode.kind === 'moveTarget') {
      const t = lab.targets.find((t) => t.id === mode.id);
      if (t) Object.assign(t, p);
    }
    if (mode.kind === 'addField') {
      const f = lab.addField(mode.type, p.x, p.z, mode.r, mode.strength, mode.affects);
      if (f) selectedField = f.id;
      else success = false;
    }
    if (mode.kind === 'moveField') {
      const f = lab.fields.find((f) => f.id === mode.id);
      if (f) Object.assign(f, p);
    }
    if (mode.kind === 'squad') {
      const s = lab.addSquad(mode.team, mode.count, mode.role, p.x, p.z);
      if (s) {
        s.formation = mode.formation;
        selectedSquad = s.id;
      } else success = false;
    }
    setPlacement(null);
    refreshLists();
    syncSquad();
    syncField();
    toast(
      success
        ? 'Placement complete. Open Command to edit.'
        : 'Limit reached. Remove an item before adding another.',
    );
    return;
  }
  const field = lab.fields.find((f) => Math.hypot(hit.x - f.x, hit.z - f.z) < 1.4);
  if (field) {
    selectedField = field.id;
    refreshLists();
    syncField();
    setPane('fields');
    setControls(true);
    return;
  }
  const a = lab.agents
    .filter((a) => a.alive)
    .sort((a, b) => Math.hypot(hit.x - a.x, hit.z - a.z) - Math.hypot(hit.x - b.x, hit.z - b.z))[0];
  if (a && Math.hypot(hit.x - a.x, hit.z - a.z) < 2) {
    selectedSquad = a.squad;
    refreshLists();
    syncSquad();
    setPane('squads');
    setControls(true);
  }
}
const pointers = new Map();
let pinchDistance = 0,
  usedPinch = false,
  dragDistance = 0;
function span() {
  const p = [...pointers.values()];
  return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
}
canvas.addEventListener('pointerdown', (e) => {
  if (!pointers.size) {
    usedPinch = false;
    dragDistance = 0;
  }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  canvas.setPointerCapture(e.pointerId);
  if (pointers.size === 2) {
    pinchDistance = span();
    usedPinch = true;
  }
});
canvas.addEventListener('pointermove', (e) => {
  const old = pointers.get(e.pointerId);
  if (!old) return;
  const dx = e.clientX - old.x,
    dy = e.clientY - old.y;
  dragDistance += Math.hypot(dx, dy);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const next = span();
    zoom = THREE.MathUtils.clamp((zoom * pinchDistance) / Math.max(1, next), 0.45, 1.8);
    pinchDistance = next;
    updateCamera();
    return;
  }
  if (usedPinch) return;
  yaw -= dx * 0.006;
  pitch = THREE.MathUtils.clamp(pitch + dy * 0.006, 0.35, Math.PI / 2 - 0.001);
  updateCamera();
});
function releasePointer(e) {
  const wasTracked = pointers.has(e.pointerId);
  pointers.delete(e.pointerId);
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  if (wasTracked && !pointers.size && !usedPinch && dragDistance < 7 && e.type === 'pointerup')
    clickArena(e);
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
function reset() {
  lab.reset();
  history.clear();
  renderAgents(false);
  syncScripts();
}
function togglePause() {
  paused = !paused;
  $('pause').textContent = paused ? 'Resume' : 'Pause';
  $('pause').setAttribute('aria-pressed', String(paused));
  $('runState').textContent = paused ? 'Paused' : 'Running';
  $('runState').classList.toggle('paused', paused);
}
$('reset').onclick = reset;
$('pause').onclick = togglePause;
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    setPlacement(null);
    setControls(false);
    $('controlsToggle').focus();
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
function updateReadouts() {
  const summary = lab.summary(),
    s = squad();
  $('activeStat').textContent = `${summary.active}/${summary.total}`;
  $('jamStat').textContent = summary.jammed;
  $('downStat').textContent = summary.down;
  $('speedStat').textContent = summary.speed.toFixed(1);
  $('sceneCount').textContent =
    `${lab.squads.length} squads / ${lab.targets.length} targets / ${lab.fields.length} fields`;
  $('battleResult').hidden = !summary.result;
  $('battleResult').textContent = summary.result;
  if (s) {
    const members = lab.members(s),
      all = lab.members(s, false);
    $('squadReadout').textContent =
      `${s.name} · ${s.state}\n${members.length}/${all.length} active · ${Math.round(members.reduce((v, a) => v + a.hp, 0) / (members.length || 1))}% avg health · ${s.aware.size} known fields`;
    $('lastReaction').textContent = s.lastReaction;
    $('learnLive').textContent =
      `${s.name} is ${s.state.toLowerCase()}. It has the ${s.role} role, uses ${s.sensor} sensing and is following the ${s.play} play in ${s.formation} formation.\n${s.lastReaction}`;
    $('timelineToggle').textContent = s.timeline ? 'Pause timeline' : 'Play timeline';
    $('timelineToggle').setAttribute('aria-pressed', String(s.timeline));
    if (document.activeElement !== $('playhead')) $('playhead').value = s.timelineTime;
    $('playheadOut').textContent = s.timelineTime.toFixed(1) + ' s';
    if (document.activeElement !== $('squadFormation')) $('squadFormation').value = s.formation;
    if (document.activeElement !== $('play')) $('play').value = s.play;
    $('devPanel').textContent = JSON.stringify(
      {
        time: +lab.time.toFixed(1),
        selected: s.name,
        role: s.role,
        play: s.play,
        formation: s.formation,
        state: s.state,
        knownFields: [...s.aware],
        lastReaction: s.lastReaction,
        forces: lab.params,
        summary,
      },
      null,
      2,
    );
  } else {
    $('squadReadout').textContent = 'No squads. Deploy a new squad below.';
    $('learnLive').textContent = 'Deploy a squad to observe its decisions.';
  }
  $('eventLog').replaceChildren(
    ...lab.events.map((e) => {
      const p = document.createElement('p');
      p.textContent = `${e.time.toFixed(1)}s · ${e.text}`;
      return p;
    }),
  );
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
refreshLists();
syncSquad();
syncField();
syncForces();
resize();
const clock = new THREE.Clock();
let accumulator = 0,
  trailClock = 0,
  uiClock = 0;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.1, clock.getDelta());
  if (!paused) {
    accumulator += dt;
    while (accumulator >= 1 / 60) {
      lab.step(1 / 60);
      accumulator -= 1 / 60;
    }
  } else accumulator = 0;
  trailClock += dt;
  uiClock += dt;
  renderAgents(!paused && trailClock >= 0.06);
  if (trailClock >= 0.06) trailClock = 0;
  for (const f of lab.fields) {
    const g = fieldVisuals.get(f.id);
    g.visible = $('showFields').checked;
    g.children[0].material.opacity = !f.enabled
      ? 0.015
      : f.type === 'emp' && lab.time % 4 >= 2
        ? 0.025
        : 0.11;
    g.children[1].material.opacity = f.enabled ? 0.8 : 0.2;
  }
  for (const t of targetVisuals.values()) if (!paused) t.children[0].rotation.y += dt * 0.6;
  if (uiClock > 0.2) {
    updateReadouts();
    if (arrowGroup.visible) updateArrows();
    uiClock = 0;
  }
  renderer.render(scene, camera);
  renderLabels();
  if (performance.now() > toastUntil) $('toast').textContent = '';
}
animate();
