// Regression gate for the RTS working model (dist/rts). Pure Node, no browser needed.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { World, formationOffset } from './dist/rts/sim/world.js';
import { Session, runReplay } from './dist/rts/sim/lockstep.js';
import { dsin, dcos, Rng } from './dist/rts/sim/dmath.js';
import { validateRules, explainRule, CONDITIONS, ACTIONS, runRules } from './dist/rts/sim/rules.js';
import { ROLES, STRUCTURES, FORMATIONS, ROLE_INDEX } from './dist/rts/sim/defs.js';
import { MAPS } from './dist/rts/sim/maps.js';

let passed = 0;
const test = (name, fn) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};
console.log('RTS working model');

test('sim sources use only deterministic math', () => {
  const dir = new URL('./dist/rts/sim/', import.meta.url);
  for (const f of readdirSync(dir)) {
    const src = readFileSync(new URL(f, dir), 'utf8').replace(/\/\/.*$/gm, '');
    const banned =
      /Math\.(random|sin|cos|tan|atan2?|hypot|pow|exp|log|cbrt)\b|Date\.now|performance\.now/.exec(
        src,
      );
    assert.equal(banned, null, `${f} uses ${banned?.[0]}`);
  }
});

test('deterministic trig matches Math within 1e-8', () => {
  for (let x = -20; x <= 20; x += 0.0137) {
    assert.ok(Math.abs(dsin(x) - Math.sin(x)) < 1e-8, `sin ${x}`);
    assert.ok(Math.abs(dcos(x) - Math.cos(x)) < 1e-8, `cos ${x}`);
  }
});

test('seeded RNG is reproducible', () => {
  const a = new Rng(42),
    b = new Rng(42);
  for (let k = 0; k < 1000; k++) assert.equal(a.next(), b.next());
  assert.notEqual(new Rng(1).next(), new Rng(2).next());
});

test('maps are point-symmetric and wells are reachable', () => {
  for (const m of Object.values(MAPS)) {
    const has = (list, p) =>
      list.some((q) => Math.abs(q.x + p.x) < 1e-9 && Math.abs(q.z + p.z) < 1e-9);
    for (const w of m.wells) assert.ok(has(m.wells, w), `well ${w.x},${w.z} has no twin`);
    for (const o of m.obstacles)
      assert.ok(has(m.obstacles, o), `obstacle ${o.x},${o.z} has no twin`);
    for (const w of m.wells)
      for (const o of m.obstacles)
        assert.ok(Math.hypot(w.x - o.x, w.z - o.z) > o.r + 3, 'well inside rock');
  }
});

test('formations produce distinct slots for 1–400 drones', () => {
  for (const f of FORMATIONS)
    for (const n of [1, 2, 7, 60, 400]) {
      const seen = new Set();
      for (let i = 0; i < n; i++) {
        const [x, z] = formationOffset(f, i, n, 2.4, 0.3);
        assert.ok(Number.isFinite(x) && Number.isFinite(z));
        seen.add(`${x.toFixed(3)},${z.toFixed(3)}`);
      }
      assert.equal(seen.size, n, `${f} ${n}`);
    }
});

test('new world: cores, starting squads, bandwidth and income', () => {
  const w = new World({ seed: 3 });
  for (const t of [0, 1]) {
    const s = w.stats(t);
    assert.equal(s.structures.core, 1);
    assert.equal(
      s.roles.reduce((a, b) => a + b, 0),
      10,
    );
    assert.equal(s.bwCap, STRUCTURES.core.bandwidth);
    assert.equal(s.income, STRUCTURES.core.income);
  }
});

test('placement rules: power grid, wells, terrain, energy', () => {
  const w = new World({ seed: 1 });
  const well = w.wells.find((x) => Math.hypot(x.x + 44, x.z - 56) < 1);
  assert.equal(w.canPlace(0, 'extractor', well.x + 1, well.z).ok, true);
  assert.equal(w.canPlace(0, 'extractor', -50, 40).reason, 'Must be placed on an energy well');
  assert.equal(w.canPlace(0, 'relay', 10, 10).reason, 'Outside your power grid');
  assert.equal(w.canPlace(1, 'relay', -50, 50).reason, 'Outside your power grid');
  assert.equal(w.canPlace(0, 'relay', well.x, well.z).reason, 'Keep energy wells clear');
  w.teams[0].energy = 10;
  assert.equal(w.canPlace(0, 'relay', -50, 46).reason, 'Not enough energy');
});

test('build, construct and earn from an extractor', () => {
  const w = new World({ seed: 1 });
  const well = w.wells.find((x) => Math.hypot(x.x + 44, x.z - 56) < 1);
  w.step([{ type: 'build', team: 0, kind: 'extractor', x: well.x, z: well.z }]);
  const s = w.structures.find((x) => x.kind === 'extractor');
  assert.ok(s && s.progress < 1);
  assert.equal(w.teams[0].energy < 250, true);
  for (let k = 0; k < STRUCTURES.extractor.build * 20 + 2; k++) w.step();
  assert.equal(s.progress, 1);
  assert.equal(w.teams[0].income, STRUCTURES.core.income + STRUCTURES.extractor.income);
  assert.equal(w.canPlace(0, 'extractor', well.x, well.z).reason, 'Well already claimed');
});

test('production spends energy, reserves bandwidth and spawns a pack', () => {
  const w = new World({ seed: 1 });
  const r = ROLES[ROLE_INDEX.interceptor];
  const e0 = w.teams[0].energy,
    bw0 = w.teams[0].bwUsed;
  w.step([{ type: 'produce', team: 0, role: 'interceptor' }]);
  assert.equal(w.teams[0].energy, e0 - r.cost * r.pack + w.teams[0].income / 20);
  assert.equal(w.teams[0].bwUsed, bw0 + r.bw * r.pack);
  for (let k = 0; k < r.build * 20 + 2; k++) w.step();
  assert.equal(w.stats(0).roles[ROLE_INDEX.interceptor], 4 + r.pack);
  w.teams[0].energy = 1e6;
  let ok = 0;
  for (let k = 0; k < 40; k++) ok += w.apply({ type: 'produce', team: 0, role: 'assault' }) ? 1 : 0;
  assert.ok(w.teams[0].bwUsed <= w.teams[0].bwCap, 'bandwidth cap respected');
  assert.ok(ok < 40);
});

test('orders regroup selected drones into one squad and are team-checked', () => {
  const w = new World({ seed: 1 });
  const mine = [],
    theirs = [];
  for (let i = 0; i < w.count; i++) (w.team[i] === 0 ? mine : theirs).push(w.uid[i]);
  assert.equal(w.apply({ type: 'order', team: 0, uids: theirs, play: 'move', x: 0, z: 0 }), false);
  assert.equal(
    w.apply({ type: 'order', team: 0, uids: mine.slice(0, 4), play: 'attack', x: 0, z: 0 }),
    true,
  );
  const squads = w.squads.filter((s) => s.team === 0);
  assert.equal(squads.length, 2);
  assert.deepEqual(squads.map((s) => s.members.length).sort(), [4, 6]);
  assert.equal(
    w.apply({ type: 'order', team: 0, uids: mine, play: 'nonsense', x: 0, z: 0 }),
    false,
  );
});

test('reaction rules: validation, priority, hysteresis and cooldown', () => {
  assert.throws(() => validateRules([{ when: 'nope', then: 'evade' }]), /unknown condition/);
  assert.throws(() => validateRules([{ when: 'hurt', value: 500, then: 'evade' }]), /value/);
  assert.throws(
    () => validateRules([{ when: 'hurt', value: 30, then: 'formation', formation: 'blob' }]),
    /formation/,
  );
  const rules = validateRules([
    { when: 'hurt', value: 30, then: 'retreat', cooldown: 5 },
    { when: 'threat', value: 1.5, then: 'evade', cooldown: 2 },
  ]);
  for (const r of rules) assert.ok(explainRule(r).plain.length > 20);
  const sq = { rules, cooldowns: {}, reaction: null, reactions: 0 };
  const s = {
    health: 1,
    threat: 2,
    jammed: 0,
    detected: 0,
    nearestEnemy: 99,
    enemyCount: 5,
    size: 5,
  };
  runRules(sq, s, 0, 20);
  assert.equal(sq.reaction.index, 1, 'threat rule fires');
  s.threat = 1.4; // inside hysteresis band: still active
  runRules(sq, s, 60, 20);
  assert.equal(sq.reaction?.index, 1);
  s.health = 0.2; // higher-priority rule preempts
  runRules(sq, s, 65, 20);
  assert.equal(sq.reaction.index, 0);
  s.health = 0.9;
  s.threat = 0;
  runRules(sq, s, 200, 20);
  assert.equal(sq.reaction, null);
  s.health = 0.2;
  runRules(sq, s, 205, 20);
  assert.equal(sq.reaction, null, 'cooldown blocks re-trigger');
  runRules(sq, s, 200 + 5 * 20 + 1, 20);
  assert.equal(sq.reaction.index, 0);
  assert.ok(Object.keys(CONDITIONS).length >= 6 && Object.keys(ACTIONS).length >= 6);
});

test('lockstep: identical inputs give identical hashes, different inputs diverge', () => {
  const run = (extra) => {
    const s = new Session({ seed: 9, ai: { 1: 'normal' } });
    for (let t = 0; t < 1200; t++) {
      if (t === 30) s.issue({ type: 'produce', team: 0, role: 'scout' });
      if (t === 50 && extra) s.issue({ type: 'build', team: 0, kind: 'relay', x: -48, z: 44 });
      s.step();
    }
    return s;
  };
  const a = run(false),
    b = run(false),
    c = run(true);
  assert.deepEqual(a.hashes, b.hashes);
  assert.notEqual(a.world.hash(), c.world.hash());
});

test('replay re-simulates a recorded match to the same hash', () => {
  const s = new Session({ seed: 5, ai: { 1: 'easy' } });
  for (let t = 0; t < 1500; t++) {
    if (t === 10) {
      const uids = [];
      for (let i = 0; i < s.world.count; i++) if (s.world.team[i] === 0) uids.push(s.world.uid[i]);
      s.issue({ type: 'order', team: 0, uids, play: 'pincer', x: 10, z: -10 });
    }
    if (t === 40) s.issue({ type: 'produce', team: 0, role: 'assault' });
    if (t === 400)
      s.issue({
        type: 'rules',
        team: 0,
        squad: s.world.squads.find((q) => q.team === 0).id,
        rules: [{ when: 'enemyNear', value: 20, then: 'attack' }],
      });
    s.step();
  }
  const replay = JSON.parse(JSON.stringify(s.replay()));
  const r = runReplay(replay);
  assert.equal(r.world.tick, s.world.tick);
  assert.deepEqual(r.hashes, s.hashes);
});

test('AI vs AI plays a full match to a winner', () => {
  const s = new Session({ seed: 2, ai: { 0: 'normal', 1: 'hard' } });
  let peak = 0;
  while (s.world.winner < 0 && s.world.tick < 20 * 60 * 20) {
    s.step();
    if (s.world.tick % 100 === 0) {
      let n = 0;
      for (let i = 0; i < s.world.count; i++) n += s.world.alive[i];
      peak = Math.max(peak, n);
    }
  }
  assert.ok(s.world.winner >= 0, 'match ended');
  assert.ok(peak > 60, `swarms grew (peak ${peak})`);
  console.log(
    `    winner team ${s.world.winner} after ${(s.world.tick / 20).toFixed(0)} s, peak ${peak} drones`,
  );
});

test('scales to 2,000 fighting drones', () => {
  const w = new World({ seed: 4 });
  const sq = [w.createSquad(0), w.createSquad(1)];
  for (let k = 0; k < 2000; k++) {
    const t = k & 1;
    w.spawnDrone(t, k % 3, (t ? 20 : -20) + (k % 40) * 0.7, ((k / 40) | 0) * 0.7 - 17, sq[t]);
  }
  sq[0].order = { play: 'attack', x: 25, z: 0, x0: -20, z0: 0 };
  sq[1].order = { play: 'attack', x: -25, z: 0, x0: 20, z0: 0 };
  w.step();
  const t0 = performance.now();
  for (let k = 0; k < 40; k++) w.step();
  const ms = (performance.now() - t0) / 40;
  console.log(
    `    ${ms.toFixed(1)} ms per tick with ${w.stats(0).roles.reduce((a, b) => a + b) + w.stats(1).roles.reduce((a, b) => a + b)} drones`,
  );
  assert.ok(ms < 50, 'fits a 20 Hz tick budget');
  assert.ok(w.teams[0].losses + w.teams[1].losses > 0, 'combat happened');
});

console.log(`${passed} RTS checks passed`);
