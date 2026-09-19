import { validateCommanderFleet } from './fleet-commander-core.js?v=0.9.0';
import { createSwarmProgram } from './swarm-program.js?v=0.9.0';
export const COMMANDER_PRESETS = {
  flock: {
    name: 'Boids / balanced flock',
    settings: { boids: 'on', shape: 'scatter', pattern: 'weave', boidCohesion: 0.65 },
  },
  looseflock: {
    name: 'Boids / loose swarm',
    settings: {
      boids: 'on',
      shape: 'scatter',
      pattern: 'search',
      boidCohesion: 0.15,
      boidSeparation: 2,
      boidDistance: 10,
    },
  },
  tightflock: {
    name: 'Boids / close formation',
    settings: {
      boids: 'on',
      shape: 'wedge',
      boidCohesion: 0.8,
      boidAlignment: 1,
      boidMatching: 1,
      boidDistance: 4,
    },
  },
  none: { name: 'None / clear every effect', settings: {} },
  corkscrew: {
    name: 'Corkscrew reveal',
    settings: { shape: 'line', show: 'corkscrew', height: 32, phaseVariance: 1.2 },
  },
  ribbon: {
    name: 'Ribbon sweep',
    settings: { shape: 'grid', show: 'ribbon', height: 36, offset: 0.025 },
  },
  salute: { name: 'Rise & salute', settings: { shape: 'wedge', show: 'salute', height: 28 } },
  layered: {
    name: 'Layered wave / independent fields',
    settings: {
      shape: 'grid',
      field: 'wave',
      field2: 'vortex',
      strength2: 5,
      frequency2: 0.4,
      phaseVariance: 0.8,
    },
  },
  sequence: {
    name: 'Word sequence / HELLO → WORLD',
    settings: {
      shape: 'word',
      word: 'HELLO',
      sequenceEnabled: true,
      sequenceWords: 'HELLO\nWORLD',
      sequenceHold: 8,
      sequenceTransition: 10,
      sequenceLoop: true,
      height: 40,
      scale: 3,
      plane: 'sky',
      morph: 10,
    },
  },
  wedge: { name: 'Wedge', settings: { shape: 'wedge' } },
  trail: { name: 'Column / trail', settings: { shape: 'column' } },
  line: { name: 'Line abreast', settings: { shape: 'line' } },
  grid: { name: 'Grid', settings: { shape: 'grid' } },
  orbit: { name: 'Orbit', settings: { shape: 'ring', pattern: 'orbit' } },
  dual: { name: 'Dual orbit', settings: { shape: 'double-orbit', pattern: 'orbit' } },
  scatter: { name: 'Adaptive scatter', settings: { shape: 'scatter', pattern: 'weave' } },
  staggered: { name: 'Staggered', settings: { shape: 'staggered' } },
  highlow: { name: 'High / low', settings: { shape: 'high-low' } },
  protect: {
    name: 'Protective ring',
    settings: { shape: 'ring', origin: 'operator', moveZ: 0, pattern: 'orbit', height: 18 },
  },
  overwatch: { name: 'Overwatch', settings: { shape: 'overwatch', height: 36 } },
  search: { name: 'Search grid', settings: { shape: 'grid', pattern: 'search' } },
  buzz: { name: 'Buzz pass', settings: { shape: 'line', show: 'flyby', height: 25 } },
  weave: { name: 'Weave', settings: { shape: 'grid', pattern: 'weave' } },
  pulse: { name: 'Expand / contract', settings: { shape: 'ring', pattern: 'pulse' } },
  wave: { name: 'Wave dance', settings: { shape: 'grid', field: 'wave', show: 'dance' } },
  riemann: {
    name: 'Riemann bloom',
    settings: { shape: 'ring', field: 'riemann', strength: 16, pattern: 'orbit' },
  },
  lissajous: {
    name: 'Lissajous dance',
    settings: { shape: 'grid', field: 'lissajous', strength: 12, show: 'dance' },
  },
  spiral: { name: 'Rising spiral', settings: { shape: 'ring', field: 'spiral', strength: 16 } },
  braid: { name: 'Opening braid', settings: { shape: 'line', field: 'braid', strength: 14 } },
  twin: { name: 'Twin attractors', settings: { shape: 'scatter', field: 'twin', strength: 14 } },
  square: { name: 'Complex square', settings: { shape: 'ring', field: 'square', strength: 10 } },
  roll: { name: 'Barrel-roll wave', settings: { shape: 'grid', show: 'roll', offset: 0.06 } },
  flip: { name: 'Synchronized flips', settings: { shape: 'grid', show: 'flip', offset: 0 } },
  beat: {
    name: 'Beat dance / 120 BPM',
    settings: { shape: 'grid', show: 'dance', beatSync: true, bpm: 120, offset: 0 },
  },
  word: {
    name: 'Sky writing / GRID',
    settings: { shape: 'word', word: 'GRID', scale: 3, trace: false, plane: 'sky' },
  },
  drawing: {
    name: 'Draw your own',
    settings: { shape: 'drawing', trace: false, plane: 'sky', scale: 2 },
  },
  split: {
    name: 'Guard + scout',
    source:
      'select alpha\nassign operator\nselect bravo\nassign bike\nselect charlie\nassign scout\nselect delta\nassign formation\nformation ring\ninfluence wave 5 0.5\nrepeat 24',
  },
  relay: {
    name: 'Relay mesh + scouts',
    source:
      'select relays\nassign relay\nselect scouts\nassign scout\nselect cargo\nassign bike\nselect engineers\nassign operator\nrepeat 24',
  },
};
export function commanderPreset(config, key) {
  const preset = COMMANDER_PRESETS[key];
  if (!preset) throw Error('Choose a Commander preset.');
  const fleet = validateCommanderFleet(config),
    p = fleet.program;
  p.ids = fleet.roster.map((d) => d.id);
  p.mode = preset.source ? 'script' : 'manual';
  p.settings = {
    ...createSwarmProgram().settings,
    shape: 'grid',
    pattern: 'none',
    field: 'none',
    show: 'none',
    height: 28,
    spacing: 14,
    origin: 'operator',
    moveX: 0,
    moveZ: -30,
    rotation: 0,
    scale: 1,
    beatSync: false,
    sequenceEnabled: false,
    offset: 0.04,
    trace: false,
    ...preset.settings,
  };
  if (preset.source) p.source = preset.source;
  return validateCommanderFleet(fleet);
}
