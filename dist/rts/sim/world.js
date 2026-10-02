// Deterministic RTS simulation core. No DOM, no rendering, no wall-clock time, no Math.random.
// The only inputs are the seed, the map and the ordered command list for each tick, so every
// peer (and every replay) that feeds the same commands reaches the same state hash.

import { Rng, Hasher, dsin, dcos, len, clamp, TAU } from './dmath.js';
import { SpatialGrid } from './grid.js';
import { MAPS } from './maps.js';
import {
  TICK_RATE,
  DT,
  MAX_DRONES,
  START_ENERGY,
  ROLES,
  ROLE_INDEX,
  STRUCTURES,
  STRUCTURE_KINDS,
  WEAPONS,
  FORMATIONS,
  PLAYS,
} from './defs.js';
import { RULE_PERIOD, DEFAULT_RULES, runRules, validateRules } from './rules.js';
import { flightStep, quantize, F_PILOT, F_FIRE, COS_CONE } from './flight.js';

export { F_PILOT, F_FIRE };
// Ground fields (jammer and kill zones, repair) only reach drones below this altitude.
export const FIELD_CEILING = 14;

export const VIS_CELL = 4;
const SENSE_RADIUS = 18;
const NEAR_RADIUS = 40;
const SEPARATION = 1.6;
const SQUAD_NAMES = [
  'Alpha',
  'Bravo',
  'Charlie',
  'Delta',
  'Echo',
  'Foxtrot',
  'Golf',
  'Hotel',
  'India',
  'Juliet',
  'Kilo',
  'Lima',
  'Mike',
  'November',
  'Oscar',
  'Papa',
  'Quebec',
  'Romeo',
  'Sierra',
  'Tango',
  'Uniform',
  'Victor',
  'Whiskey',
  'Xray',
  'Yankee',
  'Zulu',
];

// Drone flag bits.
export const F_JAMMED = 1,
  F_DETECTED = 2,
  F_ENGAGED = 4,
  F_COUNTER = 8;
// Drone combat modes, set by the squad's current play.
const M_DEFEND = 0, // fire at targets already in weapon range
  M_CHASE = 1, // break formation to chase targets in sensor range
  M_PASSIVE = 2; // never fire (retreating)

const weaponDps = (w) => (w ? w.damage / w.cooldown : 0);
const roleWeaponType = ROLES.map((r) => (r.weapon ? r.weapon.type : null));

export function formationOffset(type, i, n, spacing, phase = 0) {
  const c = (n - 1) / 2;
  switch (type) {
    case 'line':
      return [(i - c) * spacing, 0];
    case 'column':
      return [0, (c - i) * spacing];
    case 'wedge': {
      const row = Math.floor((i + 1) / 2);
      return [(i % 2 ? 1 : -1) * row * spacing, (n / 4 - row) * spacing * 0.8];
    }
    case 'ring': {
      const a = (i / n) * TAU + phase,
        r = Math.max(2, (n * spacing) / TAU);
      return [dcos(a) * r, dsin(a) * r];
    }
    case 'grid': {
      const w = Math.ceil(Math.sqrt(n)),
        h = Math.ceil(n / w);
      return [((i % w) - (w - 1) / 2) * spacing, ((h - 1) / 2 - Math.floor(i / w)) * spacing];
    }
    case 'diamond': {
      const a = (i / n) * TAU + phase,
        r = Math.max(3, Math.sqrt(n) * spacing * 0.9),
        ca = dcos(a),
        sa = dsin(a),
        k = r / (Math.abs(ca) + Math.abs(sa));
      return [ca * k, sa * k];
    }
    default: {
      // swarm / spiral: golden-angle sunflower
      const a = i * 2.399963229728653 + phase,
        r = Math.sqrt(i + 0.5) * spacing * (type === 'spiral' ? 0.8 : 0.6);
      return [dcos(a) * r, dsin(a) * r];
    }
  }
}

export class World {
  constructor({ seed = 1, map = 'delta', players = 2, capacity = MAX_DRONES } = {}) {
    this.mapKey = map;
    this.map = MAPS[map];
    this.half = this.map.half;
    this.seed = seed;
    this.rng = new Rng(seed);
    this.tick = 0;
    this.cap = capacity;
    const N = capacity;
    this.alive = new Uint8Array(N);
    this.team = new Uint8Array(N);
    this.role = new Uint8Array(N);
    this.flags = new Uint8Array(N);
    this.mode = new Uint8Array(N);
    this.squadOf = new Int32Array(N);
    this.uid = new Int32Array(N);
    this.target = new Int32Array(N); // >0 drone uid, <0 -(structure id + 1), 0 none
    this.px = new Float64Array(N);
    this.pz = new Float64Array(N);
    this.ox = new Float64Array(N); // previous tick position, for render interpolation
    this.oz = new Float64Array(N);
    this.vx = new Float64Array(N);
    this.vz = new Float64Array(N);
    this.tx = new Float64Array(N); // formation slot target
    this.tz = new Float64Array(N);
    this.hp = new Float64Array(N);
    this.cd = new Float64Array(N);
    // Flight state: altitude, climb rate and attitude (yaw/pitch/roll in radians) + previous tick.
    this.py = new Float64Array(N);
    this.vy = new Float64Array(N);
    this.yaw = new Float64Array(N);
    this.yawRate = new Float64Array(N);
    this.pitch = new Float64Array(N);
    this.roll = new Float64Array(N);
    this.opy = new Float64Array(N);
    this.oyaw = new Float64Array(N);
    this.opitch = new Float64Array(N);
    this.oroll = new Float64Array(N);
    this.stick = new Float64Array(N * 4); // pilot input: throttle, yaw, pitch, roll
    this.count = 0; // slot high-water mark
    this.free = [];
    this.uidMap = new Map();
    this.nextUid = 1;
    this.structures = [];
    this.structMap = new Map();
    this.nextStruct = 0;
    this.squads = [];
    this.squadMap = new Map();
    this.nextSquad = 1;
    this.grid = new SpatialGrid(this.half, 4, N);
    this.scratch = new Int32Array(N);
    this.scratch2 = new Int32Array(N);
    this.visN = Math.ceil((2 * this.half) / VIS_CELL);
    this.events = [];
    this.winner = -1;
    this.wells = this.map.wells.map((w, i) => ({ id: i, x: w.x, z: w.z, owner: -1 }));
    this.teams = [];
    for (let t = 0; t < players; t++) this.addTeam(t);
    this.totals();
    this.updateVisibility();
  }

  // ---------- setup ----------

  addTeam(t) {
    const start = this.map.starts[t];
    const cells = this.visN * this.visN;
    const toCenter = len(start.x, start.z) || 1;
    const team = {
      id: t,
      energy: START_ENERGY,
      income: 0,
      bwCap: 0,
      bwUsed: 0,
      alive: true,
      vis: new Uint8Array(cells),
      explored: new Uint8Array(cells),
      rallyX: start.x - (start.x / toCenter) * 12,
      rallyZ: start.z - (start.z / toCenter) * 12,
      rallySquad: 0,
      squadSerial: 0,
      kills: 0,
      losses: 0,
      spent: 0,
      lastAlert: -1e9,
      pilot: 0, // uid of the drone this team's player is flying, 0 if none
    };
    this.teams.push(team);
    this.addStructure(t, 'core', start.x, start.z, true);
    const sq = this.createSquad(t);
    const mix = [
      'scout',
      'scout',
      'scout',
      'scout',
      'scout',
      'scout',
      'interceptor',
      'interceptor',
      'interceptor',
      'interceptor',
    ];
    mix.forEach((r, k) => {
      const a = (k / mix.length) * TAU;
      this.spawnDrone(t, ROLE_INDEX[r], team.rallyX + dcos(a) * 3, team.rallyZ + dsin(a) * 3, sq);
    });
    sq.order = { play: 'move', x: team.rallyX, z: team.rallyZ, x0: team.rallyX, z0: team.rallyZ };
  }

  spawnDrone(t, role, x, z, squad) {
    const i = this.free.length ? this.free.pop() : this.count++;
    if (i >= this.cap) return -1;
    const r = ROLES[role];
    this.alive[i] = 1;
    this.team[i] = t;
    this.role[i] = role;
    this.flags[i] = 0;
    this.mode[i] = M_DEFEND;
    this.px[i] = this.ox[i] = this.tx[i] = x;
    this.pz[i] = this.oz[i] = this.tz[i] = z;
    this.vx[i] = this.vz[i] = 0;
    this.py[i] = this.opy[i] = 0.6; // takes off from the pad and climbs to cruise altitude
    this.vy[i] = this.pitch[i] = this.roll[i] = this.opitch[i] = this.oroll[i] = 0;
    this.yaw[i] = this.oyaw[i] = this.yawRate[i] = 0;
    this.stick.fill(0, i * 4, i * 4 + 4);
    this.hp[i] = r.hp;
    this.cd[i] = 0;
    this.target[i] = 0;
    this.uid[i] = this.nextUid++;
    this.uidMap.set(this.uid[i], i);
    this.squadOf[i] = squad.id;
    squad.members.push(i);
    this.events.push({ k: 'spawn', i, team: t, role });
    return i;
  }

  addStructure(t, kind, x, z, complete = false) {
    const def = STRUCTURES[kind];
    const s = {
      id: this.nextStruct++,
      team: t,
      kind,
      x,
      z,
      maxHp: def.hp,
      hp: complete ? def.hp : def.hp * 0.1,
      progress: complete ? 1 : 0,
      queue: [],
      cd: 0,
      target: 0,
      alive: true,
    };
    if (def.onWell) {
      const w = this.wellAt(x, z);
      if (w) {
        w.owner = s.id;
        s.x = w.x;
        s.z = w.z;
      }
    }
    this.structures.push(s);
    this.structMap.set(s.id, s);
    return s;
  }

  createSquad(t) {
    const team = this.teams[t];
    const sq = {
      id: this.nextSquad++,
      team: t,
      name: SQUAD_NAMES[team.squadSerial++ % SQUAD_NAMES.length],
      members: [],
      formation: 'swarm',
      spacing: 2.4,
      order: null,
      ax: 0,
      az: 0,
      hx: 0,
      hz: 1,
      phase: 0,
      stage: 0,
      sub: null,
      rules: DEFAULT_RULES.map((r) => ({ ...r })),
      cooldowns: {},
      reaction: null,
      reactions: 0,
      cx: 0,
      cz: 0,
      sensed: null,
      anchored: false,
    };
    this.squads.push(sq);
    this.squadMap.set(sq.id, sq);
    return sq;
  }

  // ---------- queries ----------

  wellAt(x, z, r = 3.5) {
    for (const w of this.wells) if (len(w.x - x, w.z - z) <= r) return w;
    return null;
  }

  visible(t, x, z) {
    const n = this.visN;
    const cx = clamp(Math.floor((x + this.half) / VIS_CELL), 0, n - 1),
      cz = clamp(Math.floor((z + this.half) / VIS_CELL), 0, n - 1);
    return this.teams[t].vis[cz * n + cx] === 1;
  }

  powered(t, x, z) {
    for (const s of this.structures)
      if (s.alive && s.team === t && s.progress >= 1 && STRUCTURES[s.kind].power)
        if (len(s.x - x, s.z - z) <= STRUCTURES[s.kind].power) return true;
    return false;
  }

  canPlace(t, kind, x, z) {
    const def = STRUCTURES[kind];
    if (!def || kind === 'core') return { ok: false, reason: 'Unknown structure' };
    const team = this.teams[t];
    if (team.energy < def.cost) return { ok: false, reason: 'Not enough energy' };
    if (Math.abs(x) > this.half - 4 || Math.abs(z) > this.half - 4)
      return { ok: false, reason: 'Too close to the edge' };
    if (def.onWell) {
      const w = this.wellAt(x, z);
      if (!w) return { ok: false, reason: 'Must be placed on an energy well' };
      if (w.owner >= 0 && this.structMap.get(w.owner)?.alive)
        return { ok: false, reason: 'Well already claimed' };
      x = w.x;
      z = w.z;
    } else if (this.wellAt(x, z, 3)) return { ok: false, reason: 'Keep energy wells clear' };
    if (!this.powered(t, x, z)) return { ok: false, reason: 'Outside your power grid' };
    for (const o of this.map.obstacles)
      if (len(o.x - x, o.z - z) < o.r + def.radius + 1)
        return { ok: false, reason: 'Blocked by terrain' };
    for (const s of this.structures)
      if (s.alive && len(s.x - x, s.z - z) < STRUCTURES[s.kind].radius + def.radius + 1.5)
        return { ok: false, reason: 'Too close to another structure' };
    return { ok: true, x, z };
  }

  bandwidthFree(t) {
    const team = this.teams[t];
    return team.bwCap - team.bwUsed;
  }

  // ---------- commands ----------

  apply(cmd) {
    const team = this.teams[cmd.team];
    if (!team || !team.alive || this.winner >= 0) return false;
    switch (cmd.type) {
      case 'order':
        return this.cmdOrder(cmd);
      case 'formation': {
        const sq = this.squadMap.get(cmd.squad);
        if (!sq || sq.team !== cmd.team || !FORMATIONS.includes(cmd.formation)) return false;
        sq.formation = cmd.formation;
        return true;
      }
      case 'spacing': {
        const sq = this.squadMap.get(cmd.squad);
        if (!sq || sq.team !== cmd.team) return false;
        sq.spacing = clamp(Number(cmd.spacing) || 2.4, 1.2, 6);
        return true;
      }
      case 'rules': {
        const sq = this.squadMap.get(cmd.squad);
        if (!sq || sq.team !== cmd.team) return false;
        try {
          sq.rules = validateRules(cmd.rules);
        } catch {
          return false;
        }
        sq.reaction = null;
        sq.cooldowns = {};
        return true;
      }
      case 'build': {
        const check = this.canPlace(cmd.team, cmd.kind, cmd.x, cmd.z);
        if (!check.ok) return false;
        team.energy -= STRUCTURES[cmd.kind].cost;
        team.spent += STRUCTURES[cmd.kind].cost;
        const s = this.addStructure(cmd.team, cmd.kind, check.x, check.z);
        this.events.push({ k: 'place', id: s.id, team: cmd.team });
        return true;
      }
      case 'produce':
        return this.cmdProduce(cmd);
      case 'cancel': {
        const s = this.structMap.get(cmd.structure);
        if (!s || s.team !== cmd.team || !s.queue.length) return false;
        const r = ROLES[s.queue.pop().role];
        team.energy += r.cost * r.pack;
        team.spent -= r.cost * r.pack;
        return true;
      }
      case 'rally':
        team.rallyX = clamp(cmd.x, -this.half + 2, this.half - 2);
        team.rallyZ = clamp(cmd.z, -this.half + 2, this.half - 2);
        return true;
      case 'pilot':
        return this.cmdPilot(cmd);
      case 'stick': {
        const i = this.uidMap.get(cmd.uid);
        if (i === undefined || this.team[i] !== cmd.team || !(this.flags[i] & F_PILOT))
          return false;
        const o = i * 4;
        this.stick[o] = quantize(cmd.t);
        this.stick[o + 1] = quantize(cmd.y);
        this.stick[o + 2] = quantize(cmd.p);
        this.stick[o + 3] = quantize(cmd.r);
        if (cmd.fire) this.flags[i] |= F_FIRE;
        else this.flags[i] &= ~F_FIRE;
        return true;
      }
      case 'surrender':
        this.defeat(cmd.team);
        return true;
    }
    return false;
  }

  cmdOrder(cmd) {
    if (!PLAYS.includes(cmd.play)) return false;
    const slots = [];
    for (const u of cmd.uids || []) {
      const i = this.uidMap.get(u);
      if (i !== undefined && this.alive[i] && this.team[i] === cmd.team) slots.push(i);
    }
    if (!slots.length) return false;
    let sq = this.squadMap.get(this.squadOf[slots[0]]);
    const same =
      slots.every((i) => this.squadOf[i] === sq.id) && sq.members.length === slots.length;
    if (!same) {
      const from = sq;
      sq = this.createSquad(cmd.team);
      sq.formation = from.formation;
      sq.spacing = from.spacing;
      sq.rules = from.rules.map((r) => ({ ...r }));
      for (const i of slots) {
        const old = this.squadMap.get(this.squadOf[i]);
        old.members.splice(old.members.indexOf(i), 1);
        this.squadOf[i] = sq.id;
        sq.members.push(i);
      }
      this.pruneSquads();
    }
    if (this.teams[cmd.team].rallySquad === sq.id) this.teams[cmd.team].rallySquad = 0;
    if (cmd.formation && FORMATIONS.includes(cmd.formation)) sq.formation = cmd.formation;
    if (cmd.rules) {
      try {
        sq.rules = validateRules(cmd.rules);
        sq.cooldowns = {};
      } catch {
        // Invalid scripts leave the squad's current rules in place.
      }
    }
    this.centroid(sq);
    if (!sq.anchored) {
      sq.ax = sq.cx;
      sq.az = sq.cz;
      sq.anchored = true;
    }
    const x = clamp(Number(cmd.x), -this.half + 2, this.half - 2),
      z = clamp(Number(cmd.z), -this.half + 2, this.half - 2);
    sq.order = { play: cmd.play, x, z, x0: sq.cx, z0: sq.cz };
    sq.stage = 0;
    sq.sub = null;
    sq.reaction = null;
    return true;
  }

  // Take (on: true) or release manual control of one drone. One piloted drone per team.
  cmdPilot(cmd) {
    const team = this.teams[cmd.team];
    const release = (u) => {
      const j = this.uidMap.get(u);
      if (j !== undefined) {
        this.flags[j] &= ~(F_PILOT | F_FIRE);
        this.stick.fill(0, j * 4, j * 4 + 4);
      }
      team.pilot = 0;
    };
    if (!cmd.on) {
      if (team.pilot) release(team.pilot);
      return true;
    }
    const i = this.uidMap.get(cmd.uid);
    if (i === undefined || !this.alive[i] || this.team[i] !== cmd.team) return false;
    if (team.pilot && team.pilot !== cmd.uid) release(team.pilot);
    this.flags[i] |= F_PILOT;
    this.stick.fill(0, i * 4, i * 4 + 4);
    team.pilot = cmd.uid;
    return true;
  }

  cmdProduce(cmd) {
    const role = typeof cmd.role === 'number' ? cmd.role : ROLE_INDEX[cmd.role];
    const r = ROLES[role];
    const team = this.teams[cmd.team];
    if (!r || team.energy < r.cost * r.pack || this.bandwidthFree(cmd.team) < r.bw * r.pack)
      return false;
    let best = null;
    for (const s of this.structures) {
      if (!s.alive || s.team !== cmd.team || s.progress < 1 || !STRUCTURES[s.kind].produces)
        continue;
      if (cmd.structure !== undefined && s.id !== cmd.structure) continue;
      if (s.queue.length >= 8) continue;
      if (!best || s.queue.length < best.queue.length) best = s;
    }
    if (!best) return false;
    team.energy -= r.cost * r.pack;
    team.spent += r.cost * r.pack;
    best.queue.push({ role, left: r.build });
    team.bwUsed += r.bw * r.pack;
    return true;
  }

  pruneSquads() {
    for (let k = this.squads.length - 1; k >= 0; k--) {
      const sq = this.squads[k];
      if (sq.members.length) continue;
      this.squads.splice(k, 1);
      this.squadMap.delete(sq.id);
      const team = this.teams[sq.team];
      if (team.rallySquad === sq.id) team.rallySquad = 0;
    }
  }

  // ---------- tick ----------

  step(commands = []) {
    if (this.winner >= 0) return;
    this.events = [];
    for (const c of commands) this.apply(c);
    const N = this.count;
    this.ox.set(this.px.subarray(0, N));
    this.oz.set(this.pz.subarray(0, N));
    this.opy.set(this.py.subarray(0, N));
    this.oyaw.set(this.yaw.subarray(0, N));
    this.opitch.set(this.pitch.subarray(0, N));
    this.oroll.set(this.roll.subarray(0, N));
    this.economy();
    this.grid.build(this.alive, this.px, this.pz, N);
    this.auras();
    for (const sq of this.squads) this.updateSquad(sq);
    this.updateDrones();
    this.updateStructures();
    this.resolveDeaths();
    if ((this.tick & 3) === 0) this.updateVisibility();
    this.tick++;
  }

  // Income, bandwidth capacity and bandwidth use (live drones + queued production).
  totals() {
    for (const team of this.teams) {
      team.income = 0;
      team.bwCap = 0;
      team.bwUsed = 0;
    }
    for (let i = 0; i < this.count; i++)
      if (this.alive[i]) this.teams[this.team[i]].bwUsed += ROLES[this.role[i]].bw;
    for (const s of this.structures) {
      if (!s.alive) continue;
      const def = STRUCTURES[s.kind],
        team = this.teams[s.team];
      for (const q of s.queue) team.bwUsed += ROLES[q.role].bw * ROLES[q.role].pack;
      if (s.progress < 1) continue;
      team.income += def.income || 0;
      team.bwCap += def.bandwidth || 0;
    }
  }

  economy() {
    for (const s of this.structures) {
      if (!s.alive) continue;
      const def = STRUCTURES[s.kind];
      if (s.progress < 1) {
        s.progress = Math.min(1, s.progress + DT / def.build);
        s.hp = Math.min(s.maxHp, s.hp + (s.maxHp * 0.9 * DT) / def.build);
        if (s.progress >= 1) this.events.push({ k: 'built', id: s.id, team: s.team, kind: s.kind });
        continue;
      }
      if (s.queue.length) {
        const q = s.queue[0];
        q.left -= DT;
        if (q.left <= 0) {
          s.queue.shift();
          for (let k = 0; k < ROLES[q.role].pack; k++) this.produceDrone(s, q.role);
        }
      }
    }
    this.totals();
    for (const team of this.teams) if (team.alive) team.energy += team.income * DT;
  }

  produceDrone(s, role) {
    const team = this.teams[s.team];
    let sq = this.squadMap.get(team.rallySquad);
    if (!sq) {
      sq = this.createSquad(s.team);
      team.rallySquad = sq.id;
      sq.ax = s.x;
      sq.az = s.z;
      sq.anchored = true;
    }
    sq.order = { play: 'move', x: team.rallyX, z: team.rallyZ, x0: team.rallyX, z0: team.rallyZ };
    const a = this.rng.next() * TAU,
      r = STRUCTURES[s.kind].radius + 1;
    this.spawnDrone(s.team, role, s.x + dcos(a) * r, s.z + dsin(a) * r, sq);
  }

  auras() {
    const { alive, team, role, flags, px, pz, hp, grid, scratch } = this;
    const N = this.count;
    for (let i = 0; i < N; i++) flags[i] &= ~(F_JAMMED | F_DETECTED | F_COUNTER);
    const py = this.py;
    const jamAround = (t, x, z, r, ceiling = 1e9) => {
      const k = grid.query(x, z, r, px, pz, scratch);
      for (let j = 0; j < k; j++)
        if (team[scratch[j]] !== t && py[scratch[j]] < ceiling) flags[scratch[j]] |= F_JAMMED;
    };
    // Jamming sources, then counter-jamming from relay drones.
    for (let i = 0; i < N; i++) {
      if (!alive[i]) continue;
      const a = ROLES[role[i]].aura;
      if (a?.jam) jamAround(team[i], px[i], pz[i], a.jam);
    }
    for (const s of this.structures) {
      if (!s.alive || s.progress < 1) continue;
      const def = STRUCTURES[s.kind];
      if (def.jam) jamAround(s.team, s.x, s.z, def.jam, FIELD_CEILING);
      if (def.detect) {
        const k = grid.query(s.x, s.z, def.detect, px, pz, scratch);
        for (let j = 0; j < k; j++)
          if (team[scratch[j]] !== s.team) flags[scratch[j]] |= F_DETECTED;
      }
    }
    for (let i = 0; i < N; i++) {
      if (!alive[i]) continue;
      const a = ROLES[role[i]].aura;
      if (a?.counterJam) {
        const k = grid.query(px[i], pz[i], a.counterJam, px, pz, scratch);
        for (let j = 0; j < k; j++)
          if (team[scratch[j]] === team[i]) flags[scratch[j]] |= F_COUNTER;
      }
      if (a?.heal) {
        const k = grid.query(px[i], pz[i], a.heal, px, pz, scratch);
        for (let j = 0; j < k; j++) {
          const o = scratch[j];
          if (team[o] === team[i]) hp[o] = Math.min(ROLES[role[o]].hp, hp[o] + a.healRate * DT);
        }
      }
    }
    for (let i = 0; i < N; i++) if (flags[i] & F_COUNTER) flags[i] &= ~F_JAMMED;
    for (const s of this.structures) {
      if (!s.alive || s.progress < 1) continue;
      const def = STRUCTURES[s.kind];
      if (def.heal) {
        const k = grid.query(s.x, s.z, def.heal.radius, px, pz, scratch);
        for (let j = 0; j < k; j++) {
          const o = scratch[j];
          if (team[o] === s.team && py[o] < FIELD_CEILING)
            hp[o] = Math.min(ROLES[role[o]].hp, hp[o] + def.heal.rate * DT);
        }
      }
      if (def.zone) {
        const k = grid.query(s.x, s.z, def.zone.radius, px, pz, scratch);
        for (let j = 0; j < k; j++) {
          const o = scratch[j];
          if (team[o] !== s.team && py[o] < FIELD_CEILING)
            this.damageDrone(o, def.zone.dps * DT, s.team);
        }
      }
    }
  }

  centroid(sq) {
    let x = 0,
      z = 0;
    for (const i of sq.members) {
      x += this.px[i];
      z += this.pz[i];
    }
    const n = sq.members.length || 1;
    sq.cx = x / n;
    sq.cz = z / n;
  }

  sense(sq) {
    const { px, pz, team, role, hp, flags, grid, scratch } = this;
    let health = 0,
      jammed = 0,
      detected = 0,
      own = 0;
    for (const i of sq.members) {
      const r = ROLES[role[i]];
      health += hp[i] / r.hp;
      if (flags[i] & F_JAMMED) jammed++;
      if (flags[i] & F_DETECTED) detected++;
      own += hp[i] * (weaponDps(r.weapon) || 2);
    }
    const n = sq.members.length || 1;
    let enemyPower = 0,
      enemyCount = 0,
      nearest = 1e9,
      tx = 0,
      tz = 0;
    const k = grid.query(sq.cx, sq.cz, NEAR_RADIUS, px, pz, scratch);
    for (let j = 0; j < k; j++) {
      const o = scratch[j];
      if (team[o] === sq.team || !this.visible(sq.team, px[o], pz[o])) continue;
      const d = len(px[o] - sq.cx, pz[o] - sq.cz);
      if (d < nearest) nearest = d;
      if (d <= SENSE_RADIUS) {
        const r = ROLES[role[o]];
        enemyPower += hp[o] * (weaponDps(r.weapon) || 2);
        enemyCount++;
        tx += px[o];
        tz += pz[o];
      }
    }
    for (const s of this.structures) {
      if (!s.alive || s.team === sq.team || s.progress < 1) continue;
      const def = STRUCTURES[s.kind],
        d = len(s.x - sq.cx, s.z - sq.cz);
      if (d > SENSE_RADIUS + 6 || !this.visible(sq.team, s.x, s.z)) continue;
      const dps = weaponDps(def.weapon) + (def.zone ? def.zone.dps * 3 : 0);
      if (!dps) continue;
      enemyPower += s.hp * dps;
      tx += s.x;
      tz += s.z;
      enemyCount++;
      if (d < nearest) nearest = d;
    }
    sq.sensed = {
      size: sq.members.length,
      health: health / n,
      jammed: jammed / n,
      detected,
      threat: enemyPower / Math.max(1, own),
      nearestEnemy: nearest,
      enemyCount,
      threatX: enemyCount ? tx / enemyCount : sq.cx,
      threatZ: enemyCount ? tz / enemyCount : sq.cz,
    };
    return sq.sensed;
  }

  nearestHome(t, x, z) {
    let best = null,
      bd = 1e9;
    for (const s of this.structures) {
      if (!s.alive || s.team !== t || s.progress < 1) continue;
      if (s.kind !== 'repair' && s.kind !== 'core') continue;
      const d = len(s.x - x, s.z - z) - (s.kind === 'repair' ? 1000 : 0); // prefer repair fields
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  updateSquad(sq) {
    const n = sq.members.length;
    if (!n) return;
    this.centroid(sq);
    if (!sq.anchored) {
      sq.ax = sq.cx;
      sq.az = sq.cz;
      sq.anchored = true;
    }
    if ((this.tick + sq.id) % RULE_PERIOD === 0) {
      const s = this.sense(sq);
      runRules(sq, s, this.tick, TICK_RATE);
      if (sq.reaction && s.enemyCount) {
        sq.reaction.x = s.threatX;
        sq.reaction.z = s.threatZ;
      }
    }
    const order = sq.order || { play: 'hold', x: sq.ax, z: sq.az, x0: sq.ax, z0: sq.az };
    let play = order.play,
      gx = order.x,
      gz = order.z,
      formation = sq.formation,
      spread = 1;
    const reaction = sq.reaction && sq.rules[sq.reaction.index];
    if (reaction) {
      const rx = sq.reaction.x,
        rz = sq.reaction.z;
      switch (reaction.then) {
        case 'evade': {
          const dx = sq.cx - rx,
            dz = sq.cz - rz,
            d = len(dx, dz) || 1;
          gx = sq.cx + (dx / d) * 14;
          gz = sq.cz + (dz / d) * 14;
          play = 'move';
          spread = 1.8;
          break;
        }
        case 'retreat': {
          const home = this.nearestHome(sq.team, sq.cx, sq.cz);
          if (home) {
            gx = home.x;
            gz = home.z;
          }
          play = 'retreat';
          break;
        }
        case 'attack':
          gx = rx;
          gz = rz;
          play = 'attack';
          break;
        case 'hold':
          gx = sq.ax;
          gz = sq.az;
          play = 'hold';
          break;
        case 'regroup':
          gx = sq.cx;
          gz = sq.cz;
          formation = 'grid';
          spread = 0.8;
          play = 'hold';
          break;
        case 'formation':
          formation = reaction.formation;
          break;
      }
    }
    // Members of an attacking squad that are already fighting pin the anchor in place.
    let engaged = 0,
      lag = 0,
      minSpeed = 1e9;
    for (const i of sq.members) {
      if (this.flags[i] & F_PILOT) continue;
      if (this.flags[i] & F_ENGAGED) engaged++;
      lag += len(this.tx[i] - this.px[i], this.tz[i] - this.pz[i]);
      const sp = ROLES[this.role[i]].speed;
      if (sp < minSpeed) minSpeed = sp;
    }
    lag /= n;
    let speed = minSpeed * 0.85;
    if (lag > 6) speed *= 0.35;
    if ((play === 'attack' || play === 'patrol' || play === 'pincer') && engaged > n * 0.25)
      speed = 0;
    if (play === 'patrol') {
      const leg = sq.stage % 2 === 0 ? [order.x, order.z] : [order.x0, order.z0];
      gx = leg[0];
      gz = leg[1];
      if (len(sq.ax - gx, sq.az - gz) < 2) sq.stage++;
    }
    if (play === 'orbit') {
      formation = 'ring';
      sq.phase += 0.35 * DT;
    } else if (formation === 'swarm') sq.phase += 0.12 * DT;
    // Move the anchor toward the goal.
    const mode =
      play === 'retreat'
        ? M_PASSIVE
        : play === 'attack' || play === 'patrol' || play === 'pincer'
          ? M_CHASE
          : M_DEFEND;
    if (play === 'pincer' && !reaction) {
      this.pincer(sq, order, speed, mode);
      return;
    }
    this.moveAnchor(sq, gx, gz, speed);
    const fx = sq.hx,
      fz = sq.hz,
      sp = sq.spacing * spread;
    for (let k = 0; k < n; k++) {
      const i = sq.members[k];
      const [ox, oz] = formationOffset(formation, k, n, sp, sq.phase);
      this.tx[i] = sq.ax + fz * ox + fx * oz;
      this.tz[i] = sq.az - fx * ox + fz * oz;
      this.mode[i] = mode;
    }
  }

  moveAnchor(sq, gx, gz, speed) {
    const dx = gx - sq.ax,
      dz = gz - sq.az,
      d = len(dx, dz);
    if (d > 0.05) {
      const step = Math.min(d, speed * DT);
      sq.ax += (dx / d) * step;
      sq.az += (dz / d) * step;
      if (d > 1) {
        const hx = sq.hx * 0.9 + (dx / d) * 0.1,
          hz = sq.hz * 0.9 + (dz / d) * 0.1,
          h = len(hx, hz) || 1;
        sq.hx = hx / h;
        sq.hz = hz / h;
      }
    }
  }

  pincer(sq, order, speed, mode) {
    const n = sq.members.length;
    const dx = order.x - order.x0,
      dz = order.z - order.z0,
      d = len(dx, dz) || 1;
    const fx = dx / d,
      fz = dz / d;
    if (!sq.sub) {
      sq.sub = [
        { x: sq.ax, z: sq.az },
        { x: sq.ax, z: sq.az },
      ];
      sq.stageTick = this.tick;
    }
    const wide = Math.max(14, d * 0.45);
    for (let h = 0; h < 2; h++) {
      const side = h ? 1 : -1;
      const gx = sq.stage === 0 ? order.x - fx * wide * 0.5 + fz * wide * side : order.x;
      const gz = sq.stage === 0 ? order.z - fz * wide * 0.5 - fx * wide * side : order.z;
      const s = sq.sub[h],
        ex = gx - s.x,
        ez = gz - s.z,
        e = len(ex, ez);
      if (e > 0.05) {
        const step = Math.min(e, speed * DT * 1.1);
        s.x += (ex / e) * step;
        s.z += (ez / e) * step;
      }
    }
    const arrived = sq.sub.every((s, h) => {
      const side = h ? 1 : -1;
      return (
        len(
          s.x - (order.x - fx * wide * 0.5 + fz * wide * side),
          s.z - (order.z - fz * wide * 0.5 - fx * wide * side),
        ) < 3
      );
    });
    if (sq.stage === 0 && (arrived || this.tick - sq.stageTick > 30 * TICK_RATE)) sq.stage = 1;
    sq.ax = (sq.sub[0].x + sq.sub[1].x) / 2;
    sq.az = (sq.sub[0].z + sq.sub[1].z) / 2;
    sq.hx = fx;
    sq.hz = fz;
    const half = [[], []];
    sq.members.forEach((i, k) => half[k & 1].push(i));
    for (let h = 0; h < 2; h++) {
      const m = half[h],
        s = sq.sub[h];
      for (let k = 0; k < m.length; k++) {
        const i = m[k];
        const [ox, oz] = formationOffset('wedge', k, m.length, sq.spacing, 0);
        this.tx[i] = s.x + fz * ox + fx * oz;
        this.tz[i] = s.z - fx * ox + fz * oz;
        this.mode[i] = sq.stage === 0 ? M_DEFEND : mode;
      }
    }
    if (n === 1) this.mode[sq.members[0]] = mode;
  }

  resolveTarget(code) {
    if (code > 0) {
      const j = this.uidMap.get(code);
      return j !== undefined && this.alive[j]
        ? { x: this.px[j], z: this.pz[j], r: 0, drone: j }
        : null;
    }
    if (code < 0) {
      const s = this.structMap.get(-code - 1);
      return s && s.alive ? { x: s.x, z: s.z, r: STRUCTURES[s.kind].radius, struct: s } : null;
    }
    return null;
  }

  acquire(t, x, z, radius) {
    const { px, pz, team, grid, scratch2 } = this;
    let best = 0,
      bd = 1e9;
    const k = grid.query(x, z, radius, px, pz, scratch2);
    for (let j = 0; j < k; j++) {
      const o = scratch2[j];
      if (team[o] === t || !this.visible(t, px[o], pz[o])) continue;
      const d = (px[o] - x) * (px[o] - x) + (pz[o] - z) * (pz[o] - z);
      if (d < bd || (d === bd && this.uid[o] < best)) {
        bd = d;
        best = this.uid[o];
      }
    }
    for (const s of this.structures) {
      if (!s.alive || s.team === t) continue;
      const r = STRUCTURES[s.kind].radius;
      const d = len(s.x - x, s.z - z) - r;
      if (d > radius || !this.visible(t, s.x, s.z)) continue;
      // Drones are preferred; structures only when nothing mobile is around.
      if (best === 0 || best < 0) {
        const dd = d * d + 1e6;
        if (best === 0 || dd < bd) {
          bd = dd;
          best = -(s.id + 1);
        }
      }
    }
    return best;
  }

  updateDrones() {
    const { alive, team, role, flags, mode, px, pz, vx, vz, tx, tz, cd, target, grid, scratch } =
      this;
    const obstacles = this.map.obstacles,
      lim = this.half - 1.5;
    for (let i = 0; i < this.count; i++) {
      if (!alive[i]) continue;
      const r = ROLES[role[i]],
        w = r.weapon,
        jammed = flags[i] & F_JAMMED,
        piloted = flags[i] & F_PILOT;
      flags[i] &= ~F_ENGAGED;
      if (cd[i] > 0) cd[i] -= DT;
      let goalX = tx[i],
        goalZ = tz[i],
        faceX = 0,
        faceZ = 0;
      // Nose direction; weapons only fire inside the airframe's cone around it.
      const hx = dsin(this.yaw[i]),
        hz = dcos(this.yaw[i]);
      if (piloted) {
        target[i] = 0;
        if (w && flags[i] & F_FIRE && cd[i] <= 0) {
          const tgt = this.aimTarget(i, w.range, hx, hz);
          if (tgt) this.fire(i, tgt, w, jammed);
        }
      } else if (w && mode[i] !== M_PASSIVE) {
        const sensor = r.sensor * (jammed ? 0.6 : 1);
        const acquireR = mode[i] === M_CHASE ? Math.min(sensor, 16) : w.range;
        let tgt = this.resolveTarget(target[i]);
        if (tgt && len(tgt.x - px[i], tgt.z - pz[i]) - tgt.r > acquireR * 1.4) tgt = null;
        if (!tgt) target[i] = 0;
        if ((i & 3) === (this.tick & 3)) {
          target[i] = this.acquire(team[i], px[i], pz[i], acquireR);
          tgt = this.resolveTarget(target[i]);
        }
        if (tgt) {
          const dx = tgt.x - px[i],
            dz = tgt.z - pz[i],
            d = len(dx, dz) || 1,
            reach = w.range + tgt.r;
          faceX = dx;
          faceZ = dz;
          if (mode[i] === M_CHASE) {
            flags[i] |= F_ENGAGED;
            if (d > reach * 0.85) {
              goalX = tgt.x - (dx / d) * reach * 0.75;
              goalZ = tgt.z - (dz / d) * reach * 0.75;
            } else {
              goalX = px[i];
              goalZ = pz[i];
            }
          }
          const facing = (dx * hx + dz * hz) / d >= COS_CONE[role[i]];
          if (d <= reach && cd[i] <= 0 && facing) this.fire(i, tgt, w, jammed);
        }
      } else if (mode[i] === M_PASSIVE) target[i] = 0;
      // Desired velocity: arrive at goal + separation + terrain avoidance (autopilot only).
      let ax = 0,
        az = 0;
      if (!piloted) {
        const dx = goalX - px[i],
          dz = goalZ - pz[i];
        const d = len(dx, dz);
        const want = Math.min(r.speed * (jammed ? 0.65 : 1), d * 1.8);
        ax = d > 1e-6 ? (dx / d) * want : 0;
        az = d > 1e-6 ? (dz / d) * want : 0;
        const k = grid.query(px[i], pz[i], SEPARATION, px, pz, scratch);
        for (let j = 0; j < k; j++) {
          const o = scratch[j];
          if (o === i) continue;
          let ex = px[i] - px[o],
            ez = pz[i] - pz[o],
            e = len(ex, ez);
          if (e < 1e-6) {
            ex = (i < o ? 1 : -1) * 0.01;
            ez = 0;
            e = 0.01;
          }
          const push = ((SEPARATION - e) / SEPARATION) * 12;
          ax += (ex / e) * push;
          az += (ez / e) * push;
        }
        for (const o of obstacles) {
          const ex = px[i] - o.x,
            ez = pz[i] - o.z,
            e = len(ex, ez) || 1,
            gap = e - o.r;
          if (gap < 3) {
            const push = (3 - gap) * 4;
            ax += (ex / e) * push;
            az += (ez / e) * push;
            // Slide around the rock rather than stalling head-on against it.
            const side = ex * dz - ez * dx > 0 ? 1 : -1;
            ax += (-ez / e) * side * push * 0.6;
            az += (ex / e) * side * push * 0.6;
          }
        }
        if (!faceX && !faceZ && ax * ax + az * az > 1) {
          faceX = ax;
          faceZ = az;
        }
      }
      // Fly: attitude -> thrust -> velocity, with the airframe's tilt/yaw/climb limits.
      const impact = flightStep(this, i, ax, az, faceX, faceZ, jammed);
      if (impact > 5) this.crash(i, (impact - 5) * 8);
      const maxSpeed = r.speed * (piloted ? 1.25 : 1.1) * (jammed ? 0.65 : 1);
      const s = len(vx[i], vz[i]);
      if (s > maxSpeed) {
        vx[i] = (vx[i] / s) * maxSpeed;
        vz[i] = (vz[i] / s) * maxSpeed;
      }
      px[i] = clamp(px[i] + vx[i] * DT, -lim, lim);
      pz[i] = clamp(pz[i] + vz[i] * DT, -lim, lim);
      for (const o of obstacles) {
        const ex = px[i] - o.x,
          ez = pz[i] - o.z,
          e = len(ex, ez);
        if (e < o.r + 0.3 && e > 1e-6) {
          px[i] = o.x + (ex / e) * (o.r + 0.3);
          pz[i] = o.z + (ez / e) * (o.r + 0.3);
          // Hitting rock: lose the inward velocity; pilots take damage at speed.
          const nx = ex / e,
            nz = ez / e,
            inward = -(vx[i] * nx + vz[i] * nz);
          if (inward > 0) {
            vx[i] += nx * inward * 1.3;
            vz[i] += nz * inward * 1.3;
            if (piloted && inward > 5) this.crash(i, (inward - 5) * 6);
          }
        }
      }
    }
  }

  crash(i, damage) {
    this.hp[i] -= damage;
    this.events.push({ k: 'crash', i, team: this.team[i], x: this.px[i], z: this.pz[i], damage });
  }

  // Pilot aim assist: the enemy closest to the nose within range and a ~25° cone.
  aimTarget(i, range, hx, hz) {
    const t = this.team[i],
      x = this.px[i],
      z = this.pz[i];
    let best = null,
      bestDot = 0.9;
    const k = this.grid.query(x, z, range, this.px, this.pz, this.scratch2);
    for (let j = 0; j < k; j++) {
      const o = this.scratch2[j];
      if (this.team[o] === t || !this.visible(t, this.px[o], this.pz[o])) continue;
      const dx = this.px[o] - x,
        dz = this.pz[o] - z,
        d = len(dx, dz) || 1,
        dot = (dx * hx + dz * hz) / d;
      if (dot > bestDot) {
        bestDot = dot;
        best = { x: this.px[o], z: this.pz[o], r: 0, drone: o };
      }
    }
    for (const s of this.structures) {
      if (!s.alive || s.team === t) continue;
      const dx = s.x - x,
        dz = s.z - z,
        d = len(dx, dz) || 1,
        rad = STRUCTURES[s.kind].radius;
      if (d - rad > range) continue;
      const dot = (dx * hx + dz * hz) / d;
      if (dot > bestDot) {
        bestDot = dot;
        best = { x: s.x, z: s.z, r: rad, struct: s };
      }
    }
    return best;
  }

  fire(i, tgt, w, jammed) {
    const t = this.team[i];
    const mult = WEAPONS[w.type].vs;
    if (tgt.drone !== undefined) {
      this.damageDrone(tgt.drone, w.damage * mult[ROLES[this.role[tgt.drone]].armor], t);
    } else this.damageStructure(tgt.struct, w.damage * mult[3], t);
    this.cd[i] = w.cooldown * (jammed ? 1.6 : 1);
    this.events.push({
      k: 'shot',
      w: w.type,
      team: t,
      x0: this.px[i],
      z0: this.pz[i],
      x1: tgt.x,
      z1: tgt.z,
      from: i,
    });
  }

  damageDrone(j, amount, byTeam) {
    if (this.hp[j] <= 0) return;
    this.hp[j] -= amount;
    if (this.hp[j] <= 0) this.teams[byTeam].kills++;
  }

  damageStructure(s, amount, byTeam) {
    if (!s.alive) return;
    s.hp -= amount;
    const team = this.teams[s.team];
    if (this.tick - team.lastAlert > 6 * TICK_RATE) {
      team.lastAlert = this.tick;
      this.events.push({
        k: 'alert',
        team: s.team,
        x: s.x,
        z: s.z,
        text: `${STRUCTURES[s.kind].label} under attack`,
      });
    }
    if (s.hp <= 0) this.teams[byTeam].kills++;
  }

  updateStructures() {
    for (const s of this.structures) {
      if (!s.alive || s.progress < 1) continue;
      const w = STRUCTURES[s.kind].weapon;
      if (!w) continue;
      if (s.cd > 0) s.cd -= DT;
      let tgt = this.resolveTarget(s.target);
      if (tgt && len(tgt.x - s.x, tgt.z - s.z) > w.range) tgt = null;
      if (!tgt && ((this.tick + s.id) & 3) === 0) {
        s.target = this.acquire(s.team, s.x, s.z, w.range);
        if (s.target < 0) s.target = 0; // structures only shoot drones
        tgt = this.resolveTarget(s.target);
      }
      if (tgt && s.cd <= 0) {
        this.damageDrone(
          tgt.drone,
          w.damage * WEAPONS[w.type].vs[ROLES[this.role[tgt.drone]].armor],
          s.team,
        );
        s.cd = w.cooldown;
        this.events.push({
          k: 'shot',
          w: w.type,
          team: s.team,
          x0: s.x,
          z0: s.z,
          x1: tgt.x,
          z1: tgt.z,
          from: -1,
        });
      }
    }
  }

  resolveDeaths() {
    let pruned = false;
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i] || this.hp[i] > 0) continue;
      this.alive[i] = 0;
      this.teams[this.team[i]].losses++;
      this.events.push({
        k: 'die',
        i,
        team: this.team[i],
        role: this.role[i],
        x: this.px[i],
        z: this.pz[i],
        py: this.py[i],
        vx: this.vx[i],
        vz: this.vz[i],
      });
      const sq = this.squadMap.get(this.squadOf[i]);
      if (sq) {
        sq.members.splice(sq.members.indexOf(i), 1);
        if (!sq.members.length) pruned = true;
      }
      const team = this.teams[this.team[i]];
      if (team.pilot === this.uid[i]) {
        team.pilot = 0;
        this.events.push({
          k: 'pilotLost',
          team: this.team[i],
          uid: this.uid[i],
          squad: this.squadOf[i],
          x: this.px[i],
          z: this.pz[i],
        });
      }
      this.flags[i] = 0;
      this.uidMap.delete(this.uid[i]);
      this.free.push(i);
    }
    if (pruned) this.pruneSquads();
    for (const s of this.structures) {
      if (!s.alive || s.hp > 0) continue;
      s.alive = false;
      this.events.push({ k: 'destroyed', id: s.id, team: s.team, kind: s.kind, x: s.x, z: s.z });
      for (const w of this.wells) if (w.owner === s.id) w.owner = -1;
      s.queue.length = 0;
      if (s.kind === 'core') this.defeat(s.team);
    }
    if (this.structures.some((s) => !s.alive)) {
      this.structures = this.structures.filter((s) => s.alive);
      for (const [id, s] of this.structMap) if (!s.alive) this.structMap.delete(id);
    }
  }

  defeat(t) {
    const team = this.teams[t];
    if (!team.alive) return;
    team.alive = false;
    this.events.push({ k: 'defeat', team: t });
    const left = this.teams.filter((x) => x.alive);
    if (left.length === 1) {
      this.winner = left[0].id;
      this.events.push({ k: 'victory', team: this.winner });
    }
  }

  updateVisibility() {
    const n = this.visN,
      half = this.half;
    const stamp = (vis, x, z, r) => {
      const c0 = Math.max(0, Math.floor((x - r + half) / VIS_CELL)),
        c1 = Math.min(n - 1, Math.floor((x + r + half) / VIS_CELL)),
        r0 = Math.max(0, Math.floor((z - r + half) / VIS_CELL)),
        r1 = Math.min(n - 1, Math.floor((z + r + half) / VIS_CELL)),
        rr = (r + VIS_CELL * 0.5) * (r + VIS_CELL * 0.5);
      for (let cz = r0; cz <= r1; cz++) {
        const dz = (cz + 0.5) * VIS_CELL - half - z;
        for (let cx = c0; cx <= c1; cx++) {
          const dx = (cx + 0.5) * VIS_CELL - half - x;
          if (dx * dx + dz * dz <= rr) vis[cz * n + cx] = 1;
        }
      }
    };
    for (const team of this.teams) team.vis.fill(0);
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i]) continue;
      const role = ROLES[this.role[i]];
      // Flying higher than cruise altitude extends sight (up to +40%); skimming low reduces it.
      const lift = clamp((this.py[i] - role.flight.alt) * 0.03, -0.3, 0.4);
      const r = role.sensor * (1 + lift) * (this.flags[i] & F_JAMMED ? 0.6 : 1);
      stamp(this.teams[this.team[i]].vis, this.px[i], this.pz[i], r);
    }
    for (const s of this.structures) {
      if (!s.alive) continue;
      stamp(this.teams[s.team].vis, s.x, s.z, s.progress >= 1 ? STRUCTURES[s.kind].sensor : 6);
    }
    for (const team of this.teams) {
      const { vis, explored } = team;
      for (let c = 0; c < vis.length; c++) explored[c] |= vis[c];
    }
  }

  // ---------- determinism ----------

  hash() {
    const h = new Hasher();
    const N = this.count;
    h.num(this.tick).num(this.rng.state).num(this.winner);
    h.array(this.alive, N).array(this.team, N).array(this.role, N).array(this.uid, N);
    h.array(this.px, N).array(this.pz, N).array(this.vx, N).array(this.vz, N);
    h.array(this.hp, N).array(this.cd, N).array(this.target, N);
    h.array(this.py, N).array(this.vy, N).array(this.yaw, N).array(this.pitch, N);
    h.array(this.roll, N)
      .array(this.stick, N * 4)
      .array(this.flags, N);
    for (const t of this.teams) h.num(t.energy).num(t.bwUsed).num(t.kills);
    for (const s of this.structures) h.num(s.id).num(s.hp).num(s.progress).num(s.queue.length);
    for (const sq of this.squads) h.num(sq.id).num(sq.ax).num(sq.az).num(sq.members.length);
    return h.hex();
  }

  stats(t) {
    const team = this.teams[t];
    const roles = new Array(ROLES.length).fill(0);
    for (let i = 0; i < this.count; i++)
      if (this.alive[i] && this.team[i] === t) roles[this.role[i]]++;
    const structures = {};
    for (const k of STRUCTURE_KINDS) structures[k] = 0;
    for (const s of this.structures) if (s.team === t) structures[s.kind]++;
    return {
      energy: team.energy,
      income: team.income,
      bwUsed: team.bwUsed,
      bwCap: team.bwCap,
      roles,
      structures,
      kills: team.kills,
      losses: team.losses,
    };
  }
}
