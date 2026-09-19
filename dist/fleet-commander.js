import { mountCommandShell } from './command-shell.js?v=0.9.1';
import { mountSimulationLab } from './simulation-lab-ui.js?v=0.9.0';
import { mountDirector } from './director-ui.js?v=0.9.0';
import { mountArena } from './arena-ui.js?v=0.9.0';
import { mountArtStudio } from './art-studio.js?v=0.9.0';
import { mountNerdLab } from './nerd-lab-ui.js?v=0.9.0';
import { FleetScore, fleetScoreMarkup, mountFleetScore } from './fleet-score.js?v=0.9.0';
import { MOTION_PATTERNS, SHOW_STYLES, clearProgramEffects } from './fleet-effects.js?v=0.9.0';
import {
  EXTRA_EFFECT_KEYS,
  extraEffectsMarkup,
  effectSummary,
  resetBoidsControls,
} from './fleet-effects-ui.js?v=0.9.0';
import { wordSequenceState } from './word-sequence.js?v=0.9.0';
import { fleetHelp, openFleetDialog, closeFleetDialog } from './fleet-help.js?v=0.9.0';
import { COMMANDER_PRESETS, commanderPreset } from './commander-presets.js?v=0.9.0';
import { SwarmMetronome, tapTempo, beatState } from './swarm-rhythm.js?v=0.9.0';
import {
  CommanderSimulation,
  createCommanderFleet,
  validateCommanderFleet,
  COMMANDER_TYPES,
  COMMANDER_TEAMS,
  COMMANDER_MODES,
  COMMANDER_EXAMPLES,
  commanderGroups,
  resolveCommanderGroup,
} from './fleet-commander-core.js?v=0.9.0';
import { CommanderRenderer } from './fleet-commander-renderer.js?v=0.9.0';
import { BEACON_PALETTE } from './beacon-palette.js?v=0.9.0';
import { PROGRAM_SHAPES, PROGRAM_FIELDS, FIELD_FORMULAS } from './swarm-program.js?v=0.9.0';
import {
  readFleetLibrary,
  saveNamedFleet,
  parseFleetFile,
  compactFleet,
} from './fleet-commander-storage.js?v=0.9.0';
const $ = (id) => document.getElementById(id),
  copy = (value) => JSON.parse(JSON.stringify(value));
const sim = new CommanderSimulation(),
  settingsIds = [
    ...EXTRA_EFFECT_KEYS,
    'shape',
    'origin',
    'spacing',
    'height',
    'pattern',
    'show',
    'strength',
    'frequency',
    'formulaX',
    'formulaY',
    'formulaZ',
    'word',
    'moveX',
    'moveZ',
    'scale',
    'rotation',
    'plane',
    'morph',
    'countIn',
    'offset',
    'fieldScale',
    'bpm',
    'sequenceWords',
    'sequenceHold',
    'sequenceTransition',
  ];
const soundtrack = new FleetScore(),
  metronome = new SwarmMetronome();
let tempoTaps = [],
  currentTask = 'formation';
let director = null,
  arena = null,
  simulationLab = null,
  nerdLab = null,
  commandShell = null;
let draft = sim.snapshot(),
  selected = sim.drones[0]?.id || '',
  strokes = [],
  lastNotice = '',
  scoreSignature = '',
  dirty = false,
  savedSelection = [];
function say(message, error = false) {
  $('notice').textContent = message;
  $('notice').classList.toggle('error', error);
}
function guard(action) {
  return async (...args) => {
    try {
      await action(...args);
    } catch (error) {
      say(error.message || 'That change could not be applied.', true);
      routeError(error.message);
    }
  };
}
function options(element, entries, value) {
  element.replaceChildren(
    ...entries.map(([id, label]) => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = label;
      return option;
    }),
  );
  if (value !== undefined && entries.some(([id]) => id === value)) element.value = value;
}
$('quickGames').addEventListener('click', () => {
  selectTab('games');
  $('gameMode').focus();
});
$('extraEffects').innerHTML = extraEffectsMarkup(sim.program.settings);
$('extraEffects').addEventListener('click', (e) => {
  if (e.target.closest('[data-boids-reset]')) {
    resetBoidsControls($('extraEffects'));
    dirty = true;
    updateEffectsReadout();
    say('Boids reset to off. Apply program to update the fleet.');
  }
});
$('extraEffects').addEventListener('input', () => {
  dirty = true;
  updateEffectsReadout();
});
$('rhythmInputs').insertAdjacentHTML('beforeend', fleetScoreMarkup(sim.program.settings.song));
const musicUI = mountFleetScore(
  $('rhythmInputs'),
  soundtrack,
  (song) => {
    sim.program.settings.song = song;
    draft.program.settings.song = song;
    dirty = true;
  },
  {
    getMusic: () => sim.program.music,
    onMusic: (music) => {
      sim.program.music = music;
      draft.program.music = music;
      sim.program.settings.bpm = music.bpm;
      $('bpm').value = music.bpm;
      dirty = true;
    },
  },
);
options($('pattern'), Object.entries(MOTION_PATTERNS));
options($('show'), Object.entries(SHOW_STYLES));
options(
  $('commanderPreset'),
  Object.entries(COMMANDER_PRESETS).map(([id, p]) => [id, p.name]),
);
options($('shape'), Object.entries(PROGRAM_SHAPES));
options($('fieldSelect'), Object.entries(PROGRAM_FIELDS));
options(
  $('example'),
  Object.keys(COMMANDER_EXAMPLES).map((name) => [name, name]),
);
options($('gameMode'), Object.entries(COMMANDER_MODES));
options(
  $('droneType'),
  Object.entries(COMMANDER_TYPES).map(([id, t]) => [id, t.name]),
);
options(
  $('droneTeam'),
  COMMANDER_TEAMS.map((id) => [id, id.toUpperCase()]),
);
options(
  $('droneColor'),
  BEACON_PALETTE.map((c) => [c.id, c.name]),
);
const renderer = new CommanderRenderer($('field'), {
  onObjective: guard((point) => {
    sim.setObjective(point);
    say('Objective moved. Choose a group, then Scout objective.');
    dirty = true;
  }),
  onStatus: (message) => {
    $('rendererStatus').textContent = message;
  },
});
// The renderer can report synchronously during construction; finish mode labels here.
$('rendererStatus').textContent = renderer.kind;
if (!renderer.renderer) {
  $('view').querySelector('[value=follow]').disabled = true;
  $('view').querySelector('[value=orbit]').textContent = 'Tactical overview';
  document.querySelector('.field-instructions').textContent =
    'Click → objective · Scroll / + − → zoom · Front view for words';
}
function groupOptions() {
  const groups = commanderGroups(sim.fleet.roster);
  return [
    ['all', 'All drones'],
    ...Object.entries(groups).map(([id, ids]) => [
      id,
      id.charAt(0).toUpperCase() + id.slice(1) + ' · ' + ids.length,
    ]),
    ['selected', 'Selected drone'],
  ];
}
function chosenGroup(control) {
  const value = $(control).value;
  return value === 'selected'
    ? selected
      ? [selected]
      : []
    : value === 'savedSelection'
      ? savedSelection
      : resolveCommanderGroup(sim.fleet, value);
}
function syncGroups() {
  for (const name of ['commandGroup', 'paintGroup', 'programGroup']) {
    const current = $(name).value;
    options($(name), groupOptions(), current);
  }
  syncGroupReadout();
}
function syncGroupReadout() {
  const ids = chosenGroup('commandGroup');
  $('groupCount').textContent = ids.length + ' aircraft';
  for (const button of $('colorGroups').children)
    button.setAttribute('aria-pressed', String(button.dataset.color === $('commandGroup').value));
}
function syncDrone() {
  const d = sim.drones.find((d) => d.id === selected) || sim.drones[0];
  for (const key of [
    'selectedDrone',
    'droneName',
    'droneType',
    'droneTeam',
    'droneColor',
    'updateDrone',
  ])
    $(key).disabled = !d;
  if (!d) {
    selected = '';
    $('droneName').value = '';
    renderer.selected = '';
    syncGroupReadout();
    director?.refresh();
    return;
  }
  selected = d.id;
  $('droneName').value = d.name;
  $('droneType').value = d.type;
  $('droneTeam').value = d.team;
  $('droneColor').value = d.color;
  renderer.selected = selected;
  syncGroupReadout();
  director?.refresh();
}
function selectTab(tab) {
  for (const button of document.querySelectorAll('[data-tab]'))
    button.setAttribute('aria-pressed', String(button.dataset.tab === tab));
  for (const panel of document.querySelectorAll('.tab-panel'))
    panel.hidden = panel.id !== 'tab-' + tab;
}
function updateProgramSections() {
  const script = $('programMode').value === 'script';
  $('manualInputs').hidden = script;
  $('scriptInputs').hidden = !script;
  if (script) $('programLibrary').open = true;
  if ($('shape').value === 'word') currentTask = 'words';
  else if ($('shape').value === 'drawing') currentTask = 'drawing';
  else if (['words', 'drawing'].includes(currentTask)) currentTask = 'formation';
  for (const pane of document.querySelectorAll('[data-task-pane]'))
    pane.hidden = pane.dataset.taskPane !== currentTask;
  for (const button of document.querySelectorAll('[data-task]'))
    button.setAttribute('aria-pressed', String(button.dataset.task === currentTask && !script));
  $('customFormula').hidden = ![
    $('fieldSelect').value,
    ...[2, 3, 4].map((i) => $('field' + i).value),
  ].includes('custom');
  $('fieldFormula').textContent = FIELD_FORMULAS[$('fieldSelect').value];
  drawPad();
  updateEffectsReadout();
}
function updateEffectsReadout() {
  const settings = { ...sim.program.settings };
  for (const key of ['pattern', 'show', ...EXTRA_EFFECT_KEYS])
    settings[key] = typeof settings[key] === 'number' ? Number($(key).value) : $(key).value;
  settings.field = $('fieldSelect').value;
  $('effectsStatus').textContent = effectSummary(settings) + ' · editor settings';
}
function clearEffects() {
  const settings = clearProgramEffects({});
  for (const key of settingsIds) if (key in settings) $(key).value = settings[key];
  $('fieldSelect').value = 'none';
  $('beatSync').checked = false;
  $('trace').checked = false;
  $('programMode').value = 'manual';
  dirty = true;
  updateProgramSections();
  say('All effects cleared in the editor. Apply to hold the formation still.');
}
$('clearEffects').addEventListener('click', guard(clearEffects));
$('editEffects').addEventListener('click', () => openFleetDialog($('effectsDialog')));
$('closeEffects').addEventListener('click', () => {
  closeFleetDialog($('effectsDialog'));
  updateEffectsReadout();
});
$('effectsDialog').addEventListener('keydown', (e) => e.stopPropagation());
$('scriptShortcut').addEventListener('click', () => {
  selectTab('program');
  $('programMode').value = 'script';
  updateProgramSections();
  $('script').focus();
});
$('tab-program').addEventListener('input', updateEffectsReadout);
function chooseTask(task) {
  selectTab('program');
  $('programLibrary').open = true;
  currentTask = task;
  $('programMode').value = 'manual';
  if (task === 'words') {
    $('shape').value = 'word';
    $('trace').checked = false;
    $('view').value = 'front';
    renderer.setView('front');
  } else if (task === 'drawing') $('shape').value = 'drawing';
  else if (['word', 'drawing'].includes($('shape').value)) $('shape').value = 'grid';
  updateProgramSections();
  if (task === 'drawing') $('drawPad').focus();
}
function routeError(message = '') {
  if (/sequence/i.test(message)) {
    $('sequenceError').textContent = message;
    if (!$('sequenceDialog').open) openFleetDialog($('sequenceDialog'));
    return;
  }
  const target = /Line \d|Script|formula/i.test(message)
    ? 'script'
    : /Draw|Drawing/.test(message)
      ? 'drawPad'
      : /0 to 10,000|Fleet size/.test(message)
        ? 'count'
        : /name/.test(message)
          ? 'fleetName'
          : null;
  if (!target) return;
  if (target === 'count') selectTab('fleet');
  else if (target === 'fleetName') selectTab('saves');
  else if (target === 'drawPad') chooseTask('drawing');
  else {
    selectTab('program');
    $('programMode').value = 'script';
    updateProgramSections();
  }
  $(target).focus();
}

function populate() {
  musicUI?.refresh();
  draft = sim.snapshot();
  document.querySelector('[data-fleet-song]').value = draft.program.settings.song;
  strokes = copy(draft.program.strokes);
  $('count').value = sim.drones.length;
  $('batteryDrain').value = draft.options.batteryDrain;
  $('fleetName').value = draft.name;
  options(
    $('selectedDrone'),
    sim.drones.map((d) => [d.id, d.name + ' / ' + COMMANDER_TYPES[d.type].name]),
    selected,
  );
  selected = $('selectedDrone').value;
  syncGroups();
  syncDrone();
  for (const key of settingsIds) $(key).value = draft.program.settings[key];
  $('fieldSelect').value = draft.program.settings.field;
  $('trace').checked = draft.program.settings.trace;
  $('beatSync').checked = draft.program.settings.beatSync;
  for (const key of ['sequenceEnabled', 'sequenceLoop'])
    $(key).checked = draft.program.settings[key];
  $('programMode').value = draft.program.mode;
  $('script').value = draft.program.source;
  const groups = groupOptions();
  const ids = draft.program.ids;
  const group = groups.find(([key]) => {
    const groupIds = key === 'selected' ? [selected] : resolveCommanderGroup(draft, key);
    return ids.length === groupIds.length && ids.every((id) => groupIds.includes(id));
  });
  if (group) $('programGroup').value = group[0];
  else {
    savedSelection = [...ids];
    const option = document.createElement('option');
    option.value = 'savedSelection';
    option.textContent = 'Saved selection · ' + ids.length;
    $('programGroup').append(option);
    $('programGroup').value = 'savedSelection';
  }
  for (const key of ['unlimited', 'obstacles', 'reducedMotion'])
    $(key).checked = draft.options[key];
  $('beaconSize').value = draft.options.beaconSize;
  $('beaconLabel').value = draft.options.beaconSize;
  updateProgramSections();
  syncChallenge();
  dirty = false;
}
function editedFleet() {
  const next = sim.snapshot(),
    p = next.program;
  p.settings.song = document.querySelector('[data-fleet-song]').value;
  p.mode = $('programMode').value;
  p.ids = chosenGroup('programGroup');
  p.source = $('script').value;
  p.strokes = copy(strokes);
  p.settings.field = $('fieldSelect').value;
  p.settings.trace = $('trace').checked;
  p.settings.beatSync = $('beatSync').checked;
  for (const key of ['sequenceEnabled', 'sequenceLoop']) p.settings[key] = $(key).checked;
  for (const key of settingsIds)
    p.settings[key] =
      typeof draft.program.settings[key] === 'number'
        ? Number($(key).value)
        : key === 'word'
          ? $(key).value.toUpperCase()
          : $(key).value;
  if (p.music) p.music = { ...p.music, bpm: Number($('bpm').value) };
  next.name = $('fleetName').value.trim() || next.name;
  return validateCommanderFleet(next);
}
function applyProgram() {
  const next = editedFleet();
  if (
    next.program.mode === 'manual' &&
    next.program.settings.shape === 'drawing' &&
    !next.program.strokes.some((s) => s.length > 1)
  )
    throw Error('Draw at least one line before applying a drawing formation.');
  sim.apply(next);
  draft = sim.snapshot();
  dirty = false;
  say(sim.notice);
  lastNotice = sim.notice;
}
function requireFreeRoster() {
  if (simulationLab?.replaying) throw Error('Return to live before editing the simulation.');
  if (sim.combat?.enabled || sim.combat?.loading)
    throw Error('Exit combat before changing the fleet, field options or show.');
  if (sim.challenge && !sim.challenge.finished)
    throw Error('Return to free flight before changing the fleet or field options.');
}
function updateRoster(config, message) {
  requireFreeRoster();
  const current = editedFleet();
  current.roster = config.roster;
  sim.apply(current);
  selected = current.roster.some((d) => d.id === selected) ? selected : current.roster[0]?.id || '';
  populate();
  say(message + ' Program restarted.');
}
for (const button of document.querySelectorAll('[data-tab]'))
  button.addEventListener('click', () => selectTab(button.dataset.tab));
$('launch').addEventListener(
  'click',
  guard(() => {
    sim.launch();
    say(sim.notice);
  }),
);
$('pause').addEventListener('click', () => {
  if (sim.challenge?.roundOver) {
    say('Start another exercise, or choose Next pilot.');
    return;
  }
  sim.running = !sim.running;
  say(sim.running ? 'Simulation resumed.' : 'Simulation paused.');
  updateReadouts();
});
$('recall').addEventListener('click', () => {
  sim.recall();
  say(sim.notice);
});
$('commandGroup').addEventListener('change', syncGroupReadout);
$('send').addEventListener('click', () => {
  sim.send(chosenGroup('commandGroup'));
  say(sim.notice);
});
$('recallGroup').addEventListener('click', () => {
  sim.recall(chosenGroup('commandGroup'));
  say(sim.notice);
});
for (const button of document.querySelectorAll('[data-order]'))
  button.addEventListener('click', () => {
    sim.assign(chosenGroup('commandGroup'), button.dataset.order);
    say(sim.notice);
  });
for (const color of BEACON_PALETTE) {
  const makeButton = () => {
    const button = document.createElement('button');
    button.style.setProperty('--swatch', color.hex);
    const swatch = document.createElement('i');
    swatch.className = 'swatch';
    swatch.setAttribute('aria-hidden', 'true');
    button.append(swatch, document.createTextNode(color.name));
    return button;
  };
  const group = makeButton();
  group.dataset.color = color.id;
  group.setAttribute('aria-label', 'Select ' + color.name + ' group');
  group.setAttribute('aria-pressed', 'false');
  group.addEventListener('click', () => {
    $('commandGroup').value = color.id;
    syncGroupReadout();
  });
  $('colorGroups').append(group);
  const paint = makeButton();
  paint.setAttribute('aria-label', 'Paint group ' + color.name);
  paint.addEventListener(
    'click',
    guard(() => {
      const ids = chosenGroup('paintGroup');
      if (!ids.length) throw Error('That group is empty. Choose a group with drones.');
      const next = sim.snapshot();
      next.roster.forEach((d) => {
        if (ids.includes(d.id)) d.color = color.id;
      });
      updateRoster(next, ids.length + ' beacons set to ' + color.name + '.');
    }),
  );
  $('paintColors').append(paint);
}
for (const button of document.querySelectorAll('[data-count]'))
  button.addEventListener('click', () => ($('count').value = button.dataset.count));
$('build').addEventListener(
  'click',
  guard(() => {
    requireFreeRoster();
    const n = Number($('count').value);
    if (!Number.isInteger(n) || n < 0 || n > 10000)
      throw Error('Choose a whole number from 0 to 10,000.');
    sim.load(createCommanderFleet(n, $('mix').value));
    populate();
    say(n + ' drones ready. Launch all to test the cluster.');
  }),
);
$('selectedDrone').addEventListener('change', () => {
  selected = $('selectedDrone').value;
  syncDrone();
});
$('updateDrone').addEventListener(
  'click',
  guard(() => {
    const next = sim.snapshot(),
      d = next.roster.find((d) => d.id === selected);
    Object.assign(d, {
      name: $('droneName').value.trim(),
      type: $('droneType').value,
      team: $('droneTeam').value,
      color: $('droneColor').value,
    });
    updateRoster(next, 'Selected aircraft updated.');
  }),
);
for (const key of ['unlimited', 'obstacles', 'reducedMotion', 'beaconSize', 'batteryDrain'])
  $(key).addEventListener(
    'change',
    guard(() => {
      requireFreeRoster();
      const next = sim.snapshot();
      next.options[key] = ['beaconSize', 'batteryDrain'].includes(key)
        ? Number($(key).value)
        : $(key).checked;
      const valid = validateCommanderFleet(next);
      sim.fleet.options = valid.options;
      draft.options = valid.options;
      $('beaconLabel').value = valid.options.beaconSize;
      dirty = true;
      say('Field options updated.');
    }),
  );
$('setCharge').addEventListener(
  'click',
  guard(() => {
    requireFreeRoster();
    const ids = chosenGroup('commandGroup');
    if (!ids.length) throw Error('Choose a nonempty group first.');
    sim.setCharge(ids, Number($('testCharge').value));
    updateReadouts();
  }),
);
$('recharge').addEventListener(
  'click',
  guard(() => {
    requireFreeRoster();
    sim.recharge();
    say(sim.notice);
  }),
);
$('reset').addEventListener(
  'click',
  guard(() => {
    requireFreeRoster();
    sim.load(editedFleet());
    populate();
    say('Fleet reset to its launch pads.');
  }),
);
for (const key of ['programMode', 'shape', 'fieldSelect', 'field2', 'field3', 'field4'])
  $(key).addEventListener('change', updateProgramSections);
$('loadExample').addEventListener('click', () => {
  $('script').value = COMMANDER_EXAMPLES[$('example').value];
  $('programMode').value = 'script';
  $('programGroup').value = 'all';
  updateProgramSections();
  dirty = true;
  say('Example loaded. Apply program to run it.');
});
$('applyProgram').addEventListener('click', guard(applyProgram));
$('loadPreset').addEventListener(
  'click',
  guard(() => {
    const next = commanderPreset(editedFleet(), $('commanderPreset').value);
    for (const key of settingsIds) $(key).value = next.program.settings[key];
    $('fieldSelect').value = next.program.settings.field;
    $('trace').checked = next.program.settings.trace;
    $('beatSync').checked = next.program.settings.beatSync;
    for (const key of ['sequenceEnabled', 'sequenceLoop'])
      $(key).checked = next.program.settings[key];
    $('programMode').value = next.program.mode;
    $('programGroup').value = 'all';
    $('script').value = next.program.source;
    strokes = copy(next.program.strokes);
    updateProgramSections();
    dirty = true;
    say('Preset loaded. Apply program to fly it.');
  }),
);
$('chooseDrawing').addEventListener('click', () => {
  $('programMode').value = 'manual';
  $('shape').value = 'drawing';
  updateProgramSections();
  $('drawPad').focus();
  say('Draw your shape, then Apply program.');
});
$('beatDance').addEventListener('click', () => {
  $('show').value = 'dance';
  $('beatSync').checked = true;
  $('offset').value = 0;
  dirty = true;
  say('Beat dance selected. Apply program to synchronize the fleet.');
});
$('tapTempo').addEventListener('click', () => {
  const result = tapTempo(tempoTaps, performance.now());
  tempoTaps = result.taps;
  if (result.bpm) {
    $('bpm').value = result.bpm;
    $('beatSync').checked = true;
    dirty = true;
    say(result.bpm + ' BPM. Apply program to synchronize.');
  } else say('Keep tapping with the beat.');
});
$('metronome').addEventListener(
  'click',
  guard(async () => {
    if (metronome.enabled) metronome.stop();
    else await metronome.enable();
    $('metronome').textContent = metronome.enabled ? 'Mute metronome' : 'Enable metronome';
    $('metronome').setAttribute('aria-pressed', String(metronome.enabled));
  }),
);
for (const button of document.querySelectorAll('[data-task]'))
  button.addEventListener('click', () => chooseTask(button.dataset.task));
$('applyLaunch').addEventListener(
  'click',
  guard(() => {
    applyProgram();
    sim.launch();
    say(sim.notice);
  }),
);
$('editSequence').addEventListener('click', () => {
  $('sequenceError').textContent = '';
  openFleetDialog($('sequenceDialog'));
});
$('closeSequence').addEventListener('click', () => closeFleetDialog($('sequenceDialog')));
$('sequenceDialog').addEventListener('keydown', (e) => e.stopPropagation());
$('sequenceDialog').addEventListener('input', () => (dirty = true));
$('runSequence').addEventListener(
  'click',
  guard(() => {
    clearEffects();
    chooseTask('words');
    $('sequenceEnabled').checked = true;
    for (const [key, value] of Object.entries({
      height: 40,
      scale: 3,
      morph: 10,
      plane: 'sky',
      pattern: 'hold',
      show: 'none',
    }))
      $(key).value = value;
    $('fieldSelect').value = 'none';
    applyProgram();
    sim.launch();
    closeFleetDialog($('sequenceDialog'));
    say('Word sequence launched. The same fleet flies each message.');
  }),
);
$('singleWord').addEventListener('click', () => {
  $('sequenceEnabled').checked = false;
  dirty = true;
  say('Single word selected. Apply & launch to fly it.');
});
$('programHelp').addEventListener('click', () =>
  fleetHelp(document, {
    title: 'What would you like to do?',
    text: 'Build sets how many aircraft you have. Apply changes their flight plan. Launch sends parked aircraft into the air. Choose a task below to go straight to its controls.',
    actions: [
      {
        label: 'Spell a sequence of words',
        run: () => {
          chooseTask('words');
          $('editSequence').click();
        },
      },
      {
        label: 'Build up to 10,000 aircraft',
        run: () => {
          selectTab('fleet');
          $('count').focus();
        },
      },
      { label: 'Draw a flight formation', run: () => chooseTask('drawing') },
      { label: 'Synchronize a dance', run: () => chooseTask('rhythm') },
    ],
  }),
);
$('shape').addEventListener('change', () => {
  if (['word', 'drawing'].includes($('shape').value))
    chooseTask($('shape').value === 'word' ? 'words' : 'drawing');
});
$('fieldSelect').addEventListener('change', () => {
  if ($('fieldSelect').value === 'custom') {
    openFleetDialog($('effectsDialog'));
    $('mathInputs').open = true;
    $('formulaX').focus();
  }
});
$('tab-program').addEventListener('input', () => (dirty = true));
$('fleetName').addEventListener('input', () => (dirty = true));
const pad = $('drawPad'),
  pen = { down: false, point: [0, 0], keyboard: false };
function drawPad() {
  const c = pad.getContext('2d');
  if (!c) return;
  c.clearRect(0, 0, 600, 300);
  c.strokeStyle = '#263c42';
  c.lineWidth = 1;
  for (let x = 0; x <= 600; x += 30) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, 300);
    c.stroke();
  }
  for (let y = 0; y <= 300; y += 30) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(600, y);
    c.stroke();
  }
  c.strokeStyle = '#eee5b9';
  c.lineWidth = 3;
  c.lineCap = 'round';
  for (const stroke of strokes) {
    c.beginPath();
    stroke.forEach(([x, y], i) => c[i ? 'lineTo' : 'moveTo']((x + 1) * 300, (y + 1) * 150));
    c.stroke();
  }
  if (pen.keyboard) {
    const [x, y] = pen.point;
    c.strokeStyle = '#a0eac5';
    c.strokeRect((x + 1) * 300 - 5, (y + 1) * 150 - 5, 10, 10);
  }
}
function addPoint(p, newStroke = false) {
  if (newStroke) {
    if (strokes.length >= 24) {
      say('Drawing has reached 24 strokes.', true);
      return false;
    }
    strokes.push([]);
  }
  if (strokes.reduce((n, s) => n + s.length, 0) >= 512) {
    say('Drawing has reached 512 points. Undo a stroke to continue.', true);
    return false;
  }
  if (!strokes.length) strokes.push([]);
  strokes.at(-1).push(p);
  dirty = true;
  drawPad();
  return true;
}
const padPoint = (e) => {
  const r = pad.getBoundingClientRect();
  return [
    Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1)),
    Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1)),
  ];
};
pad.addEventListener('pointerdown', (e) => {
  pen.keyboard = false;
  pen.down = addPoint(padPoint(e), true);
  pad.setPointerCapture(e.pointerId);
});
pad.addEventListener('pointermove', (e) => {
  if (!pen.down) return;
  const point = padPoint(e),
    last = strokes.at(-1).at(-1);
  if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) > 0.025)
    pen.down = addPoint(point);
});
for (const type of ['pointerup', 'pointercancel'])
  pad.addEventListener(type, () => (pen.down = false));
pad.addEventListener('keydown', (e) => {
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter'].includes(e.key)) return;
  e.preventDefault();
  pen.keyboard = true;
  const [x, y] = pen.point;
  pen.point = [
    Math.max(
      -1,
      Math.min(1, x + (e.key === 'ArrowRight' ? 0.05 : e.key === 'ArrowLeft' ? -0.05 : 0)),
    ),
    Math.max(-1, Math.min(1, y + (e.key === 'ArrowDown' ? 0.05 : e.key === 'ArrowUp' ? -0.05 : 0))),
  ];
  if (e.key === ' ') addPoint([...pen.point]);
  if (e.key === 'Enter') addPoint([...pen.point], true);
  drawPad();
});
$('undoStroke').addEventListener('click', () => {
  strokes.pop();
  dirty = true;
  drawPad();
});
$('clearDrawing').addEventListener('click', () => {
  strokes = [];
  dirty = true;
  drawPad();
});
const gameDescriptions = {
  sandbox:
    'Experiment freely. Place an objective, split the fleet into groups and try your programs.',
  formation:
    'Match four formations and hold at least 80% cohesion for three seconds each. Three-minute limit.',
  hunt: 'Direct each requested beacon color to the target. Score as many deliveries as you can in 90 seconds.',
  party:
    'Local pass-and-play for 2–4 people. Identical fleets, 90-second color-hunt rounds and a shared scoreboard.',
};
function gameDescription() {
  $('gameDescription').textContent = gameDescriptions[$('gameMode').value];
  $('partyNames').hidden = $('gameMode').value !== 'party';
  $('startGame').textContent =
    $('gameMode').value === 'sandbox' ? 'Begin free flight' : 'Start exercise';
}
gameDescription();
$('gameMode').addEventListener('change', gameDescription);
$('startGame').addEventListener(
  'click',
  guard(() => {
    const mode = $('gameMode').value,
      names = $('players')
        .value.split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    if (
      mode === 'party' &&
      (names.length < 2 || names.length > 4 || names.some((n) => n.length > 24))
    )
      throw Error('Enter 2–4 pilot names, up to 24 characters each.');
    const setup = editedFleet();
    sim.apply(setup);
    sim.startChallenge(mode, names.length ? names : ['Pilot 1']);
    populate();
    if (mode === 'sandbox') sim.launch();
    say(mode === 'party' ? names[0] + ' / first pilot.' : sim.notice);
    scoreSignature = '';
    syncChallenge();
  }),
);
$('freeFlight').addEventListener('click', () => {
  sim.startChallenge('sandbox');
  sim.running = true;
  populate();
  syncChallenge();
  arena?.update();
  say(sim.notice);
});
$('nextPlayer').addEventListener('click', () => {
  if (sim.nextPlayer()) {
    populate();
    say(sim.notice);
  }
});
for (const button of document.querySelectorAll('[data-shape]'))
  button.addEventListener(
    'click',
    guard(() => {
      const next = sim.snapshot();
      next.program.mode = 'manual';
      next.program.ids = next.roster.map((d) => d.id);
      Object.assign(next.program.settings, {
        shape: button.dataset.shape,
        pattern: 'hold',
        field: 'none',
        show: 'none',
        origin: 'fixed',
        height: 28,
        moveX: 0,
        moveZ: -25,
        scale: 1,
        rotation: 0,
      });
      sim.apply(next);
      populate();
      say('All drones forming ' + button.dataset.shape + '.');
    }),
  );
function syncChallenge() {
  const c = sim.challenge,
    locked = (!!c && !c.finished) || !!sim.combat?.enabled;
  $('rosterControls').disabled = locked;
  for (const key of [
    'unlimited',
    'obstacles',
    'reducedMotion',
    'beaconSize',
    'batteryDrain',
    'testCharge',
    'setCharge',
    'recharge',
    'reset',
    'loadFleet',
    'importFleet',
  ])
    $(key).disabled = locked;
  $('fieldMode').textContent = sim.combat?.enabled
    ? 'Drone combat'
    : c
      ? COMMANDER_MODES[c.mode]
      : 'Free flight';
  $('fieldTimer').hidden = !c;
  $('nextPlayer').hidden = !c?.roundOver || c.finished;
  $('quickShapes').hidden = c?.mode !== 'formation';
  if (!c) {
    $('challengeLabel').textContent = 'FREE FLIGHT';
    $('challengeInstruction').textContent = 'Choose an exercise to begin.';
    $('challengeProgress').textContent = 'Use the Program tab to shape the swarm.';
    $('score').replaceChildren(document.createTextNode('0 '));
    $('scores').replaceChildren();
    return;
  }
  const left = Math.max(0, Math.ceil((c.mode === 'formation' ? 180 : 90) - c.elapsed));
  $('fieldTimer').textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
  $('challengeLabel').textContent =
    c.mode === 'party'
      ? 'PILOT ' + (c.turn + 1) + ' / ' + c.players[c.turn]
      : COMMANDER_MODES[c.mode].toUpperCase();
  $('challengeInstruction').textContent = c.roundOver
    ? c.finished
      ? 'Exercise complete.'
      : 'Round complete. Pass the controls.'
    : c.instruction;
  $('challengeProgress').textContent =
    c.mode === 'formation'
      ? 'Shapes ' + c.stage + ' / 4 · hold ' + c.dwell.toFixed(1) + ' / 3 s'
      : 'Targets completed ' + c.stage + ' · matching drones ' + c.delivered.size;
  $('score').textContent = c.score + ' POINTS';
  const signature = JSON.stringify(c.scores);
  if (signature !== scoreSignature) {
    scoreSignature = signature;
    $('scores').replaceChildren(
      ...c.scores.map((result) => {
        const row = document.createElement('li');
        row.textContent = result.player + ' — ' + result.score + ' points';
        return row;
      }),
    );
  }
}
function refreshLibrary(selectedName) {
  try {
    const all = readFleetLibrary(localStorage);
    options(
      $('savedFleets'),
      all.length
        ? all.map((f) => [f.name, f.name + ' · ' + f.roster.length + ' drones'])
        : [['', 'No saved fleets yet']],
      selectedName,
    );
    $('loadFleet').disabled = !all.length || (!!sim.challenge && !sim.challenge.finished);
  } catch (error) {
    say('Browser saves unavailable: ' + error.message + ' Export JSON to keep a copy.', true);
  }
}
$('saveFleet').addEventListener(
  'click',
  guard(() => {
    if (sim.combat?.enabled || sim.combat?.loading)
      throw Error('Exit combat to save your original show fleet.');
    if (!$('fleetName').value.trim()) throw Error('Give this fleet a name first.');
    const fleet = editedFleet();
    saveNamedFleet(localStorage, fleet);
    sim.fleet.name = fleet.name;
    dirty = false;
    refreshLibrary(fleet.name);
    say('Saved “' + fleet.name + '” on this browser.');
  }),
);
$('loadFleet').addEventListener(
  'click',
  guard(() => {
    requireFreeRoster();
    const fleet = readFleetLibrary(localStorage).find((f) => f.name === $('savedFleets').value);
    if (!fleet) throw Error('Choose a saved fleet.');
    sim.load(fleet);
    populate();
    say('Loaded “' + fleet.name + '”. Launch all to start a fresh run.');
  }),
);
$('exportFleet').addEventListener(
  'click',
  guard(() => {
    if (sim.combat?.enabled || sim.combat?.loading)
      throw Error('Exit combat to export your original show fleet.');
    const fleet = editedFleet(),
      blob = new Blob([JSON.stringify(compactFleet(fleet), null, 2)], { type: 'application/json' }),
      url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = (fleet.name.replace(/[^a-z0-9_-]/gi, '-') || 'commander-fleet') + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    dirty = false;
    say('Exported fleet setup, roster and program.');
  }),
);
$('importFleet').addEventListener(
  'change',
  guard(async (e) => {
    requireFreeRoster();
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 2000000) throw Error('Fleet files must be smaller than 2 MB.');
      const next = parseFleetFile(await file.text());
      sim.load(next);
      populate();
      say('Imported “' + next.name + '”. Save it here to keep it on this browser.');
      dirty = true;
    } finally {
      e.target.value = '';
    }
  }),
);
function updateReadouts() {
  director?.update();
  if (
    sim.program.settings.sequenceEnabled &&
    sim.program.settings.shape === 'word' &&
    sim.program.mode === 'manual'
  ) {
    const seq = wordSequenceState(sim.program.settings, sim.program.time);
    $('sequenceStatus').textContent =
      (seq.phase === 'transitioning' ? seq.current + ' → ' + seq.next : seq.current) +
      ' · ' +
      seq.phase;
  } else $('sequenceStatus').textContent = 'Sequence ready · Edit to begin';
  const beat = beatState(sim.program);
  $('beatReadout').textContent =
    beat.bpm + ' BPM · ' + (beat.beatSync ? 'beat ' + ((beat.index % 4) + 1) : 'beat off');
  const m = sim.metrics();
  $('active').textContent = m.active + ' / ' + m.total;
  $('cohesion').textContent = m.active ? m.cohesion + '%' : '—';
  $('battery').textContent = sim.fleet.options.unlimited ? 'Unlimited' : m.battery + '%';
  $('batteryStatus').textContent =
    (m.total
      ? sim.fleet.options.unlimited
        ? 'Unlimited power'
        : sim.fleet.options.batteryDrain + '× drain · lowest ' + m.lowest + '%'
      : 'No aircraft') +
    ' · ' +
    m.returning +
    ' returning · ' +
    m.landed +
    ' emergency landed' +
    (m.total > 2000 ? ' · Large swarm / experimental performance' : '');
  $('batteryStatus').classList.toggle(
    'low',
    !sim.fleet.options.unlimited && m.lowest < 20 && m.total > 0,
  );
  $('clock').textContent = sim.program.time.toFixed(1) + ' s';
  $('pause').textContent = sim.running ? 'Pause' : 'Resume';
  $('emptyPrompt').hidden = m.total > 0;
  $('emptyPrompt').querySelector('p').textContent = 'Set a drone count, then Build fresh fleet.';
  $('emptyPrompt').querySelector('h2').innerHTML =
    m.total === 100
      ? 'One hundred.<br>One command.'
      : m.total
        ? m.total + ' drones.<br>One command.'
        : 'Empty airspace.<br>Build your fleet.';
  if (sim.notice !== lastNotice) {
    lastNotice = sim.notice;
    say(sim.notice);
  }
  syncChallenge();
}
let last = performance.now(),
  metricsClock = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!document.hidden) {
    if (!simulationLab?.replaying) {
      sim.step(dt);
      simulationLab?.tick();
      arena?.tick();
    }
    renderer.render(simulationLab?.renderScene(dt) || sim, dt);
    metronome.update(sim.program, sim.running && !simulationLab?.replaying);
    const transport = sim.combat?.enabled
      ? {
          ...sim.program,
          enabled: true,
          running: true,
          time: sim.combat.time,
          settings: { ...sim.program.settings, countIn: 0 },
        }
      : sim.program;
    soundtrack.update(transport, sim.running && !simulationLab?.replaying);
    director?.captureFrame();
    metricsClock += dt;
    if (metricsClock > 0.12) {
      metricsClock = 0;
      if (!simulationLab?.replaying) {
        updateReadouts();
        arena?.update();
        musicUI?.update();
        nerdLab?.update(now);
      }
      simulationLab?.update();
    }
  }
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => {
  last = performance.now();
  if (document.hidden) {
    sim.running = false;
    soundtrack.preview = false;
    soundtrack.silence();
    arena?.silence();
    updateReadouts();
    say('Paused while the arena is hidden. Resume when ready.');
  }
});
window.addEventListener('pagehide', (event) => {
  // Save before disposing combat: its temporary faction colors/roster are not a show edit.
  try {
    if (!sim.combat?.loading)
      sessionStorage.setItem(
        'fleetcommander.working.v1',
        JSON.stringify(compactFleet(sim.combat?.enabled ? sim.combat.saved : editedFleet())),
      );
  } catch {
    /* Keep the last valid setup if the editor contains an invalid draft. */
  }
  if (event.persisted) {
    arena?.silence();
    soundtrack.silence();
    return;
  }
  simulationLab?.dispose();
  nerdLab?.dispose();
  commandShell?.dispose();
  arena?.dispose();
  renderer.dispose();
  metronome.stop();
  soundtrack.dispose();
});
// Recover the last working setup on return, without changing named fleet saves.
try {
  const text = sessionStorage.getItem('fleetcommander.working.v1');
  if (text) sim.load(parseFleetFile(text));
  else if (matchMedia('(prefers-reduced-motion: reduce)').matches)
    sim.fleet.options.reducedMotion = true;
} catch {
  say('Last working fleet could not be restored. The starter setup is ready.', true);
}
arena = mountArena({ sim, renderer, say, guard, populate, getSelected: () => selected });
director = mountDirector({
  sim,
  renderer,
  say,
  guard,
  populate,
  requireFreeRoster,
  getSelected: () => selected,
  setSelected: (id) => {
    selected = id;
    $('selectedDrone').value = id;
    syncDrone();
  },
  getAudioStreams: () => [
    arena?.audio.captureStream(),
    soundtrack.captureStream(),
    metronome.captureStream(),
  ],
});
mountArtStudio({ sim, renderer, populate, requireFreeRoster, guard, say });
simulationLab = mountSimulationLab({ sim, renderer, arena, say, guard, requireFreeRoster });
nerdLab = mountNerdLab({ sim, renderer, getSelected: () => selected, say });
commandShell = mountCommandShell({ say });
populate();
refreshLibrary();
requestAnimationFrame(frame);
