// Computer opponent. It plays through exactly the same command interface as a human, sees only
// what its own sensors reveal (plus the map's known start positions), and uses its own seeded
// RNG, so it is deterministic and can run identically on every lockstep peer.

import { Rng, len, dcos, dsin, TAU } from './dmath.js';
import { ROLES, ROLE_INDEX, STRUCTURES, TICK_RATE } from './defs.js';

export const DIFFICULTY = {
  easy: {
    label: 'Recruit',
    period: 40,
    wave: 420,
    waveGrowth: 120,
    fabricators: 1,
    defenses: 0,
    reserve: 60,
    queue: 1,
    counters: false,
  },
  normal: {
    label: 'Veteran',
    period: 20,
    wave: 380,
    waveGrowth: 150,
    fabricators: 2,
    defenses: 1,
    reserve: 40,
    queue: 2,
    counters: true,
  },
  hard: {
    label: 'Ace',
    period: 8,
    wave: 340,
    waveGrowth: 170,
    fabricators: 3,
    defenses: 2,
    reserve: 20,
    queue: 3,
    counters: true,
  },
};

const ATTACK_RULES = [
  { when: 'hurt', value: 30, then: 'retreat', cooldown: 10 },
  { when: 'threat', value: 2.2, then: 'evade', cooldown: 6 },
];
const DEFENSE_RULES = [{ when: 'enemyNear', value: 24, then: 'attack', cooldown: 2 }];

export class AIPlayer {
  constructor(team, { difficulty = 'normal', seed = 1 } = {}) {
    this.team = team;
    this.level = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    this.difficulty = difficulty;
    this.rng = new Rng((seed * 7919 + team * 104729) | 0);
    this.memory = new Map(); // enemy structure id -> last seen {x, z, kind}
    this.scouted = new Map(); // enemy drone uid -> role
    this.armySquads = new Set();
    this.waves = 0;
    this.lastWaveTick = 0;
  }

  think(world) {
    const out = [];
    const t = this.team,
      team = world.teams[t];
    if (!team.alive || world.winner >= 0) return out;
    if ((world.tick + t * 7) % this.level.period !== 0) return out;
    this.observe(world);
    const core = world.structures.find((s) => s.team === t && s.kind === 'core');
    if (!core) return out;
    let energy = team.energy;
    this.saving = 0;
    const spend = (cmd, cost) => {
      out.push(cmd);
      energy -= cost;
    };
    this.economy(world, core, energy, spend);
    // Production only spends what isn't being saved for the next structure, unless under attack.
    const underAttack = world.tick - team.lastAlert < 10 * TICK_RATE;
    this.production(world, underAttack ? energy : energy - this.saving, out);
    this.army(world, core, out);
    return out;
  }

  observe(world) {
    for (let i = 0; i < world.count; i++)
      if (
        world.alive[i] &&
        world.team[i] !== this.team &&
        world.visible(this.team, world.px[i], world.pz[i])
      )
        this.scouted.set(world.uid[i], world.role[i]);
    for (const s of world.structures)
      if (s.team !== this.team && world.visible(this.team, s.x, s.z))
        this.memory.set(s.id, { x: s.x, z: s.z, kind: s.kind });
    for (const [id, m] of this.memory)
      if (world.visible(this.team, m.x, m.z) && !world.structMap.get(id)?.alive)
        this.memory.delete(id);
  }

  own(world, kind) {
    return world.structures.filter((s) => s.team === this.team && s.kind === kind);
  }

  findSpot(world, kind, cx, cz, rMin, rMax, tries = 14) {
    for (let k = 0; k < tries; k++) {
      const a = this.rng.next() * TAU,
        r = rMin + (rMax - rMin) * this.rng.next();
      const x = cx + dcos(a) * r,
        z = cz + dsin(a) * r;
      if (world.canPlace(this.team, kind, x, z).ok) return { x, z };
    }
    return null;
  }

  economy(world, core, energy, spend) {
    const t = this.team,
      L = this.level,
      secs = world.tick / TICK_RATE;
    const build = (kind, spot) =>
      spend({ type: 'build', team: t, kind, x: spot.x, z: spot.z }, STRUCTURES[kind].cost);
    // `want` records the first structure we'd like but can't afford yet, so production saves for it.
    const want = (kind) => {
      if (!this.saving) this.saving = STRUCTURES[kind].cost + L.reserve;
      return energy >= STRUCTURES[kind].cost + L.reserve;
    };
    // 1. Claim every powered, free well.
    for (const w of world.wells) {
      const check = world.canPlace(t, 'extractor', w.x, w.z);
      if (check.ok) {
        build('extractor', w);
        return;
      }
      if (check.reason === 'Not enough energy' && world.powered(t, w.x, w.z) && w.owner < 0) {
        this.saving = STRUCTURES.extractor.cost;
        return;
      }
    }
    // 2. Bandwidth: build a relay when close to the cap, pointing toward the nearest unpowered well.
    if (world.bandwidthFree(t) < 8 && want('relay')) {
      const spot =
        this.expansionSpot(world, core) || this.findSpot(world, 'relay', core.x, core.z, 8, 18);
      if (spot) return build('relay', spot);
    }
    const fabs = this.own(world, 'fabricator').length;
    const wantFabs = Math.min(L.fabricators, secs > 40 ? 1 + Math.floor((secs - 40) / 100) : 0);
    if (fabs < wantFabs && want('fabricator')) {
      const spot = this.findSpot(world, 'fabricator', core.x, core.z, 7, 15);
      if (spot) return build('fabricator', spot);
    }
    // 3. Expand toward contested wells once the base is running.
    if (
      secs > 45 &&
      this.own(world, 'relay').length < Math.min(8, 1 + Math.floor(secs / 60)) &&
      this.expansionSpot(world, core) &&
      want('relay')
    ) {
      const spot = this.expansionSpot(world, core);
      if (spot) return build('relay', spot);
    }
    if (secs > 90 && !this.own(world, 'radar').length && want('radar')) {
      const spot = this.findSpot(world, 'radar', core.x * 0.8, core.z * 0.8, 4, 14);
      if (spot) return build('radar', spot);
    }
    if (secs > 120 && !this.own(world, 'repair').length && want('repair')) {
      const spot = this.findSpot(world, 'repair', core.x, core.z, 6, 12);
      if (spot) return build('repair', spot);
    }
    if (secs > 150 && this.own(world, 'turret').length < L.defenses && want('turret')) {
      const toward = len(core.x, core.z) || 1;
      const spot = this.findSpot(
        world,
        'turret',
        core.x - (core.x / toward) * 10,
        core.z - (core.z / toward) * 10,
        0,
        7,
      );
      if (spot) return build('turret', spot);
    }
    if (secs > 200 && L.defenses > 1 && !this.own(world, 'jammer').length && want('jammer')) {
      const spot = this.findSpot(world, 'jammer', core.x * 0.85, core.z * 0.85, 2, 10);
      if (spot) build('jammer', spot);
    }
  }

  expansionSpot(world, core) {
    let best = null,
      bd = 1e9;
    for (const w of world.wells) {
      if (w.owner >= 0 || world.powered(this.team, w.x, w.z)) continue;
      const d = len(w.x - core.x, w.z - core.z);
      if (d < bd) {
        bd = d;
        best = w;
      }
    }
    if (!best) return null;
    // Walk from the closest powered structure toward the well and place a relay at the grid edge.
    let from = null,
      fd = 1e9;
    for (const s of world.structures) {
      if (s.team !== this.team || s.progress < 1 || !STRUCTURES[s.kind].power) continue;
      const d = len(best.x - s.x, best.z - s.z);
      if (d < fd) {
        fd = d;
        from = s;
      }
    }
    if (!from) return null;
    const dx = best.x - from.x,
      dz = best.z - from.z,
      d = len(dx, dz) || 1;
    for (const reach of [16, 13, 10, 18]) {
      const step = Math.min(reach, d - 2);
      for (const side of [0, 3, -3, 6, -6]) {
        const x = from.x + (dx / d) * step + (-dz / d) * side,
          z = from.z + (dz / d) * step + (dx / d) * side;
        if (world.canPlace(this.team, 'relay', x, z).ok) return { x, z };
      }
    }
    return null;
  }

  production(world, energy, out) {
    const t = this.team;
    const producers = world.structures.filter(
      (s) => s.team === t && s.progress >= 1 && STRUCTURES[s.kind].produces,
    );
    const queued = producers.reduce((n, s) => n + s.queue.length, 0);
    let free = world.bandwidthFree(t);
    for (let k = queued; k < producers.length * this.level.queue; k++) {
      // Commit to a pick and save for it; re-rolling until something is affordable would bias
      // fast-thinking AIs toward the cheapest unit.
      if (this.nextRole === undefined) this.nextRole = this.pickRole(world);
      const role = this.nextRole;
      const r = ROLES[role];
      if (energy < r.cost * r.pack || free < r.bw * r.pack) break;
      this.nextRole = undefined;
      out.push({ type: 'produce', team: t, role });
      energy -= r.cost * r.pack;
      free -= r.bw * r.pack;
    }
  }

  pickRole(world) {
    // Enemy composition from every enemy drone we've scouted that is still alive.
    const seen = new Array(ROLES.length).fill(0);
    for (const [u, role] of this.scouted) {
      if (world.uidMap.has(u)) seen[role]++;
      else this.scouted.delete(u);
    }
    const total = seen.reduce((a, b) => a + b, 0) || 1;
    const f = (key) => (this.level.counters ? seen[ROLE_INDEX[key]] / total : 0);
    const secs = world.tick / TICK_RATE;
    // Interceptors beat scouts, scouts beat assault, assault beats interceptors.
    const w = [
      2 + 6 * f('assault'),
      2 + 6 * f('scout'),
      1.5 + 6 * f('interceptor'),
      secs > 120 ? 0.5 : 0,
      secs > 60 ? 0.8 : 0,
      secs > 180 ? 0.4 : 0,
    ];
    const sum = w.reduce((a, b) => a + b, 0);
    let pick = this.rng.next() * sum;
    for (let i = 0; i < w.length; i++) if ((pick -= w[i]) < 0) return i;
    return 0;
  }

  army(world, core, out) {
    const t = this.team;
    // Squads formed by last think's wave order now exist; adopt them as army squads.
    if (this.pendingUids) {
      for (const u of this.pendingUids) {
        const i = world.uidMap.get(u);
        if (i !== undefined) this.armySquads.add(world.squadOf[i]);
      }
      this.pendingUids = null;
    }
    for (const id of [...this.armySquads]) if (!world.squadMap.has(id)) this.armySquads.delete(id);
    // Home pool: every drone not already in an army squad.
    const home = [];
    let homeValue = 0;
    for (const sq of world.squads) {
      if (sq.team !== t || this.armySquads.has(sq.id)) continue;
      for (const i of sq.members) {
        home.push(world.uid[i]);
        homeValue += ROLES[world.role[i]].cost;
      }
    }
    // Defend: enemies visible near the base pull the home pool onto them.
    let threat = null;
    for (let i = 0; i < world.count; i++) {
      if (!world.alive[i] || world.team[i] === t) continue;
      if (len(world.px[i] - core.x, world.pz[i] - core.z) > 34) continue;
      if (!world.visible(t, world.px[i], world.pz[i])) continue;
      threat = { x: world.px[i], z: world.pz[i] };
      break;
    }
    if (threat) this.lastThreat = { tick: world.tick, x: threat.x, z: threat.z };
    const defending = this.lastThreat && world.tick - this.lastThreat.tick < 8 * TICK_RATE;
    if (defending) {
      // Re-issue only when the threat has moved, so fights aren't interrupted every think.
      const lt = this.lastThreat;
      if (
        home.length &&
        (!this.defendOrder ||
          len(this.defendOrder.x - lt.x, this.defendOrder.z - lt.z) > 10 ||
          this.defendCount !== home.length)
      ) {
        this.defendOrder = { x: lt.x, z: lt.z };
        this.defendCount = home.length;
        out.push({
          type: 'order',
          team: t,
          uids: home,
          play: 'attack',
          x: lt.x,
          z: lt.z,
          rules: DEFENSE_RULES,
        });
      }
      return;
    }
    this.defendOrder = null;
    const L = this.level;
    const need = L.wave + this.waves * L.waveGrowth;
    if (world.tick > 75 * TICK_RATE && homeValue >= need && home.length >= 10) {
      const target = this.pickTarget(world, core);
      const play = home.length >= 14 && this.rng.next() < 0.35 ? 'pincer' : 'attack';
      const formation = ['wedge', 'swarm', 'diamond'][this.rng.int(3)];
      out.push({
        type: 'order',
        team: t,
        uids: home,
        play,
        x: target.x,
        z: target.z,
        formation,
        rules: ATTACK_RULES,
      });
      this.waves++;
      this.lastWaveTick = world.tick;
      this.pendingUids = home;
      return;
    }
    // Keep armies moving: re-target squads that reached a dead or empty objective.
    for (const id of this.armySquads) {
      const sq = world.squadMap.get(id);
      if (!sq || !sq.order || sq.reaction) continue;
      if (len(sq.ax - sq.order.x, sq.az - sq.order.z) > 6) continue;
      const target = this.pickTarget(world, { x: sq.cx, z: sq.cz });
      if (len(target.x - sq.order.x, target.z - sq.order.z) < 3) continue;
      out.push({
        type: 'order',
        team: t,
        uids: sq.members.map((i) => world.uid[i]),
        play: 'attack',
        x: target.x,
        z: target.z,
      });
    }
    // Merge the home pool into one squad holding the rally point between waves.
    const team = world.teams[t];
    const homeSquads = world.squads.filter((s) => s.team === t && !this.armySquads.has(s.id));
    const settled = world.tick % (4 * TICK_RATE) < this.level.period;
    if (settled && home.length && (homeSquads.length > 1 || homeSquads[0].order?.play !== 'hold'))
      out.push({
        type: 'order',
        team: t,
        uids: home,
        play: 'hold',
        x: team.rallyX,
        z: team.rallyZ,
        rules: DEFENSE_RULES,
      });
  }

  pickTarget(world, from) {
    let best = null,
      bd = 1e9;
    for (const [, m] of this.memory) {
      const d =
        len(m.x - from.x, m.z - from.z) + (m.kind === 'turret' ? 30 : m.kind === 'core' ? 25 : 0);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    if (best) return best;
    const enemy = world.map.starts.find((_, k) => k !== this.team && world.teams[k]?.alive);
    return enemy || { x: 0, z: 0 };
  }
}
