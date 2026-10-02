// Procedural structure models. Each returns { group, spin: [...animated parts], glow: [...] }.
// Glow parts use a per-team HDR material so they bloom in the team color.

import * as T from '../../three.js?v=0.9.0';

const M = {
  base: new T.MeshStandardMaterial({
    color: '#2a333d',
    roughness: 0.7,
    metalness: 0.4,
    flatShading: true,
  }),
  plate: new T.MeshStandardMaterial({
    color: '#4b5866',
    roughness: 0.55,
    metalness: 0.5,
    flatShading: true,
  }),
  light: new T.MeshStandardMaterial({
    color: '#8996a6',
    roughness: 0.45,
    metalness: 0.6,
    flatShading: true,
  }),
  dark: new T.MeshStandardMaterial({
    color: '#14191f',
    roughness: 0.8,
    metalness: 0.3,
    flatShading: true,
  }),
};
const glowCache = new Map();
export function glowMaterial(color, intensity = 3) {
  const key = color + intensity;
  if (!glowCache.has(key)) {
    const c = new T.Color(color).multiplyScalar(intensity);
    glowCache.set(key, new T.MeshBasicMaterial({ color: c }));
  }
  return glowCache.get(key);
}
const holoCache = new Map();
function holoMaterial(color) {
  if (!holoCache.has(color))
    holoCache.set(
      color,
      new T.MeshBasicMaterial({
        color: new T.Color(color).multiplyScalar(1.6),
        wireframe: true,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
  return holoCache.get(color);
}

function add(group, geo, mat, x = 0, y = 0, z = 0, ry = 0) {
  const m = new T.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

const BUILD = {
  core(g, glow, spin) {
    add(g, new T.CylinderGeometry(3.4, 3.8, 0.7, 8), M.base, 0, 0.35);
    add(g, new T.CylinderGeometry(2.6, 3.0, 0.5, 8), M.plate, 0, 0.95);
    add(g, new T.CylinderGeometry(0.9, 1.4, 3.2, 6), M.light, 0, 2.6);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      add(
        g,
        new T.BoxGeometry(0.5, 2.4, 0.5),
        M.plate,
        Math.cos(a) * 2.3,
        2.1,
        Math.sin(a) * 2.3,
        -a,
      );
      add(g, new T.BoxGeometry(0.2, 0.2, 0.2), glow, Math.cos(a) * 2.3, 3.4, Math.sin(a) * 2.3);
    }
    const reactor = add(g, new T.IcosahedronGeometry(0.75, 0), glow, 0, 4.7);
    reactor.castShadow = false;
    spin.push({ obj: reactor, rate: 0.8, pulse: true });
    const halo = add(g, new T.TorusGeometry(1.7, 0.07, 4, 32), glow, 0, 4.7);
    halo.rotation.x = Math.PI / 2.4;
    spin.push({ obj: halo, rate: 0.5, axis: 'z' });
    add(g, new T.TorusGeometry(3.15, 0.06, 4, 8), glow, 0, 0.72).rotation.x = Math.PI / 2;
  },
  fabricator(g, glow, spin) {
    add(g, new T.BoxGeometry(4.2, 0.4, 3.6), M.base, 0, 0.2);
    add(g, new T.BoxGeometry(3.4, 1.8, 2.8), M.plate, 0, 1.3);
    const roof = add(g, new T.CylinderGeometry(1.6, 1.6, 3.4, 3, 1, false), M.light, 0, 2.3);
    roof.rotation.z = Math.PI / 2;
    roof.scale.set(1, 1, 0.55);
    add(g, new T.BoxGeometry(2.4, 0.12, 0.05), glow, 0, 1.0, 1.42);
    add(g, new T.BoxGeometry(2.4, 0.12, 0.05), glow, 0, 0.6, 1.42);
    const arm = new T.Group();
    arm.position.set(1.4, 3.0, -0.8);
    g.add(arm);
    add(arm, new T.BoxGeometry(0.2, 0.2, 2.2), M.dark, 0, 0, 0.8);
    add(arm, new T.BoxGeometry(0.12, 0.12, 0.12), glow, 0, -0.15, 1.85);
    spin.push({ obj: arm, rate: 0.6, swing: 1.2 });
  },
  extractor(g, glow, spin) {
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const leg = add(
        g,
        new T.BoxGeometry(0.22, 3.4, 0.22),
        M.plate,
        Math.cos(a) * 1.0,
        1.5,
        Math.sin(a) * 1.0,
      );
      leg.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
    }
    add(g, new T.CylinderGeometry(0.5, 0.5, 0.4, 6), M.light, 0, 3.1);
    const piston = add(g, new T.CylinderGeometry(0.22, 0.22, 2.2, 6), M.dark, 0, 1.6);
    spin.push({ obj: piston, bob: 0.45, rate: 2.2 });
    const core = add(
      g,
      new T.CylinderGeometry(0.35, 0.35, 0.5, 8),
      glowMaterial('#ffc65a', 4),
      0,
      0.3,
    );
    core.castShadow = false;
    add(g, new T.TorusGeometry(1.3, 0.06, 4, 6), glow, 0, 0.15).rotation.x = Math.PI / 2;
  },
  relay(g, glow, spin) {
    add(g, new T.CylinderGeometry(0.8, 1.0, 0.4, 6), M.base, 0, 0.2);
    add(g, new T.CylinderGeometry(0.12, 0.28, 6, 4), M.plate, 0, 3.2);
    for (const y of [2.2, 3.6, 5.0])
      add(g, new T.BoxGeometry(1.2 - y * 0.1, 0.08, 0.08), M.light, 0, y, 0, y);
    const beacon = add(g, new T.OctahedronGeometry(0.32, 0), glow, 0, 6.6);
    beacon.castShadow = false;
    spin.push({ obj: beacon, rate: 1.5, pulse: true });
  },
  radar(g, glow, spin) {
    add(g, new T.CylinderGeometry(1.0, 1.2, 0.6, 6), M.base, 0, 0.3);
    add(g, new T.CylinderGeometry(0.2, 0.3, 1.6, 6), M.plate, 0, 1.3);
    const head = new T.Group();
    head.position.y = 2.2;
    g.add(head);
    const dish = add(
      head,
      new T.SphereGeometry(1.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 3.2),
      M.light,
      0,
      0,
      0.3,
    );
    dish.rotation.x = -Math.PI / 2.4;
    add(head, new T.CylinderGeometry(0.04, 0.04, 1.0, 4), M.dark, 0, 0.2, 0.6).rotation.x =
      Math.PI / 2.5;
    add(head, new T.SphereGeometry(0.12, 6, 4), glow, 0, 0.4, 1.05);
    spin.push({ obj: head, rate: 1.6 });
  },
  jammer(g, glow, spin) {
    add(g, new T.CylinderGeometry(1.0, 1.3, 0.6, 5), M.base, 0, 0.3);
    add(g, new T.CylinderGeometry(0.3, 0.45, 2.6, 5), M.plate, 0, 1.9);
    [1.4, 2.3, 3.2].forEach((y, k) => {
      const ring = add(g, new T.TorusGeometry(0.9 - k * 0.15, 0.06, 4, 5), glow, 0, y);
      ring.rotation.x = Math.PI / 2;
      spin.push({ obj: ring, rate: k % 2 ? -2.4 : 1.8, axis: 'z' });
    });
    add(g, new T.SphereGeometry(0.22, 6, 4), glow, 0, 3.4);
  },
  turret(g, glow, spin) {
    add(g, new T.CylinderGeometry(1.4, 1.8, 0.7, 6), M.base, 0, 0.35);
    const top = new T.Group();
    top.position.y = 0.9;
    g.add(top);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const prong = add(
        top,
        new T.ConeGeometry(0.25, 2.0, 4),
        M.plate,
        Math.cos(a) * 0.9,
        0.9,
        Math.sin(a) * 0.9,
      );
      prong.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
    }
    const crystal = add(top, new T.OctahedronGeometry(0.45, 0), glowMaterial('#ff5040', 4), 0, 1.6);
    crystal.castShadow = false;
    spin.push({ obj: top, rate: 0.7 });
    spin.push({ obj: crystal, rate: 2, pulse: true });
  },
  repair(g, glow, spin) {
    add(g, new T.CylinderGeometry(1.6, 1.8, 0.35, 8), M.base, 0, 0.18);
    add(g, new T.CylinderGeometry(1.2, 1.2, 0.12, 8), M.plate, 0, 0.42);
    const cross = new T.Group();
    cross.position.y = 2.0;
    g.add(cross);
    const gm = glowMaterial('#62ffb0', 3);
    add(cross, new T.BoxGeometry(1.2, 0.36, 0.36), gm);
    add(cross, new T.BoxGeometry(0.36, 1.2, 0.36), gm);
    spin.push({ obj: cross, rate: 0.9, bob: 0.25 });
    add(g, new T.TorusGeometry(1.4, 0.05, 4, 24), glow, 0, 0.5).rotation.x = Math.PI / 2;
  },
};

Object.assign(BUILD, {
  charger(g, glow, spin) {
    add(g, new T.CylinderGeometry(2.0, 2.2, 0.3, 6), M.base, 0, 0.15);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      add(
        g,
        new T.BoxGeometry(0.25, 1.4, 0.25),
        M.plate,
        Math.cos(a) * 1.6,
        0.85,
        Math.sin(a) * 1.6,
      );
      add(g, new T.BoxGeometry(0.3, 0.12, 0.3), glow, Math.cos(a) * 1.6, 1.6, Math.sin(a) * 1.6);
    }
    const coil = add(g, new T.TorusGeometry(0.9, 0.12, 6, 16), glowMaterial('#8ff0ff', 3), 0, 0.9);
    coil.rotation.x = Math.PI / 2;
    coil.castShadow = false;
    spin.push({ obj: coil, rate: 2, bob: 0.3 });
    add(g, new T.TorusGeometry(1.9, 0.05, 4, 6), glow, 0, 0.32).rotation.x = Math.PI / 2;
  },
  lab(g, glow, spin) {
    add(g, new T.BoxGeometry(4, 0.4, 3.4), M.base, 0, 0.2);
    add(g, new T.CylinderGeometry(1.3, 1.5, 1.6, 8), M.plate, -0.7, 1.2);
    const dome = add(
      g,
      new T.SphereGeometry(1.3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      M.light,
      -0.7,
      2.0,
    );
    dome.scale.y = 0.7;
    add(g, new T.BoxGeometry(1.3, 1.1, 1.4), M.plate, 1.2, 0.95, 0.3);
    const orb = add(g, new T.IcosahedronGeometry(0.35, 1), glowMaterial('#b48cff', 4), -0.7, 3.2);
    orb.castShadow = false;
    spin.push({ obj: orb, rate: 1.2, bob: 0.2, pulse: true });
    const ring = add(g, new T.TorusGeometry(0.7, 0.04, 4, 24), glow, -0.7, 3.2);
    ring.rotation.x = 1.1;
    spin.push({ obj: ring, rate: 1.6 });
  },
});

export function buildStructure(kind, teamColor) {
  const group = new T.Group();
  const glow = glowMaterial(teamColor, 3.2);
  const spin = [];
  BUILD[kind](group, glow, spin);
  // Hologram copy shown while under construction.
  const holo = group.clone();
  holo.traverse((o) => {
    if (o.isMesh) {
      o.material = holoMaterial(teamColor);
      o.castShadow = false;
    }
  });
  return { group, holo, spin };
}

// Neutral objectives. Glow parts are returned so the owner's color can be applied.
export function buildObjective(kind) {
  const g = new T.Group();
  const glowMat = new T.MeshBasicMaterial({ color: new T.Color(2, 2, 2.2) });
  const glow = [];
  const spin = [];
  if (kind === 'spire') {
    add(g, new T.CylinderGeometry(2.6, 3.0, 0.6, 6), M.base, 0, 0.3);
    add(g, new T.CylinderGeometry(0.5, 1.2, 9, 5), M.plate, 0, 5);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const fin = add(
        g,
        new T.BoxGeometry(0.2, 6, 1.0),
        M.light,
        Math.cos(a) * 0.9,
        4,
        Math.sin(a) * 0.9,
      );
      fin.rotation.y = -a;
    }
    const crystal = add(g, new T.OctahedronGeometry(0.9, 0), glowMat, 0, 10.5);
    crystal.scale.y = 1.8;
    crystal.castShadow = false;
    glow.push(crystal);
    spin.push({ obj: crystal, rate: 0.8, bob: 0.3 });
    const ring = add(g, new T.TorusGeometry(1.6, 0.08, 4, 24), glowMat, 0, 9.4);
    ring.rotation.x = Math.PI / 2;
    glow.push(ring);
    spin.push({ obj: ring, rate: -1.2, axis: 'z' });
  } else {
    add(g, new T.BoxGeometry(7, 0.5, 5.5), M.base, 0, 0.25);
    add(g, new T.BoxGeometry(5.5, 3, 4), M.dark, -0.5, 1.9);
    add(g, new T.BoxGeometry(1.2, 4.5, 1.2), M.plate, 2.8, 2.6, -1.6);
    add(g, new T.BoxGeometry(1.2, 4.5, 1.2), M.plate, 2.8, 2.6, 1.6);
    const roof = add(g, new T.CylinderGeometry(2.2, 2.2, 5.5, 3), M.light, -0.5, 3.6);
    roof.rotation.z = Math.PI / 2;
    roof.scale.set(1, 1, 0.5);
    const door = add(g, new T.BoxGeometry(0.1, 1.6, 3), glowMat, 2.26, 1.2);
    glow.push(door);
    const lamp = add(g, new T.SphereGeometry(0.3, 8, 6), glowMat, 2.8, 5.1, -1.6);
    glow.push(lamp);
    spin.push({ obj: lamp, rate: 3, pulse: true });
  }
  return { group: g, glowMat, spin };
}

export function buildWell() {
  const g = new T.Group();
  const gold = glowMaterial('#ffc65a', 2.2);
  const pad = add(
    g,
    new T.CylinderGeometry(2.4, 2.7, 0.25, 6),
    new T.MeshStandardMaterial({ color: '#3a3326', roughness: 0.8, flatShading: true }),
    0,
    0.1,
  );
  pad.castShadow = false;
  add(g, new T.TorusGeometry(2.3, 0.07, 4, 6), gold, 0, 0.26).rotation.x = Math.PI / 2;
  const crystals = new T.Group();
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const c = add(
      crystals,
      new T.OctahedronGeometry(0.25 + (k % 2) * 0.12, 0),
      gold,
      Math.cos(a) * 1.2,
      0.7 + (k % 3) * 0.25,
      Math.sin(a) * 1.2,
    );
    c.scale.y = 2;
    c.castShadow = false;
  }
  g.add(crystals);
  const column = new T.Mesh(
    new T.CylinderGeometry(0.9, 1.6, 9, 12, 1, true),
    new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      side: T.DoubleSide,
      uniforms: { uTime: { value: 0 } },
      vertexShader:
        'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec2 vUv; uniform float uTime;
        void main(){
          float fade = pow(1.0 - vUv.y, 2.2);
          float streak = 0.6 + 0.4 * sin(vUv.x * 37.0 + uTime * 1.3) * sin(vUv.y * 9.0 - uTime * 3.0);
          gl_FragColor = vec4(vec3(1.0, 0.72, 0.3) * fade * streak * 0.35, 1.0);
        }`,
    }),
  );
  column.position.y = 4.5;
  g.add(column);
  return { group: g, crystals, column };
}
