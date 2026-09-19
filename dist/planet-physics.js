// Educational, non-combat mass and energy accounting. Aircraft coefficients are
// illustrative game values; this is not an aircraft or weapons design model.
export const PLANETS = Object.freeze({
  earth: {
    name: 'Earth',
    gravity: 9.81,
    density: 1.225,
    sky: 'golden',
    scenery: 'stadium',
    note: 'Sea-level reference atmosphere. Weather and altitude variation are not modeled.',
  },
  moon: {
    name: 'Moon',
    gravity: 1.62,
    density: 0,
    sky: 'lunar',
    scenery: 'moon',
    note: 'Vacuum: ordinary propellers cannot generate lift. Constrained rotors fall; arcade lift is fictional.',
  },
  mars: {
    name: 'Mars',
    gravity: 3.73,
    density: 0.016,
    sky: 'martian',
    scenery: 'mars',
    note: 'Thin atmosphere: these Earth-style game quads cannot sustain flight. Arcade lift is fictional; this is not a Mars helicopter model.',
  },
});
export const FRAME_MATERIALS = {
  composite: { name: 'Composite laminate', mass: 0.18 },
  aluminum: { name: 'Aluminum alloy', mass: 0.32 },
  polymer: { name: 'Molded polymer', mass: 0.24 },
};
export const LAB_DEFAULTS = Object.freeze({
  planet: 'earth',
  rotorMode: 'arcade',
  energyModel: false,
  material: 'composite',
  batteryMass: 0.24,
  batteryWh: 45,
  flightWatts: 140,
  electronicsWatts: 8,
  cargoMass: 0,
});
export function labSettings(raw = {}) {
  const r = { ...LAB_DEFAULTS };
  for (const [key, values] of [
    ['planet', PLANETS],
    ['material', FRAME_MATERIALS],
  ])
    if (Object.hasOwn(values, raw[key])) r[key] = raw[key];
  if (['arcade', 'constrained'].includes(raw.rotorMode)) r.rotorMode = raw.rotorMode;
  r.energyModel = raw.energyModel === true;
  for (const [key, min, max] of [
    ['batteryMass', 0.05, 5],
    ['batteryWh', 1, 2000],
    ['flightWatts', 1, 5000],
    ['electronicsWatts', 0, 200],
    ['cargoMass', 0, 10],
  ])
    if (Number.isFinite(raw[key])) r[key] = Math.min(max, Math.max(min, raw[key]));
  return r;
}
export function massLedger(config = LAB_DEFAULTS) {
  const c = labSettings(config);
  return [
    {
      name: 'Frame',
      material: FRAME_MATERIALS[c.material].name,
      kg: FRAME_MATERIALS[c.material].mass,
    },
    { name: 'Motors × 4', material: 'Steel / copper / magnets', kg: 0.12 },
    { name: 'Propellers × 4', material: 'Polymer', kg: 0.024 },
    { name: 'Electronics & wiring', material: 'FR-4 / copper / silicon', kg: 0.065 },
    { name: 'Battery assembly', material: 'Cell chemistry unspecified', kg: c.batteryMass },
    { name: 'Fasteners & landing gear', material: 'Steel / elastomer', kg: 0.045 },
    { name: 'Inert cargo', material: 'User-entered mass', kg: c.cargoMass },
  ];
}
export function energyBudget(config = LAB_DEFAULTS, speed = 0) {
  const c = labSettings(config),
    mass = massLedger(c).reduce((n, r) => n + r.kg, 0),
    planet = PLANETS[c.planet],
    watts = c.flightWatts * (1 + Math.min(1, Math.max(0, speed) / 24) * 0.35) + c.electronicsWatts;
  return {
    mass,
    weight: mass * planet.gravity,
    watts,
    wh: c.batteryWh,
    minutes: (c.batteryWh / watts) * 60,
    drainPerSecond: (watts / 3600 / c.batteryWh) * 100,
  };
}
export function freeFlightDrain(config, speed, legacy) {
  return config?.energyModel
    ? ((config.flightWatts * (1 + Math.min(1, Math.max(0, speed) / 24) * 0.35) +
        config.electronicsWatts) /
        3600 /
        config.batteryWh) *
        100
    : legacy;
}
export function arcadeMassScale(config) {
  return config?.energyModel ? Math.max(0.25, Math.min(1.5, 0.674 / energyBudget(config).mass)) : 1;
}
export function constrainedPlanetStep(sim, dt) {
  const c = sim.lab;
  if (!c || c.planet === 'earth' || c.rotorMode !== 'constrained') return false;
  const p = PLANETS[c.planet];
  sim.elapsed += dt;
  for (const d of sim.drones) {
    if (d.mode === 'QUEUED' && sim.elapsed >= d.delay) d.mode = 'FLY';
    if (!['FLY', 'RETURN', 'LAND'].includes(d.mode)) continue;
    d.velocity[1] -= p.gravity * dt;
    const drag = Math.exp(-p.density * 0.18 * dt);
    for (let j = 0; j < 3; j++) {
      d.velocity[j] *= drag;
      d.pos[j] += d.velocity[j] * dt;
    }
    let ground = d.home[1];
    if (d.pos[1] <= ground) {
      d.pos[1] = ground;
      d.velocity = [0, 0, 0];
      d.mode = 'LANDED';
    }
    d.override = p.name + ': insufficient rotor lift';
    if (!sim.fleet.options.unlimited)
      d.battery = Math.max(
        0,
        d.battery - freeFlightDrain(c, 0, 0.06) * dt * sim.fleet.options.batteryDrain,
      );
  }
  return true;
}
