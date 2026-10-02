// GPU-animated combat effects. Everything is a ring buffer of instances whose motion is computed
// in the vertex shader from a start time, so the CPU only writes a few floats per new effect.

import * as T from '../../three.js?v=0.9.0';

const WEAPON_LOOK = {
  pulse: { dur: 0.09, tail: 0.55, width: 0.09, arc: 0, burst: 0.6 },
  flak: { dur: 0.12, tail: 0.5, width: 0.07, arc: 0, burst: 0.9 },
  missile: { dur: 0.42, tail: 0.25, width: 0.14, arc: 2.2, burst: 1.6 },
};

class Pool {
  constructor(capacity, layout) {
    this.capacity = capacity;
    this.next = 0;
    this.attrs = {};
    for (const [name, size] of Object.entries(layout))
      this.attrs[name] = new T.InstancedBufferAttribute(new Float32Array(capacity * size), size);
  }
  claim() {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    return i;
  }
  touch() {
    for (const a of Object.values(this.attrs)) a.needsUpdate = true;
  }
}

function tracerMesh(pool) {
  const geo = new T.InstancedBufferGeometry();
  const quad = new T.PlaneGeometry(1, 2, 8, 1);
  quad.translate(0.5, 0, 0);
  geo.index = quad.index;
  geo.setAttribute('position', quad.attributes.position);
  for (const [k, a] of Object.entries(pool.attrs)) geo.setAttribute(k, a);
  geo.instanceCount = pool.capacity;
  const mat = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute vec3 aStart; attribute vec3 aEnd; attribute vec4 aTime; attribute vec4 aColor;
      uniform float uTime;
      varying float vAlong; varying float vSide; varying vec3 vColor; varying float vFade;
      vec3 path(float u){ return mix(aStart, aEnd, u) + vec3(0.0, aTime.w * 4.0 * u * (1.0 - u), 0.0); }
      void main(){
        float age = uTime - aTime.x;
        float u = clamp(age / aTime.y, 0.0, 1.0);
        float ut = clamp(u - aTime.z, 0.0, 1.0);
        vec3 p = path(mix(ut, u, position.x));
        vec3 dir = normalize(path(u) - path(max(0.0, u - 0.05)) + vec3(1e-4));
        vec3 view = normalize(cameraPosition - p);
        vec3 side = normalize(cross(dir, view));
        p += side * position.y * aColor.w;
        vAlong = position.x; vSide = position.y; vColor = aColor.rgb;
        vFade = (age < 0.0 || age > aTime.y + 0.06) ? 0.0 : 1.0;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      varying float vAlong; varying float vSide; varying vec3 vColor; varying float vFade;
      void main(){
        if (vFade < 0.5) discard;
        float core = 1.0 - abs(vSide);
        float a = pow(vAlong, 1.5) * core * core;
        gl_FragColor = vec4(vColor * a * 3.0 + vec3(a * a), 1.0);
      }`,
  });
  const mesh = new T.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

function burstMesh(pool) {
  const geo = new T.InstancedBufferGeometry();
  const quad = new T.PlaneGeometry(2, 2);
  geo.index = quad.index;
  geo.setAttribute('position', quad.attributes.position);
  geo.setAttribute('uv', quad.attributes.uv);
  for (const [k, a] of Object.entries(pool.attrs)) geo.setAttribute(k, a);
  geo.instanceCount = pool.capacity;
  const mat = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute vec3 aPos; attribute vec4 aTime; attribute vec4 aColor;
      uniform float uTime;
      varying vec2 vUv; varying float vT; varying vec3 vColor; varying float vKind;
      void main(){
        float age = uTime - aTime.x;
        vT = age / aTime.y;
        vUv = uv; vColor = aColor.rgb; vKind = aTime.z;
        float size = aColor.w * (0.35 + 0.65 * sqrt(clamp(vT, 0.0, 1.0)));
        vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
        mv.xy += position.xy * size;
        gl_Position = (vT < 0.0 || vT > 1.0) ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec2 vUv; varying float vT; varying vec3 vColor; varying float vKind;
      void main(){
        float r = length(vUv - 0.5) * 2.0;
        if (r > 1.0) discard;
        float life = 1.0 - vT;
        float ring = (1.0 - smoothstep(0.0, 0.08, abs(r - vT * 0.9))) * life * life;
        float core = pow(max(0.0, 1.0 - r / max(0.05, 0.9 - vT * 0.8)), 2.5) * life;
        vec3 c = vColor * (ring * 0.6 + core * 3.5) + vec3(1.0, 0.95, 0.8) * core * core * 2.5 * vKind;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const mesh = new T.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

function sparkPoints(pool) {
  const geo = new T.BufferGeometry();
  for (const [k, a] of Object.entries(pool.attrs))
    geo.setAttribute(k, new T.BufferAttribute(a.array, a.itemSize));
  geo.setAttribute('position', new T.BufferAttribute(new Float32Array(pool.capacity * 3), 3));
  const mat = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: 400 } },
    vertexShader: `
      attribute vec3 aPos; attribute vec3 aVel; attribute vec4 aTime;
      uniform float uTime; uniform float uScale;
      varying float vLife; varying vec3 vColor;
      void main(){
        float age = uTime - aTime.x;
        vLife = 1.0 - age / aTime.y;
        vec3 p = aPos + aVel * age + vec3(0.0, -9.0 * age * age * 0.5, 0.0);
        p.y = max(p.y, aTime.w);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (vLife > 0.0 && age > 0.0) ? aTime.z * uScale / -mv.z : 0.0;
        vColor = mix(vec3(1.0, 0.35, 0.1), vec3(1.0, 0.9, 0.6), vLife);
      }`,
    fragmentShader: `
      varying float vLife; varying vec3 vColor;
      void main(){
        float r = length(gl_PointCoord - 0.5) * 2.0;
        if (r > 1.0 || vLife <= 0.0) discard;
        gl_FragColor = vec4(vColor * (1.0 - r) * vLife * 2.5, 1.0);
      }`,
  });
  const pts = new T.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

export class Effects {
  constructor(scene) {
    this.time = 0;
    this.tracers = new Pool(1536, { aStart: 3, aEnd: 3, aTime: 4, aColor: 4 });
    this.bursts = new Pool(384, { aPos: 3, aTime: 4, aColor: 4 });
    this.sparks = new Pool(2048, { aPos: 3, aVel: 3, aTime: 4 });
    this.tracerMesh = tracerMesh(this.tracers);
    this.burstMesh = burstMesh(this.bursts);
    this.sparkMesh = sparkPoints(this.sparks);
    // Points use the sparks' arrays directly (non-instanced).
    for (const k of Object.keys(this.sparks.attrs))
      this.sparks.attrs[k] = this.sparkMesh.geometry.attributes[k];
    this.tracers.attrs.aTime.array.fill(-100);
    this.bursts.attrs.aTime.array.fill(-100);
    for (let i = 0; i < this.sparks.capacity; i++) this.sparks.attrs.aTime.array[i * 4] = -100;
    scene.add(this.tracerMesh, this.burstMesh, this.sparkMesh);
    this.colors = new Map();
  }
  color(hex) {
    if (!this.colors.has(hex)) this.colors.set(hex, new T.Color(hex));
    return this.colors.get(hex);
  }
  shot(weapon, a, b, teamColor) {
    const look = WEAPON_LOOK[weapon] || WEAPON_LOOK.pulse;
    const p = this.tracers,
      i = p.claim(),
      c = weapon === 'flak' ? this.color('#ffe6a0') : this.color(teamColor);
    p.attrs.aStart.setXYZ(i, a.x, a.y, a.z);
    p.attrs.aEnd.setXYZ(i, b.x, b.y, b.z);
    p.attrs.aTime.setXYZW(i, this.time, look.dur, look.tail, look.arc);
    p.attrs.aColor.setXYZW(i, c.r, c.g, c.b, look.width);
    this.burst(
      b,
      look.burst,
      weapon === 'missile' ? '#ff9a50' : weapon === 'flak' ? '#ffd27a' : teamColor,
      this.time + look.dur,
      0.25,
      0,
    );
  }
  burst(p, size, color, t0 = this.time, dur = 0.4, flash = 1) {
    const q = this.bursts,
      i = q.claim(),
      c = this.color(color);
    q.attrs.aPos.setXYZ(i, p.x, p.y, p.z);
    q.attrs.aTime.setXYZW(i, t0, dur, flash, 0);
    q.attrs.aColor.setXYZW(i, c.r, c.g, c.b, size);
  }
  explode(p, groundY, teamColor, big = 1) {
    this.burst(p, 2.6 * big, '#ff8a3a', this.time, 0.55, 1);
    this.burst(p, 1.8 * big, teamColor, this.time + 0.05, 0.4, 0);
    const s = this.sparks;
    for (let k = 0; k < 14 * big; k++) {
      const i = s.claim();
      const a = Math.random() * Math.PI * 2,
        up = Math.random() * 6 + 1,
        out = Math.random() * 6 + 2;
      s.attrs.aPos.setXYZ(i, p.x, p.y, p.z);
      s.attrs.aVel.setXYZ(i, Math.cos(a) * out, up, Math.sin(a) * out);
      s.attrs.aTime.setXYZW(
        i,
        this.time,
        0.5 + Math.random() * 0.7,
        0.12 + Math.random() * 0.12,
        groundY + 0.05,
      );
    }
  }
  update(time, pixelScale) {
    this.time = time;
    for (const m of [this.tracerMesh, this.burstMesh, this.sparkMesh])
      m.material.uniforms.uTime.value = time;
    this.sparkMesh.material.uniforms.uScale.value = pixelScale;
    this.tracers.touch();
    this.bursts.touch();
    this.sparks.touch();
  }
}
