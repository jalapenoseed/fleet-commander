// GameView renders a World. It never mutates the sim: it reads state after each tick, consumes
// that tick's events (shots, deaths, spawns) for effects, and interpolates between ticks.

import * as T from '../../three.js?v=0.9.0';
import { ScenePostFX } from '../../scene-postfx.js?v=0.9.0';
import { STRUCTURES, TEAM_COLORS } from '../sim/defs.js';
import { VIS_CELL, F_JAMMED, F_PILOT, F_RTB } from '../sim/world.js';
import { buildAirframe, rotorMaterial, ROLE_SCALE } from './drone-models.js';
import {
  makeHeight,
  buildTerrain,
  buildRocks,
  buildSky,
  MAX_FIELDS,
  MAX_POWER,
  FIELD_KIND,
} from './terrain.js';
import { buildStructure, buildWell } from './structures.js';
import { Effects } from './effects.js';

export const QUALITY = {
  low: { pixelRatio: 1, shadows: 0, post: 'performance' },
  balanced: { pixelRatio: 1.5, shadows: 2048, post: 'balanced' },
  high: { pixelRatio: 2, shadows: 4096, post: 'cinema' },
};

const tmpM = new T.Matrix4(),
  tmpQ = new T.Quaternion(),
  tmpE = new T.Euler(0, 0, 0, 'YXZ'),
  tmpP = new T.Vector3(),
  tmpS = new T.Vector3(),
  tmpC = new T.Color();

// FPV camera mount: turned to face the nose (+z) and tilted up 22° like a racing quad's camera.
const FPV_MOUNT = new T.Quaternion()
  .setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI)
  .multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), 0.38));

function angleLerp(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

export class GameView {
  constructor(canvas, world, { playerTeam = 0, quality = 'balanced', spectator = false } = {}) {
    this.canvas = canvas;
    this.world = world;
    this.playerTeam = playerTeam;
    this.spectator = spectator;
    this.height = makeHeight(world.map);
    this.renderer = new T.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.scene = new T.Scene();
    this.scene.background = new T.Color('#0b1018');
    this.scene.fog = new T.FogExp2('#1c2230', 0.0042);
    this.camera = new T.PerspectiveCamera(40, 1, 0.5, 2500);
    const start = world.map.starts[playerTeam] || { x: 0, z: 0 };
    this.cam = {
      x: start.x * 0.85,
      z: start.z * 0.85,
      dist: 84,
      yaw: 0,
      pitch: 0.95,
      tx: 0,
      tz: 0,
      tdist: 84,
      tyaw: 0,
    };
    this.cam.tx = this.cam.x;
    this.cam.tz = this.cam.z;
    // Face the enemy: rotate so the player's base is at the bottom of the screen.
    this.cam.yaw = this.cam.tyaw = Math.atan2(-start.x, -start.z) + Math.PI;
    this.time = 0;
    this.buildLights();
    this.scene.add((this.sky = buildSky()));
    const terrain = buildTerrain(world.map, this.height);
    this.terrain = terrain;
    this.scene.add(terrain.mesh);
    this.scene.add(buildRocks(world.map, this.height));
    this.wells = world.wells.map((w) => {
      const v = buildWell();
      v.group.position.set(w.x, this.height(w.x, w.z), w.z);
      this.scene.add(v.group);
      return v;
    });
    this.buildDrones();
    this.buildOverlays();
    this.structViews = new Map();
    this.seenStructs = new Set();
    this.effects = new Effects(this.scene);
    this.postfx = new ScenePostFX(this.renderer);
    this.r = {
      flash: new Float32Array(world.cap),
      lastHp: new Float32Array(world.cap),
      uid: new Int32Array(world.cap),
      phase: new Float32Array(world.cap).map(() => Math.random() * 100),
    };
    this.selected = new Set(); // drone uids
    this.orderLines = [];
    this.fogOn = !spectator;
    this.setQuality(quality);
    this.resize();
  }

  buildLights() {
    this.scene.add(new T.HemisphereLight('#9ab8da', '#3a2c20', 1.05));
    const sun = new T.DirectionalLight('#ffd2a6', 2.8);
    sun.position.set(-70, 90, -80);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -100;
    sun.shadow.camera.right = sun.shadow.camera.top = 100;
    sun.shadow.camera.far = 400;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6;
    this.scene.add(sun, sun.target);
    this.sun = sun;
    const rim = new T.DirectionalLight('#5c86ff', 0.7);
    rim.position.set(80, 40, 90);
    this.scene.add(rim);
  }

  buildDrones() {
    this.droneMeshes = [];
  }

  // Instanced meshes for one airframe, created the first time a drone of that role appears.
  meshesFor(role) {
    if (this.droneMeshes[role]) return this.droneMeshes[role];
    const def = this.world.roles[role];
    const geo = buildAirframe(def.design ? def.design : def.key);
    const cap = this.world.cap;
    const hull = new T.InstancedMesh(
      geo.hull,
      new T.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.5,
        metalness: 0.45,
        flatShading: true,
      }),
      cap,
    );
    const glow = new T.InstancedMesh(geo.glow, new T.MeshBasicMaterial({ color: '#ffffff' }), cap);
    const rotor = new T.InstancedMesh(geo.rotor, rotorMaterial(), cap);
    for (const m of [hull, glow, rotor]) {
      m.instanceMatrix.setUsage(T.DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      this.scene.add(m);
    }
    hull.castShadow = true;
    hull.setColorAt(0, tmpC.set('#fff'));
    glow.setColorAt(0, tmpC);
    rotor.setColorAt(0, tmpC);
    this.droneMeshes[role] = { hull, glow, rotor, scale: geo.scale };
    return this.droneMeshes[role];
  }

  buildOverlays() {
    const cap = this.world.cap;
    const ring = new T.RingGeometry(0.95, 1.15, 28);
    ring.rotateX(-Math.PI / 2);
    this.rings = new T.InstancedMesh(
      ring,
      new T.MeshBasicMaterial({
        color: new T.Color(2.2, 2.6, 2.6),
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
      cap,
    );
    this.rings.count = 0;
    this.rings.frustumCulled = false;
    this.scene.add(this.rings);
    // Soft team-colored light pools on the ground under every drone: swarms read as colored
    // clouds from far away, and altitude is easier to judge.
    const pool = new T.PlaneGeometry(1, 1);
    pool.rotateX(-Math.PI / 2);
    this.pools = new T.InstancedMesh(
      pool,
      new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
        vertexShader: `varying vec2 vUv; varying vec3 vCol;
          void main(){ vUv = uv; vCol = instanceColor; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
        fragmentShader: `varying vec2 vUv; varying vec3 vCol;
          void main(){ float r = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - r), 2.2);
            gl_FragColor = vec4(vCol * a, 1.0); }`,
      }),
      cap,
    );
    this.pools.setColorAt(0, tmpC.set('#fff'));
    this.pools.count = 0;
    this.pools.frustumCulled = false;
    this.pools.renderOrder = 2;
    this.scene.add(this.pools);
    // Billboard health bars for drones and structures.
    const geo = new T.InstancedBufferGeometry();
    const quad = new T.PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    this.barPos = new T.InstancedBufferAttribute(new Float32Array((cap + 256) * 3), 3);
    this.barInfo = new T.InstancedBufferAttribute(new Float32Array((cap + 256) * 4), 4);
    geo.setAttribute('aPos', this.barPos);
    geo.setAttribute('aInfo', this.barInfo);
    geo.instanceCount = 0;
    this.bars = new T.Mesh(
      geo,
      new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        depthTest: false,
        vertexShader: `attribute vec3 aPos; attribute vec4 aInfo; varying vec2 vUv; varying vec4 vInfo;
          void main(){ vUv = uv; vInfo = aInfo; vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
            float s = -mv.z * 0.012; mv.xy += position.xy * vec2(aInfo.y, 0.16) * s * 2.2; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying vec2 vUv; varying vec4 vInfo;
          void main(){ float hp = vInfo.x;
            vec3 c = hp > 0.6 ? vec3(0.35, 1.0, 0.55) : hp > 0.3 ? vec3(1.0, 0.82, 0.3) : vec3(1.0, 0.3, 0.25);
            if (vInfo.z > 1.5) c = hp > 0.22 ? vec3(1.0, 0.85, 0.35) : vec3(1.0, 0.35, 0.2);
            else if (vInfo.z > 0.5) c = vec3(0.4, 0.85, 1.0);
            vec3 col = vUv.x < hp ? c : vec3(0.05, 0.06, 0.08);
            float edge = step(0.06, vUv.x) * step(vUv.x, 0.94) * step(0.2, vUv.y) * step(vUv.y, 0.8);
            gl_FragColor = vec4(mix(vec3(0.0), col, max(edge, 0.0)), 0.85 * vInfo.w); }`,
      }),
    );
    this.bars.frustumCulled = false;
    this.bars.renderOrder = 10;
    this.scene.add(this.bars);
    // Order lines from selected squads to their destinations.
    this.lineGeo = new T.BufferGeometry();
    this.lineGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(64 * 6), 3));
    this.lines = new T.LineSegments(
      this.lineGeo,
      new T.LineBasicMaterial({
        color: new T.Color(0.6, 2, 1.2),
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
      }),
    );
    this.lines.frustumCulled = false;
    this.scene.add(this.lines);
  }

  setQuality(key) {
    const q = QUALITY[key] || QUALITY.balanced;
    this.quality = key;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.renderer.shadowMap.enabled = q.shadows > 0;
    this.sun.castShadow = q.shadows > 0;
    if (q.shadows) {
      this.sun.shadow.mapSize.set(q.shadows, q.shadows);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.postfx.setQuality(q.post);
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth,
      h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    this.postfx.resize(w * pr, h * pr);
  }

  teamColor(t) {
    return TEAM_COLORS[t] || '#ffffff';
  }

  seesPoint(x, z) {
    return !this.fogOn || this.world.visible(this.playerTeam, x, z);
  }

  // ---------- per tick ----------

  sync(events) {
    const w = this.world;
    for (const e of events) {
      if (e.k === 'shot') {
        if (!this.seesPoint(e.x0, e.z0) && !this.seesPoint(e.x1, e.z1)) continue;
        const a = {
          x: e.x0,
          y: e.from >= 0 ? this.droneY(e.from, e.x0, e.z0) : this.height(e.x0, e.z0) + 4,
          z: e.z0,
        };
        const b = { x: e.x1, y: this.height(e.x1, e.z1) + 3.4, z: e.z1 };
        this.effects.shot(e.w, a, b, this.teamColor(e.team));
      } else if (e.k === 'die') {
        if (!this.seesPoint(e.x, e.z)) continue;
        const gy = this.height(e.x, e.z);
        this.effects.explode(
          { x: e.x, y: gy + e.py, z: e.z },
          gy,
          this.teamColor(e.team),
          e.role === 2 ? 1.4 : 1,
        );
      } else if (e.k === 'destroyed') {
        const gy = this.height(e.x, e.z);
        this.effects.explode({ x: e.x, y: gy + 2, z: e.z }, gy, this.teamColor(e.team), 3);
      }
    }
    // Structures: create/remove views.
    const live = new Set();
    for (const s of w.structures) {
      live.add(s.id);
      if (!this.structViews.has(s.id)) {
        const v = buildStructure(s.kind, this.teamColor(s.team));
        const y = this.height(s.x, s.z);
        v.group.position.set(s.x, y, s.z);
        v.holo.position.copy(v.group.position);
        v.group.rotation.y = v.holo.rotation.y =
          ((s.id * 2.399) % (Math.PI * 2)) * (s.kind === 'core' ? 0 : 1);
        this.scene.add(v.group, v.holo);
        this.structViews.set(s.id, v);
      }
      if (s.team === this.playerTeam || w.visible(this.playerTeam, s.x, s.z))
        this.seenStructs.add(s.id);
    }
    for (const [id, v] of this.structViews) {
      if (live.has(id)) continue;
      this.scene.remove(v.group, v.holo);
      this.structViews.delete(id);
      this.seenStructs.delete(id);
    }
    if (this.fogOn) this.updateFog();
  }

  updateFog() {
    const team = this.world.teams[this.playerTeam];
    const n = this.world.visN,
      data = this.terrain.fogData;
    for (let z = 0; z < n; z++)
      for (let x = 0; x < n; x++) {
        const c = z * n + x,
          o = (z * 64 + x) * 4;
        data[o] = team.vis[c] * 255;
        data[o + 1] = team.explored[c] * 255;
      }
    this.terrain.fogTex.needsUpdate = true;
    this.terrain.uniforms.uFogScale.value = n / 64;
  }

  // Altitude comes from the sim's flight model; a small hover bob is added for life.
  droneY(i, x, z, alpha = 1) {
    const w = this.world;
    const py = w.opy[i] + (w.py[i] - w.opy[i]) * alpha;
    const bob = w.flags[i] & F_PILOT ? 0 : Math.sin(this.time * 2.1 + this.r.phase[i]) * 0.08;
    return this.height(x, z) + py + bob;
  }

  // ---------- per frame ----------

  frame(alpha, dt) {
    this.time += dt;
    const w = this.world,
      r = this.r;
    this.updateCamera(dt, alpha);
    const counts = new Array(w.roles.length).fill(0);
    let rings = 0,
      bars = 0,
      pools = 0;
    const teamCol = TEAM_COLORS.map((c) => new T.Color(c));
    for (let i = 0; i < w.count; i++) {
      if (!w.alive[i]) continue;
      const t = w.team[i];
      const x = w.ox[i] + (w.px[i] - w.ox[i]) * alpha,
        z = w.oz[i] + (w.pz[i] - w.oz[i]) * alpha;
      if (t !== this.playerTeam && this.fogOn && !w.seen(this.playerTeam, i)) continue;
      const role = w.role[i],
        def = w.rs(i);
      if (r.uid[i] !== w.uid[i]) {
        r.uid[i] = w.uid[i];
        r.flash[i] = 0;
        r.lastHp[i] = w.hp[i];
      }
      if (w.hp[i] < r.lastHp[i] - 0.01) r.flash[i] = 1;
      r.lastHp[i] = w.hp[i];
      r.flash[i] = Math.max(0, r.flash[i] - dt * 5);
      const y = this.droneY(i, x, z, alpha);
      // Attitude straight from the flight model: +pitch = nose down, +roll = right side down.
      const pose = this.pose(i, alpha);
      if (this.follow?.mode === 'fpv' && this.follow.uid === w.uid[i]) continue;
      tmpE.set(pose.pitch, pose.yaw, pose.roll);
      tmpQ.setFromEuler(tmpE);
      tmpP.set(x, y, z);
      tmpS.setScalar(1);
      tmpM.compose(tmpP, tmpQ, tmpS);
      const k = counts[role]++;
      const dm = this.meshesFor(role);
      dm.rotor.setMatrixAt(k, tmpM);
      dm.hull.setMatrixAt(k, tmpM);
      dm.glow.setMatrixAt(k, tmpM);
      dm.rotor.setMatrixAt(k, tmpM);
      const hpRatio = w.hp[i] / def.hp;
      const jam =
        w.flags[i] & F_JAMMED ? 0.4 + 0.6 * (Math.sin(this.time * 31 + i) > 0 ? 1 : 0) : 1;
      tmpC.copy(teamCol[t]).multiplyScalar((4.5 + r.flash[i] * 6) * jam);
      dm.glow.setColorAt(k, tmpC);
      tmpC.copy(teamCol[t]).multiplyScalar(0.8);
      dm.rotor.setColorAt(k, tmpC);
      const dark = 0.45 + 0.55 * Math.min(1, hpRatio * 1.6);
      tmpC
        .setRGB(1, 1, 1)
        .lerp(teamCol[t], 0.4)
        .multiplyScalar(dark + r.flash[i] * 1.5);
      dm.hull.setColorAt(k, tmpC);
      tmpS.set(3.2, 1, 3.2);
      tmpM.compose(tmpP.set(x, this.height(x, z) + 0.15, z), tmpQ.identity(), tmpS);
      this.pools.setMatrixAt(pools, tmpM);
      tmpC.copy(teamCol[t]).multiplyScalar(0.22 + r.flash[i] * 0.5);
      this.pools.setColorAt(pools++, tmpC);
      tmpP.set(x, y, z);
      const sel = t === this.playerTeam && this.selected.has(w.uid[i]) && !(w.flags[i] & F_PILOT);
      if (sel && !this.follow) {
        tmpS.setScalar((ROLE_SCALE[def.key] || 1.3) * 0.9);
        tmpM.compose(tmpP.set(x, y - 0.45, z), tmpQ.identity(), tmpS);
        this.rings.setMatrixAt(rings++, tmpM);
      }
      if (sel || hpRatio < 0.98) {
        this.barPos.setXYZ(bars, x, y + 1.1, z);
        this.barInfo.setXYZW(bars, hpRatio, 1.2, 0, sel ? 1 : 0.7);
        bars++;
      }
      // Battery bar under the health bar for selected drones (and any drone heading to charge).
      if (t === this.playerTeam && (sel || w.flags[i] & F_RTB)) {
        this.barPos.setXYZ(bars, x, y + 0.92, z);
        this.barInfo.setXYZW(bars, w.bat[i], 1.2, 2, sel ? 1 : 0.8);
        bars++;
      }
    }
    this.droneMeshes.forEach((dm, role) => {
      if (!dm) return;
      for (const m of [dm.hull, dm.glow, dm.rotor]) {
        m.count = counts[role] || 0;
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
      dm.rotor.material.uniforms.uTime.value = this.time;
    });
    this.rings.count = rings;
    this.rings.instanceMatrix.needsUpdate = true;
    this.pools.count = pools;
    this.pools.instanceMatrix.needsUpdate = true;
    this.pools.instanceColor.needsUpdate = true;
    bars = this.frameStructures(dt, bars);
    this.bars.geometry.instanceCount = bars;
    this.barPos.needsUpdate = this.barInfo.needsUpdate = true;
    this.frameFields();
    this.frameOrderLines();
    for (const v of this.wells) {
      v.crystals.rotation.y += dt * 0.4;
      v.column.material.uniforms.uTime.value = this.time;
    }
    this.terrain.uniforms.uTime.value = this.time;
    this.terrain.uniforms.uFogOn.value = this.fogOn ? 1 : 0;
    const pixelScale =
      this.renderer.domElement.height / 2 / Math.tan((this.camera.fov * Math.PI) / 360);
    this.effects.update(this.time, pixelScale);
    this.postfx.render(this.scene, this.camera);
  }

  frameStructures(dt, bars) {
    const w = this.world;
    for (const s of w.structures) {
      const v = this.structViews.get(s.id);
      if (!v) continue;
      const shown = s.team === this.playerTeam || !this.fogOn || this.seenStructs.has(s.id);
      const done = s.progress >= 1;
      v.group.visible = shown && done;
      v.holo.visible = shown && !done;
      if (!done) v.holo.scale.set(1, 0.15 + 0.85 * s.progress, 1);
      if (done && shown)
        for (const p of v.spin) {
          const o = p.obj;
          if (p.swing) o.rotation.y = Math.sin(this.time * p.rate) * p.swing;
          else if (p.axis === 'z') o.rotation.z += dt * p.rate;
          else o.rotation.y += dt * p.rate;
          if (p.bob)
            o.position.y = (o.userData.y0 ??= o.position.y) + Math.sin(this.time * p.rate) * p.bob;
          if (p.pulse) o.scale.setScalar(1 + Math.sin(this.time * 3) * 0.08);
        }
      if (shown && (s.hp < s.maxHp * 0.999 || !done)) {
        const def = STRUCTURES[s.kind];
        this.barPos.setXYZ(bars, s.x, this.height(s.x, s.z) + def.radius * 1.6 + 3.5, s.z);
        this.barInfo.setXYZW(
          bars,
          done ? s.hp / s.maxHp : s.progress,
          2 + def.radius,
          done ? 0 : 1,
          1,
        );
        bars++;
      }
    }
    return bars;
  }

  frameFields() {
    const w = this.world,
      u = this.terrain.uniforms;
    let n = 0;
    const push = (x, z, r, kind, color, strength) => {
      if (n >= MAX_FIELDS) return;
      u.uFields.value[n].set(x, z, r, kind);
      tmpC.set(color);
      u.uFieldColor.value[n].set(tmpC.r, tmpC.g, tmpC.b, strength);
      n++;
    };
    for (const s of w.structures) {
      if (s.progress < 1) continue;
      const own = s.team === this.playerTeam;
      if (!own && this.fogOn && !this.seenStructs.has(s.id)) continue;
      const def = STRUCTURES[s.kind],
        col = this.teamColor(s.team),
        k = own ? 1 : 0.7;
      if (def.detect) push(s.x, s.z, def.detect, FIELD_KIND.radar, col, 0.55 * k);
      if (def.jam) push(s.x, s.z, def.jam, FIELD_KIND.jammer, '#c58cff', k);
      if (def.zone) push(s.x, s.z, def.zone.radius, FIELD_KIND.turret, '#ff4a3a', k);
      if (def.heal) push(s.x, s.z, def.heal.radius, FIELD_KIND.repair, '#4dffa6', k);
      if (def.charge && s.kind !== 'core')
        push(s.x, s.z, def.charge.radius, FIELD_KIND.repair, '#8ff0ff', 0.7 * k);
    }
    // Mobile jammer auras.
    for (let i = 0; i < w.count && n < MAX_FIELDS; i++) {
      const a = w.alive[i] && w.rs(i).aura;
      if (!a || !(a.jam || a.shield)) continue;
      if (w.team[i] !== this.playerTeam && !this.seesPoint(w.px[i], w.pz[i])) continue;
      if (a.jam) push(w.px[i], w.pz[i], a.jam, FIELD_KIND.jammer, '#c58cff', 0.35);
      else push(w.px[i], w.pz[i], a.shield, FIELD_KIND.repair, '#7fb4ff', 0.45);
    }
    u.uFieldCount.value = n;
  }

  setPlacement(kind, x, z, ok) {
    const u = this.terrain.uniforms;
    if (!kind) {
      u.uPowerAlpha.value = 0;
      u.uGhost.value.set(0, 0, 0, 0);
      return;
    }
    let n = 0;
    for (const s of this.world.structures) {
      if (
        s.team !== this.playerTeam ||
        s.progress < 1 ||
        !STRUCTURES[s.kind].power ||
        n >= MAX_POWER
      )
        continue;
      u.uPower.value[n++].set(s.x, s.z, STRUCTURES[s.kind].power);
    }
    u.uPowerCount.value = n;
    u.uPowerColor.value.set(this.teamColor(this.playerTeam));
    u.uPowerAlpha.value = 1;
    u.uGhost.value.set(x, z, STRUCTURES[kind].radius + 0.6, ok ? 1 : -1);
  }

  frameOrderLines() {
    const w = this.world,
      arr = this.lineGeo.attributes.position.array;
    let n = 0;
    const squads = new Set();
    for (const u of this.selected) {
      const i = w.uidMap.get(u);
      if (i !== undefined) squads.add(w.squadOf[i]);
    }
    for (const id of squads) {
      const sq = w.squadMap.get(id);
      if (!sq?.order || n >= 64) continue;
      const play = sq.order.play;
      if (play === 'hold' && Math.hypot(sq.cx - sq.order.x, sq.cz - sq.order.z) < 3) continue;
      arr.set(
        [
          sq.cx,
          this.height(sq.cx, sq.cz) + 0.6,
          sq.cz,
          sq.order.x,
          this.height(sq.order.x, sq.order.z) + 0.6,
          sq.order.z,
        ],
        n * 6,
      );
      n++;
    }
    this.lineGeo.setDrawRange(0, n * 2);
    this.lineGeo.attributes.position.needsUpdate = true;
  }

  // ---------- camera & picking ----------

  pose(i, alpha) {
    const w = this.world;
    return {
      yaw: angleLerp(w.oyaw[i], w.yaw[i], alpha),
      pitch: w.opitch[i] + (w.pitch[i] - w.opitch[i]) * alpha,
      roll: w.oroll[i] + (w.roll[i] - w.oroll[i]) * alpha,
    };
  }

  // Camera bolted to a piloted drone: 'fpv' sits on the nose with the classic FPV up-tilt,
  // 'chase' trails behind and above.
  followCamera(dt, alpha) {
    const w = this.world,
      f = this.follow,
      i = w.uidMap.get(f.uid);
    if (i === undefined) return false;
    const x = w.ox[i] + (w.px[i] - w.ox[i]) * alpha,
      z = w.oz[i] + (w.pz[i] - w.oz[i]) * alpha,
      y = this.droneY(i, x, z, alpha),
      p = this.pose(i, alpha);
    const fov = f.mode === 'fpv' ? 100 : 68;
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    tmpE.set(p.pitch, p.yaw, p.roll);
    const body = new T.Quaternion().setFromEuler(tmpE);
    const fwd = new T.Vector3(0, 0, 1).applyQuaternion(body);
    if (f.mode === 'fpv') {
      const cam = body.clone().multiply(FPV_MOUNT);
      this.camera.quaternion.copy(cam);
      this.camera.position.set(x, y + 0.15, z).addScaledVector(fwd, 0.45);
    } else {
      const hx = Math.sin(p.yaw),
        hz = Math.cos(p.yaw);
      const want = new T.Vector3(x - hx * 7, y + 2.6, z - hz * 7);
      want.y = Math.max(want.y, this.height(want.x, want.z) + 1);
      const k = 1 - Math.exp(-dt * 8);
      if (!this.chasePos) this.chasePos = want.clone();
      this.chasePos.lerp(want, k);
      this.camera.position.copy(this.chasePos);
      this.camera.lookAt(x + hx * 5, y + 0.6, z + hz * 5);
    }
    this.cam.x = this.cam.tx = x;
    this.cam.z = this.cam.tz = z;
    this.sun.target.position.set(x, 0, z);
    this.sun.position.set(x - 70, 90, z - 80);
    return true;
  }

  setFollow(uid, mode = 'fpv') {
    this.follow = uid ? { uid, mode } : null;
    this.chasePos = null;
    if (!uid) {
      this.camera.fov = 40;
      this.camera.updateProjectionMatrix();
    }
  }

  updateCamera(dt, alpha = 1) {
    if (this.follow && this.followCamera(dt, alpha)) return;
    const c = this.cam,
      k = 1 - Math.exp(-dt * 10);
    const lim = this.world.half + 10;
    c.tx = Math.max(-lim, Math.min(lim, c.tx));
    c.tz = Math.max(-lim, Math.min(lim, c.tz));
    c.tdist = Math.max(18, Math.min(170, c.tdist));
    c.x += (c.tx - c.x) * k;
    c.z += (c.tz - c.z) * k;
    c.dist += (c.tdist - c.dist) * k;
    c.yaw = angleLerp(c.yaw, c.tyaw, k);
    const pitch = c.pitch + (1 - c.dist / 170) * -0.25;
    const gy = this.height(c.x, c.z);
    this.camera.position.set(
      c.x + Math.sin(c.yaw) * Math.cos(pitch) * c.dist,
      gy + Math.sin(pitch) * c.dist,
      c.z + Math.cos(c.yaw) * Math.cos(pitch) * c.dist,
    );
    this.camera.lookAt(c.x, gy, c.z);
    this.sun.target.position.set(c.x, 0, c.z);
    this.sun.position.set(c.x - 70, 90, c.z - 80);
  }

  pan(dx, dz) {
    // dx/dz are screen-relative (right, up) in world meters.
    const c = this.cam,
      s = Math.sin(c.yaw),
      co = Math.cos(c.yaw);
    c.tx += co * dx - s * dz;
    c.tz += -s * dx - co * dz;
  }

  lookAt(x, z) {
    this.cam.tx = x;
    this.cam.tz = z;
  }

  groundAt(sx, sy) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new T.Vector2(
      ((sx - rect.left) / rect.width) * 2 - 1,
      -((sy - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new T.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const o = ray.ray.origin,
      d = ray.ray.direction;
    if (d.y > -1e-4) return null;
    let h = 0,
      p = null;
    for (let k = 0; k < 5; k++) {
      const t = (h - o.y) / d.y;
      p = { x: o.x + d.x * t, z: o.z + d.z * t };
      h = this.height(p.x, p.z);
    }
    return p;
  }

  project(x, y, z) {
    const v = tmpP.set(x, y, z).project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.left + ((v.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - v.y) / 2) * rect.height,
      behind: v.z > 1,
    };
  }

  // Drones of `team` whose screen position falls inside the rectangle.
  dronesInRect(x0, y0, x1, y1, team) {
    const w = this.world,
      out = [];
    const ax = Math.min(x0, x1),
      bx = Math.max(x0, x1),
      ay = Math.min(y0, y1),
      by = Math.max(y0, y1);
    for (let i = 0; i < w.count; i++) {
      if (!w.alive[i] || w.team[i] !== team) continue;
      const p = this.project(w.px[i], this.droneY(i, w.px[i], w.pz[i]), w.pz[i]);
      if (!p.behind && p.x >= ax && p.x <= bx && p.y >= ay && p.y <= by) out.push(i);
    }
    return out;
  }

  droneAt(sx, sy, radius = 18) {
    const w = this.world;
    let best = -1,
      bd = radius * radius;
    for (let i = 0; i < w.count; i++) {
      if (!w.alive[i]) continue;
      if (w.team[i] !== this.playerTeam && this.fogOn && !w.seen(this.playerTeam, i)) continue;
      const p = this.project(w.px[i], this.droneY(i, w.px[i], w.pz[i]), w.pz[i]);
      const d = (p.x - sx) ** 2 + (p.y - sy) ** 2;
      if (!p.behind && d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  structureAt(x, z) {
    for (const s of this.world.structures) {
      if (s.team !== this.playerTeam && this.fogOn && !this.seenStructs.has(s.id)) continue;
      if (Math.hypot(s.x - x, s.z - z) < STRUCTURES[s.kind].radius + 1) return s;
    }
    return null;
  }

  ping(x, z, color = '#7dffb0') {
    this.effects.burst({ x, y: this.height(x, z) + 0.4, z }, 2.2, color, this.effects.time, 0.5, 0);
  }
}

export { VIS_CELL };
