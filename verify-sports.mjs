import vm from 'node:vm';
import fs from 'node:fs';
import * as sports from './dist/sports-sim.js';
import assert from 'node:assert/strict';
import {
  SportsMatch,
  simulate,
  formation,
  validateConfig,
  validateArchive,
  standings,
  choosePlay,
} from './dist/sports-sim.js';
const results = [];
for (const mode of ['ctf', 'soccer', 'football']) {
  const c = { mode, seed: 42, duration: 120, plays: ['wide', 'diamond'] };
  const a = simulate(c, true),
    b = simulate(c, false);
  assert.deepEqual(a.result(), b.result());
  assert.deepEqual(a.events, b.events);
  assert.equal(a.frames.length, 601);
  assert.equal(a.frames.at(-1).time, 120);
  assert.equal(a.frames[0].stats[0].passes, 0);
  for (const frame of a.frames) {
    assert.equal(frame.players.length, 10);
    assert(
      frame.players.every(
        (p) => Number.isFinite(p.x) && p.x >= 2 && p.x <= 98 && p.y >= 2 && p.y <= 58,
      ),
    );
    for (const flag of frame.flags) {
      assert(['home', 'carried', 'dropped'].includes(flag.state));
      assert.equal(flag.carrier !== null, flag.state === 'carried');
    }
  }
  const frozen = JSON.stringify(a.result());
  a.step();
  assert.equal(JSON.stringify(a.result()), frozen);
  const result = { ...a.result(), id: mode };
  results.push(result);
  assert.deepEqual(
    simulate(JSON.parse(JSON.stringify(c))).result(),
    a.result(),
    'replay configuration roundtrip',
  );
}
// Goals lock scoring until the restart; completion cannot award another score.
const soccer = new SportsMatch({ mode: 'soccer', duration: 30 });
soccer.random = () => 0;
for (const p of soccer.players.filter((p) => p.team === 1)) {
  p.x = 20;
  p.y = 55;
}
soccer.players[4].x = 90;
soccer.players[4].y = 30;
soccer.action = 0;
soccer.step();
assert.deepEqual(soccer.score, [1, 0]);
soccer.step();
assert.deepEqual(soccer.score, [1, 0]);
// Touchdowns switch possession, clear the down count and freeze a dead play.
const fb = new SportsMatch({ mode: 'football' });
fb.players[0].x = 93;
fb.step();
assert.deepEqual(fb.score, [6, 0]);
assert.equal(fb.possession, 1);
assert.equal(fb.down, 1);
fb.step();
assert.deepEqual(fb.score, [6, 0]);
const downs = new SportsMatch({ mode: 'football' });
downs.down = 4;
downs.endDown('Test incompletion');
assert.equal(downs.possession, 1);
assert.equal(downs.down, 1);
assert.equal(downs.line, 20);
// CTF needs the home flag; a carried flag returns on its timer.
const ctf = new SportsMatch({ mode: 'ctf' });
Object.assign(ctf.flags[1], { carrier: 4, state: 'carried', timer: 20 });
Object.assign(ctf.players[4], { x: 7, y: 30 });
ctf.step();
assert.deepEqual(ctf.score, [1, 0]);
assert(ctf.flags.every((f) => f.state === 'home'));
const blocked = new SportsMatch({ mode: 'ctf' });
Object.assign(blocked.flags[1], { carrier: 4, state: 'carried', timer: 20 });
Object.assign(blocked.flags[0], { state: 'dropped', x: 75, y: 5, timer: 8 });
Object.assign(blocked.players[4], { x: 7, y: 30 });
blocked.step();
assert.deepEqual(blocked.score, [0, 0]);
const expired = new SportsMatch({ mode: 'ctf' });
Object.assign(expired.flags[1], { carrier: 4, state: 'carried', timer: 0.1 });
expired.step();
assert.equal(expired.flags[1].state, 'home');
assert.equal(expired.flags[1].carrier, null);
// Independent sports/team learning, no custom-lineup contamination, saved counts.
assert.equal(standings(results, 'soccer', 0).find((r) => r.key === 'wide').games, 1);
assert.equal(standings(results, 'soccer', 1).find((r) => r.key === 'diamond').games, 1);
const custom = {
  ...results[1],
  id: 'custom',
  config: { ...results[1].config, custom: [formation(), null] },
};
assert.equal(standings([...results, custom], 'soccer', 0).find((r) => r.key === 'wide').games, 1);
assert.notEqual(
  choosePlay(results, 'soccer', 0, 42),
  'wide',
  'untried plays explored before repeat',
);
const archive = { kind: 'fleet-sports-lab', version: 1, records: results };

assert.deepEqual(validateArchive(JSON.parse(JSON.stringify(archive))), archive);
assert.throws(
  () => validateArchive({ ...archive, records: [results[0], results[0]] }),
  /duplicate/,
);
assert.throws(
  () => validateArchive({ ...archive, records: [{ ...results[0], score: [NaN, 0] }] }),
  /score/,
);
assert.throws(() => validateConfig({ seed: 0 }));
assert.throws(() => validateConfig({ duration: Infinity }));
assert.throws(() => validateConfig({ plays: ['unknown', 'wide'] }));
assert.throws(() => validateConfig({ custom: [Array(5).fill([10, 10]), null] }), /spacing/);
console.log(
  'PASS sports: deterministic modes, bounded positions, scoring/restarts, four downs, flag rules, sports/team learning isolation, custom lineup exclusion and archive validation.',
);

const messages = [];
const self = { postMessage: (m) => messages.push(m) };
const code = fs.readFileSync('dist/sports-worker.js', 'utf8').replace(/^import .*?;\n/s, '');
vm.runInNewContext(code, { ...sports, self, setTimeout: (fn) => queueMicrotask(fn) });
await self.onmessage({
  data: {
    type: 'run',
    kind: 'compare',
    config: { mode: 'ctf', seed: 42, duration: 30 },
    records: [],
  },
});
const league = messages.filter((m) => m.type === 'result');
assert.equal(league.length, 18);
assert.equal(
  new Set(league.map((m) => m.result.config.plays.join('/') + '-' + m.result.config.seed)).size,
  18,
);
assert.deepEqual([...new Set(league.map((m) => m.result.config.seed))], [42, 43]);
messages.length = 0;
self.postMessage = (m) => {
  messages.push(m);
  if (m.type === 'result') self.onmessage({ data: { type: 'stop' } });
};
await self.onmessage({
  data: {
    type: 'run',
    kind: 'learn',
    count: 30,
    config: { mode: 'soccer', seed: 7, duration: 30 },
    records: [],
  },
});
assert.equal(messages.filter((m) => m.type === 'result').length, 1);
assert.equal(messages.at(-1).canceled, true);
console.log(
  'PASS worker: all 18 CTF combinations use paired seeds; stop preserves only the completed match.',
);
