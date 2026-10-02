// Game data for the RTS working model. Units are meters and seconds; the sim runs at TICK_RATE.
// Everything here is plain data so it can be tuned, shown in Learn mode and saved as JSON.

export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;
export const MAX_DRONES = 4096;
export const START_ENERGY = 250;
export const BUILD_RADIUS = 20; // structures must be placed this close to a core or relay tower

// Armor classes: 0 light, 1 medium, 2 heavy, 3 structure.
export const ARMOR = ['light', 'medium', 'heavy', 'structure'];
// Damage multiplier [weapon][armor]. Interceptors beat scouts, scout swarms beat assault,
// assault beats interceptors and structures.
export const WEAPONS = {
  pulse: { label: 'Pulse', vs: [1.0, 1.0, 1.5, 0.5] },
  flak: { label: 'Flak', vs: [1.8, 1.3, 0.5, 0.4] },
  missile: { label: 'Missile', vs: [0.6, 1.0, 1.2, 2.0] },
};

// cost and bw are per drone; one production order builds a pack of drones in `build` seconds.
export const ROLES = [
  {
    key: 'scout',
    label: 'Scout',
    blurb: 'Fast, cheap, long sight. Swarms of them sting heavy targets.',
    cost: 15,
    bw: 1,
    pack: 4,
    build: 4,
    hp: 45,
    speed: 10,
    accel: 34,
    sensor: 22,
    armor: 0,
    weapon: { type: 'pulse', range: 6, damage: 4, cooldown: 0.5 },
  },
  {
    key: 'interceptor',
    label: 'Interceptor',
    blurb: 'Flak hunter. Shreds scouts and support drones; weak against armor.',
    cost: 25,
    bw: 1,
    pack: 3,
    build: 4.5,
    hp: 70,
    speed: 8.5,
    accel: 30,
    sensor: 15,
    armor: 1,
    weapon: { type: 'flak', range: 8, damage: 9, cooldown: 0.4 },
  },
  {
    key: 'assault',
    label: 'Assault',
    blurb: 'Armored missile carrier. Breaks interceptors and structures.',
    cost: 45,
    bw: 2,
    pack: 2,
    build: 6,
    hp: 160,
    speed: 5.5,
    accel: 16,
    sensor: 13,
    armor: 2,
    weapon: { type: 'missile', range: 9.5, damage: 22, cooldown: 1 },
  },
  {
    key: 'jammer',
    label: 'Jammer',
    blurb: 'Enemies nearby slow down, fire slower and see less.',
    cost: 40,
    bw: 2,
    pack: 1,
    build: 4,
    hp: 80,
    speed: 7,
    accel: 22,
    sensor: 15,
    armor: 1,
    aura: { jam: 11 },
  },
  {
    key: 'medic',
    label: 'Medic',
    blurb: 'Repairs damaged allies in a small radius.',
    cost: 35,
    bw: 2,
    pack: 1,
    build: 4,
    hp: 70,
    speed: 7,
    accel: 22,
    sensor: 13,
    armor: 1,
    aura: { heal: 7, healRate: 7 },
  },
  {
    key: 'relay',
    label: 'Relay',
    blurb: 'Huge sight radius and cancels enemy jamming around it.',
    cost: 35,
    bw: 2,
    pack: 1,
    build: 4,
    hp: 90,
    speed: 7,
    accel: 22,
    sensor: 28,
    armor: 1,
    aura: { counterJam: 12 },
  },
];
export const ROLE_INDEX = Object.fromEntries(ROLES.map((r, i) => [r.key, i]));

// Structures double as the placeable sensor / hazard fields from the lab.
export const STRUCTURES = {
  core: {
    label: 'Command Core',
    blurb: 'Your base. Lose it and you lose the match. Produces drones.',
    cost: 0,
    hp: 2500,
    build: 0,
    radius: 3.2,
    sensor: 22,
    bandwidth: 40,
    income: 4,
    power: BUILD_RADIUS,
    produces: true,
    weapon: { type: 'pulse', range: 11, damage: 8, cooldown: 0.3 },
  },
  fabricator: {
    label: 'Fabricator',
    blurb: 'A second production line for drones.',
    cost: 150,
    hp: 800,
    build: 14,
    radius: 2.4,
    sensor: 10,
    produces: true,
  },
  extractor: {
    label: 'Extractor',
    blurb: 'Must sit on an energy well. +5 energy/s.',
    cost: 100,
    hp: 450,
    build: 10,
    radius: 1.8,
    sensor: 10,
    income: 5,
    onWell: true,
  },
  relay: {
    label: 'Relay Tower',
    blurb: '+25 command bandwidth and extends where you can build.',
    cost: 80,
    hp: 380,
    build: 8,
    radius: 1.4,
    sensor: 14,
    bandwidth: 25,
    power: BUILD_RADIUS,
  },
  radar: {
    label: 'Radar Field',
    blurb: 'Reveals a wide area. Enemies inside are marked as detected.',
    cost: 110,
    hp: 320,
    build: 10,
    radius: 1.4,
    sensor: 34,
    detect: 34,
  },
  jammer: {
    label: 'Jammer Field',
    blurb: 'Jams enemy drones inside the field. Relay drones resist it.',
    cost: 130,
    hp: 380,
    build: 10,
    radius: 1.6,
    sensor: 12,
    jam: 15,
  },
  turret: {
    label: 'Kill Zone',
    blurb: 'Damages every enemy drone inside the field.',
    cost: 160,
    hp: 650,
    build: 12,
    radius: 1.8,
    sensor: 14,
    zone: { radius: 10, dps: 12 },
  },
  repair: {
    label: 'Repair Field',
    blurb: 'Heals friendly drones inside. Retreating squads head here.',
    cost: 120,
    hp: 380,
    build: 10,
    radius: 1.6,
    sensor: 10,
    heal: { radius: 9, rate: 12 },
  },
};
export const STRUCTURE_KINDS = Object.keys(STRUCTURES);

export const FORMATIONS = ['swarm', 'wedge', 'line', 'column', 'ring', 'grid', 'spiral', 'diamond'];
export const PLAYS = ['move', 'attack', 'hold', 'retreat', 'patrol', 'pincer', 'orbit'];
export const PLAY_INFO = {
  move: 'Fly to the point in formation. Fire only at things already in range.',
  attack: 'Attack-move: break formation to fight anything spotted on the way.',
  hold: 'Stay put and fight only what comes into weapon range.',
  retreat: 'Fall back to the nearest repair field or core without fighting.',
  patrol: 'Sweep back and forth between here and the point, attacking on the way.',
  pincer: 'Split in two, swing around both flanks, then converge on the point.',
  orbit: 'Circle the point in a ring, engaging anything in range.',
};

export const TEAM_COLORS = ['#3fd9ff', '#ff5a4e', '#b98cff', '#ffc94a'];
export const TEAM_NAMES = ['Cyan', 'Crimson', 'Violet', 'Amber'];
