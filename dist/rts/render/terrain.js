// Stylized terrain: a faceted basin with raised plateaus and rim cliffs. Height is visual only;
// the sim is 2D. The ground shader also draws contour lines, a faint hex grid, fog of war,
// field effects (radar sweep, jamming ripples, kill zones, repair rings) and the build grid,
// all projected onto the terrain so they conform to its shape.

import * as T from '../../three.js?v=0.9.0';
import { rockHeight } from '../sim/maps.js';

export const MAX_FIELDS = 40;
export const MAX_POWER = 24;
export const FIELD_KIND = {
  radar: 0,
  jammer: 1,
  turret: 2,
  repair: 3,
  storm: 4,
  emp: 5,
  vortex: 6,
  barrier: 7,
};

function hash(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x, z) {
  const ix = Math.floor(x),
    iz = Math.floor(z),
    fx = x - ix,
    fz = z - iz;
  const u = fx * fx * (3 - 2 * fx),
    v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz),
    b = hash(ix + 1, iz),
    c = hash(ix, iz + 1),
    d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function makeHeight(map) {
  const half = map.half;
  return (x, z) => {
    const r = Math.hypot(x, z);
    let h = -1.6 * Math.exp(-(r * r) / (48 * 48));
    for (const s of map.starts) {
      const d2 = (x - s.x) ** 2 + (z - s.z) ** 2;
      h += 1.4 * Math.exp(-d2 / (26 * 26));
    }
    h += (noise(x * 0.06, z * 0.06) - 0.5) * 1.1 + (noise(x * 0.18, z * 0.18) - 0.5) * 0.35;
    const edge = Math.max(Math.abs(x), Math.abs(z)) - half;
    if (edge > -4) {
      const k = Math.min(1, (edge + 4) / 18);
      h += k * k * (14 + noise(x * 0.1, z * 0.1) * 10);
    }
    return h;
  };
}

export function buildTerrain(map, height) {
  const size = map.half * 2 + 70,
    seg = 220;
  const geo = new T.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const low = new T.Color('#1d4b58'),
    mid = new T.Color('#2c5a5a'),
    high = new T.Color('#46625a'),
    rim = new T.Color('#6b5c4c'),
    c = new T.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      z = pos.getZ(i),
      h = height(x, z);
    pos.setY(i, h);
    if (h < -0.6) c.copy(low).lerp(mid, (h + 1.8) / 1.2);
    else if (h < 1.2) c.copy(mid).lerp(high, (h + 0.6) / 1.8);
    else c.copy(high).lerp(rim, Math.min(1, (h - 1.2) / 8));
    const n = (hash(Math.round(x * 2), Math.round(z * 2)) - 0.5) * 0.05;
    c.r += n;
    c.g += n;
    c.b += n;
    c.toArray(colors, i * 3);
  }
  geo.setAttribute('color', new T.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const fogData = new Uint8Array(64 * 64 * 4);
  const fogTex = new T.DataTexture(fogData, 64, 64, T.RGBAFormat);
  fogTex.magFilter = T.LinearFilter;
  fogTex.minFilter = T.LinearFilter;
  fogTex.needsUpdate = true;
  const uniforms = {
    uTime: { value: 0 },
    uHalf: { value: map.half },
    uFog: { value: fogTex },
    uFogScale: { value: 1 },
    uFogOn: { value: 1 },
    uFields: { value: Array.from({ length: MAX_FIELDS }, () => new T.Vector4()) },
    uFieldColor: { value: Array.from({ length: MAX_FIELDS }, () => new T.Vector4()) },
    uFieldCount: { value: 0 },
    uPower: { value: Array.from({ length: MAX_POWER }, () => new T.Vector3()) },
    uPowerCount: { value: 0 },
    uPowerColor: { value: new T.Color('#3fd9ff') },
    uPowerAlpha: { value: 0 },
    uGhost: { value: new T.Vector4(0, 0, 0, 0) }, // placement preview x, z, radius, ok(1)/bad(-1)
  };
  const mat = new T.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.02,
    flatShading: true,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorld;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWorld;
        uniform float uTime, uHalf, uFogScale, uFogOn, uPowerAlpha;
        uniform sampler2D uFog;
        uniform vec4 uFields[${MAX_FIELDS}];
        uniform vec4 uFieldColor[${MAX_FIELDS}];
        uniform int uFieldCount;
        uniform vec3 uPower[${MAX_POWER}];
        uniform int uPowerCount;
        uniform vec3 uPowerColor;
        uniform vec4 uGhost;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float hexLine(vec2 p, float s){
          p /= s;
          vec2 r = vec2(1.0, 1.7320508);
          vec2 h = r * 0.5;
          vec2 a = mod(p, r) - h, b = mod(p - h, r) - h;
          vec2 g = dot(a, a) < dot(b, b) ? a : b;
          vec2 q = abs(g);
          float d = max(dot(q, vec2(0.5, 0.8660254)), q.x);
          return smoothstep(0.465, 0.5, d);
        }`,
      )
      .replace(
        '#include <opaque_fragment>',
        `vec2 xz = vWorld.xz;
        float inside = 1.0 - smoothstep(uHalf - 1.0, uHalf + 0.5, max(abs(xz.x), abs(xz.y)));
        vec3 col = outgoingLight;
        // contour lines every 0.5 m of height, plus a faint tactical hex grid inside the arena
        float hy = vWorld.y * 2.0;
        float contour = abs(fract(hy) - 0.5);
        col += vec3(0.05, 0.1, 0.1) * (1.0 - smoothstep(0.0, fwidth(hy) * 1.2, contour)) * inside;
        col += vec3(0.012, 0.03, 0.036) * hexLine(xz, 3.0) * inside;
        // arena boundary
        float edge = abs(max(abs(xz.x), abs(xz.y)) - uHalf);
        col += vec3(0.25, 0.65, 0.8) * (1.0 - smoothstep(0.0, 0.35, edge)) * 1.5;
        // build grid (only while placing)
        if (uPowerAlpha > 0.0) {
          float p = 0.0, ring = 0.0;
          for (int i = 0; i < ${MAX_POWER}; i++) {
            if (i >= uPowerCount) break;
            float d = distance(xz, uPower[i].xy);
            p = max(p, 1.0 - step(uPower[i].z, d));
            ring = max(ring, 1.0 - smoothstep(0.0, 0.25, abs(d - uPower[i].z)));
          }
          col = mix(col, col + uPowerColor * 0.18, p * uPowerAlpha);
          col += uPowerColor * ring * uPowerAlpha * 0.9;
        }
        // fields
        for (int i = 0; i < ${MAX_FIELDS}; i++) {
          if (i >= uFieldCount) break;
          vec4 f = uFields[i];
          vec3 fc = uFieldColor[i].rgb;
          float strength = uFieldColor[i].a;
          vec2 dv = xz - f.xy;
          float d = length(dv), r = f.z, kind = f.w;
          if (d > r + 0.6) continue;
          float rim = 1.0 - smoothstep(0.0, 0.3, abs(d - r));
          float fill = 0.0;
          if (kind < 0.5) { // radar sweep
            float a = atan(dv.y, dv.x);
            float sweep = fract((a / 6.2831853) - uTime * 0.25);
            fill = pow(sweep, 14.0) * 0.4 + 0.012;
            fill += (1.0 - smoothstep(0.0, 0.03, abs(fract(d / r * 4.0) - 0.5) - 0.47)) * 0.08;
          } else if (kind < 1.5) { // jammer ripples + static
            fill = 0.06 + 0.2 * pow(0.5 + 0.5 * sin(d * 2.4 - uTime * 5.0), 6.0);
            fill += step(0.93, h21(floor(xz * 3.0) + floor(uTime * 12.0))) * 0.3;
          } else if (kind < 2.5) { // kill zone: pulsing hazard hex
            fill = 0.08 + 0.12 * (0.5 + 0.5 * sin(uTime * 4.0));
            fill += hexLine(xz, 1.2) * 0.25;
} else if (kind < 3.5) { // repair: rings flowing inward
            fill = 0.05 + 0.22 * pow(0.5 + 0.5 * sin(d * 1.6 + uTime * 3.0), 8.0);
          } else if (kind < 4.5) { // storm: darken the ground under a swirling cloud
            float ang = atan(dv.y, dv.x) + uTime * 0.6 - d * 0.15;
            float swirl = 0.5 + 0.5 * sin(ang * 3.0 + d * 0.4);
            float shade = (1.0 - smoothstep(r * 0.6, r, d)) * (0.45 + 0.25 * swirl);
            col = mix(col, col * 0.35 + vec3(0.02, 0.03, 0.05), shade);
            float bolt = step(0.985, h21(vec2(floor(uTime * 3.0), f.x)));
            col += vec3(0.5, 0.6, 0.9) * bolt * (1.0 - smoothstep(0.0, r, d)) * 0.6;
            continue;
          } else if (kind < 5.5) { // EMP warning: fast-pulsing ring closing in
            fill = 0.12 * (0.5 + 0.5 * sin(uTime * 18.0));
          } else if (kind < 6.5) { // vortex: spiral streamlines turning faster near the center
            float ang = atan(dv.y, dv.x);
            float spiral = sin(ang * 4.0 + log(d + 0.5) * 6.0 - uTime * (2.0 + 6.0 / (d + 1.0)));
            fill = 0.05 + 0.25 * pow(0.5 + 0.5 * spiral, 6.0) * (1.0 - d / r);
          } else { // barrier: radial streamlines flowing outward
            float ang = atan(dv.y, dv.x);
            fill = 0.05 + 0.22 * pow(0.5 + 0.5 * sin(ang * 16.0), 10.0) * (0.5 + 0.5 * sin(d * 1.4 - uTime * 6.0));
          }
          float m = (1.0 - smoothstep(r - 0.2, r, d));
          col += fc * (fill * m + rim * 0.6) * strength;
        }
        // placement ghost
        if (uGhost.z > 0.0) {
          float d = distance(xz, uGhost.xy);
          vec3 gc = uGhost.w > 0.0 ? vec3(0.3, 1.0, 0.6) : vec3(1.0, 0.25, 0.2);
          col += gc * (1.0 - smoothstep(0.0, 0.25, abs(d - uGhost.z))) * 1.2;
          col += gc * (1.0 - step(uGhost.z, d)) * 0.08;
        }
        // fog of war: R = visible now, G = explored
        if (uFogOn > 0.5) {
          vec2 fuv = (xz + uHalf) / (2.0 * uHalf) * uFogScale;
          vec4 fog = texture2D(uFog, fuv);
          float lum = dot(col, vec3(0.299, 0.587, 0.114));
          vec3 remembered = mix(vec3(lum), col, 0.35) * 0.55;
          vec3 unknown = vec3(lum) * 0.16 + vec3(0.0, 0.01, 0.02);
          vec3 fogged = mix(unknown, remembered, fog.g);
          col = mix(fogged, col, fog.r * inside + (1.0 - inside) * 0.6);
        }
        outgoingLight = col;
        #include <opaque_fragment>`,
      );
  };
  const mesh = new T.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return { mesh, uniforms, fogTex, fogData };
}

// Low-poly mesas for the sim's circular obstacles, with a few decorative boulders.
export function buildRocks(map, height) {
  const group = new T.Group();
  const mat = new T.MeshStandardMaterial({ color: '#6c6458', roughness: 0.95, flatShading: true });
  const capMat = new T.MeshStandardMaterial({
    color: '#8a8270',
    roughness: 0.9,
    flatShading: true,
  });
  let seed = 1;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const o of map.obstacles) {
    const hgt = rockHeight(o) + 0.6; // matches the sim's line-of-sight height
    const geo = new T.CylinderGeometry(o.r * 0.82, o.r * 1.05, hgt, 7, 3);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 0.85 + rnd() * 0.3;
      p.setX(i, p.getX(i) * k);
      p.setZ(i, p.getZ(i) * k);
      p.setY(i, p.getY(i) + (rnd() - 0.5) * 0.5);
    }
    geo.computeVertexNormals();
    const m = new T.Mesh(geo, mat);
    const base = height(o.x, o.z);
    m.position.set(o.x, base + hgt / 2 - 0.6, o.z);
    m.rotation.y = rnd() * 6;
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    const cap = new T.Mesh(new T.CylinderGeometry(o.r * 0.7, o.r * 0.84, 0.6, 7), capMat);
    cap.position.set(o.x, base + hgt - 0.3, o.z);
    cap.rotation.y = m.rotation.y + 0.3;
    cap.castShadow = true;
    group.add(cap);
    for (let k = 0; k < 4; k++) {
      const a = rnd() * Math.PI * 2,
        r = o.r + 0.8 + rnd() * 2;
      const b = new T.Mesh(new T.DodecahedronGeometry(0.3 + rnd() * 0.5, 0), mat);
      const x = o.x + Math.cos(a) * r,
        z = o.z + Math.sin(a) * r;
      b.position.set(x, height(x, z) + 0.1, z);
      b.rotation.set(rnd() * 3, rnd() * 3, 0);
      b.castShadow = true;
      group.add(b);
    }
  }
  return group;
}

export function buildSky() {
  const geo = new T.SphereGeometry(900, 32, 16);
  const mat = new T.ShaderMaterial({
    side: T.BackSide,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader:
      'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vDir; uniform float uTime;
      void main(){
        float y = vDir.y;
        vec3 top = vec3(0.02, 0.035, 0.07);
        vec3 mid = vec3(0.07, 0.11, 0.17);
        vec3 horizon = vec3(0.42, 0.26, 0.2);
        vec3 c = mix(horizon, mid, smoothstep(-0.05, 0.18, y));
        c = mix(c, top, smoothstep(0.18, 0.8, y));
        float sun = max(0.0, dot(vDir, normalize(vec3(-0.6, 0.18, -0.75))));
        c += vec3(1.0, 0.55, 0.3) * pow(sun, 24.0) * 0.8 + vec3(0.6, 0.3, 0.2) * pow(sun, 4.0) * 0.15;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  return new T.Mesh(geo, mat);
}
