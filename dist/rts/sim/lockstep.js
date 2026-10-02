// Lockstep session: the only way commands reach the World.
//
// Every command is stamped with the tick it executes on (current tick + input delay) and a
// per-team sequence number. All peers execute the same commands on the same tick in the same
// order (sorted by team, then sequence), so their worlds stay identical. The full command log
// plus the seed *is* the replay.
//
// Single player uses LocalTransport (zero delay). A network transport only has to deliver each
// peer's commands for tick T to everyone before anyone simulates tick T; see NETWORK.md.

import { World } from './world.js';
import { AIPlayer } from './ai.js';
import { createScenario } from './modes.js';

export const REPLAY_VERSION = 1;

export class Session {
  constructor({
    seed = 1,
    map = 'delta',
    players = 2,
    ai = {},
    inputDelay = 0,
    hashEvery = 20,
    mode = 'skirmish',
    challenge = null,
  } = {}) {
    this.config = { seed, map, players, ai, inputDelay, mode, challenge };
    this.scenario = createScenario({ mode, challenge, seed, map });
    this.world = new World({ seed, map, players, scenario: this.scenario });
    this.ais = Object.entries(ai).map(
      ([team, difficulty]) => new AIPlayer(Number(team), { difficulty, seed }),
    );
    this.inputDelay = inputDelay;
    this.pending = new Map(); // tick -> commands
    this.log = [];
    this.seq = 0;
    this.hashEvery = hashEvery;
    this.hashes = [];
  }

  // Queue a command from a local player. Returns the stamped command.
  issue(cmd) {
    const stamped = { ...cmd, tick: this.world.tick + this.inputDelay, seq: this.seq++ };
    this.schedule(stamped);
    return stamped;
  }

  // Accept an already-stamped command (from the network or a replay).
  schedule(cmd) {
    if (cmd.tick < this.world.tick)
      throw Error(`Command for past tick ${cmd.tick} at ${this.world.tick}`);
    if (!this.pending.has(cmd.tick)) this.pending.set(cmd.tick, []);
    this.pending.get(cmd.tick).push(cmd);
  }

  step() {
    const w = this.world;
    for (const ai of this.ais) for (const c of ai.think(w)) this.issue(c);
    const cmds = (this.pending.get(w.tick) || []).sort((a, b) => a.team - b.team || a.seq - b.seq);
    this.pending.delete(w.tick);
    for (const c of cmds) this.log.push(c);
    w.step(cmds);
    if (w.tick % this.hashEvery === 0) this.hashes.push([w.tick, w.hash()]);
    return w.events;
  }

  // Human commands only; AI commands are regenerated from the seed on replay.
  replay() {
    const aiTeams = new Set(this.ais.map((a) => a.team));
    return {
      kind: 'fleet-commander-replay',
      version: REPLAY_VERSION,
      config: this.config,
      ticks: this.world.tick,
      commands: this.log.filter((c) => !aiTeams.has(c.team)),
      hashes: this.hashes,
    };
  }
}

// Re-simulate a replay; returns the session (check session.world.hash() / hashes).
export function runReplay(replay, onStep) {
  if (replay?.kind !== 'fleet-commander-replay') throw Error('Not a Fleet Commander replay.');
  const s = new Session({ ...replay.config, inputDelay: 0 });
  const byTick = new Map();
  for (const c of replay.commands) {
    if (!byTick.has(c.tick)) byTick.set(c.tick, []);
    byTick.get(c.tick).push(c);
  }
  while (s.world.tick < replay.ticks && s.world.winner < 0) {
    for (const c of byTick.get(s.world.tick) || []) s.schedule(c);
    s.step();
    onStep?.(s);
  }
  return s;
}
