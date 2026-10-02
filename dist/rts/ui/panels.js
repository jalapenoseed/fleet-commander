// HUD window manager: every panel gets a title bar to drag it, a minimize and a close button and
// (where it makes sense) a resize corner. Layout, closed panels and the UI size persist in this
// browser, separately for phone-sized and larger screens.

const KEY = 'fc-rts-layout';
const SCALES = { small: 0.82, normal: 1, large: 1.18 };

const readAll = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
};
const writeAll = (v) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    // Storage unavailable; layout just won't persist.
  }
};

export class PanelManager {
  // defs: [{ id, title, resizable, onClose }] — onClose for app-controlled windows (drawers).
  constructor(defs, menuButton, menu) {
    this.defs = defs;
    this.menuButton = menuButton;
    this.menu = menu;
    this.form = innerWidth <= 760 ? 'phone' : 'desk';
    const all = readAll();
    this.state = all[this.form] || {
      panels: {},
      scale: this.form === 'phone' ? 'small' : 'normal',
    };
    this.panels = new Map();
    for (const d of defs) this.setup(d);
    this.applyScale();
    menuButton.onclick = (e) => {
      e.stopPropagation();
      this.toggleMenu();
    };
    addEventListener('pointerdown', (e) => {
      if (!menu.hidden && !menu.contains(e.target) && e.target !== menuButton) menu.hidden = true;
    });
    addEventListener('resize', () => this.clampAll());
  }

  save() {
    const all = readAll();
    all[this.form] = this.state;
    writeAll(all);
  }

  ps(id) {
    return (this.state.panels[id] ||= {});
  }

  get zoom() {
    return SCALES[this.state.scale] || 1;
  }

  setup(d) {
    const el = document.getElementById(d.id);
    if (!el) return;
    el.classList.add('win');
    let body = el.querySelector(':scope > .pbody');
    if (!body) {
      body = document.createElement('div');
      body.className = 'pbody';
      while (el.firstChild) body.append(el.firstChild);
      el.append(body);
    }
    const bar = document.createElement('div');
    bar.className = 'pbar';
    bar.innerHTML = `<span class="ptitle">${d.title}</span><button class="pbtn" data-a="min" title="Minimize">–</button><button class="pbtn" data-a="close" title="Close (reopen from the ☷ Panels menu)">×</button>`;
    el.prepend(bar);
    if (d.resizable) {
      const grip = document.createElement('div');
      grip.className = 'presize';
      grip.title = 'Drag to resize';
      el.append(grip);
      this.dragHandle(grip, el, d, 'resize');
    }
    this.dragHandle(bar, el, d, 'move');
    bar.querySelector('[data-a="min"]').onclick = () => this.setMin(d.id, !this.ps(d.id).min);
    bar.querySelector('[data-a="close"]').onclick = () =>
      d.onClose ? d.onClose() : this.setClosed(d.id, true);
    bar.addEventListener('dblclick', (e) => {
      if (!e.target.closest('.pbtn')) this.setMin(d.id, !this.ps(d.id).min);
    });
    this.panels.set(d.id, { el, d });
    this.apply(d.id);
  }

  apply(id) {
    const { el } = this.panels.get(id);
    const s = this.ps(id),
      z = this.zoom;
    el.classList.toggle('min', !!s.min);
    el.classList.toggle('closed', !!s.closed);
    if (s.x !== undefined) {
      Object.assign(el.style, {
        left: s.x / z + 'px',
        top: s.y / z + 'px',
        right: 'auto',
        bottom: 'auto',
        transform: 'none',
      });
    } else for (const p of ['left', 'top', 'right', 'bottom', 'transform']) el.style[p] = '';
    if (s.w) {
      el.style.width = s.w / z + 'px';
      el.style.maxWidth = 'none';
    } else el.style.width = el.style.maxWidth = '';
    if (s.h && !s.min) {
      el.style.height = s.h / z + 'px';
      el.style.maxHeight = 'none';
    } else el.style.height = el.style.maxHeight = '';
  }

  dragHandle(handle, el, d, kind) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.pbtn')) return;
      e.preventDefault();
      e.stopPropagation();
      handle.setPointerCapture(e.pointerId);
      const r = el.getBoundingClientRect();
      const start = { x: e.clientX, y: e.clientY, l: r.left, t: r.top, w: r.width, h: r.height };
      const move = (ev) => {
        const s = this.ps(d.id);
        if (kind === 'move') {
          s.x = Math.max(0, Math.min(innerWidth - 60, start.l + ev.clientX - start.x));
          s.y = Math.max(0, Math.min(innerHeight - 30, start.t + ev.clientY - start.y));
        } else {
          s.x ??= start.l;
          s.y ??= start.t;
          s.w = Math.max(160, Math.min(innerWidth - s.x, start.w + ev.clientX - start.x));
          s.h = Math.max(80, Math.min(innerHeight - s.y, start.h + ev.clientY - start.y));
        }
        this.apply(d.id);
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        this.save();
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
  }

  setMin(id, v) {
    this.ps(id).min = v;
    this.apply(id);
    this.save();
  }

  setClosed(id, v) {
    this.ps(id).closed = v;
    this.apply(id);
    this.save();
    this.renderMenu();
  }

  clampAll() {
    for (const [id] of this.panels) {
      const s = this.ps(id);
      if (s.x === undefined) continue;
      s.x = Math.max(0, Math.min(innerWidth - 60, s.x));
      s.y = Math.max(0, Math.min(innerHeight - 30, s.y));
      this.apply(id);
    }
  }

  applyScale() {
    document.documentElement.style.setProperty('--ui-zoom', this.zoom);
    for (const [id] of this.panels) this.apply(id);
  }

  setHidden(v) {
    this.state.hideAll = v;
    document.body.classList.toggle('hud-hidden', v);
    this.save();
    this.renderMenu();
  }

  reset() {
    this.state = { panels: {}, scale: this.form === 'phone' ? 'small' : 'normal' };
    document.body.classList.remove('hud-hidden');
    this.applyScale();
    this.save();
    this.renderMenu();
  }

  toggleMenu() {
    this.menu.hidden = !this.menu.hidden;
    if (!this.menu.hidden) this.renderMenu();
  }

  renderMenu() {
    if (this.menu.hidden) return;
    const rows = [...this.panels.values()]
      .filter(({ d }) => !d.onClose)
      .map(({ d }) => {
        const s = this.ps(d.id);
        return `<label><input type="checkbox" data-p="${d.id}" ${s.closed ? '' : 'checked'} /> ${d.title}</label>`;
      })
      .join('');
    this.menu.innerHTML = `
      <div class="menu-sec">Show panels</div>${rows}
      ${(this.extras || []).map((x, k) => `<label><input type="checkbox" data-x="${k}" ${x.get() ? 'checked' : ''} /> ${x.label}</label>`).join('')}
      <div class="menu-sec">Interface size</div>
      <div class="seg">${Object.keys(SCALES)
        .map(
          (k) =>
            `<button class="btn ${this.state.scale === k ? 'on' : ''}" data-scale="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`,
        )
        .join('')}</div>
      <button class="btn" data-act="hide">${this.state.hideAll ? 'Show HUD' : 'Hide all panels'} <kbd>\`</kbd></button>
      <button class="btn" data-act="min">Minimize all</button>
      <button class="btn" data-act="reset">Reset layout</button>
      <p class="hint">Drag a panel's title bar to move it, its corner to resize. Double-click a title bar to minimize.</p>`;
    for (const c of this.menu.querySelectorAll('[data-p]'))
      c.onchange = () => this.setClosed(c.dataset.p, !c.checked);
    for (const c of this.menu.querySelectorAll('[data-x]'))
      c.onchange = () => this.extras[Number(c.dataset.x)].set(c.checked);
    for (const b of this.menu.querySelectorAll('[data-scale]'))
      b.onclick = () => {
        this.state.scale = b.dataset.scale;
        this.applyScale();
        this.save();
        this.renderMenu();
      };
    this.menu.querySelector('[data-act="hide"]').onclick = () =>
      this.setHidden(!this.state.hideAll);
    this.menu.querySelector('[data-act="min"]').onclick = () => {
      for (const [id] of this.panels) this.ps(id).min = true;
      this.applyScale();
      this.save();
    };
    this.menu.querySelector('[data-act="reset"]').onclick = () => this.reset();
  }

  restoreHidden() {
    document.body.classList.toggle('hud-hidden', !!this.state.hideAll);
  }
}
