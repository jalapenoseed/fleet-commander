// Game-only swarm rules. Distances and effect strengths are arbitrary arena units.
export const LIMITS = { agents: 240, squads: 8, fields: 20, targets: 10 };
export const DEFAULTS = {
  attraction: 3.2,
  vortex: 1.5,
  separation: 3.8,
  avoid: 6.2,
  wind: 0.6,
  damping: 0.85,
  formation: 2,
  alignment: 0.7,
  cohesion: 0.5,
  hazard: 9,
};
export const OBSTACLES = [
  { x: -9, z: -5, r: 3.1 },
  { x: 5, z: -8, r: 2.7 },
  { x: 10, z: 4, r: 3.4 },
  { x: -5, z: 9, r: 2.5 },
];
export const FIELD_TYPES = {
  radar: {
    label: 'Radar sensor',
    color: '#71cfff',
    description: 'Detects drones across obstacles and marks them while inside the range.',
  },
  optical: {
    label: 'Optical sensor',
    color: '#a5efb3',
    description: 'Marks drones with line of sight. Solid obstacles block it.',
  },
  thermal: {
    label: 'Thermal sensor',
    color: '#ffab72',
    description: 'Marks moving drones at full range; slow drones only at half range.',
  },
  acoustic: {
    label: 'Acoustic sensor',
    color: '#e6d690',
    description: 'Detects fast-moving drones. Slow approaches are quieter.',
  },
  rf: {
    label: 'RF sensor',
    color: '#bf9cff',
    description: 'Marks drones with active radio links. Jamming masks their radio signature.',
  },
  jammer: {
    label: 'Jamming zone',
    color: '#d998ff',
    description: 'Disrupts squad commands and slows movement. Relay drones reduce its effect.',
  },
  emp: {
    label: 'EMP pulse',
    color: '#c8b9ff',
    description: 'Cycles two seconds on, two off. Stuns drones during the pulse.',
  },
  damage: {
    label: 'Damage zone',
    color: '#ff7c76',
    description: 'Drains health continuously inside its radius.',
  },
  kill: {
    label: 'Elimination zone',
    color: '#ff4858',
    description: 'Instantly disables drones entering the radius.',
  },
  slow: {
    label: 'Slow field',
    color: '#9cbdda',
    description: 'Reduces drone speed inside its radius.',
  },
  repair: {
    label: 'Repair field',
    color: '#8dedba',
    description: 'Restores health to active drones inside its radius.',
  },
  attract: {
    label: 'Attractor',
    color: '#ffd47c',
    description: 'Adds a pull toward the field center.',
  },
  repel: {
    label: 'Repulsor',
    color: '#fca480',
    description: 'Pushes drones away from its center.',
  },
  vortex: {
    label: 'Vortex field',
    color: '#86e3d9',
    description: 'Adds rotation around the field center.',
  },
};
export const SENSORS = {
  radar: { label: 'Radar', range: 13 },
  optical: { label: 'Optical', range: 10 },
  thermal: { label: 'Thermal', range: 11 },
  rf: { label: 'RF', range: 15 },
  acoustic: { label: 'Acoustic', range: 12 },
};
export const ROLES = {
  scout: { label: 'Scout', speed: 7.5, range: 1.4, damage: 0 },
  guard: { label: 'Guard', speed: 5, range: 1, damage: 12 },
  striker: { label: 'Striker', speed: 6.5, range: 1, damage: 17 },
  jammer: { label: 'Jammer', speed: 5.5, range: 1, damage: 0 },
  medic: { label: 'Medic', speed: 5, range: 1, damage: 0 },
  relay: { label: 'Relay', speed: 5.5, range: 1.15, damage: 0 },
};
export const FORMATIONS = ['swarm', 'wedge', 'line', 'column', 'ring', 'grid', 'spiral', 'diamond'];
export const PLAYS = ['move', 'patrol', 'orbit', 'pincer', 'escort', 'attack', 'hold', 'retreat'];
export const CONDITIONS = {
  jammed: 'Jamming detected',
  detected: 'Spotted by a sensor',
  hurt: 'Average health below threshold',
  danger: 'Harmful field nearby',
  enemy: 'Enemy in sensor range',
};
export const REACTIONS = {
  evade: 'Spread out and avoid fields',
  retreat: 'Retreat to repair / home',
  attack: 'Pursue detected enemies',
  regroup: 'Regroup into a grid',
  patrol: 'Patrol all targets',
  orbit: 'Orbit assigned target',
  hold: 'Hold home position',
};
export const TEAM_COLORS = { blue: '#8de2cb', red: '#ff918c' };
const hostile = new Set(['jammer', 'emp', 'damage', 'kill', 'slow']);
const detectors = new Set(['radar', 'optical', 'thermal', 'rf', 'acoustic']);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const unit = (x, z) => {
  const d = Math.hypot(x, z) || 1;
  return { x: x / d, z: z / d };
};
export function clearPoint(x, z, margin = 0.6) {
  let p = { x, z };
  const r = Math.hypot(x, z);
  if (r > 27) {
    p.x *= 27 / r;
    p.z *= 27 / r;
  }
  for (const o of OBSTACLES) {
    const d = dist(p, o);
    if (d < o.r + margin) {
      const n = unit(p.x - o.x || 0.01, p.z - o.z);
      p = { x: o.x + n.x * (o.r + margin), z: o.z + n.z * (o.r + margin) };
    }
  }
  return p;
}
export function hasLineOfSight(a, b) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    den = dx * dx + dz * dz;
  return !OBSTACLES.some((o) => {
    const t = den ? clamp(((o.x - a.x) * dx + (o.z - a.z) * dz) / den, 0, 1) : 0;
    return Math.hypot(a.x + t * dx - o.x, a.z + t * dz - o.z) < o.r;
  });
}
export function formationOffset(type, i, n, spacing = 1.5, time = 0) {
  const center = (n - 1) / 2;
  if (type === 'line') return { x: (i - center) * spacing, z: 0 };
  if (type === 'column') return { x: 0, z: (i - center) * spacing };
  if (type === 'wedge')
    return {
      x: (i % 2 ? 1 : -1) * Math.ceil(i / 2) * spacing,
      z: Math.ceil(i / 2) * spacing * 0.8,
    };
  if (type === 'ring') {
    const a = (i / n) * Math.PI * 2;
    const r = Math.max(2, (n * spacing) / (Math.PI * 2));
    return { x: Math.cos(a) * r, z: Math.sin(a) * r };
  }
  if (type === 'grid') {
    const w = Math.ceil(Math.sqrt(n));
    return {
      x: ((i % w) - (w - 1) / 2) * spacing,
      z: (Math.floor(i / w) - (Math.ceil(n / w) - 1) / 2) * spacing,
    };
  }
  if (type === 'diamond') {
    const a = (i / n) * Math.PI * 2,
      r = Math.max(3, Math.sqrt(n) * spacing);
    return {
      x: (Math.cos(a) * r) / (Math.abs(Math.cos(a)) + Math.abs(Math.sin(a))),
      z: (Math.sin(a) * r) / (Math.abs(Math.cos(a)) + Math.abs(Math.sin(a))),
    };
  }
  const a = i * 2.399963 + (type === 'swarm' ? time * 0.15 : 0),
    r = Math.sqrt(i + 0.5) * spacing * (type === 'spiral' ? 0.75 : 0.55);
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}
export class SwarmLab {
  constructor(random = Math.random) {
    this.random = random;
    this.params = { ...DEFAULTS };
    this.time = 0;
    this.serial = 0;
    this.squads = [];
    this.agents = [];
    this.fields = [];
    this.targets = [];
    this.events = [];
    this.shots = [];
    this.contacts = 0;
    this.combat = false;
    this.result = '';
    this.scenario('sandbox');
  }
  id(prefix) {
    return `${prefix}${++this.serial}`;
  }
  log(message) {
    this.events.unshift({ time: this.time, text: message });
    this.events.length = Math.min(7, this.events.length);
  }
  addTarget(x, z) {
    if (this.targets.length >= LIMITS.targets) {
      this.log('Target limit reached (10).');
      return null;
    }
    const p = clearPoint(x, z, 1);
    const t = { id: this.id('T'), name: `Target ${this.targets.length + 1}`, ...p };
    this.targets.push(t);
    return t;
  }
  addField(type, x, z, radius = 5, strength = 1, affects = 'all') {
    if (!FIELD_TYPES[type] || this.fields.length >= LIMITS.fields) {
      this.log('Field limit reached (20).');
      return null;
    }
    const p = clearPoint(x, z, 0.5),
      f = {
        id: this.id('F'),
        type,
        ...p,
        r: clamp(+radius, 2, 10),
        strength: clamp(+strength, 0.25, 3),
        affects,
        enabled: true,
      };
    this.fields.push(f);
    this.log(`${FIELD_TYPES[type].label} placed.`);
    return f;
  }
  addSquad(team = 'blue', count = 20, role = 'scout', x = team === 'blue' ? -19 : 19, z = 0) {
    count = Math.min(clamp(Math.round(+count) || 20, 4, 60), LIMITS.agents - this.agents.length);
    if (this.squads.length >= LIMITS.squads || count < 1) {
      this.log('Squad or drone limit reached. Remove a squad first.');
      return null;
    }
    const s = {
      id: this.id('S'),
      name: ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'][
        this.squads.length
      ],
      team,
      role,
      formation: 'wedge',
      play: 'move',
      sensor: 'radar',
      target: this.targets[0]?.id || '',
      escort: '',
      spacing: 1.4,
      adaptive: true,
      avoidFields: true,
      aware: new Set(),
      anchor: clearPoint(x, z),
      home: clearPoint(x, z),
      route: 0,
      rethink: 0,
      state: 'Moving',
      retreating: false,
      rules: [],
      cues: [],
      timeline: false,
      timelineTime: 0,
      timelineLoop: true,
      timelineLength: 30,
      spin: 0,
      heading: 0,
      lastReaction: 'No reaction yet',
      ruleElapsed: 0,
    };
    this.squads.push(s);
    for (let i = 0; i < count; i++) {
      const p = clearPoint(x + (this.random() - 0.5) * 9, z + (this.random() - 0.5) * 9);
      this.agents.push({
        id: this.id('D'),
        squad: s.id,
        x: p.x,
        z: p.z,
        vx: 0,
        vz: 0,
        hp: 100,
        alive: true,
        jam: 0,
        stun: 0,
        marked: 0,
        cooldown: this.random(),
        state: 'Moving',
        kills: 0,
      });
    }
    this.result = '';
    this.log(`${s.name}: ${count} ${team} drones deployed.`);
    return s;
  }
  removeSquad(id) {
    this.squads = this.squads.filter((s) => s.id !== id);
    this.agents = this.agents.filter((a) => a.squad !== id);
    for (const s of this.squads) if (s.escort === id) s.escort = '';
    this.result = '';
  }
  removeTarget(id) {
    this.targets = this.targets.filter((t) => t.id !== id);
    for (const s of this.squads) {
      if (s.target === id) s.target = this.targets[0]?.id || '';
      s.route = 0;
    }
  }
  removeField(id) {
    this.fields = this.fields.filter((f) => f.id !== id);
    for (const s of this.squads) s.aware.delete(id);
  }
  members(s, alive = true) {
    return this.agents.filter((a) => a.squad === s.id && (!alive || a.alive));
  }
  applies(f, s) {
    return f.enabled && (f.affects === 'all' || f.affects === s.team);
  }
  visible(sensor, a, b, range) {
    if (dist(a, b) > range) return false;
    if (sensor === 'optical') return hasLineOfSight(a, b);
    if (sensor === 'thermal')
      return Math.hypot(b.vx || 0, b.vz || 0) > 0.8 || dist(a, b) < range * 0.5;
    if (sensor === 'acoustic') return Math.hypot(b.vx || 0, b.vz || 0) > 1.3;
    if (sensor === 'rf') return (b.jam || 0) < 0.6;
    return true;
  }
  canSense(a, b, s) {
    return this.visible(
      s.sensor,
      a,
      b,
      SENSORS[s.sensor].range * ROLES[s.role].range * (a.jam > 0.3 ? 0.45 : 1),
    );
  }
  kill(a, cause) {
    if (!a.alive) return;
    a.hp = 0;
    a.alive = false;
    a.vx = 0;
    a.vz = 0;
    a.state = 'Disabled';
    this.log(`${this.squads.find((s) => s.id === a.squad)?.name} lost a drone: ${cause}.`);
  }
  reset() {
    this.time = 0;
    this.contacts = 0;
    this.shots = [];
    this.events = [];
    this.result = '';
    for (const s of this.squads) {
      s.anchor = { ...s.home };
      s.aware.clear();
      s.route = 0;
      s.rethink = 0;
      s.retreating = false;
      s.state = 'Moving';
      s.timelineTime = 0;
      s.overrideUntil = 0;
      s.ruleElapsed = 0;
      s.lastReaction = 'No reaction yet';
      for (const rule of s.rules) {
        rule.wasTrue = false;
        rule.last = -Infinity;
      }
    }
    for (const a of this.agents) {
      const s = this.squads.find((s) => s.id === a.squad),
        p = clearPoint(s.home.x + (this.random() - 0.5) * 8, s.home.z + (this.random() - 0.5) * 8);
      Object.assign(a, p, {
        vx: 0,
        vz: 0,
        hp: 100,
        alive: true,
        jam: 0,
        stun: 0,
        marked: 0,
        cooldown: 0,
        kills: 0,
        state: 'Moving',
      });
    }
    this.log('Swarm reset. Fields, targets and orders kept.');
  }
  scenario(name) {
    this.squads = [];
    this.agents = [];
    this.fields = [];
    this.targets = [];
    this.events = [];
    this.shots = [];
    this.time = 0;
    this.contacts = 0;
    this.result = '';
    this.combat = name === 'skirmish';
    this.params = { ...DEFAULTS };
    const a = this.addTarget(-14, 14),
      b = this.addTarget(15, -15),
      c = this.addTarget(16, 15);
    const blue = this.addSquad('blue', 24, 'scout', -20, -13);
    blue.target = c.id;
    blue.formation = 'wedge';
    const guard = this.addSquad('blue', 20, 'guard', -19, 4);
    guard.target = a.id;
    guard.formation = 'ring';
    guard.play = 'hold';
    if (name === 'hazards') {
      blue.play = 'patrol';
      blue.rules = [
        { when: 'jammed', then: 'evade', threshold: 40, cooldown: 4, enabled: true },
        { when: 'hurt', then: 'retreat', threshold: 40, cooldown: 4, enabled: true },
      ];
      guard.role = 'relay';
      guard.play = 'escort';
      guard.escort = blue.id;
      this.addField('radar', 0, 0, 8, 1, 'blue');
      this.addField('jammer', 14, 0, 6, 1, 'blue');
      this.addField('kill', -16, 13, 4, 1, 'blue');
      this.addField('repair', -20, -12, 4, 1, 'blue');
    } else if (name === 'skirmish') {
      const clash = this.addTarget(0, 0);
      blue.role = 'striker';
      blue.play = 'pincer';
      blue.target = clash.id;
      guard.role = 'medic';
      guard.play = 'escort';
      guard.escort = blue.id;
      const red = this.addSquad('red', 24, 'striker', 20, 11);
      red.play = 'attack';
      red.target = clash.id;
      const jam = this.addSquad('red', 12, 'jammer', 18, -3);
      jam.play = 'escort';
      jam.escort = red.id;
      this.addField('jammer', 0, 17, 4, 0.7, 'all');
      this.addField('repair', -21, -13, 4, 0.8, 'blue');
      this.addField('repair', 21, 13, 4, 0.8, 'red');
    }
    this.events = [];
    this.log(
      name === 'sandbox'
        ? 'Sandbox ready. Add fields or deploy an opposing squad.'
        : name === 'hazards'
          ? 'Hazard course: scouts patrol; relays support.'
          : 'Skirmish running: blue versus red. Tag combat is on.',
    );
  }
  applyReaction(s, action) {
    if (action === 'evade') {
      s.formation = 'swarm';
      s.avoidFields = true;
      s.adaptive = true;
    } else if (action === 'regroup') {
      s.formation = 'grid';
      s.play = 'move';
    } else if (['retreat', 'attack', 'patrol', 'orbit', 'hold'].includes(action)) s.play = action;
  }
  runScripts(s, members, dt) {
    if (s.timeline && s.cues.length) {
      s.timelineTime += dt;
      if (s.timelineTime > s.timelineLength) {
        if (s.timelineLoop) s.timelineTime %= s.timelineLength;
        else {
          s.timelineTime = s.timelineLength;
          s.timeline = false;
        }
      }
      if (this.time >= (s.overrideUntil || 0)) this.applyTimeline(s);
    }
    s.heading += s.spin * dt;
    s.ruleElapsed += dt;
    if (s.ruleElapsed < 0.25) return;
    s.ruleElapsed = 0;
    const health = members.reduce((n, a) => n + a.hp, 0) / members.length;
    const conditions = {
      jammed: members.some((a) => a.jam > 0.3),
      detected: members.some((a) => a.marked > 0),
      danger: this.fields.some(
        (f) =>
          hostile.has(f.type) &&
          this.applies(f, s) &&
          s.aware.has(f.id) &&
          members.some((a) => dist(a, f) < f.r + 3),
      ),
      enemy: this.agents.some(
        (e) =>
          e.alive &&
          this.squads.find((q) => q.id === e.squad)?.team !== s.team &&
          members.some((a) => this.canSense(a, e, s)),
      ),
    };
    // Ordered rules: first newly true condition wins. Rearm after the condition clears.
    let fired = false;
    for (const rule of s.rules) {
      const active = rule.when === 'hurt' ? health < (rule.threshold ?? 40) : conditions[rule.when];
      if (
        rule.enabled !== false &&
        active &&
        !rule.wasTrue &&
        !fired &&
        this.time - (rule.last ?? -Infinity) >= (rule.cooldown ?? 4)
      ) {
        this.applyReaction(s, rule.then);
        s.overrideUntil = this.time + Math.max(2, rule.cooldown ?? 4);
        rule.last = this.time;
        fired = true;
        s.lastReaction = `${CONDITIONS[rule.when]} → ${REACTIONS[rule.then]}`;
        this.log(`${s.name}: ${s.lastReaction}.`);
      }
      rule.wasTrue = active;
    }
  }
  applyTimeline(s) {
    const cues = [...s.cues].sort((a, b) => a.at - b.at);
    let current = cues[0],
      next = null;
    for (let i = 0; i < cues.length; i++) {
      if (cues[i].at <= s.timelineTime) {
        current = cues[i];
        next = cues[i + 1] || null;
      }
    }
    if (!current || s.timelineTime < current.at) return;
    s.formation = current.formation;
    s.play = current.play;
    const t = next ? clamp((s.timelineTime - current.at) / (next.at - current.at || 1), 0, 1) : 0;
    s.spacing = current.spacing + (next ? next.spacing - current.spacing : 0) * t;
    s.spin = current.spin + (next ? next.spin - current.spin : 0) * t;
  }
  step(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.05);
    this.time += dt;
    this.shots = this.shots.filter((s) => this.time - s.time < 0.15);
    const squadMap = new Map(this.squads.map((s) => [s.id, s])),
      live = this.agents.filter((a) => a.alive);
    const groups = new Map(this.squads.map((s) => [s.id, live.filter((a) => a.squad === s.id)]));
    for (const a of live) {
      a.jam = Math.max(0, a.jam - dt);
      a.stun = Math.max(0, a.stun - dt);
      a.marked = Math.max(0, a.marked - dt);
      a.cooldown = Math.max(0, a.cooldown - dt);
    }
    // Support radii are game abilities. They do not model real radio or weapons.
    const relays = live.filter((a) => squadMap.get(a.squad).role === 'relay'),
      medics = live.filter((a) => squadMap.get(a.squad).role === 'medic');
    for (const a of live) {
      const s = squadMap.get(a.squad);
      a.linked = relays.some((r) => squadMap.get(r.squad).team === s.team && dist(a, r) < 7);
      if (medics.some((m) => m !== a && squadMap.get(m.squad).team === s.team && dist(a, m) < 5))
        a.hp = Math.min(100, a.hp + 8 * dt);
      if (
        this.combat &&
        live.some(
          (j) =>
            squadMap.get(j.squad).role === 'jammer' &&
            squadMap.get(j.squad).team !== s.team &&
            dist(a, j) < 6,
        )
      )
        a.jam = Math.max(a.jam, a.linked ? 0.2 : 0.65);
      for (const f of this.fields) {
        if (!this.applies(f, s)) continue;
        if (dist(a, f) < f.r + SENSORS[s.sensor].range * ROLES[s.role].range) {
          // All fields have an emitter that can be discovered; optical discovery requires sight.
          if (s.sensor !== 'optical' || hasLineOfSight(a, f)) s.aware.add(f.id);
        }
        if (dist(a, f) > f.r) continue;
        if (detectors.has(f.type) && this.visible(f.type, f, a, f.r))
          a.marked = Math.max(a.marked, 1.5);
        if (f.type === 'jammer') a.jam = Math.max(a.jam, (a.linked ? 0.2 : 0.9) * f.strength);
        if (f.type === 'emp' && this.time % 4 < 2) a.stun = 0.3 * f.strength;
        if (f.type === 'kill') this.kill(a, 'elimination zone');
        if (f.type === 'damage') {
          a.hp -= 20 * f.strength * dt;
          if (a.hp <= 0) this.kill(a, 'damage zone');
        }
        if (f.type === 'repair' && a.alive) a.hp = Math.min(100, a.hp + 18 * f.strength * dt);
      }
    }
    const pendingDamage = new Map();
    for (const s of this.squads) {
      const members = groups.get(s.id).filter((a) => a.alive);
      if (!members.length) {
        s.state = 'Disabled';
        continue;
      }
      const center = {
        x: members.reduce((v, a) => v + a.x, 0) / members.length,
        z: members.reduce((v, a) => v + a.z, 0) / members.length,
      };
      this.runScripts(s, members, dt);
      const health = members.reduce((v, a) => v + a.hp, 0) / members.length;
      const jammed = members.filter((a) => a.jam > 0.3).length;
      if (!s.adaptive) s.retreating = false;
      else if (health < 32) s.retreating = true;
      else if (health > 70) s.retreating = false;
      let goal = this.targets.find((t) => t.id === s.target) || s.home;
      if (s.play === 'patrol' && this.targets.length) {
        goal = this.targets[s.route % this.targets.length];
        if (dist(center, goal) < 5) {
          s.route = (s.route + 1) % this.targets.length;
          goal = this.targets[s.route];
        }
      }
      if (s.play === 'escort') {
        const leader = this.squads.find(
          (t) => t.id === s.escort && t.id !== s.id && t.team === s.team,
        );
        if (leader) goal = leader.anchor;
      }
      if (s.play === 'hold') goal = s.home;
      if (s.play === 'retreat' || s.retreating) {
        goal = s.home;
        const repair = this.fields.find((f) => f.type === 'repair' && this.applies(f, s));
        if (repair) goal = repair;
      }
      const rivals = live.filter((a) => a.alive && squadMap.get(a.squad).team !== s.team);
      const known = rivals.filter((e) => members.some((a) => this.canSense(a, e, s)));
      let enemy = null;
      let closest = Infinity;
      for (const e of known) {
        const d = dist(center, e);
        if (d < closest) {
          enemy = e;
          closest = d;
        }
      }
      if (enemy && this.combat && (s.play === 'attack' || s.play === 'pincer') && !s.retreating)
        goal = enemy;
      const danger = this.fields.find(
        (f) =>
          hostile.has(f.type) &&
          this.applies(f, s) &&
          s.aware.has(f.id) &&
          members.some((a) => dist(a, f) < f.r + 3),
      );
      s.state = s.retreating
        ? 'Retreating'
        : jammed > members.length / 3
          ? 'Link disrupted'
          : danger && s.avoidFields
            ? 'Avoiding zone'
            : enemy && this.combat && ROLES[s.role].damage
              ? 'Engaging'
              : s.play === 'patrol'
                ? 'Patrolling'
                : s.play === 'hold'
                  ? 'Holding'
                  : s.play === 'escort'
                    ? 'Escorting'
                    : 'Moving';
      const n = unit(goal.x - s.anchor.x, goal.z - s.anchor.z),
        ad = dist(goal, s.anchor),
        anchorSpeed = jammed > members.length / 2 ? 1 : 3.6;
      s.anchor.x += n.x * Math.min(ad, anchorSpeed * dt);
      s.anchor.z += n.z * Math.min(ad, anchorSpeed * dt);
      for (let i = 0; i < members.length; i++) {
        const a = members[i],
          role = ROLES[s.role];
        a.state = a.stun ? 'Stunned' : a.jam > 0.3 ? 'Jammed' : a.marked ? 'Detected' : s.state;
        if (a.stun > 0) {
          a.vx = 0;
          a.vz = 0;
          continue;
        }
        const formation = s.adaptive && danger ? 'swarm' : s.formation;
        const spacing = s.spacing * (s.adaptive && danger ? 1.3 : 1);
        let offset = formationOffset(formation, i, members.length, spacing, this.time);
        const ox = offset.x;
        offset.x = ox * Math.cos(s.heading) - offset.z * Math.sin(s.heading);
        offset.z = ox * Math.sin(s.heading) + offset.z * Math.cos(s.heading);
        // Keep long formations inside the arena while preserving their relative shape.
        const extent = Math.hypot(offset.x, offset.z);
        if (extent > 10) {
          offset.x *= 10 / extent;
          offset.z *= 10 / extent;
        }
        let destination = { x: s.anchor.x + offset.x, z: s.anchor.z + offset.z };
        if (s.play === 'orbit') {
          const angle = this.time * 0.3 + (i / members.length) * Math.PI * 2;
          destination = { x: goal.x + Math.cos(angle) * 6, z: goal.z + Math.sin(angle) * 6 };
        }
        if (s.play === 'pincer' && enemy) {
          destination = { x: goal.x + (i % 2 ? 1 : -1) * 5, z: goal.z + Math.sin(i) * 3 };
        }
        if (a.jam > 0.3 && !a.linked) destination = { x: a.x + a.vx * 0.5, z: a.z + a.vz * 0.5 };
        destination = clearPoint(destination.x, destination.z);
        let fx = (destination.x - a.x) * this.params.attraction * 0.35 * this.params.formation;
        let fz = (destination.z - a.z) * this.params.attraction * 0.35 * this.params.formation;
        const toward = unit(goal.x - a.x, goal.z - a.z),
          distance = dist(a, goal);
        fx += (-toward.z * this.params.vortex) / (1 + distance * 0.12) + this.params.wind;
        fz += (toward.x * this.params.vortex) / (1 + distance * 0.12);
        let nearby = 0,
          avx = 0,
          avz = 0,
          cx = 0,
          cz = 0;
        for (const b of live) {
          if (!b.alive || b === a) continue;
          const d = dist(a, b);
          if (d < 2.2 && d > 0.001) {
            const away = unit(a.x - b.x, a.z - b.z),
              k = this.params.separation * (1 - d / 2.2);
            fx += away.x * k;
            fz += away.z * k;
          }
          if (b.squad === a.squad && d < 7) {
            nearby++;
            avx += b.vx;
            avz += b.vz;
            cx += b.x;
            cz += b.z;
          }
        }
        if (nearby) {
          fx +=
            (avx / nearby - a.vx) * this.params.alignment +
            (cx / nearby - a.x) * this.params.cohesion * 0.12;
          fz +=
            (avz / nearby - a.vz) * this.params.alignment +
            (cz / nearby - a.z) * this.params.cohesion * 0.12;
        }
        for (const o of OBSTACLES) {
          const d = dist(a, o),
            reach = o.r + 4;
          if (d < reach) {
            const away = unit(a.x - o.x, a.z - o.z),
              k = this.params.avoid * (1 - d / reach) * 2;
            fx += away.x * k;
            fz += away.z * k;
          }
        }
        let speed = role.speed * (a.jam > 0.3 ? 0.45 : 1);
        for (const f of this.fields) {
          if (!this.applies(f, s)) continue;
          const d = dist(a, f),
            away = unit(a.x - f.x || 0.01, a.z - f.z);
          if (d < f.r) {
            const k = f.strength * 4 * (1 - d / f.r);
            if (f.type === 'attract') {
              fx -= away.x * k;
              fz -= away.z * k;
            }
            if (f.type === 'repel') {
              fx += away.x * k;
              fz += away.z * k;
            }
            if (f.type === 'vortex') {
              fx -= away.z * k;
              fz += away.x * k;
            }
            if (f.type === 'slow') speed *= 0.35;
          }
          if (
            s.avoidFields &&
            s.aware.has(f.id) &&
            (hostile.has(f.type) || (s.adaptive && detectors.has(f.type)))
          ) {
            const lookahead = { x: a.x + a.vx * 0.7, z: a.z + a.vz * 0.7 },
              pd = dist(lookahead, f),
              reach = f.r + (s.adaptive ? 4 : 2);
            if (Math.min(d, pd) < reach) {
              const k =
                this.params.hazard *
                (1 - clamp((Math.min(d, pd) - f.r) / (reach - f.r), 0, 1)) *
                (s.adaptive ? 1.5 : 1);
              fx += away.x * k;
              fz += away.z * k;
              // Consistent tangent detour prevents symmetric head-on stalls.
              const sign = s.id.charCodeAt(s.id.length - 1) % 2 ? 1 : -1;
              fx += -away.z * k * 0.7 * sign;
              fz += away.x * k * 0.7 * sign;
            }
          }
        }
        if (s.adaptive && s.sensor === 'acoustic' && a.marked) speed *= 0.6;
        if (s.retreating) speed *= 1.1;
        a.vx = (a.vx + clamp(fx, -35, 35) * dt) * Math.exp(-this.params.damping * dt);
        a.vz = (a.vz + clamp(fz, -35, 35) * dt) * Math.exp(-this.params.damping * dt);
        const v = Math.hypot(a.vx, a.vz);
        if (v > speed) {
          a.vx *= speed / v;
          a.vz *= speed / v;
        }
        a.x += a.vx * dt;
        a.z += a.vz * dt;
        const r = Math.hypot(a.x, a.z);
        if (r > 28.8) {
          a.x *= 28.8 / r;
          a.z *= 28.8 / r;
          a.vx *= -0.3;
          a.vz *= -0.3;
        }
        for (const o of OBSTACLES) {
          const d = dist(a, o);
          if (d < o.r + 0.3) {
            this.contacts++;
            const away = unit(a.x - o.x || 0.01, a.z - o.z);
            a.x = o.x + away.x * (o.r + 0.35);
            a.z = o.z + away.z * (o.r + 0.35);
            a.vx += away.x;
            a.vz += away.z;
          }
        }
        if (this.combat && role.damage && a.cooldown <= 0 && a.jam < 0.5 && !s.retreating) {
          let foe = null,
            best = 7;
          for (const e of rivals) {
            const d = dist(a, e);
            if (e.alive && d < best && this.canSense(a, e, s) && hasLineOfSight(a, e)) {
              foe = e;
              best = d;
            }
          }
          if (foe) {
            pendingDamage.set(foe, (pendingDamage.get(foe) || 0) + role.damage);
            a.cooldown = 0.65;
            this.shots.push({
              x: a.x,
              z: a.z,
              tx: foe.x,
              tz: foe.z,
              team: s.team,
              time: this.time,
            });
          }
        }
      }
    }
    for (const [a, damage] of pendingDamage) {
      a.hp -= damage;
      if (a.hp <= 0) this.kill(a, 'tag combat');
    }
    if (this.combat && !this.result) {
      const teams = new Set(this.squads.map((s) => s.team));
      if (teams.size > 1) {
        const blue = this.agents.filter(
            (a) => a.alive && squadMap.get(a.squad).team === 'blue',
          ).length,
          red = this.agents.filter((a) => a.alive && squadMap.get(a.squad).team === 'red').length;
        if (!blue || !red) {
          this.result = !blue && !red ? 'Draw' : blue ? 'Blue wins' : 'Red wins';
          this.log(this.result + '. Reset swarm to replay.');
        }
      }
    }
  }
  summary() {
    const live = this.agents.filter((a) => a.alive);
    return {
      active: live.length,
      total: this.agents.length,
      down: this.agents.length - live.length,
      jammed: live.filter((a) => a.jam > 0.3).length,
      detected: live.filter((a) => a.marked > 0).length,
      speed: live.reduce((v, a) => v + Math.hypot(a.vx, a.vz), 0) / (live.length || 1),
      contacts: this.contacts,
      result: this.result,
    };
  }
}

export function validateScript(data) {
  if (!data || !Array.isArray(data.rules) || !Array.isArray(data.cues))
    throw new Error('Include rules and cues arrays.');
  if (data.rules.length > 12 || data.cues.length > 12)
    throw new Error('Use at most 12 rules and 12 timeline cues.');
  const number = (v, min, max, label) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max)
      throw new Error(`${label} must be ${min}–${max}.`);
    return v;
  };
  const rules = data.rules.map((r) => {
    if (!CONDITIONS[r.when] || !REACTIONS[r.then])
      throw new Error('Unknown reaction condition or action.');
    return {
      when: r.when,
      then: r.then,
      threshold: number(r.threshold ?? 40, 1, 100, 'Health threshold'),
      cooldown: number(r.cooldown ?? 4, 0, 60, 'Cooldown'),
      enabled: r.enabled !== false,
    };
  });
  const cues = data.cues
    .map((c) => {
      if (!FORMATIONS.includes(c.formation) || !PLAYS.includes(c.play))
        throw new Error('Unknown formation or play.');
      return {
        at: number(c.at, 0, 60, 'Cue time'),
        formation: c.formation,
        play: c.play,
        spacing: number(c.spacing ?? 1.4, 0.6, 3, 'Spacing'),
        spin: number(c.spin ?? 0, -2, 2, 'Spin'),
      };
    })
    .sort((a, b) => a.at - b.at);
  if (new Set(cues.map((c) => c.at)).size !== cues.length)
    throw new Error('Each cue needs a different start time.');
  return { rules, cues };
}
