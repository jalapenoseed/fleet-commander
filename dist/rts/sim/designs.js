// Drone designer: airframes assembled from parts. A design becomes a new entry in world.roles via
// a deterministic 'design' command, so designs replay and sync like everything else.

export const FRAMES = {
  light: {
    label: 'Light frame',
    blurb: 'Fast and cheap, light armor. Built in packs of 3.',
    hp: 50,
    speed: 9.5,
    accel: 32,
    armor: 0,
    bw: 1,
    cost: 12,
    battery: 110,
    build: 3.5,
    pack: 3,
    sensor: 16,
    flight: { alt: 4.2, tilt: 1.1, tiltRate: 9, yawRate: 6, climb: 6 },
    model: 'scout',
  },
  medium: {
    label: 'Medium frame',
    blurb: 'Balanced. Medium armor. Built in pairs.',
    hp: 90,
    speed: 8,
    accel: 26,
    armor: 1,
    bw: 2,
    cost: 25,
    battery: 140,
    build: 4.5,
    pack: 2,
    sensor: 15,
    flight: { alt: 3.8, tilt: 1.0, tiltRate: 7, yawRate: 4.5, climb: 5 },
    model: 'interceptor',
  },
  heavy: {
    label: 'Heavy frame',
    blurb: 'Slow, heavily armored hexacopter. Built one at a time.',
    hp: 170,
    speed: 5.5,
    accel: 16,
    armor: 2,
    bw: 3,
    cost: 45,
    battery: 180,
    build: 6,
    pack: 1,
    sensor: 13,
    flight: { alt: 3.0, tilt: 0.75, tiltRate: 3.5, yawRate: 2.2, climb: 3 },
    model: 'assault',
  },
};

export const WEAPON_PARTS = {
  none: { label: 'No weapon', cost: 0 },
  pulse: {
    label: 'Pulse gun',
    cost: 4,
    weapon: { type: 'pulse', range: 6, damage: 4, cooldown: 0.5 },
    cone: 0.7,
  },
  flak: {
    label: 'Flak cannon',
    cost: 10,
    weapon: { type: 'flak', range: 8, damage: 9, cooldown: 0.4 },
    cone: 0.55,
  },
  missile: {
    label: 'Missile rack',
    cost: 18,
    weapon: { type: 'missile', range: 9.5, damage: 22, cooldown: 1 },
    cone: 0.9,
  },
  rail: {
    label: 'Rail lance',
    cost: 24,
    tier: 2,
    weapon: { type: 'rail', range: 17, damage: 42, cooldown: 2.2 },
    cone: 0.25,
    needs: 'medium',
  },
};

export const SENSOR_PARTS = {
  standard: { label: 'Standard optics', cost: 0, sensor: 0 },
  extended: { label: 'Extended array', cost: 6, sensor: 8 },
  longrange: { label: 'Long-range mast', cost: 14, sensor: 16, battery: -0.1 },
};

export const MODULES = {
  none: { label: 'No module', cost: 0 },
  battery: { label: 'Battery pack', cost: 6, battery: 0.5, speed: -0.05 },
  armor: { label: 'Armor plates', cost: 8, hp: 0.35, speed: -0.12 },
  jammer: { label: 'Jammer', cost: 15, aura: { jam: 9 } },
  medic: { label: 'Repair kit', cost: 12, aura: { heal: 6, healRate: 6 } },
  relay: { label: 'Relay antenna', cost: 10, aura: { counterJam: 10 }, sensor: 6 },
  shield: { label: 'Shield emitter', cost: 15, tier: 2, aura: { shield: 7, shieldCut: 0.4 } },
};

export const PART_KINDS = {
  frame: FRAMES,
  weapon: WEAPON_PARTS,
  sensor: SENSOR_PARTS,
  module: MODULES,
};
export const MAX_DESIGNS = 8;

// Validate a design spec and build its role entry. Throws with a readable reason.
export function buildDesign(spec, team, index) {
  const f = FRAMES[spec.frame],
    wp = WEAPON_PARTS[spec.weapon],
    sn = SENSOR_PARTS[spec.sensor],
    md = MODULES[spec.module];
  if (!f || !wp || !sn || !md) throw Error('Unknown part');
  if (wp.needs === 'medium' && spec.frame === 'light')
    throw Error('A rail lance needs at least a medium frame');
  if (spec.weapon === 'none' && spec.module === 'none') throw Error('Give it a weapon or a module');
  const name =
    String(spec.name || '')
      .trim()
      .slice(0, 24) || `Design ${index + 1}`;
  const hp = Math.round(f.hp * (1 + (md.hp || 0)));
  const speed = f.speed * (1 + (md.speed || 0));
  const battery = Math.round(f.battery * (1 + (md.battery || 0) + (sn.battery || 0)));
  const partCost = wp.cost + sn.cost + md.cost;
  return {
    key: `design${index}`,
    label: name,
    design: {
      frame: spec.frame,
      weapon: spec.weapon,
      sensor: spec.sensor,
      module: spec.module,
      model: f.model,
    },
    owner: team,
    tier: Math.max(1, wp.tier || 1, md.tier || 1),
    battery,
    flight: { ...f.flight, cone: wp.cone || 3.2 },
    blurb: `${f.label}, ${wp.label.toLowerCase()}, ${sn.label.toLowerCase()}, ${md.label.toLowerCase()}.`,
    cost: f.cost + partCost,
    bw: f.bw + (md.aura ? 1 : 0),
    pack: f.pack,
    build: f.build + partCost / 12,
    hp,
    speed,
    accel: f.accel,
    sensor: f.sensor + sn.sensor + (md.sensor || 0),
    armor: f.armor,
    ...(wp.weapon ? { weapon: { ...wp.weapon } } : {}),
    ...(md.aura ? { aura: { ...md.aura } } : {}),
  };
}
