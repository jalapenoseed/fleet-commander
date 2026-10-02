// Reaction script editor: ordered "when → then" rules for one squad, with Learn-mode
// explanations (plain English + the math) generated from the same data the sim runs.

import { CONDITIONS, ACTIONS, MAX_RULES, validateRules, explainRule } from '../sim/rules.js';
import { FORMATIONS } from '../sim/defs.js';

// Swarm brains: a named bundle of reaction rules + formation + altitude band, kept in this browser.
const BRAIN_KEY = 'fc-rts-brains';
export const BRAIN_PRESETS = {
  Wolfpack: {
    formation: 'wedge',
    altitude: 1,
    rules: [
      { when: 'enemyNear', value: 20, then: 'attack', cooldown: 2 },
      { when: 'hurt', value: 30, then: 'retreat', cooldown: 10 },
    ],
  },
  Ghost: {
    formation: 'column',
    altitude: 0,
    rules: [
      { when: 'detected', then: 'evade', cooldown: 3 },
      { when: 'battery', value: 35, then: 'retreat', cooldown: 10 },
    ],
  },
  'Sky guard': {
    formation: 'ring',
    altitude: 2,
    rules: [
      { when: 'outnumbered', value: 2, then: 'regroup', cooldown: 5 },
      { when: 'hurt', value: 35, then: 'retreat', cooldown: 8 },
    ],
  },
  'Siege line': {
    formation: 'line',
    altitude: 1,
    rules: [
      { when: 'threat', value: 1.8, then: 'evade', cooldown: 4 },
      { when: 'enemyNear', value: 12, then: 'hold', cooldown: 2 },
    ],
  },
};
const loadBrains = () => {
  try {
    return JSON.parse(localStorage.getItem(BRAIN_KEY)) || {};
  } catch {
    return {};
  }
};
const saveBrains = (b) => {
  try {
    localStorage.setItem(BRAIN_KEY, JSON.stringify(b));
  } catch {
    // Storage unavailable; brains just won't persist.
  }
};

const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat())
    if (kid != null) e.append(kid.nodeType ? kid : document.createTextNode(kid));
  return e;
};

export const PRESETS = {
  'Cautious skirmisher': [
    { when: 'hurt', value: 40, then: 'retreat', cooldown: 8 },
    { when: 'threat', value: 1.5, then: 'evade', cooldown: 5 },
    { when: 'jammed', value: 30, then: 'regroup', cooldown: 4 },
  ],
  Berserker: [{ when: 'enemyNear', value: 22, then: 'attack', cooldown: 1 }],
  'Ghost (avoid radar)': [
    { when: 'detected', then: 'evade', cooldown: 3 },
    { when: 'hurt', value: 30, then: 'retreat', cooldown: 10 },
  ],
  'Shield wall': [
    { when: 'enemyNear', value: 18, then: 'formation', formation: 'line', cooldown: 2 },
    { when: 'outnumbered', value: 2, then: 'hold', cooldown: 4 },
  ],
};

export class ScriptEditor {
  constructor(root, { onApply, win = root }) {
    this.root = root;
    this.win = win;
    this.onApply = onApply;
    this.rules = [];
    this.squad = null;
  }

  open(squad) {
    this.squad = squad;
    this.rules = squad.rules.map((r) => ({ ...r }));
    this.formation = squad.formation;
    this.altitude = squad.altitude ?? 1;
    this.error = '';
    this.render();
    this.win.hidden = false;
  }

  close() {
    this.win.hidden = true;
    this.squad = null;
  }

  apply() {
    try {
      const rules = validateRules(this.rules);
      this.onApply(this.squad, rules, { formation: this.formation, altitude: this.altitude });
      this.error = '';
      this.flash = 'Applied: the squad now runs this brain.';
    } catch (e) {
      this.error = e.message;
    }
    this.render();
  }

  render() {
    const r = this.root;
    const self = this;
    r.textContent = '';
    const sq = this.squad;
    if (!sq) return;
    const active = sq.reaction ? sq.reaction.index : -1;
    r.append(
      el(
        'header',
        { class: 'panel-head' },
        el(
          'div',
          {},
          el('div', { class: 'eyebrow' }, 'Reaction script'),
          el('h2', {}, `${sq.name} squad`),
        ),
        el('button', { class: 'icon-btn', title: 'Close (Esc)', onclick: () => this.close() }, '✕'),
      ),
      el(
        'p',
        { class: 'hint' },
        'Rules are checked top to bottom, four times a second. The first one that triggers takes over the squad until things calm down. Your orders resume afterwards.',
      ),
    );
    const list = el('ol', { class: 'rules' });
    this.rules.forEach((rule, i) => {
      const c = CONDITIONS[rule.when];
      const why = explainRule(rule);
      const row = el(
        'li',
        {
          class: 'rule' + (i === active ? ' firing' : '') + (rule.enabled === false ? ' off' : ''),
        },
        el(
          'div',
          { class: 'rule-line' },
          el('span', { class: 'kw' }, 'WHEN'),
          select(
            Object.keys(CONDITIONS),
            rule.when,
            (v) => {
              rule.when = v;
              rule.value = CONDITIONS[v].default ?? 0;
            },
            (k) => CONDITIONS[k].label,
          ),
          c.min !== undefined
            ? el('input', {
                type: 'number',
                class: 'num',
                value: rule.value,
                min: c.min,
                max: c.max,
                step: c.max <= 5 ? 0.1 : 1,
                onchange: (e) => {
                  rule.value = Number(e.target.value);
                  this.render();
                },
              })
            : null,
          c.unit ? el('span', { class: 'unit' }, c.unit) : null,
          el('span', { class: 'kw' }, 'THEN'),
          select(
            Object.keys(ACTIONS),
            rule.then,
            (v) => {
              rule.then = v;
              if (v === 'formation') rule.formation ??= 'wedge';
            },
            (k) => ACTIONS[k].label,
          ),
          rule.then === 'formation'
            ? select(FORMATIONS, rule.formation, (v) => (rule.formation = v))
            : null,
        ),
        el(
          'div',
          { class: 'rule-line small' },
          el(
            'label',
            {},
            'cooldown ',
            el('input', {
              type: 'number',
              class: 'num',
              value: rule.cooldown,
              min: 0,
              max: 60,
              onchange: (e) => {
                rule.cooldown = Number(e.target.value);
                this.render();
              },
            }),
            ' s',
          ),
          el(
            'label',
            {},
            el('input', {
              type: 'checkbox',
              checked: rule.enabled !== false,
              onchange: (e) => {
                rule.enabled = e.target.checked;
                this.render();
              },
            }),
            ' enabled',
          ),
          el('span', { class: 'spacer' }),
          el(
            'button',
            {
              class: 'mini',
              title: 'Higher priority',
              disabled: i === 0,
              onclick: () => {
                [this.rules[i - 1], this.rules[i]] = [this.rules[i], this.rules[i - 1]];
                this.render();
              },
            },
            '▲',
          ),
          el(
            'button',
            {
              class: 'mini',
              title: 'Lower priority',
              disabled: i === this.rules.length - 1,
              onclick: () => {
                [this.rules[i + 1], this.rules[i]] = [this.rules[i], this.rules[i + 1]];
                this.render();
              },
            },
            '▼',
          ),
          el(
            'button',
            {
              class: 'mini danger',
              title: 'Remove rule',
              onclick: () => {
                this.rules.splice(i, 1);
                this.render();
              },
            },
            '✕',
          ),
        ),
        el(
          'details',
          { class: 'learn' },
          el('summary', {}, 'Learn: what does this do?'),
          el('p', {}, why.plain),
          el('p', { class: 'math' }, why.math),
        ),
      );
      list.append(row);
    });
    function select(options, value, onchange, label = (x) => x) {
      return el(
        'select',
        {
          onchange: (e) => {
            onchange(e.target.value);
            self.render();
          },
        },
        options.map((o) => el('option', { value: o, selected: o === value }, label(o))),
      );
    }
    r.append(list);
    // Swarm brain: formation + altitude travel with the rules.
    const brains = { ...BRAIN_PRESETS, ...loadBrains() };
    r.append(
      el(
        'div',
        { class: 'row brain-row' },
        el('span', { class: 'kw' }, 'FORMATION'),
        select(FORMATIONS, this.formation, (v) => (this.formation = v)),
        el('span', { class: 'kw' }, 'ALTITUDE'),
        select(
          ['0', '1', '2'],
          String(this.altitude),
          (v) => (this.altitude = Number(v)),
          (v) => ['Low', 'Cruise', 'High'][v],
        ),
      ),
      el(
        'div',
        { class: 'row brain-row' },
        el(
          'select',
          {
            onchange: (e) => {
              const b = brains[e.target.value];
              if (!b) return;
              this.rules = b.rules.map((x) => ({ enabled: true, cooldown: 4, ...x }));
              this.formation = b.formation;
              this.altitude = b.altitude;
              this.flash = `Loaded the ${e.target.value} brain. Apply to use it.`;
              this.render();
            },
          },
          el('option', { value: '' }, 'Load swarm brain…'),
          Object.keys(brains).map((k) => el('option', { value: k }, k)),
        ),
        el('input', { id: 'brain-name', placeholder: 'Brain name', maxlength: 24 }),
        el(
          'button',
          {
            class: 'btn',
            onclick: () => {
              const name = r.querySelector('#brain-name').value.trim();
              if (!name) return;
              try {
                const all = loadBrains();
                all[name] = {
                  rules: validateRules(this.rules),
                  formation: this.formation,
                  altitude: this.altitude,
                };
                saveBrains(all);
                this.flash = `Saved brain "${name}".`;
                this.error = '';
              } catch (e) {
                this.error = e.message;
              }
              this.render();
            },
          },
          'Save brain',
        ),
      ),
    );
    const presets = el(
      'select',
      {
        onchange: (e) => {
          if (PRESETS[e.target.value]) {
            this.rules = PRESETS[e.target.value].map((x) => ({ enabled: true, ...x }));
            this.render();
          }
        },
      },
      el('option', { value: '' }, 'Load preset…'),
      Object.keys(PRESETS).map((k) => el('option', { value: k }, k)),
    );
    r.append(
      el(
        'div',
        { class: 'row' },
        el(
          'button',
          {
            class: 'btn',
            disabled: this.rules.length >= MAX_RULES,
            onclick: () => {
              this.rules.push({
                when: 'enemyNear',
                value: 16,
                then: 'attack',
                cooldown: 4,
                enabled: true,
              });
              this.render();
            },
          },
          '+ Add rule',
        ),
        presets,
        el('span', { class: 'spacer' }),
        el('button', { class: 'btn primary', onclick: () => this.apply() }, 'Apply to squad'),
      ),
    );
    if (this.error) r.append(el('p', { class: 'error' }, this.error));
    else if (this.flash) {
      r.append(el('p', { class: 'ok' }, this.flash));
      this.flash = '';
    }
    const json = el('textarea', { class: 'json', spellcheck: 'false', rows: 6 });
    json.value = JSON.stringify(this.rules, null, 1);
    r.append(
      el(
        'details',
        { class: 'json-box' },
        el('summary', {}, 'Edit as JSON'),
        json,
        el(
          'button',
          {
            class: 'btn',
            onclick: () => {
              try {
                this.rules = validateRules(JSON.parse(json.value));
                this.error = '';
              } catch (e) {
                this.error = e.message;
              }
              this.render();
            },
          },
          'Load JSON',
        ),
      ),
    );
  }
}
