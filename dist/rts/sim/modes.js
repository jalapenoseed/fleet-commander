// Game modes ("scenarios"). A scenario is deterministic sim code: it decides which teams exist,
// sets up units and structures, runs every tick (waves, objectives, timers) and ends the match
// with a result. Replays store only the mode/challenge keys plus the seed and human commands.

import { Rng, len, dsin, dcos, TAU } from './dmath.js';
import { ROLE_INDEX, TICK_RATE } from './defs.js';

const SEC = TICK_RATE;
const fmt = (ticks) => {
  const s = Math.max(0, Math.floor(ticks / SEC));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const MODES = {
  skirmish: { label: 'Skirmish', blurb: 'You against the AI. Destroy the enemy Command Core.' },
  survival: {
    label: 'Survival',
    blurb: 'Hold your base against endless, escalating swarm waves. How long can you last?',
  },
  challenge: { label: 'Challenges', blurb: 'Hand-built puzzles with fixed forces and one goal.' },
  race: {
    label: 'FPV Race',
    blurb: 'Fly a scout through the gates as fast as you can. Beat your ghost.',
  },
  arena: { label: 'Autonomous Arena', blurb: 'Watch two AI swarms fight with the auto-director.' },
};

// ---------- helpers ----------

function squadWith(w, t, order, rules = []) {
  const sq = w.createSquad(t);
  sq.order = { ...order, x0: order.x, z0: order.z };
  sq.rules = rules.map((r) => ({ enabled: true, cooldown: 4, ...r }));
  return sq;
}

function spawnGroup(w, t, roleKey, n, x, z, sq, spread = 2.5) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = (k / Math.max(1, n)) * TAU,
      r = spread * Math.sqrt((k % 7) + 1) * 0.6;
    const i = w.spawnDrone(t, ROLE_INDEX[roleKey], x + dcos(a) * r, z + dsin(a) * r, sq);
    if (i >= 0) {
      w.py[i] = w.opy[i] = w.rs(i).flight.alt; // spawned airborne
      out.push(i);
    }
  }
  return out;
}

// Manual-flight scenarios: the drone starts under pilot control (hovering on centered sticks), so
// the autopilot never flies it for you.
function takeControl(w, uid) {
  const i = w.uidMap.get(uid);
  w.flags[i] |= 16; // F_PILOT
  w.teams[w.team[i]].pilot = uid;
}

function liveCount(w, t) {
  let n = 0;
  for (let i = 0; i < w.count; i++) if (w.alive[i] && w.team[i] === t) n++;
  return n;
}

// ---------- Survival ----------

class Survival {
  constructor(cfg) {
    this.key = 'survival';
    this.map = cfg.map || 'delta';
    this.rng = new Rng(((cfg.seed || 1) * 31 + 7) | 0);
    this.teams = [{}, { core: false, units: false, energy: 0, tether: true }];
    this.wave = 0;
    this.next = 75 * SEC; // first build phase
    this.cleared = true;
  }
  init(w) {
    w.teams[1].tech.add('batteries');
    w.refreshStats(1);
  }
  tick(w) {
    if (w.winner >= 0) return;
    const enemies = liveCount(w, 1);
    if (!this.cleared && enemies === 0) {
      this.cleared = true;
      const bonus = 80 + this.wave * 25;
      w.teams[0].energy += bonus;
      w.events.push({
        k: 'scenario',
        team: 0,
        text: `Wave ${this.wave} cleared · +${bonus} energy`,
      });
      this.next = Math.min(this.next, w.tick + 20 * SEC);
    }
    if (w.tick >= this.next) this.spawnWave(w);
  }
  spawnWave(w) {
    const n = ++this.wave;
    this.cleared = false;
    this.next = w.tick + Math.max(45, 80 - n * 2) * SEC;
    // Enemy research keeps pace with the waves.
    const tech = { 4: 'flakBurst', 6: 'plating', 8: 'motors', 10: 'tier2', 12: 'tier3' };
    if (tech[n]) {
      w.teams[1].tech.add(tech[n]);
      w.refreshStats(1);
    }
    const pool = [
      ['scout', 15],
      ['interceptor', 25],
    ];
    if (n >= 3) pool.push(['assault', 45], ['jammer', 40]);
    if (n >= 5) pool.push(['lancer', 70], ['warden', 60]);
    if (n >= 9) pool.push(['carrier', 260]);
    let budget = 110 + n * 70 + n * n * 6;
    const core = w.structures.find((s) => s.team === 0 && s.kind === 'core');
    const tx = core ? core.x : 0,
      tz = core ? core.z : 0;
    const groups = 1 + (n >= 4) + (n >= 8);
    for (let g = 0; g < groups; g++) {
      // Enter from a map edge, away from the player's corner.
      const a = this.rng.next() * TAU;
      const h = w.half - 6;
      let x = dcos(a) * h * 1.4,
        z = dsin(a) * h * 1.4;
      x = x < -h ? -h : x > h ? h : x;
      z = z < -h ? -h : z > h ? h : z;
      if (len(x - tx, z - tz) < 60) {
        x = -x;
        z = -z;
      }
      const sq = squadWith(w, 1, { play: 'attack', x: tx, z: tz }, [
        { when: 'enemyNear', value: 30, then: 'attack', cooldown: 1 },
      ]);
      sq.formation = ['swarm', 'wedge', 'diamond'][this.rng.int(3)];
      let share = budget / (groups - g);
      budget -= share;
      while (share > 10) {
        const [key, cost] = pool[this.rng.int(pool.length)];
        if (cost > share && share < 40) break;
        if (cost > share) continue;
        spawnGroup(w, 1, key, 1, x, z, sq, 4);
        share -= cost;
      }
    }
    w.events.push({ k: 'scenario', team: 0, text: `Wave ${n} incoming`, alert: true });
  }
  hash(h) {
    h.num(this.wave).num(this.next).num(this.rng.state);
  }
  status(w) {
    const lines = [];
    if (this.cleared || w.tick < this.next) lines.push(`Next wave in ${fmt(this.next - w.tick)}`);
    if (!this.cleared) lines.push(`${liveCount(w, 1)} hostiles inbound`);
    return { title: this.wave ? `Wave ${this.wave}` : 'Build phase', lines };
  }
  result(w, winner) {
    const waves = Math.max(0, this.wave - (this.cleared ? 0 : 1));
    return {
      title: `Survived ${waves} wave${waves === 1 ? '' : 's'}`,
      score: waves,
      detail: `Fell during wave ${this.wave}`,
    };
  }
}

// ---------- Challenges ----------

export const CHALLENGES = {
  blind: {
    label: 'Blind Their Eyes',
    blurb:
      'Eight scouts, one battery charge each. An enemy radar ringed by three kill zones. Kill zones only reach 14 m up.',
    goal: 'Destroy the enemy Radar Field',
    setup(w, s) {
      const sq = squadWith(w, 0, { play: 'move', x: -55, z: 50 });
      s.mine = spawnGroup(w, 0, 'scout', 8, -55, 50, sq);
      s.radar = w.addStructure(1, 'radar', 26, -24, true);
      s.radar.hp = s.radar.maxHp = 180;
      for (const [x, z] of [
        [14, -12],
        [34, -4],
        [30, -38],
      ])
        w.addStructure(1, 'turret', x, z, true);
      const pickets = squadWith(w, 1, { play: 'hold', x: 6, z: -32 }, []);
      spawnGroup(w, 1, 'scout', 3, 6, -32, pickets);
    },
    check(w, s) {
      if (!s.radar.alive) return { win: true };
      if (!liveCount(w, 0)) return { win: false, why: 'Every scout was lost' };
    },
    stars: (w, s) => 1 + (liveCount(w, 0) >= 4) + (liveCount(w, 0) >= 7),
    starText: '★ win · ★★ keep 4 scouts · ★★★ keep 7',
  },
  holdline: {
    label: 'Hold the Line',
    blurb: 'No income. 900 energy. Three minutes. The swarm is coming from the east.',
    goal: 'Keep your Core alive for 3:00',
    player: { core: true, units: true, energy: 900, incomeMult: 0 },
    setup(w, s) {
      s.end = w.tick + 180 * SEC;
      s.waves = [20, 60, 100, 140].map((t) => w.tick + t * SEC);
      s.n = 0;
    },
    tick(w, s) {
      while (s.waves.length && w.tick >= s.waves[0]) {
        s.waves.shift();
        s.n++;
        const core = w.structures.find((x) => x.team === 0 && x.kind === 'core');
        const sq = squadWith(w, 1, { play: 'attack', x: core.x, z: core.z });
        spawnGroup(w, 1, 'scout', 6 + s.n * 3, 75, 10 * s.n - 20, sq, 5);
        spawnGroup(w, 1, 'interceptor', 2 + s.n * 2, 75, 10 * s.n - 20, sq, 4);
        if (s.n >= 3) spawnGroup(w, 1, 'assault', s.n, 75, 10 * s.n - 20, sq, 3);
        w.events.push({ k: 'scenario', team: 0, text: `Wave ${s.n} of 4 incoming`, alert: true });
      }
    },
    check(w, s) {
      if (w.tick >= s.end) return { win: true };
    },
    stars: (w) => {
      const core = w.structures.find((x) => x.team === 0 && x.kind === 'core');
      const f = core ? core.hp / core.maxHp : 0;
      return 1 + (f > 0.5) + (f > 0.9);
    },
    starText: '★ survive · ★★ core above 50% · ★★★ above 90%',
    status: (w, s) => [`Hold for ${fmt(s.end - w.tick)}`],
  },
  heist: {
    label: 'Ghost Courier',
    blurb:
      'Fly a relay courier through radar coverage to extraction on one battery. If radar spots it, the hive scrambles.',
    goal: 'Get the courier to the extraction zone (gold ring)',
    setup(w, s) {
      const sq = squadWith(w, 0, { play: 'move', x: -60, z: 55 });
      s.courier = w.uid[spawnGroup(w, 0, 'relay', 1, -60, 55, sq)[0]];
      w.squadMap.get(sq.id).name = 'Courier';
      const esc = squadWith(w, 0, { play: 'move', x: -56, z: 60 });
      spawnGroup(w, 0, 'scout', 5, -56, 60, esc);
      s.zone = { x: 58, z: -50, r: 7 };
      for (const [x, z] of [
        [-20, 30],
        [10, 0],
        [30, -30],
        [-5, -35],
      ])
        w.addStructure(1, 'radar', x, z, true);
      s.hive = squadWith(w, 1, { play: 'hold', x: 40, z: -10 }, [
        { when: 'enemyNear', value: 14, then: 'attack' },
      ]);
      spawnGroup(w, 1, 'interceptor', 9, 40, -10, s.hive, 4);
      s.alarm = false;
      s.held = 0;
    },
    tick(w, s) {
      const i = w.uidMap.get(s.courier);
      if (i === undefined) return;
      if (!s.alarm && w.flags[i] & 2) {
        s.alarm = true;
        w.events.push({
          k: 'scenario',
          team: 0,
          text: 'Courier detected! The hive is scrambling',
          alert: true,
        });
      }
      if (s.alarm && w.tick % 10 === 0) {
        s.hive.order = { play: 'attack', x: w.px[i], z: w.pz[i], x0: w.px[i], z0: w.pz[i] };
        s.hive.reaction = null;
      }
      s.held = len(w.px[i] - s.zone.x, w.pz[i] - s.zone.z) < s.zone.r ? s.held + 1 : 0;
    },
    check(w, s) {
      if (!w.uidMap.has(s.courier)) return { win: false, why: 'The courier was destroyed' };
      if (s.held >= 3 * SEC) return { win: true };
    },
    stars: (w, s) => 1 + !s.alarm + (liveCount(w, 0) >= 5),
    starText: '★ deliver · ★★ never detected · ★★★ and lose at most one escort',
    status: (w, s) => [
      s.alarm ? 'ALARM — hive scrambled' : 'Undetected',
      s.held ? `Extracting ${(s.held / SEC).toFixed(1)}/3 s` : 'Avoid the radar fields',
    ],
    markers: (w, s) => [{ type: 'zone', x: s.zone.x, z: s.zone.z, r: s.zone.r, color: '#ffc65a' }],
  },
  carrier: {
    label: 'Carrier Strike',
    blurb:
      'A Carrier, two Wardens and two Lancers against a fortified outpost. Lancers outrange its guns.',
    goal: 'Destroy the enemy Command Core',
    player: { tech: ['tier2', 'tier3', 'batteries'] },
    setup(w, s) {
      const sq = squadWith(w, 0, { play: 'move', x: -50, z: 45 });
      spawnGroup(w, 0, 'carrier', 1, -52, 48, sq);
      spawnGroup(w, 0, 'warden', 2, -50, 44, sq);
      spawnGroup(w, 0, 'lancer', 2, -48, 50, sq);
      s.core = w.addStructure(1, 'core', 50, -45, true);
      w.addStructure(1, 'turret', 38, -32, true);
      w.addStructure(1, 'repair', 52, -32, true);
      const def = squadWith(w, 1, { play: 'hold', x: 40, z: -38 }, [
        { when: 'enemyNear', value: 20, then: 'attack' },
      ]);
      spawnGroup(w, 1, 'interceptor', 5, 40, -38, def, 4);
      spawnGroup(w, 1, 'scout', 4, 44, -30, def, 4);
    },
    check(w, s) {
      if (!s.core.alive) return { win: true };
      if (!liveCount(w, 0)) return { win: false, why: 'The strike group was destroyed' };
    },
    stars: (w) => {
      let lancers = 0;
      for (let i = 0; i < w.count; i++)
        if (w.alive[i] && w.team[i] === 0 && w.roles[w.role[i]].key === 'lancer') lancers++;
      return 1 + (w.tick < 120 * SEC) + (lancers === 2);
    },
    starText: '★ win · ★★ under 2:00 · ★★★ keep both Lancers',
  },
  ace: {
    label: 'Ace Pilot',
    blurb: 'Just you, one interceptor, and ten enemy scouts. Fly it yourself.',
    goal: 'Shoot down all ten scouts while flying manually',
    forcePilot: true,
    setup(w, s) {
      const sq = squadWith(w, 0, { play: 'hold', x: -20, z: 20 });
      s.me = w.uid[spawnGroup(w, 0, 'interceptor', 1, -20, 20, sq)[0]];
      const foe = squadWith(w, 1, { play: 'patrol', x: 20, z: -20 }, [
        { when: 'enemyNear', value: 12, then: 'attack' },
      ]);
      foe.order.x0 = 0;
      foe.order.z0 = 10;
      spawnGroup(w, 1, 'scout', 10, 10, -10, foe, 5);
      w.teams[0].tech.add('batteries');
      w.refreshStats(0);
    },
    check(w, s) {
      if (!liveCount(w, 1)) return { win: true };
      if (!w.uidMap.has(s.me)) return { win: false, why: 'You were shot down' };
    },
    stars: (w, s) => {
      const i = w.uidMap.get(s.me);
      const hp = i === undefined ? 0 : w.hp[i] / w.rs(i).hp;
      return 1 + (hp > 0.5) + (w.tick < 90 * SEC);
    },
    starText: '★ win · ★★ above 50% hull · ★★★ under 1:30',
    status: (w) => [`${liveCount(w, 1)} scouts left`],
  },
};

class Challenge {
  constructor(cfg) {
    this.key = 'challenge';
    this.id = cfg.challenge in CHALLENGES ? cfg.challenge : 'blind';
    this.def = CHALLENGES[this.id];
    this.map = 'delta';
    const p = this.def.player || {};
    this.teams = [
      {
        core: !!p.core,
        units: !!p.units,
        energy: p.energy ?? 0,
        incomeMult: p.incomeMult,
        tech: p.tech,
      },
      { core: false, units: false, energy: 0, tether: true },
    ];
    this.state = {};
    this.forcePilot = this.def.forcePilot;
  }
  init(w) {
    this.def.setup(w, this.state);
    if (this.def.forcePilot) takeControl(w, (this.pilotUid = this.state.me));
  }
  result(w, winner) {
    if (winner === 0) {
      const stars = this.def.stars(w, this.state);
      return {
        title: `${this.def.label}: complete`,
        detail: '★'.repeat(stars) + '☆'.repeat(3 - stars),
        stars,
        challenge: this.id,
      };
    }
    return {
      title: `${this.def.label}: failed`,
      detail: 'Your Command Core was destroyed',
      stars: 0,
      challenge: this.id,
    };
  }
  tick(w) {
    if (w.winner >= 0) return;
    this.def.tick?.(w, this.state);
    const r = this.def.check(w, this.state);
    if (!r) return;
    const stars = r.win ? this.def.stars(w, this.state) : 0;
    w.finish(r.win ? 0 : 1, {
      title: r.win ? `${this.def.label}: complete` : `${this.def.label}: failed`,
      detail: r.win ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : r.why,
      stars,
      challenge: this.id,
    });
  }
  hash(h) {
    h.num(Object.keys(this.state).length);
  }
  status(w) {
    return { title: this.def.goal, lines: this.def.status?.(w, this.state) || [this.def.starText] };
  }
  markers(w) {
    return this.def.markers?.(w, this.state) || [];
  }
}

// ---------- FPV Race ----------

// Gates thread between the mesas of Delta Basin. Each gate: center x, z, altitude y (m above
// ground), radius r.
export const RACE_GATES = [
  { x: -44, z: 40, y: 4, r: 3.4 },
  { x: -32, z: 14, y: 5, r: 3.4 },
  { x: -14, z: 22, y: 3.5, r: 3.2 },
  { x: 2, z: 42, y: 7, r: 3.2 },
  { x: 22, z: 30, y: 4, r: 3.2 },
  { x: 22, z: 4, y: 9, r: 3.2 },
  { x: 4, z: -14, y: 3, r: 3.2 },
  { x: -18, z: -6, y: 5, r: 3.2 },
  { x: -46, z: -14, y: 6, r: 3.2 },
  { x: -52, z: 22, y: 4, r: 3.4 },
];

class Race {
  constructor(cfg) {
    this.key = 'race';
    this.map = 'delta';
    this.teams = [{ core: false, units: false, energy: 0 }];
    this.gates = RACE_GATES;
    this.nextGate = 0;
    this.start = -1;
    this.finishTick = -1;
    this.splits = [];
    this.forcePilot = true;
  }
  init(w) {
    const sq = squadWith(w, 0, { play: 'hold', x: -54, z: 52 });
    const i = spawnGroup(w, 0, 'scout', 1, -54, 52, sq)[0];
    w.yaw[i] = w.oyaw[i] = 2.6; // facing the first gate
    this.pilotUid = w.uid[i];
    takeControl(w, this.pilotUid);
  }
  tick(w) {
    if (w.winner >= 0) return;
    const i = w.uidMap.get(this.pilotUid);
    if (i === undefined) {
      w.finish(1, {
        title: 'Crashed out',
        detail: `Reached gate ${this.nextGate} of ${this.gates.length}`,
      });
      return;
    }
    w.bat[i] = 1; // race drones run on a tether, no battery anxiety
    const g = this.gates[this.nextGate];
    const dy = w.py[i] - g.y;
    if (len(w.px[i] - g.x, w.pz[i] - g.z) < g.r && dy * dy < g.r * g.r) {
      if (this.nextGate === 0) this.start = w.tick;
      else this.splits.push(w.tick - this.start);
      w.events.push({ k: 'gate', index: this.nextGate, team: 0 });
      this.nextGate++;
      if (this.nextGate >= this.gates.length) {
        this.finishTick = w.tick;
        const t = this.finishTick - this.start;
        w.finish(0, {
          title: `Finished in ${(t / SEC).toFixed(2)} s`,
          detail: `${this.gates.length} gates`,
          time: t / SEC,
          race: true,
        });
      }
    }
  }
  hash(h) {
    h.num(this.nextGate).num(this.start);
  }
  status(w) {
    const t = this.start < 0 ? 0 : w.tick - this.start;
    return {
      title: this.start < 0 ? 'Fly through gate 1 to start the clock' : `${(t / SEC).toFixed(2)} s`,
      lines: [`Gate ${Math.min(this.nextGate + 1, this.gates.length)} / ${this.gates.length}`],
    };
  }
  markers(w) {
    return this.gates.map((g, k) => ({
      type: 'gate',
      ...g,
      state: k < this.nextGate ? 'passed' : k === this.nextGate ? 'next' : 'later',
      facing: this.gates[(k + 1) % this.gates.length],
    }));
  }
}

export function createScenario(cfg = {}) {
  if (cfg.mode === 'survival') return new Survival(cfg);
  if (cfg.mode === 'challenge') return new Challenge(cfg);
  if (cfg.mode === 'race') return new Race(cfg);
  return null;
}
