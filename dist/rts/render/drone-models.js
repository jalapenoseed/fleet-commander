// Procedural, stylized airframes for the six roles. Each role compiles to three geometries:
//   hull  - faceted body parts with baked vertex colors (lit, casts shadows)
//   glow  - team-colored emissive strips/lamps (instance color drives the team hue, HDR for bloom)
//   rotor - flat discs; a shader draws spinning blade blur, so no per-rotor matrices are needed
// Replaces the 120k-triangle GLB airframes, which were far too heavy to draw hundreds of at once
// (each model here is a few hundred triangles).

import * as T from '../../three.js?v=0.9.0';
import { mergeGeometries } from '../../BufferGeometryUtils.js?v=0.9.0';

const C = {
  hull: 0x56677a,
  hullLight: 0x8a9db3,
  plate: 0xa9b8c8,
  dark: 0x283139,
  metal: 0xb4c0cc,
  white: 0xdde6ee,
  cross: 0xe9f1f4,
};

function part(
  geo,
  color,
  { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {},
) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.deleteAttribute('uv');
  const m = new T.Matrix4().compose(
    new T.Vector3(x, y, z),
    new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)),
    new T.Vector3(sx, sy, sz),
  );
  g.applyMatrix4(m);
  const col = new T.Color(color);
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.toArray(colors, i * 3);
  g.setAttribute('color', new T.BufferAttribute(colors, 3));
  return g;
}

function rotorDisc(x, y, z, r, spin) {
  const g = new T.CircleGeometry(r, 20);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  const n = g.attributes.position.count;
  g.setAttribute('aSpin', new T.BufferAttribute(new Float32Array(n).fill(spin), 1));
  return g;
}

// Arms from the hub out to each rotor, plus motor pods under the discs.
function rotorRig(
  parts,
  glow,
  rotors,
  positions,
  { arm = 0.06, pod = 0.09, y = 0.05, r = 0.36 } = {},
) {
  positions.forEach(([x, z], k) => {
    const len = Math.hypot(x, z);
    parts.push(
      part(new T.BoxGeometry(len, arm, arm * 1.4), C.hull, {
        x: x / 2,
        y,
        z: z / 2,
        ry: -Math.atan2(z, x),
      }),
      part(new T.CylinderGeometry(pod, pod * 1.2, 0.16, 7), C.dark, { x, y: y + 0.02, z }),
    );
    glow.push(
      part(new T.CylinderGeometry(pod * 1.25, pod * 1.25, 0.03, 8), 0xffffff, {
        x,
        y: y - 0.07,
        z,
      }),
    );
    rotors.push(rotorDisc(x, y + 0.13, z, r, k % 2 ? 1 : -1));
  });
}

const quad = (s) => [
  [s, s],
  [-s, s],
  [s, -s],
  [-s, -s],
];

const BUILDERS = {
  // Small swept dart, X-quad.
  scout(parts, glow, rotors) {
    parts.push(
      part(new T.OctahedronGeometry(0.28, 0), C.hullLight, { sz: 1.9, sy: 0.55 }),
      part(new T.ConeGeometry(0.12, 0.4, 4), C.plate, { z: 0.62, rx: Math.PI / 2, sy: 1 }),
      part(new T.BoxGeometry(0.5, 0.03, 0.18), C.hull, { z: -0.3, y: 0.02 }),
    );
    glow.push(
      part(new T.BoxGeometry(0.06, 0.04, 0.5), 0xffffff, { y: 0.15, z: 0.05 }),
      part(new T.SphereGeometry(0.05, 6, 4), 0xffffff, { z: 0.82 }),
    );
    rotorRig(parts, glow, rotors, quad(0.42), { r: 0.27, arm: 0.045, pod: 0.07 });
  },
  // Sleek interceptor with a forward flak pod and canards.
  interceptor(parts, glow, rotors) {
    parts.push(
      part(new T.CylinderGeometry(0.16, 0.24, 1.1, 6), C.hull, { rx: Math.PI / 2 }),
      part(new T.ConeGeometry(0.16, 0.42, 6), C.hullLight, { z: 0.76, rx: Math.PI / 2 }),
      part(new T.BoxGeometry(1.1, 0.04, 0.32), C.plate, { z: -0.15, y: 0.06 }),
      part(new T.BoxGeometry(0.1, 0.1, 0.5), C.dark, { y: -0.2, z: 0.35 }),
      part(new T.CylinderGeometry(0.035, 0.035, 0.42, 5), C.metal, {
        y: -0.2,
        z: 0.72,
        rx: Math.PI / 2,
      }),
    );
    glow.push(
      part(new T.BoxGeometry(1.0, 0.03, 0.05), 0xffffff, { z: -0.31, y: 0.09 }),
      part(new T.BoxGeometry(0.08, 0.06, 0.08), 0xffffff, { z: 0.55, y: 0.14 }),
    );
    rotorRig(parts, glow, rotors, quad(0.55), { r: 0.33 });
  },
  // Heavy hexacopter with missile racks.
  assault(parts, glow, rotors) {
    parts.push(
      part(new T.CylinderGeometry(0.42, 0.5, 0.36, 6), C.hull, {}),
      part(new T.CylinderGeometry(0.3, 0.42, 0.16, 6), C.hullLight, { y: 0.26 }),
      part(new T.BoxGeometry(0.22, 0.2, 0.9), C.dark, { x: 0.4, y: -0.28 }),
      part(new T.BoxGeometry(0.22, 0.2, 0.9), C.dark, { x: -0.4, y: -0.28 }),
      part(new T.BoxGeometry(0.3, 0.12, 0.3), C.plate, { z: 0.4, y: 0.05 }),
    );
    for (const sx of [0.4, -0.4])
      for (const dz of [0.32, 0.12, -0.08])
        glow.push(
          part(new T.CylinderGeometry(0.04, 0.04, 0.05, 6), 0xffffff, {
            x: sx,
            y: -0.28,
            z: dz + 0.15,
            rx: Math.PI / 2,
          }),
        );
    glow.push(part(new T.TorusGeometry(0.32, 0.035, 4, 6), 0xffffff, { y: 0.35, rx: Math.PI / 2 }));
    const ring = Array.from({ length: 6 }, (_, k) => {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      return [Math.cos(a) * 0.95, Math.sin(a) * 0.95];
    });
    rotorRig(parts, glow, rotors, ring, { r: 0.36, arm: 0.08, pod: 0.1, y: 0.08 });
  },
  // Dish array and a halo emitter.
  jammer(parts, glow, rotors) {
    parts.push(
      part(new T.BoxGeometry(0.5, 0.26, 0.6), C.hull, {}),
      part(new T.CylinderGeometry(0.03, 0.03, 0.5, 5), C.metal, { y: 0.35 }),
      part(new T.SphereGeometry(0.3, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2.6), C.plate, {
        y: -0.12,
        rx: Math.PI,
      }),
    );
    glow.push(
      part(new T.TorusGeometry(0.42, 0.03, 4, 18), 0xffffff, { y: 0.6, rx: Math.PI / 2 }),
      part(new T.SphereGeometry(0.07, 6, 4), 0xffffff, { y: 0.62 }),
      part(new T.BoxGeometry(0.52, 0.04, 0.04), 0xffffff, { y: 0.0, z: 0.31 }),
    );
    rotorRig(parts, glow, rotors, quad(0.5), { r: 0.3 });
  },
  // Rounded support drone with a lit cross.
  medic(parts, glow, rotors) {
    parts.push(
      part(new T.SphereGeometry(0.36, 10, 6), C.hullLight, { sy: 0.6 }),
      part(new T.BoxGeometry(0.34, 0.06, 0.1), C.cross, { y: 0.21 }),
      part(new T.BoxGeometry(0.1, 0.06, 0.34), C.cross, { y: 0.21 }),
      part(new T.CylinderGeometry(0.2, 0.12, 0.12, 8), C.dark, { y: -0.24 }),
    );
    glow.push(part(new T.TorusGeometry(0.36, 0.03, 4, 16), 0xffffff, { rx: Math.PI / 2 }));
    rotorRig(parts, glow, rotors, quad(0.5), { r: 0.3 });
  },
  // Tall mast with a beacon.
  relay(parts, glow, rotors) {
    parts.push(
      part(new T.CylinderGeometry(0.22, 0.3, 0.3, 8), C.hull, {}),
      part(new T.CylinderGeometry(0.035, 0.05, 1.0, 5), C.metal, { y: 0.6 }),
      part(new T.BoxGeometry(0.5, 0.03, 0.03), C.metal, { y: 0.55 }),
      part(new T.BoxGeometry(0.03, 0.03, 0.5), C.metal, { y: 0.8 }),
    );
    glow.push(
      part(new T.OctahedronGeometry(0.1, 0), 0xffffff, { y: 1.15 }),
      part(new T.TorusGeometry(0.25, 0.025, 4, 14), 0xffffff, { y: 0.17, rx: Math.PI / 2 }),
    );
    rotorRig(parts, glow, rotors, quad(0.5), { r: 0.3 });
  },
};

Object.assign(BUILDERS, {
  // Siege drone: long rail barrel slung under a narrow armored spine.
  lancer(parts, glow, rotors) {
    parts.push(
      part(new T.BoxGeometry(0.34, 0.26, 1.2), C.hull, {}),
      part(new T.BoxGeometry(0.22, 0.12, 0.9), C.hullLight, { y: 0.18, z: -0.1 }),
      part(new T.CylinderGeometry(0.07, 0.09, 2.1, 6), C.metal, {
        y: -0.22,
        z: 0.75,
        rx: Math.PI / 2,
      }),
      part(new T.BoxGeometry(0.2, 0.2, 0.35), C.dark, { y: -0.22, z: -0.2 }),
    );
    glow.push(
      part(new T.BoxGeometry(0.04, 0.04, 1.6), 0xffffff, { y: -0.12, z: 0.75, x: 0.08 }),
      part(new T.BoxGeometry(0.04, 0.04, 1.6), 0xffffff, { y: -0.12, z: 0.75, x: -0.08 }),
      part(new T.SphereGeometry(0.06, 6, 4), 0xffffff, { y: -0.22, z: 1.82 }),
    );
    rotorRig(
      parts,
      glow,
      rotors,
      [
        [0.62, 0.45],
        [-0.62, 0.45],
        [0.62, -0.5],
        [-0.62, -0.5],
      ],
      { r: 0.34, arm: 0.07 },
    );
  },
  // Shield projector: a dome with an emitter ring.
  warden(parts, glow, rotors) {
    parts.push(
      part(new T.SphereGeometry(0.42, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), C.hullLight, {
        y: -0.05,
      }),
      part(new T.CylinderGeometry(0.45, 0.35, 0.18, 10), C.hull, { y: -0.12 }),
      part(new T.CylinderGeometry(0.05, 0.05, 0.4, 5), C.metal, { y: 0.45 }),
    );
    glow.push(
      part(new T.TorusGeometry(0.62, 0.035, 4, 24), 0xffffff, { y: 0.0, rx: Math.PI / 2 }),
      part(new T.IcosahedronGeometry(0.1, 0), 0xffffff, { y: 0.7 }),
    );
    rotorRig(parts, glow, rotors, quad(0.55), { r: 0.3 });
  },
  // Flying hangar: wide deck, launch bays, eight rotors.
  carrier(parts, glow, rotors) {
    parts.push(
      part(new T.BoxGeometry(1.5, 0.35, 2.4), C.hull, {}),
      part(new T.BoxGeometry(1.1, 0.18, 1.9), C.plate, { y: 0.26 }),
      part(new T.BoxGeometry(0.4, 0.45, 0.5), C.hullLight, { y: 0.5, z: -0.7, x: 0.35 }),
      part(new T.BoxGeometry(1.6, 0.12, 0.3), C.dark, { y: -0.2, z: 0.9 }),
      part(new T.BoxGeometry(1.6, 0.12, 0.3), C.dark, { y: -0.2, z: -0.9 }),
    );
    for (const z of [-0.6, 0, 0.6])
      glow.push(part(new T.BoxGeometry(0.9, 0.03, 0.08), 0xffffff, { y: 0.36, z }));
    glow.push(part(new T.BoxGeometry(0.1, 0.1, 0.1), 0xffffff, { y: 0.78, z: -0.7, x: 0.35 }));
    const ring = [
      [1.25, 1.1],
      [-1.25, 1.1],
      [1.25, -1.1],
      [-1.25, -1.1],
      [1.35, 0.35],
      [-1.35, 0.35],
      [1.35, -0.35],
      [-1.35, -0.35],
    ];
    rotorRig(parts, glow, rotors, ring, { r: 0.4, arm: 0.1, pod: 0.11 });
  },
  // Micro-drone: tiny tri-rotor.
  wasp(parts, glow, rotors) {
    parts.push(part(new T.OctahedronGeometry(0.16, 0), C.hullLight, { sz: 1.6, sy: 0.6 }));
    glow.push(part(new T.SphereGeometry(0.05, 5, 3), 0xffffff, { z: 0.24 }));
    const tri = [0, 1, 2].map((k) => {
      const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
      return [Math.cos(a) * 0.28, Math.sin(a) * 0.28];
    });
    rotorRig(parts, glow, rotors, tri, { r: 0.16, arm: 0.03, pod: 0.05 });
  },
});

// Overall scale per role: drones are exaggerated so they read at RTS camera distances.
export const ROLE_SCALE = {
  scout: 1.1,
  interceptor: 1.2,
  assault: 1.45,
  jammer: 1.3,
  medic: 1.25,
  relay: 1.3,
  lancer: 1.4,
  warden: 1.35,
  carrier: 1.9,
  wasp: 1.0,
};

// Visible extras for designer parts, added on top of the frame's base shape.
const ACCESSORIES = {
  rail(parts, glow) {
    parts.push(
      part(new T.CylinderGeometry(0.06, 0.08, 1.6, 6), C.metal, {
        y: -0.3,
        z: 0.75,
        rx: Math.PI / 2,
      }),
    );
    glow.push(part(new T.SphereGeometry(0.06, 6, 4), 0xffffff, { y: -0.3, z: 1.56 }));
  },
  missile(parts, glow) {
    for (const x of [0.3, -0.3]) {
      parts.push(part(new T.BoxGeometry(0.14, 0.14, 0.5), C.dark, { x, y: -0.25, z: 0.1 }));
      glow.push(
        part(new T.CylinderGeometry(0.04, 0.04, 0.04, 6), 0xffffff, {
          x,
          y: -0.25,
          z: 0.36,
          rx: Math.PI / 2,
        }),
      );
    }
  },
  flak(parts) {
    parts.push(part(new T.BoxGeometry(0.12, 0.12, 0.6), C.dark, { y: -0.22, z: 0.4 }));
  },
  pulse(parts, glow) {
    glow.push(part(new T.SphereGeometry(0.05, 6, 4), 0xffffff, { y: -0.12, z: 0.5 }));
  },
  extended(parts, glow) {
    parts.push(part(new T.CylinderGeometry(0.02, 0.02, 0.4, 4), C.metal, { y: 0.35 }));
    glow.push(part(new T.SphereGeometry(0.05, 6, 4), 0xffffff, { y: 0.56 }));
  },
  longrange(parts, glow) {
    parts.push(part(new T.CylinderGeometry(0.025, 0.035, 0.9, 4), C.metal, { y: 0.55 }));
    glow.push(part(new T.OctahedronGeometry(0.08, 0), 0xffffff, { y: 1.02 }));
  },
  battery(parts) {
    parts.push(part(new T.BoxGeometry(0.4, 0.14, 0.3), C.plate, { y: -0.28, z: -0.3 }));
  },
  armor(parts) {
    parts.push(
      part(new T.BoxGeometry(0.7, 0.06, 0.8), C.plate, { y: 0.2 }),
      part(new T.BoxGeometry(0.7, 0.06, 0.8), C.plate, { y: -0.25 }),
    );
  },
  jammer(parts, glow) {
    glow.push(part(new T.TorusGeometry(0.38, 0.025, 4, 16), 0xffffff, { y: 0.5, rx: Math.PI / 2 }));
  },
  medic(parts, glow) {
    glow.push(
      part(new T.BoxGeometry(0.3, 0.05, 0.08), 0xffffff, { y: 0.26 }),
      part(new T.BoxGeometry(0.08, 0.05, 0.3), 0xffffff, { y: 0.26 }),
    );
  },
  relay(parts, glow) {
    parts.push(part(new T.CylinderGeometry(0.03, 0.04, 0.7, 4), C.metal, { y: 0.45, x: 0.2 }));
    glow.push(part(new T.OctahedronGeometry(0.07, 0), 0xffffff, { y: 0.82, x: 0.2 }));
  },
  shield(parts, glow) {
    glow.push(part(new T.TorusGeometry(0.6, 0.03, 4, 24), 0xffffff, { rx: Math.PI / 2 }));
  },
};

// role: a built-in role key, or a designer spec { model, weapon, sensor, module }.
export function buildAirframe(role) {
  const parts = [],
    glow = [],
    rotors = [];
  const design = typeof role === 'object' ? role : null;
  const base = design ? design.model : role;
  BUILDERS[base](parts, glow, rotors);
  if (design)
    for (const p of [design.weapon, design.sensor, design.module])
      ACCESSORIES[p]?.(parts, glow, rotors);
  const s = ROLE_SCALE[base];
  const out = {
    hull: mergeGeometries(parts),
    glow: mergeGeometries(glow),
    rotor: mergeGeometries(rotors),
  };
  for (const g of Object.values(out)) {
    g.scale(s, s, s);
    g.computeVertexNormals();
    g.computeBoundingSphere();
  }
  return out;
}

export function rotorMaterial() {
  return new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float aSpin;
      varying vec2 vLocal;
      varying float vPhase;
      varying vec3 vTeam;
      void main() {
        // Local disc coordinates from the CircleGeometry layout: center is the first vertex of each fan,
        // but we only need the angle around the rotor hub, which uv gives directly.
        vLocal = (uv - 0.5) * 2.0;
        vPhase = aSpin * (40.0 + float(gl_InstanceID % 7));
        #ifdef USE_INSTANCING_COLOR
          vTeam = instanceColor;
        #else
          vTeam = vec3(1.0);
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vLocal;
      varying float vPhase;
      varying vec3 vTeam;
      void main() {
        float r = length(vLocal);
        if (r > 1.0) discard;
        float a = atan(vLocal.y, vLocal.x) + uTime * vPhase;
        float blades = pow(abs(cos(a)), 18.0);
        float blur = 0.10 + 0.55 * blades * smoothstep(0.15, 0.9, r);
        float tip = smoothstep(0.82, 0.97, r) * (1.0 - smoothstep(0.97, 1.0, r));
        vec3 col = vec3(0.75, 0.82, 0.9) * blur * 0.45 + vTeam * tip * 0.35;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}
