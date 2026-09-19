import * as T from './three.js?v=0.9.0';
import { GLTFLoader } from './GLTFLoader.js?v=0.9.0';
const aircraftType = (id) => id;
const palette = {
  black: 0x171d20,
  rubber: 0x101315,
  edge: 0x424e51,
  steel: 0x768184,
  tan: 0x756349,
  cyan: 0x4ce3e3,
  green: 0x53e79a,
  amber: 0xe2ad51,
};
const materialCache = new Map();
function material(color, glow = false) {
  const key = color + ':' + glow;
  if (!materialCache.has(key))
    materialCache.set(
      key,
      new T.MeshStandardMaterial({
        color,
        roughness: glow ? 0.35 : 0.76,
        metalness: glow ? 0.15 : 0.4,
        emissive: glow ? color : 0,
        emissiveIntensity: glow ? 1.4 : 0,
      }),
    );
  return materialCache.get(key);
}
function mesh(g, geometry, x, y, z, color, glow = false) {
  const m = new T.Mesh(geometry, material(color, glow));
  m.position.set(x, y, z);
  g.add(m);
  return m;
}
function box(g, x, y, z, w, h, d, c) {
  return mesh(g, new T.BoxGeometry(w, h, d), x, y, z, c);
}
function rod(g, a, b, r, c) {
  const av = new T.Vector3(...a),
    bv = new T.Vector3(...b),
    d = bv.clone().sub(av);
  const m = mesh(
    g,
    new T.CylinderGeometry(r, r, d.length(), 8),
    ...av.add(bv).multiplyScalar(0.5).toArray(),
    c,
  );
  m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
  return m;
}
export function combineStatic(group) {
  group.updateMatrixWorld(true);
  const groups = new Map();
  for (const m of [...group.children]) {
    if (!m.isMesh) continue;
    m.updateMatrix();
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(m.matrix);
    if (!groups.has(m.material)) groups.set(m.material, []);
    groups.get(m.material).push(g);
    group.remove(m);
    m.geometry.dispose();
  }
  for (const [mat, parts] of groups) {
    const n = parts.reduce((n, p) => n + p.attributes.position.array.length, 0),
      pos = new Float32Array(n),
      norm = new Float32Array(n),
      uv = new Float32Array((n / 3) * 2);
    let o = 0,
      u = 0;
    for (const p of parts) {
      pos.set(p.attributes.position.array, o);
      norm.set(p.attributes.normal.array, o);
      if (p.attributes.uv) uv.set(p.attributes.uv.array, u);
      u += p.attributes.position.count * 2;
      o += p.attributes.position.array.length;
      p.dispose();
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.BufferAttribute(norm, 3));
    g.setAttribute('uv', new T.BufferAttribute(uv, 2));
    group.add(new T.Mesh(g, mat));
  }
  return group;
}
export function makeDrone(color = palette.green) {
  const g = new T.Group();
  box(g, 0, 0, 0, 0.44, 0.18, 0.56, palette.black);
  box(g, 0, 0.11, 0, 0.28, 0.07, 0.34, palette.edge);
  mesh(g, new T.SphereGeometry(0.12, 12, 8), 0, -0.13, -0.27, palette.black);
  mesh(g, new T.CircleGeometry(0.055, 12), 0, -0.13, -0.375, 0x376b77, true).rotation.y = Math.PI;
  const rotors = [];
  for (const x of [-0.55, 0.55])
    for (const z of [-0.5, 0.5]) {
      rod(g, [x * 0.22, 0, z * 0.22], [x, 0, z], 0.04, palette.edge);
      mesh(g, new T.CylinderGeometry(0.08, 0.06, 0.16, 10), x, 0.06, z, palette.black);
      rod(g, [x, -0.02, z], [x, -0.2, z], 0.022, palette.black);
      mesh(g, new T.SphereGeometry(0.028, 6, 4), x, -0.12, z, color, true);
      const guard = mesh(g, new T.TorusGeometry(0.39, 0.016, 5, 20), x, 0.13, z, palette.edge);
      guard.rotation.x = Math.PI / 2;
      const rotor = new T.Group();
      rotor.position.set(x, 0.17, z);
      box(rotor, 0, 0, 0, 0.67, 0.014, 0.048, palette.black);
      g.add(rotor);
      rotors.push(rotor);
    }
  rod(g, [0.12, 0.12, 0], [0.12, 0.44, 0.08], 0.012, palette.steel);
  mesh(g, new T.SphereGeometry(0.032, 8, 6), 0.12, 0.44, 0.08, color, true);
  if (color === 0xffbd54) {
    for (const side of [-1, 1]) {
      rod(g, [side * 0.16, -0.1, 0], [side * 0.23, -0.4, -0.05], 0.028, palette.amber);
      box(g, side * 0.18, -0.41, -0.05, 0.16, 0.045, 0.16, palette.steel);
    }
  }
  combineStatic(g);
  g.userData.rotors = rotors;
  return g;
}
export const FLEET = [
  {
    id: 'scout',
    code: 'SCOUT-01',
    file: 'SCOUT',
    role: 'Recon',
    span: 0.52,
    description:
      'Ultralight scout. Quick acceleration and fast survey passes; more sensitive to wind.',
  },
  {
    id: 'cargo',
    code: 'CARGO-01',
    file: 'CARGO',
    role: 'Salvage',
    span: 1.9,
    description: 'Heavy lift frame with a protected cargo cage and recovery clamp.',
  },
  {
    id: 'engineer',
    code: 'UTILITY-01',
    file: 'UTILITY',
    role: 'Repair',
    span: 0.7,
    description: 'Articulated service tools, cable reels and field-maintenance fittings.',
  },
  {
    id: 'relay',
    code: 'RELAY-01',
    file: 'RELAY',
    role: 'Comms',
    span: 0.68,
    description:
      'Lightweight, high-speed relay. Extended link range; fast redeployment between signal positions.',
  },
];
const texNames = [
  '01_painted_alum',
  '02_machined_alum',
  '03_black_anodized',
  '04_weave',
  '05_rubber',
  '06_aged_copper',
  '07_galvanized',
  '08_damp_concrete',
  '09_camera_glass',
];
const idle = () =>
  new Promise((resolve) =>
    globalThis.requestIdleCallback
      ? requestIdleCallback(resolve, { timeout: 500 })
      : setTimeout(resolve, 0),
  );
export class DroneFleet {
  constructor() {
    this.enabled = true;
    this.quality = 'MEDIUM';
    this.records = Object.fromEntries(
      FLEET.map((d) => [d.id, { ...d, root: new T.Group(), loading: false, loaded: false }]),
    );
    this.materials = new Map();
    this.textures = new Map();
    this.errors = [];
  }
  setQuality(q) {
    this.quality = q;
  }
  texture(name, channel) {
    const key = name + '_' + channel;
    if (this.textures.has(key)) return this.textures.get(key);
    const t = new T.TextureLoader().load(
      './assets/drones/textures/GR_' + key + '.png',
      undefined,
      undefined,
      () => this.errors.push(key),
    );
    t.colorSpace = channel === 'albedo' ? T.SRGBColorSpace : T.NoColorSpace;
    t.wrapS = t.wrapT = name === '09_camera_glass' ? T.ClampToEdgeWrapping : T.RepeatWrapping;
    t.anisotropy = this.quality === 'LOW' ? 1 : 4;
    t.flipY = false;
    this.textures.set(key, t);
    return t;
  }
  material(name) {
    if (this.materials.has(name)) return this.materials.get(name);
    let index = texNames.findIndex((n) => name.toLowerCase().includes(n));
    const offWhite = /OffWhite/.test(name),
      ochre = /Ochre/.test(name),
      glass = /Glass|Lens|camera_glass/i.test(name),
      emission = /LED|Indicator/.test(name);
    if (offWhite || ochre) index = 0;
    if (glass) index = 8;
    let m;
    if (emission)
      m = new T.MeshStandardMaterial({
        color: /Amber/.test(name) ? 0xc28830 : 0x458990,
        emissive: /Amber/.test(name) ? 0xffae45 : 0x4ad5db,
        emissiveIntensity: 2.7,
        roughness: 0.3,
      });
    else if (index >= 0) {
      const stem = texNames[index];
      m = new T.MeshPhysicalMaterial({
        map: this.texture(stem, 'albedo'),
        normalMap: this.texture(stem, 'normal'),
        roughnessMap: this.texture(stem, 'rough'),
        metalnessMap: this.texture(stem, 'metal'),
        aoMap: this.texture(stem, 'ao'),
        roughness: 1,
        metalness: 1,
        normalScale: new T.Vector2(index === 3 ? 0.45 : 0.6, index === 3 ? 0.45 : 0.6),
        clearcoat: glass ? 0.6 : 0.05,
        clearcoatRoughness: glass ? 0.04 : 0.2,
      });
      if (offWhite || ochre) {
        m.map = this.texture(offWhite ? 'paint_offwhite' : 'paint_ochre', 'albedo');
        m.metalness = 0.1;
        m.roughness = 0.95;
      }
      if (index === 1) {
        m.anisotropy = 0.45;
        m.roughness = 0.9;
      }
      if (index === 3) {
        m.metalness = 0;
        m.clearcoat = 0.14;
      }
      if (index === 4 || index === 7) m.metalness = 0;
      if (glass) {
        m.color.setHex(0xc0ccd0);
        m.transmission = 0.9;
        m.ior = 1.5;
        m.thickness = 0.006;
        m.metalness = 0;
        m.roughness = 0.3;
        m.envMapIntensity = 1.1;
      }
    } else if (/trim/i.test(name))
      m = new T.MeshStandardMaterial({
        map: this.texture('trim', 'albedo'),
        roughnessMap: this.texture('trim', 'rough'),
        metalnessMap: this.texture('trim', 'metal'),
        normalMap: this.texture('trim', 'normal'),
        roughness: 1,
        metalness: 1,
      });
    else
      m = new T.MeshStandardMaterial({
        color: /WarmWhite/.test(name) ? 0xc6c5b7 : /Copper/.test(name) ? 0x68422b : 0x11191d,
        roughness: 0.55,
        metalness: /Copper/.test(name) ? 1 : 0.1,
      });
    m.name = name;
    m.userData.baseRoughness = m.roughness;
    m.userData.baseCoat = m.clearcoat || 0;
    this.materials.set(name, m);
    return m;
  }
  load(id) {
    const r = this.records[id];
    if (!r || r.failed || !this.enabled) return Promise.resolve(false);
    if (r.loaded) return Promise.resolve(true);
    if (r.promise) return r.promise;
    r.loading = true;
    const type = aircraftType(id);
    if (id !== type) {
      r.promise = this.load(type).then((ok) => {
        if (!ok) {
          r.failed = true;
          r.loading = false;
          return false;
        }
        r.model = this.records[type].model.clone(true);
        r.root.add(r.model);
        r.root.userData.rotors = [];
        r.model.traverse((o) => {
          if (o.userData.rotor && !o.isMesh) r.root.userData.rotors.push(o);
        });
        r.loaded = true;
        r.loading = false;
        return true;
      });
      return r.promise;
    }
    r.promise = fetch('./assets/drones/GR_' + r.file + '_01.glb.gz')
      .then(async (response) => {
        if (!response.ok) throw Error('Drone download ' + response.status);
        if (!globalThis.DecompressionStream) throw Error('This browser needs gzip stream support');
        const data = await new Response(
          response.body.pipeThrough(new DecompressionStream('gzip')),
        ).arrayBuffer();
        await idle();
        return new GLTFLoader().parseAsync(data, '');
      })
      .then((gltf) => {
        const model = gltf.scene;
        model.rotation.y = Math.PI;
        model.updateMatrixWorld(true);
        const b = new T.Box3().setFromObject(model),
          center = new T.Vector3();
        b.getCenter(center);
        model.position.y = -center.y;
        const rotors = [];
        model.traverse((o) => {
          if (o.userData.rotor && !o.isMesh) rotors.push(o);
          if (!o.isMesh) return;
          const name = o.userData.sourceMaterial || o.material.name.replace(/^RUNTIME_/, '');
          o.material = this.material(name);
          o.castShadow = o.receiveShadow = this.quality === 'HIGH' || this.quality === 'ULTRA';
          if (o.geometry.attributes.uv && !o.geometry.attributes.uv1)
            o.geometry.setAttribute('uv1', o.geometry.attributes.uv);
        });
        r.root.add(model);
        r.model = model;
        r.loaded = true;
        r.loading = false;
        r.root.userData.rotors = rotors.length ? rotors : r.root.userData.rotors;
        r.root.userData.source = 'Blender reference pack 02';
        return true;
      })
      .catch((error) => {
        r.loading = false;
        r.failed = true;
        this.errors.push(id + ': ' + error.message);
        return false;
      });
    return r.promise;
  }
}
