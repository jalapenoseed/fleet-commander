// Research: tier unlocks and upgrades, done at Research Labs. Each team's effective unit stats are
// the base airframe data with that team's researched upgrades applied (see teamStats). Some
// upgrades exclude each other, so research is a set of choices, not a checklist.

import { dcos, dtan } from './dmath.js';
import { GRAVITY as G } from './defs.js';

export const TECH = {
  tier2: {
    label: 'Tier 2 Airframes',
    blurb: 'Unlocks the Lancer siege drone and the Warden shield drone.',
    cost: 250,
    time: 40,
  },
  tier3: {
    label: 'Tier 3 Airframes',
    blurb: 'Unlocks the Carrier and its Wasp micro-drones.',
    cost: 450,
    time: 60,
    requires: ['tier2'],
  },
  batteries: {
    label: 'Extended Batteries',
    blurb: '+40% battery capacity for every drone.',
    cost: 150,
    time: 30,
  },
  charging: {
    label: 'Fast Charging',
    blurb: 'Charging pads and cores recharge drones twice as fast.',
    cost: 120,
    time: 25,
  },
  motors: {
    label: 'Overclocked Motors',
    blurb: '+12% top speed; batteries drain 10% faster.',
    cost: 180,
    time: 35,
  },
  plating: {
    label: 'Armor Plating',
    blurb: '+25% hull for heavy-armored drones (Assault, Lancer, Carrier).',
    cost: 200,
    time: 35,
    requires: ['tier2'],
  },
  flakBurst: {
    label: 'Flak Bursts',
    blurb: 'Flak hits splash 50% damage to enemies within 2.5 m. (Excludes Long Flak.)',
    cost: 160,
    time: 30,
    excludes: ['flakRange'],
  },
  flakRange: {
    label: 'Long Flak',
    blurb: 'Interceptor flak range +30%. (Excludes Flak Bursts.)',
    cost: 160,
    time: 30,
    excludes: ['flakBurst'],
  },
  cloak: {
    label: 'Optical Camouflage',
    blurb:
      'Scouts that hover still are invisible unless an enemy is within 6 m or radar sees them.',
    cost: 200,
    time: 40,
    requires: ['tier2'],
  },
  fieldProjector: {
    label: 'Field Projector',
    blurb: 'Unlocks the Vortex Trap and Flow Barrier: the vector-field lab, weaponized.',
    cost: 220,
    time: 40,
    requires: ['tier2'],
  },
  intrusion: {
    label: 'Intrusion Suite',
    blurb: 'Jammer drones hack jammed enemy drones they stay within 6 m of for 4 s (not carriers).',
    cost: 300,
    time: 45,
    requires: ['tier3'],
  },
  jamRange: {
    label: 'Wideband Jamming',
    blurb: 'Jammer drones and Jammer Fields reach 35% farther.',
    cost: 150,
    time: 30,
  },
};
export const TECH_KEYS = Object.keys(TECH);

// Why a team can't start a project right now, or null if it can.
export function researchBlocker(team, key) {
  const t = TECH[key];
  if (!t) return 'Unknown research';
  if (team.tech.has(key)) return 'Already researched';
  if (team.researching.has(key)) return 'Already in progress';
  for (const r of t.requires || []) if (!team.tech.has(r)) return `Needs ${TECH[r].label}`;
  for (const x of t.excludes || [])
    if (team.tech.has(x) || team.researching.has(x)) return `Excluded by ${TECH[x].label}`;
  if (team.energy < t.cost) return 'Not enough energy';
  return null;
}

// Derived per-airframe values the flight model needs: drag (so top speed is reached at max tilt)
// and the cosine of the weapon cone.
function derive(s) {
  s.drag = (G * dtan(s.flight.tilt)) / s.speed;
  s.cosCone = dcos(Math.min(s.flight.cone, 3.14159));
  return s;
}

// Effective stats for every role for one team.
export function teamStats(roles, tech) {
  return roles.map((base) => {
    const s = { ...base, flight: { ...base.flight } };
    if (base.weapon) s.weapon = { ...base.weapon };
    if (base.aura) s.aura = { ...base.aura };
    s.drain = 1;
    s.chargeMult = 1;
    if (tech.has('batteries')) s.battery = base.battery * 1.4;
    if (tech.has('motors')) {
      s.speed = base.speed * 1.12;
      s.drain = 1.1;
    }
    if (tech.has('plating') && base.armor === 2) s.hp = base.hp * 1.25;
    if (tech.has('flakRange') && s.weapon?.type === 'flak')
      s.weapon.range = base.weapon.range * 1.3;
    if (tech.has('flakBurst') && s.weapon?.type === 'flak') s.weapon.splash = 2.5;
    if (tech.has('jamRange') && s.aura?.jam) s.aura.jam = base.aura.jam * 1.35;
    if (tech.has('cloak') && base.key === 'scout') s.cloak = true;
    if (tech.has('charging')) s.chargeMult = 2;
    return derive(s);
  });
}

export function unlockedTier(tech) {
  return tech.has('tier3') ? 3 : tech.has('tier2') ? 2 : 1;
}
