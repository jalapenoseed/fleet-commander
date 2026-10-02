// Reaction rules: data-only "when X then Y" scripts that run inside the deterministic sim.
//
// Rules are checked in priority order (first = highest) every RULE_PERIOD ticks. A rule enters
// when its condition crosses `value`, and exits only after the condition clears a hysteresis
// band AND it has been active for MIN_ACTIVE seconds, so squads don't flicker at the threshold.
// While a rule is active its action overrides the squad's player order. After exit the rule
// waits `cooldown` seconds before it can fire again.

import { FORMATIONS } from './defs.js';

export const RULE_PERIOD = 5;
export const MIN_ACTIVE = 2;
export const MAX_RULES = 12;

export const CONDITIONS = {
  enemyNear: {
    label: 'Enemy within',
    unit: 'm',
    min: 4,
    max: 40,
    default: 16,
    enter: (s, v) => s.nearestEnemy < v,
    exit: (s, v) => s.nearestEnemy > v * 1.3,
    say: (v) => `an enemy drone gets within ${v} m`,
    math: (v) => `distance from the squad center to the closest visible enemy < ${v}`,
  },
  threat: {
    label: 'Threat above',
    unit: '×',
    min: 0.2,
    max: 4,
    default: 1.3,
    enter: (s, v) => s.threat > v,
    exit: (s, v) => s.threat < v * 0.75,
    say: (v) => `nearby enemies are ${v}× stronger than this squad`,
    math: (v) =>
      `threat = Σ(enemy hp × dps) ÷ Σ(own hp × dps) inside 18 m; trigger above ${v}, clear below ${(v * 0.75).toFixed(2)}`,
  },
  hurt: {
    label: 'Health below',
    unit: '%',
    min: 5,
    max: 95,
    default: 35,
    enter: (s, v) => s.health * 100 < v,
    exit: (s, v) => s.health * 100 > v + 15,
    say: (v) => `the squad's average health drops under ${v}%`,
    math: (v) => `mean(hp ÷ maxHp) < ${v / 100}; clears above ${(v + 15) / 100}`,
  },
  jammed: {
    label: 'Jammed above',
    unit: '%',
    min: 5,
    max: 100,
    default: 30,
    enter: (s, v) => s.jammed * 100 > v,
    exit: (s, v) => s.jammed * 100 < v * 0.4,
    say: (v) => `more than ${v}% of the squad is being jammed`,
    math: (v) => `jammed drones ÷ squad size > ${v / 100}`,
  },
  detected: {
    label: 'Detected by radar',
    unit: '',
    enter: (s) => s.detected > 0,
    exit: (s) => s.detected === 0,
    say: () => 'an enemy radar field spots the squad',
    math: () => 'any member is inside an enemy radar radius',
  },
  battery: {
    label: 'Battery below',
    unit: '%',
    min: 5,
    max: 95,
    default: 40,
    enter: (s, v) => s.battery * 100 < v,
    exit: (s, v) => s.battery * 100 > Math.min(98, v + 30),
    say: (v) => `the squad's average battery drops under ${v}%`,
    math: (v) =>
      `mean(charge) < ${v / 100}; drones burn 1 + 0.8·(1/cos(tilt) − 1) hover-seconds per second`,
  },
  outnumbered: {
    label: 'Outnumbered by',
    unit: '×',
    min: 1,
    max: 5,
    default: 2,
    enter: (s, v) => s.enemyCount > s.size * v,
    exit: (s, v) => s.enemyCount < s.size * v * 0.7,
    say: (v) => `visible enemies nearby outnumber the squad ${v} to 1`,
    math: (v) => `enemies within 18 m > ${v} × squad size`,
  },
};

export const ACTIONS = {
  evade: {
    label: 'Evade',
    say: 'spread out and back away from the threat',
    math: 'separation spacing ×1.8 and the goal vector flips to point away from the threat center',
  },
  retreat: {
    label: 'Retreat',
    say: 'fly home to the nearest repair field or core without fighting',
    math: 'goal = nearest friendly repair/core; target acquisition is switched off',
  },
  attack: {
    label: 'Attack',
    say: 'charge at the threat',
    math: 'goal = threat center; drones break formation to chase targets inside sensor range',
  },
  hold: {
    label: 'Hold',
    say: 'stop and fight only what comes into range',
    math: 'goal velocity = 0; drones only engage inside weapon range',
  },
  regroup: {
    label: 'Regroup',
    say: 'pull together into a tight grid',
    math: 'formation = grid at 0.8× spacing around the squad center',
  },
  formation: {
    label: 'Change formation',
    say: 'switch formation',
    math: 'formation slots are regenerated; drones steer to the new slots',
  },
};

export const DEFAULT_RULES = [
  { when: 'hurt', value: 30, then: 'retreat', cooldown: 8, enabled: true },
];

export function validateRules(input) {
  const list = Array.isArray(input) ? input : input?.rules;
  if (!Array.isArray(list)) throw Error('Expected a list of rules.');
  if (list.length > MAX_RULES) throw Error(`Up to ${MAX_RULES} rules per squad.`);
  return list.map((r, i) => {
    const c = CONDITIONS[r?.when];
    if (!c) throw Error(`Rule ${i + 1}: unknown condition "${r?.when}".`);
    if (!ACTIONS[r.then]) throw Error(`Rule ${i + 1}: unknown action "${r.then}".`);
    const value = c.min === undefined ? 0 : Number(r.value ?? c.default);
    if (c.min !== undefined && !(value >= c.min && value <= c.max))
      throw Error(`Rule ${i + 1}: value must be ${c.min}–${c.max}.`);
    const cooldown = Number(r.cooldown ?? 4);
    if (!(cooldown >= 0 && cooldown <= 60)) throw Error(`Rule ${i + 1}: cooldown must be 0–60 s.`);
    const out = { when: r.when, value, then: r.then, cooldown, enabled: r.enabled !== false };
    if (r.then === 'formation') {
      if (!FORMATIONS.includes(r.formation)) throw Error(`Rule ${i + 1}: unknown formation.`);
      out.formation = r.formation;
    }
    return out;
  });
}

// Plain-English (ELI5) and math explanations for Learn mode.
export function explainRule(r) {
  const c = CONDITIONS[r.when],
    a = ACTIONS[r.then];
  const what = r.then === 'formation' ? `switch to ${r.formation} formation` : a.say;
  return {
    plain: `When ${c.say(r.value)}, this squad will ${what}. It keeps doing that until things calm down, then waits ${r.cooldown} s before this rule can fire again.`,
    math: `Enter: ${c.math(r.value)}. Action: ${a.math}.`,
  };
}

// Advance one squad's rule state. `s` is the squad's sensed situation; returns nothing, mutates squad.
export function runRules(squad, s, tick, tickRate) {
  const rules = squad.rules;
  const r = squad.reaction;
  if (r) {
    const rule = rules[r.index];
    const held = (tick - r.since) / tickRate >= MIN_ACTIVE;
    if (!rule || !rule.enabled || (held && CONDITIONS[rule.when].exit(s, rule.value))) {
      if (rule) squad.cooldowns[r.index] = tick + rule.cooldown * tickRate;
      squad.reaction = null;
    }
  }
  const limit = squad.reaction ? squad.reaction.index : rules.length;
  for (let i = 0; i < limit; i++) {
    const rule = rules[i];
    if (!rule.enabled || (squad.cooldowns[i] || 0) > tick) continue;
    if (CONDITIONS[rule.when].enter(s, rule.value)) {
      squad.reaction = { index: i, since: tick, x: s.threatX, z: s.threatZ };
      squad.reactions++;
      break;
    }
  }
}
