import assert from 'node:assert/strict';
import {
  SwarmLab,
  DEFAULTS,
  FIELD_TYPES,
  FORMATIONS,
  LIMITS,
  formationOffset,
  hasLineOfSight,
  validateScript,
} from './dist/labs/vector-field/simulation.js';
let seed = 43;
const random = () => (seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296;
function isolated() {
  const m = new SwarmLab(random);
  m.squads = [];
  m.agents = [];
  m.targets = [];
  m.fields = [];
  m.events = [];
  m.time = 0;
  m.combat = false;
  m.params = {
    ...DEFAULTS,
    attraction: 0,
    formation: 0,
    vortex: 0,
    separation: 0,
    wind: 0,
    alignment: 0,
    cohesion: 0,
    hazard: 0,
    avoid: 0,
  };
  const s = m.addSquad('blue', 4, 'scout', 0, 0);
  s.adaptive = false;
  s.avoidFields = false;
  for (const a of m.agents) Object.assign(a, { x: 0, z: 0, vx: 0, vz: 0 });
  return [m, s];
}
const advance = (m, seconds) => {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) m.step(1 / 60);
};
for (const type of Object.keys(FIELD_TYPES)) {
  const [m] = isolated();
  m.addField(type, 0, 0, 5, 1);
  advance(m, 0.5);
  for (const a of m.agents) assert(Number.isFinite(a.x) && Number.isFinite(a.hp), type);
  if (type === 'kill') assert.equal(m.summary().down, 4);
  if (type === 'damage') assert(m.agents[0].hp < 95);
  if (type === 'jammer') assert(m.summary().jammed === 4);
  if (type === 'emp') assert(m.agents[0].stun > 0);
  if (type === 'radar') assert(m.summary().detected === 4);
}
{
  const [m] = isolated();
  m.addField('kill', 0, 0, 5, 1, 'red');
  advance(m, 0.3);
  assert.equal(m.summary().down, 0);
  m.fields[0].affects = 'blue';
  m.fields[0].enabled = false;
  advance(m, 0.3);
  assert.equal(m.summary().down, 0);
  m.fields[0].enabled = true;
  advance(m, 0.1);
  assert.equal(m.summary().down, 4);
  m.reset();
  assert.equal(m.summary().active, 4);
}
assert.equal(hasLineOfSight({ x: -14, z: -5 }, { x: -4, z: -5 }), false);
{
  const [m, s] = isolated(),
    a = m.agents[0],
    b = { x: 2, z: 0, vx: 0, vz: 0, jam: 0 };
  assert(m.canSense(a, b, s));
  s.sensor = 'acoustic';
  assert(!m.canSense(a, b, s));
  b.vx = 3;
  assert(m.canSense(a, b, s));
  s.sensor = 'rf';
  b.jam = 1;
  assert(!m.canSense(a, b, s));
}
{
  const [m, s] = isolated();
  m.addField('damage', 0, 0, 5, 1);
  s.avoidFields = true;
  s.adaptive = true;
  m.params.hazard = 15;
  advance(m, 1);
  assert(s.aware.size > 0);
  assert(Math.hypot(m.agents[0].vx, m.agents[0].vz) > 0, 'Avoidance produces motion');
}
{
  const [m, s] = isolated();
  s.role = 'striker';
  s.adaptive = false;
  const red = m.addSquad('red', 4, 'striker', 3, 0);
  red.adaptive = false;
  red.avoidFields = false;
  for (const a of m.members(red)) Object.assign(a, { x: 3, z: 0, vx: 0, vz: 0 });
  advance(m, 1);
  assert(m.agents.every((a) => a.hp === 100));
  m.combat = true;
  advance(m, 0.8);
  assert(m.agents.some((a) => a.hp < 100));
  assert(m.events.some((e) => e.text.includes('tag combat')) || m.shots.length > 0);
}
{
  const [m, s] = isolated();
  m.agents[0].hp = 30;
  const medic = m.addSquad('blue', 4, 'medic', 0, 0);
  for (const a of m.members(medic)) Object.assign(a, { x: 1, z: 0 });
  advance(m, 0.5);
  assert(m.agents[0].hp > 30);
  m.addField('jammer', 0, 0, 5, 1);
  s.role = 'relay';
  advance(m, 0.2);
  assert(m.agents[0].jam < 0.3, 'Relay mitigates jamming');
}
for (const formation of FORMATIONS)
  for (let i = 0; i < 60; i++) {
    const p = formationOffset(formation, i, 60);
    assert(Number.isFinite(p.x) && Number.isFinite(p.z));
  }
{
  const [m, s] = isolated();
  s.cues = [
    { at: 0, formation: 'ring', play: 'move', spacing: 1, spin: 0 },
    { at: 10, formation: 'wedge', play: 'patrol', spacing: 2, spin: 1 },
  ];
  s.timelineTime = 5;
  m.applyTimeline(s);
  assert.equal(s.formation, 'ring');
  assert.equal(s.spacing, 1.5);
  assert.equal(s.spin, 0.5);
  s.timelineTime = 10;
  m.applyTimeline(s);
  assert.equal(s.formation, 'wedge');
  s.rules = [{ when: 'jammed', then: 'evade', threshold: 40, cooldown: 4, enabled: true }];
  m.addField('jammer', 0, 0, 5, 1);
  s.timeline = true;
  s.timelineTime = 0;
  advance(m, 0.6);
  assert.equal(s.formation, 'swarm');
  assert(s.lastReaction.includes('Jamming'));
  const events = m.events.length;
  advance(m, 0.5);
  assert.equal(m.events.length, events, 'Continuous condition does not spam reactions');
  m.reset();
  assert.equal(s.timelineTime, 0);
  assert.equal(s.rules[0].wasTrue, false);
}
assert.throws(() => validateScript({ rules: [{ when: 'eval', then: 'attack' }], cues: [] }));
assert.throws(() =>
  validateScript({
    rules: [],
    cues: [{ at: 0, formation: 'line', play: 'move', spacing: Infinity }],
  }),
);
assert.throws(() =>
  validateScript({
    rules: [],
    cues: [
      { at: 0, formation: 'line', play: 'move' },
      { at: 0, formation: 'ring', play: 'move' },
    ],
  }),
);
{
  const m = new SwarmLab(random);
  m.scenario('skirmish');
  advance(m, 45);
  assert(m.summary().down > 0, 'Demo produces actual combat');
  assert(m.agents.every((a) => Number.isFinite(a.x) && Math.hypot(a.x, a.z) < 30));
  while (m.squads.length < LIMITS.squads && m.agents.length < LIMITS.agents)
    m.addSquad('blue', 60, 'scout');
  assert(m.agents.length <= LIMITS.agents);
  const n = m.agents.length;
  m.addSquad('red', 60);
  assert.equal(m.agents.length, n);
  m.removeSquad(m.squads[0].id);
  assert(m.agents.length < n);
}
console.log(
  'PASS: sensor effects, teams/enabled filters, line of sight, detection modes, avoidance, combat gating, medic/relay roles, formations, timeline interpolation, reaction priority/rearming, script validation, limits, and 45-second battle.',
);
