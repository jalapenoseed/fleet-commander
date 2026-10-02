// Touch camera pads: a left thumb pad that slides the camera over the map and a right pad that
// turns (left/right) and tilts (up/down) the view, plus zoom and "center on selection" buttons.
// The pads own their touches, so the world underneath still gets taps for selecting and ordering,
// and one thumb can steer the camera while the other hand taps.

const KEY = 'fc-rts-campads';

export class CamPads {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('campads');
    this.move = null;
    this.look = null;
    this.zoom = 0;
    this.follow = false;
    this.bindPad('pad-move', (v) => (this.move = v));
    this.bindPad('pad-look', (v) => (this.look = v));
    const hold = (id, dir) => {
      const b = document.getElementById(id);
      b.onpointerdown = (e) => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        this.zoom = dir;
      };
      b.onpointerup = b.onpointercancel = () => (this.zoom = 0);
    };
    hold('pad-zoom-in', -1);
    hold('pad-zoom-out', 1);
    const center = document.getElementById('pad-center');
    center.onclick = () => {
      const now = performance.now();
      // Tap: jump to the selection. Double-tap: keep following it.
      if (now - (this.lastCenter || 0) < 350) this.follow = !this.follow;
      else this.follow = false;
      this.lastCenter = now;
      center.classList.toggle('on', this.follow);
      this.centerOnSelection();
    };
    this.setEnabled(this.enabled);
  }

  get enabled() {
    try {
      return localStorage.getItem(KEY) !== 'off';
    } catch {
      return true;
    }
  }

  setEnabled(v) {
    try {
      localStorage.setItem(KEY, v ? 'on' : 'off');
    } catch {
      // Storage unavailable; the choice lasts for this page only.
    }
    document.body.classList.toggle('no-campads', !v);
  }

  bindPad(id, set) {
    const el = document.getElementById(id);
    const knob = el.querySelector('i');
    const read = (e) => {
      const r = el.getBoundingClientRect();
      let x = ((e.clientX - r.left) / r.width) * 2 - 1,
        y = -(((e.clientY - r.top) / r.height) * 2 - 1);
      const m = Math.hypot(x, y);
      if (m > 1) {
        x /= m;
        y /= m;
      }
      // Small dead zone so resting a thumb doesn't drift the camera.
      const dz = (v) => (Math.abs(v) < 0.12 ? 0 : (v - Math.sign(v) * 0.12) / 0.88);
      set({ x: dz(x), y: dz(y) });
      knob.style.transform = `translate(${x * r.width * 0.32}px, ${-y * r.height * 0.32}px)`;
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      read(e);
    });
    el.addEventListener('pointermove', (e) => el.hasPointerCapture(e.pointerId) && read(e));
    const end = () => {
      set(null);
      knob.style.transform = '';
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  centerOnSelection() {
    const c = this.game.selectionCenter();
    if (c) this.game.view.lookAt(c.x, c.z);
  }

  update(dt) {
    const c = this.game.view.cam;
    if (this.move) {
      // Speed scales with zoom so it feels the same close up and zoomed out.
      const s = c.dist * 1.1 * dt;
      this.game.view.pan(this.move.x * s, this.move.y * s);
      this.follow = false;
      document.getElementById('pad-center').classList.remove('on');
    }
    if (this.look) {
      c.tyaw -= this.look.x * 2.2 * dt;
      c.tpitch -= this.look.y * 1.1 * dt;
    }
    if (this.zoom) c.tdist *= Math.exp(this.zoom * 1.4 * dt);
    if (this.follow) this.centerOnSelection();
  }
}
