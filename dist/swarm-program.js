import { showPosition, DIRECTOR_STYLES } from './show-motion.js?v=0.9.0';
import { BOID_DEFAULTS, BOID_RANGES } from './boids.js?v=0.9.0';
import { DEFAULT_FLEET_SONG, parseFleetSong } from './fleet-score.js?v=0.9.0';
import { STARTER_AIRCRAFT } from './fleet-manifest.js?v=0.9.0';
import { parseFormula, evaluateFormula } from './swarm-expressions.js?v=0.9.0';
import {
  basicShape,
  samplePath,
  wordStrokes,
  validateStrokes,
  pathMetrics,
  largeFleetShape,
} from './swarm-shapes.js?v=0.9.0';

import { sequenceWords, wordSequenceState } from './word-sequence.js?v=0.9.0';
import { validateArt, artSlot } from './art-formation.js?v=0.9.0';
import { validateMusic } from './step-sequencer.js?v=0.9.0';
import {
  EFFECT_DEFAULTS,
  EFFECT_RANGES,
  MOTION_PATTERNS,
  SHOW_STYLES,
  clearProgramEffects,
  seededVariation,
} from './fleet-effects.js?v=0.9.0';

export const PROGRAM_SHAPES = {
  ring: 'Ring',
  wedge: 'Wedge',
  line: 'Line',
  grid: 'Grid',
  column: 'Column / trail',
  'double-orbit': 'Dual orbit',
  scatter: 'Adaptive scatter',
  staggered: 'Staggered',
  'high-low': 'High / low',
  overwatch: 'Overwatch',
  word: 'Word',
  drawing: 'Drawing',
  pixels: 'Pixel / image art',
};
export const PROGRAM_FIELDS = {
  none: 'None',
  vortex: 'Vortex / curl',
  attract: 'Attraction',
  repel: 'Repulsion',
  wave: 'Traveling wave',
  lissajous: 'Lissajous',
  spiral: 'Rising spiral',
  braid: 'Opening braid',
  twin: 'Twin attractors',
  square: 'Complex square',
  riemann: 'Riemann sphere',
  custom: 'Custom formula',
};
export const FIELD_FORMULAS = {
  none: 'No additional displacement.',
  vortex: 'Δ = strength × (−z, 0, x) / max(1, √(x² + z²))',
  attract: 'Δ points toward the origin; strength sets its length.',
  repel: 'Δ points away from the origin; strength sets its length.',
  wave: 'Δy = strength × sin(frequency × t + phase + i × 0.7)',
  lissajous: 'Δ = strength × (sin(2q), 0.4 sin(3q), cos(3q)), q = frequency × t + phase + i × 0.7',
  spiral: 'Δ = strength × (cos(q), 0.35 sin(q/2), sin(q))',
  braid: 'Two opposed sine strands open and rejoin; q = frequency × t + i × 0.7.',
  twin: 'Blend vectors toward two orbiting attractors.',
  square: 'u = x / scale, v = z / scale; Δ = strength × (u² − v², 0, 2uv).',
  riemann:
    'u = x / scale, v = z / scale, d = 1 + u² + v²; Δ = strength × (2u/d, (u² + v² − 1)/d, 2v/d).',
  custom:
    'Δx, Δy, Δz are in metres. Variables: x, y, z, t (seconds), i (0-based), n, phase, pi, tau.',
};
export const PROGRAM_EXAMPLES = {
  'Guard + light show':
    'select scout\nassign operator\nselect scout-02\nassign bike\nselect relays\nassign relay\nselect scout-03,scout-04\nassign formation\nformation ring\norigin bike\nheight 20\nmove 0 -28\ninfluence wave 5 0.7\nshow dance\nwait 12\nshow flyby\nwait 16\nshow none\nrepeat 32',
  'Riemann bloom':
    'select all\nformation ring\nspacing 18\nheight 24\ninfluence riemann 12 0.5\npattern orbit\nwait 12\ninfluence square 8 0.5\nwait 12\ninfluence vortex 10 0.6\nrepeat 36',
  'Write GRID':
    'select all\nformation word\nword GRID\nheight 26\nscale 2\ntrace on\nwait 24\nword RUN\nrepeat 48',
  'Formula dance':
    'select all\nformation line\nheight 22\ninfluence custom 8 0.7\nformula x = 6 * sin(t * 0.7 + i)\nformula y = 4 * cos(t + i * 0.8)\nformula z = 8 * sin(t * 0.5 + i)\nshow dance\nrepeat 24',
};
const DEFAULTS = {
  ...BOID_DEFAULTS,
  ...EFFECT_DEFAULTS,
  song: DEFAULT_FLEET_SONG,
  shape: 'ring',
  word: 'GRID',
  sequenceEnabled: false,
  sequenceWords: 'HELLO\nWORLD',
  sequenceHold: 8,
  sequenceTransition: 10,
  sequenceLoop: true,
  plane: 'sky',
  spacing: 14,
  height: 20,
  moveX: 0,
  moveZ: -25,
  rotation: 0,
  scale: 1,
  morph: 4,
  trace: true,
  origin: 'bike',
  pattern: 'none',
  team: 'independent',
  field: 'none',
  strength: 8,
  frequency: 0.6,
  phase: 0,
  fieldScale: 20,
  blend: 1,
  show: 'none',
  countIn: 2,
  offset: 0.35,
  beatSync: false,
  bpm: 120,
  formulaX: '6 * sin(t + i)',
  formulaY: '4 * cos(t + i)',
  formulaZ: '6 * cos(t + i)',
};
export function createSwarmProgram() {
  return {
    version: 1,
    mode: 'manual',
    ids: ['scout-03', 'scout-04'],
    settings: { ...DEFAULTS },
    strokes: [],
    source: PROGRAM_EXAMPLES['Guard + light show'],
    enabled: false,
    running: false,
    time: 0,
    activeIds: [],
  };
}
export const PROGRAM_RANGES = {
  ...BOID_RANGES,
  ...EFFECT_RANGES,
  spacing: [8, 30],
  height: [8, 70],
  moveX: [-120, 120],
  moveZ: [-120, 120],
  rotation: [-180, 180],
  scale: [0.25, 3],
  morph: [0, 12],
  strength: [0, 24],
  frequency: [0.05, 3],
  phase: [-6.28, 6.28],
  fieldScale: [5, 80],
  blend: [0, 1],
  countIn: [0, 8],
  offset: [0, 2],
  bpm: [40, 220],
  sequenceHold: [2, 30],
  sequenceTransition: [2, 40],
};
const ENUMS = {
  boids: ['none', 'on'],
  shape: Object.keys(PROGRAM_SHAPES),
  plane: ['sky', 'ground'],
  origin: ['operator', 'bike', 'objective', 'fixed'],
  pattern: Object.keys(MOTION_PATTERNS),
  team: ['independent', 'pairs', 'leader', 'mesh'],
  field: Object.keys(PROGRAM_FIELDS),
  show: Object.keys(SHOW_STYLES),
};
for (let slot = 2; slot <= 4; slot++) ENUMS['field' + slot] = Object.keys(PROGRAM_FIELDS);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mod = (v, n) => ((v % n) + n) % n;
export function validateSwarmProgram(
  raw,
  { reset = false, aircraft = STARTER_AIRCRAFT, groups = {} } = {},
) {
  if (raw === undefined) return createSwarmProgram();
  const base = createSwarmProgram(),
    knownIds = new Set(aircraft);
  if (
    !raw ||
    raw.version !== 1 ||
    !['manual', 'script'].includes(raw.mode) ||
    !Array.isArray(raw.ids) ||
    (raw.ids.length < 1 && aircraft.length > 0) ||
    raw.ids.length > aircraft.length ||
    new Set(raw.ids).size !== raw.ids.length ||
    raw.ids.some((id) => !knownIds.has(id))
  )
    throw Error('Choose valid aircraft from this fleet.');
  const input = raw.settings;
  if (!input || typeof input !== 'object') throw Error('Program settings are missing.');
  const settings = {};
  for (const [key, value] of Object.entries(DEFAULTS)) {
    const v = input[key] ?? value;
    if (PROGRAM_RANGES[key]) {
      const [min, max] = PROGRAM_RANGES[key];
      if (!Number.isFinite(v) || v < min || v > max)
        throw Error(key + ' must be between ' + min + ' and ' + max + '.');
    } else if (ENUMS[key]) {
      if (!ENUMS[key].includes(v)) throw Error('Invalid ' + key + '.');
    } else if (key === 'word') {
      if (typeof v !== 'string' || !/^[A-Z0-9 -]{1,16}$/.test(v) || !v.trim())
        throw Error('Use 1–16 letters, numbers, spaces or hyphens.');
    } else if (key === 'song') parseFleetSong(v);
    else if (key === 'sequenceWords') sequenceWords(v);
    else if (key.startsWith('formula')) parseFormula(v);
    else if (typeof v !== typeof value) throw Error('Invalid ' + key + '.');
    settings[key] = v;
  }
  if (typeof raw.source !== 'string' || raw.source.length > 6000)
    throw Error('Script must fit within 6000 characters.');
  if (raw.mode === 'script') compileProgram(raw.source, { aircraft, groups });
  const strokes = validateStrokes(raw.strokes),
    art = validateArt(raw.art),
    music = validateMusic(raw.music);
  if (settings.shape === 'pixels' && !art?.points.length)
    throw Error('Open Art and paint or upload an image first.');
  if (
    !reset &&
    (typeof raw.enabled !== 'boolean' ||
      typeof raw.running !== 'boolean' ||
      !Number.isFinite(raw.time) ||
      raw.time < 0 ||
      raw.time > 1e8 ||
      !Array.isArray(raw.activeIds) ||
      raw.activeIds.length > aircraft.length ||
      raw.activeIds.some((id) => !raw.ids.includes(id)))
  )
    throw Error('Invalid program playback state.');
  return {
    ...base,
    mode: raw.mode,
    ids: [...raw.ids],
    settings,
    strokes,
    art,
    music,
    source: raw.source,
    ...(aircraft !== STARTER_AIRCRAFT
      ? {
          fleetIds: [...aircraft],
          groups: Object.fromEntries(Object.entries(groups).map(([key, ids]) => [key, [...ids]])),
        }
      : {}),
    ...(!reset
      ? {
          enabled: raw.enabled,
          running: raw.running,
          time: raw.time,
          activeIds: [...new Set(raw.activeIds)],
        }
      : {}),
  };
}
const compileCache = new Map(),
  formulaCache = new Map();
function formula(source) {
  if (!formulaCache.has(source)) {
    if (formulaCache.size > 64) formulaCache.clear();
    formulaCache.set(source, parseFormula(source));
  }
  return formulaCache.get(source);
}
export function compileProgram(source, { aircraft = STARTER_AIRCRAFT, groups = {} } = {}) {
  const key = aircraft === STARTER_AIRCRAFT ? source : source + JSON.stringify([aircraft, groups]);
  if (compileCache.has(key)) return compileCache.get(key);
  if (typeof source !== 'string' || source.length > 6000)
    throw Error('Script must fit within 6000 characters.');
  const lines = source.split('\n');
  if (lines.length > 96) throw Error('Script is limited to 96 lines.');
  const cues = [];
  let at = 0,
    group = [...aircraft],
    repeat = 0,
    countIn = null;
  function number(value, min, max, label) {
    const n = Number(value);
    if (value === undefined || !Number.isFinite(n) || n < min || n > max)
      throw Error(label + ' must be between ' + min + ' and ' + max + '.');
    return n;
  }
  function choice(value, allowed, label) {
    if (!allowed.includes(value)) throw Error(label + ': choose ' + allowed.join(', ') + '.');
    return value;
  }
  for (let row = 0; row < lines.length; row++) {
    const text = lines[row].split('#')[0].trim();
    if (!text) continue;
    const [command, ...args] = text.split(/\s+/);
    let patch = {},
      assignment = null;
    try {
      if (repeat) throw Error('repeat must be the last command.');
      const arity = {
        select: 1,
        wait: 1,
        repeat: 1,
        formation: 1,
        word: null,
        plane: 1,
        origin: 1,
        pattern: 1,
        team: 1,
        show: 1,
        trace: 1,
        beat: 1,
        move: 2,
        objective: 2,
        influence: null,
        layer: null,
        reset: 1,
        boids: 1,
        formula: null,
        assign: 1,
      };
      if (
        Object.hasOwn(arity, command) &&
        arity[command] !== null &&
        args.length !== arity[command]
      )
        throw Error(command + ' expects ' + arity[command] + ' value(s).');
      if (command === 'select') {
        const value = args[0];
        group =
          value === 'all'
            ? [...aircraft]
            : Object.hasOwn(groups, value)
              ? [...groups[value]]
              : value === 'scouts'
                ? aircraft.filter((v) => v.startsWith('scout'))
                : value === 'relays'
                  ? aircraft.filter((v) => v.startsWith('relay'))
                  : value.split(',');
        if (
          (!group.length && aircraft.length > 0 && !Object.hasOwn(groups, value)) ||
          group.some((id) => !aircraft.includes(id)) ||
          new Set(group).size !== group.length
        )
          throw Error('Unknown aircraft group.');
        continue;
      }
      if (command === 'wait') {
        at += number(args[0], 0.1, 120, 'wait');
        if (at > 600) throw Error('Timeline is limited to 600 seconds.');
        continue;
      }
      if (command === 'repeat') {
        repeat = number(args[0], Math.max(1, at + 0.1), 600, 'repeat period');
        continue;
      }
      if (command === 'countIn') {
        if (at !== 0 || args.length !== 1)
          throw Error('countIn takes one number before the first wait.');
        countIn = number(args[0], 0, 8, 'countIn');
        continue;
      }
      if (command === 'formation') patch.shape = choice(args[0], ENUMS.shape, 'formation');
      else if (['origin', 'pattern', 'team', 'show', 'plane', 'boids'].includes(command))
        patch[command] = choice(args[0], ENUMS[command], command);
      else if (command === 'word') {
        const word = args.join(' ').toUpperCase();
        if (!/^[A-Z0-9 -]{1,16}$/.test(word) || !word.trim())
          throw Error('word accepts 1–16 letters, numbers or hyphens.');
        patch.word = word;
      } else if (command === 'beat')
        patch.beatSync = choice(args[0], ['on', 'off'], 'beat') === 'on';
      else if (command === 'trace') patch.trace = choice(args[0], ['on', 'off'], 'trace') === 'on';
      else if (command === 'move' || command === 'objective') {
        patch.moveX = number(args[0], -120, 120, 'x');
        patch.moveZ = number(args[1], -120, 120, 'z');
        if (command === 'objective') patch.origin = 'objective';
      } else if (command === 'influence' || command === 'layer') {
        const slot = command === 'layer' ? number(args.shift(), 1, 4, 'layer') : 1;
        if (!Number.isInteger(slot)) throw Error('Layer must be a whole number, 1–4.');
        if (args.length !== 3 && !(args[0] === 'none' && args.length === 1))
          throw Error('Use influence none, layer 2 none, or layer 2 wave 8 0.6.');
        const suffix = slot === 1 ? '' : slot;
        patch['field' + suffix] = choice(args[0], ENUMS.field, 'influence');
        if (args[0] !== 'none') {
          patch['strength' + suffix] = number(args[1], 0, 24, 'strength');
          patch['frequency' + suffix] = number(args[2], 0.05, 3, 'frequency');
        }
      } else if (command === 'reset') {
        choice(args[0], ['effects', 'boids', 'all'], 'reset');
        patch =
          args[0] === 'all'
            ? { ...DEFAULTS }
            : args[0] === 'boids'
              ? { ...BOID_DEFAULTS }
              : clearProgramEffects({});
      } else if (command === 'formula') {
        const match = text.match(/^formula ([xyz])\s*=\s*(.+)$/);
        if (!match) throw Error('Use formula x = expression (or y / z).');
        parseFormula(match[2]);
        patch['formula' + match[1].toUpperCase()] = match[2];
      } else if (command === 'assign')
        assignment = choice(
          args[0],
          ['formation', 'operator', 'bike', 'scout', 'relay', 'standby'],
          'assign',
        );
      else if (Object.hasOwn(PROGRAM_RANGES, command)) {
        if (args.length !== 1) throw Error(command + ' expects one number.');
        patch[command] = number(args[0], ...PROGRAM_RANGES[command], command);
      } else throw Error('Unknown command ' + command + '.');
      cues.push({ at, line: row + 1, ids: [...group], idSet: new Set(group), patch, assignment });
    } catch (error) {
      throw Error('Line ' + (row + 1) + ': ' + error.message);
    }
  }
  if (!cues.length) throw Error('Add at least one formation, influence or assignment command.');
  const result = { cues, repeat, countIn, duration: Math.max(at, repeat, 1) };
  if (compileCache.size > 16) compileCache.clear();
  compileCache.set(key, result);
  return result;
}
const programCache = new WeakMap();
function compiledFor(program) {
  const cached = programCache.get(program);
  if (
    cached &&
    cached.source === program.source &&
    cached.ids === program.fleetIds &&
    cached.groups === program.groups
  )
    return cached.script;
  const script = compileProgram(program.source, {
    aircraft: program.fleetIds || STARTER_AIRCRAFT,
    groups: program.groups || {},
  });
  programCache.set(program, {
    source: program.source,
    ids: program.fleetIds,
    groups: program.groups,
    script,
  });
  return script;
}
export function programOptions(program, id, time = program.time) {
  if (program.mode === 'manual') return program.settings;
  const opts = { ...program.settings };
  if (program.mode === 'script') {
    const script = compiledFor(program);
    opts.countIn = script.countIn ?? opts.countIn;
    const absolute = Math.max(0, time - opts.countIn),
      t = script.repeat ? mod(absolute, script.repeat) : absolute;
    // Preserve the outgoing performance for a physical, gradual formation handoff.
    if (script.repeat && absolute >= script.repeat && DIRECTOR_STYLES[opts.show])
      for (const cue of script.cues)
        if (cue.patch.show && cue.idSet.has(id)) opts.show = cue.patch.show;
    for (const cue of script.cues)
      if (cue.at <= t && cue.idSet.has(id)) {
        if (cue.patch.show && cue.patch.show !== opts.show) {
          opts.previousShow = opts.show;
          opts.showElapsed = t - cue.at;
        }
        Object.assign(opts, cue.patch);
      }
  }
  return opts;
}
export function initialProgramOrders(program) {
  const orders = Object.fromEntries(program.ids.map((id) => [id, 'formation']));
  if (program.mode === 'script')
    for (const cue of compiledFor(program).cues)
      if (cue.at === 0 && cue.assignment)
        for (const id of cue.ids) if (id in orders) orders[id] = cue.assignment;
  return orders;
}
export function advanceSwarmProgram(program, dt) {
  if (!program.enabled || !program.running) return [];
  const previous = program.time;
  program.time = Math.min(1e8, previous + clamp(dt, 0, 1));
  if (program.mode !== 'script') return [];
  const script = compiledFor(program),
    countIn = script.countIn ?? program.settings.countIn,
    from = previous - countIn,
    to = program.time - countIn,
    events = [];
  if (to < 0) return events;
  const cycle = script.repeat ? Math.floor(Math.max(0, from) / script.repeat) : 0,
    end = script.repeat ? Math.floor(to / script.repeat) : 0;
  for (let c = cycle; c <= end; c++)
    for (const cue of script.cues) {
      const at = cue.at + c * script.repeat;
      if (cue.assignment && at > from && at <= to && !(c === 0 && cue.at === 0)) events.push(cue);
    }
  return events;
}
export function influenceVector(opts, point, time, index, count) {
  const [x, y, z] = point,
    t = time,
    q = t * opts.frequency + opts.phase + index * 0.7,
    a = opts.strength * opts.blend,
    r = Math.max(1, Math.hypot(x, z));
  let v = [0, 0, 0];
  if (opts.field === 'vortex') v = [-z / r, 0, x / r];
  if (opts.field === 'attract') v = [-x / r, 0, -z / r];
  if (opts.field === 'repel') v = [x / r, 0, z / r];
  if (opts.field === 'wave') v = [0, Math.sin(q), 0];
  if (opts.field === 'lissajous') v = [Math.sin(q * 2), Math.sin(q * 3) * 0.4, Math.cos(q * 3)];
  if (opts.field === 'spiral') v = [Math.cos(q), Math.sin(q * 0.5) * 0.35, Math.sin(q)];
  if (opts.field === 'braid') {
    const side = index % 2 ? 1 : -1;
    v = [
      Math.sin(q) * side * (0.4 + (0.6 * (1 + Math.sin(t * 0.3))) / 2),
      Math.cos(q) * 0.35,
      Math.sin(q * 0.5) * 0.5,
    ];
  }
  if (opts.field === 'twin') {
    const a1 = [Math.cos(t * 0.4) * 25, Math.sin(t * 0.4) * 25],
      a2 = [-a1[0], -a1[1]],
      weight = (1 + Math.sin(q)) / 2;
    v = [
      (a1[0] * weight + a2[0] * (1 - weight) - x) / 40,
      0.25 * Math.sin(q),
      (a1[1] * weight + a2[1] * (1 - weight) - z) / 40,
    ];
  }
  if (opts.field === 'square' || opts.field === 'riemann') {
    const u = x / opts.fieldScale,
      w = z / opts.fieldScale,
      d = 1 + u * u + w * w;
    v =
      opts.field === 'square'
        ? [u * u - w * w, 0, 2 * u * w]
        : [(2 * u) / d, (u * u + w * w - 1) / d, (2 * w) / d];
  }
  if (opts.field === 'custom') {
    const vars = { x, y, z, t, i: index, n: count, phase: opts.phase };
    v = ['formulaX', 'formulaY', 'formulaZ'].map(
      (key) => evaluateFormula(formula(opts[key]), vars) * opts.blend,
    );
  } else v = v.map((value) => value * a);
  const magnitude = Math.hypot(...v);
  return magnitude > 32 ? v.map((value) => (value * 32) / magnitude) : v;
}
const indexCache = new WeakMap();
function programIndex(ids, id) {
  let indices = indexCache.get(ids);
  if (!indices) {
    indices = new Map(ids.map((value, i) => [value, i]));
    indexCache.set(ids, indices);
  }
  return indices.get(id) ?? 0;
}
export function sampleSwarmProgram(
  program,
  id,
  { time = program.time, reducedMotion = false } = {},
) {
  const opts = programOptions(program, id, time),
    ids = program.ids,
    i = programIndex(ids, id),
    n = ids.length;
  const variationIndex = programIndex(program.fleetIds || ids, id),
    variation = seededVariation(variationIndex, opts.seed),
    t = reducedMotion ? 0 : Math.max(0, time - opts.countIn),
    motionTime = t * (1 + variation * opts.speedVariance),
    phase = motionTime * opts.patternSpeed + opts.phase + variation * opts.phaseVariance,
    spacing = opts.spacing;
  const shapeSpacing =
    program.fleetIds && n > 6
      ? ['ring', 'double-orbit'].includes(opts.shape)
        ? spacing * Math.sqrt(n / 6)
        : ['line', 'wedge', 'column', 'staggered'].includes(opts.shape)
          ? spacing * Math.min(1, 16 / n)
          : spacing
      : spacing;
  const large = !!program.fleetIds && n > 100;
  let local = large
      ? largeFleetShape(opts.shape, i, n, spacing, opts.scale)
      : basicShape(opts.shape, i, n, shapeSpacing),
    strokes = [];
  if (opts.shape === 'word' || opts.shape === 'drawing') {
    const sequence =
      opts.shape === 'word' && opts.sequenceEnabled && program.mode === 'manual'
        ? wordSequenceState(opts, reducedMotion ? 0 : time)
        : null;
    strokes = opts.shape === 'word' ? wordStrokes(sequence?.current || opts.word) : program.strokes;
    // Depth rows keep large casts from piling thousands of bodies on one stroke.
    const paths = sequence ? sequence.words.map(wordStrokes) : [strokes],
      length = Math.min(...paths.map((p) => pathMetrics(p).length));
    const capacity = large ? Math.max(8, Math.floor((length * spacing * 2 * opts.scale) / 3.6)) : n,
      layers = Math.ceil(n / capacity),
      layer = Math.floor(i / capacity),
      slots = Math.min(capacity, n - layer * capacity),
      slot = i % capacity;
    const progress =
      opts.trace && !reducedMotion
        ? mod(t / 24 + slot / Math.max(1, slots), 1)
        : slots === 1
          ? 0.5
          : mod((slot + 0.37 * layer) / slots, 1);
    const shape = (path) => {
      const [x, z] = samplePath(path, progress),
        depth = ((layer - (layers - 1) / 2) * 4) / opts.scale;
      return opts.plane === 'sky'
        ? [x * spacing * 2, -z * spacing * 2, depth]
        : [x * spacing * 2, depth, z * spacing * 2];
    };
    let shaped = shape(strokes);
    if (sequence?.blend) {
      const next = shape(wordStrokes(sequence.next));
      shaped = shaped.map((v, j) => v + (next[j] - v) * sequence.blend);
    }
    const start = large
        ? largeFleetShape('grid', i, n, spacing, opts.scale)
        : basicShape('ring', i, n, spacing),
      blend = reducedMotion ? 1 : opts.morph ? clamp(t / opts.morph, 0, 1) : 1;
    local = shaped.map((value, j) => start[j] + (value - start[j]) * blend);
  }
  const pixel = opts.shape === 'pixels' ? artSlot(program.art, i, n) : null;
  if (pixel) {
    local = [...pixel.position];
    local[1] += Math.max(0, (program.art.rows - 1) * 2 - opts.height + 10);
  }
  const unmoved = [...local];
  if (!reducedMotion) {
    if (opts.pattern === 'orbit') {
      const angle = phase * 0.25,
        [x, , z] = local;
      local[0] = x * Math.cos(angle) - z * Math.sin(angle);
      local[2] = x * Math.sin(angle) + z * Math.cos(angle);
    }
    if (opts.pattern === 'weave') {
      local[0] += Math.sin(phase * 1.8 + i * 0.8) * spacing * 0.28;
      local[1] += Math.cos(phase + i * 0.6) * 2;
    }
    if (opts.pattern === 'wave') local[1] += Math.sin(phase + i * 0.8) * 4;
    if (opts.pattern === 'pulse')
      local = local.map((v, j) => (j === 1 ? v : v * (1 + Math.sin(phase * 0.6) * 0.25)));
    if (opts.pattern === 'search') {
      local[0] += Math.sin(phase * 0.2) * spacing;
      local[2] += Math.sin(phase * 0.1) * spacing;
    }
  }
  local = local.map((v, j) => unmoved[j] + (v - unmoved[j]) * opts.patternAmount);
  const angle = (opts.rotation * Math.PI) / 180,
    [x, y, z] = local;
  local = [
    (x * Math.cos(angle) - z * Math.sin(angle)) * opts.scale,
    y * opts.scale,
    (x * Math.sin(angle) + z * Math.cos(angle)) * opts.scale,
  ];
  let field = [0, 0, 0],
    error = '';
  try {
    for (let slot = 1; slot <= 4; slot++) {
      const suffix = slot === 1 ? '' : slot;
      if (opts['field' + suffix] === 'none') continue;
      const layer =
        slot === 1
          ? opts
          : {
              ...opts,
              ...Object.fromEntries(
                ['field', 'strength', 'frequency', 'phase', 'blend'].map((key) => [
                  key,
                  opts[key + slot],
                ]),
              ),
            };
      const vector = influenceVector(layer, local, reducedMotion ? 0 : motionTime, i, n);
      field = field.map((v, j) => v + vector[j]);
    }
    field = field.map((v, j) => v * opts[['axisX', 'axisY', 'axisZ'][j]]);
    const length = Math.hypot(...field);
    if (length > 32) field = field.map((v) => (v * 32) / length);
  } catch (e) {
    error = e.message;
  }
  let combined = local.map((v, j) => v + field[j]),
    attitude = { pitch: 0, roll: 0 };
  const beforeShow = [...combined];
  if (opts.show !== 'none' && !reducedMotion && time >= opts.countIn) {
    const beat =
        Math.max(0, motionTime - i * opts.offset) *
          (opts.beatSync ? opts.bpm / 60 : 1) *
          opts.showSpeed +
        variation * opts.phaseVariance,
      cycle = mod(beat, opts.beatSync ? 16 : 12),
      spin = clamp((cycle - 4) / 2, 0, 1) * Math.PI * 2;
    if (opts.show === 'flyby') {
      combined[0] += Math.sin((beat * Math.PI) / 8) * 32;
      combined[2] += Math.cos((beat * Math.PI) / 8) * 10;
      attitude.roll = spin;
    }
    if (opts.show === 'corkscrew') {
      combined[0] += Math.sin(beat * 0.8) * 8;
      combined[1] += Math.cos(beat * 0.8) * 6;
      attitude.roll = Math.sin(beat * 0.8) * 0.65;
    }
    if (opts.show === 'ribbon') {
      combined[0] += Math.sin(beat * 0.4 + i * 0.06) * 18;
      combined[1] += Math.cos(beat * 0.8 + i * 0.04) * 5;
      attitude.roll = Math.sin(beat * 0.4) * 0.5;
    }
    if (opts.show === 'salute') {
      combined[1] += (1 - Math.cos(beat * 0.6)) * 6;
      attitude.pitch = Math.sin(beat * 0.6) * 0.3;
    }
    if (opts.show === 'roll') attitude.roll = spin;
    if (opts.show === 'flip') attitude.pitch = spin;
    if (opts.show === 'dance') {
      const q = opts.beatSync ? beat * Math.PI * 2 : beat * 2;
      combined[1] += (opts.beatSync ? 1 - Math.cos(q) : Math.sin(q)) * 3;
      combined[0] += Math.sin(opts.beatSync ? (beat * Math.PI) / 2 : beat) * 4;
      attitude.roll = Math.sin(q * 0.5) * 0.5;
      attitude.pitch = spin;
    }
  }
  const directed = showPosition(opts.show, i, n, reducedMotion ? 0 : t * opts.showSpeed);
  if (directed) {
    const previous = showPosition(opts.previousShow, i, n, reducedMotion ? 0 : t * opts.showSpeed),
      u = clamp((opts.showElapsed ?? opts.morph) / Math.max(0.001, opts.morph), 0, 1),
      blend = u * u * (3 - 2 * u);
    combined = previous
      ? directed.map((v, j) => previous[j] + (v - previous[j]) * blend)
      : directed;
  }
  combined = combined.map(
    (v, j) =>
      beforeShow[j] +
      (v - beforeShow[j]) * opts.showAmount +
      seededVariation(variationIndex, opts.seed, j + 1) * opts.variance,
  );
  attitude.pitch *= opts.showAmount;
  attitude.roll *= opts.showAmount;
  combined[0] += opts.moveX;
  combined[1] += opts.height;
  combined[2] += opts.moveZ;
  const base = [local[0] + opts.moveX, local[1] + opts.height, local[2] + opts.moveZ];
  return {
    target: combined,
    base,
    field,
    attitude,
    opts,
    error,
    strokes,
    beaconHex: pixel?.color || null,
  };
}
