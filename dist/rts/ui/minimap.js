// 2D tactical minimap drawn from sim state: explored terrain, fog, wells, structures, drones and
// the camera footprint. Click/drag to move the camera; right-click issues an order there.

import { TEAM_COLORS, STRUCTURES } from '../sim/defs.js';

export class Minimap {
  constructor(canvas, world, view, { onOrder } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.view = view;
    this.onOrder = onOrder;
    this.size = canvas.width;
    this.fog = document.createElement('canvas');
    this.fog.width = this.fog.height = world.visN;
    this.fogCtx = this.fog.getContext('2d');
    this.fogImg = this.fogCtx.createImageData(world.visN, world.visN);
    this.alerts = [];
    const toWorld = (e) => {
      const r = canvas.getBoundingClientRect();
      const half = world.half;
      return {
        x: ((e.clientX - r.left) / r.width) * 2 * half - half,
        z: ((e.clientY - r.top) / r.height) * 2 * half - half,
      };
    };
    let dragging = false;
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const p = toWorld(e);
      if (e.button === 2) {
        this.onOrder?.(p.x, p.z);
        return;
      }
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      view.lookAt(p.x, p.z);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const p = toWorld(e);
      view.lookAt(p.x, p.z);
    });
    canvas.addEventListener('pointerup', () => (dragging = false));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  flash(x, z) {
    this.alerts.push({ x, z, t: performance.now() });
  }

  draw() {
    const { ctx, world, view } = this,
      S = this.size,
      half = world.half,
      k = S / (2 * half);
    const X = (x) => (x + half) * k,
      Z = (z) => (z + half) * k;
    ctx.fillStyle = '#0d1a1f';
    ctx.fillRect(0, 0, S, S);
    // Terrain features.
    ctx.fillStyle = '#4a4740';
    for (const o of world.map.obstacles) {
      ctx.beginPath();
      ctx.arc(X(o.x), Z(o.z), o.r * k, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const w of world.wells) {
      ctx.fillStyle = w.owner >= 0 ? '#9a7a3a' : '#ffc65a';
      ctx.beginPath();
      ctx.arc(X(w.x), Z(w.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const fogOn = view.fogOn,
      pt = view.playerTeam;
    for (const s of world.structures) {
      if (s.team !== pt && fogOn && !view.seenStructs.has(s.id)) continue;
      const r = Math.max(3, STRUCTURES[s.kind].radius * k * 1.2);
      ctx.fillStyle = TEAM_COLORS[s.team];
      ctx.globalAlpha = s.progress >= 1 ? 1 : 0.5;
      ctx.fillRect(X(s.x) - r, Z(s.z) - r, r * 2, r * 2);
      ctx.globalAlpha = 1;
    }
    for (let i = 0; i < world.count; i++) {
      if (!world.alive[i]) continue;
      const t = world.team[i];
      if (t !== pt && fogOn && !world.visible(pt, world.px[i], world.pz[i])) continue;
      ctx.fillStyle = view.selected.has(world.uid[i]) ? '#ffffff' : TEAM_COLORS[t];
      ctx.fillRect(X(world.px[i]) - 1, Z(world.pz[i]) - 1, 2, 2);
    }
    // Fog overlay.
    if (fogOn) {
      const team = world.teams[pt],
        d = this.fogImg.data;
      for (let c = 0; c < team.vis.length; c++) {
        d[c * 4 + 0] = 4;
        d[c * 4 + 1] = 8;
        d[c * 4 + 2] = 12;
        d[c * 4 + 3] = team.vis[c] ? 0 : team.explored[c] ? 120 : 220;
      }
      this.fogCtx.putImageData(this.fogImg, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.fog, 0, 0, S, S);
    }
    // Camera footprint.
    const corners = [
      [0, 0],
      [innerWidth, 0],
      [innerWidth, innerHeight],
      [0, innerHeight],
    ].map(([x, y]) => view.groundAt(x, y));
    if (corners.every(Boolean)) {
      ctx.strokeStyle = 'rgba(220, 245, 255, 0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      corners.forEach((p, n) => (n ? ctx.lineTo(X(p.x), Z(p.z)) : ctx.moveTo(X(p.x), Z(p.z))));
      ctx.closePath();
      ctx.stroke();
    }
    const now = performance.now();
    this.alerts = this.alerts.filter((a) => now - a.t < 2500);
    for (const a of this.alerts) {
      const f = (now - a.t) / 2500;
      ctx.strokeStyle = `rgba(255, 80, 70, ${1 - f})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(X(a.x), Z(a.z), 6 + f * 20, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
