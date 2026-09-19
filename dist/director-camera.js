import * as T from './three.js?v=0.9.0';
import { COMMANDER_OBSTACLES } from './fleet-commander-core.js?v=0.9.0';

/**
 * ELI5: Cameras do not move drones; they only choose an eye position, a point
 * to look at, and a field of view. Search for `this.position.set` to move a
 * shot. In [x, y, z], y is camera height. Larger FOV values look wider.
 * `bestFightPair` scores active pairs, while `longestSurvivor` keeps a subject
 * until it is lost so the camera does not jump randomly every frame.
 */

export const DRONE_VIEWS = ['fpv', 'shoulder', 'mounted'];
export const DIRECTED_VIEWS = [
  ...DRONE_VIEWS,
  'ground',
  'free',
  'cinematic',
  'combat',
  'bestfight',
  'survivor',
];
export const CINEMATIC_SHOTS = [
  'Establishing orbit',
  'Wing chase',
  'Formation sweep',
  'Onboard FPV',
  'Ground spectator',
  'Overhead reveal',
];
const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z),
  clamp = T.MathUtils.clamp;
const alive = (d) => d && d.mode === 'FLY';
export function bestFightPair(sim) {
  const live = sim.drones.filter(alive);
  let best = null,
    score = -Infinity,
    seen = new Set();
  for (const d of live) {
    const target = live.find((o) => o.id === d.ai?.targetId && o.combatSide !== d.combatSide);
    if (!target) continue;
    const key = [d.id, target.id].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const distance = Math.hypot(...d.pos.map((p, j) => p - target.pos[j])),
      relative = Math.hypot(...d.velocity.map((p, j) => p - target.velocity[j])),
      mutual = target.ai?.targetId === d.id ? 28 : 0,
      recent = (d.combatStats?.lastAction || 0) + (target.combatStats?.lastAction || 0),
      rank =
        120 / (distance + 5) +
        relative * 0.55 +
        mutual +
        recent * 0.08 +
        (200 - (d.health ?? 100) - (target.health ?? 100)) * 0.05;
    if (rank > score) {
      score = rank;
      best = [d, target, rank];
    }
  }
  if (best) return best;
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i],
        b = live[j];
      if (a.combatSide === b.combatSide) continue;
      const distance = Math.hypot(...a.pos.map((p, k) => p - b.pos[k])),
        rank = 80 / (distance + 5);
      if (rank > score) {
        score = rank;
        best = [a, b, rank];
      }
    }
  return best;
}
export function longestSurvivor(sim, current = '') {
  const live = sim.drones.filter(alive),
    held = live.find((d) => d.id === current);
  if (held) return held;
  const counts = Object.fromEntries(
    ['friendly', 'enemy'].map((side) => [side, live.filter((d) => d.combatSide === side).length]),
  );
  return (
    live.sort(
      (a, b) =>
        (counts[a.combatSide] || 0) - (counts[b.combatSide] || 0) ||
        (b.combatStats?.kills || 0) - (a.combatStats?.kills || 0) ||
        (b.health ?? 100) - (a.health ?? 100) ||
        a.id.localeCompare(b.id),
    )[0] ||
    sim.drones.filter((d) => ['FALLING', 'WRECK'].includes(d.mode)).at(-1) ||
    sim.drones[0]
  );
}
// ELI5: FOV is degrees. Smoothing near 0 reacts quickly; larger values feel softer.
export const FPV_DEFAULTS = Object.freeze({
  fov: 88,
  sensitivity: 1,
  stabilization: 0.65,
  smoothing: 0.08,
  tilt: 0,
});
export function fpvSettings(input = {}) {
  const bounds = {
    fov: [50, 115],
    sensitivity: [0.25, 2.5],
    stabilization: [0, 1],
    smoothing: [0, 0.4],
    tilt: [-20, 30],
  };
  return Object.fromEntries(
    Object.entries(FPV_DEFAULTS).map(([key, value]) => [
      key,
      Number.isFinite(input[key]) ? clamp(input[key], ...bounds[key]) : value,
    ]),
  );
}
export class DirectorCamera {
  constructor() {
    this.position = v();
    this.target = v();
    // ELI5: The spectator starts at x=0, eye height=1.7 m, z=210 m.
    this.ground = v(0, 1.7, 210);
    this.yaw = Math.PI;
    this.pitch = 0.3;
    this.keys = new Set();
    this.time = 0;
    this.shot = -1;
    this.subject = '';
    // ELI5: Automatic cinematic mode holds each shot for this many seconds.
    this.cutSeconds = 8;
    this.label = '';
    this.hiddenId = '';
    this.reset = true;
    this.groundAutoAim = true;
    this.fpv = fpvSettings();
    this.fpvRotation = new T.Quaternion();
    this.fpvSubject = '';
  }
  configureFPV(patch) {
    this.fpv = fpvSettings({ ...this.fpv, ...patch });
    return this.fpv;
  }
  recenterFPV() {
    this.fpvYaw = this.fpvPitch = 0;
    this.reset = true;
  }
  resetGround() {
    this.ground.set(0, 1.7, 210);
    this.yaw = Math.PI;
    this.pitch = 0.3;
    this.groundAutoAim = true;
  }
  look(dx, dy, fpv = false) {
    const sensitivity = this.fpv.sensitivity;
    if (fpv) {
      this.fpvYaw = clamp((this.fpvYaw || 0) - dx * 0.004 * sensitivity, -1.5, 1.5);
      this.fpvPitch = clamp((this.fpvPitch || 0) - dy * 0.004 * sensitivity, -1.1, 1.1);
      return;
    }
    this.groundAutoAim = false;
    this.yaw -= dx * 0.004 * sensitivity;
    this.pitch = clamp(this.pitch - dy * 0.004 * sensitivity, -1.3, 1.4);
  }
  next() {
    this.time = (Math.floor(this.time / this.cutSeconds) + 1) * this.cutSeconds;
  }
  setView() {
    this.reset = true;
    this.keys.clear();
    this.fpvYaw = 0;
    this.fpvPitch = 0;
    this.combatCutAt = -Infinity;
    this.fightPair = [];
  }
  combatSubject(sim, selected) {
    const battle = sim.combat,
      time = battle?.time || 0,
      events = battle?.events || [];
    if (this.battle !== battle?.world) {
      this.battle = battle?.world;
      this.combatCutAt = -Infinity;
      this.combatEvent = 0;
      this.crashId = '';
    }
    const crash = events
      .filter((e) => e.type === 'destroy' && e.id > (this.combatEvent || 0) && time - e.time < 1)
      .at(-1);
    if (crash && time - (this.combatCutAt || 0) > 1.5) {
      this.combatEvent = crash.id;
      this.crashId = crash.droneId;
      this.combatCutAt = time;
      this.subject = crash.droneId;
      this.combatShot = 'crash';
    }
    if (time - this.combatCutAt > 5 || !sim.drones.some((d) => d.id === this.subject)) {
      const live = sim.drones.filter((d) => d.mode === 'FLY');
      let best = null,
        score = -Infinity;
      for (const d of live) {
        const target = live.find((o) => o.id === d.ai?.targetId);
        const distance = target ? Math.hypot(...d.pos.map((v, j) => v - target.pos[j])) : 200;
        const rank =
          120 / (distance + 3) +
          (100 - (d.health ?? 100)) * 0.04 +
          (d.ai?.state === 'Payload run' ? 3 : 0) +
          Math.hypot(...d.velocity) * 0.08;
        if (rank > score) {
          score = rank;
          best = d;
        }
      }
      this.subject = (best || selected || sim.drones[0])?.id;
      this.combatShot = 'duel';
      this.combatCutAt = time;
      this.crashId = '';
    }
    return sim.drones.find((d) => d.id === this.subject) || selected;
  }
  update(camera, sim, view, selected, dt) {
    const flying = sim.drones.filter((d) => ['FLY', 'RETURN', 'LAND'].includes(d.mode)),
      cast = flying.length ? flying : sim.drones;
    const center = v(0, 65, -30);
    if (cast.length) {
      center.set(0, 0, 0);
      for (const d of cast) {
        center.x += d.pos[0];
        center.y += d.pos[1];
        center.z += d.pos[2];
      }
      center.multiplyScalar(1 / cast.length);
    }
    let radius = 35;
    for (const d of cast)
      radius = Math.max(
        radius,
        Math.hypot(d.pos[0] - center.x, d.pos[1] - center.y, d.pos[2] - center.z),
      );
    radius = Math.min(1200, radius);
    this.hiddenId = '';
    const up = v(0, 1, 0);
    let fov = 55,
      snap = this.reset;
    this.reset = false;
    let drone = selected || cast[0],
      mode = view,
      phase = 0;
    if (view === 'cinematic') {
      if (sim.running && !sim.fleet.options.reducedMotion) this.time += dt;
      const shot = Math.floor(this.time / this.cutSeconds);
      phase = this.time % this.cutSeconds;
      if (shot !== this.shot) {
        this.shot = shot;
        snap = true;
        const ranked = cast
          .filter((d) => d.mode === 'FLY')
          .sort((a, b) => Math.hypot(...b.velocity) - Math.hypot(...a.velocity));
        this.subject = (ranked[(shot * 17) % Math.min(64, ranked.length)] || cast[0])?.id || '';
      }
      drone = sim.drones.find((d) => d.id === this.subject) || cast[0];
      mode = ['wide', 'chase', 'sweep', 'fpv', 'spectator', 'overhead'][
        shot % CINEMATIC_SHOTS.length
      ];
      this.label =
        CINEMATIC_SHOTS[shot % CINEMATIC_SHOTS.length] +
        (drone && ['chase', 'fpv'].includes(mode) ? ' · ' + drone.id : '');
    }
    if (view === 'combat') {
      if (
        (sim.running && !sim.fleet.options.reducedMotion) ||
        this.resetCombatSubject !== sim.drones
      ) {
        drone = this.combatSubject(sim, selected);
        this.resetCombatSubject = sim.drones;
      } else drone = sim.drones.find((d) => d.id === this.subject) || drone;
      if (drone) {
        const other = sim.drones.find((d) => d.id === drone.ai?.targetId && d.mode === 'FLY'),
          crash = this.combatShot === 'crash';
        this.target.fromArray(drone.pos);
        if (other && !crash) this.target.lerp(v().fromArray(other.pos), 0.35);
        const gap =
          other && !crash
            ? Math.min(38, Math.hypot(...drone.pos.map((p, j) => p - other.pos[j])))
            : 8;
        this.position
          .copy(this.target)
          .add(v(8 + gap * 0.45, crash ? 5 : 7 + gap * 0.22, -10 - gap * 0.55));
        this.label =
          (crash ? 'Cinematic action · Crash tracking' : 'Cinematic action · live engagement') +
          ' · ' +
          drone.id;
        fov = 62;
      } else {
        this.position.set(70, 70, 100);
        this.target.copy(center);
        this.label = 'Combat camera · no aircraft';
      }
    } else if (view === 'bestfight') {
      const pair = bestFightPair(sim);
      if (pair) {
        const [a, b] = pair,
          A = v().fromArray(a.pos),
          B = v().fromArray(b.pos),
          mid = A.clone().lerp(B, 0.5),
          line = B.clone().sub(A),
          gap = Math.max(5, line.length()),
          side = line
            .clone()
            .cross(v(0, 1, 0))
            .normalize(),
          phase = (sim.combat?.time || sim.elapsed || 0) * 0.32;
        this.target.copy(mid);
        this.position
          .copy(mid)
          .addScaledVector(side, Math.min(48, 13 + gap * 0.65))
          .add(v(Math.sin(phase) * 5, Math.min(28, 7 + gap * 0.28), Math.cos(phase) * 5));
        this.subject = a.id;
        this.fightPair = [a.id, b.id];
        this.label = 'Best fight · ' + a.id + ' vs ' + b.id;
        fov = 58;
      } else {
        this.position.set(70, 65, 110);
        this.target.copy(center);
        this.label = 'Best fight · waiting for opposing aircraft';
      }
    } else if (view === 'survivor') {
      drone = longestSurvivor(sim, this.subject);
      if (drone) {
        this.subject = drone.id;
        const forward = v(Math.sin(drone.yaw), 0, Math.cos(drone.yaw)),
          time = sim.combat?.battleTime ?? sim.combat?.time ?? sim.elapsed ?? 0;
        this.target.fromArray(drone.pos).addScaledVector(forward, 5);
        this.position
          .fromArray(drone.pos)
          .addScaledVector(forward, -11)
          .add(v(7, 5.5, 0));
        this.label = 'Longest survivor · ' + drone.id + ' · ' + Math.floor(time) + ' s';
        fov = 67;
      } else {
        this.position.set(0, 48, 110);
        this.target.copy(center);
        this.label = 'Longest survivor · no aircraft';
      }
    } else if (view === 'shoulder' || view === 'mounted') {
      if (drone) {
        const body = drone.physicsQuaternion
          ? new T.Quaternion().fromArray(drone.physicsQuaternion)
          : new T.Quaternion().setFromEuler(
              new T.Euler(drone.attitude.pitch, drone.yaw, drone.attitude.roll, 'YXZ'),
            );
        const heading = new T.Quaternion().setFromEuler(
            new T.Euler(0, drone.yaw + (this.fpvYaw || 0), 0, 'YXZ'),
          ),
          scale = drone.type === 'cargo' ? 1.65 : 1;
        this.position
          .fromArray(drone.pos)
          .add(
            view === 'mounted'
              ? v(0, 0.85, -1.25).multiplyScalar(scale).applyQuaternion(body)
              : v(2.5, 2.5, -5).multiplyScalar(scale).applyQuaternion(heading),
          );
        this.target
          .fromArray(drone.pos)
          .add(
            v(
              0,
              view === 'mounted' ? 0.15 + (this.fpvPitch || 0) * 5 : 1 + (this.fpvPitch || 0) * 9,
              view === 'mounted' ? 7 : 5,
            ).applyQuaternion(heading),
          );
        fov = view === 'mounted' ? 95 : 70;
        this.label =
          (view === 'mounted' ? 'Top-mounted · airframe visible' : 'Shoulder / isometric') +
          ' · ' +
          drone.id;
        this.subject = drone.id;
      } else {
        this.position.set(0, 45, 100);
        this.target.copy(center);
        this.label = 'Build a fleet to follow a drone';
      }
    } else if (view === 'ground' || view === 'free') {
      if (this.groundAutoAim) {
        this.yaw = Math.atan2(center.x - this.ground.x, center.z - this.ground.z);
        this.pitch = Math.atan2(
          center.y - this.ground.y,
          Math.hypot(center.x - this.ground.x, center.z - this.ground.z),
        );
      }
      const forward =
          Number(this.keys.has('w') || this.keys.has('arrowup')) -
          Number(this.keys.has('s') || this.keys.has('arrowdown')),
        side =
          Number(this.keys.has('d') || this.keys.has('arrowright')) -
          Number(this.keys.has('a') || this.keys.has('arrowleft')),
        speed = (dt * 18) / Math.max(1, Math.hypot(forward, side));
      this.ground.x = clamp(
        this.ground.x + (Math.sin(this.yaw) * forward - Math.cos(this.yaw) * side) * speed,
        -1000,
        1000,
      );
      this.ground.z = clamp(
        this.ground.z + (Math.cos(this.yaw) * forward + Math.sin(this.yaw) * side) * speed,
        -1000,
        1000,
      );
      if (view === 'free')
        this.ground.y = clamp(
          this.ground.y + (Number(this.keys.has('e')) - Number(this.keys.has('q'))) * dt * 18,
          1.7,
          300,
        );
      else this.ground.y = 1.7;
      this.position.copy(this.ground);
      this.target
        .copy(this.ground)
        .add(
          v(
            Math.sin(this.yaw) * Math.cos(this.pitch),
            Math.sin(this.pitch),
            Math.cos(this.yaw) * Math.cos(this.pitch),
          ).multiplyScalar(100),
        );
      this.label =
        view === 'free'
          ? 'Free camera · ' + Math.round(this.ground.y) + ' m'
          : 'Ground · eye height 1.7 m';
      fov = 70;
      snap = true;
    } else if (mode === 'fpv' && drone) {
      const body = drone.physicsQuaternion
        ? new T.Quaternion().fromArray(drone.physicsQuaternion)
        : new T.Quaternion().setFromEuler(
            new T.Euler(drone.attitude.pitch, drone.yaw, drone.attitude.roll, 'YXZ'),
          );
      const q = body.clone(),
        level = new T.Quaternion().setFromEuler(new T.Euler(0, drone.yaw, 0, 'YXZ'));
      q.slerp(level, this.fpv.stabilization);
      q.multiply(
        new T.Quaternion().setFromEuler(
          new T.Euler(
            (view === 'fpv' ? this.fpvPitch || 0 : 0) - (this.fpv.tilt * Math.PI) / 180,
            view === 'fpv' ? this.fpvYaw || 0 : 0,
            0,
            'YXZ',
          ),
        ),
      );
      const newSubject = this.fpvSubject !== drone.id;
      this.fpvSubject = drone.id;
      const smooth = this.fpv.smoothing;
      if (snap || newSubject || smooth === 0 || !sim.running || sim.fleet.options.reducedMotion)
        this.fpvRotation.copy(q);
      else this.fpvRotation.slerp(q, 1 - Math.exp(-dt / smooth));
      this.position.fromArray(drone.pos).add(v(0, 0.3, 0.65).applyQuaternion(body));
      this.position.y = Math.max(1.7, this.position.y);
      this.target.copy(this.position).add(v(0, 0, 100).applyQuaternion(this.fpvRotation));
      up.applyQuaternion(this.fpvRotation);
      this.hiddenId = drone.id;
      fov = this.fpv.fov;
      snap = true;
      if (view === 'fpv') this.label = 'Onboard · ' + drone.id;
    } else if (mode === 'chase' && drone) {
      const forward = v(Math.sin(drone.yaw), 0, Math.cos(drone.yaw));
      this.position
        .fromArray(drone.pos)
        .addScaledVector(forward, -14)
        .add(v(8, 6, 0));
      this.target.fromArray(drone.pos).addScaledVector(forward, 8);
      fov = 70;
    } else if (mode === 'sweep') {
      this.position
        .copy(center)
        .add(v((phase / this.cutSeconds - 0.5) * radius * 2, radius * 0.25, radius * 1.65));
      this.target.copy(center);
      fov = 65;
    } else if (mode === 'spectator') {
      this.position.set(center.x - radius * 0.7, 1.7, center.z + radius * 2.5 + 90);
      this.target.copy(center);
      fov = 60;
    } else if (mode === 'overhead') {
      this.position.copy(center).add(v(Math.sin(phase * 0.1) * radius * 0.3, radius * 2.7, 5));
      this.target.copy(center);
      fov = 55;
    } else {
      const angle = this.time * 0.035;
      this.position
        .copy(center)
        .add(v(Math.sin(angle) * radius * 2.8, radius * 0.9 + 30, Math.cos(angle) * radius * 2.8));
      this.target.copy(center);
      this.label = view === 'fpv' ? 'Onboard · build a fleet' : this.label;
    }
    if (['cinematic', 'combat', 'bestfight', 'survivor'].includes(view) && !sim.running && !snap)
      return this.hiddenId;
    this.position.y = Math.max(1.7, this.position.y);
    if (sim.fleet.options.obstacles)
      for (const b of COMMANDER_OBSTACLES)
        if (Math.abs(this.position.x - b.x) < b.w + 1 && Math.abs(this.position.z - b.z) < b.d + 1)
          this.position.y = Math.max(this.position.y, b.h + 1.5);
    const alpha = snap ? 1 : 1 - Math.exp(-dt * 5);
    camera.position.lerp(this.position, alpha);
    this.aim ??= this.target.clone();
    this.aim.lerp(this.target, alpha);
    camera.up.copy(up);
    camera.lookAt(this.aim);
    if (Math.abs(camera.fov - fov) > 0.1) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    return this.hiddenId;
  }
}
