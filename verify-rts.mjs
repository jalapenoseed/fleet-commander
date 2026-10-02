// Regression gate for the RTS working model (dist/rts). Pure Node, no browser needed.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { World, formationOffset } from './dist/rts/sim/world.js';
import { Session, runReplay } from './dist/rts/sim/lockstep.js';
import { dsin, dcos, datan2, Rng } from './dist/rts/sim/dmath.js';
import { F_PILOT } from './dist/rts/sim/flight.js';
import { validateRules, explainRule, CONDITIONS, ACTIONS, runRules } from './dist/rts/sim/rules.js';
import { ROLES, STRUCTURES, FORMATIONS, ROLE_INDEX } from './dist/rts/sim/defs.js';
import { MAPS, rockHeight } from './dist/rts/sim/maps.js';
import { CHALLENGES, RACE_GATES } from './dist/rts/sim/modes.js';
import { SpatialGrid } from './dist/rts/sim/grid.js';
import { stormEffects as stormEffectsForTest } from './dist/rts/sim/systems.js';

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

test('deterministic atan2 matches Math.atan2 within 2e-5', () => {
  for (let y = -3; y <= 3; y += 0.173)
    for (let x = -3; x <= 3; x += 0.137)
      assert.ok(Math.abs(datan2(y, x) - Math.atan2(y, x)) < 2e-5);
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

test('flight: autopilot cruises at role altitude with calm hover attitude', () => {
  const w = new World({ seed: 1 });
  for (let k = 0; k < 400; k++) w.step();
  for (let i = 0; i < w.count; i++) {
    if (!w.alive[i]) continue;
    const f = ROLES[w.role[i]].flight;
    assert.ok(Math.abs(w.py[i] - f.alt) < 0.3, 'altitude');
    assert.ok(Math.hypot(w.pitch[i], w.roll[i]) < 0.25, 'hover tilt');
  }
});

test('flight: pilot sticks map to pitch, roll, yaw and throttle from the pilot seat', () => {
  const w = new World({ seed: 1 });
  for (let k = 0; k < 100; k++) w.step();
  const i = 0,
    u = w.uid[i];
  assert.equal(w.apply({ type: 'stick', team: 0, uid: u, p: 1 }), false, 'needs pilot first');
  assert.equal(w.apply({ type: 'pilot', team: 1, uid: u, on: true }), false, 'own drones only');
  const fly = (st, ticks = 20) => {
    w.step([
      { type: 'pilot', team: 0, uid: u, on: true },
      { type: 'stick', team: 0, uid: u, t: 0, y: 0, p: 0, r: 0, ...st },
    ]);
    const x = w.px[i],
      z = w.pz[i],
      yaw = w.yaw[i],
      alt = w.py[i];
    const fx = Math.sin(yaw),
      fz = Math.cos(yaw);
    for (let k = 0; k < ticks; k++) w.step();
    const dx = w.px[i] - x,
      dz = w.pz[i] - z;
    const out = {
      fwd: dx * fx + dz * fz,
      right: -dx * fz + dz * fx,
      dyaw: w.yaw[i] - yaw,
      climb: w.py[i] - alt,
    };
    w.step([{ type: 'stick', team: 0, uid: u, t: 0, y: 0, p: 0, r: 0 }]);
    for (let k = 0; k < 60; k++) w.step();
    return out;
  };
  const pitch = fly({ p: 1 });
  assert.ok(pitch.fwd > 4 && Math.abs(pitch.right) < 0.5, 'pitch forward flies forward');
  const back = fly({ p: -1 });
  assert.ok(back.fwd < -4, 'pitch back flies backward');
  const roll = fly({ r: 1 });
  assert.ok(roll.right > 4 && Math.abs(roll.fwd) < 0.5, 'roll right slides right');
  const yaw = fly({ y: 0.25 });
  assert.ok(yaw.dyaw < -1 && Math.abs(yaw.fwd) < 0.5, 'yaw right turns in place');
  const up = fly({ t: 1 });
  assert.ok(up.climb > 5, 'throttle climbs');
  const down = fly({ t: -1 }, 60);
  assert.ok(w.py[i] < 2 && down.climb < -5, 'throttle down descends');
  assert.equal(w.teams[0].pilot, u);
  w.step([{ type: 'pilot', team: 0, on: false }]);
  assert.equal(w.flags[i] & F_PILOT, 0);
  assert.equal(w.teams[0].pilot, 0);
});

test('flight: heavy airframes turn slower; weapons need the nose on target', () => {
  const yawRates = ROLES.map((r) => r.flight.yawRate);
  assert.ok(yawRates[ROLE_INDEX.scout] > yawRates[ROLE_INDEX.assault]);
  const w = new World({ seed: 1 });
  const a = w.createSquad(0),
    b = w.createSquad(1);
  const shooter = w.spawnDrone(0, ROLE_INDEX.interceptor, 0, 0, a);
  w.spawnDrone(1, ROLE_INDEX.scout, 0, -6, b); // directly behind the shooter's nose (yaw 0 = +z)
  a.order = { play: 'hold', x: 0, z: 0, x0: 0, z0: 0 };
  b.order = { play: 'hold', x: 0, z: -6, x0: 0, z0: -6 };
  b.rules = [];
  w.updateVisibility();
  w.step();
  assert.equal(
    w.events.filter((e) => e.k === 'shot' && e.team === 0).length,
    0,
    'no shot while facing away',
  );
  let shots = 0;
  for (let k = 0; k < 40; k++) {
    w.step();
    shots += w.events.filter((e) => e.k === 'shot' && e.team === 0).length;
  }
  assert.ok(shots > 0, 'turns to face and fires');
  assert.ok(Math.abs(Math.abs(w.yaw[shooter]) - Math.PI) < 0.6, 'nose turned toward the target');
});

test('flight: piloted drone loss reports a pilot handoff event', () => {
  const w = new World({ seed: 1 });
  const u = w.uid[0];
  w.step([{ type: 'pilot', team: 0, uid: u, on: true }]);
  w.hp[0] = -1;
  w.step();
  const e = w.events.find((x) => x.k === 'pilotLost');
  assert.ok(e && e.uid === u && e.team === 0);
  assert.equal(w.teams[0].pilot, 0);
});

test('battery: drains with flight, low drones fly to a charger and recharge', () => {
  const w = new World({ seed: 1 });
  const i = 0;
  for (let k = 0; k < 40; k++) w.step();
  const b0 = w.bat[i];
  for (let k = 0; k < 100; k++) w.step();
  assert.ok(w.bat[i] < b0, 'drains while flying');
  // Park it far from home with a low battery: it must break off and head to the core.
  w.px[i] = w.ox[i] = 30;
  w.pz[i] = w.oz[i] = -10;
  w.bat[i] = 0.5; // the range-aware reserve should send it home from here
  const core = w.structures.find((s) => s.team === 0 && s.kind === 'core');
  const d0 = Math.hypot(w.px[i] - core.x, w.pz[i] - core.z);
  for (let k = 0; k < 20 * 12; k++) w.step();
  assert.ok(Math.hypot(w.px[i] - core.x, w.pz[i] - core.z) < d0 - 40, 'returns home');
  for (let k = 0; k < 20 * 25; k++) w.step();
  assert.ok(w.bat[i] > 0.9, 'recharged at the core');
  // An empty battery is fatal.
  w.bat[1] = 0.0001;
  w.flags[1] |= F_PILOT;
  w.step();
  assert.ok(w.events.some((e) => e.k === 'depleted') || !w.alive[1]);
});

test('research: labs, costs, prerequisites, exclusive choices and tier unlocks', () => {
  const w = new World({ seed: 1 });
  const team = w.teams[0];
  team.energy = 5000;
  assert.equal(w.apply({ type: 'research', team: 0, tech: 'batteries' }), false, 'needs a lab');
  const lab = w.addStructure(0, 'lab', -48, 46, true);
  assert.equal(w.apply({ type: 'research', team: 0, tech: 'tier3' }), false, 'tier3 needs tier2');
  assert.equal(w.apply({ type: 'produce', team: 0, role: 'lancer' }), false, 'lancer locked');
  assert.equal(w.apply({ type: 'research', team: 0, tech: 'flakBurst' }), true);
  assert.equal(w.apply({ type: 'research', team: 0, tech: 'tier2' }), false, 'lab busy');
  for (let k = 0; k < 30 * 20 + 2; k++) w.step();
  assert.ok(team.tech.has('flakBurst'));
  assert.equal(w.roleStats[0][ROLE_INDEX.interceptor].weapon.splash, 2.5);
  w.addStructure(0, 'lab', -40, 40, true);
  assert.equal(w.apply({ type: 'research', team: 0, tech: 'flakRange' }), false, 'excluded');
  assert.equal(w.apply({ type: 'research', team: 0, tech: 'tier2' }), true);
  for (let k = 0; k < 40 * 20 + 2; k++) w.step();
  assert.equal(w.apply({ type: 'produce', team: 0, role: 'lancer' }), true, 'lancer unlocked');
  assert.equal(
    w.apply({ type: 'produce', team: 0, role: 'wasp' }),
    false,
    'wasps are never produced',
  );
  assert.ok(lab.alive);
});

test('carriers launch and rebuild wasps; wardens shield; scouts can cloak', () => {
  const w = new World({ seed: 1 });
  const sq = w.createSquad(0),
    foe = w.createSquad(1);
  const c = w.spawnDrone(0, ROLE_INDEX.carrier, -20, 20, sq);
  sq.order = { play: 'hold', x: -20, z: 20, x0: -20, z0: 20 };
  for (let k = 0; k < 20 * 30; k++) w.step();
  const wasps = () =>
    [...Array(w.count).keys()].filter((i) => w.alive[i] && w.owner[i] === w.uid[c]).length;
  assert.equal(wasps(), 8, 'full hangar');
  const one = [...Array(w.count).keys()].find((i) => w.alive[i] && w.owner[i] === w.uid[c]);
  w.hp[one] = -1;
  w.step();
  assert.equal(wasps(), 7);
  for (let k = 0; k < 20 * 4; k++) w.step();
  assert.equal(wasps(), 8, 'rebuilt');
  // Shield: a drone inside a warden bubble takes 40% less damage.
  const ward = w.spawnDrone(0, ROLE_INDEX.warden, 10, 10, sq);
  const a = w.spawnDrone(0, ROLE_INDEX.assault, 11, 10, sq);
  w.step();
  const hp0 = w.hp[a];
  w.damageDrone(a, 10, 1);
  assert.ok(Math.abs(hp0 - w.hp[a] - 6) < 1e-9, 'shielded hit');
  assert.ok(ward >= 0);
  // Cloak: a hovering scout with camouflage research is invisible to a distant enemy.
  w.teams[1].tech.add('cloak');
  w.refreshStats(1);
  const scout = w.spawnDrone(1, ROLE_INDEX.scout, 0, -40, foe);
  foe.order = { play: 'hold', x: 0, z: -40, x0: 0, z0: -40 };
  w.spawnDrone(0, ROLE_INDEX.relay, 0, -30, sq);
  for (let k = 0; k < 60; k++) w.step();
  assert.equal(w.seen(0, scout), false, 'cloaked');
  w.spawnDrone(0, ROLE_INDEX.scout, 0, -36, sq);
  for (let k = 0; k < 8; k++) w.step();
  assert.equal(w.seen(0, scout), true, 'revealed up close');
});

test('altitude bands: low flies under radar, high flies over kill zones', () => {
  const w = new World({ seed: 1 });
  w.addStructure(1, 'radar', 0, 0, true);
  w.addStructure(1, 'turret', 0, 0, true);
  const low = w.createSquad(0),
    high = w.createSquad(0);
  low.altitude = 0;
  high.altitude = 2;
  const a = w.spawnDrone(0, ROLE_INDEX.assault, 2, 2, low);
  const b = w.spawnDrone(0, ROLE_INDEX.assault, -2, -2, high);
  low.order = { play: 'hold', x: 2, z: 2, x0: 2, z0: 2 };
  high.order = { play: 'hold', x: -2, z: -2, x0: -2, z0: -2 };
  for (let k = 0; k < 20 * 6; k++) w.step();
  assert.ok(w.py[a] < 2.5 && w.py[b] > 14, 'bands reached');
  assert.equal(w.flags[a] & 2, 0, 'low drone not detected by radar');
  assert.ok(w.flags[b] & 2, 'high drone detected');
  const hb = w.hp[b];
  for (let k = 0; k < 20; k++) w.step();
  assert.equal(w.hp[b], hb, 'high drone untouched by the kill zone');
  assert.ok(w.hp[a] < ROLES[ROLE_INDEX.assault].hp, 'low drone burned');
  assert.equal(
    new SpatialGrid(10, 4, 8).query(
      0,
      0,
      5,
      new Float64Array(8),
      new Float64Array(8),
      new Int32Array(8),
    ),
    0,
    'empty grid',
  );
});

test('modes: survival waves escalate, challenges resolve, race gates count', () => {
  const s = new Session({ seed: 3, mode: 'survival' });
  for (let k = 0; k < 20 * 80; k++) s.step();
  assert.equal(s.scenario.wave, 1, 'first wave after the build phase');
  assert.ok(s.world.teams[1].tether, 'hostile hive has no batteries to manage');
  let hostiles = 0;
  for (let i = 0; i < s.world.count; i++) hostiles += s.world.alive[i] && s.world.team[i] === 1;
  assert.ok(hostiles >= 4);
  for (const key of Object.keys(CHALLENGES)) {
    const c = new Session({ seed: 1, mode: 'challenge', challenge: key });
    for (let k = 0; k < 20 * 300 && c.world.winner < 0; k++) c.step();
    if (key !== 'carrier') assert.equal(c.world.winner, 1, `${key}: idle player loses`);
  }
  const blind = new Session({ seed: 1, mode: 'challenge', challenge: 'blind' });
  const bw = blind.world,
    uids = [];
  for (let i = 0; i < bw.count; i++) if (bw.alive[i] && bw.team[i] === 0) uids.push(bw.uid[i]);
  blind.issue({ type: 'order', team: 0, uids, play: 'attack', x: 26, z: -24 });
  blind.step();
  blind.issue({
    type: 'altitude',
    team: 0,
    squad: bw.squads.find((q) => q.team === 0).id,
    level: 2,
  });
  for (let k = 0; k < 20 * 200 && bw.winner < 0; k++) blind.step();
  assert.equal(bw.winner, 0, 'blind is solvable by flying high');
  assert.ok(bw.result.stars >= 1);
  const r = new Session({ seed: 1, mode: 'race' });
  const rw = r.world;
  for (const g of RACE_GATES) {
    const i = rw.uidMap.get(r.scenario.pilotUid);
    for (let k = 0; k < 4; k++) {
      rw.px[i] = g.x;
      rw.pz[i] = g.z;
      rw.py[i] = g.y;
      r.step();
    }
  }
  assert.equal(rw.winner, 0);
  assert.ok(rw.result.time > 0 && rw.result.race);
});

test('line of sight: rocks hide what is behind them unless you fly above them', () => {
  const w = new World({ seed: 1 });
  const rock = w.map.obstacles.find((o) => o.x === -24 && o.z === 24);
  const sq = w.createSquad(0);
  sq.order = { play: 'hold', x: rock.x - 12, z: rock.z, x0: rock.x - 12, z0: rock.z };
  const i = w.spawnDrone(0, ROLE_INDEX.relay, rock.x - 12, rock.z, sq);
  w.py[i] = 3;
  w.updateVisibility();
  assert.equal(w.visible(0, rock.x + rock.r + 4, rock.z), false, 'hidden behind the rock');
  assert.equal(w.visible(0, rock.x, rock.z - rock.r - 5), true, 'visible beside it');
  w.py[i] = rockHeight(rock) + 1;
  w.updateVisibility();
  assert.equal(w.visible(0, rock.x + rock.r + 4, rock.z), true, 'seen over the top');
});

test('objectives: captured spires add bandwidth and factories build scouts', () => {
  const w = new World({ seed: 1, map: 'rivers' });
  const spire = w.objectives.find((o) => o.kind === 'spire');
  const fac = w.objectives.find((o) => o.kind === 'factory');
  const sq = w.createSquad(0),
    sq2 = w.createSquad(0);
  sq.order = { play: 'hold', x: spire.x, z: spire.z, x0: spire.x, z0: spire.z };
  sq2.order = { play: 'hold', x: fac.x, z: fac.z, x0: fac.x, z0: fac.z };
  for (let k = 0; k < 3; k++) w.spawnDrone(0, ROLE_INDEX.scout, spire.x + k, spire.z, sq);
  for (let k = 0; k < 3; k++) w.spawnDrone(0, ROLE_INDEX.scout, fac.x + k, fac.z, sq2);
  const cap0 = w.teams[0].bwCap;
  for (let k = 0; k < 20 * 12; k++) w.step();
  assert.equal(spire.owner, 0);
  assert.equal(fac.owner, 0);
  assert.equal(w.teams[0].bwCap, cap0 + 20);
  const n0 = w.stats(0).roles[ROLE_INDEX.scout];
  for (let k = 0; k < 20 * 21; k++) w.step();
  assert.ok(w.stats(0).roles[ROLE_INDEX.scout] >= n0 + 2, 'factory delivered scouts');
});

test('storms jam and slow; salvage pays the collector; abilities and hacking work', () => {
  const w = new World({ seed: 1 });
  const st = w.storms[0];
  const sq = w.createSquad(0);
  const i = w.spawnDrone(0, ROLE_INDEX.scout, st.x, st.z, sq);
  w.grid.build(w.alive, w.px, w.pz, w.count);
  w.auras();
  {
    const before = w.flags[i];
    w.flags[i] = 0;
    w.storms[0].x = w.px[i];
    w.storms[0].z = w.pz[i];
    w.grid.build(w.alive, w.px, w.pz, w.count);
    stormEffectsForTest(w);
    assert.ok(w.flags[i] & 1, 'jammed inside a storm');
    w.flags[i] = before;
  }
  // Salvage: an enemy wreck pays whoever flies over it.
  const foe = w.createSquad(1);
  const v = w.spawnDrone(1, ROLE_INDEX.assault, 0, 30, foe);
  w.hp[v] = -1;
  w.step();
  assert.ok(w.salvage.length >= 1);
  const pile = w.salvage[0];
  const e0 = w.teams[0].energy;
  w.px[i] = w.ox[i] = pile.x;
  w.pz[i] = w.oz[i] = pile.z;
  sq.order = { play: 'hold', x: pile.x, z: pile.z, x0: pile.x, z0: pile.z };
  for (let k = 0; k < 10; k++) w.step();
  assert.ok(w.teams[0].energy > e0 + 10, 'salvage collected');
  // Abilities: cooldown gate, EMP stun, reinforcement drop.
  const team = w.teams[0];
  assert.equal(
    w.apply({ type: 'ability', team: 0, key: 'overcharge' }),
    false,
    'on cooldown at start',
  );
  team.ab.emp = team.ab.drop = team.ab.overcharge = 0;
  const target = w.spawnDrone(1, ROLE_INDEX.interceptor, w.px[i] + 3, w.pz[i], foe);
  w.updateVisibility();
  assert.equal(
    w.apply({ type: 'ability', team: 0, key: 'emp', x: w.px[target], z: w.pz[target] }),
    true,
  );
  for (let k = 0; k < 32; k++) w.step();
  assert.ok(w.stunUntil[target] > w.tick, 'stunned');
  const n0 = w.stats(0).roles[ROLE_INDEX.scout];
  assert.equal(w.apply({ type: 'ability', team: 0, key: 'drop', x: w.px[i], z: w.pz[i] }), true);
  assert.equal(w.stats(0).roles[ROLE_INDEX.scout], n0 + 8);
  assert.equal(w.apply({ type: 'ability', team: 0, key: 'overcharge' }), true);
  assert.ok(team.overUntil > w.tick);
  // Hacking: a jammer with Intrusion Suite converts a nearby jammed enemy.
  const h = new World({ seed: 2 });
  h.teams[0].tech.add('intrusion');
  const a = h.createSquad(0),
    b = h.createSquad(1);
  a.order = { play: 'hold', x: 0, z: 0, x0: 0, z0: 0 };
  b.order = { play: 'hold', x: 3, z: 0, x0: 3, z0: 0 };
  b.rules = [];
  h.spawnDrone(0, ROLE_INDEX.jammer, 0, 0, a);
  const prey = h.spawnDrone(1, ROLE_INDEX.medic, 3, 0, b);
  for (let k = 0; k < 20 * 6; k++) h.step();
  assert.equal(h.team[prey], 0, 'hacked to team 0');
});

test('designer: parts become a team-owned airframe with tier gating', () => {
  const w = new World({ seed: 1 });
  w.teams[0].energy = 9999;
  const spec = {
    name: 'Lancehawk',
    frame: 'medium',
    weapon: 'rail',
    sensor: 'longrange',
    module: 'armor',
  };
  assert.equal(
    w.apply({ type: 'design', team: 0, spec: { ...spec, frame: 'light' } }),
    false,
    'rail needs medium+',
  );
  assert.equal(
    w.apply({ type: 'design', team: 0, spec: { ...spec, weapon: 'none', module: 'none' } }),
    false,
    'needs a purpose',
  );
  assert.equal(w.apply({ type: 'design', team: 0, spec }), true);
  const r = w.roles.length - 1,
    d = w.roles[r];
  assert.equal(d.label, 'Lancehawk');
  assert.equal(d.tier, 2);
  assert.ok(d.hp > 90 && d.speed < 8, 'armor plates: tougher and slower');
  assert.equal(w.apply({ type: 'produce', team: 0, role: r }), false, 'tier 2 locked');
  w.teams[0].tech.add('tier2');
  w.refreshStats(0);
  assert.equal(w.apply({ type: 'produce', team: 0, role: r }), true);
  w.teams[1].tech.add('tier2');
  w.refreshStats(1);
  assert.equal(
    w.apply({ type: 'produce', team: 1, role: r }),
    false,
    'designs belong to their team',
  );
  for (let k = 0; k < 20 * 12; k++) w.step();
  assert.equal(w.stats(0).roles[r], 2, 'a pack of medium-frame designs flew out');
});

test('field equations: vortex swirls and barrier repels enemies, not allies or high fliers', () => {
  const w = new World({ seed: 1 });
  w.addStructure(1, 'vortex', 0, 0, true);
  w.addStructure(1, 'barrier', 40, 0, true);
  const sq = w.createSquad(0);
  sq.rules = [];
  const v = w.spawnDrone(0, ROLE_INDEX.assault, 6, 0, sq),
    b = w.spawnDrone(0, ROLE_INDEX.assault, 43, 0, sq),
    hi = w.spawnDrone(0, ROLE_INDEX.assault, 0, 6, sq),
    ally = w.spawnDrone(1, ROLE_INDEX.assault, 0, -6, w.createSquad(1));
  w.py[hi] = 20;
  w.altBand[hi] = 2;
  sq.order = { play: 'hold', x: 0, z: 0, x0: 0, z0: 0 };
  w.step();
  for (const i of [v, b, hi, ally]) {
    w.vx[i] = w.vz[i] = 0;
    w.px[i] = w.ox[i];
    w.pz[i] = w.oz[i];
  }
  w.fieldStructs = w.structures.filter((s) => s.kind === 'vortex' || s.kind === 'barrier');
  for (const i of [v, b, hi, ally]) w.fieldForces(i);
  assert.ok(
    Math.abs(w.vz[v]) > Math.abs(w.vx[v]) && w.vx[v] < 0,
    'vortex: mostly tangential, slightly inward',
  );
  assert.ok(w.vx[b] > 0.5, 'barrier pushes outward');
  assert.equal(w.vx[hi] + w.vz[hi], 0, 'high flier untouched');
  assert.equal(w.vx[ally] + w.vz[ally], 0, 'own team untouched');
  assert.equal(w.canPlace(0, 'vortex', -48, 44).reason, 'Research Field Projector first');
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
    if (t === 45)
      s.issue({
        type: 'design',
        team: 0,
        spec: {
          name: 'Wisp',
          frame: 'light',
          weapon: 'pulse',
          sensor: 'extended',
          module: 'battery',
        },
      });
    if (t === 50) s.issue({ type: 'produce', team: 0, role: s.world.roles.length - 1 });
    const pilotUid = s.world.uid[0];
    if (t === 60) s.issue({ type: 'pilot', team: 0, uid: pilotUid, on: true });
    if (t >= 61 && t < 200 && t % 7 === 0)
      s.issue({
        type: 'stick',
        team: 0,
        uid: pilotUid,
        t: 0.5,
        y: (t % 3) - 1,
        p: 1,
        r: -0.25,
        fire: t % 2 === 0,
      });
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
