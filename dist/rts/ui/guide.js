// First-match guide: one short step at a time, ticking itself off from what the player actually
// does, with the button to press pulsing. Shown in Skirmish until finished or switched off.

const KEY = 'fc-rts-guide';

const has = (g, kind) =>
  g.world.structures.filter((s) => s.team === g.player && s.kind === kind && s.progress >= 1)
    .length;

// Build menu target: the ⚒ button while the command drawer is shut (phones), else the build button.
const buildTarget = (g, kind) =>
  g.touch && !document.body.classList.contains('cmd-open')
    ? '#cmd-toggle'
    : `#build-grid [data-kind="${kind}"]`;

const STEPS = [
  {
    id: 'select',
    text: (g) =>
      g.touch
        ? '<b>Select your drones.</b> Tap <b>All</b>, or tap one drone to grab its squad.'
        : '<b>Select your drones.</b> Drag a box over them, or click one to grab its squad.',
    done: (g) => g.selectedUids().length > 0,
    target: (g) => (g.touch ? '#touch-all' : null),
  },
  {
    id: 'order',
    text: (g) =>
      g.touch
        ? '<b>Move them.</b> Tap the ground to fly there, or tap an enemy to attack it.'
        : '<b>Move them.</b> Right-click the ground to fly there, or an enemy to attack it.',
    done: (g, f) => f.order,
  },
  {
    id: 'extractor',
    text: () =>
      '<b>Get energy.</b> ⚒ → Build → <b>Extractor</b>, then tap a glowing gold well. Each one gives +5 energy/s.',
    done: (g, f) => has(g, 'extractor') > f.start.extractor || f.placed.extractor,
    target: (g) => buildTarget(g, 'extractor'),
  },
  {
    id: 'produce',
    text: () =>
      '<b>Build more drones.</b> ⚒ → <b>Produce</b> → pick a type. They launch from your Core.',
    done: (g, f) => f.produce,
    target: (g) =>
      g.touch && !document.body.classList.contains('cmd-open')
        ? '#cmd-toggle'
        : '#commands [data-tab="produce"]',
  },
  {
    id: 'relay',
    text: () =>
      '<b>Raise your drone cap.</b> The <b>8/40</b> number up top is bandwidth. ⚒ → Build → <b>Relay</b> adds +25.',
    done: (g, f) => has(g, 'relay') > f.start.relay || f.placed.relay,
    target: (g) => buildTarget(g, 'relay'),
  },
  {
    id: 'defend',
    text: () =>
      '<b>Guard your base.</b> Select a squad and tap <b>🛡 Defend base</b>: it circles your Core and fights anything that comes close.',
    done: (g, f) => f.defend,
    target: (g) => (g.selectedUids().length ? '#btn-defend' : g.touch ? '#touch-all' : null),
  },
  {
    id: 'attack',
    text: () =>
      '<b>Win.</b> When you have ~15 drones, select them and tap <b>⚔ Attack enemy core</b>. Destroy the enemy Core to win.',
    done: (g, f) => f.attack,
    target: (g) => (g.selectedUids().length ? '#btn-attack-core' : g.touch ? '#touch-all' : null),
  },
];

export class Guide {
  constructor(game, el) {
    this.game = game;
    this.el = el;
    this.body = el.querySelector('.pbody') || el;
    this.flags = {
      placed: {},
      start: { extractor: has(game, 'extractor'), relay: has(game, 'relay') },
    };
    this.step = 0;
    this.lit = null;
    this.active = game.mode === 'skirmish' && !game.spectator && Guide.wanted();
    el.hidden = !this.active;
    this.render();
  }

  static wanted() {
    try {
      return localStorage.getItem(KEY) !== 'off';
    } catch {
      return true;
    }
  }

  static setWanted(v) {
    try {
      localStorage.setItem(KEY, v ? 'on' : 'off');
    } catch {
      // Storage unavailable; applies to this page only.
    }
  }

  mark(id, detail) {
    if (id === 'build') this.flags.placed[detail] = true;
    else this.flags[id] = true;
  }

  close() {
    this.active = false;
    this.el.hidden = true;
    this.light(null);
  }

  light(sel) {
    const el = sel ? document.querySelector(sel) : null;
    if (el === this.lit) return;
    this.lit?.classList.remove('coach-pulse');
    this.lit = el;
    el?.classList.add('coach-pulse');
  }

  render() {
    const g = this.game;
    if (this.step >= STEPS.length) {
      this.body.innerHTML = `<div class="guide-step"><b>You're set.</b> Tap any building to see what it does, and try ⚡ Script on a squad so it reacts on its own.</div>
        <div class="guide-meta"><span class="spacer"></span><button class="btn" data-g="end">Close guide</button></div>`;
      this.body.querySelector('[data-g="end"]').onclick = () => {
        Guide.setWanted(false);
        this.close();
      };
      return;
    }
    const s = STEPS[this.step];
    const dots = STEPS.map((_, k) => `<i class="${k < this.step ? 'done' : ''}"></i>`).join('');
    this.body.innerHTML = `<div class="guide-step">${s.text(g)}</div>
      <div class="guide-meta"><span class="guide-dots">${dots}</span>STEP ${this.step + 1}/${STEPS.length}<span class="spacer"></span><button class="btn" data-g="skip">Skip</button></div>`;
    this.body.querySelector('[data-g="skip"]').onclick = () => {
      this.step++;
      this.render();
    };
  }

  update() {
    if (!this.active) return;
    const g = this.game;
    let moved = false;
    while (this.step < STEPS.length && STEPS[this.step].done(g, this.flags)) {
      this.step++;
      moved = true;
    }
    if (moved) this.render();
    const s = STEPS[this.step];
    this.light(s?.target?.(g) || null);
  }
}
