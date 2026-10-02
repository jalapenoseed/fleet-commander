// Drone designer panel: pick a frame, weapon, sensor and module, see the resulting stats and
// tradeoffs, register the design for this match and keep it in a library in this browser.

import {
  FRAMES,
  WEAPON_PARTS,
  SENSOR_PARTS,
  MODULES,
  buildDesign,
  MAX_DESIGNS,
} from '../sim/designs.js';
import { WEAPONS, ARMOR } from '../sim/defs.js';

const KEY = 'fc-rts-designs';
const load = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  } catch {
    return [];
  }
};
const save = (list) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage unavailable; the library just won't persist.
  }
};
const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );

const ROWS = [
  ['frame', 'Frame', FRAMES],
  ['weapon', 'Weapon', WEAPON_PARTS],
  ['sensor', 'Sensor', SENSOR_PARTS],
  ['module', 'Module', MODULES],
];

export class Designer {
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this.spec = {
      name: 'Hornet',
      frame: 'light',
      weapon: 'flak',
      sensor: 'extended',
      module: 'battery',
    };
    this.msg = '';
  }

  open() {
    this.root.hidden = false;
    this.render();
  }

  close() {
    this.root.hidden = true;
  }

  register(spec = this.spec) {
    const w = this.game.world,
      t = this.game.player;
    if (w.roles.filter((r) => r.owner === t).length >= MAX_DESIGNS) {
      this.msg = `You can register up to ${MAX_DESIGNS} designs per match.`;
      return this.render();
    }
    this.game.issue({ type: 'design', spec: { ...spec } });
    this.msg = `${spec.name} registered. Find it in the Produce tab.`;
    this.render();
  }

  render() {
    const r = this.root,
      spec = this.spec;
    let role = null,
      error = '';
    try {
      role = buildDesign(spec, 0, 0);
    } catch (e) {
      error = e.message;
    }
    const seg = (key, table) =>
      Object.entries(table)
        .map(
          ([k, p]) =>
            `<button class="btn ${spec[key] === k ? 'on' : ''}" data-part="${key}" data-value="${k}" data-tip="<b>${esc(p.label)}</b>${esc(p.blurb || '')}${p.tier > 1 ? '<div class=stat>needs Tier 2</div>' : ''}">${esc(p.label.replace(/ frame$/, ''))}</button>`,
        )
        .join('');
    const w = role?.weapon;
    const dps = w ? (w.damage / w.cooldown).toFixed(0) : '—';
    const stats = role
      ? [
          ['Hull', `${role.hp} hp · ${ARMOR[role.armor]} armor`],
          ['Speed', `${role.speed.toFixed(1)} m/s · turns ${role.flight.yawRate} rad/s`],
          ['Sight', `${role.sensor} m`],
          ['Weapon', w ? `${WEAPONS[w.type].label} · ${dps} dps · ${w.range} m` : 'none'],
          ['Battery', `${role.battery} s hover`],
          [
            'Cost',
            `${role.cost * role.pack} energy for ${role.pack} · ${role.bw * role.pack} bandwidth`,
          ],
          ['Tier', role.tier > 1 ? `Tier ${role.tier} (research needed)` : 'Tier 1'],
        ]
      : [];
    const library = load();
    r.innerHTML = `
      <header class="panel-head">
        <div><div class="eyebrow">Engineering</div><h2>Drone Designer</h2></div>
        <button class="icon-btn" data-act="close" title="Close (Esc)">✕</button>
      </header>
      <p class="hint">Assemble an airframe from parts. Registered designs show up in the Produce tab for this match; saved ones stay in this browser.</p>
      <label class="row">Name <input id="design-name" maxlength="24" value="${esc(spec.name)}" /></label>
      ${ROWS.map(([key, label, table]) => `<div class="btn-row"><span class="label">${label}</span>${seg(key, table)}</div>`).join('')}
      ${error ? `<p class="error">${esc(error)}</p>` : `<dl class="design-stats">${stats.map(([a, b]) => `<dt>${a}</dt><dd>${esc(b)}</dd>`).join('')}</dl>`}
      <p class="learn-line">${role ? esc(this.explain(role)) : ''}</p>
      <div class="row">
        <button class="btn primary" data-act="register" ${role && !this.game.spectator ? '' : 'disabled'}>Register for this match</button>
        <button class="btn" data-act="save" ${role ? '' : 'disabled'}>Save to library</button>
      </div>
      ${this.msg ? `<p class="ok">${esc(this.msg)}</p>` : ''}
      <h3 class="sub">Library</h3>
      ${library.length ? '' : '<p class="hint">Saved designs appear here.</p>'}
      <ul class="library">${library
        .map(
          (d, k) =>
            `<li><span><b>${esc(d.name)}</b> <small>${esc(FRAMES[d.frame]?.label || '')} · ${esc(WEAPON_PARTS[d.weapon]?.label || '')} · ${esc(MODULES[d.module]?.label || '')}</small></span>
            <button class="mini" data-lib="load" data-k="${k}">Edit</button>
            <button class="mini" data-lib="use" data-k="${k}" ${this.game.spectator ? 'disabled' : ''}>Use</button>
            <button class="mini danger" data-lib="del" data-k="${k}">✕</button></li>`,
        )
        .join('')}</ul>`;
    this.msg = '';
    r.querySelector('#design-name').oninput = (e) => (spec.name = e.target.value);
    for (const b of r.querySelectorAll('[data-part]'))
      b.onclick = () => {
        spec[b.dataset.part] = b.dataset.value;
        this.render();
      };
    r.querySelector('[data-act="close"]').onclick = () => this.close();
    r.querySelector('[data-act="register"]').onclick = () => this.register();
    r.querySelector('[data-act="save"]').onclick = () => {
      const list = load().filter((d) => d.name !== spec.name);
      list.unshift({ ...spec });
      save(list.slice(0, 20));
      this.msg = `Saved ${spec.name} to your library.`;
      this.render();
    };
    for (const b of r.querySelectorAll('[data-lib]'))
      b.onclick = () => {
        const list = load(),
          d = list[Number(b.dataset.k)];
        if (!d) return;
        if (b.dataset.lib === 'load') this.spec = { ...d };
        else if (b.dataset.lib === 'use') return this.register(d);
        else {
          list.splice(Number(b.dataset.k), 1);
          save(list);
        }
        this.render();
      };
  }

  // Plain-English tradeoff summary (Learn mode).
  explain(role) {
    const f = FRAMES[this.spec.frame];
    const bits = [];
    bits.push(
      `A ${f.label.toLowerCase()} tilts up to ${Math.round((f.flight.tilt * 180) / Math.PI)}°, which sets its acceleration (g·tan of the tilt).`,
    );
    if (role.weapon) {
      const best = WEAPONS[role.weapon.type].vs
        .map((m, k) => [m, ARMOR[k]])
        .sort((a, b) => b[0] - a[0])[0];
      bits.push(
        `Its ${WEAPONS[role.weapon.type].label.toLowerCase()} does the most damage to ${best[1]} targets (×${best[0]}).`,
      );
    } else bits.push('Without a weapon it relies on its module and other drones for protection.');
    if (role.aura?.jam) bits.push('The jammer slows and blinds enemies within 9 m.');
    if (role.aura?.shield) bits.push('The shield cuts damage to nearby allies by 40%.');
    if (role.aura?.heal) bits.push('The repair kit heals allies within 6 m.');
    if (this.spec.module === 'armor')
      bits.push('Armor plates add hull but the extra weight slows it.');
    if (this.spec.module === 'battery')
      bits.push('The battery pack lets it stay out 50% longer before flying home.');
    return bits.join(' ');
  }
}
