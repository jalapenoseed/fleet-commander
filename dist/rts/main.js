// Fleet Commander — Working Model. Wires the deterministic lockstep Session to the renderer,
// input and HUD. Every player action becomes a serializable command via session.issue(); the
// UI never mutates the World directly, which is what makes replays and multiplayer possible.

import { Session } from './sim/lockstep.js';
import {
  DT,
  STRUCTURES,
  FORMATIONS,
  PLAY_INFO,
  TEAM_COLORS,
  TEAM_NAMES,
  WEAPONS,
  ARMOR,
} from './sim/defs.js';
import { ACTIONS } from './sim/rules.js';
import { TECH, TECH_KEYS, researchBlocker, unlockedTier } from './sim/tech.js';
import { DIFFICULTY } from './sim/ai.js';
import { CHALLENGES, MODES } from './sim/modes.js';
import { ABILITIES, ABILITY_KEYS, OBJECTIVES } from './sim/systems.js';
import { GameView } from './render/view.js';
import { Minimap } from './ui/minimap.js';
import { ScriptEditor } from './ui/script-editor.js';
import { PilotController } from './ui/pilot.js';

const $ = (id) => document.getElementById(id);
const BUILD_KEYS = {
  z: 'extractor',
  x: 'relay',
  c: 'fabricator',
  v: 'radar',
  b: 'jammer',
  n: 'turret',
  m: 'repair',
  k: 'charger',
  l: 'lab',
};
const PLAY_KEYS = { a: 'attack', p: 'pincer', t: 'patrol', o: 'orbit' };
const TARGETED = new Set(['move', 'attack', 'pincer', 'patrol', 'orbit']);
// Personal records live in this browser only.
const store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem('fc-rts-' + key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('fc-rts-' + key, JSON.stringify(value));
    } catch {
      // Storage unavailable (private mode); records just don't persist.
    }
  },
};
const fmtTime = (ticks) => {
  const s = Math.floor(ticks * DT);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const html = (strings, ...vals) =>
  strings.reduce((a, s, i) => a + s + (i < vals.length ? vals[i] : ''), '');
const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );

function roleTip(r) {
  const w = r.weapon;
  const best = w
    ? WEAPONS[w.type].vs.map((m, k) => [m, ARMOR[k]]).sort((a, b) => b[0] - a[0])[0]
    : null;
  return html`<b>${r.label} ×${r.pack}</b>${esc(r.blurb)}
    <div class="stat">
      hp ${r.hp} · speed ${r.speed} · sight
      ${r.sensor}m${w
        ? ` · ${WEAPONS[w.type].label} ${(w.damage / w.cooldown).toFixed(0)} dps, ${w.range}m · best vs ${best[1]}`
        : ''}<br />${r.cost * r.pack} energy · ${r.bw * r.pack} bandwidth · ${r.build}s · armor
      ${ARMOR[r.armor]} · battery ${Math.round(r.battery)}s${r.tier > 1 ? ` · tier ${r.tier}` : ''}
    </div>`;
}
function techTip(key, why) {
  const t = TECH[key];
  return html`<b>${t.label}</b>${esc(t.blurb)}
    <div class="stat">${t.cost} energy · ${t.time}s${why ? ` · ${esc(why)}` : ''}</div>`;
}
function structTip(kind) {
  const d = STRUCTURES[kind];
  return html`<b>${d.label}</b>${esc(d.blurb)}
    <div class="stat">${d.cost} energy · hp ${d.hp} · build ${d.build}s</div>`;
}

class Game {
  constructor({
    mode,
    difficulty = 'normal',
    quality = 'balanced',
    seed = 1,
    replay = null,
    map = 'delta',
    challenge = null,
  }) {
    this.mode = mode;
    this.player = 0;
    this.spectator = mode === 'spectate' || mode === 'replay';
    if (replay) {
      this.session = new Session({ ...replay.config, inputDelay: 0 });
      this.replayData = replay;
      this.replayCmds = new Map();
      for (const c of replay.commands) {
        if (!this.replayCmds.has(c.tick)) this.replayCmds.set(c.tick, []);
        this.replayCmds.get(c.tick).push(c);
      }
    } else {
      const cfg = { seed, map };
      if (mode === 'skirmish') cfg.ai = { 1: difficulty };
      else if (mode === 'spectate') cfg.ai = { 0: difficulty, 1: difficulty };
      else Object.assign(cfg, { mode, challenge });
      this.session = new Session(cfg);
    }
    this.world = this.session.world;
    this.scenario = this.session.scenario;
    this.difficulty = difficulty;
    this.view = new GameView($('view'), this.world, {
      playerTeam: this.player,
      quality,
      spectator: this.spectator,
    });
    this.minimap = new Minimap($('minimap'), this.world, this.view, {
      onOrder: (x, z) => this.selectedUids().length && this.order(this.targetPlay || 'move', x, z),
    });
    this.script = new ScriptEditor($('script'), {
      onApply: (sq, rules) => this.issue({ type: 'rules', squad: sq.id, rules }),
    });
    this.speed = 1;
    this.acc = 0;
    this.last = performance.now();
    this.groups = {};
    this.keys = new Set();
    this.targetPlay = null;
    this.placing = null;
    this.selStruct = null;
    this.alerts = [];
    this.lastAlert = null;
    this.director = this.spectator;
    this.action = { x: 0, z: 0, w: 0 };
    this.mouse = { x: innerWidth / 2, y: innerHeight / 2, inside: false };
    this.hudTick = 0;
    this.ended = false;
    this.pilot = new PilotController(this);
    this.mouseFire = false;
    this.buildCommandPanel();
    this.bindInput();
    if (this.scenario?.forcePilot && !this.spectator) {
      this.pilot.locked = true;
      this.pilot.start(this.scenario.pilotUid);
    }
    document.body.classList.toggle(
      'no-economy',
      this.scenario?.key === 'race' ||
        (this.scenario?.key === 'challenge' && !this.world.structures.some((x) => x.team === 0)),
    );
    this.updateHud();
    if (this.scenario?.key === 'race') {
      const best = store.get('race-best');
      if (best) this.view.setGhost(best.frames);
      this.ghostFrames = [];
    }
    $('hud').hidden = false;
    $('menu').hidden = true;
    $('btn-director').hidden = $('btn-fog').hidden = !this.spectator;
    $('btn-director').classList.toggle('on', this.director);
    $('commands').hidden = this.spectator;
    $('btn-surrender').hidden = this.spectator;
    this.setSpeed(1);
    this.raf = requestAnimationFrame((t) => this.loop(t));
    if (this.spectator)
      this.alert(
        replay
          ? 'Replay: re-simulating from the command log'
          : 'Autonomous Arena: two AI swarms, auto-director on',
        'info',
      );
    else
      this.alert(
        `Skirmish vs ${DIFFICULTY[difficulty].label} AI — destroy the red Command Core`,
        'info',
      );
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.pilot.stop();
    this.abort.abort();
    this.view.renderer.dispose();
    $('hud').hidden = true;
    $('objective').hidden = true;
    this.script.close();
  }

  issue(cmd) {
    if (this.spectator) return null;
    return this.session.issue({ ...cmd, team: this.player });
  }

  // ---------- loop ----------

  loop(now) {
    this.raf = requestAnimationFrame((t) => this.loop(t));
    const dt = Math.max(0, Math.min(0.1, (now - this.last) / 1000));
    this.last = now;
    this.handleHeldKeys(dt);
    this.pilot.update(dt);
    if (!this.ended) {
      this.acc += dt * this.speed;
      let steps = 0;
      while (this.acc >= DT && steps < 12) {
        this.stepSim();
        this.acc -= DT;
        steps++;
      }
      if (steps === 12) this.acc = 0;
    }
    if (this.director) this.updateDirector(dt);
    this.view.frame(Math.min(1, this.acc / DT), dt);
    this.pilot.draw(Math.min(1, this.acc / DT));
    if (++this.hudTick % 6 === 0) this.updateHud();
    this.minimap.draw();
  }

  stepSim() {
    const w = this.world;
    if (this.replayCmds)
      for (const c of this.replayCmds.get(w.tick) || []) this.session.schedule(c);
    const events = this.session.step();
    const sc = this.scenario;
    if (sc?.key === 'race' && sc.start >= 0 && this.ghostFrames && w.winner < 0) {
      const i = w.uidMap.get(sc.pilotUid);
      if (i !== undefined)
        this.ghostFrames.push(
          [w.px[i], w.py[i], w.pz[i], w.yaw[i], w.pitch[i], w.roll[i]].map(
            (v) => Math.round(v * 100) / 100,
          ),
        );
    }
    this.view.sync(events);
    for (const e of events) this.onEvent(e);
    if (this.replayCmds && w.tick >= this.replayData.ticks && w.winner < 0) this.finish(-1);
  }

  onEvent(e) {
    const mine = e.team === this.player && !this.spectator;
    if (e.k === 'alert' && mine) {
      this.alert(e.text);
      this.lastAlert = { x: e.x, z: e.z };
      this.minimap.flash(e.x, e.z);
    } else if (e.k === 'built' && mine) this.alert(`${STRUCTURES[e.kind].label} online`, 'info');
    else if (e.k === 'destroyed') {
      if (mine) this.alert(`${STRUCTURES[e.kind].label} destroyed`);
      else if (!this.spectator && e.team !== this.player)
        this.alert(`Enemy ${STRUCTURES[e.kind].label} destroyed`, 'good');
      else if (this.spectator)
        this.alert(`${TEAM_NAMES[e.team]} ${STRUCTURES[e.kind].label} destroyed`, 'info');
      if (this.director) this.action = { x: e.x, z: e.z, w: this.action.w + 30 };
    } else if (e.k === 'shot' && this.director) {
      const a = this.action,
        k = 0.04;
      a.x += (e.x1 - a.x) * k;
      a.z += (e.z1 - a.z) * k;
      a.w = Math.min(60, a.w + 0.5);
    } else if (e.k === 'pilotLost' && mine && this.pilot.active) {
      const next = this.successor(e);
      if (next) {
        this.pilot.transfer(next);
        const i = this.world.uidMap.get(next);
        this.alert(`Drone lost — taking over a ${this.world.rs(i).label.toLowerCase()}`, 'info');
      } else {
        this.pilot.stop();
        this.alert('Drone lost — no drones left to fly');
      }
    } else if (e.k === 'crash' && e.team === this.player && this.pilot.active) {
      const i = this.world.uidMap.get(this.pilot.uid);
      if (i === e.i) this.alert(`Impact! −${Math.round(e.damage)} hp`);
    } else if (e.k === 'captured' && !this.spectator) {
      const label = OBJECTIVES[e.kind].label;
      if (e.team === this.player) this.alert(`${label} captured`, 'good');
      else if (e.prev === this.player) this.alert(`${label} lost to the enemy`);
      this.minimap.flash(e.x, e.z);
    } else if (e.k === 'hacked' && !this.spectator) {
      if (e.team === this.player) this.alert('Enemy drone hacked — it fights for you now', 'good');
      else if (e.from === this.player) {
        this.alert('One of your drones was hacked!');
        this.view.selected.delete(this.world.uid[e.i]);
      }
    } else if (e.k === 'emp' && !this.spectator && e.team !== this.player && e.hit) {
      this.alert('Enemy EMP strike — drones stunned');
      this.lastAlert = { x: e.x, z: e.z };
    } else if (e.k === 'scenario') {
      this.alert(e.text, e.alert ? '' : 'good');
    } else if (e.k === 'researched' && mine) {
      this.alert(`Research complete: ${TECH[e.tech].label}`, 'good');
      this.buildProduceButtons();
    } else if (e.k === 'depleted' && mine) {
      if (this.world.tick - (this.lastDepleted || -1e9) > 200) {
        this.lastDepleted = this.world.tick;
        this.alert('A drone ran out of battery — build Charging Pads (K) near the front');
      }
    } else if (e.k === 'victory') this.finish(e.team);
  }

  updateDirector(dt) {
    const a = this.action,
      c = this.view.cam;
    a.w *= Math.exp(-dt * 0.5);
    if (a.w < 2) return;
    const k = 1 - Math.exp(-dt * 0.8);
    c.tx += (a.x - c.tx) * k;
    c.tz += (a.z - c.tz) * k;
    c.tdist += (Math.max(38, 70 - a.w * 0.5) - c.tdist) * k;
    c.tyaw += dt * 0.05;
  }

  // Survivor cam: when the flown drone dies, jump into the nearest squadmate, else any drone.
  successor(e) {
    const w = this.world;
    let best = 0,
      bd = 1e9;
    for (const sameSquad of [true, false]) {
      for (let i = 0; i < w.count; i++) {
        if (!w.alive[i] || w.team[i] !== this.player) continue;
        if (sameSquad && w.squadOf[i] !== e.squad) continue;
        const d = Math.hypot(w.px[i] - e.x, w.pz[i] - e.z);
        if (d < bd) {
          bd = d;
          best = w.uid[i];
        }
      }
      if (best) return best;
    }
    return 0;
  }

  startPilot() {
    if (this.spectator) return;
    const w = this.world,
      c = this.view.cam;
    let best = 0,
      bd = 1e9;
    for (const u of this.selectedUids()) {
      const i = w.uidMap.get(u);
      const d = Math.hypot(w.px[i] - c.x, w.pz[i] - c.z) - (w.rs(i).weapon ? 5 : 0);
      if (d < bd) {
        bd = d;
        best = u;
      }
    }
    if (!best) return this.alert('Select a drone first, then press Enter to fly it', 'info');
    this.setPlacing(null);
    this.setTargeting(null);
    this.pilot.start(best);
    const i = w.uidMap.get(best);
    this.alert(
      `Flying a ${w.rs(i).label.toLowerCase()} — ${this.touch ? 'left stick throttle/yaw · right stick pitch/roll' : 'W/S throttle · A/D yaw · I/K pitch · J/L roll'}`,
      'info',
    );
  }

  finish(winner) {
    if (this.ended) return;
    this.ended = true;
    const w = this.world;
    if (this.replayCmds) {
      const expected = this.replayData.hashes?.at(-1);
      const got = this.session.hashes.find(([t]) => expected && t === expected[0]);
      $('end-eyebrow').textContent = 'Replay complete';
      $('end-title').textContent =
        expected && got
          ? got[1] === expected[1]
            ? 'Verified: identical outcome ✓'
            : 'Desync: outcome differs ✗'
          : 'Replay finished';
    } else if (w.result) {
      const r = w.result;
      let record = '';
      if (r.race && winner === 0) {
        const best = store.get('race-best');
        if (!best || r.time < best.time) {
          store.set('race-best', { time: r.time, frames: this.ghostFrames });
          record = best ? ` · new record (was ${best.time.toFixed(2)} s)` : ' · first record';
        } else record = ` · best ${best.time.toFixed(2)} s`;
      }
      if (r.challenge && r.stars) {
        const stars = store.get('challenge-stars', {});
        if ((stars[r.challenge] || 0) < r.stars) {
          stars[r.challenge] = r.stars;
          store.set('challenge-stars', stars);
          record = ' · new best';
        }
      }
      if (this.scenario?.key === 'survival') {
        const best = store.get('survival-best', 0);
        if (r.score > best) {
          store.set('survival-best', r.score);
          record = ' · new record';
        }
      }
      $('end-eyebrow').textContent = winner === this.player ? 'Complete' : 'Over';
      $('end-title').textContent = r.title;
      this.endDetail = (r.detail || '') + record;
    } else if (this.spectator) {
      $('end-eyebrow').textContent = 'Arena result';
      $('end-title').textContent = `${TEAM_NAMES[winner]} swarm wins`;
    } else {
      $('end-eyebrow').textContent = winner === this.player ? 'Victory' : 'Defeat';
      $('end-title').textContent =
        winner === this.player ? 'Enemy core destroyed' : 'Your core has fallen';
    }
    const rows = [['Duration', fmtTime(w.tick)]];
    if (this.endDetail) rows.unshift(['Result', this.endDetail]);
    w.teams.forEach((t, i) => {
      rows.push([`${TEAM_NAMES[i]} kills / losses`, `${t.kills} / ${t.losses}`]);
      rows.push([`${TEAM_NAMES[i]} energy spent`, Math.round(t.spent)]);
    });
    rows.push(['Final state hash', w.hash()]);
    $('end-stats').innerHTML = rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
    setTimeout(() => ($('end').hidden = false), 1600);
  }

  // ---------- commands ----------

  selectedUids() {
    const w = this.world,
      out = [];
    for (const u of this.view.selected) {
      const i = w.uidMap.get(u);
      if (i !== undefined && w.alive[i]) out.push(u);
      else this.view.selected.delete(u);
    }
    return out;
  }

  selectedSquads() {
    const w = this.world,
      ids = new Set();
    for (const u of this.selectedUids()) ids.add(w.squadOf[w.uidMap.get(u)]);
    return [...ids].map((id) => w.squadMap.get(id)).filter(Boolean);
  }

  order(play, x, z) {
    const uids = this.selectedUids();
    if (!uids.length) return;
    this.issue({ type: 'order', uids, play, x, z });
    this.view.ping(x, z, play === 'attack' || play === 'pincer' ? '#ff7a60' : '#7dffb0');
  }

  selectionCenter() {
    const w = this.world;
    let x = 0,
      z = 0,
      n = 0;
    for (const u of this.selectedUids()) {
      const i = w.uidMap.get(u);
      x += w.px[i];
      z += w.pz[i];
      n++;
    }
    return n ? { x: x / n, z: z / n } : null;
  }

  core() {
    return this.world.structures.find((s) => s.team === this.player && s.kind === 'core');
  }

  immediatePlay(play) {
    if (play === 'hold') {
      const c = this.selectionCenter();
      if (c) this.order('hold', c.x, c.z);
    } else if (play === 'retreat') {
      const core = this.core();
      if (core) this.order('retreat', core.x, core.z);
    } else this.setTargeting(play);
  }

  useAbility(key) {
    if (this.spectator) return;
    const d = ABILITIES[key];
    if (this.world.teams[this.player].ab[key] > 0) return;
    if (!d.targeted) return this.issue({ type: 'ability', key });
    this.placing = null;
    this.view.setPlacement(null);
    this.targetPlay = null;
    this.targetAbility = key;
    document.body.classList.add('targeting');
    this.modeHint(
      `${d.label}: ${this.touch ? 'tap' : 'click'} a visible point · ${this.touch ? 'tap ✕' : 'right-click or Esc'} to cancel`,
    );
  }

  setTargeting(play) {
    if (!this.selectedUids().length) return;
    this.placing = null;
    this.view.setPlacement(null);
    this.targetPlay = play;
    this.targetAbility = null;
    document.body.classList.toggle('targeting', !!play);
    this.modeHint(
      play
        ? `${play[0].toUpperCase() + play.slice(1)}: click a target point · right-click or Esc to cancel`
        : null,
    );
  }

  setPlacing(kind) {
    if (this.spectator) return;
    this.targetPlay = null;
    this.placing = kind;
    document.body.classList.toggle('targeting', !!kind);
    if (!kind) this.view.setPlacement(null);
    this.modeHint(
      kind
        ? `Place ${STRUCTURES[kind].label} inside your power grid · Shift to place several · Esc to cancel`
        : null,
    );
    this.updatePlacement();
  }

  updatePlacement() {
    if (!this.placing) return;
    const p = this.view.groundAt(this.mouse.x, this.mouse.y);
    if (!p) return;
    const check = this.world.canPlace(this.player, this.placing, p.x, p.z);
    this.placeCheck = { ...check, x: check.x ?? p.x, z: check.z ?? p.z };
    this.view.setPlacement(this.placing, this.placeCheck.x, this.placeCheck.z, check.ok);
    this.modeHint(
      check.ok
        ? `Place ${STRUCTURES[this.placing].label} — click to build`
        : `${STRUCTURES[this.placing].label}: ${check.reason}`,
    );
  }

  modeHint(text) {
    $('mode-hint').hidden = !text;
    if (text) $('mode-hint').textContent = text;
  }

  produce(role, count = 1, structure) {
    for (let k = 0; k < count; k++) this.issue({ type: 'produce', role, structure });
  }

  // ---------- input ----------

  bindInput() {
    this.abort = new AbortController();
    const opt = { signal: this.abort.signal };
    const canvas = $('view');
    let down = null;
    let lastClick = { t: 0, i: -1 };
    canvas.addEventListener('contextmenu', (e) => e.preventDefault(), opt);
    canvas.addEventListener(
      'pointerdown',
      (e) => {
        canvas.setPointerCapture(e.pointerId);
        if (e.pointerType === 'touch') return this.touchDown(e);
        if (this.pilot.active) {
          if (e.button === 0) this.mouseFire = true;
          return;
        }
        down = { x: e.clientX, y: e.clientY, button: e.button, moved: false, shift: e.shiftKey };
      },
      opt,
    );
    addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType === 'touch') return this.touchMove(e);
        this.mouse = { x: e.clientX, y: e.clientY, inside: true };
        if (this.placing) this.updatePlacement();
        if (!down) return;
        const dx = e.clientX - down.x,
          dy = e.clientY - down.y;
        if (Math.hypot(dx, dy) > 6) down.moved = true;
        if (
          down.button === 0 &&
          down.moved &&
          !this.placing &&
          !this.targetPlay &&
          !this.spectator
        ) {
          const b = $('box');
          b.hidden = false;
          Object.assign(b.style, {
            left: Math.min(down.x, e.clientX) + 'px',
            top: Math.min(down.y, e.clientY) + 'px',
            width: Math.abs(dx) + 'px',
            height: Math.abs(dy) + 'px',
          });
        } else if (down.button === 2 && down.moved) {
          const s = this.view.cam.dist * 0.0016;
          this.view.pan(-e.movementX * s, e.movementY * s);
          this.director = false;
          $('btn-director').classList.remove('on');
        } else if (down.button === 1) {
          this.view.cam.tyaw -= e.movementX * 0.006;
        }
      },
      opt,
    );
    addEventListener(
      'pointerup',
      (e) => {
        if (e.pointerType === 'touch') return this.touchUp(e);
        if (e.button === 0) this.mouseFire = false;
        if (!down) return;
        const d = down;
        down = null;
        $('box').hidden = true;
        if (d.button === 0) {
          const p = this.view.groundAt(e.clientX, e.clientY);
          if (this.placing) {
            if (p && this.placeCheck?.ok) {
              this.issue({
                type: 'build',
                kind: this.placing,
                x: this.placeCheck.x,
                z: this.placeCheck.z,
              });
              this.view.ping(this.placeCheck.x, this.placeCheck.z, '#7dffb0');
              if (!e.shiftKey) this.setPlacing(null);
            }
            return;
          }
          if (this.targetAbility) {
            if (p) this.fireAbility(p);
            return;
          }
          if (this.targetPlay) {
            if (p) this.order(this.targetPlay, p.x, p.z);
            if (!e.shiftKey) this.setTargeting(null);
            return;
          }
          if (this.spectator) return;
          if (d.moved) this.boxSelect(d.x, d.y, e.clientX, e.clientY, d.shift);
          else {
            const i = this.view.droneAt(e.clientX, e.clientY);
            const now = performance.now();
            if (i >= 0 && lastClick.i === i && now - lastClick.t < 350) this.selectRoleOnScreen(i);
            else this.clickSelect(i, p, d.shift);
            lastClick = { t: now, i };
          }
        } else if (d.button === 2 && !d.moved) {
          if (this.placing) return this.setPlacing(null);
          if (this.targetPlay || this.targetAbility) return this.setTargeting(null);
          this.contextOrder(e.clientX, e.clientY);
        }
      },
      opt,
    );
    addEventListener(
      'pointercancel',
      (e) => e.pointerType === 'touch' && this.touchUp(e, true),
      opt,
    );
    $('touch-box').onclick = () => {
      this.boxMode = !this.boxMode;
      $('touch-box').classList.toggle('on', this.boxMode);
    };
    $('touch-all').onclick = () => {
      const w = this.world;
      this.view.selected = new Set();
      for (let i = 0; i < w.count; i++)
        if (w.alive[i] && w.team[i] === this.player) this.view.selected.add(w.uid[i]);
      this.selStruct = null;
    };
    $('touch-clear').onclick = () => {
      this.view.selected = new Set();
      this.selStruct = null;
      this.setTargeting(null);
      this.setPlacing(null);
    };
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.view.cam.tdist *= Math.exp(e.deltaY * 0.0012);
      },
      { ...opt, passive: false },
    );
    document.addEventListener('mouseleave', () => (this.mouse.inside = false), opt);
    addEventListener('blur', () => this.keys.clear(), opt);
    addEventListener(
      'resize',
      () => {
        this.view.resize();
        if (this.pilot.active) this.pilot.resize();
      },
      opt,
    );
    addEventListener('keydown', (e) => this.onKey(e), opt);
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()), opt);
    // Tooltips for anything with data-tip.
    const tip = $('tooltip');
    addEventListener(
      'mouseover',
      (e) => {
        const t = e.target.closest?.('[data-tip]');
        if (!t) return (tip.hidden = true);
        tip.innerHTML = t.dataset.tip;
        tip.hidden = false;
        const r = t.getBoundingClientRect();
        tip.style.left = Math.max(8, Math.min(innerWidth - 290, r.left)) + 'px';
        tip.style.top = Math.max(8, r.top - tip.offsetHeight - 8) + 'px';
      },
      opt,
    );
    $('speed').onclick = (e) => {
      const b = e.target.closest('button');
      if (b) this.setSpeed(Number(b.dataset.speed));
    };
    $('btn-menu').onclick = () => this.togglePause();
    $('btn-director').onclick = () => {
      this.director = !this.director;
      $('btn-director').classList.toggle('on', this.director);
    };
    $('btn-fog').onclick = () => {
      this.view.fogOn = !this.view.fogOn;
      $('btn-fog').classList.toggle('on', this.view.fogOn);
      if (this.view.fogOn) this.view.updateFog();
    };
  }

  // ---------- touch ----------
  // One finger: drag pans (or box-selects in Select mode), tap selects or orders, long-press
  // attack-moves. Two fingers: pinch to zoom, twist to rotate, drag to pan.

  enableTouch() {
    if (this.touch) return;
    this.touch = true;
    document.body.classList.add('touch');
  }

  touchDown(e) {
    this.enableTouch();
    if (!this.touches) this.touches = new Map();
    this.touches.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      sx: e.clientX,
      sy: e.clientY,
      t: performance.now(),
    });
    clearTimeout(this.longPress);
    if (this.touches.size === 1) {
      this.gesture = 'tap';
      this.longPress = setTimeout(() => {
        const cur = this.touches.get(e.pointerId);
        if (this.gesture !== 'tap' || !cur || Math.hypot(cur.x - cur.sx, cur.y - cur.sy) > 10)
          return;
        this.gesture = 'done';
        const p = this.view.groundAt(e.clientX, e.clientY);
        if (p && this.selectedUids().length && !this.spectator) this.order('attack', p.x, p.z);
      }, 520);
    } else if (this.touches.size === 2) {
      this.gesture = 'pinch';
      $('box').hidden = true;
      this.pinch = this.pinchState();
    }
  }

  pinchState() {
    const [a, b] = [...this.touches.values()];
    return {
      d: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      a: Math.atan2(b.y - a.y, b.x - a.x),
      mx: (a.x + b.x) / 2,
      my: (a.y + b.y) / 2,
    };
  }

  touchMove(e) {
    const t = this.touches?.get(e.pointerId);
    if (!t) return;
    const dx = e.clientX - t.x,
      dy = e.clientY - t.y;
    t.x = e.clientX;
    t.y = e.clientY;
    const c = this.view.cam;
    if (this.gesture === 'pinch' && this.touches.size >= 2) {
      const now = this.pinchState(),
        before = this.pinch;
      c.tdist *= before.d / now.d;
      let da = now.a - before.a;
      if (da > Math.PI) da -= Math.PI * 2;
      if (da < -Math.PI) da += Math.PI * 2;
      c.tyaw -= da;
      const s = c.dist * 0.0016;
      this.view.pan(-(now.mx - before.mx) * s, (now.my - before.my) * s);
      this.pinch = now;
      return;
    }
    if (this.touches.size !== 1) return;
    if (this.gesture === 'tap' && Math.hypot(e.clientX - t.sx, e.clientY - t.sy) > 10)
      this.gesture = this.boxMode && !this.spectator ? 'box' : 'pan';
    if (this.gesture === 'pan') {
      const s = c.dist * 0.0016;
      this.view.pan(-dx * s, dy * s);
      this.director = false;
      $('btn-director').classList.remove('on');
    } else if (this.gesture === 'box') {
      const b = $('box');
      b.hidden = false;
      Object.assign(b.style, {
        left: Math.min(t.sx, e.clientX) + 'px',
        top: Math.min(t.sy, e.clientY) + 'px',
        width: Math.abs(e.clientX - t.sx) + 'px',
        height: Math.abs(e.clientY - t.sy) + 'px',
      });
    }
  }

  touchUp(e, cancelled = false) {
    const t = this.touches?.get(e.pointerId);
    if (!t) return;
    this.touches.delete(e.pointerId);
    clearTimeout(this.longPress);
    if (this.touches.size) {
      if (this.gesture === 'pinch' && this.touches.size === 1) this.gesture = 'done';
      return;
    }
    $('box').hidden = true;
    const g = this.gesture;
    this.gesture = null;
    if (cancelled || this.spectator) return;
    if (g === 'box') return this.boxSelect(t.sx, t.sy, e.clientX, e.clientY, false);
    if (g !== 'tap') return;
    this.tap(e.clientX, e.clientY);
  }

  tap(x, y) {
    const p = this.view.groundAt(x, y);
    if (this.placing) {
      if (p) this.updatePlacementAt(x, y);
      if (p && this.placeCheck?.ok) {
        this.issue({
          type: 'build',
          kind: this.placing,
          x: this.placeCheck.x,
          z: this.placeCheck.z,
        });
        this.view.ping(this.placeCheck.x, this.placeCheck.z, '#7dffb0');
        this.setPlacing(null);
      }
      return;
    }
    if (this.targetAbility) {
      if (p) this.fireAbility(p);
      return;
    }
    if (this.targetPlay) {
      if (p) this.order(this.targetPlay, p.x, p.z);
      this.setTargeting(null);
      return;
    }
    const w = this.world;
    const i = this.view.droneAt(x, y, 26);
    const now = performance.now();
    if (i >= 0 && w.team[i] === this.player) {
      if (this.lastTap?.i === i && now - this.lastTap.t < 350) this.selectRoleOnScreen(i);
      else this.clickSelect(i, p, false);
      this.lastTap = { i, t: now };
      return;
    }
    this.lastTap = null;
    if (this.selectedUids().length) return this.contextOrder(x, y);
    this.clickSelect(-1, p, false);
  }

  fireAbility(p) {
    const key = this.targetAbility;
    this.issue({ type: 'ability', key, x: p.x, z: p.z });
    this.view.ping(p.x, p.z, key === 'emp' ? '#7fc8ff' : '#7dffb0');
    this.setTargeting(null);
  }

  updatePlacementAt(x, y) {
    this.mouse = { x, y, inside: false };
    this.updatePlacement();
  }

  onKey(e) {
    if (e.target.closest?.('input, textarea, select')) return;
    const k = e.key.toLowerCase();
    this.keys.add(k);
    if (this.pilot.active && $('pause').hidden) {
      if (this.pilot.onKey(e)) return;
    }
    if (k === 'enter' && !this.pilot.active && $('pause').hidden && !this.ended)
      return this.startPilot();
    if (k === 'escape') {
      if (this.placing) return this.setPlacing(null);
      if (this.targetPlay || this.targetAbility) return this.setTargeting(null);
      if (!$('script').hidden) return this.script.close();
      return this.togglePause();
    }
    if (this.ended || !$('pause').hidden) return;
    const fkey = /^F([1-3])$/.exec(e.key)?.[1];
    if (fkey && !this.spectator) {
      e.preventDefault();
      return this.useAbility(ABILITY_KEYS[Number(fkey) - 1]);
    }
    const digit = /^Digit([1-9])$/.exec(e.code)?.[1];
    if (digit) {
      e.preventDefault();
      if (e.shiftKey && !this.spectator) {
        const role = this.producible()[Number(digit) - 1];
        if (role !== undefined) this.produce(role, 1);
      } else if (e.ctrlKey || e.altKey || e.metaKey) {
        this.groups[digit] = this.selectedUids();
        this.alert(`Group ${digit} assigned (${this.groups[digit].length} drones)`, 'info');
      } else this.recallGroup(digit);
      return;
    }
    if (e.ctrlKey || e.metaKey) return;
    if (k === ' ') {
      e.preventDefault();
      if (this.lastAlert) this.view.lookAt(this.lastAlert.x, this.lastAlert.z);
      return;
    }
    if (k === 'home') {
      const c = this.core() || this.world.map.starts[this.player];
      this.view.lookAt(c.x, c.z);
      return;
    }
    if (this.spectator) return;
    if (BUILD_KEYS[k]) return this.setPlacing(BUILD_KEYS[k]);
    if (PLAY_KEYS[k]) return this.setTargeting(PLAY_KEYS[k]);
    if (k === 'h') return this.immediatePlay('hold');
    if (k === 'r') return this.immediatePlay('retreat');
    if (k === 'f') return this.cycleFormation();
    if (k === 'g') {
      const sq = this.selectedSquads()[0];
      if (sq) this.script.open(sq);
    }
  }

  handleHeldKeys(dt) {
    if (this.pilot.active) return;
    const c = this.view.cam,
      s = c.dist * 0.9 * dt;
    let dx = 0,
      dz = 0;
    if (this.keys.has('arrowleft')) dx -= s;
    if (this.keys.has('arrowright')) dx += s;
    if (this.keys.has('arrowup')) dz += s;
    if (this.keys.has('arrowdown')) dz -= s;
    if (this.keys.has('q')) c.tyaw += dt * 1.6;
    if (this.keys.has('e')) c.tyaw -= dt * 1.6;
    const m = this.mouse,
      edge = 6;
    if (m.inside && document.hasFocus() && $('pause').hidden && $('menu').hidden) {
      if (m.x <= edge) dx -= s;
      if (m.x >= innerWidth - edge) dx += s;
      if (m.y <= edge) dz += s;
      if (m.y >= innerHeight - edge) dz -= s;
    }
    if (dx || dz) {
      this.view.pan(dx, dz);
      if (this.director) {
        this.director = false;
        $('btn-director').classList.remove('on');
      }
    }
  }

  recallGroup(digit) {
    const uids = (this.groups[digit] || []).filter((u) => this.world.uidMap.has(u));
    if (!uids.length) return;
    const now = performance.now();
    this.view.selected = new Set(uids);
    this.selStruct = null;
    if (this.lastRecall?.digit === digit && now - this.lastRecall.t < 400) {
      const c = this.selectionCenter();
      if (c) this.view.lookAt(c.x, c.z);
    }
    this.lastRecall = { digit, t: now };
  }

  clickSelect(i, p, add) {
    const w = this.world;
    if (!add) this.view.selected = new Set();
    this.selStruct = null;
    if (i >= 0 && w.team[i] === this.player) {
      const sq = w.squadMap.get(w.squadOf[i]);
      for (const m of sq?.members || [i]) this.view.selected.add(w.uid[m]);
      return;
    }
    if (p) {
      const s = this.view.structureAt(p.x, p.z);
      if (s) {
        this.view.selected = new Set();
        this.selStruct = s.id;
      }
    }
  }

  selectRoleOnScreen(i) {
    const w = this.world,
      role = w.role[i];
    const all = this.view
      .dronesInRect(0, 0, innerWidth, innerHeight, this.player)
      .filter((j) => w.role[j] === role);
    this.view.selected = new Set(all.map((j) => w.uid[j]));
    this.selStruct = null;
  }

  boxSelect(x0, y0, x1, y1, add) {
    const found = this.view.dronesInRect(x0, y0, x1, y1, this.player);
    if (!add) this.view.selected = new Set();
    for (const i of found) this.view.selected.add(this.world.uid[i]);
    if (found.length) this.selStruct = null;
  }

  contextOrder(sx, sy) {
    const p = this.view.groundAt(sx, sy);
    if (!p) return;
    const w = this.world;
    if (!this.selectedUids().length) {
      const s = this.selStruct !== null && w.structMap.get(this.selStruct);
      if (s && STRUCTURES[s.kind].produces) {
        this.issue({ type: 'rally', x: p.x, z: p.z });
        this.view.ping(p.x, p.z, '#ffd27a');
        this.alert('Rally point set', 'info');
      }
      return;
    }
    const i = this.view.droneAt(sx, sy);
    const enemyDrone = i >= 0 && w.team[i] !== this.player;
    const s = this.view.structureAt(p.x, p.z);
    const enemyStruct = s && s.team !== this.player;
    if (enemyDrone) this.order('attack', w.px[i], w.pz[i]);
    else if (enemyStruct) this.order('attack', s.x, s.z);
    else this.order('move', p.x, p.z);
  }

  cycleFormation() {
    const squads = this.selectedSquads();
    if (!squads.length) return;
    const next = FORMATIONS[(FORMATIONS.indexOf(squads[0].formation) + 1) % FORMATIONS.length];
    for (const sq of squads) this.issue({ type: 'formation', squad: sq.id, formation: next });
  }

  setSpeed(v) {
    this.speed = v;
    for (const b of $('speed').querySelectorAll('button'))
      b.classList.toggle('on', Number(b.dataset.speed) === v);
  }

  togglePause() {
    if (this.ended) return;
    const show = $('pause').hidden;
    $('pause').hidden = !show;
    if (show) {
      this.prevSpeed = this.speed || 1;
      this.setSpeed(0);
    } else this.setSpeed(this.prevSpeed || 1);
  }

  alert(text, kind = '') {
    const li = document.createElement('li');
    li.textContent = text;
    if (kind) li.className = kind;
    $('alerts').prepend(li);
    while ($('alerts').children.length > 5) $('alerts').lastChild.remove();
    setTimeout(() => li.remove(), 5500);
  }

  // ---------- HUD ----------

  // Roles this player can ever produce (base units + own designs), in button order.
  producible() {
    const w = this.world;
    return w.roles
      .map((r, i) => [r, i])
      .filter(([r]) => !r.spawnOnly && (!r.design || r.owner === this.player))
      .map(([, i]) => i);
  }

  buildCommandPanel() {
    const bg = $('build-grid');
    bg.textContent = '';
    const keyFor = Object.fromEntries(Object.entries(BUILD_KEYS).map(([k, v]) => [v, k]));
    this.buildButtons = Object.keys(STRUCTURES)
      .filter((k) => k !== 'core' && !STRUCTURES[k].neutral)
      .map((kind) => {
        const b = document.createElement('button');
        b.className = 'cmd';
        b.dataset.tip = structTip(kind);
        const key = keyFor[kind] ? `<kbd>${keyFor[kind].toUpperCase()}</kbd>` : '';
        b.innerHTML = `<span>${STRUCTURES[kind].label.replace(' Field', '').replace(' Tower', '')}${key}</span><span class="cost">${STRUCTURES[kind].cost}</span>`;
        b.onclick = () => {
          this.setPlacing(kind);
          document.body.classList.remove('cmd-open');
        };
        bg.append(b);
        return { b, kind };
      });
    this.buildProduceButtons();
    const rg = $('research-grid');
    rg.textContent = '';
    this.researchButtons = TECH_KEYS.map((key) => {
      const b = document.createElement('button');
      b.className = 'cmd';
      b.onclick = () => this.issue({ type: 'research', tech: key });
      rg.append(b);
      return { b, key };
    });
    for (const tab of document.querySelectorAll('#commands .tab'))
      tab.onclick = () => this.showTab(tab.dataset.tab);
    $('cmd-toggle').onclick = () => document.body.classList.toggle('cmd-open');
    const ab = $('abilities');
    ab.textContent = '';
    ab.hidden = this.spectator;
    this.abilityButtons = ABILITY_KEYS.map((key, k) => {
      const d = ABILITIES[key];
      const b = document.createElement('button');
      b.className = 'ability';
      b.dataset.tip = `<b>${d.label} (F${k + 1})</b>${esc(d.blurb)}<div class="stat">cooldown ${d.cooldown}s · recharges faster while you're outnumbered</div>`;
      b.innerHTML = `${d.short}<br /><small>F${k + 1}</small><span class="t"></span><span class="cool"></span>`;
      b.onclick = () => this.useAbility(key);
      ab.append(b);
      return { b, key };
    });
    this.showTab(this.tab || 'build');
  }

  buildProduceButtons() {
    const pg = $('produce-grid');
    pg.textContent = '';
    const stats = this.world.roleStats[this.player];
    this.produceButtons = this.producible().map((role, k) => {
      const r = stats[role];
      const b = document.createElement('button');
      b.className = 'cmd';
      b.dataset.tip = roleTip(r);
      const key = k < 9 ? `<kbd>⇧${k + 1}</kbd>` : '';
      b.innerHTML = `<span>${esc(r.label)}${key}</span><span class="cost">${r.cost * r.pack} ×${r.pack}</span>`;
      b.onclick = (e) => this.produce(role, e.shiftKey ? 5 : 1, this.producerTarget());
      pg.append(b);
      return { b, role };
    });
    this.produceKey = this.world.roles.length;
  }

  showTab(name) {
    this.tab = name;
    for (const t of document.querySelectorAll('#commands .tab'))
      t.classList.toggle('on', t.dataset.tab === name);
    for (const p of document.querySelectorAll('#commands [data-pane]'))
      p.hidden = p.dataset.pane !== name;
    const hints = {
      build: 'Structures go inside your power grid (near the core or a Relay Tower).',
      produce: 'Shift-click queues five. Select a Core or Fabricator to queue there.',
      research: 'Needs a Research Lab. One project per lab at a time.',
    };
    $('pane-hint').textContent = hints[name];
  }

  producerTarget() {
    const s = this.selStruct !== null && this.world.structMap.get(this.selStruct);
    return s && s.team === this.player && STRUCTURES[s.kind].produces ? s.id : undefined;
  }

  updateHud() {
    const w = this.world,
      t = w.teams[this.spectator ? 0 : this.player];
    $('energy').textContent = Math.floor(t.energy);
    $('income').textContent = `+${t.income}/s`;
    $('bandwidth').textContent = `${t.bwUsed}/${t.bwCap}`;
    $('bandwidth').parentElement.classList.toggle('warn', t.bwCap - t.bwUsed < 3);
    let n = 0;
    for (let i = 0; i < w.count; i++)
      if (w.alive[i] && (this.spectator || w.team[i] === this.player)) n++;
    $('dronecount').textContent = n;
    $('clock').textContent = fmtTime(w.tick);
    const st = this.scenario?.status(w);
    $('objective').hidden = !st;
    if (st) {
      $('obj-title').textContent = st.title;
      $('obj-lines').textContent = st.lines.join(' · ');
    }
    if (!this.spectator) {
      for (const { b, kind } of this.buildButtons) {
        b.disabled = t.energy < STRUCTURES[kind].cost;
        b.classList.toggle('on', this.placing === kind);
      }
      const free = t.bwCap - t.bwUsed;
      if (this.produceKey !== w.roles.length) this.buildProduceButtons();
      const tier = unlockedTier(t.tech);
      for (const { b, role } of this.produceButtons) {
        const r = w.roleStats[this.player][role];
        const locked = (r.tier || 1) > tier;
        b.classList.toggle('locked', locked);
        b.disabled = locked || t.energy < r.cost * r.pack || free < r.bw * r.pack;
        b.dataset.tip =
          roleTip(r) +
          (locked ? `<div class="stat">Research Tier ${r.tier} Airframes to unlock</div>` : '');
      }
      const progress = new Map();
      for (const s of w.structures)
        if (s.team === this.player && s.queue[0]?.tech)
          progress.set(s.queue[0].tech, 1 - s.queue[0].left / TECH[s.queue[0].tech].time);
      for (const { b, key } of this.researchButtons) {
        const why = researchBlocker(t, key);
        const done = t.tech.has(key);
        const p = progress.get(key);
        const state = done ? 'done' : p !== undefined ? `p${Math.round(p * 20)}` : why || 'ok';
        if (b.dataset.state === state) continue;
        b.dataset.state = state;
        b.className = 'cmd' + (done ? ' done' : why && p === undefined ? ' locked' : '');
        b.disabled = !!why;
        b.dataset.tip = techTip(key, done ? 'Researched' : p !== undefined ? 'In progress' : why);
        b.innerHTML = `<span>${TECH[key].label}</span>${done ? '<span class="cost">✓ done</span>' : p !== undefined ? `<span class="prog"><i style="width:${Math.round(p * 100)}%"></i></span>` : `<span class="cost${why === 'Not enough energy' ? ' bad' : ''}">${TECH[key].cost} · ${TECH[key].time}s</span>`}`;
      }
      const hasLab = w.structures.some(
        (s) => s.team === this.player && s.kind === 'lab' && s.progress >= 1,
      );
      if (this.tab === 'research' && !hasLab)
        $('pane-hint').textContent = 'Build a Research Lab (L) to start research.';
    }
    if (!this.spectator && t.ab)
      for (const { b, key } of this.abilityButtons) {
        const left = t.ab[key] / 20,
          total = ABILITIES[key].cooldown;
        b.classList.toggle('ready', left <= 0);
        b.classList.toggle(
          'on',
          this.targetAbility === key || (key === 'overcharge' && t.overUntil > w.tick),
        );
        b.querySelector('.cool').style.transform = `scaleY(${Math.min(1, left / total)})`;
        b.querySelector('.t').textContent = left > 0 ? Math.ceil(left) + 's' : '';
      }
    this.renderSelection();
    if (!$('script').hidden && this.script.squad) {
      const sq = w.squadMap.get(this.script.squad.id);
      if (!sq) this.script.close();
      else {
        const firing = sq.reaction ? sq.reaction.index : -1;
        if (firing !== this.lastFiring) {
          this.lastFiring = firing;
          this.script.squad = sq;
          [...$('script').querySelectorAll('.rule')].forEach((el, k) =>
            el.classList.toggle('firing', k === firing),
          );
        }
      }
    }
  }

  renderSelection() {
    const el = $('selection'),
      w = this.world;
    if (this.spectator) {
      const rows = w.teams.map((t, i) => {
        const st = w.stats(i);
        return `<div class="chip" style="border-color:${TEAM_COLORS[i]}"><b style="color:${TEAM_COLORS[i]}">${TEAM_NAMES[i]}</b> ${st.roles.reduce((a, b) => a + b, 0)} drones · +${st.income}/s · kills ${st.kills}</div>`;
      });
      el.innerHTML = `<div class="sel-head"><h3>${this.replayCmds ? 'Replay' : 'Autonomous Arena'}</h3><span class="meta">${DIFFICULTY[this.difficulty]?.label || ''} vs ${DIFFICULTY[this.difficulty]?.label || ''} · seed ${this.session.config.seed}</span></div><div class="chips">${rows.join('')}</div><p class="empty">Right-drag to pan, wheel to zoom, 🎥 toggles the auto-director, ◐ shows Cyan's fog of war.</p>`;
      return;
    }
    const squads = this.selectedSquads();
    const key =
      squads
        .map(
          (s) =>
            `${s.id}:${s.members.length}:${s.formation}:${s.order?.play}:${s.reaction?.index ?? -1}:${s.altitude}`,
        )
        .join('|') +
      '#' +
      this.selStruct +
      '#' +
      this.selectedUids().length +
      '#' +
      (this.selStruct !== null
        ? JSON.stringify(
            w.structMap.get(this.selStruct)?.queue.map((q) => [q.role, Math.round(q.left)]),
          )
        : '');
    if (key === this.selKey) return;
    this.selKey = key;
    if (squads.length) return this.renderSquadPanel(el, squads);
    const s = this.selStruct !== null && w.structMap.get(this.selStruct);
    if (s) return this.renderStructurePanel(el, s);
    el.innerHTML = `<p class="empty">Drag a box over your drones to select them, or click one to grab its squad. Right-click to move · <kbd>A</kbd> attack-move · <kbd>G</kbd> script · build Extractors (<kbd>Z</kbd>) on gold wells, Relays (<kbd>X</kbd>) for bandwidth.</p>`;
  }

  renderSquadPanel(el, squads) {
    const w = this.world;
    const counts = new Array(w.roles.length).fill(0);
    let bat = 0;
    let hp = 0,
      max = 0;
    for (const u of this.selectedUids()) {
      const i = w.uidMap.get(u);
      counts[w.role[i]]++;
      hp += w.hp[i];
      max += w.rs(i).hp;
      bat += w.bat[i];
    }
    const sq = squads[0];
    const names =
      squads.length > 3
        ? `${squads
            .slice(0, 3)
            .map((s) => s.name)
            .join(', ')} +${squads.length - 3}`
        : squads.map((s) => s.name).join(', ');
    const rule = sq.reaction && sq.rules[sq.reaction.index];
    const chips = counts
      .map((c, r) =>
        c
          ? `<span class="chip" data-tip='${roleTip(w.roleStats[this.player][r]).replace(/'/g, '&#39;')}'><b>${c}</b> ${esc(w.roles[r].label)}</span>`
          : '',
      )
      .join('');
    const play = sq.order?.play || 'hold';
    const playBtns = ['move', 'attack', 'pincer', 'patrol', 'orbit', 'hold', 'retreat']
      .map((p) => {
        const key = {
          move: 'RMB',
          attack: 'A',
          pincer: 'P',
          patrol: 'T',
          orbit: 'O',
          hold: 'H',
          retreat: 'R',
        }[p];
        return `<button class="btn ${p === play && squads.length === 1 ? 'on' : ''}" data-play="${p}" data-tip="<b>${p}</b>${esc(PLAY_INFO[p])}">${p}<kbd>${key}</kbd></button>`;
      })
      .join('');
    const formBtns = FORMATIONS.map(
      (f) => `<button class="btn ${f === sq.formation ? 'on' : ''}" data-form="${f}">${f}</button>`,
    ).join('');
    el.innerHTML = `
      <div class="sel-head">
        <h3>${esc(names)}</h3>
        <span class="meta">${this.selectedUids().length} drones · ${Math.round((hp / max) * 100)}% hp · ${Math.round((bat / this.selectedUids().length) * 100)}% battery${squads.length > 1 ? ' · orders will merge them into one squad' : ''}</span>
        ${rule ? `<span class="chip firing">⚡ Rule ${sq.reaction.index + 1}: ${ACTIONS[rule.then].label}</span>` : ''}
        <span class="spacer"></span>
        <button class="btn" id="btn-fly" data-tip="<b>Fly it yourself</b>Take the sticks of one drone: throttle, yaw, pitch and roll. Its squad keeps fighting on autopilot.">Fly ✈ <kbd>Enter</kbd></button>
        <button class="btn primary" id="btn-script" ${squads.length > 1 ? 'disabled' : ''} data-tip="<b>Reaction script</b>Give this squad when→then rules so it adapts on its own.">Script <kbd>G</kbd></button>
      </div>
      <div class="chips">${chips}</div>
      <div class="btn-row"><span class="label">Play</span>${playBtns}</div>
      <div class="btn-row"><span class="label">Formation</span>${formBtns}</div>
      <div class="btn-row"><span class="label">Altitude</span>${['Low', 'Cruise', 'High']
        .map(
          (l, k) =>
            `<button class="btn ${sq.altitude === k ? 'on' : ''}" data-alt="${k}" data-tip="<b>${l}</b>${['Nap of the earth: under radar detection, but within reach of every ground field.', 'Normal flight height for this airframe.', 'Above kill zones, jammer and repair fields (14 m). Sees farther, burns more battery climbing.'][k]}">${l}</button>`,
        )
        .join('')}</div>`;
    el.querySelectorAll('[data-play]').forEach(
      (b) => (b.onclick = () => this.immediatePlay(b.dataset.play)),
    );
    el.querySelectorAll('[data-form]').forEach(
      (b) =>
        (b.onclick = () => {
          for (const s of squads)
            this.issue({ type: 'formation', squad: s.id, formation: b.dataset.form });
        }),
    );
    el.querySelector('#btn-script').onclick = () => this.script.open(sq);
    el.querySelectorAll('[data-alt]').forEach(
      (b) =>
        (b.onclick = () => {
          for (const q of squads)
            this.issue({ type: 'altitude', squad: q.id, level: Number(b.dataset.alt) });
        }),
    );
    el.querySelector('#btn-fly').onclick = () => this.startPilot();
  }

  renderStructurePanel(el, s) {
    const def = STRUCTURES[s.kind];
    const own = s.team === this.player;
    const queue = s.queue
      .map((q, k) => {
        if (q.tech) {
          const pct = Math.round((1 - q.left / TECH[q.tech].time) * 100);
          return `<span class="q">${TECH[q.tech].label}<i style="width:${pct}%"></i></span>`;
        }
        const r = this.world.roleStats[s.team][q.role];
        const pct = k === 0 ? Math.round((1 - q.left / r.build) * 100) : 0;
        return `<span class="q">${esc(r.label)} ×${r.pack}<i style="width:${pct}%"></i></span>`;
      })
      .join('');
    el.innerHTML = `
      <div class="sel-head">
        <h3 style="color:${TEAM_COLORS[s.team]}">${def.label}</h3>
        <span class="meta">${Math.ceil(s.hp)} / ${s.maxHp} hp${s.progress < 1 ? ` · building ${Math.round(s.progress * 100)}%` : ''}</span>
      </div>
      <p class="empty">${esc(def.blurb)}</p>
      ${own && def.research ? `<div class="btn-row"><span class="label">Project</span>${queue || '<span class="empty">idle — pick a project in the Research tab</span>'}${s.queue.length ? '<button class="btn" id="btn-cancel">Cancel</button>' : ''}</div>` : ''}
      ${own && def.produces ? `<div class="btn-row"><span class="label">Queue</span>${queue || '<span class="empty">empty — use Produce (bottom right) to build here</span>'}${s.queue.length ? '<button class="btn" id="btn-cancel">Cancel last</button>' : ''}</div><p class="empty">Right-click the ground to set the rally point for new drones.</p>` : ''}`;
    el.querySelector('#btn-cancel')?.addEventListener('click', () =>
      this.issue({ type: 'cancel', structure: s.id }),
    );
  }

  saveReplay() {
    const data = JSON.stringify(this.session.replay());
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = `fleet-commander-replay-${this.session.config.seed}-${this.world.tick}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}

// ---------- menus ----------

function start(opts) {
  game?.destroy();
  $('end').hidden = $('pause').hidden = true;
  try {
    game = new Game({
      difficulty: $('opt-diff').value,
      quality: $('opt-quality').value,
      seed: Math.max(1, Number($('opt-seed').value) | 0),
      map: $('opt-map').value,
      ...opts,
    });
    window.__game = game;
  } catch (err) {
    console.error(err);
    $('menu').hidden = false;
    document.querySelector('#menu .tag').textContent = `Could not start: ${err.message}`;
  }
}

let game = null;
for (const b of document.querySelectorAll('[data-start]'))
  b.onclick = () => start({ mode: b.dataset.start });

// Menu: personal bests and the challenge list.
function refreshMenu() {
  const stars = store.get('challenge-stars', {});
  const total = Object.values(stars).reduce((a, b) => a + b, 0);
  $('best-challenges').textContent =
    `${Object.keys(CHALLENGES).length} puzzles · ${total}/${Object.keys(CHALLENGES).length * 3} ★`;
  const race = store.get('race-best');
  $('best-race').textContent = race
    ? `Best ${race.time.toFixed(2)} s · beat your ghost`
    : MODES.race.blurb;
  const surv = store.get('survival-best', 0);
  $('best-survival').textContent = surv ? `Best: ${surv} waves` : MODES.survival.blurb;
  const list = $('challenge-list');
  list.innerHTML = Object.entries(CHALLENGES)
    .map(([key, c]) => {
      const n = stars[key] || 0;
      return `<button class="menu-btn" data-challenge="${key}"><strong>${esc(c.label)} <span class="stars">${'★'.repeat(n)}${'☆'.repeat(3 - n)}</span></strong><small>${esc(c.blurb)}</small><small>${esc(c.starText)}</small></button>`;
    })
    .join('');
  for (const b of list.querySelectorAll('[data-challenge]'))
    b.onclick = () => start({ mode: 'challenge', challenge: b.dataset.challenge });
}
$('open-challenges').onclick = () => ($('challenge-list').hidden = !$('challenge-list').hidden);
refreshMenu();
$('replay-file').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const replay = JSON.parse(await file.text());
    if (replay?.kind !== 'fleet-commander-replay')
      throw Error('Not a Fleet Commander replay file.');
    start({ mode: 'replay', replay, difficulty: Object.values(replay.config.ai)[0] || 'normal' });
  } catch (err) {
    document.querySelector('#menu .tag').textContent = err.message;
  }
};
$('btn-resume').onclick = () => game?.togglePause();
$('btn-save-replay').onclick = () => game?.saveReplay();
$('btn-end-replay').onclick = () => game?.saveReplay();
$('btn-surrender').onclick = () => {
  game?.togglePause();
  game?.issue({ type: 'surrender' });
};
const toMenu = () => {
  game?.destroy();
  game = null;
  $('pause').hidden = $('end').hidden = true;
  $('menu').hidden = false;
  refreshMenu();
};
$('btn-quit').onclick = toMenu;
$('btn-end-menu').onclick = toMenu;
const params = new URLSearchParams(location.search);
if (params.get('autostart')) start({ mode: params.get('autostart') });
