// Standalone arcade sports rules. Coordinates are pitch units, never aircraft controls.
export const RULES_VERSION = 1;
export function matchId() {
  return (
    'sports-' +
    (globalThis.crypto?.randomUUID?.() ||
      Date.now().toString(36) +
        '-' +
        Math.random().toString(36).slice(2) +
        '-' +
        Math.random().toString(36).slice(2))
  );
}
export const STEP = 0.2;
export const MODES = { ctf: 'Capture the flag', soccer: 'Soccer', football: 'Flag football' };
const layouts = {
  compact: [
    [9, 30],
    [24, 21],
    [24, 39],
    [39, 24],
    [39, 36],
  ],
  wide: [
    [9, 30],
    [22, 10],
    [22, 50],
    [40, 10],
    [40, 50],
  ],
  diamond: [
    [9, 30],
    [24, 30],
    [32, 13],
    [32, 47],
    [43, 30],
  ],
};
export const PLAYS = {
  ctf: {
    compact: {
      name: 'Home guard',
      note: 'Three home-side taggers; two flag runners.',
      layout: 'compact',
      runners: 2,
    },
    wide: {
      name: 'Touchline relay',
      note: 'Two home-side taggers; three runners spread across the pitch.',
      layout: 'wide',
      runners: 3,
    },
    diamond: {
      name: 'Center flag rush',
      note: 'One home-side tagger; four flag runners.',
      layout: 'diamond',
      runners: 4,
    },
  },
  soccer: {
    compact: {
      name: 'Short passing',
      note: 'Short passing triangles and patient shooting.',
      layout: 'compact',
      pass: 0.8,
      shoot: 76,
    },
    wide: {
      name: 'Wing play',
      note: 'Wide starting lanes and earlier shots.',
      layout: 'wide',
      pass: 0.55,
      shoot: 68,
    },
    diamond: {
      name: 'Carry & finish',
      note: 'Central ball carries with occasional passes.',
      layout: 'diamond',
      pass: 0.25,
      shoot: 72,
    },
  },
  football: {
    compact: {
      name: 'Ground game',
      note: 'The quarterback carries toward the end zone.',
      layout: 'compact',
      pass: false,
    },
    wide: {
      name: 'Wide receivers',
      note: 'One forward pass to a wide receiver each down.',
      layout: 'wide',
      pass: true,
    },
    diamond: {
      name: 'Short completion',
      note: 'One short forward pass before the receiver runs.',
      layout: 'diamond',
      pass: true,
    },
  },
};
const clone = (x) => JSON.parse(JSON.stringify(x));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function formation(key = 'compact') {
  return clone(layouts[key] || layouts.compact);
}
export function validateConfig(input = {}) {
  const mode = input.mode ?? 'soccer';
  if (!Object.hasOwn(MODES, mode)) throw Error('Choose a supported sport.');
  const seed = input.seed ?? 1,
    duration = input.duration ?? 60,
    start = input.start ?? 0;
  if (!Number.isInteger(seed) || seed < 1 || seed > 2147483647)
    throw Error('Seed must be an integer from 1 to 2147483647.');
  if (![30, 60, 120, 180].includes(duration) || ![0, 1].includes(start))
    throw Error('Invalid match duration or starting team.');
  const plays = input.plays ?? ['compact', 'wide'];
  if (
    !Array.isArray(plays) ||
    plays.length !== 2 ||
    plays.some((p) => !Object.hasOwn(PLAYS[mode], p))
  )
    throw Error('Unknown sports play.');
  const custom = input.custom ?? [null, null];
  if (!Array.isArray(custom) || custom.length !== 2)
    throw Error('Two formation slots are required.');
  for (const team of custom)
    if (team !== null) {
      if (
        !Array.isArray(team) ||
        team.length !== 5 ||
        team.some(
          (p) =>
            !Array.isArray(p) ||
            p.length !== 2 ||
            !p.every(Number.isFinite) ||
            p[0] < 6 ||
            p[0] > 44 ||
            p[1] < 6 ||
            p[1] > 54,
        )
      )
        throw Error('Use five positions: X 6–44, Y 6–54.');
      for (let i = 0; i < 5; i++)
        for (let j = 0; j < i; j++)
          if (Math.hypot(team[i][0] - team[j][0], team[i][1] - team[j][1]) < 3)
            throw Error('Starting positions need at least 3 pitch units of spacing.');
    }
  return { mode, seed, duration, start, plays: [...plays], custom: clone(custom) };
}
export class SportsMatch {
  constructor(input = {}) {
    this.config = validateConfig(input);
    this.rng = this.config.seed;
    this.tick = 0;
    this.done = false;
    this.score = [0, 0];
    this.events = [];
    this.frames = [];
    this.cooldown = 0;
    this.nextKick = this.config.start;
    this.stats = [0, 1].map(() => ({
      passes: 0,
      attempts: 0,
      shots: 0,
      tags: 0,
      possession: 0,
      captures: 0,
      touchdowns: 0,
    }));
    this.players = Array.from({ length: 10 }, (_, id) => ({
      id,
      team: Math.floor(id / 5),
      slot: id % 5,
      x: 0,
      y: 0,
      wait: 0,
      tagUntil: 0,
    }));
    this.ball = { x: 50, y: 30, owner: null };
    this.flags = [
      { x: 7, y: 30, carrier: null, state: 'home', timer: 0 },
      { x: 93, y: 30, carrier: null, state: 'home', timer: 0 },
    ];
    this.down = 1;
    this.possession = this.config.start;
    this.line = 20;
    this.playTime = 0;
    this.passed = false;
    this.action = 0;
    this.resetPlayers();
    if (this.config.mode === 'soccer') this.kickoff();
    if (this.config.mode === 'football') this.snap();
    this.capture();
  }
  random() {
    let x = this.rng | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rng = x >>> 0;
    return this.rng / 4294967296;
  }
  get time() {
    return this.tick * STEP;
  }
  play(team) {
    return PLAYS[this.config.mode][this.config.plays[team]];
  }
  xy(team, x, y) {
    return { x: team ? 100 - x : x, y };
  }
  progress(p) {
    return p.team ? 100 - p.x : p.x;
  }
  base(team) {
    return this.xy(team, 7, 30);
  }
  layout(team) {
    return this.config.custom[team] || formation(this.play(team).layout);
  }
  resetPlayers() {
    for (const p of this.players) {
      const [x, y] = this.layout(p.team)[p.slot];
      Object.assign(p, this.xy(p.team, x, y), { wait: 0 });
    }
  }
  move(p, target, speed = 8) {
    if (p.wait > 0) return;
    const d = dist(p, target),
      n = Math.min(d, speed * STEP);
    if (d > 0) {
      p.x = clamp(p.x + ((target.x - p.x) * n) / d, 2, 98);
      p.y = clamp(p.y + ((target.y - p.y) * n) / d, 2, 58);
    }
  }
  log(text, type = 'play') {
    this.events.push({ time: this.time, text, type });
  }
  capture() {
    this.frames.push({
      time: this.time,
      score: [...this.score],
      stats: clone(this.stats),
      players: this.players.map((p) => ({ ...p })),
      ball: { ...this.ball },
      flags: clone(this.flags),
      down: this.down,
      possession: this.possession,
      line: this.line,
      cooldown: this.cooldown,
    });
  }
  kickoff() {
    this.resetPlayers();
    this.ball = { ...this.xy(this.nextKick, 44, 30), owner: this.nextKick * 5 + 4 };
    Object.assign(this.players[this.ball.owner], this.xy(this.nextKick, 44, 30));
    this.action = 1.4;
  }
  snap() {
    this.resetPlayers();
    const t = this.possession;
    for (const p of this.players) {
      const slot = this.layout(p.team)[p.slot];
      if (p.team === t)
        Object.assign(
          p,
          this.xy(t, clamp(this.line + (slot[0] - this.layout(t)[0][0]) * 0.12, 8, 87), slot[1]),
        );
      else Object.assign(p, this.xy(t, clamp(this.line + 10 + slot[0] * 0.14, 15, 94), slot[1]));
    }
    const qb = this.players[t * 5];
    this.ball = { x: qb.x, y: qb.y, owner: qb.id };
    this.playTime = 0;
    this.passed = false;
  }
  endDown(reason, gain = 0) {
    this.log(reason, 'down');
    this.line = clamp(this.line + gain, 10, 90);
    this.down++;
    if (this.down > 4) {
      this.possession = 1 - this.possession;
      this.line = 20;
      this.down = 1;
      this.log('Turnover on downs.', 'turnover');
    }
    this.cooldown = 1.2;
    this.ball.owner = null;
  }
  point(team, value, text) {
    this.score[team] += value;
    this.log((team ? 'Coral' : 'Blue') + ' ' + text, 'score');
    this.cooldown = 1.6;
    if (this.config.mode === 'soccer') {
      this.nextKick = 1 - team;
      this.ball.owner = null;
    }
    if (this.config.mode === 'football') {
      this.stats[team].touchdowns++;
      this.possession = 1 - team;
      this.down = 1;
      this.line = 20;
      this.ball.owner = null;
    }
  }
  soccer() {
    if (this.ball.owner === null) {
      const p = this.players.reduce((a, b) => (dist(a, this.ball) < dist(b, this.ball) ? a : b));
      this.ball.owner = p.id;
    }
    let carrier = this.players[this.ball.owner];
    this.stats[carrier.team].possession += STEP;
    const rivals = this.players.filter((p) => p.team !== carrier.team);
    const challenger = rivals.reduce((a, b) => (dist(a, carrier) < dist(b, carrier) ? a : b));
    for (const p of this.players) {
      const [x, y] = this.layout(p.team)[p.slot];
      let target = this.xy(
        p.team,
        clamp(x + (this.progress({ ...this.ball, team: p.team }) - 45) * 0.45, 5, 89),
        y,
      );
      if (p === carrier) target = this.xy(p.team, 96, 30 + (y - 30) * 0.3);
      else if (p === challenger) target = carrier;
      else if (p.slot === 0) target = this.xy(p.team, 7, clamp(this.ball.y, 22, 38));
      this.move(p, target, p === carrier ? 7.8 : 8.2);
    }
    if (dist(challenger, carrier) < 2.8 && challenger.wait <= 0 && this.random() < 0.2) {
      this.ball.owner = challenger.id;
      carrier.wait = 0.8;
      carrier = challenger;
      this.action = 0.8;
      this.log((carrier.team ? 'Coral' : 'Blue') + ' wins possession.');
    }
    this.ball.x = carrier.x;
    this.ball.y = carrier.y;
    this.action -= STEP;
    if (this.action > 0) return;
    this.action = 1.4 + this.random() * 0.6;
    const t = carrier.team,
      play = this.play(t),
      progress = this.progress(carrier);
    if (progress > play.shoot) {
      this.stats[t].shots++;
      const keeper = this.players[(1 - t) * 5],
        chance = clamp(
          0.22 +
            (progress - 65) * 0.017 -
            Math.abs(carrier.y - 30) * 0.004 -
            (Math.abs(keeper.y - carrier.y) < 7 ? 0.07 : 0),
          0.12,
          0.72,
        );
      this.ball.x = t ? 1 : 99;
      this.ball.y = 30;
      if (this.random() < chance) this.point(t, 1, 'scores a goal!');
      else {
        this.log((t ? 'Coral' : 'Blue') + ' shoots — saved.', 'shot');
        this.ball.owner = keeper.id;
        this.action = 1;
      }
      return;
    }
    if (this.random() < play.pass) {
      const mates = this.players.filter((p) => p.team === t && p !== carrier && p.slot !== 0);
      const receiver = mates.sort(
        (a, b) =>
          this.progress(b) - dist(b, carrier) * 0.2 - (this.progress(a) - dist(a, carrier) * 0.2),
      )[0];
      this.stats[t].attempts++;
      if (this.random() < 0.85) {
        this.stats[t].passes++;
        this.ball.owner = receiver.id;
        this.ball.x = receiver.x;
        this.ball.y = receiver.y;
        this.log((t ? 'Coral' : 'Blue') + ' completes a pass.');
      } else {
        this.ball.owner = challenger.id;
        this.log('Pass intercepted.');
      }
    }
  }
  football() {
    this.playTime += STEP;
    let carrier = this.players[this.ball.owner];
    if (!carrier) {
      this.endDown('Dead ball.');
      return;
    }
    const t = this.possession;
    this.stats[t].possession += STEP;
    for (const p of this.players) {
      const slot = this.layout(p.team)[p.slot];
      let target;
      if (p.team === t) {
        target = this.xy(t, 97, slot[1]);
        if (p === carrier) target = this.xy(t, 97, clamp(slot[1], 15, 45));
      } else {
        const receiver = this.players[t * 5 + p.slot];
        target = p.slot < 2 ? carrier : receiver;
      }
      this.move(p, target, p === carrier ? 7.5 : 7.8);
    }
    this.ball.x = carrier.x;
    this.ball.y = carrier.y;
    if (this.progress(carrier) >= 92) {
      this.point(t, 6, 'touchdown!');
      return;
    }
    const tagger = this.players.find(
      (p) => p.team !== t && dist(p, carrier) < 2.8 && p.tagUntil <= this.time,
    );
    if (tagger) tagger.tagUntil = this.time + 1.4;
    if (tagger && this.random() < 0.26) {
      this.stats[tagger.team].tags++;
      this.endDown('Flag pulled. Down ends.', this.progress(carrier) - this.line);
      return;
    }
    if (this.playTime > 1.2 && !this.passed && this.play(t).pass) {
      this.passed = true;
      const mates = this.players.filter((p) => p.team === t && p.slot > 0);
      const receiver =
        this.config.plays[t] === 'diamond' ? mates[0] : mates[1 + Math.floor(this.random() * 3)];
      this.stats[t].attempts++;
      if (this.random() < (this.config.plays[t] === 'diamond' ? 0.88 : 0.68)) {
        this.stats[t].passes++;
        this.ball.owner = receiver.id;
        this.ball.x = receiver.x;
        this.ball.y = receiver.y;
        this.log((t ? 'Coral' : 'Blue') + ' pass complete.');
      } else this.endDown('Incomplete forward pass.');
    }
    if (this.playTime >= 12 && !this.cooldown) this.endDown('Play clock expired.');
  }
  ctf() {
    for (const flag of this.flags) {
      if (flag.state !== 'home' && (flag.timer -= STEP) <= 0)
        Object.assign(flag, this.base(this.flags.indexOf(flag)), { state: 'home', carrier: null });
      if (flag.carrier !== null)
        Object.assign(flag, { x: this.players[flag.carrier].x, y: this.players[flag.carrier].y });
    }
    for (const p of this.players) {
      if (p.wait > 0) continue;
      const own = this.flags[p.team],
        other = this.flags[1 - p.team],
        runners = this.play(p.team).runners;
      let target;
      if (other.carrier === p.id) target = this.base(p.team);
      else if (p.slot >= 5 - runners)
        target =
          other.carrier === null
            ? this.progress(p) < 78 && other.state === 'home'
              ? this.xy(p.team, 82, this.layout(p.team)[p.slot][1])
              : other
            : this.xy(p.team, 78, this.layout(p.team)[p.slot][1]);
      else {
        const intruders = this.players.filter(
          (q) => q.team !== p.team && q.wait <= 0 && (p.team ? q.x > 50 : q.x < 50),
        );
        target =
          intruders.sort((a, b) => dist(a, p) - dist(b, p))[0] ||
          this.xy(p.team, ...this.layout(p.team)[p.slot]);
        if (own.state === 'dropped') target = own;
      }
      this.move(p, target, other.carrier === p.id ? 7.4 : 8);
    }
    // Resolve tags before pickups/captures, and never tag outside the tagger's home half.
    for (const p of this.players) {
      if (p.wait > 0 || p.tagUntil > this.time || (p.team ? p.x < 50 : p.x > 50)) continue;
      const q = this.players.find((q) => q.team !== p.team && q.wait <= 0 && dist(p, q) < 2.7);
      if (!q) continue;
      p.tagUntil = this.time + 1.8;
      if (this.random() > 0.5) continue;
      this.stats[p.team].tags++;
      for (const f of this.flags)
        if (f.carrier === q.id)
          Object.assign(f, { x: q.x, y: q.y, carrier: null, state: 'dropped', timer: 8 });
      Object.assign(q, this.base(q.team), { wait: 3 });
      this.log((p.team ? 'Coral' : 'Blue') + ' tags a runner.');
    }
    for (const p of this.players) {
      if (p.wait > 0) continue;
      const own = this.flags[p.team],
        other = this.flags[1 - p.team];
      if (own.state === 'dropped' && dist(p, own) < 3)
        Object.assign(own, this.base(p.team), { state: 'home', carrier: null });
      if (other.carrier === null && dist(p, other) < 3) {
        other.carrier = p.id;
        other.state = 'carried';
        other.timer = 25;
        this.log((p.team ? 'Coral' : 'Blue') + ' picks up the flag.');
      }
      if (other.carrier === p.id) {
        other.x = p.x;
        other.y = p.y;
        this.stats[p.team].possession += STEP;
        if (dist(p, this.base(p.team)) < 4 && own.state === 'home') {
          this.stats[p.team].captures++;
          this.point(p.team, 1, 'captures the flag!');
          for (let t = 0; t < 2; t++)
            Object.assign(this.flags[t], this.base(t), { carrier: null, state: 'home', timer: 0 });
          break;
        }
      }
    }
  }
  step(record = true) {
    if (this.done) return;
    this.tick++;
    for (const p of this.players) p.wait = Math.max(0, p.wait - STEP);
    if (this.cooldown > 0) {
      this.cooldown = Math.max(0, this.cooldown - STEP);
      if (this.cooldown === 0) {
        if (this.config.mode === 'soccer') this.kickoff();
        else if (this.config.mode === 'football') this.snap();
        else this.resetPlayers();
      }
    } else this[this.config.mode]();
    if (this.tick >= Math.round(this.config.duration / STEP)) {
      this.done = true;
      this.log('Full time.', 'final');
    }
    if (record) this.capture();
  }
  result() {
    return {
      rules: RULES_VERSION,
      config: clone(this.config),
      score: [...this.score],
      stats: clone(this.stats),
      winner: this.score[0] === this.score[1] ? null : this.score[0] > this.score[1] ? 0 : 1,
    };
  }
}
export function simulate(config, record = false) {
  const m = new SportsMatch(config);
  while (!m.done) m.step(record);
  return m;
}
export function playKey(config, team) {
  return config.custom[team] ? 'custom' : config.plays[team];
}
export function standings(records, mode, team) {
  return Object.keys(PLAYS[mode]).map((key) => {
    const rows = records.filter((r) => r.config.mode === mode && playKey(r.config, team) === key),
      wins = rows.filter((r) => r.winner === team).length,
      draws = rows.filter((r) => r.winner === null).length;
    return {
      key,
      name: PLAYS[mode][key].name,
      games: rows.length,
      wins,
      draws,
      losses: rows.length - wins - draws,
      rate: rows.length ? (wins + draws * 0.5) / rows.length : 0,
      difference: rows.length
        ? rows.reduce((s, r) => s + r.score[team] - r.score[1 - team], 0) / rows.length
        : 0,
    };
  });
}
export function choosePlay(records, mode, team, seed = 1) {
  const rows = standings(records, mode, team),
    least = Math.min(...rows.map((r) => r.games)),
    unseen = rows.filter((r) => r.games === 0);
  if (unseen.length) return unseen[Math.abs(seed) % unseen.length].key;
  if (seed % 5 === 0) return rows.filter((r) => r.games === least)[0].key;
  return rows.sort((a, b) => b.rate - a.rate || b.games - a.games || a.key.localeCompare(b.key))[0]
    .key;
}
export function validateArchive(input) {
  if (
    input?.kind !== 'fleet-sports-lab' ||
    input.version !== 1 ||
    !Array.isArray(input.records) ||
    input.records.length > 300
  )
    throw Error('Expected a Sports Lab archive with at most 300 matches.');
  const ids = new Set();
  const records = input.records.map((r) => {
    if (
      !r ||
      typeof r.id !== 'string' ||
      !r.id ||
      !r.config ||
      r.id.length > 80 ||
      ids.has(r.id) ||
      r.rules !== RULES_VERSION
    )
      throw Error('Invalid or duplicate match ID, or unsupported rules version.');
    ids.add(r.id);
    const config = validateConfig(r.config);
    if (
      !Array.isArray(r.score) ||
      r.score.length !== 2 ||
      r.score.some((n) => !Number.isInteger(n) || n < 0 || n > 200)
    )
      throw Error('Invalid score.');
    const winner = r.score[0] === r.score[1] ? null : r.score[0] > r.score[1] ? 0 : 1;
    if (r.winner !== winner) throw Error('Result does not match the score.');
    if (!Array.isArray(r.stats) || r.stats.length !== 2) throw Error('Missing match statistics.');
    const stats = r.stats.map((s) => {
      const out = {};
      for (const k of [
        'passes',
        'attempts',
        'shots',
        'tags',
        'possession',
        'captures',
        'touchdowns',
      ]) {
        if (!s || !Number.isFinite(s[k]) || s[k] < 0 || s[k] > 10000)
          throw Error('Invalid match statistics.');
        out[k] = s[k];
      }
      return out;
    });
    return { id: r.id, rules: RULES_VERSION, config, score: [...r.score], winner, stats };
  });
  return { kind: 'fleet-sports-lab', version: 1, records };
}
