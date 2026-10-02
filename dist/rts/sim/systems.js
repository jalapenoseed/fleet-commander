// Map-level systems (Wave 3): capturable objectives, roaming storms, salvage, commander abilities
// and drone hacking. All deterministic; the World calls these from its tick.

import { Rng, len, dsin, dcos, TAU } from './dmath.js';
import { DT, TICK_RATE, ROLE_INDEX } from './defs.js';

const SEC = TICK_RATE;
export const F_STORM = 1024,
  F_STUN = 2048;

export const OBJECTIVES = {
  spire: {
    label: 'Relay Spire',
    blurb: 'Capture it for +20 bandwidth and a 30 m sensor sweep around it.',
    capture: 8,
    radius: 8,
  },
  factory: {
    label: 'Derelict Factory',
    blurb: 'Capture it and it builds two free scouts for you every 20 s.',
    capture: 10,
    radius: 9,
  },
};

export const ABILITIES = {
  emp: {
    label: 'EMP Strike',
    short: 'EMP',
    blurb: 'After a 1.5 s warning, stuns every enemy drone within 10 m for 3 s.',
    cooldown: 90,
    targeted: true,
  },
  drop: {
    label: 'Reinforcements',
    short: 'Drop',
    blurb: 'Drops 8 scouts at a visible point near your drones or buildings.',
    cooldown: 150,
    targeted: true,
  },
  overcharge: {
    label: 'Overcharge',
    short: 'Boost',
    blurb: 'For 12 s every drone you own fires 40% faster and hits 25% harder.',
    cooldown: 120,
  },
};
export const ABILITY_KEYS = Object.keys(ABILITIES);

// ---------- setup ----------

export function initSystems(w) {
  const m = w.map;
  w.objectives = [
    ...(m.spires || []).map((p) => ({ kind: 'spire', x: p.x, z: p.z })),
    ...(m.factories || []).map((p) => ({ kind: 'factory', x: p.x, z: p.z })),
  ].map((o, id) => ({ ...o, id, owner: -1, capTeam: -1, cap: 0, timer: 0 }));
  w.stormRng = new Rng(((w.seed || 1) * 977 + 13) | 0);
  w.storms = [];
  for (let k = 0; k < (m.storms || 0); k++) {
    const s = { x: 0, z: 0, tx: 0, tz: 0, r: 14 + k * 3 };
    stormWaypoint(w, s);
    s.x = s.tx;
    s.z = s.tz;
    stormWaypoint(w, s);
    w.storms.push(s);
  }
  w.salvage = [];
  w.empStrikes = [];
  w.stunUntil = new Int32Array(w.cap);
  w.hackT = new Float64Array(w.cap);
  w.hackTarget = new Int32Array(w.cap);
  for (const team of w.teams) {
    team.ab = { emp: 30 * SEC, drop: 60 * SEC, overcharge: 45 * SEC };
    team.overUntil = -1;
  }
}

function stormWaypoint(w, s) {
  const h = w.half * 0.75;
  s.tx = (w.stormRng.next() * 2 - 1) * h;
  s.tz = (w.stormRng.next() * 2 - 1) * h;
}

// ---------- per tick ----------

// Storms jam, slow and blind every drone inside them (both teams). Called right after auras.
export function stormEffects(w) {
  const { flags, px, pz, grid, scratch } = w;
  for (let i = 0; i < w.count; i++) flags[i] &= ~(F_STORM | F_STUN);
  for (const s of w.storms) {
    const k = grid.query(s.x, s.z, s.r, px, pz, scratch);
    for (let j = 0; j < k; j++) flags[scratch[j]] |= F_STORM | 1; // F_JAMMED
  }
  for (let i = 0; i < w.count; i++) if (w.alive[i] && w.stunUntil[i] > w.tick) flags[i] |= F_STUN;
}

export function stepSystems(w) {
  // Storms drift between random waypoints at 2.5 m/s.
  for (const s of w.storms) {
    const dx = s.tx - s.x,
      dz = s.tz - s.z,
      d = len(dx, dz);
    if (d < 3) stormWaypoint(w, s);
    else {
      s.x += (dx / d) * 2.5 * DT;
      s.z += (dz / d) * 2.5 * DT;
    }
  }
  if (w.tick % 5 === 0) {
    captureObjectives(w);
    collectSalvage(w);
  }
  for (const o of w.objectives) {
    if (o.kind !== 'factory' || o.owner < 0 || !w.teams[o.owner]?.alive) continue;
    if (++o.timer >= 20 * SEC) {
      o.timer = 0;
      const sq = w.rallySquadFor(o.owner, o.x, o.z);
      for (let k = 0; k < 2; k++) {
        const a = w.rng.next() * TAU;
        w.spawnDrone(o.owner, ROLE_INDEX.scout, o.x + dcos(a) * 4, o.z + dsin(a) * 4, sq);
      }
    }
  }
  abilities(w);
  hacking(w);
}

function captureObjectives(w) {
  const step = 5 * DT;
  for (const o of w.objectives) {
    const def = OBJECTIVES[o.kind];
    const present = new Array(w.teams.length).fill(0);
    const k = w.grid.query(o.x, o.z, def.radius, w.px, w.pz, w.scratch);
    for (let j = 0; j < k; j++) present[w.team[w.scratch[j]]]++;
    const teams = present.map((n, t) => (n ? t : -1)).filter((t) => t >= 0);
    if (teams.length === 1) {
      const t = teams[0];
      if (t === o.owner) {
        o.cap = Math.max(0, o.cap - step / def.capture);
        continue;
      }
      if (o.capTeam !== t) {
        o.capTeam = t;
        o.cap = 0;
      }
      o.cap += step / def.capture;
      if (o.cap >= 1) {
        const prev = o.owner;
        o.owner = t;
        o.cap = 0;
        o.capTeam = -1;
        o.timer = 0;
        w.events.push({ k: 'captured', team: t, prev, kind: o.kind, x: o.x, z: o.z, id: o.id });
      }
    } else if (!teams.length) o.cap = Math.max(0, o.cap - step / (def.capture * 2));
  }
}

// Wreckage: a share of every destroyed drone's cost, collected by whoever flies over it first.
export function dropSalvage(w, i) {
  const value = (w.rs(i).cost || 4) * 0.35;
  if (value < 1) return;
  for (const p of w.salvage)
    if (len(p.x - w.px[i], p.z - w.pz[i]) < 3) {
      p.value += value;
      p.ttl = 60 * SEC;
      return;
    }
  if (w.salvage.length >= 200) w.salvage.shift();
  w.salvage.push({ x: w.px[i], z: w.pz[i], value, ttl: 60 * SEC });
}

function collectSalvage(w) {
  for (let k = w.salvage.length - 1; k >= 0; k--) {
    const p = w.salvage[k];
    p.ttl -= 5;
    const n = w.grid.query(p.x, p.z, 3, w.px, w.pz, w.scratch);
    let taker = -1;
    for (let j = 0; j < n; j++) {
      const o = w.scratch[j];
      if (w.alive[o] && w.teams[w.team[o]].alive && (taker < 0 || o < taker)) taker = o;
    }
    if (taker >= 0) {
      const t = w.team[taker];
      w.teams[t].energy += p.value;
      w.events.push({ k: 'salvage', team: t, value: p.value, x: p.x, z: p.z });
      w.salvage.splice(k, 1);
    } else if (p.ttl <= 0) w.salvage.splice(k, 1);
  }
}

// ---------- commander abilities ----------

// Cooldowns recover up to twice as fast while you have fewer drones than your strongest enemy.
function abilities(w) {
  const counts = new Array(w.teams.length).fill(0);
  for (let i = 0; i < w.count; i++) if (w.alive[i]) counts[w.team[i]]++;
  for (const team of w.teams) {
    if (!team.ab) continue;
    const enemy = Math.max(0, ...counts.filter((_, t) => t !== team.id));
    const mine = counts[team.id];
    const rate = 1 + Math.min(1, Math.max(0, (enemy - mine) / Math.max(10, mine)));
    for (const key of ABILITY_KEYS)
      if (team.ab[key] > 0) team.ab[key] = Math.max(0, team.ab[key] - rate);
  }
  for (let k = w.empStrikes.length - 1; k >= 0; k--) {
    const e = w.empStrikes[k];
    if (w.tick < e.at) continue;
    w.empStrikes.splice(k, 1);
    const n = w.grid.query(e.x, e.z, 10, w.px, w.pz, w.scratch);
    for (let j = 0; j < n; j++) {
      const o = w.scratch[j];
      if (w.team[o] !== e.team) w.stunUntil[o] = w.tick + 3 * SEC;
    }
    w.events.push({ k: 'emp', team: e.team, x: e.x, z: e.z, hit: n });
  }
}

export function useAbility(w, cmd) {
  const team = w.teams[cmd.team],
    def = ABILITIES[cmd.key];
  if (!def || !team.ab || team.ab[cmd.key] > 0) return false;
  const x = Number(cmd.x),
    z = Number(cmd.z);
  if (def.targeted && !(Number.isFinite(x) && Number.isFinite(z) && w.visible(cmd.team, x, z)))
    return false;
  if (cmd.key === 'drop') {
    // Must land near something you own.
    let near = false;
    for (let i = 0; i < w.count && !near; i++)
      if (w.alive[i] && w.team[i] === cmd.team && len(w.px[i] - x, w.pz[i] - z) < 25) near = true;
    for (const s of w.structures)
      if (s.team === cmd.team && len(s.x - x, s.z - z) < 30) near = true;
    if (!near) return false;
    const sq = w.createSquad(cmd.team);
    sq.order = { play: 'hold', x, z, x0: x, z0: z };
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      const i = w.spawnDrone(cmd.team, ROLE_INDEX.scout, x + dcos(a) * 3, z + dsin(a) * 3, sq);
      if (i >= 0) w.py[i] = w.opy[i] = 14; // dropped from altitude
    }
  } else if (cmd.key === 'emp') w.empStrikes.push({ team: cmd.team, x, z, at: w.tick + 1.5 * SEC });
  else if (cmd.key === 'overcharge') team.overUntil = w.tick + 12 * SEC;
  team.ab[cmd.key] = def.cooldown * SEC;
  w.events.push({ k: 'ability', team: cmd.team, key: cmd.key, x, z });
  return true;
}

// ---------- hacking ----------

// With Intrusion Suite researched, jammer drones take over jammed enemy drones they stay close to
// for 4 s (not carriers). Each jammer then needs 10 s to recover.
function hacking(w) {
  for (let i = 0; i < w.count; i++) {
    if (!w.alive[i] || !w.rs(i).aura?.jam || !w.teams[w.team[i]].tech.has('intrusion')) continue;
    if (w.hackT[i] < 0) {
      w.hackT[i] = Math.min(0, w.hackT[i] + DT);
      continue;
    }
    let j = w.uidMap.get(w.hackTarget[i]);
    const valid = (o) =>
      o !== undefined &&
      w.alive[o] &&
      w.team[o] !== w.team[i] &&
      w.flags[o] & 1 &&
      !w.rs(o).carrier &&
      len(w.px[o] - w.px[i], w.pz[o] - w.pz[i]) < 7;
    if (!valid(j)) {
      w.hackT[i] = 0;
      w.hackTarget[i] = 0;
      j = undefined;
      const n = w.grid.query(w.px[i], w.pz[i], 6, w.px, w.pz, w.scratch);
      for (let k = 0; k < n; k++)
        if (valid(w.scratch[k])) {
          j = w.scratch[k];
          w.hackTarget[i] = w.uid[j];
          break;
        }
      if (j === undefined) continue;
    }
    w.hackT[i] += DT;
    if (w.hackT[i] >= 4) {
      w.convertDrone(j, w.team[i], w.squadOf[i]);
      w.hackT[i] = -10;
      w.hackTarget[i] = 0;
    }
  }
}

export function hashSystems(w, h) {
  for (const o of w.objectives) h.num(o.owner).num(o.cap);
  for (const s of w.storms) h.num(s.x).num(s.z);
  h.num(w.salvage.length).num(w.empStrikes.length);
  for (const t of w.teams)
    if (t.ab) h.num(t.ab.emp).num(t.ab.drop).num(t.ab.overcharge).num(t.overUntil);
}
