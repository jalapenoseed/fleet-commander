// Manual flight: keyboard or gamepad (Mode 2) sticks -> quantized 'stick' commands, plus the
// FPV heads-up display. The sim does the flying; this only reads input and draws instruments.

import { ROLES } from '../sim/defs.js';
import { quantize } from '../sim/flight.js';

const DEADZONE = 0.08;
const RAMP = 5; // stick travel per second when a key is held
const RETURN = 9; // spring-back speed when released

export const PILOT_KEYS = {
  throttle: ['w', 's'],
  yaw: ['d', 'a'],
  pitch: ['i', 'k', 'arrowup', 'arrowdown'],
  roll: ['l', 'j', 'arrowright', 'arrowleft'],
};

const LEARN = {
  throttle: (v) =>
    v > 0
      ? 'Throttle up: all four motors spin faster, thrust beats gravity, you climb.'
      : 'Throttle down: less thrust than weight, so you sink.',
  yaw: () =>
    'Yaw: opposite motor pairs speed up and slow down, the torque spins the drone on the spot. Your nose (and gun) turns; your path does not.',
  pitch: (v) =>
    v > 0
      ? 'Pitch forward: the nose dips, the thrust tilts forward, part of it now pushes you ahead.'
      : 'Pitch back: the nose rises, thrust tilts backward and brakes you.',
  roll: () => 'Roll: the drone leans sideways and the tilted thrust slides it left or right.',
  idle: () =>
    'Sticks centered: angle mode levels the drone and altitude hold keeps it at this height.',
};

export class PilotController {
  constructor(game) {
    this.game = game;
    this.canvas = document.getElementById('pilot-hud');
    this.ctx = this.canvas.getContext('2d');
    this.uid = 0;
    this.sticks = { t: 0, y: 0, p: 0, r: 0 };
    this.fire = false;
    this.sent = '';
    this.mode = 'fpv';
    this.pad = null;
    this.padButtons = [];
    this.lastAxis = 'idle';
  }

  get active() {
    return !!this.uid;
  }

  start(uid) {
    this.uid = uid;
    this.sticks = { t: 0, y: 0, p: 0, r: 0 };
    this.fire = false;
    this.sent = '';
    this.game.issue({ type: 'pilot', uid, on: true });
    this.game.view.setFollow(uid, this.mode);
    document.body.classList.add('piloting');
    this.canvas.hidden = false;
    this.resize();
  }

  stop() {
    if (!this.uid) return;
    const w = this.game.world,
      i = w.uidMap.get(this.uid);
    this.game.issue({ type: 'pilot', on: false });
    this.game.view.setFollow(null);
    if (i !== undefined) this.game.view.lookAt(w.px[i], w.pz[i]);
    this.uid = 0;
    document.body.classList.remove('piloting');
    this.canvas.hidden = true;
  }

  // Swap to another drone without dropping out of the cockpit (used when ours is shot down).
  transfer(uid) {
    this.uid = uid;
    this.sent = '';
    this.game.issue({ type: 'pilot', uid, on: true });
    this.game.view.setFollow(uid, this.mode);
  }

  toggleCamera() {
    this.mode = this.mode === 'fpv' ? 'chase' : 'fpv';
    if (this.uid) this.game.view.setFollow(this.uid, this.mode);
  }

  resize() {
    const pr = Math.min(2, devicePixelRatio || 1);
    this.canvas.width = innerWidth * pr;
    this.canvas.height = innerHeight * pr;
    this.pr = pr;
  }

  // Returns true if the key was consumed by the pilot controls.
  onKey(e) {
    const k = e.key.toLowerCase();
    if (k === 'tab' || k === 'c') {
      e.preventDefault();
      this.toggleCamera();
      return true;
    }
    if (k === 'enter' || k === 'escape' || k === 'backspace') {
      this.stop();
      return true;
    }
    if (k === ' ') e.preventDefault();
    return Object.values(PILOT_KEYS).some((list) => list.includes(k)) || k === ' ';
  }

  readGamepad() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    const pad = pads[0];
    if (!pad) return null;
    const dz = (v) => (Math.abs(v) < DEADZONE ? 0 : v);
    const ax = pad.axes;
    const b = (n) => !!pad.buttons[n]?.pressed;
    // Edge-triggered buttons: B exits, Y switches camera.
    const prev = this.padButtons;
    this.padButtons = [b(1), b(3)];
    if (b(1) && !prev[0]) this.stop();
    if (b(3) && !prev[1]) this.toggleCamera();
    const read = {
      t: -dz(ax[1] || 0),
      y: dz(ax[0] || 0),
      p: -dz(ax[3] || 0),
      r: dz(ax[2] || 0),
      fire: b(7) || b(0) || b(5),
    };
    const moved = read.t || read.y || read.p || read.r || read.fire;
    if (moved) this.pad = pad.id;
    return this.pad ? read : null;
  }

  update(dt) {
    if (!this.uid) return;
    const keys = this.game.keys;
    const axis = (name, plus, minus) => {
      const target =
        (plus.some((k) => keys.has(k)) ? 1 : 0) - (minus.some((k) => keys.has(k)) ? 1 : 0);
      const cur = this.sticks[name];
      const rate = target ? RAMP : RETURN;
      const next = cur + Math.max(-rate * dt, Math.min(rate * dt, target - cur));
      this.sticks[name] = Math.abs(next) < 0.01 && !target ? 0 : next;
    };
    axis('t', ['w'], ['s']);
    axis('y', ['d'], ['a']);
    axis('p', ['i', 'arrowup'], ['k', 'arrowdown']);
    axis('r', ['l', 'arrowright'], ['j', 'arrowleft']);
    this.fire = keys.has(' ') || this.game.mouseFire;
    const pad = this.readGamepad();
    if (pad) {
      for (const n of ['t', 'y', 'p', 'r'])
        if (Math.abs(pad[n]) > Math.abs(this.sticks[n])) this.sticks[n] = pad[n];
      this.fire ||= pad.fire;
    }
    const q = {
      t: quantize(this.sticks.t),
      y: quantize(this.sticks.y),
      p: quantize(this.sticks.p),
      r: quantize(this.sticks.r),
    };
    const key = `${q.t},${q.y},${q.p},${q.r},${this.fire ? 1 : 0}`;
    if (key !== this.sent && this.uid) {
      this.sent = key;
      this.game.issue({ type: 'stick', uid: this.uid, ...q, fire: this.fire });
    }
    const big = Object.entries({ throttle: q.t, yaw: q.y, pitch: q.p, roll: q.r }).sort(
      (a, b) => Math.abs(b[1]) - Math.abs(a[1]),
    )[0];
    if (Math.abs(big[1]) > 0.2) this.lastAxis = big[0];
    else if (!Object.values(q).some(Boolean)) this.lastAxis = 'idle';
    this.learnText = LEARN[this.lastAxis](big[1]);
  }

  draw(alpha) {
    if (!this.uid) return;
    const w = this.game.world,
      i = w.uidMap.get(this.uid);
    const ctx = this.ctx,
      pr = this.pr,
      W = this.canvas.width,
      H = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (i === undefined) return;
    ctx.scale(pr, pr);
    const vw = innerWidth,
      vh = innerHeight,
      cx = vw / 2,
      cy = vh / 2;
    const role = ROLES[w.role[i]];
    const pose = this.game.view.pose(i, alpha);
    const speed = Math.hypot(w.vx[i], w.vz[i]);
    const green = 'rgba(140, 255, 200, 0.9)',
      dim = 'rgba(140, 255, 200, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.font = '600 13px ui-monospace, Menlo, Consolas, monospace';
    ctx.textBaseline = 'middle';
    // Horizon + pitch ladder (FPV only): rotate with roll, slide with pitch.
    if (this.mode === 'fpv') {
      // Matches the 100° vertical FPV lens; banking right tilts the horizon the other way.
      const pxPerRad = vh / 2 / Math.tan((100 * Math.PI) / 360);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-pose.roll);
      ctx.translate(0, -(pose.pitch - 0.38) * pxPerRad);
      ctx.strokeStyle = dim;
      ctx.fillStyle = dim;
      for (let deg = -60; deg <= 60; deg += 10) {
        const y = deg * (Math.PI / 180) * pxPerRad * -1;
        const wdt = deg === 0 ? 260 : 70;
        ctx.setLineDash(deg < 0 ? [6, 6] : []);
        ctx.beginPath();
        ctx.moveTo(-wdt, y);
        ctx.lineTo(-30, y);
        ctx.moveTo(30, y);
        ctx.lineTo(wdt, y);
        ctx.stroke();
        if (deg) {
          ctx.fillText(String(deg), wdt + 6, y);
          ctx.fillText(String(deg), -wdt - 26, y);
        }
      }
      ctx.restore();
      ctx.setLineDash([]);
    }
    // Reticle, with a lock box when the aim assist has a target.
    ctx.strokeStyle = green;
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.moveTo(cx - 26, cy);
    ctx.lineTo(cx - 18, cy);
    ctx.moveTo(cx + 18, cy);
    ctx.lineTo(cx + 26, cy);
    ctx.moveTo(cx, cy + 18);
    ctx.lineTo(cx, cy + 26);
    ctx.stroke();
    if (role.weapon) {
      const tgt = w.aimTarget(i, role.weapon.range, Math.sin(w.yaw[i]), Math.cos(w.yaw[i]));
      if (tgt) {
        const gy = this.game.view.height(tgt.x, tgt.z);
        const ty =
          tgt.drone !== undefined ? this.game.view.droneY(tgt.drone, tgt.x, tgt.z, alpha) : gy + 2;
        const p = this.game.view.project(tgt.x, ty, tgt.z);
        if (!p.behind) {
          ctx.strokeStyle = 'rgba(255, 110, 90, 0.95)';
          ctx.strokeRect(p.x - 16, p.y - 16, 32, 32);
          ctx.fillStyle = 'rgba(255, 110, 90, 0.95)';
          ctx.fillText('LOCK', p.x + 20, p.y - 12);
        }
      }
    }
    // Readouts.
    const alt = w.py[i],
      hdg = ((((-pose.yaw * 180) / Math.PI) % 360) + 360) % 360; // compass: clockwise
    ctx.fillStyle = green;
    ctx.textAlign = 'right';
    ctx.fillText(`SPD ${speed.toFixed(1)} m/s`, cx - 140, cy);
    ctx.textAlign = 'left';
    ctx.fillText(`ALT ${alt.toFixed(1)} m`, cx + 140, cy);
    ctx.fillText(`VS ${w.vy[i] >= 0 ? '+' : ''}${w.vy[i].toFixed(1)}`, cx + 140, cy + 18);
    ctx.textAlign = 'center';
    ctx.fillText(`HDG ${hdg.toFixed(0).padStart(3, '0')}°`, cx, 70);
    ctx.fillText(
      `PITCH ${((pose.pitch * 180) / Math.PI).toFixed(0)}°   ROLL ${((pose.roll * 180) / Math.PI).toFixed(0)}°`,
      cx,
      90,
    );
    const hp = w.hp[i] / role.hp;
    ctx.fillText(
      `${role.label.toUpperCase()} · ${this.mode === 'fpv' ? 'FPV' : 'CHASE'} · ANGLE MODE · ALT HOLD`,
      cx,
      vh - 150,
    );
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(cx - 80, vh - 136, 160, 6);
    ctx.fillStyle = hp > 0.5 ? green : hp > 0.25 ? '#ffd27a' : '#ff6a5a';
    ctx.fillRect(cx - 80, vh - 136, 160 * hp, 6);
    if (role.weapon) {
      const ready = w.cd[i] <= 0;
      ctx.fillStyle = ready ? green : dim;
      ctx.fillText(ready ? 'WEAPON READY' : 'RELOADING', cx, vh - 118);
    } else {
      ctx.fillStyle = dim;
      ctx.fillText(`NO WEAPON · ${role.blurb}`, cx, vh - 118);
    }
    // Stick visualizers (Mode 2): left = throttle/yaw, right = pitch/roll.
    const s = this.sticks;
    const stick = (x, y, label, h, v, hl, vl) => {
      ctx.strokeStyle = dim;
      ctx.strokeRect(x - 40, y - 40, 80, 80);
      ctx.beginPath();
      ctx.moveTo(x - 40, y);
      ctx.lineTo(x + 40, y);
      ctx.moveTo(x, y - 40);
      ctx.lineTo(x, y + 40);
      ctx.stroke();
      ctx.fillStyle = green;
      ctx.beginPath();
      ctx.arc(x + h * 36, y - v * 36, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '600 11px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText(label, x, y + 54);
      ctx.fillStyle = dim;
      ctx.fillText(`${vl} ↕  ${hl} ↔`, x, y + 68);
      ctx.font = '600 13px ui-monospace, Menlo, Consolas, monospace';
    };
    stick(cx - 260, vh - 120, 'LEFT', s.y, s.t, 'yaw A/D', 'throttle W/S');
    stick(cx + 260, vh - 120, 'RIGHT', s.r, s.p, 'roll J/L', 'pitch I/K');
    // Learn line.
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(220, 240, 255, 0.85)';
    ctx.fillText(this.learnText || '', cx, vh - 24);
    ctx.fillStyle = dim;
    ctx.font = '600 11px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillText(
      `SPACE/CLICK fire · TAB camera · ENTER/ESC exit${this.pad ? ' · gamepad: ' + this.pad.slice(0, 28) : ' · gamepad supported (Mode 2)'}`,
      cx,
      40,
    );
  }
}
